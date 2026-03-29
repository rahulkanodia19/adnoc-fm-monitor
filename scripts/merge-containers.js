#!/usr/bin/env node
/**
 * merge-containers.js — Merges container ship data into vessels.json
 * Source: S&P MINT direct API or als-monitor fallback (soh-data/.container-cache.json)
 * Run after Kpler sync, before process-soh.js
 */

const fs = require('fs');
const path = require('path');

const SOH_DIR = path.join(__dirname, '..', 'soh-data');
const VESSELS_FILE = path.join(SOH_DIR, 'vessels.json');
const CACHE_FILE = path.join(SOH_DIR, '.container-cache.json');

// Fallback positions only used when cache has no per-vessel data (legacy als-monitor format)
const INSIDE_POSITIONS = [
  { lat: 25.0, lng: 55.1 },  // Jebel Ali
  { lat: 24.5, lng: 54.4 },  // Abu Dhabi
  { lat: 26.2, lng: 50.2 },  // Dammam
  { lat: 25.3, lng: 49.5 },  // Bahrain
  { lat: 25.9, lng: 55.8 },  // RAK
  { lat: 29.4, lng: 48.0 },  // Kuwait
  { lat: 27.2, lng: 56.3 },  // Bandar Abbas
  { lat: 26.6, lng: 51.5 },  // Qatar
];

const OUTSIDE_POSITIONS = [
  { lat: 25.2, lng: 56.4 },  // Fujairah
  { lat: 25.3, lng: 56.5 },  // Khor Fakkan
  { lat: 24.5, lng: 56.7 },  // Sohar approach
  { lat: 24.0, lng: 57.5 },  // Muscat approach
];

function buildVesselFromRichData(v, dataSource) {
  return {
    name: v.name,
    imo: String(v.imo || ''),
    mmsi: String(v.mmsi || ''),
    vesselTypeClass: 'Container Ship',
    state: v.laden ? 'loaded' : 'ballast',
    flagName: '',
    deadWeight: v.dwt || null,
    commodityTypes: ['container'],
    capacity: null,
    // MINT uses 99.9 as sentinel for "speed unavailable" — clamp to 0
    speed: (v.speed != null && v.speed < 50) ? v.speed : 0,
    course: v.heading || 0,
    lat: v.lat,
    lng: v.lng,
    destination: v.destination || null,
    product: null,
    controller: null,
    lastPortCall: null,
    dataSource,
  };
}

function buildVesselFromCount(index, isInside, isBallast) {
  const positions = isInside ? INSIDE_POSITIONS : OUTSIDE_POSITIONS;
  const pos = positions[index % positions.length];
  const jitter = { lat: (Math.random() - 0.5) * 0.2, lng: (Math.random() - 0.5) * 0.2 };
  return {
    name: `Container Ship #${index + 1}`,
    imo: '',
    mmsi: '',
    vesselTypeClass: 'Container Ship',
    state: isBallast ? 'ballast' : 'loaded',
    flagName: '',
    deadWeight: null,
    commodityTypes: ['container'],
    capacity: null,
    speed: 0,
    course: 0,
    lat: pos.lat + jitter.lat,
    lng: pos.lng + jitter.lng,
    destination: null,
    product: null,
    controller: null,
    lastPortCall: null,
    dataSource: 'als-monitor',
  };
}

function main() {
  if (!fs.existsSync(VESSELS_FILE)) {
    console.error('[containers] ERROR: vessels.json not found');
    process.exit(1);
  }
  if (!fs.existsSync(CACHE_FILE)) {
    console.error('[containers] ERROR: .container-cache.json not found. Run fetch-mint-containers.js first.');
    process.exit(1);
  }

  const kplerVessels = JSON.parse(fs.readFileSync(VESSELS_FILE, 'utf-8'));
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));

  // Remove any previously merged containers (avoid duplicates on re-run)
  const dataSourceTag = cache.source?.includes('MINT') ? 'mint' : 'als-monitor';
  const filtered = kplerVessels.filter(v => v.vesselTypeClass !== 'Container Ship' || (v.dataSource !== 'als-monitor' && v.dataSource !== 'mint'));

  const containers = [];

  if (cache.vessels && Array.isArray(cache.vessels)) {
    // New flat format from fetch-mint-containers.js
    for (const v of cache.vessels) {
      containers.push(buildVesselFromRichData(v, 'mint'));
    }
    console.log(`[containers] Using MINT data: ${containers.length} vessels with real positions/IMOs`);
  } else if (cache.inside?.children?.length > 0) {
    // Old MINT format with inside/outside pre-classification (backward compat)
    for (const v of cache.inside.children) {
      containers.push(buildVesselFromRichData(v, 'mint'));
    }
    for (const v of (cache.outside?.children || [])) {
      containers.push(buildVesselFromRichData(v, 'mint'));
    }
    console.log(`[containers] Using legacy MINT data: ${containers.length} vessels`);
  } else if ((cache.inside?.total || 0) > 0 || (cache.outside?.total || 0) > 0) {
    // Legacy als-monitor format: only aggregate counts, generate synthetic vessels
    let idx = 0;
    for (let i = 0; i < (cache.inside?.total || 0); i++) {
      containers.push(buildVesselFromCount(idx++, true, i < (cache.inside?.ballast || 0)));
    }
    for (let i = 0; i < (cache.outside?.total || 0); i++) {
      containers.push(buildVesselFromCount(idx++, false, i < (cache.outside?.ballast || 0)));
    }
    console.log(`[containers] Using legacy count-only data: ${containers.length} synthetic vessels`);
  } else {
    console.log(`[containers] No container data available in cache`);
  }

  const merged = [...filtered, ...containers];
  fs.writeFileSync(VESSELS_FILE, JSON.stringify(merged, null, 2));

  console.log(`[containers] Added ${containers.length} container ships`);
  console.log(`[containers] Total vessels.json: ${merged.length} (Kpler: ${filtered.length} + Containers: ${containers.length})`);
  console.log(`[containers] Source: ${cache.source || 'unknown'}`);
}

main();
