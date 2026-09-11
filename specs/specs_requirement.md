# Specifications Requirement: Universal Packaging OCR Nutrition Reading Engine

**Document Version:** 1.0.0  
**Target Environment:** AI Studio NutriHealth Multi-Photo Meal Log Engine  
**Companion Documents:** `specs/original_requirements.md`, `specs/implementation_plan.md`, `AGENTS.md`

---

## 1. Executive Summary & Problem Statement

Modern nutritional packaging varies drastically across manufacturers and countries:
- **Basis Variation:** Labels declare nutritional values per **serving** (e.g., "1 pouch / 35g"), per **100g / 100ml** (standard in Europe, UK, and Australasia), per **entire dish / container** (ready-to-eat meals, beverages), or occasionally **calories-only** (e.g., vending snack fronts or fast-food packs).
- **International Terminology & Metrics:**
  - European/UK labels report **Salt** in grams, whereas US/Canadian/Asian labels report **Sodium** in milligrams.
  - Energy is frequently declared in **kJ** (kilojoules), **kcal** (calories), or both.
  - Carbohydrates in the EU represent *available carbohydrates* (excluding dietary fiber), whereas US FDA labels report *total carbohydrates* (including dietary fiber).
- **Incomplete Micronutrient Declarations:** Commercial packaging mandates only a minimal subset of nutrients (e.g., Big 8 or Big 14), leaving vital clinical nutrients (potassium, magnesium, zinc, selenium, B-complex vitamins, folate) blank.
- **Serving vs. Package Discrepancy:** Consumers frequently consume either a fraction of a package or the entire container. An automated clinical tool must distinguish between declared serving weight, total package weight, and actual consumed weight.

To solve this, the nutrition reading engine employs a **two-tier structured extraction model**:
1. `rawLabel`: Verbatim OCR of what is explicitly printed on the physical packaging, preserving original text, units, serving metrics, and the complete ingredient list.
2. `estimatedNutrientsPer100g`: A standardized 100g clinical nutrient vector (38 nutrients). When packaging omits a nutrient, the agent imputes the missing value from reference clinical datasets (USDA FoodData Central / McCance & Widdowson) based on the **full ingredient list**.

The client-side and server-side processing engine then performs deterministic mathematical transformation to scale the meal to the exact consumed weight, maintaining Atwater thermodynamic balance.

---

## 2. Architectural Data Flow

```
   ┌────────────────────────────────────────────────────────┐
   │             Packaging Photo / Camera Capture           │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │    Multimodal Model (e.g., gemini-3.5-flash-lite)      │
   │    Prompted with Strict JSON Schema & Packaging Rules  │
   └───────────────────────────┬────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   ┌───────────────────────┐            ┌───────────────────────┐
   │      rawLabel         │            │ estimatedNutrients-   │
   │  - Verbatim OCR text  │            │ Per100g (38 columns)  │
   │  - Basis (serving/    │            │ - Complete 100g base  │
   │    100g/dish/calories)│            │ - Imputes unlisted    │
   │  - Total package wt   │            │   micronutrients from │
   │  - Full ingredients   │            │   full ingredient list│
   │  - Salt/Sodium & kJ   │            │ - Source provenance   │
   └───────────┬───────────┘            └───────────┬───────────┘
               │                                    │
               └──────────────────┬─────────────────┘
                                  │
                                  ▼
   ┌────────────────────────────────────────────────────────┐
   │      Deterministic Normalization & Scaling Engine       │
   │  1. Salt ↔ Sodium conversion (Salt g * 393.4 => Na mg) │
   │  2. kJ ↔ kcal conversion (kJ / 4.184 => kcal)          │
   │  3. Carbohydrate & fiber harmonization                 │
   │  4. Target weight scaling: (targetWeightG / 100g)      │
   │  5. Atwater energy balance check (4-4-9-2 rule)        │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │        Final Output: 38-Column MealLogRow Array        │
   │   (Ready for UI Review, User Edit, Sheet Sync & Drive) │
   └────────────────────────────────────────────────────────┘
```

---

## 3. Schema Specifications

### 3.1 `rawLabel` Schema (Verbatim Packaging OCR)

The `rawLabel` object captures raw ground truth directly from the image without extrapolation.

```typescript
export interface RawPackagingLabel {
  /** True if the image contains commercial/packaged food with nutrition labeling */
  isPackagedFood: boolean;

  /** Declared brand name (e.g., "Quaker", "Nestlé", "KRAFT") */
  brandName?: string;

  /** Declared product title (e.g., "Instant Oatmeal", "Greek Yogurt") */
  productName?: string;

  /** Flavor, variety, or variant (e.g., "Original", "Vanilla", "Honey Roasted") */
  variantOrFlavor?: string;

  /** Basis of the printed nutrition numbers */
  basisType: 'per_serving' | 'per_100g' | 'per_dish' | 'per_100ml' | 'calories_only' | 'mixed_multi_column';

  /** Verbatim serving size text (e.g., "1 packet (35g)", "2 biscuits (50g)", "1/2 cup (120ml)") */
  servingSizeText?: string;

  /** Extracted weight in grams for a single serving. Null if unknown/unspecified */
  servingWeightG?: number;

  /** Declared servings per package/container (e.g., 6, 1.5, 1) */
  servingsPerContainer?: number;

  /** Declared total net weight or volume of the entire package (e.g., 200 for "Net Wt 200g") */
  totalPackageWeightG?: number;

  /** Method used to identify total weight */
  totalWeightDetermination: 'explicit_label_net_weight' | 'calculated_serving_times_count' | 'estimated_visual' | 'unknown';

  /** 
   * Verbatim full ingredient list printed on packaging.
   * MUST NOT be a summary. Must preserve full commas, sub-ingredients in parentheses,
   * vitamins, minerals, and allergen warnings.
   */
  fullIngredientsText: string;

  /** Regulatory standard detected on package */
  regulatoryStandard: 'US_FDA' | 'EU_UK' | 'AU_NZ' | 'EAST_ASIA' | 'LATIN_AMERICA' | 'INTERNATIONAL' | 'UNKNOWN';

  /** Exact verbatim nutrients printed on the label, with units attached */
  declaredNutrients: {
    energyKcal?: string; // e.g. "150 kcal"
    energyKj?: string;   // e.g. "628 kJ"
    protein?: string;    // e.g. "4.0g"
    totalFat?: string;   // e.g. "2.5g"
    saturatedFat?: string; // e.g. "0.5g"
    transFat?: string;   // e.g. "0g"
    monounsaturatedFat?: string;
    polyunsaturatedFat?: string;
    carbohydrates?: string; // e.g. "27g"
    dietaryFiber?: string;  // e.g. "3g"
    totalSugars?: string;   // e.g. "1g"
    addedSugars?: string;   // e.g. "0g"
    sodiumMg?: string;      // e.g. "75mg"
    saltG?: string;         // e.g. "0.19g" (EU/UK packaging)
    potassium?: string;     // e.g. "140mg"
    calcium?: string;       // e.g. "100mg" or "10% DV"
    iron?: string;          // e.g. "3.6mg" or "20% DV"
    cholesterol?: string;   // e.g. "0mg"
    vitaminA?: string;
    vitaminC?: string;
    vitaminD?: string;
    otherVitaminsMinerals?: Record<string, string>;
  };
}
```

### 3.2 `estimatedNutrientsPer100g` Schema (Standardized 100g Vector)

The second JSON field provides a complete 100g baseline across all 38 clinical columns. If a nutrient was absent on the label, the model fills it based on food science composition of the `fullIngredientsText`.

```typescript
export interface NutrientPer100gEntry {
  value: number;
  source: 'label_exact' | 'label_converted' | 'imputed_from_ingredients';
}

export interface EstimatedNutrientsPer100g {
  // Energetics & Macros
  calories: NutrientPer100gEntry;        // kcal per 100g
  protein: NutrientPer100gEntry;         // g per 100g
  totalFat: NutrientPer100gEntry;        // g per 100g
  saturatedFat: NutrientPer100gEntry;    // g per 100g
  monounsaturatedFat: NutrientPer100gEntry; // g per 100g
  polyunsaturatedFat: NutrientPer100gEntry; // g per 100g
  transFat: NutrientPer100gEntry;        // g per 100g
  carbs: NutrientPer100gEntry;           // g per 100g
  fiber: NutrientPer100gEntry;           // g per 100g
  totalSugars: NutrientPer100gEntry;     // g per 100g
  addedSugars: NutrientPer100gEntry;     // g per 100g
  cholesterol: NutrientPer100gEntry;     // mg per 100g

  // Minerals
  sodium: NutrientPer100gEntry;          // mg per 100g
  potassium: NutrientPer100gEntry;       // mg per 100g
  calcium: NutrientPer100gEntry;         // mg per 100g
  iron: NutrientPer100gEntry;            // mg per 100g
  magnesium: NutrientPer100gEntry;       // mg per 100g
  phosphorus: NutrientPer100gEntry;      // mg per 100g
  zinc: NutrientPer100gEntry;            // mg per 100g
  selenium: NutrientPer100gEntry;        // mcg per 100g

  // Vitamins
  vitaminA: NutrientPer100gEntry;        // mcg RAE per 100g
  vitaminC: NutrientPer100gEntry;        // mg per 100g
  vitaminD: NutrientPer100gEntry;        // mcg per 100g
  vitaminE: NutrientPer100gEntry;        // mg per 100g
  vitaminK: NutrientPer100gEntry;        // mcg per 100g
  thiaminB1: NutrientPer100gEntry;       // mg per 100g
  riboflavinB2: NutrientPer100gEntry;    // mg per 100g
  niacinB3: NutrientPer100gEntry;        // mg NE per 100g
  vitaminB6: NutrientPer100gEntry;       // mg per 100g
  folate: NutrientPer100gEntry;          // mcg DFE per 100g
  vitaminB12: NutrientPer100gEntry;      // mcg per 100g
}
```

---

## 4. International Normalization & Conversion Processing Engine

The processing engine accepts `rawLabel` and `estimatedNutrientsPer100g` and calculates the actual consumed meal row.

### 4.1 Unit & Metric Conversion Rules

1. **Salt to Sodium Conversion (International Harmonization):**
   - If `saltG` is present and `sodiumMg` is missing:
     $$\text{Sodium (mg)} = \text{Salt (g)} \times 1000 \times \frac{22.99}{58.44} \approx \text{Salt (g)} \times 393.4$$
     *(Standard European Commission / UK FSA factor: $1\text{g salt} = 400\text{mg sodium}$ or $393.4\text{mg sodium}$)*.
   - If `sodiumMg` is present and `saltG` is needed:
     $$\text{Salt (g)} = \frac{\text{Sodium (mg)} \times 2.5}{1000}$$

2. **Kilojoules (kJ) to Kilocalories (kcal) Conversion:**
   - If only `energyKj` is declared:
     $$\text{kcal} = \frac{\text{kJ}}{4.184}$$

3. **Carbohydrate and Fiber Alignment:**
   - **EU/UK/Australia Convention:** The declared "Carbohydrate" figure already excludes fiber (available carbohydrate). Total Carbohydrate for Atwater consistency is:
     $$\text{Total Carbs} = \text{Declared Carbs} + \text{Fiber}$$
   - **US FDA / East Asia Convention:** Declared "Total Carbohydrate" includes dietary fiber. Available net carbs are:
     $$\text{Net Carbs} = \text{Total Carbohydrates} - \text{Fiber}$$

4. **Vitamin Unit Harmonization:**
   - **Vitamin A:** $1\text{ IU retinol} = 0.3\text{ mcg RAE}$. $1\text{ IU beta-carotene} = 0.15\text{ mcg RAE}$.
   - **Vitamin D:** $1\text{ mcg} = 40\text{ IU}$ (or $1\text{ IU} = 0.025\text{ mcg}$).
   - **Vitamin E:** $1\text{ IU d-alpha-tocopherol} = 0.67\text{ mg}$.
   - **Folate:** $1\text{ mcg food folate} = 1\text{ mcg DFE}$. $1\text{ mcg synthetic folic acid} = 1.7\text{ mcg DFE}$.

### 4.2 Scaling to Target Consumed Weight

The user may consume:
- A single serving (portion weight)
- The entire package (total package weight)
- A custom weighed portion (e.g., 200g on a kitchen scale)

Given target weight $W_{\text{target}}$ in grams:
$$\text{Scaling Ratio } R = \frac{W_{\text{target}}}{100}$$

For each nutrient $N$:
$$\text{Nutrient Value} = R \times \text{estimatedNutrientsPer100g}[N].\text{value}$$

### 4.3 Thermodynamic & Atwater Consistency Verification

Every calculated meal row undergoes an Atwater balance check:
$$\text{Atwater Energy (kcal)} = (4 \times \text{Protein}) + (4 \times \text{Available Carbs}) + (9 \times \text{Total Fat}) + (2 \times \text{Dietary Fiber})$$

- Caloric tolerance threshold: $\pm 5\%$ to $8\%$ (or $\le 30\text{ kcal}$ for small portions).
- Caloric density check: $\text{Caloric Density} = \frac{\text{Calories}}{W_{\text{target}}\text{ (g)}}$.
  - Whole foods: $0.3 - 2.5\text{ kcal/g}$.
  - Dehydrated powders / nuts / seeds: $3.5 - 6.5\text{ kcal/g}$.
  - Pure oils / fats: $\approx 9.0\text{ kcal/g}$.
  - Any value exceeding $9.2\text{ kcal/g}$ fails thermodynamic validation.

---

## 5. Add, Edit, and Delete Lifecycle Integration

### 5.1 ADD Lifecycle (New Photo Analysis)

```
1. User uploads 1 to N photos (Packaging + Plated food).
2. Agent runs Multimodal OCR & Nutrient Imputation.
3. Response contains:
   - `rawLabel`
   - `estimatedNutrientsPer100g`
   - `totalDishWeightG` & `portionWeightG`
   - Standard 38-column `rows`
4. UI displays:
   - Verbatim Packaging OCR card with toggle to inspect raw values.
   - Discrepancy warning banner if `totalDishWeightG` != `portionWeightG`.
   - Full Ingredient list card.
5. User confirms or adjusts weight.
6. Commit executes:
   - Atomic upload of images to Google Drive with standardized filename:
     `{MealID}_{Dish_Name}_{Date}_photo{N}.jpg`
   - Atomic bounded PUT append to Google Sheet "meal log" tab.
   - Post-snapshot verification: verifies row count increased and mealId matches.
```

### 5.2 EDIT Lifecycle (Multi-Turn Conversational & Direct Table Adjustments)

The system must handle three types of edits:
1. **Weight Scaling Edit:** User says *"set the weight for quaker to 200g"* or edits weight in the breakdown table:
   - The engine scales *only* that component row using $R = \frac{\text{newWeight}}{\text{oldWeight}}$ applied to its 38 nutrient values.
   - Non-targeted rows are preserved byte-for-byte.
   - Aggregated totals and diagnoses are recalculated.
2. **Raw Label Override:** User corrects an OCR misread (e.g., changes protein from 3.0g to 4.0g in `rawLabel`):
   - The 100g baseline updates: `estimatedNutrientsPer100g.protein.value = 4.0 / (servingWeight / 100)`.
   - The meal row regenerates from the updated 100g baseline.
3. **Google Sheet Row Update:**
   - Identifies existing row range in Google Sheet by composite key `(dateStr + '_' + mealId)`.
   - Executes targeted `spreadsheets.values.update` over the exact row span.
   - Performs a post-update read snapshot to verify that the updated values match expected outputs.

### 5.3 DELETE Lifecycle (Complete Deletion & Rollback)

1. User triggers meal deletion in UI or through agent conversation.
2. System locates all row indices matching `mealId` in the Google Sheet.
3. Executes `spreadsheets.batchUpdate` with `DeleteDimensionRequest` to cleanly excise rows without leaving blank lines.
4. Identifies all Drive File IDs stored in `driveFileIds` or retrieved from Drive query `appProperties has { key='mealId', value='M-XXX' }`.
5. Permanently trashes/deletes associated Drive photo files.
6. Verification Gate:
   - Re-fetches Sheet rows to confirm `mealId` is 0.
   - Re-queries Drive to confirm 0 files remain.
   - Telemetry log logs deletion event with timestamps and before/after verification states.

---

## 6. Prompt Instructions and Required JSON Schema

The system prompt to the multimodal model must strictly enforce:
1. Verbatim OCR reproduction under `rawLabel`.
2. Full, un-summarized ingredient text under `fullIngredientsText`.
3. Complete 100g standardization under `estimatedNutrientsPer100g` with field-by-field completion of missing nutrients.
4. Strict JSON schema adhering to `@google/genai` standards.

### 6.1 Agent System Prompt Instruction Block

```markdown
PACKAGING NUTRITION READING MANDATE:
When an image contains commercial food packaging or a Nutrition Facts / Nutrition Information panel:
1. RAW LABEL FIELD (`rawLabel`):
   - Transcribe EXACTLY what is written on the packaging. Do not correct typos, do not convert units, do not summarize.
   - Determine basisType: 'per_serving' | 'per_100g' | 'per_dish' | 'per_100ml' | 'calories_only'.
   - Extract servingSizeText, servingWeightG, servingsPerContainer, and totalPackageWeightG.
   - Transcribe the FULL ingredient list into `fullIngredientsText` verbatim. Include all parenthetical sub-ingredients, enrichment vitamins, and food additives.
   - Note country regulatory standard (US FDA, EU/UK, East Asia, etc.). If 'Salt' is declared instead of 'Sodium', capture saltG verbatim.
2. ESTIMATED NUTRIENTS PER 100G (`estimatedNutrientsPer100g`):
   - Standardize all 38 clinical columns to exactly 100 grams.
   - If a nutrient is explicitly on the label, scale it to 100g and mark source: 'label_exact' or 'label_converted'.
   - If a nutrient is NOT on the label (e.g. potassium, magnesium, zinc, folate, B vitamins, monounsaturated fat), you MUST impute it using USDA FoodData Central clinical reference values based on the ingredients list, and mark source: 'imputed_from_ingredients'.
   - NEVER leave any nutrient null or zero unless the food naturally contains zero of that nutrient.
3. TOTAL MEAL PORTION ROWS (`rows`):
   - Scale the 100g values to the consumed portion weight.
   - Enforce Atwater balance: 4*Protein + 4*Carbs + 9*Fat + 2*Fiber must equal Calories within ±5-8%.
```

---

## 7. Testing Strategy & Validation Test Cases

To eliminate regressions and ensure international robustness, the test suite comprises three tiers:

### 7.1 Tier 1: Mathematical & Conversion Unit Tests (`test-ocr-normalizer.ts`)
- `testSaltToSodiumConversion`: Verifies $0.5\text{g salt} \to 196.7\text{mg sodium} \pm 1\text{mg}$.
- `testKjToKcalConversion`: Verifies $840\text{ kJ} \to 200.76\text{ kcal}$.
- `testEuCarbohydrateFiberSummation`: Verifies EU label with 20g Carbs and 5g Fiber results in 25g Total Carbohydrates for Atwater calculation.
- `testPer100gToServingScaling`: Verifies 100g base scaled to 35g pouch yields exact 0.35x values across all 38 columns.
- `testAtwaterThermodynamicGate`: Fails any item with caloric density $> 9.2\text{ kcal/g}$ or energy discrepancy $> 10\%$.

### 7.2 Tier 2: Golden Fixture Tests (International Label Types)
1. **US FDA Label (Quaker Instant Oatmeal):**
   - Declared: Serving size 1 pouch (35g), 6 servings per container, Total Wt 210g, 150 kcal, 3g Fat, 27g Carb, 4g Fiber, 4g Protein, 75mg Sodium.
   - Test asserts: `servingWeightG = 35`, `totalPackageWeightG = 210`, `weightDifferenceDetected = true`, imputed micronutrients (potassium, zinc, iron, B-vitamins) are populated.
2. **UK / EU Label (Walkers Crisps / Heinz Baked Beans):**
   - Declared: Per 100g: 2050 kJ / 491 kcal, Fat 27.5g, Carbs 52.8g, Fiber 4.3g, Protein 5.8g, Salt 1.25g.
   - Test asserts: `basisType = 'per_100g'`, `sodiumMg = 492mg`, Total Carbs harmonized to $57.1\text{g}$.
3. **East Asian / Malaysian Label (Munchy's Crackers):**
   - Declared: Per 100g and Per Serving (25g). Energy 480 kcal / 120 kcal, Sodium 420mg / 105mg. Total net weight 300g.
   - Test asserts: multi-column detection, net weight extraction, proper serving scale.
4. **Calories-Only Label (Vending Pastry):**
   - Declared: "Total Calories: 380 kcal", Net wt 90g. Full ingredient list: "Enriched wheat flour, palm oil, sugar, invert syrup, egg whites, cinnamon, leavening".
   - Test asserts: agent estimates macronutrients (protein, fat, carbs) from ingredient ranking, maintaining Atwater balance to 380 kcal.

### 7.3 Tier 3: Add, Edit, Delete Lifecycle Integration Tests
- **Add Test:** Runs image through mock multimodal parser, verifies `rawLabel` + `estimatedNutrientsPer100g`, verifies atomic Sheet write and Drive photo upload with before/after comparison.
- **Edit Test:** Adjusts weight of single ingredient in a multi-component meal, verifies only target row changed, verifies Sheet update reflects exact row span without displacing adjacent rows.
- **Delete Test:** Deletes meal, verifies row is excised from Google Sheet and associated Drive file is removed with zero residual artifacts.

---

## 8. Logged Meal Review & Edit Lifecycle Specification

### 8.1 UI Presentation & Hover Constraints
- **Roll-over Visibility:** The delete bin icon (`Trash2`) on each logged food card must be hidden by default (`opacity-0`) and ONLY appear upon pointer roll-over (`group-hover:opacity-100`).
- **Review Action Icon:** Placed directly adjacent to the bin icon within the same roll-over action container, using `FileEdit`.
- **Accessibility:** Both buttons provide dedicated tooltip titles and accessible touch/click hit areas.

### 8.2 Review & Edit Modal Workflow
1. **Activation:** Clicking the Review icon passes the selected `LoggedMeal` to `App.tsx` via `onReviewMeal(meal)` and opens `FoodNutritionAgentModal` in edit mode.
2. **Context & Original Photos Pre-Hydration:**
   - The modal pre-populates the existing `mealId`, `dateStr`, and `mealSlot`.
   - All original meal photos associated with the meal are parsed and staged in the image carousel strip as verified existing photos.
   - The agent chat initializes with a targeted review banner displaying the meal name, code, date, and asking for the user's edit instructions.
3. **Instruction Dispatch & Re-evaluation:**
   - The user enters free-form edit instructions (e.g., "Change portion to 150g", "Adjust sodium to 65mg from packaging", "Recalculate with unsweetened oat milk").
   - Upon dispatch, the agent forwards the user's instructions along with all original meal images to `/api/gemini/analyze-meal-photo`.
   - The model recalculates the 38-column row breakdown, clinical diagnoses, and Atwater thermodynamic consistency.
4. **Zero-Duplicate In-Place Google Sheet Update:**
   - When the user commits/saves the revised meal:
     - **No new photo is uploaded to Google Drive**, avoiding duplicate files and storage bloat.
     - The existing `photoUrl` / Drive file ID is preserved.
     - An in-place atomic update (`/api/sheets/edit-meal-log`) is executed against Google Sheets, replacing the exact rows for that `mealId` and `date`.
     - The local journal state in `App.tsx` is updated and synchronized without creating duplicate card entries.

