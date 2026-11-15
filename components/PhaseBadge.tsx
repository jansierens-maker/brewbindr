import React from 'react';
import { useTranslation } from '../App';

/**
 * Development phase of the app or of a feature: alpha (experimental, may change a lot) comes
 * before beta (complete, may still change). The title explains it on hover; screen readers read it.
 */
export const PhaseBadge: React.FC<{ phase: 'alpha' | 'beta'; className?: string }> = ({ phase, className = '' }) => {
  const { t } = useTranslation();
  const label = t(phase === 'alpha' ? 'phase_alpha' : 'phase_beta');
  const title = t(phase === 'alpha' ? 'phase_alpha_title' : 'phase_beta_title');
  return (
    <span title={title}
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest leading-none align-middle ${phase === 'alpha' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'} ${className}`}>
      {label}<span className="sr-only">: {title}</span>
    </span>
  );
};

export default PhaseBadge;
