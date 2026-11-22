import { describe, expect, it } from 'vitest';
import { toCsv, toJson, parseCsv, importTranslations, applyImported, exportColumns } from '../../services/translationExport';
import type { LibraryIngredient } from '../../types';

const items: LibraryIngredient[] = [
  { id: 'm1', type: 'misc', name: 'Orange peel', use_for: 'Witbier; "Belgian" ales', names: { nl: 'Sinaasappelschil' }, status: 'approved' },
  { id: 'h1', type: 'hop', name: 'Saaz', name_kind: 'product', aliases: ['Žatec'], status: 'approved' },
];

describe('translating outside the app (#212)', () => {
  it('exports the names and the descriptions that occur', () => {
    expect(exportColumns(items)).toEqual(['id', 'type', 'name', 'name_kind', 'name_nl', 'name_fr', 'name_en', 'aliases', 'use_for', 'use_for_nl', 'use_for_fr', 'use_for_en']);
    const csv = toCsv(items);
    expect(csv.startsWith('﻿id;type;name')).toBe(true);
    expect(csv).toContain('"Witbier; ""Belgian"" ales"');
  });

  it('reads its own CSV back, with ; , or tab, quotes and line breaks', () => {
    const rows = parseCsv(toCsv(items));
    expect(rows[0]).toMatchObject({ id: 'm1', name_nl: 'Sinaasappelschil', use_for: 'Witbier; "Belgian" ales' });
    expect(parseCsv('id,name_fr\nm1,"Écorce\nd\'orange"\n')).toEqual([{ id: 'm1', name_fr: "Écorce\nd'orange" }]);
    expect(parseCsv('id\tname_fr\r\nm1\tÉcorce\r\n')).toEqual([{ id: 'm1', name_fr: 'Écorce' }]);
  });

  it('imports a filled-in CSV or JSON; unknown ids are reported, empty cells change nothing', () => {
    const csv = 'id;name_kind;name_nl;name_fr;aliases;use_for_fr\nm1;;Sinaasappelschil;Écorce d\'orange;curaçao peel | bitter orange;Bière blanche\nzz;;X;;;\n';
    const r = importTranslations(csv, 'vertaling.csv', items);
    expect(r.unknown).toEqual(['zz']);
    const merged = applyImported(items[0], r.proposals[0]);
    expect(merged.names).toEqual({ nl: 'Sinaasappelschil', fr: "Écorce d'orange" });
    expect(merged.aliases).toEqual(['curaçao peel', 'bitter orange']);
    expect(merged.i18n).toEqual({ fr: { use_for: 'Bière blanche' } });
    expect(merged.name_kind).toBeUndefined();

    const json = JSON.parse(toJson(items));
    json.items[1].name_kind = 'product';
    json.items[0].names.en = 'Orange peel';
    json.items[0].i18n.nl.use_for = 'Witbier en Belgische bieren';
    const j = importTranslations(JSON.stringify(json), 'x.json', items);
    expect(applyImported(items[0], j.proposals[0])).toMatchObject({ names: { nl: 'Sinaasappelschil', en: 'Orange peel' }, i18n: { nl: { use_for: 'Witbier en Belgische bieren' } } });
    expect(applyImported(items[1], j.proposals[1]).name_kind).toBe('product');
    expect(importTranslations('{bad', 'x.json', items).error).toMatch(/JSON/);
    expect(importTranslations('a;b\n1;2', 'x.csv', items).error).toMatch(/id/);
  });
});
