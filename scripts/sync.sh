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

# 2. Verify sync completed
if [ ! -f "$PROJECT_DIR/sync-log.json" ]; then
  echo "[sync] ERROR: sync-log.json not written. Sync may be incomplete."
  exit 1
fi

# 3. Validate data.js before committing
echo "[sync] Validating data.js..."
if ! node "$SCRIPT_DIR/validate-data.js"; then
  echo "[sync] VALIDATION FAILED — not committing. Restoring data.js from git..."
  git -C "$PROJECT_DIR" checkout -- data.js
  exit 1
fi

# 4. Commit and push if data changed
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

# 5. Fetch Platts market prices (all 7 commodities)
echo "[sync] Fetching Platts market prices..."
if node "$SCRIPT_DIR/fetch-platts-prices.js"; then
  echo "[sync] Platts prices updated."
else
  echo "[sync] WARNING: Platts price fetch failed (continuing)."
fi

# 6. Commit and push price data if changed
if ! git -C "$PROJECT_DIR" diff --quiet market-prices-seed.json 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add market-prices-seed.json
  git -C "$PROJECT_DIR" commit -m "chore: daily price sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync] Price data pushed to GitHub."
else
  echo "[sync] No price changes detected."
fi

# 7. Run SPR sync
echo "[sync] Running SPR data sync..."
bash "$SCRIPT_DIR/sync-spr.sh"

echo "[sync] Done."
