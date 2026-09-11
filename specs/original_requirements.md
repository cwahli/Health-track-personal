Here's the plan with additional requirements:
It's possible to add multiple pictures
Multiple pictures can be uploaded at the same time in google drive
You have a process flow allowing to add, edit or delete multiple pictures on google drive and multiple row in google sheet.
The process verify that after an add/edit/delete, it's been properly added/deleted or edited. So there is a compare before / after to make sure it's clean.
There is a trail so that debug is possible. Include a download button (replacing the one next to the close in the food agent) which agent to download the debug file.
The debug log would have a format similar to the one attached.
- for each meal there is a meal diagnosis added. It's only added once, in the first ingredient. So there are no duplicated info. it's populated in the column meal diagnosis
- And at the end of the agent output, there is a summary which provides the daily diagnosis. It's only shown once as well. it's populated in the column daily diagnosis
- In order to be able to provide the daily diagnosis, the agent will receive in its instruction the consumed set of nutrient for the day, coming from the "dashboard-food" tab. It needs to be pulling for the specific day of request. The specific date is found from the picture output. It will be shared as something like this to the agent "Saturated Fat	14 / 15 g
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
Cholesterol	133 / 300 mg" With instruction to look at it and provide summary for the day on how the additional food will impact this nutrients breakdown

## Additional Requirements (Batch 2 - Reference IDs, Photo Naming, Atomic Append, and Portion Weight Verification)
1. Image Naming Convention:
   When an image is added to Google Drive / Google Sheet, it must strictly follow the clinical naming convention:
   Format: `{MealID}_{Dish_Name_Or_Package}_{Date}.jpg` (e.g. `M-023_Kuaci_Biji_Bunga_Matahari_Package_2026-09-06.jpg`).
   Raw camera filenames (e.g. `PXL_...`) must never be used.
2. Dynamic Reference Number from Google Sheet:
   The system must pull the latest reference meal ID from the live Google Sheet / meal logs and keep incrementing sequentially (e.g. M-028, M-029, M-030). It must never remain stuck on M-027.
3. Multi-Image Photo Numbering at the End:
   When multiple images are uploaded for a meal, the photo indicator (e.g. `_photo1`, `_photo2`) must be positioned at the end before the extension:
   Format: `{MealID}_{Dish_Name}_{Date}_photo1.jpg`, `{MealID}_{Dish_Name}_{Date}_photo2.jpg`.
4. Multi-Image Google Sheet Append & De-duplication Bug Fix:
   When multiple images/rows are added together, ensure the rows are cleanly appended to the Google Sheet "meal log" tab without failing, dimension mismatch, or deduplication drop. Eliminate the bug where repeated or hardcoded M-027 causes meals to overwrite or be discarded by date/mealId deduplicators.
5. Total Dish Weight vs. Portion Weight Verification:
   The meal agent must extract both `totalDishWeightG` (e.g. package weight or full prepared dish) and `portionWeightG` (estimated serving consumed) in the structured JSON. When there is a discrepancy between the two, the agent must proactively ask the user to confirm the exact weight consumed before committing to ensure clinical precision.
