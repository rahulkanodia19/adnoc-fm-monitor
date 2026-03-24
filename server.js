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

// DISABLED: Shipping API route (re-enable when AIS data quality is ready)
// app.get('/api/shipping', async (req, res) => { ... });

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`ADNOC FM Monitor server running on http://localhost:${PORT}`);
});
