import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../App';
import { BrewLogEntry, LibraryIngredient, Recipe } from '../types';
import { matchesQuery, recipeSearchText, brewSearchText, ingredientSearchText } from '../services/search';
import { batchNumbers, formatDate } from '../services/tasting';

interface Props {
  open: boolean;
  onClose: () => void;
  recipes: Recipe[];
  logs: BrewLogEntry[];
  library: LibraryIngredient[];
  /** Whether a recipe or item is the brewery's own (otherwise it is from the public library) */
  isOwn: (item: { status?: string; user_id?: string; brewery_id?: string }) => boolean;
  onOpenRecipe: (r: Recipe) => void;
  onOpenBrew: (log: BrewLogEntry) => void;
  onOpenIngredient: (item: LibraryIngredient) => void;
}

type Hit =
  | { kind: 'recipe'; key: string; label: string; sub: string; recipe: Recipe }
  | { kind: 'brew'; key: string; label: string; sub: string; log: BrewLogEntry }
  | { kind: 'ingredient'; key: string; label: string; sub: string; item: LibraryIngredient };

const SEARCHED_TYPES = ['fermentable', 'hop', 'culture', 'misc', 'style'];
const PER_GROUP = 6;

/** Search everything at once (Ctrl+K): recipes, brews and library items, grouped. */
const GlobalSearch: React.FC<Props> = ({ open, onClose, recipes, logs, library, isOwn, onOpenRecipe, onOpenBrew, onOpenIngredient }) => {
  const { t, lang } = useTranslation();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => input.current?.focus(), 0); }
  }, [open]);

  const typeLabel: Record<string, string> = {
    fermentable: t('malt'), hop: t('hops'), culture: t('yeast_lib'), misc: t('miscs_label'), style: t('style_label'),
  };

  const groups = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as { title: string; hits: Hit[] }[];
    const numbers = batchNumbers(logs);
    const recipeHits: Hit[] = recipes
      .filter(r => matchesQuery(recipeSearchText(r), q))
      .sort((a, b) => Number(isOwn(b)) - Number(isOwn(a)) || a.name.localeCompare(b.name))
      .slice(0, PER_GROUP)
      .map(r => ({ kind: 'recipe', key: `r-${r.id}`, label: r.name, sub: [r.style?.name, isOwn(r) ? '' : t('public_library')].filter(Boolean).join(' · '), recipe: r }));
    const brewHits: Hit[] = logs
      .map(l => {
        const recipe = recipes.find(r => r.id === l.recipeId);
        const n = numbers.get(l.id);
        const batch = n ? t('batch_label').replace('{n}', String(n)) : undefined;
        return { l, recipe, batch };
      })
      .filter(({ l, recipe, batch }) => matchesQuery(brewSearchText(l, recipe, batch), q))
      .sort((a, b) => (b.l.brewDate || b.l.date).localeCompare(a.l.brewDate || a.l.date))
      .slice(0, PER_GROUP)
      .map(({ l, recipe, batch }) => ({ kind: 'brew', key: `b-${l.id}`, label: [recipe?.name ?? '…', batch].filter(Boolean).join(' – '), sub: formatDate(l.brewDate || l.date, lang), log: l }));
    const seen = new Set<string>();
    const ingredientHits: Hit[] = library
      .filter(i => SEARCHED_TYPES.includes(i.type) && matchesQuery(ingredientSearchText(i), q))
      .sort((a, b) => Number(isOwn(b)) - Number(isOwn(a)) || a.name.localeCompare(b.name))
      // The same name once (own copy first)
      .filter(i => { const k = `${i.type}:${i.name.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, PER_GROUP)
      .map(i => ({ kind: 'ingredient', key: `i-${i.id}`, label: i.name, sub: [typeLabel[i.type], isOwn(i) ? '' : t('public_library')].filter(Boolean).join(' · '), item: i }));
    return [
      { title: t('nav_recipes'), hits: recipeHits },
      { title: t('nav_brews'), hits: brewHits },
      { title: t('ingredients_header'), hits: ingredientHits },
    ].filter(g => g.hits.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, recipes, logs, library, lang]);

  const flat = groups.flatMap(g => g.hits);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!open) return null;

  const choose = (h: Hit) => {
    onClose();
    if (h.kind === 'recipe') onOpenRecipe(h.recipe);
    else if (h.kind === 'brew') onOpenBrew(h.log);
    else onOpenIngredient(h.item);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); choose(flat[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const icon = { recipe: 'fa-flask', brew: 'fa-clipboard-list', ingredient: 'fa-seedling' };

  let index = -1;
  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center p-4 pt-[10vh] bg-black/40" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('global_search_title')} className="w-full max-w-xl bg-[var(--color-bg)] rounded-[var(--radius)] shadow-2xl border border-[var(--color-border)] overflow-hidden" onKeyDown={onKey}>
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)]">
          <i className="fas fa-search text-[var(--color-text-xmuted)]" aria-hidden="true"></i>
          <label htmlFor="global_search" className="sr-only">{t('global_search_title')}</label>
          <input ref={input} id="global_search" name="global_search" type="search" autoComplete="off" maxLength={100}
            role="combobox" aria-expanded={flat.length > 0} aria-controls="global_search_results" aria-autocomplete="list"
            aria-activedescendant={flat[active] ? `gs-${active}` : undefined}
            placeholder={t('global_search_placeholder')} value={query} onChange={e => setQuery(e.target.value)}
            className="flex-1 py-4 bg-transparent outline-none text-base text-[var(--color-text)] [&::-webkit-search-cancel-button]:hidden" />
          <kbd className="hidden sm:inline text-[10px] font-bold text-[var(--color-text-xmuted)] border border-[var(--color-border)] rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div ref={list} id="global_search_results" role="listbox" aria-label={t('global_search_title')} className="max-h-[60vh] overflow-auto py-2">
          {!query.trim() && <p className="px-4 py-6 text-sm text-[var(--color-text-muted)]">{t('global_search_hint')}</p>}
          {query.trim() && flat.length === 0 && <p role="status" className="px-4 py-6 text-sm text-[var(--color-text-muted)]">{t('search_no_results').replace('{q}', query.trim())}</p>}
          {groups.map(g => (
            <div key={g.title} role="group" aria-label={g.title}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">{g.title}</p>
              {g.hits.map(h => {
                index += 1;
                const i = index;
                return (
                  <div key={h.key} id={`gs-${i}`} role="option" aria-selected={i === active} data-index={i}
                    onMouseMove={() => setActive(i)} onClick={() => choose(h)}
                    className={`mx-2 px-3 py-2 rounded-[var(--radius-sm)] flex items-center gap-3 cursor-pointer ${i === active ? 'bg-[var(--color-accent-light)]' : ''}`}>
                    <i className={`fas ${icon[h.kind]} w-4 text-center text-xs text-[var(--color-text-xmuted)]`} aria-hidden="true"></i>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-semibold text-sm text-[var(--color-text)]">{h.label}</span>
                      {h.sub && <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{h.sub}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
