#!/usr/bin/env node
/**
 * extract-mint-token.js — Auto-extracts S&P MINT x-auth-token from Chrome via CDP.
 *
 * MINT's x-auth-token is held in React in-memory state (NOT in localStorage, sessionStorage,
 * or cookies). The only reliable extraction path is to intercept an outgoing /mint-app/rest/
 * request and read the x-auth-token header.
 *
 * Flow:
 *   1. Connect to Chrome CDP on port 9222.
 *   2. Find/open MINT tab.
 *   3. If tab URL is on Okta/SPGlobal login → exit 2 (login required).
 *   4. Enable Network domain, Page.reload to trigger /mint-app/rest/ requests, capture header.
 *   5. Write {token, expiresAt, savedAt} to soh-data/.mint-token.json.
 *
 * Exit codes:
 *   0 = token extracted & written
 *   1 = Chrome not reachable on port 9222
 *   2 = MINT tab redirected to login (user must log in via Chrome)
 *   3 = extraction timeout (no token-bearing request seen within 15s)
 *
 * Usage: node scripts/extract-mint-token.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const DEBUG_PORT = 9222;
const MINT_URL_MATCH = 'marketintelligencenetwork.com';
const MINT_APP_URL = 'https://www.marketintelligencenetwork.com/mint-app/';
const TOKEN_FILE = path.join(__dirname, '..', 'soh-data', '.mint-token.json');
const CAPTURE_TIMEOUT_MS = 30000;

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
  return u.includes('signin.spglobal.com')
      || u.includes('okta.com')
      || u.includes('oauth2/spglobal')
      || u.includes('/login');
}

async function captureToken(ws) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const handler = msg => {
      if (resolved) return;
      try {
        const d = JSON.parse(msg);
        if (d.method === 'Network.requestWillBeSent') {
          const req = d.params?.request;
          const url = req?.url || '';
          if (!url.includes('/mint-app/rest/')) return;
          // The validator endpoint returns the token in the response body,
          // so its request doesn't carry x-auth-token. Skip it.
          if (url.includes('/third-party-validator')) return;
          const headers = req.headers || {};
          const tok = headers['x-auth-token'] || headers['X-Auth-Token'];
          if (tok && /^[^:]+:SPGI:\d+:/.test(tok)) {
            resolved = true;
            ws.removeListener('message', handler);
            resolve(tok);
          }
        }
      } catch {}
    };
    ws.on('message', handler);

    // Enable Network domain then trigger a reload to fire /mint-app/rest/ requests.
    ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }));
    setTimeout(() => {
      ws.send(JSON.stringify({ id: 2, method: 'Page.reload', params: { ignoreCache: false } }));
    }, 300);

    setTimeout(() => {
      if (!resolved) {
        ws.removeListener('message', handler);
        reject(new Error('TIMEOUT'));
      }
    }, CAPTURE_TIMEOUT_MS);
  });
}

async function main() {
  let pages;
  try {
    pages = await getPages();
  } catch (e) {
    console.error('[extract-mint-token] Chrome not reachable on port ' + DEBUG_PORT);
    process.exit(1);
  }

  let page = pages.find(p => p.type === 'page' && p.url.includes(MINT_URL_MATCH));
  if (!page) {
    console.error('[extract-mint-token] No MINT tab open — opening one...');
    await openTab(MINT_APP_URL);
    await new Promise(r => setTimeout(r, 5000));
    pages = await getPages();
    page = pages.find(p => p.type === 'page' && p.url.includes(MINT_URL_MATCH));
    if (!page) {
      console.error('[extract-mint-token] Failed to open MINT tab');
      process.exit(1);
    }
  }

  // Session check: is the user logged in?
  // Re-fetch pages to see the latest URL (post any Okta redirect)
  pages = await getPages();
  const current = pages.find(p => p.id === page.id) || page;
  if (isLoginUrl(current.url)) {
    console.error('[extract-mint-token] MINT tab is on login page: ' + current.url);
    console.error('[extract-mint-token] MANUAL ACTION: log into marketintelligencenetwork.com in Chrome');
    process.exit(2);
  }

  console.error('[extract-mint-token] Attaching to MINT tab: ' + current.url);
  const ws = await connectPage(current);

  let token;
  try {
    token = await captureToken(ws);
  } catch (e) {
    ws.close();
    // After reload, check again whether the page redirected to login.
    const pagesAfter = await getPages();
    const after = pagesAfter.find(p => p.id === page.id);
    if (after && isLoginUrl(after.url)) {
      console.error('[extract-mint-token] MINT redirected to login after reload: ' + after.url);
      console.error('[extract-mint-token] MANUAL ACTION: log into marketintelligencenetwork.com in Chrome');
      process.exit(2);
    }
    console.error('[extract-mint-token] Timeout: no /mint-app/rest/ request with x-auth-token captured within ' + (CAPTURE_TIMEOUT_MS/1000) + 's');
    process.exit(3);
  }
  ws.close();

  const parts = token.split(':');
  const expiresAt = parseInt(parts[2], 10);
  if (!expiresAt || Number.isNaN(expiresAt)) {
    console.error('[extract-mint-token] Token has unexpected format: ' + token.substring(0, 40));
    process.exit(3);
  }

  fs.writeFileSync(TOKEN_FILE, JSON.stringify({
    token,
    expiresAt,
    savedAt: new Date().toISOString(),
  }, null, 2));

  const hrs = ((expiresAt - Date.now()) / 3600000).toFixed(1);
  console.error('[extract-mint-token] Token extracted & saved (expires in ' + hrs + 'h)');
  process.exit(0);
}

main().catch(e => {
  console.error('[extract-mint-token] ERROR: ' + e.message);
  process.exit(1);
});
