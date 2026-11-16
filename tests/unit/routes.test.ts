import { describe, expect, it } from 'vitest';
import { ROUTES, START, fromPath, initialRoute, routeMatches, toPath } from '../../services/routes';

describe('routes', () => {
  it('gives every screen its own URL, and that URL leads back to the screen', () => {
    for (const r of ROUTES) {
      const lib = r.lib ?? 'personal';
      expect(toPath(r.view, lib), r.path).toBe(r.path);
      const back = fromPath(r.path);
      expect(back && routeMatches(back, r.view, lib), r.path).toBe(true);
    }
  });

  it('has no duplicate paths and none that clash with files the server serves', () => {
    const paths = ROUTES.map(r => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) {
      expect(p).not.toMatch(/^\/(api|assets|icons)(\/|$)|\.(html|js|webmanifest)$/);
    }
  });

  it('tells the brewery\'s own items from the public library', () => {
    expect(toPath('recipes', 'personal')).toBe('/recipes');
    expect(toPath('recipes', 'public')).toBe('/library/recipes');
    expect(toPath('library_styles', 'public')).toBe('/library/styles');
    // Screens without that choice ignore it
    expect(toPath('help', 'public')).toBe('/help');
  });

  it('reads the start page, a trailing slash and unknown URLs', () => {
    expect(fromPath('/')).toBe(START);
    expect(fromPath('/brews/')?.view).toBe('brouwlogboek');
    expect(fromPath('/does-not-exist')).toBeUndefined();
  });

  it('opens the list instead of a screen that needs a choice made first', () => {
    expect(initialRoute('/brew').view).toBe('brouwlogboek');
    expect(initialRoute('/tasting').view).toBe('proefnotities');
    expect(initialRoute('/recipes/editor')).toMatchObject({ view: 'recipes', lib: 'personal' });
    expect(initialRoute('/library/water').view).toBe('library_water');
    expect(initialRoute('/nope')).toBe(START);
  });

  it('lets guests open only the public screens', () => {
    const open = ROUTES.filter(r => r.public).map(r => r.view);
    expect(open).toEqual(expect.arrayContaining(['help', 'settings', 'auth', 'library_mash']));
    expect(ROUTES.find(r => r.view === 'team')?.public).toBeFalsy();
    expect(ROUTES.find(r => r.view === 'dashboard')?.public).toBeFalsy();
  });
});
