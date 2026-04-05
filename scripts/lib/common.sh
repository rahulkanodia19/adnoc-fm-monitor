#!/bin/bash
# ==============================================================
# scripts/lib/common.sh — Shared helpers for sync pipelines
#
# Sourced by:
#   - scripts/master-sync.sh (orchestrator)
#   - scripts/sync-spr.sh, scripts/sync-prices.sh,
#     scripts/sync-flow-insights.sh (individual pipelines that
#     need standalone preflight)
#
# Exports:
#   - Preflight checks: check_chrome, check_kpler_token,
#     check_mint_token, check_platts_env, check_file_exists,
#     check_data_file
#   - Summary/abort: print_preflight_summary,
#     preflight_abort_if_critical
#   - Log rotation: rotate_log, purge_old_logs
#   - Heartbeat: start_heartbeat (for parallel phase)
#
# Design rules:
#   - All functions return 0 unconditionally (safe under set -e)
#   - Status lives in PREFLIGHT_RESULTS associative array
#   - All output goes to stdout only (never files directly)
#   - FORCE=1 env var bypasses preflight_abort_if_critical
# ==============================================================

# Resolve own directory once (BASH_SOURCE), cwd-safe
_COMMON_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Global results (bash associative array)
declare -gA PREFLIGHT_RESULTS 2>/dev/null || declare -A PREFLIGHT_RESULTS

# --- Internal: record a preflight result ---
_pf_set() {
  local name="$1" status="$2" reason="$3"
  PREFLIGHT_RESULTS[$name]="$status|$reason"
}

# --- Internal: project root (two levels up from lib/) ---
_pf_project_dir() {
  echo "$(cd "$_COMMON_SH_DIR/../.." && pwd)"
}

# ==============================================================
# PREFLIGHT CHECKS
# ==============================================================

# check_chrome — verifies Chrome is running with remote debugging
check_chrome() {
  local port="${DEBUG_PORT:-9222}"
  if curl -s "http://127.0.0.1:$port/json/version" > /dev/null 2>&1; then
    _pf_set "chrome" "PASS" "running on port $port"
  else
    _pf_set "chrome" "FAIL" "not responding on port $port"
  fi
  return 0
}

# check_kpler_token — verifies Kpler JWT token is cached + non-trivial
check_kpler_token() {
  local proj="$(_pf_project_dir)"
  local tok="$proj/soh-data/.token.txt"
  if [ ! -f "$tok" ]; then
    _pf_set "kpler_token" "FAIL" "missing $tok"
  elif [ ! -s "$tok" ]; then
    _pf_set "kpler_token" "FAIL" "empty $tok"
  else
    local sz
    sz=$(wc -c < "$tok" 2>/dev/null | tr -d ' ')
    if [ "${sz:-0}" -lt 100 ]; then
      _pf_set "kpler_token" "FAIL" "token too short ($sz chars)"
    else
      _pf_set "kpler_token" "PASS" "$sz chars"
    fi
  fi
  return 0
}

# check_mint_token — verifies S&P MINT token not expired
check_mint_token() {
  local proj="$(_pf_project_dir)"
  local tok="$proj/soh-data/.mint-token.json"
  if [ ! -f "$tok" ]; then
    _pf_set "mint_token" "WARN" "missing $tok (will use cache)"
    return 0
  fi
  local status
  status=$(node -e "
    try {
      const t = JSON.parse(require('fs').readFileSync('$tok'));
      const hrs = ((t.expiresAt - Date.now()) / 3600000).toFixed(1);
      console.log(Date.now() < t.expiresAt ? 'valid:' + hrs : 'expired');
    } catch(e) { console.log('unreadable'); }
  " 2>/dev/null)
  case "$status" in
    valid:*) _pf_set "mint_token" "PASS" "${status#valid:}h remaining" ;;
    expired) _pf_set "mint_token" "WARN" "expired (will refresh or use cache)" ;;
    *)       _pf_set "mint_token" "WARN" "unreadable (will use cache)" ;;
  esac
  return 0
}

# check_platts_env — verifies .env has Platts credentials
check_platts_env() {
  local proj="$(_pf_project_dir)"
  local env="$proj/.env"
  if [ ! -f "$env" ]; then
    _pf_set "platts_env" "FAIL" "missing $env"
    return 0
  fi
  # shellcheck disable=SC1090
  local user pass
  user=$(grep -E '^SPGCI_USERNAME=' "$env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
  pass=$(grep -E '^SPGCI_PASSWORD=' "$env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [ -z "$user" ] || [ -z "$pass" ]; then
    _pf_set "platts_env" "FAIL" "SPGCI_USERNAME or SPGCI_PASSWORD missing in .env"
  else
    _pf_set "platts_env" "PASS" "credentials present"
  fi
  return 0
}

# check_platts_token — verifies Platts refresh token cached
check_platts_token() {
  local proj="$(_pf_project_dir)"
  local tok="$proj/.platts-token.json"
  if [ -f "$tok" ]; then
    _pf_set "platts_token" "PASS" "refresh token found"
  else
    _pf_set "platts_token" "WARN" "not cached (will do full auth)"
  fi
  return 0
}

# check_file_exists PATH [LABEL] — verifies file exists
check_file_exists() {
  local path="$1" label="${2:-$1}"
  local proj="$(_pf_project_dir)"
  local full="$path"
  [ "${path:0:1}" != "/" ] && [ "${path:1:1}" != ":" ] && full="$proj/$path"
  if [ -f "$full" ]; then
    _pf_set "$label" "PASS" "exists"
  else
    _pf_set "$label" "FAIL" "missing: $path"
  fi
  return 0
}

# check_data_file PATH MIN_BYTES [LABEL] — verifies file + min size
check_data_file() {
  local path="$1" min="$2" label="${3:-$1}"
  local proj="$(_pf_project_dir)"
  local full="$path"
  [ "${path:0:1}" != "/" ] && [ "${path:1:1}" != ":" ] && full="$proj/$path"
  if [ ! -f "$full" ]; then
    _pf_set "$label" "FAIL" "missing: $path"
    return 0
  fi
  local sz
  sz=$(wc -c < "$full" 2>/dev/null | tr -d ' ')
  if [ "${sz:-0}" -lt "$min" ]; then
    _pf_set "$label" "WARN" "undersized ($sz < $min bytes)"
  else
    local human
    if [ "$sz" -ge 1048576 ]; then
      human="$((sz / 1048576)) MB"
    elif [ "$sz" -ge 1024 ]; then
      human="$((sz / 1024)) KB"
    else
      human="$sz B"
    fi
    _pf_set "$label" "PASS" "$human"
  fi
  return 0
}

# ==============================================================
# PREFLIGHT SUMMARY + ABORT
# ==============================================================

# print_preflight_summary — prints tallied results + any FAILs
print_preflight_summary() {
  local pass=0 warn=0 fail=0
  local fail_lines=""
  local name status reason
  for name in "${!PREFLIGHT_RESULTS[@]}"; do
    IFS='|' read -r status reason <<< "${PREFLIGHT_RESULTS[$name]}"
    case "$status" in
      PASS) pass=$((pass + 1)) ;;
      WARN) warn=$((warn + 1)) ;;
      FAIL) fail=$((fail + 1))
            fail_lines="${fail_lines}[sync]   ✗ ${name}: ${reason}
"
            ;;
    esac
  done
  echo "[sync] ──────────────────────────────────────────────────"
  echo "[sync] PRE-FLIGHT: $pass passed, $warn warned, $fail failed"
  if [ $fail -gt 0 ]; then
    printf "%s" "$fail_lines"
  fi
  echo "[sync] ──────────────────────────────────────────────────"
  return 0
}

# preflight_abort_if_critical NAMES... — exits 1 if any named check FAILed
# Bypass via FORCE=1 env var.
preflight_abort_if_critical() {
  local name status reason
  local critical_fail=0
  for name in "$@"; do
    if [ -z "${PREFLIGHT_RESULTS[$name]}" ]; then continue; fi
    IFS='|' read -r status reason <<< "${PREFLIGHT_RESULTS[$name]}"
    if [ "$status" = "FAIL" ]; then
      critical_fail=1
      echo "[sync]   Critical FAIL: $name ($reason)"
    fi
  done
  if [ $critical_fail -eq 1 ]; then
    if [ "${FORCE:-0}" = "1" ]; then
      echo "[sync] FORCE=1 set — continuing despite critical failure"
    else
      echo "[sync] Aborting. Set FORCE=1 to override."
      exit 1
    fi
  fi
  return 0
}

# ==============================================================
# LOG ROTATION
# ==============================================================

# rotate_log FILENAME — if file exists + non-empty, rename to
# FILENAME.YYYY-MM-DD (with .N counter on same-day collision).
rotate_log() {
  local file="$1"
  [ -z "$file" ] && return 0
  [ ! -f "$file" ] && return 0
  [ ! -s "$file" ] && return 0
  local date_stamp
  date_stamp=$(date +%Y-%m-%d)
  local target="${file}.${date_stamp}"
  if [ -e "$target" ]; then
    local n=2
    while [ -e "${target}.${n}" ]; do
      n=$((n + 1))
    done
    target="${target}.${n}"
  fi
  mv "$file" "$target" 2>/dev/null || true
  return 0
}

# purge_old_logs DIR DAYS — delete *.log.* files older than DAYS
purge_old_logs() {
  local dir="$1" days="${2:-7}"
  [ -z "$dir" ] && return 0
  [ ! -d "$dir" ] && return 0
  find "$dir" -maxdepth 1 -type f -name "*.log.*" -mtime +${days} -delete 2>/dev/null || true
  return 0
}

# ==============================================================
# HEARTBEAT (for master-sync Phase 1 parallel wait)
# ==============================================================

# start_heartbeat — prints "… still running: ..." every 90s for any
# pipeline in PIPELINE_STATUS[] with status "running". Designed to
# run as background process. Caller stores the PID and kills it
# after all parallel waits complete.
#
# Usage:
#   start_heartbeat &
#   HEARTBEAT_PID=$!
#   # ... collect_result calls ...
#   kill $HEARTBEAT_PID 2>/dev/null
start_heartbeat() {
  local interval="${HEARTBEAT_INTERVAL:-90}"
  local hb_start
  hb_start=$(date +%s)
  while true; do
    sleep "$interval"
    local now elapsed_s elapsed_str running_list=""
    now=$(date +%s)
    elapsed_s=$((now - hb_start))
    if [ $elapsed_s -ge 60 ]; then
      elapsed_str="$((elapsed_s/60))m$((elapsed_s%60))s"
    else
      elapsed_str="${elapsed_s}s"
    fi
    # Collect pipelines still marked running
    local p
    for p in ${PIPELINES:-}; do
      if [ "${PIPELINE_STATUS[$p]:-}" = "running" ]; then
        [ -n "$running_list" ] && running_list="${running_list}, "
        running_list="${running_list}${p}"
      fi
    done
    if [ -n "$running_list" ]; then
      echo "[sync]   … still running: ${running_list} (${elapsed_str} elapsed)"
    fi
  done
}
