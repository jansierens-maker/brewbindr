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

/** The item without its stock, as stored in the ingredient row (the stock has its own table). */
export const withoutStock = (item: LibraryIngredient): LibraryIngredient => {
  if (!('stock' in item)) return item;
  const { stock: _stock, ...rest } = item;
  return rest as LibraryIngredient;
};

/** The stock table row for a brewery's own ingredient, or null when it has no stock to store. */
export const stockRowFor = (item: LibraryIngredient, breweryId?: string | null) => {
  if (!STOCK_TYPES.includes(item.type) || !item.stock || !breweryId) return null;
  if (item.status && item.status !== 'private') return null;
  return {
    ingredient_type: item.type,
    ingredient_id: item.id,
    brewery_id: breweryId,
    amount: Number(item.stock.amount) || 0,
    unit: item.stock.unit || (item.type === 'hop' || item.type === 'misc' ? 'g' : 'kg'),
    target: item.stock.stock_target ?? null,
  };
};

/** The library after a change in the stock table (realtime). */
export const applyStockChange = (
  library: LibraryIngredient[],
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  row: Partial<StockRow> | null | undefined,
): LibraryIngredient[] => {
  if (!row?.ingredient_id || !row.ingredient_type) return library;
  return library.map(item => {
    if (item.id !== row.ingredient_id || item.type !== row.ingredient_type) return item;
    if (event === 'DELETE') return withoutStock(item);
    const target = row.target === null || row.target === undefined ? undefined : Number(row.target);
    return { ...item, stock: { amount: Number(row.amount) || 0, unit: row.unit || '', ...(target !== undefined ? { stock_target: target } : {}) } };
  });
};
