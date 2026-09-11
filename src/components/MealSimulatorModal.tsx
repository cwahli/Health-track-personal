import React, { useState } from 'react';
import { 
  X, 
  Utensils, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  Flame,
  Droplet
} from 'lucide-react';
import { MealSimulationResult, NutrientRow } from '../types';

interface MealSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  nutrients: NutrientRow[];
  selectedDayKey: string;
}

export const MealSimulatorModal: React.FC<MealSimulatorModalProps> = ({
  isOpen,
  onClose,
  nutrients,
  selectedDayKey,
}) => {
  const [mealInput, setMealInput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<MealSimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentIntakes: Record<string, number> = {};
  nutrients.forEach(n => {
    currentIntakes[n.name] = n.days[selectedDayKey]?.intake || 0;
  });

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealInput.trim()) return;

    setIsSimulating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/gemini/simulate-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealQuery: mealInput.trim(),
          currentDayIntakes: currentIntakes,
        }),
      });

      if (!res.ok) {
        throw new Error('Meal simulation failed. Please try a different query.');
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      console.warn(err);
      setError(err.message || 'Error running meal simulation');
    } finally {
      setIsSimulating(false);
    }
  };

  const sampleMeals = [
    '200g Quaker Instant Oatmeal with blueberries and 1 scoop plant protein',
    'Steamed wild salmon (150g) with 1 cup steamed broccoli and brown rice',
    'Double cheeseburger with medium french fries and a chocolate shake',
    'Tofu, edamame and vegetable stir-fry with low-sodium tamari',
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B111E] text-slate-100 animate-fade-in overflow-y-auto">
      {/* Header */}
      <div className="px-4 sm:px-8 py-4 border-b border-slate-800/80 bg-[#0B111E] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Meal Intake & Allowance Simulator
              </h3>
              <p className="text-xs text-slate-400">
                Predict how a planned meal will impact today's remaining nutrient ceilings
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSimulate} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Describe what you plan to eat:
            </label>
            <textarea
              id="meal-query-input"
              rows={3}
              placeholder="e.g. 150g grilled chicken breast with roasted sweet potato, asparagus, and 1 tbsp olive oil..."
              value={mealInput}
              onChange={(e) => setMealInput(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Quick Preset Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Try sample:</span>
            {sampleMeals.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setMealInput(sample)}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
              >
                {sample.slice(0, 32)}...
              </button>
            ))}
          </div>

          <div className="flex justify-end pt-1">
            <button
              id="run-simulation-btn"
              type="submit"
              disabled={isSimulating || !mealInput.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Simulating Impact...' : 'Simulate Meal Impact'}</span>
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Simulation Results */}
        {result && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
            
            {/* Verdict Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase">
                Clinical Allowance Verdict
              </span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                result.verdict === 'Recommended'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : result.verdict === 'Caution'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                {result.verdict}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {result.explanation}
            </p>

            {/* Estimated Nutrient Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Calories</span>
                <span className="text-sm font-bold text-white">{result.estimatedNutrition.calories} kcal</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Saturated Fat</span>
                <span className={`text-sm font-bold ${result.estimatedNutrition.saturatedFat > 5 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {result.estimatedNutrition.saturatedFat} g
                </span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Sodium</span>
                <span className={`text-sm font-bold ${result.estimatedNutrition.sodium > 600 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {result.estimatedNutrition.sodium} mg
                </span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Dietary Fiber</span>
                <span className="text-sm font-bold text-teal-400">{result.estimatedNutrition.fiber} g</span>
              </div>
            </div>

            {/* Warnings or Highlights */}
            {result.warnings?.length > 0 && (
              <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Allowance Breaches & Warnings:</span>
                </div>
                <ul className="list-disc list-inside text-rose-200 space-y-0.5">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.positiveHighlights?.length > 0 && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Positive Contributions:</span>
                </div>
                <ul className="list-disc list-inside text-emerald-200 space-y-0.5">
                  {result.positiveHighlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}

    </div>
  );
};
