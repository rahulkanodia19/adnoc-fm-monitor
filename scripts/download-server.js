// Tiny HTTP server to receive base64-encoded xlsx files from the browser
// and save them to the project directory
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
  // CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filename, dir, base64 } = JSON.parse(body);
        const targetDir = path.join(PROJECT_DIR, dir);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const filePath = path.join(targetDir, filename);
        const buf = Buffer.from(base64, 'base64');
        fs.writeFileSync(filePath, buf);
        console.log(`Saved: ${filePath} (${buf.length} bytes)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, size: buf.length, path: filePath }));
      } catch (e) {
        console.error('Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(19876, '127.0.0.1', () => {
  console.log('Download server listening on http://127.0.0.1:19876');
});
