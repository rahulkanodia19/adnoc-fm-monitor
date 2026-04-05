#!/usr/bin/env node
/**
 * sync-flows.js — Fetches import/export flow data from Kpler Terminal API.
 *
 * Reads dataset config from kpler-ids.json, calls POST /api/flows for each
 * dataset, transforms the response, computes weekly/monthly aggregations,
 * applies pipeline data, and writes import-data.js + export-data.js.
 *
 * Usage:
 *   KPLER_ACCESS_TOKEN="eyJ..." node scripts/sync-flows.js
 *   or: place token in soh-data/.token.txt and run without env var
 *
 * Config: scripts/kpler-ids.json (zone IDs, product IDs, dataset definitions)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://terminal.kpler.com';
const PROJECT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, 'kpler-ids.json');
const TOKEN_PATH = path.join(PROJECT_DIR, 'soh-data', '.token.txt');

// ---------- Config ----------

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const ZONES = config.zones;
const PRODUCTS = config.products;

// Unit conversion: API returns m³ (volume) and tonnes (mass)
// Crude and refined products use volume/158.987 → kbd
// LNG, LPG, Sulphur use mass/1000 → ktons (Mt)
const UNIT_CONV = {
  crude:         { field: 'volume', divisor: 158.987 },  // m³ → kbd
  lng:           { field: 'mass',   divisor: 1000 },     // tonnes → ktons
  lpg:           { field: 'mass',   divisor: 1000 },     // tonnes → ktons
  kero_jet:      { field: 'volume', divisor: 158.987 },  // m³ → kbd
  gasoil_diesel: { field: 'volume', divisor: 158.987 },  // m³ → kbd
  gasoline:      { field: 'volume', divisor: 158.987 },  // m³ → kbd
  naphtha:       { field: 'volume', divisor: 158.987 },  // m³ → kbd
  sulphur:       { field: 'mass',   divisor: 1000 },     // tonnes → ktons (Mt)
};

// Dataset definitions — all imports and exports
// 8 commodities per country: crude, lng, lpg, kero_jet, gasoil_diesel, gasoline, naphtha, sulphur
const COMMODITIES = ['crude', 'lng', 'lpg', 'kero_jet', 'gasoil_diesel', 'gasoline', 'naphtha', 'sulphur'];
const IMPORT_COUNTRIES = ['China', 'India', 'Japan', 'South Korea', 'Thailand', 'Vietnam', 'EU-27', 'United States', 'Taiwan'];

const IMPORT_DATASETS = [];
for (const country of IMPORT_COUNTRIES) {
  const prefix = country.toLowerCase().replace(/[ -]/g, '_');
  for (const commodity of COMMODITIES) {
    IMPORT_DATASETS.push({ key: `${prefix}_${commodity}`, country, commodity });
  }
}

const EXPORT_COUNTRIES_MAP = {
  'Bahrain': 'bahrain', 'Iran': 'iran', 'Iraq': 'iraq', 'Kuwait': 'kuwait',
  'Oman': 'oman', 'Qatar': 'qatar', 'Russian Federation': 'russia',
  'Saudi Arabia': 'saudi_arabia', 'United Arab Emirates': 'uae', 'United States': 'us',
  'Australia': 'australia', 'EU-27': 'eu_27',
};

const EXPORT_DATASETS = [];
for (const [country, prefix] of Object.entries(EXPORT_COUNTRIES_MAP)) {
  for (const commodity of COMMODITIES) {
    EXPORT_DATASETS.push({ key: `${prefix}_${commodity}`, country, commodity });
  }
}

// Pipeline flows to add on top of seaborne data (loaded from data.js PIPELINE_STATUS_DATA)
// Only pipelines with status !== 'offline' are applied. Volume added = currentThroughput.
function loadPipelines() {
  const dataJsPath = path.join(PROJECT_DIR, 'data.js');
  const code = fs.readFileSync(dataJsPath, 'utf-8');
  const wrapped = `(function() { ${code}; return { PIPELINE_STATUS_DATA }; })()`;
  let PIPELINE_STATUS_DATA;
  try { ({ PIPELINE_STATUS_DATA } = eval(wrapped)); }
  catch (e) { console.error('ERROR: failed to parse data.js:', e.message); process.exit(1); }
  if (!Array.isArray(PIPELINE_STATUS_DATA)) {
    console.error('ERROR: PIPELINE_STATUS_DATA not found or not an array in data.js');
    process.exit(1);
  }
  return PIPELINE_STATUS_DATA
    .filter(p => p.status !== 'offline')
    .map(p => ({
      dataset: p.dataset,
      country: p.supplierCountry,
      volume: p.currentThroughput,
      start: p.start,
      label: p.label,
    }));
}
const PIPELINES = loadPipelines();

// ---------- Token ----------

let TOKEN = process.env.KPLER_ACCESS_TOKEN;
if (!TOKEN && fs.existsSync(TOKEN_PATH)) {
  TOKEN = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
  console.log('Read token from soh-data/.token.txt');
}
if (!TOKEN) {
  console.error('ERROR: Set KPLER_ACCESS_TOKEN env var or save token to soh-data/.token.txt');
  process.exit(1);
}

// ---------- Token refresh via Chrome DevTools Protocol ----------

async function refreshToken() {
  try {
    const http = require('http');
    let WebSocket;
    try { WebSocket = require('ws'); } catch { console.log('  ws module not available, cannot refresh token'); return false; }

    const pages = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:9222/json', res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const page = pages.find(p => p.url.includes('kpler.com')) || pages[0];
    if (!page) { console.log('  No Kpler page found in Chrome'); return false; }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    const newToken = await new Promise((resolve, reject) => {
      ws.send(JSON.stringify({
        id: 1, method: 'Runtime.evaluate',
        params: {
          expression: 'JSON.parse(localStorage.getItem("@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access")).body.access_token',
          returnByValue: true
        }
      }));
      ws.on('message', m => {
        const d = JSON.parse(m);
        if (d.id === 1 && d.result?.result?.value) resolve(d.result.result.value);
      });
      setTimeout(() => reject(new Error('Timeout')), 10000);
    });
    ws.close();

    if (newToken && newToken.length > 100) {
      TOKEN = newToken;
      fs.writeFileSync(TOKEN_PATH, newToken);
      console.log('  Token refreshed successfully');
      return true;
    }
    return false;
  } catch (e) {
    console.log('  Token refresh failed:', e.message);
    return false;
  }
}

// ---------- HTTP ----------

function kplerPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const payload = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'x-access-token': TOKEN,
        'use-access-token': 'true',
        'accept': 'application/json',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode === 401) {
          reject(new Error('TOKEN_EXPIRED'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`POST ${urlPath} → ${res.statusCode}: ${body.substring(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`POST ${urlPath} → invalid JSON`)); }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function dateStr(d) { return d.toISOString().split('T')[0]; }

// ---------- API request builder ----------

function buildFlowsRequest(def, direction) {
  const zoneId = ZONES[def.country];
  if (!zoneId) throw new Error(`No zone ID for ${def.country}`);
  const productId = PRODUCTS[def.commodity];
  if (!productId) throw new Error(`No product ID for ${def.commodity}`);

  // Fixed start date: always from Jan 1 2024
  // End date: yesterday (exclude partial current day)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return {
    cumulative: false,
    filters: { product: Array.isArray(productId) ? productId : [productId] },
    flowDirection: direction,
    fromLocations: [{ id: zoneId, resourceType: 'zone' }],
    toLocations: [],
    toLocationsExclude: [],
    fromLocationsExclude: [],
    viaRoute: [],
    viaRouteExclude: [],
    granularity: 'days',
    interIntra: 'interintra',
    onlyRealized: true,
    withBetaVessels: false,
    withForecasted: true,
    withGrades: false,
    withIncompleteTrades: true,
    withIntraCountry: false,
    withProductEstimation: false,
    vesselClassifications: [],
    vessels: [],
    splitOn: direction === 'import' ? 'Origin Countries' : 'Destination Countries',
    startDate: '2024-01-01',
    endDate: dateStr(yesterday),
    numberOfSplits: 50,
  };
}

// ---------- Response transformation ----------

function transformResponse(apiData, commodity) {
  const conv = UNIT_CONV[commodity];
  const allCountries = new Set();
  const countryTotals = {};
  const dailyData = [];

  for (const entry of apiData.series) {
    const dateStr = entry.date;
    const ds = entry.datasets[0];
    if (!ds) continue;

    const values = {};
    let total = 0;

    // Process split values (individual countries)
    const splits = ds.splitValues || [];
    for (const sv of splits) {
      if (sv.id === 'others') continue;
      const rawVal = sv.values[conv.field] || 0;
      const converted = Math.round(rawVal / conv.divisor * 10) / 10;
      if (converted !== 0) {
        values[sv.name] = converted;
        allCountries.add(sv.name);
        countryTotals[sv.name] = (countryTotals[sv.name] || 0) + converted;
      }
      total += converted;
    }

    // Handle "Others" bucket — add to total but not as a named country
    const othersSplit = splits.find(sv => sv.id === 'others');
    if (othersSplit) {
      const othersVal = Math.round((othersSplit.values[conv.field] || 0) / conv.divisor * 10) / 10;
      total += othersVal;
    }

    dailyData.push({ date: dateStr, values, total: Math.round(total * 10) / 10 });
  }

  // Top 15 suppliers/destinations
  const topSuppliers = Object.entries(countryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name]) => name);

  return {
    countries: [...allCountries].sort(),
    topSuppliers,
    daily: makeDailyRecords(dailyData),
    weekly: makeWeeklyRecords(dailyData),
    monthly: makeMonthlyRecords(dailyData),
  };
}

// ---------- Record builders (ported from generate-data.py) ----------

function makeDailyRecords(dailyData) {
  return dailyData.map(day => {
    const rec = { p: day.date, s: day.date, e: day.date, d: 1 };
    Object.assign(rec, day.values);
    rec._t = day.total;
    return rec;
  });
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getISOYear(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
}

function makeWeeklyRecords(dailyData) {
  const weeks = {};
  for (const day of dailyData) {
    const dt = new Date(day.date);
    const isoYear = getISOYear(dt);
    const isoWeek = getISOWeek(dt);
    const weekKey = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;

    if (!weeks[weekKey]) weeks[weekKey] = { values: {}, total: 0, days: 0, start: null, end: null };
    const w = weeks[weekKey];
    w.days++;
    if (!w.start || day.date < w.start) w.start = day.date;
    if (!w.end || day.date > w.end) w.end = day.date;

    for (const [country, val] of Object.entries(day.values)) {
      w.values[country] = (w.values[country] || 0) + val;
    }
    w.total += day.total;
  }

  return Object.keys(weeks).sort().map(weekKey => {
    const w = weeks[weekKey];
    const rec = { p: weekKey, s: w.start, e: w.end, d: w.days };
    for (const [country, val] of Object.entries(w.values)) {
      const rounded = Math.round(val * 10) / 10;
      if (rounded !== 0) rec[country] = rounded;
    }
    rec._t = Math.round(w.total * 10) / 10;
    return rec;
  });
}

function makeMonthlyRecords(dailyData) {
  const months = {};
  for (const day of dailyData) {
    const monthKey = day.date.substring(0, 7);

    if (!months[monthKey]) months[monthKey] = { values: {}, total: 0, days: 0, start: null, end: null };
    const m = months[monthKey];
    m.days++;
    if (!m.start || day.date < m.start) m.start = day.date;
    if (!m.end || day.date > m.end) m.end = day.date;

    for (const [country, val] of Object.entries(day.values)) {
      m.values[country] = (m.values[country] || 0) + val;
    }
    m.total += day.total;
  }

  return Object.keys(months).sort().map(monthKey => {
    const m = months[monthKey];
    const rec = { p: monthKey, s: m.start, e: m.end, d: m.days };
    for (const [country, val] of Object.entries(m.values)) {
      const rounded = Math.round(val * 10) / 10;
      if (rounded !== 0) rec[country] = rounded;
    }
    rec._t = Math.round(m.total * 10) / 10;
    return rec;
  });
}

// ---------- Pipeline data ----------

function applyPipelines(data) {
  for (const pipe of PIPELINES) {
    const dataset = data[pipe.dataset];
    if (!dataset) { console.log(`  Pipeline ${pipe.label}: dataset ${pipe.dataset} not found, skipping`); continue; }

    const pipeStart = new Date(pipe.start).getTime();
    let updatedDaily = 0;

    // Add to countries list if not present
    if (!dataset.countries.includes(pipe.country)) {
      dataset.countries.push(pipe.country);
      dataset.countries.sort();
    }

    // Add to daily records
    for (const rec of dataset.daily) {
      const recDate = new Date(rec.s).getTime();
      if (recDate >= pipeStart) {
        rec[pipe.country] = (rec[pipe.country] || 0) + pipe.volume;
        rec._t = Math.round((rec._t + pipe.volume) * 10) / 10;
        updatedDaily++;
      }
    }

    // Recompute weekly and monthly from updated daily
    const dailyData = dataset.daily.map(rec => {
      const values = {};
      for (const [k, v] of Object.entries(rec)) {
        if (k !== 'p' && k !== 's' && k !== 'e' && k !== 'd' && k !== '_t') values[k] = v;
      }
      return { date: rec.p, values, total: rec._t };
    });
    dataset.weekly = makeWeeklyRecords(dailyData);
    dataset.monthly = makeMonthlyRecords(dailyData);

    // Recompute topSuppliers
    const totals = {};
    for (const day of dailyData) {
      for (const [country, val] of Object.entries(day.values)) {
        totals[country] = (totals[country] || 0) + val;
      }
    }
    dataset.topSuppliers = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);

    console.log(`  Pipeline ${pipe.label}: ${pipe.volume} kb/d to ${pipe.dataset} → ${pipe.country} (${updatedDaily} daily records)`);
  }
}

// ---------- Output ----------

function writeJsFile(filepath, varName, data, comment) {
  const json = JSON.stringify(data, null, 0);
  const content = `${comment}\n\nconst ${varName} = ${json};\n`;
  fs.writeFileSync(filepath, content);
  console.log(`  Wrote ${filepath} (${(content.length / 1024 / 1024).toFixed(1)} MB)`);
}

// ---------- Main ----------

async function main() {
  const totalDatasets = IMPORT_DATASETS.length + EXPORT_DATASETS.length;
  console.log(`\n=== Kpler Flow Data Sync ===`);
  console.log(`Fetching ${totalDatasets} datasets (${IMPORT_DATASETS.length} imports + ${EXPORT_DATASETS.length} exports)...\n`);

  const importData = {};
  const exportData = {};
  let success = 0;
  let failures = 0;

  // Process imports
  console.log('--- Imports ---');
  for (let i = 0; i < IMPORT_DATASETS.length; i++) {
    const def = IMPORT_DATASETS[i];
    try {
      const body = buildFlowsRequest(def, 'import');
      const apiData = await kplerPost('/api/flows', body);
      importData[def.key] = transformResponse(apiData, def.commodity);
      success++;
      const lastDate = importData[def.key].daily.slice(-1)[0]?.p || '?';
      console.log(`  [${success}/${totalDatasets}] ✓ ${def.key} (${importData[def.key].daily.length} days, last: ${lastDate})`);
    } catch (e) {
      failures++;
      console.error(`  [${success + failures}/${totalDatasets}] ✗ ${def.key}: ${e.message}`);
      if (e.message === 'TOKEN_EXPIRED') {
        console.log('  Token expired, refreshing...');
        const refreshed = await refreshToken();
        if (refreshed) {
          // Retry this dataset
          try {
            const body2 = buildFlowsRequest(def, 'import');
            const apiData2 = await kplerPost('/api/flows', body2);
            importData[def.key] = transformResponse(apiData2, def.commodity);
            failures--; success++;
            console.log(`  [${success}/${totalDatasets}] ✓ ${def.key} (retry succeeded)`);
          } catch (e2) { console.error(`  Retry failed: ${e2.message}`); }
        } else {
          console.error('  Could not refresh token. Continuing with remaining datasets...');
        }
      }
    }
    await sleep(500); // Rate limiting
  }

  // Process exports
  console.log('\n--- Exports ---');
  for (let i = 0; i < EXPORT_DATASETS.length; i++) {
    const def = EXPORT_DATASETS[i];
    try {
      const body = buildFlowsRequest(def, 'export');
      const apiData = await kplerPost('/api/flows', body);
      exportData[def.key] = transformResponse(apiData, def.commodity);
      success++;
      const lastDate = exportData[def.key].daily.slice(-1)[0]?.p || '?';
      console.log(`  [${success}/${totalDatasets}] ✓ ${def.key} (${exportData[def.key].daily.length} days, last: ${lastDate})`);
    } catch (e) {
      failures++;
      console.error(`  [${success + failures}/${totalDatasets}] ✗ ${def.key}: ${e.message}`);
      if (e.message === 'TOKEN_EXPIRED') {
        console.log('  Token expired, refreshing...');
        const refreshed = await refreshToken();
        if (refreshed) {
          try {
            const body2 = buildFlowsRequest(def, 'export');
            const apiData2 = await kplerPost('/api/flows', body2);
            exportData[def.key] = transformResponse(apiData2, def.commodity);
            failures--; success++;
            console.log(`  [${success}/${totalDatasets}] ✓ ${def.key} (retry succeeded)`);
          } catch (e2) { console.error(`  Retry failed: ${e2.message}`); }
        } else {
          console.error('  Could not refresh token. Continuing...');
        }
      }
    }
    await sleep(500);
  }

  console.log(`\n--- Results: ${success}/${totalDatasets} succeeded, ${failures} failed ---\n`);

  if (success < totalDatasets * 0.8) {
    console.error('ERROR: Too many failures (>20%). Aborting to protect existing data.');
    process.exit(1);
  }

  // Apply pipeline data
  console.log('--- Applying Pipeline Data ---');
  applyPipelines(importData);
  applyPipelines(exportData);

  // Write output files
  console.log('\n--- Writing Output ---');
  const now = new Date().toISOString();
  writeJsFile(
    path.join(PROJECT_DIR, 'import-data.js'),
    'IMPORT_FLOW_DATA',
    importData,
    `// Auto-generated from Kpler API — ${now}\n// Import flows (Crude, LNG & LPG) by origin country\n// Daily, weekly and monthly aggregations\n// Note: China crude includes pipeline flows (ESPO, Kazakhstan-China, Myanmar-China)`
  );
  writeJsFile(
    path.join(PROJECT_DIR, 'export-data.js'),
    'EXPORT_FLOW_DATA',
    exportData,
    `// Auto-generated from Kpler API — ${now}\n// Export flows (Crude, LNG & LPG) by destination country\n// Daily, weekly and monthly aggregations\n// Note: Iraq crude includes Kirkuk-Ceyhan pipeline, Russia crude includes ESPO pipeline, Saudi Arabia crude includes Yanbu-SUMED pipeline`
  );

  // Verification
  console.log('\n--- Verification ---');
  if (importData.china_crude) {
    const last = importData.china_crude.daily.slice(-1)[0];
    console.log(`China crude last daily: ${JSON.stringify(last)}`);
    console.log(`Has Kazakhstan: ${importData.china_crude.countries.includes('Kazakhstan')}`);
    console.log(`Has Myanmar: ${importData.china_crude.countries.includes('Myanmar')}`);
  }
  if (exportData.iraq_crude) {
    const last = exportData.iraq_crude.daily.slice(-1)[0];
    console.log(`Iraq crude last daily: ${JSON.stringify(last)}`);
    console.log(`Has Turkey: ${exportData.iraq_crude.countries.includes('Turkey')}`);
  }

  // Write enriched flow-summary.json for the insights agent
  console.log('\n--- Writing Flow Summary ---');
  const GULF_COUNTRIES = ['Saudi Arabia', 'United Arab Emirates', 'Iraq', 'Qatar', 'Kuwait', 'Bahrain', 'Iran', 'Oman'];
  // Build PIPELINE_NOTES dynamically from loaded PIPELINES config
  const PIPELINE_NOTES = {};
  for (const p of PIPELINES) {
    const note = `${p.label} (~${p.volume} kbd) via ${p.country} since ${p.start}`;
    PIPELINE_NOTES[p.dataset] = PIPELINE_NOTES[p.dataset]
      ? PIPELINE_NOTES[p.dataset] + '; ' + note
      : 'Includes ' + note;
  }

  // Enrich a single period record (weekly or monthly) with daily averages,
  // Gulf total/share, and top-5 countries. Shared across all buckets.
  function periodToRecord(rec) {
    const allCountries = {};
    for (const [k, v] of Object.entries(rec)) {
      if (!['p', 's', 'e', 'd', '_t'].includes(k)) allCountries[k] = Math.round(v * 10) / 10;
    }
    let gulfTotal = 0;
    for (const gc of GULF_COUNTRIES) { gulfTotal += allCountries[gc] || 0; }
    const gulfShare = rec._t > 0 ? Math.round(gulfTotal / rec._t * 1000) / 10 : 0;
    const sorted = Object.entries(allCountries).sort((a, b) => b[1] - a[1]);
    const days = rec.d || 1;
    const dailyAvg = Math.round(rec._t / days * 10) / 10;
    const allCountriesDaily = {};
    for (const [name, val] of Object.entries(allCountries)) {
      allCountriesDaily[name] = Math.round(val / days * 10) / 10;
    }
    return {
      period: rec.p, start: rec.s, end: rec.e, total: Math.round(rec._t), days,
      dailyAvg, allCountries, allCountriesDaily,
      gulfTotal: Math.round(gulfTotal),
      gulfDailyAvg: Math.round(gulfTotal / days * 10) / 10,
      gulfShare,
      top5: sorted.slice(0, 5).map(([name]) => name),
    };
  }

  function buildSummary(data, direction, defs) {
    const result = {};
    for (const def of defs) {
      const dataset = data[def.key];
      if (!dataset) continue;
      const recentWeekly = (dataset.weekly || []).slice(-4);       // ~1 month
      const quarterlyWeekly = (dataset.weekly || []).slice(-13);   // ~3 months
      const yearlyMonthly = (dataset.monthly || []).slice(-12);    // ~12 months
      result[def.key] = {
        direction, country: def.country, commodity: def.commodity,
        unit: UNIT_CONV[def.commodity]?.divisor === 158.987 ? 'kbd' : 'ktons',
        hasPipeline: !!PIPELINE_NOTES[def.key],
        pipelineNote: PIPELINE_NOTES[def.key] || '',
        periods: {
          recent:    { granularity: 'weekly',  records: recentWeekly.map(periodToRecord) },
          quarterly: { granularity: 'weekly',  records: quarterlyWeekly.map(periodToRecord) },
          yearly:    { granularity: 'monthly', records: yearlyMonthly.map(periodToRecord) },
        },
      };
    }
    return result;
  }

  const summaryData = {
    ...buildSummary(importData, 'import', IMPORT_DATASETS),
    ...buildSummary(exportData, 'export', EXPORT_DATASETS),
  };
  const summaryPath = path.join(PROJECT_DIR, 'flow-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
  console.log(`  Wrote ${summaryPath} (${(fs.statSync(summaryPath).size / 1024).toFixed(0)} KB, ${Object.keys(summaryData).length} datasets)`);

  console.log('\n=== Done ===');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
