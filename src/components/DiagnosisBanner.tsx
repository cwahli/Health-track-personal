import React, { useState } from 'react';
import { 
  Stethoscope, 
  AlertTriangle, 
  CheckCircle2, 
  HeartHandshake, 
  ArrowRight, 
  Activity, 
  ChevronDown, 
  ChevronUp,
  ShieldCheck,
  Droplets,
  Zap
} from 'lucide-react';
import { DiagnosisEntry } from '../types';

interface DiagnosisBannerProps {
  diagnosis: DiagnosisEntry;
  dayLabel: string;
  isBaseline?: boolean;
}

export const DiagnosisBanner: React.FC<DiagnosisBannerProps> = ({
  diagnosis,
  dayLabel,
  isBaseline,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!diagnosis || !diagnosis.raw) {
    return (
      <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 text-sm text-slate-400">
        No specific diagnosis logged in spreadsheet for {dayLabel}.
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-800/90 via-slate-800/60 to-slate-900/90 border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
      {/* Subtle background glow indicator */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Clinical Health & Metabolic Trajectory
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-medium">
                {dayLabel}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {isBaseline ? '4-Day Rolling Metabolic Baseline' : 'Daily Clinical Diagnosis & Organ Protection'}
            </h2>
          </div>
        </div>

        <button
          id="toggle-diagnosis-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          className="self-end sm:self-center flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-xs text-slate-300 transition cursor-pointer"
        >
          <span>{isExpanded ? 'Collapse' : 'Expand Details'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Overall summary sentence */}
      <div className="mt-4">
        <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-medium">
          {diagnosis.overall}
        </p>
      </div>

      {/* Detailed sections when expanded */}
      {isExpanded && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Positive Highlights Card */}
          {diagnosis.highlights.length > 0 && (
            <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Positive Highlights & Clinical Breakthroughs</span>
              </div>
              <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                {diagnosis.highlights.map((highlight, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Primary Flags Card */}
          {diagnosis.flags.length > 0 && (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Primary Flags & Risk Alerts</span>
              </div>
              <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                {diagnosis.flags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clinical Impact & Organ Prognosis */}
          {diagnosis.clinicalImpact.length > 0 && (
            <div className="bg-slate-900/70 border border-slate-700/80 rounded-xl p-4">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                <Activity className="w-4 h-4" />
                <span>Organ-Level Clinical Impact</span>
              </div>
              <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                {diagnosis.clinicalImpact.map((impact, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                    <span>{impact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Action Plan */}
          {diagnosis.actionPlan.length > 0 && (
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                <Zap className="w-4 h-4" />
                <span>Prescribed Next Steps & Dietary Anchors</span>
              </div>
              <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                {diagnosis.actionPlan.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <span className="font-medium text-amber-100/90">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
