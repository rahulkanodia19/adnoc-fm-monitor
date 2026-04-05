const fs = require('fs');

// Load previous data
const prev = JSON.parse(fs.readFileSync('C:/Users/rahul/Documents/adnoc-fm-monitor/data-previous.json', 'utf8'));

// Load current data by requiring it
const dataContent = fs.readFileSync('C:/Users/rahul/Documents/adnoc-fm-monitor/data.js', 'utf8');

// Extract arrays using regex-based extraction
function extractArray(content, varName) {
  const startIdx = content.indexOf('const ' + varName + ' = [');
  if (startIdx === -1) return null;
  let depth = 0;
  let start = content.indexOf('[', startIdx);
  for (let i = start; i < content.length; i++) {
    if (content[i] === '[') depth++;
    if (content[i] === ']') depth--;
    if (depth === 0) {
      try {
        // Use Function constructor to eval safely
        return (new Function('return ' + content.substring(start, i + 1)))();
      } catch(e) {
        console.log('Parse error for', varName, e.message);
        return null;
      }
    }
  }
  return null;
}

const countries = extractArray(dataContent, 'COUNTRY_STATUS_DATA');
const fms = extractArray(dataContent, 'FM_DECLARATIONS_DATA');
const shutdowns = extractArray(dataContent, 'SHUTDOWNS_NO_FM_DATA');

let issues = 0;

if (!countries) { console.log('ERROR: Could not parse COUNTRY_STATUS_DATA'); process.exit(1); }
if (!fms) { console.log('ERROR: Could not parse FM_DECLARATIONS_DATA'); process.exit(1); }
if (!shutdowns) { console.log('ERROR: Could not parse SHUTDOWNS_NO_FM_DATA'); process.exit(1); }

// Check country summaries not shorter
prev.countryStatus.forEach(pc => {
  const nc = countries.find(c => c.id === pc.id);
  if (!nc) { console.log('MISSING country:', pc.id); issues++; return; }
  if (nc.summary.length < pc.summary.length) {
    console.log('SHORTER summary for', pc.id, ':', pc.summary.length, '->', nc.summary.length);
    issues++;
  }
  if (nc.sources.length < pc.sources.length) {
    console.log('FEWER sources for', pc.id, ':', pc.sources.length, '->', nc.sources.length);
    issues++;
  }
  if (nc.events.length < pc.events.length) {
    console.log('FEWER events for', pc.id, ':', pc.events.length, '->', nc.events.length);
    issues++;
  }
});

// Check FM count
if (fms.length < prev.fmDeclarations.length) {
  console.log('FEWER FM declarations:', prev.fmDeclarations.length, '->', fms.length);
  issues++;
}

// Check shutdown count
if (shutdowns.length < prev.shutdowns.length) {
  console.log('FEWER shutdowns:', prev.shutdowns.length, '->', shutdowns.length);
  issues++;
}

console.log('---');
console.log('Countries:', countries.length);
console.log('FM declarations:', fms.length, '(prev:', prev.fmDeclarations.length + ')');
console.log('Shutdowns:', shutdowns.length, '(prev:', prev.shutdowns.length + ')');
console.log('Issues found:', issues);

if (issues === 0) {
  console.log('DATA LOSS CHECK: PASSED');
} else {
  console.log('DATA LOSS CHECK: FAILED - fix issues above');
}
