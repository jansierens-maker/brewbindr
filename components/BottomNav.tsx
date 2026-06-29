import React, { useState } from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';

interface BottomNavProps {
  currentView: string;
  libraryView: 'personal' | 'public';
  onViewChange: (view: any) => void;
  onLibraryViewChange: (libView: 'personal' | 'public') => void;
  onAuth?: (mode?: 'signin' | 'signup') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  libraryView,
  onViewChange,
  onLibraryViewChange,
  onAuth
}) => {
  const { t } = useTranslation();
  const { user, preferences } = useUser();
  const [showMore, setShowMore] = useState(false);

  const tabs = [
    { id: 'recipes', label: t('nav_recipes'), icon: 'fa-flask', view: 'recipes', libView: 'personal' },
    { id: 'brouwlogboek', label: t('nav_brews'), icon: 'fa-clipboard-list', view: 'brouwlogboek' },
    { id: 'recipes-public', label: 'Bieb', icon: 'fa-book-open', view: 'recipes', libView: 'public' },
    { id: 'proefnotities', label: 'Proeven', icon: 'fa-star-half-stroke', view: 'proefnotities' },
    { id: 'more', label: 'Meer', icon: 'fa-ellipsis-h' },
  ];

  const moreItems = [
    { id: 'voorraad', label: t('nav_stock'), icon: 'fa-boxes-stacked', view: 'voorraad', hideIf: !preferences.enableStockManagement },
    { id: 'team', label: 'Team', icon: 'fa-users', view: 'team' },
    { id: 'importeren', label: t('nav_import'), icon: 'fa-arrow-up-from-bracket', view: 'importeren' },
    { id: 'brouwinstallatie', label: t('nav_installation'), icon: 'fa-temperature-half', view: 'brouwinstallatie' },
    { id: 'settings', label: 'Instellingen', icon: 'fa-gear', view: 'settings' },
    { id: 'help', label: 'Help & Handleidingen', icon: 'fa-question-circle', view: 'help' },
  ];

  const isActive = (tab: any) => {
    if (tab.id === 'more') return showMore;
    if (tab.view === 'recipes') {
      return currentView === 'recipes' && libraryView === tab.libView;
    }
    return currentView === tab.view || currentView === tab.id;
  };

  const isGated = (item: any) => {
    return !user && item.id !== 'recipes-public' && item.view !== 'settings' && item.view !== 'help';
  };

  const handleTabClick = (tab: any) => {
    if (tab.id === 'more') {
      setShowMore(!showMore);
      return;
    }

    if (isGated(tab)) {
      if (onAuth) onAuth('signin');
      return;
    }

    setShowMore(false);
    onViewChange(tab.view);
    if (tab.libView) {
      onLibraryViewChange(tab.libView);
    }
  };

  const handleMoreItemClick = (item: any) => {
    if (isGated(item)) {
      if (onAuth) onAuth('signin');
      return;
    }
    setShowMore(false);
    onViewChange(item.view);
  };

  return (
    <>
      {/* More Bottom Sheet */}
      {showMore && (
        <div className="fixed inset-0 z-[140] lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMore(false)}></div>
          <div className="absolute bottom-[var(--bottomnav-h)] left-0 right-0 bg-[var(--color-bg)] rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden border-t border-[var(--color-border)]">
            <div className="w-10 h-1 bg-[var(--color-border-strong)] rounded-full mx-auto my-3"></div>
            <div className="px-4 pb-8 space-y-1">
              {moreItems.filter(item => !(item as any).hideIf).map((item) => {
                const gated = isGated(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleMoreItemClick(item)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl text-sm font-medium transition-colors ${
                      currentView === item.view ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'
                    } ${gated ? 'opacity-[0.38]' : ''}`}
                  >
                    <span className={`w-6 text-center text-lg ${currentView === item.view ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-xmuted)]'}`}>
                      <i className={`fas ${item.icon}`}></i>
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {gated && <i className="fas fa-lock text-xs text-[var(--color-text-xmuted)]"></i>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 h-[var(--bottomnav-h)] bg-[var(--color-bg)] border-t border-[var(--color-border)] flex z-[150] lg:hidden">
        {tabs.map((tab) => {
          const gated = isGated(tab);
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative ${
                isActive(tab) ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-text-xmuted)] hover:text-[var(--color-text-muted)]'
              } ${gated ? 'opacity-[0.38]' : ''}`}
            >
              <span className={`text-xl ${isActive(tab) ? 'text-[var(--color-accent)]' : ''}`}>
                <i className={`fas ${tab.icon}`}></i>
              </span>
              <span className="text-[10px] font-semibold">{tab.label}</span>
              {gated && <i className="fas fa-lock absolute top-1 right-1/2 translate-x-4 text-[8px] text-[var(--color-text-xmuted)]"></i>}
            </button>
          );
        })}
      </nav>
    </>
  );
};
