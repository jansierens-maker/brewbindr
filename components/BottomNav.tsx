import React, { useState } from 'react';
import { useTranslation } from '../App';
import { useUser } from '../services/userContext';
import { navSections, isNavItemActive, NavItem } from './navItems';

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
  const { user, preferences, isAdmin, signOut } = useUser();
  const [showMore, setShowMore] = useState(false);

  const tabs = [
    { id: 'dashboard', label: t('nav_dashboard'), icon: 'fa-gauge-high', view: 'dashboard' },
    { id: 'recipes', label: t('nav_recipes'), icon: 'fa-flask', view: 'recipes', libView: 'personal' },
    { id: 'brouwlogboek', label: t('nav_brews'), icon: 'fa-clipboard-list', view: 'brouwlogboek' },
    { id: 'recipes-public', label: t('nav_library_short'), icon: 'fa-book-open', view: 'recipes', libView: 'public' },
    { id: 'more', label: t('nav_more'), icon: 'fa-ellipsis-h' },
  ];

  // The rest of the menu, grouped as in the sidebar (#168)
  const moreSections = navSections(t, { stock: !!preferences.enableStockManagement, isAdmin })
    .map(section => ({ ...section, items: section.items.filter(item => !item.hideIf && !tabs.some(tab => tab.view === item.view && tab.libView === item.libView)) }))
    .filter(section => section.items.length > 0);

  const isActive = (tab: any) => {
    if (tab.id === 'more') return showMore;
    if (tab.view === 'recipes') {
      return currentView === 'recipes' && libraryView === tab.libView;
    }
    return currentView === tab.view || currentView === tab.id;
  };

  const isGated = (item: any) => !user && !(item.public || item.id === 'recipes-public');

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

  const handleMoreItemClick = (item: NavItem) => {
    if (isGated(item)) {
      if (onAuth) onAuth('signin');
      return;
    }
    setShowMore(false);
    onViewChange(item.view);
    if (item.libView) onLibraryViewChange(item.libView);
  };

  return (
    <>
      {/* More Bottom Sheet */}
      {showMore && (
        <div className="fixed inset-0 z-[140] lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMore(false)}></div>
          <div className="absolute bottom-[var(--bottomnav-h)] left-0 right-0 bg-[var(--color-bg)] rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[75vh] overflow-y-auto border-t border-[var(--color-border)]">
            <div className="w-10 h-1 bg-[var(--color-border-strong)] rounded-full mx-auto my-3"></div>
            <div className="px-4 pb-8 space-y-1">
              {moreSections.map(section => (
                <div key={section.id} className="pt-2">
                  <p className="px-4 pb-1 text-[10px] font-bold tracking-[0.09em] uppercase text-[var(--color-text-xmuted)]">{section.label}</p>
                  {section.items.map((item) => {
                    const gated = isGated(item);
                    const active = isNavItemActive(item, currentView, libraryView);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleMoreItemClick(item)}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                          active ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'
                        } ${gated ? 'opacity-[0.38]' : ''}`}
                      >
                        <span className={`w-6 text-center text-lg ${active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-xmuted)]'}`}>
                          <i className={`fas ${item.icon}`} aria-hidden="true"></i>
                        </span>
                        <span className="flex-1 text-left">{item.label}</span>
                        {gated && <i className="fas fa-lock text-xs text-[var(--color-text-xmuted)]" aria-hidden="true"></i>}
                      </button>
                    );
                  })}
                </div>
              ))}
              {user && (
                <button
                  onClick={async () => { setShowMore(false); await signOut(); }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border-t border-[var(--color-border)] mt-2"
                >
                  <span className="w-6 text-center text-lg">
                    <i className="fas fa-right-from-bracket" aria-hidden="true"></i>
                  </span>
                  <span className="flex-1 text-left">{t('sign_out_btn')}</span>
                </button>
              )}
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
