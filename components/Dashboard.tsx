import React, { useMemo, useState } from 'react';
import { BrewLogEntry, Recipe } from '../types';
import { useTranslation } from '../App';
import { getSRMColor } from '../services/calculations';
import { BREW_PHASES, BrewPhase, brewsInPhase, daysInPhase } from '../services/brewPhases';

interface Props {
  recipes: Recipe[];
  /** The brewery's own recipes */
  recipeCount: number;
  brewLogs: BrewLogEntry[];
  tastingNoteCount: number;
  teamCount: number;
  bottledPeriod: string | undefined;
  canManageBrews: boolean;
  onNavigate: (view: 'recipes' | 'proefnotities' | 'team' | 'brouwlogboek') => void;
  onOpenBrew: (log: BrewLogEntry, recipe: Recipe | undefined) => void;
}

const PHASE_ICON: Record<BrewPhase, string> = {
  brewing: 'fa-fire-alt', fermenting: 'fa-temperature-low', lagering: 'fa-snowflake', bottled: 'fa-box-open',
};
const PHASE_TAB = { brewing: 'tab_brewing', fermenting: 'tab_fermenting', lagering: 'tab_lagering', bottled: 'tab_bottled' } as const;

/** The brewery at a glance: counts, and the brews per phase (moved from Recipes). */
const Dashboard: React.FC<Props> = ({ recipes, recipeCount, brewLogs, tastingNoteCount, teamCount, bottledPeriod, canManageBrews, onNavigate, onOpenBrew }) => {
  const { t } = useTranslation();
  const phases = useMemo(() => {
    const now = new Date();
    return Object.fromEntries(BREW_PHASES.map(p => [p, brewsInPhase(brewLogs, p, bottledPeriod, now)])) as Record<BrewPhase, BrewLogEntry[]>;
  }, [brewLogs, bottledPeriod]);
  const [tab, setTab] = useState<BrewPhase>(() => BREW_PHASES.find(p => phases[p].length > 0) ?? 'brewing');
  const recipeOf = (log: BrewLogEntry) => recipes.find(r => r.id === log.recipeId);
  const active = BREW_PHASES.filter(p => phases[p].length > 0);

  const tile = 'bg-[var(--color-bg)] p-5 rounded-[var(--radius)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] text-left hover:border-[var(--color-accent)] transition-colors group';
  const tileHead = (icon: string, label: string) => (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-subtle)] flex items-center justify-center text-[var(--color-accent)] text-xs group-hover:bg-[var(--color-accent)] group-hover:text-white transition-colors">
        <i className={`fas ${icon}`} aria-hidden="true"></i>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-xmuted)] group-hover:text-[var(--color-text)] transition-colors">{label}</span>
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-xmuted)] mb-1">{t('nav_section_brewery')}</p>
        <h2 className="text-4xl font-black text-[var(--color-text)] font-[var(--font-display)]">{t('nav_dashboard')}</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: t('stat_recipes'), value: recipeCount, icon: 'fa-flask', view: 'recipes' },
          { label: t('stat_notes'), value: tastingNoteCount, icon: 'fa-star', view: 'proefnotities' },
          { label: t('stat_team'), value: teamCount, icon: 'fa-users', view: 'team' },
        ] as const).map(s => (
          <button key={s.view} type="button" onClick={() => onNavigate(s.view)} className={tile}>
            {tileHead(s.icon, s.label)}
            <p className="text-2xl font-black text-[var(--color-text)]">{s.value}</p>
          </button>
        ))}
        {active.length === 0 ? (
          <button type="button" onClick={() => onNavigate('brouwlogboek')} className={tile}>
            {tileHead('fa-history', t('stat_brews_alt'))}
            <p className="text-2xl font-black text-[var(--color-text)]">{brewLogs.length}</p>
          </button>
        ) : active.map(p => (
          <button key={p} type="button" onClick={() => setTab(p)} aria-controls="dashboard-brews" className={`${tile} flex flex-col justify-between`}>
            <div>
              {tileHead(PHASE_ICON[p], t(PHASE_TAB[p]))}
              <p className="text-2xl font-black text-[var(--color-text)]">{phases[p].length}</p>
            </div>
            <div className="mt-4 hidden md:block space-y-1">
              {phases[p].slice(0, 3).map(log => (
                <p key={log.id} className="text-[9px] font-bold text-[var(--color-text-muted)] truncate">
                  • {recipeOf(log)?.name || t('unknown_recipe')} ({daysInPhase(log)} {t('days_label')})
                </p>
              ))}
              {phases[p].length > 3 && (
                <p className="text-[9px] font-black text-[var(--color-accent)] uppercase tracking-widest mt-1">+ {phases[p].length - 3} {t('more_label')}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-8">
        <div role="tablist" aria-label={t('nav_brews')} className="flex border-b border-[var(--color-border)] gap-8 overflow-x-auto custom-scrollbar">
          {BREW_PHASES.map(p => (
            <button key={p} type="button" role="tab" id={`dashboard-tab-${p}`} aria-selected={tab === p} aria-controls="dashboard-brews" onClick={() => setTab(p)}
              className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${tab === p ? 'text-[var(--color-text)]' : 'text-[var(--color-text-xmuted)] hover:text-[var(--color-text-muted)]'}`}>
              {t(PHASE_TAB[p])} {phases[p].length > 0 ? `(${phases[p].length})` : ''}
              {tab === p && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-accent)] rounded-t-full"></div>}
            </button>
          ))}
        </div>

        <div id="dashboard-brews" role="tabpanel" aria-labelledby={`dashboard-tab-${tab}`} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {phases[tab].map(log => {
            const recipe = recipeOf(log);
            return (
              <div key={log.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow)] transition-all flex flex-col relative pt-8 p-6 group">
                <div className="absolute top-0 left-0 right-0 h-[5px]" style={{ backgroundColor: getSRMColor(recipe?.specifications?.color?.value || 0) }}></div>
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-[var(--color-text-xmuted)] uppercase tracking-widest">{log.brewDate || log.date}</p>
                    <h3 className="text-xl font-bold text-[var(--color-text)] leading-tight">{recipe?.name || t('unknown_recipe')}</h3>
                  </div>
                  <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black uppercase tracking-wider">{t(`status_${log.status}` as const)}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6 flex-1">
                  <div className="bg-stone-50 rounded-xl p-2 text-center">
                    <p className="text-[8px] font-black text-stone-400 uppercase">OG</p>
                    <p className="font-bold text-xs">{log.measurements.actual_og?.toFixed(3) || '-'}</p>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-2 text-center">
                    <p className="text-[8px] font-black text-stone-400 uppercase">FG</p>
                    <p className="font-bold text-xs">{log.measurements.actual_fg?.toFixed(3) || '-'}</p>
                  </div>
                </div>
                {canManageBrews && (
                  <button type="button" onClick={() => onOpenBrew(log, recipe)} className="w-full bg-[var(--color-text)] text-white text-xs font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg">
                    {log.status === 'bottled' ? t('view_btn') : t('update_btn')}
                  </button>
                )}
              </div>
            );
          })}
          {phases[tab].length === 0 && (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-stone-200 px-6 shadow-sm">
              <i className="fas fa-history text-5xl text-amber-100 mb-6 block" aria-hidden="true"></i>
              <p className="text-stone-400 font-bold max-w-sm mx-auto">{t('no_brews_with_status')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
