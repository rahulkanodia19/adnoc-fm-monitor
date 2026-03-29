#!/bin/bash
# ==============================================================
# sync-news.sh — News/FM/Production data sync via Claude agent
#
# Searches premium and public sources, updates data.js with:
# - COUNTRY_STATUS_DATA (9 countries)
# - FM_DECLARATIONS_DATA
# - SHUTDOWNS_NO_FM_DATA
# - energy-news-data.json
#
# Requires: Chrome running on port 9222 (for premium site access)
#
# Usage: npm run sync:news
#   or:  bash scripts/sync-news.sh
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEBUG_PORT=9222

echo "[sync-news] =========================================="
echo "[sync-news] ADNOC FM Monitor — News/FM/Production Sync"
echo "[sync-news] =========================================="

cd "$PROJECT_DIR"

# Check if Chrome is available for premium sources
TOOLS="Edit,Write,Read,WebSearch,WebFetch,Glob,Grep,Bash(git diff*),Bash(git status*)"
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-news] Chrome available — including premium source access."
  TOOLS="$TOOLS,mcp__chrome-devtools*"
else
  echo "[sync-news] WARNING: Chrome not running. Using web search only (no premium sources)."
fi

# Run Claude agent
echo "[sync-news] Running Claude agent (web search + premium sources)..."
claude -p "$(cat scripts/sync-prompt.md)" \
  --allowedTools "$TOOLS" \
  --max-turns 50

echo "[sync-news] Agent complete."

# Validate
echo "[sync-news] Validating data.js..."
if ! node "$SCRIPT_DIR/validate-data.js"; then
  echo "[sync-news] VALIDATION FAILED — restoring data.js from git."
  git -C "$PROJECT_DIR" checkout -- data.js
  exit 1
fi

# Commit and push (only when run standalone, not from master-sync)
if [ -z "$MASTER_SYNC" ]; then
  echo "[sync-news] Checking for changes..."
  if ! git -C "$PROJECT_DIR" diff --quiet data.js data-previous.json sync-log.json energy-news-data.json 2>/dev/null; then
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
    git -C "$PROJECT_DIR" add data.js data-previous.json sync-log.json energy-news-data.json
    git -C "$PROJECT_DIR" commit -m "chore: news/fm data sync ($TIMESTAMP)"
    git -C "$PROJECT_DIR" push origin master && echo "[sync-news] Pushed to origin/master" || echo "[sync-news] ⚠ Push to master failed"
    git -C "$PROJECT_DIR" push origin master:main && echo "[sync-news] Pushed to origin/main" || echo "[sync-news] ⚠ Push to main failed"
  else
    echo "[sync-news] No changes detected."
  fi
fi

echo "[sync-news] Done."
