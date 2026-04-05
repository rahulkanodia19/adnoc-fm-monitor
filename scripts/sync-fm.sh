#!/bin/bash
# ==============================================================
# sync-fm.sh — Global FM & Shutdown data sync via Claude agent
#
# Updates ONLY:
# - FM_DECLARATIONS_DATA (global)
# - SHUTDOWNS_NO_FM_DATA (global)
# - fm-sync-log.json
#
# Scope: 35 countries across 4 regions (Asia, Europe, Americas,
# Africa & Oceania) plus the 9 Gulf countries.
#
# Reads data.js as INPUT CONTEXT (COUNTRY_STATUS_DATA events
# describe upstream Gulf disruptions that trigger downstream FMs).
#
# Must NOT modify: LAST_UPDATED, COUNTRY_STATUS_DATA,
# WAR_RISK_PREMIUM_DATA, SPR_RELEASE_DATA, PIPELINE_STATUS_DATA.
# Invariant check enforces this after agent completes.
#
# Usage: npm run sync:fm
#   or:  bash scripts/sync-fm.sh
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEBUG_PORT=9222

echo "[sync-fm] =========================================="
echo "[sync-fm] ADNOC FM Monitor — Global FM/Shutdown Sync"
echo "[sync-fm] =========================================="

cd "$PROJECT_DIR"

# Lock file to prevent concurrent runs
LOCKFILE="$PROJECT_DIR/.sync-fm.lock"
if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "[sync-fm] Another sync-fm is running (pid $PID). Abort."
    exit 1
  fi
fi
echo $$ > "$LOCKFILE"

# Ctrl+C rollback: restore data files to HEAD and skip commit/push.
cleanup_on_interrupt() {
  echo ""
  echo "[sync-fm] INTERRUPTED — rolling back data.js and fm-sync-log.json, skipping commit/push."
  git -C "$PROJECT_DIR" checkout HEAD -- data.js fm-sync-log.json 2>/dev/null || true
  rm -f "$LOCKFILE"
  exit 130
}
trap cleanup_on_interrupt INT TERM
trap 'rm -f "$LOCKFILE"' EXIT

# Snapshot non-FM sections BEFORE agent runs (for invariant check)
SNAPSHOT_DIR="$PROJECT_DIR/.sync-backup"
mkdir -p "$SNAPSHOT_DIR"
node -e "
const fs = require('fs');
const code = fs.readFileSync('data.js', 'utf8');
const sections = {
  last_updated: (code.match(/const LAST_UPDATED = \"[^\"]*\";/) || [''])[0],
  country_status: (code.match(/const COUNTRY_STATUS_DATA = \[[\s\S]*?\n\];/) || [''])[0],
  war_risk: (code.match(/const WAR_RISK_PREMIUM_DATA = \{[\s\S]*?\n\};/) || [''])[0],
  spr: (code.match(/const SPR_RELEASE_DATA = \{[\s\S]*?\n\};/) || [''])[0],
  pipeline_status: (code.match(/const PIPELINE_STATUS_DATA = \[[\s\S]*?\n\];/) || [''])[0],
};
if (!sections.country_status || !sections.last_updated) {
  console.error('[sync-fm] Could not extract data.js sections for invariant snapshot.');
  process.exit(1);
}
fs.writeFileSync('.sync-backup/.fm-pre-snapshot.json', JSON.stringify(sections));
console.log('[sync-fm] Pre-edit snapshot saved.');
" || { echo "[sync-fm] Pre-snapshot failed."; exit 1; }

# Check if Chrome is available (optional — used for verifying specific company pages)
TOOLS="Edit,Write,Read,WebSearch,WebFetch,Glob,Grep,Bash(git diff*),Bash(git status*)"
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-fm] Chrome available — including MCP tools for page verification."
  TOOLS="$TOOLS,mcp__chrome-devtools*"
else
  echo "[sync-fm] Chrome not running — using web search only."
fi

# Run Claude agent with global scope
echo "[sync-fm] Running Claude agent (global FM/shutdown search across 35 countries)..."
cat scripts/sync-fm-prompt.md | NODE_OPTIONS="--max-old-space-size=4096" claude -p - \
  --allowedTools "$TOOLS" \
  --max-turns 80

echo "[sync-fm] Agent complete."

# Invariant check: verify agent did NOT modify non-FM sections
echo "[sync-fm] Checking invariants (non-FM sections must be unchanged)..."
if ! node -e "
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('.sync-backup/.fm-pre-snapshot.json', 'utf8'));
const code = fs.readFileSync('data.js', 'utf8');
const after = {
  last_updated: (code.match(/const LAST_UPDATED = \"[^\"]*\";/) || [''])[0],
  country_status: (code.match(/const COUNTRY_STATUS_DATA = \[[\s\S]*?\n\];/) || [''])[0],
  war_risk: (code.match(/const WAR_RISK_PREMIUM_DATA = \{[\s\S]*?\n\};/) || [''])[0],
  spr: (code.match(/const SPR_RELEASE_DATA = \{[\s\S]*?\n\};/) || [''])[0],
  pipeline_status: (code.match(/const PIPELINE_STATUS_DATA = \[[\s\S]*?\n\];/) || [''])[0],
};
let failed = [];
for (const k of ['last_updated','country_status','war_risk','spr','pipeline_status']) {
  if (snap[k] !== after[k]) failed.push(k);
}
if (failed.length) {
  console.error('[sync-fm] INVARIANT VIOLATION — these sections were modified:', failed.join(', '));
  process.exit(1);
}
console.log('[sync-fm] Invariants ok — only FM/shutdown arrays changed.');
"; then
  echo "[sync-fm] Restoring data.js from pre-news backup."
  if [ -f "$SNAPSHOT_DIR/data.js.post-news" ]; then
    cp "$SNAPSHOT_DIR/data.js.post-news" data.js
  elif [ -f "$SNAPSHOT_DIR/data.js.pre-news" ]; then
    cp "$SNAPSHOT_DIR/data.js.pre-news" data.js
  else
    git -C "$PROJECT_DIR" checkout -- data.js
  fi
  exit 1
fi

# Validate data.js
echo "[sync-fm] Validating data.js..."
if ! node "$SCRIPT_DIR/validate-data.js"; then
  echo "[sync-fm] VALIDATION FAILED — restoring data.js."
  if [ -f "$SNAPSHOT_DIR/data.js.post-news" ]; then
    cp "$SNAPSHOT_DIR/data.js.post-news" data.js
  else
    git -C "$PROJECT_DIR" checkout -- data.js
  fi
  exit 1
fi

# Commit and push (only when run standalone)
if [ -z "$MASTER_SYNC" ]; then
  echo "[sync-fm] Checking for changes..."
  if ! git -C "$PROJECT_DIR" diff --quiet data.js fm-sync-log.json 2>/dev/null; then
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
    git -C "$PROJECT_DIR" add data.js fm-sync-log.json
    git -C "$PROJECT_DIR" commit -m "chore: fm/shutdown data sync ($TIMESTAMP)"
    git -C "$PROJECT_DIR" push origin master && echo "[sync-fm] Pushed to origin/master" || echo "[sync-fm] ⚠ Push to master failed"
    git -C "$PROJECT_DIR" push origin master:main && echo "[sync-fm] Pushed to origin/main" || echo "[sync-fm] ⚠ Push to main failed"
  else
    echo "[sync-fm] No changes detected."
  fi
fi

echo "[sync-fm] Done."
