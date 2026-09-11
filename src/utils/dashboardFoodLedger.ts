import { RAW_INITIAL_SHEET_CSV } from '../data/initialSheetData';

export const TRACKED_NUTRIENT_LIST = [
  { name: 'Saturated Fat', unit: 'g', target: '15 g' },
  { name: 'Sodium', unit: 'mg', target: '1200 mg' },
  { name: 'Added Sugars', unit: 'g', target: '20 g' },
  { name: 'Total Sugars', unit: 'g', target: '25 g' },
  { name: 'Trans Fat', unit: 'g', target: '0 g' },
  { name: 'Calories', unit: 'kcal', target: '1651 kcal' },
  { name: 'Dietary Fiber', unit: 'g', target: '38 g' },
  { name: 'Protein', unit: 'g', target: '95 g' },
  { name: 'Total Fat', unit: 'g', target: '60 g' },
  { name: 'Carbohydrates', unit: 'g', target: '175 g' },
  { name: 'Potassium', unit: 'mg', target: '3750 mg' },
  { name: 'Magnesium', unit: 'mg', target: '410 mg' },
  { name: 'Vitamin D', unit: 'mcg', target: '50 mcg' },
  { name: 'Calcium', unit: 'mg', target: '1000 mg' },
  { name: 'Zinc', unit: 'mg', target: '11 mg' },
  { name: 'Vitamin C', unit: 'mg', target: '90 mg' },
  { name: 'Folate', unit: 'mcg DFE', target: '400 mcg DFE' },
  { name: 'Phosphorus', unit: 'mg', target: '700 mg' },
  { name: 'Iron', unit: 'mg', target: '8 mg' },
  { name: 'Selenium', unit: 'mcg', target: '55 mcg' },
  { name: 'Vitamin B12', unit: 'mcg', target: '2 mcg' },
  { name: 'Vitamin A', unit: 'mcg RAE', target: '900 mcg RAE' },
  { name: 'Vitamin E', unit: 'mg', target: '15 mg' },
  { name: 'Vitamin K', unit: 'mcg', target: '120 mcg' },
  { name: 'Vitamin B6', unit: 'mg', target: '2 mg' },
  { name: 'Thiamin B1', unit: 'mg', target: '1 mg' },
  { name: 'Riboflavin B2', unit: 'mg', target: '1 mg' },
  { name: 'Niacin B3', unit: 'mg NE', target: '16 mg NE' },
  { name: 'Monounsaturated Fat', unit: 'g', target: '35 g' },
  { name: 'Polyunsaturated Fat', unit: 'g', target: '15 g' },
  { name: 'Cholesterol', unit: 'mg', target: '300 mg' },
];

/**
 * Normalizes any date string (YYYY-MM-DD, DD/MM/YYYY, etc.) to standard DD/MM/YYYY
 */
export function normalizeToDayMonthYear(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  // If YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  // If DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const mon = dmyMatch[2].padStart(2, '0');
    return `${day}/${mon}/${dmyMatch[3]}`;
  }

  return trimmed;
}

/**
 * Splits a CSV line safely respecting quoted fields containing commas or newlines.
 */
function parseCSVLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Parses all lines from CSV, handling multiline quoted blocks.
 */
function splitCSVRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const rawLines = csvText.split('\n');
  let accumulated = '';
  let insideQuote = false;

  for (const line of rawLines) {
    accumulated += (accumulated ? '\n' : '') + line;
    // Count unescaped quotes
    let quoteCount = 0;
    for (let i = 0; i < accumulated.length; i++) {
      if (accumulated[i] === '"') {
        if (i + 1 < accumulated.length && accumulated[i + 1] === '"') {
          i++;
        } else {
          quoteCount++;
        }
      }
    }
    insideQuote = quoteCount % 2 !== 0;

    if (!insideQuote) {
      if (accumulated.trim()) {
        rows.push(parseCSVLine(accumulated));
      }
      accumulated = '';
    }
  }

  return rows;
}

export interface DailyNutrientLedgerResult {
  date: string;
  matchedColumnIndex: number;
  columnHeader: string;
  formattedTable: string;
  nutrients: Record<string, string>;
}

/**
 * Extracts the 31 nutrient consumed vs. target ledger from CSV text for a given date.
 */
export function extractDailyNutrientsFromCSV(
  csvText: string,
  targetDateStr: string
): DailyNutrientLedgerResult {
  const normalizedTargetDate = normalizeToDayMonthYear(targetDateStr);
  const rows = splitCSVRows(csvText);

  if (rows.length === 0) {
    return createFallbackLedger(targetDateStr);
  }

  // Row 0 is the date headers
  const headerRow = rows[0];
  let matchedColIdx = -1;
  let matchedHeader = '';

  // Look for exact DD/MM/YYYY match in headers
  for (let c = 0; c < headerRow.length; c++) {
    const colText = headerRow[c] || '';
    if (normalizedTargetDate && colText.includes(normalizedTargetDate)) {
      matchedColIdx = c;
      matchedHeader = colText;
      break;
    }
  }

  // If no exact match, try matching "Today" if requested today or fallback to column 3 (Today 08/09/2026)
  if (matchedColIdx === -1) {
    for (let c = 0; c < headerRow.length; c++) {
      const colText = headerRow[c] || '';
      if (/today/i.test(colText)) {
        matchedColIdx = c;
        matchedHeader = colText;
        break;
      }
    }
  }

  // If still not matched, default to index 3 (first active day column)
  if (matchedColIdx === -1) {
    matchedColIdx = 3;
    matchedHeader = headerRow[3] || 'Default Day';
  }

  // Extract each nutrient
  const nutrients: Record<string, string> = {};
  const formattedLines: string[] = [];

  for (const item of TRACKED_NUTRIENT_LIST) {
    // Find row where column 0 matches item.name (case-insensitive)
    const matchingRow = rows.find(
      (r) => r[0] && r[0].toLowerCase().trim() === item.name.toLowerCase().trim()
    );

    let cellValue = '';
    if (matchingRow && matchingRow[matchedColIdx]) {
      cellValue = matchingRow[matchedColIdx].replace(/\s+/g, ' ').trim();
    }

    if (!cellValue || !cellValue.includes('/')) {
      // Provide clean default with 0 consumed
      cellValue = `0 / ${item.target}`;
    }

    nutrients[item.name] = cellValue;
    formattedLines.push(`${item.name}\t${cellValue}`);
  }

  return {
    date: targetDateStr,
    matchedColumnIndex: matchedColIdx,
    columnHeader: matchedHeader,
    formattedTable: formattedLines.join('\n'),
    nutrients,
  };
}

/**
 * Creates a clean default ledger with targets when no CSV is present
 */
function createFallbackLedger(dateStr: string): DailyNutrientLedgerResult {
  const nutrients: Record<string, string> = {};
  const formattedLines: string[] = [];

  for (const item of TRACKED_NUTRIENT_LIST) {
    const val = `0 / ${item.target}`;
    nutrients[item.name] = val;
    formattedLines.push(`${item.name}\t${val}`);
  }

  return {
    date: dateStr,
    matchedColumnIndex: -1,
    columnHeader: 'Baseline Targets',
    formattedTable: formattedLines.join('\n'),
    nutrients,
  };
}

/**
 * Convenience helper to get the ledger for a date from the default sheet data or Google Sheets
 */
export function getDailyNutrientLedger(targetDateStr: string): DailyNutrientLedgerResult {
  return extractDailyNutrientsFromCSV(RAW_INITIAL_SHEET_CSV, targetDateStr);
}
