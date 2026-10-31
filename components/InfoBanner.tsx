import React from 'react';
import { useTranslation } from '../App';

export const InfoBanner: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="bg-amber-50 border-b border-amber-200/50 px-4 py-2 flex items-center justify-center gap-3 animate-in slide-in-from-top duration-500">
      <i className="fas fa-info-circle text-amber-500 text-xs" aria-hidden="true"></i>
      <p className="text-[11px] md:text-xs font-bold text-amber-800 leading-tight text-center">
        {t('guest_banner')}
      </p>
    </div>
  );
};
