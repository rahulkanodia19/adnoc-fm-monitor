#!/usr/bin/env node
// ==============================================================
// split-flow-summary.js — Split flow-summary.json into 4 batches
//
// Reads flow-summary.json (created by sync-flows.js), splits it
// into 4 batch files for the flow insights Claude agents, and
// generates fm-context.json from data.js active FM declarations.
//
// Also generates flow-insights-zeros.json for near-zero datasets.
//
// Usage: node scripts/split-flow-summary.js
// ==============================================================

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(PROJECT_DIR, 'flow-summary.json');

if (!fs.existsSync(SUMMARY_PATH)) {
  console.error('[split] ERROR: flow-summary.json not found. Run sync:flows first.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf-8'));
console.log(`[split] Loaded flow-summary.json: ${Object.keys(data).length} datasets`);

// ---------- Batch groupings ----------

const GULF_EXPORTERS = ['saudi_arabia', 'uae', 'iraq', 'qatar', 'kuwait', 'bahrain', 'iran', 'oman'];
const OTHER_EXPORTERS = ['russia', 'us', 'australia', 'eu_27'];
const ASIA_IMPORTERS = ['china', 'india', 'japan', 'south_korea'];
const OTHER_IMPORTERS = ['thailand', 'vietnam', 'eu_27', 'united_states', 'taiwan'];

function matchesBatch(key, dataset, countries, direction) {
  const prefix = key.split('_').slice(0, -1).join('_'); // e.g., "saudi_arabia" from "saudi_arabia_crude"
  const isDirection = dataset.direction === direction;
  return isDirection && countries.some(c => prefix === c || prefix.startsWith(c));
}

// Three analysis windows per batch — frontend maps view/timeRange to one.
const PERIODS = ['recent', 'quarterly', 'yearly'];
const BATCH_NAMES = ['gulf-exporters', 'other-exporters', 'asia-importers', 'other-importers'];
function batchFilename(batchNum, period) {
  return `flow-summary-batch${batchNum}-${BATCH_NAMES[batchNum-1]}-${period}.json`;
}

const batches = {};
for (let b = 1; b <= 4; b++) {
  for (const period of PERIODS) {
    batches[batchFilename(b, period)] = {};
  }
}

const zeros = {};

// Figure out which batch (1-4) a dataset belongs to
function pickBatchNum(key, dataset) {
  if (matchesBatch(key, dataset, GULF_EXPORTERS, 'export')) return 1;
  if (matchesBatch(key, dataset, OTHER_EXPORTERS, 'export')) return 2;
  if (matchesBatch(key, dataset, ASIA_IMPORTERS, 'import')) return 3;
  if (matchesBatch(key, dataset, OTHER_IMPORTERS, 'import')) return 4;
  return dataset.direction === 'export' ? 2 : 4;
}

for (const [key, dataset] of Object.entries(data)) {
  // Near-zero check uses recent (4-week) records
  const recentRecords = dataset.periods?.recent?.records || [];
  const allNearZero = recentRecords.length > 0 && recentRecords.every(r => Math.abs(r.total || 0) < 100);

  if (allNearZero) {
    const msg = `Negligible ${dataset.commodity} ${dataset.direction}s — typically < 100 ${dataset.unit || 'units'}/week for ${dataset.country}.`;
    // Same insight across all 3 buckets (no LLM call needed)
    zeros[key] = { recent: [msg], quarterly: [msg], yearly: [msg] };
    continue;
  }

  const batchNum = pickBatchNum(key, dataset);
  for (const period of PERIODS) {
    // Per-period dataset: flatten {direction, country, ..., period, records[]}
    batches[batchFilename(batchNum, period)][key] = {
      direction: dataset.direction,
      country: dataset.country,
      commodity: dataset.commodity,
      unit: dataset.unit,
      hasPipeline: dataset.hasPipeline,
      pipelineNote: dataset.pipelineNote,
      period,
      granularity: dataset.periods[period].granularity,
      records: dataset.periods[period].records,
    };
  }
}

// Write batch files
for (const [filename, batchData] of Object.entries(batches)) {
  const outPath = path.join(PROJECT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(batchData, null, 2));
  console.log(`[split]   ${filename}: ${Object.keys(batchData).length} datasets`);
}

// Write zeros file
const zerosPath = path.join(PROJECT_DIR, 'flow-insights-zeros.json');
fs.writeFileSync(zerosPath, JSON.stringify(zeros, null, 2));
console.log(`[split]   flow-insights-zeros.json: ${Object.keys(zeros).length} low-volume datasets`);

// ---------- Generate fm-context.json from data.js ----------

console.log('[split] Generating fm-context.json...');

const dataJsPath = path.join(PROJECT_DIR, 'data.js');
const dataCode = fs.readFileSync(dataJsPath, 'utf-8');

try {
  const wrapped = `(function() { ${dataCode}; return { FM_DECLARATIONS_DATA }; })()`;
  const { FM_DECLARATIONS_DATA } = eval(wrapped);

  const activeFMs = FM_DECLARATIONS_DATA.filter(fm =>
    fm.status === 'active' || fm.status === 'extended' || fm.status === 'partially_lifted'
  );

  const fmByCountry = {};
  for (const fm of activeFMs) {
    const country = (fm.country || '').toLowerCase().replace(/\s+/g, '_');
    if (!fmByCountry[country]) fmByCountry[country] = [];
    fmByCountry[country].push({
      company: fm.company,
      status: fm.status,
      date: fm.date,
      summary: fm.summary,
      volumeAffected: fm.details?.volumeAffected || null,
      commodity: fm.details?.commodity || null,
    });
  }

  const fmContextPath = path.join(PROJECT_DIR, 'fm-context.json');
  fs.writeFileSync(fmContextPath, JSON.stringify(fmByCountry, null, 2));
  console.log(`[split]   fm-context.json: ${Object.keys(fmByCountry).length} countries with active FMs`);
} catch (e) {
  console.error(`[split] WARNING: Could not generate fm-context.json: ${e.message}`);
}

console.log('[split] Done.');
