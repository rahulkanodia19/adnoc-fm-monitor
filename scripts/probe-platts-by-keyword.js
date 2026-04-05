#!/usr/bin/env node
/**
 * probe-platts-by-keyword.js — Keyword-based discovery of subscribed Platts symbols.
 *
 * Queries the Platform Search API with commodity names to discover which symbols
 * this subscription actually has access to. Useful when specific symbol guesses fail.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const USERNAME = process.env.SPGCI_USERNAME;
const PASSWORD = process.env.SPGCI_PASSWORD;

const OKTA_ISSUER = 'https://secure.signin.spglobal.com/oauth2/spglobal';
const OKTA_CLIENT_ID = '0oa1m9vh7psxYxtzL1d8';
const REDIRECT_URI = 'https://core.spglobal.com/web/index.html';
const SCOPES = 'openid profile email offline_access plattsconnect';
const SEARCH_URL = 'https://api.platts.com/platts-platform/search/v2/symbol/search';
const TOKEN_FILE = path.join(__dirname, '..', '.platts-token.json');
const REPORT_FILE = path.join(__dirname, '..', 'platts-keyword-probe.json');

// Keywords to probe
const KEYWORDS = [
  'Urea Middle East',
  'Urea Arab Gulf',
  'Urea FOB',
  'Sulphur Middle East',
  'Sulphur Arab Gulf',
  'Sulphur FOB',
  'Sulfur FOB',
  'LPG FOB Arab Gulf',
  'Propane Arab Gulf',
  'Butane Arab Gulf',
];

function base64url(b) { return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function getOktaToken() {
  let refreshToken = null;
  try {
    const c = JSON.parse(fs.readFileSync(TOKEN_FILE,'utf-8'));
    if (c.refresh_token) refreshToken = c.refresh_token;
  } catch {}
  if (refreshToken) {
    try {
      const b = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: OKTA_CLIENT_ID, scope: SCOPES });
      const r = await fetch(`${OKTA_ISSUER}/v1/token`, { method: 'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: b.toString() });
      if (r.ok) { const t = await r.json(); fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token || refreshToken, expires_at: Date.now()+t.expires_in*1000 },null,2)); return t.access_token; }
    } catch {}
  }
  throw new Error('No valid refresh token; run fetch-platts-prices.js first to authenticate');
}

async function searchKeyword(token, query) {
  const r = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'appkey':'realtime', 'x-origin-app':'Web' },
    body: JSON.stringify({
      query, page: 1, pageSize: 25,
      priceAssessments: { metadata: 'Assessment_Frequency,AssessmentDate,Currency,UOM,Price,Commodity,PublishedDate,Description', facets: [] },
      appendAstericks: true, fromDate: '', toDate: '',
    }),
  });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const data = await r.json();
  return { items: data.Items || [] };
}

async function main() {
  console.log('[probe-keyword] Authenticating...');
  const token = await getOktaToken();
  console.log('[probe-keyword] Probing', KEYWORDS.length, 'keywords...\n');

  const out = {};
  for (const kw of KEYWORDS) {
    const res = await searchKeyword(token, kw);
    if (res.error) { out[kw] = { error: res.error }; continue; }
    const hits = (res.items || [])
      .filter(i => i.Price && i.Symbol)
      .map(i => ({ symbol: i.Symbol, desc: i.Description, price: parseFloat(i.Price), uom: i.UOM, currency: i.Currency, date: i.AssessmentDate?.substring(0,10), commodity: i.Commodity, frequency: i.Assessment_Frequency }));
    out[kw] = { total: res.items.length, priced: hits.length, hits };
    console.log(`\n=== "${kw}" (${hits.length} priced hits / ${res.items.length} total) ===`);
    hits.slice(0, 10).forEach(h => console.log(`  ${h.symbol.padEnd(9)} ${h.currency}${h.price}/${h.uom}  ${h.desc}`));
    await new Promise(r => setTimeout(r, 400));
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log('\n[probe-keyword] Full report:', REPORT_FILE);
}

main().catch(e => { console.error(e); process.exit(1); });
