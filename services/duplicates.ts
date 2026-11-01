import { LibraryIngredient, Recipe } from '../types';

/** Normalised name for duplicate checks: case-, space- and accent-insensitive. */
export const nameKey = (name?: string): string =>
  (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isShared = (status?: string) => status === 'approved' || status === 'submitted';

/** Public or pending recipes (other than `exceptId`) with the same name. */
export const findDuplicateRecipes = (name: string, recipes: Recipe[], exceptId?: string): Recipe[] =>
  recipes.filter(r => r.id !== exceptId && isShared(r.status) && nameKey(r.name) === nameKey(name));

/** Public or pending library items of the same type with the same name. */
export const findDuplicateIngredients = (item: Pick<LibraryIngredient, 'name' | 'type' | 'id'>, library: LibraryIngredient[]): LibraryIngredient[] =>
  library.filter(l => l.id !== item.id && l.type === item.type && isShared(l.status) && nameKey(l.name) === nameKey(item.name));

/** Keys of everything already in the public library, for flagging pending submissions. */
export const approvedKeys = (recipes: Recipe[], library: LibraryIngredient[]): Set<string> =>
  new Set([
    ...recipes.filter(r => r.status === 'approved').map(r => `recipe:${nameKey(r.name)}`),
    ...library.filter(l => l.status === 'approved').map(l => `${l.type}:${nameKey(l.name)}`),
  ]);

/** Key of a pending submission as returned by fetchPendingSubmissions(). */
export const submissionKey = (item: { name?: string; type?: string; _table?: string }): string =>
  `${item._table === 'recipes' ? 'recipe' : item.type}:${nameKey(item.name)}`;

/**
 * Returns `name`, or the first free "name (2)", "name (3)", ... when `name` is taken.
 * A trailing " (n)" on the input is replaced, so copying "Ale (2)" gives "Ale (3)".
 */
export const uniqueName = (name: string, takenNames: string[]): string => {
  const taken = new Set(takenNames.map(nameKey));
  const trimmed = (name || '').trim();
  if (!taken.has(nameKey(trimmed))) return trimmed;
  const base = trimmed.replace(/\s\(\d+\)$/, '');
  let n = 2;
  while (taken.has(nameKey(`${base} (${n})`))) n++;
  return `${base} (${n})`;
};

/** Names of the private recipes in the user's brewery (or of the user, without a brewery). */
export const privateRecipeNames = (recipes: Recipe[], breweryId?: string | null, userId?: string, exceptId?: string): string[] =>
  recipes
    .filter(r => r.id !== exceptId && (r.status === 'private' || !r.status) &&
      // Your own recipes always count: one saved before your brewery was loaded has no brewery_id yet
      ((breweryId && r.brewery_id === breweryId) || (!!userId && r.user_id === userId)))
    .map(r => r.name);

/** True for a Postgres unique-violation error returned by Supabase. */
export const isUniqueViolation = (error: any): boolean => error?.code === '23505';

const isOwnPrivate = (l: LibraryIngredient, breweryId?: string | null, userId?: string) =>
  (l.status === 'private' || !l.status) && (breweryId ? l.brewery_id === breweryId : l.user_id === userId);

/** Names of the private library items of one type in the user's brewery. */
export const privateLibraryNames = (library: LibraryIngredient[], type: string, breweryId?: string | null, userId?: string, exceptId?: string): string[] =>
  library.filter(l => l.id !== exceptId && l.type === type && isOwnPrivate(l, breweryId, userId)).map(l => l.name);

/** The brewery's own private item with this name and type, if any. */
export const findPrivateIngredient = (library: LibraryIngredient[], name: string, type: string, breweryId?: string | null, userId?: string): LibraryIngredient | undefined =>
  library.find(l => l.type === type && isOwnPrivate(l, breweryId, userId) && nameKey(l.name) === nameKey(name));
