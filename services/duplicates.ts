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
