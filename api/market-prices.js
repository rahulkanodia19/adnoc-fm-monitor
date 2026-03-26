// ============================================================
// api/market-prices.js -- Vercel Serverless Function
// OilPriceAPI proxy: fetches live prices + daily history,
// computes all metrics from live data only.
// Converts refined products from $/gal → $/bbl (×42).
// Falls back to market-prices-seed.json only when no API key.
// ============================================================

const fs = require('fs');
const path = require('path');

// ---------- In-memory caches ----------
let historyCache = { data: null, timestamp: 0 };
const HISTORY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

let latestCache = { data: null, timestamp: 0 };
const LATEST_CACHE_TTL = 15 * 60 * 1000;

let responseCache = { data: null, timestamp: 0 };
const RESPONSE_CACHE_TTL = 15 * 60 * 1000;

// ---------- Constants ----------
const GAL_TO_BBL = 42;
const MT_TO_BBL_NAPHTHA = 7.45; // 1 metric ton of naphtha ≈ 7.45 barrels
const GAL_PRODUCT_KEYS = new Set(['gasoline', 'diesel', 'jetfuel']); // $/gal → $/bbl (×42)
const MT_PRODUCT_KEYS = new Set(['naphtha']); // $/mt → $/bbl (÷7.45)

const COMMODITIES = {
  wti:      { apiCode: 'WTI_USD',          historyCode: 'WTI_USD',          label: 'WTI Crude' },
  brent:    { apiCode: 'BRENT_CRUDE_USD',  historyCode: 'BRENT_CRUDE_USD',  label: 'Brent Crude' },
  murban:   { apiCode: 'MURBAN_CRUDE_USD', historyCode: null,               label: 'Murban Crude' }, // history from murban-history.json
  gasoline: { apiCode: 'GASOLINE_RBOB_USD', historyCode: 'GASOLINE_RBOB_USD', label: 'Gasoline (RBOB)' },
  diesel:   { apiCode: 'HEATING_OIL_USD',  historyCode: 'HEATING_OIL_USD',  label: 'Diesel (ULSD)' },
  jetfuel:  { apiCode: 'JET_FUEL_USD',     historyCode: 'JET_FUEL_USD',     label: 'Jet Fuel' },
  naphtha:  { apiCode: 'NAPHTHA_USD',      historyCode: 'NAPHTHA_USD',      label: 'Naphtha' },
};

// ---------- Load Murban history from scraped file ----------
function loadMurbanHistory() {
  try {
    const histPath = path.join(__dirname, '..', 'murban-history.json');
    const raw = fs.readFileSync(histPath, 'utf-8');
    const data = JSON.parse(raw);
    return (data.history || []).map(h => ({ date: h.date, price: h.price }));
  } catch (e) {
    return [];
  }
}

// ---------- Load seed/fallback data ----------
function loadSeedData() {
  try {
    const seedPath = path.join(__dirname, '..', 'market-prices-seed.json');
    const raw = fs.readFileSync(seedPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ---------- Fetch latest price ----------
async function fetchLatest(apiKey, apiCode) {
  const url = `https://api.oilpriceapi.com/v1/prices/latest?by_code=${apiCode}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`OilPriceAPI latest ${apiCode}: HTTP ${resp.status}`);
  return resp.json();
}

// ---------- Fetch live Murban price from oilprice.com (no API key needed) ----------
const BLEND_CACHE_URL = 'https://s3.amazonaws.com/oilprice.com/oilprices/blend_cache.json';
const MURBAN_BLEND_ID = '4464';

async function fetchMurbanLive() {
  const resp = await fetch(BLEND_CACHE_URL);
  if (!resp.ok) throw new Error(`blend_cache.json: HTTP ${resp.status}`);
  const cache = await resp.json();
  const murban = cache[MURBAN_BLEND_ID];
  if (!murban) throw new Error('Murban not found in blend_cache');

  const lp = murban.last_price?.[0];
  const lc = murban.last_close?.[0];
  const currentPrice = lp ? parseFloat(lp.price) : 0;
  const previousClose = lc ? parseFloat(lc.price) : currentPrice;
  const change = lp ? parseFloat(lp.change) : 0;
  const changePct = lp ? parseFloat(lp.change_percent) : 0;

  return {
    data: {
      price: currentPrice,
      changes: { '24h': { previous_price: previousClose, amount: change, percent: changePct } },
    },
  };
}

// ---------- Fetch history for a given period ----------
async function fetchPeriod(apiKey, apiCode, period) {
  const url = `https://api.oilpriceapi.com/v1/prices/past_${period}?by_code=${apiCode}&interval=daily&per_page=1000`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`OilPriceAPI ${period} ${apiCode}: HTTP ${resp.status}`);
  return resp.json();
}

// ---------- Barchart symbol mapping for products with sparse OilPriceAPI data ----------
const BARCHART_SYMBOLS = {
  gasoline: { symbol: 'RB*0', unit: 'gal' },   // RBOB Gasoline futures ($/gal)
  diesel:   { symbol: 'HO*0', unit: 'gal' },   // Heating Oil (ULSD) futures ($/gal)
  naphtha:  { symbol: 'NF*0', unit: 'bbl' },   // ICE Naphtha futures ($/bbl)
};

async function fetchBarchartHistory(symbol) {
  const url = `https://advancedmedia.websol.barchart.com/proxies/timeseries/queryeod.ashx?symbol=${encodeURIComponent(symbol)}&data=daily&maxrecords=400&volume=contract&order=asc&dividends=false&backadjust=false&daystoexpiration=1&contractroll=expiration`;
  const resp = await fetch(url, { headers: { 'Referer': 'https://oilprice.com/' } });
  if (!resp.ok) throw new Error(`Barchart ${symbol}: HTTP ${resp.status}`);
  const csv = (await resp.text()).trim();
  return csv.split('\n').filter(l => l.trim()).map(line => {
    const parts = line.split(',');
    return { date: parts[1], price: parseFloat(parts[5]) }; // close price
  }).filter(h => !isNaN(h.price) && h.price > 0 && h.date);
}

// ---------- Fetch history: OilPriceAPI first, Barchart supplement for sparse products ----------
async function fetchHistory(apiKey, historyCode) {
  const yearData = await fetchPeriod(apiKey, historyCode, 'year');
  return parseHistory(yearData);
}

// ---------- Parse history response into sorted array ----------
function parseHistory(apiResponse) {
  const prices = apiResponse?.data?.prices || apiResponse?.data || [];
  if (!Array.isArray(prices)) return [];

  return prices
    .filter(p => p.price != null && p.created_at)
    .map(p => ({
      date: p.created_at.substring(0, 10),
      price: +p.price.toFixed(3),
    }))
    .reduce((acc, entry) => {
      const existing = acc.findIndex(e => e.date === entry.date);
      if (existing >= 0) acc[existing] = entry;
      else acc.push(entry);
      return acc;
    }, [])
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Convert product prices from $/gal to $/bbl ----------
function convertToBbl(price) {
  return +(price * GAL_TO_BBL).toFixed(2);
}

// ---------- Compute metrics from history ----------
function computeMetrics(history, currentPrice) {
  if (!history || history.length === 0) {
    return { previousClose: currentPrice, high52w: currentPrice, low52w: currentPrice };
  }

  if (history.length === 1) {
    return { previousClose: history[0].price, high52w: Math.max(history[0].price, currentPrice), low52w: Math.min(history[0].price, currentPrice) };
  }

  const previousClose = history[history.length - 2].price;

  let high52w = -Infinity;
  let low52w = Infinity;
  for (const entry of history) {
    if (entry.price > high52w) high52w = entry.price;
    if (entry.price < low52w) low52w = entry.price;
  }
  if (currentPrice > high52w) high52w = currentPrice;
  if (currentPrice < low52w) low52w = currentPrice;

  return { previousClose, high52w, low52w };
}

// ---------- Build full response (live data only) ----------
function buildResponse(latestResults, historyResults) {
  const prices = {};

  for (const [key, config] of Object.entries(COMMODITIES)) {
    const latest = latestResults[key];
    const liveHistory = historyResults[key] || [];
    const isGalProduct = GAL_PRODUCT_KEYS.has(key);
    const isMtProduct = MT_PRODUCT_KEYS.has(key);

    // Get current price from latest endpoint
    let currentPrice = latest?.data?.price || 0;

    // Extract 24h change data from latest
    const changes24h = latest?.data?.changes?.['24h'];
    let apiPrevClose = changes24h?.previous_price || null;

    // Convert to $/bbl for products
    let history = liveHistory;
    if (isGalProduct) {
      // $/gal → $/bbl (×42)
      if (currentPrice > 0) currentPrice = convertToBbl(currentPrice);
      if (apiPrevClose) apiPrevClose = convertToBbl(apiPrevClose);
      history = liveHistory.map(h => ({ date: h.date, price: convertToBbl(h.price) }));
    } else if (isMtProduct) {
      // $/mt → $/bbl (÷7.45)
      const mtConvert = p => +(p / MT_TO_BBL_NAPHTHA).toFixed(2);
      if (currentPrice > 0) currentPrice = mtConvert(currentPrice);
      if (apiPrevClose) apiPrevClose = mtConvert(apiPrevClose);
      history = liveHistory.map(h => ({ date: h.date, price: mtConvert(h.price) }));
    }

    const metrics = computeMetrics(history, currentPrice);

    // Prefer the API's 24h previous_price over history-derived previousClose
    // (more accurate for commodities with sparse history like Murban)
    const previousClose = apiPrevClose || metrics.previousClose;

    prices[key] = {
      current: currentPrice,
      previousClose: previousClose,
      high52w: metrics.high52w,
      low52w: metrics.low52w,
      history: history,
    };
  }

  return {
    lastUpdated: new Date().toISOString(),
    _source: 'live',
    prices,
  };
}

// ---------- Main handler ----------
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check response cache
  if (responseCache.data && (Date.now() - responseCache.timestamp) < RESPONSE_CACHE_TTL) {
    return res.status(200).json(responseCache.data);
  }

  const apiKey = process.env.OILPRICEAPI_KEY;

  // No API key: serve seed data
  if (!apiKey) {
    const seedData = loadSeedData();
    if (seedData) {
      seedData._source = 'seed';
      return res.status(200).json(seedData);
    }
    return res.status(503).json({ error: 'No API key configured and no seed data available.' });
  }

  try {
    const entries = Object.entries(COMMODITIES);
    const now = Date.now();

    // --- Fetch latest prices (15-min cache) ---
    let latestResults = latestCache.data;
    if (!latestResults || (now - latestCache.timestamp) >= LATEST_CACHE_TTL) {
      // Fetch from OilPriceAPI for all except Murban
      const apiEntries = entries.filter(([key]) => key !== 'murban');
      const latestPromises = apiEntries.map(([key, config]) =>
        fetchLatest(apiKey, config.apiCode)
          .then(data => ({ key, data }))
          .catch(err => { console.error(`Failed latest ${key}:`, err.message); return { key, data: null }; })
      );

      // Fetch Murban live from oilprice.com (free, no API key)
      latestPromises.push(
        fetchMurbanLive()
          .then(data => ({ key: 'murban', data }))
          .catch(err => { console.error('Failed Murban live:', err.message); return { key: 'murban', data: null }; })
      );

      const rawLatest = await Promise.all(latestPromises);
      latestResults = {};
      for (const { key, data } of rawLatest) latestResults[key] = data;
      latestCache = { data: latestResults, timestamp: now };
    }

    // --- Fetch historical data (1-hour cache) ---
    let historyResults = historyCache.data;
    if (!historyResults || (now - historyCache.timestamp) >= HISTORY_CACHE_TTL) {
      // Fetch history from OilPriceAPI for commodities with a historyCode
      // Murban uses a local scraped file instead
      const apiEntries = entries.filter(([, config]) => config.historyCode);
      const histPromises = apiEntries.map(([key, config]) =>
        fetchHistory(apiKey, config.historyCode)
          .then(data => ({ key, data }))
          .catch(err => { console.error(`Failed history ${key}:`, err.message); return { key, data: [] }; })
      );
      const rawHistory = await Promise.all(histPromises);
      historyResults = {};
      for (const { key, data } of rawHistory) historyResults[key] = data;

      // Load Murban history from scraped file
      historyResults.murban = loadMurbanHistory();

      // Supplement sparse products with Barchart data
      for (const [key, bcConfig] of Object.entries(BARCHART_SYMBOLS)) {
        if (!historyResults[key] || historyResults[key].length < 100) {
          try {
            let barchartData = await fetchBarchartHistory(bcConfig.symbol);
            // Convert Barchart naphtha from $/bbl to $/mt so buildResponse can convert back uniformly
            if (bcConfig.unit === 'bbl' && MT_PRODUCT_KEYS.has(key)) {
              barchartData = barchartData.map(h => ({ date: h.date, price: +(h.price * MT_TO_BBL_NAPHTHA).toFixed(2) }));
            }
            if (barchartData.length > (historyResults[key]?.length || 0)) {
              console.log(`Using Barchart for ${key}: ${barchartData.length} entries (vs ${historyResults[key]?.length || 0} from API)`);
              historyResults[key] = barchartData;
            }
          } catch (err) { console.error(`Barchart fallback for ${key} failed:`, err.message); }
        }
      }

      historyCache = { data: historyResults, timestamp: now };
    }

    const response = buildResponse(latestResults, historyResults);

    responseCache = { data: response, timestamp: now };
    return res.status(200).json(response);
  } catch (err) {
    console.error('Market prices API error:', err.message);

    if (responseCache.data) {
      responseCache.data._source = 'stale';
      return res.status(200).json(responseCache.data);
    }

    const seedData = loadSeedData();
    if (seedData) {
      seedData._source = 'seed-fallback';
      return res.status(200).json(seedData);
    }

    return res.status(500).json({ error: 'Failed to fetch market prices.', details: err.message });
  }
};
