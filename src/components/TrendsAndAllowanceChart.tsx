import React, { useState } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ReferenceLine, 
  LineChart, 
  Line, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  Legend 
} from 'recharts';
import { TrendingUp, BarChart3, PieChart, ShieldCheck } from 'lucide-react';
import { DayColumn, NutrientRow } from '../types';

interface TrendsAndAllowanceChartProps {
  nutrients: NutrientRow[];
  columns: DayColumn[];
  selectedDayKey: string;
}

export const TrendsAndAllowanceChart: React.FC<TrendsAndAllowanceChartProps> = ({
  nutrients,
  columns,
  selectedDayKey,
}) => {
  const [activeTab, setActiveTab] = useState<'lipids_renal' | 'calories' | 'micronutrients'>('lipids_renal');

  // Multi-day chronological order (excluding baseline for timeline charts)
  const timelineCols = columns.filter(c => !c.isRollingBaseline).slice().reverse();

  // Find target nutrients
  const satFat = nutrients.find(n => n.name.toLowerCase().includes('saturated fat'));
  const sodium = nutrients.find(n => n.name.toLowerCase().includes('sodium'));
  const calories = nutrients.find(n => n.name.toLowerCase().includes('calories'));
  const fiber = nutrients.find(n => n.name.toLowerCase().includes('fiber'));
  const protein = nutrients.find(n => n.name.toLowerCase().includes('protein'));

  // Prepare trend data for Lipids & Renal
  const multiDayRiskData = timelineCols.map((col) => {
    const satFatVal = satFat?.days[col.key]?.intake || 0;
    const sodiumVal = sodium?.days[col.key]?.intake || 0;
    const calVal = calories?.days[col.key]?.intake || 0;
    const fiberVal = fiber?.days[col.key]?.intake || 0;
    const proteinVal = protein?.days[col.key]?.intake || 0;

    return {
      name: col.label.replace(' (', '\n('),
      shortLabel: col.dateStr || col.label,
      saturatedFat: satFatVal,
      saturatedFatCeiling: 15,
      sodium: sodiumVal,
      sodiumCeiling: 1200,
      calories: calVal,
      calorieDeficitTarget: 1651,
      fiber: fiberVal,
      fiberGoal: 38,
      protein: proteinVal,
      proteinGoal: 95,
    };
  });

  // Prepare Radar data for current selected day's micronutrient balance
  const activeCol = columns.find(c => c.key === selectedDayKey) || columns[0];
  const micronutrientRadarData = nutrients
    .filter(n => ['minerals', 'vitamins'].includes(n.category) && n.baseline.target > 0)
    .slice(0, 10)
    .map(n => {
      const val = n.days[selectedDayKey]?.percentage || 0;
      return {
        nutrient: n.name.replace('Vitamin ', 'Vit ').replace('Monounsaturated', 'MUFA'),
        fulfillment: Math.min(val, 150),
        target: 100,
      };
    });

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
      
      {/* Chart Header & Tab Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-base font-bold text-white tracking-tight">
            Nutritional Allowance Analytics & Longitudinal Trajectory
          </h3>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
          <button
            onClick={() => setActiveTab('lipids_renal')}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeTab === 'lipids_renal' ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Lipid & Renal Ceilings
          </button>
          <button
            onClick={() => setActiveTab('calories')}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeTab === 'calories' ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Caloric Deficit Trend
          </button>
          <button
            onClick={() => setActiveTab('micronutrients')}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeTab === 'micronutrients' ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Micronutrient Radar
          </button>
        </div>
      </div>

      {/* Chart Viewport */}
      <div className="h-[280px] sm:h-[320px] w-full pt-2 min-w-0">
        {activeTab === 'lipids_renal' && (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
            <BarChart data={multiDayRiskData} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
              <XAxis dataKey="shortLabel" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis yAxisId="left" stroke="#f43f5e" fontSize={11} tickLine={false} label={{ value: 'Sat Fat (g)', angle: -90, position: 'insideLeft', fill: '#f43f5e', fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" fontSize={11} tickLine={false} label={{ value: 'Sodium (mg)', angle: 90, position: 'insideRight', fill: '#38bdf8', fontSize: 10 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <ReferenceLine yAxisId="left" y={15} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Sat Fat Limit (15g)', fill: '#f43f5e', fontSize: 10 }} />
              <ReferenceLine yAxisId="right" y={1200} stroke="#38bdf8" strokeDasharray="3 3" label={{ value: 'Sodium Limit (1200mg)', fill: '#38bdf8', fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="saturatedFat" name="Saturated Fat (g)" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar yAxisId="right" dataKey="sodium" name="Sodium (mg)" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'calories' && (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
            <LineChart data={multiDayRiskData} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
              <XAxis dataKey="shortLabel" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#10b981" fontSize={11} tickLine={false} domain={[0, 3500]} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <ReferenceLine y={1651} stroke="#10b981" strokeDasharray="4 4" strokeWidth={2} label={{ value: 'Target Deficit (1,651 kcal)', fill: '#10b981', fontSize: 11 }} />
              <Line type="monotone" dataKey="calories" name="Calories (kcal)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5, fill: '#f59e0b' }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'micronutrients' && (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={micronutrientRadarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="nutrient" stroke="#94a3b8" fontSize={10} />
              <PolarRadiusAxis stroke="#64748b" angle={30} domain={[0, 150]} fontSize={9} />
              <Radar name={`${activeCol.label} Intake %`} dataKey="fulfillment" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
              <Radar name="100% Target RDI" dataKey="target" stroke="#64748b" strokeDasharray="3 3" fill="transparent" />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Cross-referenced against Clinical Limits: LDL 4.2 & eGFR 80</span>
        </span>
        <span className="font-semibold text-slate-300">
          Showing {timelineCols.length} logged data points
        </span>
      </div>

    </div>
  );
};
