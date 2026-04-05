#!/usr/bin/env node
/**
 * _probe-platts2.js — Deep discovery probe for Platts Core.
 * User confirms subscription access. Reverse-engineers real user
 * flow: entitlements, working URL paths, article container selectors.
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

let msgId = 4000;
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
    setTimeout(() => { ws.removeListener('message', handler); resolve(null); }, 15000);
  });
}

function sendCmd(ws, method, params = {}) {
  const id = nextId();
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ id, method, params }));
    const handler = m => {
      const d = JSON.parse(m);
      if (d.id === id) { ws.removeListener('message', handler); resolve(d.result); }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.removeListener('message', handler); resolve(null); }, 15000);
  });
}

async function main() {
  const pages = await getPages();
  const page = pages.find(p => p.url.includes('core.spglobal.com'));
  if (!page) { console.error('No core.spglobal.com tab'); process.exit(1); }

  console.log('[probe-platts2] Connected to tab:', page.url);
  const ws = await connectPage(page);

  // Capture ALL network responses globally
  const captured = [];
  const handler = m => {
    try {
      const d = JSON.parse(m);
      if (d.method === 'Network.responseReceived') {
        const url = d.params?.response?.url || '';
        const mime = d.params?.response?.mimeType || '';
        const status = d.params?.response?.status || 0;
        if (url.includes('core.spglobal.com') || url.includes('platts') || url.includes('api')) {
          captured.push({ requestId: d.params.requestId, url, mime, status });
        }
      }
    } catch {}
  };
  ws.on('message', handler);
  await sendCmd(ws, 'Network.enable');

  // STEP 1: Navigate to Platts Core root + wait 30s
  console.log('\n=== STEP 1: Navigate to core.spglobal.com root ===');
  await sendCmd(ws, 'Page.navigate', { url: 'https://core.spglobal.com/' });
  await new Promise(r => setTimeout(r, 30000));

  const afterRoot = await evaluate(ws, `({
    href: window.location.href,
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim() || '',
    bodyLen: (document.body?.innerText || '').length,
    bodyPreview: (document.body?.innerText || '').substring(0, 500),
  })`);
  console.log('landed:', afterRoot?.href);
  console.log('title:', afterRoot?.title);
  console.log('h1:', afterRoot?.h1);
  console.log('bodyLen:', afterRoot?.bodyLen);
  console.log('bodyPreview:', afterRoot?.bodyPreview?.substring(0, 200));

  // STEP 2: Dump all visible hash-route anchors
  console.log('\n=== STEP 2: Enumerate navigable hash routes ===');
  const links = await evaluate(ws, `(() => {
    return Array.from(document.querySelectorAll('a[href*="#platts"]'))
      .map(a => ({
        href: a.getAttribute('href'),
        text: (a.textContent || '').trim().substring(0, 80),
        visible: a.offsetParent !== null,
      }))
      .filter(l => l.text.length > 0);
  })()`);
  const unique = [];
  const seen = new Set();
  for (const l of (links || [])) {
    if (!seen.has(l.href)) { seen.add(l.href); unique.push(l); }
  }
  console.log('total hash links:', links?.length, 'unique:', unique.length);
  unique.slice(0, 40).forEach(l => console.log(`  ${l.visible ? '*' : ' '} ${l.href} — "${l.text}"`));

  // STEP 3: Inspect candidate keySector values — the allInsights filter endpoint
  console.log('\n=== STEP 3: Check allInsights with no keySector filter ===');
  await evaluate(ws, `window.location.href = 'https://core.spglobal.com/#platts/allInsights'`);
  await new Promise(r => setTimeout(r, 25000));

  const allInsights = await evaluate(ws, `({
    href: window.location.href,
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim() || '',
    bodyLen: (document.body?.innerText || '').length,
    hasPaywall: (document.body?.innerText || '').includes('not part of your current subscription'),
    hasNoResults: (document.body?.innerText || '').includes('No results found') || (document.body?.innerText || '').includes('0 Records Found'),
    preview: (document.body?.innerText || '').substring(0, 2000),
  })`);
  console.log('allInsights (no filter):');
  console.log('  href:', allInsights?.href);
  console.log('  h1:', allInsights?.h1);
  console.log('  bodyLen:', allInsights?.bodyLen);
  console.log('  paywall:', allInsights?.hasPaywall, 'no-results:', allInsights?.hasNoResults);
  console.log('  preview (first 800 chars):');
  console.log('  ', (allInsights?.preview || '').substring(0, 800).replace(/\n/g, '\n  '));

  // STEP 4: Find article-looking elements on the allInsights page
  console.log('\n=== STEP 4: Deep selector scan on allInsights page ===');
  const selectorScan = await evaluate(ws, `(() => {
    // Find all repeating sibling patterns
    const all = document.querySelectorAll('*');
    const siblingGroups = {};
    for (const el of all) {
      const parent = el.parentElement;
      if (!parent) continue;
      const key = parent.tagName + '|' + el.tagName + '|' + (el.className || '').toString().substring(0, 80);
      if (!siblingGroups[key]) siblingGroups[key] = { count: 0, sample: el.outerHTML.substring(0, 500) };
      siblingGroups[key].count++;
    }
    const top = Object.entries(siblingGroups)
      .filter(([k, v]) => v.count >= 5 && v.count <= 200 && !k.includes('appshell-menu'))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
    return top.map(([k, v]) => ({ key: k, count: v.count, sample: v.sample }));
  })()`);
  console.log('repeating sibling groups (5-200 items, excluding shell menu):');
  for (const s of (selectorScan || []).slice(0, 10)) {
    console.log(`  [${s.count}] ${s.key.substring(0, 120)}`);
    console.log(`    sample: ${s.sample.substring(0, 200)}`);
  }

  // STEP 5: Look for article links on allInsights page
  console.log('\n=== STEP 5: Article link scan ===');
  const articleLinks = await evaluate(ws, `(() => {
    const candidates = [
      'a[href*="show" i]',
      'a[href*="article" i]',
      'a[href*="document" i]',
      'a[href*="news" i]',
      'a[href*="insight" i]',
      'a[href*="/story" i]',
    ];
    const results = {};
    for (const sel of candidates) {
      const els = Array.from(document.querySelectorAll(sel));
      results[sel] = { count: els.length, samples: els.slice(0, 3).map(a => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().substring(0, 100) })) };
    }
    return results;
  })()`);
  for (const [sel, info] of Object.entries(articleLinks || {})) {
    if (info.count > 0) {
      console.log(`  ${sel}: ${info.count}`);
      info.samples.forEach(s => console.log(`    href=${s.href?.substring(0, 120)} text="${s.text}"`));
    }
  }

  // STEP 6: Examine visible h3/h4 elements — each article likely has a title heading
  console.log('\n=== STEP 6: All visible heading elements ===');
  const headings = await evaluate(ws, `(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5'))
      .filter(h => h.offsetParent !== null)
      .slice(0, 30)
      .map(h => ({
        tag: h.tagName,
        text: (h.textContent || '').trim().substring(0, 100),
        parentTag: h.parentElement?.tagName,
        parentClass: (h.parentElement?.className || '').toString().substring(0, 100),
        grandparentClass: (h.parentElement?.parentElement?.className || '').toString().substring(0, 100),
      }));
  })()`);
  (headings || []).forEach(h => {
    console.log(`  ${h.tag}: "${h.text}" | parent=${h.parentTag}.${h.parentClass}`);
  });

  // STEP 7: Inspect captured API calls for entitlement/article endpoints
  console.log('\n=== STEP 7: Relevant captured API calls ===');
  const relevantApis = captured.filter(c =>
    c.url.includes('platts') || c.url.includes('entitlement') ||
    c.url.includes('news') || c.url.includes('insight') ||
    c.url.includes('search') || c.url.includes('article') ||
    c.url.includes('document')
  ).filter(c => c.mime?.includes('json'));
  console.log('captured json api calls:', relevantApis.length);
  relevantApis.slice(0, 30).forEach(c => {
    console.log(`  [${c.status}] ${c.url.substring(0, 150)}`);
  });

  // STEP 8: For the first 3 JSON api responses matching "news"/"insight"/"search", dump 500 chars
  const bodyDumps = relevantApis.filter(c =>
    (c.url.includes('news') || c.url.includes('insight') || c.url.includes('search')) && c.status === 200
  ).slice(0, 5);
  console.log('\n=== STEP 8: Response bodies (news/insight/search endpoints) ===');
  for (const c of bodyDumps) {
    console.log(`\n--- ${c.url.substring(0, 120)} ---`);
    const body = await sendCmd(ws, 'Network.getResponseBody', { requestId: c.requestId });
    if (body && body.body) console.log(body.body.substring(0, 800));
    else console.log('(body unavailable)');
  }

  ws.removeListener('message', handler);
  ws.close();
  console.log('\n[probe-platts2] done');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
