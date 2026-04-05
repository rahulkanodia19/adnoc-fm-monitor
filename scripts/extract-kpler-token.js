#!/usr/bin/env node
/**
 * extract-kpler-token.js — Auto-extracts Kpler JWT from Chrome via CDP.
 *
 * Kpler stores its Auth0 access_token in localStorage under the key
 * `@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access`.
 * We read it directly via Runtime.evaluate (no network interception needed,
 * unlike MINT).
 *
 * Flow:
 *   1. Connect to Chrome CDP on port 9222.
 *   2. Find/open Kpler tab.
 *   3. If tab URL is on auth0/login → exit 2 (login required).
 *   4. Runtime.evaluate to read localStorage, parse body.access_token.
 *   5. Write raw token to soh-data/.token.txt.
 *
 * Exit codes:
 *   0 = token extracted & written
 *   1 = Chrome not reachable on port 9222
 *   2 = Kpler tab redirected to login (user must log in via Chrome)
 *   3 = localStorage key missing or empty (unexpected; fresh login needed)
 *
 * Usage: node scripts/extract-kpler-token.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const DEBUG_PORT = 9222;
const KPLER_URL_MATCH = 'kpler.com';
const KPLER_APP_URL = 'https://terminal.kpler.com/cargo/flows';
const TOKEN_FILE = path.join(__dirname, '..', 'soh-data', '.token.txt');
const AUTH0_KEY = '@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access';
const EVAL_TIMEOUT_MS = 10000;

function getPages() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse /json response')); }
      });
    });
    req.on('error', () => reject(new Error('Chrome not reachable on port ' + DEBUG_PORT)));
    req.setTimeout(5000, () => req.destroy(new Error('Chrome /json timeout')));
  });
}

function openTab(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`,
      { method: 'PUT' },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function connectPage(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', e => reject(e));
    setTimeout(() => reject(new Error('WebSocket connect timeout')), 8000);
  });
}

function isLoginUrl(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes('auth0.com')
      || u.includes('/login')
      || u.includes('/authorize')
      || u.includes('auth0/');
}

async function evaluateToken(ws) {
  return new Promise((resolve, reject) => {
    // Double-JSON-encode the key for safe embedding in the JS expression
    const keyLiteral = JSON.stringify(AUTH0_KEY);
    const expression = `(() => { try { const raw = localStorage.getItem(${keyLiteral}); if (!raw) return null; const parsed = JSON.parse(raw); return parsed?.body?.access_token || null; } catch (e) { return null; } })()`;

    const msgHandler = msg => {
      try {
        const d = JSON.parse(msg);
        if (d.id === 1) {
          ws.removeListener('message', msgHandler);
          resolve(d.result?.result?.value || null);
        }
      } catch {}
    };
    ws.on('message', msgHandler);

    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true },
    }));

    setTimeout(() => {
      ws.removeListener('message', msgHandler);
      reject(new Error('Runtime.evaluate timeout'));
    }, EVAL_TIMEOUT_MS);
  });
}

async function main() {
  let pages;
  try {
    pages = await getPages();
  } catch (e) {
    console.error('[extract-kpler-token] Chrome not reachable on port ' + DEBUG_PORT);
    process.exit(1);
  }

  let page = pages.find(p => p.type === 'page' && p.url.includes(KPLER_URL_MATCH));
  if (!page) {
    console.error('[extract-kpler-token] No Kpler tab open — opening one...');
    await openTab(KPLER_APP_URL);
    await new Promise(r => setTimeout(r, 8000));
    pages = await getPages();
    page = pages.find(p => p.type === 'page' && p.url.includes(KPLER_URL_MATCH));
    if (!page) {
      console.error('[extract-kpler-token] Failed to open Kpler tab');
      process.exit(1);
    }
  }

  // Re-fetch pages to see the latest URL (post any auth0 redirect)
  pages = await getPages();
  const current = pages.find(p => p.id === page.id) || page;
  if (isLoginUrl(current.url)) {
    console.error('[extract-kpler-token] Kpler tab is on login page: ' + current.url);
    console.error('[extract-kpler-token] MANUAL ACTION: log into terminal.kpler.com in Chrome');
    process.exit(2);
  }

  console.error('[extract-kpler-token] Attaching to Kpler tab: ' + current.url);
  const ws = await connectPage(current);

  let token;
  try {
    token = await evaluateToken(ws);
  } catch (e) {
    ws.close();
    console.error('[extract-kpler-token] Runtime.evaluate failed: ' + e.message);
    process.exit(3);
  }
  ws.close();

  if (!token || token.length < 100) {
    console.error('[extract-kpler-token] localStorage key missing or token too short (' + (token ? token.length : 0) + ' chars)');
    console.error('[extract-kpler-token] MANUAL ACTION: log into terminal.kpler.com in Chrome');
    process.exit(3);
  }

  fs.writeFileSync(TOKEN_FILE, token);
  console.error('[extract-kpler-token] Token extracted & saved (' + token.length + ' chars)');
  process.exit(0);
}

main().catch(e => {
  console.error('[extract-kpler-token] ERROR: ' + e.message);
  process.exit(1);
});
