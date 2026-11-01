// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseBeerXml } from '../../services/beerXmlService';
import { exportToBeerXml } from '../../services/beerXmlExportService';

// BeerXML stores kg, kg (hops) and litres; typical exports carry conversion noise.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
  <RECIPE>
    <NAME>Test Bitter</NAME>
    <TYPE>All Grain</TYPE>
    <BREWER>Tester</BREWER>
    <BATCH_SIZE>19.684255</BATCH_SIZE>
    <BOIL_TIME>60</BOIL_TIME>
    <EFFICIENCY>72</EFFICIENCY>
    <EST_OG>1.0531356220799766</EST_OG>
    <EST_FG>1.0148779741823934</EST_FG>
    <IBU>34.6</IBU>
    <FERMENTABLES>
      <FERMENTABLE><NAME>Pale Malt (2 Row) UK</NAME><TYPE>Grain</TYPE><AMOUNT>4.082328</AMOUNT><YIELD>78</YIELD><COLOR>3</COLOR></FERMENTABLE>
      <FERMENTABLE><NAME>Light DME</NAME><TYPE>Dry Extract</TYPE><AMOUNT>0.5</AMOUNT><COLOR>4</COLOR></FERMENTABLE>
    </FERMENTABLES>
    <HOPS>
      <HOP><NAME>Goldings, East Kent</NAME><ALPHA>5</ALPHA><AMOUNT>0.063786</AMOUNT><USE>Boil</USE><TIME>60</TIME></HOP>
      <HOP><NAME>Fuggle</NAME><ALPHA>4.5</ALPHA><AMOUNT>0.02</AMOUNT><USE>Aroma</USE><TIME>15</TIME><FORM>Leaf</FORM></HOP>
      <HOP><NAME>Northern Brewer</NAME><ALPHA>8</ALPHA><AMOUNT>0.01</AMOUNT><USE>First Wort</USE><TIME>60</TIME><FORM>Pellet</FORM></HOP>
    </HOPS>
    <YEASTS>
      <YEAST><NAME>London Ale</NAME><TYPE>Ale</TYPE><FORM>Liquid</FORM><ATTENUATION>73</ATTENUATION></YEAST>
    </YEASTS>
  </RECIPE>
</RECIPES>`;

describe('parseBeerXml', () => {
  const result = parseBeerXml(xml);
  const recipe = result.recipes[0];

  it('reads the recipe and its ingredients', () => {
    expect(result.recipes).toHaveLength(1);
    expect(recipe.name).toBe('Test Bitter');
    expect(recipe.ingredients.fermentables[0].name).toBe('Pale Malt (2 Row) UK');
    expect(recipe.ingredients.hops[0].name).toBe('Goldings, East Kent');
    expect(recipe.ingredients.cultures[0].name).toBe('London Ale');
  });

  it('rounds imported values to the agreed decimals', () => {
    expect(recipe.batch_size.value).toBe(19.7);
    expect(recipe.ingredients.fermentables[0].amount).toEqual({ unit: 'kilograms', value: 4.082 });
    expect(recipe.ingredients.hops[0].amount).toEqual({ unit: 'grams', value: 64 });
    expect(recipe.specifications?.og?.value).toBe(1.053);
    expect(recipe.specifications?.ibu?.value).toBe(35);
  });

  it('reads fermentable types, hop use and hop form', () => {
    expect(recipe.ingredients.fermentables.map(f => f.type)).toEqual(['grain', 'dry_extract']);
    expect(recipe.ingredients.hops.map(h => [h.use, h.form])).toEqual([
      ['boil', undefined], ['whirlpool', 'leaf'], ['first_wort', 'pellet'],
    ]);
  });

  it('returns an empty result for XML without recipes', () => {
    expect(parseBeerXml('<RECIPES></RECIPES>').recipes).toHaveLength(0);
  });
});

describe('exportToBeerXml', () => {
  it('keeps types, hop use and form, and converts imperial amounts to kg', () => {
    const original = parseBeerXml(xml).recipes[0];
    original.ingredients.fermentables[1] = { ...original.ingredients.fermentables[1], amount: { unit: 'pounds', value: 1 } };
    const again = parseBeerXml(exportToBeerXml(original)).recipes[0];
    expect(again.ingredients.fermentables.map(f => f.type)).toEqual(['grain', 'dry_extract']);
    expect(again.ingredients.fermentables[1].amount).toEqual({ unit: 'kilograms', value: 0.454 });
    expect(again.ingredients.hops.map(h => [h.use, h.form])).toEqual([
      ['boil', 'pellet'], ['whirlpool', 'leaf'], ['first_wort', 'pellet'],
    ]);
  });
});
