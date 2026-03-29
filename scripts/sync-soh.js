#!/usr/bin/env node
/**
 * sync-soh.js — Fetches live Strait of Hormuz data from Kpler Terminal API.
 *
 * Usage:
 *   KPLER_ACCESS_TOKEN="eyJ..." node scripts/sync-soh.js
 *
 * The Kpler JWT expires every ~5 minutes. To get a fresh one:
 *   1. Open terminal.kpler.com in browser (logged in)
 *   2. Dev Tools → Console → run:
 *      JSON.parse(localStorage.getItem('@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access')).body.access_token
 *   3. Copy the token and pass as KPLER_ACCESS_TOKEN env var
 *
 * Outputs JSON files to soh-data/ directory.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://terminal.kpler.com';
const HORMUZ_ZONE_ID = 107647;
const OUT_DIR = path.join(__dirname, '..', 'soh-data');

// Hormuz monitoring zone polygon (for map overlay only — NOT used for inside/outside classification)
const HORMUZ_MONITORING_ZONE = [
  [30.6, 47.2], [30.95, 50.4], [29.4, 56.9], [25.2, 58.2],
  [23.5, 56.9], [23.0, 50.6], [25.1, 48.2], [29.3, 47.0]
];

// --- Strait of Hormuz boundary: coastline-following segments ---
// Defines the eastern edge of "inside" (Persian Gulf). Everything east = "outside" (Gulf of Oman).
const GULF_BOUNDARY = [
  { lat: 30.0, lng: 56.50 },   // Far north Iran coast
  { lat: 29.0, lng: 56.50 },   // Northern Gulf Iran coast
  { lat: 28.0, lng: 56.45 },   // Central Iran coast
  { lat: 27.2, lng: 56.45 },   // Bandar Abbas area
  { lat: 27.0, lng: 56.40 },   // South of Bandar Abbas
  { lat: 26.8, lng: 56.35 },   // Hormoz/Larak Island area
  { lat: 26.5, lng: 56.30 },   // North of strait channel
  { lat: 26.2, lng: 56.25 },   // Strait narrows
  { lat: 26.0, lng: 56.20 },   // Narrowest part of strait
  { lat: 25.8, lng: 56.15 },   // Musandam Peninsula tip
  { lat: 25.5, lng: 56.05 },   // South Musandam
  { lat: 25.3, lng: 56.00 },   // Ras Al Khaimah coast
  { lat: 25.0, lng: 55.90 },   // UAE east coast (west of Fujairah)
  { lat: 24.5, lng: 55.50 },   // Southern UAE coast
  { lat: 24.0, lng: 55.00 },   // Abu Dhabi area
  { lat: 23.5, lng: 54.00 },   // Far south
];

function boundaryLng(lat) {
  for (let i = 0; i < GULF_BOUNDARY.length - 1; i++) {
    const a = GULF_BOUNDARY[i], b = GULF_BOUNDARY[i + 1];
    if (lat >= b.lat && lat <= a.lat) {
      const frac = (lat - b.lat) / (a.lat - b.lat);
      return b.lng + frac * (a.lng - b.lng);
    }
  }
  return lat > 30.0 ? 56.50 : 54.00;
}

function isInsideGulf(lat, lng) {
  return lng < boundaryLng(lat);
}

// Try env var first, then token file
let TOKEN = process.env.KPLER_ACCESS_TOKEN;
if (!TOKEN) {
  const tokenFile = path.join(OUT_DIR, '.token.txt');
  if (fs.existsSync(tokenFile)) {
    TOKEN = fs.readFileSync(tokenFile, 'utf-8').trim();
    console.log('Read token from soh-data/.token.txt');
  }
}
if (!TOKEN) {
  console.error('ERROR: Set KPLER_ACCESS_TOKEN env var or save token to soh-data/.token.txt');
  process.exit(1);
}

// ---------- HTTP helpers ----------

function kplerGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'x-access-token': TOKEN,
        'use-access-token': 'true',
        'accept': 'application/json',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${urlPath} → ${res.statusCode}: ${body.substring(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`GET ${urlPath} → invalid JSON: ${body.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

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
        if (res.statusCode !== 200) {
          reject(new Error(`POST ${urlPath} → ${res.statusCode}: ${body.substring(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`POST ${urlPath} → invalid JSON: ${body.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

// ---------- Kpler flows request builder ----------

function buildFlowsBody({ granularity = 'days', startDate, endDate, split, numberOfSplits = 10, flowDirection = 'export' }) {
  const body = {
    cumulative: false,
    filters: { product: [] },
    flowDirection,
    fromLocations: [],
    toLocations: [],
    toLocationsExclude: [],
    fromLocationsExclude: [],
    viaRoute: [{ id: HORMUZ_ZONE_ID, resourceType: 'zone' }],
    viaRouteExclude: [],
    granularity,
    interIntra: 'interintra',
    onlyRealized: false,
    withBetaVessels: false,
    withForecasted: true,
    withGrades: false,
    withIncompleteTrades: true,
    withIntraCountry: false,
    withProductEstimation: false,
    vesselClassifications: [],
    vessels: [],
    startDate,
    endDate,
    numberOfSplits,
  };
  if (split) {
    body.split = split;
  }
  return body;
}

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

// ---------- Geo helpers ----------

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------- Vessel matrix builder ----------

function buildVesselMatrix(vessels) {
  const inside = { classes: {}, total: { unknown: 0, ballast: 0, laden: 0, total: 0 } };
  const outside = { classes: {}, total: { unknown: 0, ballast: 0, laden: 0, total: 0 } };

  const adnocVessels = [];
  const mapPositions = [];

  for (const v of vessels) {
    if (!v.lastPosition?.geo) continue;

    const lat = v.lastPosition.geo.lat;
    const lng = v.lastPosition.geo.lon;
    const isInside = isInsideGulf(lat, lng);
    const region = isInside ? inside : outside;

    const cls = v.vesselTypeClass || 'Unknown';
    const state = (v.state || 'unknown').toLowerCase();

    if (!region.classes[cls]) {
      region.classes[cls] = { unknown: 0, ballast: 0, laden: 0, total: 0 };
    }
    region.classes[cls][state === 'loaded' ? 'laden' : state === 'ballast' ? 'ballast' : 'unknown']++;
    region.classes[cls].total++;
    region.total[state === 'loaded' ? 'laden' : state === 'ballast' ? 'ballast' : 'unknown']++;
    region.total.total++;

    // Check for ADNOC vessels
    const controller = v.vesselController?.default?.name || '';
    const isAdnoc = controller.toLowerCase().includes('adnoc') ||
                    controller.toLowerCase().includes('abu dhabi marine') ||
                    (v.name && ['GHANTOUT', 'AL SAMHA', 'UMM AL LULU', 'AL BAZM', 'AL REEM', 'AL SADR', 'MUBARAZ', 'AL SALAM', 'BAYNOUNAH', 'JANANA'].some(n => v.name.toUpperCase().includes(n)));

    if (isAdnoc) {
      adnocVessels.push({
        name: v.name,
        imo: v.imo,
        mmsi: v.mmsi,
        type: v.vesselTypeClass,
        state: v.state,
        flagName: v.flagName,
        deadWeight: v.deadWeight,
        capacity: v.cargoMetrics?.capacity || null,
        capacityUnit: v.cargoMetrics?.capacityWithUnit?.unit || null,
        speed: v.lastPosition?.speed || 0,
        course: v.lastPosition?.course || 0,
        lat, lng,
        draught: v.lastPosition?.draught || null,
        destination: v.nextDestination?.zone?.name || null,
        destinationEta: v.nextDestination?.eta || null,
        product: v.lastPosition?.currentCargo?.products?.[0]?.name || null,
        controller,
        commodityTypes: v.commodityTypes,
        isInside,
        marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${v.imo}`,
      });
    }

    // Map positions (sample every vessel with a position)
    mapPositions.push({
      lat, lng,
      type: cls,
      state: v.state || 'unknown',
      commodity: v.commodityTypes?.[0] || 'other',
      isInside,
    });
  }

  // Convert classes objects to sorted arrays
  const toArray = (classesObj) => {
    return Object.entries(classesObj)
      .map(([label, counts]) => ({ label, ...counts }))
      .sort((a, b) => b.total - a.total);
  };

  return {
    inside: { matrix: toArray(inside.classes), grandTotal: inside.total },
    outside: { matrix: toArray(outside.classes), grandTotal: outside.total },
    adnocVessels,
    mapPositions,
  };
}

// ---------- Main ----------

async function main() {
  console.log('=== SOH Sync: Fetching live data from Kpler ===\n');

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const now = new Date();
  const endDate = dateStr(now);
  const startDate90 = dateStr(new Date(now - 90 * 86400000));
  const startDate2y = dateStr(new Date(now - 730 * 86400000));

  // --- 1. Fetch vessels in Hormuz zone ---
  console.log('1/7  Fetching vessels in Hormuz zone...');
  let vessels;
  try {
    vessels = await kplerGet(`/api/vessels?zones=${HORMUZ_ZONE_ID}&size=10000`);
    console.log(`     → ${vessels.length} vessels fetched from API`);
    // Filter to Gulf/Hormuz/Oman bounding box (matches S&P MINT bounds)
    vessels = vessels.filter(v => {
      const lat = v.lastPosition?.geo?.lat;
      const lng = v.lastPosition?.geo?.lon;
      return lat && lng && lat >= 22 && lat <= 32 && lng >= 46 && lng <= 60;
    });
    console.log(`     → ${vessels.length} vessels in Hormuz monitoring zone (22-32°N, 46-60°E)`);
    // Save raw vessels (large file — only save summary fields)
    const vesselsSummary = vessels.map(v => ({
      name: v.name, imo: v.imo, mmsi: v.mmsi,
      vesselTypeClass: v.vesselTypeClass, state: v.state,
      flagName: v.flagName, deadWeight: v.deadWeight,
      commodityTypes: v.commodityTypes,
      capacity: v.cargoMetrics?.capacity,
      speed: v.lastPosition?.speed,
      course: v.lastPosition?.course,
      lat: v.lastPosition?.geo?.lat, lng: v.lastPosition?.geo?.lon,
      destination: v.nextDestination?.zone?.name,
      destinationEta: v.nextDestination?.eta,
      aisDestination: v.lastPosition?.destination || null,
      product: v.lastPosition?.currentCargo?.products?.[0]?.name,
      controller: v.vesselController?.default?.name,
      lastPortCall: v.portCallInfo?.lastPortCall,
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'vessels.json'), JSON.stringify(vesselsSummary, null, 2));
  } catch (e) {
    console.error('     ERROR:', e.message);
    vessels = [];
  }

  // --- 2. Build vessel matrix + ADNOC fleet + map positions ---
  console.log('2/7  Building vessel matrix, ADNOC fleet, map positions...');
  if (vessels.length > 0) {
    const { inside, outside, adnocVessels, mapPositions } = buildVesselMatrix(vessels);

    fs.writeFileSync(path.join(OUT_DIR, 'vessel-matrix.json'), JSON.stringify({
      inside, outside,
      syncTimestamp: now.toISOString(),
    }, null, 2));
    console.log(`     → Inside: ${inside.grandTotal.total} vessels (${inside.matrix.length} classes)`);
    console.log(`     → Outside: ${outside.grandTotal.total} vessels (${outside.matrix.length} classes)`);

    fs.writeFileSync(path.join(OUT_DIR, 'adnoc-vessels.json'), JSON.stringify({
      vessels: adnocVessels,
      count: adnocVessels.length,
      syncTimestamp: now.toISOString(),
    }, null, 2));
    console.log(`     → ADNOC vessels: ${adnocVessels.length}`);

    fs.writeFileSync(path.join(OUT_DIR, 'map-positions.json'), JSON.stringify({
      positions: mapPositions,
      hormuzPolygon: HORMUZ_MONITORING_ZONE,
      center: [26.4, 53.7],
      zoom: 6,
      syncTimestamp: now.toISOString(),
    }, null, 2));
    console.log(`     → Map positions: ${mapPositions.length}`);

    // Summary with deltas
    const prevSummaryPath = path.join(OUT_DIR, '.prev-summary.json');
    let prevSummary = null;
    if (fs.existsSync(prevSummaryPath)) {
      try { prevSummary = JSON.parse(fs.readFileSync(prevSummaryPath, 'utf-8')); } catch {}
    }

    const summary = {
      insideTotal: inside.grandTotal.total,
      insideBallast: inside.grandTotal.ballast,
      insideLaden: inside.grandTotal.laden,
      outsideTotal: outside.grandTotal.total,
      outsideBallast: outside.grandTotal.ballast,
      outsideLaden: outside.grandTotal.laden,
      adnocCount: adnocVessels.length,
      syncTimestamp: now.toISOString(),
      deltas: prevSummary ? {
        insideDelta: inside.grandTotal.total - (prevSummary.insideTotal || 0),
        outsideDelta: outside.grandTotal.total - (prevSummary.outsideTotal || 0),
        adnocDelta: adnocVessels.length - (prevSummary.adnocCount || 0),
        insideBallastDelta: inside.grandTotal.ballast - (prevSummary.insideBallast || 0),
        insideLadenDelta: inside.grandTotal.laden - (prevSummary.insideLaden || 0),
        outsideBallastDelta: outside.grandTotal.ballast - (prevSummary.outsideBallast || 0),
        outsideLadenDelta: outside.grandTotal.laden - (prevSummary.outsideLaden || 0),
      } : null,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(prevSummaryPath, JSON.stringify(summary, null, 2));
  }

  // --- 3. Daily export flows (last 90 days) ---
  console.log('3/12 Fetching daily EXPORT flows via Hormuz (90 days)...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'days', startDate: startDate90, endDate, flowDirection: 'export',
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-daily.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} daily data points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 3b. Daily import flows (last 90 days) ---
  console.log('3b/12 Fetching daily IMPORT flows via Hormuz (90 days)...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'days', startDate: startDate90, endDate, flowDirection: 'import',
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-daily-import.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} daily data points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 3c. Weekly export flows (last 2 years) ---
  console.log('3c/12 Fetching weekly EXPORT flows...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'weeks', startDate: startDate2y, endDate, flowDirection: 'export',
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-weekly.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} weekly data points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 3d. Weekly import flows (last 2 years) ---
  console.log('3d/12 Fetching weekly IMPORT flows...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'weeks', startDate: startDate2y, endDate, flowDirection: 'import',
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-weekly-import.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} weekly data points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 3e. Monthly export flows (last 2 years) ---
  console.log('3e/12 Fetching monthly EXPORT flows...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'months', startDate: startDate2y, endDate, flowDirection: 'export',
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-monthly.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} monthly data points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 3f. Monthly import flows (last 2 years) ---
  console.log('3f/12 Fetching monthly IMPORT flows...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'months', startDate: startDate2y, endDate, flowDirection: 'import',
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-monthly-import.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} monthly data points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 4. Monthly flows split by Products (2 years) ---
  console.log('4/7  Fetching monthly flows split by Products...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'months', startDate: startDate2y, endDate,
      split: 'Products', numberOfSplits: 15,
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-product.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} monthly points, ${Object.keys(data.series?.[0]?.datasets || {}).length} products`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 5. Monthly flows split by Origin countries (2 years) ---
  console.log('5/7  Fetching monthly flows split by Origin countries...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'months', startDate: startDate2y, endDate,
      split: 'Origin countries', numberOfSplits: 15,
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-origin.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} monthly points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 6. Monthly flows split by Destination countries (2 years) ---
  console.log('6/7  Fetching monthly flows split by Destination countries...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'months', startDate: startDate2y, endDate,
      split: 'Destination countries', numberOfSplits: 15,
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-dest.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} monthly points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  // --- 7. Monthly flows split by Vessel type (2 years) ---
  console.log('7/7  Fetching monthly flows split by Vessel type...');
  try {
    const data = await kplerPost('/api/flows', buildFlowsBody({
      granularity: 'months', startDate: startDate2y, endDate,
      split: 'Vessel type', numberOfSplits: 15,
    }));
    fs.writeFileSync(path.join(OUT_DIR, 'flows-vessel-type.json'), JSON.stringify(data, null, 2));
    console.log(`     → ${data.series?.length || 0} monthly points`);
  } catch (e) { console.error('     ERROR:', e.message); }

  console.log('\n=== SOH Sync complete ===');
  console.log(`Output directory: ${OUT_DIR}`);
  console.log(`Files:`);
  fs.readdirSync(OUT_DIR).filter(f => !f.startsWith('.')).forEach(f => {
    const size = fs.statSync(path.join(OUT_DIR, f)).size;
    console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
  });
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
