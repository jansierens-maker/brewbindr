
import React, { useState } from 'react';
import { Recipe, TastingNote } from '../types';
import { GeminiService } from '../services/geminiService';
import { useTranslation } from '../App';

interface TastingNotesProps {
  recipe: Recipe;
  brewLogId: string;
  onSave: (note: TastingNote) => void;
}

const RatingField: React.FC<{ label: string, value: number, onChange: (val: number) => void }> = ({ label, value, onChange }) => (
  <div className="flex justify-between items-center">
    <span className="font-semibold text-stone-700">{label}</span>
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button 
          key={n}
          onClick={() => onChange(n)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold transition-all ${value >= n ? 'bg-amber-500 text-white shadow-md' : 'bg-stone-100 text-stone-400'}`}
        >
          {n}
        </button>
      ))}
    </div>
  </div>
);

const TastingNotes: React.FC<TastingNotesProps> = ({ recipe, brewLogId, onSave }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState<TastingNote>({
    id: Math.random().toString(36).substr(2, 9),
    recipeId: recipe.id || '',
    brewLogId,
    date: new Date().toISOString().split('T')[0],
    appearance: 0,
    aroma: 0,
    flavor: 0,
    mouthfeel: 0,
    overall: 0,
    comments: ''
  });

  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const gemini = new GeminiService();

  const handleAnalyze = async () => {
    if (!note.comments) return;
    setAnalyzing(true);
    try {
      const feedback = await gemini.analyzeTasting(recipe, note.comments);
      setAiFeedback(feedback);
    } catch (error) {
      console.error(error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
        <h2 className="text-3xl font-bold mb-6">{t('tasting_notes')}: <span className="text-amber-800">{recipe.name}</span></h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-6">
            <RatingField label={t('appearance')} value={note.appearance} onChange={(v) => setNote({...note, appearance: v})} />
            <RatingField label={t('aroma')} value={note.aroma} onChange={(v) => setNote({...note, aroma: v})} />
            <RatingField label={t('flavor')} value={note.flavor} onChange={(v) => setNote({...note, flavor: v})} />
            <RatingField label={t('mouthfeel')} value={note.mouthfeel} onChange={(v) => setNote({...note, mouthfeel: v})} />
            <RatingField label={t('overall')} value={note.overall} onChange={(v) => setNote({...note, overall: v})} />
          </div>

          <div className="space-y-4">
            <textarea 
              className="w-full p-4 bg-white text-stone-900 border border-stone-200 rounded-xl min-h-[200px]"
              placeholder="..."
              value={note.comments}
              onChange={(e) => setNote({...note, comments: e.target.value})}
            />
            <button 
              onClick={handleAnalyze}
              disabled={analyzing || !note.comments}
              className="w-full bg-amber-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
            >
              {analyzing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-brain"></i>}
              {t('analyze_ai')}
            </button>
          </div>
        </div>

        <div className="mt-10 flex justify-end">
          <button onClick={() => onSave(note)} className="bg-stone-900 text-white px-10 py-4 rounded-xl font-bold">{t('save_evaluation')}</button>
        </div>
      </div>

      {aiFeedback && (
        <div className="bg-amber-50 p-8 rounded-2xl border border-amber-200 animate-in zoom-in-95">
          <div className="flex items-center gap-3 mb-4 text-amber-800">
            <i className="fas fa-glass-cheers text-2xl"></i>
            <h3 className="text-xl font-bold">{t('cicerone_analysis')}</h3>
          </div>
          <div className="prose prose-stone text-stone-800 whitespace-pre-wrap">{aiFeedback}</div>
        </div>
      )}
    </div>
  );
};

export default TastingNotes;
