#!/bin/bash
# ==============================================================
# sync-soh.sh — Automated SOH data sync via Kpler JWT token
#
# Fetches vessel + flow data from Kpler API using JWT token,
# then merges S&P MINT container ships and processes all data.
#
# Token source: soh-data/.token.txt (extracted from Chrome by
# master-sync.sh or sync-flows.sh)
#
# Usage: npm run sync:soh
#   or:  bash scripts/sync-soh.sh
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEBUG_PORT=9222

echo "[sync-soh] =========================================="
echo "[sync-soh] ADNOC FM Monitor — SOH Tracker Data Sync"
echo "[sync-soh] =========================================="

cd "$PROJECT_DIR"

# 1. Check for token — extract fresh one from Chrome if available
if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-soh] Chrome available — extracting fresh JWT token..."
  TOKEN=$(node -e "
const http = require('http');
const WebSocket = require('ws');
async function getToken() {
  const pages = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:$DEBUG_PORT/json', res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  let page = pages.find(p => p.url.includes('kpler.com'));
  if (!page) page = pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  if (!page.url.includes('kpler.com')) {
    ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'https://terminal.kpler.com/cargo/flows' } }));
    await new Promise(r => setTimeout(r, 8000));
  }
  const result = await new Promise((resolve, reject) => {
    ws.send(JSON.stringify({
      id: 2, method: 'Runtime.evaluate',
      params: {
        expression: 'JSON.parse(localStorage.getItem(\"@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access\")).body.access_token',
        returnByValue: true
      }
    }));
    ws.on('message', msg => {
      const data = JSON.parse(msg);
      if (data.id === 2) resolve(data.result.result.value);
    });
    setTimeout(() => reject(new Error('Timeout')), 10000);
  });
  ws.close();
  process.stdout.write(result);
}
getToken().catch(e => { console.error(e.message); process.exit(1); });
" 2>/dev/null) || true
  if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 100 ]; then
    echo "$TOKEN" > "$PROJECT_DIR/soh-data/.token.txt"
    echo "[sync-soh] Token extracted (${#TOKEN} chars)."
  else
    echo "[sync-soh] Token extraction failed, using cached token."
  fi
fi

# Verify token exists
if [ ! -f "$PROJECT_DIR/soh-data/.token.txt" ] || [ ! -s "$PROJECT_DIR/soh-data/.token.txt" ]; then
  echo "[sync-soh] ERROR: No token available. Log into terminal.kpler.com in Chrome first."
  exit 1
fi

# 2. Run token-based SOH sync (Kpler API via JWT)
echo "[sync-soh] Fetching vessel + flow data from Kpler API..."
node "$SCRIPT_DIR/sync-soh.js"

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

# 3.4 Refresh MINT token from Chrome (unless master-sync preflight already did)
if [ -z "$MASTER_SYNC" ]; then
  echo "[sync-soh] Refreshing MINT token from Chrome..."
  set +e
  node scripts/extract-mint-token.js > /dev/null 2>&1
  RC=$?
  set -e
  case "$RC" in
    0) echo "[sync-soh] MINT token ✓ extracted from Chrome" ;;
    1) echo "[sync-soh] ⚠ Chrome not reachable — using cached MINT token if any" ;;
    2) echo "[sync-soh] ⚠ MINT login required — log into marketintelligencenetwork.com in Chrome" ;;
    3) echo "[sync-soh] ⚠ MINT extraction timeout — using cached MINT token if any" ;;
    *) echo "[sync-soh] ⚠ MINT extraction failed (rc=$RC) — using cached MINT token if any" ;;
  esac
fi

# 3.5 Fetch container ships from S&P MINT (replaces als-monitor dependency)
echo "[sync-soh] Fetching container data from S&P MINT..."
node scripts/fetch-mint-containers.js || echo "[sync-soh] MINT container fetch failed (non-fatal, using cached data)"
echo "[sync-soh] Merging container ship data..."
node scripts/merge-containers.js || echo "[sync-soh] Container merge failed (non-fatal, continuing)"

# 3.6 Re-process SOH data with all containers included
echo "[sync-soh] Processing SOH data (with containers)..."
node scripts/process-soh.js || echo "[sync-soh] SOH processing failed (non-fatal)"

# 4. Commit and push if SOH data changed (only when run standalone)
if [ -z "$MASTER_SYNC" ]; then
  echo "[sync-soh] Checking for changes..."
  SOH_FILES="soh-data/summary.json soh-data/vessel-matrix.json soh-data/adnoc-vessels.json soh-data/map-positions.json soh-data/vessels.json soh-data/transit-vessels.json soh-data/crisis-transits.json soh-data/breakdown-product.json soh-data/breakdown-vessel-type.json soh-data/breakdown-destination.json"
  if ! git -C "$PROJECT_DIR" diff --quiet $SOH_FILES 2>/dev/null; then
    echo "[sync-soh] Changes detected, committing and pushing..."
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
    git -C "$PROJECT_DIR" add soh-data/
    git -C "$PROJECT_DIR" commit -m "chore: SOH tracker data sync ($TIMESTAMP)"
    git -C "$PROJECT_DIR" push origin master && echo "[sync-soh] Pushed to origin/master" || echo "[sync-soh] ⚠ Push to master failed"
    git -C "$PROJECT_DIR" push origin master:main && echo "[sync-soh] Pushed to origin/main" || echo "[sync-soh] ⚠ Push to main failed"
  else
    echo "[sync-soh] No changes detected."
  fi
fi

echo "[sync-soh] Done."
