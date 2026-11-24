import { describe, expect, it } from 'vitest';
import { stockStatus, isListed, receive, convertAmount, shoppingList, shoppingText } from '../../services/stockPlanning';
import type { LibraryIngredient, Recipe } from '../../types';

const item = (id: string, type: string, name: string, stock?: LibraryIngredient['stock']): LibraryIngredient =>
  ({ id, type, name, status: 'private', ...(stock ? { stock } : {}) });

describe('stock status', () => {
  it('lists only what is there, wanted or on order', () => {
    expect(stockStatus(item('a', 'hop', 'Saaz'))).toBe('none');
    expect(stockStatus(item('a', 'hop', 'Saaz', { amount: 0, unit: 'g' }))).toBe('none');
    expect(stockStatus(item('a', 'hop', 'Saaz', { amount: 50, unit: 'g' }))).toBe('in_stock');
    expect(stockStatus(item('a', 'hop', 'Saaz', { amount: 0, unit: 'g', stock_target: 100 }))).toBe('reorder');
    expect(stockStatus(item('a', 'hop', 'Saaz', { amount: 0, unit: 'g', stock_target: 100, ordered: 50 }))).toBe('reorder');
    expect(stockStatus(item('a', 'hop', 'Saaz', { amount: 0, unit: 'g', stock_target: 100, ordered: 100 }))).toBe('ordered');
    expect(stockStatus(item('a', 'hop', 'Saaz', { amount: 0, unit: 'g', ordered: 100 }))).toBe('ordered');
    expect(stockStatus(item('a', 'hop', 'Saaz', { amount: 200, unit: 'g', stock_target: 100 }))).toBe('in_stock');
    expect(isListed(item('a', 'hop', 'Saaz', { amount: 0, unit: 'g' }))).toBe(false);
  });

  it('receives a delivery in parts', () => {
    const ordered = item('a', 'fermentable', 'Pils', { amount: 1, unit: 'kg', ordered: 5, ordered_at: '2026-11-20' });
    const part = receive(ordered, 2);
    expect(part.stock).toEqual({ amount: 3, unit: 'kg', ordered: 3, ordered_at: '2026-11-20' });
    expect(receive(part, 3).stock).toEqual({ amount: 6, unit: 'kg' });
    expect(receive(part, 4).stock).toEqual({ amount: 7, unit: 'kg' }); // more than ordered: all of it in stock
  });

  it('converts between units of the same kind only', () => {
    expect(convertAmount(1.5, 'kilograms', 'g')).toBe(1500);
    expect(convertAmount(250, 'grams', 'kg')).toBe(0.25);
    expect(convertAmount(1, 'items', 'stuk')).toBe(1);
    expect(convertAmount(1, 'kg', 'liter')).toBeUndefined();
  });
});

describe('shopping list', () => {
  const pils = item('f1', 'fermentable', 'Pilsner malt', { amount: 2, unit: 'kg', stock_target: 5 });
  const saaz = item('h1', 'hop', 'Saaz', { amount: 30, unit: 'g', ordered: 50 });
  const yeast = item('c1', 'culture', 'WLP500', { amount: 0, unit: 'stuk', stock_target: 1, ordered: 1 });
  const recipe = {
    name: 'Pils', ingredients: {
      fermentables: [{ name: 'Pilsner malt', libraryId: 'f1', amount: { value: 4.5, unit: 'kilograms' } }],
      hops: [{ name: 'saaz', amount: { value: 100, unit: 'grams' } }],
      cultures: [{ name: 'WLP800' }],
      miscellaneous: [{ name: 'Koriander', amount: { value: 15, unit: 'grams' } }],
    },
  } as unknown as Recipe;

  it('adds the desired stock and the recipes, minus stock and orders', () => {
    expect(shoppingList([pils, saaz, yeast], [], 'nl', 'norm')).toEqual([
      { id: 'f1', type: 'fermentable', name: 'Pilsner malt', amount: 3, unit: 'kg', reasons: ['norm'] },
    ]);
    const lines = shoppingList([pils, saaz, yeast], [recipe], 'nl', 'norm');
    expect(lines).toEqual([
      { id: 'f1', type: 'fermentable', name: 'Pilsner malt', amount: 7.5, unit: 'kg', reasons: ['norm', 'Pils'] },
      { id: 'h1', type: 'hop', name: 'Saaz', amount: 20, unit: 'g', reasons: ['Pils'] },
      { type: 'culture', name: 'WLP800', amount: 1, unit: 'stuk', reasons: ['Pils'] },
      { type: 'misc', name: 'Koriander', amount: 15, unit: 'g', reasons: ['Pils'] },
    ]);
    const text = shoppingText(lines, t => t.toUpperCase(), v => String(v));
    expect(text).toContain('FERMENTABLE\n- Pilsner malt: 7.5 kg (norm, Pils)');
    expect(text).toContain('- Saaz: 20 g (Pils)');
  });
});

describe('yeast in sachets', () => {
  it('turns grams into whole sachets with the grams per sachet', async () => {
    const { toStockUnit, shoppingList } = await import('../../services/stockPlanning');
    const us05 = { id: 'c2', type: 'culture', name: 'SafAle US-05', status: 'private', pack_size: 11.5, stock: { amount: 1, unit: 'zakje', stock_target: 2 } } as LibraryIngredient;
    expect(toStockUnit(23, 'grams', us05)).toBe(2);
    expect(toStockUnit(12, 'grams', us05)).toBe(2);
    expect(toStockUnit(1, 'units', us05)).toBe(1);
    expect(toStockUnit(10, 'grams', { ...us05, pack_size: undefined })).toBeUndefined();
    const recipe = { name: 'IPA', ingredients: { fermentables: [], hops: [], cultures: [{ name: 'SafAle US-05', amount: { value: 23, unit: 'grams' } }] } } as unknown as Recipe;
    // desired 2 + recipe 2 - stock 1 = 3 sachets
    expect(shoppingList([us05], [recipe], 'nl', 'norm')).toEqual([{ id: 'c2', type: 'culture', name: 'SafAle US-05', amount: 3, unit: 'zakje', reasons: ['norm', 'IPA'] }]);
  });
});
