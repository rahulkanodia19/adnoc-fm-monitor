#!/bin/bash
# ==============================================================
# sync-soh.sh — Automated SOH data sync via Chrome MCP + Kpler
#
# Usage: npm run sync:soh
#   or:  bash scripts/sync-soh.sh
#
# One-time setup:
#   Run this script once, then log into terminal.kpler.com in
#   the Chrome window that opens. Sessions persist in
#   C:\ChromeProfiles\ClaudeSync for all future runs.
# ==============================================================
set -e

# Chrome paths (Windows via Git Bash / WSL)
CHROME_PATH="${CHROME_PATH:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
CHROME_DATA_DIR="${CHROME_DATA_DIR:-C:/ChromeProfiles/ClaudeSync}"
DEBUG_PORT=9222
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-soh] =========================================="
echo "[sync-soh] ADNOC FM Monitor — SOH Tracker Data Sync"
echo "[sync-soh] =========================================="

# 1. Check if Chrome is already running with debugging
CHROME_PID=""
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-soh] Chrome already running on port $DEBUG_PORT"
else
  echo "[sync-soh] Starting Chrome with remote debugging on port $DEBUG_PORT..."
  if [ -f "$CHROME_PATH" ]; then
    "$CHROME_PATH" --remote-debugging-port=$DEBUG_PORT \
      --user-data-dir="$CHROME_DATA_DIR" \
      --no-first-run --disable-default-apps &
    CHROME_PID=$!
  elif command -v google-chrome &> /dev/null; then
    google-chrome --remote-debugging-port=$DEBUG_PORT \
      --user-data-dir="$CHROME_DATA_DIR" \
      --no-first-run --disable-default-apps &
    CHROME_PID=$!
  elif command -v chrome.exe &> /dev/null; then
    chrome.exe --remote-debugging-port=$DEBUG_PORT \
      --user-data-dir="$CHROME_DATA_DIR" \
      --no-first-run --disable-default-apps &
    CHROME_PID=$!
  else
    echo "[sync-soh] ERROR: Chrome not found. Set CHROME_PATH env var."
    exit 1
  fi
  echo "[sync-soh] Waiting for Chrome to start..."
  for i in $(seq 1 15); do
    if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
      echo "[sync-soh] Chrome ready."
      break
    fi
    sleep 1
  done
fi

# 2. Run Claude Code SOH sync agent
echo "[sync-soh] Running Claude Code SOH sync agent..."
cd "$PROJECT_DIR"

claude -p scripts/sync-soh-prompt.md \
  --allowedTools "Bash(node*),Read,Write,Edit,Glob,Grep,mcp__chrome-devtools*" \
  --max-turns 30

# 3. Validate data was fetched
echo "[sync-soh] Validating data..."
if [ ! -f soh-data/vessels.json ] || [ ! -s soh-data/vessels.json ]; then
  echo "[sync-soh] ERROR: vessels.json not found or empty. Sync failed."
  exit 1
fi

VESSEL_COUNT=$(node -e "console.log(require('./soh-data/vessels.json').length)" 2>/dev/null || echo 0)
if [ "$VESSEL_COUNT" -lt 500 ]; then
  echo "[sync-soh] ERROR: Only $VESSEL_COUNT vessels (expected 900+). Sync may have failed."
  exit 1
fi
echo "[sync-soh] Validated: $VESSEL_COUNT vessels fetched."

# 3.5 Fetch container ships from S&P MINT (replaces als-monitor dependency)
echo "[sync-soh] Fetching container data from S&P MINT..."
node scripts/fetch-mint-containers.js || echo "[sync-soh] MINT container fetch failed (non-fatal, using cached data)"
echo "[sync-soh] Merging container ship data..."
node scripts/merge-containers.js || echo "[sync-soh] Container merge failed (non-fatal, continuing)"

# 3.6 Re-process SOH data with all containers included
echo "[sync-soh] Processing SOH data (with containers)..."
node scripts/process-soh.js || echo "[sync-soh] SOH processing failed (non-fatal)"

# 4. Commit and push if SOH data changed
echo "[sync-soh] Checking for changes..."
SOH_FILES="soh-data/summary.json soh-data/vessel-matrix.json soh-data/adnoc-vessels.json soh-data/map-positions.json soh-data/vessels.json soh-data/transit-vessels.json soh-data/crisis-transits.json soh-data/breakdown-product.json soh-data/breakdown-vessel-type.json soh-data/breakdown-destination.json"
if ! git -C "$PROJECT_DIR" diff --quiet $SOH_FILES 2>/dev/null; then
  echo "[sync-soh] Changes detected, committing and pushing..."
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add soh-data/
  git -C "$PROJECT_DIR" commit -m "chore: SOH tracker data sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync-soh] Pushed to GitHub successfully."
else
  echo "[sync-soh] No changes detected."
fi

# 4. Close Chrome if we started it
if [ -n "$CHROME_PID" ]; then
  echo "[sync-soh] Closing Chrome (PID: $CHROME_PID)..."
  kill "$CHROME_PID" 2>/dev/null || true
fi

echo "[sync-soh] Done."
