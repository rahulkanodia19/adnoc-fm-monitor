#!/bin/bash
# ==============================================================
# sync.sh — Web search sync + auto-commit + push
#
# Searches publicly available data (no browser needed), updates
# data.js, and pushes to GitHub.
#
# Usage: npm run sync
#   or:  bash scripts/sync.sh
#
# Scheduled daily via cron at midnight UTC (4 AM UAE).
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync] =========================================="
echo "[sync] ADNOC FM Monitor — Web Search Sync"
echo "[sync] =========================================="

# 1. Run Claude Code sync with web search
echo "[sync] Running Claude Code sync (web search only)..."
cd "$PROJECT_DIR"

claude -p "$(cat scripts/sync-prompt.md)" \
  --allowedTools "Edit,Write,Read,WebSearch,WebFetch,Glob,Grep,Bash(git diff*),Bash(git status*)" \
  --max-turns 45

echo "[sync] Web search sync complete."

# 2. Commit and push if data changed
echo "[sync] Checking for changes..."
if ! git -C "$PROJECT_DIR" diff --quiet data.js data-previous.json sync-log.json energy-news-data.json 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add data.js data-previous.json sync-log.json energy-news-data.json
  git -C "$PROJECT_DIR" commit -m "chore: daily data sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync] Pushed to GitHub successfully."
else
  echo "[sync] No changes detected."
fi

# 3. Run SPR sync
echo "[sync] Running SPR data sync..."
bash "$SCRIPT_DIR/sync-spr.sh"

echo "[sync] Done."
