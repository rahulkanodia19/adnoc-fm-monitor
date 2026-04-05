const fs = require('fs');
const vm = require('vm');

let content = fs.readFileSync('data.js', 'utf8');
// Replace const with var so vm context can access them
content = content.replace(/^const /gm, 'var ');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(content, ctx);

const backup = {
  lastUpdated: ctx.LAST_UPDATED,
  countryStatus: ctx.COUNTRY_STATUS_DATA,
  fmDeclarations: ctx.FM_DECLARATIONS_DATA,
  shutdowns: ctx.SHUTDOWNS_NO_FM_DATA
};

fs.writeFileSync('data-previous.json', JSON.stringify(backup, null, 2));
const stats = fs.statSync('data-previous.json');
console.log('Saved:', stats.size, 'bytes');
console.log('Countries:', backup.countryStatus.length);
console.log('FM:', backup.fmDeclarations.length);
console.log('SD:', backup.shutdowns.length);
