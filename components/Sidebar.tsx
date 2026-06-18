import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { useUser } from '../services/userContext';
import { breweryService } from '../services/breweryService';
import { Brewery } from '../types';

interface SidebarProps {
  currentView: string;
  libraryView: 'personal' | 'public';
  onViewChange: (view: any) => void;
  onLibraryViewChange: (libView: 'personal' | 'public') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  libraryView,
  onViewChange,
  onLibraryViewChange
}) => {
  const { profile, breweryRole } = useUser();
  const [brewery, setBrewery] = useState<Brewery | null>(null);

  useEffect(() => {
    if (profile?.brewery_id) {
      breweryService.getBrewery(profile.brewery_id).then(setBrewery);
    }
  }, [profile?.brewery_id]);

  const navItems = [
    { section: 'Brouwerij', items: [
      { id: 'recipes-personal', label: 'Recepten', icon: 'fa-flask', view: 'recipes', libView: 'personal' },
      { id: 'brouwlogboek', label: 'Brouwlogboek', icon: 'fa-clipboard-list', view: 'brouwlogboek' },
      { id: 'proefnotities', label: 'Proefnotities', icon: 'fa-star-half-stroke', view: 'proefnotities' },
      { id: 'voorraad', label: 'Voorraad', icon: 'fa-boxes-stacked', view: 'voorraad' },
      { id: 'team', label: 'Team', icon: 'fa-users', view: 'team' },
      { id: 'importeren', label: 'Importeren', icon: 'fa-arrow-up-from-bracket', view: 'importeren' },
      { id: 'brouwinstallatie', label: 'Brouwinstallatie', icon: 'fa-temperature-half', view: 'brouwinstallatie' },
    ]},
    { section: 'Bibliotheek', items: [
      { id: 'recipes-public', label: 'Recepten', icon: 'fa-flask', view: 'recipes', libView: 'public' },
      { id: 'library', label: 'Ingrediënten', icon: 'fa-seedling', view: 'library' },
    ]},
    { section: 'Systeem', items: [
      { id: 'settings', label: 'Instellingen', icon: 'fa-gear', view: 'settings' },
      { id: 'help', label: 'Help & Handleidingen', icon: 'fa-question-circle', view: 'help' },
    ]}
  ];

  const isActive = (item: any) => {
    if (item.view === 'recipes') {
      return currentView === 'recipes' && libraryView === item.libView;
    }
    return currentView === item.view || currentView === item.id;
  };

  const handleNavClick = (item: any) => {
    onViewChange(item.view || item.id);
    if (item.libView) {
      onLibraryViewChange(item.libView);
    }
  };

  const handleLogoClick = () => {
    onViewChange('recipes');
    onLibraryViewChange('personal');
  };

  return (
    <aside className="w-[var(--sidebar-w)] bg-[var(--color-bg)] border-r border-[var(--color-border)] flex flex-col fixed top-0 left-0 bottom-0 z-[100] overflow-y-auto">
      <button
        onClick={handleLogoClick}
        className="p-[17px_20px_13px] border-b border-[var(--color-border)] flex items-center gap-2.5 flex-shrink-0 hover:bg-[var(--color-bg-subtle)] transition-colors text-left"
      >
        <Logo />
      </button>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {navItems.map((section) => (
          <div key={section.section} className="p-[12px_12px_2px]">
            <div className="text-[10px] font-bold tracking-[0.09em] uppercase text-[var(--color-text-xmuted)] px-2 mb-1">
              {section.section}
            </div>
            <nav className="space-y-0.5">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center gap-2.5 p-[7px_10px] rounded-[var(--radius-sm)] text-[13.5px] font-medium transition-colors cursor-pointer text-left ${
                    isActive(item)
                      ? 'bg-[var(--color-accent-light)] text-[var(--color-accent-dark)] font-semibold'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <span className={`w-4 text-center text-xs flex-shrink-0 ${isActive(item) ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-xmuted)]'}`}>
                    <i className={`fas ${item.icon}`}></i>
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-[var(--color-border)] p-3 flex-shrink-0">
        <button
          onClick={() => onViewChange('settings')}
          className="w-full flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer group text-left"
        >
          <div className="w-[30px] h-[30px] rounded-full bg-[var(--color-accent-light)] flex items-center justify-center text-xs font-bold text-[var(--color-accent-dark)] flex-shrink-0 uppercase">
            {profile?.email?.substring(0, 2) || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--color-text)] truncate">
              {profile?.email?.split('@')[0] || 'Gast'}
            </div>
            <div className="text-[11px] text-[var(--color-text-xmuted)] truncate capitalize">
              {breweryRole || 'Taster'} · {brewery?.name || 'Laden...'}
            </div>
          </div>
          <i className="fas fa-ellipsis-v text-[var(--color-text-xmuted)] text-xs group-hover:text-[var(--color-text)]"></i>
        </button>
      </div>
    </aside>
  );
};
