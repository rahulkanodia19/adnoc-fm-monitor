// Retry failed downloads from the previous run
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.join(__dirname, '..');
let msgId = 1;

const PRODUCTS = { crude: 1370, lng: 1750, lpg: 2052 };
const UNITS = { crude: 'kbd', lng: 'ktons', lpg: 'ktons' };

const ALL_COUNTRIES = {
  'China': { zone: 213, dir: 'import' },
  'India': { zone: 447, dir: 'import' },
  'Japan': { zone: 477, dir: 'import' },
  'South Korea': { zone: 873, dir: 'import' },
  'Thailand': { zone: 911, dir: 'import' },
  'Vietnam': { zone: 963, dir: 'import' },
  'Bahrain': { zone: 77, dir: 'export' },
  'Iran': { zone: 455, dir: 'export' },
  'Iraq': { zone: 457, dir: 'export' },
  'Kuwait': { zone: 505, dir: 'export' },
  'Oman': { zone: 677, dir: 'export' },
  'Qatar': { zone: 739, dir: 'export' },
  'Russian Federation': { zone: 757, dir: 'export' },
  'Saudi Arabia': { zone: 787, dir: 'export' },
  'United Arab Emirates': { zone: 943, dir: 'export' },
  'United States': { zone: 947, dir: 'export' },
};

function parseKey(key) {
  // e.g. "India_crude_import" or "Qatar_lng_export"
  const parts = key.split('_');
  const dir = parts.pop();
  const commodity = parts.pop();
  const country = parts.join('_').replace(/_/g, ' ');
  return { country, commodity, dir };
}

function buildUrl(country, commodity, dir) {
  const info = ALL_COUNTRIES[country];
  if (!info) return null;
  const unit = UNITS[commodity];
  const product = PRODUCTS[commodity];
  if (dir === 'import') {
    return `https://terminal.kpler.com/cargo/flows?productEstimation=false&projection=actual&split=origin--country&granularity=days&unit=${unit}&dates=1m&mZones=${info.zone}&products=${product}&dir=import`;
  } else {
    return `https://terminal.kpler.com/cargo/flows?productEstimation=false&projection=actual&split=destination--country&granularity=days&unit=${unit}&dates=1m&mZones=${info.zone}&products=${product}`;
  }
}

async function getWSUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const pages = JSON.parse(data);
        const kplerPage = pages.find(p => p.url.includes('terminal.kpler.com'));
        if (kplerPage) resolve(kplerPage.webSocketDebuggerUrl);
        else reject(new Error('No Kpler page found'));
      });
    }).on('error', reject);
  });
}

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 90000);
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.removeListener('message', handler);
        clearTimeout(timeout);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function navigateAndWait(ws, url) {
  await cdpSend(ws, 'Page.navigate', { url });
  await new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === 'Page.loadEventFired') {
        ws.removeListener('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
    setTimeout(resolve, 25000);
  });
  // Longer wait for retry
  await sleep(12000);
}

async function exportAndCapture(ws) {
  const script = `
    (async function() {
      const origCreate = document.createElement.bind(document);
      window.__dlCapture = { b64: null, fname: null };
      document.createElement = function(tag) {
        const el = origCreate(tag);
        if (tag === 'a') {
          const origClick = el.click.bind(el);
          el.click = function() {
            if (el.href && el.href.startsWith('blob:') && el.download) {
              window.__dlCapture.fname = el.download;
              fetch(el.href).then(r => r.blob()).then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  window.__dlCapture.b64 = reader.result.split(',')[1];
                };
                reader.readAsDataURL(blob);
              });
              return;
            }
            return origClick();
          };
        }
        return el;
      };
      const btn = document.querySelector('button[aria-label="Export as CSV or PDF"]');
      if (!btn) { document.createElement = origCreate; return JSON.stringify({ error: 'no export button' }); }
      btn.click();
      await new Promise(r => setTimeout(r, 1500));
      const items = document.querySelectorAll('[role="menuitem"]');
      let clicked = false;
      for (const item of items) {
        if (item.textContent.trim() === 'Export as CSV') { item.click(); clicked = true; break; }
      }
      if (!clicked) { document.createElement = origCreate; return JSON.stringify({ error: 'no CSV menu item' }); }
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (window.__dlCapture.b64) break;
      }
      document.createElement = origCreate;
      if (window.__dlCapture.b64) {
        return JSON.stringify({ filename: window.__dlCapture.fname, base64: window.__dlCapture.b64 });
      }
      return JSON.stringify({ error: 'no blob captured' });
    })()
  `;

  const result = await cdpSend(ws, 'Runtime.evaluate', {
    expression: script,
    awaitPromise: true,
    returnByValue: true,
    timeout: 60000,
  });

  if (result.result && result.result.value) {
    return JSON.parse(result.result.value);
  }
  return { error: 'evaluation failed' };
}

async function main() {
  const log = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, '.kpler-download-log.json'), 'utf8'));
  const failed = log.results.filter(r => r.status === 'FAILED');
  console.log(`Retrying ${failed.length} failed downloads...`);

  const wsUrl = await getWSUrl();
  console.log(`Connecting to: ${wsUrl}`);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  await cdpSend(ws, 'Page.enable');

  let success = 0, stillFailed = 0;

  for (let i = 0; i < failed.length; i++) {
    const { key } = failed[i];
    const { country, commodity, dir } = parseKey(key);
    const url = buildUrl(country, commodity, dir);
    const targetDir = dir === 'import' ? 'import-flows' : 'export-flows';
    const num = i + 1;

    try {
      console.log(`\n[${num}/${failed.length}] ${key}`);
      if (!url) { console.log('  SKIP: unknown country'); stillFailed++; continue; }

      await navigateAndWait(ws, url);

      const titleResult = await cdpSend(ws, 'Runtime.evaluate', { expression: 'document.title', returnByValue: true });
      const title = titleResult.result?.value || '';
      console.log(`  Title: ${title.substring(0, 70)}`);

      if (title === 'Kpler') {
        await sleep(10000);
        const t2 = await cdpSend(ws, 'Runtime.evaluate', { expression: 'document.title', returnByValue: true });
        console.log(`  Title (retry): ${(t2.result?.value || '').substring(0, 70)}`);
      }

      const result = await exportAndCapture(ws);
      if (result.error) {
        console.log(`  ERROR: ${result.error}`);
        stillFailed++;
        continue;
      }

      const filename = result.filename.replace(/\//g, '_');
      const fullDir = path.join(PROJECT_DIR, targetDir);
      if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
      const buf = Buffer.from(result.base64, 'base64');
      fs.writeFileSync(path.join(fullDir, filename), buf);
      console.log(`  OK: ${filename} (${buf.length} bytes)`);
      success++;
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      stillFailed++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RETRY COMPLETE: ${success} recovered, ${stillFailed} still failed`);
  console.log(`Total successful: ${log.success + success} / ${log.total}`);
  console.log(`${'='.repeat(50)}`);
  ws.close();
  process.exit(0);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
