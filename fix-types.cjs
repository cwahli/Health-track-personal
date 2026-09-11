const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf-8');
appTsx = appTsx.replace('const pm = prevMap.get(bm.mealId) || initialMap.get(bm.mealId);', 'const pm: any = prevMap.get(bm.mealId) || initialMap.get(bm.mealId);');
fs.writeFileSync('src/App.tsx', appTsx);

let csvParser = fs.readFileSync('src/utils/csvParser.ts', 'utf-8');
csvParser = csvParser.replace(
  "      water: getNum(row, 'water', 'moisture'),\n      choline: getNum(row, 'choline')\n    };\n  }).filter(Boolean) as MealLogRow[];",
  "      water: getNum(row, 'water', 'moisture'),\n      choline: getNum(row, 'choline'),\n      transFat: getNum(row, 'trans fat', 'trans'),\n      addedSugars: getNum(row, 'added sugars', 'added sugar'),\n      sourceRef: getCol(row, 'source ref', 'reference', 'source')\n    };\n  }).filter(Boolean) as unknown as MealLogRow[];"
);
fs.writeFileSync('src/utils/csvParser.ts', csvParser);
