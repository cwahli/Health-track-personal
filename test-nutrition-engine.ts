import {
  parseNutrientValue,
  extractServingWeightGrams,
  processFoodItem,
  processFoodsAnalysis,
  FoodItemInput,
} from './src/utils/nutritionEngine';

console.log('====================================================');
console.log('RUNNING TEST SUITE: Universal Nutrition Engine');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName}${detail ? ' - ' + detail : ''}`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------------
// TEST 1: OCR String Parser & Unit Extraction
// -------------------------------------------------------------------
console.log('--- Suite 1: Unit & String Parsers ---');
assert(parseNutrientValue('89.55 kkal') === 89.55, 'Parses "89.55 kkal" to 89.55');
assert(parseNutrientValue('50mg') === 50, 'Parses "50mg" to 50');
assert(parseNutrientValue('21g') === 21, 'Parses "21g" to 21');
assert(parseNutrientValue('1,200 mg') === 1200, 'Parses "1,200 mg" with comma to 1200');
assert(parseNutrientValue('< 1g') === 0.5, 'Parses "< 1g" to 0.5');
assert(parseNutrientValue('trace') === 0.1, 'Parses "trace" to 0.1');
assert(parseNutrientValue('0') === 0, 'Parses "0" to 0');
assert(extractServingWeightGrams('330 ml') === 330, 'Extracts "330 ml" to 330');
assert(extractServingWeightGrams('1 packet (35g)') === 35, 'Extracts "1 packet (35g)" to 35');
assert(extractServingWeightGrams('100g') === 100, 'Extracts "100g" to 100');

// -------------------------------------------------------------------
// TEST 2: Packaged Food with Raw Nutrition Label (User Example: Hemaviton)
// -------------------------------------------------------------------
console.log('\n--- Suite 2: Packaged Food (Hemaviton C1000) ---');
const hemavitonFood: FoodItemInput = {
  foodName: 'Hemaviton C1000 Orange',
  genericEnglishName: 'vitamin c drink',
  packageLabelText: 'Hemaviton C1000 Total Care Orange Flavour NET VOLUME 330 ml',
  weightGrams: 330,
  packGrams: 330,
  sourceImageIndex: 0,
  rawNutritionLabel: {
    servingSize: '330 ml',
    calories: '89.55 kkal',
    addedSugar: '21g',
    potassium: '0',
    protein: '0',
    salt: '0',
    saturatedFat: '0',
    sodium: '50mg',
    sugar: '21g',
    totalCarbohydrate: '22g',
    totalFat: '0',
    totalFibre: '0',
    transFat: '0',
  },
  nutrients: {
    // Only missing nutrients from the label
    vitaminC: 1000,
    niacinB3: 10,
    vitaminB6: 5,
    vitaminB12: 2.4,
    zinc: 2.5,
  },
};

const hemavitonRow = processFoodItem(hemavitonFood);
assert(hemavitonRow.calories === 90, 'Hemaviton calories rounded to 90', `Got ${hemavitonRow.calories}`);
assert(hemavitonRow.carbs === 22, 'Hemaviton carbs = 22g', `Got ${hemavitonRow.carbs}`);
assert(hemavitonRow.sodium === 50, 'Hemaviton sodium = 50mg', `Got ${hemavitonRow.sodium}`);
assert(hemavitonRow.addedSugars === 21, 'Hemaviton addedSugars = 21g', `Got ${hemavitonRow.addedSugars}`);
assert(hemavitonRow.vitaminC === 3300 || hemavitonRow.vitaminC > 0, 'Hemaviton vitamin C merged from nutrients', `Got ${hemavitonRow.vitaminC}`);
assert(hemavitonRow.zinc > 0, 'Hemaviton zinc merged from nutrients', `Got ${hemavitonRow.zinc}`);

// -------------------------------------------------------------------
// TEST 3: International European / UK Label (Salt & kJ Conversion)
// -------------------------------------------------------------------
console.log('\n--- Suite 3: International Label (EU/UK Salt & kJ) ---');
const ukFood: FoodItemInput = {
  foodName: 'Walker Crisps Ready Salted',
  weightGrams: 40,
  packGrams: 40,
  rawNutritionLabel: {
    servingSize: '100g', // printed per 100g on package!
    energyKj: '2150 kJ',
    protein: '6.0g',
    totalCarbohydrate: '53g',
    totalFat: '31g',
    salt: '1.25g', // Note: salt, not sodium!
  },
  nutrients: {
    potassium: 1200, // unlisted potassium per 100g
    magnesium: 60,
  },
};

const ukRow = processFoodItem(ukFood);
// 2150 kJ / 4.184 = 513.8 kcal per 100g -> for 40g = 205.5 kcal -> 206
assert(ukRow.calories === 206, 'kJ correctly converted to kcal: 206 kcal for 40g', `Got ${ukRow.calories}`);
// 1.25g salt * 393.4 = 491.75mg sodium per 100g -> for 40g = 196.7mg -> 197mg
assert(ukRow.sodium === 197, 'Salt correctly converted to sodium: 197mg for 40g', `Got ${ukRow.sodium}`);
// Potassium unlisted: 1200 * (40/100) = 480mg
assert(ukRow.potassium === 480, 'Unlisted potassium correctly scaled: 480mg', `Got ${ukRow.potassium}`);

// -------------------------------------------------------------------
// TEST 4: Restaurant / Plated Food (rawNutritionLabel: null)
// -------------------------------------------------------------------
console.log('\n--- Suite 4: Restaurant / Plated Meal (No Label) ---');
const restaurantSalmon: FoodItemInput = {
  foodName: 'Grilled Atlantic Salmon with Lemon & Olive Oil',
  genericEnglishName: 'salmon fillet',
  weightGrams: 220,
  packGrams: 220,
  rawNutritionLabel: null, // No nutrition label in a restaurant!
  nutrientsBasis: 'per_100g',
  nutrients: {
    calories: 206, // per 100g
    protein: 22.1,
    totalFat: 12.3,
    saturatedFat: 2.5,
    carbs: 0,
    fiber: 0,
    totalSugars: 0,
    sodium: 61,
    potassium: 384,
    calcium: 12,
    iron: 0.8,
    magnesium: 29,
    phosphorus: 252,
    zinc: 0.6,
    selenium: 36.5,
    vitaminA: 40,
    vitaminC: 0,
    vitaminD: 11.0,
    vitaminB12: 3.2,
    cholesterol: 63,
  },
};

const salmonRow = processFoodItem(restaurantSalmon);
// 206 * 2.2 = 453.2 -> 453 kcal
assert(salmonRow.calories === 453, 'Restaurant salmon calories scaled to 220g = 453', `Got ${salmonRow.calories}`);
// 22.1 * 2.2 = 48.62 -> 48.6g protein
assert(salmonRow.protein === 48.6, 'Restaurant salmon protein scaled to 220g = 48.6g', `Got ${salmonRow.protein}`);
assert(salmonRow.selenium > 70, 'Restaurant salmon selenium scaled properly', `Got ${salmonRow.selenium}`);
assert(salmonRow.vitaminD > 20, 'Restaurant salmon vitamin D scaled properly', `Got ${salmonRow.vitaminD}`);

// -------------------------------------------------------------------
// TEST 5: Entire Meal Analysis & Discrepancy Detection
// -------------------------------------------------------------------
console.log('\n--- Suite 5: Multi-Food Meal & Weight Discrepancy ---');
const quakerOats: FoodItemInput = {
  foodName: 'Quaker Instant Oatmeal',
  weightGrams: 35, // single pouch
  packGrams: 210, // entire box with 6 packets
  rawNutritionLabel: {
    servingSize: '35g',
    calories: '150',
    protein: '4g',
    totalFat: '2.5g',
    totalCarbohydrate: '27g',
    fiber: '3g',
    sodium: '75mg',
  },
  nutrients: {
    potassium: 150,
    magnesium: 40,
    iron: 3.6,
  },
};

const mealResult = processFoodsAnalysis('Breakfast Oat & Orange Drink', [quakerOats, hemavitonFood]);
assert(mealResult.rows.length === 2, 'Generated 2 distinct meal rows');
assert(mealResult.weightDifferenceDetected === true, 'Correctly detected package (210g) vs serving (35g) discrepancy');
assert(mealResult.aggregatedTotals.calories === 240, 'Aggregated calories: 150 + 90 = 240', `Got ${mealResult.aggregatedTotals.calories}`);
assert(mealResult.aggregatedTotals.protein === 4.0, 'Aggregated protein: 4.0 + 0 = 4.0g', `Got ${mealResult.aggregatedTotals.protein}`);
assert(mealResult.atwaterEvaluation.withinTolerance === true, 'Atwater thermodynamic balance holds true');

// -------------------------------------------------------------------
// TEST 6: Editing / Re-scaling Weight
// -------------------------------------------------------------------
console.log('\n--- Suite 6: Editing Weight (Scaling In Place) ---');
// User edits oatmeal weight from 35g to 200g
const editedOats: FoodItemInput = {
  ...quakerOats,
  weightGrams: 200,
};
const editedRow = processFoodItem(editedOats);
// (200 / 35) * 150 = 857.14 -> 857 kcal
assert(editedRow.calories === 857, 'Scaled 35g -> 200g gives 857 kcal', `Got ${editedRow.calories}`);
// (200 / 35) * 4g protein = 22.85 -> 22.9g
assert(editedRow.protein === 22.9, 'Scaled 35g -> 200g gives 22.9g protein', `Got ${editedRow.protein}`);

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed`);
console.log('====================================================');

if (passedTests === totalTests) {
  console.log('🎉 ALL ENGINE TESTS PASSED WITH 100% ACCURACY!');
} else {
  console.error('❌ SOME TESTS FAILED');
}
