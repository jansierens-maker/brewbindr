import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import type { Recipe } from '../types';
import {
  FlavourKb, FlavourMapping, FlavourCategory, FlavourIngredient, FlavourLang, Suggestion, Bridge,
  recipeProfile, recipeSuggestions, ingredientProfile, suggest, familyBars, ingredientName, familyName,
  compoundDescriptor, ingredientNotes, kbCompound, kbIngredient, candidateGrams, candidateStage,
  addToRecipe, FAMILY_KEY, spiceAsMisc, hopAsAroma, yeastAsCulture,
} from '../services/flavourLab';
import { MIN_SCORE } from '../services/flavourConfig';
import { flavourLabService } from '../services/flavourLabService';

interface Props {
  /** Recipes to choose from (the brewery's own) */
  recipes: Recipe[];
  initialRecipeId?: string;
  breweryId?: string;
  userId?: string;
  /** Whether this recipe may be changed by the user */
  canEditRecipe: (recipe: Recipe) => boolean;
  /** Links of recipe names may be made by admin, brewmaster and brewer */
  canMap: boolean;
  /** Saves a changed recipe; false when it failed */
  onSaveRecipe: (recipe: Recipe) => Promise<boolean>;
  /** Opens the recipe editor with a new, unsaved recipe (flow B) */
  onStartRecipe: (recipe: Recipe) => void;
  canCreateRecipe: boolean;
}

type Tab = 'spice' | 'yeast' | 'hop';
const TABS: Tab[] = ['spice', 'yeast', 'hop'];
const TAB_LABEL: Record<Tab, string> = { spice: 'fl_tab_spice', yeast: 'fl_tab_yeast', hop: 'fl_tab_hop' };
const CATEGORY_LABEL: Record<FlavourCategory, string> = { spice: 'fl_cat_spice', hop: 'fl_cat_hop', yeast: 'fl_cat_yeast', malt: 'fl_cat_malt' };
const EXCLUDE_KEY = 'brewbindr.flavourLab.exclude';

interface Filters { noPof: boolean; hiddenTabs: Tab[]; excluded: string[] }
const loadFilters = (): Filters => {
  try {
    const f = JSON.parse(localStorage.getItem(EXCLUDE_KEY) || '{}');
    return { noPof: !!f.noPof, hiddenTabs: Array.isArray(f.hiddenTabs) ? f.hiddenTabs : [], excluded: Array.isArray(f.excluded) ? f.excluded : [] };
  } catch {
    return { noPof: false, hiddenTabs: [], excluded: [] };
  }
};

/** Flavour Lab (spec §4): the recipe's aroma profile and suggestions that share aroma compounds. */
const FlavourLab: React.FC<Props> = ({ recipes, initialRecipeId, breweryId, userId, canEditRecipe, canMap, onSaveRecipe, onStartRecipe, canCreateRecipe }) => {
  const { t, lang } = useTranslation();
  const tr = (k: string) => t(k as any);
  const fl = lang as FlavourLang;
  const [kb, setKb] = useState<FlavourKb | null>(null);
  const [mappings, setMappings] = useState<FlavourMapping[]>([]);
  const [mode, setMode] = useState<'recipe' | 'ingredient'>('recipe');
  const [recipeId, setRecipeId] = useState<string>(initialRecipeId || recipes[0]?.id || '');
  const [startId, setStartId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('spice');
  const [preview, setPreview] = useState<Suggestion | null>(null);
  const [asTable, setAsTable] = useState(false);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [mapOpen, setMapOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    flavourLabService.loadKb().then(k => { if (live) { setKb(k); setStartId(s => s || k.ingredients.find(i => i.id === 'coriander')?.id || ''); } });
    flavourLabService.loadMappings(breweryId).then(m => { if (live) setMappings(m); });
    return () => { live = false; };
  }, [breweryId]);

  useEffect(() => { if (initialRecipeId) { setRecipeId(initialRecipeId); setMode('recipe'); } }, [initialRecipeId]);
  useEffect(() => { try { localStorage.setItem(EXCLUDE_KEY, JSON.stringify(filters)); } catch { /* not kept */ } }, [filters]);

  const recipe = recipes.find(r => r.id === recipeId);
  const sortedRecipes = useMemo(() => [...recipes].sort((a, b) => a.name.localeCompare(b.name)), [recipes]);
  const spices = useMemo(() => (kb?.ingredients ?? []).filter(i => i.category === 'spice').sort((a, b) => ingredientName(a, fl).localeCompare(ingredientName(b, fl))), [kb, fl]);
  const startIngredient = kb && startId ? kbIngredient(kb, startId) : undefined;

  const profile = useMemo(() => {
    if (!kb) return null;
    if (mode === 'ingredient') return startIngredient ? ingredientProfile(kb, startIngredient) : null;
    return recipe ? recipeProfile(recipe, kb, mappings) : null;
  }, [kb, mode, recipe, startIngredient, mappings]);

  const suggestions = useMemo(() => {
    if (!kb || !profile) return null;
    const opts = { lang: fl, noPof: filters.noPof, exclude: new Set(filters.excluded) };
    if (mode === 'ingredient') {
      return {
        spice: [] as Suggestion[],
        yeast: suggest(kb, profile.vector, 'yeast', profile.ingredientIds, { ...opts, minScore: 0 }),
        hop: suggest(kb, profile.vector, 'hop', profile.ingredientIds, opts),
      };
    }
    return recipeSuggestions(kb, profile, opts);
  }, [kb, profile, mode, fl, filters]);

  const visibleTabs = TABS.filter(x => !filters.hiddenTabs.includes(x) && !(mode === 'ingredient' && x === 'spice'));
  const activeTab: Tab | undefined = visibleTabs.includes(tab) ? tab : visibleTabs[0];
  useEffect(() => { setPreview(null); }, [activeTab, recipeId, mode, startId]);
  useEffect(() => { setMessage(''); }, [recipeId, mode]);

  // Only the recipe's own families get a bar: a previewed suggestion adds to them but never adds
  // rows, so the cards below do not move while you point at them
  const bars = useMemo(() => (kb && profile ? familyBars(kb, profile.contributions, preview?.contributions ?? []).filter(b => b.total > 0) : []), [kb, profile, preview]);
  const maxBar = Math.max(1e-9, ...bars.map(b => b.total + b.extra));
  const nf = (n: number, digits = 1) => new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(n);

  if (!kb) {
    return <div className="py-20 flex justify-center" role="status" aria-live="polite"><i className="fas fa-circle-notch fa-spin text-2xl text-[var(--color-text-xmuted)]" aria-hidden="true"></i><span className="sr-only">{tr('fl_loading')}</span></div>;
  }

  const editable = mode === 'recipe' && !!recipe && canEditRecipe(recipe);
  const ingLabel = (id: string) => { const i = kbIngredient(kb, id); return i ? ingredientName(i, fl) : id; };
  const bridgeLabel = (b: Bridge) => {
    if (b.compound_id.startsWith(FAMILY_KEY)) {
      const f = kb.families.find(x => x.id === b.compound_id.slice(FAMILY_KEY.length));
      return { name: f ? familyName(f, fl) : b.compound_id, title: tr('fl_bridge_family'), color: f?.color };
    }
    const c = kbCompound(kb, b.compound_id);
    const f = c ? kb.families.find(x => x.id === c.family_id) : undefined;
    return { name: c?.name ?? b.compound_id, title: c ? compoundDescriptor(c, fl) : '', color: f?.color };
  };
  const stageLabel = (i: FlavourIngredient) => tr(`fl_stage_${candidateStage(i)}`);

  const add = async (s: Suggestion) => {
    if (!recipe || busy) return;
    const i = s.ingredient;
    if (i.category === 'yeast') {
      const current = recipe.ingredients.cultures.map(c => c.name).filter(Boolean).join(', ') || '—';
      if (!window.confirm(tr('fl_confirm_yeast').replace('{old}', current).replace('{new}', ingredientName(i, fl)))) return;
    }
    setBusy(true);
    const ok = await onSaveRecipe(addToRecipe(recipe, i, fl));
    setBusy(false);
    setPreview(null);
    setMessage(ok ? tr('fl_added').replace('{name}', ingredientName(i, fl)).replace('{recipe}', recipe.name) : '');
  };

  const startRecipe = (s: Suggestion) => {
    if (!startIngredient) return;
    const base: Recipe = {
      name: `${ingredientName(startIngredient, fl)} – ${ingredientName(s.ingredient, fl)}`,
      type: 'all_grain', author: '', batch_size: { unit: 'liters', value: 20 }, efficiency: { brewhouse: 72 },
      boil_time: { unit: 'minutes', value: 60 },
      ingredients: {
        fermentables: [], hops: s.ingredient.category === 'hop' ? [hopAsAroma(s.ingredient, fl, 20)] : [],
        cultures: s.ingredient.category === 'yeast' ? [yeastAsCulture(s.ingredient, fl)] : [],
        miscellaneous: [spiceAsMisc(startIngredient, fl, 20)],
      },
    };
    onStartRecipe(base);
  };

  const exclude = (id: string) => setFilters(f => ({ ...f, excluded: [...new Set([...f.excluded, id])] }));
  const tabList = suggestions && activeTab ? suggestions[activeTab] : [];
  const batchL = profile?.batchL || 20;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1">{t('nav_section_brewery')}</p>
          <h2 className="text-4xl font-black text-[var(--color-text)]">{tr('nav_flavour_lab')}</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-2xl">{tr('fl_intro')}</p>
        </div>
        <div role="radiogroup" aria-label={tr('fl_mode_label')} className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-1 bg-[var(--color-bg-subtle)] self-start">
          {(['recipe', 'ingredient'] as const).map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-[var(--radius-sm)] text-xs font-black uppercase tracking-widest ${mode === m ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-[var(--shadow-sm)]' : 'text-[var(--color-text-muted)]'}`}>
              {tr(m === 'recipe' ? 'fl_mode_recipe' : 'fl_mode_ingredient')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        {mode === 'recipe' ? (
          <div className="flex-1 min-w-0">
            <label htmlFor="fl-recipe" className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1">{tr('fl_choose_recipe')}</label>
            <select id="fl-recipe" name="fl_recipe" value={recipeId} onChange={e => setRecipeId(e.target.value)}
              className="w-full p-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] font-bold">
              {sortedRecipes.length === 0 && <option value="">{tr('fl_no_recipes')}</option>}
              {sortedRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <label htmlFor="fl-start" className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1">{tr('fl_choose_spice')}</label>
            <select id="fl-start" name="fl_start" value={startId} onChange={e => setStartId(e.target.value)}
              className="w-full p-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] font-bold">
              {spices.map(i => <option key={i.id} value={i.id}>{ingredientName(i, fl)}</option>)}
            </select>
          </div>
        )}
        <details className="sm:w-72 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]"><i className="fas fa-filter mr-2" aria-hidden="true"></i>{tr('fl_filters')}</summary>
          <div className="mt-3 space-y-2 text-sm">
            <label htmlFor="fl-nopof" className="flex items-center gap-2">
              <input id="fl-nopof" name="fl_nopof" type="checkbox" checked={filters.noPof} onChange={e => setFilters(f => ({ ...f, noPof: e.target.checked }))} />
              {tr('fl_filter_nopof')}
            </label>
            {TABS.map(x => (
              <label key={x} htmlFor={`fl-show-${x}`} className="flex items-center gap-2">
                <input id={`fl-show-${x}`} name={`fl_show_${x}`} type="checkbox" checked={!filters.hiddenTabs.includes(x)}
                  onChange={e => setFilters(f => ({ ...f, hiddenTabs: e.target.checked ? f.hiddenTabs.filter(h => h !== x) : [...f.hiddenTabs, x] }))} />
                {tr('fl_filter_show').replace('{tab}', tr(TAB_LABEL[x]))}
              </label>
            ))}
            {filters.excluded.length > 0 && (
              <div className="pt-2 border-t border-[var(--color-border)]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1">{tr('fl_excluded')}</p>
                <ul className="space-y-1">
                  {filters.excluded.map(id => (
                    <li key={id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{ingLabel(id)}</span>
                      <button type="button" onClick={() => setFilters(f => ({ ...f, excluded: f.excluded.filter(x => x !== id) }))}
                        className="text-xs text-[var(--color-accent-dark)] underline">{tr('fl_include_again')}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>

      {mode === 'recipe' && profile && profile.unmatched.length > 0 && (
        <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between" role="status">
          <p className="text-sm text-amber-900">
            <i className="fas fa-circle-info mr-2" aria-hidden="true"></i>
            {tr('fl_unmatched')} <strong>{profile.unmatched.map(u => u.name).join(', ')}</strong>
          </p>
          {canMap && breweryId && (
            <button type="button" onClick={() => setMapOpen(true)} className="px-4 py-2 rounded-[var(--radius-sm)] bg-amber-600 text-white text-xs font-black uppercase tracking-widest whitespace-nowrap">{tr('fl_map_btn')}</button>
          )}
        </div>
      )}
      {mode === 'recipe' && canMap && breweryId && profile && profile.unmatched.length === 0 && mappings.length > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]"><button type="button" onClick={() => setMapOpen(true)} className="underline">{tr('fl_map_manage')}</button></p>
      )}
      {message && <p className="text-sm font-bold text-[var(--color-green)]" role="status">{message}</p>}

      <section aria-labelledby="fl-profile-title" className="bg-[var(--color-bg)] p-6 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 id="fl-profile-title" className="text-lg font-black text-[var(--color-text)]">{tr('fl_profile')}</h3>
          <button type="button" onClick={() => setAsTable(v => !v)} className="text-xs font-bold text-[var(--color-accent-dark)] underline">{tr(asTable ? 'fl_show_chart' : 'fl_show_table')}</button>
        </div>
        {bars.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">{tr('fl_profile_empty')}</p>}
        {bars.length > 0 && !asTable && (
          <ul className="space-y-3">
            {bars.map(b => (
              <li key={b.family.id} className="grid grid-cols-1 sm:grid-cols-[minmax(7rem,11rem)_1fr] gap-1 sm:gap-3 sm:items-center">
                <span className="text-xs font-bold text-[var(--color-text)] truncate" title={familyName(b.family, fl)}>{familyName(b.family, fl)}</span>
                <div className="min-w-0">
                  <div className="h-4 w-full rounded-full bg-[var(--color-bg-subtle)] flex overflow-hidden" aria-hidden="true">
                    {b.parts.map((p, n) => (
                      <div key={p.ingredient_id} title={`${ingLabel(p.ingredient_id)}: ${nf(p.value)}`}
                        style={{ width: `${(p.value / maxBar) * 100}%`, background: b.family.color, opacity: Math.max(0.45, 1 - n * 0.2) }}
                        className={n > 0 ? 'border-l border-white' : ''} />
                    ))}
                    {b.extra > 0 && (
                      <div style={{ width: `${(b.extra / maxBar) * 100}%`, background: `repeating-linear-gradient(45deg, ${b.family.color}55 0 4px, ${b.family.color}22 4px 8px)` }} />
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate">
                    {b.parts.slice(0, 3).map(p => ingLabel(p.ingredient_id)).join(' · ')}
                    {b.extra > 0 && preview && <span className="font-bold text-[var(--color-text)]"> + {ingredientName(preview.ingredient, fl)}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {bars.length > 0 && asTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{tr('fl_profile')}</caption>
              <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)]">
                <th scope="col" className="py-1">{tr('fl_family')}</th><th scope="col" className="py-1 text-right">{tr('fl_strength')}</th>
                <th scope="col" className="py-1 pl-4">{tr('fl_from')}</th>{preview && <th scope="col" className="py-1 text-right">+ {ingredientName(preview.ingredient, fl)}</th>}
              </tr></thead>
              <tbody>
                {bars.map(b => (
                  <tr key={b.family.id} className="border-t border-[var(--color-border)]">
                    <th scope="row" className="py-1.5 text-left font-bold">{familyName(b.family, fl)}</th>
                    <td className="py-1.5 text-right tabular-nums">{nf(b.total)}</td>
                    <td className="py-1.5 pl-4 text-[var(--color-text-muted)]">{b.parts.map(p => `${ingLabel(p.ingredient_id)} (${nf(p.value)})`).join(', ')}</td>
                    {preview && <td className="py-1.5 text-right tabular-nums">{b.extra > 0 ? `+${nf(b.extra)}` : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {visibleTabs.length > 0 && activeTab && (
        <section className="space-y-4">
          <div role="tablist" aria-label={tr('fl_suggestions')} className="flex border-b border-[var(--color-border)] gap-6">
            {visibleTabs.map(x => (
              <button key={x} id={`fl-tab-${x}`} type="button" role="tab" aria-selected={activeTab === x} aria-controls={`fl-panel-${x}`} onClick={() => setTab(x)}
                className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 -mb-px ${activeTab === x ? 'border-[var(--color-accent)] text-[var(--color-text)]' : 'border-transparent text-[var(--color-text-muted)]'}`}>
                {tr(TAB_LABEL[x])}
              </button>
            ))}
          </div>
          <div id={`fl-panel-${activeTab}`} role="tabpanel" aria-labelledby={`fl-tab-${activeTab}`}>
            {tabList.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">{tr('fl_no_suggestions')}</p>}
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tabList.map(s => {
                const i = s.ingredient;
                const grams = i.category === 'spice' || i.category === 'hop' ? candidateGrams(i, batchL) : null;
                const notes = ingredientNotes(i, fl);
                const weak = s.score < MIN_SCORE;
                const active = preview?.ingredient.id === i.id;
                return (
                  <li key={i.id} tabIndex={0}
                    onMouseEnter={() => setPreview(s)} onFocus={() => setPreview(s)} onClick={() => setPreview(active ? null : s)}
                    className={`bg-[var(--color-bg)] p-5 rounded-[var(--radius)] border shadow-[var(--shadow-sm)] space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${active ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}
                    aria-label={`${ingredientName(i, fl)}, ${tr('fl_score')} ${s.score}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-black text-[var(--color-text)] truncate">{ingredientName(i, fl)}</h4>
                        {i.category === 'yeast' && (
                          <span className={`inline-block mt-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${i.yeast_pof ? 'bg-amber-100 text-amber-800' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]'}`}>{tr(i.yeast_pof ? 'fl_pof_plus' : 'fl_pof_minus')}</span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block text-2xl font-black tabular-nums text-[var(--color-text)]">{s.score}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-xmuted)]">{tr(weak ? 'fl_weak' : 'fl_score')}</span>
                      </div>
                    </div>
                    {s.bridges.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1">{tr('fl_bridges')}</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {s.bridges.map(b => {
                            const l = bridgeLabel(b);
                            return (
                              <li key={b.compound_id} title={l.title} className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text)]">
                                <span className="w-2 h-2 rounded-full" style={{ background: l.color }} aria-hidden="true"></span>{l.name}
                                <span className="sr-only">: {l.title}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {(grams !== null || i.category === 'spice') && (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        {grams !== null && <><dt className="text-[var(--color-text-xmuted)] font-bold">{tr('fl_dose')}</dt><dd className="font-bold tabular-nums">{nf(grams)} g <span className="font-normal text-[var(--color-text-muted)]">({tr('fl_for_batch').replace('{l}', nf(batchL))})</span></dd></>}
                        {i.category === 'spice' && i.form && <><dt className="text-[var(--color-text-xmuted)] font-bold">{tr('fl_form')}</dt><dd>{tr(`fl_form_${i.form}`)}</dd></>}
                        {(i.category === 'spice' || i.category === 'hop') && <><dt className="text-[var(--color-text-xmuted)] font-bold">{tr('fl_when')}</dt><dd>{stageLabel(i)}</dd></>}
                      </dl>
                    )}
                    {notes && <p className="text-xs text-[var(--color-text-muted)]"><i className="fas fa-lightbulb mr-1 text-[var(--color-accent)]" aria-hidden="true"></i>{notes}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      {mode === 'recipe' && editable && (
                        <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); add(s); }}
                          className="flex-1 py-2 rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[var(--color-accent-dark)] disabled:opacity-50">
                          {tr(i.category === 'yeast' ? 'fl_replace_yeast' : 'fl_add')}
                        </button>
                      )}
                      {mode === 'ingredient' && canCreateRecipe && (
                        <button type="button" onClick={e => { e.stopPropagation(); startRecipe(s); }}
                          className="flex-1 py-2 rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[var(--color-accent-dark)]">
                          {tr('fl_start_recipe')}
                        </button>
                      )}
                      <button type="button" onClick={e => { e.stopPropagation(); exclude(i.id); }} title={tr('fl_exclude')} aria-label={`${tr('fl_exclude')}: ${ingredientName(i, fl)}`}
                        className="w-9 h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                        <i className="fas fa-eye-slash" aria-hidden="true"></i>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <p className="text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)] pt-4"><i className="fas fa-flask mr-1" aria-hidden="true"></i>{tr('fl_disclaimer')}</p>

      {mapOpen && profile && breweryId && userId && (
        <MappingDialog kb={kb} lang={fl} unmatched={profile.unmatched} mappings={mappings} breweryId={breweryId} userId={userId}
          onClose={() => setMapOpen(false)} onChanged={setMappings} />
      )}
    </div>
  );
};

interface MappingProps {
  kb: FlavourKb; lang: FlavourLang; breweryId: string; userId: string;
  unmatched: { category: FlavourCategory; name: string; key: string }[];
  mappings: FlavourMapping[];
  onClose: () => void;
  onChanged: (m: FlavourMapping[]) => void;
}

const SKIP = '__skip__';

/** Links names that are not in the knowledge base to an ingredient, for the whole brewery (US-10). */
const MappingDialog: React.FC<MappingProps> = ({ kb, lang, breweryId, userId, unmatched, mappings, onClose, onChanged }) => {
  const { t } = useTranslation();
  const tr = (k: string) => t(k as any);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = (cat: FlavourCategory) => kb.ingredients.filter(i => i.category === cat).sort((a, b) => ingredientName(a, lang).localeCompare(ingredientName(b, lang)));
  const rowKey = (u: { category: string; key: string }) => `${u.category}:${u.key}`;

  const save = async () => {
    setBusy(true);
    setError('');
    let next = [...mappings];
    let failed = '';
    for (const u of unmatched) {
      const c = choice[rowKey(u)];
      if (!c) continue;
      const m = { category: u.category, name_key: u.key, ingredient_id: c === SKIP ? null : c };
      const { error: err } = await flavourLabService.saveMapping(breweryId, userId, m);
      if (err) { failed = err.message; break; }
      next = [...next.filter(x => !(x.category === m.category && x.name_key === m.name_key)), m];
    }
    onChanged(next);
    setBusy(false);
    if (failed) setError(failed); else onClose();
  };

  const remove = async (m: FlavourMapping) => {
    const { error: err } = await flavourLabService.deleteMapping(breweryId, m.category, m.name_key);
    if (err) { setError(err.message); return; }
    onChanged(mappings.filter(x => !(x.category === m.category && x.name_key === m.name_key)));
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="fl-map-title" className="bg-[var(--color-bg)] rounded-[var(--radius)] p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 id="fl-map-title" className="text-2xl font-black text-[var(--color-text)]">{tr('fl_map_title')}</h3>
        <p className="text-sm text-[var(--color-text-muted)]">{tr('fl_map_desc')}</p>
        {unmatched.length > 0 && (
          <ul className="space-y-3">
            {unmatched.map(u => {
              const id = `fl-map-${u.category}-${u.key.replace(/\s+/g, '-')}`;
              return (
                <li key={rowKey(u)} className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:items-center">
                  <label htmlFor={id} className="text-sm font-bold text-[var(--color-text)]">{u.name} <span className="font-normal text-[var(--color-text-xmuted)]">({tr(CATEGORY_LABEL[u.category])})</span></label>
                  <select id={id} name={id} value={choice[rowKey(u)] ?? ''} onChange={e => setChoice(c => ({ ...c, [rowKey(u)]: e.target.value }))}
                    className="w-full p-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm">
                    <option value="">{tr('fl_map_choose')}</option>
                    <option value={SKIP}>{tr('fl_map_skip')}</option>
                    {options(u.category).map(i => <option key={i.id} value={i.id}>{ingredientName(i, lang)}</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
        {mappings.length > 0 && (
          <div className="pt-2 border-t border-[var(--color-border)]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-2">{tr('fl_map_existing')}</p>
            <ul className="space-y-1 text-sm">
              {mappings.map(m => {
                const ing = m.ingredient_id ? kbIngredient(kb, m.ingredient_id) : undefined;
                return (
                  <li key={`${m.category}:${m.name_key}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{m.name_key} → <strong>{ing ? ingredientName(ing, lang) : tr('fl_map_skip')}</strong></span>
                    <button type="button" onClick={() => remove(m)} className="text-xs text-[var(--color-accent-dark)] underline shrink-0">{tr('fl_map_remove')}</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex gap-3">
          {unmatched.length > 0 && (
            <button type="button" onClick={save} disabled={busy || Object.values(choice).every(v => !v)}
              className="flex-[2] py-3 rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-white font-black text-xs uppercase tracking-widest disabled:opacity-50">{tr('fl_map_save')}</button>
          )}
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-[var(--radius-sm)] bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] font-black text-xs uppercase tracking-widest">{tr('cancel_btn')}</button>
        </div>
      </div>
    </div>
  );
};

export default FlavourLab;
