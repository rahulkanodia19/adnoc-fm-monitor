#!/bin/bash
# ==============================================================
# sync-spr.sh — SPR release data sync + auto-commit + push
#
# Searches for latest IEA coordinated oil stock release figures
# and updates SPR_RELEASE_DATA in data.js.
#
# Usage: npm run sync:spr
#   or:  bash scripts/sync-spr.sh
#
# Can also be chained from sync.sh / sync-local.sh / sync-force.sh
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-spr] =========================================="
echo "[sync-spr] ADNOC FM Monitor — SPR Release Data Sync"
echo "[sync-spr] =========================================="

# 1. Run Claude Code sync for SPR data
echo "[sync-spr] Running Claude Code SPR sync (web search)..."
cd "$PROJECT_DIR"

claude -p "$(cat scripts/sync-spr-prompt.md)" \
  --allowedTools "Edit,Read,WebSearch,WebFetch,Glob,Grep" \
  --max-turns 30

echo "[sync-spr] SPR sync complete."

# 2. Commit and push if data.js changed
echo "[sync-spr] Checking for changes..."
if ! git -C "$PROJECT_DIR" diff --quiet data.js spr-seed.json 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add data.js spr-seed.json
  git -C "$PROJECT_DIR" commit -m "chore: SPR data sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync-spr] Pushed to GitHub successfully."
else
  echo "[sync-spr] No SPR changes detected."
fi

echo "[sync-spr] Done."
