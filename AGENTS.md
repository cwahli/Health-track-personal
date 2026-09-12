# AGENTS.md - NutriHealth Procedural Graph & Meta-Harness

> **Supreme Architecture: The Reversible Ratchet Framework**
> This project operates under a strict, 5-step master harness combining Stanford SHEPHERD, Google Procedural Graphs, and Hashimoto's Ratchet.
> 1. **State Localization**: Query this document for Active Nodes and Anti-Patterns before acting.
> 2. **Atomic Execution**: Treat every file edit as an isolated, reversible commit.
> 3. **Verification Gate**: Run `lint` and `build` after execution.
> 4. **SHEPHERD Loop**: If verification fails, you are FORBIDDEN from guessing forward. You MUST revert the file to its original state and fork an alternative path.
> 5. **Hashimoto Ratchet**: Upon success, update this file. Move failed paths to Anti-Patterns and successful paths to the Procedural Graph.

## 1. Procedural Graph (State-Conditioned Guidance)

**[CONDITION: Synchronizing to Google Sheets]**
- **Action**: Mathematically calculate the active data length and use a bounded `PUT` insertion targeting the exact next empty row.
- **Action**: On read, aggressively normalize all fetched dates (e.g., `9/10/2026`) strictly to `YYYY-MM-DD` before hydrating state.
- **Verification**: Execute a Two-Way Sync guarantee. Ensure the local meal merges correctly and the remote fetch preserves the exact meal ID and date without data loss.

**[CONDITION: Rendering Lists of Meals]**
- **Action**: Combine `meal.id` with `dateStr` and `index` (e.g., `key={meal.id ? \`\${meal.id}-\${meal.dateStr || ''}-\${idx}\` : \`meal-\${idx}\`}`).
- **State Merge**: Deduplicate state initialization and sync mergers exclusively by composite keys `(dateStr + '_' + mealId)` and unique `id`.

**[CONDITION: Resolving Drive Images]**
- **Action**: Fallback hierarchy must be: 1. Base64 Data URI -> 2. Direct Google CDN (`https://lh3.googleusercontent.com/d/{ID}`) -> 3. Runtime Cache -> 4. Static Registry.

**[CONDITION: Reviewing and Editing Logged Meals]**
- **Action**: Card action cluster (delete bin and review icon) must remain hidden by default and appear only on card roll-over/hover (`opacity-0 group-hover:opacity-100`).
- **Action**: Clicking review pre-hydrates all original photo attachments and existing analysis in `FoodNutritionAgentModal` without re-uploading duplicate Drive photos.
- **Action**: Use in-place `/api/sheets/edit-meal-log` targeting the exact `mealId` rows, preserving original Drive photo URLs and avoiding duplicate card entries.
- **Action**: Validate server responses for edits using composite success flags (`responseData.success || responseData.googleSheetsAppended || responseData.googleSheetsEdited`). Reset loading states immediately on any caught exception.

**[CONDITION: Setting Top Meal Photo for Previews]**
- **Action**: Lightbox header provides a toggle switch to set the active photo as top preview (`currentIndex === 0`).
- **Action**: When toggled, reorders `meal.photoUrls` with the selected photo at index 0 and persists to Google Sheets Column AO via `/api/sheets/update-meal-photos`.
- **Action**: Re-uses existing `SheetConnectionModal` and `googleAuth` components without creating redundant login flows.

**[CONDITION: AI-Vision-Powered Drive Sanitation & Batch Renaming]**
- **Action**: Use `/api/gemini/describe-photo-batch` to inspect photos visually and determine perspective (`Plated_Dish`, `Food_Packaging`, `Nutrition_Facts_Table`, etc.) and clean Title_Snake_Case descriptions.
- **Action**: Support configurable batch sizes (default 10 photos/agent) with live progressive chunking.
- **Action**: Standardized filename schema must strictly follow `M-XXX_[Visual_Description]_[Photo_Number]_[YYYY-MM-DD].jpg`.
- **Action**: Execute in-place renaming via Google Drive `PATCH` endpoint without re-uploading duplicate image binaries.
- **Action**: Maintain `gemini-3.5-flash-lite` as the default model unless explicitly changed by user.

**[CONDITION: Handling API & Credentials]**
- **Action**: Keep all Gemini and Google service credentials strictly isolated on the server (`server.ts` or `/api/*`).
- **Action**: Bind server strictly to port `3000` and host `0.0.0.0`.

## 2. Anti-Patterns & Rejected Trajectories (Do Not Repeat)

- **[REJECTED]:** Using Google Sheets `values:append` for new meal logs.
  - *Why it failed:* Google Sheets considers rows with empty formatting (borders, colors) as "used", causing data to append far below the visible dataset.
- **[REJECTED]:** Truncating spreadsheet range fetches to `A:AL`.
  - *Why it failed:* Clinical columns like `mealDiagnosis`, `dailyDiagnosis`, and `photoUrl` reside past column AL (up to AZ/ZZ), causing silent data loss.
- **[REJECTED]:** Using clinical codes (`M-022`) as unique React component keys.
  - *Why it failed:* Meals with the same code can be eaten on different days, causing duplicate key crashes.
- **[REJECTED]:** Assuming Google Sheets dates will match local state.
  - *Why it failed:* Sheets automatically coerces dates based on locale (e.g., `2026-09-10` becomes `9/10/2026`), causing meals to instantly disappear from the UI's active day filter.
- **[REJECTED]:** Caching state globally on the Express backend (e.g. `let cachedSheetUrl = ''` at the top level).
  - *Why it failed:* AI Studio runs the Express server globally across hot-reloads and previews. A global variable leaks data across users, causing bugs like the "ghost M-028" where one user's disconnected session was hydrated with another's globally cached sheet data.
- **[REJECTED]:** Silently failing or injecting fallback data when a Google Sheet URL is missing.
  - *Why it failed:* Without an explicit URL, users were clicking "Sync" or "Log Meal" and either getting zero feedback or having fake default data injected into their dashboard. You must actively prompt the user to connect a sheet if `sheetUrl` is null.
- **[REJECTED]:** Re-uploading meal photos to Google Drive during review/edit flows.
  - *Why it failed:* Edits to portions or ingredients re-uploaded duplicate image files to Google Drive, causing storage bloat and mismatched file links. Review & edit must preserve existing Drive file URLs.
- **[REJECTED]:** Checking only `responseData.googleSheetsAppended` on the client when calling `/api/sheets/edit-meal-log`.
  - *Why it failed:* `/api/sheets/edit-meal-log` returns `{ success: true, ... }` instead of `{ googleSheetsAppended: true }`. Checking only `googleSheetsAppended` caused verified edits to be falsely flagged as token/permission failures. Always check composite `success || googleSheetsAppended || googleSheetsEdited` and return both flags from the server.
- **[REJECTED]:** Relying solely on `fetchGoogleDriveFolderFiles` without fallback in `SheetDriveSanitationModal`.
  - *Why it failed:* In unauthenticated or expired browser sessions, `fetchGoogleDriveFolderFiles` returns an empty array. This caused 0 photos to be displayed in the modal, leading the "Inspect All" button to silently exit without action. Always implement multi-tier fallback to `GOOGLE_DRIVE_PHOTOS` and meal attachments, along with an in-modal Google Drive connect action.
- **[REJECTED]:** Passing unverified binary buffers to Gemini Multimodal Vision without inspecting magic bytes or passing Google Drive bearer tokens.
  - *Why it failed:* When thumbnail endpoints (`lh3.googleusercontent.com/d/{ID}`) redirect to Google Accounts login (HTTP 302), Node `fetch` follows the redirect and returns an HTML document. Sending base64 HTML with `mimeType: image/jpeg` triggered Gemini API Error 400 (Invalid Argument). Always validate image magic bytes using `isBufferValidImage`, fetch directly via Google Drive API with bearer authorization, and fall back to filename-guided metadata inspection if binaries cannot be retrieved.
- **[REJECTED]:** Using non-unique IDs or un-normalized slashed dates in inspection lists.
  - *Why it failed:* Reused file IDs or multi-photo uploads sharing identical timestamps triggered React duplicate key warnings and generated illegal file paths containing slashes. Always normalize dates to ISO `YYYY-MM-DD` and construct composite React keys (`${id}-${originalName}-${index}`).
- **[REJECTED]:** Inlining full-resolution raw camera photo buffers into Gemini batch requests without size caps or network retry.
  - *Why it failed:* Downloading uncompressed 8-12MB camera photos into base64 strings exceeded Gemini payload boundaries, triggered Cloud Run container connection drops, and yielded `Vision inspection error: Failed to fetch`. Always prefer lightweight 800px Google CDN thumbnails (`=w800`), cap image inlining at 1.5MB, implement client-side fetch retries with graceful heuristic fallback, and catch all backend vision exceptions with 200 heuristic recovery.

## 3. Verification Gate (Run before completion)
1. `npm test` (`tsx tests/nomenclatureAndSanitation.test.ts`) to verify nomenclature formatting, date normalization, regex parsing, and batch chunking.
2. `lint_applet` (`tsc --noEmit`) to verify 0 syntax or type errors.
3. `compile_applet` to verify clean Vite build.
4. If errors occur, diagnose, fix, and verify sequentially.

## 4. Next-Step Roadmap & Systemic Migration Plan: Standardized Photo Naming

> **Goal**: Unify all photo ingestion, Google Drive storage, spreadsheet synchronization, and AI vision analysis under the canonical naming format:  
> `M-XXX_[Visual_Description]_[Photo_Number]_[YYYY-MM-DD].jpg`  
> *(e.g. `M-028_Quaker_Oatmeal_Bowl_photo1_2026-09-11.jpg`)*

### Milestone 1: Core Nomenclature Engine & Resolvers (Phase 1)
- [x] **Format Standardizer**: Implemented in `src/utils/driveUploader.ts` (`formatStandardMealPhotoName`) with strict sanitization, `Title_Snake_Case` formatting, and length constraints.
- [x] **Universal Regex & Fallback Resolver**: Update parser in `driveUploader.ts` to recognize both canonical schema (`M-XXX_..._photoX_YYYY-MM-DD.jpg`) and legacy schemas without breaking thumbnail hydration.
- [x] **Runtime Cache**: Key Drive image cache by both `fileId` and `fileName` for resolution.

### Milestone 2: Write-Path Call Sites & Ingestion Synchronization (Phase 2)
- [x] **Multi-Session Meal Ingestion (`FoodNutritionAgentModal.tsx`)**: Ingested meal photos format filenames using meal ID, analyzed dish descriptor, photo index, and date before uploading.
- [x] **Review & Edit In-Place Guarantee (`FoodNutritionAgentModal.tsx`)**: Ensure review and edit preserve existing Drive photo URLs and names without re-uploading duplicates.
- [x] **Single-Photo Replacements (`MealLogView.tsx`, `DailyMealView.tsx`)**: Route single replacements through `formatStandardMealPhotoName`.
- [x] **Drive Folder Modal Direct Uploads (`DriveFolderModal.tsx`)**: Direct manual uploads adhere to canonical schema.

### Milestone 3: AI Vision Cleanliness & Batch Renaming Agent (Phase 3)
- [x] **Multimodal Batch Inspection (`/api/gemini/describe-photo-batch`)**: Server endpoint with Gemini Multimodal Vision, classifying perspective (`Plated_Dish`, `Food_Packaging`, `Nutrition_Facts_Table`, etc.) and generating clinical descriptors.
- [x] **Customizable Batching**: Configurable batch size selector (5, 10, 15, 20 photos/agent or custom input) with live progressive chunking.
- [x] **Interactive Side-by-Side Review UI (`SheetDriveSanitationModal.tsx`)**: Thumbnail lightbox, perspective badges, editable target names, and single-photo re-inspect actions.
- [x] **In-Place Drive Rename Engine (`renameGoogleDriveFile`)**: Executes Google Drive `PATCH` without re-uploading file binaries, preserving Google Drive file IDs and link integrity.
- [x] **Spreadsheet Column AO Synchronization**: Automated one-click linking of verified Google Drive photos to Google Sheets Column AO.

### Milestone 4: Verification & Safe Impact Mitigation
- [x] **Zero Data Loss Guarantee**: In-place PATCH operations protect existing Google Drive file IDs and permissions.
- [x] **Spreadsheet Integrity**: Bounded PUT updates only target Column AO for identified rows without displacing clinical data.
- [x] **Zero Broken Links**: 4-tier fallback ensures legacy Drive files continue resolving cleanly in carousels, modals, and logs.

### Milestone 5: Automated Test Suite & Regression Safeguards
- [x] **Canonical Generation Tests**: Validates format `${mealId}_${cleanDish}_photo${photoNum}_${datePart}.jpg` across single, multi-photo, and various dish names.
- [x] **Sanitization & Locale Normalization Tests**: Validates special character stripping and multi-format date coercion (`YYYY/MM/DD`, `DD/MM/YYYY`, `YYYY-MM-DD`).
- [x] **Universal Regex Coverage**: Tests positive matches on standard names and intentional rejections of legacy and raw camera names.
- [x] **Batch Chunking Mathematical Validation**: Tests arbitrary array lengths (e.g., 35 items) against dynamic batch divisors (5, 10, 15, 20) to guarantee zero omitted photos.
- [x] **Automated CI Command**: Integrated into `package.json` (`npm test`) with zero external test framework bloat.

