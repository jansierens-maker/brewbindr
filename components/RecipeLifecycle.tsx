import React, { useState } from 'react';
import { useTranslation } from '../App';
import type { Recipe } from '../types';
import { RecipeStage, TRANSITIONS, NOTE_REQUIRED, stageOf, versionOf } from '../services/lifecycle';
import { formatDate } from '../services/tasting';

const STAGE_STYLE: Record<RecipeStage, { icon: string; cls: string }> = {
  idea: { icon: 'fa-lightbulb', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  lab: { icon: 'fa-flask', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  pilot: { icon: 'fa-vial', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  production: { icon: 'fa-industry', cls: 'bg-green-50 text-green-700 border-green-200' },
  paused: { icon: 'fa-pause', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  rejected: { icon: 'fa-ban', cls: 'bg-red-50 text-red-700 border-red-200' },
  retired: { icon: 'fa-box-archive', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
};

/** The lifecycle stage as a small badge (icon and word, so not by colour alone). */
export const StageBadge: React.FC<{ stage: RecipeStage; version?: number }> = ({ stage, version }) => {
  const { t } = useTranslation();
  const s = STAGE_STYLE[stage];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${s.cls}`}>
      <i className={`fas ${s.icon}`} aria-hidden="true"></i>
      {t(`lc_stage_${stage}` as any)}
      {version && version > 1 ? <span className="normal-case">· v{version}</span> : null}
    </span>
  );
};

interface PanelProps {
  recipe: Recipe;
  canChange: boolean;
  onChangeStage: (recipeId: string, to: RecipeStage, note?: string) => Promise<boolean>;
  nameOf?: (userId: string) => string;
}

/** Lifecycle of a stored recipe in the editor: its stage, the next stages and the history. */
export const LifecyclePanel: React.FC<PanelProps> = ({ recipe, canChange, onChangeStage, nameOf }) => {
  const { t, lang } = useTranslation();
  const tr = (k: string) => t(k as any);
  const stage = stageOf(recipe);
  const [target, setTarget] = useState<RecipeStage | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const needsNote = !!target && NOTE_REQUIRED.includes(target);
  const history = [...(recipe.lifecycle?.history ?? [])].reverse();

  const confirmMove = async () => {
    if (!target || !recipe.id) return;
    const moving = target;
    setBusy(true);
    setTarget(null);
    setNote('');
    const ok = await onChangeStage(recipe.id, moving, note);
    setBusy(false);
    // Failed: open the form again with the note
    if (!ok) { setTarget(moving); setNote(note); }
  };

  return (
    <section aria-labelledby="lifecycle-title" className="p-5 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h4 id="lifecycle-title" className="font-bold uppercase text-stone-900 text-sm"><i className="fas fa-route text-amber-700 mr-1" aria-hidden="true"></i> {tr('lc_title')}</h4>
          <StageBadge stage={stage} version={versionOf(recipe)} />
        </div>
        {canChange && (
          <div className="flex flex-wrap gap-2">
            {TRANSITIONS[stage].map(to => (
              <button key={to} type="button" disabled={busy} onClick={() => { setTarget(to); setNote(''); }} aria-pressed={target === to}
                className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${target === to ? 'border-amber-500 bg-amber-50 text-stone-900' : 'border-stone-200 bg-white text-stone-600 hover:text-stone-900'}`}>
                {tr('lc_move_to').replace('{stage}', tr(`lc_stage_${to}`))}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-stone-500">{tr(`lc_desc_${stage}`)}</p>

      {target && (
        <div className="space-y-2">
          <label htmlFor="lifecycle-note" className="block text-[10px] font-black uppercase tracking-widest text-stone-400">
            {tr(needsNote ? 'lc_note_required' : 'lc_note_optional')}
          </label>
          <textarea id="lifecycle-note" name="lifecycle_note" value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2}
            className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm" placeholder={tr(`lc_note_placeholder_${needsNote ? target : 'other'}`)} />
          <div className="flex gap-2">
            <button type="button" onClick={confirmMove} disabled={busy || (needsNote && !note.trim())}
              className="px-4 py-2 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
              {tr('lc_move_to').replace('{stage}', tr(`lc_stage_${target}`))}
            </button>
            <button type="button" onClick={() => setTarget(null)} className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-stone-600 text-[10px] font-black uppercase tracking-widest">{tr('cancel_btn')}</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-stone-400">{tr('lc_history')} ({history.length})</summary>
          <ol className="mt-2 space-y-1.5 text-xs text-stone-600">
            {history.map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-stone-400">{formatDate(h.at.slice(0, 10), lang)}</span>
                <span className="font-bold text-stone-800">{tr(`lc_stage_${h.stage}`)}</span>
                {h.by && nameOf && <span>· {nameOf(h.by)}</span>}
                {h.note && <span className="italic">— {h.note}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
};
