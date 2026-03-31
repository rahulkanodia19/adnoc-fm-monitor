#!/usr/bin/env node
// ==============================================================
// verify-sync.js — Data freshness + integrity verifier
//
// Checks all 7 pipelines for freshness and basic integrity.
// Writes sync-status.json (used by the UI for per-tab badges).
//
// Usage: node scripts/verify-sync.js
//   or:  npm run verify
// ==============================================================

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const NOW = Date.now();

const status = {
  timestamp: new Date(NOW).toISOString(),
  overall: 'ok',
  pipelines: {},
};

function hoursAgo(isoStr) {
  if (!isoStr) return Infinity;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return Infinity;
  return (NOW - d.getTime()) / 3600000;
}

function formatDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  // Include time in GST (UTC+4) for leadership visibility
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai'
  }) + ' GST';
}

function freshness(hours, okThresh, staleThresh) {
  if (hours <= okThresh) return 'ok';
  if (hours <= staleThresh) return 'stale';
  return 'failed';
}

function fileExists(rel) {
  return fs.existsSync(path.join(PROJECT_DIR, rel));
}

function readFile(rel) {
  const p = path.join(PROJECT_DIR, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

function fileSizeMB(rel) {
  const p = path.join(PROJECT_DIR, rel);
  if (!fs.existsSync(p)) return 0;
  return fs.statSync(p).size / (1024 * 1024);
}

// ---------- Pipeline 1: News/FM/Production ----------

function checkNewsFM() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const code = readFile('data.js');
  if (!code) {
    pipeline.details = 'data.js not found';
    return pipeline;
  }

  // Extract LAST_UPDATED
  const luMatch = code.match(/LAST_UPDATED\s*=\s*"([^"]+)"/);
  if (!luMatch) {
    pipeline.details = 'LAST_UPDATED not found in data.js';
    return pipeline;
  }

  const lastUpdated = luMatch[1];
  pipeline.lastUpdated = lastUpdated;
  pipeline.dataAsOf = formatDate(lastUpdated);

  const hours = hoursAgo(lastUpdated);
  pipeline.status = freshness(hours, 26, 72);

  // Count countries
  const countryMatches = code.match(/id:\s*["'](\w+)["']/g);
  const expectedCountries = ['qatar', 'kuwait', 'saudi_arabia', 'uae', 'iraq', 'bahrain', 'oman', 'israel', 'iran'];
  const foundCountries = expectedCountries.filter(c =>
    countryMatches && countryMatches.some(m => m.includes(c))
  );

  // Count FM declarations (IDs like "fm-001", "fm-024")
  const fmCount = (code.match(/id:\s*"fm-\d+"/g) || []).length;

  // Count shutdowns (IDs like "sd-001", "sd-024")
  const sdCount = (code.match(/id:\s*"sd-\d+"/g) || []).length;

  pipeline.details = `${foundCountries.length}/9 countries, ${fmCount} FMs, ${sdCount} shutdowns`;

  if (foundCountries.length < 9) {
    pipeline.status = 'failed';
    pipeline.details += ` — MISSING: ${expectedCountries.filter(c => !foundCountries.includes(c)).join(', ')}`;
  }

  return pipeline;
}

// ---------- Pipeline 2: Platts Prices ----------

function checkPrices() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const raw = readFile('market-prices-seed.json');
  if (!raw) {
    pipeline.details = 'market-prices-seed.json not found';
    return pipeline;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    pipeline.details = 'market-prices-seed.json invalid JSON';
    return pipeline;
  }

  // Find the lastUpdated field
  if (data.lastUpdated) {
    pipeline.lastUpdated = data.lastUpdated;
    pipeline.dataAsOf = formatDate(data.lastUpdated);
  }

  // Prices is an object keyed by symbol name (e.g., { wti: { history: [...] }, brent: { ... } })
  let latestDate = null;
  const symbols = new Set();

  if (data.prices && typeof data.prices === 'object' && !Array.isArray(data.prices)) {
    for (const [sym, info] of Object.entries(data.prices)) {
      symbols.add(sym);
      if (info.history && Array.isArray(info.history)) {
        for (const d of info.history) {
          if (d.date && (!latestDate || d.date > latestDate)) {
            latestDate = d.date;
          }
        }
      }
    }
  }

  if (latestDate) {
    pipeline.dataAsOf = formatDate(latestDate);
    pipeline.lastUpdated = pipeline.lastUpdated || latestDate;
    const hours = hoursAgo(latestDate);
    pipeline.status = freshness(hours, 72, 168); // 3 days ok, 7 days stale
  } else if (data.lastUpdated) {
    // Use lastUpdated from the file header
    const hours = hoursAgo(data.lastUpdated);
    pipeline.status = freshness(hours, 72, 168);
  }

  pipeline.details = `${symbols.size} symbols${latestDate ? ', latest ' + formatDate(latestDate) : ''}`;

  return pipeline;
}

// ---------- Pipeline 2b: War Risk Premium (Hull %) ----------

function checkWarRiskPremium() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const code = readFile('data.js');
  if (!code) {
    pipeline.details = 'data.js not found';
    return pipeline;
  }

  // Extract WAR_RISK_PREMIUM_DATA.lastUpdated
  const luMatch = code.match(/WAR_RISK_PREMIUM_DATA[\s\S]*?lastUpdated:\s*"([^"]+)"/);
  if (!luMatch) {
    pipeline.details = 'WAR_RISK_PREMIUM_DATA.lastUpdated not found';
    return pipeline;
  }

  const lastUpdated = luMatch[1];
  pipeline.lastUpdated = lastUpdated;
  pipeline.dataAsOf = formatDate(lastUpdated);

  const hours = hoursAgo(lastUpdated);
  pipeline.status = freshness(hours, 26, 72);

  // Count history entries
  const histCount = (code.match(/{ date: "20\d{2}-\d{2}-\d{2}", rate:/g) || []).length;

  // Extract current rate
  const rateMatch = code.match(/WAR_RISK_PREMIUM_DATA[\s\S]*?current:\s*\{[\s\S]*?rate:\s*([\d.]+)/);
  const currentRate = rateMatch ? rateMatch[1] + '%' : '?';

  pipeline.details = `${histCount} data points, current ${currentRate} hull value`;

  return pipeline;
}

// ---------- Pipeline 3: SPR Releases ----------

function checkSPR() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const code = readFile('data.js');
  if (!code) {
    pipeline.details = 'data.js not found';
    return pipeline;
  }

  // Extract SPR asOf
  const asOfMatch = code.match(/asOf:\s*"([^"]+)"/);
  if (!asOfMatch) {
    pipeline.details = 'SPR_RELEASE_DATA.asOf not found';
    return pipeline;
  }

  const asOf = asOfMatch[1];
  pipeline.lastUpdated = asOf;
  pipeline.dataAsOf = formatDate(asOf);

  const hours = hoursAgo(asOf);
  pipeline.status = freshness(hours, 48, 168); // 2 days ok, 7 days stale

  // Extract totalReleased
  const relMatch = code.match(/totalReleased:\s*([\d.]+)/);
  const released = relMatch ? relMatch[1] : '?';

  // Count countries in SPR data
  const countriesMatch = code.match(/countries:\s*\[/);
  let countryCount = 0;
  if (countriesMatch) {
    // Count objects in the countries array (rough: count "country:" occurrences after SPR_RELEASE_DATA)
    const sprSection = code.substring(code.indexOf('SPR_RELEASE_DATA'));
    countryCount = (sprSection.match(/country:\s*"/g) || []).length;
  }

  pipeline.details = `${countryCount} countries, ${released} mb released`;

  return pipeline;
}

// ---------- Pipeline 4: SOH Vessels ----------

function checkSOH() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const raw = readFile('soh-data/summary.json');
  if (!raw) {
    pipeline.details = 'soh-data/summary.json not found';
    return pipeline;
  }

  let summary;
  try {
    summary = JSON.parse(raw);
  } catch (e) {
    pipeline.details = 'summary.json invalid JSON';
    return pipeline;
  }

  pipeline.lastUpdated = summary.syncTimestamp;
  pipeline.dataAsOf = formatDate(summary.syncTimestamp);

  const hours = hoursAgo(summary.syncTimestamp);
  pipeline.status = freshness(hours, 26, 72);

  const total = summary.totalVessels || (summary.insideTotal || 0) + (summary.outsideTotal || 0);

  if (total < 500) {
    pipeline.status = 'failed';
    pipeline.details = `Only ${total} vessels (expected 500+)`;
    return pipeline;
  }

  // Check supporting files exist
  const requiredFiles = ['vessels.json', 'vessel-matrix.json', 'map-positions.json', 'adnoc-vessels.json'];
  const missingFiles = requiredFiles.filter(f => !fileExists(`soh-data/${f}`));

  if (missingFiles.length > 0) {
    pipeline.details = `${total} vessels, MISSING: ${missingFiles.join(', ')}`;
    if (pipeline.status === 'ok') pipeline.status = 'stale';
  } else {
    pipeline.details = `${total} vessels, ${summary.insideTotal || '?'} inside, ${summary.adnocCount || '?'} ADNOC`;
  }

  return pipeline;
}

// ---------- Pipeline 5: Import Flows ----------

function checkImportFlows() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const sizeMB = fileSizeMB('import-data.js');
  if (sizeMB === 0) {
    pipeline.details = 'import-data.js not found';
    return pipeline;
  }

  if (sizeMB < 1) {
    pipeline.details = `import-data.js only ${sizeMB.toFixed(1)} MB (expected > 1 MB)`;
    return pipeline;
  }

  // Read first few KB to check variable name and extract a date
  const head = readFile('import-data.js');
  if (!head || !head.includes('IMPORT_FLOW_DATA')) {
    pipeline.details = 'IMPORT_FLOW_DATA not found in file';
    return pipeline;
  }

  // Try to find the latest date in the data (look for 'e' fields which are end dates)
  const dateMatches = head.match(/"e":"(\d{4}-\d{2}-\d{2})"/g);
  let latestDate = null;
  if (dateMatches) {
    for (const m of dateMatches) {
      const d = m.match(/"e":"(\d{4}-\d{2}-\d{2})"/)[1];
      if (!latestDate || d > latestDate) latestDate = d;
    }
  }

  if (latestDate) {
    pipeline.lastUpdated = latestDate;
    pipeline.dataAsOf = formatDate(latestDate);
    const hours = hoursAgo(latestDate);
    pipeline.status = freshness(hours, 168, 336); // 7 days ok, 14 days stale
  } else {
    // Can't extract date, check file modification time
    const mtime = fs.statSync(path.join(PROJECT_DIR, 'import-data.js')).mtime;
    pipeline.lastUpdated = mtime.toISOString();
    pipeline.dataAsOf = formatDate(mtime.toISOString());
    pipeline.status = freshness(hoursAgo(mtime.toISOString()), 168, 336);
  }

  // Count datasets (rough: count keys that look like "country_commodity":)
  const keyMatches = head.match(/"[a-z_]+_(crude|lng|lpg|kero_jet|gasoil_diesel|gasoline|naphtha|sulphur)":/g);
  const datasetCount = keyMatches ? new Set(keyMatches).size : 0;

  pipeline.details = `${datasetCount} datasets, ${sizeMB.toFixed(1)} MB`;

  return pipeline;
}

// ---------- Pipeline 6: Export Flows ----------

function checkExportFlows() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const sizeMB = fileSizeMB('export-data.js');
  if (sizeMB === 0) {
    pipeline.details = 'export-data.js not found';
    return pipeline;
  }

  if (sizeMB < 1) {
    pipeline.details = `export-data.js only ${sizeMB.toFixed(1)} MB (expected > 1 MB)`;
    return pipeline;
  }

  const head = readFile('export-data.js');
  if (!head || !head.includes('EXPORT_FLOW_DATA')) {
    pipeline.details = 'EXPORT_FLOW_DATA not found in file';
    return pipeline;
  }

  const dateMatches = head.match(/"e":"(\d{4}-\d{2}-\d{2})"/g);
  let latestDate = null;
  if (dateMatches) {
    for (const m of dateMatches) {
      const d = m.match(/"e":"(\d{4}-\d{2}-\d{2})"/)[1];
      if (!latestDate || d > latestDate) latestDate = d;
    }
  }

  if (latestDate) {
    pipeline.lastUpdated = latestDate;
    pipeline.dataAsOf = formatDate(latestDate);
    const hours = hoursAgo(latestDate);
    pipeline.status = freshness(hours, 168, 336);
  } else {
    const mtime = fs.statSync(path.join(PROJECT_DIR, 'export-data.js')).mtime;
    pipeline.lastUpdated = mtime.toISOString();
    pipeline.dataAsOf = formatDate(mtime.toISOString());
    pipeline.status = freshness(hoursAgo(mtime.toISOString()), 168, 336);
  }

  const keyMatches = head.match(/"[a-z_]+_(crude|lng|lpg|kero_jet|gasoil_diesel|gasoline|naphtha|sulphur)":/g);
  const datasetCount = keyMatches ? new Set(keyMatches).size : 0;

  pipeline.details = `${datasetCount} datasets, ${sizeMB.toFixed(1)} MB`;

  return pipeline;
}

// ---------- Pipeline 7: Flow Insights ----------

function checkFlowInsights() {
  const pipeline = { status: 'failed', dataAsOf: null, lastUpdated: null, details: '' };

  const raw = readFile('flow-insights.json');
  if (!raw) {
    pipeline.details = 'flow-insights.json not found';
    return pipeline;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    pipeline.details = 'flow-insights.json invalid JSON';
    return pipeline;
  }

  if (data.lastUpdated) {
    pipeline.lastUpdated = data.lastUpdated;
    pipeline.dataAsOf = formatDate(data.lastUpdated);
    const hours = hoursAgo(data.lastUpdated);
    pipeline.status = freshness(hours, 48, 168);
  }

  const keys = Object.keys(data).filter(k => k !== 'lastUpdated');
  pipeline.details = `${keys.length} datasets`;

  if (keys.length < 50) {
    pipeline.status = 'failed';
    pipeline.details += ' (expected 50+)';
  }

  return pipeline;
}

// ---------- Run all checks ----------

console.log('\n===== SYNC STATUS VERIFICATION =====\n');

status.pipelines.news_fm = checkNewsFM();
status.pipelines.prices = checkPrices();
status.pipelines.war_risk = checkWarRiskPremium();
status.pipelines.spr = checkSPR();
status.pipelines.soh = checkSOH();
status.pipelines.import_flows = checkImportFlows();
status.pipelines.export_flows = checkExportFlows();
status.pipelines.flow_insights = checkFlowInsights();

// Determine overall status
const statuses = Object.values(status.pipelines).map(p => p.status);
if (statuses.some(s => s === 'failed')) status.overall = 'failed';
else if (statuses.some(s => s === 'stale')) status.overall = 'partial';
else status.overall = 'ok';

// Print summary table
const icons = { ok: '✓', stale: '⚠', failed: '✗', skipped: '○' };
const colors = { ok: '\x1b[32m', stale: '\x1b[33m', failed: '\x1b[31m', skipped: '\x1b[90m' };
const reset = '\x1b[0m';

const pipelineLabels = {
  news_fm: 'News/FM/Production',
  prices: 'Platts Prices',
  war_risk: 'War Risk Premium',
  spr: 'SPR Releases',
  soh: 'SOH Vessels',
  import_flows: 'Import Flows',
  export_flows: 'Export Flows',
  flow_insights: 'Flow Insights',
};

for (const [key, label] of Object.entries(pipelineLabels)) {
  const p = status.pipelines[key];
  const icon = icons[p.status] || '?';
  const color = colors[p.status] || '';
  const dateStr = p.dataAsOf || 'N/A';
  console.log(`  ${color}${icon}${reset} ${label.padEnd(22)} ${(p.status || '').padEnd(8)} ${dateStr.padEnd(14)} ${p.details}`);
}

console.log(`\n  Overall: ${colors[status.overall]}${status.overall.toUpperCase()}${reset}`);
console.log(`  Checked: ${new Date(NOW).toISOString()}\n`);

// Write sync-status.json
const outPath = path.join(PROJECT_DIR, 'sync-status.json');
fs.writeFileSync(outPath, JSON.stringify(status, null, 2));
console.log(`  Written: ${outPath}\n`);

// Exit code: 0 = all ok, 1 = some failed, 2 = some stale
if (status.overall === 'failed') process.exit(1);
if (status.overall === 'partial') process.exit(2);
process.exit(0);
