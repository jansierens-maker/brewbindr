
import React, { useState } from 'react';
import { BrewLogEntry, Recipe, TastingNote } from '../types';
import { getSRMColor, calculateABV } from '../services/calculations';
import { useTranslation } from '../App';

interface BrewHistoryProps {
  logs: BrewLogEntry[];
  recipes: Recipe[];
  tastingNotes: TastingNote[];
  onEditLog: (logId: string) => void;
  onAddTasting: (logId: string) => void;
  onPrintReport?: (log: BrewLogEntry) => void;
}

const BrewHistory: React.FC<BrewHistoryProps> = ({ logs, recipes, tastingNotes, onEditLog, onAddTasting, onPrintReport }) => {
  const { t } = useTranslation();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-20 text-center border border-stone-200 shadow-sm">
        <i className="fas fa-history text-6xl text-stone-100 mb-6"></i>
        <h3 className="text-2xl font-bold text-stone-800">{t('no_brews')}</h3>
      </div>
    );
  }

  const getStatusBadge = (status: BrewLogEntry['status']) => {
    const labels = { brewing: 'status_brewing', fermenting: 'status_fermenting', lagering: 'status_lagering', bottled: 'status_bottled' };
    const colors = { brewing: 'bg-blue-100 text-blue-700', fermenting: 'bg-amber-100 text-amber-700', lagering: 'bg-indigo-100 text-indigo-700', bottled: 'bg-green-100 text-green-700' };
    return <span className={`${colors[status]} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider`}>{t(labels[status] as any)}</span>;
  };

  const renderRatingStars = (value: number) => (
    <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <i key={s} className={`fas fa-star text-[8px] ${s <= value ? 'text-amber-500' : 'text-stone-200'}`}></i>)}</div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h2 className="text-4xl font-black text-stone-900">{t('history_title')}</h2>
        <p className="text-stone-500 font-medium mt-1">{t('history_subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-6">
        {sortedLogs.map(log => {
          const recipe = recipes.find(r => r.id === log.recipeId);
          const notes = tastingNotes.filter(n => n.brewLogId === log.id);
          const isExpanded = expandedLogId === log.id;
          
          // Use projected ABV logic if not bottled but measurements are there
          const abvValue = calculateABV(
            log.measurements.actual_og, 
            log.measurements.actual_fg, 
            log.status === 'bottled', 
            log.bottling?.sugar_amount, 
            log.bottling?.bottling_volume || log.measurements.actual_volume
          );
          const abv = abvValue > 0 ? abvValue.toFixed(1) : '?';

          return (
            <div key={log.id} className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col relative group">
              <div className="flex flex-col md:flex-row">
                <div className="w-full md:w-3 h-3 md:h-auto transition-all" style={{ backgroundColor: getSRMColor(recipe?.specifications?.color?.value || 0) }}></div>
                <div className="flex-1 p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3"><span className="text-xs font-black text-stone-400 uppercase tracking-tighter">{log.brewDate || log.date}</span>{getStatusBadge(log.status)}</div>
                    <h3 className="text-2xl font-black text-stone-900 leading-tight">{recipe?.name || '...'}</h3>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <span className="text-[10px] font-bold text-stone-400 uppercase">{t('og_label')}: <span className="text-stone-900">{log.measurements.actual_og?.toFixed(3) || '-'}</span></span>
                      <span className="text-[10px] font-bold text-stone-400 uppercase">{t('fg_label')}: <span className="text-stone-900">{log.measurements.actual_fg?.toFixed(3) || '-'}</span></span>
                      <span className="text-[10px] font-bold text-amber-600 uppercase">{t('abv_label')}: {abv}%</span>
                      {log.status === 'bottled' && <span className="text-[10px] font-bold text-stone-400 uppercase">{t('bottled_label')}: {log.bottling?.date || '-'}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <button onClick={() => onEditLog(log.id)} className="flex-1 md:flex-none px-6 py-3 bg-stone-900 text-white rounded-xl font-bold text-xs hover:bg-black uppercase">{log.status === 'bottled' ? 'View' : 'Update'}</button>
                    {onPrintReport && <button onClick={() => onPrintReport(log)} className="flex-1 md:flex-none px-4 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold text-xs hover:bg-stone-200 transition-all uppercase" title={t('print_report')}><i className="fas fa-print"></i></button>}
                    {log.status === 'bottled' && <button onClick={() => onAddTasting(log.id)} className="flex-1 md:flex-none px-6 py-3 bg-amber-500 text-white rounded-xl font-bold text-xs uppercase shadow-sm">Review</button>}
                  </div>
                </div>
                {notes.length > 0 && (
                  <button onClick={() => setExpandedLogId(isExpanded ? null : log.id)} className={`absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all flex items-center gap-2 ${isExpanded ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'}`}>
                    <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-star'}`}></i> {notes.length} {notes.length === 1 ? t('review') : t('reviews')}
                  </button>
                )}
              </div>
              {isExpanded && (
                <div className="border-t border-stone-100 bg-stone-50/50 p-8 space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {notes.map(note => (
                      <div key={note.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
                        <div className="flex justify-between items-start"><span className="text-[10px] font-black text-stone-400 uppercase">{note.date}</span><p className="text-lg font-black text-amber-600">{note.overall}/5</p></div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-bold text-stone-500 py-3 border-y border-stone-50">
                          <div className="flex justify-between">{t('appearance')} {renderRatingStars(note.appearance)}</div>
                          <div className="flex justify-between">{t('aroma')} {renderRatingStars(note.aroma)}</div>
                          <div className="flex justify-between">{t('flavor')} {renderRatingStars(note.flavor)}</div>
                          <div className="flex justify-between">{t('mouthfeel')} {renderRatingStars(note.mouthfeel)}</div>
                        </div>
                        <p className="text-sm text-stone-600 italic">"{note.comments}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BrewHistory;
