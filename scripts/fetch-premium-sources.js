#!/usr/bin/env node
/**
 * fetch-premium-sources.js — Pre-fetches content from premium platforms via Chrome CDP.
 *
 * Bypasses Chrome DevTools MCP (which has timeout issues in claude -p subprocesses)
 * by connecting directly to Chrome via WebSocket — the same reliable approach used
 * for Kpler/MINT token extraction.
 *
 * Platforms:
 *   1. terminal.kpler.com/insight — Kpler Insight articles
 *   2. portal.rystadenergy.com/dashboards/detail/1047/0 — Rystad ME Conflict dashboard (screenshot)
 *   3. connect.spglobal.com/home — S&P Connect news feed
 *   4. core.spglobal.com — S&P Platts Core insights (Crude Oil, Refined Products, LNG, Chemicals, Shipping)
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

  // Navigate to Kpler Insight (content surface with news + analysis)
  if (!page.url.includes('/insight')) {
    console.log('[premium] Kpler: navigating to /insight...');
    await navigate(ws, 'https://terminal.kpler.com/insight');
  }

  // Kpler SPA — extract text after SPA render settles
  const content = await evaluate(ws, 'document.body?.innerText?.substring(0, 8000) || "empty"');
  const ssData = await screenshot(ws);
  let screenshotFile = null;
  if (ssData) {
    fs.writeFileSync(path.join(OUT_DIR, '.kpler-screenshot.png'), Buffer.from(ssData, 'base64'));
    screenshotFile = '.kpler-screenshot.png';
  }

  ws.close();
  console.log('[premium] Kpler:', (content || '').length, 'chars + screenshot');
  return {
    status: 'accessed',
    url: 'terminal.kpler.com/insight',
    content: content || '',
    screenshot: screenshotFile,
    note: 'Kpler Insight SPA may render partially via CDP; screenshot captures the current viewport.',
  };
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

function interceptDocumentAPI(ws) {
  return new Promise((resolve) => {
    let reqId = null;
    const handler = m => {
      const d = JSON.parse(m);
      if (d.method === 'Network.responseReceived') {
        const url = d.params?.response?.url || '';
        if (url.includes('masterviewer-api/v1/Document?source=phoenix')) {
          reqId = d.params.requestId;
        }
      }
    };
    ws.on('message', handler);
    // Return function to get the response body once navigation completes
    resolve({
      getBody: async () => {
        ws.removeListener('message', handler);
        if (!reqId) return null;
        return new Promise((res) => {
          ws.send(JSON.stringify({ id: 77, method: 'Network.getResponseBody', params: { requestId: reqId } }));
          const h = m => { const d = JSON.parse(m); if (d.id === 77) { ws.removeListener('message', h); res(d.result); } };
          ws.on('message', h);
          setTimeout(() => { ws.removeListener('message', h); res(null); }, 5000);
        });
      },
      cleanup: () => ws.removeListener('message', handler),
    });
  });
}

async function fetchSPGlobal(pages) {
  const page = pages.find(p => p.url.includes('connect.spglobal.com'));
  if (!page) return { status: 'no tab', content: '' };

  console.log('[premium] S&P Connect: connecting...');
  const ws = await connectPage(page);

  // 1. Get home page headlines + article links
  if (!page.url.includes('/home')) {
    await navigate(ws, 'https://connect.spglobal.com/home');
  }
  const homeContent = await evaluate(ws, 'document.body?.innerText?.substring(0, 8000) || "empty"');
  const linksRaw = await evaluate(ws,
    'JSON.stringify(Array.from(document.querySelectorAll("a[href*=\'/document/show/phoenix/\']")).map(a=>({text:a.textContent.trim().substring(0,120),href:a.href})).filter(a=>a.text.length>10).slice(0,20))', 2);

  let links = [];
  try { links = JSON.parse(linksRaw || '[]'); } catch {}

  // 2. Filter for Gulf/energy relevant articles
  const KEYWORDS = ['gulf', 'iran', 'hormuz', 'lng', 'crude', 'war', 'conflict', 'rapid response', 'persian', 'energy', 'oil', 'opec', 'middle east'];
  const relevant = links.filter(l => KEYWORDS.some(kw => l.text.toLowerCase().includes(kw))).slice(0, 3);
  console.log('[premium] S&P Connect:', links.length, 'articles found,', relevant.length, 'Gulf-relevant');

  // 3. Fetch full content for each relevant article
  ws.send(JSON.stringify({ id: 70, method: 'Network.enable', params: {} }));
  const articles = [];
  for (const article of relevant) {
    console.log('[premium] S&P Connect: fetching "' + article.text.substring(0, 60) + '"...');
    const interceptor = await interceptDocumentAPI(ws);
    ws.send(JSON.stringify({ id: 71, method: 'Page.navigate', params: { url: article.href } }));
    await new Promise(r => setTimeout(r, 8000));
    const bodyResult = await interceptor.getBody();
    if (bodyResult && bodyResult.body) {
      try {
        const doc = JSON.parse(bodyResult.body).document;
        const html = doc?.html || '';
        const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        articles.push({ title: article.text, content: text });
        console.log('[premium] S&P Connect:  → ' + text.length + ' chars extracted');
      } catch {}
    }
  }
  ws.send(JSON.stringify({ id: 72, method: 'Network.disable', params: {} }));

  // Navigate back to home
  ws.send(JSON.stringify({ id: 73, method: 'Page.navigate', params: { url: 'https://connect.spglobal.com/home' } }));
  await new Promise(r => setTimeout(r, 2000));
  ws.close();

  // Combine home headlines + full article content
  const fullContent = homeContent + '\n\n--- FULL ARTICLE CONTENT ---\n\n' +
    articles.map(a => '=== ' + a.title + ' ===\n' + a.content).join('\n\n');

  console.log('[premium] S&P Connect: total', fullContent.length, 'chars (' + articles.length + ' full articles)');
  return { status: 'accessed', url: 'connect.spglobal.com/home', content: fullContent, articlesExtracted: articles.length };
}

async function fetchPlattsCore(pages) {
  const page = pages.find(p => p.url.includes('core.spglobal.com'));
  if (!page) return { status: 'no tab', content: '' };

  // Auth check — detect Okta SSO redirect from tab URL
  const AUTH_INDICATORS = ['signin.spglobal.com', '/authorize', '/login', 'okta.com', 'auth/realms'];
  if (AUTH_INDICATORS.some(ind => (page.url || '').toLowerCase().includes(ind))) {
    console.warn('[premium] Platts Core: LOGIN REQUIRED — tab URL is auth page (' + page.url + ')');
    return {
      status: 'login required',
      url: page.url,
      content: '',
      note: 'Platts Core tab is on SSO login page. Log into core.spglobal.com in Chrome before next sync.',
    };
  }

  console.log('[premium] Platts Core: connecting...');
  const ws = await connectPage(page);

  // Second auth check — catches async redirects the tab list might miss
  const currentUrl = await evaluate(ws, 'window.location.href', 78);
  if (AUTH_INDICATORS.some(ind => (currentUrl || '').toLowerCase().includes(ind))) {
    console.warn('[premium] Platts Core: LOGIN REQUIRED — page redirected to auth (' + currentUrl + ')');
    ws.close();
    return {
      status: 'login required',
      url: currentUrl,
      content: '',
      note: 'Platts Core redirected to SSO login. Log into core.spglobal.com in Chrome before next sync.',
    };
  }

  // Sector pages to scrape — all 5 key Platts sectors
  const SECTORS = [
    { name: 'Crude Oil',        url: 'https://core.spglobal.com/#platts/allInsights?keySector=Crude%20Oil' },
    { name: 'Refined Products', url: 'https://core.spglobal.com/#platts/allInsights?keySector=Refined%20Products' },
    { name: 'LNG',              url: 'https://core.spglobal.com/#platts/allInsights?keySector=LNG%20Service' },
    { name: 'Chemicals',        url: 'https://core.spglobal.com/#platts/allInsights?keySector=Chemicals' },
    { name: 'Shipping',         url: 'https://core.spglobal.com/#platts/allInsights?keySector=Shipping' },
  ];

  const KEYWORDS = ['gulf', 'iran', 'hormuz', 'lng', 'crude', 'war', 'conflict', 'persian', 'energy', 'oil', 'opec',
    'middle east', 'qatar', 'kuwait', 'saudi', 'uae', 'iraq', 'bahrain', 'oman', 'israel', 'strait',
    'tanker', 'freight', 'shipping', 'force majeure', 'shutdown', 'disruption', 'escalation'];

  const allHeadlines = [];

  for (const sector of SECTORS) {
    console.log('[premium] Platts Core: loading ' + sector.name + ' insights...');

    // Navigate to sector page (hash-based SPA — trigger via location.hash)
    await evaluate(ws, `window.location.href = '${sector.url}'`, 80);
    await new Promise(r => setTimeout(r, 6000)); // Wait for SPA to render

    // Extract article headlines/summaries from the insights list
    const articlesRaw = await evaluate(ws, `
      JSON.stringify(
        Array.from(document.querySelectorAll('article, [class*="insight"], [class*="article"], [class*="card"], [class*="result"]'))
          .map(el => ({
            title: (el.querySelector('h2, h3, h4, [class*="title"], [class*="headline"]') || {}).textContent?.trim() || '',
            summary: (el.querySelector('p, [class*="summary"], [class*="description"], [class*="snippet"]') || {}).textContent?.trim() || '',
            date: (el.querySelector('time, [class*="date"], [class*="time"]') || {}).textContent?.trim() || '',
          }))
          .filter(a => a.title.length > 5)
          .slice(0, 15)
      )
    `, 81);

    let articles = [];
    try { articles = JSON.parse(articlesRaw || '[]'); } catch {}

    // Fallback: if structured extraction fails, grab raw text
    if (articles.length === 0) {
      const rawText = await evaluate(ws, 'document.body?.innerText?.substring(0, 10000) || "empty"', 82);
      allHeadlines.push({ sector: sector.name, rawContent: rawText || '', articles: [] });
      console.log('[premium] Platts Core: ' + sector.name + ' — fallback text (' + (rawText || '').length + ' chars)');
    } else {
      allHeadlines.push({ sector: sector.name, articles, rawContent: '' });
      console.log('[premium] Platts Core: ' + sector.name + ' — ' + articles.length + ' articles found');
    }
  }

  // Build combined content
  const totalArticles = allHeadlines.reduce((sum, s) => sum + s.articles.length, 0);
  let content = '';
  for (const sector of allHeadlines) {
    content += '=== PLATTS CORE: ' + sector.sector.toUpperCase() + ' ===\n';
    if (sector.articles.length > 0) {
      for (const a of sector.articles) {
        content += '• ' + a.title + (a.date ? ' (' + a.date + ')' : '') + '\n';
        if (a.summary) content += '  ' + a.summary + '\n';
      }
    } else if (sector.rawContent) {
      content += sector.rawContent.substring(0, 3000) + '\n';
    }
    content += '\n';
  }

  // Filter for Gulf-relevant headlines
  const relevant = allHeadlines.flatMap(s => s.articles)
    .filter(a => KEYWORDS.some(kw => (a.title + ' ' + a.summary).toLowerCase().includes(kw)));

  ws.close();

  // Content validation — check if we got real data or just an empty SPA shell
  const totalRawChars = allHeadlines.reduce((sum, s) => sum + (s.rawContent || '').length, 0);
  const hasContent = totalArticles > 0 || totalRawChars > 200;
  const status = hasContent ? 'accessed' : 'no content';

  if (!hasContent) {
    console.warn('[premium] Platts Core: NO CONTENT — page loaded but no articles or meaningful text extracted');
  }
  console.log('[premium] Platts Core:', status, '- total', totalArticles, 'articles,', relevant.length, 'Gulf-relevant');

  return {
    status,
    url: 'core.spglobal.com',
    sectors: SECTORS.map(s => s.name),
    content,
    totalArticles,
    gulfRelevant: relevant.length,
    headlines: allHeadlines,
  };
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
      plattsCore: { status: 'chrome unavailable', content: '' },
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

  try { results.plattsCore = await fetchPlattsCore(pages); }
  catch (e) { results.plattsCore = { status: 'error: ' + e.message, content: '' }; console.error('[premium] Platts Core error:', e.message); }

  results.timestamp = new Date().toISOString();

  fs.writeFileSync(path.join(OUT_DIR, '.premium-sources.json'), JSON.stringify(results, null, 2));

  console.log('\n[premium] Results:');
  console.log('  Kpler:', results.kpler.status, '-', (results.kpler.content || '').length, 'chars');
  console.log('  Rystad:', results.rystad.status, '-', results.rystad.screenshot ? 'screenshot saved' : 'no screenshot');
  console.log('  S&P Connect:', results.spglobal.status, '-', (results.spglobal.content || '').length, 'chars');
  console.log('  Platts Core:', results.plattsCore.status, '-', (results.plattsCore.content || '').length, 'chars',
    '(' + (results.plattsCore.totalArticles || 0) + ' articles,', (results.plattsCore.gulfRelevant || 0), 'Gulf-relevant)');
  console.log('\n[premium] Output: soh-data/.premium-sources.json');
}

main().catch(err => {
  console.error('[premium] FATAL:', err.message);
  process.exit(1);
});
