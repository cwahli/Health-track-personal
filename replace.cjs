const fs = require('fs');
let code = fs.readFileSync('src/utils/csvParser.ts', 'utf-8');

const startIndex = code.indexOf('export function parseMealLogCSV(csvText: string): MealLogRow[] {');
const endIndex = code.lastIndexOf('}'); // End of the file is right there

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
}

export function buildMealsFromSheetRows(rows: MealLogRow[]): LoggedMeal[] {
  const mealsMap = new Map<string, LoggedMeal>();
  
  rows.forEach(row => {
    // Generate a unique key for grouping components of the same meal
    const groupKey = row.mealId ? row.mealId : \`\${row.date}_\${row.mealSlot}_\${row.dishName}\`;
    
    if (!mealsMap.has(groupKey)) {
      const mealType = row.mealSlot as LoggedMeal['mealType'];
      mealsMap.set(groupKey, {
        id: \`meal-\${Date.now()}-\${Math.random().toString(36).substring(2, 9)}\`,
        mealId: row.mealId || '',
        dayKey: row.date,
        dateStr: row.date,
        mealType: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Late Night'].includes(mealType) ? mealType : 'Snack',
        time: '12:00 PM', // Default if time is unknown
        foodName: row.dishName || 'Unknown Dish',
        portion: '',
        calories: 0,
        protein: 0,
        carbs: 0,
        totalFat: 0,
        saturatedFat: 0,
        sodium: 0,
        addedSugars: 0,
        fiber: 0,
        potassium: 0,
      });
    }

    const meal = mealsMap.get(groupKey)!;
    meal.calories += row.calories || 0;
    meal.protein += row.protein || 0;
    meal.carbs += row.carbs || 0;
    meal.totalFat += row.totalFat || 0;
    meal.saturatedFat += row.saturatedFat || 0;
    meal.sodium += row.sodium || 0;
    meal.addedSugars += row.totalSugars || 0; // mapped from totalSugars
    meal.fiber += row.fiber || 0;
    meal.potassium = (meal.potassium || 0) + (row.potassium || 0);

    // Append to portion string if there's an ingredient
    if (row.ingredient && row.weightG) {
      const componentStr = \`\${row.ingredient} (\${row.weightG}g)\`;
      meal.portion = meal.portion ? \`\${meal.portion}, \${componentStr}\` : componentStr;
    } else if (row.ingredient) {
      meal.portion = meal.portion ? \`\${meal.portion}, \${row.ingredient}\` : row.ingredient;
    }
  });

  return Array.from(mealsMap.values()).sort((a, b) => {
    const timeA = new Date(\`2026-09-08 \${a.time}\`).getTime();
    const timeB = new Date(\`2026-09-08 \${b.time}\`).getTime();
    return timeB - timeA;
  });
}
`;

code = code.substring(0, startIndex) + replacement;
fs.writeFileSync('src/utils/csvParser.ts', code);
