import React, { useState } from 'react';
import { BrewLogEntry, Recipe, TastingNote } from '../types';
import { GeminiService } from '../services/geminiService';
import { useTranslation } from '../App';
import { ageAtTasting, ageLabel, formatDate } from '../services/tasting';

interface TastingNotesProps {
  recipe: Recipe;
  brewLog: BrewLogEntry;
  batchNumber?: number;
  /** Name of the signed-in member, shown as "Me (name)" */
  myName: string;
  /** An existing note to edit; a new note is started when absent */
  initialNote?: TastingNote;
  onSave: (note: TastingNote) => void;
  onCancel: () => void;
}

const RatingField: React.FC<{ label: string, value: number, onChange: (val: number) => void }> = ({ label, value, onChange }) => (
  <div className="flex justify-between items-center" role="group" aria-label={label}>
    <span className="font-semibold text-stone-700" aria-hidden="true">{label}</span>
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} / 5`}
          aria-pressed={value === n}
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold transition-all ${value >= n ? 'bg-amber-500 text-white shadow-md' : 'bg-stone-100 text-stone-400'}`}
        >
          {n}
        </button>
      ))}
    </div>
  </div>
);

const today = () => new Date().toISOString().split('T')[0];

const TastingNotes: React.FC<TastingNotesProps> = ({ recipe, brewLog, batchNumber, myName, initialNote, onSave, onCancel }) => {
  const { t, lang } = useTranslation();
  const [note, setNote] = useState<TastingNote>(() => initialNote ?? {
    id: crypto.randomUUID(),
    recipeId: recipe.id || '',
    brewLogId: brewLog.id,
    date: today(),
    appearance: 0,
    aroma: 0,
    flavor: 0,
    mouthfeel: 0,
    overall: 0,
    comments: ''
  });
  const [forGuest, setForGuest] = useState(!!initialNote?.guest_name);
  const [analyzing, setAnalyzing] = useState(false);
  const [gemini] = useState(() => new GeminiService());

  const handleAnalyze = async () => {
    if (!note.comments) return;
    setAnalyzing(true);
    try {
      const feedback = await gemini.analyzeTasting(recipe, note.comments);
      setNote(prev => ({ ...prev, ai_feedback: feedback }));
    } catch (error: any) {
      console.error(error?.message);
      if (error?.code === 'AI_DAILY_LIMIT') alert(t('ai_daily_limit' as any));
    } finally {
      setAnalyzing(false);
    }
  };

  const guestName = (note.guest_name || '').trim();
  const canSave = !!note.date && (!forGuest || guestName.length > 0);

  const handleSave = () => {
    if (!canSave) return;
    const { guest_name, ...rest } = note;
    onSave(forGuest ? { ...rest, guest_name: guestName } : rest);
  };

  const age = ageLabel(ageAtTasting(note, brewLog), t);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
        <h2 className="text-3xl font-bold">
          {initialNote ? t('edit_tasting') : t('tasting_notes')}: <span className="text-amber-800">{recipe.name}</span>
        </h2>
        <p className="text-sm text-stone-500 mt-2 mb-6">
          {batchNumber ? <b className="text-stone-700">{t('batch_label').replace('{n}', String(batchNumber))}</b> : null}
          {batchNumber ? ' · ' : ''}
          {t('brewed_on').replace('{date}', formatDate(brewLog.brewDate || brewLog.date, lang))}
          {' · '}
          {brewLog.bottling?.date ? t('bottled_on').replace('{date}', formatDate(brewLog.bottling.date, lang)) : t('not_bottled_yet')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 p-5 bg-stone-50 rounded-xl border border-stone-100">
          <div className="space-y-1">
            <label htmlFor="tasting-date" className="text-[10px] font-black text-stone-500 uppercase tracking-widest">{t('tasting_date')}</label>
            <input
              id="tasting-date"
              name="tasting_date"
              type="date"
              max={today()}
              maxLength={10}
              required
              value={note.date}
              onChange={(e) => setNote({ ...note, date: e.target.value })}
              className="w-full p-3 bg-white border border-stone-200 rounded-xl font-bold text-stone-900"
            />
            {age && <p className="text-xs text-stone-500">{age}</p>}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">{t('taster_label')}</legend>
            <label htmlFor="taster-me" className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <input id="taster-me" name="taster" type="radio" checked={!forGuest} onChange={() => setForGuest(false)} />
              {t('taster_me').replace('{name}', myName)}
            </label>
            <label htmlFor="taster-guest" className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <input id="taster-guest" name="taster" type="radio" checked={forGuest} onChange={() => setForGuest(true)} />
              {t('taster_guest')}
            </label>
            {forGuest && (
              <div className="pl-6 space-y-1">
                <label htmlFor="guest-name" className="sr-only">{t('guest_name_label')}</label>
                <input
                  id="guest-name"
                  name="guest_name"
                  type="text"
                  maxLength={40}
                  required
                  placeholder={t('guest_name_label')}
                  value={note.guest_name || ''}
                  onChange={(e) => setNote({ ...note, guest_name: e.target.value })}
                  className="w-full p-3 bg-white border border-stone-200 rounded-xl font-bold text-stone-900"
                />
              </div>
            )}
          </fieldset>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-6">
            <RatingField label={t('appearance')} value={note.appearance} onChange={(v) => setNote({...note, appearance: v})} />
            <RatingField label={t('aroma')} value={note.aroma} onChange={(v) => setNote({...note, aroma: v})} />
            <RatingField label={t('flavor')} value={note.flavor} onChange={(v) => setNote({...note, flavor: v})} />
            <RatingField label={t('mouthfeel')} value={note.mouthfeel} onChange={(v) => setNote({...note, mouthfeel: v})} />
            <RatingField label={t('overall')} value={note.overall} onChange={(v) => setNote({...note, overall: v})} />
          </div>

          <div className="space-y-4">
            <div className="relative">
              <label htmlFor="tasting-comments" className="sr-only">{t('notes')}</label>
              <textarea
                id="tasting-comments"
                name="comments"
                className="w-full p-4 bg-white text-stone-900 border border-stone-200 rounded-xl min-h-[200px]"
                placeholder={t('notes')}
                value={note.comments}
                onChange={(e) => setNote({...note, comments: e.target.value})}
                maxLength={2000}
              />
              <div className="absolute bottom-4 right-4 text-[10px] font-black uppercase tracking-widest text-stone-400 pointer-events-none">
                {note.comments.length}/2000
              </div>
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !note.comments}
              className="w-full bg-amber-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {analyzing ? <i className="fas fa-spinner fa-spin" aria-hidden="true"></i> : <i className="fas fa-brain" aria-hidden="true"></i>}
              {t('analyze_ai')}
            </button>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-8 py-4 rounded-xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200">{t('cancel_btn')}</button>
          <button type="button" onClick={handleSave} disabled={!canSave} className="bg-stone-900 text-white px-10 py-4 rounded-xl font-bold disabled:opacity-50">{t('save_evaluation')}</button>
        </div>
      </div>

      {note.ai_feedback && (
        <div className="bg-amber-50 p-8 rounded-2xl border border-amber-200 animate-in zoom-in-95">
          <div className="flex items-center gap-3 mb-4 text-amber-800">
            <i className="fas fa-glass-cheers text-2xl" aria-hidden="true"></i>
            <h3 className="text-xl font-bold">{t('cicerone_analysis')}</h3>
          </div>
          <div className="prose prose-stone text-stone-800 whitespace-pre-wrap">{note.ai_feedback}</div>
        </div>
      )}
    </div>
  );
};

export default TastingNotes;
