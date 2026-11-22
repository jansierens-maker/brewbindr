import React, { useMemo, useState } from 'react';
import { useTranslation } from '../App';
import type { LibraryIngredient, Recipe } from '../types';
import { formatStockAmount } from '../services/calculations';
import { shoppingList, shoppingText, ShoppingLine } from '../services/stockPlanning';
import { ARCHIVED, stageOf } from '../services/lifecycle';

interface Props {
  /** The brewery's own ingredients with their stock */
  ingredients: LibraryIngredient[];
  recipes: Recipe[];
  readOnly?: boolean;
  onClose: () => void;
  /** Notes the bought lines as ordered */
  onMarkOrdered: (items: LibraryIngredient[]) => void;
}

const STAGE_ORDER = ['production', 'pilot', 'lab', 'idea', 'paused'];

/**
 * What to buy: everything below its desired stock, plus what the recipes you plan to brew
 * still need (stock and open orders counted). To copy, download or note as ordered.
 */
const ShoppingListDialog: React.FC<Props> = ({ ingredients, recipes, readOnly, onClose, onMarkOrdered }) => {
  const { t, lang } = useTranslation();
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const candidates = useMemo(() => recipes
    .filter(r => r.status !== 'approved' && !ARCHIVED.includes(stageOf(r)))
    .sort((a, b) => STAGE_ORDER.indexOf(stageOf(a)) - STAGE_ORDER.indexOf(stageOf(b)) || a.name.localeCompare(b.name)), [recipes]);
  const lines = useMemo(
    () => shoppingList(ingredients, candidates.filter(r => r.id && chosen.includes(r.id)), lang, t('shopping_norm')),
    [ingredients, candidates, chosen, lang, t]);

  const typeLabel = (type: string) => t(({ fermentable: 'malt', hop: 'hops', culture: 'yeast_lib', misc: 'miscs_label' } as Record<string, string>)[type] as any);
  const fmt = (v: number, unit = '') => formatStockAmount(v, unit, lang);
  const text = () => `${t('shopping_list')} – ${new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : `${lang}-BE`)}\n\n${shoppingText(lines, typeLabel, v => fmt(v))}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); setMessage(t('shopping_copied')); } catch { setMessage(t('shopping_copy_failed')); }
  };
  const download = () => {
    const blob = new Blob([text()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `boodschappenlijst-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const markOrdered = () => {
    const today = new Date().toISOString().slice(0, 10);
    const updated = lines
      .filter((l): l is ShoppingLine & { id: string } => !!l.id)
      .map(l => {
        const item = ingredients.find(i => i.id === l.id)!;
        const s = item.stock ?? { amount: 0, unit: l.unit };
        return { ...item, stock: { ...s, unit: s.unit || l.unit, ordered: Math.round(((s.ordered ?? 0) + l.amount) * 1000) / 1000, ordered_at: today } };
      });
    onMarkOrdered(updated);
    setMessage(t('shopping_marked').replace('{n}', String(updated.length)));
  };
  const fromLibrary = lines.filter(l => l.id).length;

  return (
    <div className="fixed inset-0 z-[300] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="shopping_title" className="bg-[var(--color-bg)] rounded-[var(--radius)] p-6 w-full max-w-3xl max-h-[90vh] overflow-auto shadow-[var(--shadow)] space-y-5">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 id="shopping_title" className="text-xl font-black text-[var(--color-text)]"><i className="fas fa-cart-shopping mr-2" aria-hidden="true"></i>{t('shopping_list')}</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">{t('shopping_desc')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('close_btn')} title={t('close_btn')} className="text-[var(--color-text-xmuted)] hover:text-[var(--color-text)]">
            <i className="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5">
          <fieldset className="space-y-2 min-w-0">
            <legend className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-2">{t('shopping_recipes')}</legend>
            {candidates.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">{t('shopping_no_recipes')}</p>}
            <div className="max-h-72 overflow-auto space-y-1 pr-1">
              {candidates.map(r => (
                <label key={r.id} htmlFor={`shop_r_${r.id}`} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-[var(--color-bg-subtle)]">
                  <input id={`shop_r_${r.id}`} name={`shop_r_${r.id}`} type="checkbox" checked={!!r.id && chosen.includes(r.id)}
                    onChange={e => setChosen(c => (e.target.checked ? [...c, r.id!] : c.filter(x => x !== r.id)))} />
                  <span className="flex-1 min-w-0 truncate font-semibold text-[var(--color-text)]">{r.name}</span>
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">{t(`lc_stage_${stageOf(r)}` as any)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3">
            {lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-[var(--radius-sm)]">{t('shopping_empty')}</p>
            ) : (
              ['fermentable', 'hop', 'culture', 'misc'].map(type => {
                const of = lines.filter(l => l.type === type);
                if (!of.length) return null;
                return (
                  <div key={type}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1">{typeLabel(type)}</p>
                    <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-[var(--radius-sm)]">
                      {of.map(l => (
                        <li key={`${l.id ?? l.name}-${l.unit}`} className="px-3 py-2 flex items-baseline justify-between gap-3">
                          <span className="min-w-0">
                            <span className="font-bold text-sm text-[var(--color-text)]">{l.name}</span>
                            {!l.id && <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-amber-700">{t('shopping_not_in_library')}</span>}
                            <span className="block text-[10px] text-[var(--color-text-muted)] truncate">{l.reasons.join(' · ')}</span>
                          </span>
                          <span className="font-black text-sm text-[var(--color-text)] whitespace-nowrap">{fmt(l.amount, l.unit)} {l.unit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {message && <p role="status" className="text-sm font-bold text-green-700">{message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={copy} disabled={!lines.length} className="px-4 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-xs font-black uppercase tracking-widest text-[var(--color-text)] disabled:opacity-40">
            <i className="fas fa-copy mr-1.5" aria-hidden="true"></i>{t('shopping_copy')}
          </button>
          <button type="button" onClick={download} disabled={!lines.length} className="px-4 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-xs font-black uppercase tracking-widest text-[var(--color-text)] disabled:opacity-40">
            <i className="fas fa-download mr-1.5" aria-hidden="true"></i>{t('shopping_download')}
          </button>
          {!readOnly && (
            <button type="button" onClick={markOrdered} disabled={!fromLibrary} title={t('shopping_mark_hint')}
              className="px-4 py-2 rounded-[var(--radius-sm)] bg-sky-700 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">
              <i className="fas fa-truck mr-1.5" aria-hidden="true"></i>{t('shopping_mark_ordered')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShoppingListDialog;
