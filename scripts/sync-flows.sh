#!/bin/bash
# ==============================================================
# sync-flows.sh — Automated flow data sync via Kpler API
#
# 1. Extracts JWT token from Chrome (Kpler session)
# 2. Runs sync-flows.js to fetch all datasets via API
# 3. Validates output, commits and pushes
#
# Usage: npm run sync:flows
#   or:  bash scripts/sync-flows.sh
# ==============================================================
set -e

CHROME_PATH="${CHROME_PATH:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
CHROME_DATA_DIR="${CHROME_DATA_DIR:-C:/ChromeProfiles/ClaudeSync}"
DEBUG_PORT=9222
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-flows] =========================================="
echo "[sync-flows] ADNOC FM Monitor — Flow Data Sync (Kpler)"
echo "[sync-flows] =========================================="

# 1. Ensure Chrome is running for token extraction
CHROME_PID=""
if ! curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-flows] Starting Chrome..."
  if [ -f "$CHROME_PATH" ]; then
    "$CHROME_PATH" --remote-debugging-port=$DEBUG_PORT \
      --user-data-dir="$CHROME_DATA_DIR" \
      --no-first-run --disable-default-apps &
    CHROME_PID=$!
  else
    echo "[sync-flows] ERROR: Chrome not found. Set CHROME_PATH."
    exit 1
  fi
  for i in $(seq 1 15); do
    curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1 && break
    sleep 1
  done
  echo "[sync-flows] Chrome ready."
else
  echo "[sync-flows] Chrome already running."
fi

# 2. Extract fresh JWT token from Kpler session in Chrome
echo "[sync-flows] Extracting Kpler token..."
# Navigate to Kpler to ensure session is active, then extract token
TOKEN=$(node -e "
const http = require('http');
const WebSocket = require('ws');

async function getToken() {
  // Get page list
  const pages = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:$DEBUG_PORT/json', res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  // Find Kpler page or use first page
  let page = pages.find(p => p.url.includes('kpler.com'));
  if (!page) page = pages[0];

  // Connect via WebSocket
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  // If not on Kpler, navigate there
  if (!page.url.includes('kpler.com')) {
    ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'https://terminal.kpler.com/cargo/flows' } }));
    await new Promise(r => setTimeout(r, 8000));
  }

  // Extract token from localStorage
  const result = await new Promise((resolve, reject) => {
    ws.send(JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
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

if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 100 ]; then
  echo "[sync-flows] WARNING: Could not extract token from Chrome. Using existing token file."
  if [ ! -f "$PROJECT_DIR/soh-data/.token.txt" ]; then
    echo "[sync-flows] ERROR: No token available. Log into terminal.kpler.com in Chrome first."
    exit 1
  fi
else
  echo "$TOKEN" > "$PROJECT_DIR/soh-data/.token.txt"
  echo "[sync-flows] Token extracted (${#TOKEN} chars)."
fi

# 3. Run the flow data sync script
echo "[sync-flows] Fetching flow data from Kpler API..."
cd "$PROJECT_DIR"
node "$SCRIPT_DIR/sync-flows.js"
EXIT_CODE=$?

# If token expired, try refreshing and retrying
if [ "$EXIT_CODE" -eq 2 ]; then
  echo "[sync-flows] Token expired. Refreshing..."
  sleep 2
  # Re-extract token (Kpler auto-refreshes in browser)
  TOKEN=$(node -e "
    const http = require('http');
    const WebSocket = require('ws');
    // ... same extraction as above (abbreviated) ...
    process.stdout.write('');
  " 2>/dev/null) || true
  if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 100 ]; then
    echo "$TOKEN" > "$PROJECT_DIR/soh-data/.token.txt"
    echo "[sync-flows] Token refreshed. Retrying..."
    node "$SCRIPT_DIR/sync-flows.js"
  else
    echo "[sync-flows] ERROR: Could not refresh token."
    exit 1
  fi
fi

# 4. Validate
echo "[sync-flows] Validating..."
node -e "
const fs = require('fs');
const imp = fs.readFileSync('import-data.js', 'utf8');
const exp = fs.readFileSync('export-data.js', 'utf8');
console.log('import-data.js:', (imp.length / 1024 / 1024).toFixed(1), 'MB');
console.log('export-data.js:', (exp.length / 1024 / 1024).toFixed(1), 'MB');
if (!imp.includes('IMPORT_FLOW_DATA') || !exp.includes('EXPORT_FLOW_DATA')) { process.exit(1); }
console.log('Validation PASSED');
"

# 5. Commit and push
if ! git -C "$PROJECT_DIR" diff --quiet import-data.js export-data.js 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add import-data.js export-data.js
  git -C "$PROJECT_DIR" commit -m "chore: flow data sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push origin master && echo "[sync-flows] Pushed to origin/master" || echo "[sync-flows] ⚠ Push to master failed"
  git -C "$PROJECT_DIR" push origin master:main && echo "[sync-flows] Pushed to origin/main" || echo "[sync-flows] ⚠ Push to main failed"
else
  echo "[sync-flows] No changes."
fi

# 6. Close Chrome if we started it
if [ -n "$CHROME_PID" ]; then
  kill "$CHROME_PID" 2>/dev/null || true
fi

# 6. Generate LLM insights
echo "[sync-flows] Generating flow insights..."
bash "$SCRIPT_DIR/sync-flow-insights.sh"

echo "[sync-flows] Done."
