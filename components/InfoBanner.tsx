import React from 'react';

export const InfoBanner: React.FC = () => {
  return (
    <div className="bg-amber-50 border-b border-amber-200/50 px-4 py-2 flex items-center justify-center gap-3 animate-in slide-in-from-top duration-500">
      <i className="fas fa-info-circle text-amber-500 text-xs"></i>
      <p className="text-[11px] md:text-xs font-bold text-amber-800 leading-tight text-center">
        Je bekijkt de publieke bibliotheek. Meld je aan om eigen recepten te bewaren, brouwsessies bij te houden en je voorraad te beheren.
      </p>
    </div>
  );
};
