const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/rahul/Documents/adnoc-fm-monitor/soh-data/.premium-sources.json', 'utf8'));
console.log('Keys:', JSON.stringify(Object.keys(d)));
for (const k of Object.keys(d)) {
  const v = d[k];
  if (typeof v === 'object' && v !== null) {
    console.log(k + ': status=' + v.status + ' contentLen=' + (v.content ? v.content.length : 0));
    if (v.content) console.log('  CONTENT_START: ' + v.content.substring(0, 300));
  } else {
    console.log(k + ': ' + String(v).substring(0, 200));
  }
}
