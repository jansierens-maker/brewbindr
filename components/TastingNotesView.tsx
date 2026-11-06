import React, { useMemo, useState } from 'react';
import { BrewLogEntry, Recipe, TastingNote } from '../types';
import { getSRMColor } from '../services/calculations';
import { useTranslation } from '../App';
import {
  Taster, batchNumbers, ageAtTasting, ageLabel, averageOverall, canEditNote, daysBetween, findBatches, formatDate, tasterOf,
} from '../services/tasting';

const RECENT_BATCHES = 5;
const MAX_RESULTS = 20;
const todayIso = () => new Date().toISOString().slice(0, 10);

interface TastingNotesViewProps {
  logs: BrewLogEntry[];
  recipes: Recipe[];
  tastingNotes: TastingNote[];
  members: Taster[];
  /** Who is looking, to decide which notes they may change */
  editContext: { userId?: string; breweryId?: string | null; breweryRole?: string | null; isAdmin?: boolean };
  /** Show only this batch at first (e.g. coming from a brew) */
  initialBatch?: string;
  canAdd: boolean;
  onAddTasting: (logId: string) => void;
  onEditNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
}

type SortKey = 'newest' | 'oldest' | 'score';

const Stars: React.FC<{ value: number }> = ({ value }) => (
  <div className="flex gap-0.5" aria-label={`${value}/5`}>
    {[1, 2, 3, 4, 5].map(s => <i key={s} aria-hidden="true" className={`fas fa-star text-[8px] ${s <= value ? 'text-[var(--color-accent)]' : 'text-[var(--color-border-strong)]'}`}></i>)}
  </div>
);

/** Overall score against age in days after bottling, for one batch. */
const Trend: React.FC<{ points: { age: number; score: number }[]; label: string }> = ({ points, label }) => {
  if (new Set(points.map(p => p.age)).size < 2) return null;
  const w = 140, h = 40, pad = 4;
  const ages = points.map(p => p.age);
  const min = Math.min(...ages), max = Math.max(...ages);
  const x = (a: number) => pad + (max === min ? (w - 2 * pad) / 2 : ((a - min) / (max - min)) * (w - 2 * pad));
  const y = (s: number) => h - pad - ((s - 1) / 4) * (h - 2 * pad);
  const sorted = [...points].sort((a, b) => a.age - b.age);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      <line x1={pad} x2={w - pad} y1={y(3)} y2={y(3)} stroke="var(--color-border)" strokeDasharray="2 3" />
      <polyline fill="none" stroke="var(--color-accent)" strokeWidth="2" points={sorted.map(p => `${x(p.age)},${y(p.score)}`).join(' ')} />
      {sorted.map((p, i) => <circle key={i} cx={x(p.age)} cy={y(p.score)} r="2.5" fill="var(--color-accent-dark)" />)}
    </svg>
  );
};

const selectClass = 'w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-semibold text-[var(--color-text)]';
const labelClass = 'text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest';

const TastingNotesView: React.FC<TastingNotesViewProps> = ({
  logs, recipes, tastingNotes, members, editContext, initialBatch, canAdd, onAddTasting, onEditNote, onDeleteNote,
}) => {
  const { t, lang } = useTranslation();
  const [taster, setTaster] = useState('');
  const [recipeFilter, setRecipeFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState(initialBatch || '');
  const [sort, setSort] = useState<SortKey>('newest');
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState('');
  const [includeFinished, setIncludeFinished] = useState(false);
  const [openAi, setOpenAi] = useState<Record<string, boolean>>({});

  const numbers = useMemo(() => batchNumbers(logs), [logs]);
  const logById = useMemo(() => new Map(logs.map(l => [l.id, l])), [logs]);
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);

  const batchName = (log?: BrewLogEntry) => {
    if (!log) return t('unknown_recipe');
    const name = recipeById.get(log.recipeId)?.name || t('unknown_recipe');
    const n = numbers.get(log.id);
    return n ? `${name} – ${t('batch_label').replace('{n}', String(n))}` : name;
  };

  // Filter options come from the notes, so they only offer what can be found
  const tasterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of tastingNotes) {
      const who = tasterOf(n, members);
      if (!map.has(who.key)) map.set(who.key, who.guest ? `${who.name} (${t('guest_badge')})` : who.name || t('unknown_taster'));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tastingNotes, members, t]);
  const recipeOptions = useMemo(() => {
    const ids = new Set(tastingNotes.map(n => logById.get(n.brewLogId)?.recipeId || n.recipeId));
    return [...ids].map(id => [id, recipeById.get(id)?.name || t('unknown_recipe')] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tastingNotes, logById, recipeById, t]);
  const batchOptions = useMemo(() => {
    const ids = new Set(tastingNotes.map(n => n.brewLogId));
    return [...ids]
      .filter(id => !recipeFilter || (logById.get(id)?.recipeId || '') === recipeFilter)
      .map(id => [id, batchName(logById.get(id))] as const)
      .sort((a, b) => a[1].localeCompare(b[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tastingNotes, logById, recipeFilter, numbers, recipeById]);
  const anyBottled = logs.some(l => l.status === 'bottled');
  const found = useMemo(
    () => findBatches(logs, tastingNotes, l => batchName(l), search, includeFinished),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, tastingNotes, search, includeFinished, numbers, recipeById],
  );
  const shown = found.slice(0, search.trim() ? MAX_RESULTS : RECENT_BATCHES);

  const filtered = tastingNotes.filter(n => {
    if (taster && tasterOf(n, members).key !== taster) return false;
    if (recipeFilter && (logById.get(n.brewLogId)?.recipeId || n.recipeId) !== recipeFilter) return false;
    if (batchFilter && n.brewLogId !== batchFilter) return false;
    return true;
  });

  const byNote = (a: TastingNote, b: TastingNote) =>
    sort === 'oldest' ? a.date.localeCompare(b.date)
      : sort === 'score' ? (b.overall - a.overall) || b.date.localeCompare(a.date)
      : b.date.localeCompare(a.date);

  const groups = useMemo(() => {
    const map = new Map<string, TastingNote[]>();
    for (const n of filtered) map.set(n.brewLogId, [...(map.get(n.brewLogId) || []), n]);
    const list = [...map.entries()].map(([logId, notes]) => ({ logId, notes: [...notes].sort(byNote) }));
    const latest = (g: { notes: TastingNote[] }) => g.notes.reduce((m, n) => (n.date > m ? n.date : m), '');
    const earliest = (g: { notes: TastingNote[] }) => g.notes.reduce((m, n) => (!m || n.date < m ? n.date : m), '');
    return list.sort((a, b) =>
      sort === 'oldest' ? earliest(a).localeCompare(earliest(b))
        : sort === 'score' ? (averageOverall(b.notes) ?? 0) - (averageOverall(a.notes) ?? 0)
        : latest(b).localeCompare(latest(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  const filtersActive = !!(taster || recipeFilter || batchFilter);

  const newTasting = canAdd && (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 shadow-[var(--shadow-sm)]">
      {!choosing ? (
        <button type="button" onClick={() => setChoosing(true)} className="px-6 py-3 bg-[var(--color-accent)] text-white rounded-[var(--radius-sm)] font-bold text-xs uppercase shadow-sm hover:opacity-90">
          <i className="fas fa-plus mr-2" aria-hidden="true"></i>{t('new_tasting')}
        </button>
      ) : !anyBottled ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-text-muted)]">{t('no_bottled_brews')}</p>
          <button type="button" onClick={() => setChoosing(false)} className="px-5 py-3 rounded-[var(--radius-sm)] font-bold text-xs uppercase bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">{t('cancel_btn')}</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1">
              <label htmlFor="new-tasting-search" className={labelClass}>{t('choose_batch')}</label>
              <input
                id="new-tasting-search"
                name="new_tasting_search"
                type="search"
                maxLength={60}
                autoFocus
                autoComplete="off"
                value={search}
                placeholder={t('search_batch_placeholder')}
                aria-label={t('search_batch_label')}
                onChange={(e) => setSearch(e.target.value)}
                className={selectClass}
              />
            </div>
            <button type="button" onClick={() => { setChoosing(false); setSearch(''); }} className="px-5 py-3 rounded-[var(--radius-sm)] font-bold text-xs uppercase bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]">{t('cancel_btn')}</button>
          </div>
          <label htmlFor="include-finished" className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
            <input id="include-finished" name="include_finished" type="checkbox" checked={includeFinished} onChange={(e) => setIncludeFinished(e.target.checked)} />
            {t('include_finished')}
          </label>
          {!search.trim() && shown.length > 0 && <p className={labelClass}>{t('recent_batches')}</p>}
          {shown.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('no_batches_found')}</p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {shown.map(l => {
                const own = tastingNotes.filter(n => n.brewLogId === l.id);
                const avg = averageOverall(own);
                const age = ageLabel(daysBetween(l.bottling?.date, todayIso()), t);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onAddTasting(l.id)}
                      className="w-full text-left p-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-black text-[var(--color-text)]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getSRMColor(recipeById.get(l.recipeId)?.specifications?.color?.value || 0) }} aria-hidden="true"></span>
                        {batchName(l)}
                        {l.finished && <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 text-[9px] font-black uppercase tracking-wider">{t('finished_badge')}</span>}
                      </span>
                      <span className="block text-xs text-[var(--color-text-muted)] mt-1">
                        {l.bottling?.date ? t('bottled_on').replace('{date}', formatDate(l.bottling.date, lang)) : t('not_bottled_yet')}
                        {age ? ` · ${age}` : ''}
                      </span>
                      <span className="block text-xs font-bold text-[var(--color-accent-dark)] mt-1">
                        {own.length === 0 ? t('not_tasted_yet')
                          : `${own.length === 1 ? t('tastings_one') : t('tastings_count').replace('{n}', String(own.length))}${avg !== null ? ` · ${t('average_score').replace('{score}', avg.toLocaleString(lang))}` : ''}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {found.length > shown.length && search.trim() && (
            <p className="text-xs text-[var(--color-text-muted)]">{t('more_batches').replace('{n}', String(found.length - shown.length))}</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h2 className="text-4xl font-black text-[var(--color-text)] font-[var(--font-display)]">{t('stat_notes')}</h2>
        <p className="text-[var(--color-text-muted)] font-medium mt-1">{t('notes_subtitle')}</p>
      </div>

      {newTasting}

      {tastingNotes.length === 0 ? (
        <div className="bg-[var(--color-bg)] rounded-[var(--radius)] p-20 text-center border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
          <i className="fas fa-star text-6xl text-[var(--color-text-xmuted)] opacity-20 mb-6" aria-hidden="true"></i>
          <h3 className="text-2xl font-[var(--font-display)] font-bold text-[var(--color-text)]">{t('no_notes_found')}</h3>
          <p className="text-[var(--color-text-muted)] mt-2">{t('notes_desc_new')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label htmlFor="filter-taster" className={labelClass}>{t('filter_taster')}</label>
              <select id="filter-taster" name="filter_taster" value={taster} onChange={(e) => setTaster(e.target.value)} className={selectClass}>
                <option value="">{t('filter_all')}</option>
                {tasterOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="filter-recipe" className={labelClass}>{t('filter_recipe')}</label>
              <select id="filter-recipe" name="filter_recipe" value={recipeFilter} onChange={(e) => { setRecipeFilter(e.target.value); setBatchFilter(''); }} className={selectClass}>
                <option value="">{t('filter_all')}</option>
                {recipeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="filter-batch" className={labelClass}>{t('filter_batch')}</label>
              <select id="filter-batch" name="filter_batch" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className={selectClass}>
                <option value="">{t('filter_all')}</option>
                {batchOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="sort-notes" className={labelClass}>{t('sort_label')}</label>
              <select id="sort-notes" name="sort_notes" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectClass}>
                <option value="newest">{t('sort_newest')}</option>
                <option value="oldest">{t('sort_oldest')}</option>
                <option value="score">{t('sort_score')}</option>
              </select>
            </div>
          </div>

          {groups.length === 0 && (
            <div className="text-center py-10 text-[var(--color-text-muted)]">
              <p>{t('no_notes_match')}</p>
              {filtersActive && (
                <button type="button" onClick={() => { setTaster(''); setRecipeFilter(''); setBatchFilter(''); }} className="mt-3 text-sm font-bold text-[var(--color-accent-dark)] underline">{t('clear_filters')}</button>
              )}
            </div>
          )}

          <div className="space-y-6">
            {groups.map(({ logId, notes }) => {
              const log = logById.get(logId);
              const recipe = recipeById.get(log?.recipeId || notes[0]?.recipeId || '');
              const avg = averageOverall(notes);
              const trend = notes
                .map(n => ({ age: ageAtTasting(n, log), score: n.overall }))
                .filter((p): p is { age: number; score: number } => p.age !== null && p.score > 0);
              return (
                <section key={logId} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)]" aria-labelledby={`batch-${logId}`}>
                  <div className="h-1 w-full" style={{ backgroundColor: getSRMColor(recipe?.specifications?.color?.value || 0) }}></div>
                  <header className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--color-border)]">
                    <div className="space-y-1">
                      <h3 id={`batch-${logId}`} className="text-xl font-black text-[var(--color-text)] leading-tight">{batchName(log)}</h3>
                      <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                        {log ? t('brewed_on').replace('{date}', formatDate(log.brewDate || log.date, lang)) : ''}
                        {log ? ' · ' : ''}
                        {log?.bottling?.date ? t('bottled_on').replace('{date}', formatDate(log.bottling.date, lang)) : t('not_bottled_yet')}
                      </p>
                      <p className="text-xs font-bold text-[var(--color-text)]">
                        {notes.length === 1 ? t('tastings_one') : t('tastings_count').replace('{n}', String(notes.length))}
                        {avg !== null && <> · <span className="text-[var(--color-accent-dark)]">{t('average_score').replace('{score}', avg.toLocaleString(lang))}</span></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Trend points={trend} label={t('score_trend')} />
                      {log?.finished ? (
                        <span className="px-3 py-1 rounded-full bg-stone-200 text-stone-600 text-[10px] font-black uppercase tracking-wider" title={log.finishedDate ? t('finished_on').replace('{date}', formatDate(log.finishedDate, lang)) : undefined}>{t('finished_badge')}</span>
                      ) : canAdd && log?.status === 'bottled' ? (
                        <button type="button" onClick={() => onAddTasting(log.id)} className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-[var(--radius-sm)] font-bold text-xs uppercase shadow-sm hover:opacity-90 whitespace-nowrap">
                          <i className="fas fa-plus mr-1" aria-hidden="true"></i>{t('add_tasting_btn')}
                        </button>
                      ) : null}
                    </div>
                  </header>
                  <ul className="divide-y divide-[var(--color-border)]">
                    {notes.map(note => {
                      const who = tasterOf(note, members);
                      const age = ageLabel(ageAtTasting(note, log), t);
                      const editable = canEditNote(note, editContext);
                      const aiOpen = !!openAi[note.id];
                      return (
                        <li key={note.id} className="p-6 space-y-3">
                          <div className="flex flex-wrap justify-between items-start gap-3">
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">
                                {formatDate(note.date, lang)}{age ? ` · ${age}` : ''}
                              </p>
                              <p className="text-sm font-bold text-[var(--color-text)] flex flex-wrap items-center gap-2">
                                <i className={`fas ${who.guest ? 'fa-user-tag' : 'fa-user'} text-[var(--color-text-xmuted)] text-xs`} aria-hidden="true"></i>
                                {who.name || t('unknown_taster')}
                                {who.guest && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[9px] font-black uppercase tracking-wider">{t('guest_badge')}</span>}
                                {who.guest && who.enteredBy && <span className="text-xs font-medium text-[var(--color-text-muted)]">{t('entered_by').replace('{name}', who.enteredBy)}</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="text-2xl font-black text-[var(--color-accent-dark)]">{note.overall > 0 ? `${note.overall}/5` : '–'}</p>
                              {editable && (
                                <>
                                  <button type="button" onClick={() => onEditNote(note.id)} className="w-9 h-9 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]" aria-label={t('edit_btn')} title={t('edit_btn')}>
                                    <i className="fas fa-pen text-xs" aria-hidden="true"></i>
                                  </button>
                                  <button type="button" onClick={() => onDeleteNote(note.id)} className="w-9 h-9 rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] hover:text-red-600 hover:bg-red-50" aria-label={t('delete_btn')} title={t('delete_btn')}>
                                    <i className="fas fa-trash text-xs" aria-hidden="true"></i>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-[10px] font-bold text-[var(--color-text-muted)]">
                            <div className="flex justify-between gap-2">{t('appearance')} <Stars value={note.appearance} /></div>
                            <div className="flex justify-between gap-2">{t('aroma')} <Stars value={note.aroma} /></div>
                            <div className="flex justify-between gap-2">{t('flavor')} <Stars value={note.flavor} /></div>
                            <div className="flex justify-between gap-2">{t('mouthfeel')} <Stars value={note.mouthfeel} /></div>
                          </div>
                          {note.comments && <p className="text-sm text-[var(--color-text-muted)] italic leading-relaxed">"{note.comments}"</p>}
                          {note.ai_feedback && (
                            <div>
                              <button type="button" onClick={() => setOpenAi(prev => ({ ...prev, [note.id]: !aiOpen }))} aria-expanded={aiOpen} className="text-xs font-bold text-[var(--color-accent-dark)]">
                                <i className="fas fa-brain mr-1" aria-hidden="true"></i>{aiOpen ? t('hide_ai_analysis') : t('show_ai_analysis')}
                              </button>
                              {aiOpen && <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-[var(--radius-sm)] text-sm text-stone-800 whitespace-pre-wrap">{note.ai_feedback}</div>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default TastingNotesView;
