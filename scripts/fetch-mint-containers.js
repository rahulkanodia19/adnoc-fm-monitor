#!/usr/bin/env node
/**
 * fetch-mint-containers.js — Fetches container ship data directly from S&P MINT
 * Replaces dependency on als-monitor.netlify.app
 *
 * Auth flow:
 *   1. Okta OAuth2 login → access_token (1hr)
 *   2. POST /mint-app/rest/third-party/third-party-validator → x-auth-token (~24hr)
 *   3. POST /mint-app/rest/ships/markers with Gulf boundaries → vessel data
 *
 * Token management:
 *   - Reads x-auth-token from soh-data/.mint-token.json
 *   - Token lasts ~24hrs; refresh by re-running with --refresh-token via Chrome
 *   - Or pass --token "email:SPGI:ts:hash" directly
 *
 * Usage:
 *   node scripts/fetch-mint-containers.js
 *   node scripts/fetch-mint-containers.js --token "rkanodia@adnoc.ae:SPGI:..."
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SOH_DIR = path.join(__dirname, '..', 'soh-data');
const TOKEN_FILE = path.join(SOH_DIR, '.mint-token.json');
const CACHE_FILE = path.join(SOH_DIR, '.container-cache.json');

// Gulf/Hormuz bounding box (matches SOH tracker region)
const GULF_BOUNDARIES = { east: 60, north: 32, south: 22, west: 46 };

// MINT vessel type codes
const VESSEL_TYPE_CONTAINER = 8;

// MINT ships array field indices
const F = {
  LNG: 0, LAT: 1, IMO: 2, MMSI: 3, NAME: 4,
  HEADING: 5, SPEED: 6, UNKNOWN7: 7, LADEN: 8,
  DWT: 9, CAPACITY: 10, DEST: 11, TYPE: 12, COLOR: 13
};

function getToken() {
  // Check CLI --token arg
  const tokenArgIdx = process.argv.indexOf('--token');
  if (tokenArgIdx !== -1 && process.argv[tokenArgIdx + 1]) {
    return process.argv[tokenArgIdx + 1];
  }

  // Read from token file
  if (fs.existsSync(TOKEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    if (data.token && data.expiresAt && Date.now() < data.expiresAt) {
      return data.token;
    }
    if (data.token && !data.expiresAt) {
      console.warn('[mint] Token file has no expiry — using anyway');
      return data.token;
    }
    console.error('[mint] Token expired. Re-login to MINT and update token.');
    console.error('[mint] Run: node scripts/fetch-mint-containers.js --token "your-token"');
    process.exit(1);
  }

  console.error('[mint] No token found. Options:');
  console.error('  1. Pass directly: --token "email:SPGI:ts:hash"');
  console.error('  2. Save to soh-data/.mint-token.json: {"token":"...","expiresAt":...}');
  console.error('  3. Login to MINT in Chrome, open DevTools > Network, find any');
  console.error('     /mint-app/rest/ request and copy the x-auth-token header value.');
  process.exit(1);
}

function fetchJSON(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOpts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401) {
          reject(new Error('401 Unauthorized — token expired or invalid'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function fetchShipMarkers(token) {
  const url = `https://www.marketintelligencenetwork.com/mint-app/rest/ships/markers?noCache=${Date.now()}`;
  return fetchJSON(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-auth-token': token,
      'x-map-markers-request': 'true',
    },
    body: JSON.stringify({
      alreadyInDotsMarkersMode: false,
      boundaries: GULF_BOUNDARIES,
      requestedByTimer: false,
      zoomLevel: 7,
    }),
  });
}

async function main() {
  const token = getToken();
  console.log('[mint] Fetching vessel data from S&P MINT...');

  const data = await fetchShipMarkers(token);
  const ships = data.ships || [];
  console.log(`[mint] Received ${ships.length} vessels in Gulf region`);

  // Filter container ships (type 8)
  const containers = ships.filter(s => s[F.TYPE] === VESSEL_TYPE_CONTAINER);
  console.log(`[mint] Found ${containers.length} container ships`);

  // Map to flat vessel array (inside/outside classification done by process-soh.js
  // using its authoritative 17-waypoint Gulf boundary)
  const vessels = containers.map(s => ({
    name: s[F.NAME],
    imo: s[F.IMO],
    mmsi: s[F.MMSI],
    lng: s[F.LNG],
    lat: s[F.LAT],
    laden: s[F.LADEN],
    dwt: s[F.DWT],
    destination: s[F.DEST],
    // MINT uses 99.9 as sentinel for "speed unavailable" — clamp to 0
    speed: (s[F.SPEED] != null && s[F.SPEED] < 50) ? s[F.SPEED] : 0,
    heading: s[F.HEADING],
  }));

  const cache = {
    vessels,
    total: vessels.length,
    source: 'S&P MINT (direct API)',
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`[mint] ${vessels.length} container ships written to cache`);

  // Save token for reuse if passed via --token
  const tokenArgIdx = process.argv.indexOf('--token');
  if (tokenArgIdx !== -1 && process.argv[tokenArgIdx + 1]) {
    const tokenParts = process.argv[tokenArgIdx + 1].split(':');
    // Token format: email:SPGI:expiryTimestamp:hash
    const expiresAt = tokenParts.length >= 3 ? parseInt(tokenParts[2]) : Date.now() + 24 * 60 * 60 * 1000;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({
      token: process.argv[tokenArgIdx + 1],
      expiresAt,
      savedAt: new Date().toISOString(),
    }, null, 2));
    console.log(`[mint] Token saved to ${path.relative(process.cwd(), TOKEN_FILE)}`);
  }

  console.log(`[mint] Cache written to ${path.relative(process.cwd(), CACHE_FILE)}`);
}

main().catch(err => {
  console.error(`[mint] ERROR: ${err.message}`);
  process.exit(1);
});
