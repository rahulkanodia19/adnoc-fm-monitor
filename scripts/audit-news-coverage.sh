#!/bin/bash
# ==============================================================
# audit-news-coverage.sh — One-time Gulf news coverage audit
#
# Reads current data.js, then searches the web for Gulf energy
# headlines from the last 48 hours. For each story NOT reflected
# in data.js, records a structured gap + suggested fix.
#
# Output: coverage-gaps.json
# Does NOT modify data.js, does NOT commit/push.
#
# Usage: npm run audit:coverage
#   or:  bash scripts/audit-news-coverage.sh
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[audit] =========================================="
echo "[audit] Gulf Energy News Coverage Audit"
echo "[audit] =========================================="

cd "$PROJECT_DIR"

TOOLS="Read,WebSearch,WebFetch,Glob,Grep,Write"

echo "[audit] Running Claude agent to audit recent headline coverage..."
cat scripts/audit-prompt.md | claude -p - \
  --allowedTools "$TOOLS" \
  --max-turns 30

if [ -f "coverage-gaps.json" ]; then
  GAP_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('coverage-gaps.json'));console.log((d.gaps||[]).length)" 2>/dev/null || echo "?")
  echo ""
  echo "[audit] ────────────────────────────────────────"
  echo "[audit] Coverage audit complete."
  echo "[audit] Gaps detected: $GAP_COUNT"
  echo "[audit] Review: coverage-gaps.json"
  echo "[audit] No changes were written to data.js or committed."
else
  echo "[audit] WARNING: coverage-gaps.json not produced."
  exit 1
fi
