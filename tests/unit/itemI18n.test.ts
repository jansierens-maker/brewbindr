import { describe, expect, it } from 'vitest';
import { displayName, displayText, allNames, allTexts, hasName, missingLanguages } from '../../services/itemI18n';
import type { LibraryIngredient } from '../../types';

const coriander: LibraryIngredient = {
  id: 'm1', type: 'misc', name: 'Coriander', name_kind: 'generic',
  names: { nl: 'Koriander', fr: 'Coriandre', en: 'Coriander' }, aliases: ['coriander seed', 'korianderzaad'],
  use_for: 'Witbier', i18n: { nl: { use_for: 'Witbier, saison' } },
};
const saaz: LibraryIngredient = { id: 'h1', type: 'hop', name: 'Saaz', name_kind: 'product', names: { fr: 'Saaz FR?' }, aliases: ['Žatec'] };

describe('library items in several languages', () => {
  it('shows the name in the reader\'s language, else the main name', () => {
    expect(displayName(coriander, 'nl')).toBe('Koriander');
    expect(displayName(coriander, 'fr')).toBe('Coriandre');
    expect(displayName({ ...coriander, names: undefined }, 'nl')).toBe('Coriander');
    expect(displayName(saaz, 'fr')).toBe('Saaz'); // a product name is not translated
  });

  it('shows a description in the reader\'s language, else the plain field', () => {
    expect(displayText(coriander, 'use_for', 'nl')).toBe('Witbier, saison');
    expect(displayText(coriander, 'use_for', 'fr')).toBe('Witbier');
    expect(displayText(coriander, 'profile', 'nl')).toBeUndefined();
  });

  it('knows every name and text, and matches a name in any language', () => {
    expect(allNames(coriander)).toEqual(['Coriander', 'Koriander', 'Coriandre', 'coriander seed', 'korianderzaad']);
    expect(allTexts(coriander)).toEqual(['Witbier', 'Witbier, saison']);
    expect(hasName(coriander, 'CORIANDRE')).toBe(true);
    expect(hasName(saaz, 'zatec')).toBe(true);
    expect(hasName(coriander, 'Cumin')).toBe(false);
  });

  it('lists the languages still to translate', () => {
    expect(missingLanguages({ ...coriander, names: { nl: 'Koriander' } }, 'name')).toEqual(['fr', 'en']);
    expect(missingLanguages(saaz, 'name')).toEqual([]);
    expect(missingLanguages(coriander, 'use_for')).toEqual(['fr', 'en']);
    expect(missingLanguages(coriander, 'profile')).toEqual([]);
  });
});
