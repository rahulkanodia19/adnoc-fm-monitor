#!/bin/bash
# ==============================================================
# sync-force.sh — Comprehensive sync: web search + browser + push
#
# Runs BOTH sync modes in sequence for maximum data coverage:
#   1. Web search sync (free/public data from all tiers)
#   2. Browser sync (premium authenticated data from Kpler, Rystad, etc.)
#   3. Auto-commit and push to GitHub
#
# Usage: npm run sync:force
#   or:  bash scripts/sync-force.sh
# ==============================================================
set -e

CHROME_PATH="${CHROME_PATH:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
CHROME_DATA_DIR="${CHROME_DATA_DIR:-C:/ChromeProfiles/ClaudeSync}"
DEBUG_PORT=9222
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-force] ================================================"
echo "[sync-force] ADNOC FM Monitor — Full Sync (Web + Browser)"
echo "[sync-force] ================================================"

# ── Step 1: Web Search Sync (free/public data) ──────────────────
echo ""
echo "[sync-force] ── Step 1/3: Web Search Sync (public data) ──"
cd "$PROJECT_DIR"

claude -p "$(cat scripts/sync-prompt.md)" \
  --allowedTools "Edit,Write,Read,WebSearch,WebFetch,Glob,Grep,Bash(git diff*),Bash(git status*)" \
  --max-turns 45

echo "[sync-force] Web search sync complete."

# ── Step 2: Browser Sync (premium authenticated data) ───────────
echo ""
echo "[sync-force] ── Step 2/3: Browser Sync (premium data) ──"

# Launch Chrome if not already running
CHROME_PID=""
if ! curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-force] Starting Chrome with remote debugging..."
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
    echo "[sync-force] WARNING: Chrome not found. Skipping browser sync."
    echo "[sync-force] Set CHROME_PATH env var to fix this."
    # Skip to commit step
    CHROME_PID="SKIP"
  fi

  if [ "$CHROME_PID" != "SKIP" ]; then
    echo "[sync-force] Waiting for Chrome to start..."
    for i in $(seq 1 15); do
      if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
        echo "[sync-force] Chrome ready."
        break
      fi
      sleep 1
    done
  fi
else
  echo "[sync-force] Chrome already running on port $DEBUG_PORT"
fi

# Run browser-enhanced sync (builds on the data.js already updated by Step 1)
if [ "$CHROME_PID" != "SKIP" ]; then
  claude -p "Read data.js to see the current state (just updated by web search).
Now ENHANCE it with premium data from the authenticated browser.

You have access to a Chrome browser via chrome-devtools MCP tools.
The browser is logged into premium data platforms. Use it to:
1. Navigate to terminal.kpler.com — check tanker/LNG flow dashboards for latest Gulf/Hormuz data
2. Navigate to portal.rystadenergy.com/home — check production analytics and supply disruption reports
3. Navigate to connect.spglobal.com — check latest Platts assessments, market analysis, and CERA reports

Compare what you find with the existing data in data.js. Add any NEW information, update any changed statuses, and enhance source citations with premium data references.
Do NOT remove or downgrade any existing data — only add and enhance.
Update LAST_UPDATED timestamp. Write sync-log.json noting this was a browser-enhanced pass." \
    --allowedTools "Edit,Write,Read,WebSearch,WebFetch,Glob,Grep,Bash(git diff*),Bash(git status*),mcp__chrome-devtools*" \
    --max-turns 50

  echo "[sync-force] Browser sync complete."
fi

# ── Step 3: Validate and Commit ────────────────────────────────
echo ""
echo "[sync-force] ── Step 3/3: Validate and Commit ──"

# Verify sync completed
if [ ! -f "$PROJECT_DIR/sync-log.json" ]; then
  echo "[sync-force] ERROR: sync-log.json not written. Sync may be incomplete."
  exit 1
fi

# Validate data.js before committing
echo "[sync-force] Validating data.js..."
if ! node "$SCRIPT_DIR/validate-data.js"; then
  echo "[sync-force] VALIDATION FAILED — not committing. Restoring data.js from git..."
  git -C "$PROJECT_DIR" checkout -- data.js
  exit 1
fi

if ! git -C "$PROJECT_DIR" diff --quiet data.js data-previous.json sync-log.json energy-news-data.json 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add data.js data-previous.json sync-log.json energy-news-data.json
  git -C "$PROJECT_DIR" commit -m "chore: full data sync — web + browser ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync-force] Pushed to GitHub successfully."
else
  echo "[sync-force] No changes detected."
fi

# 4. Run SPR sync
echo "[sync-force] Running SPR data sync..."
bash "$SCRIPT_DIR/sync-spr.sh"

# Close Chrome if we started it
if [ -n "$CHROME_PID" ] && [ "$CHROME_PID" != "SKIP" ]; then
  echo "[sync-force] Closing Chrome..."
  kill "$CHROME_PID" 2>/dev/null || true
fi

echo "[sync-force] Done."
