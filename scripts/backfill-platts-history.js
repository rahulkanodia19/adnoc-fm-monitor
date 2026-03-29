#!/usr/bin/env node
/**
 * backfill-platts-history.js — One-time script to backfill historical data
 * for newly added LNG/gas commodities (NWE DES, Dutch TTF, Henry Hub).
 *
 * Uses the Market Data v3 historical endpoint with the plattsconnect token.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const USERNAME = process.env.SPGCI_USERNAME;
const PASSWORD = process.env.SPGCI_PASSWORD;
if (!USERNAME || !PASSWORD) { console.error('Error: SPGCI_USERNAME and SPGCI_PASSWORD required'); process.exit(1); }

const OKTA_ISSUER = 'https://secure.signin.spglobal.com/oauth2/spglobal';
const OKTA_CLIENT_ID = '0oa1m9vh7psxYxtzL1d8';
const REDIRECT_URI = 'https://core.spglobal.com/web/index.html';
const SCOPES = 'openid profile email offline_access plattsconnect';

const PROJECT_DIR = path.join(__dirname, '..');
const SEED_FILE = path.join(PROJECT_DIR, 'market-prices-seed.json');
const TOKEN_FILE = path.join(PROJECT_DIR, '.platts-token.json');

const HISTORY_API = 'https://api.platts.com/market-data/v3/value/history/symbol';
const START_DATE = '2021-03-29'; // match LNG JKM history start

const BACKFILL_SYMBOLS = {
  AASXU00: { key: 'lng_nwe',   bate: 'u' },
  DTMSC01: { key: 'ttf',       bate: 'c' },
  AASYN00: { key: 'henry_hub', bate: 'u' },
};

// ---------- Auth (same as fetch-platts-prices.js) ----------
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getToken() {
  // Try cached refresh token
  try {
    const cached = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    if (cached.refresh_token) {
      const body = new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: cached.refresh_token,
        client_id: OKTA_CLIENT_ID, scope: SCOPES,
      });
      const resp = await fetch(`${OKTA_ISSUER}/v1/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
      });
      if (resp.ok) {
        const tokens = await resp.json();
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: Date.now() + tokens.expires_in * 1000 }, null, 2));
        return tokens.access_token;
      }
    }
  } catch {}

  // Full PKCE flow
  console.log(`  Authenticating as ${USERNAME}...`);
  const authnResp = await fetch('https://secure.signin.spglobal.com/api/v1/authn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const { sessionToken } = await authnResp.json();

  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const authParams = new URLSearchParams({
    client_id: OKTA_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: SCOPES, state: base64url(crypto.randomBytes(16)), nonce: base64url(crypto.randomBytes(16)),
    code_challenge: challenge, code_challenge_method: 'S256', sessionToken,
  });
  const authResp = await fetch(`${OKTA_ISSUER}/v1/authorize?${authParams}`, { redirect: 'manual' });
  const code = authResp.headers.get('location').match(/code=([^&]+)/)[1];

  const tokenResp = await fetch(`${OKTA_ISSUER}/v1/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: OKTA_CLIENT_ID, code_verifier: verifier }).toString(),
  });
  const tokens = await tokenResp.json();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: Date.now() + tokens.expires_in * 1000 }, null, 2));
  return tokens.access_token;
}

// ---------- Fetch historical data with pagination ----------
async function fetchHistory(token, symbol, bate) {
  const headers = { 'Authorization': `Bearer ${token}`, 'appkey': 'realtime' };
  const allData = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const params = new URLSearchParams({
      filter: `symbol IN ("${symbol}")`,
      startDate: START_DATE,
      endDate: '2026-03-27',
      pageSize: '1000',
      page: String(page),
    });

    const resp = await fetch(`${HISTORY_API}?${params}`, { headers });
    if (!resp.ok) throw new Error(`History API: HTTP ${resp.status} — ${await resp.text()}`);
    const json = await resp.json();

    totalPages = json.metadata?.totalPages || 1;
    const results = json.results || [];
    for (const r of results) {
      for (const d of r.data || []) {
        if (d.bate === bate && d.value != null) {
          allData.push({ date: d.assessDate.substring(0, 10), price: +d.value.toFixed(3) });
        }
      }
    }

    console.log(`    Page ${page}/${totalPages} — ${allData.length} points so far`);
    page++;
  }

  // Sort and deduplicate
  allData.sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set();
  return allData.filter(d => { if (seen.has(d.date)) return false; seen.add(d.date); return true; });
}

// ---------- Main ----------
async function main() {
  console.log('[1/2] Obtaining token...');
  const token = await getToken();

  console.log('\n[2/2] Fetching historical data...');
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));

  for (const [symbol, { key, bate }] of Object.entries(BACKFILL_SYMBOLS)) {
    console.log(`\n  ${key} (${symbol}, bate=${bate}):`);
    const history = await fetchHistory(token, symbol, bate);
    console.log(`    Total: ${history.length} points (${history[0]?.date} to ${history[history.length - 1]?.date})`);

    if (!seed.prices[key]) {
      seed.prices[key] = { current: 0, previousClose: 0, high52w: 0, low52w: 0, history: [] };
    }

    seed.prices[key].history = history;
    seed.prices[key].current = history[history.length - 1]?.price || 0;
    if (history.length > 1) seed.prices[key].previousClose = history[history.length - 2]?.price || 0;

    const recent = history.slice(-260);
    const prices = recent.map(h => h.price);
    seed.prices[key].high52w = Math.max(...prices);
    seed.prices[key].low52w = Math.min(...prices);
  }

  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
  console.log(`\nWrote ${SEED_FILE} (${(fs.statSync(SEED_FILE).size / 1024).toFixed(1)} KB)`);
  console.log('Done.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
