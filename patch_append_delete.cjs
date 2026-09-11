const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Wrap append
code = code.replace(
  `    let googleSheetsAppended = false;
    let googleSheetError = null;

    if (spreadsheetId && accessToken) {`,
  `    let googleSheetsAppended = false;
    let googleSheetError = null;

    if (spreadsheetId && accessToken) {
      await globalSheetMutex.lock(spreadsheetId);`
);

code = code.replace(
  `        if (sheetRes.ok) {
          const sheetData = await sheetRes.json();
          googleSheetsAppended = true;
          console.log('Successfully appended rows to Google Sheet:', sheetData.updates?.updatedRange);
        } else {
          const errBody = await sheetRes.text();
          googleSheetError = errBody;
          console.warn('Failed to append to Google Sheet:', sheetRes.status, errBody);
        }
      } catch (err) {
        googleSheetError = err.message;
        console.warn('Error appending to Google Sheet:', err);
      }
    }`,
  `        if (sheetRes.ok) {
          const sheetData = await sheetRes.json();
          googleSheetsAppended = true;
          console.log('Successfully appended rows to Google Sheet:', sheetData.updates?.updatedRange);
        } else {
          const errBody = await sheetRes.text();
          googleSheetError = errBody;
          console.warn('Failed to append to Google Sheet:', sheetRes.status, errBody);
        }
      } catch (err) {
        googleSheetError = err.message;
        console.warn('Error appending to Google Sheet:', err);
      } finally {
        globalSheetMutex.unlock(spreadsheetId);
      }
    }`
);

// 2. Wrap delete
code = code.replace(
  `    const info = await getExactSheetInfo(spreadsheetId, accessToken, 'meal log');`,
  `    await globalSheetMutex.lock(spreadsheetId);
    try {
      const info = await getExactSheetInfo(spreadsheetId, accessToken, 'meal log');`
);

code = code.replace(
  `    return res.json({
      success: true,
      deletedCount: rowIndicesToDelete.length,
      message: \`Successfully deleted \${rowIndicesToDelete.length} rows for mealId \${mealId}\`
    });

  } catch (error: any) {`,
  `    return res.json({
      success: true,
      deletedCount: rowIndicesToDelete.length,
      message: \`Successfully deleted \${rowIndicesToDelete.length} rows for mealId \${mealId}\`
    });

    } finally {
      globalSheetMutex.unlock(spreadsheetId);
    }
  } catch (error: any) {`
);

// Fix return res.json inside the try block for early exits (like sheet not found, or 0 rows deleted)
code = code.replace(
  `    if (!info.sheetId && info.sheetId !== 0) {
      return res.status(400).json({ error: 'Could not resolve sheetId for "meal log" tab.' });
    }`,
  `    if (!info.sheetId && info.sheetId !== 0) {
      globalSheetMutex.unlock(spreadsheetId);
      return res.status(400).json({ error: 'Could not resolve sheetId for "meal log" tab.' });
    }`
);

code = code.replace(
  `    if (rowIndicesToDelete.length === 0) {
      return res.json({ success: true, deletedCount: 0, message: 'Meal not found in sheet.' });
    }`,
  `    if (rowIndicesToDelete.length === 0) {
      globalSheetMutex.unlock(spreadsheetId);
      return res.json({ success: true, deletedCount: 0, message: 'Meal not found in sheet.' });
    }`
);

fs.writeFileSync('server.ts', code);
