import React from 'react';
import { 
  Flame, 
  ShieldAlert, 
  Droplet, 
  Wheat, 
  Candy, 
  Dumbbell, 
  TrendingDown, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { NutrientRow, StatusLevel } from '../types';

interface KeyMetricsGridProps {
  nutrients: NutrientRow[];
  selectedDayKey: string;
}

export const KeyMetricsGrid: React.FC<KeyMetricsGridProps> = ({
  nutrients,
  selectedDayKey,
}) => {
  // Find key nutrients safely
  const findNutrient = (nameQuery: string) => {
    return nutrients.find(n => n.name.toLowerCase().includes(nameQuery.toLowerCase()));
  };

  const calories = findNutrient('calories');
  const satFat = findNutrient('saturated fat');
  const sodium = findNutrient('sodium');
  const fiber = findNutrient('dietary fiber') || findNutrient('fiber');
  const addedSugars = findNutrient('added sugar');
  const protein = findNutrient('protein');

  const getMetricData = (nutrient?: NutrientRow) => {
    if (!nutrient) {
      return { intake: 0, target: 0, unit: '', percentage: 0, statusText: '', statusLevel: 'neutral' as StatusLevel, isCeiling: false, goal: '' };
    }
    const dayData = nutrient.days[selectedDayKey] || nutrient.baseline;
    return {
      intake: dayData.intake,
      target: dayData.target,
      unit: nutrient.unit,
      percentage: dayData.percentage,
      statusText: dayData.statusText,
      statusLevel: dayData.statusLevel,
      isCeiling: nutrient.isCeiling,
      goal: nutrient.clinicalGoal,
    };
  };

  const calData = getMetricData(calories);
  const satFatData = getMetricData(satFat);
  const sodiumData = getMetricData(sodium);
  const fiberData = getMetricData(fiber);
  const sugarData = getMetricData(addedSugars);
  const proteinData = getMetricData(protein);

  const getCardTheme = (level: StatusLevel, isCeiling: boolean) => {
    switch (level) {
      case 'critical':
        return {
          bg: 'bg-red-950/30 border-red-500/40 text-red-400',
          badge: 'bg-red-500/20 text-red-300 border-red-500/30',
          bar: 'bg-red-500',
        };
      case 'severe':
        return {
          bg: 'bg-rose-950/20 border-rose-500/30 text-rose-400',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          bar: 'bg-rose-500',
        };
      case 'warning':
        return {
          bg: 'bg-amber-950/20 border-amber-500/30 text-amber-400',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          bar: 'bg-amber-500',
        };
      case 'safe':
      case 'met':
        return {
          bg: 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          bar: 'bg-emerald-500',
        };
      case 'good':
        return {
          bg: 'bg-teal-950/20 border-teal-500/30 text-teal-400',
          badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
          bar: 'bg-teal-400',
        };
      case 'low':
        return isCeiling ? {
          bg: 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          bar: 'bg-emerald-500',
        } : {
          bg: 'bg-slate-800/60 border-slate-700 text-slate-400',
          badge: 'bg-slate-700 text-slate-300 border-slate-600',
          bar: 'bg-slate-500',
        };
      default:
        return {
          bg: 'bg-slate-800/40 border-slate-700/80 text-slate-300',
          badge: 'bg-slate-700/60 text-slate-300 border-slate-600',
          bar: 'bg-slate-400',
        };
    }
  };

  const cards = [
    {
      id: 'metric-calories',
      title: 'Caloric Intake',
      icon: Flame,
      data: calData,
      subtitle: 'Target Deficit: 1,651 kcal',
      clinicalNote: 'Weight & Energy Balance',
    },
    {
      id: 'metric-sat-fat',
      title: 'Saturated Fat',
      icon: ShieldAlert,
      data: satFatData,
      subtitle: 'Safe Ceiling: 15 g',
      clinicalNote: 'Mitigates LDL Receptor Block',
    },
    {
      id: 'metric-sodium',
      title: 'Sodium Intake',
      icon: Droplet,
      data: sodiumData,
      subtitle: 'Renal Ceiling: 1,200 mg',
      clinicalNote: 'Protects eGFR 80 & Vascular Pressure',
    },
    {
      id: 'metric-fiber',
      title: 'Dietary Fiber',
      icon: Wheat,
      data: fiberData,
      subtitle: 'Cholesterol Target: 38 g',
      clinicalNote: 'Oat Beta-Glucan Binds Bile Acids',
    },
    {
      id: 'metric-added-sugars',
      title: 'Added Sugars',
      icon: Candy,
      data: sugarData,
      subtitle: 'Ceiling Limit: 20 g',
      clinicalNote: 'Dampens Glycemic HbA1c Surges',
    },
    {
      id: 'metric-protein',
      title: 'Protein',
      icon: Dumbbell,
      data: proteinData,
      subtitle: 'Daily Goal: 95 g',
      clinicalNote: 'Nitrogen Balance & Muscle Recovery',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
      {cards.map((card) => {
        const theme = getCardTheme(card.data.statusLevel, card.data.isCeiling);
        const IconComponent = card.icon;
        const progressWidth = Math.min(Math.max(card.data.percentage, 0), 100);

        return (
          <div
            key={card.id}
            id={card.id}
            className={`p-4 sm:p-4.5 rounded-2xl border transition-all duration-200 bg-slate-900/80 hover:bg-slate-800/90 ${theme.bg} shadow-lg relative flex flex-col justify-between`}
          >
            <div>
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                    <IconComponent className="w-4 h-4 text-slate-200" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {card.subtitle}
                    </p>
                  </div>
                </div>

                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${theme.badge} whitespace-nowrap`}>
                  {card.data.percentage}%
                </span>
              </div>

              {/* Main value display */}
              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-white font-heading tracking-tight">
                  {card.data.intake.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  / {card.data.target.toLocaleString()} {card.data.unit}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 w-full bg-slate-800 rounded-full h-2 overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>

            {/* Bottom Clinical Goal Note */}
            <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium truncate">
                {card.clinicalNote}
              </span>
              <span className="text-[10px] text-slate-300 font-semibold bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                {card.data.isCeiling ? 'Ceiling Limit' : 'Goal Floor'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
