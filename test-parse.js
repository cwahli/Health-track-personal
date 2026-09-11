const fs = require('fs');
const content = fs.readFileSync('src/utils/csvParser.ts', 'utf-8');
console.log(content.includes("CSV does not look like a meal log tab"));
