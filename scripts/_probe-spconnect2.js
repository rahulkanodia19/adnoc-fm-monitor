#!/usr/bin/env node
/**
 * _probe-spconnect2.js — Follow-up: fetch the masterviewer-api JSON body
 * directly to understand article format, and reproduce the current bug.
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

let msgId = 2000;
function nextId() { return ++msgId; }

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
  if (!page) { console.error('No connect.spglobal.com tab'); process.exit(1); }

  const ws = await connectPage(page);

  // Capture masterviewer-api response specifically
  let mvReqId = null;
  let allReqsBefore8s = [];
  let allReqsAt15s = [];
  const startTs = Date.now();
  const handler = m => {
    try {
      const d = JSON.parse(m);
      if (d.method === 'Network.responseReceived') {
        const url = d.params?.response?.url || '';
        const elapsed = Date.now() - startTs;
        if (url.includes('masterviewer-api/v1/Document?source=phoenix')) {
          mvReqId = d.params.requestId;
          console.log(`[probe2] masterviewer-api response captured at ${elapsed}ms`);
        }
        if (elapsed < 8000) allReqsBefore8s.push({ url: url.substring(0, 120), elapsed });
        if (elapsed < 15000) allReqsAt15s.push({ url: url.substring(0, 120), elapsed });
      }
    } catch {}
  };
  ws.on('message', handler);
  await sendCmd(ws, 'Network.enable');

  // Navigate to home first to reset state
  await sendCmd(ws, 'Page.navigate', { url: 'https://connect.spglobal.com/home' });
  await new Promise(r => setTimeout(r, 5000));

  // Clear counters, re-navigate to article
  mvReqId = null;
  allReqsBefore8s = [];
  allReqsAt15s = [];
  const startNav = Date.now();
  console.log('[probe2] Navigating to article...');
  await sendCmd(ws, 'Page.navigate', {
    url: 'https://connect.spglobal.com/document/show/phoenix/5929972?connectPath=LandingPage.HotTopics'
  });
  await new Promise(r => setTimeout(r, 8000));
  console.log('[probe2] At 8s — captured masterviewer:', mvReqId ? 'YES' : 'NO');
  console.log('[probe2] Requests in first 8s:', allReqsBefore8s.length);
  await new Promise(r => setTimeout(r, 7000));
  console.log('[probe2] At 15s — captured masterviewer:', mvReqId ? 'YES' : 'NO');
  console.log('[probe2] Requests in first 15s:', allReqsAt15s.length);

  ws.removeListener('message', handler);

  if (mvReqId) {
    console.log('\n=== MASTERVIEWER-API BODY (first 3000 chars) ===');
    const body = await sendCmd(ws, 'Network.getResponseBody', { requestId: mvReqId });
    if (body && body.body) {
      console.log(body.body.substring(0, 3000));
      console.log('\n--- total body length:', body.body.length, '---');
      // Parse and show structure
      try {
        const parsed = JSON.parse(body.body);
        console.log('\n=== PARSED STRUCTURE ===');
        console.log('Top-level keys:', Object.keys(parsed));
        if (parsed.document) {
          console.log('document keys:', Object.keys(parsed.document));
          if (parsed.document.html) {
            const text = parsed.document.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            console.log('html → text length:', text.length);
            console.log('text preview:', text.substring(0, 500));
          }
        }
      } catch (e) { console.log('parse error:', e.message); }
    } else {
      console.log('getResponseBody returned nothing!');
    }
  }

  ws.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
