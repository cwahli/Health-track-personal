const fs = require('fs');
const content = fs.readFileSync('src/utils/csvParser.ts', 'utf-8');
const match = content.match(/export function parseMealLogCSV[\s\S]*?return rows\.slice/);
console.log(match ? match[0] : 'not found');
