#!/usr/bin/env node
// Export SOH vessels to Excel — 2 sheets: Inside Gulf, Outside Gulf

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SOH_DIR = path.join(__dirname, '..', 'soh-data');

// Gulf boundary from process-soh.js
const GULF_BOUNDARY = [
  { lat: 30.0, lng: 56.50 },
  { lat: 29.0, lng: 56.50 },
  { lat: 28.0, lng: 56.45 },
  { lat: 27.2, lng: 56.45 },
  { lat: 27.0, lng: 56.40 },
  { lat: 26.8, lng: 56.35 },
  { lat: 26.5, lng: 56.30 },
  { lat: 26.2, lng: 56.25 },
  { lat: 26.0, lng: 56.20 },
  { lat: 25.8, lng: 56.15 },
  { lat: 25.5, lng: 56.05 },
  { lat: 25.3, lng: 56.00 },
  { lat: 25.0, lng: 55.90 },
  { lat: 24.5, lng: 55.50 },
  { lat: 24.0, lng: 55.00 },
  { lat: 23.5, lng: 54.00 },
];

function boundaryLng(lat) {
  for (let i = 0; i < GULF_BOUNDARY.length - 1; i++) {
    const a = GULF_BOUNDARY[i], b = GULF_BOUNDARY[i + 1];
    if (lat >= b.lat && lat <= a.lat) {
      const frac = (lat - b.lat) / (a.lat - b.lat);
      return b.lng + frac * (a.lng - b.lng);
    }
  }
  return lat > 30.0 ? 56.50 : 54.00;
}

function isInsideGulf(lat, lng) {
  return lng < boundaryLng(lat);
}

// Read vessels
const vessels = JSON.parse(fs.readFileSync(path.join(SOH_DIR, 'vessels.json'), 'utf-8'));
console.log(`Total vessels: ${vessels.length}`);

const rows = [];

for (const v of vessels) {
  const loc = isInsideGulf(v.lat, v.lng) ? 'Inside Gulf' : 'Outside Gulf';
  rows.push({
    'Location': loc,
    'Vessel Name': v.name || '',
    'IMO': v.imo || '',
    'Vessel Type': v.vesselTypeClass || '',
    'Cargo State': v.state || '',
    'Flag': v.flagName || '',
    'DWT': v.deadWeight || '',
    'Speed (kn)': v.speed != null ? v.speed : '',
    'Lat': v.lat,
    'Lng': v.lng,
    'Destination': v.destination || v.aisDestination || '',
    'Product': v.product || '',
    'Controller': v.controller || '',
  });
}

const insideCount = rows.filter(r => r.Location === 'Inside Gulf').length;
console.log(`Inside Gulf: ${insideCount}`);
console.log(`Outside Gulf: ${rows.length - insideCount}`);

// Sort by location, then vessel type, then name
rows.sort((a, b) => a.Location.localeCompare(b.Location) || (a['Vessel Type'] || '').localeCompare(b['Vessel Type'] || '') || (a['Vessel Name'] || '').localeCompare(b['Vessel Name'] || ''));

// Build workbook — single sheet
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Vessels');

const outPath = path.join(__dirname, '..', 'soh-vessels-export.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Wrote ${outPath}`);
