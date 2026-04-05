const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/rahul/Documents/adnoc-fm-monitor/soh-data/.premium-sources.json', 'utf8'));
console.log('=== S&P GLOBAL CONTENT ===');
console.log(d.spglobal.content);
