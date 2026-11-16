import { useCallback, useEffect, useRef } from 'react';
import type { View, LibraryView } from '../types';
import { fromPath, pathShows, routeMatches, toPath, START, type Match, type Params } from './routes';

/**
 * Keeps the URL and the screen state in step, both ways:
 * - the screen changes → a new history entry with its URL; the current one is replaced
 *   instead for redirect() (start screen, guards) and when only the recipe, brew or note
 *   on the same screen changes (e.g. a new recipe that gets its id when saved)
 * - back/forward → onNavigate with the screen of that URL
 * While `paused` (the recipe, brew or note of the URL is still being looked up), the URL
 * is left alone. The places that call setView stay as they are.
 */
export function useUrlSync(
  screen: { view: View; libraryView: LibraryView; params: Params },
  paused: boolean,
  onNavigate: (match: Match) => void,
  setView: (view: View) => void,
  setLibraryView: (lib: LibraryView) => void,
) {
  const { view, libraryView, params } = screen;
  const target = toPath(view, libraryView, params);

  // The screen of the last render, so back/forward and redirects can compare with it
  const latest = useRef({ view, libraryView });
  latest.current = { view, libraryView };

  // The first sync replaces: it only corrects an unknown URL, it is not a step to go back to
  const replace = useRef(true);
  // The screen the URL was last set for
  const synced = useRef<{ view: View; libraryView: LibraryView } | null>(null);

  useEffect(() => {
    if (paused) return;
    const { pathname, search, hash } = window.location;
    const sameScreen = synced.current?.view === view && synced.current?.libraryView === libraryView;
    synced.current = { view, libraryView };
    // URL already shows this screen (also after back/forward): nothing to do
    if (pathShows(pathname, view, libraryView, params)) {
      replace.current = false;
      return;
    }
    // An unknown URL on the start screen becomes the start page itself
    const path = !fromPath(pathname) && routeMatches(START, view, libraryView) && !Object.values(params).some(Boolean)
      ? START.path
      : target;
    if (replace.current) {
      // Keep the query and hash on a redirect: sign-in links carry their tokens there
      window.history.replaceState(window.history.state, '', path + search + hash);
    } else if (sameScreen) {
      window.history.replaceState(window.history.state, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    replace.current = false;
    // target covers the parameters
  }, [view, libraryView, target, paused]);

  // The latest callback, so the listener does not need to be added again
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;

  useEffect(() => {
    const onPopState = () => {
      const match = fromPath(window.location.pathname) ?? { route: START, params: {} };
      synced.current = { view: match.route.view, libraryView: match.route.lib ?? latest.current.libraryView };
      navigate.current(match);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /**
   * Go to a screen without adding a step to the history (the start screen, a guard).
   * Without a screen: stay on the current one, only switching the library view.
   * Only marks the URL for replacing when the screen really changes, so the next
   * ordinary click still adds a step.
   */
  const redirect = useCallback((to?: View, lib?: LibraryView) => {
    to = to ?? latest.current.view;
    const nextLib = lib ?? latest.current.libraryView;
    if (to === latest.current.view && nextLib === latest.current.libraryView) return;
    const match = fromPath(window.location.pathname);
    if (!match || !routeMatches(match.route, to, nextLib)) replace.current = true;
    setView(to);
    if (lib) setLibraryView(lib);
  }, [setView, setLibraryView]);

  return { redirect };
}
