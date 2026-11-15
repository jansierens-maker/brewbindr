/**
 * The menu (#168): the brewery's own items and the public library side by side, with the
 * same kinds of items, and the system screens. Used by the sidebar and the mobile menu.
 */
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  view: string;
  /** For screens that show either the brewery's own items or the public library */
  libView?: 'personal' | 'public';
  hideIf?: boolean;
  /** Open without signing in */
  public?: boolean;
}

export interface NavSection {
  id: 'brewery' | 'library' | 'system';
  label: string;
  items: NavItem[];
}

export const navSections = (
  t: (key: any) => string,
  opts: { stock: boolean; isAdmin: boolean },
): NavSection[] => [
  { id: 'brewery', label: t('nav_section_brewery'), items: [
    { id: 'dashboard', label: t('nav_dashboard'), icon: 'fa-gauge-high', view: 'dashboard' },
    { id: 'recipes-personal', label: t('nav_recipes'), icon: 'fa-flask', view: 'recipes', libView: 'personal' },
    { id: 'flavour_lab', label: t('nav_flavour_lab'), icon: 'fa-flask-vial', view: 'flavour_lab' },
    { id: 'library-personal', label: t('ingredients_header'), icon: 'fa-seedling', view: 'library', libView: 'personal' },
    { id: 'voorraad', label: t('nav_stock'), icon: 'fa-boxes-stacked', view: 'voorraad', hideIf: !opts.stock },
    { id: 'own_mash', label: t('nav_lib_mash'), icon: 'fa-layer-group', view: 'own_mash' },
    { id: 'library_styles-personal', label: t('nav_lib_styles'), icon: 'fa-tags', view: 'library_styles', libView: 'personal' },
    { id: 'brouwinstallatie', label: t('lib_tab_equipment'), icon: 'fa-temperature-half', view: 'brouwinstallatie' },
    { id: 'own_water', label: t('tab_water_profiles'), icon: 'fa-droplet', view: 'own_water' },
    { id: 'brouwlogboek', label: t('nav_brews'), icon: 'fa-clipboard-list', view: 'brouwlogboek' },
    { id: 'proefnotities', label: t('proefnotities_label'), icon: 'fa-star-half-stroke', view: 'proefnotities' },
    { id: 'team', label: t('team_label'), icon: 'fa-users', view: 'team' },
  ]},
  { id: 'library', label: t('public_library'), items: [
    { id: 'recipes-public', label: t('nav_recipes'), icon: 'fa-flask', view: 'recipes', libView: 'public', public: true },
    { id: 'library-public', label: t('ingredients_header'), icon: 'fa-seedling', view: 'library', libView: 'public', public: true },
    { id: 'library_mash', label: t('nav_lib_mash'), icon: 'fa-layer-group', view: 'library_mash', public: true },
    { id: 'library_styles-public', label: t('nav_lib_styles'), icon: 'fa-tags', view: 'library_styles', libView: 'public', public: true },
    { id: 'library_equipment', label: t('lib_tab_equipment'), icon: 'fa-gears', view: 'library_equipment', public: true },
    { id: 'library_water', label: t('tab_water_profiles'), icon: 'fa-droplet', view: 'library_water', public: true },
  ]},
  { id: 'system', label: t('nav_section_system'), items: [
    { id: 'importeren', label: t('nav_import'), icon: 'fa-arrow-up-from-bracket', view: 'importeren' },
    { id: 'settings', label: t('settings_nav_label'), icon: 'fa-gear', view: 'settings', public: true },
    { id: 'help', label: t('help_nav_label'), icon: 'fa-question-circle', view: 'help', public: true },
    { id: 'admin', label: t('admin_nav_label'), icon: 'fa-user-shield', view: 'admin', hideIf: !opts.isAdmin },
  ]},
];

/** Whether the item is the screen being shown. */
export const isNavItemActive = (item: NavItem, currentView: string, libraryView: 'personal' | 'public') =>
  currentView === item.view && (!item.libView || item.libView === libraryView);
