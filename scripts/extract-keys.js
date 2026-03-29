const fs = require('fs');

// Extract keys from import-data.js
const importContent = fs.readFileSync('import-data.js', 'utf8');
const importKeys = [];
const re1 = /^\s{2}(\w+):\s*\{/gm;
let m1;
while ((m1 = re1.exec(importContent)) !== null) {
  importKeys.push(m1[1]);
}
console.log('IMPORT_KEYS:', JSON.stringify(importKeys));

// Extract keys from export-data.js
const exportContent = fs.readFileSync('export-data.js', 'utf8');
const exportKeys = [];
const re2 = /^\s{2}(\w+):\s*\{/gm;
let m2;
while ((m2 = re2.exec(exportContent)) !== null) {
  exportKeys.push(m2[1]);
}
console.log('EXPORT_KEYS:', JSON.stringify(exportKeys));
