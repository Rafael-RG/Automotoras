const fs = require('fs');
const content = fs.readFileSync('src/assets/Logo.svg', 'utf8');
const idx = content.indexOf('data:image/png;base64,');
if (idx === -1) { console.log('No PNG found'); process.exit(1); }
const start = idx + 'data:image/png;base64,'.length;
// find the end (next quote or whitespace)
let end = start;
while (end < content.length && content[end] !== '"' && content[end] !== "'" && content[end] !== ' ') end++;
const b64 = content.slice(start, end);
const buf = Buffer.from(b64, 'base64');
fs.writeFileSync('src/assets/Logo_extracted.png', buf);
console.log('PNG extraído:', (buf.length / 1024).toFixed(0), 'KB');
