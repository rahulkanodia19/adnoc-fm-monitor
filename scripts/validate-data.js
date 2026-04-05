#!/usr/bin/env node
// ==============================================================
// validate-data.js — Pre-commit validation for data.js
//
// Validates schema, pre-war baselines, enums, and integrity
// before allowing git commit. Exit 0 = pass, exit 1 = fail.
//
// Usage: node scripts/validate-data.js
// ==============================================================

const path = require('path');
const fs = require('fs');

const dataPath = path.resolve(__dirname, '..', 'data.js');
let passes = 0;
let fails = 0;
let warns = 0;
const errors = [];
const warnings = [];

function pass(msg) { passes++; }
function fail(msg) { fails++; errors.push(msg); }
function warn(msg) { warns++; warnings.push(msg); }

// Expected global-disruption ranges for the current Gulf crisis state.
// Cross-checks Σ offline across 9 countries against reasonable bounds — WARN, not FAIL.
// Tune as crisis evolves (baselines seeded from Apr 2026 snapshot).
const EXPECTED_TOTALS = {
  oilOffline:       { min: 5000, max: 12000, unit: 'kb/d' },
  gasOffline:       { min: 20,   max: 45,    unit: 'Bcf/d' },
  refiningOffline:  { min: 2000, max: 4500,  unit: 'kb/d' },
  lngOffline:       { min: 60,   max: 90,    unit: 'Mtpa' },
  petchemOffline:   { min: 8000,  max: 18000, unit: 'kt/y' },
};

// ---------- 1. JS Syntax Check ----------
try {
  // data.js uses const declarations — we need to eval it in a sandbox
  const code = fs.readFileSync(dataPath, 'utf8');
  // Wrap in a function to avoid polluting scope, and extract the consts
  const wrapped = `(function() { ${code}; return { LAST_UPDATED, COUNTRY_STATUS_DATA, FM_DECLARATIONS_DATA, SHUTDOWNS_NO_FM_DATA, WAR_RISK_PREMIUM_DATA, PIPELINE_STATUS_DATA }; })()`;
  var data = eval(wrapped);
  pass('JS syntax valid');
} catch (e) {
  fail(`JS syntax error: ${e.message}`);
  console.error('\n===== VALIDATION FAILED =====');
  console.error(`  [FAIL] JS syntax error: ${e.message}`);
  console.error('\nFix the syntax error in data.js before committing.');
  process.exit(1);
}

const { LAST_UPDATED, COUNTRY_STATUS_DATA, FM_DECLARATIONS_DATA, SHUTDOWNS_NO_FM_DATA, WAR_RISK_PREMIUM_DATA, PIPELINE_STATUS_DATA } = data;

// ---------- 2. LAST_UPDATED valid ----------
const lastUpdatedDate = new Date(LAST_UPDATED);
if (isNaN(lastUpdatedDate.getTime())) {
  fail(`LAST_UPDATED is not a valid ISO timestamp: "${LAST_UPDATED}"`);
} else if (lastUpdatedDate > new Date(Date.now() + 86400000)) {
  fail(`LAST_UPDATED is in the future: "${LAST_UPDATED}"`);
} else {
  pass('LAST_UPDATED valid');
}

// ---------- 3. All 9 countries present ----------
const expectedCountries = ['qatar', 'kuwait', 'saudi_arabia', 'uae', 'iraq', 'bahrain', 'oman', 'israel', 'iran'];
const countryIds = COUNTRY_STATUS_DATA.map(c => c.id);

expectedCountries.forEach(id => {
  if (countryIds.includes(id)) pass(`Country "${id}" exists`);
  else fail(`Country "${id}" MISSING from COUNTRY_STATUS_DATA`);
});

if (COUNTRY_STATUS_DATA.length === 9) pass('9 countries total');
else fail(`Expected 9 countries, found ${COUNTRY_STATUS_DATA.length}`);

// Check for duplicate country IDs
const uniqueCountryIds = new Set(countryIds);
if (uniqueCountryIds.size === countryIds.length) pass('No duplicate country IDs');
else fail(`Duplicate country IDs found`);

// ---------- 4. Country required fields ----------
const validCountryStatuses = ['stable', 'elevated', 'high', 'critical', 'conflict'];
const validImpactSeverities = ['none', 'low', 'moderate', 'severe', 'critical'];

COUNTRY_STATUS_DATA.forEach(c => {
  const name = c.country || c.id;

  // Status enum
  if (validCountryStatuses.includes(c.status)) pass(`${name}: valid status`);
  else fail(`${name}: invalid status "${c.status}" — must be one of: ${validCountryStatuses.join(', ')}`);

  // Required arrays
  if (Array.isArray(c.events) && c.events.length > 0) pass(`${name}: events present`);
  else fail(`${name}: events[] missing or empty`);

  if (Array.isArray(c.infrastructure) && c.infrastructure.length > 0) pass(`${name}: infrastructure present`);
  else fail(`${name}: infrastructure[] missing or empty`);

  if (Array.isArray(c.sources) && c.sources.length > 0) pass(`${name}: sources present`);
  else fail(`${name}: sources[] missing or empty — must have at least 1 source`);

  // Source URLs
  if (c.sources && c.sources.some(s => s.url)) pass(`${name}: has source URLs`);
  else fail(`${name}: no source URLs found`);

  // Oil & Gas Impact
  if (c.oilGasImpact) {
    if (validImpactSeverities.includes(c.oilGasImpact.severity)) pass(`${name}: valid impact severity`);
    else fail(`${name}: invalid impact severity "${c.oilGasImpact.severity}"`);
  } else {
    fail(`${name}: oilGasImpact missing`);
  }

  // Production object
  if (!c.production) {
    fail(`${name}: production object missing`);
    return;
  }

  const p = c.production;

  if (!p.oil) fail(`${name}: production.oil missing`);
  if (!p.gas) fail(`${name}: production.gas missing`);
  if (!p.refining) fail(`${name}: production.refining missing`);

  // Production notes
  if (!p.notes) {
    fail(`${name}: production.notes missing`);
  } else {
    if (!p.notes.oil) fail(`${name}: production.notes.oil missing`);
    if (!p.notes.gas) fail(`${name}: production.notes.gas missing`);
    if (!p.notes.refining) fail(`${name}: production.notes.refining missing`);
  }

  // Refining math: capacity - affected ≈ available (within 5%)
  if (p.refining) {
    const expected = p.refining.capacity - p.refining.affected;
    const diff = Math.abs(expected - p.refining.available);
    const tolerance = p.refining.capacity * 0.05 + 1;
    if (diff <= tolerance) pass(`${name}: refining math OK`);
    else fail(`${name}: refining math WRONG: ${p.refining.capacity} - ${p.refining.affected} = ${expected}, but available = ${p.refining.available}`);
  }

  // Petrochemicals math (only validated once capacity > 0; baseline seeding pending)
  if (p.petrochemicals && p.petrochemicals.capacity > 0) {
    const expected = p.petrochemicals.capacity - p.petrochemicals.affected;
    const diff = Math.abs(expected - p.petrochemicals.available);
    const tolerance = p.petrochemicals.capacity * 0.05 + 1;
    if (diff <= tolerance) pass(`${name}: petrochemicals math OK`);
    else fail(`${name}: petrochemicals math WRONG: ${p.petrochemicals.capacity} - ${p.petrochemicals.affected} = ${expected}, but available = ${p.petrochemicals.available}`);
  }

  // current <= preWar for oil and gas
  if (p.oil && p.oil.current > p.oil.preWar) {
    fail(`${name}: oil current (${p.oil.current}) > preWar (${p.oil.preWar})`);
  }
  if (p.gas && p.gas.current > p.gas.preWar) {
    fail(`${name}: gas current (${p.gas.current}) > preWar (${p.gas.preWar})`);
  }

  // assetImpact name-match: every name in event.assetImpact must exist in country.infrastructure[].name
  const infraNames = new Set((c.infrastructure || []).map(i => i.name));
  (c.events || []).forEach((evt, idx) => {
    if (!Array.isArray(evt.assetImpact) || evt.assetImpact.length === 0) return;
    evt.assetImpact.forEach(assetName => {
      if (infraNames.has(assetName)) {
        pass(`${name}: event[${idx}] assetImpact "${assetName}" matches infrastructure`);
      } else {
        fail(`${name}: event[${idx}] ("${(evt.title || '').substring(0, 50)}") assetImpact "${assetName}" does NOT match any infrastructure[].name — check spelling or add the asset`);
      }
    });
  });
});

// ---------- 5. Pre-war baselines locked ----------
const preWarChecks = [
  { id: 'qatar', field: 'oil', expected: 1220 },
  { id: 'qatar', field: 'gas', expected: 18.5 },
  { id: 'qatar', field: 'lng', expected: 77.0 },
  { id: 'kuwait', field: 'oil', expected: 2600 },
  { id: 'kuwait', field: 'gas', expected: 1.7 },
  { id: 'saudi_arabia', field: 'oil', expected: 10400 },
  { id: 'saudi_arabia', field: 'gas', expected: 11.3 },
  { id: 'uae', field: 'oil', expected: 3400 },
  { id: 'uae', field: 'gas', expected: 6.5 },
  { id: 'uae', field: 'lng', expected: 6.0 },
  { id: 'iraq', field: 'oil', expected: 4300 },
  { id: 'iraq', field: 'gas', expected: 3.0 },
  { id: 'bahrain', field: 'oil', expected: 196 },
  { id: 'bahrain', field: 'gas', expected: 1.6 },
  { id: 'oman', field: 'oil', expected: 1024 },
  { id: 'oman', field: 'gas', expected: 4.2 },
  { id: 'oman', field: 'lng', expected: 10.4 },
  { id: 'israel', field: 'gas', expected: 3.0 },
  { id: 'iran', field: 'oil', expected: 3176 },
  { id: 'iran', field: 'gas', expected: 25.8 },
];

preWarChecks.forEach(({ id, field, expected }) => {
  const c = COUNTRY_STATUS_DATA.find(x => x.id === id);
  if (!c || !c.production || !c.production[field]) {
    fail(`PreWar lock: ${id}.${field} not found`);
    return;
  }
  const val = c.production[field].preWar;
  if (val === expected) pass(`PreWar lock: ${id}.${field} = ${val}`);
  else fail(`PreWar lock VIOLATED: ${id}.${field}.preWar = ${val}, expected ${expected}`);
});

// Also check refining capacity (these are also baselines)
const refCapChecks = [
  { id: 'qatar', expected: 443 },
  { id: 'kuwait', expected: 1400 },
  { id: 'saudi_arabia', expected: 3291 },
  { id: 'uae', expected: 1222 },
  { id: 'iraq', expected: 1300 },
  { id: 'bahrain', expected: 405 },
  { id: 'oman', expected: 222 },
  { id: 'israel', expected: 197 },
  { id: 'iran', expected: 2600 },
];

refCapChecks.forEach(({ id, expected }) => {
  const c = COUNTRY_STATUS_DATA.find(x => x.id === id);
  if (!c || !c.production || !c.production.refining) return;
  const val = c.production.refining.capacity;
  if (val === expected) pass(`RefCap lock: ${id} = ${val}`);
  else fail(`RefCap lock VIOLATED: ${id}.refining.capacity = ${val}, expected ${expected}`);
});

// ---------- 6. FM Declarations validation ----------
const validFMStatuses = ['active', 'partially_lifted', 'lifted', 'extended'];

if (!Array.isArray(FM_DECLARATIONS_DATA) || FM_DECLARATIONS_DATA.length === 0) {
  fail('FM_DECLARATIONS_DATA is empty or missing');
} else {
  pass(`FM_DECLARATIONS_DATA: ${FM_DECLARATIONS_DATA.length} entries`);

  // Check for duplicate IDs
  const fmIds = FM_DECLARATIONS_DATA.map(d => d.id);
  const uniqueFmIds = new Set(fmIds);
  if (uniqueFmIds.size === fmIds.length) pass('No duplicate FM IDs');
  else fail(`Duplicate FM IDs found`);

  FM_DECLARATIONS_DATA.forEach(item => {
    const label = item.id || item.company;
    if (!item.id) fail(`FM: missing id on "${item.company}"`);
    if (!item.company) fail(`FM ${item.id}: missing company`);
    if (!item.date) fail(`FM ${item.id}: missing date`);
    if (!validFMStatuses.includes(item.status)) {
      fail(`FM ${label}: invalid status "${item.status}" — must be one of: ${validFMStatuses.join(', ')}`);
    }
    if (!item.details) {
      fail(`FM ${label}: missing details object`);
    } else {
      if (!item.details.volumeAffected) fail(`FM ${label}: missing details.volumeAffected`);
      if (!item.details.commodity) fail(`FM ${label}: missing details.commodity`);
    }
    if (!Array.isArray(item.sources) || item.sources.length === 0) {
      fail(`FM ${label}: missing sources[]`);
    } else if (!item.sources.some(s => s.url)) {
      fail(`FM ${label}: no source URLs`);
    }
  });
}

// ---------- 7. Shutdowns validation ----------
const validShutdownStatuses = [
  'ongoing', 'resumed', 'partial', 'planned', 'shutdown', 'halted',
  'struck', 'suspended', 'operational', 'restarted', 'fm_declared',
  'contained', 'partially_resumed'
];

if (!Array.isArray(SHUTDOWNS_NO_FM_DATA) || SHUTDOWNS_NO_FM_DATA.length === 0) {
  fail('SHUTDOWNS_NO_FM_DATA is empty or missing');
} else {
  pass(`SHUTDOWNS_NO_FM_DATA: ${SHUTDOWNS_NO_FM_DATA.length} entries`);

  // Check for duplicate IDs
  const sdIds = SHUTDOWNS_NO_FM_DATA.map(d => d.id);
  const uniqueSdIds = new Set(sdIds);
  if (uniqueSdIds.size === sdIds.length) pass('No duplicate shutdown IDs');
  else fail(`Duplicate shutdown IDs found`);

  SHUTDOWNS_NO_FM_DATA.forEach(item => {
    const label = item.id || item.company;
    if (!item.id) fail(`Shutdown: missing id on "${item.company}"`);
    if (!item.company) fail(`Shutdown ${item.id}: missing company`);
    if (!item.date) fail(`Shutdown ${item.id}: missing date`);
    if (!validShutdownStatuses.includes(item.status)) {
      fail(`Shutdown ${label}: invalid status "${item.status}" — must be one of: ${validShutdownStatuses.join(', ')}`);
    }
    if (!item.details) {
      fail(`Shutdown ${label}: missing details object`);
    } else {
      if (!item.details.volumeAffected) fail(`Shutdown ${label}: missing details.volumeAffected`);
      if (!item.details.commodity) fail(`Shutdown ${label}: missing details.commodity`);
    }
    if (!Array.isArray(item.sources) || item.sources.length === 0) {
      fail(`Shutdown ${label}: missing sources[]`);
    } else if (!item.sources.some(s => s.url)) {
      fail(`Shutdown ${label}: no source URLs`);
    }
  });
}

// ---------- 8. WAR_RISK_PREMIUM_DATA validation ----------
if (WAR_RISK_PREMIUM_DATA) {
  if (Array.isArray(WAR_RISK_PREMIUM_DATA.history) && WAR_RISK_PREMIUM_DATA.history.length > 0) {
    pass(`WAR_RISK_PREMIUM_DATA: ${WAR_RISK_PREMIUM_DATA.history.length} entries`);
  } else {
    fail('WAR_RISK_PREMIUM_DATA.history missing or empty');
  }

  if (WAR_RISK_PREMIUM_DATA.current && typeof WAR_RISK_PREMIUM_DATA.current.rate === 'number') {
    pass('WAR_RISK_PREMIUM_DATA.current.rate is a number');
  } else {
    fail('WAR_RISK_PREMIUM_DATA.current.rate missing or not a number');
  }

  if (WAR_RISK_PREMIUM_DATA.lastUpdated) {
    const awrpDate = new Date(WAR_RISK_PREMIUM_DATA.lastUpdated);
    if (isNaN(awrpDate.getTime())) {
      fail(`WAR_RISK_PREMIUM_DATA.lastUpdated is not a valid date: "${WAR_RISK_PREMIUM_DATA.lastUpdated}"`);
    } else {
      pass('WAR_RISK_PREMIUM_DATA.lastUpdated is a valid date');
    }
  } else {
    fail('WAR_RISK_PREMIUM_DATA.lastUpdated missing');
  }
} else {
  fail('WAR_RISK_PREMIUM_DATA not found in data.js');
}

// ---------- 9. Global disruption totals cross-check ----------
function sumOffline(getter) {
  return COUNTRY_STATUS_DATA.reduce((acc, c) => {
    const val = getter(c);
    return acc + (typeof val === 'number' && !isNaN(val) ? val : 0);
  }, 0);
}

const totals = {
  oilOffline:       sumOffline(c => c.production?.oil       ? c.production.oil.preWar - c.production.oil.current : 0),
  gasOffline:       sumOffline(c => c.production?.gas       ? c.production.gas.preWar - c.production.gas.current : 0),
  refiningOffline:  sumOffline(c => c.production?.refining?.affected || 0),
  lngOffline:       sumOffline(c => c.production?.lng       ? c.production.lng.preWar - c.production.lng.current : 0),
  petchemOffline:   sumOffline(c => c.production?.petrochemicals?.affected || 0),
};

console.log('\n===== GLOBAL DISRUPTION TOTALS =====');
console.log('Commodity        |      Sum | Expected range   | Status');
console.log('-----------------+----------+------------------+--------');
Object.entries(EXPECTED_TOTALS).forEach(([key, range]) => {
  const sum = totals[key];
  const sumStr = (Math.round(sum * 10) / 10).toString().padStart(8);
  const rangeStr = `${range.min}-${range.max} ${range.unit}`.padEnd(17);
  const inRange = sum >= range.min && sum <= range.max;
  const tag = inRange ? 'OK' : 'WARN';
  if (inRange) pass(`Totals: ${key} in expected range`);
  else warn(`Totals: ${key} = ${sum} ${range.unit} outside expected ${range.min}-${range.max}`);
  console.log(`${key.padEnd(16)} | ${sumStr} | ${rangeStr} | ${tag}`);
});

// ---------- 10. FM vs severity consistency check ----------
const activeFMCount = (FM_DECLARATIONS_DATA || []).filter(f => f.status === 'active').length;
const criticalCountries = COUNTRY_STATUS_DATA.filter(c => c.oilGasImpact?.severity === 'critical').length;
if (activeFMCount >= criticalCountries) {
  pass(`FM/Severity: ${activeFMCount} active FMs ≥ ${criticalCountries} critical-severity countries`);
} else {
  warn(`FM/Severity: only ${activeFMCount} active FMs but ${criticalCountries} countries at critical severity — investigate`);
}

// ---------- 11. PIPELINE_STATUS_DATA validation ----------
const EXPECTED_DATASETS = new Set([
  'china_crude', 'iraq_crude', 'russia_crude', 'saudi_arabia_crude',
  'iran_crude', 'uae_crude', 'kuwait_crude', 'qatar_crude', 'bahrain_crude', 'oman_crude',
]);
const VALID_PIPE_STATUS = new Set(['operational', 'reduced', 'offline']);
if (!Array.isArray(PIPELINE_STATUS_DATA)) {
  fail('PIPELINE_STATUS_DATA: missing or not an array');
} else {
  const seenIds = new Set();
  PIPELINE_STATUS_DATA.forEach((p, i) => {
    const ctx = `PIPELINE_STATUS_DATA[${i}] (${p.id || 'no-id'})`;
    if (!p.id) fail(`${ctx}: missing id`);
    else if (seenIds.has(p.id)) fail(`${ctx}: duplicate id "${p.id}"`);
    else seenIds.add(p.id);
    if (!p.label) fail(`${ctx}: missing label`);
    if (!p.dataset) fail(`${ctx}: missing dataset`);
    else if (!EXPECTED_DATASETS.has(p.dataset)) warn(`${ctx}: dataset "${p.dataset}" not in expected list`);
    if (p.direction !== 'import' && p.direction !== 'export') fail(`${ctx}: direction must be import|export`);
    if (!p.supplierCountry) fail(`${ctx}: missing supplierCountry`);
    if (typeof p.capacity !== 'number' || p.capacity <= 0) fail(`${ctx}: capacity must be positive number`);
    if (typeof p.currentThroughput !== 'number' || p.currentThroughput < 0) fail(`${ctx}: currentThroughput must be >= 0`);
    if (p.currentThroughput > p.capacity) fail(`${ctx}: currentThroughput (${p.currentThroughput}) exceeds capacity (${p.capacity})`);
    if (!VALID_PIPE_STATUS.has(p.status)) fail(`${ctx}: status must be one of ${[...VALID_PIPE_STATUS].join('|')}`);
    if (!p.start || isNaN(new Date(p.start).getTime())) fail(`${ctx}: invalid start date "${p.start}"`);
    if (!Array.isArray(p.sources) || p.sources.length === 0) fail(`${ctx}: sources must be non-empty array`);
    else p.sources.forEach((s, j) => {
      if (!s.url || !/^https?:\/\//.test(s.url)) fail(`${ctx}.sources[${j}]: invalid url`);
      if (!s.name) fail(`${ctx}.sources[${j}]: missing name`);
    });
  });
  if (fails === 0 || PIPELINE_STATUS_DATA.length > 0) pass(`PIPELINE_STATUS_DATA: ${PIPELINE_STATUS_DATA.length} entries`);
}

// ---------- Market Prices Seed Validation ----------
const seedPath = path.resolve(__dirname, '..', 'market-prices-seed.json');
if (fs.existsSync(seedPath)) {
  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    if (!seed.prices || typeof seed.prices !== 'object') {
      fail('market-prices-seed: missing `prices` object');
    } else {
      const keys = Object.keys(seed.prices);
      pass(`market-prices-seed: ${keys.length} commodities present`);
      for (const [key, p] of Object.entries(seed.prices)) {
        const ctx = `market-prices-seed.prices.${key}`;
        if (typeof p.current !== 'number' || !Number.isFinite(p.current)) {
          fail(`${ctx}: current not a finite number`);
        }
        if (!Array.isArray(p.history) || p.history.length < 1) {
          fail(`${ctx}: history must be non-empty array`);
          continue;
        }
        // Check sorted ascending by date + no NaN prices
        for (let i = 0; i < p.history.length; i++) {
          const h = p.history[i];
          if (!h.date || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) {
            fail(`${ctx}: history[${i}] invalid date "${h.date}"`); break;
          }
          if (typeof h.price !== 'number' || !Number.isFinite(h.price)) {
            fail(`${ctx}: history[${i}] price not a finite number`); break;
          }
          if (i > 0 && h.date < p.history[i-1].date) {
            fail(`${ctx}: history not sorted at index ${i}`); break;
          }
        }
      }
    }
  } catch (e) {
    fail(`market-prices-seed.json: ${e.message}`);
  }
}

// ---------- Murban History Validation ----------
const murbanPath = path.resolve(__dirname, '..', 'murban-history.json');
if (fs.existsSync(murbanPath)) {
  try {
    const murban = JSON.parse(fs.readFileSync(murbanPath, 'utf8'));
    if (!Array.isArray(murban.history) || murban.history.length < 100) {
      fail(`murban-history: expected >= 100 entries (got ${murban.history?.length || 0})`);
    } else {
      pass(`murban-history: ${murban.history.length} entries from ${murban.source || 'unknown'}`);
    }
  } catch (e) {
    fail(`murban-history.json: ${e.message}`);
  }
}

// ---------- Market Insights Validation ----------
const insightsPath = path.resolve(__dirname, '..', 'market-insights.json');
if (fs.existsSync(insightsPath)) {
  try {
    const ins = JSON.parse(fs.readFileSync(insightsPath, 'utf8'));
    if (!Array.isArray(ins.insights)) {
      fail('market-insights: missing `insights` array');
    } else if (ins.insights.length < 3 || ins.insights.length > 5) {
      fail(`market-insights: expected 3-5 insights (got ${ins.insights.length})`);
    } else {
      const VALID_TYPE = new Set(['top_mover','spread','cross','anomaly','trend','correlation_break']);
      const VALID_SEV = new Set(['info','bullish','bearish','warning']);
      ins.insights.forEach((entry, i) => {
        const ctx = `market-insights.insights[${i}]`;
        if (!VALID_TYPE.has(entry.type)) fail(`${ctx}: invalid type "${entry.type}"`);
        if (!VALID_SEV.has(entry.severity)) fail(`${ctx}: invalid severity "${entry.severity}"`);
        if (!entry.title || entry.title.length > 100) fail(`${ctx}: title missing or > 100 chars`);
        if (entry.detail && entry.detail.length > 180) fail(`${ctx}: detail > 180 chars`);
      });
      pass(`market-insights: ${ins.insights.length} valid insights`);
    }
  } catch (e) {
    fail(`market-insights.json: ${e.message}`);
  }
}

// ---------- Summary ----------
console.log('\n===== DATA VALIDATION =====');
console.log(`Total: ${passes + fails} checks | PASS: ${passes} | FAIL: ${fails} | WARN: ${warns}\n`);

if (warns > 0) {
  warnings.forEach(w => console.warn(`  [WARN] ${w}`));
  console.log('');
}

if (fails > 0) {
  errors.forEach(e => console.error(`  [FAIL] ${e}`));
  console.error(`\n  ${fails} CHECK(S) FAILED — do NOT commit data.js\n`);
  process.exit(1);
} else {
  console.log('  ALL CHECKS PASSED' + (warns > 0 ? ` (${warns} warnings)` : '') + '\n');
  process.exit(0);
}
