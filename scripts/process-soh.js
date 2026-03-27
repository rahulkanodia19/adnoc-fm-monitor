#!/usr/bin/env node
/**
 * process-soh.js — Processes raw vessel + flow data into dashboard-ready JSON files.
 * Run after downloading data from Kpler (via sync-soh.js or browser).
 */

const fs = require('fs');
const path = require('path');

const SOH_DIR = path.join(__dirname, '..', 'soh-data');

// --- IHO Boundary: Persian Gulf / Gulf of Oman ---
// Official IHO line: Ras Limah (25.95°N, 56.42°E) to Ras al Kuh (25.78°N, 57.32°E)
// Sources: IHO "Limits of Oceans and Seas", Marine Regions, Wikipedia
const IHO_LINE = {
  rasLimah: { lat: 25.95, lng: 56.42 },   // Oman/Musandam coast
  rasAlKuh: { lat: 25.78, lng: 57.32 },    // Iran coast
};

// Hormuz monitoring zone polygon (for map overlay only)
const HORMUZ_ZONE_POLYGON = [
  [30.6, 47.2], [30.95, 50.4], [29.4, 56.9], [25.2, 58.2],
  [23.5, 56.9], [23.0, 50.6], [25.1, 48.2], [29.3, 47.0]
];

// Boundary longitude at a given latitude, following the IHO line and extending north
function ihoBoundaryLng(lat) {
  const { rasLimah, rasAlKuh } = IHO_LINE;
  // South of both IHO points: use Ras Limah lng
  if (lat <= rasAlKuh.lat) return rasLimah.lng;
  // Between the two IHO endpoints: interpolate
  if (lat <= rasLimah.lat) {
    const frac = (lat - rasAlKuh.lat) / (rasLimah.lat - rasAlKuh.lat);
    return rasAlKuh.lng - frac * (rasAlKuh.lng - rasLimah.lng);
  }
  // North of IHO line: extend along Iran coast (~57.3°E)
  return 57.3;
}

function isInsideGulf(lat, lng) {
  return lng < ihoBoundaryLng(lat);
}

// Strait neck: the narrow passage at the IHO boundary area
function isInStraitNeck(lat, lng) {
  if (lat < 25.5 || lat > 26.8) return false;
  return Math.abs(lng - ihoBoundaryLng(lat)) < 0.5;
}

// Commodity type labels (from Kpler commodityTypes field)
const COMMODITY_LABELS = {
  liquids: 'Crude & Refined Products',
  lng: 'LNG',
  lpg: 'LPG',
  dry: 'Dry Bulk',
  other: 'Other',
};

function main() {
  console.log('=== Processing SOH data ===\n');

  const vesselsPath = path.join(SOH_DIR, 'vessels.json');
  if (!fs.existsSync(vesselsPath)) {
    console.error('ERROR: vessels.json not found. Run sync or download from Kpler first.');
    process.exit(1);
  }
  const vessels = JSON.parse(fs.readFileSync(vesselsPath, 'utf-8'));
  console.log(`Loaded ${vessels.length} vessels`);

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // --- Classify inside/outside using strait dividing line ---
  const inside = [], outside = [];
  for (const v of vessels) {
    if (!v.lat || !v.lng) continue;
    if (isInsideGulf(v.lat, v.lng)) inside.push(v);
    else outside.push(v);
  }
  console.log(`Inside Gulf: ${inside.length}, Outside Gulf: ${outside.length}`);

  // --- Build vessel matrix ---
  function buildMatrix(vesselList) {
    const classes = {};
    let ballast = 0, laden = 0, unknown = 0, total = 0;
    for (const v of vesselList) {
      const cls = v.vesselTypeClass || 'Unknown';
      if (!classes[cls]) classes[cls] = { label: cls, ballast: 0, laden: 0, unknown: 0, total: 0 };
      const state = (v.state || '').toLowerCase();
      if (state === 'ballast') { classes[cls].ballast++; ballast++; }
      else if (state === 'loaded') { classes[cls].laden++; laden++; }
      else { classes[cls].unknown++; unknown++; }
      classes[cls].total++;
      total++;
    }
    return { matrix: Object.values(classes).sort((a, b) => b.total - a.total), grandTotal: { ballast, laden, unknown, total } };
  }

  // --- Build product volumes grouped by commodity type ---
  // Conversion factors from Kpler native units to display units
  const UNIT_CONFIG = {
    liquids: { unit: 'mmbbl', factor: 6.28981 / 1000000 },  // m³ → million barrels
    lng:     { unit: 'kmt',   factor: 0.45 / 1000 },         // m³ → thousand metric tonnes
    lpg:     { unit: 'kmt',   factor: 0.55 / 1000 },         // m³ → thousand metric tonnes
    dry:     { unit: 'kmt',   factor: 1 / 1000 },             // mt → thousand metric tonnes
    other:   { unit: 'kmt',   factor: 1 / 1000 },
  };

  function buildProductVolumes(vesselList) {
    const groups = {};
    for (const v of vesselList) {
      if ((v.state || '').toLowerCase() !== 'loaded') continue;
      const commodity = v.commodityTypes?.[0] || 'other';
      const label = COMMODITY_LABELS[commodity] || commodity;
      const config = UNIT_CONFIG[commodity] || UNIT_CONFIG.other;
      if (!groups[label]) groups[label] = { commodity: label, vesselCount: 0, totalCapacity: 0, unit: config.unit, products: {} };
      groups[label].vesselCount++;
      groups[label].totalCapacity += (v.capacity || 0) * config.factor;
      // Track individual products within the commodity group
      const prod = v.product || 'Unknown';
      groups[label].products[prod] = (groups[label].products[prod] || 0) + 1;
    }
    return Object.values(groups)
      .map(g => ({ ...g, topProducts: Object.entries(g.products).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })) }))
      .sort((a, b) => b.totalCapacity - a.totalCapacity);
  }

  const insideMatrix = buildMatrix(inside);
  const outsideMatrix = buildMatrix(outside);
  insideMatrix.productVolumes = buildProductVolumes(inside);
  outsideMatrix.productVolumes = buildProductVolumes(outside);

  fs.writeFileSync(path.join(SOH_DIR, 'vessel-matrix.json'), JSON.stringify({
    inside: insideMatrix,
    outside: outsideMatrix,
    syncTimestamp: now,
  }, null, 2));
  console.log(`Vessel matrix: Inside ${insideMatrix.grandTotal.total} (${insideMatrix.matrix.length} classes), Outside ${outsideMatrix.grandTotal.total} (${outsideMatrix.matrix.length} classes)`);
  console.log(`Product volumes: Inside ${insideMatrix.productVolumes.length} products, Outside ${outsideMatrix.productVolumes.length} products`);

  // --- Extract ADNOC vessels by IMO (from als-monitor VesselTracker.tsx) ---
  const ADNOC_FLEET = [
    { imo: '9592898', name: 'GHANTOUT' },
    { imo: '9380324', name: 'AL SAMHA' },
    { imo: '9494204', name: 'UMM AL LULU-I' },
    { imo: '9573505', name: 'AL BAZM-II' },
    { imo: '9300984', name: 'AL REEM I' },
    { imo: '9574016', name: 'AL SADR - I' },
    { imo: '9074626', name: 'MUBARAZ' },
    { imo: '9923085', name: 'AL SALAM' },
    { imo: '9923097', name: 'BAYNOUNAH' },
    { imo: '9034236', name: 'JANANA' },
    { imo: '9482873', name: 'NAVIG8 MACALLISTER' },
  ];

  const adnocVessels = ADNOC_FLEET.map(ref => {
    const v = vessels.find(x => x.imo === ref.imo);
    if (v) {
      // Derive status from speed
      let status = 'Unknown';
      if ((v.speed || 0) >= 1) status = 'Under way using engine';
      else if (v.state === 'loaded') status = 'Anchored';
      else status = 'Moored';

      return {
        name: v.name || ref.name,
        imo: ref.imo,
        type: v.vesselTypeClass || '-',
        state: v.state || 'unknown',
        status,
        flagName: v.flagName,
        deadWeight: v.deadWeight,
        capacity: v.capacity,
        capacityUnit: v.capacityUnit,
        speed: v.speed || 0,
        course: v.course || 0,
        lat: v.lat, lng: v.lng,
        product: v.product,
        destination: v.destination || v.aisDestination,
        departed: v.lastPortCallEnd ? v.lastPortCallEnd.replace('T', ' ').substring(0, 16) : null,
        isInside: v.lat && v.lng ? isInsideGulf(v.lat, v.lng) : null,
        marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${ref.imo}`,
        dataSource: 'kpler',
      };
    }
    // Not found in Kpler — mark as unavailable (don't hardcode status)
    return {
      name: ref.name,
      imo: ref.imo,
      marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${ref.imo}`,
      dataSource: 'unavailable',
    };
  });

  fs.writeFileSync(path.join(SOH_DIR, 'adnoc-vessels.json'), JSON.stringify({
    vessels: adnocVessels, count: adnocVessels.length, syncTimestamp: now,
  }, null, 2));
  console.log(`ADNOC vessels: ${adnocVessels.length}`);

  // --- Build breakdowns ---
  function buildBreakdown(vesselList, field) {
    const counts = {};
    for (const v of vesselList) {
      // For destination, fall back to AIS-reported destination if Kpler destination is missing
      let key = v[field] || (field === 'destination' ? v.aisDestination : null) || 'Unknown';
      // Normalize AIS destination text (crews type freeform, e.g. "FUJAIRAH" vs "Fujairah")
      if (field === 'destination' && key !== 'Unknown') {
        key = key.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
      if (!counts[key]) counts[key] = { label: key, total: 0, ballast: 0, laden: 0 };
      counts[key].total++;
      const state = (v.state || '').toLowerCase();
      if (state === 'ballast') counts[key].ballast++;
      else if (state === 'loaded') counts[key].laden++;
    }
    return Object.values(counts).sort((a, b) => b.total - a.total);
  }

  const allVesselsWithPos = vessels.filter(v => v.lat && v.lng);

  for (const [field, filename] of [['product', 'breakdown-product.json'], ['vesselTypeClass', 'breakdown-vessel-type.json'], ['destination', 'breakdown-destination.json']]) {
    const data = buildBreakdown(allVesselsWithPos, field);
    fs.writeFileSync(path.join(SOH_DIR, filename), JSON.stringify({ data, total: allVesselsWithPos.length, syncTimestamp: now }, null, 2));
    console.log(`${field} breakdown: ${data.length} entries`);
  }

  // --- Classify transit vessels ---
  const transitVessels = [];
  for (const v of allVesselsWithPos) {
    if (!isInStraitNeck(v.lat, v.lng)) continue;
    if ((v.speed || 0) <= 3) continue;
    const course = v.course || 0;
    let direction = 'unknown';
    if (course >= 80 && course <= 200) direction = 'exiting';
    else if (course >= 260 || course <= 80) direction = 'entering';
    transitVessels.push({ ...v, transitDirection: direction, isTransiting: true });
  }

  const exitingCount = transitVessels.filter(v => v.transitDirection === 'exiting').length;
  const enteringCount = transitVessels.filter(v => v.transitDirection === 'entering').length;

  fs.writeFileSync(path.join(SOH_DIR, 'transit-vessels.json'), JSON.stringify({
    vessels: transitVessels,
    exitingCount,
    enteringCount,
    totalTransiting: transitVessels.length,
    syncTimestamp: now,
  }, null, 2));
  console.log(`Transit vessels: ${transitVessels.length} (${exitingCount} exiting, ${enteringCount} entering)`);

  // --- Crisis transit log (vessels that crossed out during crisis) ---
  const CRISIS_START = '2026-02-28';
  const crisisTransitVessels = allVesselsWithPos.filter(v => {
    if (!v.lastPortCallEnd || v.lastPortCallEnd < CRISIS_START) return false;
    return !isInsideGulf(v.lat, v.lng); // Currently outside Gulf = crossed the strait
  }).map(v => ({
    name: v.name, imo: v.imo, vesselTypeClass: v.vesselTypeClass, state: v.state,
    flagName: v.flagName, product: v.product, destination: v.destination || v.aisDestination,
    deadWeight: v.deadWeight, speed: v.speed,
    departureDate: (v.lastPortCallEnd || '').substring(0, 10),
    commodity: v.commodityTypes?.[0] || 'other',
  })).sort((a, b) => b.departureDate.localeCompare(a.departureDate));

  // Group by date
  const dailyCrisis = {};
  for (const v of crisisTransitVessels) {
    const d = v.departureDate;
    if (!dailyCrisis[d]) dailyCrisis[d] = { date: d, count: 0, tankers: 0, bulk: 0, other: 0 };
    dailyCrisis[d].count++;
    const c = v.commodity;
    if (c === 'liquids' || c === 'lng' || c === 'lpg') dailyCrisis[d].tankers++;
    else if (c === 'dry') dailyCrisis[d].bulk++;
    else dailyCrisis[d].other++;
  }

  fs.writeFileSync(path.join(SOH_DIR, 'crisis-transits.json'), JSON.stringify({
    crisisStart: CRISIS_START,
    totalVessels: crisisTransitVessels.length,
    dailyCounts: Object.values(dailyCrisis).sort((a, b) => b.date.localeCompare(a.date)),
    vessels: crisisTransitVessels,
    syncTimestamp: now,
  }, null, 2));
  console.log(`Crisis transits: ${crisisTransitVessels.length} vessels crossed out since ${CRISIS_START}`);

  // --- Map positions ---
  const mapPositions = allVesselsWithPos.map(v => ({
    lat: v.lat, lng: v.lng,
    type: v.vesselTypeClass || 'Unknown',
    state: v.state || 'unknown',
    commodity: v.commodityTypes?.[0] || 'other',
    name: v.name,
    speed: v.speed || 0,
    isInside: isInsideGulf(v.lat, v.lng),
    isTransiting: isInStraitNeck(v.lat, v.lng) && (v.speed || 0) > 3,
  }));

  fs.writeFileSync(path.join(SOH_DIR, 'map-positions.json'), JSON.stringify({
    positions: mapPositions,
    hormuzPolygon: HORMUZ_ZONE_POLYGON,
    ihoLine: IHO_LINE,
    center: [26.2, 56.3],
    zoom: 8,
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    zoneStyle: { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15 },
    syncTimestamp: now,
  }, null, 2));
  console.log(`Map positions: ${mapPositions.length}`);

  // --- Summary with 24h deltas ---
  const historyPath = path.join(SOH_DIR, '.daily-history.json');
  let history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch {}
  }

  const summaryData = {
    insideTotal: insideMatrix.grandTotal.total,
    insideBallast: insideMatrix.grandTotal.ballast,
    insideLaden: insideMatrix.grandTotal.laden,
    outsideTotal: outsideMatrix.grandTotal.total,
    outsideBallast: outsideMatrix.grandTotal.ballast,
    outsideLaden: outsideMatrix.grandTotal.laden,
    adnocCount: adnocVessels.length,
    totalVessels: vessels.length,
    transitCount: transitVessels.length,
  };

  // Upsert today's entry in history
  const todayIdx = history.findIndex(h => h.date === today);
  if (todayIdx >= 0) history[todayIdx] = { date: today, ...summaryData };
  else history.push({ date: today, ...summaryData });
  // Keep last 90 days
  history = history.slice(-90);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

  // Find yesterday's entry for 24h delta (pre-seed if first run)
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (history.length === 1 && history[0].date === today) {
    // First run — seed yesterday with same values so deltas show 0
    history.unshift({ date: yesterday, ...summaryData });
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }
  const prevDay = history.find(h => h.date === yesterday) || history.find(h => h.date < today);

  const summary = {
    ...summaryData,
    syncTimestamp: now,
    deltaLabel: '24h',
    deltas: prevDay ? {
      insideDelta: summaryData.insideTotal - (prevDay.insideTotal || 0),
      outsideDelta: summaryData.outsideTotal - (prevDay.outsideTotal || 0),
      adnocDelta: summaryData.adnocCount - (prevDay.adnocCount || 0),
    } : null,
  };

  fs.writeFileSync(path.join(SOH_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Summary: Inside=${summary.insideTotal}, Outside=${summary.outsideTotal}, ADNOC=${summary.adnocCount}, Transit=${transitVessels.length}`);

  // --- List output files ---
  console.log('\n=== Processing complete ===');
  console.log('Files:');
  fs.readdirSync(SOH_DIR).filter(f => !f.startsWith('.')).forEach(f => {
    const size = fs.statSync(path.join(SOH_DIR, f)).size;
    console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
  });
}

main();
