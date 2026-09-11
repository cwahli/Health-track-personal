import React from 'react';
import { Calendar, TrendingUp, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { DayColumn } from '../types';

interface DaySelectorProps {
  columns: DayColumn[];
  selectedDayKey: string;
  onSelectDay: (key: string) => void;
}

export const DaySelector: React.FC<DaySelectorProps> = ({
  columns,
  selectedDayKey,
  onSelectDay,
}) => {
  return (
    <div className="w-full bg-slate-900/60 p-2 sm:p-2.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar shadow-inner">
      <div className="flex items-center gap-1.5 min-w-max">
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <Calendar className="w-3.5 h-3.5 text-emerald-400" />
          <span>Tracking Timeline:</span>
        </div>

        {columns.map((col) => {
          const isSelected = col.key === selectedDayKey;
          const isBaseline = col.isRollingBaseline;

          return (
            <button
              key={col.key}
              id={`day-select-btn-${col.key}`}
              onClick={() => onSelectDay(col.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? isBaseline
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md shadow-amber-950/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-md shadow-emerald-950/40'
                  : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {isBaseline ? (
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              ) : col.label.includes('Today') ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-500" />
              )}
              
              <div className="flex flex-col items-start leading-tight">
                <span className={`font-semibold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                  {col.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
