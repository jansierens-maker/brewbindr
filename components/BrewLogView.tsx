
import React, { useDeferredValue, useState } from 'react';
import ListToolbar, { FilterChip, FilterSelect } from './ListToolbar';
import { BrewFilters, BrewSort, BREW_SORTS, brewMatches, brewYear, sortBrews } from '../services/filters';
import { matchesQuery, brewSearchText } from '../services/search';
import { BrewLogEntry, LibraryIngredient, Recipe, TastingNote } from '../types';
import { getSRMColor, calculateABV, formatGravity } from '../services/calculations';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { averageOverall, batchNumbers, formatDate } from '../services/tasting';
import { StageBadge } from './RecipeLifecycle';
import { BREW_PHASES, BrewPhase } from '../services/brewPhases';

const PHASE_TAB = { brewing: 'tab_brewing', fermenting: 'tab_fermenting', lagering: 'tab_lagering', bottled: 'tab_bottled' } as const;

interface BrewLogViewProps {
  logs: BrewLogEntry[];
  recipes: Recipe[];
  tastingNotes: TastingNote[];
  onEditLog: (logId: string) => void;
  onAddTasting: (logId: string) => void;
  onViewNotes: (logId: string) => void;
  /** Mark a bottled batch as finished, or not finished again */
  onToggleFinished: (logId: string) => void;
  /** Every signed-in member can taste a bottled batch */
  canAddNotes: boolean;
  /** Brewery admins, brewmasters and brewers open and update brews; tasters do not */
  canManageBrews: boolean;
  onPrintReport?: (log: BrewLogEntry) => void;
  /** The brewery's installations, to filter on */
  installations?: LibraryIngredient[];
}

const BrewLogView: React.FC<BrewLogViewProps> = ({ logs, recipes, tastingNotes, onEditLog, onAddTasting, onViewNotes, onToggleFinished, canAddNotes, canManageBrews, onPrintReport, installations = [] }) => {
  const { t, lang } = useTranslation();
  const { preferences } = useUser();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  // Filter by phase (tabs, as they were on Recipes); bottled here means all bottled brews
  const [phase, setPhase] = useState<BrewPhase | 'all'>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const numbers = batchNumbers(logs);
  const found = (l: BrewLogEntry) => {
    const n = numbers.get(l.id);
    return matchesQuery(brewSearchText(l, recipes.find(r => r.id === l.recipeId), n ? t('batch_label').replace('{n}', String(n)) : undefined), deferredQuery);
  };
  const [filters, setFilters] = useState<BrewFilters>({});
  const [sort, setSort] = useState<BrewSort>('newest');
  const recipeOf = (l: BrewLogEntry) => recipes.find(r => r.id === l.recipeId);
  const noteCount = (l: BrewLogEntry) => tastingNotes.filter(n => n.brewLogId === l.id).length;
  const searched = logs.filter(l => found(l) && brewMatches(l, recipeOf(l), filters, noteCount(l)));
  const sortedLogs = sortBrews(searched.filter(l => phase === 'all' || l.status === phase), sort, l => recipeOf(l)?.name ?? '');
  // Choices that occur in the brews
  const years = [...new Set(logs.map(brewYear).filter(y => !isNaN(y)))].sort((a, b) => b - a);
  const brewedRecipes = recipes.filter(r => logs.some(l => l.recipeId === r.id)).sort((a, b) => a.name.localeCompare(b.name));
  const set = (patch: Partial<BrewFilters>) => setFilters(f => ({ ...f, ...patch }));
  const chips: FilterChip[] = [
    ...(filters.year !== undefined ? [{ key: 'year', label: String(filters.year), onRemove: () => set({ year: undefined }) }] : []),
    ...(filters.recipeId ? [{ key: 'recipe', label: recipes.find(r => r.id === filters.recipeId)?.name ?? t('filters_recipe'), onRemove: () => set({ recipeId: undefined }) }] : []),
    ...(filters.equipmentId ? [{ key: 'eq', label: installations.find(e => e.id === filters.equipmentId)?.name ?? t('filters_installation'), onRemove: () => set({ equipmentId: undefined }) }] : []),
    ...(filters.finished ? [{ key: 'fin', label: t(filters.finished === 'open' ? 'filters_finished_open' : 'filters_finished_yes'), onRemove: () => set({ finished: undefined }) }] : []),
    ...(filters.notes ? [{ key: 'notes', label: t(filters.notes === 'with' ? 'filters_notes_with' : 'filters_notes_without'), onRemove: () => set({ notes: undefined }) }] : []),
  ];
  const countOf = (p: BrewPhase) => searched.filter(l => l.status === p).length;

  if (logs.length === 0) {
    return (
      <div className="bg-[var(--color-bg)] rounded-[var(--radius)] p-20 text-center border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
        <i className="fas fa-history text-6xl text-[var(--color-text-xmuted)] opacity-20 mb-6"></i>
        <h3 className="text-2xl font-[var(--font-display)] font-bold text-[var(--color-text)]">{t('no_brews')}</h3>
      </div>
    );
  }

  const getStatusBadge = (status: BrewLogEntry['status']) => {
    const labels = { brewing: 'status_brewing', fermenting: 'status_fermenting', lagering: 'status_lagering', bottled: 'status_bottled' };
    const colors = { brewing: 'bg-blue-100 text-blue-700', fermenting: 'bg-amber-100 text-amber-700', lagering: 'bg-indigo-100 text-indigo-700', bottled: 'bg-green-100 text-green-700' };
    return <span className={`${colors[status]} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider`}>{t(labels[status] as any)}</span>;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h2 className="text-4xl font-black text-[var(--color-text)] font-[var(--font-display)]">{t('history_title')}</h2>
        <p className="text-[var(--color-text-muted)] font-medium mt-1">{t('history_subtitle')}</p>
      </div>
      <ListToolbar
        search={{ id: 'brew_search', label: t('search_brews'), value: query, onChange: setQuery }}
        sort={{ id: 'brew_sort', value: sort, onChange: v => setSort(v as BrewSort), options: BREW_SORTS.map(v => ({ value: v, label: t(`sort_brew_${v}` as any) })) }}
        chips={chips} onClearAll={() => setFilters({})}
      >
        <FilterSelect id="filter_year" label={t('filters_year')} anyLabel={t('filters_any')} value={filters.year !== undefined ? String(filters.year) : ''}
          options={years.map(y => ({ value: String(y), label: String(y) }))} onChange={v => set({ year: v ? Number(v) : undefined })} />
        <FilterSelect id="filter_recipe" label={t('filters_recipe')} anyLabel={t('filters_any')} value={filters.recipeId ?? ''}
          options={brewedRecipes.map(r => ({ value: r.id ?? '', label: r.name }))} onChange={v => set({ recipeId: v || undefined })} />
        {installations.length > 1 && (
          <FilterSelect id="filter_installation" label={t('filters_installation')} anyLabel={t('filters_any')} value={filters.equipmentId ?? ''}
            options={installations.map(e => ({ value: e.id, label: e.name }))} onChange={v => set({ equipmentId: v || undefined })} />
        )}
        <FilterSelect id="filter_finished" label={t('filters_finished')} anyLabel={t('filters_any')} value={filters.finished ?? ''}
          options={[{ value: 'open', label: t('filters_finished_open') }, { value: 'finished', label: t('filters_finished_yes') }]}
          onChange={v => set({ finished: (v || undefined) as BrewFilters['finished'] })} />
        <FilterSelect id="filter_notes" label={t('filters_notes')} anyLabel={t('filters_any')} value={filters.notes ?? ''}
          options={[{ value: 'with', label: t('filters_notes_with') }, { value: 'without', label: t('filters_notes_without') }]}
          onChange={v => set({ notes: (v || undefined) as BrewFilters['notes'] })} />
      </ListToolbar>
      <div role="tablist" aria-label={t('nav_brews')} className="flex border-b border-[var(--color-border)] gap-8 overflow-x-auto custom-scrollbar">
        {(['all', ...BREW_PHASES] as const).map(p => {
          const count = p === 'all' ? searched.length : countOf(p);
          return (
            <button key={p} type="button" role="tab" id={`brews-tab-${p}`} aria-selected={phase === p} aria-controls="brews-list" onClick={() => setPhase(p)}
              className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${phase === p ? 'text-[var(--color-text)]' : 'text-[var(--color-text-xmuted)] hover:text-[var(--color-text-muted)]'}`}>
              {p === 'all' ? t('tab_all_brews') : t(PHASE_TAB[p])} {count > 0 ? `(${count})` : ''}
              {phase === p && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-accent)] rounded-t-full"></div>}
            </button>
          );
        })}
      </div>
      {sortedLogs.length === 0 && <p role="status" className="text-[var(--color-text-muted)] font-bold">{deferredQuery.trim() ? t('search_no_results').replace('{q}', deferredQuery.trim()) : chips.length ? t('filters_no_results') : t('no_brews_with_status')}</p>}
      <div id="brews-list" role="tabpanel" aria-labelledby={`brews-tab-${phase}`} className="grid grid-cols-1 gap-6">
        {sortedLogs.map(log => {
          const recipe = recipes.find(r => r.id === log.recipeId);
          const notes = tastingNotes.filter(n => n.brewLogId === log.id);
          const isExpanded = expandedLogId === log.id;

          const abvValue = calculateABV(
            log.measurements.actual_og,
            log.measurements.actual_fg,
            log.status === 'bottled',
            (log.bottling?.method === 'keg' ? 0 : log.bottling?.sugar_amount),
            log.bottling?.bottling_volume || log.measurements.actual_volume,
            preferences.abvFormula
          );
          const abv = abvValue > 0 ? abvValue.toFixed(1) : '?';

          return (
            <div key={log.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow)] transition-all flex flex-col relative group">
              <div className="flex flex-col md:flex-row">
                <div className="w-full md:w-3 h-3 md:h-auto transition-all" style={{ backgroundColor: getSRMColor(recipe?.specifications?.color?.value || 0) }}></div>
                <div className="flex-1 p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3"><span className="text-xs font-black text-[var(--color-text-xmuted)] uppercase tracking-tighter">{formatDate(log.brewDate || log.date, lang)}</span>{getStatusBadge(log.status)}{log.finished && <span className="bg-stone-200 text-stone-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider" title={log.finishedDate ? t('finished_on').replace('{date}', formatDate(log.finishedDate, lang)) : undefined}>{t('finished_badge')}</span>}{log.recipe_stage && <StageBadge stage={log.recipe_stage} version={log.recipe_version} />}</div>
                    <h3 className="text-2xl font-black text-[var(--color-text)] leading-tight">{recipe?.name || '...'}{numbers.get(log.id) ? <span className="text-[var(--color-text-muted)] font-bold text-lg"> – {t('batch_label').replace('{n}', String(numbers.get(log.id)))}</span> : null}</h3>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">{t('og_label')}: <span className="text-[var(--color-text)]">{formatGravity(log.measurements.actual_og, lang, preferences.gravityUnit)}</span></span>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">{t('fg_label')}: <span className="text-[var(--color-text)]">{formatGravity(log.measurements.actual_fg, lang, preferences.gravityUnit)}</span></span>
                      <span className="text-[10px] font-bold text-[var(--color-accent-dark)] uppercase">{t('abv_label')}: {abv}%</span>
                      {log.status === 'bottled' && <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">{t('bottled_label')}: {log.bottling?.date ? formatDate(log.bottling.date, lang) : '-'}</span>}
                    </div>
                    {notes.length > 0 && (
                      <button type="button" onClick={() => onViewNotes(log.id)} className="text-xs font-bold text-[var(--color-accent-dark)] hover:underline text-left">
                        <i className="fas fa-star mr-1" aria-hidden="true"></i>
                        {t('notes_on_brew')
                          .replace('{count}', notes.length === 1 ? t('tastings_one') : t('tastings_count').replace('{n}', String(notes.length)))
                          .replace('{score}', (averageOverall(notes) ?? 0).toLocaleString(lang))}
                        {' · '}{t('view_tasting_notes')}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    {canManageBrews && <button onClick={() => onEditLog(log.id)} className="flex-1 md:flex-none px-6 py-3 bg-[var(--color-text)] text-white rounded-[var(--radius-sm)] font-bold text-xs hover:opacity-90 transition-opacity uppercase">{log.status === 'bottled' ? t('brew_view_btn') : t('brew_update_btn')}</button>}
                    {onPrintReport && <button onClick={() => onPrintReport(log)} className="flex-1 md:flex-none px-4 py-3 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] font-bold text-xs hover:bg-[var(--color-bg-hover)] transition-all uppercase" title={t('print_report')}><i className="fas fa-print"></i></button>}
                    {log.status === 'bottled' && canManageBrews && <button type="button" onClick={() => onToggleFinished(log.id)} title={t('mark_finished_title')} className="flex-1 md:flex-none px-4 py-3 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] font-bold text-xs hover:bg-[var(--color-bg-hover)] transition-all uppercase"><i className={`fas ${log.finished ? 'fa-rotate-left' : 'fa-wine-bottle'} mr-1`} aria-hidden="true"></i>{log.finished ? t('mark_not_finished') : t('mark_finished')}</button>}
                    {log.status === 'bottled' && !log.finished && canAddNotes && <button onClick={() => onAddTasting(log.id)} className="flex-1 md:flex-none px-6 py-3 bg-[var(--color-accent)] text-white rounded-[var(--radius-sm)] font-bold text-xs uppercase shadow-sm hover:opacity-90 transition-opacity">{t('review_btn')}</button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BrewLogView;
