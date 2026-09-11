import { GoogleGenAI } from '@google/genai';
import { processFoodsAnalysis, FoodItemInput } from './src/utils/nutritionEngine';

console.log('====================================================');
console.log('TESTING AI AGENT WITH CONCISE NUTRITION SCHEMA');
console.log('====================================================\n');

async function runAgentTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is missing');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3.5-flash-lite';

  const systemPrompt = `You are an elite Clinical Nutritionist and AI Dietitian reviewing meals and food packaging photos.

YOUR TASK:
Analyze the meal and return a structured JSON response.

CRITICAL SCHEMA MANDATE:
Output JSON matching this exact structure:
{
  "dishName": string,
  "mealDiagnosis": string (Clinical impact of this meal),
  "dailyDiagnosis": string (Impact on daily nutrition targets),
  "clinicalSummary": string (Markdown formatted clinical summary),
  "foods": [
    {
      "foodName": string,
      "genericEnglishName": string,
      "packageLabelText": string or null (verbatim packaging text if packaged food, null if restaurant meal),
      "weightGrams": number (consumed portion weight),
      "packGrams": number (full net package weight if packaged food, or portion weight),
      "sourceImageIndex": number,
      "rawNutritionLabel": {
        "servingSize": string (e.g. "330 ml" or "35g" or "100g"),
        "calories": string (e.g. "89.55 kkal" or "150"),
        "energyKj": string (e.g. "620 kJ"),
        "protein": string (e.g. "4g"),
        "totalFat": string (e.g. "2.5g"),
        "saturatedFat": string,
        "transFat": string,
        "totalCarbohydrate": string (e.g. "22g"),
        "sugar": string,
        "addedSugar": string,
        "totalFibre": string,
        "sodium": string (e.g. "50mg"),
        "salt": string (e.g. "0.4g"),
        "potassium": string,
        "calcium": string,
        "iron": string
      } OR null if restaurant/home-cooked meal with no nutrition label,
      "nutrients": {
        // IMPORTANT:
        // 1. If rawNutritionLabel is PRESENT: Put ONLY the nutrients that are NOT on the label (the unlisted blanks: e.g. zinc, magnesium, selenium, vitamins A/C/D/E/K, B-complex, folate). DO NOT repeat calories, protein, carbs, or sodium here!
        // 2. If rawNutritionLabel is NULL (restaurant food): Provide estimated nutrient values for this food's weightGrams portion.
      }
    }
  ]
}

DO NOT DUPLICATE NUTRIENTS: The software engine converts units and merges declared and unlisted nutrients.`;

  // Test Case A: Packaged Food (Hemaviton C1000 Orange Drink)
  console.log('Testing Case A: Packaged Food (Hemaviton C1000 Orange Drink)...');
  const responseA = await ai.models.generateContent({
    model: modelName,
    contents: [
      { text: systemPrompt },
      {
        text: `Analyze this packaged drink:
Brand: Hemaviton C1000 Total Care Orange Flavour
Net Volume: 330 ml can
Printed Nutrition Facts:
Serving size: 330 ml (1 can)
Energy: 89.55 kkal
Total Carbohydrate: 22g
Sugar: 21g
Added Sugar: 21g
Sodium: 50mg
Protein: 0g
Total Fat: 0g
Saturated Fat: 0g
Dietary Fiber: 0g
Ingredients: Water, Sugar, Vitamin C (1000mg), Niacinamide (10mg), Vitamin B6 (5mg), Vitamin B12 (2.4mcg), Zinc Picolinate (2.5mg), Orange Flavor.`
      }
    ],
    config: {
      responseMimeType: 'application/json',
    }
  });

  const parsedA = JSON.parse(responseA.text || '{}');
  console.log('Agent Response A:', JSON.stringify(parsedA, null, 2));

  if (!parsedA.foods || !Array.isArray(parsedA.foods) || parsedA.foods.length === 0) {
    throw new Error('Case A failed: no foods array returned');
  }

  const foodA = parsedA.foods[0];
  console.log('\nValidating Case A Structure:');
  console.log('- foodName:', foodA.foodName);
  console.log('- rawNutritionLabel present:', Boolean(foodA.rawNutritionLabel));
  console.log('- calories in rawNutritionLabel:', foodA.rawNutritionLabel?.calories);
  console.log('- sodium in rawNutritionLabel:', foodA.rawNutritionLabel?.sodium);
  console.log('- unlisted nutrients provided:', Object.keys(foodA.nutrients || {}));

  // Run through our deterministic engine
  const processedA = processFoodsAnalysis(parsedA.dishName || 'Hemaviton C1000', parsedA.foods);
  console.log('\nProcessed Engine Output for Case A:');
  console.log('- Aggregated Calories:', processedA.aggregatedTotals.calories);
  console.log('- Aggregated Sodium:', processedA.aggregatedTotals.sodium, 'mg');
  console.log('- Total Rows:', processedA.rows.length);
  console.log('- Row 0 Calories:', processedA.rows[0].calories);
  console.log('- Row 0 Sodium:', processedA.rows[0].sodium);
  console.log('- Row 0 Vitamin C:', processedA.rows[0].vitaminC);
  console.log('- Row 0 Zinc:', processedA.rows[0].zinc);

  if (processedA.aggregatedTotals.calories < 85 || processedA.aggregatedTotals.calories > 95) {
    throw new Error(`Expected calories ~90, got ${processedA.aggregatedTotals.calories}`);
  }
  if (processedA.aggregatedTotals.sodium !== 50) {
    throw new Error(`Expected sodium 50mg, got ${processedA.aggregatedTotals.sodium}`);
  }
  console.log('✅ Case A PASSED with high precision!\n');

  // Test Case B: Restaurant Meal without packaging (Grilled Salmon Plate)
  console.log('Testing Case B: Restaurant Meal without label (Grilled Salmon with Asparagus)...');
  const responseB = await ai.models.generateContent({
    model: modelName,
    contents: [
      { text: systemPrompt },
      {
        text: `Analyze this restaurant meal photo:
A plated meal at a seafood bistro:
- 200g Grilled Norwegian Salmon fillet brushed with olive oil and dill
- 100g Steamed green asparagus with cracked black pepper
- 150g Roasted baby red potatoes with skin
Note: This is fresh restaurant cooking. There is no printed packaging or nutrition label.`
      }
    ],
    config: {
      responseMimeType: 'application/json',
    }
  });

  const parsedB = JSON.parse(responseB.text || '{}');
  console.log('Agent Response B summary:');
  console.log('- dishName:', parsedB.dishName);
  console.log('- foods count:', parsedB.foods?.length);
  parsedB.foods?.forEach((f: any, idx: number) => {
    console.log(`  Food ${idx + 1}: ${f.foodName}, rawNutritionLabel is null: ${f.rawNutritionLabel === null}, nutrients count: ${Object.keys(f.nutrients || {}).length}`);
  });

  const processedB = processFoodsAnalysis(parsedB.dishName || 'Grilled Salmon Plate', parsedB.foods);
  console.log('\nProcessed Engine Output for Case B:');
  console.log('- Total Portion Weight:', processedB.portionWeightG, 'g');
  console.log('- Aggregated Calories:', processedB.aggregatedTotals.calories, 'kcal');
  console.log('- Aggregated Protein:', processedB.aggregatedTotals.protein, 'g');
  console.log('- Aggregated Carbs:', processedB.aggregatedTotals.carbs, 'g');
  console.log('- Aggregated Fat:', processedB.aggregatedTotals.totalFat, 'g');
  console.log('- Aggregated Potassium:', processedB.aggregatedTotals.potassium, 'mg');
  console.log('- Atwater within tolerance:', processedB.atwaterEvaluation.withinTolerance);

  if (processedB.aggregatedTotals.calories < 300 || processedB.aggregatedTotals.calories > 900) {
    throw new Error(`Unreasonable calories for salmon plate: ${processedB.aggregatedTotals.calories}`);
  }
  console.log('✅ Case B PASSED with realistic clinical nutrition calculations!\n');

  console.log('====================================================');
  console.log('🎉 ALL AI AGENT & ENGINE INTEGRATION TESTS PASSED!');
  console.log('====================================================');
}

runAgentTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
