import type { View, LibraryView } from '../types';

/**
 * Every screen has its own URL, so the back button, a refresh and a shared link keep the
 * screen. The URL follows the screen state (see useUrlSync); the state stays the source.
 * The brewery's own items live at the top level, the public library under /library.
 * Paths can hold the recipe, brew or tasting note shown, as :recipeId, :brewId, :noteId.
 */
export interface Route {
  path: string;
  view: View;
  /** Only for screens that show either the brewery's own items or the public library */
  lib?: LibraryView;
  /** Open without signing in */
  public?: boolean;
  /**
   * For screens whose work is gone after a refresh (a brew not saved yet): the path to
   * open instead when the app starts on this URL (may use the same parameters)
   */
  coldStart?: string;
}

/** The recipe, brew or tasting note a screen shows */
export interface Params {
  recipeId?: string;
  brewId?: string;
  noteId?: string;
}

export interface Match {
  route: Route;
  params: Params;
}

/** The start screen: the dashboard when signed in, the public recipes otherwise. */
export const START: Route = { path: '/', view: 'recipes', lib: 'personal', public: true };

// More specific paths first: /recipes/new before /recipes/:recipeId
export const ROUTES: Route[] = [
  { path: '/dashboard', view: 'dashboard' },
  { path: '/recipes', view: 'recipes', lib: 'personal' },
  { path: '/recipes/new', view: 'create' },
  { path: '/recipes/:recipeId', view: 'create', lib: 'personal' },
  { path: '/recipes/:recipeId/brew', view: 'log', coldStart: '/recipes/:recipeId' },
  { path: '/brews', view: 'brouwlogboek' },
  { path: '/brews/:brewId', view: 'log' },
  { path: '/brews/:brewId/tasting', view: 'tasting' },
  { path: '/brews/:brewId/tasting/:noteId', view: 'tasting' },
  { path: '/tasting-notes', view: 'proefnotities' },
  { path: '/flavour-lab', view: 'flavour_lab' },
  { path: '/flavour-lab/:recipeId', view: 'flavour_lab' },
  { path: '/ingredients', view: 'library', lib: 'personal' },
  { path: '/mash-profiles', view: 'own_mash' },
  { path: '/styles', view: 'library_styles', lib: 'personal' },
  { path: '/equipment', view: 'brouwinstallatie' },
  { path: '/water', view: 'own_water' },
  { path: '/stock', view: 'voorraad' },
  { path: '/team', view: 'team' },
  { path: '/library/recipes', view: 'recipes', lib: 'public', public: true },
  { path: '/library/recipes/:recipeId', view: 'create', lib: 'public', public: true },
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

const PARAM_KEYS: (keyof Params)[] = ['recipeId', 'brewId', 'noteId'];
// Ids are uuids; anything else in a URL is not an id
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const paramsOf = (path: string) =>
  path.split('/').filter(s => s.startsWith(':')).map(s => s.slice(1)).sort().join();

const givenParams = (params: Params) =>
  PARAM_KEYS.filter(k => params[k]).sort().join();

const fill = (path: string, params: Params) =>
  path.replace(/:(\w+)/g, (_, key: keyof Params) => encodeURIComponent(params[key] ?? ''));

/** Whether the route shows this screen (leaving the recipe, brew or note aside). */
export const routeMatches = (route: Route, view: View, lib: LibraryView) =>
  route.view === view && (!route.lib || route.lib === lib);

/**
 * The URL of a screen: the route with exactly the parameters given, or else the one
 * without parameters.
 */
export const toPath = (view: View, lib: LibraryView, params: Params = {}): string => {
  const given = givenParams(params);
  const candidates = ROUTES.filter(r => routeMatches(r, view, lib));
  const route = candidates.find(r => paramsOf(r.path) === given) ?? candidates.find(r => paramsOf(r.path) === '');
  return route ? fill(route.path, params) : START.path;
};

const normalize = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname) || '/';

/** The screen of a URL; undefined for an unknown URL. */
export const fromPath = (pathname: string): Match | undefined => {
  const path = normalize(pathname);
  if (path === '/') return { route: START, params: {} };
  const parts = path.split('/');
  for (const route of ROUTES) {
    const pattern = route.path.split('/');
    if (pattern.length !== parts.length) continue;
    const params: Params = {};
    const ok = pattern.every((p, i) => {
      if (!p.startsWith(':')) return p === parts[i];
      if (!ID.test(parts[i])) return false;
      params[p.slice(1) as keyof Params] = parts[i];
      return true;
    });
    if (ok) return { route, params };
  }
  return undefined;
};

/** Whether the URL already shows this screen (the start page counts as its own screen). */
export const pathShows = (pathname: string, view: View, lib: LibraryView, params: Params = {}) => {
  const path = normalize(pathname);
  if (path === '/') return routeMatches(START, view, lib) && givenParams(params) === '';
  return path === toPath(view, lib, params);
};

/** The screen to open when the app starts on this URL. */
export const initialRoute = (pathname: string): Match => {
  const match = fromPath(pathname) ?? { route: START, params: {} };
  if (!match.route.coldStart) return match;
  return fromPath(fill(match.route.coldStart, match.params)) ?? { route: START, params: {} };
};

/** Whether the screen shows a recipe, brew or note that must be looked up in the data first. */
export const needsLookup = ({ route, params }: Match) =>
  route.view !== 'flavour_lab' && givenParams(params) !== '';
