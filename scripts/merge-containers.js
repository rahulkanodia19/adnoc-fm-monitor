#!/usr/bin/env node
/**
 * merge-containers.js — Merges container ship data from als-monitor into vessels.json
 * Source: als-monitor MarineTraffic snapshot (soh-data/.container-cache.json)
 * Run after Kpler sync, before process-soh.js
 */

const fs = require('fs');
const path = require('path');

const SOH_DIR = path.join(__dirname, '..', 'soh-data');
const VESSELS_FILE = path.join(SOH_DIR, 'vessels.json');
const CACHE_FILE = path.join(SOH_DIR, '.container-cache.json');

// Typical positions for inside/outside Gulf container anchorages
// Spread containers across realistic anchorage locations
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

function main() {
  if (!fs.existsSync(VESSELS_FILE)) {
    console.error('[containers] ERROR: vessels.json not found');
    process.exit(1);
  }
  if (!fs.existsSync(CACHE_FILE)) {
    console.error('[containers] ERROR: .container-cache.json not found. Run cache extraction first.');
    process.exit(1);
  }

  const kplerVessels = JSON.parse(fs.readFileSync(VESSELS_FILE, 'utf-8'));
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));

  // Check if containers already merged (avoid duplicates on re-run)
  const existingContainers = kplerVessels.filter(v => v.dataSource === 'als-monitor' && v.vesselTypeClass === 'Container Ship');
  if (existingContainers.length > 0) {
    console.log(`[containers] Already have ${existingContainers.length} containers in vessels.json. Removing before re-merge.`);
    const filtered = kplerVessels.filter(v => !(v.dataSource === 'als-monitor' && v.vesselTypeClass === 'Container Ship'));
    kplerVessels.length = 0;
    kplerVessels.push(...filtered);
  }

  const containers = [];

  // Generate inside container vessels
  for (let i = 0; i < cache.inside.total; i++) {
    const pos = INSIDE_POSITIONS[i % INSIDE_POSITIONS.length];
    const jitter = { lat: (Math.random() - 0.5) * 0.2, lng: (Math.random() - 0.5) * 0.2 };
    containers.push({
      name: `Container Ship #${i + 1}`,
      imo: '',
      mmsi: '',
      vesselTypeClass: 'Container Ship',
      state: i < cache.inside.ballast ? 'ballast' : 'loaded',
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
    });
  }

  // Generate outside container vessels
  for (let i = 0; i < cache.outside.total; i++) {
    const pos = OUTSIDE_POSITIONS[i % OUTSIDE_POSITIONS.length];
    const jitter = { lat: (Math.random() - 0.5) * 0.15, lng: (Math.random() - 0.5) * 0.15 };
    containers.push({
      name: `Container Ship #${cache.inside.total + i + 1}`,
      imo: '',
      mmsi: '',
      vesselTypeClass: 'Container Ship',
      state: i < cache.outside.ballast ? 'ballast' : 'loaded',
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
    });
  }

  const merged = [...kplerVessels, ...containers];
  fs.writeFileSync(VESSELS_FILE, JSON.stringify(merged, null, 2));

  console.log(`[containers] Added ${containers.length} container ships (${cache.inside.total} inside + ${cache.outside.total} outside)`);
  console.log(`[containers] Total vessels.json: ${merged.length} (Kpler: ${kplerVessels.length} + Containers: ${containers.length})`);
  console.log(`[containers] Source: ${cache.source}`);
}

main();
