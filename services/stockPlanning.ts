import type { LibraryIngredient, Recipe } from '../types';
import { findByName } from './duplicates';
import { displayName, localName } from './itemI18n';

/**
 * What the stock screen shows and what to buy: desired stock (a standing level), what is
 * ordered and not delivered yet, deliveries, and a shopping list.
 */

export type StockStatus = 'reorder' | 'ordered' | 'in_stock' | 'none';
export const STOCK_TYPES = ['fermentable', 'hop', 'culture', 'misc'];

const n = (v: number | undefined) => (v && v > 0 ? v : 0);

/**
 * - reorder: below the desired stock, also counting what is on order
 * - ordered: something is on order (and that is enough to reach the desired stock)
 * - in_stock: there is some, or the desired stock is reached
 * - none: nothing, no desired stock, nothing ordered (not listed)
 */
export const stockStatus = (item: Pick<LibraryIngredient, 'stock'>): StockStatus => {
  const s = item.stock;
  if (!s) return 'none';
  const target = n(s.stock_target);
  if (target && n(s.amount) + n(s.ordered) < target) return 'reorder';
  if (n(s.ordered)) return 'ordered';
  if (n(s.amount) || target) return 'in_stock';
  return 'none';
};

/** Listed on the stock screen: there is some, a desired stock is set, or it is on order. */
export const isListed = (item: Pick<LibraryIngredient, 'stock'>) => stockStatus(item) !== 'none';

/** A delivery: the amount goes to the stock and off the order; a full delivery clears the order. */
export const receive = (item: LibraryIngredient, quantity: number): LibraryIngredient => {
  const s = item.stock;
  if (!s || !(quantity > 0)) return item;
  const left = Math.round((n(s.ordered) - quantity) * 1000) / 1000;
  const { ordered: _o, ordered_at: _a, ...rest } = s;
  return {
    ...item,
    stock: { ...rest, amount: Math.round((n(s.amount) + quantity) * 1000) / 1000, ...(left > 0 ? { ordered: left, ordered_at: s.ordered_at } : {}) },
  };
};

// ---- Units ----

const STOCK_UNIT: Record<string, string> = { kg: 'kilograms', g: 'grams', liter: 'liters', l: 'liters', ml: 'milliliters', stuk: 'items', zakje: 'sachets' };
const FACTOR: Record<string, [string, number]> = {
  kilograms: ['mass', 1000], grams: ['mass', 1], pounds: ['mass', 453.592], ounces: ['mass', 28.3495],
  liters: ['volume', 1000], milliliters: ['volume', 1], gallons: ['volume', 3785.41],
  items: ['count', 1], each: ['count', 1], pkg: ['count', 1], packages: ['count', 1], units: ['count', 1], sachets: ['count', 1],
};
const canonical = (unit: string | undefined) => {
  const u = (unit ?? '').toLowerCase().trim();
  if (STOCK_UNIT[u]) return STOCK_UNIT[u];
  if (u.startsWith('kg') || u.startsWith('kilo')) return 'kilograms';
  if (u === 'g' || u.startsWith('gram')) return 'grams';
  if (u.startsWith('lb') || u.startsWith('pound')) return 'pounds';
  if (u.startsWith('oz') || u.startsWith('ounce')) return 'ounces';
  if (u === 'ml' || u.startsWith('millil')) return 'milliliters';
  if (u.startsWith('l')) return 'liters';
  if (u.startsWith('gal')) return 'gallons';
  if (u.startsWith('zak') || u.startsWith('sachet')) return 'sachets';
  if (u.startsWith('item') || u.startsWith('st') || u.startsWith('unit') || u.startsWith('pkg') || u.startsWith('pack')) return 'items';
  return u;
};

/** An amount in another unit, or undefined when the units do not compare (mass vs volume). */
export const convertAmount = (value: number, from: string | undefined, to: string | undefined): number | undefined => {
  const a = FACTOR[canonical(from)], b = FACTOR[canonical(to)];
  if (!a || !b || a[0] !== b[0]) return canonical(from) === canonical(to) ? value : undefined;
  return (value * a[1]) / b[1];
};

/**
 * An amount in the unit an item's stock is kept in. Sachets ('zakje') convert from grams with
 * the item's grams per sachet (rounded up to whole sachets); a count (units) is one sachet each.
 */
export const toStockUnit = (value: number, from: string | undefined, item: Pick<LibraryIngredient, 'pack_size' | 'stock' | 'type'>): number | undefined => {
  const unit = item.stock?.unit || defaultUnit(item.type);
  if (canonical(unit) === 'sachets' && FACTOR[canonical(from)]?.[0] === 'mass') {
    const grams = convertAmount(value, from, 'g');
    return grams !== undefined && item.pack_size && item.pack_size > 0 ? Math.ceil(grams / item.pack_size - 1e-9) : undefined;
  }
  return convertAmount(value, from, unit);
};

/** Grams per sachet as text, e.g. "11,5 g", for showing next to a stock in sachets. */
export const isSachets = (unit: string | undefined) => canonical(unit) === 'sachets';

// ---- Shopping list ----

export interface ShoppingLine {
  /** The library item, when the ingredient is in the library */
  id?: string;
  type: string;
  name: string;
  amount: number;
  unit: string;
  /** Why: below the desired stock, and/or the recipes that need it */
  reasons: string[];
}

const defaultUnit = (type: string) => (type === 'hop' || type === 'misc' ? 'g' : type === 'culture' ? 'stuk' : 'kg');
const round = (v: number, unit: string) => (unit === 'g' || unit === 'ml' || unit === 'stuk' || unit === 'zakje' ? Math.ceil(v - 1e-9) : Math.ceil(v * 100) / 100);

/**
 * What to buy: for each ingredient, what the chosen recipes need plus the desired stock,
 * minus what is in stock and on order. Ingredients a recipe uses that are not in the library
 * are listed with the recipe's amount.
 */
export const shoppingList = (own: LibraryIngredient[], recipes: Recipe[], lang: string, normLabel: string): ShoppingLine[] => {
  const items = own.filter(i => STOCK_TYPES.includes(i.type));
  const need = new Map<string, { item: LibraryIngredient; required: number; reasons: string[] }>();
  const loose = new Map<string, ShoppingLine>();

  for (const r of recipes) {
    const ing = r.ingredients;
    const uses: { type: string; name: string; libraryId?: string; value: number; unit: string }[] = [
      ...(ing?.fermentables ?? []).map(f => ({ type: 'fermentable', name: f.name, libraryId: f.libraryId, value: f.amount?.value ?? 0, unit: f.amount?.unit ?? 'kg' })),
      ...(ing?.hops ?? []).map(h => ({ type: 'hop', name: h.name, libraryId: h.libraryId, value: h.amount?.value ?? 0, unit: h.amount?.unit ?? 'g' })),
      // Yeast: its amount (grams or units); without one, one packet
      ...(ing?.cultures ?? []).map(c => ({ type: 'culture', name: c.name, libraryId: c.libraryId, value: c.amount?.value && c.amount.value > 0 ? c.amount.value : 1, unit: c.amount?.value && c.amount.value > 0 ? c.amount.unit : 'items' })),
      ...(ing?.miscellaneous ?? []).map(m => ({ type: 'misc', name: m.name, libraryId: m.libraryId, value: m.amount?.value ?? 0, unit: m.amount?.unit ?? 'g' })),
    ];
    for (const u of uses) {
      if (!u.name || !(u.value > 0)) continue;
      const pool = items.filter(i => i.type === u.type);
      const item = (u.libraryId ? pool.find(i => i.id === u.libraryId) : undefined) ?? findByName(pool, u.name);
      if (item) {
        const unit = item.stock?.unit || defaultUnit(item.type);
        const value = toStockUnit(u.value, u.unit, item) ?? (item.type === 'culture' ? 1 : undefined);
        if (value === undefined) continue;
        const e = need.get(item.id) ?? { item, required: 0, reasons: [] };
        e.required += value;
        if (!e.reasons.includes(r.name)) e.reasons.push(r.name);
        need.set(item.id, e);
      } else {
        const key = `${u.type}:${u.name.toLowerCase()}:${u.unit}`;
        const e = loose.get(key) ?? { type: u.type, name: localName({ name: u.name }, own, lang, u.type), amount: 0, unit: u.unit, reasons: [] };
        e.amount += u.value;
        if (!e.reasons.includes(r.name)) e.reasons.push(r.name);
        loose.set(key, e);
      }
    }
  }
  // Every item with a desired stock counts, also when no recipe needs it
  for (const item of items) {
    if (n(item.stock?.stock_target) && !need.has(item.id)) need.set(item.id, { item, required: 0, reasons: [] });
  }

  const lines: ShoppingLine[] = [];
  for (const { item, required, reasons } of need.values()) {
    const s = item.stock;
    const unit = s?.unit || defaultUnit(item.type);
    const target = n(s?.stock_target);
    const short = required + target - n(s?.amount) - n(s?.ordered);
    if (short <= 0.0005) continue;
    lines.push({ id: item.id, type: item.type, name: displayName(item, lang), amount: round(short, unit), unit, reasons: [...(target ? [normLabel] : []), ...reasons] });
  }
  const SHORT: Record<string, string> = { kilograms: 'kg', grams: 'g', liters: 'liter', milliliters: 'ml', items: 'stuk', sachets: 'zakje', pounds: 'lb', ounces: 'oz', gallons: 'gal' };
  for (const l of loose.values()) lines.push({ ...l, amount: Math.round(l.amount * 1000) / 1000, unit: SHORT[canonical(l.unit)] ?? l.unit });
  const order = (t: string) => STOCK_TYPES.indexOf(t);
  return lines.sort((a, b) => order(a.type) - order(b.type) || a.name.localeCompare(b.name));
};

/** The list as plain text, per kind (to copy or download). */
export const shoppingText = (lines: ShoppingLine[], typeLabel: (t: string) => string, fmt: (v: number) => string) => {
  const parts: string[] = [];
  for (const type of STOCK_TYPES) {
    const of = lines.filter(l => l.type === type);
    if (!of.length) continue;
    parts.push(typeLabel(type), ...of.map(l => `- ${l.name}: ${fmt(l.amount)} ${l.unit}${l.reasons.length ? ` (${l.reasons.join(', ')})` : ''}`), '');
  }
  return parts.join('\n').trim() + '\n';
};
