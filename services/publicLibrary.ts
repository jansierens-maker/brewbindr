import { LibraryIngredient } from '../types';
import { findDuplicateIngredients } from './duplicates';
import { supabaseService } from './supabaseService';

/**
 * The copy of a brewery's own item that goes to the public library for review.
 * The original stays private; brewery-only settings (stock, default installation)
 * are left out.
 */
export const publicSubmission = (item: LibraryIngredient, userId: string, breweryId?: string | null): LibraryIngredient => {
  const { stock: _stock, is_default: _isDefault, ...rest } = item;
  return {
    ...rest,
    id: crypto.randomUUID(),
    user_id: userId,
    ...(breweryId ? { brewery_id: breweryId } : {}),
    status: 'submitted',
  };
};

/**
 * Submits a copy of the item to the public library, after a confirmation when an item
 * with that name is already public or pending. Returns the saved copy, or null when
 * cancelled or refused (a message has then been shown).
 */
export const submitToPublicLibrary = async (
  item: LibraryIngredient,
  library: LibraryIngredient[],
  ctx: { userId: string; breweryId?: string | null; t: (key: any) => string },
): Promise<LibraryIngredient | null> => {
  const { t } = ctx;
  if (findDuplicateIngredients(item, library).length > 0
      && !confirm(t('duplicate_items_confirm').replace('{names}', item.name))) return null;
  const copy = publicSubmission(item, ctx.userId, ctx.breweryId);
  const result = await supabaseService.saveLibraryIngredient(copy, ctx.userId, ctx.breweryId ?? undefined);
  if (result?.error) {
    alert(`${t('save_failed')}: ${result.error.message}`);
    return null;
  }
  alert(t('item_submitted').replace('{name}', item.name));
  return copy;
};
