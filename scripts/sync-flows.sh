#!/bin/bash
# ==============================================================
# sync-flows.sh — Automated flow data download from Kpler + pipeline
#
# Downloads 48 xlsx files from Kpler Terminal via Chrome MCP,
# then runs generate-data.py and add-pipeline-data.js to produce
# import-data.js and export-data.js.
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

# 1. Start Chrome if not running
CHROME_PID=""
if ! curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
  echo "[sync-flows] Starting Chrome with remote debugging on port $DEBUG_PORT..."
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
  else
    echo "[sync-flows] ERROR: Chrome not found. Set CHROME_PATH env var."
    exit 1
  fi
  echo "[sync-flows] Waiting for Chrome to start..."
  for i in $(seq 1 15); do
    if curl -s "http://127.0.0.1:$DEBUG_PORT/json/version" > /dev/null 2>&1; then
      echo "[sync-flows] Chrome ready."
      break
    fi
    sleep 1
  done
else
  echo "[sync-flows] Chrome already running on port $DEBUG_PORT"
fi

# 2. Run Claude agent to download all xlsx files from Kpler
echo "[sync-flows] Downloading flow data from Kpler..."
cd "$PROJECT_DIR"

claude -p "$(cat scripts/sync-flows-prompt.md)" \
  --allowedTools "Read,Write,Glob,Grep,Bash(ls*),Bash(mv*),Bash(cp*),Bash(rm*),Bash(sleep*),Bash(python*),Bash(node*),mcp__chrome-devtools*" \
  --max-turns 80

echo "[sync-flows] Downloads complete."

# 2b. Validate download count before running pipeline
IMPORT_COUNT=$(ls "$PROJECT_DIR"/import-flows/*.xlsx 2>/dev/null | wc -l)
EXPORT_COUNT=$(ls "$PROJECT_DIR"/export-flows/*.xlsx 2>/dev/null | wc -l)
echo "[sync-flows] Found $IMPORT_COUNT import files, $EXPORT_COUNT export files"
if [ "$IMPORT_COUNT" -lt 15 ] || [ "$EXPORT_COUNT" -lt 25 ]; then
  echo "[sync-flows] ERROR: Too few xlsx files ($IMPORT_COUNT imports, $EXPORT_COUNT exports). Aborting pipeline to protect existing data."
  exit 1
fi

# 3. Run data generation pipeline
echo "[sync-flows] Running generate-data.py..."
python "$SCRIPT_DIR/generate-data.py"

echo "[sync-flows] Running add-pipeline-data.js..."
node "$SCRIPT_DIR/add-pipeline-data.js"

# 4. Validate output
echo "[sync-flows] Validating output..."
node -e "
const fs = require('fs');
try {
  const imp = fs.readFileSync('import-data.js', 'utf8');
  const exp = fs.readFileSync('export-data.js', 'utf8');
  const impMatch = imp.match(/IMPORT_FLOW_DATA/);
  const expMatch = exp.match(/EXPORT_FLOW_DATA/);
  if (!impMatch) { console.error('FAIL: IMPORT_FLOW_DATA not found'); process.exit(1); }
  if (!expMatch) { console.error('FAIL: EXPORT_FLOW_DATA not found'); process.exit(1); }
  console.log('import-data.js:', (imp.length / 1024 / 1024).toFixed(1), 'MB');
  console.log('export-data.js:', (exp.length / 1024 / 1024).toFixed(1), 'MB');
  console.log('Validation PASSED');
} catch (e) {
  console.error('Validation FAILED:', e.message);
  process.exit(1);
}
"

# 5. Commit and push if data changed
echo "[sync-flows] Checking for changes..."
if ! git -C "$PROJECT_DIR" diff --quiet import-data.js export-data.js 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add import-data.js export-data.js
  git -C "$PROJECT_DIR" commit -m "chore: flow data sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync-flows] Pushed to GitHub successfully."
else
  echo "[sync-flows] No flow data changes detected."
fi

# 6. Close Chrome if we started it
if [ -n "$CHROME_PID" ]; then
  echo "[sync-flows] Closing Chrome (PID: $CHROME_PID)..."
  kill "$CHROME_PID" 2>/dev/null || true
fi

echo "[sync-flows] Done."
