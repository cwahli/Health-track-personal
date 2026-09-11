const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Close the try block that was left open
code = code.replace(
  `    return res.json({
      success: true,
      deletedCount: rowIndicesToDelete.length,
      message: \`Successfully deleted \${rowIndicesToDelete.length} rows from "meal log" tab!\`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {`,
  `    return res.json({
      success: true,
      deletedCount: rowIndicesToDelete.length,
      message: \`Successfully deleted \${rowIndicesToDelete.length} rows from "meal log" tab!\`,
      timestamp: new Date().toISOString(),
    });
    } finally {
      globalSheetMutex.unlock(spreadsheetId);
    }
  } catch (error: any) {`
);

fs.writeFileSync('server.ts', code);
