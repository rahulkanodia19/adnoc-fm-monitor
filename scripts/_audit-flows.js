#!/usr/bin/env node
/**
 * _audit-flows.js — One-off sanity audit for Russia/India/China flows.
 *
 * Reads flow-summary.json (multi-period nested format from sync-flows.js),
 * summarizes the most recent complete weekly window for Russia crude exports,
 * India crude/LNG imports, and China crude/LNG imports.
 *
 * Output: audit-russia-india-china.md — a markdown report comparing values
 * against typical IEA/EIA public ranges (hardcoded reference bands below).
 * Flags any totals deviating > 20% from the reference band mid-point.
 *
 * This script is READ-ONLY. It produces a report for manual review.
 *
 * Usage: node scripts/_audit-flows.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(PROJECT_DIR, 'flow-summary.json');
const OUT_PATH = path.join(PROJECT_DIR, 'audit-russia-india-china.md');

if (!fs.existsSync(SUMMARY_PATH)) {
  console.error('ERROR: flow-summary.json not found. Run `npm run sync:flows` first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf-8'));

// Reference bands (kbd for crude, ktons/week for LNG) from IEA/EIA/Reuters public data.
// These are APPROXIMATE pre-crisis and mid-crisis (Q1 2026) ranges — intended
// as sanity-check guardrails, not precise targets. Update as new data lands.
const REFERENCE_BANDS = {
  russia_crude: {
    description: 'Russia crude exports (seaborne + ESPO pipeline)',
    dailyAvgRange: [4500, 5500], // kbd
    pipelineContribution: 600,   // ESPO to China
    topBuyers: ['China', 'India', 'Turkey', 'South Korea'],
    notes: 'Post-sanctions mix dominated by Asia. Europe share near zero.',
  },
  india_crude: {
    description: 'India crude imports',
    dailyAvgRange: [4500, 5200],
    topSuppliers: ['Russia', 'Iraq', 'Saudi Arabia', 'UAE', 'US'],
    notes: 'Russia ~35-40% share (crisis-elevated). Gulf share ~40-50% pre-crisis.',
  },
  india_lng: {
    description: 'India LNG imports',
    dailyAvgRange: [40, 80], // ktons/day (roughly ~1.5-2.5 Mt/month)
    topSuppliers: ['Qatar', 'United States', 'UAE', 'Angola'],
    notes: 'Qatar dominates ~50% pre-crisis.',
  },
  china_crude: {
    description: 'China crude imports (seaborne + pipelines: ESPO 600 + Kazakhstan 220 + Myanmar 200 = 1,020 kbd)',
    dailyAvgRange: [10500, 11500],
    pipelineContribution: 1020,
    topSuppliers: ['Russia', 'Saudi Arabia', 'Iraq', 'UAE', 'Oman'],
    notes: 'Hormuz-independent pipelines add ~1,020 kbd floor.',
  },
  china_lng: {
    description: 'China LNG imports',
    dailyAvgRange: [180, 260], // ktons/day (~5.5-8 Mt/month)
    topSuppliers: ['Australia', 'Qatar', 'Russia', 'United States', 'Malaysia'],
    notes: 'Australia + Qatar combined ~60-70%.',
  },
};

function fmt(n) { return n === undefined || n === null ? 'n/a' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function pct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

function summarizeDataset(key) {
  const ds = summary[key];
  if (!ds) return null;
  const recent = ds.periods?.recent?.records || ds.weeks;
  if (!recent || recent.length === 0) return null;
  const last = recent[recent.length - 1];
  // Prefer last complete (second-to-last if last is partial)
  const penultimate = recent.length >= 2 ? recent[recent.length - 2] : null;
  const chosen = (last.days >= 7 || !penultimate) ? last : penultimate;
  const partial = (last.days < 7 && penultimate) ? last : null;
  return { ds, chosen, partial, recent };
}

function classifyDeviation(actual, [low, high]) {
  const mid = (low + high) / 2;
  const dev = (actual - mid) / mid * 100;
  if (actual >= low && actual <= high) return { dev, verdict: 'IN BAND' };
  if (Math.abs(dev) > 20) return { dev, verdict: 'FLAG (>20% deviation)' };
  return { dev, verdict: 'near band' };
}

function renderDatasetSection(key) {
  const band = REFERENCE_BANDS[key];
  const s = summarizeDataset(key);
  if (!s) return `## ${key}\n\n_No data found in flow-summary.json._\n\n`;
  const { ds, chosen, partial } = s;
  const unit = ds.unit || 'kbd';
  const clazz = classifyDeviation(chosen.dailyAvg, band.dailyAvgRange);

  let out = `## ${key} — ${band.description}\n\n`;
  out += `**Reference band:** ${band.dailyAvgRange[0]}–${band.dailyAvgRange[1]} ${unit} (daily avg, expected range)\n`;
  if (band.pipelineContribution) out += `**Pipeline contribution:** ~${band.pipelineContribution} kbd (Hormuz-independent)\n`;
  out += `**Notes:** ${band.notes}\n\n`;

  out += `**Last complete period:** ${chosen.period} (${chosen.start} → ${chosen.end}, ${chosen.days}d)\n\n`;
  out += `| Metric | Value |\n|---|---|\n`;
  out += `| Weekly total | ${fmt(chosen.total)} ${unit} |\n`;
  out += `| Daily average | **${fmt(chosen.dailyAvg)} ${unit}** |\n`;
  out += `| Gulf share | ${fmt(chosen.gulfShare)}% |\n`;
  out += `| Deviation from band mid-point | ${pct(clazz.dev)} → **${clazz.verdict}** |\n\n`;

  out += `**Top 5 counterparties (daily avg):**\n\n`;
  const sorted = Object.entries(chosen.allCountriesDaily || {}).sort((a,b) => b[1] - a[1]).slice(0, 5);
  out += `| Rank | Country | Daily avg | Share |\n|---|---|---|---|\n`;
  sorted.forEach(([name, val], i) => {
    const share = chosen.dailyAvg > 0 ? (val / chosen.dailyAvg * 100) : 0;
    out += `| ${i+1} | ${name} | ${fmt(val)} ${unit} | ${share.toFixed(1)}% |\n`;
  });

  const expectedTop = (band.topBuyers || band.topSuppliers || []);
  if (expectedTop.length) {
    const actualTop = sorted.map(([n]) => n);
    const missing = expectedTop.filter(c => !actualTop.some(a => a.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(a.toLowerCase())));
    if (missing.length) out += `\n> ⚠ Expected top counterparties not in actual top 5: ${missing.join(', ')}\n`;
    else out += `\n> ✓ Top counterparties align with reference expectations.\n`;
  }

  if (partial) {
    out += `\n**In-flight partial period:** ${partial.period} (${partial.start} → ${partial.end}, ${partial.days}d)\n`;
    out += `Daily rate: ${fmt(partial.dailyAvg)} ${unit}\n`;
  }
  out += `\n---\n\n`;
  return out;
}

// ---------- Build report ----------

const now = new Date().toISOString().split('T')[0];
let report = `# Russia / India / China Flow Sanity Audit\n\n`;
report += `**Generated:** ${now}\n`;
report += `**Source:** flow-summary.json (Kpler vessel tracking + pipeline constants)\n\n`;
report += `This report compares the most recent complete weekly window for key Russia/India/China flow datasets `;
report += `against approximate IEA/EIA/Reuters public reference bands. Deviations >20% are flagged for manual review.\n\n`;
report += `---\n\n`;

for (const key of Object.keys(REFERENCE_BANDS)) {
  report += renderDatasetSection(key);
}

report += `## Summary\n\n`;
report += `- Reference bands are approximate; update as new IEA Oil Market Report / EIA STEO / Reuters trader estimates land.\n`;
report += `- Any FLAG verdict requires manual cross-check against a live public source before action.\n`;
report += `- Pipeline contributions (ESPO, Kazakhstan-China, Myanmar-China, Yanbu-SUMED) are fixed constants loaded from \`PIPELINE_STATUS_DATA\` in \`data.js\` — update \`currentThroughput\` there if real-world conditions shift.\n`;

fs.writeFileSync(OUT_PATH, report);
console.log(`Wrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB)`);
console.log(`Review manually, then decide whether any discrepancies warrant downstream fixes.`);
