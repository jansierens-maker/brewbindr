import React from 'react';

interface TopbarProps {
  title: string;
  showNewRecipeButton: boolean;
  syncError?: boolean;
  onRefresh?: () => void;
  onShowHelp?: () => void;
  onOpenSyncDetails?: () => void;
  onNewRecipe?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  title,
  showNewRecipeButton,
  syncError,
  onRefresh,
  onShowHelp,
  onOpenSyncDetails,
  onNewRecipe
}) => {
  return (
    <header className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-4 md:px-7 h-[var(--topbar-h)] flex items-center gap-2 md:gap-3.5 sticky top-0 z-50 shadow-sm md:shadow-none">
      <h2 className="font-[var(--font-display)] text-lg md:text-xl font-bold flex-1 text-[var(--color-text)] truncate">
        {title}
      </h2>

      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Status Indicator & Refresh */}
        <div className="flex items-center bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-[4px_8px] md:p-[6px_12px] gap-2">
          <button
            onClick={onOpenSyncDetails}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            title="Connection Details"
          >
            <div className={`w-2 h-2 rounded-full ${syncError ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span className={`hidden sm:inline text-[10px] md:text-[11px] font-black uppercase tracking-widest ${syncError ? 'text-red-600' : 'text-green-600'}`}>
              {syncError ? 'Connection Error' : 'Connected'}
            </span>
          </button>

          <div className="w-px h-3 bg-[var(--color-border-strong)] hidden sm:block"></div>

          <button
            onClick={onRefresh}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-0.5"
            title="Refresh Data"
          >
            <i className="fas fa-sync-alt text-[10px] md:text-xs"></i>
          </button>
        </div>

        {/* Search (Desktop Only) */}
        <div className="hidden lg:flex items-center gap-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-sm)] p-[6px_12px] text-[13px] text-[var(--color-text-muted)] min-w-[180px] cursor-text">
          <i className="fas fa-search text-xs"></i>
          <span>Zoek recept…</span>
        </div>

        {/* Help Button */}
        <button
          onClick={onShowHelp}
          className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-all"
          title="Help & Manuals"
        >
          <i className="fas fa-question-circle text-sm md:text-base"></i>
        </button>

        {/* New Recipe Button */}
        {showNewRecipeButton && (
          <button
            onClick={onNewRecipe}
            className="bg-[var(--color-text)] text-white flex items-center gap-1.5 p-[6px_12px] md:p-[7px_14px] rounded-[var(--radius-sm)] text-[12px] md:text-[13px] font-semibold hover:bg-[#1e3251] transition-all shadow-sm active:scale-95"
          >
            <i className="fas fa-plus text-[10px] md:text-xs"></i>
            <span className="hidden xs:inline">Nieuw recept</span>
          </button>
        )}
      </div>
    </header>
  );
};
