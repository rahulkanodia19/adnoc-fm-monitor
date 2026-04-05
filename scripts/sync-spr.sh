#!/bin/bash
# ==============================================================
# sync-spr.sh — SPR release data sync + auto-commit + push
#
# Pre-fetches IEA/DOE/EIA reference pages via Node curl (soh-data/.spr-sources.json)
# then runs a Claude agent to search for latest barrel figures and update
# SPR_RELEASE_DATA in data.js.
#
# Usage: npm run sync:spr
#   or:  bash scripts/sync-spr.sh
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-spr] =========================================="
echo "[sync-spr] ADNOC FM Monitor — SPR Release Data Sync"
echo "[sync-spr] =========================================="

cd "$PROJECT_DIR"

# 1. Pre-fetch SPR source pages (IEA, DOE, EIA) via Node curl.
# This offloads slow HTTP fetches from Claude's turn budget — claude reads
# the resulting JSON in one Read turn instead of 4+ WebFetch turns.
echo "[sync-spr] Pre-fetching SPR source pages..."
node "$SCRIPT_DIR/fetch-spr-sources.js" || echo "[sync-spr] Pre-fetch had errors (non-fatal, claude will fall back to WebFetch)"

# 2. Run Claude Code sync for SPR data
echo "[sync-spr] Running Claude Code SPR sync (web search)..."
cat scripts/sync-spr-prompt.md | NODE_OPTIONS="--max-old-space-size=4096" claude -p - \
  --allowedTools "Edit,Read,WebSearch,WebFetch" \
  --max-turns 20 \
  --verbose

echo "[sync-spr] SPR sync complete."

# 3. Post-edit validation — confirm SPR_RELEASE_DATA structure is intact.
# Matches sync-prices.sh:56-64 pattern. If this fails, `set -e` aborts
# before git commit, and master-sync retry picks it up.
echo "[sync-spr] Validating SPR_RELEASE_DATA structure..."
node -e "
const code = require('fs').readFileSync('data.js','utf8');
new Function('(function(){' + code + '})')();  // syntax check
const m = code.match(/const SPR_RELEASE_DATA = (\{[\s\S]*?\});\s*\n\s*\/\/ =/);
if (!m) { console.error('  SPR_RELEASE_DATA block missing or unrecognizable'); process.exit(1); }
const d = eval('(' + m[1] + ')');
if (d.countries.length !== 30) { console.error('  Expected 30 countries, got ' + d.countries.length); process.exit(1); }
const sum = d.countries.reduce((s,c) => s + c.released, 0);
if (Math.abs(sum - d.totalReleased) > 0.1) { console.error('  totalReleased mismatch: sum=' + sum.toFixed(2) + ' vs totalReleased=' + d.totalReleased); process.exit(1); }
console.log('  SPR validated: 30 countries, totalReleased=' + d.totalReleased.toFixed(1) + ' mb, asOf=' + d.asOf);
"

# 4. Commit and push if data.js changed
echo "[sync-spr] Checking for changes..."
if ! git -C "$PROJECT_DIR" diff --quiet data.js spr-seed.json 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add data.js spr-seed.json
  git -C "$PROJECT_DIR" commit -m "chore: SPR data sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push origin master && echo "[sync-spr] Pushed to origin/master" || echo "[sync-spr] ⚠ Push to master failed"
  git -C "$PROJECT_DIR" push origin master:main && echo "[sync-spr] Pushed to origin/main" || echo "[sync-spr] ⚠ Push to main failed"
else
  echo "[sync-spr] No SPR changes detected."
fi

echo "[sync-spr] Done."
