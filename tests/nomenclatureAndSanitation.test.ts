import { formatStandardMealPhotoName, normalizeDateToISO } from '../src/utils/driveUploader';
import { mapRowToHeaders, normalizeHeader, buildHeaderIndexMap, findHeaderIndex } from '../src/utils/sheetRowMapper';

function runTests() {
  console.log('🧪 Starting Nomenclature & Sanitation Verification Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(testName: string, actual: any, expected: any) {
    if (actual === expected) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      console.error(`     Expected: ${expected}`);
      console.error(`     Actual:   ${actual}`);
      failed++;
    }
  }

  // Test 1: Standard Canonical Name Generation
  console.log('--- Test Suite 1: formatStandardMealPhotoName ---');
  const name1 = formatStandardMealPhotoName({
    mealId: 'M-028',
    dishName: 'Quaker Oatmeal Bowl',
    imageIndex: 0,
    dateStr: '2026-09-11',
  });
  assert('Generates single/first photo canonical name', name1, 'M-028_Quaker_Oatmeal_Bowl_photo1_2026-09-11.jpg');

  const name2 = formatStandardMealPhotoName({
    mealId: 'M-028',
    dishName: 'Peanuts Nutrition Label',
    imageIndex: 1,
    dateStr: '2026-09-11',
  });
  assert('Generates second photo canonical name', name2, 'M-028_Peanuts_Nutrition_Label_photo2_2026-09-11.jpg');

  // Test 2: Sanitization of special characters and spacing
  const name3 = formatStandardMealPhotoName({
    mealId: 'm-015',
    dishName: 'Kuaci @ Biji & Bunga (Matahari) #1!',
    imageIndex: 0,
    dateStr: '2026-09-06',
  });
  assert('Sanitizes special characters into Title_Snake_Case', name3, 'M-015_Kuaci_Biji_Bunga_Matahari_1_photo1_2026-09-06.jpg');

  // Test 3: Date formatting normalization
  const name4 = formatStandardMealPhotoName({
    mealId: 'M-007',
    dishName: 'Steamed Chicken Rice',
    imageIndex: 2,
    dateStr: '2026/09/10', // Slash formatted date
  });
  assert('Normalizes slashed date to ISO format', name4, 'M-007_Steamed_Chicken_Rice_photo3_2026-09-10.jpg');

  // Test 4: normalizeDateToISO function directly
  console.log('\n--- Test Suite 2: normalizeDateToISO ---');
  assert('Handles YYYY-MM-DD', normalizeDateToISO('2026-09-11'), '2026-09-11');
  assert('Handles YYYY/MM/DD', normalizeDateToISO('2026/9/10'), '2026-09-10');
  assert('Handles DD/MM/YYYY', normalizeDateToISO('10/09/2026'), '2026-09-10');

  // Test 5: Regex Parsing Verification
  console.log('\n--- Test Suite 3: Universal Regex Parser Validation ---');
  const canonicalRegex = /^(M-\d+)_[A-Za-z0-9_-]+_photo\d+_\d{4}-\d{2}-\d{2}\.[a-zA-Z0-9]+$/;
  assert('Regex validates canonical photo 1', canonicalRegex.test('M-028_Quaker_Oatmeal_Bowl_photo1_2026-09-11.jpg'), true);
  assert('Regex validates canonical photo 2', canonicalRegex.test('M-028_Peanuts_Nutrition_Label_photo2_2026-09-11.jpg'), true);
  assert('Regex rejects legacy non-standard filename', canonicalRegex.test('meal_M-028_photo_1.jpg'), false);
  assert('Regex rejects raw camera filename', canonicalRegex.test('IMG_20260911_123456.jpg'), false);

  // Test 6: Image Buffer Verification Logic (Rejecting HTML 302 responses)
  console.log('\n--- Test Suite 4: Buffer Image Verification ---');
  function isBufferValidImage(buf: Buffer): boolean {
    if (!buf || buf.length < 32) return false;
    const startStr = buf.slice(0, 80).toString('utf8').toLowerCase();
    if (startStr.includes('<!doctype') || startStr.includes('<html') || startStr.includes('accounts.google.com') || startStr.includes('<script')) {
      return false;
    }
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
    if (buf.slice(0, 3).toString('ascii') === 'GIF') return true;
    return false;
  }

  const fakeHtmlRedirect = Buffer.from('<!DOCTYPE html><html><head><title>Google Accounts</title></head><body>Redirecting...</body></html>');
  assert('Rejects HTML redirect buffer', isBufferValidImage(fakeHtmlRedirect), false);

  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(40).fill(0)]);
  assert('Accepts valid JPEG header buffer', isBufferValidImage(fakeJpeg), true);

  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(40).fill(0)]);
  assert('Accepts valid PNG header buffer', isBufferValidImage(fakePng), true);

  // Test 7: Batch Chunking Algorithm Validation
  console.log('\n--- Test Suite 5: Batch Chunking Logic ---');
  function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  const dummyPhotos = Array.from({ length: 35 }, (_, i) => `photo_${i + 1}.jpg`);
  const chunksOf10 = chunkArray(dummyPhotos, 10);
  assert('35 photos divided by 10 yields 4 batches', chunksOf10.length, 4);
  assert('First batch has 10 photos', chunksOf10[0].length, 10);
  assert('Last batch has 5 photos', chunksOf10[3].length, 5);

  const chunksOf5 = chunkArray(dummyPhotos, 5);
  assert('35 photos divided by 5 yields 7 batches', chunksOf5.length, 7);

  // Test 8: Dynamic Header Mapping (No "Meal Slot" Column Test)
  console.log('\n--- Test Suite 6: Dynamic Header Mapping (Zero Column Shift) ---');

  const headersWithoutMealSlot = [
    'Dish Name', 'Meal ID', 'Date', 'Ingredient / Component', 'Weight (g)',
    'Calories (kcal)', 'Protein (g)', 'Total Fat (g)', 'Saturated Fat (g)', 'Carbohydrates (g)'
  ];

  const sampleMealRow = {
    dishName: 'Indomaret Kacang Kulit',
    mealId: 'M-033',
    date: '2026-09-12',
    mealSlot: 'Breakfast', // Note: Meal Slot is NOT in headers!
    ingredient: 'roasted peanuts in shell',
    weightG: 180,
    calories: 1093,
    protein: 51.4,
    totalFat: 83.6,
    saturatedFat: 16.1,
    carbs: 45.2,
  };

  const mappedRow = mapRowToHeaders(sampleMealRow, 0, headersWithoutMealSlot);

  assert('Col 0 (Dish Name) maps to "Indomaret Kacang Kulit"', mappedRow[0], 'Indomaret Kacang Kulit');
  assert('Col 1 (Meal ID) maps to "M-033"', mappedRow[1], 'M-033');
  assert('Col 2 (Date) maps to "2026-09-12"', mappedRow[2], '2026-09-12');
  assert('Col 3 (Ingredient / Component) maps to "roasted peanuts in shell" (NOT "Breakfast")', mappedRow[3], 'roasted peanuts in shell');
  assert('Col 4 (Weight (g)) maps to 180', mappedRow[4], 180);
  assert('Col 5 (Calories (kcal)) maps to 1093', mappedRow[5], 1093);
  assert('Col 6 (Protein (g)) maps to 51.4', mappedRow[6], 51.4);
  assert('Col 7 (Total Fat (g)) maps to 83.6', mappedRow[7], 83.6);
  assert('Col 8 (Saturated Fat (g)) maps to 16.1', mappedRow[8], 16.1);
  assert('Col 9 (Carbohydrates (g)) maps to 45.2', mappedRow[9], 45.2);

  // Test 9: Standard 41-Column Header Schema Mapping
  console.log('\n--- Test Suite 7: Full 41-Column Standard Header Mapping ---');
  const full41Headers = [
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

  const mapped41Row = mapRowToHeaders({
    ...sampleMealRow,
    mealDiagnosis: 'Clinical diagnosis note',
    photoUrl: 'https://lh3.googleusercontent.com/d/file123',
  }, 0, full41Headers);

  assert('Col 3 (Meal Slot) maps to "Breakfast" when column exists', mapped41Row[3], 'Breakfast');
  assert('Col 4 (Ingredient) maps to "roasted peanuts in shell"', mapped41Row[4], 'roasted peanuts in shell');
  assert('Col 38 (Meal Diagnosis) populated on index 0', mapped41Row[38], 'Clinical diagnosis note');
  assert('Col 40 (Photo URL) populated on index 0', mapped41Row[40], 'https://lh3.googleusercontent.com/d/file123');

  // Test 10: Enforce Zero-Duplication on index 1..N
  const mapped41RowIdx1 = mapRowToHeaders({
    ...sampleMealRow,
    ingredient: 'second ingredient',
    mealDiagnosis: 'Clinical diagnosis note',
    photoUrl: 'https://lh3.googleusercontent.com/d/file123',
  }, 1, full41Headers);

  assert('Col 38 (Meal Diagnosis) is EMPTY on index 1 (Zero-Duplication)', mapped41RowIdx1[38], '');
  assert('Col 40 (Photo URL) is EMPTY on index 1 (Zero-Duplication)', mapped41RowIdx1[40], '');

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
