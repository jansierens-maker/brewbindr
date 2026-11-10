import { describe, it, expect } from 'vitest';
import { publicSubmission } from '../../services/publicLibrary';
import { ownInstallations, ownWaterProfiles, resolveEquipment, isPrivateItem } from '../../services/calculations';
import { LibraryIngredient } from '../../types';

const eq = (id: string, extra: Partial<LibraryIngredient> = {}) =>
  ({ id, name: id, type: 'equipment', batch_size: 23, ...extra }) as LibraryIngredient;

describe('public library for installations and water profiles', () => {
  it('a submission is a new, pending copy without brewery-only settings', () => {
    const own = eq('e1', { is_default: true, status: 'private', brewery_id: 'b1', user_id: 'u0' });
    const copy = publicSubmission(own, 'u1', 'b1');
    expect(copy.id).not.toBe('e1');
    expect(copy).toMatchObject({ name: 'e1', type: 'equipment', batch_size: 23, status: 'submitted', user_id: 'u1', brewery_id: 'b1' });
    expect(copy.is_default).toBeUndefined();
    expect(own.is_default).toBe(true);
  });

  it('only own items count as installations and water profiles', () => {
    const lib = [
      eq('mine'), eq('legacy', { status: undefined }),
      eq('pending', { status: 'submitted' }), eq('public', { status: 'approved' }),
      { id: 'w1', name: 'Tap', type: 'water' } as LibraryIngredient,
      { id: 'w2', name: 'Public', type: 'water', status: 'approved' } as LibraryIngredient,
    ];
    expect(ownInstallations(lib).map(e => e.id)).toEqual(['mine', 'legacy']);
    expect(ownWaterProfiles(lib).map(e => e.id)).toEqual(['w1']);
    expect(isPrivateItem({ status: 'private' })).toBe(true);
    // a public installation with the same id as a recipe's is not used
    expect(resolveEquipment({ equipmentId: 'public' }, [eq('public', { status: 'approved' })])).toBeUndefined();
  });
});
