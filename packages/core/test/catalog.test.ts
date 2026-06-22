import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import type { FilePath, ItemDefinition } from '../src/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const upstreamRoot = path.join(here, '../../../assets/sheet_definitions');

function loadFixture(relPath: FilePath): ItemDefinition {
  const full = path.join(upstreamRoot, relPath);
  return JSON.parse(readFileSync(full, 'utf8')) as ItemDefinition;
}

function loadRecords(
  rels: readonly FilePath[],
): Record<FilePath, ItemDefinition> {
  const out: Record<FilePath, ItemDefinition> = {};
  for (const rel of rels) out[rel] = loadFixture(rel);
  return out;
}

describe('createCatalog with real upstream JSON', () => {
  it('indexes three real sheet definitions by itemId and type_name', () => {
    const records = loadRecords([
      'body/body.json',
      'hair/afro/hair_afro.json',
      'head/faces/face_blush.json',
    ]);
    const { catalog, warnings } = createCatalog(records);

    expect(warnings).toEqual([]);

    expect(Array.from(catalog.byItemId.keys()).sort()).toEqual([
      'body',
      'face_blush',
      'hair_afro',
    ]);
    expect(catalog.byItemId.get('body')?.name).toBe('Body Color');
    expect(catalog.byItemId.get('hair_afro')?.name).toBe('Afro');
    expect(catalog.byItemId.get('face_blush')?.name).toBe('Blush');

    expect(Array.from(catalog.byTypeName.keys()).sort()).toEqual([
      'body',
      'expression',
      'hair',
    ]);
    expect(catalog.byTypeName.get('body')?.length).toBe(1);
    expect(catalog.byTypeName.get('hair')?.[0]?.name).toBe('Afro');
    expect(catalog.byTypeName.get('expression')?.[0]?.name).toBe('Blush');

    expect(catalog.typeNames.length).toBe(3);
    expect(catalog.aliases.size).toBe(0);
  });

  it('preserves insertion order in byTypeName lists', () => {
    const records = loadRecords([
      'head/faces/face_blush.json',
      'head/faces/face_angry.json',
      'head/faces/face_sad.json',
    ]);
    const { catalog } = createCatalog(records);

    const expressions = catalog.byTypeName.get('expression');
    expect(expressions?.map((e) => e.name)).toEqual(['Blush', 'Angry', 'Sad']);
  });

  it('builds an alias map from the upstream belt_formal fixture', () => {
    const records = loadRecords(['torso/waist/belt_formal.json']);
    const { catalog, warnings } = createCatalog(records);

    expect(warnings).toEqual([]);
    const belt = catalog.aliases.get('belt');
    expect(belt).toBeDefined();
    expect(belt!.get('Other_belts_formal')).toEqual({
      typeName: 'belt',
      name: 'Formal_Belt',
      variant: 'brown',
    });
  });

  it('builds a wildcard alias entry from head_wrinkles', () => {
    const records = loadRecords(['head/head_wrinkles.json']);
    const { catalog } = createCatalog(records);
    const wrinkes = catalog.aliases.get('wrinkes');
    expect(wrinkes?.get('*')).toEqual({
      typeName: 'wrinkles',
      name: '*',
      variant: '*',
    });
  });

  it('warns when an alias targets a recolor-only item (Q2 deferral)', () => {
    const records = loadRecords([
      'arms/shoulders/shoulders_epaulets.json',
    ]);
    const { catalog, warnings } = createCatalog(records);

    // shoulders_epaulets has variants in `recolors[0].variants`, not in
    // `variants`. With raw JSON the alias targets cannot resolve.
    expect(catalog.aliases.size).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.path).toBe('arms/shoulders/shoulders_epaulets.json');
      expect(w.message).toMatch(/alias target/);
    }
  });
});

describe('createCatalog with synthetic records', () => {
  function mkItem(over: Partial<ItemDefinition>): ItemDefinition {
    return {
      name: 'Sandals',
      type_name: 'shoes',
      animations: ['walk'],
      credits: [],
      ...over,
    };
  }

  it('skips meta_<category>.json files silently', () => {
    const records: Record<FilePath, ItemDefinition> = {
      'body/meta_body.json': { priority: 10 } as unknown as ItemDefinition,
      'body/body.json': mkItem({ name: 'Body', type_name: 'body' }),
    };
    const { catalog, warnings } = createCatalog(records);
    expect(warnings).toEqual([]);
    expect(Array.from(catalog.byItemId.keys())).toEqual(['body']);
  });

  it('skips items with ignore: true silently', () => {
    const records: Record<FilePath, ItemDefinition> = {
      'a/foo.json': mkItem({ ignore: true }),
      'a/bar.json': mkItem({ name: 'Bar' }),
    };
    const { catalog, warnings } = createCatalog(records);
    expect(warnings).toEqual([]);
    expect(Array.from(catalog.byItemId.keys())).toEqual(['bar']);
  });

  it('preserves the sheet definition source path on ingested items', () => {
    const { catalog, warnings } = createCatalog({
      'headwear/hats/magic/hat_magic_large.json': {
        name: 'Large Magic Hat',
        type_name: 'hat',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 10, male: 'head/hat/magic/large/' },
      } as unknown as ItemDefinition,
    });

    expect(warnings).toEqual([]);
    expect(catalog.byItemId.get('hat_magic_large')?.sourcePath).toBe(
      'headwear/hats/magic/hat_magic_large.json',
    );
  });

  it('preserves display_name and itemId on compiled catalog entry', () => {
    const { catalog, warnings } = createCatalog({
      'weapons/ranged/bow/weapon_ranged_bow_normal.json': mkItem({
        name: 'Normal',
        display_name: 'Normal Bow',
        type_name: 'weapon',
      }),
    });

    expect(warnings).toEqual([]);
    expect(catalog.byItemId.get('weapon_ranged_bow_normal')).toMatchObject({
      name: 'Normal',
      display_name: 'Normal Bow',
      itemId: 'weapon_ranged_bow_normal',
    });
  });


  it('warns on duplicate itemId and applies last-write-wins', () => {
    const first = mkItem({ name: 'First' });
    const second = mkItem({ name: 'Second' });
    const records: Record<FilePath, ItemDefinition> = {
      'a/foo.json': first,
      'b/foo.json': second,
    };
    const { catalog, warnings } = createCatalog(records);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.path).toBe('b/foo.json');
    expect(warnings[0]!.message).toMatch(/duplicate itemId "foo"/);
    expect(catalog.byItemId.get('foo')).toEqual({
      ...second,
      itemId: 'foo',
      sourcePath: 'b/foo.json',
    });
    expect(catalog.byTypeName.get('shoes')).toEqual([
      { ...second, itemId: 'foo', sourcePath: 'b/foo.json' },
    ]);
  });

  it('keeps items with same (type_name, name) but different itemIds', () => {
    const records: Record<FilePath, ItemDefinition> = {
      'a/sandals.json': mkItem({ name: 'Sandals' }),
      'b/sandals_v2.json': mkItem({ name: 'Sandals' }),
    };
    const { catalog, warnings } = createCatalog(records);
    expect(warnings).toEqual([]);
    expect(Array.from(catalog.byItemId.keys()).sort()).toEqual([
      'sandals',
      'sandals_v2',
    ]);
    expect(catalog.byTypeName.get('shoes')?.length).toBe(2);
  });

  it('warns when name or type_name is missing', () => {
    const records: Record<FilePath, ItemDefinition> = {
      'a/no_name.json': {
        type_name: 'shoes',
        animations: ['walk'],
        credits: [],
      } as unknown as ItemDefinition,
      'a/no_type.json': {
        name: 'Foo',
        animations: ['walk'],
        credits: [],
      } as unknown as ItemDefinition,
    };
    const { catalog, warnings } = createCatalog(records);
    expect(catalog.byItemId.size).toBe(0);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.message)).toEqual([
      expect.stringMatching(/missing required field "name"/),
      expect.stringMatching(/missing required field "type_name"/),
    ]);
  });

  it('produces a Catalog usable by parseHash (alias round-trip)', async () => {
    const { parseHash, serializeHash } = await import('../src/hash.js');
    const records = loadRecords([
      'torso/waist/belt_formal.json',
    ]);
    const { catalog } = createCatalog(records);
    const r = parseHash('#belt=Other_belts_formal', catalog);
    expect(r.warnings).toEqual([]);
    expect(r.selections.items).toEqual({
      belt: { typeName: 'belt', name: 'Formal Belt', variant: 'brown' },
    });
    // Round-trip — alias rewrites to canonical form.
    expect(serializeHash(r.selections)).toBe(
      'sex=male&belt=Formal_Belt_brown',
    );
  });
});
