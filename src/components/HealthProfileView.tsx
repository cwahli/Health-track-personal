import React, { useState } from 'react';
import { 
  Heart, 
  Droplet, 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Sparkles, 
  FileText, 
  Stethoscope, 
  CheckCircle2, 
  Info,
  Calendar,
  Flame,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { SheetState } from '../types';

interface HealthProfileViewProps {
  sheetState: SheetState;
}

export const HealthProfileView: React.FC<HealthProfileViewProps> = ({
  sheetState,
}) => {
  const [activeBiomarkerTab, setActiveBiomarkerTab] = useState<'all' | 'renal' | 'cardiac' | 'glycemic'>('all');
  const [expandedSection, setExpandedSection] = useState<'all' | 'diagnoses' | 'ceilings' | 'guidelines'>('all');

  const biomarkers = [
    {
      id: 'egfr',
      name: 'eGFR (Estimated Glomerular Filtration)',
      value: '80',
      unit: 'mL/min/1.73m²',
      status: 'Mild Reduction (Stage 2 CKD reserve)',
      statusType: 'warning' as const,
      category: 'renal',
      target: '> 90 mL/min',
      clinicalNote: 'Sodium must strictly stay below 1,200 mg/day to prevent intraglomerular hyperfiltration and preserve nephron density.',
      trend: 'stable',
      lastTestDate: 'August 2026'
    },
    {
      id: 'creatinine',
      name: 'Serum Creatinine',
      value: '104',
      unit: 'μmol/L (1.18 mg/dL)',
      status: 'Borderline Upper Limit',
      statusType: 'warning' as const,
      category: 'renal',
      target: '60 – 105 μmol/L',
      clinicalNote: 'Maintain adequate daytime hydration (2.5–3L water) and moderate dietary animal purine/protein load.',
      trend: 'improving',
      lastTestDate: 'August 2026'
    },
    {
      id: 'ldl',
      name: 'LDL-C (Low-Density Lipoprotein)',
      value: '4.2',
      unit: 'mmol/L (162 mg/dL)',
      status: 'Elevated (Target < 2.6 mmol/L)',
      statusType: 'critical' as const,
      category: 'cardiac',
      target: '< 2.6 mmol/L',
      clinicalNote: 'Critical clinical priority. Saturated fat ceiling strictly capped at 15g/day. Oat beta-glucan binds circulating bile acids.',
      trend: 'improving',
      lastTestDate: 'August 2026'
    },
    {
      id: 'hba1c',
      name: 'HbA1c (Glycated Hemoglobin)',
      value: '40',
      unit: 'mmol/mol (5.8%)',
      status: 'Prediabetes Range',
      statusType: 'warning' as const,
      category: 'glycemic',
      target: '< 38 mmol/mol (< 5.7%)',
      clinicalNote: 'Added sugar capped at 20g/day. Complex soluble fiber and oat beta-glucan blunt postprandial glucose excursions.',
      trend: 'improving',
      lastTestDate: 'August 2026'
    },
    {
      id: 'bp',
      name: 'Resting Blood Pressure',
      value: '122 / 78',
      unit: 'mmHg',
      status: 'Optimal / Well Controlled',
      statusType: 'optimal' as const,
      category: 'cardiac',
      target: '< 130 / 80 mmHg',
      clinicalNote: 'Low dietary sodium and potassium-rich whole foods directly maintain safe endothelial vascular resistance.',
      trend: 'optimal',
      lastTestDate: 'September 2026'
    },
    {
      id: 'potassium',
      name: 'Serum Potassium (K+)',
      value: '4.4',
      unit: 'mmol/L',
      status: 'Normal Range (3.5 - 5.0)',
      statusType: 'optimal' as const,
      category: 'renal',
      target: '3.5 – 5.0 mmol/L',
      clinicalNote: 'Healthy electrolyte balance; no hyperkalemia restrictions currently required, but dietary sodium/potassium ratio should remain high in potassium.',
      trend: 'stable',
      lastTestDate: 'August 2026'
    },
  ];

  const filteredBiomarkers = biomarkers.filter(b => 
    activeBiomarkerTab === 'all' ? true : b.category === activeBiomarkerTab
  );

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Header Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 shadow-lg shadow-rose-500/10">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white font-heading tracking-tight">
                  Health Profile & Labs
                </h2>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Core Organ Protection Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Pillar 1: Renal Filtration */}
        <div className="bg-slate-900/90 border border-sky-500/30 rounded-2xl p-5 relative flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold">
                  <Droplet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Renal System (Kidneys)</h3>
                  <span className="text-[10px] text-sky-400 font-semibold">eGFR 80 mL/min • Stage 2</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-500/30">
                Primary Goal
              </span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Sodium Hard Limit:</span>
                <span className="font-bold text-sky-300">&lt; 1,200 mg / day</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Protein Target:</span>
                <span className="font-bold text-slate-200">85 – 95 g / day</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Daily Hydration:</span>
                <span className="font-bold text-emerald-400">2.5 – 3.0 L Plain Water</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-300 leading-relaxed">
            <strong>Clinical Focus:</strong> Halving sodium prevents glomerular capillary hypertension and slows nephron sclerosis.
          </div>
        </div>

        {/* Pillar 2: Cardiovascular & Lipids */}
        <div className="bg-slate-900/90 border border-rose-500/30 rounded-2xl p-5 relative flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
                  <Heart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Cardiovascular & Lipids</h3>
                  <span className="text-[10px] text-rose-400 font-semibold">LDL-C 4.2 mmol/L (162 mg/dL)</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                Urgent Priority
              </span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Saturated Fat Ceiling:</span>
                <span className="font-bold text-rose-300">&lt; 15 g / day</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Trans Fats:</span>
                <span className="font-bold text-emerald-400">0.0 g (Strict Zero)</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Soluble Fiber (Beta-Glucan):</span>
                <span className="font-bold text-emerald-400">&ge; 38 g / day total</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-300 leading-relaxed">
            <strong>Clinical Focus:</strong> Low saturated fat upregulates hepatic LDL receptors; beta-glucan from oats binds bile acids to excrete cholesterol.
          </div>
        </div>

        {/* Pillar 3: Glycemic & Weight Deficit */}
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-5 relative flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Glycemic & Energy Deficit</h3>
                  <span className="text-[10px] text-amber-400 font-semibold">HbA1c 40 mmol/mol (5.8%)</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                Metabolic Goal
              </span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Caloric Deficit Ceiling:</span>
                <span className="font-bold text-amber-300">1,651 kcal / day</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Added Sugar Limit:</span>
                <span className="font-bold text-amber-300">&lt; 20 g / day</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Total Sugars:</span>
                <span className="font-bold text-slate-200">&lt; 25 g / day</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-300 leading-relaxed">
            <strong>Clinical Focus:</strong> Eliminating sugar spikes prevents hepatic de novo lipogenesis and improves insulin receptor sensitivity.
          </div>
        </div>

      </div>

      {/* Laboratory Biomarkers Interactive Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white font-heading">
              Recorded Laboratory Biomarkers
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Clinical blood serum metrics synced with patient health chart
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveBiomarkerTab('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                activeBiomarkerTab === 'all'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All (6)
            </button>
            <button
              onClick={() => setActiveBiomarkerTab('renal')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                activeBiomarkerTab === 'renal'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Renal
            </button>
            <button
              onClick={() => setActiveBiomarkerTab('cardiac')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                activeBiomarkerTab === 'cardiac'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Lipid / Cardio
            </button>
            <button
              onClick={() => setActiveBiomarkerTab('glycemic')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                activeBiomarkerTab === 'glycemic'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Glycemic
            </button>
          </div>
        </div>

        {/* Biomarkers Table / Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {filteredBiomarkers.map((bm) => {
            const isCritical = bm.statusType === 'critical';
            const isWarning = bm.statusType === 'warning';

            return (
              <div 
                key={bm.id}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                  isCritical
                    ? 'bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/20'
                    : isWarning
                    ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-950/20'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        {bm.category.toUpperCase()}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{bm.name}</h4>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{bm.lastTestDate}</span>
                  </div>

                  {/* Value and Target */}
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className={`text-2xl font-black font-heading ${
                      isCritical ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {bm.value}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">{bm.unit}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                    <span className="text-slate-400">Target Range:</span>
                    <span className="font-bold text-emerald-400">{bm.target}</span>
                  </div>

                  <div className="mt-1.5 text-[11px] font-medium text-slate-300">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      isCritical 
                        ? 'bg-rose-500/20 text-rose-300' 
                        : isWarning 
                        ? 'bg-amber-500/20 text-amber-300' 
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {bm.status}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 leading-snug">
                  {bm.clinicalNote}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Evidence-Based Dietary Protocols */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Evidence-Based Nutrition Strategy</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Dietary tactics formulated to support your clinical targets
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>1. Quaker Oats Beta-Glucan Anchor (150–200g)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Consuming whole oat beta-glucan soluble fiber binds to intestinal bile salts, forcing the liver to clear LDL cholesterol particles directly from circulation. Delivers high satiety with zero sodium and zero saturated fat.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>2. Ultra-Low Sodium Broth & Sauce Management</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Eliminate heavy restaurant warishita, ramen, and instant noodle broths which frequently deliver &gt;3,000mg sodium in a single sitting. Substitute with fresh ginger, garlic, herbs, and lemon juice.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>3. Replacement of Saturated Animal Fats with Omega-3s</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Replace deep-fried fast food chicken burgers, sukiyaki fatty beef cuts, and dairy ice cream sundaes with steamed salmon, mackerel (tongkol), tofu, and chia seeds to promote arterial endothelial health.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>4. Strategic Daytime Hydration (Flushing Protocol)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Consume 500mL of plain water immediately upon waking and continue consistent hydration throughout the morning. This supports renal tubular clearance of urea, creatinine, and sodium without evening nocturia.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};
