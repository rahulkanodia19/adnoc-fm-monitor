#!/usr/bin/env node
/**
 * probe-platts-symbols.js — One-time discovery tool for Platts symbol availability.
 *
 * Reuses Okta PKCE auth from fetch-platts-prices.js (refresh token from .platts-token.json).
 * Probes candidate symbols via the Platform Search API; classifies each as:
 *   - subscribed  (symbol found with price + date)
 *   - unsubscribed (symbol exists but no data returned for this subscription tier)
 *   - invalid    (API rejected the query)
 *
 * Output: platts-probe-report.json
 *
 * Usage:
 *   node scripts/probe-platts-symbols.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const TOKEN_FILE = path.join(__dirname, '..', '.platts-token.json');
const REPORT_FILE = path.join(__dirname, '..', 'platts-probe-report.json');

// ---------- Candidate symbols (grouped by commodity) ----------
const CANDIDATES = [
  // LPG Propane FOB Arab Gulf
  { symbol: 'PMUAY00', commodity: 'LPG Propane', region: 'FOB Arab Gulf', guessDesc: 'Saudi CP Propane' },
  { symbol: 'PMUAZ00', commodity: 'LPG Propane', region: 'FOB Arab Gulf', guessDesc: 'Propane FOB AG alt' },
  { symbol: 'PMAAD00', commodity: 'LPG Propane', region: 'FOB Arab Gulf', guessDesc: 'Propane FOB AG alt2' },
  // LPG Butane FOB Arab Gulf
  { symbol: 'PMUBA00', commodity: 'LPG Butane', region: 'FOB Arab Gulf', guessDesc: 'Saudi CP Butane' },
  { symbol: 'PMUBB00', commodity: 'LPG Butane', region: 'FOB Arab Gulf', guessDesc: 'Butane FOB AG alt' },
  { symbol: 'PMABF00', commodity: 'LPG Butane', region: 'FOB Arab Gulf', guessDesc: 'Butane FOB AG alt2' },
  // LPG CFR NE Asia
  { symbol: 'AAKMW00', commodity: 'LPG Propane', region: 'CFR NE Asia', guessDesc: 'Propane CFR NEA' },
  { symbol: 'AAKMX00', commodity: 'LPG Butane', region: 'CFR NE Asia', guessDesc: 'Butane CFR NEA' },
  // Urea Granular FOB Middle East
  { symbol: 'FUGAC00', commodity: 'Urea Granular', region: 'FOB Middle East', guessDesc: 'Urea Granular FOB ME' },
  { symbol: 'FUGAD00', commodity: 'Urea Granular', region: 'FOB Middle East', guessDesc: 'Urea Granular alt' },
  { symbol: 'PUAAZ00', commodity: 'Urea Granular', region: 'FOB Middle East', guessDesc: 'Urea alt3' },
  // Urea Prilled FOB Middle East
  { symbol: 'FUPAA00', commodity: 'Urea Prilled', region: 'FOB Middle East', guessDesc: 'Urea Prilled FOB ME' },
  { symbol: 'FUPAB00', commodity: 'Urea Prilled', region: 'FOB Middle East', guessDesc: 'Urea Prilled alt' },
  // Sulphur FOB Middle East
  { symbol: 'PSUAA00', commodity: 'Sulphur Granular', region: 'FOB Middle East', guessDesc: 'Sulphur Granular FOB ME' },
  { symbol: 'FESMS00', commodity: 'Sulphur Granular', region: 'FOB Middle East', guessDesc: 'Sulphur alt' },
  { symbol: 'AAPNS00', commodity: 'Sulphur', region: 'FOB Middle East', guessDesc: 'Sulphur alt2' },
  { symbol: 'PSUAC00', commodity: 'Sulphur Lump', region: 'FOB Middle East', guessDesc: 'Sulphur Lump' },
  { symbol: 'FESMB00', commodity: 'Sulphur Bulk', region: 'FOB Middle East', guessDesc: 'Sulphur Bulk alt' },
];

// ---------- PKCE helpers ----------
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ---------- Okta Auth (copied from fetch-platts-prices.js) ----------
async function getOktaToken() {
  let refreshToken = null;
  try {
    const cached = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    if (cached.refresh_token) refreshToken = cached.refresh_token;
  } catch {}

  if (refreshToken) {
    try {
      const token = await refreshAccessToken(refreshToken);
      if (token) return token;
    } catch {
      console.log('  Refresh token expired, re-authenticating...');
    }
  }
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

  const authResp = await fetch(`${OKTA_ISSUER}/v1/authorize?${authParams}`, { redirect: 'manual' });
  const location = authResp.headers.get('location') || '';
  const codeMatch = location.match(/[?&]code=([^&]+)/);
  if (!codeMatch) throw new Error(`No auth code in redirect: ${location.substring(0, 200)}`);
  const code = codeMatch[1];

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

// ---------- Probe ----------
async function probeSymbol(token, symbol) {
  const resp = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'appkey': 'realtime',
      'x-origin-app': 'Web',
    },
    body: JSON.stringify({
      query: symbol,
      page: 1,
      pageSize: 5,
      priceAssessments: {
        metadata: 'Assessment_Frequency,AssessmentDate,Currency,UOM,Price,Commodity,PublishedDate,DeltaPrice,Description',
        facets: [],
      },
      appendAstericks: true,
      fromDate: '',
      toDate: '',
    }),
  });

  if (!resp.ok) {
    return { status: 'invalid', httpStatus: resp.status, error: (await resp.text()).slice(0, 200) };
  }
  const data = await resp.json();
  const items = data.Items || [];
  const match = items.find(i => i.Symbol === symbol);

  if (!match) {
    return { status: 'unsubscribed', totalItems: items.length, note: 'Symbol not in response Items' };
  }
  if (!match.Price) {
    return { status: 'unsubscribed', totalItems: items.length, note: 'Found but no Price field (likely unsubscribed tier)' };
  }

  return {
    status: 'subscribed',
    price: parseFloat(match.Price),
    assessmentDate: match.AssessmentDate ? match.AssessmentDate.substring(0, 10) : null,
    currency: match.Currency,
    uom: match.UOM,
    frequency: match.Assessment_Frequency,
    commodity: match.Commodity,
    description: match.Description,
  };
}

// ---------- Main ----------
async function main() {
  console.log('[probe-platts] Authenticating...');
  const token = await getOktaToken();
  console.log('[probe-platts] Probing', CANDIDATES.length, 'candidate symbols...\n');

  const results = [];
  for (const cand of CANDIDATES) {
    process.stdout.write(`  ${cand.symbol.padEnd(9)} ${cand.commodity.padEnd(17)} ${cand.region.padEnd(20)} ... `);
    try {
      const res = await probeSymbol(token, cand.symbol);
      const badge = res.status === 'subscribed' ? '[OK]    ' : res.status === 'unsubscribed' ? '[NONE]  ' : '[ERROR] ';
      console.log(badge + (res.price != null ? `${res.price} ${res.uom || ''} on ${res.assessmentDate}` : (res.note || res.error || '')));
      results.push({ ...cand, ...res });
    } catch (e) {
      console.log('[FAIL]   ' + e.message);
      results.push({ ...cand, status: 'error', error: e.message });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const report = {
    probedAt: new Date().toISOString(),
    summary: {
      subscribed: results.filter(r => r.status === 'subscribed').length,
      unsubscribed: results.filter(r => r.status === 'unsubscribed').length,
      invalid: results.filter(r => r.status === 'invalid' || r.status === 'error').length,
    },
    results,
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log('\n[probe-platts] Summary:', JSON.stringify(report.summary));
  console.log('[probe-platts] Report written to', REPORT_FILE);
}

main().catch(err => {
  console.error('[probe-platts] Fatal:', err.message);
  process.exit(1);
});
