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
// xlsx uses kbd (thousand barrels) for crude, ktons for LNG/LPG
const UNIT_CONV = {
  crude: { field: 'volume', divisor: 158.987 },  // m³ → kbd (verified exact match)
  lng:   { field: 'mass',   divisor: 1000 },      // tonnes → ktons
  lpg:   { field: 'mass',   divisor: 1000 },      // tonnes → ktons
};

// Dataset definitions — all imports and exports
const IMPORT_DATASETS = [
  { key: 'china_crude',        country: 'China',        commodity: 'crude' },
  { key: 'china_lng',          country: 'China',        commodity: 'lng' },
  { key: 'china_lpg',          country: 'China',        commodity: 'lpg' },
  { key: 'india_crude',        country: 'India',        commodity: 'crude' },
  { key: 'india_lng',          country: 'India',        commodity: 'lng' },
  { key: 'india_lpg',          country: 'India',        commodity: 'lpg' },
  { key: 'japan_crude',        country: 'Japan',        commodity: 'crude' },
  { key: 'japan_lng',          country: 'Japan',        commodity: 'lng' },
  { key: 'japan_lpg',          country: 'Japan',        commodity: 'lpg' },
  { key: 'south_korea_crude',  country: 'South Korea',  commodity: 'crude' },
  { key: 'south_korea_lng',    country: 'South Korea',  commodity: 'lng' },
  { key: 'south_korea_lpg',    country: 'South Korea',  commodity: 'lpg' },
  { key: 'thailand_crude',     country: 'Thailand',     commodity: 'crude' },
  { key: 'thailand_lng',       country: 'Thailand',     commodity: 'lng' },
  { key: 'thailand_lpg',       country: 'Thailand',     commodity: 'lpg' },
  { key: 'vietnam_crude',      country: 'Vietnam',      commodity: 'crude' },
  { key: 'vietnam_lng',        country: 'Vietnam',      commodity: 'lng' },
  { key: 'vietnam_lpg',        country: 'Vietnam',      commodity: 'lpg' },
];

const EXPORT_DATASETS = [
  { key: 'bahrain_crude',       country: 'Bahrain',               commodity: 'crude' },
  { key: 'bahrain_lng',         country: 'Bahrain',               commodity: 'lng' },
  { key: 'bahrain_lpg',         country: 'Bahrain',               commodity: 'lpg' },
  { key: 'iran_crude',          country: 'Iran',                  commodity: 'crude' },
  { key: 'iran_lng',            country: 'Iran',                  commodity: 'lng' },
  { key: 'iran_lpg',            country: 'Iran',                  commodity: 'lpg' },
  { key: 'iraq_crude',          country: 'Iraq',                  commodity: 'crude' },
  { key: 'iraq_lng',            country: 'Iraq',                  commodity: 'lng' },
  { key: 'iraq_lpg',            country: 'Iraq',                  commodity: 'lpg' },
  { key: 'kuwait_crude',        country: 'Kuwait',                commodity: 'crude' },
  { key: 'kuwait_lng',          country: 'Kuwait',                commodity: 'lng' },
  { key: 'kuwait_lpg',          country: 'Kuwait',                commodity: 'lpg' },
  { key: 'oman_crude',          country: 'Oman',                  commodity: 'crude' },
  { key: 'oman_lng',            country: 'Oman',                  commodity: 'lng' },
  { key: 'oman_lpg',            country: 'Oman',                  commodity: 'lpg' },
  { key: 'qatar_crude',         country: 'Qatar',                 commodity: 'crude' },
  { key: 'qatar_lng',           country: 'Qatar',                 commodity: 'lng' },
  { key: 'qatar_lpg',           country: 'Qatar',                 commodity: 'lpg' },
  { key: 'russia_crude',        country: 'Russian Federation',    commodity: 'crude' },
  { key: 'russia_lng',          country: 'Russian Federation',    commodity: 'lng' },
  { key: 'russia_lpg',          country: 'Russian Federation',    commodity: 'lpg' },
  { key: 'saudi_arabia_crude',  country: 'Saudi Arabia',          commodity: 'crude' },
  { key: 'saudi_arabia_lng',    country: 'Saudi Arabia',          commodity: 'lng' },
  { key: 'saudi_arabia_lpg',    country: 'Saudi Arabia',          commodity: 'lpg' },
  { key: 'uae_crude',           country: 'United Arab Emirates',  commodity: 'crude' },
  { key: 'uae_lng',             country: 'United Arab Emirates',  commodity: 'lng' },
  { key: 'uae_lpg',             country: 'United Arab Emirates',  commodity: 'lpg' },
  { key: 'us_crude',            country: 'United States',         commodity: 'crude' },
  { key: 'us_lng',              country: 'United States',         commodity: 'lng' },
  { key: 'us_lpg',              country: 'United States',         commodity: 'lpg' },
];

// Pipeline flows to add on top of seaborne data
const PIPELINES = [
  { dataset: 'china_crude',  country: 'Russian Federation', volume: 600, start: '2024-01-01', label: 'ESPO' },
  { dataset: 'china_crude',  country: 'Kazakhstan',         volume: 220, start: '2024-01-01', label: 'Kazakhstan-China' },
  { dataset: 'china_crude',  country: 'Myanmar',            volume: 200, start: '2024-01-01', label: 'Myanmar-China' },
  { dataset: 'iraq_crude',   country: 'Turkey',             volume: 250, start: '2026-03-17', label: 'Kirkuk-Ceyhan' },
  { dataset: 'russia_crude', country: 'China',              volume: 600, start: '2024-01-01', label: 'ESPO export' },
];

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

  const now = new Date();
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  return {
    cumulative: false,
    filters: { product: [productId] },
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
    startDate: dateStr(twoYearsAgo),
    endDate: dateStr(now),
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
        console.error('\nToken expired. Refresh token and retry.');
        process.exit(2);
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
        console.error('\nToken expired. Refresh token and retry.');
        process.exit(2);
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
    `// Auto-generated from Kpler API — ${now}\n// Export flows (Crude, LNG & LPG) by destination country\n// Daily, weekly and monthly aggregations\n// Note: Iraq crude includes Kirkuk-Ceyhan pipeline, Russia crude includes ESPO pipeline`
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

  console.log('\n=== Done ===');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
