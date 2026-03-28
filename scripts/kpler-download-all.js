// Automated Kpler flow data downloader
// Connects directly to Chrome DevTools Protocol via WebSocket
// Downloads all 48 xlsx files and saves to import-flows/ and export-flows/

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.join(__dirname, '..');
let msgId = 1;

// --- Dataset definitions ---
const PRODUCTS = { crude: 1370, lng: 1750, lpg: 2052 };
const UNITS = { crude: 'kbd', lng: 'ktons', lpg: 'ktons' };

const IMPORT_COUNTRIES = [
  { name: 'China', zone: 213 },
  { name: 'India', zone: 447 },
  { name: 'Japan', zone: 477 },
  { name: 'South Korea', zone: 873 },
  { name: 'Thailand', zone: 911 },
  { name: 'Vietnam', zone: 963 },
];

const EXPORT_COUNTRIES = [
  { name: 'Bahrain', zone: 77 },
  { name: 'Iran', zone: 455 },
  { name: 'Iraq', zone: 457 },
  { name: 'Kuwait', zone: 505 },
  { name: 'Oman', zone: 677 },
  { name: 'Qatar', zone: 739 },
  { name: 'Russian Federation', zone: 757 },
  { name: 'Saudi Arabia', zone: 787 },
  { name: 'United Arab Emirates', zone: 943 },
  { name: 'United States', zone: 947 },
];

function buildDatasets() {
  const datasets = [];
  for (const commodity of ['crude', 'lng', 'lpg']) {
    for (const c of EXPORT_COUNTRIES) {
      datasets.push({
        key: `${c.name}_${commodity}_export`,
        country: c.name, zone: c.zone, commodity,
        product: PRODUCTS[commodity], unit: UNITS[commodity],
        dir: 'export',
        url: `https://terminal.kpler.com/cargo/flows?productEstimation=false&projection=actual&split=destination--country&granularity=days&unit=${UNITS[commodity]}&dates=1m&mZones=${c.zone}&products=${PRODUCTS[commodity]}`,
        targetDir: 'export-flows',
      });
    }
    for (const c of IMPORT_COUNTRIES) {
      datasets.push({
        key: `${c.name}_${commodity}_import`,
        country: c.name, zone: c.zone, commodity,
        product: PRODUCTS[commodity], unit: UNITS[commodity],
        dir: 'import',
        url: `https://terminal.kpler.com/cargo/flows?productEstimation=false&projection=actual&split=origin--country&granularity=days&unit=${UNITS[commodity]}&dates=1m&mZones=${c.zone}&products=${PRODUCTS[commodity]}&dir=import`,
        targetDir: 'import-flows',
      });
    }
  }
  return datasets;
}

function prioritize(datasets) {
  const p1Names = ['Saudi Arabia', 'United Arab Emirates', 'Iraq', 'Qatar', 'China', 'India'];
  const p2Names = ['Russian Federation', 'United States', 'Japan', 'South Korea'];
  const priority = (d) => {
    if (p1Names.includes(d.country) && d.commodity === 'crude') return 1;
    if (p2Names.includes(d.country) && (d.commodity === 'crude' || d.commodity === 'lng')) return 2;
    if (d.commodity === 'lng') return 3;
    if (d.commodity === 'crude') return 3;
    return 4;
  };
  return datasets.sort((a, b) => priority(a) - priority(b));
}

async function getWSUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const pages = JSON.parse(data);
        const kplerPage = pages.find(p => p.url.includes('terminal.kpler.com/cargo/flows'));
        if (kplerPage) resolve(kplerPage.webSocketDebuggerUrl);
        else reject(new Error('No Kpler page found'));
      });
    }).on('error', reject);
  });
}

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 60000);
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
    setTimeout(resolve, 20000);
  });
  await sleep(8000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
      await new Promise(r => setTimeout(r, 1000));

      const items = document.querySelectorAll('[role="menuitem"]');
      let clicked = false;
      for (const item of items) {
        if (item.textContent.trim() === 'Export as CSV') {
          item.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) { document.createElement = origCreate; return JSON.stringify({ error: 'no CSV menu item' }); }

      for (let i = 0; i < 20; i++) {
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
    timeout: 30000,
  });

  if (result.result && result.result.value) {
    return JSON.parse(result.result.value);
  }
  return { error: 'evaluation failed', result };
}

async function main() {
  const datasets = prioritize(buildDatasets());
  console.log(`Total datasets to download: ${datasets.length}`);

  const wsUrl = await getWSUrl();
  console.log(`Connecting to: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await cdpSend(ws, 'Page.enable');

  let success = 0, failed = 0;
  const results = [];

  for (let i = 0; i < datasets.length; i++) {
    const d = datasets[i];
    const num = i + 1;

    try {
      console.log(`\n[${num}/${datasets.length}] ${d.key}`);
      await navigateAndWait(ws, d.url);

      // Verify page loaded
      const titleResult = await cdpSend(ws, 'Runtime.evaluate', {
        expression: 'document.title',
        returnByValue: true,
      });
      const title = titleResult.result?.value || '';
      console.log(`  Title: ${title.substring(0, 70)}`);

      if (!title.includes('Kpler Terminal') && title !== 'Kpler') {
        console.log(`  SKIP: login page detected`);
        failed++;
        results.push({ key: d.key, status: 'FAILED', reason: 'login page' });
        break; // Stop all downloads if login required
      }

      if (title === 'Kpler') {
        // SPA still loading, wait more
        await sleep(8000);
      }

      // Export and capture
      const result = await exportAndCapture(ws);

      if (result.error) {
        console.log(`  ERROR: ${result.error}`);
        failed++;
        results.push({ key: d.key, status: 'FAILED', reason: result.error });
        continue;
      }

      // Save file - replace / with _ in filename for filesystem
      const filename = result.filename.replace(/\//g, '_');
      const targetDir = path.join(PROJECT_DIR, d.targetDir);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, filename);
      const buf = Buffer.from(result.base64, 'base64');
      fs.writeFileSync(targetPath, buf);
      console.log(`  OK: ${filename} (${buf.length} bytes)`);
      success++;
      results.push({ key: d.key, status: 'OK', file: filename, size: buf.length });

    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      failed++;
      results.push({ key: d.key, status: 'FAILED', reason: err.message });
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`COMPLETE: ${success} success, ${failed} failed out of ${datasets.length}`);
  console.log(`${'='.repeat(50)}`);

  // Save results log
  fs.writeFileSync(
    path.join(PROJECT_DIR, '.kpler-download-log.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), success, failed, total: datasets.length, results }, null, 2)
  );

  ws.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
