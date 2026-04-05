const fs = require('fs');
const prev = JSON.parse(fs.readFileSync('data-previous.json', 'utf8'));
const content = fs.readFileSync('data.js', 'utf8');
const fn = new Function(content + '; return { COUNTRY_STATUS_DATA, FM_DECLARATIONS_DATA, SHUTDOWNS_NO_FM_DATA };');
const curr = fn();

console.log('=== DATA LOSS CHECK ===');
prev.countryStatus.forEach(p => {
  const c = curr.COUNTRY_STATUS_DATA.find(x => x.id === p.id);
  if (!c) { console.log('ERROR: Missing ' + p.id); return; }
  const sl = c.summary.length - p.summary.length;
  console.log(p.id + ': summary ' + (sl >= 0 ? 'OK +' + sl : 'LOST ' + sl) +
    ', sources ' + (c.sources.length >= p.sources.length ? 'OK' : 'LOST') + ' (' + p.sources.length + '->' + c.sources.length + ')' +
    ', events ' + (c.events.length >= p.events.length ? 'OK' : 'LOST') + ' (' + p.events.length + '->' + c.events.length + ')');
});
console.log('FM: ' + (curr.FM_DECLARATIONS_DATA.length >= prev.fmDeclarations.length ? 'OK' : 'LOST') + ' (' + prev.fmDeclarations.length + '->' + curr.FM_DECLARATIONS_DATA.length + ')');
console.log('Shutdowns: ' + (curr.SHUTDOWNS_NO_FM_DATA.length >= prev.shutdowns.length ? 'OK' : 'LOST') + ' (' + prev.shutdowns.length + '->' + curr.SHUTDOWNS_NO_FM_DATA.length + ')');
console.log('=== DONE ===');
