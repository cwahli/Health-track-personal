import React, { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { parseMealLogCSV, buildMealsFromSheetRows } from './src/utils/csvParser';

const csv = `"Student Name","Gender"
"Andrew","Male"`;
const rows = parseMealLogCSV(csv);
const built = buildMealsFromSheetRows(rows);
console.log('Built meals length:', built.length);
