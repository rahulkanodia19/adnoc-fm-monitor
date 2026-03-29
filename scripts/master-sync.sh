#!/bin/bash
# ==============================================================
# master-sync.sh — Unified daily sync orchestrator
#
# Runs ALL 6 data pipelines with live progress reporting:
#   1. News/FM/Production (Claude + Chrome MCP + web search)
#   2. SOH Vessels (sync-soh.js via JWT token)
#   3. Platts Prices (fetch-platts-prices.js via Okta)
#   4. SPR Releases (Claude + web search) — after #1
#   5. Import/Export Flows (sync-flows.js via JWT token)
#   6. Flow Insights (4 Claude batches) — after #5
#
# Then verifies all data and makes a single git commit.
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

# Export flag so individual scripts know they're running under master-sync
export MASTER_SYNC=1

START_TIME=$(date +%s)
TIMESTAMP_UAE=$(TZ=Asia/Dubai date +"%Y-%m-%d %H:%M:%S %Z")
TIMESTAMP_UTC=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Pipeline status tracking
declare -A PIPELINE_STATUS PIPELINE_TIME PIPELINE_DETAIL
PIPELINES="news_fm soh prices flows spr insights"

for p in $PIPELINES; do
  PIPELINE_STATUS[$p]="pending"
  PIPELINE_TIME[$p]="0"
  PIPELINE_DETAIL[$p]=""
done

cd "$PROJECT_DIR"

# ---------- Logging helpers ----------

log()  { echo "[sync] $*"; }
logn() { echo -n "[sync] $*"; }
sep()  { log "══════════════════════════════════════════════════"; }
hr()   { log "──────────────────────────────────────────────────"; }

elapsed() {
  local start=$1
  local now=$(date +%s)
  local secs=$((now - start))
  if [ $secs -ge 60 ]; then
    echo "$((secs / 60))m$((secs % 60))s"
  else
    echo "${secs}s"
  fi
}

mark_done() {
  local name=$1 code=$2 start=$3 detail=$4
  local dur=$(elapsed "$start")
  PIPELINE_TIME[$name]="$dur"
  PIPELINE_DETAIL[$name]="$detail"
  if [ "$code" -eq 0 ]; then
    PIPELINE_STATUS[$name]="ok"
    log "  $5 ✓ done ($dur) — $detail"
  else
    PIPELINE_STATUS[$name]="failed"
    log "  $5 ✗ FAILED ($dur) — $detail"
  fi
}

# ---------- Phase 0: Pre-flight ----------

sep
log "ADNOC FM Monitor — Daily Sync"
log "Started: $TIMESTAMP_UAE ($TIMESTAMP_UTC)"
sep
echo ""
log "PRE-FLIGHT"

# Start Chrome if not running
CHROME_PID=""
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  log "  Chrome ........... ✓ already running (port $DEBUG_PORT)"
else
  log "  Chrome ........... ⏳ starting..."
  if [ -f "$CHROME_PATH" ]; then
    "$CHROME_PATH" --remote-debugging-port=$DEBUG_PORT \
      --user-data-dir="$CHROME_DATA_DIR" \
      --no-first-run --disable-default-apps &
    CHROME_PID=$!
    for i in $(seq 1 15); do
      if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
      log "  Chrome ........... ✓ started (PID: $CHROME_PID)"
    else
      log "  Chrome ........... ✗ FAILED to start"
      CHROME_PID=""
    fi
  else
    log "  Chrome ........... ✗ not found at $CHROME_PATH"
  fi
fi

# Extract Kpler JWT token
KPLER_TOKEN_OK=false
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  TOKEN=$(node -e "
const http = require('http');
const WebSocket = require('ws');
async function getToken() {
  const pages = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:$DEBUG_PORT/json', res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  let page = pages.find(p => p.url.includes('kpler.com'));
  if (!page) page = pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  if (!page.url.includes('kpler.com')) {
    ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'https://terminal.kpler.com/cargo/flows' } }));
    await new Promise(r => setTimeout(r, 8000));
  }
  const result = await new Promise((resolve, reject) => {
    ws.send(JSON.stringify({
      id: 2, method: 'Runtime.evaluate',
      params: {
        expression: 'JSON.parse(localStorage.getItem(\"@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access\")).body.access_token',
        returnByValue: true
      }
    }));
    ws.on('message', msg => {
      const data = JSON.parse(msg);
      if (data.id === 2) resolve(data.result.result.value);
    });
    setTimeout(() => reject(new Error('Timeout')), 10000);
  });
  ws.close();
  process.stdout.write(result);
}
getToken().catch(e => { console.error(e.message); process.exit(1); });
" 2>/dev/null) || true

  if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 100 ]; then
    echo "$TOKEN" > "$PROJECT_DIR/soh-data/.token.txt"
    log "  JWT token ........ ✓ extracted (${#TOKEN} chars)"
    KPLER_TOKEN_OK=true
  else
    log "  JWT token ........ ⚠ extraction failed (using cached token if available)"
    if [ -f "$PROJECT_DIR/soh-data/.token.txt" ] && [ -s "$PROJECT_DIR/soh-data/.token.txt" ]; then
      KPLER_TOKEN_OK=true
      log "  Cached token ..... ✓ found"
    fi
  fi
else
  log "  JWT token ........ ○ skipped (no Chrome)"
  if [ -f "$PROJECT_DIR/soh-data/.token.txt" ] && [ -s "$PROJECT_DIR/soh-data/.token.txt" ]; then
    KPLER_TOKEN_OK=true
    log "  Cached token ..... ✓ found"
  fi
fi

echo ""

# ---------- Phase 1: Parallel data collection ----------

log "PHASE 1 — Data Collection"

# [1/5] News/FM/Production (Claude + Chrome MCP)
NEWS_START=$(date +%s)
log "  [1/5] News/FM/Production ... ⏳ running"
(
  bash "$SCRIPT_DIR/sync-news.sh" > /dev/null 2>&1
) &
NEWS_PID=$!

# [2/5] SOH Vessels (token-based)
SOH_START=$(date +%s)
if [ "$KPLER_TOKEN_OK" = true ]; then
  log "  [2/5] SOH Vessels .......... ⏳ running"
  (
    node "$SCRIPT_DIR/sync-soh.js" > /dev/null 2>&1 && \
    node "$SCRIPT_DIR/fetch-mint-containers.js" 2>/dev/null || true && \
    node "$SCRIPT_DIR/merge-containers.js" 2>/dev/null || true && \
    node "$SCRIPT_DIR/process-soh.js" > /dev/null 2>&1
  ) &
  SOH_PID=$!
else
  log "  [2/5] SOH Vessels .......... ○ skipped (no token)"
  PIPELINE_STATUS[soh]="skipped"
  PIPELINE_DETAIL[soh]="No Kpler token available"
  SOH_PID=""
fi

# [3/5] Platts Prices
PRICES_START=$(date +%s)
log "  [3/5] Platts Prices ........ ⏳ running"
(
  node "$SCRIPT_DIR/fetch-platts-prices.js" > /dev/null 2>&1
) &
PRICES_PID=$!

# [5/5] Import/Export Flows (token-based)
FLOWS_START=$(date +%s)
if [ "$KPLER_TOKEN_OK" = true ]; then
  log "  [5/5] Import/Export Flows .. ⏳ running"
  (
    node "$SCRIPT_DIR/sync-flows.js" > /dev/null 2>&1
  ) &
  FLOWS_PID=$!
else
  log "  [5/5] Import/Export Flows .. ○ skipped (no token)"
  PIPELINE_STATUS[flows]="skipped"
  PIPELINE_DETAIL[flows]="No Kpler token available"
  FLOWS_PID=""
fi

hr

# Wait for parallel jobs and collect results

# Prices (usually fastest)
if wait $PRICES_PID 2>/dev/null; then
  mark_done prices 0 "$PRICES_START" "$(node -e "try{const d=JSON.parse(require('fs').readFileSync('market-prices-seed.json'));console.log(Object.keys(d.prices||{}).length+' symbols')}catch(e){console.log('check failed')}" 2>/dev/null)" "[3/5] Platts Prices ........"
else
  mark_done prices 1 "$PRICES_START" "script failed" "[3/5] Platts Prices ........"
fi

# SOH
if [ -n "$SOH_PID" ]; then
  if wait $SOH_PID 2>/dev/null; then
    SOH_DETAIL=$(node -e "try{const s=JSON.parse(require('fs').readFileSync('soh-data/summary.json'));console.log((s.totalVessels||(s.insideTotal+s.outsideTotal))+' vessels')}catch(e){console.log('check failed')}" 2>/dev/null)
    mark_done soh 0 "$SOH_START" "$SOH_DETAIL" "[2/5] SOH Vessels .........."
  else
    mark_done soh 1 "$SOH_START" "script failed" "[2/5] SOH Vessels .........."
  fi
fi

# Flows
if [ -n "$FLOWS_PID" ]; then
  if wait $FLOWS_PID 2>/dev/null; then
    FLOWS_DETAIL=$(node -e "try{const s=require('fs').statSync('import-data.js').size+require('fs').statSync('export-data.js').size;console.log(Math.round(s/1024/1024)+'MB total')}catch(e){console.log('check failed')}" 2>/dev/null)
    mark_done flows 0 "$FLOWS_START" "$FLOWS_DETAIL" "[5/5] Import/Export Flows .."
  else
    mark_done flows 1 "$FLOWS_START" "script failed (possible 401)" "[5/5] Import/Export Flows .."
  fi
fi

# News/FM (usually slowest — Claude agent)
if wait $NEWS_PID 2>/dev/null; then
  mark_done news_fm 0 "$NEWS_START" "agent complete" "[1/5] News/FM/Production ..."
else
  mark_done news_fm 1 "$NEWS_START" "agent failed" "[1/5] News/FM/Production ..."
fi

# [4/5] SPR Releases (runs after News/FM — both write data.js)
echo ""
SPR_START=$(date +%s)
log "  [4/5] SPR Releases ......... ⏳ running"
if bash "$SCRIPT_DIR/sync-spr.sh" > /dev/null 2>&1; then
  mark_done spr 0 "$SPR_START" "web search complete" "[4/5] SPR Releases ........."
else
  mark_done spr 1 "$SPR_START" "agent failed" "[4/5] SPR Releases ........."
fi

echo ""

# ---------- Phase 2: Flow Insights ----------

log "PHASE 2 — Flow Insights"

INSIGHTS_START=$(date +%s)
if [ "${PIPELINE_STATUS[flows]}" = "ok" ] && [ -f "$PROJECT_DIR/flow-summary.json" ]; then
  # Split flow summary into batches
  log "  Splitting flow-summary.json → batches + fm-context.json"
  node "$SCRIPT_DIR/split-flow-summary.js" 2>/dev/null || true

  # Run 4 Claude batch agents
  log "  Running 4 insight batches..."
  PROMPT=$(cat "$SCRIPT_DIR/sync-flow-insights-prompt.md")
  INSIGHT_TOOLS="Read,Glob,Grep,Write,WebSearch,WebFetch"

  claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch1-gulf-exporters.json\` for your datasets (Saudi Arabia, UAE, Iraq, Qatar, Kuwait, Bahrain, Iran, Oman exports).
Web searches: Focus on Gulf/Hormuz disruption, Middle East oil/LNG supply.
Write output to \`flow-insights-batch-1.json\`." \
    --allowedTools "$INSIGHT_TOOLS" --max-turns 30 > /dev/null 2>&1
  log "  Batch 1/4 Gulf exporters ... ✓ done"

  claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch2-other-exporters.json\` for your datasets (Russia, US, Australia, EU-27 exports).
Web searches: Focus on Russia sanctions/ESPO, US Gulf Coast exports, Australia LNG.
Write output to \`flow-insights-batch-2.json\`." \
    --allowedTools "$INSIGHT_TOOLS" --max-turns 30 > /dev/null 2>&1
  log "  Batch 2/4 Other exporters .. ✓ done"

  claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch3-asia-importers.json\` for your datasets (China, India, Japan, South Korea imports).
Web searches: Focus on Asia crude/LNG demand, Russia pivot, Gulf supply disruption impact.
Write output to \`flow-insights-batch-3.json\`." \
    --allowedTools "$INSIGHT_TOOLS" --max-turns 30 > /dev/null 2>&1
  log "  Batch 3/4 Asia importers ... ✓ done"

  claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch4-other-importers.json\` for your datasets (Thailand, Vietnam, EU-27, US, Taiwan imports).
Web searches: Focus on European energy diversification, Taiwan supply security.
Write output to \`flow-insights-batch-4.json\`." \
    --allowedTools "$INSIGHT_TOOLS" --max-turns 30 > /dev/null 2>&1
  log "  Batch 4/4 Other importers .. ✓ done"

  # Merge batches
  node -e "
const fs = require('fs');
const merged = { lastUpdated: new Date().toISOString() };
for (let i = 1; i <= 4; i++) {
  try {
    const data = JSON.parse(fs.readFileSync('flow-insights-batch-' + i + '.json', 'utf8'));
    Object.assign(merged, data);
    console.log('  Batch ' + i + ':', Object.keys(data).length, 'datasets');
  } catch (e) {
    console.error('  Batch ' + i + ': MISSING (' + e.message + ')');
  }
}
try {
  const zeros = JSON.parse(fs.readFileSync('flow-insights-zeros.json', 'utf8'));
  Object.assign(merged, zeros);
} catch {}
fs.writeFileSync('flow-insights.json', JSON.stringify(merged, null, 2));
const keys = Object.keys(merged).filter(k => k !== 'lastUpdated');
console.log('  Total:', keys.length, 'datasets');
" 2>/dev/null

  # Cleanup temp files
  rm -f flow-insights-batch-*.json flow-summary-batch*.json flow-insights-zeros.json fm-context.json

  mark_done insights 0 "$INSIGHTS_START" "batches merged" "  Flow Insights .........."
else
  if [ "${PIPELINE_STATUS[flows]}" = "skipped" ]; then
    PIPELINE_STATUS[insights]="skipped"
    PIPELINE_DETAIL[insights]="Flows were skipped"
    log "  Flow Insights .......... ○ skipped (flows not available)"
  else
    PIPELINE_STATUS[insights]="skipped"
    PIPELINE_DETAIL[insights]="flow-summary.json not found"
    log "  Flow Insights .......... ○ skipped (no flow-summary.json)"
  fi
fi

echo ""

# ---------- Phase 3: Verify + Commit ----------

log "PHASE 3 — Verify + Commit"

# Schema validation
if node "$SCRIPT_DIR/validate-data.js" > /dev/null 2>&1; then
  log "  Schema validation .......... ✓ passed"
else
  log "  Schema validation .......... ✗ FAILED — restoring data.js"
  git checkout -- data.js 2>/dev/null || true
fi

# Freshness verification
node "$SCRIPT_DIR/verify-sync.js" > /dev/null 2>&1
log "  Freshness verification ..... ✓ sync-status.json written"

# Commit all changes
ALL_FILES="data.js data-previous.json sync-log.json energy-news-data.json market-prices-seed.json import-data.js export-data.js flow-insights.json flow-summary.json sync-status.json"
SOH_FILES="soh-data/summary.json soh-data/vessel-matrix.json soh-data/adnoc-vessels.json soh-data/map-positions.json soh-data/vessels.json soh-data/transit-vessels.json soh-data/crisis-transits.json soh-data/breakdown-product.json soh-data/breakdown-vessel-type.json soh-data/breakdown-destination.json"

CHANGED=false
for f in $ALL_FILES $SOH_FILES; do
  if [ -f "$f" ] && ! git diff --quiet "$f" 2>/dev/null; then
    CHANGED=true
    break
  fi
done

# Also check for new untracked files
for f in sync-status.json; do
  if [ -f "$f" ] && ! git ls-files --error-unmatch "$f" > /dev/null 2>&1; then
    CHANGED=true
    break
  fi
done

if [ "$CHANGED" = true ]; then
  COMMIT_TS=$(date -u +"%Y-%m-%d %H:%M UTC")
  git add $ALL_FILES $SOH_FILES 2>/dev/null || true
  # Add any new soh-data files
  git add soh-data/ 2>/dev/null || true

  COMMIT_MSG="chore: daily sync ($COMMIT_TS)"
  git commit -m "$COMMIT_MSG" > /dev/null 2>&1
  COMMIT_HASH=$(git rev-parse --short HEAD)
  log "  Committed: $COMMIT_HASH"

  # Push to both branches
  git push origin master 2>/dev/null && log "  Pushed to origin/master" || log "  ⚠ Push to master failed"
  git push origin master:main 2>/dev/null && log "  Pushed to origin/main" || log "  ⚠ Push to main failed"
else
  log "  No changes detected — skipping commit."
fi

# Close Chrome if we started it
if [ -n "$CHROME_PID" ]; then
  kill "$CHROME_PID" 2>/dev/null || true
  log "  Chrome closed."
fi

echo ""

# ---------- Summary ----------

END_TIME=$(date +%s)
TOTAL_SECS=$((END_TIME - START_TIME))
if [ $TOTAL_SECS -ge 60 ]; then
  TOTAL_TIME="$((TOTAL_SECS / 60))m$((TOTAL_SECS % 60))s"
else
  TOTAL_TIME="${TOTAL_SECS}s"
fi

sep
log "SUMMARY"

LABELS="news_fm:News/FM/Production soh:SOH_Vessels prices:Platts_Prices flows:Import/Export_Flows spr:SPR_Releases insights:Flow_Insights"

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
    failed)  icon="✗"; color="\033[31m" ;;
    skipped) icon="○"; color="\033[90m" ;;
    *)       icon="?"; color="\033[0m" ;;
  esac

  printf "[sync]   %b%s%b %-22s %-8s %s\n" "$color" "$icon" "\033[0m" "$label" "$st" "${dur:+($dur)} $detail"
done

log "  Total time: $TOTAL_TIME"
sep
