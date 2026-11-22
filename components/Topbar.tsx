import React from 'react';
import { PhaseBadge } from './PhaseBadge';
import { useTranslation } from '../App';

interface TopbarProps {
  title: string;
  showNewRecipeButton: boolean;
  isGuest?: boolean;
  syncError?: boolean;
  onRefresh?: () => void;
  onShowHelp?: () => void;
  onOpenSyncDetails?: () => void;
  onNewRecipe?: () => void;
  onAuth?: () => void;
  /** Opens the search over everything (Ctrl+K) */
  onSearch?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  title,
  showNewRecipeButton,
  isGuest,
  syncError,
  onRefresh,
  onShowHelp,
  onOpenSyncDetails,
  onNewRecipe,
  onAuth,
  onSearch
}) => {
  const { t } = useTranslation();
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  return (
    <header className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-4 md:px-7 h-[var(--topbar-h)] flex items-center gap-2 md:gap-3.5 sticky top-0 z-50 shadow-sm md:shadow-none">
      <h2 className="font-[var(--font-display)] text-lg md:text-xl font-bold flex-1 text-[var(--color-text)] truncate">
        {title}
      </h2>
      {/* On phones the sidebar with the logo is hidden: show the phase here */}
      <PhaseBadge phase="beta" className="lg:hidden" />

      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Status Indicator & Refresh */}
        <div className="flex items-center bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-[4px_8px] md:p-[6px_12px] gap-2">
          {/* The admin goes to the connection details under Beheer; others only see the state */}
          {onOpenSyncDetails ? (
            <button
              type="button"
              onClick={onOpenSyncDetails}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              title={t('sync_details')}
            >
            <div className={`w-2 h-2 rounded-full ${syncError ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span className={`hidden sm:inline text-[10px] md:text-[11px] font-black uppercase tracking-widest ${syncError ? 'text-red-600' : 'text-green-600'}`}>
              {syncError ? t('cloud_unavailable') : t('cloud_sync')}
            </span>
          </button>
          ) : (
            <span className="flex items-center gap-1.5" role="status" title={syncError ? t('cloud_unavailable') : t('cloud_sync')}>
            <div className={`w-2 h-2 rounded-full ${syncError ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span className={`hidden sm:inline text-[10px] md:text-[11px] font-black uppercase tracking-widest ${syncError ? 'text-red-600' : 'text-green-600'}`}>
              {syncError ? t('cloud_unavailable') : t('cloud_sync')}
            </span>
          </span>
          )}

          <div className="w-px h-3 bg-[var(--color-border-strong)] hidden sm:block"></div>

          <button
            onClick={onRefresh}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-0.5"
            title={t('refresh_data')}
            aria-label={t('refresh_data')}
          >
            <i className="fas fa-sync-alt text-[10px] md:text-xs"></i>
          </button>
        </div>

        {onSearch && (
          <button type="button" onClick={onSearch} aria-label={t('global_search_title')} title={`${t('global_search_title')} (${shortcut})`}
            className="w-8 h-8 md:w-auto md:h-9 md:px-3 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] md:border md:border-[var(--color-border)] transition-all">
            <i className="fas fa-search text-sm" aria-hidden="true"></i>
            <span className="hidden md:inline text-xs font-semibold">{t('global_search_short')}</span>
            <kbd className="hidden lg:inline text-[10px] font-bold text-[var(--color-text-xmuted)] border border-[var(--color-border)] rounded px-1">{shortcut}</kbd>
          </button>
        )}

        {/* Help Button */}
        <button
          onClick={onShowHelp}
          className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-all"
          title={t('help_title')}
        >
          <i className="fas fa-question-circle text-sm md:text-base"></i>
        </button>

        {/* Auth/New Recipe Button */}
        {isGuest ? (
          <button
            onClick={onAuth}
            className="bg-[var(--color-accent)] text-white flex items-center gap-1.5 p-[6px_12px] md:p-[7px_14px] rounded-[var(--radius-sm)] text-[12px] md:text-[13px] font-bold hover:opacity-90 transition-all shadow-sm active:scale-95"
          >
            <i className="fas fa-user text-[10px] md:text-xs"></i>
            <span>{t('sign_in_nav_label')}</span>
          </button>
        ) : (
          showNewRecipeButton && (
            <button
              onClick={onNewRecipe}
              className="bg-[var(--color-text)] text-white flex items-center gap-1.5 p-[6px_12px] md:p-[7px_14px] rounded-[var(--radius-sm)] text-[12px] md:text-[13px] font-semibold hover:bg-[#1e3251] transition-all shadow-sm active:scale-95"
            >
              <i className="fas fa-plus text-[10px] md:text-xs"></i>
              <span className="hidden xs:inline">{t('nav_new')}</span>
            </button>
          )
        )}
      </div>
    </header>
  );
};
