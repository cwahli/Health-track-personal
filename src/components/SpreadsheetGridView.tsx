import React, { useState, useMemo } from 'react';
import { 
  Sheet, 
  Search, 
  Download, 
  RefreshCw, 
  Info, 
  FileSpreadsheet,
  Copy,
  Check,
  Table,
  Utensils
} from 'lucide-react';
import { SheetState, MealLogRow } from '../types';

interface SpreadsheetGridViewProps {
  sheetState: SheetState;
  mealSheetRows?: MealLogRow[];
  onOpenConnectModal: () => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
}

export const SpreadsheetGridView: React.FC<SpreadsheetGridViewProps> = ({
  sheetState,
  mealSheetRows = [],
  onOpenConnectModal,
  onManualRefresh,
  isRefreshing,
}) => {
  const [activeSheetTab, setActiveSheetTab] = useState<'meal_log' | 'nutrient_matrix'>('meal_log');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isExpandedDiagnosis, setIsExpandedDiagnosis] = useState(false);
  const [hasCopiedMealLogTsv, setHasCopiedMealLogTsv] = useState(false);

  const { columns, diagnoses, nutrients } = sheetState;

  // Filter Nutrients in Matrix
  const filteredNutrients = useMemo(() => {
    return nutrients.filter((n) => {
      const matchesSearch = n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.clinicalGoal.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [nutrients, searchQuery, selectedCategory]);

  // Filter Meal Log Rows
  const filteredMealRows = useMemo(() => {
    if (!searchQuery.trim()) return mealSheetRows;
    const q = searchQuery.toLowerCase();
    return mealSheetRows.filter((r) =>
      r.dishName.toLowerCase().includes(q) ||
      r.ingredient.toLowerCase().includes(q) ||
      r.mealId.toLowerCase().includes(q) ||
      r.date.toLowerCase().includes(q) ||
      r.mealSlot.toLowerCase().includes(q) ||
      r.sourceRef.toLowerCase().includes(q)
    );
  }, [mealSheetRows, searchQuery]);

  const getStatusBadgeStyle = (level: string) => {
    switch (level) {
      case 'safe':
      case 'met':
      case 'good':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'warning':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'severe':
        return 'bg-orange-500/10 text-orange-300 border-orange-500/20';
      case 'critical':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/30 font-bold';
      case 'low':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const handleExportCSV = () => {
    if (activeSheetTab === 'meal_log') {
      const headers = [
        'Dish Name', 'Meal ID', 'Date', 'Meal Slot', 'Ingredient / Component',
        'Weight (g)', 'Calories (kcal)', 'Protein (g)', 'Total Fat (g)', 'Saturated Fat (g)',
        'Carbs (g)', 'Fiber (g)', 'Sugars (g)', 'Sodium (mg)', 'Potassium (mg)',
        'Calcium (mg)', 'Iron (mg)', 'Magnesium (mg)', 'Phosphorus (mg)', 'Zinc (mg)',
        'Selenium (mcg)', 'Vit A (mcg RAE)', 'Vit C (mg)', 'Vit D (mcg)', 'Vit E (mg)',
        'Vit K (mcg)', 'Vit B12 (mcg)', 'Folate (mcg DFE)', 'Vit B6 (mg)', 'Thiamin B1 (mg)',
        'Riboflavin B2 (mg)', 'Niacin B3 (mg NE)', 'Mono Fat (g)', 'Poly Fat (g)', 'Trans Fat (g)',
        'Cholesterol (mg)', 'Added Sugars (g)', 'USDA / Source Reference'
      ];

      const csvLines = [headers.join(',')];
      filteredMealRows.forEach((r) => {
        const row = [
          `"${(r.dishName || '').replace(/"/g, '""')}"`,
          `"${r.mealId || ''}"`,
          `"${r.date || ''}"`,
          `"${r.mealSlot || ''}"`,
          `"${(r.ingredient || '').replace(/"/g, '""')}"`,
          r.weightG,
          r.calories,
          r.protein,
          r.totalFat,
          r.saturatedFat,
          r.carbs,
          r.fiber,
          r.totalSugars,
          r.sodium,
          r.potassium,
          r.calcium,
          r.iron,
          r.magnesium,
          r.phosphorus,
          r.zinc,
          r.selenium,
          r.vitaminA,
          r.vitaminC,
          r.vitaminD,
          r.vitaminE,
          r.vitaminK,
          r.vitaminB12,
          r.folate,
          r.vitaminB6,
          r.thiaminB1,
          r.riboflavinB2,
          r.niacinB3,
          r.monounsaturatedFat,
          r.polyunsaturatedFat,
          r.transFat,
          r.cholesterol,
          r.addedSugars,
          `"${(r.sourceRef || '').replace(/"/g, '""')}"`
        ];
        csvLines.push(row.join(','));
      });

      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `meal_log_tab_export_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    let csv = `Top nutrient,${columns.map(c => `${c.label},Status`).join(',')}\n`;
    
    // Add Diagnosis Row
    csv += `Diagnosis,"${columns.map(c => {
      const d = diagnoses[c.key] || diagnoses['baseline'];
      return (d?.raw || '').replace(/"/g, '""');
    }).join('","')}"\n`;

    // Add Nutrients
    filteredNutrients.forEach(n => {
      const row = [n.name];
      columns.forEach(c => {
        const val = c.isRollingBaseline ? n.baseline : n.days[c.key];
        row.push(`${val?.intake || 0} / ${val?.target || 0} ${n.unit}`);
        row.push(val?.statusText || '');
      });
      csv += `"${row.join('","')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nutrient_matrix_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyMealLogTSV = () => {
    const headers = [
      'Dish Name', 'Meal ID', 'Date', 'Meal Slot', 'Ingredient / Component',
      'Weight (g)', 'Calories (kcal)', 'Protein (g)', 'Total Fat (g)', 'Saturated Fat (g)',
      'Carbs (g)', 'Fiber (g)', 'Sugars (g)', 'Sodium (mg)', 'Potassium (mg)',
      'Calcium (mg)', 'Iron (mg)', 'Magnesium (mg)', 'Phosphorus (mg)', 'Zinc (mg)',
      'Selenium (mcg)', 'Vit A (mcg RAE)', 'Vit C (mg)', 'Vit D (mcg)', 'Vit E (mg)',
      'Vit K (mcg)', 'Vit B12 (mcg)', 'Folate (mcg DFE)', 'Vit B6 (mg)', 'Thiamin B1 (mg)',
      'Riboflavin B2 (mg)', 'Niacin B3 (mg NE)', 'Mono Fat (g)', 'Poly Fat (g)', 'Trans Fat (g)',
      'Cholesterol (mg)', 'Added Sugars (g)', 'USDA / Source Reference'
    ];

    const tsvLines = [headers.join('\t')];
    filteredMealRows.forEach((r) => {
      const row = [
        r.dishName, r.mealId, r.date, r.mealSlot, r.ingredient,
        r.weightG, r.calories, r.protein, r.totalFat, r.saturatedFat,
        r.carbs, r.fiber, r.totalSugars, r.sodium, r.potassium,
        r.calcium, r.iron, r.magnesium, r.phosphorus, r.zinc,
        r.selenium, r.vitaminA, r.vitaminC, r.vitaminD, r.vitaminE,
        r.vitaminK, r.vitaminB12, r.folate, r.vitaminB6, r.thiaminB1,
        r.riboflavinB2, r.niacinB3, r.monounsaturatedFat, r.polyunsaturatedFat, r.transFat,
        r.cholesterol, r.addedSugars, r.sourceRef
      ];
      tsvLines.push(row.join('\t'));
    });

    navigator.clipboard.writeText(tsvLines.join('\n'));
    setHasCopiedMealLogTsv(true);
    setTimeout(() => setHasCopiedMealLogTsv(false), 2500);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Controls Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-heading">
                  Google Sheet Master Spreadsheet
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live Synced
                </span>
              </div>
              <p className="text-xs text-slate-400">
                1:1 Tabular view of your Google Sheet tabs: 38-column &quot;meal log&quot; components and 30-nutrient baseline matrix
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeSheetTab === 'meal_log' && (
              <button
                type="button"
                onClick={handleCopyMealLogTSV}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {hasCopiedMealLogTsv ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Copied TSV!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-emerald-400" />
                    <span>Copy for Google Sheet</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onOpenConnectModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Sheet className="w-4 h-4 text-emerald-400" />
              <span>Sheet Settings</span>
            </button>
            <button
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Re-sync Live</span>
            </button>
          </div>

        </div>

        {/* Tab Switcher: "meal log" vs "Nutrient Matrix" */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSheetTab('meal_log')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSheetTab === 'meal_log'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Tab: &quot;meal log&quot; (38 columns)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeSheetTab === 'meal_log' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-900 text-slate-400'
            }`}>
              {mealSheetRows.length} rows
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSheetTab('nutrient_matrix')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSheetTab === 'nutrient_matrix'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tab: &quot;Nutrient Matrix & Allowances&quot;</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeSheetTab === 'nutrient_matrix' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-900 text-slate-400'
            }`}>
              {nutrients.length} nutrients
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeSheetTab === 'meal_log'
                  ? "Search meal log (dish name, ingredient, meal ID, date, source reference)..."
                  : "Filter nutrients (e.g. Sodium, Saturated Fat, Fiber, Potassium, B12)..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {activeSheetTab === 'nutrient_matrix' && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">📑 All Categories ({nutrients.length} items)</option>
              <option value="critical_limits">🚨 Critical Clinical Limits</option>
              <option value="macronutrients">⚡ Macronutrients</option>
              <option value="minerals">🧪 Essential Minerals</option>
              <option value="vitamins">💊 Vitamins & Micronutrients</option>
              <option value="lipids">🥑 Fatty Acid Profiles</option>
            </select>
          )}
        </div>

      </div>

      {/* TAB 1: MEAL LOG 38-COLUMN TABULAR VIEW */}
      {activeSheetTab === 'meal_log' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs px-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-400">Sheet Tab: &quot;meal log&quot;</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">38 Columns Component Row Format (appends on &quot;Save Meal&quot;)</span>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">
              Showing {filteredMealRows.length} of {mealSheetRows.length} rows
            </span>
          </div>

          <div className="overflow-x-auto max-h-[700px] overflow-y-auto text-[11px]">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-950/95 sticky top-0 z-20 border-b border-slate-800 text-slate-300 font-semibold shadow-sm">
                <tr>
                  <th className="p-2.5 border-r border-slate-800 sticky left-0 z-30 bg-slate-950">Dish Name</th>
                  <th className="p-2.5 border-r border-slate-800">Meal ID</th>
                  <th className="p-2.5 border-r border-slate-800">Date</th>
                  <th className="p-2.5 border-r border-slate-800">Meal Slot</th>
                  <th className="p-2.5 border-r border-slate-800 text-indigo-300 font-bold">Ingredient / Component</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Weight (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right text-amber-300 font-bold">Calories (kcal)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right text-indigo-300 font-bold">Protein (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Total Fat (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right text-rose-300 font-bold">Saturated Fat (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Carbs (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right text-emerald-300 font-bold">Fiber (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Sugars (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right text-sky-300 font-bold">Sodium (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Potassium (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Calcium (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Iron (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Magnesium (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Phosphorus (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Zinc (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Selenium (mcg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Vit A (mcg RAE)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Vit C (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Vit D (mcg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Vit E (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Vit K (mcg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Vit B12 (mcg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Folate (mcg DFE)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Vit B6 (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Thiamin B1 (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Riboflavin B2 (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Niacin B3 (mg NE)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Mono Fat (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Poly Fat (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Trans Fat (g)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right">Cholesterol (mg)</th>
                  <th className="p-2.5 border-r border-slate-800 text-right text-rose-300">Added Sugars (g)</th>
                  <th className="p-2.5">USDA / Source Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {filteredMealRows.length === 0 ? (
                  <tr>
                    <td colSpan={38} className="text-center py-12 text-slate-500 font-sans">
                      No rows matching filter. Use &quot;Add Meal & Photo&quot; to review a meal and click &quot;Save Meal&quot; to append component rows here!
                    </td>
                  </tr>
                ) : (
                  filteredMealRows.map((r, idx) => (
                    <tr key={r.id || `${r.mealId}-${idx}`} className="hover:bg-slate-800/40 transition">
                      <td className="p-2 border-r border-slate-800 font-sans font-semibold text-white sticky left-0 bg-slate-900/95 max-w-[200px] truncate">
                        {r.dishName}
                      </td>
                      <td className="p-2 border-r border-slate-800 text-emerald-400 font-bold">{r.mealId}</td>
                      <td className="p-2 border-r border-slate-800 text-slate-400">{r.date}</td>
                      <td className="p-2 border-r border-slate-800">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                          {r.mealSlot}
                        </span>
                      </td>
                      <td className="p-2 border-r border-slate-800 font-sans text-indigo-200 font-medium max-w-[240px] truncate">
                        {r.ingredient}
                      </td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.weightG}</td>
                      <td className="p-2 border-r border-slate-800 text-right font-bold text-amber-300">{r.calories}</td>
                      <td className="p-2 border-r border-slate-800 text-right text-indigo-300 font-semibold">{r.protein}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.totalFat}</td>
                      <td className="p-2 border-r border-slate-800 text-right text-rose-300 font-semibold">{r.saturatedFat}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.carbs}</td>
                      <td className="p-2 border-r border-slate-800 text-right text-emerald-300 font-semibold">{r.fiber}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.totalSugars}</td>
                      <td className="p-2 border-r border-slate-800 text-right text-sky-300 font-semibold">{r.sodium}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.potassium}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.calcium}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.iron}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.magnesium}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.phosphorus}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.zinc}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.selenium}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.vitaminA}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.vitaminC}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.vitaminD}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.vitaminE}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.vitaminK}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.vitaminB12}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.folate}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.vitaminB6}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.thiaminB1}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.riboflavinB2}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.niacinB3}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.monounsaturatedFat}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.polyunsaturatedFat}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.transFat}</td>
                      <td className="p-2 border-r border-slate-800 text-right">{r.cholesterol}</td>
                      <td className="p-2 border-r border-slate-800 text-right text-rose-300">{r.addedSugars}</td>
                      <td className="p-2 text-slate-400 text-[10px] font-sans truncate max-w-[200px]">{r.sourceRef}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 px-4">
            <span>Total: {filteredMealRows.length} component rows in &quot;meal log&quot;</span>
            <div className="flex items-center gap-4 text-emerald-400 font-mono text-[11px]">
              <span>Calories Sum: {filteredMealRows.reduce((sum, r) => sum + (r.calories || 0), 0)} kcal</span>
              <span>Protein Sum: {Math.round(filteredMealRows.reduce((sum, r) => sum + (r.protein || 0), 0) * 10) / 10}g</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NUTRIENT MATRIX & ALLOWANCES TABULAR VIEW */}
      {activeSheetTab === 'nutrient_matrix' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
              
              <thead className="bg-slate-950/95 sticky top-0 z-20 border-b border-slate-800 text-slate-300 font-semibold shadow-sm">
                <tr>
                  <th className="sticky left-0 z-30 bg-slate-950 py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-emerald-400 border-r border-slate-800 w-72 min-w-[260px]">
                    Top Nutrient (Column A)
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`py-3.5 px-4 text-xs uppercase tracking-wider border-r border-slate-800 min-w-[160px] ${
                        col.isRollingBaseline ? 'bg-indigo-950/40 text-indigo-300 font-bold' : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{col.label}</span>
                        {col.isRollingBaseline && (
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                            Baseline
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60">
                
                {/* Row 2: Diagnosis Entry */}
                <tr className="bg-slate-950/70 hover:bg-slate-950/90 transition">
                  <td className="sticky left-0 z-10 bg-slate-950 py-3 px-4 font-bold text-emerald-400 border-r border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-emerald-400" />
                      <span>Diagnosis (Row 2)</span>
                    </div>
                  </td>
                  {columns.map((col) => {
                    const diag = diagnoses[col.key] || diagnoses['baseline'];
                    return (
                      <td
                        key={col.key}
                        className={`py-3 px-4 text-[11px] text-slate-300 border-r border-slate-800/80 align-top ${
                          col.isRollingBaseline ? 'bg-indigo-950/20' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          <p className={`line-clamp-3 text-slate-300 ${isExpandedDiagnosis ? 'line-clamp-none' : ''}`}>
                            {diag?.overall || diag?.raw || '—'}
                          </p>
                          {diag?.highlights && diag.highlights.length > 0 && (
                            <span className="text-[10px] text-emerald-400 block font-medium">
                              🟢 {diag.highlights[0]}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Nutrients Rows */}
                {filteredNutrients.map((nutrient) => {
                  return (
                    <tr 
                      key={nutrient.id}
                      className="hover:bg-slate-800/40 transition group"
                    >
                      {/* Nutrient Name Column */}
                      <td className="sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-850 py-3 px-4 border-r border-slate-800">
                        <div>
                          <span className="font-bold text-white text-xs block">
                            {nutrient.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {nutrient.clinicalGoal}
                          </span>
                        </div>
                      </td>

                      {/* Day Value Columns */}
                      {columns.map((col) => {
                        const val = col.isRollingBaseline ? nutrient.baseline : nutrient.days[col.key];
                        if (!val) {
                          return (
                            <td key={col.key} className="py-3 px-4 text-slate-500 border-r border-slate-800/80">
                              —
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.key}
                            className={`py-3 px-4 border-r border-slate-800/80 ${
                              col.isRollingBaseline ? 'bg-indigo-950/10' : ''
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-baseline justify-between gap-1">
                                <span className="font-bold text-white text-xs">
                                  {val.intake} <span className="text-[10px] font-normal text-slate-400">/ {val.target} {nutrient.unit}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {val.percentage}%
                                </span>
                              </div>

                              {val.statusText && (
                                <div className={`text-[10px] px-2 py-0.5 rounded-md border font-medium truncate ${getStatusBadgeStyle(val.statusLevel)}`}>
                                  {val.statusText}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                    </tr>
                  );
                })}

              </tbody>

            </table>
          </div>

          {/* Table Footer */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 px-4">
            <span>Showing {filteredNutrients.length} nutrients across {columns.length} columns</span>
            <button
              onClick={() => setIsExpandedDiagnosis(!isExpandedDiagnosis)}
              className="text-emerald-400 hover:text-emerald-300 font-medium text-xs cursor-pointer"
            >
              {isExpandedDiagnosis ? 'Collapse Diagnosis Texts' : 'Expand All Diagnosis Texts'}
            </button>
          </div>

        </div>
      )}

    </div>
  );
};
