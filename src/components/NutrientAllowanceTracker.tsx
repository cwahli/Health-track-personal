import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ShieldAlert, 
  Flame, 
  Sparkles, 
  Check, 
  AlertTriangle, 
  ChevronRight,
  TrendingDown,
  TrendingUp,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { NutrientCategory, NutrientRow, StatusLevel } from '../types';

interface NutrientAllowanceTrackerProps {
  nutrients: NutrientRow[];
  selectedDayKey: string;
}

export const NutrientAllowanceTracker: React.FC<NutrientAllowanceTrackerProps> = ({
  nutrients,
  selectedDayKey,
}) => {
  const [activeCategory, setActiveCategory] = useState<NutrientCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'flagged' | 'safe'>('all');

  const categories = [
    { id: 'all', label: 'All Nutrients', count: nutrients.length },
    { id: 'critical_limits', label: 'Critical Ceilings', count: nutrients.filter(n => n.category === 'critical_limits').length },
    { id: 'macronutrients', label: 'Macronutrients', count: nutrients.filter(n => n.category === 'macronutrients').length },
    { id: 'minerals', label: 'Vital Minerals', count: nutrients.filter(n => n.category === 'minerals').length },
    { id: 'vitamins', label: 'Essential Vitamins', count: nutrients.filter(n => n.category === 'vitamins').length },
    { id: 'lipids', label: 'Fatty Acid Quality', count: nutrients.filter(n => n.category === 'lipids').length },
  ];

  const filteredNutrients = useMemo(() => {
    return nutrients.filter((nutrient) => {
      // Category match
      if (activeCategory !== 'all' && nutrient.category !== activeCategory) {
        return false;
      }

      // Search match
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesName = nutrient.name.toLowerCase().includes(query);
        const matchesGoal = nutrient.clinicalGoal.toLowerCase().includes(query);
        if (!matchesName && !matchesGoal) return false;
      }

      // Status filter
      const dayData = nutrient.days[selectedDayKey] || nutrient.baseline;
      const isFlagged = ['critical', 'severe', 'warning'].includes(dayData.statusLevel);
      if (statusFilter === 'flagged' && !isFlagged) return false;
      if (statusFilter === 'safe' && isFlagged) return false;

      return true;
    });
  }, [nutrients, activeCategory, searchQuery, statusFilter, selectedDayKey]);

  const getStatusBadge = (level: StatusLevel, statusText: string, isCeiling: boolean, percentage: number) => {
    switch (level) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
            Critical Breach ({percentage}%)
          </span>
        );
      case 'severe':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Severe Alert ({percentage}%)
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Mild Elevation ({percentage}%)
          </span>
        );
      case 'safe':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Within Safe Limit ({percentage}%)
          </span>
        );
      case 'met':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Check className="w-3 h-3 text-emerald-400" />
            Goal Met ({percentage}%)
          </span>
        );
      case 'good':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            Good Progress ({percentage}%)
          </span>
        );
      case 'low':
        return isCeiling ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Safe Floor ({percentage}%)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Low Intake ({percentage}%)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            {percentage}%
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5">
      
      {/* Tracker Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Nutritional Allowance & Biomarker Matrix
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete profile of 30+ micro & macronutrients synchronized from the Google Sheet
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="nutrient-search-input"
              type="text"
              placeholder="Search nutrients or clinical goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                statusFilter === 'all' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('flagged')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                statusFilter === 'flagged' ? 'bg-rose-950/80 text-rose-300 border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Flagged Only
            </button>
            <button
              onClick={() => setStatusFilter('safe')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                statusFilter === 'safe' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Safe / Met
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeCategory === cat.id
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>{cat.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeCategory === cat.id ? 'bg-emerald-900/40 text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'
            }`}>
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Table & Cards Matrix */}
      <div className="space-y-2.5">
        {filteredNutrients.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-800/20 rounded-xl border border-dashed border-slate-700">
            No nutrients match your search or filter criteria.
          </div>
        ) : (
          <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-950/40 divide-y divide-slate-800/80">
            {filteredNutrients.map((nutrient) => {
              const dayData = nutrient.days[selectedDayKey] || nutrient.baseline;
              const baselineData = nutrient.baseline;
              const isCeiling = nutrient.isCeiling;
              const progressPercent = Math.min(Math.max(dayData.percentage, 0), 100);

              let barColor = 'bg-emerald-500';
              if (dayData.statusLevel === 'critical') barColor = 'bg-red-500';
              else if (dayData.statusLevel === 'severe') barColor = 'bg-rose-500';
              else if (dayData.statusLevel === 'warning') barColor = 'bg-amber-500';
              else if (dayData.statusLevel === 'low' && !isCeiling) barColor = 'bg-slate-500';

              return (
                <div
                  key={nutrient.id}
                  className="p-3.5 sm:p-4 hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {/* Left: Nutrient Name & Clinical Goal */}
                  <div className="sm:w-1/3 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white truncate">
                        {nutrient.name}
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                        {isCeiling ? 'Max Limit' : 'Min Goal'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
                      <Info className="w-3 h-3 text-teal-400 shrink-0" />
                      <span className="truncate">{nutrient.clinicalGoal}</span>
                    </div>
                  </div>

                  {/* Middle: Progress Bar & Values */}
                  <div className="sm:w-1/3 flex flex-col justify-center">
                    <div className="flex items-baseline justify-between text-xs mb-1">
                      <span className="font-extrabold text-white">
                        {dayData.intake.toLocaleString()} {nutrient.unit}
                      </span>
                      <span className="text-slate-400 font-medium">
                        Target: {dayData.target.toLocaleString()} {nutrient.unit}
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    {/* Baseline comparison */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span>4-Day Avg: {baselineData.intake} {nutrient.unit}</span>
                      {selectedDayKey !== 'baseline' && (
                        <span className={`font-semibold ${
                          dayData.intake < baselineData.intake
                            ? isCeiling ? 'text-emerald-400' : 'text-amber-400'
                            : isCeiling ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {dayData.intake < baselineData.intake ? '↓ Improved' : '↑ Higher'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Status Pill */}
                  <div className="sm:w-1/3 flex sm:justify-end items-center">
                    {getStatusBadge(dayData.statusLevel, dayData.statusText, isCeiling, dayData.percentage)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
