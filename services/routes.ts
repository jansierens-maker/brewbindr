import type { View, LibraryView } from '../types';

/**
 * Every screen has its own URL, so the back button, a refresh and a shared link keep the
 * screen. The URL follows the screen state (see useUrlSync); the state stays the source.
 * The brewery's own items live at the top level, the public library under /library.
 */
export interface Route {
  path: string;
  view: View;
  /** Only for screens that show either the brewery's own items or the public library */
  lib?: LibraryView;
  /** Open without signing in */
  public?: boolean;
  /**
   * For screens that need something chosen first (a recipe, a brew): the path to open
   * instead when the app starts on this URL, since that choice is gone after a refresh
   */
  coldStart?: string;
}

/** The start screen: the dashboard when signed in, the public recipes otherwise. */
export const START: Route = { path: '/', view: 'recipes', lib: 'personal', public: true };

export const ROUTES: Route[] = [
  { path: '/dashboard', view: 'dashboard' },
  { path: '/recipes', view: 'recipes', lib: 'personal' },
  { path: '/recipes/editor', view: 'create', coldStart: '/recipes' },
  { path: '/brew', view: 'log', coldStart: '/brews' },
  { path: '/tasting', view: 'tasting', coldStart: '/tasting-notes' },
  { path: '/brews', view: 'brouwlogboek' },
  { path: '/tasting-notes', view: 'proefnotities' },
  { path: '/flavour-lab', view: 'flavour_lab' },
  { path: '/ingredients', view: 'library', lib: 'personal' },
  { path: '/mash-profiles', view: 'own_mash' },
  { path: '/styles', view: 'library_styles', lib: 'personal' },
  { path: '/equipment', view: 'brouwinstallatie' },
  { path: '/water', view: 'own_water' },
  { path: '/stock', view: 'voorraad' },
  { path: '/team', view: 'team' },
  { path: '/library/recipes', view: 'recipes', lib: 'public', public: true },
  { path: '/library/ingredients', view: 'library', lib: 'public', public: true },
  { path: '/library/mash-profiles', view: 'library_mash', public: true },
  { path: '/library/styles', view: 'library_styles', lib: 'public', public: true },
  { path: '/library/equipment', view: 'library_equipment', public: true },
  { path: '/library/water', view: 'library_water', public: true },
  { path: '/import', view: 'importeren' },
  { path: '/settings', view: 'settings', public: true },
  { path: '/help', view: 'help', public: true },
  { path: '/admin', view: 'admin' },
  { path: '/login', view: 'auth', public: true },
];

/** Whether the route shows this screen. */
export const routeMatches = (route: Route, view: View, lib: LibraryView) =>
  route.view === view && (!route.lib || route.lib === lib);

/** The URL of a screen. */
export const toPath = (view: View, lib: LibraryView): string =>
  ROUTES.find(r => routeMatches(r, view, lib))?.path ?? START.path;

/** The screen of a URL; undefined for an unknown URL. */
export const fromPath = (pathname: string): Route | undefined => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '') return START;
  return ROUTES.find(r => r.path === path);
};

/** The screen to open when the app starts on this URL. */
export const initialRoute = (pathname: string): Route => {
  const route = fromPath(pathname) ?? START;
  return route.coldStart ? fromPath(route.coldStart) ?? START : route;
};
