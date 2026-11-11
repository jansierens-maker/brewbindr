import { LibraryIngredient } from '../types';

/** A row of the stock table (#137). */
export interface StockRow {
  ingredient_type: string;
  ingredient_id: string;
  amount: number | string;
  unit: string;
  target: number | string | null;
}

export const STOCK_TYPES = ['fermentable', 'hop', 'culture', 'misc'];

/**
 * Puts the stock from the stock table on the library items. The table is the source:
 * an item without a row has no stock (also when its data still holds an old copy, and
 * for tasters, who cannot read the table). Without the table (rows === null: not
 * created yet or not reachable) the stock in the item data is kept.
 */
export const applyStock = (library: LibraryIngredient[], rows: StockRow[] | null): LibraryIngredient[] => {
  if (!rows) return library;
  const byKey = new Map(rows.map(r => [`${r.ingredient_type}:${r.ingredient_id}`, r]));
  return library.map(item => {
    if (!STOCK_TYPES.includes(item.type)) return item;
    const { stock: _old, ...rest } = item;
    const row = byKey.get(`${item.type}:${item.id}`);
    if (!row) return rest as LibraryIngredient;
    const target = row.target === null || row.target === undefined ? undefined : Number(row.target);
    return {
      ...rest,
      stock: { amount: Number(row.amount) || 0, unit: row.unit, ...(target !== undefined ? { stock_target: target } : {}) },
    } as LibraryIngredient;
  });
};
