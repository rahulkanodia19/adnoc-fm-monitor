#!/usr/bin/env node
/**
 * _probe-platts.js — throwaway probe to discover Platts Core DOM
 * structure per sector. Navigates to all 5 sector URLs, dumps
 * candidate selectors + landing URLs + paywall/empty indicators.
 */

const http = require('http');
const WebSocket = require('ws');

const DEBUG_PORT = 9222;

function getPages() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function connectPage(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('ws timeout')), 10000);
  });
}

let msgId = 3000;
function nextId() { return ++msgId; }

function evaluate(ws, expression) {
  const id = nextId();
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    const handler = m => {
      const d = JSON.parse(m);
      if (d.id === id) { ws.removeListener('message', handler); resolve(d.result?.result?.value); }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.removeListener('message', handler); resolve(null); }, 10000);
  });
}

const SECTORS = [
  { name: 'Crude Oil',        url: 'https://core.spglobal.com/#platts/allInsights?keySector=Crude%20Oil' },
  { name: 'Refined Products', url: 'https://core.spglobal.com/#platts/allInsights?keySector=Refined%20Products' },
  { name: 'LNG',              url: 'https://core.spglobal.com/#platts/allInsights?keySector=LNG%20Service' },
  { name: 'Chemicals',        url: 'https://core.spglobal.com/#platts/allInsights?keySector=Chemicals' },
  { name: 'Shipping',         url: 'https://core.spglobal.com/#platts/allInsights?keySector=Shipping' },
];

const INDICATORS = [
  'not part of your current subscription',
  '0 Records Found',
  'No results found',
  'Loading...',
  'Alert creation is in progress',
];

async function probeSector(ws, sector) {
  console.log('\n=== [' + sector.name + '] ===');
  console.log('Navigating to:', sector.url);
  await evaluate(ws, `window.location.href = ${JSON.stringify(sector.url)}`);
  await new Promise(r => setTimeout(r, 10000)); // 10s wait (up from 6s)

  const landedUrl = await evaluate(ws, 'window.location.href');
  console.log('Landed URL:', landedUrl);

  const pageInfo = await evaluate(ws, `(() => {
    const title = document.title;
    const h1 = document.querySelector('h1')?.textContent?.trim() || '';
    const h2 = document.querySelector('h2')?.textContent?.trim() || '';
    const bodyText = document.body?.innerText || '';
    return { title, h1, h2, bodyLen: bodyText.length, bodyPreview: bodyText.substring(0, 300) };
  })()`);
  console.log('title:', pageInfo.title);
  console.log('h1:', pageInfo.h1);
  console.log('h2:', pageInfo.h2);
  console.log('body length:', pageInfo.bodyLen);

  // Check for indicators
  const bodyTextAll = await evaluate(ws, 'document.body?.innerText || ""');
  const found = INDICATORS.filter(ind => bodyTextAll.includes(ind));
  console.log('indicators found:', found.length ? found : 'none');

  // Candidate container selectors
  const selectors = [
    '[class*="result" i]',
    '[class*="tile" i]',
    '[class*="card" i]',
    '[class*="list-item" i]',
    '[class*="row" i][class*="insight" i]',
    'tr[role="row"]',
    'li[class*="item" i]',
    '[class*="insight" i]',
    '[class*="article" i]',
    '[class*="news" i][class*="item" i]',
    'article',
    '[data-testid*="article" i]',
    '[data-testid*="result" i]',
    '[data-testid*="card" i]',
    '[class*="ItemCard" i]',
    '[class*="NewsItem" i]',
    '[class*="DocumentRow" i]',
  ];

  console.log('selector counts:');
  const hits = [];
  for (const sel of selectors) {
    const count = await evaluate(ws, `document.querySelectorAll(${JSON.stringify(sel)}).length`);
    if (count && count > 0) {
      hits.push({ sel, count });
      console.log('  [' + count + '] ' + sel);
    }
  }

  // For the highest-count semantic hit (ignore things like [class*="row"] that may match tons of nav rows)
  // Prefer selectors with counts 5-50 (typical article list size)
  const plausible = hits.filter(h => h.count >= 3 && h.count <= 100);
  let best = plausible.sort((a, b) => {
    // Prefer more specific selectors (with multiple tokens)
    const aSpec = (a.sel.match(/\[/g) || []).length;
    const bSpec = (b.sel.match(/\[/g) || []).length;
    if (aSpec !== bSpec) return bSpec - aSpec;
    return a.count - b.count;
  })[0];

  if (best) {
    console.log('best candidate:', best.sel, '(' + best.count + ')');
    // Dump first 2 outerHTML samples
    const samples = await evaluate(ws, `(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(best.sel)})).slice(0, 2);
      return els.map(e => e.outerHTML.substring(0, 1500));
    })()`);
    console.log('sample 1:', (samples?.[0] || '').substring(0, 800));
    console.log('---');
    console.log('sample 2:', (samples?.[1] || '').substring(0, 800));
  } else {
    console.log('NO plausible container selectors found');
  }

  // Also inspect the main content area children class distribution
  const classDist = await evaluate(ws, `(() => {
    const main = document.querySelector('main, [role="main"], [class*="main-content" i], [class*="Content" i]');
    if (!main) return { main: null };
    const classes = {};
    main.querySelectorAll('*').forEach(el => {
      (el.className || '').toString().split(/\\s+/).forEach(c => {
        if (c && c.length > 3 && c.length < 80) classes[c] = (classes[c] || 0) + 1;
      });
    });
    const top = Object.entries(classes).sort((a, b) => b[1] - a[1]).slice(0, 15);
    return { main: main.tagName, mainClass: main.className, top };
  })()`);
  console.log('main area:', classDist?.main, classDist?.mainClass?.toString().substring(0, 100));
  if (classDist?.top) {
    console.log('top classes in main:');
    classDist.top.forEach(([c, n]) => console.log('  ' + n + ': ' + c));
  }

  // Also search for any element containing an <h3> that looks like an article title (has a link + date nearby)
  const titleSearch = await evaluate(ws, `(() => {
    const h3s = Array.from(document.querySelectorAll('h3, h4'));
    const articleLike = h3s.filter(h => {
      const parent = h.closest('li, article, [class*="item" i], [class*="card" i], [class*="row" i], tr, div');
      return parent && (parent.querySelector('time') || /\\d{1,2}\\s+[A-Z][a-z]{2}/.test(parent.textContent || ''));
    });
    return {
      h3Count: h3s.length,
      articleLikeCount: articleLike.length,
      samples: articleLike.slice(0, 3).map(h => ({
        title: h.textContent.trim().substring(0, 100),
        parentTag: h.closest('li, article, [class*="item" i], [class*="card" i], [class*="row" i], tr, div')?.tagName,
        parentClass: h.closest('li, article, [class*="item" i], [class*="card" i], [class*="row" i], tr, div')?.className?.toString().substring(0, 100),
      })),
    };
  })()`);
  console.log('h3/h4 count:', titleSearch?.h3Count, 'article-like:', titleSearch?.articleLikeCount);
  if (titleSearch?.samples?.length) {
    console.log('article-like title samples:');
    titleSearch.samples.forEach(s => console.log('  "' + s.title + '" parent=' + s.parentTag + '.' + s.parentClass));
  }

  // Classify sector status
  let status;
  if (found.includes('not part of your current subscription')) status = 'paywalled';
  else if (found.includes('0 Records Found') || found.includes('No results found')) status = 'empty';
  else if (!landedUrl.includes('allInsights')) status = 'redirected';
  else if (titleSearch?.articleLikeCount > 0) status = 'accessible';
  else status = 'unknown';

  return { sector: sector.name, status, landedUrl, best: best?.sel || null, titles: titleSearch?.articleLikeCount || 0 };
}

async function main() {
  const pages = await getPages();
  const page = pages.find(p => p.url.includes('core.spglobal.com'));
  if (!page) { console.error('No core.spglobal.com tab'); process.exit(1); }

  console.log('[probe-platts] Connected to tab:', page.url);
  const ws = await connectPage(page);

  const results = [];
  for (const sector of SECTORS) {
    try {
      const r = await probeSector(ws, sector);
      results.push(r);
    } catch (e) {
      console.error('[probe-platts] error for', sector.name, ':', e.message);
      results.push({ sector: sector.name, status: 'error', error: e.message });
    }
  }

  console.log('\n\n========================================');
  console.log('FINAL PER-SECTOR SUMMARY:');
  console.log('========================================');
  for (const r of results) {
    console.log(`[${r.sector}] status=${r.status} url=${r.landedUrl?.substring(0, 80)} container=${r.best || 'none'} titles=${r.titles || 0}`);
  }

  const by = (st) => results.filter(r => r.status === st).map(r => r.sector);
  console.log('\nRESULT: accessible=[' + by('accessible').join(', ') + '], paywalled=[' + by('paywalled').join(', ') + '], empty=[' + by('empty').join(', ') + '], redirected=[' + by('redirected').join(', ') + '], unknown=[' + by('unknown').join(', ') + ']');

  ws.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
