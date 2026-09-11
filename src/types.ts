export type NavigationTab = 'dashboard' | 'health' | 'meal-log' | 'daily-meal' | 'spreadsheet';

export interface LoggedMeal {
  id: string;
  mealId?: string; // e.g. M-026, M-016, M-015 from Google Sheet
  dayKey: string;
  dateStr: string;
  mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Late Night';
  time: string;
  foodName: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  totalFat: number;
  saturatedFat: number;
  sodium: number;
  addedSugars: number;
  fiber: number;
  potassium?: number;
  clinicalNote?: string;
  flags?: string[];
  imageUrl?: string;
  photoUrls?: string[];
  driveFileId?: string;
  driveFileIds?: string[];
  driveFileName?: string; // e.g. Quaker_Instant_Oat...
  mealDiagnosis?: string;
  dailyDiagnosis?: string;
}

export type StatusLevel = 'safe' | 'warning' | 'severe' | 'critical' | 'low' | 'good' | 'met' | 'neutral';

export interface NutrientDayValue {
  intake: number;
  target: number;
  unit: string;
  statusText: string;
  statusLevel: StatusLevel;
  percentage: number;
}

export type NutrientCategory = 
  | 'critical_limits' 
  | 'macronutrients' 
  | 'minerals' 
  | 'vitamins' 
  | 'lipids';

export interface NutrientRow {
  id: string;
  name: string;
  category: NutrientCategory;
  unit: string;
  isCeiling: boolean; // true if target is a max limit (e.g. sodium, sat fat), false if target is a min goal (e.g. fiber, protein)
  clinicalGoal: string; // e.g. "Kidney Filtration Stress", "Cholesterol Clearance"
  baseline: NutrientDayValue;
  days: Record<string, NutrientDayValue>;
}

export interface DayColumn {
  key: string;
  label: string;
  dateStr: string;
  isRollingBaseline?: boolean;
}

export interface DiagnosisEntry {
  raw: string;
  overall: string;
  highlights: string[];
  flags: string[];
  clinicalImpact: string[];
  actionPlan: string[];
  updatedAt?: string;
}

export interface SheetConfig {
  sheetUrl: string;
  sheetId: string;
  autoSync: boolean;
  syncIntervalSeconds: number;
  lastSyncedAt: string;
  status: 'synced' | 'syncing' | 'error';
  errorMessage: string | null;
}

export interface SheetState {
  columns: DayColumn[];
  diagnoses: Record<string, DiagnosisEntry>;
  nutrients: NutrientRow[];
  selectedDayKey: string;
  lastUpdated: string;
  sourceUrl?: string;
  isLiveSynced: boolean;
}

export interface HealthScoreAnalysis {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  calorieStatus: { current: number; target: number; percent: number; isDeficitMet: boolean };
  criticalCeilingsBreached: string[];
  goalsAchieved: string[];
  renalRiskLevel: 'optimal' | 'moderate' | 'high';
  cardioRiskLevel: 'optimal' | 'moderate' | 'high';
  metabolicRiskLevel: 'optimal' | 'moderate' | 'high';
}

export interface AIMealSuggestion {
  mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Post-Workout';
  title: string;
  description: string;
  targetNutrientsHelped: string[];
  cautionAvoids: string[];
  rationale: string;
}

export interface AIRecommendationResult {
  summary: string;
  healthScore: number;
  clinicalAssessment: {
    renalSystem: string;
    cardiovascularLipids: string;
    glycemicMetabolic: string;
  };
  mealRecommendations: AIMealSuggestion[];
  actionSteps: string[];
  keyFoodSwaps: { avoid: string; replaceWith: string; reason: string }[];
  timestamp: string;
}

export interface MealSimulationResult {
  mealName: string;
  estimatedNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    totalFat: number;
    saturatedFat: number;
    sodium: number;
    addedSugars: number;
    fiber: number;
    potassium: number;
  };
  beforeIntake: Record<string, number>;
  projectedIntake: Record<string, number>;
  targets: Record<string, number>;
  warnings: string[];
  positiveHighlights: string[];
  verdict: 'Recommended' | 'Caution' | 'Exceeds Safety Limits';
  explanation: string;
}

export interface MealLogRow {
  id?: string;
  dishName: string;
  mealId: string;
  date: string;
  mealSlot: string;
  ingredient: string;
  weightG: number;
  calories: number;
  protein: number;
  totalFat: number;
  saturatedFat: number;
  carbs: number;
  fiber: number;
  totalSugars: number;
  sodium: number;
  potassium: number;
  calcium: number;
  iron: number;
  magnesium: number;
  phosphorus: number;
  zinc: number;
  selenium: number;
  vitaminA: number;
  vitaminC: number;
  vitaminD: number;
  vitaminE: number;
  vitaminK: number;
  vitaminB12: number;
  folate: number;
  vitaminB6: number;
  thiaminB1: number;
  riboflavinB2: number;
  niacinB3: number;
  monounsaturatedFat: number;
  polyunsaturatedFat: number;
  transFat: number;
  cholesterol: number;
  addedSugars: number;
  sourceRef: string;
  mealDiagnosis?: string;
  dailyDiagnosis?: string;
  photoUrl?: string;
  loggedAt?: string;
}

export interface MealAnalysisResult {
  dishName: string;
  totalDishWeightG?: number;
  portionWeightG?: number;
  weightDifferenceDetected?: boolean;
  weightClarificationPrompt?: string;
  confirmedWeightG?: number;
  mealDiagnosis: string;
  dailyDiagnosis: string;
  clinicalSummary: string;
  rows: MealLogRow[];
  columnHeaders?: string[];
  tsvFormatted?: string;
  aggregatedTotals: {
    calories: number;
    protein: number;
    totalFat: number;
    saturatedFat: number;
    carbs: number;
    fiber: number;
    sodium: number;
    potassium: number;
    addedSugars: number;
  };
  atwaterEvaluation?: {
    totalWeightG: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    atwaterSum: number;
    atwaterDiff: number;
    caloricDensity: number;
    withinTolerance: boolean;
  };
  modelUsed?: string;
}

