import { describe, it, expect } from 'vitest';
import { canEditRecipe, canManageRecipes } from '../../services/permissions';

const mine = { user_id: 'u1', brewery_id: 'b1', status: 'private' as const };
const colleague = { user_id: 'u2', brewery_id: 'b1', status: 'private' as const };
const otherBrewery = { user_id: 'u3', brewery_id: 'b2', status: 'private' as const };
const approved = { user_id: 'u1', brewery_id: 'b1', status: 'approved' as const };

describe('canEditRecipe', () => {
  it('lets brewery admins and brewmasters edit every recipe of their brewery', () => {
    for (const breweryRole of ['admin', 'brewmaster']) {
      const ctx = { userId: 'u1', breweryId: 'b1', breweryRole };
      expect(canEditRecipe(mine, ctx)).toBe(true);
      expect(canEditRecipe(colleague, ctx)).toBe(true);
      expect(canEditRecipe(otherBrewery, ctx)).toBe(false);
    }
  });

  it('does not let brewers or tasters edit recipes, not even their own', () => {
    for (const breweryRole of ['brewer', 'taster']) {
      expect(canEditRecipe(mine, { userId: 'u1', breweryId: 'b1', breweryRole })).toBe(false);
    }
  });

  it('keeps approved recipes for the global admin', () => {
    expect(canEditRecipe(approved, { userId: 'u1', breweryId: 'b1', breweryRole: 'admin' })).toBe(false);
    expect(canEditRecipe(approved, { userId: 'u9', isAdmin: true })).toBe(true);
    expect(canEditRecipe(otherBrewery, { userId: 'u9', isAdmin: true })).toBe(true);
  });

  it('falls back to the owner without a brewery, and allows unsaved recipes', () => {
    expect(canEditRecipe({ user_id: 'u1' }, { userId: 'u1' })).toBe(true);
    expect(canEditRecipe({ user_id: 'u2' }, { userId: 'u1' })).toBe(false);
    expect(canEditRecipe({}, { userId: 'u1', breweryId: 'b1', breweryRole: 'taster' })).toBe(true);
  });
});

describe('canManageRecipes', () => {
  it('follows the brewery role', () => {
    expect(canManageRecipes({ breweryRole: 'brewmaster' })).toBe(true);
    expect(canManageRecipes({ breweryRole: 'brewer' })).toBe(false);
    expect(canManageRecipes({ breweryRole: null })).toBe(true);
    expect(canManageRecipes({ breweryRole: 'taster', isAdmin: true })).toBe(true);
  });
});

import { canManageBrews, canManageLibrary } from '../../services/permissions';
describe('rights per brewery role (mirror the RLS policies)', () => {
  const roles = ['admin', 'brewmaster', 'brewer', 'taster'] as const;
  it('brews: admin, brewmaster and brewer; not taster', () => {
    expect(roles.map(r => canManageBrews({ breweryRole: r }))).toEqual([true, true, true, false]);
  });
  it('recipes and library: admin and brewmaster only', () => {
    expect(roles.map(r => canManageRecipes({ breweryRole: r }))).toEqual([true, true, false, false]);
    expect(roles.map(r => canManageLibrary({ breweryRole: r }))).toEqual([true, true, false, false]);
  });
  it('the app admin may do everything', () => {
    expect(canManageBrews({ breweryRole: 'taster', isAdmin: true })).toBe(true);
    expect(canManageLibrary({ breweryRole: 'taster', isAdmin: true })).toBe(true);
  });
  it('without a brewery (local use) nothing is blocked', () => {
    expect(canManageBrews({})).toBe(true);
    expect(canManageLibrary({})).toBe(true);
  });
});
