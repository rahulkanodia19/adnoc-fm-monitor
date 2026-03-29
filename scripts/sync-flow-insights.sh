#!/bin/bash
# ==============================================================
# sync-flow-insights.sh — LLM-generated flow insights
#
# Runs a Claude agent that reads flow data + geopolitical context
# and writes natural-language insights per dataset to
# flow-insights.json.
#
# Usage: npm run sync:flow-insights
#   or:  bash scripts/sync-flow-insights.sh
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[sync-flow-insights] =========================================="
echo "[sync-flow-insights] Flow Insights Generation (LLM)"
echo "[sync-flow-insights] =========================================="

cd "$PROJECT_DIR"

claude -p "$(cat scripts/sync-flow-insights-prompt.md)" \
  --allowedTools "Read,Glob,Grep,Write,WebSearch,WebFetch" \
  --max-turns 50

echo "[sync-flow-insights] Insights generated."

# Validate
if [ ! -f flow-insights.json ] || [ ! -s flow-insights.json ]; then
  echo "[sync-flow-insights] ERROR: flow-insights.json not found or empty."
  exit 1
fi

# Check key count
KEY_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('flow-insights.json','utf8'));console.log(Object.keys(d).filter(k=>k!=='lastUpdated').length)")
echo "[sync-flow-insights] Insights for $KEY_COUNT datasets."

# Commit if changed
if ! git -C "$PROJECT_DIR" diff --quiet flow-insights.json 2>/dev/null; then
  TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
  git -C "$PROJECT_DIR" add flow-insights.json
  git -C "$PROJECT_DIR" commit -m "chore: flow insights sync ($TIMESTAMP)"
  git -C "$PROJECT_DIR" push
  echo "[sync-flow-insights] Pushed."
else
  echo "[sync-flow-insights] No changes."
fi

echo "[sync-flow-insights] Done."
