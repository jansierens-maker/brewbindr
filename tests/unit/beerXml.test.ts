// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseBeerXml } from '../../services/beerXmlService';

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
    </FERMENTABLES>
    <HOPS>
      <HOP><NAME>Goldings, East Kent</NAME><ALPHA>5</ALPHA><AMOUNT>0.063786</AMOUNT><USE>Boil</USE><TIME>60</TIME></HOP>
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

  it('returns an empty result for XML without recipes', () => {
    expect(parseBeerXml('<RECIPES></RECIPES>').recipes).toHaveLength(0);
  });
});
