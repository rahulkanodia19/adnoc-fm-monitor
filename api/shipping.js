// ============================================================
// api/shipping.js -- Vercel Serverless Function
// AIS API proxy: fetches vessel data, aggregates, returns JSON
// Supports: AISStream (WebSocket), Datalastic (REST)
// Falls back to shipping-seed.json when no API key configured
// ============================================================

const fs = require('fs');
const path = require('path');

// ---------- Load external config ----------
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'shipping-config.json'), 'utf-8')
);

// ---------- In-memory cache ----------
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ---------- Persistent vessel accumulation cache ----------
const VESSEL_CACHE_FILE = '/tmp/shipping-vessel-cache.json';
const STALE_TTL = 2 * 60 * 60 * 1000; // 2 hours — prune vessels not seen since

function loadVesselCache() {
  try {
    const raw = fs.readFileSync(VESSEL_CACHE_FILE, 'utf-8');
    const entries = JSON.parse(raw);
    return new Map(entries.map(v => [v.mmsi, v]));
  } catch (e) {
    return new Map();
  }
}

function saveVesselCache(vessels) {
  try {
    const arr = Array.from(vessels.values());
    fs.writeFileSync(VESSEL_CACHE_FILE, JSON.stringify(arr), 'utf-8');
  } catch (e) {
    console.error('Failed to save vessel cache:', e.message);
  }
}

// ---------- Hormuz bounding boxes ----------
const HORMUZ_INSIDE = CONFIG.boundingBoxes.inside;
const HORMUZ_WIDER = CONFIG.boundingBoxes.wider;

// ---------- AIS ship type classification ----------
const SHIP_TYPE_MAP = {
  70: 'Cargo Ship', 71: 'Cargo Ship', 72: 'Cargo Ship', 73: 'Cargo Ship', 74: 'Cargo Ship', 75: 'Cargo Ship', 76: 'Cargo Ship', 77: 'Cargo Ship', 78: 'Cargo Ship', 79: 'Cargo Ship',
  80: 'Crude Oil Tanker', 81: 'Crude Oil Tanker', 82: 'Chemical/Products Tanker', 83: 'Chemical/Products Tanker', 84: 'LPG Tanker', 85: 'LNG Tanker',
  86: 'Crude Oil Tanker', 87: 'Crude Oil Tanker', 88: 'Products Tanker', 89: 'Products Tanker',
  60: 'Passenger Ship', 61: 'Passenger Ship', 62: 'Passenger Ship', 63: 'Passenger Ship', 64: 'Passenger Ship', 65: 'Passenger Ship', 66: 'Passenger Ship', 67: 'Passenger Ship', 68: 'Passenger Ship', 69: 'Passenger Ship',
  90: 'Other', 91: 'Other', 92: 'Other', 93: 'Other', 94: 'Other', 95: 'Other', 96: 'Other', 97: 'Other', 98: 'Other', 99: 'Other'
};

// AIS NavigationalStatus codes
const NAV_STATUS_MAP = {
  0: 'UNDER WAY', 1: 'AT ANCHOR', 2: 'NOT UNDER COMMAND', 3: 'RESTRICTED MANOEUVRABILITY',
  4: 'CONSTRAINED BY DRAUGHT', 5: 'MOORED', 6: 'AGROUND', 7: 'ENGAGED IN FISHING',
  8: 'UNDER WAY SAILING', 11: 'TOWING ASTERN', 12: 'TOWING ALONGSIDE', 14: 'AIS-SART',
  15: 'NOT DEFINED'
};

// Known ADNOC-linked vessel name patterns
const ADNOC_VESSEL_PATTERNS = CONFIG.adnocVesselPatterns;

function isInsideHormuz(lat, lon) {
  return lat >= HORMUZ_INSIDE.latMin && lat <= HORMUZ_INSIDE.latMax &&
         lon >= HORMUZ_INSIDE.lonMin && lon <= HORMUZ_INSIDE.lonMax;
}

function isInWiderArea(lat, lon) {
  return lat >= HORMUZ_WIDER.latMin && lat <= HORMUZ_WIDER.latMax &&
         lon >= HORMUZ_WIDER.lonMin && lon <= HORMUZ_WIDER.lonMax;
}

function isAdnocVessel(name) {
  if (!name) return false;
  const upper = name.toUpperCase();
  return ADNOC_VESSEL_PATTERNS.some(p => upper.includes(p));
}

function classifyVesselType(shipType, name) {
  if (SHIP_TYPE_MAP[shipType]) return SHIP_TYPE_MAP[shipType];
  // Fallback: try to classify from name
  const upper = (name || '').toUpperCase();
  if (upper.includes('LNG')) return 'LNG Tanker';
  if (upper.includes('LPG')) return 'LPG Tanker';
  if (upper.includes('CONTAINER')) return 'Container Ship (Fully Cellular)';
  if (upper.includes('BULK')) return 'Bulk Carrier';
  if (upper.includes('TANKER')) return 'Products Tanker';
  return 'Other';
}

function inferBallastLaden(draft, maxDraft) {
  if (!draft || !maxDraft || maxDraft === 0) return 'BALLAST';
  return (draft / maxDraft) > (CONFIG.draftThreshold || 0.6) ? 'LADEN' : 'BALLAST';
}

function mapNavStatus(code) {
  const status = NAV_STATUS_MAP[code] || 'NOT DEFINED';
  if (status === 'AT ANCHOR') return 'ANCHORED';
  if (status === 'MOORED') return 'MOORED';
  return 'UNDER WAY';
}

function vesselStatusColor(navStatus) {
  if (navStatus === 'ANCHORED') return 'red';
  if (navStatus === 'MOORED') return 'green';
  return 'orange'; // UNDER WAY
}

// ---------- AISStream WebSocket fetcher (with persistent accumulation) ----------
async function fetchFromAISStream(apiKey) {
  const WebSocket = require('ws');

  // Load previously accumulated vessels
  const accumulated = loadVesselCache();

  const newVessels = await new Promise((resolve, reject) => {
    const vessels = new Map();
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    const timeout = setTimeout(() => {
      ws.close();
      resolve(vessels);
    }, 20000); // Collect for 20 seconds

    ws.on('open', () => {
      ws.send(JSON.stringify({
        Apikey: apiKey,
        BoundingBoxes: [
          [[HORMUZ_WIDER.latMin, HORMUZ_WIDER.lonMin], [HORMUZ_WIDER.latMax, HORMUZ_WIDER.lonMax]]
        ],
        FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport']
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        const meta = msg.MetaData || {};
        const mmsi = meta.MMSI;
        if (!mmsi) return;

        const existing = vessels.get(mmsi) || {};
        existing.mmsi = mmsi;
        existing.name = meta.ShipName || existing.name || '';
        existing.lat = meta.latitude || existing.lat;
        existing.lon = meta.longitude || existing.lon;
        existing.time = meta.time_utc || existing.time;
        existing.lastSeen = new Date().toISOString();

        // Handle all position report types
        const prKey = msg.MessageType === 'PositionReport' ? 'PositionReport'
          : msg.MessageType === 'StandardClassBPositionReport' ? 'StandardClassBPositionReport'
          : msg.MessageType === 'ExtendedClassBPositionReport' ? 'ExtendedClassBPositionReport'
          : null;
        if (prKey && msg.Message && msg.Message[prKey]) {
          const pr = msg.Message[prKey];
          existing.lat = pr.Latitude || existing.lat;
          existing.lon = pr.Longitude || existing.lon;
          existing.sog = pr.Sog != null ? pr.Sog : existing.sog;
          existing.cog = pr.Cog != null ? pr.Cog : existing.cog;
          existing.heading = pr.TrueHeading || existing.heading;
          existing.navStatus = pr.NavigationalStatus != null ? pr.NavigationalStatus : existing.navStatus;
          if (pr.ShipType) existing.shipType = pr.ShipType;
        }

        if (msg.MessageType === 'ShipStaticData' && msg.Message && msg.Message.ShipStaticData) {
          const sd = msg.Message.ShipStaticData;
          existing.shipType = sd.Type || existing.shipType;
          existing.draft = sd.MaximumStaticDraught || existing.draft;
          existing.destination = sd.Destination || existing.destination;
          existing.imo = sd.ImoNumber || existing.imo;
        }

        vessels.set(mmsi, existing);
      } catch (e) { /* skip malformed messages */ }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(vessels);
    });
  });

  // Merge new vessels into accumulated cache
  for (const [mmsi, v] of newVessels) {
    const prev = accumulated.get(mmsi) || {};
    accumulated.set(mmsi, { ...prev, ...v, lastSeen: v.lastSeen });
  }

  // Prune stale vessels (not seen for 2 hours)
  const now = Date.now();
  for (const [mmsi, v] of accumulated) {
    if (!v.lastSeen || (now - new Date(v.lastSeen).getTime()) > STALE_TTL) {
      accumulated.delete(mmsi);
    }
  }

  // Persist and return
  saveVesselCache(accumulated);
  console.log(`AIS accumulation: ${newVessels.size} new, ${accumulated.size} total cached`);
  return accumulated;
}

// ---------- Aggregate raw vessels into response ----------
function aggregateVessels(vessels, previousData) {
  let insideCount = 0, outsideCount = 0, adnocCount = 0;
  let insideBallast = 0, insideLaden = 0;
  let outsideBallast = 0, outsideLaden = 0;
  const classCounts = {};
  const adnocVessels = [];

  for (const [, v] of vessels) {
    if (!v.lat || !v.lon) continue;

    const inside = isInsideHormuz(v.lat, v.lon);
    const inArea = isInWiderArea(v.lat, v.lon);
    if (!inArea) continue;

    const cargo = inferBallastLaden(v.draft, v.draft * 1.5);
    const vesselType = classifyVesselType(v.shipType, v.name);
    const navStatusStr = mapNavStatus(v.navStatus);

    if (inside) {
      insideCount++;
      if (cargo === 'BALLAST') insideBallast++; else insideLaden++;
    } else {
      outsideCount++;
      if (cargo === 'BALLAST') outsideBallast++; else outsideLaden++;
    }

    // Classify by type
    if (!classCounts[vesselType]) {
      classCounts[vesselType] = {
        name: vesselType,
        inside: { total: 0, ballast: 0, laden: 0 },
        outside: { total: 0, ballast: 0, laden: 0 }
      };
    }
    const cls = classCounts[vesselType];
    if (inside) {
      cls.inside.total++;
      if (cargo === 'BALLAST') cls.inside.ballast++; else cls.inside.laden++;
    } else {
      cls.outside.total++;
      if (cargo === 'BALLAST') cls.outside.ballast++; else cls.outside.laden++;
    }

    // Check if ADNOC vessel
    if (isAdnocVessel(v.name)) {
      adnocCount++;
      adnocVessels.push({
        name: v.name.toUpperCase().trim(),
        class: vesselType.toUpperCase(),
        subclass: '',
        port: v.destination || '',
        destination: v.destination || null,
        cargo: cargo,
        navStatus: navStatusStr,
        status: vesselStatusColor(navStatusStr)
      });
    }
  }

  // Compute deltas from previous data
  const prevInside = previousData?.fleetFocus?.vesselsInside?.count || insideCount;
  const prevOutside = previousData?.fleetFocus?.vesselsOutside?.count || outsideCount;
  const prevAdnoc = previousData?.fleetFocus?.adnocVessels?.count || adnocCount;
  const prevInsideBallast = previousData?.fleetFocus?.vesselsInside?.ballast || insideBallast;
  const prevInsideLaden = previousData?.fleetFocus?.vesselsInside?.laden || insideLaden;
  const prevOutsideBallast = previousData?.fleetFocus?.vesselsOutside?.ballast || outsideBallast;
  const prevOutsideLaden = previousData?.fleetFocus?.vesselsOutside?.laden || outsideLaden;

  const totalVessels = insideCount + outsideCount;
  const sortedClasses = Object.values(classCounts)
    .sort((a, b) => (b.inside.total + b.outside.total) - (a.inside.total + a.outside.total));

  return {
    lastUpdated: new Date().toISOString(),
    fleetFocus: {
      alert: previousData?.fleetFocus?.alert || { type: 'FLEET STATUS', message: `Tracking ${totalVessels} vessels in the Hormuz corridor.` },
      adnocVessels: { count: adnocCount, change: adnocCount - prevAdnoc },
      vesselsInside: {
        count: insideCount,
        change: insideCount - prevInside,
        ballast: insideBallast,
        laden: insideLaden,
        deltaB: insideBallast - prevInsideBallast,
        deltaL: insideLaden - prevInsideLaden
      },
      vesselsOutside: {
        count: outsideCount,
        change: outsideCount - prevOutside,
        ballast: outsideBallast,
        laden: outsideLaden,
        deltaB: outsideBallast - prevOutsideBallast,
        deltaL: outsideLaden - prevOutsideLaden
      }
    },
    routeMonitor: {
      iframeUrl: CONFIG.marineTraffic.iframeUrl,
      fullMapUrl: CONFIG.marineTraffic.fullMapUrl,
      source: 'MarineTraffic AIS Embed',
      transitedIn: {
        change: insideCount - prevInside,
        currentTotal: insideCount,
        previousTotal: prevInside,
        description: `Inside total now ${insideCount} vs ${prevInside} previously.`
      },
      transitedOut: {
        change: outsideCount - prevOutside,
        currentTotal: outsideCount,
        previousTotal: prevOutside,
        description: `Outside total now ${outsideCount} vs ${prevOutside} previously.`
      }
    },
    vesselMatrix: {
      totalVessels: totalVessels,
      classes: sortedClasses
    },
    trackedVessels: adnocVessels
  };
}

// ---------- Load seed/fallback data ----------
function loadSeedData() {
  try {
    const seedPath = path.join(__dirname, '..', 'shipping-seed.json');
    const raw = fs.readFileSync(seedPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ---------- Main handler ----------
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check cache
  if (cache.data && (Date.now() - cache.timestamp) < CACHE_TTL) {
    return res.status(200).json(cache.data);
  }

  const apiKey = process.env.AIS_API_KEY;
  const provider = process.env.AIS_PROVIDER || 'aisstream';

  // No API key: serve seed data
  if (!apiKey) {
    const seed = loadSeedData();
    if (seed) {
      seed._source = 'seed';
      return res.status(200).json(seed);
    }
    return res.status(503).json({ error: 'No API key configured and no seed data available.' });
  }

  try {
    let data;

    if (provider === 'aisstream') {
      const vessels = await fetchFromAISStream(apiKey);
      data = aggregateVessels(vessels, cache.data);
      data._source = 'aisstream';
    } else if (provider === 'datalastic') {
      // Datalastic REST API integration
      const resp = await fetch(
        `https://api.datalastic.com/api/v0/vessel_inarea?api-key=${apiKey}&lat_min=${HORMUZ_WIDER.latMin}&lat_max=${HORMUZ_WIDER.latMax}&lon_min=${HORMUZ_WIDER.lonMin}&lon_max=${HORMUZ_WIDER.lonMax}`
      );
      const json = await resp.json();
      const vesselMap = new Map();
      (json.data || []).forEach(v => {
        vesselMap.set(v.mmsi, {
          mmsi: v.mmsi, name: v.ship_name, lat: v.lat, lon: v.lon,
          shipType: v.ship_type, draft: v.draught, navStatus: v.nav_status,
          destination: v.destination
        });
      });
      data = aggregateVessels(vesselMap, cache.data);
      data._source = 'datalastic';
    } else {
      // Unknown provider — fall back to seed
      const seed = loadSeedData();
      if (seed) {
        seed._source = 'seed';
        return res.status(200).json(seed);
      }
      return res.status(400).json({ error: `Unknown AIS provider: ${provider}` });
    }

    // Update cache
    cache = { data, timestamp: Date.now() };
    return res.status(200).json(data);
  } catch (err) {
    console.error('AIS API error:', err.message);
    // Return cached data if available, otherwise seed
    if (cache.data) {
      cache.data._source = 'cache';
      return res.status(200).json(cache.data);
    }
    const seed = loadSeedData();
    if (seed) {
      seed._source = 'seed';
      return res.status(200).json(seed);
    }
    return res.status(500).json({ error: 'Failed to fetch vessel data.', details: err.message });
  }
};
