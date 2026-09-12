/**
 * Google Sheets Dynamic Row Mapper & Verification Engine
 * 
 * Maps clinical meal objects to Google Sheets row arrays dynamically based on
 * the spreadsheet's actual header names, preventing column misalignment regardless
 * of whether columns like "Meal Slot" exist or are omitted.
 */

export function normalizeHeader(s: string): string {
  let clean = (s || '').toLowerCase();
  // Remove content in parentheses, e.g. "(g)", "(kcal)", "(mg)", "(mcg RAE)", "(µg)"
  clean = clean.replace(/\(.*?\)/g, '');
  // Remove non-alphanumeric characters
  return clean.replace(/[^a-z0-9]/g, '').trim();
}

export function buildHeaderIndexMap(headers: string[]): Record<string, number> {
  const headerMap: Record<string, number> = {};
  if (!Array.isArray(headers) || headers.length === 0) return headerMap;

  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    if (norm && headerMap[norm] === undefined) {
      headerMap[norm] = idx;
    }
  });
  return headerMap;
}

export function findHeaderIndex(headerMap: Record<string, number>, possibleNames: string[]): number {
  // 1. Direct exact normalized match
  for (const name of possibleNames) {
    const norm = normalizeHeader(name);
    if (headerMap[norm] !== undefined) {
      return headerMap[norm];
    }
  }

  // 2. Exact word or prefix match
  for (const name of possibleNames) {
    const norm = normalizeHeader(name);
    for (const [key, idx] of Object.entries(headerMap)) {
      if (key === norm || key.startsWith(norm) || norm.startsWith(key)) {
        return idx;
      }
    }
  }

  return -1;
}

/**
 * Standard default column headers when creating a new sheet tab from scratch.
 */
export const STANDARD_COLUMN_HEADERS: string[] = [
  'Dish Name', 'Meal ID', 'Date', 'Meal Slot', 'Ingredient / Component', 'Weight (g)',
  'Calories (kcal)', 'Protein (g)', 'Total Fat (g)', 'Saturated Fat (g)', 'Carbohydrates (g)',
  'Dietary Fiber (g)', 'Total Sugars (g)', 'Sodium (mg)', 'Potassium (mg)', 'Calcium (mg)',
  'Iron (mg)', 'Magnesium (mg)', 'Phosphorus (mg)', 'Zinc (mg)', 'Selenium (mcg)',
  'Vitamin A (mcg RAE)', 'Vitamin C (mg)', 'Vitamin D (mcg)', 'Vitamin E (mg)', 'Vitamin K (mcg)',
  'Vitamin B12 (mcg)', 'Folate (mcg DFE)', 'Vitamin B6 (mg)', 'Thiamin B1 (mg)', 'Riboflavin B2 (mg)',
  'Niacin B3 (mg NE)', 'Monounsaturated Fat (g)', 'Polyunsaturated Fat (g)', 'Trans Fat (g)',
  'Cholesterol (mg)', 'Added Sugars (g)', 'USDA / Source Reference', 'Meal Diagnosis',
  'Daily Diagnosis', 'Photo URL'
];

/**
 * Maps a single meal component row object into an array of cell values
 * strictly conforming to the sheet's active header layout.
 */
export function mapRowToHeaders(row: any, idx: number, headers: string[]): any[] {
  const hasHeaders = Array.isArray(headers) && headers.length > 0;
  const headerMap = buildHeaderIndexMap(headers);
  const totalLength = hasHeaders ? Math.max(headers.length, 10) : STANDARD_COLUMN_HEADERS.length;
  const out = new Array(totalLength).fill('');

  const setField = (val: any, defaultIdx: number, ...possibleNames: string[]) => {
    let targetIdx = -1;
    if (hasHeaders) {
      targetIdx = findHeaderIndex(headerMap, possibleNames);
      // If headers exist, NEVER fallback to defaultIdx if column is missing.
      // Doing so causes column shifts (e.g. putting Meal Slot in Ingredient column).
      if (targetIdx === -1) {
        return;
      }
    } else {
      targetIdx = defaultIdx;
    }

    if (targetIdx >= 0) {
      while (out.length <= targetIdx) out.push('');
      out[targetIdx] = val !== undefined && val !== null ? val : '';
    }
  };

  setField(row.dishName || '', 0, 'dishname', 'foodname', 'dish');
  setField(row.mealId || '', 1, 'mealid', 'id');
  setField(row.date || '', 2, 'date', 'day');
  setField(row.mealSlot || '', 3, 'mealslot', 'slot', 'mealtype', 'type');
  setField(row.ingredient || '', 4, 'ingredientcomponent', 'ingredient', 'component', 'components', 'food');
  setField(row.weightG ?? '', 5, 'weightg', 'weight', 'servingg', 'amountg');
  setField(row.calories ?? '', 6, 'calorieskcal', 'calories', 'kcal', 'energy');
  setField(row.protein ?? '', 7, 'proteing', 'protein');
  setField(row.totalFat ?? '', 8, 'totalfatg', 'totalfat', 'fatg', 'fat');
  setField(row.saturatedFat ?? '', 9, 'saturatedfatg', 'saturatedfat', 'satfat');
  setField(row.carbs ?? '', 10, 'carbohydratesg', 'carbohydrates', 'carbsg', 'carbs', 'totalcarbs');
  setField(row.fiber ?? '', 11, 'dietaryfiberg', 'dietaryfiber', 'fiberg', 'fiber');
  setField(row.totalSugars ?? '', 12, 'totalsugarsg', 'totalsugars', 'sugarg', 'sugar', 'sugars');
  setField(row.sodium ?? '', 13, 'sodiummg', 'sodium');
  setField(row.potassium ?? '', 14, 'potassiummg', 'potassium');
  setField(row.calcium ?? '', 15, 'calciummg', 'calcium');
  setField(row.iron ?? '', 16, 'ironmg', 'iron');
  setField(row.magnesium ?? '', 17, 'magnesiummg', 'magnesium');
  setField(row.phosphorus ?? '', 18, 'phosphorusmg', 'phosphorus');
  setField(row.zinc ?? '', 19, 'zincmg', 'zinc');
  setField(row.selenium ?? '', 20, 'seleniummcg', 'selenium');
  setField(row.vitaminA ?? '', 21, 'vitaminamcgrae', 'vitamina', 'vita');
  setField(row.vitaminC ?? '', 22, 'vitamincmg', 'vitaminc', 'vitc');
  setField(row.vitaminD ?? '', 23, 'vitamindmcg', 'vitamind', 'vitd');
  setField(row.vitaminE ?? '', 24, 'vitaminemg', 'vitamine', 'vite');
  setField(row.vitaminK ?? '', 25, 'vitaminkmcg', 'vitamink', 'vitk');
  setField(row.vitaminB12 ?? '', 26, 'vitaminb12mcg', 'vitaminb12', 'vitb12');
  setField(row.folate ?? '', 27, 'folatemcgdfe', 'folate', 'folicacid');
  setField(row.vitaminB6 ?? '', 28, 'vitaminb6mg', 'vitaminb6', 'vitb6');
  setField(row.thiaminB1 ?? '', 29, 'thiaminb1mg', 'thiaminb1', 'thiamin');
  setField(row.riboflavinB2 ?? '', 30, 'riboflavinb2mg', 'riboflavinb2', 'riboflavin');
  setField(row.niacinB3 ?? '', 31, 'niacinb3mgne', 'niacinb3', 'niacin');
  setField(row.monounsaturatedFat ?? '', 32, 'monounsaturatedfatg', 'monounsaturatedfat', 'mufa');
  setField(row.polyunsaturatedFat ?? '', 33, 'polyunsaturatedfatg', 'polyunsaturatedfat', 'pufa');
  setField(row.transFat ?? '', 34, 'transfatg', 'transfat');
  setField(row.cholesterol ?? '', 35, 'cholesterolmg', 'cholesterol');
  setField(row.addedSugars ?? '', 36, 'addedsugarsg', 'addedsugars');
  setField(row.sourceRef || 'USDA FDC Reference', 37, 'usda', 'sourcereference', 'sourceref', 'source', 'reference');
  
  // Rule: Only the primary index (0) gets mealDiagnosis, dailyDiagnosis, and photoUrl
  setField(idx === 0 ? (row.mealDiagnosis || '') : '', 38, 'mealdiagnosis', 'clinicalnote', 'clinicaldiagnosis', 'diagnosis');
  setField(idx === 0 ? (row.dailyDiagnosis || '') : '', 39, 'dailydiagnosis', 'dailynote');
  setField(idx === 0 ? (row.photoUrl || '') : '', 40, 'photourl', 'photourls', 'photo', 'imageurl', 'image', 'picture');

  return out;
}
