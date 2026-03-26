#!/usr/bin/env node
// ============================================================
// scripts/scrape-murban.js -- Murban Crude Price Scraper
// Fetches Murban history from Barchart (ICE IFAD DB*0 contract)
// and current price from oilprice.com blend_cache.
// Run daily via cron/GitHub Actions: node scripts/scrape-murban.js
// No API key required -- public endpoints.
// ============================================================

const fs = require('fs');
const path = require('path');

const BARCHART_URL = 'https://advancedmedia.websol.barchart.com/proxies/timeseries/queryeod.ashx?symbol=DB*0&data=daily&maxrecords=730&volume=contract&order=asc&dividends=false&backadjust=false&daystoexpiration=1&contractroll=expiration';
const BLEND_CACHE_URL = 'https://s3.amazonaws.com/oilprice.com/oilprices/blend_cache.json';
const MURBAN_BLEND_ID = '4464';
const HISTORY_FILE = path.join(__dirname, '..', 'murban-history.json');

async function fetchBarchartHistory() {
  console.log('[scrape-murban] Fetching Barchart history (DB*0)...');
  const resp = await fetch(BARCHART_URL, {
    headers: { 'Referer': 'https://oilprice.com/' },
  });
  if (!resp.ok) throw new Error(`Barchart HTTP ${resp.status}`);
  const csv = (await resp.text()).trim();
  const lines = csv.split('\n').filter(l => l.trim());

  return lines.map(line => {
    const parts = line.split(',');
    // Format: symbol,date,open,high,low,close,volume,oi
    const date = parts[1];
    const close = parseFloat(parts[5]);
    return { date, price: close };
  }).filter(h => !isNaN(h.price) && h.price > 0 && h.date);
}

async function fetchBlendCacheCurrent() {
  console.log('[scrape-murban] Fetching blend_cache.json for live price...');
  const resp = await fetch(BLEND_CACHE_URL);
  if (!resp.ok) throw new Error(`blend_cache HTTP ${resp.status}`);
  const cache = await resp.json();
  const murban = cache[MURBAN_BLEND_ID];
  if (!murban) throw new Error('Murban not found in blend_cache');

  const entries = [];
  if (murban.last_price?.[0]) {
    const lp = murban.last_price[0];
    const ts = parseInt(lp.dateadded, 10) * 1000;
    const date = new Date(ts).toISOString().substring(0, 10);
    entries.push({ date, price: parseFloat(lp.price) });
  }
  if (murban.last_close) {
    for (const lc of murban.last_close) {
      const ts = parseInt(lc.dateadded, 10) * 1000;
      const date = new Date(ts).toISOString().substring(0, 10);
      entries.push({ date, price: parseFloat(lc.price) });
    }
  }
  return entries.filter(e => !isNaN(e.price) && e.date);
}

async function main() {
  // Fetch from both sources
  const barchartEntries = await fetchBarchartHistory();
  let blendEntries = [];
  try {
    blendEntries = await fetchBlendCacheCurrent();
  } catch (e) {
    console.error('[scrape-murban] blend_cache failed:', e.message);
  }

  // Merge: Barchart is the base, blend_cache adds/updates the latest entries
  const byDate = new Map();
  for (const e of barchartEntries) byDate.set(e.date, e.price);
  for (const e of blendEntries) byDate.set(e.date, e.price); // blend_cache overwrites for latest dates

  const history = Array.from(byDate.entries())
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const data = {
    commodity: 'Murban Crude',
    source: 'Barchart (ICE Futures Abu Dhabi DB*0) + oilprice.com',
    lastScraped: new Date().toISOString(),
    history,
  };

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
  console.log(`[scrape-murban] Done. ${history.length} entries.`);
  console.log(`[scrape-murban] Range: ${history[0].date} $${history[0].price} to ${history[history.length - 1].date} $${history[history.length - 1].price}`);
}

main().catch(err => {
  console.error('[scrape-murban] Error:', err.message);
  process.exit(1);
});
