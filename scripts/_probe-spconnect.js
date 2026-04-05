#!/usr/bin/env node
/**
 * _probe-spconnect.js — throwaway probe to discover how S&P Connect
 * delivers article bodies. Logs network events + DOM selectors after
 * navigating to one Gulf-relevant article.
 *
 * Prints findings to stdout. Does NOT write files. Delete after fix lands.
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

let msgId = 1000;
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

function sendCmd(ws, method, params = {}) {
  const id = nextId();
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ id, method, params }));
    const handler = m => {
      const d = JSON.parse(m);
      if (d.id === id) { ws.removeListener('message', handler); resolve(d.result); }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.removeListener('message', handler); resolve(null); }, 10000);
  });
}

async function main() {
  const pages = await getPages();
  const page = pages.find(p => p.url.includes('connect.spglobal.com'));
  if (!page) { console.error('No connect.spglobal.com tab found'); process.exit(1); }

  console.log('[probe-spconnect] Connected to tab:', page.url);
  const ws = await connectPage(page);

  // 1. Navigate to home + extract article links
  await sendCmd(ws, 'Page.navigate', { url: 'https://connect.spglobal.com/home' });
  await new Promise(r => setTimeout(r, 8000));

  const linksRaw = await evaluate(ws,
    `JSON.stringify(Array.from(document.querySelectorAll("a[href*='/document/show/phoenix/']"))
      .map(a=>({text:a.textContent.trim().substring(0,100),href:a.href}))
      .filter(a=>a.text.length>10).slice(0,20))`);
  const links = JSON.parse(linksRaw || '[]');
  console.log('[probe-spconnect] Home article links found:', links.length);

  const KEYWORDS = ['gulf','iran','hormuz','lng','crude','war','conflict','persian','energy','oil','opec','middle east'];
  const relevant = links.filter(l => KEYWORDS.some(kw => l.text.toLowerCase().includes(kw)));
  console.log('[probe-spconnect] Gulf-relevant:', relevant.length);
  if (relevant.length === 0) {
    console.log('[probe-spconnect] Using first article as fallback');
    relevant.push(links[0]);
  }
  const target = relevant[0];
  if (!target) { console.error('[probe-spconnect] No article links at all'); process.exit(1); }
  console.log('[probe-spconnect] Target article:', target.text);
  console.log('[probe-spconnect] Target URL:', target.href);

  // 2. Enable Network domain + attach listener BEFORE navigation
  const capturedResponses = [];
  const responseHandler = m => {
    try {
      const d = JSON.parse(m);
      if (d.method === 'Network.responseReceived') {
        const url = d.params?.response?.url || '';
        const mime = d.params?.response?.mimeType || '';
        const status = d.params?.response?.status || 0;
        if (url.includes('masterviewer') || url.includes('phoenix') || url.includes('/api/') || url.includes('document') || url.includes('.json') || mime.includes('json')) {
          capturedResponses.push({
            requestId: d.params.requestId,
            url: url.substring(0, 200),
            mime,
            status,
          });
        }
      }
    } catch {}
  };
  ws.on('message', responseHandler);
  await sendCmd(ws, 'Network.enable');

  console.log('\n[probe-spconnect] Navigating to article + capturing network for 15s...');
  await sendCmd(ws, 'Page.navigate', { url: target.href });
  await new Promise(r => setTimeout(r, 15000));

  console.log('\n=== CAPTURED RESPONSES (json/api/document/masterviewer) ===');
  console.log('Total captured:', capturedResponses.length);
  capturedResponses.slice(0, 40).forEach((r, i) => {
    console.log(`${i+1}. [${r.status}] ${r.mime} — ${r.url}`);
  });

  // 3. Check if current hypothesis URL pattern exists
  const currentPatternMatches = capturedResponses.filter(r => r.url.includes('masterviewer-api/v1/Document?source=phoenix'));
  console.log('\n=== CURRENT HYPOTHESIS URL PATTERN ===');
  console.log('matches for "masterviewer-api/v1/Document?source=phoenix":', currentPatternMatches.length);

  // 4. Try to fetch response bodies for JSON candidates
  const jsonCandidates = capturedResponses.filter(r => r.mime.includes('json') && r.status === 200).slice(0, 5);
  console.log('\n=== JSON RESPONSE BODIES (first 500 chars each) ===');
  for (const c of jsonCandidates) {
    const body = await sendCmd(ws, 'Network.getResponseBody', { requestId: c.requestId });
    if (body && body.body) {
      console.log(`\n--- ${c.url} ---`);
      console.log(body.body.substring(0, 500));
    } else {
      console.log(`\n--- ${c.url} — body unavailable ---`);
    }
  }

  // 5. DOM probe — is the article in the DOM?
  ws.removeListener('message', responseHandler);
  console.log('\n=== DOM EXTRACTION PROBE (post-navigation) ===');
  const currentUrl = await evaluate(ws, 'window.location.href');
  console.log('Current URL:', currentUrl);
  const bodyLen = await evaluate(ws, '(document.body?.innerText||"").length');
  console.log('Full body innerText length:', bodyLen);

  const selectors = [
    'article',
    '[role="main"]',
    '[class*="article-body" i]',
    '[class*="ArticleBody"]',
    '[class*="document-body" i]',
    '[class*="DocumentBody"]',
    'main [class*="content" i]',
    '[class*="document-content" i]',
    '[class*="viewer" i] [class*="content" i]',
    'iframe',
  ];
  for (const sel of selectors) {
    const result = await evaluate(ws, `
      (() => {
        const els = document.querySelectorAll(${JSON.stringify(sel)});
        if (els.length === 0) return { count: 0 };
        const el = els[0];
        return {
          count: els.length,
          textLen: (el.innerText || '').length,
          firstChars: (el.innerText || '').substring(0, 100),
          tagName: el.tagName,
        };
      })()
    `);
    if (result && result.count > 0) {
      console.log(`[${sel}] count=${result.count} textLen=${result.textLen} tag=${result.tagName} preview="${result.firstChars}"`);
    }
  }

  // 6. Check for iframe content (some document viewers embed in iframe)
  const iframeInfo = await evaluate(ws, `
    (() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      return iframes.map(f => ({ src: f.src, id: f.id, name: f.name }));
    })()
  `);
  console.log('\n=== IFRAMES ===');
  console.log(JSON.stringify(iframeInfo, null, 2));

  // 7. Recommendation
  console.log('\n=== RECOMMENDATION ===');
  const domOptions = selectors.map(s => ({ sel: s }));
  // find best DOM selector with text > 500 chars
  let bestSelector = null;
  for (const sel of selectors) {
    const r = await evaluate(ws, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? (e.innerText || '').length : 0; })()`);
    if (r > 500 && (!bestSelector || r > bestSelector.len)) {
      bestSelector = { sel, len: r };
    }
  }
  if (bestSelector) {
    console.log(`RECOMMENDATION: use DOM extraction via selector "${bestSelector.sel}" (${bestSelector.len} chars)`);
  } else if (capturedResponses.length > 0) {
    console.log('RECOMMENDATION: use network interception with one of the JSON endpoints above');
  } else {
    console.log('RECOMMENDATION: unknown — both DOM and network probes yielded nothing');
  }

  ws.close();
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
