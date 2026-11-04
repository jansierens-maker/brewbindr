import React, { useMemo, useState } from 'react';
import { LibraryIngredient } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { supabaseService } from '../services/supabaseService';
import { ionsOf, residualAlkalinity, sulfateChlorideRatio, WATER_PRESETS } from '../services/waterChemistry';
import { formatBrewNumber } from '../services/calculations';

interface Props {
  library: LibraryIngredient[];
  onUpdate: (newLibrary: LibraryIngredient[]) => void;
  canEdit: boolean;
}

const FIELDS = [
  { key: 'calcium', label: 'Ca' },
  { key: 'magnesium', label: 'Mg' },
  { key: 'sodium', label: 'Na' },
  { key: 'chloride', label: 'Cl' },
  { key: 'sulfate', label: 'SO₄' },
  { key: 'bicarbonate', label: 'HCO₃' },
] as const;

/** Water profiles of the brewery (e.g. the tap water), with their minerals in mg/L. */
const WaterProfilesManager: React.FC<Props> = ({ library, onUpdate, canEdit }) => {
  const { t, lang } = useTranslation();
  const { user, profile } = useUser();
  const [form, setForm] = useState<Partial<LibraryIngredient> | null>(null);
  const waters = useMemo(
    () => library.filter(i => i.type === 'water' && (i.brewery_id === profile?.brewery_id || i.user_id === user?.id)),
    [library, profile?.brewery_id, user?.id],
  );

  const startNew = () => setForm({
    id: crypto.randomUUID(), type: 'water', name: t('water_profile_new'),
    user_id: user?.id, brewery_id: profile?.brewery_id,
  });

  const save = async () => {
    if (!form?.name?.trim()) return;
    const item = { ...form, name: form.name.trim(), type: 'water' } as LibraryIngredient;
    onUpdate(waters.some(w => w.id === item.id) ? library.map(i => i.id === item.id ? item : i) : [...library, item]);
    if (user?.id) {
      const result = await supabaseService.saveLibraryIngredient(item, user.id, profile?.brewery_id);
      if (result?.error) alert(`${t('save_failed')}: ${result.error.message}`);
    }
    setForm(null);
  };

  const remove = async (item: LibraryIngredient) => {
    if (!confirm(t('confirm_delete'))) return;
    onUpdate(library.filter(i => i.id !== item.id));
    await supabaseService.deleteLibraryIngredient(item.id, 'water');
  };

  const summary = (w: Partial<LibraryIngredient>) => {
    const ions = ionsOf(w);
    const ratio = sulfateChlorideRatio(ions);
    return `RA ${formatBrewNumber(Math.round(residualAlkalinity(ions)), 'default', lang)} · SO₄/Cl ${ratio === undefined ? '-' : ratio === Infinity ? '∞' : formatBrewNumber(ratio, 'default', lang)}`;
  };

  if (form) {
    return (
      <div className="bg-[var(--color-bg)] p-6 md:p-8 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] space-y-6">
        <div>
          <label htmlFor="water_name" className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('name_label')}</label>
          <input id="water_name" name="water_name" maxLength={100} className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] font-bold"
            value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label htmlFor={`water_${f.key}`} className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{f.label} (mg/L)</label>
              <input id={`water_${f.key}`} name={f.key} type="number" inputMode="decimal" min={0} max={2000} step={0.1}
                className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] font-bold"
                value={form[f.key] ?? ''} onChange={e => setForm({ ...form, [f.key]: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{summary(form)}</p>
        <p className="text-[10px] text-[var(--color-text-xmuted)]">{t('water_profile_hint')}</p>
        <div>
          <label htmlFor="water_notes" className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{t('notes')}</label>
          <textarea id="water_notes" name="water_notes" maxLength={1000} className="w-full mt-1 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm"
            value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex gap-3">
          <button onClick={save} disabled={!canEdit} className="flex-[2] py-4 bg-[var(--color-accent)] text-white rounded-[var(--radius-sm)] font-black text-sm uppercase tracking-widest disabled:opacity-50">{t('save_btn')}</button>
          <button onClick={() => setForm(null)} className="flex-1 py-4 bg-[var(--color-bg-subtle)] text-[var(--color-text-xmuted)] rounded-[var(--radius-sm)] font-black text-xs uppercase tracking-widest">{t('cancel_btn')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-2xl font-black text-[var(--color-text)] font-[var(--font-display)]">{t('tab_water_profiles')}</h3>
        {canEdit && (
          <button onClick={startNew} className="bg-[var(--color-text)] text-white px-6 py-2.5 rounded-[var(--radius-sm)] font-bold text-xs shadow-lg hover:opacity-90 transition-all flex items-center gap-2">
            <i className="fas fa-plus" aria-hidden="true"></i> {t('add_water_profile')}
          </button>
        )}
      </div>
      {waters.length === 0 && <p className="px-2 text-sm text-[var(--color-text-muted)]">{t('water_profiles_empty')}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {waters.map(w => (
          <div key={w.id} className="bg-[var(--color-bg)] p-5 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
            <div className="flex justify-between items-start gap-3">
              <h4 className="font-black text-[var(--color-text)]">{w.name}</h4>
              {canEdit && (
                <div className="flex gap-3">
                  <button onClick={() => setForm(w)} aria-label={`${t('edit_btn')} ${w.name}`} title={t('edit_btn')} className="text-[var(--color-text-xmuted)] hover:text-[var(--color-accent)]"><i className="fas fa-edit text-xs" aria-hidden="true"></i></button>
                  <button onClick={() => remove(w)} aria-label={`${t('delete_btn')} ${w.name}`} title={t('delete_btn')} className="text-[var(--color-text-xmuted)] hover:text-red-500"><i className="fas fa-trash-alt text-xs" aria-hidden="true"></i></button>
                </div>
              )}
            </div>
            <p className="text-xs font-bold text-[var(--color-text-muted)] mt-2">
              {FIELDS.map(f => `${f.label} ${formatBrewNumber(w[f.key] || 0, 'default', lang)}`).join(' · ')}
            </p>
            <p className="text-[10px] text-[var(--color-text-xmuted)] mt-1">{summary(w)}</p>
          </div>
        ))}
      </div>
      <p className="px-2 text-[10px] text-[var(--color-text-xmuted)]">
        {t('water_presets_note').replace('{names}', WATER_PRESETS.filter(p => p.kind === 'source').map(p => p.name).join(', '))}
      </p>
    </div>
  );
};

export default WaterProfilesManager;
