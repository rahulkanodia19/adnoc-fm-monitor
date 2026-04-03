#!/usr/bin/env node
/**
 * fetch-premium-sources.js — Pre-fetches content from premium platforms via Chrome CDP.
 *
 * Bypasses Chrome DevTools MCP (which has timeout issues in claude -p subprocesses)
 * by connecting directly to Chrome via WebSocket — the same reliable approach used
 * for Kpler/MINT token extraction.
 *
 * Platforms:
 *   1. terminal.kpler.com/intelligence — Kpler intelligence articles
 *   2. portal.rystadenergy.com/dashboards/detail/1047/0 — Rystad ME Conflict dashboard (screenshot)
 *   3. connect.spglobal.com/home — S&P Connect news feed
 *
 * Output: soh-data/.premium-sources.json + soh-data/.rystad-dashboard.png
 *
 * Usage: node scripts/fetch-premium-sources.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const DEBUG_PORT = 9222;
const OUT_DIR = path.join(__dirname, '..', 'soh-data');

function getPages() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Chrome pages')); }
      });
    }).on('error', () => reject(new Error('Chrome not reachable on port ' + DEBUG_PORT)));
  });
}

function connectPage(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', e => reject(e));
    setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);
  });
}

function evaluate(ws, expression, id = 1) {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    const handler = m => {
      const d = JSON.parse(m);
      if (d.id === id) {
        ws.removeListener('message', handler);
        resolve(d.result?.result?.value || null);
      }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.removeListener('message', handler); resolve(null); }, 15000);
  });
}

function navigate(ws, url, id = 99) {
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ id, method: 'Page.navigate', params: { url } }));
    setTimeout(resolve, 8000); // Wait for page load
  });
}

function screenshot(ws, id = 50) {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify({ id, method: 'Page.captureScreenshot', params: { format: 'png', captureBeyondViewport: true } }));
    const handler = m => {
      const d = JSON.parse(m);
      if (d.id === id) {
        ws.removeListener('message', handler);
        resolve(d.result?.data || null);
      }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.removeListener('message', handler); resolve(null); }, 15000);
  });
}

async function fetchKpler(pages) {
  const page = pages.find(p => p.url.includes('terminal.kpler.com'));
  if (!page) return { status: 'no tab', content: '' };

  console.log('[premium] Kpler: connecting...');
  const ws = await connectPage(page);

  // Navigate to intelligence page
  const currentUrl = page.url;
  console.log('[premium] Kpler: navigating to /intelligence...');
  await navigate(ws, 'https://terminal.kpler.com/intelligence');
  // Extra wait for SPA to render
  await new Promise(r => setTimeout(r, 5000));

  let content = await evaluate(ws, 'document.body?.innerText?.substring(0, 8000) || "empty"');
  const url = await evaluate(ws, 'window.location.href', 2);

  // If content is too short, take screenshot as fallback
  let screenshotFile = null;
  if (!content || content.length < 50) {
    console.log('[premium] Kpler: text extraction limited, taking screenshot...');
    const ssData = await screenshot(ws, 51);
    if (ssData) {
      const ssPath = path.join(OUT_DIR, '.kpler-intelligence.png');
      fs.writeFileSync(ssPath, Buffer.from(ssData, 'base64'));
      screenshotFile = '.kpler-intelligence.png';
      console.log('[premium] Kpler: screenshot saved');
    }
  }

  // Navigate back
  ws.send(JSON.stringify({ id: 98, method: 'Page.navigate', params: { url: currentUrl } }));

  ws.close();
  console.log('[premium] Kpler: extracted', (content || '').length, 'chars');
  return { status: 'accessed', url: url || 'terminal.kpler.com/intelligence', content: content || '', screenshot: screenshotFile };
}

async function fetchRystad(pages) {
  const page = pages.find(p => p.url.includes('rystadenergy.com'));
  if (!page) return { status: 'no tab', screenshot: null };

  console.log('[premium] Rystad: connecting...');
  const ws = await connectPage(page);

  // Ensure we're on the ME Conflict dashboard
  const currentUrl = page.url;
  if (!currentUrl.includes('/dashboards/detail/1047')) {
    console.log('[premium] Rystad: navigating to ME Conflict dashboard...');
    await navigate(ws, 'https://portal.rystadenergy.com/dashboards/detail/1047/0');
  }

  // Wait for Power BI to render
  await new Promise(r => setTimeout(r, 5000));

  // Take screenshot
  const ssData = await screenshot(ws);
  const screenshotPath = path.join(OUT_DIR, '.rystad-dashboard.png');
  if (ssData) {
    fs.writeFileSync(screenshotPath, Buffer.from(ssData, 'base64'));
    console.log('[premium] Rystad: screenshot saved');
  }

  ws.close();

  // Access Power BI iframe as separate CDP target for text extraction
  let pbiContent = '';
  const freshPages = await getPages();
  const pbiPage = freshPages.find(p => p.url.includes('powerbi.com'));
  if (pbiPage) {
    console.log('[premium] Rystad: extracting Power BI content from iframe target...');
    try {
      const ws2 = await connectPage(pbiPage);
      pbiContent = await evaluate(ws2, 'document.body?.innerText?.substring(0, 10000) || ""') || '';
      ws2.close();
      console.log('[premium] Rystad: Power BI text extracted (' + pbiContent.length + ' chars)');
    } catch (e) {
      console.log('[premium] Rystad: Power BI text extraction failed:', e.message);
    }
  }

  return {
    status: 'accessed',
    url: 'portal.rystadenergy.com/dashboards/detail/1047/0',
    screenshot: ssData ? '.rystad-dashboard.png' : null,
    content: pbiContent || 'Power BI dashboard — see screenshot for visual data',
  };
}

async function fetchSPGlobal(pages) {
  const page = pages.find(p => p.url.includes('connect.spglobal.com'));
  if (!page) return { status: 'no tab', content: '' };

  console.log('[premium] S&P Connect: connecting...');
  const ws = await connectPage(page);

  // Ensure we're on the home page
  if (!page.url.includes('/home')) {
    console.log('[premium] S&P Connect: navigating to /home...');
    await navigate(ws, 'https://connect.spglobal.com/home');
  }

  const content = await evaluate(ws, 'document.body?.innerText?.substring(0, 8000) || "empty"');
  const url = await evaluate(ws, 'window.location.href', 2);

  ws.close();
  console.log('[premium] S&P Connect: extracted', (content || '').length, 'chars');
  return { status: 'accessed', url: url || 'connect.spglobal.com/home', content: content || '' };
}

async function main() {
  console.log('[premium] Fetching premium source content via Chrome CDP...\n');

  let pages;
  try {
    pages = await getPages();
    console.log('[premium] Chrome tabs:', pages.filter(p => p.type === 'page').length);
  } catch (e) {
    console.error('[premium] Chrome not available:', e.message);
    // Write empty output so the agent knows premium sources were unavailable
    fs.writeFileSync(path.join(OUT_DIR, '.premium-sources.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      kpler: { status: 'chrome unavailable', content: '' },
      rystad: { status: 'chrome unavailable', content: '' },
      spglobal: { status: 'chrome unavailable', content: '' },
    }, null, 2));
    return;
  }

  const results = {};

  // Fetch each platform (sequential to avoid CDP conflicts)
  try { results.kpler = await fetchKpler(pages); }
  catch (e) { results.kpler = { status: 'error: ' + e.message, content: '' }; console.error('[premium] Kpler error:', e.message); }

  try { results.rystad = await fetchRystad(pages); }
  catch (e) { results.rystad = { status: 'error: ' + e.message, content: '' }; console.error('[premium] Rystad error:', e.message); }

  try { results.spglobal = await fetchSPGlobal(pages); }
  catch (e) { results.spglobal = { status: 'error: ' + e.message, content: '' }; console.error('[premium] S&P error:', e.message); }

  results.timestamp = new Date().toISOString();

  fs.writeFileSync(path.join(OUT_DIR, '.premium-sources.json'), JSON.stringify(results, null, 2));

  console.log('\n[premium] Results:');
  console.log('  Kpler:', results.kpler.status, '-', (results.kpler.content || '').length, 'chars');
  console.log('  Rystad:', results.rystad.status, '-', results.rystad.screenshot ? 'screenshot saved' : 'no screenshot');
  console.log('  S&P Connect:', results.spglobal.status, '-', (results.spglobal.content || '').length, 'chars');
  console.log('\n[premium] Output: soh-data/.premium-sources.json');
}

main().catch(err => {
  console.error('[premium] FATAL:', err.message);
  process.exit(1);
});
