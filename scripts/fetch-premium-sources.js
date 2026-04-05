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
 *   3. connect.spglobal.com/home — S&P Connect news feed (full article bodies via masterviewer-api)
 *   4. core.spglobal.com/#platts/allInsights — Platts Core unified News & Insights feed
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

// Event-driven wait: resolves as soon as a Network.responseReceived
// matches the url substring, else returns null after timeoutMs.
// The masterviewer-api response can arrive 8-20s after navigation —
// the previous fixed 8s wait caused 0 articles extracted on most runs.
function waitForNetworkResponse(ws, urlSubstring, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    const handler = m => {
      if (done) return;
      try {
        const d = JSON.parse(m);
        if (d.method === 'Network.responseReceived') {
          const url = d.params?.response?.url || '';
          if (url.includes(urlSubstring)) {
            done = true;
            ws.removeListener('message', handler);
            resolve({ requestId: d.params.requestId, url, elapsed: Date.now() - start });
          }
        }
      } catch {}
    };
    ws.on('message', handler);
    setTimeout(() => {
      if (!done) { done = true; ws.removeListener('message', handler); resolve(null); }
    }, timeoutMs);
  });
}

function getResponseBody(ws, requestId, timeoutMs = 10000) {
  const id = nextMsgId();
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ id, method: 'Network.getResponseBody', params: { requestId } }));
    const h = m => { const d = JSON.parse(m); if (d.id === id) { ws.removeListener('message', h); resolve(d.result); } };
    ws.on('message', h);
    setTimeout(() => { ws.removeListener('message', h); resolve(null); }, timeoutMs);
  });
}

// Poll document.querySelectorAll(sel).length > minCount every intervalMs
// up to timeoutMs. Returns the count that satisfied (or 0 on timeout).
async function waitForSelector(ws, selector, { minCount = 1, timeoutMs = 25000, intervalMs = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await evaluate(ws, `document.querySelectorAll(${JSON.stringify(selector)}).length`);
    if (typeof count === 'number' && count >= minCount) return count;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return 0;
}

// Shared monotonic message ID counter (CDP commands need unique IDs).
let _msgIdCounter = 1000;
function nextMsgId() { return ++_msgIdCounter; }

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
  const relevant = links.filter(l => KEYWORDS.some(kw => l.text.toLowerCase().includes(kw))).slice(0, 5);
  console.log('[premium] S&P Connect:', links.length, 'articles found,', relevant.length, 'Gulf-relevant');

  // 3. Fetch full content for each relevant article — event-driven.
  // The masterviewer-api response can land anywhere from 4s to 18s
  // after navigation depending on server load; previous fixed 8s wait
  // caused reqId=null and 0 articles extracted.
  ws.send(JSON.stringify({ id: 70, method: 'Network.enable', params: {} }));
  const articles = [];
  for (const article of relevant) {
    console.log('[premium] S&P Connect: fetching "' + article.text.substring(0, 60) + '"...');
    // Start watching for the article API response BEFORE navigation
    const waitPromise = waitForNetworkResponse(ws, 'masterviewer-api/v1/Document?source=phoenix', 25000);
    ws.send(JSON.stringify({ id: nextMsgId(), method: 'Page.navigate', params: { url: article.href } }));
    const captured = await waitPromise;
    if (!captured) {
      console.log('[premium] S&P Connect:  → timed out waiting for masterviewer-api (25s)');
      continue;
    }
    // Network.responseReceived fires on headers; body may still be
    // streaming. Let it settle, then retry once if getResponseBody
    // initially returns null.
    await new Promise(r => setTimeout(r, 1500));
    let bodyResult = await getResponseBody(ws, captured.requestId, 10000);
    if (!bodyResult || !bodyResult.body) {
      await new Promise(r => setTimeout(r, 2000));
      bodyResult = await getResponseBody(ws, captured.requestId, 10000);
    }
    if (bodyResult && bodyResult.body) {
      try {
        const doc = JSON.parse(bodyResult.body).document;
        const html = doc?.html || '';
        const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 200) {
          articles.push({ title: article.text, content: text });
          console.log('[premium] S&P Connect:  → ' + text.length + ' chars extracted in ' + captured.elapsed + 'ms');
        } else {
          console.log('[premium] S&P Connect:  → body too short (' + text.length + ' chars), skipping');
        }
      } catch (e) {
        console.log('[premium] S&P Connect:  → JSON parse failed: ' + e.message);
      }
    } else {
      console.log('[premium] S&P Connect:  → getResponseBody returned null');
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
  // Distinguish between successful extraction and silent failure
  const status = articles.length > 0 ? 'accessed' : 'no-articles-extracted';
  return { status, url: 'connect.spglobal.com/home', content: fullContent, articlesExtracted: articles.length };
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

  // allInsights WITHOUT a keySector filter shows the full feed across
  // all entitled services (~74K records). Previous per-sector filter
  // URLs hit subscription walls because keySector values (Crude Oil,
  // Refined Products, Chemicals) mapped to service codes the user
  // isn't on. No filter = all entitled content = Gulf stories appear.
  console.log('[premium] Platts Core: loading allInsights feed...');
  await evaluate(ws, `window.location.href = 'https://core.spglobal.com/#platts/allInsights'`, 80);

  // Wait for article links to render. The Platts SPA takes 20-25s to
  // populate the list (multiple sequential API calls). Poll for the
  // article link selector rather than sleeping a fixed duration.
  const linkCount = await waitForSelector(ws, 'a[href*="insightsArticle"]', { minCount: 10, timeoutMs: 30000 });
  console.log('[premium] Platts Core: article links rendered:', linkCount);

  const landedUrl = await evaluate(ws, 'window.location.href', 81);
  const bodyLen = await evaluate(ws, '(document.body?.innerText || "").length', 82);

  // Extract article links. Href pattern: #platts/insightsArticle?articleID=<GUID>&insightsType=<Top News|News|Blog|Rationale|Market Commentary|Spotlight>
  const linksRaw = await evaluate(ws, `
    JSON.stringify(
      Array.from(document.querySelectorAll('a[href*="insightsArticle"]'))
        .map(a => {
          const href = a.getAttribute('href') || '';
          const text = (a.textContent || '').trim();
          const idMatch = href.match(/articleID=([a-f0-9-]+)/i);
          const typeMatch = href.match(/insightsType=([^&]+)/i);
          return {
            articleID: idMatch ? idMatch[1] : null,
            title: text.substring(0, 200),
            insightsType: typeMatch ? decodeURIComponent(typeMatch[1]) : '',
            href: href.substring(0, 250),
          };
        })
        .filter(l => l.articleID && l.title.length > 5)
    )
  `, 83);

  let allLinks = [];
  try { allLinks = JSON.parse(linksRaw || '[]'); } catch {}

  // Dedup by articleID (Top News + News sections often show the same story)
  const seen = new Set();
  const unique = [];
  for (const l of allLinks) {
    if (!seen.has(l.articleID)) { seen.add(l.articleID); unique.push(l); }
  }

  // Filter for Gulf/energy relevant keywords
  const KEYWORDS = ['gulf', 'iran', 'hormuz', 'lng', 'crude', 'war', 'conflict', 'persian', 'energy', 'oil', 'opec',
    'middle east', 'qatar', 'kuwait', 'saudi', 'uae', 'iraq', 'bahrain', 'oman', 'israel', 'strait',
    'tanker', 'freight', 'shipping', 'force majeure', 'shutdown', 'disruption', 'escalation', 'refinery',
    'petchem', 'petrochemical', 'ras laffan', 'bushehr', 'mahshahr', 'opec+', 'fujairah', 'abu dhabi', 'dubai'];
  const gulfRelevant = unique.filter(l =>
    KEYWORDS.some(kw => l.title.toLowerCase().includes(kw))
  );

  // Group by insightsType for structured output
  const byType = {};
  for (const l of unique) {
    const t = l.insightsType || 'Other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(l);
  }

  // Build content string — one line per article, grouped by type,
  // Gulf-relevant articles marked with [GULF] prefix
  let content = 'PLATTS CORE — News & Insights feed (landed: ' + landedUrl + ')\n';
  content += 'Total unique articles: ' + unique.length + ', Gulf-relevant: ' + gulfRelevant.length + '\n\n';
  for (const [type, items] of Object.entries(byType)) {
    content += '=== ' + type.toUpperCase() + ' (' + items.length + ') ===\n';
    for (const l of items.slice(0, 30)) {
      const isGulf = KEYWORDS.some(kw => l.title.toLowerCase().includes(kw));
      content += (isGulf ? '[GULF] ' : '') + '• ' + l.title + '\n';
    }
    content += '\n';
  }

  ws.close();

  // Status classification
  let status;
  if (unique.length === 0 && bodyLen < 2000) status = 'no-content';
  else if (unique.length === 0) status = 'no-articles';
  else status = 'accessed';

  console.log('[premium] Platts Core:', status,
    '- total', unique.length, 'articles (' + Object.keys(byType).length + ' types),',
    gulfRelevant.length, 'Gulf-relevant');

  return {
    status,
    url: 'core.spglobal.com/#platts/allInsights',
    landedUrl,
    content,
    totalArticles: unique.length,
    gulfRelevant: gulfRelevant.length,
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
    articles: unique.slice(0, 100),
    gulfArticles: gulfRelevant,
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
