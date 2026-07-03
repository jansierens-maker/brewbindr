
import React, { useState } from 'react';
import { BrewLogEntry, Recipe, TastingNote } from '../types';
import { getSRMColor, calculateABV } from '../services/calculations';
import { useTranslation } from '../App';

interface BrewLogViewProps {
  logs: BrewLogEntry[];
  recipes: Recipe[];
  tastingNotes: TastingNote[];
  onEditLog: (logId: string) => void;
  onAddTasting: (logId: string) => void;
  onPrintReport?: (log: BrewLogEntry) => void;
}

const BrewLogView: React.FC<BrewLogViewProps> = ({ logs, recipes, tastingNotes, onEditLog, onAddTasting, onPrintReport }) => {
  const { t } = useTranslation();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
      <div className="grid grid-cols-1 gap-6">
        {sortedLogs.map(log => {
          const recipe = recipes.find(r => r.id === log.recipeId);
          const notes = tastingNotes.filter(n => n.brewLogId === log.id);
          const isExpanded = expandedLogId === log.id;

          const abvValue = calculateABV(
            log.measurements.actual_og,
            log.measurements.actual_fg,
            log.status === 'bottled',
            log.bottling?.sugar_amount,
            log.bottling?.bottling_volume || log.measurements.actual_volume
          );
          const abv = abvValue > 0 ? abvValue.toFixed(1) : '?';

          return (
            <div key={log.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow)] transition-all flex flex-col relative group">
              <div className="flex flex-col md:flex-row">
                <div className="w-full md:w-3 h-3 md:h-auto transition-all" style={{ backgroundColor: getSRMColor(recipe?.specifications?.color?.value || 0) }}></div>
                <div className="flex-1 p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3"><span className="text-xs font-black text-[var(--color-text-xmuted)] uppercase tracking-tighter">{log.brewDate || log.date}</span>{getStatusBadge(log.status)}</div>
                    <h3 className="text-2xl font-black text-[var(--color-text)] leading-tight">{recipe?.name || '...'}</h3>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">{t('og_label')}: <span className="text-[var(--color-text)]">{log.measurements.actual_og?.toFixed(3) || '-'}</span></span>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">{t('fg_label')}: <span className="text-[var(--color-text)]">{log.measurements.actual_fg?.toFixed(3) || '-'}</span></span>
                      <span className="text-[10px] font-bold text-[var(--color-accent-dark)] uppercase">{t('abv_label')}: {abv}%</span>
                      {log.status === 'bottled' && <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">{t('bottled_label')}: {log.bottling?.date || '-'}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <button onClick={() => onEditLog(log.id)} className="flex-1 md:flex-none px-6 py-3 bg-[var(--color-text)] text-white rounded-[var(--radius-sm)] font-bold text-xs hover:opacity-90 transition-opacity uppercase">{log.status === 'bottled' ? 'View' : 'Update'}</button>
                    {onPrintReport && <button onClick={() => onPrintReport(log)} className="flex-1 md:flex-none px-4 py-3 bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] font-bold text-xs hover:bg-[var(--color-bg-hover)] transition-all uppercase" title={t('print_report')}><i className="fas fa-print"></i></button>}
                    {log.status === 'bottled' && <button onClick={() => onAddTasting(log.id)} className="flex-1 md:flex-none px-6 py-3 bg-[var(--color-accent)] text-white rounded-[var(--radius-sm)] font-bold text-xs uppercase shadow-sm hover:opacity-90 transition-opacity">Review</button>}
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
