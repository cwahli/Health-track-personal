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

## 3. Verification Gate (Run before completion)
1. `lint_applet` (`tsc --noEmit`) to verify 0 syntax or type errors.
2. `compile_applet` to verify clean Vite build.
3. If errors occur, diagnose, fix, and verify sequentially.
