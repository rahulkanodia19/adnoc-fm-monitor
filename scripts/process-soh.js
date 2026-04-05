#!/usr/bin/env node
/**
 * process-soh.js — Processes raw vessel + flow data into dashboard-ready JSON files.
 * Run after downloading data from Kpler (via sync-soh.js or browser).
 */

const fs = require('fs');
const path = require('path');

const SOH_DIR = path.join(__dirname, '..', 'soh-data');

// --- Strait of Hormuz boundary: coastline-following segments ---
// Defines the eastern edge of "inside" (Persian Gulf). Everything east = "outside" (Gulf of Oman).
// Traced from Iran coast south through the strait to UAE coast.
const GULF_BOUNDARY = [
  { lat: 30.0, lng: 56.50 },   // Far north Iran coast
  { lat: 29.0, lng: 56.50 },   // Northern Gulf Iran coast
  { lat: 28.0, lng: 56.45 },   // Central Iran coast
  { lat: 27.2, lng: 56.45 },   // Bandar Abbas area (port 56.27, anchorage to ~56.4)
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

// Hormuz monitoring zone polygon (for map overlay only)
const HORMUZ_MONITORING_ZONE = [
  [30.6, 47.2], [30.95, 50.4], [29.4, 56.9], [25.2, 58.2],
  [23.5, 56.9], [23.0, 50.6], [25.1, 48.2], [29.3, 47.0]
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

// Strait neck: the narrow passage near the boundary
function isInStraitNeck(lat, lng) {
  if (lat < 25.5 || lat > 26.8) return false;
  return Math.abs(lng - boundaryLng(lat)) < 0.5;
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
  const EXCLUDED_VESSEL_TYPES = ['Short Sea Tankers', 'Small Tankers', 'Mini Bulker'];
  const allVesselsRaw = JSON.parse(fs.readFileSync(vesselsPath, 'utf-8'));
  const vessels = allVesselsRaw.filter(v => !EXCLUDED_VESSEL_TYPES.includes(v.vesselTypeClass));
  console.log(`Loaded ${allVesselsRaw.length} vessels, excluded ${allVesselsRaw.length - vessels.length} small types → ${vessels.length} vessels`);

  const now = new Date().toISOString();
  // UAE = UTC+4 (no DST). Use UAE date for all snapshot labeling.
  function uaeDate(offsetMs = 0) {
    return new Date(Date.now() + 4 * 3600000 + offsetMs).toISOString().split('T')[0];
  }
  function uaeHour() {
    return new Date(Date.now() + 4 * 3600000).getUTCHours();
  }
  const today = uaeDate();

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
    lng:     { unit: 'mmt',   factor: 0.45 / 1000000 },      // m³ → million metric tonnes
    lpg:     { unit: 'mmt',   factor: 0.55 / 1000000 },      // m³ → million metric tonnes
    dry:     { unit: 'mmt',   factor: 1 / 1000000 },          // mt → million metric tonnes
    other:   { unit: 'mmt',   factor: 1 / 1000000 },
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

  // --- Extract ADNOC vessels by IMO (11 vessel fleet) ---
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

  const ADNOC_IMOS = new Set(ADNOC_FLEET.map(f => f.imo));
  function isUAE(v) { return v.flagName === 'United Arab Emirates'; }
  function isADNOC(v) {
    if (ADNOC_IMOS.has(v.imo)) return true;
    const c = (v.controller || '').toLowerCase();
    return c.includes('adnoc') || c.includes('abu dhabi');
  }

  const adnocVessels = ADNOC_FLEET.map(ref => {
    const v = allVesselsRaw.find(x => x.imo === ref.imo);
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
        departed: v.lastPortCall?.end ? v.lastPortCall.end.replace('T', ' ').substring(0, 16) : null,
        isInside: v.lat && v.lng ? isInsideGulf(v.lat, v.lng) : null,
        marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${ref.imo}`,
        dataSource: v.dataSource || 'kpler',
      };
    }
    // Not found in Kpler or MINT — use static fallback as last resort (container ships)
    const STATIC_FALLBACK = {
      '9573505': { name: 'AL BAZM-II', type: 'Container Ship (Fully Cellular)', size: 'Small Handy', state: 'ballast', status: 'Under way using engine', previousPort: 'Ruwais', departed: '03 Mar 2026 09:14', deadWeight: 13944, flagName: 'United Arab Emirates' },
      '9300984': { name: 'AL REEM I', type: 'Container Ship (Fully Cellular)', size: 'Large Handy', state: 'loaded', status: 'Under way using engine', previousPort: 'Ruwais', departed: '03 Mar 2026 18:47', deadWeight: 38686, flagName: 'United Arab Emirates' },
      '9574016': { name: 'AL SADR - I', type: 'Container Ship (Fully Cellular)', size: 'Small Handy', state: 'loaded', status: 'Moored', previousPort: 'Ruwais', departed: '04 Mar 2026 09:43', deadWeight: 13944, flagName: 'United Arab Emirates' },
    };
    const fb = STATIC_FALLBACK[ref.imo];
    if (fb) {
      return {
        name: fb.name, imo: ref.imo, type: fb.type, size: fb.size,
        state: fb.state, status: fb.status, flagName: fb.flagName,
        deadWeight: fb.deadWeight, speed: 0, course: 0,
        product: null, destination: null, departed: fb.departed,
        previousPort: fb.previousPort, isInside: true,
        marineTrafficUrl: `https://www.marinetraffic.com/en/ais/details/ships/imo:${ref.imo}`,
        dataSource: 'als-monitor',
      };
    }
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
      // Container ships have product: null — label them distinctly instead of "Unknown"
      if (field === 'product' && key === 'Unknown' && v.commodityTypes?.[0] === 'container') key = 'Container Cargo';
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
    uaeExiting: transitVessels.filter(v => v.transitDirection === 'exiting' && isUAE(v)).length,
    uaeEntering: transitVessels.filter(v => v.transitDirection === 'entering' && isUAE(v)).length,
    adnocExiting: transitVessels.filter(v => v.transitDirection === 'exiting' && isADNOC(v)).length,
    adnocEntering: transitVessels.filter(v => v.transitDirection === 'entering' && isADNOC(v)).length,
    syncTimestamp: now,
  }, null, 2));
  console.log(`Transit vessels: ${transitVessels.length} (${exitingCount} exiting, ${enteringCount} entering)`);

  // --- Crisis transit log (vessels that crossed out during crisis) ---
  const CRISIS_START = '2026-02-28';

  // Detect MINT container transits by comparing with previous sync snapshot
  const CONTAINER_POS_FILE = path.join(SOH_DIR, '.container-positions-prev.json');
  let prevContainerPositions = {};
  try { prevContainerPositions = JSON.parse(fs.readFileSync(CONTAINER_POS_FILE, 'utf-8')); } catch {}

  // Build current container position map and detect inside→outside transitions
  const containerTransitLog = path.join(SOH_DIR, '.container-transit-log.json');
  let transitLog = [];
  try { transitLog = JSON.parse(fs.readFileSync(containerTransitLog, 'utf-8')); } catch {}

  const currentContainerPositions = {};
  for (const v of allVesselsWithPos) {
    if (v.dataSource !== 'mint' || v.commodityTypes?.[0] !== 'container') continue;
    const imo = v.imo;
    if (!imo) continue;
    const nowInside = isInsideGulf(v.lat, v.lng);
    currentContainerPositions[imo] = nowInside ? 'inside' : 'outside';

    // Detect transit: was inside, now outside
    if (prevContainerPositions[imo] === 'inside' && !nowInside) {
      // Check if already logged for this vessel
      if (!transitLog.find(t => t.imo === imo && t.departureDate === today)) {
        transitLog.push({
          name: v.name, imo, vesselTypeClass: v.vesselTypeClass, state: v.state,
          flagName: v.flagName || '', product: v.product, destination: v.destination,
          deadWeight: v.deadWeight, speed: v.speed,
          departureDate: today,
          commodity: 'container',
        });
      }
    }
  }

  // Save snapshots for next run
  fs.writeFileSync(CONTAINER_POS_FILE, JSON.stringify(currentContainerPositions, null, 2));
  fs.writeFileSync(containerTransitLog, JSON.stringify(transitLog, null, 2));

  const detectedContainerTransits = transitLog.filter(t => t.departureDate >= CRISIS_START);

  const crisisTransitVessels = [
    // Kpler vessels: use lastPortCall date
    ...allVesselsWithPos.filter(v => {
      if (!v.lastPortCall?.end || v.lastPortCall.end < CRISIS_START) return false;
      return !isInsideGulf(v.lat, v.lng);
    }).map(v => ({
      name: v.name, imo: v.imo, vesselTypeClass: v.vesselTypeClass, state: v.state,
      flagName: v.flagName, controller: v.controller || '',
      product: v.product, destination: v.destination || v.aisDestination,
      deadWeight: v.deadWeight, speed: v.speed,
      departureDate: (v.lastPortCall?.end || '').substring(0, 10),
      commodity: v.commodityTypes?.[0] || 'other',
    })),
    // MINT containers: detected inside→outside transitions
    ...detectedContainerTransits,
  ].sort((a, b) => b.departureDate.localeCompare(a.departureDate));

  // Group by date
  const dailyCrisis = {};
  for (const v of crisisTransitVessels) {
    const d = v.departureDate;
    if (!dailyCrisis[d]) dailyCrisis[d] = { date: d, count: 0, tankers: 0, bulk: 0, container: 0, other: 0, uae: 0, adnoc: 0 };
    dailyCrisis[d].count++;
    const c = v.commodity;
    if (c === 'liquids' || c === 'lng' || c === 'lpg') dailyCrisis[d].tankers++;
    else if (c === 'dry') dailyCrisis[d].bulk++;
    else if (c === 'container') dailyCrisis[d].container++;
    else dailyCrisis[d].other++;
    if (isUAE(v)) dailyCrisis[d].uae++;
    if (isADNOC(v)) dailyCrisis[d].adnoc++;
  }

  fs.writeFileSync(path.join(SOH_DIR, 'crisis-transits.json'), JSON.stringify({
    crisisStart: CRISIS_START,
    totalVessels: crisisTransitVessels.length,
    totalUAE: crisisTransitVessels.filter(v => isUAE(v)).length,
    totalADNOC: crisisTransitVessels.filter(v => isADNOC(v)).length,
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
    hormuzPolygon: HORMUZ_MONITORING_ZONE,
    gulfBoundary: GULF_BOUNDARY,
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
  const yesterday = uaeDate(-86400000);
  if (history.length === 1 && history[0].date === today) {
    // First run — seed yesterday with same values so deltas show 0
    history.unshift({ date: yesterday, ...summaryData });
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }
  const prevDay = history.find(h => h.date === yesterday) || [...history].reverse().find(h => h.date < today);

  // Dynamic delta label: "24h" if comparing yesterday, "vs 29 Mar" if comparing older
  const deltaLabel = !prevDay ? '24h'
    : prevDay.date === yesterday ? '24h'
    : `vs ${new Date(prevDay.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;

  const summary = {
    ...summaryData,
    syncTimestamp: now,
    deltaLabel,
    deltas: prevDay ? {
      insideDelta: summaryData.insideTotal - (prevDay.insideTotal || 0),
      outsideDelta: summaryData.outsideTotal - (prevDay.outsideTotal || 0),
      adnocDelta: summaryData.adnocCount - (prevDay.adnocCount || 0),
      insideBallastDelta: summaryData.insideBallast - (prevDay.insideBallast || 0),
      insideLadenDelta: summaryData.insideLaden - (prevDay.insideLaden || 0),
      outsideBallastDelta: summaryData.outsideBallast - (prevDay.outsideBallast || 0),
      outsideLadenDelta: summaryData.outsideLaden - (prevDay.outsideLaden || 0),
    } : null,
  };

  // Small vessels summary (excluded types — shown separately at bottom of dashboard)
  const excludedVessels = allVesselsRaw.filter(v => EXCLUDED_VESSEL_TYPES.includes(v.vesselTypeClass) && v.lat && v.lng);
  const smallInside = excludedVessels.filter(v => isInsideGulf(v.lat, v.lng)).length;
  const smallOutside = excludedVessels.length - smallInside;
  summary.smallVessels = {
    inside: smallInside,
    outside: smallOutside,
    total: excludedVessels.length,
    types: EXCLUDED_VESSEL_TYPES,
  };

  fs.writeFileSync(path.join(SOH_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Summary: Inside=${summary.insideTotal}, Outside=${summary.outsideTotal}, ADNOC=${summary.adnocCount}, Transit=${transitVessels.length}`);
  console.log(`Small vessels excluded: ${excludedVessels.length} (inside: ${smallInside}, outside: ${smallOutside})`);

  // --- Daily vessel snapshot for transit detection ---
  const snapshotDir = path.join(SOH_DIR, '.daily-vessel-snapshots');
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

  // Build current snapshot: IMO → { name, inside, type, commodity }
  // Use allVesselsRaw (unfiltered) so small vessels are included for consistent comparison
  const todaySnapshot = {};
  for (const v of allVesselsRaw) {
    if (!v.imo || !v.lat || !v.lng) continue;
    todaySnapshot[v.imo] = {
      name: v.name || '',
      inside: isInsideGulf(v.lat, v.lng),
      type: v.vesselTypeClass || 'Unknown',
      commodity: v.commodityTypes?.[0] || 'other',
      flag: v.flagName || '',
    };
  }

  // Save timestamped snapshot (each sync gets its own file)
  const uaeNow = new Date(Date.now() + 4 * 3600000);
  const timeStr = uaeNow.toISOString().substring(11, 16).replace(':', '-');
  const snapshotFile = `${today}T${timeStr}.json`;
  fs.writeFileSync(path.join(snapshotDir, snapshotFile), JSON.stringify(todaySnapshot));
  console.log(`Snapshot saved: ${snapshotFile} (${Object.keys(todaySnapshot).length} vessels)`);

  // --- Transit detection: compare live vs last midnight snapshot ---
  // Classify vessels by type
  function classifyTransits(vessels) {
    let tanker = 0, bulk = 0, container = 0, other = 0;
    for (const v of vessels) {
      const t = (v.type || '').toLowerCase();
      if (t.includes('tanker')) tanker++;
      else if (t.includes('bulk')) bulk++;
      else if (t.includes('container')) container++;
      else other++;
    }
    return { tanker, bulk, container, other };
  }

  // Find vessel detail from allVesselsWithPos
  function vesselDetail(imo, curr) {
    const v = allVesselsWithPos.find(x => x.imo === imo) || {};
    return {
      name: curr.name, imo, type: curr.type, commodity: curr.commodity,
      flag: v.flagName || '', destination: v.destination || v.aisDestination || '',
      deadWeight: v.deadWeight || 0, speed: v.speed || 0,
      state: v.state || '', controller: v.controller || '',
    };
  }

  // Find comparison base: prefer today's earliest snapshot (midnight boundary),
  // fall back to yesterday's latest (first sync of the day only)
  const allSnapFiles = fs.readdirSync(snapshotDir)
    .filter(f => f.endsWith('.json') && f !== snapshotFile)
    .sort();
  const todayEarliest = allSnapFiles.find(f => f.substring(0, 10) === today);
  const prevDayLatest = allSnapFiles.filter(f => f.substring(0, 10) < today).pop() || null;
  const prevSnapshotFile = todayEarliest || prevDayLatest;

  if (prevSnapshotFile) {
    const prevSnapshotDate = prevSnapshotFile.substring(0, 10); // YYYY-MM-DD
    const prevSnapshot = JSON.parse(fs.readFileSync(path.join(snapshotDir, prevSnapshotFile), 'utf-8'));

    const exitedVessels = [], enteredVessels = [];
    for (const [imo, curr] of Object.entries(todaySnapshot)) {
      const prev = prevSnapshot[imo];
      if (!prev) continue;
      if (prev.inside && !curr.inside) exitedVessels.push(vesselDetail(imo, curr));
      if (!prev.inside && curr.inside) enteredVessels.push(vesselDetail(imo, curr));
    }

    const exitCounts = classifyTransits(exitedVessels);
    const enterCounts = classifyTransits(enteredVessels);

    // Gulf of Oman tracking: compare "outside" vessels between snapshots
    // Entered Oman = outside NOW but was NOT outside before (didn't exist or was inside)
    const omanEntered = [];
    for (const [imo, curr] of Object.entries(todaySnapshot)) {
      if (curr.inside) continue; // only care about outside vessels
      const prev = prevSnapshot[imo];
      if (!prev || prev.inside) omanEntered.push(vesselDetail(imo, curr));
    }
    // Left Oman = was outside BEFORE but is NOT outside now (gone or moved inside)
    const omanLeft = [];
    for (const [imo, prev] of Object.entries(prevSnapshot)) {
      if (prev.inside) continue; // only care about vessels that were outside
      const curr = todaySnapshot[imo];
      if (!curr || curr.inside) omanLeft.push({ name: prev.name, imo, type: prev.type, commodity: prev.commodity, flag: prev.flag || '' });
    }

    // Write current transit data (live vs last midnight)
    fs.writeFileSync(path.join(SOH_DIR, 'transit-current.json'), JSON.stringify({
      sinceMidnight: prevSnapshotDate,
      syncTimestamp: now,
      exitedVessels, enteredVessels,
      exitedCount: exitedVessels.length,
      enteredCount: enteredVessels.length,
      tanker_exit: exitCounts.tanker, bulk_exit: exitCounts.bulk,
      container_exit: exitCounts.container, other_exit: exitCounts.other,
      tanker_enter: enterCounts.tanker, bulk_enter: enterCounts.bulk,
      container_enter: enterCounts.container, other_enter: enterCounts.other,
      omanEntered, omanLeft,
      omanEnteredCount: omanEntered.length,
      omanLeftCount: omanLeft.length,
    }, null, 2));
    console.log(`Transit current: ${exitedVessels.length} exited, ${enteredVessels.length} entered, oman +${omanEntered.length}/-${omanLeft.length} (since midnight ${prevSnapshotDate})`);

    // Add exit/entry deltas to summary
    summary.deltas.exitedSinceMidnight = exitedVessels.length;
    summary.deltas.enteredSinceMidnight = enteredVessels.length;
    fs.writeFileSync(path.join(SOH_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

    // --- Daily transit history: update on every sync (reuse live vs midnight comparison) ---
    {
      const gapDays = Math.round((new Date(today) - new Date(prevSnapshotDate)) / 86400000);

      const transitHistoryPath = path.join(SOH_DIR, 'daily-transit-history.json');
      let transitHistory = [];
      try { transitHistory = JSON.parse(fs.readFileSync(transitHistoryPath, 'utf-8')); } catch {}

      const histEntry = {
        date: today, comparedTo: prevSnapshotDate, gapDays,
        exited: exitedVessels.length, entered: enteredVessels.length,
        tanker_exit: exitCounts.tanker, bulk_exit: exitCounts.bulk, container_exit: exitCounts.container, other_exit: exitCounts.other,
        tanker_enter: enterCounts.tanker, bulk_enter: enterCounts.bulk, container_enter: enterCounts.container, other_enter: enterCounts.other,
        exitedVessels, enteredVessels,
        omanEntered, omanLeft,
      };

      const existingIdx = transitHistory.findIndex(h => h.date === today);
      if (existingIdx >= 0) transitHistory[existingIdx] = histEntry;
      else transitHistory.push(histEntry);
      transitHistory = transitHistory.slice(-180);
      fs.writeFileSync(transitHistoryPath, JSON.stringify(transitHistory, null, 2));
      console.log(`Transit history: ${exitedVessels.length} exited, ${enteredVessels.length} entered, oman +${omanEntered.length}/-${omanLeft.length} (${today}, base ${prevSnapshotDate}, gap ${gapDays}d)`);
    }
  } else {
    console.log('Transit detection: no midnight snapshot yet — first run');
    // Write empty transit-current.json
    fs.writeFileSync(path.join(SOH_DIR, 'transit-current.json'), JSON.stringify({
      sinceMidnight: null, syncTimestamp: now,
      exitedVessels: [], enteredVessels: [],
      exitedCount: 0, enteredCount: 0,
      tanker_exit: 0, bulk_exit: 0, container_exit: 0, other_exit: 0,
      tanker_enter: 0, bulk_enter: 0, container_enter: 0, other_enter: 0,
    }, null, 2));
  }

  // Clean up snapshots older than 90 days
  const cutoffDate = uaeDate(-90 * 86400000);
  for (const f of fs.readdirSync(snapshotDir)) {
    if (!f.endsWith('.json')) continue;
    if (f.substring(0, 10) < cutoffDate) {
      fs.unlinkSync(path.join(snapshotDir, f));
    }
  }

  // --- List output files ---
  console.log('\n=== Processing complete ===');
  console.log('Files:');
  fs.readdirSync(SOH_DIR).filter(f => !f.startsWith('.')).forEach(f => {
    const size = fs.statSync(path.join(SOH_DIR, f)).size;
    console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
  });
}

main();
