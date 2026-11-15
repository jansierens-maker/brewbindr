import React from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { formatBrewNumber, formatGravity } from '../services/calculations';

interface Props {
  /** Efficiency (%) the recipe was designed for, and the installation's */
  design: number;
  actual: number;
  installation: string;
  /** OG and ABV as designed, and as the installation will get them with this malt */
  designStats: { og: number; abv: number };
  actualStats: { og: number; abv: number };
  /** Without it the warning has no button (no rights to change) */
  onApply?: () => void;
}

/** The OG the installation will get differs from the designed one: adapt the malt? */
const EfficiencyBanner: React.FC<Props> = ({ design, actual, installation, designStats, actualStats, onApply }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const unit = preferences.gravityUnit === 'plato' ? 'plato' : 'sg';
  const text = t('eff_mismatch')
    .replace('{design}', String(Math.round(design * 10) / 10))
    .replace('{name}', installation)
    .replace('{actual}', String(Math.round(actual * 10) / 10))
    .replace('{og}', formatGravity(actualStats.og, lang, unit))
    .replace('{abv}', formatBrewNumber(actualStats.abv, 'abv', lang))
    .replace('{designOg}', formatGravity(designStats.og, lang, unit))
    .replace('{designAbv}', formatBrewNumber(designStats.abv, 'abv', lang));
  return (
    <div role="status" className="p-4 rounded-xl border bg-amber-50 border-amber-200 flex flex-col sm:flex-row sm:items-center gap-3">
      <i className="fas fa-gauge-high text-lg text-amber-600" aria-hidden="true"></i>
      <p className="flex-1 text-sm font-semibold text-amber-900">{text}</p>
      {onApply && (
        <button type="button" onClick={onApply} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-black uppercase tracking-wider hover:bg-amber-700 whitespace-nowrap">
          {t('eff_adapt').replace('{name}', installation)}
        </button>
      )}
    </div>
  );
};

export default EfficiencyBanner;
