import { useCallback, useEffect, useRef } from 'react';
import type { View, LibraryView } from '../types';
import { fromPath, routeMatches, toPath, START } from './routes';

/**
 * Keeps the URL and the screen state in step, both ways:
 * - the screen changes → a new history entry with its URL (or the current one replaced,
 *   for redirect(), used by the start screen and the guards)
 * - back/forward → the screen of that URL
 * The 28 places that call setView stay as they are.
 */
export function useUrlSync(
  view: View,
  libraryView: LibraryView,
  setView: (view: View) => void,
  setLibraryView: (lib: LibraryView) => void,
) {
  // The first sync replaces: it only corrects an unknown URL, it is not a step to go back to
  const replace = useRef(true);

  useEffect(() => {
    const current = fromPath(window.location.pathname);
    // URL already shows this screen (also after back/forward): nothing to do
    if (current && routeMatches(current, view, libraryView)) {
      replace.current = false;
      return;
    }
    // An unknown URL on the start screen becomes the start page itself
    const path = !current && routeMatches(START, view, libraryView) ? START.path : toPath(view, libraryView);
    if (replace.current) {
      // Keep the query and hash on a redirect: sign-in links carry their tokens there
      window.history.replaceState(window.history.state, '', path + window.location.search + window.location.hash);
    } else {
      window.history.pushState(null, '', path);
    }
    replace.current = false;
  }, [view, libraryView]);

  useEffect(() => {
    const onPopState = () => {
      const route = fromPath(window.location.pathname) ?? START;
      setView(route.view);
      if (route.lib) setLibraryView(route.lib);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setView, setLibraryView]);

  // The screen of the last render, so a redirect can tell whether it changes anything
  const latest = useRef({ view, libraryView });
  latest.current = { view, libraryView };

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
    const route = fromPath(window.location.pathname);
    if (!route || !routeMatches(route, to, nextLib)) replace.current = true;
    setView(to);
    if (lib) setLibraryView(lib);
  }, [setView, setLibraryView]);

  return { redirect };
}
