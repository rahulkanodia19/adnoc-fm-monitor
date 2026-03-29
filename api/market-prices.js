// ============================================================
// api/market-prices.js -- Vercel Serverless Function
// Serves market prices from S&P Global Platts seed data.
// Updated daily by scripts/fetch-platts-prices.js via sync pipeline.
// ============================================================

const fs = require('fs');
const path = require('path');

// ---------- In-memory cache ----------
let responseCache = { data: null, timestamp: 0 };
const RESPONSE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ---------- Load seed data ----------
function loadSeedData() {
  try {
    const seedPath = path.join(__dirname, '..', 'market-prices-seed.json');
    const raw = fs.readFileSync(seedPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ---------- Determine freshness ----------
function getSource(seedData) {
  if (!seedData?.lastUpdated) return 'seed';
  const lastDate = new Date(seedData.lastUpdated);
  const ageMs = Date.now() - lastDate.getTime();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  return ageMs < THREE_DAYS ? 'live' : 'stale';
}

// ---------- Main handler ----------
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check in-memory cache
  if (responseCache.data && (Date.now() - responseCache.timestamp) < RESPONSE_CACHE_TTL) {
    return res.status(200).json(responseCache.data);
  }

  const seedData = loadSeedData();
  if (!seedData) {
    return res.status(503).json({ error: 'No market price data available.' });
  }

  const source = getSource(seedData);
  const response = {
    lastUpdated: seedData.lastUpdated,
    _source: source,
    prices: seedData.prices,
  };

  responseCache = { data: response, timestamp: Date.now() };
  return res.status(200).json(response);
};
