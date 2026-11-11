import { describe, it, expect } from 'vitest';
import { applyStock } from '../../services/stock';
import { LibraryIngredient } from '../../types';

const lib = [
  { id: 'h1', name: 'Saaz', type: 'hop', stock: { amount: 999, unit: 'g' } },
  { id: 'f1', name: 'Pils', type: 'fermentable' },
  { id: 'c1', name: 'US-05', type: 'culture', stock: { amount: 3, unit: 'pkg' } },
  { id: 'e1', name: 'Brewie', type: 'equipment' },
] as LibraryIngredient[];

describe('applyStock', () => {
  it('takes the stock from the table rows', () => {
    const out = applyStock(lib, [
      { ingredient_type: 'hop', ingredient_id: 'h1', amount: '80', unit: 'g', target: '250' },
      { ingredient_type: 'fermentable', ingredient_id: 'f1', amount: 5.5, unit: 'kg', target: null },
    ]);
    expect(out[0].stock).toEqual({ amount: 80, unit: 'g', stock_target: 250 });
    expect(out[1].stock).toEqual({ amount: 5.5, unit: 'kg' });
    expect(out[2].stock).toBeUndefined(); // no row: no stock, even with an old copy in the data
    expect(out[3]).toBe(lib[3]);          // other kinds untouched
  });
  it('a taster (no rows) sees no stock', () => {
    expect(applyStock(lib, []).every(i => !i.stock)).toBe(true);
  });
  it('keeps the data stock while the table is not there', () => {
    expect(applyStock(lib, null)).toBe(lib);
  });
});
