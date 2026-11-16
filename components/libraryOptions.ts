import type { LibraryIngredient, UserPreferences } from '../types';
import type { ComboOption } from './Combobox';
import { formatBrewNumber } from '../services/calculations';

/** Library items as choices, with what helps to pick one: colour, alpha acid, attenuation, category. */
export const libraryOptions = (items: LibraryIngredient[], prefs: UserPreferences, lang: string, group?: string): ComboOption[] =>
  items.map(l => {
    let hint: string | undefined;
    if (l.type === 'fermentable' && l.color !== undefined) hint = `${formatBrewNumber(l.color, 'color', lang, prefs)} ${prefs.colorScale.toUpperCase()}`;
    else if (l.type === 'hop' && l.alpha !== undefined) hint = `${formatBrewNumber(l.alpha, 'default', lang)} % α`;
    else if (l.type === 'culture' && l.attenuation !== undefined) hint = `${Math.round(l.attenuation)} %`;
    else if (l.type === 'style' && l.category) hint = l.category;
    return { value: l.id, label: l.name, ...(hint ? { hint } : {}), ...(group ? { group } : {}) };
  });
