
import React from 'react';
import { BrewLogEntry, Recipe, TastingNote } from '../types';
import { getSRMColor } from '../services/calculations';
import { useTranslation } from '../App';

interface TastingNotesViewProps {
  logs: BrewLogEntry[];
  recipes: Recipe[];
  tastingNotes: TastingNote[];
  onAddTasting: (logId: string) => void;
}

const TastingNotesView: React.FC<TastingNotesViewProps> = ({ logs, recipes, tastingNotes, onAddTasting }) => {
  const { t } = useTranslation();
  const sortedNotes = [...tastingNotes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (tastingNotes.length === 0) {
    return (
      <div className="bg-[var(--color-bg)] rounded-[var(--radius)] p-20 text-center border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
        <i className="fas fa-star text-6xl text-[var(--color-text-xmuted)] opacity-20 mb-6"></i>
        <h3 className="text-2xl font-[var(--font-display)] font-bold text-[var(--color-text)]">{t('no_notes_found')}</h3>
        <p className="text-[var(--color-text-muted)] mt-2">{t('no_notes_desc')}</p>
      </div>
    );
  }

  const renderRatingStars = (value: number) => (
    <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <i key={s} className={`fas fa-star text-[8px] ${s <= value ? 'text-[var(--color-accent)]' : 'text-[var(--color-border-strong)]'}`}></i>)}</div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h2 className="text-4xl font-black text-[var(--color-text)] font-[var(--font-display)]">{t('stat_notes')}</h2>
        <p className="text-[var(--color-text-muted)] font-medium mt-1">{t('notes_subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sortedNotes.map(note => {
          const log = logs.find(l => l.id === note.brewLogId);
          const recipe = recipes.find(r => r.id === log?.recipeId);

          return (
            <div key={note.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow)] transition-all flex flex-col group relative">
               <div className="h-1 w-full" style={{ backgroundColor: getSRMColor(recipe?.specifications?.color?.value || 0) }}></div>
               <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{note.date}</span>
                      <h3 className="text-lg font-black text-[var(--color-text)] leading-tight mt-1">{recipe?.name || 'Onbekend Recept'}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-[var(--color-accent-dark)]">{note.overall}/5</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-bold text-[var(--color-text-muted)] py-3 border-y border-[var(--color-border)]">
                    <div className="flex justify-between">{t('appearance')} {renderRatingStars(note.appearance)}</div>
                    <div className="flex justify-between">{t('aroma')} {renderRatingStars(note.aroma)}</div>
                    <div className="flex justify-between">{t('flavor')} {renderRatingStars(note.flavor)}</div>
                    <div className="flex justify-between">{t('mouthfeel')} {renderRatingStars(note.mouthfeel)}</div>
                  </div>

                  <p className="text-sm text-[var(--color-text-muted)] italic leading-relaxed">"{note.comments}"</p>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TastingNotesView;
