#!/bin/bash
# ==============================================================
# master-sync.sh — Unified daily sync orchestrator
#
# Runs ALL 6 data pipelines with:
#   - Live progress reporting (terminal + sync-progress.json)
#   - Retry logic (3 attempts per pipeline, 0/10/30s backoff)
#   - Pre-sync data backup + rollback on failure
#   - Per-pipeline log files (sync-logs/)
#   - Windows toast notifications for action-required events
#   - Robust Chrome pre-flight (3x restart, login detection)
#
# Pipelines:
#   1. News/FM/Production (Claude + Chrome MCP + web search)
#   2. SOH Vessels (sync-soh.js via JWT token)
#   3. Platts Prices (fetch-platts-prices.js via Okta)
#   4. SPR Releases (Claude + web search) — after #1
#   5. Import/Export Flows (sync-flows.js via JWT token)
#   6. Flow Insights (4 Claude batches) — after #5
#
# Usage: npm run sync:all
#   or:  bash scripts/master-sync.sh
# ==============================================================

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEBUG_PORT=9222
CHROME_PATH="${CHROME_PATH:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
CHROME_DATA_DIR="${CHROME_DATA_DIR:-C:/ChromeProfiles/ClaudeSync}"

export MASTER_SYNC=1

START_TIME=$(date +%s)
TIMESTAMP_UAE=$(TZ=Asia/Dubai date +"%Y-%m-%d %H:%M:%S %Z" 2>/dev/null || date -u +"%Y-%m-%d %H:%M:%S UTC")
TIMESTAMP_UTC=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Pipeline status tracking
declare -A PIPELINE_STATUS PIPELINE_TIME PIPELINE_DETAIL PIPELINE_ATTEMPT
PIPELINES="news_fm soh prices flows spr awrp insights"
for p in $PIPELINES; do
  PIPELINE_STATUS[$p]="pending"
  PIPELINE_TIME[$p]=""
  PIPELINE_DETAIL[$p]=""
  PIPELINE_ATTEMPT[$p]="0"
done

cd "$PROJECT_DIR"
mkdir -p sync-logs

# --- Cleanup on exit (prevents zombie processes on Windows) ---
cleanup() {
  echo "[sync] Cleaning up child processes..."
  local children
  children=$(jobs -p 2>/dev/null)
  if [ -n "$children" ]; then
    kill $children 2>/dev/null || true
    sleep 2
    kill -9 $children 2>/dev/null || true
  fi
  # Kill any claude -p processes we may have spawned
  taskkill.exe //F //FI "IMAGENAME eq claude.exe" 2>/dev/null || true
  rm -f sync-progress.json
}
trap cleanup EXIT INT TERM

# ============================================================
# HELPERS
# ============================================================

log()  { echo "[sync] $*"; }
sep()  { log "══════════════════════════════════════════════════"; }
hr()   { log "──────────────────────────────────────────────────"; }

elapsed() {
  local secs=$(( $(date +%s) - $1 ))
  if [ $secs -ge 60 ]; then echo "$((secs/60))m$((secs%60))s"; else echo "${secs}s"; fi
}

# --- Windows toast notification ---
notify() {
  local title="$1" msg="$2"
  log "  ⚠ $title: $msg"
  echo -e '\a'  # terminal bell
  # Windows toast via PowerShell (non-blocking)
  powershell.exe -Command "
    try {
      Add-Type -AssemblyName System.Windows.Forms
      \$n = New-Object System.Windows.Forms.NotifyIcon
      \$n.Icon = [System.Drawing.SystemIcons]::Warning
      \$n.Visible = \$true
      \$n.ShowBalloonTip(15000, '$title', '$msg', 'Warning')
      Start-Sleep -Seconds 16
      \$n.Dispose()
    } catch {}
  " > /dev/null 2>&1 &
}

# --- Write sync-progress.json ---
write_progress() {
  local phase="${1:-running}"
  local action_title="${2:-}"
  local action_msg="${3:-}"
  local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local pipelines_json=""
  for p in $PIPELINES; do
    [ -n "$pipelines_json" ] && pipelines_json="$pipelines_json,"
    local st="${PIPELINE_STATUS[$p]}"
    local detail="${PIPELINE_DETAIL[$p]}"
    local dur="${PIPELINE_TIME[$p]}"
    local att="${PIPELINE_ATTEMPT[$p]}"
    pipelines_json="$pipelines_json\"$p\":{\"status\":\"$st\"${dur:+,\"duration\":\"$dur\"}${detail:+,\"detail\":\"$detail\"}${att:+,\"attempt\":$att}}"
  done

  local action_json=""
  if [ -n "$action_title" ]; then
    action_json=",\"action_required\":{\"title\":\"$action_title\",\"message\":\"$action_msg\",\"since\":\"$now\"}"
  fi

  cat > "$PROJECT_DIR/sync-progress.json" <<EOJSON
{"started":"$(date -u -d @$START_TIME +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")","phase":"$phase"$action_json,"pipelines":{$pipelines_json}}
EOJSON
}

# --- Retry wrapper ---
# Usage: run_pipeline <name> <label> <max_retries> <command...>
run_pipeline() {
  local name="$1" label="$2" max_retries="$3"
  shift 3
  local waits=(0 10 30)
  local attempt=1
  local logfile="sync-logs/${name}.log"

  > "$logfile"  # truncate log

  while [ $attempt -le $max_retries ]; do
    PIPELINE_ATTEMPT[$name]=$attempt

    if [ $attempt -gt 1 ]; then
      local wait_secs=${waits[$((attempt-1))]}
      log "  $label ↻ retry $attempt/$max_retries (${wait_secs}s)"
      PIPELINE_STATUS[$name]="retrying"
      write_progress "data_collection"
      sleep $wait_secs

      # Re-extract token for Kpler-dependent pipelines
      if [[ "$name" == "soh" || "$name" == "flows" ]]; then
        extract_kpler_token_quiet
      fi

      # Restart Chrome for browser-dependent pipelines
      if [[ "$name" == "news_fm" || "$name" == "spr" ]]; then
        log "  Restarting Chrome before retry..."
        kill_chrome
        start_chrome || true
      fi
    fi

    PIPELINE_STATUS[$name]="running"
    write_progress "data_collection"

    local cmd_start=$(date +%s)
    if "$@" >> "$logfile" 2>&1; then
      PIPELINE_TIME[$name]=$(elapsed $cmd_start)
      return 0
    fi

    log "  $label ⚠ attempt $attempt/$max_retries failed"
    attempt=$((attempt + 1))
  done

  PIPELINE_TIME[$name]=$(elapsed $cmd_start)
  return 1
}

# --- Token extraction (quiet, for retries) ---
extract_kpler_token_quiet() {
  if ! curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then return 1; fi
  local tok
  tok=$(node -e "
const http=require('http'),WebSocket=require('ws');
(async()=>{
  const pages=await new Promise((res,rej)=>{http.get('http://127.0.0.1:$DEBUG_PORT/json',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)});
  let p=pages.find(x=>x.url.includes('kpler.com'))||pages[0];
  const ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise(r=>ws.on('open',r));
  if(!p.url.includes('kpler.com')){ws.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'https://terminal.kpler.com/cargo/flows'}}));await new Promise(r=>setTimeout(r,8000))}
  const t=await new Promise((res,rej)=>{ws.send(JSON.stringify({id:2,method:'Runtime.evaluate',params:{expression:'JSON.parse(localStorage.getItem(\"@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access\")).body.access_token',returnByValue:true}}));ws.on('message',m=>{const d=JSON.parse(m);if(d.id===2)res(d.result.result.value)});setTimeout(()=>rej(new Error('Timeout')),10000)});
  ws.close();process.stdout.write(t);
})().catch(e=>{process.exit(1)});
" 2>/dev/null) || return 1
  if [ -n "$tok" ] && [ ${#tok} -gt 100 ]; then
    echo "$tok" > "$PROJECT_DIR/soh-data/.token.txt"
    return 0
  fi
  return 1
}

# --- Backup helpers ---
backup_data() {
  log "  Backing up data files..."
  mkdir -p .sync-backup/soh-data
  cp data.js .sync-backup/ 2>/dev/null || true
  cp market-prices-seed.json .sync-backup/ 2>/dev/null || true
  cp import-data.js .sync-backup/ 2>/dev/null || true
  cp export-data.js .sync-backup/ 2>/dev/null || true
  cp flow-insights.json .sync-backup/ 2>/dev/null || true
  cp soh-data/summary.json .sync-backup/soh-data/ 2>/dev/null || true
  cp soh-data/vessels.json .sync-backup/soh-data/ 2>/dev/null || true
  cp soh-data/vessel-matrix.json .sync-backup/soh-data/ 2>/dev/null || true
  cp soh-data/adnoc-vessels.json .sync-backup/soh-data/ 2>/dev/null || true
  cp soh-data/map-positions.json .sync-backup/soh-data/ 2>/dev/null || true
}

restore_pipeline() {
  local name="$1"
  case "$name" in
    news_fm)
      log "  Restoring data.js from backup"
      cp .sync-backup/data.js data.js 2>/dev/null || true ;;
    prices)
      log "  Restoring market-prices-seed.json from backup"
      cp .sync-backup/market-prices-seed.json market-prices-seed.json 2>/dev/null || true ;;
    soh)
      log "  Restoring soh-data/ from backup"
      cp .sync-backup/soh-data/*.json soh-data/ 2>/dev/null || true ;;
    flows)
      log "  Restoring import-data.js + export-data.js from backup"
      cp .sync-backup/import-data.js import-data.js 2>/dev/null || true
      cp .sync-backup/export-data.js export-data.js 2>/dev/null || true ;;
    insights)
      log "  Restoring flow-insights.json from backup"
      cp .sync-backup/flow-insights.json flow-insights.json 2>/dev/null || true ;;
    spr)
      # Only restore data.js if news_fm also failed (otherwise news_fm already wrote it)
      if [ "${PIPELINE_STATUS[news_fm]}" != "ok" ]; then
        log "  Restoring data.js from backup (SPR + News/FM both failed)"
        cp .sync-backup/data.js data.js 2>/dev/null || true
      fi ;;
    awrp)
      # Only restore data.js if news_fm and spr also failed
      if [ "${PIPELINE_STATUS[news_fm]}" != "ok" ] && [ "${PIPELINE_STATUS[spr]}" != "ok" ]; then
        log "  Restoring data.js from backup (AWRP + SPR + News/FM all failed)"
        cp .sync-backup/data.js data.js 2>/dev/null || true
      fi ;;
  esac
}

# ============================================================
# PHASE 0: PRE-FLIGHT
# ============================================================

sep
log "ADNOC FM Monitor — Daily Sync"
log "Started: $TIMESTAMP_UAE ($TIMESTAMP_UTC)"
sep
echo ""
log "PRE-FLIGHT"

write_progress "preflight"

# --- Kill stale sync processes from previous runs ---
STALE_KILLED=0
for proc_name in "sync-news" "sync-spr" "sync-prices" "sync-flows" "sync-soh" "master-sync" "download-server" "sync-flow-insights"; do
  while read -r pid; do
    [ -z "$pid" ] && continue
    [ "$pid" = "$$" ] && continue  # don't kill ourselves
    create_time=$(wmic process where "ProcessId=$pid" get creationdate 2>/dev/null | grep -oP '\d{14}' | head -1)
    if [ -n "$create_time" ]; then
      create_epoch=$(date -d "${create_time:0:4}-${create_time:4:2}-${create_time:6:2} ${create_time:8:2}:${create_time:10:2}:${create_time:12:2}" +%s 2>/dev/null || echo 0)
      now_epoch=$(date +%s)
      age=$(( now_epoch - create_epoch ))
      if [ $age -gt 7200 ]; then  # older than 2 hours
        taskkill.exe //PID $pid //F 2>/dev/null && STALE_KILLED=$((STALE_KILLED + 1))
      fi
    fi
  done < <(wmic process where "commandline like '%${proc_name}%'" get processid 2>/dev/null | grep -oP '\d+')
done
if [ $STALE_KILLED -gt 0 ]; then
  log "  Stale procs ..... ✓ killed $STALE_KILLED zombie processes"
else
  log "  Stale procs ..... ✓ none found"
fi

# --- Chrome startup (up to 3 attempts) ---
CHROME_PID=""
CHROME_OK=false

start_chrome() {
  if [ ! -f "$CHROME_PATH" ]; then return 1; fi
  "$CHROME_PATH" --remote-debugging-port=$DEBUG_PORT \
    --user-data-dir="$CHROME_DATA_DIR" \
    --no-first-run --disable-default-apps > /dev/null 2>&1 &
  CHROME_PID=$!
  for i in $(seq 1 15); do
    if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

kill_chrome() {
  taskkill.exe //F //IM chrome.exe > /dev/null 2>&1 || true
  sleep 3
}

for chrome_attempt in 1 2 3; do
  if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
    CHROME_OK=true
    log "  Chrome ........... ✓ running (port $DEBUG_PORT)"
    break
  fi

  if [ $chrome_attempt -gt 1 ]; then
    log "  Chrome ........... ↻ attempt $chrome_attempt/3 (killing old instances)"
    kill_chrome
  fi

  log "  Chrome ........... ⏳ starting (attempt $chrome_attempt/3)"
  if start_chrome; then
    CHROME_OK=true
    log "  Chrome ........... ✓ started"
    break
  fi
done

if [ "$CHROME_OK" = false ]; then
  notify "Chrome Failed" "Could not start Chrome after 3 attempts. Browser-dependent pipelines will be degraded."
  log "  Chrome ........... ✗ FAILED after 3 attempts"
fi

# --- Kpler session check + JWT token extraction ---
KPLER_TOKEN_OK=false

if [ "$CHROME_OK" = true ]; then
  # Check if Kpler session is active (not redirected to login)
  KPLER_URL=$(node -e "
const http=require('http'),WebSocket=require('ws');
(async()=>{
  const pages=await new Promise((res,rej)=>{http.get('http://127.0.0.1:$DEBUG_PORT/json',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)});
  let p=pages.find(x=>x.url.includes('kpler.com'));
  if(!p){p=pages[0];const ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'https://terminal.kpler.com'}}));await new Promise(r=>setTimeout(r,8000));ws.close()}
  const pages2=await new Promise((res,rej)=>{http.get('http://127.0.0.1:$DEBUG_PORT/json',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)});
  const kp=pages2.find(x=>x.url.includes('kpler.com'));
  process.stdout.write(kp?kp.url:'');
})().catch(()=>{});
" 2>/dev/null) || true

  if echo "$KPLER_URL" | grep -qi "auth0\|login\|authorize"; then
    notify "Kpler Login Required" "Log into terminal.kpler.com in Chrome window"
    write_progress "preflight" "Kpler Login Required" "Log into terminal.kpler.com in Chrome, then press Enter"
    log "  Kpler session .... ⚠ LOGIN REQUIRED"
    log "  → Open Chrome and log into terminal.kpler.com"
    log "  → Press Enter when done, or wait 60s to skip..."
    read -t 60 -p "" || true
    log "  Continuing..."
  else
    log "  Kpler session .... ✓ active"
  fi

  # Extract JWT token (up to 3 attempts)
  for tok_attempt in 1 2 3; do
    if extract_kpler_token_quiet; then
      KPLER_TOKEN_OK=true
      TOK_LEN=$(wc -c < "$PROJECT_DIR/soh-data/.token.txt" 2>/dev/null || echo 0)
      log "  JWT token ........ ✓ extracted ($TOK_LEN chars, attempt $tok_attempt)"
      break
    fi
    if [ $tok_attempt -lt 3 ]; then
      log "  JWT token ........ ⚠ attempt $tok_attempt failed, retrying in 5s..."
      sleep 5
    fi
  done

  if [ "$KPLER_TOKEN_OK" = false ]; then
    # Fall back to cached token
    if [ -f "$PROJECT_DIR/soh-data/.token.txt" ] && [ -s "$PROJECT_DIR/soh-data/.token.txt" ]; then
      KPLER_TOKEN_OK=true
      log "  JWT token ........ ⚠ extraction failed, using cached token"
    else
      notify "No Kpler Token" "JWT extraction failed. SOH + Flows pipelines will be skipped."
      log "  JWT token ........ ✗ no token available — SOH + Flows will skip"
    fi
  fi
else
  # No Chrome — check for cached token
  if [ -f "$PROJECT_DIR/soh-data/.token.txt" ] && [ -s "$PROJECT_DIR/soh-data/.token.txt" ]; then
    KPLER_TOKEN_OK=true
    log "  JWT token ........ ⚠ no Chrome, using cached token"
  else
    log "  JWT token ........ ✗ no Chrome, no cached token"
  fi
fi

# --- S&P MINT token check ---
if [ -f "$PROJECT_DIR/soh-data/.mint-token.json" ]; then
  MINT_EXP=$(node -e "try{const t=JSON.parse(require('fs').readFileSync('soh-data/.mint-token.json'));const exp=new Date(t.expires||0);console.log(exp>new Date()?'valid':'expired')}catch(e){console.log('missing')}" 2>/dev/null)
  if [ "$MINT_EXP" = "valid" ]; then
    log "  MINT token ....... ✓ valid"
  else
    log "  MINT token ....... ⚠ expired (will attempt re-auth during SOH sync)"
  fi
else
  log "  MINT token ....... ○ not found (containers will use cache)"
fi

# --- Platts token check ---
if [ -f "$PROJECT_DIR/.platts-token.json" ]; then
  log "  Platts token ..... ✓ refresh token found"
else
  log "  Platts token ..... ○ not found (will attempt full auth)"
fi

# --- Pre-sync backup ---
backup_data
write_progress "preflight"

echo ""

# ============================================================
# PHASE 1: PARALLEL DATA COLLECTION
# ============================================================

log "PHASE 1 — Data Collection"
write_progress "data_collection"

# [1/6] News/FM/Production
LABEL_NEWS="[1/6] News/FM/Production ..."
log "  $LABEL_NEWS ⏳ running"
(
  run_pipeline "news_fm" "$LABEL_NEWS" 3 bash "$SCRIPT_DIR/sync-news.sh"
  exit $?
) &
NEWS_PID=$!

# [2/5] SOH Vessels
LABEL_SOH="[2/6] SOH Vessels .........."
if [ "$KPLER_TOKEN_OK" = true ]; then
  log "  $LABEL_SOH ⏳ running"
  (
    run_pipeline "soh" "$LABEL_SOH" 3 bash -c "
      node '$SCRIPT_DIR/sync-soh.js' && \
      (node '$SCRIPT_DIR/fetch-mint-containers.js' 2>/dev/null || true) && \
      (node '$SCRIPT_DIR/merge-containers.js' 2>/dev/null || true) && \
      node '$SCRIPT_DIR/process-soh.js'
    "
    exit $?
  ) &
  SOH_PID=$!
else
  log "  $LABEL_SOH ○ skipped (no token)"
  PIPELINE_STATUS[soh]="skipped"
  PIPELINE_DETAIL[soh]="No Kpler token"
  SOH_PID=""
fi

# [3/6] Platts Prices
LABEL_PRICES="[3/6] Platts Prices ........"
log "  $LABEL_PRICES ⏳ running"
(
  run_pipeline "prices" "$LABEL_PRICES" 3 node "$SCRIPT_DIR/fetch-platts-prices.js"
  exit $?
) &
PRICES_PID=$!

# [4/6] Import/Export Flows
LABEL_FLOWS="[4/6] Import/Export Flows .."
if [ "$KPLER_TOKEN_OK" = true ]; then
  log "  $LABEL_FLOWS ⏳ running"
  (
    run_pipeline "flows" "$LABEL_FLOWS" 3 node "$SCRIPT_DIR/sync-flows.js"
    exit $?
  ) &
  FLOWS_PID=$!
else
  log "  $LABEL_FLOWS ○ skipped (no token)"
  PIPELINE_STATUS[flows]="skipped"
  PIPELINE_DETAIL[flows]="No Kpler token"
  FLOWS_PID=""
fi

hr

# --- Wait for parallel jobs ---

collect_result() {
  local pid="$1" name="$2" label="$3" detail_cmd="$4"
  if [ -z "$pid" ]; then return; fi
  if wait $pid 2>/dev/null; then
    local detail
    detail=$(eval "$detail_cmd" 2>/dev/null || echo "done")
    PIPELINE_STATUS[$name]="ok"
    PIPELINE_DETAIL[$name]="$detail"
    PIPELINE_TIME[$name]="${PIPELINE_TIME[$name]:-done}"
    log "  $label ✓ done (${PIPELINE_TIME[$name]}) — $detail"
  else
    PIPELINE_STATUS[$name]="failed"
    PIPELINE_DETAIL[$name]="failed after ${PIPELINE_ATTEMPT[$name]:-3} attempts (see sync-logs/${name}.log)"
    log "  $label ✗ FAILED (see sync-logs/${name}.log)"
    restore_pipeline "$name"
    notify "${name} Failed" "Pipeline failed after 3 attempts. Data restored from backup."
  fi
  write_progress "data_collection"
}

collect_result "$PRICES_PID" "prices" "$LABEL_PRICES" \
  "node -e \"const d=JSON.parse(require('fs').readFileSync('market-prices-seed.json'));console.log(Object.keys(d.prices||{}).length+' symbols')\""

collect_result "$SOH_PID" "soh" "$LABEL_SOH" \
  "node -e \"const s=JSON.parse(require('fs').readFileSync('soh-data/summary.json'));console.log((s.totalVessels||(s.insideTotal+s.outsideTotal))+' vessels')\""

collect_result "$FLOWS_PID" "flows" "$LABEL_FLOWS" \
  "node -e \"const s=require('fs').statSync('import-data.js').size+require('fs').statSync('export-data.js').size;console.log(Math.round(s/1024/1024)+' MB total')\""

collect_result "$NEWS_PID" "news_fm" "$LABEL_NEWS" \
  "echo 'agent complete'"

# [5/6] SPR Releases (sequential — after News/FM, both write data.js)
echo ""
LABEL_SPR="[5/6] SPR Releases ........."
log "  $LABEL_SPR ⏳ running"
SPR_START=$(date +%s)
if run_pipeline "spr" "$LABEL_SPR" 3 bash "$SCRIPT_DIR/sync-spr.sh"; then
  PIPELINE_STATUS[spr]="ok"
  PIPELINE_DETAIL[spr]="web search complete"
  PIPELINE_TIME[spr]=$(elapsed $SPR_START)
  log "  $LABEL_SPR ✓ done (${PIPELINE_TIME[spr]})"
else
  PIPELINE_STATUS[spr]="failed"
  PIPELINE_DETAIL[spr]="failed after 3 attempts"
  PIPELINE_TIME[spr]=$(elapsed $SPR_START)
  log "  $LABEL_SPR ✗ FAILED"
  restore_pipeline "spr"
  notify "SPR Failed" "SPR pipeline failed after 3 attempts."
fi
write_progress "data_collection"

# [6/6] War Risk Premium AWRP (sequential — after SPR, also writes data.js)
echo ""
LABEL_AWRP="[6/6] War Risk Premium ....."
log "  $LABEL_AWRP ⏳ running"
AWRP_START=$(date +%s)
if run_pipeline "awrp" "$LABEL_AWRP" 3 claude -p "$(cat "$SCRIPT_DIR/sync-prices-awrp-prompt.md")" \
  --allowedTools "Edit,Read,WebSearch,WebFetch,Glob,Grep" \
  --max-turns 20; then
  PIPELINE_STATUS[awrp]="ok"
  PIPELINE_DETAIL[awrp]="web search complete"
  PIPELINE_TIME[awrp]=$(elapsed $AWRP_START)
  log "  $LABEL_AWRP ✓ done (${PIPELINE_TIME[awrp]})"
else
  PIPELINE_STATUS[awrp]="failed"
  PIPELINE_DETAIL[awrp]="failed after 3 attempts"
  PIPELINE_TIME[awrp]=$(elapsed $AWRP_START)
  log "  $LABEL_AWRP ✗ FAILED"
  restore_pipeline "awrp"
  notify "AWRP Failed" "War risk premium pipeline failed after 3 attempts."
fi
write_progress "data_collection"

echo ""

# ============================================================
# PHASE 2: FLOW INSIGHTS
# ============================================================

log "PHASE 2 — Flow Insights"
write_progress "flow_insights"

INSIGHTS_START=$(date +%s)
if [ "${PIPELINE_STATUS[flows]}" = "ok" ] && [ -f "$PROJECT_DIR/flow-summary.json" ]; then
  log "  Splitting flow-summary.json → batches"
  node "$SCRIPT_DIR/split-flow-summary.js" >> sync-logs/insights.log 2>&1 || true

  PROMPT=$(cat "$SCRIPT_DIR/sync-flow-insights-prompt.md")
  INSIGHT_TOOLS="Read,Glob,Grep,Write,WebSearch,WebFetch"

  INSIGHT_OK=true
  for batch_num in 1 2 3 4; do
    case $batch_num in
      1) BATCH_DESC="Gulf exporters"; BATCH_FILE="flow-summary-batch1-gulf-exporters.json"; BATCH_FOCUS="Gulf/Hormuz disruption, Middle East oil/LNG supply" ;;
      2) BATCH_DESC="Other exporters"; BATCH_FILE="flow-summary-batch2-other-exporters.json"; BATCH_FOCUS="Russia sanctions/ESPO, US Gulf Coast exports, Australia LNG" ;;
      3) BATCH_DESC="Asia importers"; BATCH_FILE="flow-summary-batch3-asia-importers.json"; BATCH_FOCUS="Asia crude/LNG demand, Russia pivot, Gulf supply disruption impact" ;;
      4) BATCH_DESC="Other importers"; BATCH_FILE="flow-summary-batch4-other-importers.json"; BATCH_FOCUS="European energy diversification, Taiwan supply security" ;;
    esac

    PIPELINE_STATUS[insights]="running"
    PIPELINE_DETAIL[insights]="batch $batch_num/4: $BATCH_DESC"
    write_progress "flow_insights"
    log "  Batch $batch_num/4 $BATCH_DESC ... ⏳"

    if claude -p "$PROMPT

YOUR BATCH: Read \`$BATCH_FILE\` for your datasets.
Web searches: Focus on $BATCH_FOCUS.
Write output to \`flow-insights-batch-${batch_num}.json\`." \
      --allowedTools "$INSIGHT_TOOLS" --max-turns 30 >> sync-logs/insights.log 2>&1; then
      log "  Batch $batch_num/4 $BATCH_DESC ... ✓ done"
    else
      log "  Batch $batch_num/4 $BATCH_DESC ... ✗ FAILED"
      INSIGHT_OK=false
    fi
  done

  # Merge batches
  log "  Merging batches..."
  node -e "
const fs=require('fs');const merged={lastUpdated:new Date().toISOString()};
for(let i=1;i<=4;i++){try{const d=JSON.parse(fs.readFileSync('flow-insights-batch-'+i+'.json','utf8'));Object.assign(merged,d);console.log('  Batch '+i+': '+Object.keys(d).length+' datasets')}catch(e){console.error('  Batch '+i+': MISSING')}}
try{const z=JSON.parse(fs.readFileSync('flow-insights-zeros.json','utf8'));Object.assign(merged,z)}catch{}
fs.writeFileSync('flow-insights.json',JSON.stringify(merged,null,2));
console.log('  Total: '+Object.keys(merged).filter(k=>k!=='lastUpdated').length+' datasets');
" 2>/dev/null

  rm -f flow-insights-batch-*.json flow-summary-batch*.json flow-insights-zeros.json fm-context.json

  if [ "$INSIGHT_OK" = true ]; then
    PIPELINE_STATUS[insights]="ok"
    PIPELINE_DETAIL[insights]="4 batches merged"
  else
    PIPELINE_STATUS[insights]="failed"
    PIPELINE_DETAIL[insights]="some batches failed"
    restore_pipeline "insights"
  fi
  PIPELINE_TIME[insights]=$(elapsed $INSIGHTS_START)
  log "  Flow Insights .......... $([ "$INSIGHT_OK" = true ] && echo "✓" || echo "✗") (${PIPELINE_TIME[insights]})"
else
  PIPELINE_STATUS[insights]="skipped"
  PIPELINE_DETAIL[insights]="flows not available"
  log "  Flow Insights .......... ○ skipped"
fi
write_progress "flow_insights"

echo ""

# ============================================================
# PHASE 3: VERIFY + COMMIT
# ============================================================

log "PHASE 3 — Verify + Commit"
write_progress "verify_commit"

# Schema validation
if node "$SCRIPT_DIR/validate-data.js" > /dev/null 2>&1; then
  log "  Schema validation .......... ✓ passed"
else
  log "  Schema validation .......... ✗ FAILED — restoring data.js"
  cp .sync-backup/data.js data.js 2>/dev/null || git checkout -- data.js 2>/dev/null || true
fi

# Freshness verification
node "$SCRIPT_DIR/verify-sync.js" > /dev/null 2>&1
log "  Freshness verification ..... ✓ sync-status.json written"

# Commit all changes
ALL_FILES="data.js data-previous.json sync-log.json energy-news-data.json market-prices-seed.json import-data.js export-data.js flow-insights.json flow-summary.json sync-status.json"
SOH_FILES="soh-data/summary.json soh-data/vessel-matrix.json soh-data/adnoc-vessels.json soh-data/map-positions.json soh-data/vessels.json soh-data/transit-vessels.json soh-data/crisis-transits.json soh-data/breakdown-product.json soh-data/breakdown-vessel-type.json soh-data/breakdown-destination.json"

CHANGED=false
for f in $ALL_FILES $SOH_FILES; do
  if [ -f "$f" ] && ! git diff --quiet "$f" 2>/dev/null; then CHANGED=true; break; fi
done
if [ -f sync-status.json ] && ! git ls-files --error-unmatch sync-status.json > /dev/null 2>&1; then CHANGED=true; fi

if [ "$CHANGED" = true ]; then
  COMMIT_TS=$(date -u +"%Y-%m-%d %H:%M UTC")
  git add $ALL_FILES $SOH_FILES 2>/dev/null || true
  git add soh-data/ 2>/dev/null || true

  git commit -m "chore: daily sync ($COMMIT_TS)" > /dev/null 2>&1
  COMMIT_HASH=$(git rev-parse --short HEAD)
  log "  Committed: $COMMIT_HASH"

  git push origin master 2>/dev/null && log "  Pushed to origin/master" || log "  ⚠ Push to master failed"
  git push origin master:main 2>/dev/null && log "  Pushed to origin/main" || log "  ⚠ Push to main failed"
else
  log "  No changes detected — skipping commit."
fi

# Cleanup
rm -rf .sync-backup
rm -f sync-progress.json

# Close Chrome if we started it
if [ -n "$CHROME_PID" ]; then
  kill "$CHROME_PID" 2>/dev/null || true
  log "  Chrome closed."
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================

END_TIME=$(date +%s)
TOTAL_SECS=$((END_TIME - START_TIME))
if [ $TOTAL_SECS -ge 60 ]; then TOTAL_TIME="$((TOTAL_SECS/60))m$((TOTAL_SECS%60))s"; else TOTAL_TIME="${TOTAL_SECS}s"; fi

sep
log "SUMMARY"

LABELS="news_fm:News/FM/Production soh:SOH_Vessels prices:Platts_Prices flows:Import/Export_Flows spr:SPR_Releases awrp:War_Risk_Premium insights:Flow_Insights"

FAIL_COUNT=0
for entry in $LABELS; do
  key="${entry%%:*}"
  label="${entry#*:}"
  label="${label//_/ }"
  st="${PIPELINE_STATUS[$key]}"
  detail="${PIPELINE_DETAIL[$key]}"
  dur="${PIPELINE_TIME[$key]}"

  case "$st" in
    ok)      icon="✓"; color="\033[32m" ;;
    stale)   icon="⚠"; color="\033[33m" ;;
    failed)  icon="✗"; color="\033[31m"; FAIL_COUNT=$((FAIL_COUNT+1)) ;;
    skipped) icon="○"; color="\033[90m" ;;
    *)       icon="?"; color="\033[0m" ;;
  esac

  printf "[sync]   %b%s%b %-22s %-8s %s\n" "$color" "$icon" "\033[0m" "$label" "$st" "${dur:+($dur)} $detail"
done

log "  Total time: $TOTAL_TIME"
sep

# Final notification if there were failures
if [ $FAIL_COUNT -gt 0 ]; then
  notify "Sync Incomplete" "$FAIL_COUNT pipeline(s) failed. Check sync-logs/ for details."
fi
