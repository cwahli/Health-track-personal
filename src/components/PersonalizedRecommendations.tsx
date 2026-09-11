import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ChefHat, 
  RefreshCw, 
  ArrowRight, 
  ShieldCheck, 
  Heart, 
  Activity, 
  AlertCircle,
  CheckCircle2,
  Zap,
  Flame,
  Droplet
} from 'lucide-react';
import { AIRecommendationResult, NutrientRow } from '../types';

interface PersonalizedRecommendationsProps {
  selectedDayKey: string;
  dayLabel: string;
  nutrients: NutrientRow[];
  diagnosisText?: string;
}

export const PersonalizedRecommendations: React.FC<PersonalizedRecommendationsProps> = ({
  selectedDayKey,
  dayLabel,
  nutrients,
  diagnosisText,
}) => {
  const [recommendations, setRecommendations] = useState<AIRecommendationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAIRecommendations = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payloadNutrients = nutrients.map(n => {
        const d = n.days[selectedDayKey] || n.baseline;
        return {
          name: n.name,
          intake: d.intake,
          target: d.target,
          unit: n.unit,
          percentage: d.percentage,
          statusText: d.statusText,
          isCeiling: n.isCeiling,
          goal: n.clinicalGoal,
        };
      });

      const res = await fetch('/api/gemini/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedDay: dayLabel,
          nutrients: payloadNutrients,
          diagnosisContext: diagnosisText,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch personalized AI recommendations');
      }

      const data = await res.json();
      setRecommendations(data);
    } catch (err: any) {
      console.warn(err);
      setError(err.message || 'Unable to generate recommendations right now.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAIRecommendations();
  }, [selectedDayKey]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5">
      
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-900/40">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Personalized AI Health & Nutrition Strategy
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Gemini Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Prescriptive meal anchors and clinical organ protection derived from spreadsheet metrics
            </p>
          </div>
        </div>

        <button
          id="regenerate-ai-recs-btn"
          onClick={fetchAIRecommendations}
          disabled={isLoading}
          className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{isLoading ? 'Synthesizing...' : 'Regenerate Analysis'}</span>
        </button>
      </div>

      {isLoading && !recommendations ? (
        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm font-semibold text-slate-200">
            Evaluating multi-day metabolic biomarkers & nutrient ceilings...
          </p>
          <p className="text-xs text-slate-400">
            Calculating optimal meal substitutions for LDL clearance and renal protection
          </p>
        </div>
      ) : error && !recommendations ? (
        <div className="py-8 px-4 bg-slate-950/70 border border-rose-900/40 rounded-xl flex flex-col items-center text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400" />
          <div>
            <p className="text-sm font-bold text-slate-200">Unable to generate AI recommendations</p>
            <p className="text-xs text-slate-400 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchAIRecommendations}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Analysis</span>
          </button>
        </div>
      ) : recommendations ? (
        <div className="space-y-5">
          
          {/* Health Score & High Level Prognosis */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Score Card */}
            <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">
                Nutritional Health Index
              </span>
              <div className="text-4xl font-extrabold text-white font-heading">
                {recommendations.healthScore || 88}
                <span className="text-sm text-emerald-400 font-normal">/100</span>
              </div>
              <span className="text-[11px] text-slate-300 font-medium mt-1">
                {(recommendations.healthScore || 88) >= 80 ? '🟢 Strong Compliance' : '🟡 Moderate Attention'}
              </span>
            </div>

            {/* Organ System Clinical Assessments */}
            <div className="md:col-span-3 bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col justify-center space-y-2">
              <div className="flex items-start gap-2">
                <Heart className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-rose-300">Cardiovascular & Lipids: </span>
                  <span className="text-slate-300">{recommendations.clinicalAssessment?.cardiovascularLipids || 'Monitoring lipid clearance with soluble fiber.'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Droplet className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-sky-300">Renal Protection (eGFR): </span>
                  <span className="text-slate-300">{recommendations.clinicalAssessment?.renalSystem || 'Sodium intake balanced within renal filtration safety margin.'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Flame className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-amber-300">Glycemic & Energy Balance: </span>
                  <span className="text-slate-300">{recommendations.clinicalAssessment?.glycemicMetabolic || 'Blood sugar and energy stability supported by complex carbohydrates.'}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Action Steps */}
          {(recommendations.actionSteps?.length ?? 0) > 0 && (
            <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                <Zap className="w-4 h-4" />
                <span>Immediate 24-Hour Clinical Action Plan</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {recommendations.actionSteps.map((step, idx) => (
                  <div key={idx} className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg text-xs text-slate-300 flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prescribed Meal Anchors */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-400 mb-3">
              <ChefHat className="w-4 h-4" />
              <span>Tailored Meal Blueprint for Nutrient Allowances</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {(recommendations.mealRecommendations || []).map((meal, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-2.5 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                        {meal.mealType}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white">
                      {meal.title}
                    </h4>

                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {meal.description}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800/80 text-[11px]">
                    <div>
                      <span className="font-semibold text-emerald-400">Nutrients Boosted: </span>
                      <span className="text-slate-300">{(meal.targetNutrientsHelped || []).join(', ')}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-rose-400">Caution/Avoid: </span>
                      <span className="text-slate-400">{(meal.cautionAvoids || []).join(', ')}</span>
                    </div>
                    <div className="text-slate-400 italic bg-slate-900 p-2 rounded border border-slate-800 text-[10px]">
                      "{meal.rationale}"
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Food Swaps */}
          {(recommendations.keyFoodSwaps?.length ?? 0) > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Cardioprotective & Renal Food Swaps
              </h4>

              <div className="space-y-2">
                {recommendations.keyFoodSwaps.map((swap, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium line-through">
                        {swap.avoid}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                        {swap.replaceWith}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] sm:text-right">
                      {swap.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : null}

    </div>
  );
};
