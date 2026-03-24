// ============================================================
// server.js -- ADNOC FM Monitor Local Dev Server
// Serves static files for local development.
// Data sync is handled by GitHub Actions (scripts/sync-data.js).
// Usage: node server.js
// ============================================================

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`ADNOC FM Monitor server running on http://localhost:${PORT}`);
});
