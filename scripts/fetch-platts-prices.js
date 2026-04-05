#!/usr/bin/env node
/**
 * fetch-platts-prices.js — Fetch daily prices from S&P Global Platts
 *
 * Auth: Okta PKCE flow using core.spglobal.com SSO credentials
 * Data: platts-platform search API (same backend as the web portal)
 *
 * Usage:
 *   node scripts/fetch-platts-prices.js
 *
 * Env vars (in .env):
 *   SPGCI_USERNAME  — S&P Global / core.spglobal.com email
 *   SPGCI_PASSWORD  — S&P Global password
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- Load .env ----------
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const USERNAME = process.env.SPGCI_USERNAME;
const PASSWORD = process.env.SPGCI_PASSWORD;
if (!USERNAME || !PASSWORD) {
  console.error('Error: SPGCI_USERNAME and SPGCI_PASSWORD must be set in .env');
  process.exit(1);
}

// ---------- Constants ----------
const OKTA_ISSUER = 'https://secure.signin.spglobal.com/oauth2/spglobal';
const OKTA_CLIENT_ID = '0oa1m9vh7psxYxtzL1d8';
const REDIRECT_URI = 'https://core.spglobal.com/web/index.html';
const SCOPES = 'openid profile email offline_access plattsconnect';

const SEARCH_URL = 'https://api.platts.com/platts-platform/search/v2/symbol/search';
const HISTORY_URL = 'https://api.platts.com/platts-platform/search/v2/symbol/history';

const SYMBOLS = {
  ICLL001: { key: 'brent',       label: 'ICE Brent Settlement Mo01',  bate: 'Close' },
  PCACG00: { key: 'wti',         label: 'WTI Cushing Mo01',           bate: 'Close' },
  // Murban removed — now sourced from IFAD (ICE) via scrape-murban-ice.js → murban-history.json
  AFUJB00: { key: 'gasoline',    label: 'Gasoline 95 RON Arab Gulf',  bate: 'Close' },
  PJAAA00: { key: 'jetfuel',     label: 'Jet Kero FOB Arab Gulf',     bate: 'Close' },
  AAIDT00: { key: 'gasoil',      label: 'Gasoil 10 ppm FOB Arab Gulf',bate: 'Close' },
  AAOVQ00: { key: 'lng',         label: 'LNG Japan/Korea DES Spot',   bate: 'Middle Price Index' },
  AASXU00: { key: 'lng_nwe',     label: 'LNG NWE DES',                bate: 'Close' },
  DTMSC01: { key: 'ttf',         label: 'Dutch TTF Mo01',             bate: 'Close' },
  AASYN00: { key: 'henry_hub',   label: 'Henry Hub $/MMBtu',          bate: 'Close' },
  AWARA00: { key: 'awrp',        label: 'Crude Oil AWRP (War Risk)',  bate: 'Close' },
  // Phase 1 additions (Platts-confirmed 2026-04-05):
  PMUDM00: { key: 'lpg_propane', label: 'LPG Propane FOB AG 20-40 days',  bate: 'Close' },
  PMUDR00: { key: 'lpg_butane',  label: 'LPG Butane FOB AG 20-40 days',   bate: 'Close' },
  AMMOI00: { key: 'ammonia',     label: 'Ammonia FOB Middle East',    bate: 'Close' },
};

const PROJECT_DIR = path.join(__dirname, '..');
const SEED_FILE = path.join(PROJECT_DIR, 'market-prices-seed.json');
const TOKEN_FILE = path.join(PROJECT_DIR, '.platts-token.json');

// ---------- PKCE Helpers ----------
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ---------- Okta Auth ----------
async function getOktaToken() {
  // Check for cached refresh token
  let refreshToken = null;
  try {
    const cached = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    if (cached.refresh_token) refreshToken = cached.refresh_token;
  } catch {}

  // Try refresh token first
  if (refreshToken) {
    try {
      const token = await refreshAccessToken(refreshToken);
      if (token) return token;
    } catch (e) {
      console.log('  Refresh token expired, re-authenticating...');
    }
  }

  // Full PKCE flow
  return await fullPKCEFlow();
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OKTA_CLIENT_ID,
    scope: SCOPES,
  });

  const resp = await fetch(`${OKTA_ISSUER}/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Refresh failed: HTTP ${resp.status}`);
  const tokens = await resp.json();
  saveTokens(tokens);
  return tokens.access_token;
}

async function fullPKCEFlow() {
  // Step 1: Authn — get session token
  console.log(`  Authenticating as ${USERNAME}...`);
  const authnResp = await fetch('https://secure.signin.spglobal.com/api/v1/authn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!authnResp.ok) throw new Error(`Authn failed: HTTP ${authnResp.status}`);
  const authnData = await authnResp.json();
  if (authnData.status !== 'SUCCESS') throw new Error(`Authn status: ${authnData.status}`);
  const sessionToken = authnData.sessionToken;

  // Step 2: Authorize — get auth code
  const { verifier, challenge } = generatePKCE();
  const state = base64url(crypto.randomBytes(16));
  const nonce = base64url(crypto.randomBytes(16));

  const authParams = new URLSearchParams({
    client_id: OKTA_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state, nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    sessionToken,
  });

  const authResp = await fetch(`${OKTA_ISSUER}/v1/authorize?${authParams}`, {
    redirect: 'manual',
  });
  const location = authResp.headers.get('location') || '';
  const codeMatch = location.match(/[?&]code=([^&]+)/);
  if (!codeMatch) throw new Error(`No auth code in redirect: ${location.substring(0, 200)}`);
  const code = codeMatch[1];

  // Step 3: Token exchange
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: OKTA_CLIENT_ID,
    code_verifier: verifier,
  });

  const tokenResp = await fetch(`${OKTA_ISSUER}/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });
  if (!tokenResp.ok) throw new Error(`Token exchange failed: HTTP ${tokenResp.status}`);
  const tokens = await tokenResp.json();
  saveTokens(tokens);
  console.log(`  Token obtained (expires in ${tokens.expires_in}s)`);
  return tokens.access_token;
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
  }, null, 2));
}

// ---------- Fetch Prices ----------
async function searchPrices(token, query, pageSize = 200) {
  const resp = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'appkey': 'realtime',
      'x-origin-app': 'Web',
    },
    body: JSON.stringify({
      query,
      page: 1,
      pageSize,
      priceAssessments: {
        metadata: 'Assessment_Frequency,AssessmentDate,Currency,UOM,Price,Commodity,PublishedDate,DeltaPrice',
        facets: [],
      },
      appendAstericks: true,
      fromDate: '',
      toDate: '',
    }),
  });

  if (!resp.ok) throw new Error(`Search API: HTTP ${resp.status} — ${await resp.text()}`);
  const data = await resp.json();
  return data.Items || [];
}

async function fetchCurrentPrices(token) {
  const symbolSet = new Set(Object.keys(SYMBOLS));
  const found = new Map();

  // First pass: broad search (catches benchmarks like Brent, WTI, LNG JKM)
  const broadItems = await searchPrices(token, '*', 200);
  for (const item of broadItems) {
    if (symbolSet.has(item.Symbol) && item.Price) found.set(item.Symbol, item);
  }

  // Second pass: search individually for any missing symbols
  const missing = [...symbolSet].filter(s => !found.has(s));
  if (missing.length > 0) {
    console.log(`  Searching individually for ${missing.length} missing symbols...`);
    for (const sym of missing) {
      const items = await searchPrices(token, sym, 10);
      const match = items.find(i => i.Symbol === sym && i.Price);
      if (match) found.set(sym, match);
    }
  }

  return [...found.values()];
}

// ---------- Update Seed ----------
function updateSeed(priceItems) {
  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  } catch {
    seed = { lastUpdated: null, _source: 'seed', prices: {} };
  }

  let latestDate = null;

  for (const item of priceItems) {
    const config = SYMBOLS[item.Symbol];
    if (!config) continue;

    const price = parseFloat(item.Price);
    if (!price || isNaN(price)) {
      console.log(`  Skipping ${item.Symbol} (${config.key}): no price`);
      continue;
    }

    const dateStr = item.AssessmentDate ? item.AssessmentDate.substring(0, 10) : null;
    if (!dateStr) {
      console.log(`  Skipping ${item.Symbol} (${config.key}): no date`);
      continue;
    }

    const delta = parseFloat(item.DeltaPrice) || 0;
    const previousClose = +(price - delta).toFixed(3);

    // Initialize commodity if missing
    if (!seed.prices[config.key]) {
      seed.prices[config.key] = {
        current: 0,
        previousClose: 0,
        high52w: 0,
        low52w: Infinity,
        history: [],
      };
    }

    const entry = seed.prices[config.key];

    // Append to history if not already present
    const existing = entry.history.findIndex(h => h.date === dateStr);
    if (existing >= 0) {
      entry.history[existing].price = price;
    } else {
      entry.history.push({ date: dateStr, price });
      entry.history.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Update current metrics
    entry.current = price;
    entry.previousClose = previousClose;

    // Recompute 52-week high/low from last 260 trading days
    const recent = entry.history.slice(-260);
    const prices = recent.map(h => h.price);
    entry.high52w = Math.max(...prices);
    entry.low52w = Math.min(...prices);

    if (!latestDate || dateStr > latestDate) latestDate = dateStr;

    console.log(`  ${config.key.padEnd(10)} ${item.Symbol}  ${price.toString().padStart(8)}  Δ${delta >= 0 ? '+' : ''}${delta}  (${dateStr})`);
  }

  if (latestDate) {
    seed.lastUpdated = `${latestDate}T00:00:00Z`;
  }
  seed._source = 'seed';

  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
  const size = fs.statSync(SEED_FILE).size;
  console.log(`\n  Wrote ${SEED_FILE} (${(size / 1024).toFixed(1)} KB)`);
}

// ---------- History Backfill ----------
async function backfillHistory(token, symbols, startDate) {
  const start = startDate || '2023-01-01';
  const resp = await fetch(HISTORY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'appkey': 'realtime',
      'x-origin-app': 'Web',
    },
    body: JSON.stringify({
      Symbols: symbols,
      startDate: start,
      endDate: new Date().toISOString().substring(0, 10),
    }),
  });

  if (!resp.ok) {
    console.log(`  History API: HTTP ${resp.status} (skipping backfill)`);
    return {};
  }

  const data = await resp.json();
  const result = {};
  for (const entry of (data.Results || [])) {
    const sym = entry.Symbol;
    const config = SYMBOLS[sym];
    if (!config) continue;
    result[config.key] = (entry.Data || [])
      .filter(d => d.Bate === 'c' && d.Value)
      .map(d => ({ date: d.AssessDate.substring(0, 10), price: parseFloat(d.Value) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return result;
}

// Auto-backfill any symbols with insufficient history (<260 entries)
async function autoBackfillShort(token, seed) {
  // Find symbols with short history
  const keyToSym = {};
  for (const [sym, cfg] of Object.entries(SYMBOLS)) keyToSym[cfg.key] = sym;

  const needBackfill = [];
  for (const [key, data] of Object.entries(seed.prices || {})) {
    const hist = data.history || [];
    const sym = keyToSym[key];
    if (sym && hist.length < 260) {
      needBackfill.push({ sym, key, currentLen: hist.length });
    }
  }
  if (needBackfill.length === 0) return false;

  console.log(`  Auto-backfilling ${needBackfill.length} symbol(s) with short history:`);
  needBackfill.forEach(x => console.log(`    ${x.sym} (${x.key}): ${x.currentLen} entries`));

  const symbols = needBackfill.map(x => x.sym);
  const histories = await backfillHistory(token, symbols);

  let updated = false;
  for (const { key } of needBackfill) {
    const newHist = histories[key];
    if (!newHist || newHist.length === 0) continue;
    seed.prices[key].history = newHist;
    // Recompute 52W high/low + previousClose
    const window = newHist.slice(-260);
    const prices = window.map(h => h.price);
    seed.prices[key].high52w = Math.max(...prices);
    seed.prices[key].low52w = Math.min(...prices);
    if (newHist.length >= 2) {
      seed.prices[key].previousClose = newHist[newHist.length - 2].price;
    }
    const latest = newHist[newHist.length - 1];
    seed.prices[key].current = latest.price;
    console.log(`    ${key}: backfilled to ${newHist.length} entries (${newHist[0].date} → ${latest.date})`);
    updated = true;
  }
  return updated;
}

// ---------- Main ----------
async function main() {
  console.log('[1/4] Obtaining Platts Platform token...');
  const token = await getOktaToken();

  console.log('\n[2/4] Fetching current prices...');
  const items = await fetchCurrentPrices(token);
  console.log(`  Found ${items.length} of ${Object.keys(SYMBOLS).length} symbols\n`);

  if (items.length === 0) {
    console.error('Error: no matching prices found.');
    process.exit(1);
  }

  console.log('[3/4] Updating seed data...');
  updateSeed(items);

  // Auto-backfill any symbols with short history (<260 entries)
  let seed;
  try { seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8')); } catch { seed = null; }
  if (seed) {
    console.log('\n[4/4] Auto-backfilling short histories...');
    const updated = await autoBackfillShort(token, seed);
    if (updated) {
      fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
      console.log('  Seed updated with backfilled history');
    } else {
      console.log('  All symbols have sufficient history (skipping backfill)');
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
