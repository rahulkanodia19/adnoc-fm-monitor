#!/bin/bash
# ==============================================================
# sync-flow-insights.sh — LLM-generated flow insights (12 batches)
#
# Runs 3 periods × 4 batch-groups = 12 Claude agent runs.
# Each analyzes ~25 datasets with web search + FM context.
# Merges results into nested flow-insights.json (bucket keys:
# recent, quarterly, yearly).
#
# Usage: npm run sync:flow-insights
# Optional: PERIODS="recent"  # restrict to single period for testing
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Shared preflight helpers
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

PERIODS="${PERIODS:-recent quarterly yearly}"

echo "[insights] =========================================="
echo "[insights] Flow Insights Generation (periods: $PERIODS)"
echo "[insights] =========================================="

cd "$PROJECT_DIR"

# --- Standalone preflight (skipped when orchestrated by master-sync) ---
# Upstream files (flows output) — WARN only: insights can still run on
# stale flow data if needed. Real check is flow-summary.json below.
if [ -z "$MASTER_SYNC" ]; then
  echo "[insights] Running preflight checks..."
  check_data_file "import-data.js" 100000 "import-data.js"
  check_data_file "export-data.js" 100000 "export-data.js"
  check_file_exists "flow-summary.json" "flow-summary.json"
  print_preflight_summary
  # Non-critical: fallback to existing batch files if flow-summary.json missing
fi

# Split flow-summary.json into batch files + fm-context.json
echo "[insights] Splitting flow-summary.json into batches..."
if [ -f flow-summary.json ]; then
  node "$SCRIPT_DIR/split-flow-summary.js"
else
  echo "[insights] WARNING: flow-summary.json not found. Run sync:flows first."
  echo "[insights] Checking for existing batch files..."
  if [ ! -f flow-summary-batch1-gulf-exporters-recent.json ]; then
    echo "[insights] ERROR: No batch files found. Cannot generate insights."
    exit 1
  fi
fi

PROMPT=$(cat scripts/sync-flow-insights-prompt.md)
TOOLS="Read,Glob,Grep,Write,WebSearch,WebFetch"

declare -A BATCH_NAMES=(
  [1]="gulf-exporters"
  [2]="other-exporters"
  [3]="asia-importers"
  [4]="other-importers"
)
declare -A BATCH_FOCUS=(
  [1]="Gulf/Hormuz disruption, Middle East oil/LNG supply"
  [2]="Russia sanctions/ESPO, US Gulf Coast exports, Australia LNG"
  [3]="Asia crude/LNG demand, Russia pivot, Gulf supply disruption impact"
  [4]="European energy diversification, Taiwan supply security"
)

# Run 4 batches in parallel per period, barrier between periods.
for PERIOD in $PERIODS; do
  echo "[insights] ========== PERIOD: $PERIOD =========="
  for BATCH in 1 2 3 4; do
    NAME="${BATCH_NAMES[$BATCH]}"
    FOCUS="${BATCH_FOCUS[$BATCH]}"
    INFILE="flow-summary-batch${BATCH}-${NAME}-${PERIOD}.json"
    OUTFILE="flow-insights-batch-${BATCH}-${PERIOD}.json"
    if [ ! -f "$INFILE" ]; then
      echo "[insights]   skip batch $BATCH/$PERIOD — $INFILE missing"
      continue
    fi
    echo "[insights]   batch $BATCH/$PERIOD: $NAME → $OUTFILE"
    NODE_OPTIONS="--max-old-space-size=4096" claude -p "$PROMPT

YOUR BATCH: Read \`$INFILE\` for your datasets.
ANALYSIS WINDOW: $PERIOD (recent = last 4 weeks; quarterly = last 13 weeks; yearly = last 12 months).
Web searches: Focus on $FOCUS.
Write output to \`$OUTFILE\`." \
      --allowedTools "$TOOLS" --max-turns 30 &
  done
  # Wait for all 4 parallel batches in this period to finish before next period
  wait
  echo "[insights]   period $PERIOD complete."
done

# Merge all period × batch outputs into nested flow-insights.json
echo "[insights] Merging batches..."
node -e "
const fs = require('fs');
const merged = { lastUpdated: new Date().toISOString() };
const PERIODS = '${PERIODS}'.split(/\s+/).filter(Boolean);

// Preserve existing buckets (allows partial-period regeneration)
let existing = {};
try { existing = JSON.parse(fs.readFileSync('flow-insights.json','utf8')); } catch {}
for (const [key, val] of Object.entries(existing)) {
  if (key === 'lastUpdated') continue;
  // Migrate legacy flat arrays to {recent: [...]}
  if (Array.isArray(val)) merged[key] = { recent: val };
  else merged[key] = { ...val };
}

for (const period of PERIODS) {
  for (let b = 1; b <= 4; b++) {
    const file = 'flow-insights-batch-' + b + '-' + period + '.json';
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [key, bullets] of Object.entries(data)) {
        if (!merged[key]) merged[key] = {};
        merged[key][period] = bullets;
      }
      console.log('  batch ' + b + '/' + period + ':', Object.keys(data).length, 'datasets');
    } catch (e) {
      console.error('  batch ' + b + '/' + period + ': MISSING or invalid (' + e.message + ')');
    }
  }
}

// Add zero-volume insights (already nested from split-flow-summary.js)
try {
  const zeros = JSON.parse(fs.readFileSync('flow-insights-zeros.json', 'utf8'));
  for (const [key, buckets] of Object.entries(zeros)) {
    merged[key] = { ...(merged[key] || {}), ...buckets };
  }
  console.log('  zeros:', Object.keys(zeros).length, 'datasets');
} catch {}

fs.writeFileSync('flow-insights.json', JSON.stringify(merged, null, 2));
const keys = Object.keys(merged).filter(k => k !== 'lastUpdated');
console.log('  Total:', keys.length, 'datasets in flow-insights.json');
"

# Cleanup batch files
rm -f flow-insights-batch-*.json flow-summary-batch*.json flow-insights-zeros.json fm-context.json

# Validate
KEY_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('flow-insights.json','utf8'));console.log(Object.keys(d).filter(k=>k!=='lastUpdated').length)")
echo "[insights] Final: $KEY_COUNT datasets."

if [ "$KEY_COUNT" -lt 50 ]; then
  echo "[insights] WARNING: Low key count ($KEY_COUNT). Some batches may have failed."
fi

# Commit (only when run standalone)
if [ -z "$MASTER_SYNC" ]; then
  if ! git -C "$PROJECT_DIR" diff --quiet flow-insights.json 2>/dev/null; then
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
    git -C "$PROJECT_DIR" add flow-insights.json
    git -C "$PROJECT_DIR" commit -m "chore: flow insights sync ($TIMESTAMP)"
    git -C "$PROJECT_DIR" push origin master && echo "[insights] Pushed to origin/master" || echo "[insights] ⚠ Push to master failed"
    git -C "$PROJECT_DIR" push origin master:main && echo "[insights] Pushed to origin/main" || echo "[insights] ⚠ Push to main failed"
  else
    echo "[insights] No changes."
  fi
fi

echo "[insights] Done."
