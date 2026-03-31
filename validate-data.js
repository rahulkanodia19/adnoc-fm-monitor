const code = require('fs').readFileSync('data.js','utf8').replace(/^const /gm, 'global.');
eval(code);

const baselines = {
  qatar: { oil: 1220, gas: 18.5, refCap: 443, lng: 77.0 },
  kuwait: { oil: 2600, gas: 1.7, refCap: 1400 },
  saudi_arabia: { oil: 10400, gas: 11.3, refCap: 3291 },
  uae: { oil: 3400, gas: 6.5, refCap: 1222, lng: 6.0 },
  iraq: { oil: 4300, gas: 3.0, refCap: 1300 },
  bahrain: { oil: 196, gas: 1.6, refCap: 405 },
  oman: { oil: 1024, gas: 4.2, refCap: 222, lng: 10.4 },
  israel: { oil: 0, gas: 3.0, refCap: 197 },
  iran: { oil: 3176, gas: 25.8, refCap: 2600 }
};

let errors = [];

COUNTRY_STATUS_DATA.forEach(c => {
  const b = baselines[c.id];
  if (!b) { errors.push('Unknown country: ' + c.id); return; }
  if (c.production.oil.preWar !== b.oil) errors.push(c.id + ' oil preWar: ' + c.production.oil.preWar + ' vs ' + b.oil);
  if (c.production.gas.preWar !== b.gas) errors.push(c.id + ' gas preWar: ' + c.production.gas.preWar + ' vs ' + b.gas);
  if (c.production.refining.capacity !== b.refCap) errors.push(c.id + ' refCap: ' + c.production.refining.capacity + ' vs ' + b.refCap);
  if (b.lng && (!c.production.lng || c.production.lng.preWar !== b.lng)) errors.push(c.id + ' lng preWar mismatch');

  const notes = c.production.notes;
  if (!notes) { errors.push(c.id + ' missing production.notes'); return; }
  if (!notes.oil) errors.push(c.id + ' missing notes.oil');
  if (!notes.gas) errors.push(c.id + ' missing notes.gas');
  if (!notes.refining) errors.push(c.id + ' missing notes.refining');
  if (!notes.ports) errors.push(c.id + ' missing notes.ports');

  const ref = c.production.refining;
  if (Math.abs(ref.capacity - ref.affected - ref.available) > 5) {
    errors.push(c.id + ' refining math: ' + ref.capacity + ' - ' + ref.affected + ' != ' + ref.available);
  }

  if (!c.events || !c.infrastructure || !c.oilGasImpact || !c.sources) {
    errors.push(c.id + ' missing events/infrastructure/oilGasImpact/sources');
  }
});

// Infrastructure baseline check — critical items that must always be present
const infraBaselines = {
  qatar: ['North Field', 'Pearl GTL', 'Qatalum Smelter', 'QAFCO Fertilizer Complex', 'Mesaieed Industrial City', 'Hamad Port', 'Umm Al Houl Power'],
  kuwait: ['Greater Burgan (Burgan/Magwa/Ahmadi)', 'Mina Al-Ahmadi Refinery', 'Subiya Power Plant', 'EQUATE Petrochemical Complex', 'Kafco Fuel Storage', 'Az-Zour South Power & Desalination'],
  saudi_arabia: ['Ghawar Field', 'Abqaiq Processing', 'Ras Tanura Refinery', 'SABIC Yanbu Complex', 'SABIC Jubail Petrochemical Complex', 'Ma\'aden Aluminium Complex', 'East-West Pipeline', 'Ras Al-Khair IWPP'],
  uae: ['Upper Zakum Field', 'Ruwais Refinery Complex', 'Habshan Gas Processing', 'EGA Al Taweelah Smelter', 'EGA Jebel Ali Smelter', 'Borouge Petrochemical Complex', 'Fujairah Oil Terminal', 'Jebel Ali Power & Desalination Complex', 'Taweelah Power & Desalination Complex'],
  iraq: ['Rumaila Field', 'Basra Oil Terminal', 'Baiji Refinery', 'Besmaya Power Plant'],
  bahrain: ['BAPCO Sitra Refinery', 'Alba Aluminium Smelter', 'Al Dur IWPP'],
  oman: ['PDO Fields (Block 6)', 'Oman LNG (Qalhat)', 'Sohar Aluminium', 'Sohar Refinery', 'Barka IWPP'],
  israel: ['Leviathan Gas Field', 'Tamar Gas Field'],
  iran: ['Kharg Island Terminal', 'Bandar Imam Petrochemical Complex', 'Tehran Refinery', 'Goreh-Jask Pipeline', 'Isfahan Thermal Power Plant']
};

COUNTRY_STATUS_DATA.forEach(c => {
  const required = infraBaselines[c.id];
  if (!required) return;
  const names = (c.infrastructure || []).map(i => i.name);
  required.forEach(item => {
    if (!names.includes(item)) errors.push(c.id + ' missing required infrastructure: ' + item);
  });
});

FM_DECLARATIONS_DATA.forEach(fm => {
  if (!fm.id || !fm.company || !fm.date || !fm.status || !fm.details || !fm.sources) {
    errors.push('FM ' + fm.id + ' missing required fields');
  }
  if (fm.details && !fm.details.volumeAffected) errors.push('FM ' + fm.id + ' missing volumeAffected');
  if (fm.details && !fm.details.commodity) errors.push('FM ' + fm.id + ' missing commodity');
});

SHUTDOWNS_NO_FM_DATA.forEach(sd => {
  if (!sd.id || !sd.company || !sd.date || !sd.status || !sd.details || !sd.sources) {
    errors.push('SD ' + sd.id + ' missing required fields');
  }
  if (sd.details && !sd.details.volumeAffected) errors.push('SD ' + sd.id + ' missing volumeAffected');
  if (sd.details && !sd.details.commodity) errors.push('SD ' + sd.id + ' missing commodity');
});

if (errors.length) {
  console.log('VALIDATION ERRORS (' + errors.length + '):');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
} else {
  console.log('ALL VALIDATIONS PASSED');
  console.log('Countries: ' + COUNTRY_STATUS_DATA.length);
  console.log('FM Declarations: ' + FM_DECLARATIONS_DATA.length);
  console.log('Shutdowns: ' + SHUTDOWNS_NO_FM_DATA.length);
}
