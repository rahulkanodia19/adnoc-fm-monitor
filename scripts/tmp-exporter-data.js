const d = require('../flow-summary.json');
const prefixes = ['saudi_arabia','uae','iraq','qatar','oman','russia','us','australia','iran','kuwait','bahrain'];
const suffixes = ['kero_jet','gasoil_diesel','gasoline','naphtha','sulphur'];
for (const p of prefixes) {
  for (const s of suffixes) {
    const k = p + '_' + s;
    const v = d[k];
    if (!v) continue;
    const ts = v.weeks.map(w => w.total);
    if (ts.every(t => t === 0)) {
      console.log(k + ': ALL ZERO');
      continue;
    }
    console.log(k + ' (' + v.direction + ', ' + v.unit + '):');
    v.weeks.forEach(w => {
      const cc = Object.entries(w.allCountries).map(([c, vol]) => c.substring(0, 14) + ':' + Math.round(vol)).join(', ');
      console.log('  ' + w.start.substring(5) + ' t=' + w.total + ' ' + cc);
    });
  }
}
