const fs = require('fs');
let code = fs.readFileSync('src/utils/csvParser.ts', 'utf-8');

const replacement = `export function parseMealLogCSV(csvText: string): MealLogRow[] {
  const rows = parseCSVToRows(csvText);
  if (rows.length <= 1) return [];

  // Validate that this is actually the meal log tab by checking the headers
  const headerRow = rows[0].map(h => h.trim().toLowerCase());
  const headerStr = headerRow.join(' ');
  
  if (!headerStr.includes('dish name') && !headerStr.includes('meal id') && !headerStr.includes('ingredient') && !headerStr.includes('calories') && !headerStr.includes('food')) {
    console.warn('CSV does not look like a meal log tab. Returning empty rows.');
    return [];
  }

  // Create a map of column names to indices
  const colMap: Record<string, number> = {};
  headerRow.forEach((colName, index) => {
    colMap[colName] = index;
  });

  const getCol = (row: string[], ...possibleNames: string[]): string => {
    for (const name of possibleNames) {
      for (const [key, idx] of Object.entries(colMap)) {
        if (key.includes(name)) return row[idx];
      }
    }
    return '';
  };

  const getNum = (row: string[], ...possibleNames: string[]): number => {
    const val = getCol(row, ...possibleNames);
    return parseCleanNumber(val);
  };

  return rows.slice(1).map((row, i) => {
    // If we have an entirely empty row, skip it
    if (row.every(c => !c.trim())) return null;

    return {
      dishName: getCol(row, 'dish name', 'food name', 'dish'),
      mealId: getCol(row, 'meal id', 'id'),
      date: getCol(row, 'date', 'day'),
      mealSlot: getCol(row, 'meal slot', 'slot', 'type'),
      ingredient: getCol(row, 'ingredient', 'components'),
      weightG: getNum(row, 'weight (g)', 'weight', 'weight g'),
      calories: getNum(row, 'calories', 'kcal', 'energy'),
      protein: getNum(row, 'protein', 'protein (g)'),
      totalFat: getNum(row, 'total fat', 'fat', 'total fat (g)'),
      saturatedFat: getNum(row, 'saturated fat', 'sat fat', 'saturated fat (g)'),
      carbs: getNum(row, 'carbs', 'carbohydrates', 'total carbs'),
      fiber: getNum(row, 'fiber', 'dietary fiber', 'fiber (g)'),
      totalSugars: getNum(row, 'total sugars', 'sugars', 'sugar'),
      sodium: getNum(row, 'sodium', 'sodium (mg)'),
      potassium: getNum(row, 'potassium', 'potassium (mg)'),
      calcium: getNum(row, 'calcium', 'calcium (mg)'),
      iron: getNum(row, 'iron', 'iron (mg)'),
      magnesium: getNum(row, 'magnesium', 'magnesium (mg)'),
      phosphorus: getNum(row, 'phosphorus', 'phosphorus (mg)'),
      zinc: getNum(row, 'zinc', 'zinc (mg)'),
      selenium: getNum(row, 'selenium', 'selenium (mcg)', 'selenium (µg)'),
      vitaminA: getNum(row, 'vitamin a', 'vit a', 'vitamin a (mcg)', 'vitamin a (µg)'),
      vitaminC: getNum(row, 'vitamin c', 'vit c', 'vitamin c (mg)'),
      vitaminD: getNum(row, 'vitamin d', 'vit d', 'vitamin d (mcg)', 'vitamin d (µg)'),
      vitaminE: getNum(row, 'vitamin e', 'vit e', 'vitamin e (mg)'),
      vitaminK: getNum(row, 'vitamin k', 'vit k', 'vitamin k (mcg)', 'vitamin k (µg)'),
      vitaminB12: getNum(row, 'vitamin b12', 'vit b12', 'b12'),
      folate: getNum(row, 'folate', 'vitamin b9', 'b9'),
      vitaminB6: getNum(row, 'vitamin b6', 'vit b6', 'b6'),
      thiaminB1: getNum(row, 'thiamin', 'b1'),
      riboflavinB2: getNum(row, 'riboflavin', 'b2'),
      niacinB3: getNum(row, 'niacin', 'b3'),
      monounsaturatedFat: getNum(row, 'monounsaturated', 'mono fat'),
      polyunsaturatedFat: getNum(row, 'polyunsaturated', 'poly fat'),
      cholesterol: getNum(row, 'cholesterol'),
      water: getNum(row, 'water', 'moisture'),
      choline: getNum(row, 'choline')
    };
  }).filter(Boolean) as MealLogRow[];
}`;

code = code.replace(/export function parseMealLogCSV[\s\S]*?polyunsaturatedFat:\s*parseCleanNumber\(row\[33\]\),[\s\S]*?\n\s*\}\)\);/m, replacement + '\n//');
fs.writeFileSync('src/utils/csvParser.ts', code);
