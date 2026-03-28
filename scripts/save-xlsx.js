// Usage: node scripts/save-xlsx.js <target-dir> <filename>
// Reads base64 from .tmp-b64.txt, decodes to binary, saves to <target-dir>/<filename>
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const filename = process.argv[3];
const b64File = path.join(__dirname, '..', '.tmp-b64.txt');

const b64 = fs.readFileSync(b64File, 'utf8').trim();
const buf = Buffer.from(b64, 'base64');
const targetPath = path.join(__dirname, '..', dir, filename);
fs.writeFileSync(targetPath, buf);
console.log(`OK ${buf.length} bytes -> ${targetPath}`);
