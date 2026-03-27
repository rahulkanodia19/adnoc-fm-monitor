// ============================================================
// api/market-prices.js -- Vercel Serverless Function
// OilPriceAPI proxy: fetches live crude prices + daily history.
// Refined products (Gasoline 95 RON, Jet Kero, Gasoil) served
// from seed data (S&P Global Platts XLSX source).
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
const COMMODITIES = {
  wti:      { apiCode: 'WTI_USD',          historyCode: 'WTI_USD',          label: 'WTI Crude' },
  brent:    { apiCode: 'BRENT_CRUDE_USD',  historyCode: 'BRENT_CRUDE_USD',  label: 'Dated Brent' },
  murban:   { apiCode: 'MURBAN_CRUDE_USD', historyCode: null,               label: 'Murban Crude' }, // history from murban-history.json
  gasoline: { apiCode: null,               historyCode: null,               label: 'Gasoline 95 RON' }, // from seed (Platts)
  jetfuel:  { apiCode: null,               historyCode: null,               label: 'Jet Kero' },       // from seed (Platts)
  gasoil:   { apiCode: null,               historyCode: null,               label: 'Gasoil 10 ppm' },  // from seed (Platts)
  lng:      { apiCode: null,               historyCode: null,               label: 'LNG JKM Spot' },   // from seed (Platts)
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

// ---------- Fetch history from OilPriceAPI ----------
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

// ---------- Build full response (live data + seed for products) ----------
function buildResponse(latestResults, historyResults) {
  const prices = {};

  for (const [key, config] of Object.entries(COMMODITIES)) {
    // Skip commodities without an API source -- they come from seed data
    if (!config.apiCode) continue;

    const latest = latestResults[key];
    const history = historyResults[key] || [];

    let currentPrice = latest?.data?.price || 0;
    const changes24h = latest?.data?.changes?.['24h'];
    const apiPrevClose = changes24h?.previous_price || null;

    const metrics = computeMetrics(history, currentPrice);
    const previousClose = apiPrevClose || metrics.previousClose;

    prices[key] = {
      current: currentPrice,
      previousClose: previousClose,
      high52w: metrics.high52w,
      low52w: metrics.low52w,
      history: history,
    };
  }

  // Merge seed data for refined products without a live API source
  const seedData = loadSeedData();
  if (seedData?.prices) {
    for (const [key, config] of Object.entries(COMMODITIES)) {
      if (!config.apiCode && seedData.prices[key]) {
        prices[key] = seedData.prices[key];
      }
    }
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
      // Fetch from OilPriceAPI for commodities with an apiCode (except Murban)
      const apiEntries = entries.filter(([key, config]) => key !== 'murban' && config.apiCode);
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
