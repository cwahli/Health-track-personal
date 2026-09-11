const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const mutexCode = `

// Mutex to prevent race conditions on concurrent Google Sheet modifications (like deletes or appends)
class SheetMutex {
  private queues: Map<string, Array<() => void>> = new Map();
  private locked: Map<string, boolean> = new Map();

  async lock(spreadsheetId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.locked.get(spreadsheetId)) {
        let q = this.queues.get(spreadsheetId);
        if (!q) {
          q = [];
          this.queues.set(spreadsheetId, q);
        }
        q.push(resolve);
      } else {
        this.locked.set(spreadsheetId, true);
        resolve();
      }
    });
  }

  unlock(spreadsheetId: string) {
    const q = this.queues.get(spreadsheetId);
    if (q && q.length > 0) {
      const next = q.shift();
      if (next) next();
    } else {
      this.locked.set(spreadsheetId, false);
    }
  }
}
const globalSheetMutex = new SheetMutex();

`;

code = code.replace("const __dirname = path.dirname(__filename);", "const __dirname = path.dirname(__filename);" + mutexCode);
fs.writeFileSync('server.ts', code);
