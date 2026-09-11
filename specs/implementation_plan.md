# Master Implementation Specification: Multi-Photo Meal Log Engine, Atomic Synchronization & Diagnostic Pipeline

```
                                 [ MULTI-PHOTO SELECTION ]
                          (1 to N photos: iPhone HEIC / JPEG / PNG)
                                             │
                                             ▼
                             [ CLIENT-SIDE PRE-PROCESSING ]
                        • Pre-flight silent Google OAuth token refresh
                        • Extract earliest EXIF Date (YYYY-MM-DD)
                        • Sequential compression to strictly <200 KB
                        • Generate unique Job ID: job_<timestamp>_<rand>
                                             │
                                             ▼
                        [ DAY NUTRIENTS FETCH ("dashboard-food") ]
                        • Pull consumed vs. target nutrient ledger for Date:
                          "Saturated Fat  14 / 15 g
                           Sodium         1 734 / 1200 mg
                           Added Sugars   32 / 20 g ... [31 nutrients]"
                                             │
                                             ▼
                   [ SINGLE-STAGE MULTIMODAL ANALYSIS (GEMINI 3.5 FLASH LITE) ]
                        • Model: gemini-3.5-flash-lite (per user instruction)
                        • Direct OCR label precedence (Nutrition Facts labels)
                        • Atwater thermodynamic consistency check (±5% tolerance)
                        • Output: 38-column rows +
                          - Meal Diagnosis (First ingredient row only)
                          - Daily Diagnosis (Impact on daily ledger, first row only)
                                             │
                                             ▼
                       [ AGENT EDITING WORKFLOW (PRE-COMMIT) ]
                        • User can converse with agent to modify portions/items
                        • Agent updates breakdown & diagnoses before saving
                        • Real-time Download Diagnostic Report button (.md)
                                             │
                                             ▼
                     [ ATOMIC TWO-PHASE COMMIT (SHEET + DRIVE) ]
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │ Phase 1: Google Drive Synchronization (1 or N Photos)                       │
    │   • Upload all photos with Google Drive appProperties:                      │
    │     { jobId, mealId, imageIndex } in "Personal food" folder                 │
    │   • Verify each fileId via Drive API; on upload failure -> abort (no Sheet) │
    │   • Edit: Upload new photos first; retain old photos until Sheet is clean   │
    │                                                                             │
    │ Phase 2: Google Sheet Mutation with De-duplication                          │
    │   • Acquire Mutex on spreadsheetId                                          │
    │   • If tab missing: Atomic bootstrap (Create tab + 41 headers + Row data)   │
    │   • Pre-snapshot: verify current state of column B (mealId)                 │
    │   • Write Rows (Works for 1 row or N rows):                                 │
    │       - Row 1: Dish, Ingredient 1, ..., Meal Diagnosis, Daily Diagnosis,    │
    │                Photo URL(s)                                                 │
    │       - Row 2..N: Dish, Ingredient 2..N, ..., [Blank Diagnosis],           │
    │                   [Blank Daily Diagnosis], Photo URL(s)                     │
    │   • If Sheet write fails: Rollback Drive (delete newly uploaded files)      │
    │                                                                             │
    │ Phase 3: Before / After Compare & Verification Gate                         │
    │   • Post-snapshot: verify exact row delta and Drive file existence          │
    │   • Edit: Purge superseded Drive files only after Sheet write succeeds      │
    │   • Delete: Delete Sheet rows via batchUpdate + delete Drive files          │
    │   • Release Mutex; append session telemetry to diagnostic trail             │
    └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Single-Sheet Atomic Update: How It Works for 1 Row or N Rows (New vs. Existing Sheet)

A common concern in Google Sheets synchronization is: *What happens if the "meal log" tab does not exist yet, and there is only 1 row (or N rows) to append? Does it require multiple fragile calls, or can it be atomic?*

### Scenario A: Brand-New Sheet (Tab Does Not Exist Yet)
When the user connects a fresh Google Spreadsheet that has no `"meal log"` tab, the system executes an **Atomic Sheet Bootstrap**:
1. **Single Atomic `batchUpdate` Request**:
   The backend sends a single HTTP POST request to `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}:batchUpdate` containing an ordered list of atomic sub-requests:
   - **`addSheet`**: Creates the `'meal log'` tab with frozen header row (`frozenRowCount: 1`).
   - **`updateCells` (Row 1)**: Writes all 41 standardized column headers (from `Dish Name` in Col A to `Photo URL` in Col AO).
   - **`appendCells` (Row 2 onward)**: Directly writes the **1 row** (e.g., a single snack item) or **N rows** (e.g., a complex dinner with 8 ingredient rows) in the exact same call.
2. **Outcome**: Either the entire sheet creation, headers, and data row(s) succeed together, or the spreadsheet remains completely untouched. There is zero risk of an empty, broken, or header-less tab.

### Scenario B: Existing Sheet (Appending 1 Row or N Rows)
When the `'meal log'` tab already exists:
1. The backend uses Google Sheets' native `values.append` (`insertDataOption: INSERT_ROWS`):
   ```
   POST /v4/spreadsheets/{spreadsheetId}/values/'meal log'!A:AO:append?valueInputOption=USER_ENTERED
   ```
2. Google Sheets automatically scans below Row 1 (the headers) to locate the first truly empty row, and appends the payload:
   - **If 1 row is logged:** Appends exactly 1 row (e.g., Row 24).
   - **If N rows are logged:** Appends all N rows contiguously (e.g., Rows 24 to 31).
3. **Verification**: The post-snapshot confirms that $\text{RowCount}_{\text{after}} - \text{RowCount}_{\text{before}} == N_{\text{rows}}$.

### Scenario C: Existing Sheet (Editing 1 Row or N Rows)
When editing a meal (for example, reducing a 3-row meal to a 1-row meal, or vice versa):
1. A single `batchUpdate` deletes the old rows with `deleteDimension` and inserts the replacement row(s) with `insertDimension` and `updateCells`.
2. Because it is a single atomic payload, other rows in the spreadsheet are never shifted or corrupted.

---

## 2. Strict Atomic Dual-Commit Contract (Drive + Sheet Guarantee)

> **Golden Rule:** Never change Google Sheet without Google Drive, and never change Google Drive without Google Sheet. Both must succeed, or all changes roll back to the clean prior state.

### A. ADD Transaction (1 or N Photos)
1. **Pre-flight Auth & Pre-Snapshot:** Refresh Google OAuth token silently if near expiration. Read `column B` (`Meal ID`) to capture baseline row count.
2. **Drive Phase:** Upload 1 or N photos to `Personal food` with metadata tags (`appProperties: { jobId, mealId, imageIndex }`). Verify each file exists via Drive API.
   - *Failure Branch:* If any photo fails to upload, immediately purge already-uploaded photos and abort. Sheet is **never touched**.
3. **Sheet Phase:** Append the 41-column ingredient rows to `'meal log'` (Row 1 has diagnoses and photo links; subsequent rows have empty diagnoses).
   - *Failure Branch:* If Sheet append fails, immediately trigger an automated compensating rollback to delete the newly uploaded Drive files.
4. **Verification Gate:** Compare Sheet row count delta ($\Delta == N_{\text{ingredients}}$) and verify Drive files return HTTP 200.

### B. EDIT Transaction (1 or N Photos)
1. **Pre-Snapshot:** Read existing rows for `mealId` in the Sheet and list current Drive photo IDs from `appProperties`.
2. **Drive Phase (Staging New Photos):** Upload any new photos to Drive first and verify their file IDs. **Do not delete old photos yet.**
3. **Sheet Phase (Atomic BatchUpdate):** Execute a single atomic `spreadsheets.batchUpdate` replacing old rows with updated rows.
   - *Failure Branch:* If Sheet update fails, delete the newly staged Drive photos. Old photos and old Sheet rows remain completely intact.
4. **Cleanup & Verification Gate:** Verify Sheet rows match new calculations. Only after verification passes, purge superseded old photos from Drive.

### C. DELETE Transaction (1 or N Photos)
1. **Pre-Snapshot:** Identify all rows in Sheet matching `mealId` and extract all Drive file IDs from column `AO`.
2. **Dual-Deletion Execution:**
   - Delete all matching rows from Google Sheet in a single `batchUpdate` (`deleteDimension`).
   - Concurrently delete all associated photo files from Google Drive (`deleteImageFromGoogleDrive`).
3. **Verification Gate:**
   - Ping Google Sheet `column B`: Assert $\text{count}(\text{mealId}) == 0$.
   - Ping Google Drive: Assert all deleted file IDs return HTTP 404 (file gone).

---

## 3. Universal 1-Photo or Multi-Photo Handling

The system seamlessly supports single-picture and multi-picture meals without separate code paths:

* **File Selection:** Dropzone and picker accept 1 to 5 photos (`multiple={true}`).
* **Sequential Mobile-Safe Compression:** Compresses photos sequentially to strictly `<200 KB` each, converting Apple HEIC/HEIF to JPEG.
* **Photo Association in Google Sheet (Column AO):**
  * **1 Photo:** `https://drive.google.com/file/d/<fileId>/view`
  * **N Photos:** Newline-delimited URLs in Row 1, or individual photo links paired with the specific dish/ingredient that corresponds to `sourceImageIndex`.
* **Metadata Tagging via Google Drive `appProperties`:**
  ```json
  {
    "name": "Meal_M-027_0.jpg",
    "parents": ["1bnF0AV0N1ua2kVDKsA5-PA1CQ-7Y4tPN"],
    "appProperties": {
      "jobId": "job_1788800288293_jpoihg4ke",
      "mealId": "M-027",
      "imageIndex": "0"
    }
  }
  ```
* **Deletion for N Photos:** Queries Drive using `appProperties has { key='mealId' and value='M-027' }` and purges all files in parallel.

---

## 4. Single-Stage Multimodal AI Pipeline & Clinical Guidance

As requested, the AI extraction remains a **streamlined 1-stage pipeline** utilizing `gemini-3.5-flash-lite`:

1. **Multimodal Analysis in 1 Dispatch:**
   - Sends all 1 to N compressed images simultaneously along with user text notes, patient clinical baseline, and the day's consumed nutrient ledger from `dashboard-food`.
2. **Direct Label OCR Hierarchy:**
   - The model inspects images for Nutrition Facts labels. When detected, exact printed per-serving values are transcribed and scaled to portion size, overriding general visual estimates.
3. **Atwater Thermodynamic Consistency Gate:**
   - Client/Server validates the model's reported calories against the macro sum:
     $$\text{Atwater Sum} = (4 \times \text{Protein}) + (4 \times \text{Carbs}) + (9 \times \text{Fat}) + (2 \times \text{Fiber})$$
   - Asserts that $|\text{Reported Calories} - \text{Atwater Sum}| \le 5\%$ and caloric density falls within physiological bounds ($0.20 \text{ to } 4.50 \text{ kcal/g}$).
4. **4-Beat Clinical Guidance Standards:**
   - **Beat 1 (Metric Lead):** Opens with the most significant nutrient overage/asset.
   - **Beat 2 (Compounding Context):** Contrasts against the day's baseline from `dashboard-food`.
   - **Beat 3 (Biomarker Consequence):** Directly connects to patient lab markers (LDL 4.2, eGFR 80, HbA1c 40).
   - **Beat 4 (Actionable Habit):** Closes with a specific real-food or movement recommendation.

---

## 5. Agent Authority & Dual-Phase Editing Workflow

### Phase 1: Pre-Commit Interactive Editing (Draft Phase)
* Agent evaluates photo(s) and creates draft meal breakdown.
* User can converse with agent:
  - *"Change rice to 120g"*
  - *"I didn't finish the soup, only had half"*
  - *"Add a black coffee"*
  - *"Remove the brownies"*
* Agent modifies the draft state, recalculates nutrients, Atwater balance, Meal Diagnosis, and Daily Diagnosis in memory **before anything is saved to Google Drive or Google Sheet**.

### Phase 2: Post-Commit Editing (Existing Meal in Log)
* In `MealLogView`, clicking **Edit** opens the meal in the Agent Modal in Edit Mode (`mode: "edit"`).
* The modal loads existing ingredient rows, photo thumbnails, and diagnoses.
* User or agent can adjust weights, add ingredients, or add/remove photos.
* On confirmation, the system triggers the **Atomic EDIT Transaction** (Section 2B).

---

## 6. Daily Consumed Nutrients Context Injection ("dashboard-food")

* The system looks up the date column in `dashboard-food` and formats the 31 consumed vs. target nutrients:
  ```tsv
  Saturated Fat	14 / 15 g
  Sodium	1 734 / 1200 mg
  Added Sugars	32 / 20 g
  Total Sugars	44 / 25 g
  Trans Fat	01 / 0 g
  Calories	1 145 / 1651 kcal
  Dietary Fiber	09 / 38 g
  Protein	55 / 95 g
  Total Fat	49 / 60 g
  Carbohydrates	122 / 175 g
  Potassium	1 469 / 3750 mg
  Magnesium	163 / 410 mg
  Vitamin D	03 / 50 mcg
  Calcium	442 / 1000 mg
  Zinc	10 / 11 mg
  Vitamin C	278 / 90 mg
  Folate	161 / 400 mcg DFE
  Phosphorus	671 / 700 mg
  Iron	07 / 8 mg
  Selenium	56 / 55 mcg
  Vitamin B12	02 / 2 mcg
  Vitamin A	315 / 900 mcg RAE
  Vitamin E	03 / 15 mg
  Vitamin K	50 / 120 mcg
  Vitamin B6	01 / 2 mg
  Thiamin B1	01 / 1 mg
  Riboflavin B2	01 / 1 mg
  Niacin B3	11 / 16 mg NE
  Monounsaturated Fat	18 / 35 g
  Polyunsaturated Fat	11 / 15 g
  Cholesterol	133 / 300 mg
  ```
* Injected into the agent's instructions with directives to analyze how the additional meal compounds or balances these daily totals.

---

## 7. Column Mapping & Zero-Duplication Rule

* **Column AM (Index 38):** `Meal Diagnosis`
* **Column AN (Index 39):** `Daily Diagnosis`
* **Column AO (Index 40):** `Photo URL(s)`

### De-duplication Rule:
* **Row 1 (First ingredient of the meal):** Populated with the complete `Meal Diagnosis`, `Daily Diagnosis`, and `Photo URL(s)`.
* **Rows 2..N (Subsequent ingredients of the same meal):** Explicitly left empty (`""`) for `Meal Diagnosis` and `Daily Diagnosis`, preventing duplicate text blocks across rows.

---

## 8. Complete Action & Error Diagnostic Trail (.md)

A **Download Diagnostic Report** button (`FileDown` icon) replaces the `>_` terminal icon next to the close button (`X`) in `FoodNutritionAgentModal.tsx`.

The exported markdown report (`health-tracker-diagnostic-<jobId>.md`) matches your reference layout:
1. **Header:** Timestamp, Job ID, Status (`succeeded` / `failed`), Mode, and all Photo URLs.
2. **⚖️ Contract Evaluation:** Execution laws (dispatches, ledger consistency, dialog inventory, gate status) with `✅ PASS`, `⚪ n/a`, or `❌ FAIL`.
3. **🪟 Modal Snapshot (Dialog Inventory):** Dialog open state, meal title, `on_card` macro ledger, visible/hidden buttons, composer state.
4. **📡 Agent Dispatches:** Dispatches with model name (`gemini-3.5-flash-lite`), latency in ms, token usage, system prompt, user prompt, and verbatim JSON output.
5. **🔗 Data Pipelines & Infrastructure Connectivity Matrix:** Status of all 8 stages.
6. **⚖️ Gate & Trial-Balance Evaluation:** Atwater macro sum and caloric density consistency check.
7. **👤 Last User Action & 🐾 User Action Breadcrumbs:** Timestamped audit log of user clicks, inputs, and network events.
8. **⚙️ Job Session Event Trail:** Lifecycle events (`draft` → `queued` → `running` → `result_ready` → `succeeded`).
9. **🌐 Console & Network Diagnostics:** Network latencies, HTTP response codes, and warnings.
10. **🔍 Vision Scout & 🥗 Itemized Constituent Breakdown:** Dishes, bounding boxes, weights, sticker OCR, constituent foods.
11. **📊 Nutrition Calculation & Breakdown:** Item sub-totals, grand totals, and comprehensive 33-nutrient table.
12. **💬 Agent Message & Narrative:** 4-beat clinical guidance.

---

## 9. Batch 2 Tracking: Reference IDs, Photo Naming, Sheet Append & Portion Verification

| Task | Requirement Description | Status | Implementation Target |
|---|---|---|---|
| **TASK-B2-1** | **Standardized Photo Naming**<br>Ensure photos uploaded to Google Drive strictly follow `{MealID}_{Dish_Name}_{Date}.jpg` (e.g. `M-023_Kuaci_Biji_Bunga_Matahari_Package_2026-09-06.jpg`). Remove all raw camera filenames (`PXL_...`). | [x] DONE | `src/utils/driveUploader.ts`, `FoodNutritionAgentModal.tsx` |
| **TASK-B2-2** | **Dynamic Sheet Reference ID Incrementing**<br>Pull latest reference number from Google Sheet column B (`meal log!B:B`) and current session state. Increment dynamically (e.g. M-028, M-029). Prevent system from getting stuck at M-027. | [x] DONE | `server.ts` (`/api/sheets/next-meal-id`), `FoodNutritionAgentModal.tsx`, `App.tsx` |
| **TASK-B2-3** | **Multi-Photo Indexing at the End**<br>When multiple photos are attached, suffix indicators like `_photo1`, `_photo2` at the very end before `.jpg` (e.g. `M-028_Kuaci_2026-09-10_photo1.jpg`). | [x] DONE | `src/utils/driveUploader.ts`, `FoodNutritionAgentModal.tsx` |
| **TASK-B2-4** | **Multi-Image Google Sheet Append & De-duplication Fix**<br>Fix the bug preventing multiple images/rows from appending to Google Sheet. Resolve range dimension mismatch in `server.ts` by using native `values:append` (or full bounding box `A{start}:AO{end}`) with retry fallback, and fix duplicate meal key discarding when consecutive meals share dates. | [x] DONE | `server.ts` (`/api/sheets/append-meal-log`), `App.tsx` (`fetchLiveData` & meal updates) |
| **TASK-B2-5** | **Total Dish Weight vs. Portion Weight Discrepancy Verification**<br>Extract both `totalDishWeightG` and `portionWeightG` in Gemini JSON response. If they differ, prompt the user with interactive confirmation buttons ("Log entire dish" vs "Log portion" vs "Custom weight") and scale component rows proportionally. | [x] DONE | `server.ts` (`/api/gemini/analyze-meal-photo`), `FoodNutritionAgentModal.tsx` |

