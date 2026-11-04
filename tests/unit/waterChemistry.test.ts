import { describe, it, expect } from 'vitest';
import {
  treatedWater, residualAlkalinity, alkalinity, sulfateChlorideRatio, ratioCharacter, suggestSalts,
  ionsOf, WATER_PRESETS, ZERO_IONS, SALTS, Ions,
  estimateMashPh, lacticAcidFor, maltClass, maltDistilledPh,
} from '../../services/waterChemistry';

const preset = (key: string) => ionsOf(WATER_PRESETS.find(p => p.key === key));
const close = (a: Ions, b: Partial<Ions>, digits = 0) =>
  Object.entries(b).forEach(([k, v]) => expect(a[k as keyof Ions]).toBeCloseTo(v as number, digits));

describe('salts', () => {
  it('add the usual ppm per gram per litre', () => {
    // 1 g gypsum in 1 L: 233 mg/L calcium, 558 mg/L sulfate
    close(treatedWater(ZERO_IONS, 0, { gypsum: 1 }, 1), { ca: 233, so4: 558 });
    // 1 g in 20 L: about 12 / 28 ppm
    close(treatedWater(ZERO_IONS, 0, { gypsum: 1 }, 20), { ca: 11.6, so4: 27.9 }, 1);
    close(treatedWater(ZERO_IONS, 0, { cacl2: 1 }, 1), { ca: 273, cl: 482 });
    close(treatedWater(ZERO_IONS, 0, { epsom: 1 }, 1), { mg: 99, so4: 390 });
    close(treatedWater(ZERO_IONS, 0, { nacl: 1 }, 1), { na: 393, cl: 607 });
    close(treatedWater(ZERO_IONS, 0, { nahco3: 1 }, 1), { na: 274, hco3: 726 });
  });

  it('handles calcium chloride solutions per ml', () => {
    expect(SALTS.cacl2_33.unit).toBe('ml');
    // 1 ml 33 %: 0.436 g CaCl2 → 157 mg calcium, 278 mg chloride
    close(treatedWater(ZERO_IONS, 0, { cacl2_33: 1 }, 1), { ca: 157, cl: 278 });
  });

  it('dilutes the source water with osmosis water', () => {
    close(treatedWater(preset('munich'), 50, {}, 20), { ca: 38.5, hco3: 147.5 }, 1);
    close(treatedWater(preset('munich'), 100, {}, 20), ZERO_IONS);
  });
});

describe('alkalinity', () => {
  it('converts bicarbonate to alkalinity as CaCO3', () => expect(alkalinity({ ...ZERO_IONS, hco3: 61 })).toBeCloseTo(50, 5));

  it('computes residual alkalinity (Kolbach)', () => {
    // Munich: 242 alkalinity − 77/1.4 − 17/1.7 = 177
    expect(residualAlkalinity(preset('munich'))).toBeCloseTo(177, 0);
    expect(residualAlkalinity(preset('pilsen'))).toBeLessThan(10);
    expect(residualAlkalinity(preset('ro'))).toBe(0);
  });
});

describe('sulfate / chloride', () => {
  it('describes the balance', () => {
    expect(ratioCharacter(sulfateChlorideRatio(preset('burton')))).toBe('bitter');
    expect(ratioCharacter(sulfateChlorideRatio(preset('light_balanced')))).toBe('balanced');
    expect(ratioCharacter(sulfateChlorideRatio(preset('light_malty')))).toBe('malty');
    expect(sulfateChlorideRatio(ZERO_IONS)).toBeUndefined();
  });
});

describe('salt suggestions', () => {
  it('reaches a light target from osmosis water', () => {
    const target = preset('light_balanced');
    const salts = suggestSalts(ZERO_IONS, target, 25);
    const result = treatedWater(ZERO_IONS, 0, salts, 25);
    expect(Math.abs(result.ca - target.ca)).toBeLessThan(8);
    expect(Math.abs(result.so4 - target.so4)).toBeLessThan(10);
    expect(Math.abs(result.cl - target.cl)).toBeLessThan(10);
    expect(salts.nahco3).toBeUndefined(); // target has no bicarbonate
  });

  it('never suggests negative amounts and adds nothing when the water is already richer', () => {
    const salts = suggestSalts(preset('burton'), preset('light_balanced'), 25);
    Object.values(salts).forEach(v => expect(v).toBeGreaterThan(0));
    expect(salts.gypsum).toBeUndefined();
  });

  it('uses the chosen calcium chloride form', () => {
    const salts = suggestSalts(ZERO_IONS, preset('light_malty'), 25, 'cacl2');
    expect(salts.cacl2).toBeGreaterThan(0);
    expect(salts.cacl2_33).toBeUndefined();
  });
});

describe('profiles', () => {
  it('reads library water profiles', () => {
    expect(ionsOf({ calcium: 100, bicarbonate: 250 } as any)).toEqual({ ca: 100, mg: 0, na: 0, cl: 0, so4: 0, hco3: 250 });
    expect(ionsOf(undefined)).toEqual(ZERO_IONS);
  });
});

describe('mash pH', () => {
  const pils = (kg: number) => ({ name: 'Pilsner malt', kg, colorSrm: 2 });
  const ro = ZERO_IONS;

  it('gives the distilled-water pH of the malt with osmosis water', () =>
    expect(estimateMashPh([pils(5)], ro, 15)).toBeCloseTo(5.72, 2));

  it('rises with alkaline water and falls with calcium', () => {
    const munich = preset('munich');
    expect(estimateMashPh([pils(5)], munich, 15)!).toBeGreaterThan(5.85); // RA 177
    const calcium = treatedWater(ro, 0, { cacl2: 3 }, 15);
    expect(estimateMashPh([pils(5)], calcium, 15)!).toBeLessThan(5.72);
  });

  it('is lower with crystal and roasted malt', () => {
    const base = estimateMashPh([pils(5)], ro, 15)!;
    const crystal = estimateMashPh([pils(4.5), { name: 'Caramunich', kg: 0.5, colorSrm: 60 }], ro, 15)!;
    const roast = estimateMashPh([pils(4.5), { name: 'Carafa III', kg: 0.5, colorSrm: 500 }], ro, 15)!;
    expect(crystal).toBeLessThan(base);
    expect(roast).toBeLessThan(crystal);
    expect(roast).toBeCloseTo(0.9 * 5.72 + 0.1 * 4.71, 2);
  });

  it('counts acidulated malt as acid: about 0.1 pH per 1 %', () => {
    const plain = estimateMashPh([pils(5)], ro, 15)!;
    const acid = estimateMashPh([pils(4.95), { name: 'Sauermalz', kg: 0.05, colorSrm: 2 }], ro, 15)!;
    expect(plain - acid).toBeCloseTo(0.1, 2);
  });

  it('computes the lactic acid for the target pH', () => {
    const water = preset('munich');
    const ml = lacticAcidFor([pils(5)], water, 15, 5.4);
    expect(ml).toBeGreaterThan(0);
    expect(estimateMashPh([pils(5)], water, 15, ml)).toBeCloseTo(5.4, 1);
    expect(lacticAcidFor([pils(5)], ro, 15, 5.8)).toBe(0); // already below
  });

  it('classifies malts', () => {
    expect(maltClass('Chocolate malt', 350)).toBe('roast');
    expect(maltClass('CaraHell', 10)).toBe('crystal');
    expect(maltClass('Pale Ale', 3)).toBe('base');
    expect(maltClass('Mystery', 120)).toBe('crystal');
    expect(maltClass('Mystery', 400)).toBe('roast');
    expect(maltDistilledPh('crystal', 60)).toBeCloseTo(4.92, 2);
  });
});
