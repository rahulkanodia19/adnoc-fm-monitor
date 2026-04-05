// ============================================================
// server.js -- ADNOC FM Monitor Local Dev Server
// Serves static files for local development.
// Data sync is handled by GitHub Actions (scripts/sync-data.js).
// Usage: node server.js
// ============================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Market Prices API route
const marketPricesHandler = require('./api/market-prices');
app.get('/api/market-prices', (req, res) => marketPricesHandler(req, res));

// DISABLED: Shipping API route (re-enable when AIS data quality is ready)
// app.get('/api/shipping', async (req, res) => { ... });

// HTML cache-buster: rewrite <script src="X.js"> -> <script src="X.js?v=<mtime>">
// Purpose: prevent stale JS in long-lived browser tabs during dev iteration.
let htmlCache = { body: null, stamp: 0 };
const HTML_CACHE_MS = 500;

function stampFor(file) {
  try {
    return Math.floor(fs.statSync(path.join(__dirname, file)).mtimeMs / 1000);
  } catch { return 0; }
}

function serveIndex(_req, res) {
  const now = Date.now();
  if (htmlCache.body && (now - htmlCache.stamp) < HTML_CACHE_MS) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(htmlCache.body);
  }
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  html = html.replace(
    /<script\s+src="([^"?:]+\.js)"([^>]*)>/g,
    (_m, src, rest) => `<script src="${src}?v=${stampFor(src)}"${rest}>`
  );
  htmlCache = { body: html, stamp: now };
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

app.get('/', serveIndex);
app.get('/index.html', serveIndex);

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`ADNOC FM Monitor server running on http://localhost:${PORT}`);
});
