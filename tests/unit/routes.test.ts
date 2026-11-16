import { describe, expect, it } from 'vitest';
import { ROUTES, START, fromPath, initialRoute, needsLookup, pathShows, routeMatches, toPath, type Params } from '../../services/routes';

const ID = '3f2a9c1e-7b4d-4e2a-9f10-5c6d7e8f9a0b';
const ID2 = 'a1b2c3d4-0000-4000-8000-111122223333';

/** Parameters to fill a route's path with */
const paramsFor = (path: string): Params => ({
  ...(path.includes(':recipeId') && { recipeId: ID }),
  ...(path.includes(':brewId') && { brewId: ID }),
  ...(path.includes(':noteId') && { noteId: ID2 }),
});

describe('routes', () => {
  it('gives every screen its own URL, and that URL leads back to the screen', () => {
    for (const r of ROUTES) {
      const lib = r.lib ?? 'personal';
      const params = paramsFor(r.path);
      const path = toPath(r.view, lib, params);
      const back = fromPath(path);
      expect(back?.route, r.path).toBe(r);
      expect(back?.params, r.path).toEqual(params);
      expect(back && routeMatches(back.route, r.view, lib), r.path).toBe(true);
      expect(pathShows(path, r.view, lib, params), r.path).toBe(true);
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
    expect(toPath('create', 'personal', { recipeId: ID })).toBe(`/recipes/${ID}`);
    expect(toPath('create', 'public', { recipeId: ID })).toBe(`/library/recipes/${ID}`);
    // Screens without that choice ignore it
    expect(toPath('help', 'public')).toBe('/help');
  });

  it('puts the recipe, brew and tasting note in the URL', () => {
    expect(toPath('create', 'personal')).toBe('/recipes/new');
    expect(toPath('create', 'personal', { recipeId: undefined })).toBe('/recipes/new');
    expect(toPath('log', 'personal', { recipeId: ID })).toBe(`/recipes/${ID}/brew`);
    expect(toPath('log', 'personal', { brewId: ID })).toBe(`/brews/${ID}`);
    expect(toPath('tasting', 'personal', { brewId: ID })).toBe(`/brews/${ID}/tasting`);
    expect(toPath('tasting', 'personal', { brewId: ID, noteId: ID2 })).toBe(`/brews/${ID}/tasting/${ID2}`);
    expect(toPath('flavour_lab', 'personal', { recipeId: ID })).toBe(`/flavour-lab/${ID}`);
    expect(toPath('flavour_lab', 'personal')).toBe('/flavour-lab');
  });

  it('reads the start page, a trailing slash and unknown URLs', () => {
    expect(fromPath('/')?.route).toBe(START);
    expect(fromPath('/brews/')?.route.view).toBe('brouwlogboek');
    expect(fromPath('/does-not-exist')).toBeUndefined();
    expect(fromPath('/recipes/new')?.route.view).toBe('create');
    expect(fromPath('/recipes/new')?.params).toEqual({});
  });

  it('accepts only ids in the place of a parameter', () => {
    expect(fromPath('/brews/abc%20def')).toBeUndefined();
    expect(fromPath('/brews/<script>')).toBeUndefined();
    expect(fromPath(`/brews/${'x'.repeat(65)}`)).toBeUndefined();
    expect(fromPath('/brews/abc-123_X')?.params).toEqual({ brewId: 'abc-123_X' });
  });

  it('counts the start page as the start screen only', () => {
    expect(pathShows('/', 'recipes', 'personal')).toBe(true);
    expect(pathShows('/', 'recipes', 'public')).toBe(false);
    expect(pathShows('/', 'dashboard', 'personal')).toBe(false);
    expect(pathShows(`/recipes/${ID}`, 'create', 'personal', { recipeId: ID2 })).toBe(false);
  });

  it('opens the recipe instead of a brew that was not saved yet', () => {
    expect(initialRoute(`/recipes/${ID}/brew`)).toEqual({ route: fromPath(`/recipes/${ID}`)!.route, params: { recipeId: ID } });
    expect(initialRoute(`/brews/${ID}`).route.view).toBe('log');
    expect(initialRoute('/library/water').route.view).toBe('library_water');
    expect(initialRoute('/nope').route).toBe(START);
  });

  it('looks up recipes, brews and notes, but not the recipe of Flavour Lab', () => {
    expect(needsLookup(fromPath(`/recipes/${ID}`)!)).toBe(true);
    expect(needsLookup(fromPath(`/brews/${ID}/tasting/${ID2}`)!)).toBe(true);
    expect(needsLookup(fromPath('/recipes/new')!)).toBe(false);
    expect(needsLookup(fromPath(`/flavour-lab/${ID}`)!)).toBe(false);
  });

  it('lets guests open only the public screens', () => {
    const open = ROUTES.filter(r => r.public).map(r => r.path);
    expect(open).toEqual(expect.arrayContaining(['/help', '/settings', '/login', '/library/mash-profiles', '/library/recipes/:recipeId']));
    for (const p of ['/team', '/dashboard', '/recipes/:recipeId', '/brews/:brewId']) {
      expect(ROUTES.find(r => r.path === p)?.public, p).toBeFalsy();
    }
  });
});
