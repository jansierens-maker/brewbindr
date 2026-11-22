import React from 'react';
import { PhaseBadge } from './PhaseBadge';
import { useTranslation } from '../App';

interface TopbarProps {
  title: string;
  isGuest?: boolean;
  onShowHelp?: () => void;
  onAuth?: () => void;
  /** Opens the search over everything (Ctrl+K) */
  onSearch?: () => void;
  /** Loading or saving failed: a small red notice that tries again when clicked */
  syncError?: boolean;
  onRetrySync?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  title,
  isGuest,
  onShowHelp,
  onAuth,
  onSearch,
  syncError,
  onRetrySync
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
        {/* Only when something is wrong: the connection to the database failed */}
        {syncError && (
          <button type="button" onClick={onRetrySync} role="alert" title={t('sync_problem_hint')} aria-label={`${t('cloud_unavailable')}: ${t('sync_problem_hint')}`}
            className="flex items-center gap-1.5 px-2 py-1 md:px-2.5 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true"></span>
            <span className="hidden sm:inline text-[10px] md:text-[11px] font-black uppercase tracking-widest">{t('cloud_unavailable')}</span>
            <i className="fas fa-rotate-right text-[10px]" aria-hidden="true"></i>
          </button>
        )}
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

        {/* Sign in (guests); a new recipe starts from the "New" tile on Recipes */}
        {isGuest && (
          <button
            onClick={onAuth}
            className="bg-[var(--color-accent)] text-white flex items-center gap-1.5 p-[6px_12px] md:p-[7px_14px] rounded-[var(--radius-sm)] text-[12px] md:text-[13px] font-bold hover:opacity-90 transition-all shadow-sm active:scale-95"
          >
            <i className="fas fa-user text-[10px] md:text-xs"></i>
            <span>{t('sign_in_nav_label')}</span>
          </button>
        )}
      </div>
    </header>
  );
};
