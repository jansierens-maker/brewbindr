import React, { useState } from 'react';

interface BottomNavProps {
  currentView: string;
  libraryView: 'personal' | 'public';
  onViewChange: (view: any) => void;
  onLibraryViewChange: (libView: 'personal' | 'public') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  libraryView,
  onViewChange,
  onLibraryViewChange
}) => {
  const [showMore, setShowMore] = useState(false);

  const tabs = [
    { id: 'recipes', label: 'Recepten', icon: 'fa-flask', view: 'recipes', libView: 'personal' },
    { id: 'brouwlogboek', label: 'Logboek', icon: 'fa-clipboard-list', view: 'brouwlogboek' },
    { id: 'recipes-public', label: 'Bieb', icon: 'fa-book-open', view: 'recipes', libView: 'public' },
    { id: 'proefnotities', label: 'Proeven', icon: 'fa-star-half-stroke', view: 'proefnotities' },
    { id: 'more', label: 'Meer', icon: 'fa-ellipsis-h' },
  ];

  const moreItems = [
    { id: 'voorraad', label: 'Voorraad', icon: 'fa-boxes-stacked', view: 'voorraad' },
    { id: 'team', label: 'Team', icon: 'fa-users', view: 'team' },
    { id: 'importeren', label: 'Importeren', icon: 'fa-arrow-up-from-bracket', view: 'importeren' },
    { id: 'brouwinstallatie', label: 'Brouwinstallatie', icon: 'fa-temperature-half', view: 'brouwinstallatie' },
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

  const handleTabClick = (tab: any) => {
    if (tab.id === 'more') {
      setShowMore(!showMore);
    } else {
      setShowMore(false);
      onViewChange(tab.view);
      if (tab.libView) {
        onLibraryViewChange(tab.libView);
      }
    }
  };

  const handleMoreItemClick = (item: any) => {
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
              {moreItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleMoreItemClick(item)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl text-sm font-medium transition-colors ${
                    currentView === item.view ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                >
                  <span className={`w-6 text-center text-lg ${currentView === item.view ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-xmuted)]'}`}>
                    <i className={`fas ${item.icon}`}></i>
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 h-[var(--bottomnav-h)] bg-[var(--color-bg)] border-t border-[var(--color-border)] flex z-[150] lg:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative ${
              isActive(tab) ? 'text-[var(--color-accent-dark)]' : 'text-[var(--color-text-xmuted)] hover:text-[var(--color-text-muted)]'
            }`}
          >
            <span className={`text-xl ${isActive(tab) ? 'text-[var(--color-accent)]' : ''}`}>
              <i className={`fas ${tab.icon}`}></i>
            </span>
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};
