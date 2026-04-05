#!/usr/bin/env node
// ============================================================
// scripts/scrape-murban-investing.js -- Murban front-month fetcher
// Source: Investing.com historical-data API (IFAD front-month continuation)
// No auth; required headers: User-Agent + Referer + domain-id: www
//
// Pair ID 1172116 = "Abu Dhabi Murban Crude Oil Futures" (IFAD continuation).
// This series auto-rolls across contract expiries (accurate front-month spot-equivalent).
//
// Behavior:
//   - First run (no murban-history.json): fetch full 5-year history
//   - Subsequent runs: fetch last 60 days, merge with existing (union by date)
//
// Output schema (same as before):
//   { commodity, source, lastScraped, history: [{date, price}] }
// ============================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PAIR_ID = 1172116;
const API_BASE = 'https://api.investing.com/api/financialdata/historical';
const HISTORY_FILE = path.join(__dirname, '..', 'murban-history.json');
const BACKFILL_START = '2021-04-01'; // IFAD Murban futures launched March 29, 2021

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.investing.com/',
  'Origin': 'https://www.investing.com',
  'domain-id': 'www',
  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
};

function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchRange(startDate, endDate) {
  const url = `${API_BASE}/${PAIR_ID}?start-date=${startDate}&end-date=${endDate}&time-frame=Daily&add-missing-rows=false`;
  console.log(`[murban-investing] Fetching ${startDate} -> ${endDate}...`);
  // Use curl (Cloudflare rejects Node's fetch TLS fingerprint)
  const args = ['-s', '--max-time', '30', '--compressed', url];
  for (const [k, v] of Object.entries(HEADERS)) {
    args.push('-H', `${k}: ${v}`);
  }
  const output = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (output.startsWith('<')) {
    throw new Error(`Investing.com challenge/HTML response: ${output.slice(0, 200)}`);
  }
  const body = JSON.parse(output);
  if (!Array.isArray(body?.data)) throw new Error('unexpected response: no data array');
  return body.data;
}

function parseRow(row) {
  // rowDateTimestamp: "2026-04-02T00:00:00Z"
  // last_closeRaw: numeric close (as number or string)
  const ts = row.rowDateTimestamp;
  if (!ts) return null;
  const date = ts.slice(0, 10);
  const raw = Number(row.last_closeRaw ?? row.last_close);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const price = Math.round(raw * 100) / 100; // 2-decimal rounding
  return { date, price };
}

function loadExisting() {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const j = JSON.parse(raw);
    // Only reuse if it's an Investing.com file (schema compat) — otherwise start fresh
    const existingSource = (j.source || '').toLowerCase();
    if (!existingSource.includes('investing')) {
      console.log('[murban-investing] Existing murban-history.json is from another source — will overwrite');
      return null;
    }
    if (Array.isArray(j.history)) return j;
  } catch { /* file missing or bad */ }
  return null;
}

async function main() {
  const existing = loadExisting();
  const today = ymd(new Date());

  let rows;
  if (!existing) {
    // Full backfill
    console.log('[murban-investing] No existing file — fetching 5-year backfill');
    rows = await fetchRange(BACKFILL_START, today);
  } else {
    // Incremental: last 60 days
    const sixtyAgo = new Date();
    sixtyAgo.setUTCDate(sixtyAgo.getUTCDate() - 60);
    rows = await fetchRange(ymd(sixtyAgo), today);
  }

  const newEntries = rows.map(parseRow).filter(Boolean);
  console.log(`[murban-investing] Parsed ${newEntries.length} valid entries from Investing.com`);

  if (newEntries.length === 0) throw new Error('no usable entries returned');

  // Merge with existing (union by date, newer value wins for same date)
  const byDate = new Map();
  if (existing) for (const h of existing.history) byDate.set(h.date, h.price);
  for (const h of newEntries) byDate.set(h.date, h.price);

  const history = [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const out = {
    commodity: 'Murban Crude',
    source: 'Investing.com (IFAD Front-Month Continuation)',
    pairId: PAIR_ID,
    lastScraped: new Date().toISOString(),
    history,
  };

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(out, null, 2));
  const first = history[0];
  const last = history[history.length - 1];
  console.log(`[murban-investing] Done. ${history.length} entries, ${first.date} $${first.price} -> ${last.date} $${last.price}`);

  // Sanity check: 52W range
  const recent = history.slice(-260);
  const prices = recent.map(h => h.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  console.log(`[murban-investing] 52W range: $${low} - $${high}`);
}

main().catch(err => {
  console.error('[murban-investing] Error:', err.message);
  process.exit(1);
});
