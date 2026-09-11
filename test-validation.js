const { parseCSVToRows } = require('./src/utils/csvParser.ts');
// Actually, it's easier to just run the logic directly
const csvText = `"Student Name","Gender","Class Level","Home State","Major","Extracurricular Activity"
"Alexandra","Female","4. Senior","CA","English","Drama Club"`;

function parseCSV(text) {
  return text.split('\n').map(r => r.split(','));
}
const rows = parseCSV(csvText);
const headerRow = rows[0].join(' ').toLowerCase();
console.log('headerRow:', headerRow);
const isValid = (headerRow.includes('dish name') || headerRow.includes('meal id') || headerRow.includes('ingredient'));
console.log('isValid:', isValid);
