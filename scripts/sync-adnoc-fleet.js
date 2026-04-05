#!/usr/bin/env node
/**
 * sync-adnoc-fleet.js — Fetches ADNOC L&S fleet vessel data from Kpler Terminal API.
 *
 * Standalone script — does NOT modify sync-soh.js or process-soh.js.
 * Reuses the same Kpler JWT auth pattern (soh-data/.token.txt).
 *
 * Usage:
 *   KPLER_ACCESS_TOKEN="eyJ..." node scripts/sync-adnoc-fleet.js
 *   node scripts/sync-adnoc-fleet.js          # reads token from soh-data/.token.txt
 *
 * Outputs: soh-data/adnoc-fleet-data.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://terminal.kpler.com';
const HORMUZ_ZONE_ID = 107647;
const OUT_DIR = path.join(__dirname, '..', 'soh-data');
const FLEET_CONFIG = path.join(__dirname, '..', 'adnoc-fleet.json');

// --- Gulf boundary (same as sync-soh.js / process-soh.js) ---
const GULF_BOUNDARY = [
  { lat: 30.0, lng: 56.50 },
  { lat: 29.0, lng: 56.50 },
  { lat: 28.0, lng: 56.45 },
  { lat: 27.2, lng: 56.45 },
  { lat: 27.0, lng: 56.40 },
  { lat: 26.8, lng: 56.35 },
  { lat: 26.5, lng: 56.30 },
  { lat: 26.2, lng: 56.25 },
  { lat: 26.0, lng: 56.20 },
  { lat: 25.8, lng: 56.15 },
  { lat: 25.5, lng: 56.05 },
  { lat: 25.3, lng: 56.00 },
  { lat: 25.0, lng: 55.90 },
  { lat: 24.5, lng: 55.50 },
  { lat: 24.0, lng: 55.00 },
  { lat: 23.5, lng: 54.00 },
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

function isInStraitNeck(lat, lng) {
  if (lat < 25.5 || lat > 26.8) return false;
  return Math.abs(lng - boundaryLng(lat)) < 0.5;
}

// --- SOH monitoring zone polygon (same as soh-tracker / sync-soh.js) ---
const HORMUZ_MONITORING_ZONE = [
  [30.6, 47.2], [30.95, 50.4], [29.4, 56.9], [25.2, 58.2],
  [23.5, 56.9], [23.0, 50.6], [25.1, 48.2], [29.3, 47.0]
];

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

// --- Area classification ---
function classifyArea(lat, lng) {
  if (!lat || !lng) return 'Unknown';

  // 1. Gulf of Oman — check FIRST (east of Gulf boundary, Fujairah/Khor Fakkan/Sohar/Muscat)
  if (!isInsideGulf(lat, lng) && lat >= 22 && lat <= 27 && lng >= 56 && lng <= 60)
    return 'Gulf of Oman';

  // 2. Strait of Hormuz — SOH tracker zone (full Gulf + Strait area)
  if (pointInPolygon(lat, lng, HORMUZ_MONITORING_ZONE)) return 'Strait of Hormuz';

  // 3. Red Sea
  if (lng < 45 && lat < 32 && lat > 12) return 'Red Sea';

  // 4. Arabian Sea (broader Indian Ocean / Arabian Sea region)
  if (lat >= 0 && lat <= 30 && lng >= 45 && lng <= 80) return 'Arabian Sea';

  // 5. Other (Atlantic, Pacific, Mediterranean, etc.)
  return 'Other';
}

// --- Area of Interest check ---
function isAreaOfInterest(area) {
  return ['Strait of Hormuz', 'Gulf of Oman', 'Red Sea', 'Arabian Sea'].includes(area);
}

// --- Bound (Inbound/Outbound) ---
// Inbound = outside area of interest AND moving toward it
// Outbound = inside area of interest AND moving outside
function classifyBound(lat, lng, course, speed, area, state) {
  if (!lat || !lng) return 'Unknown';

  // Stationary vessels: use cargo state
  // Ballast (empty) → Inbound (coming to load)
  // Loaded (full) → Outbound (about to depart with cargo)
  if (speed != null && speed < 1) {
    return state === 'loaded' ? 'Outbound' : 'Inbound';
  }

  const inAOI = isAreaOfInterest(area);

  // Course: 0=N, 90=E, 180=S, 270=W
  // Heading east (60-200°) generally means exiting Gulf/outbound
  // Heading west (200-360° or 0-60°) generally means entering/inbound
  const headingEast = course >= 60 && course <= 200;

  if (inAOI && headingEast) return 'Outbound';
  if (!inAOI && !headingEast) return 'Inbound';
  if (inAOI && !headingEast) return 'Inbound';
  if (!inAOI && headingEast) return 'Outbound';

  return 'Unknown';
}

// --- Current status (maritime terms) ---
function deriveStatus(speed, state) {
  if (speed == null) return 'Unknown';
  if (speed >= 1) return 'Under Way';
  if (state === 'loaded') return 'Anchored';
  return 'Moored';
}

// --- Port name → country lookup ---
const PORT_COUNTRY_MAP = {
  // UAE
  'fujairah': 'UAE', 'ruwais': 'UAE', 'jebel ali': 'UAE', 'das island': 'UAE',
  'khalifa port': 'UAE', 'abu dhabi': 'UAE', 'musaffah': 'UAE', 'khor fakkan': 'UAE',
  'zirku': 'UAE', 'umm al nar': 'UAE', 'hamriyah': 'UAE', 'jebel dhanna': 'UAE',
  'united arab emirates': 'UAE',
  // Asia
  'singapore': 'Singapore', 'mumbai': 'India', 'kandla': 'India', 'mundra': 'India',
  'mangalore': 'India', 'vizag': 'India', 'paradip': 'India', 'haldia': 'India',
  'cochin': 'India', 'sikka': 'India',
  'karachi': 'Pakistan', 'port qasim': 'Pakistan',
  'yokohama': 'Japan', 'chiba': 'Japan', 'himeji': 'Japan',
  'ulsan': 'South Korea', 'daesan': 'South Korea',
  'ningbo': 'China', 'shanghai': 'China', 'qingdao': 'China', 'yantai': 'China',
  'fujian': 'China', 'cjk': 'China',
  'cilegon': 'Indonesia', 'galle': 'Sri Lanka',
  // Middle East
  'ras tanura': 'Saudi Arabia', 'jubail': 'Saudi Arabia', 'yanbu': 'Saudi Arabia',
  'ras laffan': 'Qatar', 'mesaieed': 'Qatar',
  'sohar': 'Oman', 'salalah': 'Oman', 'muscat': 'Oman', 'duqm': 'Oman', 'qalhat': 'Oman',
  'bandar abbas': 'Iran', 'kharg island': 'Iran', 'basra': 'Iraq',
  'bahrain': 'Bahrain', 'mina al ahmadi': 'Kuwait', 'shuwaikh': 'Kuwait',
  // Europe
  'rotterdam': 'Netherlands', 'amsterdam': 'Netherlands',
  'piombino': 'Italy', 'antikyra port': 'Greece', 'las palmas': 'Spain', 'spain': 'Spain',
  // Africa
  'skikda': 'Algeria', 'suez': 'Egypt', 'port said': 'Egypt', 'jeddah': 'Saudi Arabia',
  'richards bay': 'South Africa', 'durban': 'South Africa', 'cape town': 'South Africa',
  'dangote': 'Nigeria', 'rovuma basin': 'Mozambique',
  // Americas
  'bahia blanca': 'Argentina', 'barcarena': 'Brazil', 'santos': 'Brazil',
  'angra dos reis': 'Brazil', 'brazil': 'Brazil',
  'houston': 'USA', 'southern louisiana': 'USA', 'padd 3': 'USA',
  'vancouver': 'Canada', 'kitimat': 'Canada',
  'callao': 'Peru', 'freeport bahamas': 'Bahamas', 'caribbean sea': 'Caribbean',
  // AIS short codes
  'aerws': 'UAE', 'ae fjr': 'UAE', 'ae rws': 'UAE', 'rws': 'UAE', 'fjr': 'UAE',
  'kp': 'UAE', 'sg sin': 'Singapore', 'nlrtm': 'Netherlands', 'dzski': 'Algeria',
  'za rcb': 'South Africa', 'in nml': 'India', 'inixy': 'India',
};

function lookupCountry(portName) {
  if (!portName) return null;
  const lower = portName.toLowerCase().trim();
  // Direct match
  if (PORT_COUNTRY_MAP[lower]) return PORT_COUNTRY_MAP[lower];
  // Partial match
  for (const [key, country] of Object.entries(PORT_COUNTRY_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return country;
  }
  // Try 2-letter country code prefix from AIS (e.g. "AE FJR" → UAE)
  const aisMatch = lower.match(/^([a-z]{2})\s/);
  if (aisMatch) {
    const cc = { ae: 'UAE', sg: 'Singapore', nl: 'Netherlands', dz: 'Algeria', za: 'South Africa', in: 'India', ar: 'Argentina', br: 'Brazil', cn: 'China', jp: 'Japan', kr: 'South Korea', pk: 'Pakistan', om: 'Oman', ir: 'Iran', iq: 'Iraq', sa: 'Saudi Arabia', qa: 'Qatar', bh: 'Bahrain', kw: 'Kuwait', eg: 'Egypt' };
    if (cc[aisMatch[1]]) return cc[aisMatch[1]];
  }
  return null;
}

// --- Known port locations for reverse geocoding ---
const KNOWN_PORTS = [
  { name: 'Ruwais', country: 'UAE', lat: 24.11, lng: 52.73, r: 0.15 },
  { name: 'Jebel Ali', country: 'UAE', lat: 25.01, lng: 55.06, r: 0.12 },
  { name: 'Fujairah', country: 'UAE', lat: 25.15, lng: 56.35, r: 0.15 },
  { name: 'Khor Fakkan', country: 'UAE', lat: 25.35, lng: 56.35, r: 0.10 },
  { name: 'Abu Dhabi', country: 'UAE', lat: 24.45, lng: 54.40, r: 0.15 },
  { name: 'Das Island', country: 'UAE', lat: 25.15, lng: 52.87, r: 0.10 },
  { name: 'Zirku Island', country: 'UAE', lat: 24.88, lng: 53.07, r: 0.10 },
  { name: 'Musaffah', country: 'UAE', lat: 24.35, lng: 54.50, r: 0.10 },
  { name: 'Khalifa Port', country: 'UAE', lat: 24.82, lng: 54.65, r: 0.10 },
  { name: 'Ras Tanura', country: 'Saudi Arabia', lat: 26.64, lng: 50.16, r: 0.15 },
  { name: 'Jubail', country: 'Saudi Arabia', lat: 27.02, lng: 49.66, r: 0.15 },
  { name: 'Yanbu', country: 'Saudi Arabia', lat: 24.09, lng: 38.06, r: 0.15 },
  { name: 'Ras Laffan', country: 'Qatar', lat: 25.93, lng: 51.55, r: 0.15 },
  { name: 'Mesaieed', country: 'Qatar', lat: 24.98, lng: 51.57, r: 0.10 },
  { name: 'Mina Al Ahmadi', country: 'Kuwait', lat: 29.05, lng: 48.18, r: 0.12 },
  { name: 'Shuwaikh', country: 'Kuwait', lat: 29.35, lng: 47.92, r: 0.10 },
  { name: 'Basra', country: 'Iraq', lat: 29.82, lng: 48.82, r: 0.20 },
  { name: 'Sohar', country: 'Oman', lat: 24.37, lng: 56.73, r: 0.12 },
  { name: 'Muscat', country: 'Oman', lat: 23.63, lng: 58.57, r: 0.15 },
  { name: 'Duqm', country: 'Oman', lat: 19.67, lng: 57.70, r: 0.15 },
  { name: 'Salalah', country: 'Oman', lat: 16.95, lng: 54.00, r: 0.15 },
  { name: 'Bahrain', country: 'Bahrain', lat: 26.23, lng: 50.55, r: 0.15 },
  { name: 'Bandar Abbas', country: 'Iran', lat: 27.19, lng: 56.27, r: 0.15 },
  { name: 'Kharg Island', country: 'Iran', lat: 29.24, lng: 50.31, r: 0.12 },
  { name: 'Mumbai', country: 'India', lat: 18.95, lng: 72.85, r: 0.20 },
  { name: 'Mundra', country: 'India', lat: 22.74, lng: 69.72, r: 0.15 },
  { name: 'Karachi', country: 'Pakistan', lat: 24.80, lng: 66.98, r: 0.20 },
  { name: 'Singapore', country: 'Singapore', lat: 1.26, lng: 103.82, r: 0.30 },
  { name: 'Jeddah', country: 'Saudi Arabia', lat: 21.48, lng: 39.17, r: 0.15 },
  { name: 'Suez', country: 'Egypt', lat: 29.97, lng: 32.55, r: 0.15 },
];

function reverseGeocode(lat, lng) {
  if (!lat || !lng) return { name: 'Unknown', country: 'Unknown' };
  for (const port of KNOWN_PORTS) {
    const dlat = Math.abs(lat - port.lat);
    const dlng = Math.abs(lng - port.lng);
    if (dlat <= port.r && dlng <= port.r) {
      return { name: port.name, country: port.country };
    }
  }
  // Fallback to area-based description
  const area = classifyArea(lat, lng);
  if (area === 'Arabian Gulf') return { name: 'Arabian Gulf (at sea)', country: '-' };
  if (area === 'Gulf of Oman') return { name: 'Gulf of Oman (at sea)', country: '-' };
  if (area === 'SOH') return { name: 'Strait of Hormuz (transit)', country: '-' };
  if (area === 'Red Sea') return { name: 'Red Sea (at sea)', country: '-' };
  return { name: `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`, country: '-' };
}

// --- Kpler auth ---
let TOKEN = process.env.KPLER_ACCESS_TOKEN;
if (!TOKEN) {
  const tokenFile = path.join(OUT_DIR, '.token.txt');
  if (fs.existsSync(tokenFile)) {
    TOKEN = fs.readFileSync(tokenFile, 'utf-8').trim();
    console.log('[adnoc-fleet] Read token from soh-data/.token.txt');
  }
}
if (!TOKEN) {
  console.error('[adnoc-fleet] ERROR: Set KPLER_ACCESS_TOKEN or save token to soh-data/.token.txt');
  process.exit(1);
}

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

// --- Process a raw Kpler vessel into enriched record ---
function processVessel(raw, config) {
  const lat = raw.lastPosition?.geo?.lat || null;
  const lng = raw.lastPosition?.geo?.lon || null;
  const speed = raw.lastPosition?.speed || 0;
  const course = raw.lastPosition?.course || 0;
  const state = (raw.state || 'unknown').toLowerCase();

  const area = classifyArea(lat, lng);
  const aoi = isAreaOfInterest(area);
  const bound = classifyBound(lat, lng, course, speed, area, state);
  const status = deriveStatus(speed, state);
  const location = reverseGeocode(lat, lng);

  // Destination info
  const destZoneName = raw.nextDestination?.zone?.name || null;
  const aisDestination = raw.lastPosition?.destination || null;
  const destinationPort = destZoneName || aisDestination || null;

  // Derive destination country from port name
  let destinationCountry = lookupCountry(destinationPort);
  if (!destinationCountry && destinationPort) {
    const match = KNOWN_PORTS.find(p =>
      destinationPort.toLowerCase().includes(p.name.toLowerCase())
    );
    if (match) destinationCountry = match.country;
  }

  // Departure info from lastPortCall
  const lastPortCall = raw.portCallInfo?.lastPortCall || null;
  const voyageETD = lastPortCall?.end || null;

  // Try to get departure port from portCallInfo zone (if Kpler includes it)
  let departurePort = lastPortCall?.zone?.name || null;
  let departureCountry = null;
  if (departurePort) {
    const match = KNOWN_PORTS.find(p =>
      departurePort.toLowerCase().includes(p.name.toLowerCase())
    );
    if (match) departureCountry = match.country;
  }

  // Cargo type
  const product = raw.lastPosition?.currentCargo?.products?.[0]?.name || null;
  const commodityType = raw.commodityTypes?.[0] || null;
  const cargoType = product || commodityType || null;

  return {
    company: raw.vesselController?.default?.name || 'ADNOC L&S',
    name: raw.name || config.name || 'Unknown',
    imo: raw.imo || config.imo,
    mmsi: raw.mmsi || null,
    flagName: raw.flagName || null,
    ownership: config.ownership || 'ADNOC L&S',
    vesselType: raw.vesselTypeClass || null,
    cargoType,
    currentLocation: location.name,
    locationCountry: location.country,
    departurePort,
    departureCountry,
    destinationCountry,
    destinationPort,
    voyageETD,
    eta: raw.nextDestination?.eta || null,
    area,
    areaOfInterest: aoi,
    bound,
    currentStatus: status,
    lastPort: departurePort || null,
    rawAisDestination: raw.lastRawAisSignals?.rawDestination || null,
    // Extra fields for frontend
    lat,
    lng,
    speed,
    course,
    state,
    deadWeight: raw.deadWeight || null,
    capacity: raw.cargoMetrics?.capacity || null,
    draught: raw.lastPosition?.draught || null,
    marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${raw.imo || config.imo}`,
    dataSource: 'kpler',
  };
}

// --- MINT integration ---
const MINT_TOKEN_FILE = path.join(OUT_DIR, '.mint-token.json');
const MINT_BOUNDARIES = { east: 80, north: 45, south: -40, west: -10 };
const MF = { LNG: 0, LAT: 1, IMO: 2, MMSI: 3, NAME: 4, HEADING: 5, SPEED: 6, UNKNOWN7: 7, LADEN: 8, DWT: 9, CAPACITY: 10, DEST: 11, TYPE: 12 };

function getMintToken() {
  if (!fs.existsSync(MINT_TOKEN_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(MINT_TOKEN_FILE, 'utf-8'));
    if (data.token && data.expiresAt && Date.now() < data.expiresAt) return data.token;
    if (data.token && !data.expiresAt) return data.token;
    return null;
  } catch { return null; }
}

function mintPost(url, body, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-auth-token': token,
        'x-map-markers-request': 'true',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) { reject(new Error(`MINT ${res.statusCode}: ${data.substring(0, 200)}`)); return; }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`MINT JSON parse error`)); }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function processMintVessel(ship, config) {
  const lng = ship[MF.LNG];
  const lat = ship[MF.LAT];
  const speed = (ship[MF.SPEED] != null && ship[MF.SPEED] < 50) ? ship[MF.SPEED] : 0;
  const course = ship[MF.HEADING] || 0;
  const state = ship[MF.LADEN] ? 'loaded' : 'ballast';

  const area = classifyArea(lat, lng);
  const aoi = isAreaOfInterest(area);
  const bound = classifyBound(lat, lng, course, speed, area, state);
  const status = deriveStatus(speed, state);
  const location = reverseGeocode(lat, lng);

  return {
    company: 'ADNOC L&S',
    name: ship[MF.NAME] || config.name || 'Unknown',
    imo: String(ship[MF.IMO] || config.imo),
    mmsi: String(ship[MF.MMSI] || ''),
    flagName: null,
    ownership: config.ownership || 'ADNOC L&S',
    vesselType: null,
    cargoType: null,
    currentLocation: location.name,
    locationCountry: location.country,
    departurePort: null,
    departureCountry: null,
    destinationCountry: null,
    destinationPort: ship[MF.DEST] || null,
    voyageETD: null,
    eta: null,
    area,
    areaOfInterest: aoi,
    bound,
    currentStatus: status,
    lastPort: null,
    rawAisDestination: ship[MF.DEST] || null,
    lat,
    lng,
    speed,
    course,
    state,
    deadWeight: ship[MF.DWT] || null,
    capacity: ship[MF.CAPACITY] || null,
    draught: null,
    marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${ship[MF.IMO] || config.imo}`,
    dataSource: 'mint',
  };
}

// --- Main ---
async function main() {
  console.log('=== ADNOC Fleet Sync: Fetching live data from Kpler + MINT ===\n');

  // Load fleet config
  if (!fs.existsSync(FLEET_CONFIG)) {
    console.error('[adnoc-fleet] ERROR: adnoc-fleet.json not found');
    process.exit(1);
  }
  const fleetConfig = JSON.parse(fs.readFileSync(FLEET_CONFIG, 'utf-8'));
  const imoSet = new Set(fleetConfig.vessels.map(v => v.imo));
  const configMap = new Map(fleetConfig.vessels.map(v => [v.imo, v]));
  console.log(`[adnoc-fleet] Loaded ${imoSet.size} IMOs from adnoc-fleet.json`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Refresh Kpler JWT from Chrome (unless master-sync preflight already did)
  if (!process.env.MASTER_SYNC) {
    console.log('[adnoc-fleet] Refreshing Kpler token from Chrome...');
    const { spawnSync } = require('child_process');
    const rk = spawnSync('node', [path.join(__dirname, 'extract-kpler-token.js')], { stdio: 'ignore' });
    switch (rk.status) {
      case 0:
        console.log('[adnoc-fleet] Kpler token ✓ extracted from Chrome');
        TOKEN = fs.readFileSync(path.join(OUT_DIR, '.token.txt'), 'utf-8').trim();
        break;
      case 1: console.log('[adnoc-fleet] ⚠ Chrome not reachable — using cached Kpler token if any'); break;
      case 2: console.log('[adnoc-fleet] ⚠ Kpler login required — log into terminal.kpler.com in Chrome'); break;
      case 3: console.log('[adnoc-fleet] ⚠ Kpler token not found in Chrome localStorage — using cached token'); break;
      default: console.log(`[adnoc-fleet] ⚠ Kpler extraction failed (rc=${rk.status}) — using cached token`);
    }
  }

  // Refresh MINT token from Chrome (unless master-sync preflight already did)
  if (!process.env.MASTER_SYNC) {
    console.log('[adnoc-fleet] Refreshing MINT token from Chrome...');
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', [path.join(__dirname, 'extract-mint-token.js')], { stdio: 'ignore' });
    switch (r.status) {
      case 0: console.log('[adnoc-fleet] MINT token ✓ extracted from Chrome'); break;
      case 1: console.log('[adnoc-fleet] ⚠ Chrome not reachable — using cached MINT token if any'); break;
      case 2: console.log('[adnoc-fleet] ⚠ MINT login required — log into marketintelligencenetwork.com in Chrome'); break;
      case 3: console.log('[adnoc-fleet] ⚠ MINT extraction timeout — using cached MINT token if any'); break;
      default: console.log(`[adnoc-fleet] ⚠ MINT extraction failed (rc=${r.status}) — using cached MINT token if any`);
    }
  }

  // Fetch ALL vessels from Kpler (no bounding box filter)
  console.log('[adnoc-fleet] Fetching vessels from Kpler...');
  let allVessels;
  try {
    allVessels = await kplerGet(`/api/vessels?zones=${HORMUZ_ZONE_ID}&size=10000`);
    console.log(`[adnoc-fleet] Received ${allVessels.length} vessels from Kpler`);
  } catch (e) {
    console.error(`[adnoc-fleet] ERROR fetching vessels: ${e.message}`);
    process.exit(1);
  }

  // Match by IMO — no bounding box filter
  const matched = [];
  const matchedIMOs = new Set();
  for (const v of allVessels) {
    if (v.imo && imoSet.has(v.imo)) {
      matched.push(v);
      matchedIMOs.add(v.imo);
    }
  }
  console.log(`[adnoc-fleet] Matched ${matched.length}/${imoSet.size} ADNOC vessels in Kpler response`);

  // Log unmatched IMOs
  const unmatched = [...imoSet].filter(imo => !matchedIMOs.has(imo));
  if (unmatched.length > 0) {
    console.log(`[adnoc-fleet] ${unmatched.length} IMOs not found in Kpler zone response:`);
    unmatched.forEach(imo => console.log(`  - ${imo}`));
  }

  // Save raw Kpler data for matched vessels
  fs.writeFileSync(
    path.join(OUT_DIR, 'adnoc-fleet-raw.json'),
    JSON.stringify(matched, null, 2)
  );
  console.log(`[adnoc-fleet] Raw data saved to soh-data/adnoc-fleet-raw.json`);

  // Process each vessel
  const processed = matched.map(raw => {
    const config = configMap.get(raw.imo) || { imo: raw.imo, ownership: 'ADNOC L&S' };
    return processVessel(raw, config);
  });

  // --- MINT: supplement destination + fill unmatched vessels ---
  let mintMatched = 0;
  let mintDestSupplemented = 0;
  const mintToken = getMintToken();
  if (mintToken) {
    console.log('[adnoc-fleet] Fetching MINT data for all ADNOC vessels...');
    try {
      const mintData = await mintPost(
        `https://www.marketintelligencenetwork.com/mint-app/rest/ships/markers?noCache=${Date.now()}`,
        { alreadyInDotsMarkersMode: false, boundaries: MINT_BOUNDARIES, requestedByTimer: false, zoomLevel: 7 },
        mintToken
      );
      const mintShips = mintData.ships || [];
      console.log(`[adnoc-fleet] MINT returned ${mintShips.length} vessels in Gulf region`);

      // Build IMO→MINT ship lookup
      const mintByImo = new Map();
      for (const ship of mintShips) {
        const shipImo = String(ship[MF.IMO] || '');
        if (shipImo && imoSet.has(shipImo)) mintByImo.set(shipImo, ship);
      }

      // Supplement Kpler vessels with MINT data (status, state, destination)
      let mintStatusOverridden = 0;
      for (const v of processed) {
        if (!mintByImo.has(v.imo)) continue;
        const mintShip = mintByImo.get(v.imo);

        // Override speed + state from MINT (MINT is lead for status)
        const mintSpeed = (mintShip[MF.SPEED] != null && mintShip[MF.SPEED] < 50) ? mintShip[MF.SPEED] : null;
        const mintLaden = mintShip[MF.LADEN];
        if (mintSpeed !== null) v.speed = mintSpeed;
        if (mintLaden !== undefined) v.state = mintLaden ? 'loaded' : 'ballast';
        // Re-derive status and bound from MINT-overridden values
        v.currentStatus = deriveStatus(v.speed, v.state);
        v.bound = classifyBound(v.lat, v.lng, v.course, v.speed, v.area, v.state);
        mintStatusOverridden++;

        // Supplement destination if empty
        if (!v.destinationPort) {
          const mintDest = mintShip[MF.DEST];
          if (mintDest) {
            v.destinationPort = mintDest;
            v.rawAisDestination = v.rawAisDestination || mintDest;
            v.destinationCountry = v.destinationCountry || lookupCountry(mintDest);
            mintDestSupplemented++;
          }
        }
      }
      if (mintStatusOverridden > 0) {
        console.log(`[adnoc-fleet] MINT overrode status for ${mintStatusOverridden} vessels`);
      }
      if (mintDestSupplemented > 0) {
        console.log(`[adnoc-fleet] MINT supplemented destination for ${mintDestSupplemented} vessels`);
      }

      // Fill unmatched vessels from MINT
      const unmatchedSet = new Set(unmatched);
      for (const [shipImo, ship] of mintByImo) {
        if (unmatchedSet.has(shipImo)) {
          const config = configMap.get(shipImo) || { imo: shipImo, ownership: 'ADNOC L&S' };
          processed.push(processMintVessel(ship, config));
          unmatchedSet.delete(shipImo);
          mintMatched++;
        }
      }
      console.log(`[adnoc-fleet] MINT matched ${mintMatched} additional vessels`);

      // Update unmatched list
      unmatched.length = 0;
      unmatched.push(...unmatchedSet);
    } catch (e) {
      console.log(`[adnoc-fleet] MINT fetch failed (non-fatal): ${e.message}`);
    }
  } else {
    console.log('[adnoc-fleet] No MINT token available — skipping MINT');
  }

  // Add placeholder entries for still-unmatched IMOs
  for (const imo of unmatched) {
    const config = configMap.get(imo) || { imo, ownership: 'ADNOC L&S' };
    processed.push({
      company: 'ADNOC L&S',
      name: config.name || 'Unknown',
      imo,
      mmsi: null,
      flagName: null,
      ownership: config.ownership || 'ADNOC L&S',
      vesselType: null,
      cargoType: null,
      currentLocation: 'Data unavailable',
      locationCountry: null,
      departurePort: null,
      departureCountry: null,
      destinationCountry: null,
      destinationPort: null,
      voyageETD: null,
      eta: null,
      area: 'Unknown',
      areaOfInterest: false,
      bound: 'Unknown',
      currentStatus: 'Unknown',
      lastPort: null,
      lat: null,
      lng: null,
      speed: null,
      course: null,
      state: 'unknown',
      deadWeight: null,
      capacity: null,
      draught: null,
      marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${imo}`,
      dataSource: 'unavailable',
    });
  }

  // Sort: vessels with data first (by name), then unavailable
  processed.sort((a, b) => {
    if (a.dataSource === 'unavailable' && b.dataSource !== 'unavailable') return 1;
    if (a.dataSource !== 'unavailable' && b.dataSource === 'unavailable') return -1;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Summary stats
  const withData = processed.filter(v => v.dataSource !== 'unavailable');
  const underway = withData.filter(v => v.currentStatus === 'Under Way').length;
  const anchored = withData.filter(v => v.currentStatus === 'Anchored').length;
  const moored = withData.filter(v => v.currentStatus === 'Moored').length;
  const inAOI = withData.filter(v => v.areaOfInterest).length;
  const areas = {};
  withData.forEach(v => { areas[v.area] = (areas[v.area] || 0) + 1; });

  const output = {
    vessels: processed,
    count: processed.length,
    matched: matched.length,
    unmatched: unmatched.length,
    summary: {
      total: processed.length,
      withData: withData.length,
      underway,
      anchored,
      moored,
      inAreaOfInterest: inAOI,
      areas,
    },
    syncTimestamp: new Date().toISOString(),
  };

  // Backup previous data before overwriting
  const fleetDataPath = path.join(OUT_DIR, 'adnoc-fleet-data.json');
  if (fs.existsSync(fleetDataPath)) {
    fs.copyFileSync(fleetDataPath, path.join(OUT_DIR, 'adnoc-fleet-data.prev.json'));
  }

  fs.writeFileSync(fleetDataPath, JSON.stringify(output, null, 2));

  console.log(`\n[adnoc-fleet] Results:`);
  console.log(`  Total: ${processed.length} vessels`);
  console.log(`  Kpler: ${matched.length}, MINT: ${mintMatched}, Unmatched: ${unmatched.length}`);
  console.log(`  Under Way: ${underway}, Anchored: ${anchored}, Moored: ${moored}`);
  console.log(`  In Area of Interest: ${inAOI}`);
  console.log(`  Areas:`, areas);
  console.log(`\n[adnoc-fleet] Output: soh-data/adnoc-fleet-data.json`);

  // --- Chartered / FOB vessels at ADNOC ports ---
  console.log('\n[adnoc-fleet] Finding chartered/FOB vessels at ADNOC ports...');
  const ADNOC_PORTS = [
    { name: 'Ruwais', lat: 24.11, lng: 52.73 },
    { name: 'Jebel Dhanna', lat: 24.19, lng: 52.61 },
    { name: 'Das Island', lat: 25.15, lng: 52.87 },
    { name: 'Zirku Island', lat: 24.88, lng: 53.07 },
    { name: 'Musaffah', lat: 24.35, lng: 54.50 },
    { name: 'Khalifa Port', lat: 24.82, lng: 54.65 },
    { name: 'Abu Dhabi', lat: 24.45, lng: 54.40 },
    { name: 'Fujairah', lat: 25.15, lng: 56.35 },
  ];
  const NM10_DEG = 10 / 60; // 10 nautical miles in degrees (~0.167)

  function findNearPort(lat, lng) {
    for (const port of ADNOC_PORTS) {
      const dlat = Math.abs(lat - port.lat);
      const dlng = Math.abs(lng - port.lng);
      if (dlat <= NM10_DEG && dlng <= NM10_DEG) return port.name;
    }
    return null;
  }

  const chartered = [];
  for (const v of allVessels) {
    if (!v.lastPosition?.geo) continue;
    if (v.imo && imoSet.has(v.imo)) continue; // skip ADNOC L&S vessels
    const lat = v.lastPosition.geo.lat;
    const lng = v.lastPosition.geo.lon;
    const nearPort = findNearPort(lat, lng);
    if (!nearPort) continue;
    const config = { imo: v.imo, ownership: 'Chartered/FOB' };
    const vessel = processVessel(v, config);
    vessel.nearPort = nearPort;
    vessel.ownership = 'Chartered/FOB';
    chartered.push(vessel);
  }

  // --- Port-specific filtering ---
  const ADNOC_CRUDE_CARGO = ['murban', 'das', 'upper zakum', 'crude', 'condensate', 'middle east'];
  const FUJAIRAH_EXCLUDED_CARGO = ['wheat', 'corn', 'steel', 'iron ore', 'copper', 'bentonite',
    'dry bulk', 'major bulks', 'minor bulks', 'sand', 'sugar',
    'high sulfur fuel oil', 'low sulfur fuel oil', 'fuel oils',
    'methanol', 'palm oil', 'liquids', 'clean petroleum products', 'chem/bio',
    'very low sulphur fuel oil'];
  const KHALIFA_EXCLUDED_CARGO = ['thermal coal', 'minor bulks'];

  function isAdnocController(company) {
    const c = (company || '').toLowerCase();
    return c.includes('adnoc') || c.includes('abu dhabi');
  }

  const filteredChartered = chartered.filter(v => {
    const cargo = (v.cargoType || '').toLowerCase();
    const port = v.nearPort;

    // Khalifa Port: exclude dry bulk
    if (port === 'Khalifa Port') {
      return !KHALIFA_EXCLUDED_CARGO.some(ex => cargo.includes(ex));
    }

    // Fujairah: ADNOC-controlled OR ADNOC crude grades only
    if (port === 'Fujairah') {
      if (isAdnocController(v.company)) return true;
      if (ADNOC_CRUDE_CARGO.some(c => cargo.includes(c))) return true;
      // Nave Estella (Aramco, Gasoil) — specific FOB lifter
      if ((v.company || '').toLowerCase().includes('aramco') && cargo.includes('gasoil')) return true;
      return false;
    }

    // All other ADNOC ports: include everything
    return true;
  });

  filteredChartered.sort((a, b) => (a.nearPort || '').localeCompare(b.nearPort || '') || (a.name || '').localeCompare(b.name || ''));

  console.log(`[adnoc-fleet] Pre-filter: ${chartered.length}, Post-filter: ${filteredChartered.length}`);

  const charteredByPort = {};
  filteredChartered.forEach(v => { charteredByPort[v.nearPort] = (charteredByPort[v.nearPort] || 0) + 1; });
  const charteredLoaded = filteredChartered.filter(v => v.state === 'loaded').length;
  const charteredBallast = filteredChartered.filter(v => v.state === 'ballast').length;

  const charteredOutput = {
    vessels: filteredChartered,
    count: filteredChartered.length,
    summary: {
      total: filteredChartered.length,
      loaded: charteredLoaded,
      ballast: charteredBallast,
      byPort: charteredByPort,
    },
    syncTimestamp: new Date().toISOString(),
  };

  const charteredDataPath = path.join(OUT_DIR, 'adnoc-chartered-data.json');
  if (fs.existsSync(charteredDataPath)) {
    fs.copyFileSync(charteredDataPath, path.join(OUT_DIR, 'adnoc-chartered-data.prev.json'));
  }
  fs.writeFileSync(charteredDataPath, JSON.stringify(charteredOutput, null, 2));

  console.log(`[adnoc-fleet] Chartered/FOB: ${chartered.length} vessels at ADNOC ports`);
  console.log(`  By port:`, charteredByPort);
  console.log(`  Loaded: ${charteredLoaded}, Ballast: ${charteredBallast}`);
  console.log(`[adnoc-fleet] Output: soh-data/adnoc-chartered-data.json`);

  // --- Non-ADNOC vessels inbound to UAE (global) ---
  console.log('\n[adnoc-fleet] Finding non-ADNOC vessels inbound to UAE (global)...');
  let globalVessels;
  try {
    globalVessels = await kplerGet('/api/vessels?size=50000');
    console.log(`[adnoc-fleet] Global query returned ${globalVessels.length} vessels`);
  } catch (e) {
    console.log(`[adnoc-fleet] Global vessel query failed (non-fatal): ${e.message}`);
    globalVessels = [];
  }

  const EXCLUDED_UAE_TYPES = ['Small Tankers', 'Short Sea Tankers', 'Mini Bulker'];
  const uaeInbound = [];
  for (const v of globalVessels) {
    if (!v.lastPosition?.geo) continue;
    if (v.imo && imoSet.has(v.imo)) continue; // skip ADNOC L&S vessels
    const lat = v.lastPosition.geo.lat;
    const lng = v.lastPosition.geo.lon;
    const area = classifyArea(lat, lng);
    if (area === 'Strait of Hormuz') continue; // outside strait only
    const config = { imo: v.imo, ownership: 'Non-ADNOC' };
    const vessel = processVessel(v, config);
    if (EXCLUDED_UAE_TYPES.includes(vessel.vesselType)) continue;
    if (vessel.destinationCountry !== 'UAE') continue;
    uaeInbound.push(vessel);
  }

  uaeInbound.sort((a, b) => (a.area || '').localeCompare(b.area || '') || (a.name || '').localeCompare(b.name || ''));

  const uaeByArea = {};
  const uaeByDestPort = {};
  uaeInbound.forEach(v => {
    uaeByArea[v.area] = (uaeByArea[v.area] || 0) + 1;
    if (v.destinationPort) uaeByDestPort[v.destinationPort] = (uaeByDestPort[v.destinationPort] || 0) + 1;
  });
  const uaeLoaded = uaeInbound.filter(v => v.state === 'loaded').length;
  const uaeBallast = uaeInbound.filter(v => v.state === 'ballast').length;
  const uaeUnderWay = uaeInbound.filter(v => v.currentStatus === 'Under Way').length;

  const uaeInboundOutput = {
    vessels: uaeInbound,
    count: uaeInbound.length,
    summary: {
      total: uaeInbound.length,
      loaded: uaeLoaded,
      ballast: uaeBallast,
      underWay: uaeUnderWay,
      byArea: uaeByArea,
      byDestPort: uaeByDestPort,
    },
    syncTimestamp: new Date().toISOString(),
  };

  const uaeInboundPath = path.join(OUT_DIR, 'adnoc-uae-inbound-data.json');
  if (fs.existsSync(uaeInboundPath)) {
    fs.copyFileSync(uaeInboundPath, path.join(OUT_DIR, 'adnoc-uae-inbound-data.prev.json'));
  }
  fs.writeFileSync(uaeInboundPath, JSON.stringify(uaeInboundOutput, null, 2));

  console.log(`[adnoc-fleet] UAE Inbound: ${uaeInbound.length} non-ADNOC vessels heading to UAE`);
  console.log(`  By area:`, uaeByArea);
  console.log(`  By dest port:`, uaeByDestPort);
  console.log(`  Under Way: ${uaeUnderWay}, Loaded: ${uaeLoaded}, Ballast: ${uaeBallast}`);
  console.log(`[adnoc-fleet] Output: soh-data/adnoc-uae-inbound-data.json`);

  // Commit and push adnoc fleet data (only when run standalone)
  if (!process.env.MASTER_SYNC) {
    const { execSync } = require('child_process');
    const repoRoot = path.join(__dirname, '..');
    console.log('\n[adnoc-fleet] Checking for changes...');

    let hasChanges = false;
    try {
      execSync('git diff --quiet -- soh-data/adnoc-*.json', { cwd: repoRoot, stdio: 'ignore' });
    } catch {
      hasChanges = true;
    }

    if (!hasChanges) {
      console.log('[adnoc-fleet] No changes detected.');
      return;
    }

    console.log('[adnoc-fleet] Changes detected, committing and pushing...');
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    try {
      execSync('git add soh-data/adnoc-*.json', { cwd: repoRoot, stdio: 'inherit' });
      execSync(`git commit -m "chore: ADNOC fleet data sync (${ts})"`, { cwd: repoRoot, stdio: 'inherit' });
    } catch (e) {
      console.log(`[adnoc-fleet] ⚠ Git commit failed: ${e.message}`);
      return;
    }
    try {
      execSync('git push origin master', { cwd: repoRoot, stdio: 'inherit' });
      console.log('[adnoc-fleet] Pushed to origin/master');
    } catch {
      console.log('[adnoc-fleet] ⚠ Push to origin/master failed');
    }
    try {
      execSync('git push origin master:main', { cwd: repoRoot, stdio: 'inherit' });
      console.log('[adnoc-fleet] Pushed to origin/main');
    } catch {
      console.log('[adnoc-fleet] ⚠ Push to origin/main failed');
    }
  }
}

main().catch(err => {
  console.error(`[adnoc-fleet] FATAL: ${err.message}`);
  process.exit(1);
});
