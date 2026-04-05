const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/rahul/Documents/adnoc-fm-monitor/soh-data/.premium-sources.json', 'utf8'));

console.log('=== RYSTAD CONTENT ===');
console.log(d.rystad.content);
console.log('\n=== KPLER CONTENT ===');
console.log(d.kpler.content);
