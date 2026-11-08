import React from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { formatBrewNumber } from '../services/calculations';
import { FitProblem, ScaleSuggestion } from '../services/scaling';

const PROBLEM_KEYS = {
  boil: 'scale_problem_boil',
  grain: 'scale_problem_grain',
  batch: 'scale_problem_batch',
} as const satisfies Record<FitProblem, string>;

interface Props {
  suggestion: ScaleSuggestion;
  equipmentName: string;
  /** Installation batch size in litres, for the "batch" reason */
  equipmentBatchL?: number;
  /** Without it the suggestion is shown without a button (e.g. no rights to change) */
  onApply?: () => void;
}

/** "This batch is too big for the Brewie … Scale to 19 L?" (or larger, when it fits). */
const ScaleSuggestionBanner: React.FC<Props> = ({ suggestion, equipmentName, equipmentBatchL, onApply }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const imperial = preferences.units === 'imperial';
  const vol = (l: number) => `${formatBrewNumber(l, 'vol', lang, preferences)} ${imperial ? 'gal' : 'L'}`;
  const pct = Math.round(Math.abs(suggestion.factor - 1) * 100);
  const down = suggestion.direction === 'down';
  const reasons = suggestion.problems
    .map(p => t(PROBLEM_KEYS[p]).replace('{max}', equipmentBatchL ? vol(equipmentBatchL) : '-'))
    .join('; ');

  const text = (down ? t('scale_too_big') : t('scale_can_grow'))
    .replace('{name}', equipmentName)
    .replace('{from}', vol(suggestion.fromL))
    .replace('{to}', vol(suggestion.toL))
    .replace('{pct}', String(pct))
    .replace('{reasons}', reasons);

  return (
    <div role="status" className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 ${down ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-sky-50 border-sky-200 text-sky-900'}`}>
      <i className={`fas ${down ? 'fa-compress-alt' : 'fa-expand-alt'} text-lg`} aria-hidden="true"></i>
      <p className="flex-1 text-sm font-semibold">{text}</p>
      {onApply && (
        <button type="button" onClick={onApply} className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-black uppercase tracking-wider whitespace-nowrap hover:bg-black">
          {t('scale_apply').replace('{to}', vol(suggestion.toL))}
        </button>
      )}
    </div>
  );
};

export default ScaleSuggestionBanner;
