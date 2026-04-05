#!/bin/bash
# ==============================================================
# sync-prices.sh — Market Prices full sync pipeline
#
# Step 0: Fetch Murban front-month (Investing.com / IFAD continuation)
# Step 1: Fetch Platts commodity prices (Okta PKCE)
# Step 2: Update WAR_RISK_PREMIUM_DATA in data.js (Claude web search)
#
# Usage: npm run sync:prices
#   or:  bash scripts/sync-prices.sh
#
# Env vars:
#   SKIP_AWRP=1   — skip war risk premium step (used by master-sync
#                    to run Platts fetch in parallel, AWRP later)
#   MASTER_SYNC=1 — skip git commit/push (master-sync handles it)
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-prices] =========================================="
echo "[sync-prices] ADNOC FM Monitor — Market Prices Sync"
echo "[sync-prices] =========================================="

cd "$PROJECT_DIR"

# ---- Step 0: Murban Front-Month (Investing.com / IFAD continuation) ----
echo "[sync-prices] [1/4] Fetching Murban front-month from Investing.com..."
node "$SCRIPT_DIR/scrape-murban-investing.js"

# ---- Step 1: Platts Commodity Prices ----
echo "[sync-prices] [2/4] Fetching Platts prices..."
node "$SCRIPT_DIR/fetch-platts-prices.js"

# Validate market-prices-seed.json
SYMBOL_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('market-prices-seed.json'));console.log(Object.keys(d.prices||{}).length)")
if [ "$SYMBOL_COUNT" -lt 10 ]; then
  echo "[sync-prices] WARNING: Only $SYMBOL_COUNT symbols (expected 13)"
fi
echo "[sync-prices] [2/4] Platts prices: $SYMBOL_COUNT symbols OK"

# ---- Step 2: War Risk Premium (AWRP % hull value) ----
if [ "$SKIP_AWRP" = "1" ]; then
  echo "[sync-prices] [3/4] AWRP skipped (SKIP_AWRP=1)"
else
  echo "[sync-prices] [3/4] Updating war risk premium data..."

  NODE_OPTIONS="--max-old-space-size=4096" claude -p "$(cat "$SCRIPT_DIR/sync-prices-awrp-prompt.md")" \
    --allowedTools "Edit,Read,WebSearch,WebFetch,Glob,Grep" \
    --max-turns 20

  echo "[sync-prices] [3/4] AWRP agent complete"

  # Validate WAR_RISK_PREMIUM_DATA still parses
  node -e "
    const code = require('fs').readFileSync('data.js','utf8');
    const match = code.match(/WAR_RISK_PREMIUM_DATA[\s\S]*?lastUpdated:\s*\"([^\"]+)\"/);
    if (!match) { console.error('WAR_RISK_PREMIUM_DATA.lastUpdated not found'); process.exit(1); }
    console.log('  AWRP lastUpdated: ' + match[1]);
    const wrapped = '(function(){' + code + '})';
    new Function(wrapped);
    console.log('  data.js syntax: OK');
  "
fi

# ---- Step 3: Market Insights (LLM) ----
if [ "$SKIP_INSIGHTS" = "1" ] || [ "$MASTER_SYNC" = "1" ]; then
  echo "[sync-prices] [4/4] Market insights skipped (SKIP_INSIGHTS or MASTER_SYNC set)"
else
  echo "[sync-prices] [4/4] Generating market insights..."
  NODE_OPTIONS="--max-old-space-size=4096" claude -p "$(cat "$SCRIPT_DIR/sync-market-insights-prompt.md")" \
    --allowedTools "Read,Write" \
    --max-turns 12
  # Validate output parses as JSON
  if [ -f market-insights.json ]; then
    node -e "JSON.parse(require('fs').readFileSync('market-insights.json','utf8')); console.log('  market-insights.json: OK')" \
      || echo "[sync-prices] WARNING: market-insights.json failed JSON parse"
  else
    echo "[sync-prices] WARNING: market-insights.json not created"
  fi
fi

# ---- Commit + Push (standalone only) ----
if [ -z "$MASTER_SYNC" ]; then
  echo "[sync-prices] Checking for changes..."
  FILES="market-prices-seed.json data.js murban-history.json market-insights.json"
  if ! git -C "$PROJECT_DIR" diff --quiet $FILES 2>/dev/null; then
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
    git -C "$PROJECT_DIR" add $FILES
    git -C "$PROJECT_DIR" commit -m "chore: market prices sync ($TIMESTAMP)"
    git -C "$PROJECT_DIR" push origin master && echo "[sync-prices] Pushed to origin/master" || echo "[sync-prices] Push to master failed"
    git -C "$PROJECT_DIR" push origin master:main && echo "[sync-prices] Pushed to origin/main" || echo "[sync-prices] Push to main failed"
  else
    echo "[sync-prices] No changes detected."
  fi
fi

echo "[sync-prices] Done."
