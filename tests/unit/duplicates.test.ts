import { describe, it, expect } from 'vitest';
import type { LibraryIngredient } from '../../types';
import {
  nameKey, uniqueName, findDuplicateRecipes, findDuplicateIngredients, approvedKeys, submissionKey,
  privateRecipeNames, privateLibraryNames, findPrivateIngredient, isUniqueViolation, goesByName, findByName, sharesName,
} from '../../services/duplicates';

const recipes: any[] = [
  { id: 'a', name: 'Burton Ale', status: 'approved', brewery_id: 'b1' },
  { id: 'b', name: 'Burton Ale (2)', status: 'private', brewery_id: 'b1' },
  { id: 'c', name: 'Wit', status: 'private', brewery_id: 'b1' },
  { id: 'd', name: 'Wit', status: 'private', brewery_id: 'b2' },
];
const library: any[] = [
  { id: 'h1', name: 'East Kent Goldings', type: 'hop', status: 'approved' },
  { id: 'h2', name: 'Saaz', type: 'hop', status: 'private', brewery_id: 'b1' },
  { id: 'f1', name: 'Saaz', type: 'fermentable', status: 'private', brewery_id: 'b1' },
];

describe('nameKey', () => {
  it('ignores case, extra spaces and accents', () => {
    expect(nameKey('  Burton   ALE ')).toBe('burton ale');
    expect(nameKey('Bière')).toBe('biere');
    expect(nameKey(undefined)).toBe('');
  });
});

describe('uniqueName', () => {
  const taken = ['Burton Ale', 'Burton Ale (2)', 'Dry Stout'];
  it('keeps a free name', () => expect(uniqueName('Porter', taken)).toBe('Porter'));
  it('adds the next free number', () => expect(uniqueName('Burton Ale', taken)).toBe('Burton Ale (3)'));
  it('renumbers a copy of a copy', () => expect(uniqueName('Burton Ale (2)', taken)).toBe('Burton Ale (3)'));
  it('trims spaces', () => expect(uniqueName('  Dry Stout ', taken)).toBe('Dry Stout (2)'));
});

describe('duplicate checks', () => {
  it('finds public and pending recipes with the same name, but not itself', () => {
    expect(findDuplicateRecipes('burton ale', recipes)).toHaveLength(1);
    expect(findDuplicateRecipes('Burton Ale', recipes, 'a')).toHaveLength(0);
    expect(findDuplicateRecipes('Wit', recipes)).toHaveLength(0); // private only
  });

  it('matches ingredients on name and type', () => {
    expect(findDuplicateIngredients({ id: 'x', name: 'east kent goldings', type: 'hop' }, library)).toHaveLength(1);
    expect(findDuplicateIngredients({ id: 'x', name: 'East Kent Goldings', type: 'culture' }, library)).toHaveLength(0);
  });

  it('flags pending submissions that already exist publicly', () => {
    const keys = approvedKeys(recipes, library);
    expect(keys.has(submissionKey({ name: 'BURTON ALE', type: 'all_grain', _table: 'recipes' }))).toBe(true);
    expect(keys.has(submissionKey({ name: 'East Kent Goldings', type: 'hop', _table: 'hops' }))).toBe(true);
    expect(keys.has(submissionKey({ name: 'Wit', type: 'all_grain', _table: 'recipes' }))).toBe(false);
  });
});

describe('per-brewery names', () => {
  it('lists private recipe names of one brewery', () => {
    expect(privateRecipeNames(recipes, 'b1')).toEqual(['Burton Ale (2)', 'Wit']);
    expect(privateRecipeNames(recipes, 'b1', undefined, 'c')).toEqual(['Burton Ale (2)']);
  });

  it('also counts your own recipe that has no brewery yet', () => {
    const list: any[] = [...recipes, { id: 'e', name: 'Saison', status: 'private', user_id: 'u1' }];
    expect(privateRecipeNames(list, 'b1', 'u1')).toEqual(['Burton Ale (2)', 'Wit', 'Saison']);
    expect(privateRecipeNames(list, 'b2', 'u2')).toEqual(['Wit']);
  });

  it('lists private library names per type', () => {
    expect(privateLibraryNames(library, 'hop', 'b1')).toEqual(['Saaz']);
    expect(findPrivateIngredient(library, ' saaz ', 'fermentable', 'b1')?.id).toBe('f1');
    expect(findPrivateIngredient(library, 'Saaz', 'hop', 'b2')).toBeUndefined();
  });

  it('recognises a Postgres unique violation', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '42501' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('names in several languages (#212)', () => {
  const coriander = { id: 'm1', type: 'misc', name: 'Koriander', names: { fr: 'Coriandre', en: 'Coriander' }, aliases: ['coriander seed'], status: 'private' } as LibraryIngredient;
  it('finds an item by a translation or alias, the exact name first', () => {
    expect(goesByName(coriander, ' CORIANDER ')).toBe(true);
    expect(goesByName(coriander, 'Coriander Seed')).toBe(true);
    expect(goesByName(coriander, 'Cumin')).toBe(false);
    const exact = { ...coriander, id: 'm2', name: 'Coriander', names: undefined, aliases: undefined };
    expect(findByName([coriander, exact], 'coriander')?.id).toBe('m2');
    expect(findByName([coriander], 'coriandre')?.id).toBe('m1');
  });

  it('sees two items with a shared name as duplicates', () => {
    expect(sharesName(coriander, { name: 'Coriandre' })).toBe(true);
    const pub = { ...coriander, id: 'p1', status: 'approved', name: 'Coriander', names: { nl: 'Koriander' }, aliases: [] } as LibraryIngredient;
    expect(findDuplicateIngredients({ id: 'x', type: 'misc', name: 'Koriander' }, [pub]).map(i => i.id)).toEqual(['p1']);
    expect(approvedKeys([], [pub]).has('misc:koriander')).toBe(true);
  });
});
