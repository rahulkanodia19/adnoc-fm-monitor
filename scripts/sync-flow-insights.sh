#!/bin/bash
# ==============================================================
# sync-flow-insights.sh — LLM-generated flow insights (batched)
#
# Runs 4 Claude agent batches, each analyzing ~25 datasets with
# web search + FM context. Merges results into flow-insights.json.
#
# Usage: npm run sync:flow-insights
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[insights] =========================================="
echo "[insights] Flow Insights Generation (4 batches)"
echo "[insights] =========================================="

cd "$PROJECT_DIR"

# Split flow-summary.json into batch files + fm-context.json
echo "[insights] Splitting flow-summary.json into batches..."
if [ -f flow-summary.json ]; then
  node "$SCRIPT_DIR/split-flow-summary.js"
else
  echo "[insights] WARNING: flow-summary.json not found. Run sync:flows first."
  echo "[insights] Checking for existing batch files..."
  if [ ! -f flow-summary-batch1-gulf-exporters.json ]; then
    echo "[insights] ERROR: No batch files found. Cannot generate insights."
    exit 1
  fi
fi

PROMPT=$(cat scripts/sync-flow-insights-prompt.md)
TOOLS="Read,Glob,Grep,Write,WebSearch,WebFetch"

# Batch 1: Gulf exporters
echo "[insights] Batch 1/4: Gulf exporters..."
claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch1-gulf-exporters.json\` for your datasets (Saudi Arabia, UAE, Iraq, Qatar, Kuwait, Bahrain, Iran, Oman exports).
Web searches: Focus on Gulf/Hormuz disruption, Middle East oil/LNG supply.
Write output to \`flow-insights-batch-1.json\`." \
  --allowedTools "$TOOLS" --max-turns 30

# Batch 2: Other exporters
echo "[insights] Batch 2/4: Other exporters..."
claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch2-other-exporters.json\` for your datasets (Russia, US, Australia, EU-27 exports).
Web searches: Focus on Russia sanctions/ESPO, US Gulf Coast exports, Australia LNG.
Write output to \`flow-insights-batch-2.json\`." \
  --allowedTools "$TOOLS" --max-turns 30

# Batch 3: Asia importers
echo "[insights] Batch 3/4: Asia importers..."
claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch3-asia-importers.json\` for your datasets (China, India, Japan, South Korea imports).
Web searches: Focus on Asia crude/LNG demand, Russia pivot, Gulf supply disruption impact.
Write output to \`flow-insights-batch-3.json\`." \
  --allowedTools "$TOOLS" --max-turns 30

# Batch 4: Other importers
echo "[insights] Batch 4/4: Other importers..."
claude -p "$PROMPT

YOUR BATCH: Read \`flow-summary-batch4-other-importers.json\` for your datasets (Thailand, Vietnam, EU-27, US, Taiwan imports).
Web searches: Focus on European energy diversification, Taiwan supply security.
Write output to \`flow-insights-batch-4.json\`." \
  --allowedTools "$TOOLS" --max-turns 30

# Merge all batches + zero-volume insights
echo "[insights] Merging batches..."
node -e "
const fs = require('fs');
const merged = { lastUpdated: new Date().toISOString() };

// Load batch files
for (let i = 1; i <= 4; i++) {
  const file = 'flow-insights-batch-' + i + '.json';
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(merged, data);
    console.log('  Batch ' + i + ':', Object.keys(data).length, 'datasets');
  } catch (e) {
    console.error('  Batch ' + i + ': MISSING or invalid (' + e.message + ')');
  }
}

// Add zero-volume insights
try {
  const zeros = JSON.parse(fs.readFileSync('flow-insights-zeros.json', 'utf8'));
  Object.assign(merged, zeros);
  console.log('  Zeros:', Object.keys(zeros).length, 'datasets');
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
    git -C "$PROJECT_DIR" push
    echo "[insights] Pushed."
  else
    echo "[insights] No changes."
  fi
fi

echo "[insights] Done."
