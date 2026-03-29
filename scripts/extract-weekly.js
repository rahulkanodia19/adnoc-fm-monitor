const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function extractWeekly(filePath, varName) {
  const fullPath = path.join(ROOT, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  content = content.replace(/^\/\/.*$/gm, '');
  content = content.replace(`const ${varName} =`, `module.exports =`);
  const tmpPath = fullPath + '.tmp.js';
  fs.writeFileSync(tmpPath, content);
  const data = require(tmpPath);
  fs.unlinkSync(tmpPath);

  const result = {};
  for (const key of Object.keys(data)) {
    const dataset = data[key];
    if (dataset.weekly && dataset.weekly.length > 0) {
      const weekly = dataset.weekly;
      const last4 = weekly.slice(-4);
      result[key] = {
        countries: dataset.countries,
        topSuppliers: dataset.topSuppliers,
        totalWeeks: weekly.length,
        lastFourWeeks: last4
      };
    }
  }
  return result;
}

// Extract imports
const imports = extractWeekly('import-data.js', 'IMPORT_FLOW_DATA');
console.log('=== IMPORT DATASETS ===');
console.log('Keys:', Object.keys(imports).join(', '));
console.log();

for (const [key, val] of Object.entries(imports)) {
  console.log(`--- ${key} ---`);
  console.log('Top suppliers:', val.topSuppliers.slice(0, 10).join(', '));
  for (const w of val.lastFourWeeks) {
    const entries = Object.entries(w)
      .filter(([k]) => !['p','s','e','d','_t'].includes(k))
      .sort((a,b) => b[1] - a[1])
      .slice(0, 10);
    console.log(`  W ${w.s} to ${w.e}: total=${Math.round(w._t)} | ${entries.map(([k,v]) => `${k}:${Math.round(v)}`).join(', ')}`);
  }
  console.log();
}

// Extract exports
const exports_ = extractWeekly('export-data.js', 'EXPORT_FLOW_DATA');
console.log('=== EXPORT DATASETS ===');
console.log('Keys:', Object.keys(exports_).join(', '));
console.log();

for (const [key, val] of Object.entries(exports_)) {
  console.log(`--- ${key} ---`);
  console.log('Top destinations:', val.topSuppliers.slice(0, 10).join(', '));
  for (const w of val.lastFourWeeks) {
    const entries = Object.entries(w)
      .filter(([k]) => !['p','s','e','d','_t'].includes(k))
      .sort((a,b) => b[1] - a[1])
      .slice(0, 10);
    console.log(`  W ${w.s} to ${w.e}: total=${Math.round(w._t)} | ${entries.map(([k,v]) => `${k}:${Math.round(v)}`).join(', ')}`);
  }
  console.log();
}
