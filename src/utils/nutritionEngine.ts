import { MealLogRow } from '../types';

export interface RawNutritionLabel {
  servingSize?: string;
  calories?: string | number;
  energyKj?: string | number;
  protein?: string | number;
  totalFat?: string | number;
  fat?: string | number;
  saturatedFat?: string | number;
  satFat?: string | number;
  transFat?: string | number;
  monounsaturatedFat?: string | number;
  polyunsaturatedFat?: string | number;
  cholesterol?: string | number;
  totalCarbohydrate?: string | number;
  carbohydrates?: string | number;
  carbs?: string | number;
  sugar?: string | number;
  sugars?: string | number;
  totalSugars?: string | number;
  addedSugar?: string | number;
  addedSugars?: string | number;
  totalFibre?: string | number;
  dietaryFiber?: string | number;
  fiber?: string | number;
  sodium?: string | number;
  salt?: string | number;
  potassium?: string | number;
  calcium?: string | number;
  iron?: string | number;
  magnesium?: string | number;
  phosphorus?: string | number;
  zinc?: string | number;
  selenium?: string | number;
  vitaminA?: string | number;
  vitaminC?: string | number;
  vitaminD?: string | number;
  vitaminE?: string | number;
  vitaminK?: string | number;
  vitaminB12?: string | number;
  folate?: string | number;
  vitaminB6?: string | number;
  thiaminB1?: string | number;
  thiamin?: string | number;
  riboflavinB2?: string | number;
  riboflavin?: string | number;
  niacinB3?: string | number;
  niacin?: string | number;
  [key: string]: string | number | undefined;
}

export interface FoodItemInput {
  foodName: string;
  genericEnglishName?: string;
  packageLabelText?: string;
  weightGrams: number;
  packGrams?: number;
  sourceImageIndex?: number;
  rawNutritionLabel?: RawNutritionLabel | null;
  /** Basis for the values in nutrients: 'per_100g', 'per_portion', or 'per_serving' (default: 'per_portion') */
  nutrientsBasis?: 'per_100g' | 'per_portion' | 'per_serving';
  /** Missing or estimated nutrients not explicitly declared on the packaging (or full nutrients for restaurant meals) */
  nutrients?: Record<string, string | number | undefined>;
}

export interface ProcessedFoodMealResult {
  dishName: string;
  totalDishWeightG: number;
  portionWeightG: number;
  weightDifferenceDetected: boolean;
  weightClarificationPrompt?: string;
  rows: MealLogRow[];
  aggregatedTotals: {
    calories: number;
    protein: number;
    totalFat: number;
    saturatedFat: number;
    carbs: number;
    fiber: number;
    sodium: number;
    potassium: number;
    addedSugars: number;
  };
  atwaterEvaluation: {
    totalWeightG: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    atwaterSum: number;
    atwaterDiff: number;
    caloricDensity: number;
    withinTolerance: boolean;
  };
  foods: FoodItemInput[];
}

/**
 * Robust numeric parser for OCR and AI text strings:
 * - "89.55 kkal" -> 89.55
 * - "50mg" -> 50
 * - "21g" -> 21
 * - "1,200 mg" -> 1200
 * - "< 1g" -> 0.5
 * - "trace" / "nil" -> 0
 */
export function parseNutrientValue(rawVal: string | number | undefined | null): number | null {
  if (rawVal === undefined || rawVal === null) return null;
  if (typeof rawVal === 'number') {
    return isNaN(rawVal) ? null : rawVal;
  }

  const str = String(rawVal).trim().toLowerCase();
  if (str === '' || str === '-' || str === 'n/a' || str === 'none') return null;
  if (str === '0' || str === 'nil' || str === 'zero') return 0;
  if (str === 'trace' || str.startsWith('<')) {
    const numMatch = str.match(/[\d.]+/);
    return numMatch ? Number(numMatch[0]) / 2 : 0.1;
  }

  // Remove commas in numbers like "1,200"
  const cleaned = str.replace(/,/g, '');
  const match = cleaned.match(/[-+]?[\d]*\.?[\d]+/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extracts serving size weight in grams or ml from strings like:
 * - "330 ml" -> 330
 * - "1 packet (35g)" -> 35
 * - "2 biscuits (50 g)" -> 50
 * - "100g" -> 100
 */
export function extractServingWeightGrams(servingSizeStr?: string): number | null {
  if (!servingSizeStr) return null;
  const s = servingSizeStr.toLowerCase();

  const parenMatch = s.match(/\(\s*([\d.]+)\s*(?:g|grams?|ml)\s*\)/i);
  if (parenMatch) return Number(parenMatch[1]);

  const directMatch = s.match(/([\d.]+)\s*(?:g|grams?|ml)\b/i);
  if (directMatch) return Number(directMatch[1]);

  const bareNum = s.match(/[\d.]+/);
  return bareNum ? Number(bareNum[0]) : null;
}

/** Helper to query any alias in an object and parse its value */
function getAliasedValue(obj: Record<string, any> | undefined | null, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) {
      const parsed = parseNutrientValue(obj[k]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/**
 * Deterministic calculation engine for a single food item:
 * 1. Distinguishes Packaged food (with rawNutritionLabel) vs Restaurant meal (no label).
 * 2. Parses verbatim OCR strings with units ("89.55 kkal", "50mg", "0.4g salt", etc.).
 * 3. Handles international conversions (Salt -> Sodium, kJ -> kcal).
 * 4. Merges declared values with missing unlisted nutrients.
 * 5. Scales to the consumed target weight.
 */
export function processFoodItem(
  food: FoodItemInput,
  meta?: { mealId?: string; date?: string; mealSlot?: string },
  overrideTargetWeightG?: number
): MealLogRow {
  const baseFoodWeight = Number(food.weightGrams) || 100;
  const targetWeight = overrideTargetWeightG !== undefined ? overrideTargetWeightG : baseFoodWeight;
  const raw = food.rawNutritionLabel;
  const unlisted = food.nutrients || {};

  const res: Record<string, number> = {
    weightG: targetWeight,
    calories: 0,
    protein: 0,
    totalFat: 0,
    saturatedFat: 0,
    carbs: 0,
    fiber: 0,
    totalSugars: 0,
    addedSugars: 0,
    sodium: 0,
    potassium: 0,
    calcium: 0,
    iron: 0,
    magnesium: 0,
    phosphorus: 0,
    zinc: 0,
    selenium: 0,
    vitaminA: 0,
    vitaminC: 0,
    vitaminD: 0,
    vitaminE: 0,
    vitaminK: 0,
    vitaminB12: 0,
    folate: 0,
    vitaminB6: 0,
    thiaminB1: 0,
    riboflavinB2: 0,
    niacinB3: 0,
    monounsaturatedFat: 0,
    polyunsaturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
  };

  const rawNutrientKeys: string[] = [];

  if (raw && Object.keys(raw).length > 0) {
    // ----------------------------------------------------
    // CASE 1: PACKAGED FOOD WITH RAW NUTRITION LABEL
    // ----------------------------------------------------
    const servingWeight = extractServingWeightGrams(raw.servingSize) || baseFoodWeight;
    // Ratio to scale from the printed label serving size to the consumed target weight
    const scaleRatio = servingWeight > 0 ? targetWeight / servingWeight : 1.0;
    const unlistedRatio = food.nutrientsBasis === 'per_100g'
      ? (targetWeight / 100)
      : food.nutrientsBasis === 'per_serving'
        ? scaleRatio
        : (baseFoodWeight > 0 ? targetWeight / baseFoodWeight : 1.0);

    // 1. Calories / Energy
    const rawCal = getAliasedValue(raw, 'calories', 'energy', 'energyKcal', 'kcal');
    const rawKj = getAliasedValue(raw, 'energyKj', 'kj');
    const unlistedCal = getAliasedValue(unlisted, 'calories', 'energy', 'energyKcal', 'kcal');

    if (rawCal !== null) {
      rawNutrientKeys.push('calories');
      res.calories = Math.round(rawCal * scaleRatio);
    } else if (rawKj !== null) {
      rawNutrientKeys.push('calories');
      // 1 kcal = 4.184 kJ
      res.calories = Math.round((rawKj / 4.184) * scaleRatio);
    } else if (unlistedCal !== null) {
      res.calories = Math.round(unlistedCal * unlistedRatio);
    }

    // 2. Protein
    const pRaw = getAliasedValue(raw, 'protein');
    const pUnlisted = getAliasedValue(unlisted, 'protein');
    if (pRaw !== null) {
      rawNutrientKeys.push('protein');
      res.protein = Number((pRaw * scaleRatio).toFixed(1));
    } else if (pUnlisted !== null) {
      res.protein = Number((pUnlisted * unlistedRatio).toFixed(1));
    }

    // 3. Fats
    const tfRaw = getAliasedValue(raw, 'totalFat', 'fat', 'total_fat');
    const tfUnlisted = getAliasedValue(unlisted, 'totalFat', 'fat');
    if (tfRaw !== null) {
      rawNutrientKeys.push('totalFat');
      res.totalFat = Number((tfRaw * scaleRatio).toFixed(1));
    } else if (tfUnlisted !== null) {
      res.totalFat = Number((tfUnlisted * unlistedRatio).toFixed(1));
    }

    const sfRaw = getAliasedValue(raw, 'saturatedFat', 'satFat', 'saturated_fat');
    const sfUnlisted = getAliasedValue(unlisted, 'saturatedFat', 'satFat');
    if (sfRaw !== null) {
      rawNutrientKeys.push('saturatedFat');
      res.saturatedFat = Number((sfRaw * scaleRatio).toFixed(1));
    } else if (sfUnlisted !== null) {
      res.saturatedFat = Number((sfUnlisted * unlistedRatio).toFixed(1));
    }

    const trfRaw = getAliasedValue(raw, 'transFat', 'trans_fat');
    const trfUnlisted = getAliasedValue(unlisted, 'transFat');
    if (trfRaw !== null) {
      rawNutrientKeys.push('transFat');
      res.transFat = Number((trfRaw * scaleRatio).toFixed(1));
    } else if (trfUnlisted !== null) {
      res.transFat = Number((trfUnlisted * unlistedRatio).toFixed(1));
    }

    const mufRaw = getAliasedValue(raw, 'monounsaturatedFat', 'mufa');
    const mufUnlisted = getAliasedValue(unlisted, 'monounsaturatedFat', 'mufa');
    if (mufRaw !== null) {
      rawNutrientKeys.push('monounsaturatedFat');
      res.monounsaturatedFat = Number((mufRaw * scaleRatio).toFixed(1));
    } else if (mufUnlisted !== null) {
      res.monounsaturatedFat = Number((mufUnlisted * unlistedRatio).toFixed(1));
    }

    const pufRaw = getAliasedValue(raw, 'polyunsaturatedFat', 'pufa');
    const pufUnlisted = getAliasedValue(unlisted, 'polyunsaturatedFat', 'pufa');
    if (pufRaw !== null) {
      rawNutrientKeys.push('polyunsaturatedFat');
      res.polyunsaturatedFat = Number((pufRaw * scaleRatio).toFixed(1));
    } else if (pufUnlisted !== null) {
      res.polyunsaturatedFat = Number((pufUnlisted * unlistedRatio).toFixed(1));
    }

    const cholRaw = getAliasedValue(raw, 'cholesterol');
    const cholUnlisted = getAliasedValue(unlisted, 'cholesterol');
    if (cholRaw !== null) {
      rawNutrientKeys.push('cholesterol');
      res.cholesterol = Math.round(cholRaw * scaleRatio);
    } else if (cholUnlisted !== null) {
      res.cholesterol = Math.round(cholUnlisted * unlistedRatio);
    }

    // 4. Carbohydrates & Fiber & Sugars
    const cRaw = getAliasedValue(raw, 'totalCarbohydrate', 'carbohydrates', 'carbs', 'carbohydrate');
    const cUnlisted = getAliasedValue(unlisted, 'totalCarbohydrate', 'carbohydrates', 'carbs');
    if (cRaw !== null) {
      rawNutrientKeys.push('carbs');
      res.carbs = Number((cRaw * scaleRatio).toFixed(1));
    } else if (cUnlisted !== null) {
      res.carbs = Number((cUnlisted * unlistedRatio).toFixed(1));
    }

    const fibRaw = getAliasedValue(raw, 'totalFibre', 'dietaryFiber', 'fiber', 'fibre');
    const fibUnlisted = getAliasedValue(unlisted, 'totalFibre', 'dietaryFiber', 'fiber', 'fibre');
    if (fibRaw !== null) {
      rawNutrientKeys.push('fiber');
      res.fiber = Number((fibRaw * scaleRatio).toFixed(1));
    } else if (fibUnlisted !== null) {
      res.fiber = Number((fibUnlisted * unlistedRatio).toFixed(1));
    }

    const sugRaw = getAliasedValue(raw, 'totalSugars', 'sugars', 'sugar');
    const sugUnlisted = getAliasedValue(unlisted, 'totalSugars', 'sugars', 'sugar');
    if (sugRaw !== null) {
      rawNutrientKeys.push('totalSugars');
      res.totalSugars = Number((sugRaw * scaleRatio).toFixed(1));
    } else if (sugUnlisted !== null) {
      res.totalSugars = Number((sugUnlisted * unlistedRatio).toFixed(1));
    }

    const addSugRaw = getAliasedValue(raw, 'addedSugars', 'addedSugar', 'added_sugars');
    const addSugUnlisted = getAliasedValue(unlisted, 'addedSugars', 'addedSugar');
    if (addSugRaw !== null) {
      rawNutrientKeys.push('addedSugars');
      res.addedSugars = Number((addSugRaw * scaleRatio).toFixed(1));
    } else if (addSugUnlisted !== null) {
      res.addedSugars = Number((addSugUnlisted * unlistedRatio).toFixed(1));
    }

    // 5. Sodium & Salt International Harmonization
    // 1g salt (NaCl) = 393.4mg sodium
    const rawSod = getAliasedValue(raw, 'sodium', 'na');
    const rawSalt = getAliasedValue(raw, 'salt');
    const unlistedSod = getAliasedValue(unlisted, 'sodium', 'na');

    if (rawSod !== null) {
      rawNutrientKeys.push('sodium');
      res.sodium = Math.round(rawSod * scaleRatio);
    } else if (rawSalt !== null) {
      rawNutrientKeys.push('sodium');
      res.sodium = Math.round(rawSalt * 393.4 * scaleRatio);
    } else if (unlistedSod !== null) {
      res.sodium = Math.round(unlistedSod * unlistedRatio);
    }

    // 6. Minerals & Vitamins declared or unlisted
    const resolveField = (fieldName: string, rawKeys: string[], unlistedKeys: string[], isInt = false) => {
      const rawVal = getAliasedValue(raw, ...rawKeys);
      if (rawVal !== null) {
        rawNutrientKeys.push(fieldName);
        return isInt ? Math.round(rawVal * scaleRatio) : Number((rawVal * scaleRatio).toFixed(1));
      }
      const unlistedVal = getAliasedValue(unlisted, ...unlistedKeys);
      if (unlistedVal !== null) {
        return isInt ? Math.round(unlistedVal * unlistedRatio) : Number((unlistedVal * unlistedRatio).toFixed(1));
      }
      return 0;
    };

    res.potassium = resolveField('potassium', ['potassium', 'k'], ['potassium', 'k'], true);
    res.calcium = resolveField('calcium', ['calcium', 'ca'], ['calcium', 'ca'], true);
    res.iron = resolveField('iron', ['iron', 'fe'], ['iron', 'fe'], false);
    res.magnesium = resolveField('magnesium', ['magnesium', 'mg'], ['magnesium', 'mg'], true);
    res.phosphorus = resolveField('phosphorus', ['phosphorus', 'p'], ['phosphorus', 'p'], true);
    res.zinc = resolveField('zinc', ['zinc', 'zn'], ['zinc', 'zn'], false);
    res.selenium = resolveField('selenium', ['selenium', 'se'], ['selenium', 'se'], false);

    res.vitaminA = resolveField('vitaminA', ['vitaminA', 'vitA'], ['vitaminA', 'vitA'], false);
    res.vitaminC = resolveField('vitaminC', ['vitaminC', 'vitC', 'ascorbicAcid'], ['vitaminC', 'vitC', 'ascorbicAcid'], false);
    res.vitaminD = resolveField('vitaminD', ['vitaminD', 'vitD'], ['vitaminD', 'vitD'], false);
    res.vitaminE = resolveField('vitaminE', ['vitaminE', 'vitE'], ['vitaminE', 'vitE'], false);
    res.vitaminK = resolveField('vitaminK', ['vitaminK', 'vitK'], ['vitaminK', 'vitK'], false);
    res.vitaminB12 = resolveField('vitaminB12', ['vitaminB12', 'vitB12', 'b12', 'cobalamin'], ['vitaminB12', 'vitB12', 'b12', 'cobalamin'], false);
    res.folate = resolveField('folate', ['folate', 'folicAcid', 'b9'], ['folate', 'folicAcid', 'b9'], false);
    res.vitaminB6 = resolveField('vitaminB6', ['vitaminB6', 'vitB6', 'b6', 'pyridoxine'], ['vitaminB6', 'vitB6', 'b6', 'pyridoxine'], false);
    res.thiaminB1 = resolveField('thiaminB1', ['thiaminB1', 'thiamin', 'thiamine', 'vitB1', 'b1'], ['thiaminB1', 'thiamin', 'thiamine', 'vitB1', 'b1'], false);
    res.riboflavinB2 = resolveField('riboflavinB2', ['riboflavinB2', 'riboflavin', 'vitB2', 'b2'], ['riboflavinB2', 'riboflavin', 'vitB2', 'b2'], false);
    res.niacinB3 = resolveField('niacinB3', ['niacinB3', 'niacin', 'niacinamide', 'vitB3', 'b3'], ['niacinB3', 'niacin', 'niacinamide', 'vitB3', 'b3'], false);

  } else {
    // ----------------------------------------------------
    // CASE 2: RESTAURANT / PLATED MEAL (NO LABEL)
    // ----------------------------------------------------
    // If nutrients are provided per 100g: scale by targetWeight / 100
    // If nutrients are provided per portion: scale by targetWeight / baseFoodWeight
    const isPer100g = food.nutrientsBasis === 'per_100g';
    const weightRatio = isPer100g
      ? (targetWeight / 100)
      : (baseFoodWeight > 0 ? targetWeight / baseFoodWeight : 1.0);

    const getVal = (isInt: boolean, ...keys: string[]) => {
      const val = getAliasedValue(unlisted, ...keys);
      if (val === null) return 0;
      const scaled = val * weightRatio;
      return isInt ? Math.round(scaled) : Number(scaled.toFixed(1));
    };

    const cal = getAliasedValue(unlisted, 'calories', 'energy', 'energyKcal', 'kcal');
    res.calories = cal !== null ? Math.round(cal * weightRatio) : 0;
    res.protein = getVal(false, 'protein');
    res.totalFat = getVal(false, 'totalFat', 'fat', 'total_fat');
    res.saturatedFat = getVal(false, 'saturatedFat', 'satFat', 'saturated_fat');
    res.transFat = getVal(false, 'transFat', 'trans_fat');
    res.monounsaturatedFat = getVal(false, 'monounsaturatedFat', 'mufa');
    res.polyunsaturatedFat = getVal(false, 'polyunsaturatedFat', 'pufa');
    res.cholesterol = getVal(true, 'cholesterol');
    res.carbs = getVal(false, 'carbs', 'totalCarbohydrate', 'carbohydrates');
    res.fiber = getVal(false, 'fiber', 'totalFibre', 'dietaryFiber', 'fibre');
    res.totalSugars = getVal(false, 'totalSugars', 'sugars', 'sugar');
    res.addedSugars = getVal(false, 'addedSugars', 'addedSugar', 'added_sugars');

    res.sodium = getVal(true, 'sodium', 'na');
    // If restaurant item only had salt:
    if (res.sodium === 0) {
      const saltVal = getAliasedValue(unlisted, 'salt');
      if (saltVal !== null) {
        res.sodium = Math.round(saltVal * 393.4 * weightRatio);
      }
    }

    res.potassium = getVal(true, 'potassium', 'k');
    res.calcium = getVal(true, 'calcium', 'ca');
    res.iron = getVal(false, 'iron', 'fe');
    res.magnesium = getVal(true, 'magnesium', 'mg');
    res.phosphorus = getVal(true, 'phosphorus', 'p');
    res.zinc = getVal(false, 'zinc', 'zn');
    res.selenium = getVal(false, 'selenium', 'se');

    res.vitaminA = getVal(false, 'vitaminA', 'vitA');
    res.vitaminC = getVal(false, 'vitaminC', 'vitC', 'ascorbicAcid');
    res.vitaminD = getVal(false, 'vitaminD', 'vitD');
    res.vitaminE = getVal(false, 'vitaminE', 'vitE');
    res.vitaminK = getVal(false, 'vitaminK', 'vitK');
    res.vitaminB12 = getVal(false, 'vitaminB12', 'vitB12', 'b12', 'cobalamin');
    res.folate = getVal(false, 'folate', 'folicAcid', 'b9');
    res.vitaminB6 = getVal(false, 'vitaminB6', 'vitB6', 'b6', 'pyridoxine');
    res.thiaminB1 = getVal(false, 'thiaminB1', 'thiamin', 'thiamine', 'b1', 'vitB1');
    res.riboflavinB2 = getVal(false, 'riboflavinB2', 'riboflavin', 'b2', 'vitB2');
    res.niacinB3 = getVal(false, 'niacinB3', 'niacin', 'niacinamide', 'b3', 'vitB3');

    // Fallback if calories was 0 or unlisted: calculate via Atwater
    if (res.calories === 0 && (res.protein > 0 || res.carbs > 0 || res.totalFat > 0)) {
      res.calories = Math.round(res.protein * 4 + res.carbs * 4 + res.totalFat * 9 + res.fiber * 2);
    }
  }

  return {
    dishName: food.foodName || 'Meal Component',
    mealId: meta?.mealId || 'M-001',
    date: meta?.date || new Date().toISOString().split('T')[0],
    mealSlot: meta?.mealSlot || 'Snack',
    ingredient: food.genericEnglishName || food.foodName,
    weightG: targetWeight,
    calories: res.calories,
    protein: res.protein,
    totalFat: res.totalFat,
    saturatedFat: res.saturatedFat,
    carbs: res.carbs,
    fiber: res.fiber,
    totalSugars: res.totalSugars,
    sodium: res.sodium,
    potassium: res.potassium,
    calcium: res.calcium,
    iron: res.iron,
    magnesium: res.magnesium,
    phosphorus: res.phosphorus,
    zinc: res.zinc,
    selenium: res.selenium,
    vitaminA: res.vitaminA,
    vitaminC: res.vitaminC,
    vitaminD: res.vitaminD,
    vitaminE: res.vitaminE,
    vitaminK: res.vitaminK,
    vitaminB12: res.vitaminB12,
    folate: res.folate,
    vitaminB6: res.vitaminB6,
    thiaminB1: res.thiaminB1,
    riboflavinB2: res.riboflavinB2,
    niacinB3: res.niacinB3,
    monounsaturatedFat: res.monounsaturatedFat,
    polyunsaturatedFat: res.polyunsaturatedFat,
    transFat: res.transFat,
    cholesterol: res.cholesterol,
    addedSugars: res.addedSugars,
    sourceRef: food.packageLabelText ? 'Packaging OCR' : 'Visual Reference',
    rawNutrientKeys: raw ? rawNutrientKeys : undefined,
    rawNutritionLabel: raw || undefined,
  };
}

/**
 * Top-level processor for an entire meal containing one or more foods:
 * Aggregates all components, performs Atwater verification, and checks for weight discrepancies.
 */
export function processFoodsAnalysis(
  dishName: string,
  foods: FoodItemInput[],
  meta?: { mealId?: string; date?: string; mealSlot?: string }
): ProcessedFoodMealResult {
  const rows = foods.map((f) => processFoodItem(f, meta));

  const totalPortionWeight = foods.reduce((sum, f) => sum + (Number(f.weightGrams) || 0), 0);
  const totalPackWeight = foods.reduce((sum, f) => sum + (Number(f.packGrams) || Number(f.weightGrams) || 0), 0);

  // Detect discrepancy if any packaged food has packGrams differing from weightGrams
  let weightDifferenceDetected = false;
  let weightClarificationPrompt: string | undefined;

  for (const f of foods) {
    if (f.packGrams && f.weightGrams && Math.abs(f.packGrams - f.weightGrams) > 5) {
      weightDifferenceDetected = true;
      weightClarificationPrompt = `Weight discrepancy detected for ${f.foodName}: Total package weight is ${f.packGrams}g, but single portion is ${f.weightGrams}g. Did you consume the entire package (${f.packGrams}g) or a single portion (${f.weightGrams}g)?`;
      break;
    }
  }

  const agg = {
    calories: rows.reduce((s, r) => s + (Number(r.calories) || 0), 0),
    protein: Number(rows.reduce((s, r) => s + (Number(r.protein) || 0), 0).toFixed(1)),
    totalFat: Number(rows.reduce((s, r) => s + (Number(r.totalFat) || 0), 0).toFixed(1)),
    saturatedFat: Number(rows.reduce((s, r) => s + (Number(r.saturatedFat) || 0), 0).toFixed(1)),
    carbs: Number(rows.reduce((s, r) => s + (Number(r.carbs) || 0), 0).toFixed(1)),
    fiber: Number(rows.reduce((s, r) => s + (Number(r.fiber) || 0), 0).toFixed(1)),
    sodium: Math.round(rows.reduce((s, r) => s + (Number(r.sodium) || 0), 0)),
    potassium: Math.round(rows.reduce((s, r) => s + (Number(r.potassium) || 0), 0)),
    addedSugars: Number(rows.reduce((s, r) => s + (Number(r.addedSugars) || 0), 0).toFixed(1)),
  };

  const netCarbs = Math.max(0, agg.carbs - agg.fiber);
  const atwaterSum = Math.round(agg.protein * 4 + netCarbs * 4 + agg.totalFat * 9 + agg.fiber * 2);
  const atwaterDiff = Math.abs(agg.calories - atwaterSum);
  const caloricDensity = totalPortionWeight > 0 ? Number((agg.calories / totalPortionWeight).toFixed(1)) : 0;
  const withinTolerance = atwaterDiff <= Math.max(30, agg.calories * 0.08);

  return {
    dishName,
    totalDishWeightG: totalPackWeight,
    portionWeightG: totalPortionWeight,
    weightDifferenceDetected,
    weightClarificationPrompt,
    rows,
    aggregatedTotals: agg,
    atwaterEvaluation: {
      totalWeightG: totalPortionWeight,
      calories: agg.calories,
      protein: agg.protein,
      carbs: agg.carbs,
      fat: agg.totalFat,
      atwaterSum,
      atwaterDiff,
      caloricDensity,
      withinTolerance,
    },
    foods,
  };
}
