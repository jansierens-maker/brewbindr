import { Recipe } from '../types';

export interface EditContext {
  userId?: string;
  breweryId?: string | null;
  breweryRole?: string | null;
  isAdmin?: boolean; // global app admin
}

/** Brewery roles that may create, change and delete recipes (see the RLS policies). */
export const canManageRecipes = (ctx: EditContext): boolean =>
  !!ctx.isAdmin || !ctx.breweryRole || ctx.breweryRole === 'admin' || ctx.breweryRole === 'brewmaster';

/**
 * Whether this user may change or delete an existing recipe. Mirrors the database:
 * admins and brewmasters manage every recipe of their brewery, not only their own;
 * approved (public) recipes can only be changed by a global admin.
 */
export const canEditRecipe = (recipe: Pick<Recipe, 'user_id' | 'brewery_id' | 'status'>, ctx: EditContext): boolean => {
  if (ctx.isAdmin) return true;
  if (recipe.status === 'approved') return false;
  if (!recipe.user_id && !recipe.brewery_id) return true; // local or example recipe, not stored yet
  if (ctx.breweryId) return recipe.brewery_id === ctx.breweryId && canManageRecipes(ctx);
  return !!ctx.userId && recipe.user_id === ctx.userId;
};

/** Brewery roles that open and update brews (see the RLS policies on brew_logs); tasters only taste. */
export const canManageBrews = (ctx: EditContext): boolean =>
  !!ctx.isAdmin || !ctx.breweryRole || ['admin', 'brewmaster', 'brewer'].includes(ctx.breweryRole);

/** Library, stock, brewing installation and imports follow the recipe rights: brewery admins and brewmasters. */
export const canManageLibrary = canManageRecipes;

/** Tasters do not see the stock (nor what it says about recipes, like "brewable"). */
export const canViewStock = (ctx: EditContext): boolean => !!ctx.isAdmin || ctx.breweryRole !== 'taster';
