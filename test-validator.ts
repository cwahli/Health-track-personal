import { parseMealLogCSV } from './src/utils/csvParser.js';

const csvText = `"Student Name","Gender","Class Level","Home State","Major","Extracurricular Activity","","","","","","","","","","","","","","","",""
"Alexandra","Female","4. Senior","CA","English","Drama Club","","","","","","","","","","","","","","","",""`;

const res = parseMealLogCSV(csvText);
console.log('Result length:', res.length);
console.log('Result:', JSON.stringify(res, null, 2));
