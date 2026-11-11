import { Recipe } from '../types';
import { uniqueName } from './duplicates';

/**
 * A private copy of a recipe in the same brewery: new id, the name with a suffix such as
 * "(copy)" (made unique among the brewery's recipe names), not published. Nothing is
 * shared with the original, so changing the copy leaves the original as it is. Brews and
 * tasting notes keep pointing to the original.
 */
export const copyRecipe = (
  recipe: Recipe,
  opts: { suffix: string; takenNames: string[]; userId?: string; breweryId?: string | null },
): Recipe => {
  const clone: Recipe = structuredClone(recipe);
  const base = `${(recipe.name || '').trim()} (${opts.suffix})`;
  return {
    ...clone,
    id: crypto.randomUUID(),
    name: uniqueName(base, opts.takenNames),
    status: 'private',
    user_id: opts.userId ?? recipe.user_id,
    brewery_id: opts.breweryId ?? recipe.brewery_id,
  };
};
