/**
 * add-pipeline-data.js
 * Merges pipeline flow data into existing seaborne import/export data.
 *
 * Pipeline flows added:
 * 1. ESPO pipeline (Russia→China): ~600 kb/d constant
 * 2. Kazakhstan-China pipeline: ~220 kb/d (Kazakh + Russian transit)
 * 3. Myanmar-China pipeline: ~200 kb/d
 * 4. Kirkuk-Ceyhan (Iraq→Turkey): 0 before Mar 17 2026, ~250 kb/d after
 *
 * Values are in thousands of barrels (same unit as Kpler seaborne data).
 * Run: node scripts/add-pipeline-data.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');

// --- Pipeline definitions ---
const IMPORT_PIPELINES = [
  {
    datasetKey: 'china_crude',
    country: 'Russian Federation',     // Add to existing Russia entries
    dailyVolume: 600,                   // kb/d - ESPO spur to Mohe/Daqing
    startDate: '2024-01-01',            // Pipeline has been operating throughout data range
    label: 'ESPO pipeline'
  },
  {
    datasetKey: 'china_crude',
    country: 'Kazakhstan',              // New country entry
    dailyVolume: 220,                   // kb/d - Kazakh crude + Russian transit
    startDate: '2024-01-01',
    label: 'Kazakhstan-China pipeline'
  },
  {
    datasetKey: 'china_crude',
    country: 'Myanmar',                 // New country entry
    dailyVolume: 200,                   // kb/d - Kyaukphyu to Kunming
    startDate: '2024-01-01',
    label: 'Myanmar-China pipeline'
  }
];

const EXPORT_PIPELINES = [
  {
    datasetKey: 'iraq_crude',
    country: 'Turkey',                  // New destination
    dailyVolume: 250,                   // kb/d - Kirkuk-Ceyhan
    startDate: '2026-03-17',            // Restarted March 17, 2026
    label: 'Kirkuk-Ceyhan pipeline'
  },
  {
    datasetKey: 'russia_crude',
    country: 'China',                   // Add to existing China entries
    dailyVolume: 600,                   // kb/d - ESPO spur to Mohe/Daqing
    startDate: '2024-01-01',            // Operating throughout data range
    label: 'ESPO pipeline (export side)'
  }
];

// --- Helper: parse JS data file ---
function readDataFile(filename) {
  const filepath = path.join(PROJECT_DIR, filename);
  let code = fs.readFileSync(filepath, 'utf8');
  const varName = filename === 'import-data.js' ? 'IMPORT_FLOW_DATA' : 'EXPORT_FLOW_DATA';
  // Extract JSON from the const declaration
  const match = code.match(new RegExp('(?:const|var)\\s+' + varName + '\\s*=\\s*'));
  if (!match) throw new Error(`Could not find ${varName} in ${filename}`);
  const startIdx = match.index + match[0].length;
  // Find the matching end - the data is a single JSON object followed by ;
  let jsonStr = code.slice(startIdx).replace(/;\s*$/, '');
  return JSON.parse(jsonStr);
}

// --- Helper: write JS data file ---
function writeDataFile(filename, varName, data) {
  const filepath = path.join(PROJECT_DIR, filename);
  const header = filename === 'import-data.js'
    ? '// Auto-generated from Excel data files + pipeline flows — ' + new Date().toISOString().split('T')[0] + '\n// Import data (Crude, LNG & LPG) by origin country\n// Daily, weekly and monthly aggregations\n// Note: China crude includes estimated pipeline flows (ESPO, Kazakhstan, Myanmar)\n\n'
    : '// Auto-generated from Excel data files + pipeline flows — ' + new Date().toISOString().split('T')[0] + '\n// Export data (Crude, LNG & LPG) by destination country\n// Daily, weekly and monthly aggregations\n// Note: Iraq crude includes Kirkuk-Ceyhan pipeline flow to Turkey (from Mar 17)\n\n';
  const content = header + 'const ' + varName + ' = ' + JSON.stringify(data) + ';\n';
  fs.writeFileSync(filepath, content, 'utf8');
}

// --- Merge pipeline data into a dataset ---
function mergePipelines(data, pipelines, aggregation) {
  for (const pipeline of pipelines) {
    const dataset = data[pipeline.datasetKey];
    if (!dataset) {
      console.log(`  SKIP: dataset ${pipeline.datasetKey} not found`);
      continue;
    }

    console.log(`  Adding ${pipeline.label}: ${pipeline.dailyVolume} kb/d to ${pipeline.datasetKey} → ${pipeline.country}`);

    // Add country to countries list if not present
    if (!dataset.countries.includes(pipeline.country)) {
      dataset.countries.push(pipeline.country);
      dataset.countries.sort();
      console.log(`    Added "${pipeline.country}" to countries list`);
    }

    // Process each aggregation level
    for (const level of ['daily', 'weekly', 'monthly']) {
      if (!dataset[level]) continue;

      let addedCount = 0;
      for (const record of dataset[level]) {
        const periodStart = record.s || record.p;
        const periodEnd = record.e || record.p;
        const totalDays = record.d || 1;

        // Skip if entire period is before pipeline start
        if (periodEnd < pipeline.startDate) continue;

        // Calculate overlap days for periods that partially span the start date
        let activeDays = totalDays;
        if (periodStart < pipeline.startDate) {
          // Pro-rate: count only days from pipeline start to period end
          const startMs = new Date(pipeline.startDate).getTime();
          const endMs = new Date(periodEnd).getTime();
          activeDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
          if (activeDays <= 0) continue;
          if (activeDays > totalDays) activeDays = totalDays;
        }

        // Calculate volume for active days only
        const volume = Math.round(pipeline.dailyVolume * activeDays * 10) / 10;

        // Add or increase country value
        const existing = record[pipeline.country] || 0;
        record[pipeline.country] = Math.round((existing + volume) * 10) / 10;

        // Recalculate total
        record._t = Math.round((record._t + volume) * 10) / 10;
        addedCount++;
      }
      console.log(`    ${level}: updated ${addedCount} records`);
    }

    // Recalculate topSuppliers/topDestinations
    const topKey = dataset.topSuppliers ? 'topSuppliers' : 'topDestinations';
    if (dataset[topKey]) {
      // Calculate total volume per country across all daily records
      const countryTotals = {};
      for (const record of dataset.daily) {
        for (const [key, value] of Object.entries(record)) {
          if (key === 'p' || key === 's' || key === 'e' || key === 'd' || key === '_t') continue;
          countryTotals[key] = (countryTotals[key] || 0) + value;
        }
      }
      // Sort by total and take top 15
      dataset[topKey] = Object.entries(countryTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([country]) => country);
      console.log(`    Updated ${topKey}: ${dataset[topKey].slice(0, 5).join(', ')}...`);
    }
  }
}

// --- Main ---
console.log('=== Adding Pipeline Flows ===\n');

// Process imports
console.log('Processing import-data.js...');
const importData = readDataFile('import-data.js');
mergePipelines(importData, IMPORT_PIPELINES);
writeDataFile('import-data.js', 'IMPORT_FLOW_DATA', importData);
console.log('  Written import-data.js\n');

// Process exports
console.log('Processing export-data.js...');
const exportData = readDataFile('export-data.js');
mergePipelines(exportData, EXPORT_PIPELINES);
writeDataFile('export-data.js', 'EXPORT_FLOW_DATA', exportData);
console.log('  Written export-data.js\n');

// Verify
console.log('=== Verification ===');
const verifyImport = readDataFile('import-data.js');
const chinaCrude = verifyImport.china_crude;
const lastDaily = chinaCrude.daily[chinaCrude.daily.length - 1];
console.log('China crude last daily:', JSON.stringify(lastDaily).slice(0, 300));
console.log('Has Kazakhstan:', chinaCrude.countries.includes('Kazakhstan'));
console.log('Has Myanmar:', chinaCrude.countries.includes('Myanmar'));
console.log('Top suppliers:', chinaCrude.topSuppliers.slice(0, 5));

const verifyExport = readDataFile('export-data.js');
const iraqCrude = verifyExport.iraq_crude;
const lastIraq = iraqCrude.daily[iraqCrude.daily.length - 1];
console.log('\nIraq crude last daily:', JSON.stringify(lastIraq).slice(0, 300));
console.log('Has Turkey:', iraqCrude.countries.includes('Turkey'));

console.log('\n=== Done ===');
