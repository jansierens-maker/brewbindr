import React, { useMemo } from 'react';
import { Culture, Fermentable, Hop, LibraryIngredient, Misc, Recipe } from '../types';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { formatBrewNumber, isPrivateItem } from '../services/calculations';
import { IngredientKind, addIngredient, fromLibraryItem, newIngredient, removeIngredient, replaceIngredient } from '../services/ingredientEdit';

interface Props {
  ingredients: Recipe['ingredients'];
  library: LibraryIngredient[];
  /** Measured alpha acid per hop name (brew measurement) */
  measuredAlpha: Record<string, number> | undefined;
  /** Without it the list is read-only */
  onChange?: (ingredients: Recipe['ingredients']) => void;
  onAlphaChange?: (hopName: string, alpha: number) => void;
  /** Shown at the top of the hops (e.g. the bitterness check, #167) */
  hopNotice?: React.ReactNode;
}

const unitLabel = (unit: string | undefined) =>
  unit === 'kilograms' ? 'kg' : unit === 'pounds' ? 'lb' : unit === 'grams' ? 'g' : unit === 'ounces' ? 'oz' : unit === 'units' ? '×' : unit || '';

/** The ingredients actually used in a brew (#166): amounts, timing, other or extra ingredients. */
const BrewIngredients: React.FC<Props> = ({ ingredients, library, measuredAlpha, onChange, onAlphaChange, hopNotice }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const editable = !!onChange;
  const imperial = preferences.units === 'imperial';
  const own = useMemo(() => {
    const by = (type: string) => library.filter(l => l.type === type && isPrivateItem(l)).sort((a, b) => a.name.localeCompare(b.name));
    return { fermentable: by('fermentable'), hop: by('hop'), culture: by('culture'), misc: by('misc') };
  }, [library]);

  const input = 'p-2 bg-white border border-stone-200 rounded-lg text-right font-black text-stone-900 w-24';
  const num = (raw: string) => {
    const n = parseFloat(raw);
    return isNaN(n) || n < 0 ? 0 : n;
  };
  const set = (kind: IngredientKind, idx: number, next: Fermentable | Hop | Culture | Misc) =>
    onChange?.(replaceIngredient(ingredients, kind, idx, next));
  const pick = (kind: IngredientKind, idx: number, current: Fermentable | Hop | Culture | Misc, libId: string) => {
    const item = library.find(l => l.id === libId);
    if (!item) return;
    // overloads per kind
    const next = kind === 'fermentable' ? fromLibraryItem(kind, current as Fermentable, item)
      : kind === 'hop' ? fromLibraryItem(kind, current as Hop, item)
      : kind === 'culture' ? fromLibraryItem(kind, current as Culture, item)
      : fromLibraryItem('misc', current as Misc, item);
    set(kind, idx, next);
    if (kind === 'hop' && onAlphaChange && measuredAlpha?.[item.name] === undefined) onAlphaChange(item.name, item.alpha || 5);
  };

  const nameField = (kind: IngredientKind, idx: number, current: Fermentable | Hop | Culture | Misc) => {
    if (!editable) return <div className="font-bold text-stone-900">{current.name || '-'}</div>;
    const options = own[kind];
    const linked = current.libraryId && options.some(o => o.id === current.libraryId);
    return (
      <>
        <label htmlFor={`brew-${kind}-${idx}-name`} className="sr-only">{t('brew_ingredient_choose')}</label>
        <select
          id={`brew-${kind}-${idx}-name`}
          name={`brew_${kind}_${idx}_name`}
          className="w-full p-2 bg-white border border-stone-200 rounded-lg font-bold text-stone-900"
          value={linked ? current.libraryId : ''}
          onChange={e => pick(kind, idx, current, e.target.value)}
        >
          <option value="">{current.name || t('brew_ingredient_choose')}</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </>
    );
  };

  const amountField = (kind: IngredientKind, idx: number, current: { amount?: { unit: string; value: number } }, apply: (value: number) => void, step: string) => (
    <div className="flex items-center gap-2">
      {editable ? (
        <>
          <label htmlFor={`brew-${kind}-${idx}-amount`} className="sr-only">{t('amount_label')}</label>
          <input id={`brew-${kind}-${idx}-amount`} name={`brew_${kind}_${idx}_amount`} type="number" min="0" step={step} max={100000} className={input}
            value={current.amount?.value ?? 0} onChange={e => apply(num(e.target.value))} />
        </>
      ) : (
        <span className="text-sm font-black text-stone-900">{formatBrewNumber(current.amount?.value ?? 0, 'default', lang)}</span>
      )}
      <span className="text-xs font-black text-stone-400 uppercase w-6">{unitLabel(current.amount?.unit)}</span>
    </div>
  );

  const removeButton = (kind: IngredientKind, idx: number, name: string) => editable && (
    <button type="button" onClick={() => onChange?.(removeIngredient(ingredients, kind, idx))} aria-label={`${t('delete_btn')}: ${name || t('brew_ingredient_choose')}`} title={t('delete_btn')}
      className="text-stone-400 hover:text-red-500 px-2"><i className="fas fa-times" aria-hidden="true"></i></button>
  );

  const addButton = (kind: IngredientKind) => editable && (
    <button type="button" onClick={() => onChange?.(addIngredient(ingredients, kind, newIngredient(kind, imperial)))} className="text-xs font-black uppercase tracking-wider text-amber-700 hover:text-amber-900">
      <i className="fas fa-plus mr-1" aria-hidden="true"></i>{t('brew_ingredient_add')}
    </button>
  );

  const section = (title: string, kind: IngredientKind, rows: React.ReactNode[], notice?: React.ReactNode) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{title}</h4>
        {addButton(kind)}
      </div>
      {notice}
      {rows.length === 0 ? <p className="text-xs text-stone-400">-</p> : rows}
    </div>
  );

  const row = 'flex flex-col md:flex-row md:items-center gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-100';

  return (
    <div className="space-y-6">
      {section(t('grains'), 'fermentable', ingredients.fermentables.map((f, i) => (
        <div key={`f${i}`} className={row}>
          <div className="flex-1">{nameField('fermentable', i, f)}</div>
          {amountField('fermentable', i, f, v => set('fermentable', i, { ...f, amount: { ...f.amount, value: v } }), imperial ? '0.01' : '0.01')}
          {removeButton('fermentable', i, f.name)}
        </div>
      )))}

      {section(`${t('hops')} - ${t('actual_batch_values')}`, 'hop', ingredients.hops.map((h, i) => (
        <div key={`h${i}`} className={`${row} bg-white border-stone-200 shadow-sm`}>
          <div className="flex-1 space-y-1">
            <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${h.use === 'boil' ? 'bg-red-500' : h.use === 'dry_hop' ? 'bg-green-600' : 'bg-stone-500'}`}>{h.use}</span>
            {nameField('hop', i, h)}
          </div>
          <div className="flex items-center gap-2">
            {editable ? (
              <>
                <label htmlFor={`brew-hop-${i}-time`} className="sr-only">{t('time_short')}</label>
                <input id={`brew-hop-${i}-time`} name={`brew_hop_${i}_time`} type="number" min="0" step="1" max={100000} className={`${input} w-20`}
                  value={h.time?.value ?? 0} onChange={e => set('hop', i, { ...h, time: { ...(h.time ?? { unit: 'minutes' }), value: num(e.target.value) } })} />
              </>
            ) : <span className="text-sm font-black text-stone-900">{h.time?.value ?? 0}</span>}
            <span className="text-xs font-black text-stone-400 uppercase">{h.time?.unit === 'days' ? 'd' : 'min'}</span>
          </div>
          {amountField('hop', i, h, v => set('hop', i, { ...h, amount: { ...h.amount, value: v } }), imperial ? '0.05' : '1')}
          <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-100">
            <label htmlFor={`alpha-override-${i}`} className="text-[10px] font-black text-stone-400 uppercase pl-2">Alpha %</label>
            <input
              id={`alpha-override-${i}`}
              name={`alpha_${h.name}`}
              type="number"
              step="0.1"
              min="0"
              max="100"
              disabled={!onAlphaChange}
              className="w-20 p-2 bg-white border border-stone-200 rounded-lg text-right font-black text-stone-900"
              value={measuredAlpha?.[h.name] ?? (h.alpha_acid?.value || 5)}
              onChange={e => onAlphaChange?.(h.name, parseFloat(e.target.value) || 0)}
            />
          </div>
          {removeButton('hop', i, h.name)}
        </div>
      )), hopNotice)}

      {section(t('miscs_label'), 'misc', (ingredients.miscellaneous ?? []).map((m, i) => (
        <div key={`m${i}`} className={row}>
          <div className="flex-1">{nameField('misc', i, m)}</div>
          {amountField('misc', i, m, v => set('misc', i, { ...m, amount: { ...m.amount, value: v } }), '0.1')}
          {removeButton('misc', i, m.name)}
        </div>
      )))}

      {section(t('yeast_lib'), 'culture', ingredients.cultures.map((c, i) => (
        <div key={`c${i}`} className={row}>
          <div className="flex-1 flex items-center gap-2">
            <i className="fas fa-flask text-purple-600 text-xs" aria-hidden="true"></i>
            <div className="flex-1">{nameField('culture', i, c)}</div>
          </div>
          <div className="text-sm font-black text-stone-400 uppercase">{c.attenuation}% {c.form}</div>
          {c.amount && amountField('culture', i, c, v => set('culture', i, { ...c, amount: { ...c.amount!, value: v } }), '0.5')}
          {removeButton('culture', i, c.name)}
        </div>
      )))}
    </div>
  );
};

export default BrewIngredients;
