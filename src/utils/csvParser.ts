import { DayColumn, DiagnosisEntry, NutrientCategory, NutrientDayValue, NutrientRow, SheetState, StatusLevel } from '../types';

/**
 * Parses raw CSV content handling quotes, newlines inside cells, and double quotes.
 */
export function parseCSVToRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter(r => r.some(c => c.length > 0));
}

/**
 * Helper to parse a clean numeric value from a string cell, supporting:
 * - Special whitespace (narrow non-breaking space \u202F, non-breaking space \u00A0, thin space, etc.)
 * - Space as thousands separator (e.g., "3 171" -> 3171, "2 264" -> 2264, "1 622" -> 1622)
 * - Comma as thousands separator (e.g., "1,622" -> 1622) or decimal separator (e.g., "10,7" -> 10.7)
 * - Leading zeros (e.g., "01" -> 1, "00" -> 0)
 */
function parseCleanNumber(str: string): number {
  if (!str) return 0;
  // Remove all space-like characters
  const noSpace = str.replace(/[\s\u202F\u00A0\u2007\u2009\u200A\uFEFF]+/g, '').trim();
  if (!noSpace) return 0;

  // Extract the numeric portion
  const numMatch = noSpace.match(/^-?[\d.,]+/);
  if (!numMatch) return 0;

  let s = numMatch[0];

  // If it has both dot and comma (e.g., "1,234.56" or "1.234,56")
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // "1.234,56" -> dot is thousand separator, comma is decimal
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // "1,234.56" -> comma is thousand separator, dot is decimal
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Check if comma is thousands separator (e.g. "1,622" followed by 3 digits at end) or decimal ("10,7")
    if (/,\d{3}$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/,/g, '.');
    }
  }

  const result = parseFloat(s);
  return isNaN(result) ? 0 : result;
}

export function parseValueAndTarget(rawStr: string): { intake: number; target: number; unit: string } {
  if (!rawStr || typeof rawStr !== 'string') return { intake: 0, target: 0, unit: '' };
  
  const trimmed = rawStr.trim();
  if (!trimmed) return { intake: 0, target: 0, unit: '' };

  // Case 1: Contains a slash '/' (e.g. "3 171 / 1200 mg" or "2 264 / 1651 kcal" or "28 / 15 g" or "01 / 25 g")
  if (trimmed.includes('/')) {
    const slashIndex = trimmed.indexOf('/');
    const leftPart = trimmed.substring(0, slashIndex).trim();
    const rightPart = trimmed.substring(slashIndex + 1).trim();

    const intake = parseCleanNumber(leftPart);

    // In rightPart, e.g. "1200 mg", "1651 kcal", "400 mcg DFE", "15 g", "0 g"
    const cleanRight = rightPart.replace(/[\u202F\u00A0\u2007\u2009\u200A\uFEFF]+/g, ' ').trim();
    const unitMatchIndex = cleanRight.search(/[a-zA-Z%]/);
    
    let targetStr = cleanRight;
    let unit = '';
    if (unitMatchIndex !== -1) {
      targetStr = cleanRight.substring(0, unitMatchIndex).trim();
      unit = cleanRight.substring(unitMatchIndex).trim();
    }
    
    const target = parseCleanNumber(targetStr);

    return { intake, target, unit };
  }

  // Case 2: Single number without slash (e.g. "3 171 mg" or "500 kcal")
  const cleanStr = trimmed.replace(/[\u202F\u00A0\u2007\u2009\u200A\uFEFF]+/g, ' ').trim();
  const unitMatchIndex = cleanStr.search(/[a-zA-Z%]/);
  let numStr = cleanStr;
  let unit = '';
  if (unitMatchIndex !== -1) {
    numStr = cleanStr.substring(0, unitMatchIndex).trim();
    unit = cleanStr.substring(unitMatchIndex).trim();
  }
  const intake = parseCleanNumber(numStr);
  return { intake, target: 0, unit };
}

export function determineStatusLevel(statusText: string, percentage: number, isCeiling: boolean): StatusLevel {
  if (!statusText) {
    if (isCeiling) {
      return percentage > 120 ? 'severe' : percentage > 100 ? 'warning' : 'safe';
    }
    return percentage >= 100 ? 'met' : percentage >= 75 ? 'good' : 'low';
  }

  const lower = statusText.toLowerCase();
  if (lower.includes('🚨') || lower.includes('critical')) return 'critical';
  if (lower.includes('🔴') || lower.includes('severe') || lower.includes('exceeded')) return 'severe';
  if (lower.includes('🟠') || lower.includes('significant') || lower.includes('mild') || lower.includes('🟡')) return 'warning';
  if (lower.includes('goal met')) return 'met';
  if (lower.includes('good progress')) return 'good';
  if (lower.includes('🟢') || lower.includes('within limit') || lower.includes('on track') || lower.includes('none')) return 'safe';
  if (lower.includes('⚪') || lower.includes('low intake')) return 'low';

  return 'neutral';
}

export function determineCategory(nutrientName: string): { category: NutrientCategory; isCeiling: boolean; clinicalGoal: string } {
  const lower = nutrientName.toLowerCase().trim();

  if (lower.includes('saturated fat')) {
    return { category: 'critical_limits', isCeiling: true, clinicalGoal: 'LDL Impact' };
  }
  if (lower.includes('sodium')) {
    return { category: 'critical_limits', isCeiling: true, clinicalGoal: 'Kidney Filtration Stress' };
  }
  if (lower.includes('added sugar')) {
    return { category: 'critical_limits', isCeiling: true, clinicalGoal: 'Glucose Surge' };
  }
  if (lower.includes('total sugar')) {
    return { category: 'critical_limits', isCeiling: true, clinicalGoal: 'Hepatic Stress' };
  }
  if (lower.includes('trans fat')) {
    return { category: 'critical_limits', isCeiling: true, clinicalGoal: 'Atherosclerosis Risk' };
  }
  if (lower.includes('cholesterol')) {
    return { category: 'critical_limits', isCeiling: true, clinicalGoal: 'Circulating Lipid Clearance' };
  }
  if (lower.includes('calories')) {
    return { category: 'macronutrients', isCeiling: true, clinicalGoal: 'Caloric Deficit Goal' };
  }
  if (lower.includes('dietary fiber') || lower === 'fiber') {
    return { category: 'macronutrients', isCeiling: false, clinicalGoal: 'Cholesterol Clearance' };
  }
  if (lower.includes('protein')) {
    return { category: 'macronutrients', isCeiling: false, clinicalGoal: 'Muscle Maintenance' };
  }
  if (lower.includes('total fat')) {
    return { category: 'macronutrients', isCeiling: true, clinicalGoal: 'Cardiovascular Lipid Target' };
  }
  if (lower.includes('carbohydrate')) {
    return { category: 'macronutrients', isCeiling: false, clinicalGoal: 'Glycemic Stability' };
  }
  if (lower.includes('monounsaturated')) {
    return { category: 'lipids', isCeiling: false, clinicalGoal: 'Cardioprotective HDL' };
  }
  if (lower.includes('polyunsaturated')) {
    return { category: 'lipids', isCeiling: false, clinicalGoal: 'Essential Fatty Acids' };
  }
  if (['potassium', 'magnesium', 'calcium', 'zinc', 'phosphorus', 'iron', 'selenium'].some(m => lower.includes(m))) {
    let goal = 'Cellular Health';
    if (lower.includes('potassium')) goal = 'Electrolyte Balance';
    if (lower.includes('magnesium')) goal = 'Cardiometabolic Health';
    if (lower.includes('calcium')) goal = 'Bone Health';
    if (lower.includes('zinc')) goal = 'Immune Support';
    if (lower.includes('phosphorus')) goal = 'Renal Clearance';
    if (lower.includes('iron')) goal = 'Oxidative Balance';
    if (lower.includes('selenium')) goal = 'Cellular Defense';
    return { category: 'minerals', isCeiling: false, clinicalGoal: goal };
  }
  if (lower.includes('vitamin') || lower.includes('folate') || lower.includes('thiamin') || lower.includes('riboflavin') || lower.includes('niacin')) {
    let goal = 'Metabolic Defense';
    if (lower.includes('vitamin d')) goal = 'Deficiency Correction';
    if (lower.includes('vitamin c')) goal = 'Antioxidant Defense';
    if (lower.includes('folate')) goal = 'Homocysteine Control';
    if (lower.includes('vitamin b12')) goal = 'RBC & Nervous System';
    if (lower.includes('vitamin a')) goal = 'Immune Integrity';
    if (lower.includes('vitamin e')) goal = 'Lipid Protection';
    if (lower.includes('vitamin k')) goal = 'Vascular Health';
    if (lower.includes('vitamin b6')) goal = 'Amino Acid Metabolism';
    if (lower.includes('thiamin')) goal = 'Energy Metabolism';
    if (lower.includes('riboflavin')) goal = 'Energy Production';
    if (lower.includes('niacin')) goal = 'Lipid Regulation';
    return { category: 'vitamins', isCeiling: false, clinicalGoal: goal };
  }

  return { category: 'macronutrients', isCeiling: false, clinicalGoal: 'Daily Allowance' };
}

export function parseDiagnosisCell(rawText: string): DiagnosisEntry {
  if (!rawText || rawText.trim() === '') {
    return {
      raw: '',
      overall: 'No diagnosis logged for this date.',
      highlights: [],
      flags: [],
      clinicalImpact: [],
      actionPlan: []
    };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  let overall = '';
  const highlights: string[] = [];
  const flags: string[] = [];
  const clinicalImpact: string[] = [];
  const actionPlan: string[] = [];

  let currentSection: 'overall' | 'highlights' | 'flags' | 'impact' | 'action' = 'overall';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('highlight') || lower.includes('positive highlights') || lower.includes('🟢')) {
      currentSection = 'highlights';
      continue;
    } else if (lower.includes('flag') || lower.includes('primary flags') || lower.includes('⚠️')) {
      currentSection = 'flags';
      continue;
    } else if (lower.includes('clinical impact') || lower.includes('prognosis')) {
      currentSection = 'impact';
      continue;
    } else if (lower.includes('action plan') || lower.includes('next steps') || lower.includes('recommended')) {
      currentSection = 'action';
      continue;
    }

    const cleanBullet = line.replace(/^[•\-\*]\s*/, '').trim();

    if (currentSection === 'overall') {
      if (line.startsWith('Overall:')) {
        overall = line.replace(/^Overall:\s*/i, '').trim();
      } else {
        overall += (overall ? ' ' : '') + line;
      }
    } else if (currentSection === 'highlights') {
      highlights.push(cleanBullet);
    } else if (currentSection === 'flags') {
      flags.push(cleanBullet);
    } else if (currentSection === 'impact') {
      clinicalImpact.push(cleanBullet);
    } else if (currentSection === 'action') {
      actionPlan.push(cleanBullet);
    }
  }

  return {
    raw: rawText,
    overall: overall || lines[0] || '',
    highlights,
    flags,
    clinicalImpact,
    actionPlan
  };
}

export function parseSpreadsheetCSV(csvString: string): SheetState {
  const rows = parseCSVToRows(csvString);
  if (rows.length < 2) {
    throw new Error('Spreadsheet data is too short or invalid.');
  }

  const headerRow = rows[0];
  const columns: DayColumn[] = [];

  // Each day occupies 2 columns in the sheet: Value, Status
  // Col 1 is "Rolling Baseline", Col 3 is "Today (08/09/2026)", Col 5 is "Yesterday (07/09/2026)", etc.
  for (let c = 1; c < headerRow.length; c += 2) {
    const title = headerRow[c];
    if (!title || title.trim() === '') continue;

    const isRollingBaseline = title.toLowerCase().includes('rolling') || title.toLowerCase().includes('baseline');
    const key = isRollingBaseline ? 'baseline' : `day_${c}`;
    
    // Extract date from label if present e.g. "Today (08/09/2026)" -> "08/09/2026"
    const dateMatch = title.match(/\((.*?)\)/) || title.match(/(\d{2}\/\d{2}\/\d{4})/);
    const dateStr = dateMatch ? dateMatch[1] : title;

    columns.push({
      key,
      label: title,
      dateStr,
      isRollingBaseline
    });
  }

  // Row 1 is Diagnosis
  const diagnosisRow = rows.find(r => r[0]?.toLowerCase().includes('diagnosis')) || rows[1];
  const diagnoses: Record<string, DiagnosisEntry> = {};

  if (diagnosisRow) {
    columns.forEach((col, idx) => {
      const colIndex = 1 + idx * 2;
      const cellText = diagnosisRow[colIndex] || '';
      diagnoses[col.key] = parseDiagnosisCell(cellText);
    });
  }

  // Nutrient Rows start from row 2 onwards
  const nutrients: NutrientRow[] = [];

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const nutrientName = row[0]?.trim();
    if (!nutrientName) continue; // Skip blank rows

    const { category, isCeiling, clinicalGoal } = determineCategory(nutrientName);
    const days: Record<string, NutrientDayValue> = {};
    let baselineValue: NutrientDayValue = {
      intake: 0,
      target: 0,
      unit: '',
      statusText: '',
      statusLevel: 'neutral',
      percentage: 0
    };

    columns.forEach((col, idx) => {
      const valueColIndex = 1 + idx * 2;
      const statusColIndex = 2 + idx * 2;

      const rawValue = row[valueColIndex] || '';
      const rawStatus = row[statusColIndex] || '';

      const { intake, target, unit } = parseValueAndTarget(rawValue);
      
      // Calculate percentage: extract explicit percentage in status if available (e.g. "(71%)" or "(110%)")
      let percentage = 0;
      const explicitPercentMatch = rawStatus.match(/\((\d+)\s*%\)/);
      if (explicitPercentMatch) {
        percentage = parseInt(explicitPercentMatch[1], 10);
      } else if (target > 0) {
        percentage = Math.round((intake / target) * 100);
      } else {
        const multMatch = rawStatus.match(/\((\d+(?:[.,]\d+)?)\s*x\)/i);
        if (multMatch) {
          percentage = Math.round(parseFloat(multMatch[1].replace(',', '.')) * 100);
        }
      }

      const statusLevel = determineStatusLevel(rawStatus, percentage, isCeiling);

      const nutrientVal: NutrientDayValue = {
        intake,
        target,
        unit,
        statusText: rawStatus,
        statusLevel,
        percentage
      };

      if (col.isRollingBaseline) {
        baselineValue = nutrientVal;
      }
      days[col.key] = nutrientVal;
    });

    nutrients.push({
      id: `nutrient_${r}_${nutrientName.replace(/\s+/g, '_').toLowerCase()}`,
      name: nutrientName,
      category,
      unit: baselineValue.unit || days[columns[1]?.key]?.unit || 'g',
      isCeiling,
      clinicalGoal,
      baseline: baselineValue,
      days
    });
  }

  // Determine default selected day (e.g. "Today" or first non-baseline column)
  const defaultDay = columns.find(c => !c.isRollingBaseline)?.key || columns[0]?.key || 'baseline';

  return {
    columns,
    diagnoses,
    nutrients,
    selectedDayKey: defaultDay,
    lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    isLiveSynced: true
  };
}

import { MealLogRow, LoggedMeal } from '../types';

export function parseMealLogCSV(csvText: string): MealLogRow[] {
  const rows = parseCSVToRows(csvText);
  if (rows.length <= 1) return [];

  // Validate that this is actually the meal log tab by checking the headers
  const headerRow = rows[0].map(h => h.trim().toLowerCase());
  const headerStr = headerRow.join(' ');
  
  if (!headerStr.includes('dish name') && !headerStr.includes('meal id') && !headerStr.includes('ingredient') && !headerStr.includes('calories') && !headerStr.includes('food')) {
    console.warn('CSV does not look like a meal log tab. Returning empty rows.');
    return [];
  }

  // Create a map of column names to indices
  const colMap: Record<string, number> = {};
  headerRow.forEach((colName, index) => {
    colMap[colName] = index;
  });

  const getCol = (row: string[], ...possibleNames: string[]): string => {
    // 1. Try exact matches first
    for (const name of possibleNames) {
      if (colMap[name] !== undefined) return row[colMap[name]];
    }
    // 2. Try exact word boundary match
    for (const name of possibleNames) {
      for (const [key, idx] of Object.entries(colMap)) {
        if (new RegExp(`\\b${name}\\b`, 'i').test(key)) return row[idx];
      }
    }
    // 3. Fallback to includes
    for (const name of possibleNames) {
      for (const [key, idx] of Object.entries(colMap)) {
        if (key.includes(name)) return row[idx];
      }
    }
    return '';
  };

  const getNum = (row: string[], ...possibleNames: string[]): number => {
    const val = getCol(row, ...possibleNames);
    return parseCleanNumber(val);
  };

  const normalizeDate = (d: string): string => {
    if (!d) return '';
    const clean = d.trim();
    const parts = clean.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        // Assume MM/DD/YYYY from Sheets
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }
    return clean;
  };

  return rows.slice(1).map((row, i) => {
    // If we have an entirely empty row, skip it
    if (row.every(c => !c.trim())) return null;

    // Robust mealId detection: check mapped col or search for M-xxx pattern in cells
    let mealId = getCol(row, 'meal id', 'id');
    if (!mealId) {
      const idCell = row.find(c => /^(M-\d+|KFC-\d+|Obalab-\d+)/i.test(c.trim()));
      if (idCell) mealId = idCell.trim();
    }

    // Robust mealDiagnosis detection: check mapped col or detect markdown headers in cell 1
    let mealDiagnosis = getCol(row, 'meal diagnosis', 'diagnosis', 'clinical diagnosis', 'health benefits', 'clinical assessment', 'clinical note', 'notes', 'note', 'summary');
    if (!mealDiagnosis && row[1] && (row[1].includes('## Health Benefits') || row[1].includes('## Clinical') || row[1].length > 100)) {
      mealDiagnosis = row[1].trim();
    }

    const dailyDiagnosis = getCol(row, 'daily diagnosis', 'daily summary', 'daily assessment', 'daily');

    // Robust photoUrl detection: check mapped col or scan all cells for image/drive links or filenames
    let photoUrl = getCol(row, 'photo url', 'photo', 'picture', 'image url', 'image', 'photo urls', 'photos', 'drive url', 'drive file', 'smart chip', 'file');
    if (!photoUrl) {
      const urlCell = row.find(c => {
        const trimmed = c.trim();
        return (
          trimmed.includes('drive.google.com') ||
          trimmed.includes('googleusercontent.com') ||
          /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(trimmed) ||
          /^1[a-zA-Z0-9_-]{27,45}$/.test(trimmed)
        );
      });
      if (urlCell) photoUrl = urlCell.trim();
    }

    return {
      dishName: getCol(row, 'dish name', 'food name', 'dish'),
      mealId,
      date: normalizeDate(getCol(row, 'date', 'day')),
      mealSlot: getCol(row, 'meal slot', 'slot', 'type'),
      ingredient: getCol(row, 'ingredient', 'components'),
      weightG: getNum(row, 'weight (g)', 'weight', 'weight g'),
      calories: getNum(row, 'calories', 'kcal', 'energy'),
      protein: getNum(row, 'protein', 'protein (g)'),
      totalFat: getNum(row, 'total fat', 'fat', 'total fat (g)'),
      saturatedFat: getNum(row, 'saturated fat', 'sat fat', 'saturated fat (g)'),
      carbs: getNum(row, 'carbs', 'carbohydrates', 'total carbs'),
      fiber: getNum(row, 'fiber', 'dietary fiber', 'fiber (g)'),
      totalSugars: getNum(row, 'total sugars', 'sugars', 'sugar'),
      sodium: getNum(row, 'sodium', 'sodium (mg)'),
      potassium: getNum(row, 'potassium', 'potassium (mg)'),
      calcium: getNum(row, 'calcium', 'calcium (mg)'),
      iron: getNum(row, 'iron', 'iron (mg)'),
      magnesium: getNum(row, 'magnesium', 'magnesium (mg)'),
      phosphorus: getNum(row, 'phosphorus', 'phosphorus (mg)'),
      zinc: getNum(row, 'zinc', 'zinc (mg)'),
      selenium: getNum(row, 'selenium', 'selenium (mcg)', 'selenium (µg)'),
      vitaminA: getNum(row, 'vitamin a', 'vit a', 'vitamin a (mcg)', 'vitamin a (µg)'),
      vitaminC: getNum(row, 'vitamin c', 'vit c', 'vitamin c (mg)'),
      vitaminD: getNum(row, 'vitamin d', 'vit d', 'vitamin d (mcg)', 'vitamin d (µg)'),
      vitaminE: getNum(row, 'vitamin e', 'vit e', 'vitamin e (mg)'),
      vitaminK: getNum(row, 'vitamin k', 'vit k', 'vitamin k (mcg)', 'vitamin k (µg)'),
      vitaminB12: getNum(row, 'vitamin b12', 'vit b12', 'b12'),
      folate: getNum(row, 'folate', 'vitamin b9', 'b9'),
      vitaminB6: getNum(row, 'vitamin b6', 'vit b6', 'b6'),
      thiaminB1: getNum(row, 'thiamin', 'b1'),
      riboflavinB2: getNum(row, 'riboflavin', 'b2'),
      niacinB3: getNum(row, 'niacin', 'b3'),
      monounsaturatedFat: getNum(row, 'monounsaturated', 'mono fat'),
      polyunsaturatedFat: getNum(row, 'polyunsaturated', 'poly fat'),
      cholesterol: getNum(row, 'cholesterol'),
      water: getNum(row, 'water', 'moisture'),
      choline: getNum(row, 'choline'),
      transFat: getNum(row, 'trans fat', 'trans'),
      addedSugars: getNum(row, 'added sugars', 'added sugar'),
      sourceRef: getCol(row, 'source ref', 'reference', 'source'),
      mealDiagnosis: mealDiagnosis || undefined,
      dailyDiagnosis: dailyDiagnosis || undefined,
      photoUrl: photoUrl || undefined,
    };
  }).filter(Boolean) as unknown as MealLogRow[];
}

export function buildMealsFromSheetRows(rows: MealLogRow[]): LoggedMeal[] {
  const mealsMap = new Map<string, LoggedMeal>();
  
  rows.forEach(row => {
    // Generate a unique key for grouping components of the same meal
    const groupKey = row.mealId ? row.mealId : `${row.date}_${row.mealSlot}_${row.dishName}`;
    
    if (!mealsMap.has(groupKey)) {
      const mealType = row.mealSlot as LoggedMeal['mealType'];
      const isDriveFile = row.photoUrl && (/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(row.photoUrl) || !row.photoUrl.startsWith('http'));
      
      mealsMap.set(groupKey, {
        id: `meal-${row.date || 'date'}-${row.mealId || 'item'}-${Math.random().toString(36).substring(2, 8)}`,
        mealId: row.mealId || '',
        dayKey: row.date,
        dateStr: row.date,
        mealType: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Late Night'].includes(mealType) ? mealType : 'Snack',
        time: '12:00 PM', // Default if time is unknown
        foodName: row.dishName || 'Unknown Dish',
        portion: row.ingredient && row.weightG ? `${row.ingredient} (${row.weightG}g)` : (row.weightG ? `${row.dishName} (${row.weightG}g)` : ''),
        calories: 0,
        protein: 0,
        carbs: 0,
        totalFat: 0,
        saturatedFat: 0,
        sodium: 0,
        addedSugars: 0,
        fiber: 0,
        potassium: 0,
        imageUrl: row.photoUrl || undefined,
        driveFileName: isDriveFile ? row.photoUrl : undefined,
        mealDiagnosis: row.mealDiagnosis || undefined,
        dailyDiagnosis: row.dailyDiagnosis || undefined,
        clinicalNote: row.mealDiagnosis || undefined,
      });
    }

    const meal = mealsMap.get(groupKey)!;
    meal.calories += row.calories || 0;
    meal.protein += row.protein || 0;
    meal.carbs += row.carbs || 0;
    meal.totalFat += row.totalFat || 0;
    meal.saturatedFat += row.saturatedFat || 0;
    meal.sodium += row.sodium || 0;
    meal.addedSugars += row.totalSugars || 0; // mapped from totalSugars
    meal.fiber += row.fiber || 0;
    meal.potassium = (meal.potassium || 0) + (row.potassium || 0);

    if (row.photoUrl && typeof row.photoUrl === 'string') {
      const parts = row.photoUrl
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (!meal.photoUrls) {
        meal.photoUrls = [];
      }
      for (const p of parts) {
        if (!meal.photoUrls.includes(p)) {
          meal.photoUrls.push(p);
        }
      }
      if (meal.photoUrls.length > 0) {
        meal.imageUrl = meal.photoUrls.join(', ');
      }

      if (/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(row.photoUrl) || !row.photoUrl.startsWith('http')) {
        if (!meal.driveFileName) {
          meal.driveFileName = row.photoUrl;
        } else if (!meal.driveFileName.includes(row.photoUrl)) {
          meal.driveFileName = `${meal.driveFileName}, ${row.photoUrl}`;
        }
      }
    }
    if (!meal.mealDiagnosis && row.mealDiagnosis) {
      meal.mealDiagnosis = row.mealDiagnosis;
      if (!meal.clinicalNote) meal.clinicalNote = row.mealDiagnosis;
    }
    if (!meal.dailyDiagnosis && row.dailyDiagnosis) {
      meal.dailyDiagnosis = row.dailyDiagnosis;
    }

    // Append to portion string if there's an ingredient
    if (row.ingredient && row.weightG) {
      const componentStr = `${row.ingredient} (${row.weightG}g)`;
      if (!meal.portion) {
        meal.portion = componentStr;
      } else if (!meal.portion.includes(row.ingredient)) {
        meal.portion = `${meal.portion}, ${componentStr}`;
      }
    } else if (row.ingredient && !meal.portion.includes(row.ingredient)) {
      meal.portion = meal.portion ? `${meal.portion}, ${row.ingredient}` : row.ingredient;
    }
  });

  return Array.from(mealsMap.values()).sort((a, b) => {
    const timeA = new Date(`2026-09-08 ${a.time}`).getTime();
    const timeB = new Date(`2026-09-08 ${b.time}`).getTime();
    return timeB - timeA;
  });
}

/**
 * Dynamically computes the next sequential meal reference ID (e.g. M-028, M-029)
 * by scanning all synced meals, sheet rows, and known reference codes.
 * Ensures the app never remains stuck on a static or hardcoded ID.
 */
export function getNextMealReferenceId(
  meals: LoggedMeal[] = [],
  mealSheetRows: MealLogRow[] = []
): string {
  let maxNum = 0;

  const extractNum = (val?: string) => {
    if (!val) return;
    const match = String(val).match(/M-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  };

  meals.forEach((m) => {
    extractNum(m.mealId);
    extractNum(m.id);
  });

  mealSheetRows.forEach((r) => {
    extractNum(r.mealId);
  });

  // Default baseline is 27 (the highest static ID in historical data is M-027)
  const nextNum = maxNum > 0 ? maxNum + 1 : 28;
  return `M-${String(nextNum).padStart(3, '0')}`;
}

