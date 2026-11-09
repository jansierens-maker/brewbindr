import React, { useEffect, useRef } from 'react';
import { LibraryIngredient } from '../types';
import { useTranslation } from '../App';

interface Props {
  recipeName: string;
  installations: LibraryIngredient[];
  /** The recipe's installation: marked and focused */
  recipeEquipmentId?: string;
  onPick: (equipmentId: string) => void;
  onCancel: () => void;
}

/** "Which installation do you brew this on?" — shown when a brew starts and nothing decides it. */
const EquipmentPickerDialog: React.FC<Props> = ({ recipeName, installations, recipeEquipmentId, onPick, onCancel }) => {
  const { t } = useTranslation();
  const firstRef = useRef<HTMLButtonElement>(null);
  const suggestedId =
    installations.find(e => e.id === recipeEquipmentId)?.id ?? installations.find(e => e.is_default)?.id ?? installations[0]?.id;

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-picker-title"
        className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 id="equipment-picker-title" className="text-2xl font-black text-stone-900">{t('choose_equipment_title')}</h3>
          <p className="text-sm text-stone-500 mt-1">{t('choose_equipment_hint').replace('{recipe}', recipeName)}</p>
        </div>
        <div className="space-y-2">
          {installations.map(e => (
            <button
              key={e.id}
              ref={e.id === suggestedId ? firstRef : undefined}
              type="button"
              onClick={() => onPick(e.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-3 hover:border-amber-500 hover:bg-amber-50 ${e.id === suggestedId ? 'border-amber-500 bg-amber-50' : 'border-stone-200'}`}
            >
              <span className="font-bold text-stone-900 flex flex-wrap items-center gap-2">
                {e.name}
                {e.id === recipeEquipmentId && <span className="text-[10px] font-black uppercase tracking-widest text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">{t('equipment_tag_recipe')}</span>}
                {e.is_default && <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">{t('default_equipment_badge')}</span>}
              </span>
              <span className="text-xs font-bold text-stone-500 whitespace-nowrap">{e.batch_size ? `${e.batch_size} L` : ''}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onCancel} className="w-full py-3 rounded-xl bg-stone-100 text-stone-700 text-xs font-black uppercase tracking-wider hover:bg-stone-200">
          {t('cancel_btn')}
        </button>
      </div>
    </div>
  );
};

export default EquipmentPickerDialog;
