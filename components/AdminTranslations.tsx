import React, { useMemo, useState } from 'react';
import { useTranslation } from '../App';
import type { LibraryIngredient } from '../types';
import type { Language } from '../services/i18n';
import { ITEM_LANGS, textFieldsFor } from '../services/itemI18n';
import { BATCH_SIZE, TRANSLATABLE_TYPES, applyProposal, coverage, needsTranslation, requestProposals } from '../services/translationAdmin';
import TranslationsEditor from './TranslationsEditor';

interface Props {
  library: LibraryIngredient[];
  /** Saves the reviewed items; resolves with the ids that were saved */
  onSave: (items: LibraryIngredient[]) => Promise<string[]>;
}

interface Row {
  item: LibraryIngredient;
  doubt?: string;
  selected: boolean;
}

/**
 * Translating the public library (#212): what is missing per type and language, Gemini
 * proposals in batches of 50, and a review table where every proposal can be changed
 * before saving the selected rows or all of them.
 */
const AdminTranslations: React.FC<Props> = ({ library, onSave }) => {
  const { t } = useTranslation();
  const publicItems = useMemo(() => library.filter(i => i.status === 'approved' && TRANSLATABLE_TYPES.includes(i.type)), [library]);
  const [type, setType] = useState('');
  const [lang, setLang] = useState<Language | 'any'>('any');
  const [what, setWhat] = useState<'name' | 'text' | 'any'>('any');
  const [limit, setLimit] = useState(BATCH_SIZE);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const typeLabel = (ty: string) => ({
    fermentable: t('malt'), hop: t('hops'), culture: t('yeast_lib'), misc: t('miscs_label'), style: t('style_label'),
    water: t('tab_water_profiles'), mash_profile: t('mash_profile'), equipment: t('lib_tab_equipment'),
  } as Record<string, string>)[ty] ?? ty;

  const cov = useMemo(() => coverage(publicItems), [publicItems]);
  const inReview = new Set(rows.map(r => r.item.id));
  const candidates = useMemo(
    () => publicItems.filter(i => (!type || i.type === type) && needsTranslation(i, lang, what)).sort((a, b) => a.name.localeCompare(b.name)),
    [publicItems, type, lang, what],
  );
  const todo = candidates.filter(i => !inReview.has(i.id)).slice(0, Math.max(1, limit));

  const ask = async () => {
    setError(''); setMessage('');
    setBusy({ done: 0, total: todo.length });
    const { proposals, error: err } = await requestProposals(todo, (done, total) => setBusy({ done, total }));
    const byId = new Map(proposals.map(p => [p.id, p]));
    const added: Row[] = todo.filter(i => byId.has(i.id)).map(i => ({ item: applyProposal(i, byId.get(i.id)!), doubt: byId.get(i.id)!.doubt, selected: !byId.get(i.id)!.doubt }));
    setRows(r => [...r, ...added]);
    setBusy(null);
    if (err) setError(err);
  };

  const update = (id: string, patch: Partial<LibraryIngredient>) =>
    setRows(rs => rs.map(r => (r.item.id === id ? { ...r, item: { ...r.item, ...patch } } : r)));
  const setName = (id: string, l: Language, v: string) =>
    setRows(rs => rs.map(r => {
      if (r.item.id !== id) return r;
      const names = { ...r.item.names, [l]: v };
      if (!v.trim()) delete names[l];
      return { ...r, item: { ...r.item, names } };
    }));

  const save = async (only: 'selected' | 'all') => {
    const chosen = rows.filter(r => only === 'all' || r.selected).map(r => r.item);
    if (!chosen.length) return;
    setSaving(true); setError(''); setMessage('');
    const saved = new Set(await onSave(chosen));
    setRows(rs => rs.filter(r => !saved.has(r.item.id)));
    setSaving(false);
    setMessage(t('tra_saved').replace('{n}', String(saved.size)));
    if (saved.size < chosen.length) setError(t('tra_save_failed').replace('{n}', String(chosen.length - saved.size)));
  };

  const cell = 'w-full min-w-[8rem] p-1.5 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded text-xs font-bold';
  const selectedCount = rows.filter(r => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  return (
    <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
      <div className="flex items-center gap-3">
        <div className="bg-sky-100 p-3 rounded-2xl text-sky-600"><i className="fas fa-language text-2xl" aria-hidden="true"></i></div>
        <div>
          <h3 className="text-2xl font-black text-stone-900">{t('tra_title')}</h3>
          <p className="text-sm text-stone-500">{t('tra_desc')}</p>
        </div>
      </div>

      {/* What is still missing */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">{t('tra_coverage')}</caption>
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-widest text-stone-400 text-left">
              <th scope="col" className="py-1 pr-3">{t('tra_type')}</th>
              <th scope="col" className="py-1 pr-3 text-right">{t('tra_items')}</th>
              {ITEM_LANGS.map(l => <th key={`n${l}`} scope="col" className="py-1 px-2 text-right">{t('tra_names')} {l.toUpperCase()}</th>)}
              {ITEM_LANGS.map(l => <th key={`t${l}`} scope="col" className="py-1 px-2 text-right">{t('tr_texts')} {l.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {cov.map(c => (
              <tr key={c.type} className="border-t border-stone-100">
                <th scope="row" className="py-1.5 pr-3 text-left font-bold">{typeLabel(c.type)}</th>
                <td className="py-1.5 pr-3 text-right tabular-nums">{c.total}</td>
                {ITEM_LANGS.map(l => <td key={`n${l}`} className={`py-1.5 px-2 text-right tabular-nums ${c.namesMissing[l] ? 'text-amber-700 font-bold' : 'text-green-700'}`}>{c.namesMissing[l] || '✓'}</td>)}
                {ITEM_LANGS.map(l => <td key={`t${l}`} className={`py-1.5 px-2 text-right tabular-nums ${c.textsMissing[l] ? 'text-amber-700 font-bold' : 'text-green-700'}`}>{c.textsMissing[l] || '✓'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-stone-400 mt-2">{t('tra_coverage_hint')}</p>
      </div>

      {/* Ask for proposals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div>
          <label htmlFor="tra_type" className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">{t('tra_type')}</label>
          <select id="tra_type" name="tra_type" className={cell} value={type} onChange={e => setType(e.target.value)}>
            <option value="">{t('filters_any')}</option>
            {TRANSLATABLE_TYPES.map(ty => <option key={ty} value={ty}>{typeLabel(ty)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tra_lang" className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">{t('tra_missing_in')}</label>
          <select id="tra_lang" name="tra_lang" className={cell} value={lang} onChange={e => setLang(e.target.value as Language | 'any')}>
            <option value="any">{t('tra_any_lang')}</option>
            {ITEM_LANGS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tra_what" className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">{t('tra_what')}</label>
          <select id="tra_what" name="tra_what" className={cell} value={what} onChange={e => setWhat(e.target.value as 'name' | 'text' | 'any')}>
            <option value="any">{t('tra_what_any')}</option>
            <option value="name">{t('tra_names')}</option>
            <option value="text">{t('tr_texts')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="tra_limit" className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">{t('tra_limit')}</label>
          <input id="tra_limit" name="tra_limit" type="number" min={1} max={500} step={BATCH_SIZE} className={cell} maxLength={3}
            value={limit} onChange={e => setLimit(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || BATCH_SIZE)))} />
        </div>
        <button type="button" onClick={ask} disabled={!!busy || todo.length === 0}
          className="px-4 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">
          <i className="fas fa-wand-magic-sparkles mr-1.5" aria-hidden="true"></i>
          {busy ? t('tra_busy').replace('{done}', String(busy.done)).replace('{total}', String(busy.total)) : t('tra_ask').replace('{n}', String(todo.length))}
        </button>
      </div>
      <p className="text-[11px] text-stone-400 -mt-4">
        {t('tra_found').replace('{n}', String(candidates.length))} {t('tra_requests').replace('{n}', String(Math.ceil(todo.length / BATCH_SIZE)))}
      </p>
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm font-bold text-green-700">{message}</p>}

      {/* Review */}
      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-lg font-black text-stone-900">{t('tra_review').replace('{n}', String(rows.length))}</h4>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => save('selected')} disabled={saving || !selectedCount}
                className="px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">{t('tra_save_selected').replace('{n}', String(selectedCount))}</button>
              <button type="button" onClick={() => save('all')} disabled={saving}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">{t('tra_save_all')}</button>
              <button type="button" onClick={() => setRows([])} disabled={saving}
                className="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 text-xs font-black uppercase tracking-widest">{t('tra_discard')}</button>
            </div>
          </div>
          <div className="overflow-x-auto border border-stone-200 rounded-2xl">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr className="text-[10px] font-black uppercase tracking-widest text-stone-400 text-left">
                  <th scope="col" className="p-2">
                    <label htmlFor="tra_all" className="sr-only">{t('tra_select_all')}</label>
                    <input id="tra_all" name="tra_all" type="checkbox" checked={allSelected} onChange={e => setRows(rs => rs.map(r => ({ ...r, selected: e.target.checked })))} />
                  </th>
                  <th scope="col" className="p-2">{t('tra_original')}</th>
                  <th scope="col" className="p-2">{t('tr_name_kind')}</th>
                  {ITEM_LANGS.map(l => <th key={l} scope="col" className="p-2">{l.toUpperCase()}</th>)}
                  <th scope="col" className="p-2">{t('tr_aliases')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, doubt, selected }) => {
                  const product = item.name_kind === 'product';
                  const hasTexts = textFieldsFor(item.type).some(f => item[f] || ITEM_LANGS.some(l => item.i18n?.[l]?.[f]));
                  return (
                    <React.Fragment key={item.id}>
                      <tr className={`border-t border-stone-100 align-top ${doubt ? 'bg-amber-50/60' : ''}`}>
                        <td className="p-2">
                          <label htmlFor={`tra_sel_${item.id}`} className="sr-only">{t('tra_select').replace('{name}', item.name)}</label>
                          <input id={`tra_sel_${item.id}`} name={`tra_sel_${item.id}`} type="checkbox" checked={selected}
                            onChange={e => setRows(rs => rs.map(r => (r.item.id === item.id ? { ...r, selected: e.target.checked } : r)))} />
                        </td>
                        <td className="p-2 min-w-[10rem]">
                          <p className="font-bold text-stone-900">{item.name}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{typeLabel(item.type)}</p>
                          {doubt && <p className="text-[11px] text-amber-800 mt-1"><i className="fas fa-triangle-exclamation mr-1" aria-hidden="true"></i>{doubt}</p>}
                        </td>
                        <td className="p-2">
                          <label htmlFor={`tra_kind_${item.id}`} className="sr-only">{t('tr_name_kind')}</label>
                          <select id={`tra_kind_${item.id}`} name={`tra_kind_${item.id}`} className={cell} value={item.name_kind ?? 'generic'}
                            onChange={e => update(item.id, { name_kind: e.target.value as 'generic' | 'product' })}>
                            <option value="generic">{t('tra_generic_short')}</option>
                            <option value="product">{t('tr_product_short')}</option>
                          </select>
                        </td>
                        {ITEM_LANGS.map(l => (
                          <td key={l} className="p-2">
                            <label htmlFor={`tra_${l}_${item.id}`} className="sr-only">{t('tr_name_in')} ({l.toUpperCase()}): {item.name}</label>
                            <input id={`tra_${l}_${item.id}`} name={`tra_${l}_${item.id}`} lang={l} className={cell} maxLength={100} disabled={product}
                              placeholder={product ? item.name : ''} value={product ? '' : item.names?.[l] ?? ''} onChange={e => setName(item.id, l, e.target.value)} />
                          </td>
                        ))}
                        <td className="p-2">
                          <label htmlFor={`tra_alias_${item.id}`} className="sr-only">{t('tr_aliases')}: {item.name}</label>
                          <input id={`tra_alias_${item.id}`} name={`tra_alias_${item.id}`} className={cell} maxLength={300}
                            defaultValue={(item.aliases ?? []).join(', ')}
                            onBlur={e => { const a = [...new Set(e.target.value.split(',').map(x => x.trim()).filter(Boolean))]; update(item.id, { aliases: a.length ? a : undefined }); }} />
                        </td>
                      </tr>
                      {hasTexts && (
                        <tr className="align-top">
                          <td></td>
                          <td colSpan={6} className="p-2 pt-0">
                            <TranslationsEditor idPrefix={`tra-tx-${item.id}`} item={item} textsOnly onChange={patch => update(item.id, patch)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTranslations;
