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
const errors = [];

function pass(msg) { passes++; }
function fail(msg) { fails++; errors.push(msg); }

// ---------- 1. JS Syntax Check ----------
try {
  // data.js uses const declarations — we need to eval it in a sandbox
  const code = fs.readFileSync(dataPath, 'utf8');
  // Wrap in a function to avoid polluting scope, and extract the consts
  const wrapped = `(function() { ${code}; return { LAST_UPDATED, COUNTRY_STATUS_DATA, FM_DECLARATIONS_DATA, SHUTDOWNS_NO_FM_DATA, WAR_RISK_PREMIUM_DATA }; })()`;
  var data = eval(wrapped);
  pass('JS syntax valid');
} catch (e) {
  fail(`JS syntax error: ${e.message}`);
  console.error('\n===== VALIDATION FAILED =====');
  console.error(`  [FAIL] JS syntax error: ${e.message}`);
  console.error('\nFix the syntax error in data.js before committing.');
  process.exit(1);
}

const { LAST_UPDATED, COUNTRY_STATUS_DATA, FM_DECLARATIONS_DATA, SHUTDOWNS_NO_FM_DATA, WAR_RISK_PREMIUM_DATA } = data;

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

  // current <= preWar for oil and gas
  if (p.oil && p.oil.current > p.oil.preWar) {
    fail(`${name}: oil current (${p.oil.current}) > preWar (${p.oil.preWar})`);
  }
  if (p.gas && p.gas.current > p.gas.preWar) {
    fail(`${name}: gas current (${p.gas.current}) > preWar (${p.gas.preWar})`);
  }
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

// ---------- Summary ----------
console.log('\n===== DATA VALIDATION =====');
console.log(`Total: ${passes + fails} checks | PASS: ${passes} | FAIL: ${fails}\n`);

if (fails > 0) {
  errors.forEach(e => console.error(`  [FAIL] ${e}`));
  console.error(`\n  ${fails} CHECK(S) FAILED — do NOT commit data.js\n`);
  process.exit(1);
} else {
  console.log('  ALL CHECKS PASSED\n');
  process.exit(0);
}
