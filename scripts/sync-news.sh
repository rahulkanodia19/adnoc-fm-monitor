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

# Ctrl+C rollback: restore data files to HEAD and do not commit/push.
# Fires before the commit block (lines ~76-88). Does not run under MASTER_SYNC=1
# (master-sync.sh owns the commit; its own cleanup trap handles interrupts there).
cleanup_on_interrupt() {
  echo ""
  echo "[sync-news] INTERRUPTED — rolling back uncommitted data files and skipping commit/push."
  git -C "$PROJECT_DIR" checkout HEAD -- data.js data-previous.json sync-log.json energy-news-data.json 2>/dev/null || true
  exit 130
}
trap cleanup_on_interrupt INT TERM

# Check if Chrome is available for premium sources
TOOLS="Edit,Write,Read,WebSearch,WebFetch,Glob,Grep,Bash(git diff*),Bash(git status*)"
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-news] Chrome available — including premium source access."
  TOOLS="$TOOLS,mcp__chrome-devtools*"
  # Check premium source tabs
  echo "[sync-news] Premium source tab check:"
  for site in "terminal.kpler.com:Kpler" "portal.rystadenergy.com:Rystad" "connect.spglobal.com:S&P Connect"; do
    url="${site%%:*}"
    name="${site##*:}"
    has_tab=$(curl -s "http://127.0.0.1:$DEBUG_PORT/json" 2>/dev/null | \
      node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).some(x=>x.url.includes('$url'))?'yes':'no')}catch{console.log('no')}})" 2>/dev/null)
    if [ "$has_tab" = "yes" ]; then
      echo "[sync-news]   $name ($url) ✓ tab open"
    else
      echo "[sync-news]   $name ($url) ✗ NO TAB — agent cannot access premium data"
    fi
  done
else
  echo "[sync-news] WARNING: Chrome not running. Using web search only (no premium sources)."
fi

# Interactive pre-flight health check for premium sources.
# HARD GATE — aborts sync if user cannot get Kpler/Rystad/S&P Connect/Platts Core healthy.
# Under MASTER_SYNC=1 the master orchestrator runs its own gate; skip duplication here.
if [ -z "$MASTER_SYNC" ] && curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  if [ -e /dev/tty ]; then
    node "$SCRIPT_DIR/check-premium-sources.js" < /dev/tty || {
      echo "[sync-news] ABORT: premium-source health check failed or user aborted."
      exit 1
    }
  else
    node "$SCRIPT_DIR/check-premium-sources.js" || {
      echo "[sync-news] ABORT: premium-source health check failed (non-interactive run)."
      exit 1
    }
  fi
fi

# Pre-fetch premium source content via CDP (bypasses MCP timeout issues)
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-news] Pre-fetching premium source content via CDP..."
  node "$SCRIPT_DIR/fetch-premium-sources.js" || echo "[sync-news] Premium fetch failed (non-fatal)"
fi

# Run Claude agent
echo "[sync-news] Running Claude agent (web search + premium sources)..."
cat scripts/sync-prompt.md | claude -p - \
  --allowedTools "$TOOLS" \
  --max-turns 50

echo "[sync-news] Agent complete."

# Fix LAST_UPDATED with actual machine time (rounded to previous hour)
NOW=$(node -e "const d=new Date();d.setMinutes(0,0,0);process.stdout.write(d.toISOString())")
sed -i "s|^const LAST_UPDATED = \".*\";|const LAST_UPDATED = \"$NOW\";|" "$PROJECT_DIR/data.js"

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
