#!/bin/bash
# ==============================================================
# sync-local.sh — Fully automated local sync with Chrome browser
# access for premium data sources (Kpler, Rystad, S&P Global, etc.)
#
# Usage: npm run sync:local
#   or:  bash scripts/sync-local.sh
#
# One-time setup:
#   Run this script once, then log into Kpler, Rystad, S&P Global,
#   Bloomberg etc. in the Chrome window that opens. Sessions persist
#   in C:\ChromeProfiles\ClaudeSync for all future runs.
# ==============================================================
set -e

# Chrome paths (Windows via Git Bash / WSL)
CHROME_PATH="${CHROME_PATH:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
CHROME_DATA_DIR="${CHROME_DATA_DIR:-C:/ChromeProfiles/ClaudeSync}"
DEBUG_PORT=9222
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-local] =========================================="
echo "[sync-local] ADNOC FM Monitor — Local Sync with Browser"
echo "[sync-local] =========================================="

# 1. Check if Chrome is already running with debugging
CHROME_RUNNING=false
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  CHROME_RUNNING=true
  CHROME_PID=""
  echo "[sync-local] Chrome already running on port $DEBUG_PORT"
else
  echo "[sync-local] Starting Chrome with remote debugging on port $DEBUG_PORT..."
  # Try Windows path first, then fallback
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
    echo "[sync-local] ERROR: Chrome not found. Set CHROME_PATH env var."
    exit 1
  fi
  # Wait for Chrome to be ready
  echo "[sync-local] Waiting for Chrome to start..."
  for i in $(seq 1 15); do
    if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
      echo "[sync-local] Chrome ready."
      break
    fi
    sleep 1
  done
fi

# 2. Run Claude Code sync with browser + web search
echo "[sync-local] Running Claude Code sync..."
cd "$PROJECT_DIR"

claude -p "$(cat scripts/sync-prompt.md)

ADDITIONAL INSTRUCTIONS FOR LOCAL BROWSER-AUTHENTICATED RUN:
You have access to a Chrome browser via the chrome-devtools MCP tools.
The browser is logged into premium data platforms. Use the browser to:
1. Navigate to kpler.com — check tanker/LNG flow dashboards for latest Gulf/Hormuz data
2. Navigate to rystadenergy.com — check production analytics and supply disruption reports
3. Navigate to spglobal.com/commodityinsights — check latest market analysis and Platts assessments
4. Navigate to bloomberg.com — check energy news and terminal data
5. Navigate to argusmedia.com — check crude/LNG pricing reports
6. Navigate to icis.com — check petrochemical and LNG spot data
Also use WebSearch for publicly available data as usual.
Combine browser-sourced data with web search results for the most comprehensive update.
When citing data obtained via browser from premium sources, note the source clearly." \
  --allowedTools "Edit,Write,Read,WebSearch,WebFetch,Glob,Grep,Bash(git diff*),Bash(git status*),mcp__chrome-devtools*" \
  --max-turns 50

# 3. Commit and push if data changed
echo "[sync-local] Checking for changes..."
if ! git -C "$PROJECT_DIR" diff --quiet data.js data-previous.json sync-log.json 2>/dev/null; then
  echo "[sync-local] Changes detected, committing and pushing..."
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add data.js data-previous.json sync-log.json
  git -C "$PROJECT_DIR" commit -m "chore: local data sync with premium sources ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync-local] Pushed to GitHub successfully."
else
  echo "[sync-local] No changes detected."
fi

# 4. Close Chrome if we started it
if [ -n "$CHROME_PID" ]; then
  echo "[sync-local] Closing Chrome (PID: $CHROME_PID)..."
  kill "$CHROME_PID" 2>/dev/null || true
fi

echo "[sync-local] Done."
