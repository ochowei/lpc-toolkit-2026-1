import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  serializeHash,
} from '../src/hash.js';
import { createCatalog } from '../src/catalog.js';
import { createPaletteCatalog } from '../src/palettes.js';
import type {
  AliasEntry,
  Catalog,
  FilePath,
  ItemDefinition,
  PaletteMetadata,
  TypeName,
} from '../src/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsBase = path.join(here, '../../../assets');

function realPalettes(): PaletteMetadata {
  const records: Record<FilePath, unknown> = {};
  const root = path.join(assetsBase, 'palette_definitions');
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, r);
      else if (e.name.endsWith('.json'))
        records[`palette_definitions/${r}`] = JSON.parse(
          readFileSync(abs, 'utf8'),
        );
    }
  };
  walk(root, '');
  return createPaletteCatalog(records).palettes;
}

function realBodyCatalog(): Catalog {
  return createCatalog({
    'body/body.json': JSON.parse(
      readFileSync(
        path.join(assetsBase, 'sheet_definitions/body/body.json'),
        'utf8',
      ),
    ) as ItemDefinition,
  }).catalog;
}

function makeCatalog(items: readonly ItemDefinition[], aliases: ReadonlyMap<TypeName, ReadonlyMap<string, AliasEntry>> = new Map()): Catalog {
  const byItemId = new Map<string, ItemDefinition>();
  const byTypeName = new Map<TypeName, ItemDefinition[]>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    byItemId.set(`item_${i}`, item);
    const list = byTypeName.get(item.type_name) ?? [];
    list.push(item);
    byTypeName.set(item.type_name, list);
  }
  return {
    byItemId,
    byTypeName: byTypeName as ReadonlyMap<TypeName, readonly ItemDefinition[]>,
    typeNames: Array.from(byTypeName.keys()),
    aliases,
  };
}

const sandals: ItemDefinition = {
  name: 'Sandals',
  type_name: 'shoes',
  animations: ['walk'],
  credits: [],
  variants: ['black', 'blue', 'forest'],
};

const humanMale: ItemDefinition = {
  name: 'Human male',
  type_name: 'head',
  animations: ['walk'],
  credits: [],
  variants: ['light', 'dark', 'tanned2'],
};

const neutral: ItemDefinition = {
  name: 'Neutral',
  type_name: 'expression',
  animations: ['walk'],
  credits: [],
  variants: ['light', 'dark'],
};

// Item that relies on recolors (no explicit `variants`). Raw `recolors`
// is an object (RawRecolors), not an array.
const bodyColor: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  recolors: { material: 'body', palettes: ['ulpc'] },
};

describe('parseHash', () => {
  it('resolves a representative selection with explicit variants', () => {
    const cat = makeCatalog([sandals, humanMale, neutral]);
    const r = parseHash(
      '#sex=male&shoes=Sandals_blue&head=Human_male_light&expression=Neutral_light',
      cat,
    );
    expect(r.warnings).toEqual([]);
    expect(r.unknownKeys).toEqual([]);
    expect(r.selections.bodyType).toBe('male');
    expect(r.selections.items).toEqual({
      shoes: { typeName: 'shoes', name: 'Sandals', variant: 'blue' },
      head: { typeName: 'head', name: 'Human male', variant: 'light' },
      expression: { typeName: 'expression', name: 'Neutral', variant: 'light' },
    });
  });

  it('handles longest-suffix variant scan when names contain underscores', () => {
    const cat = makeCatalog([humanMale]);
    const r = parseHash('#head=Human_male_tanned2', cat);
    expect(r.warnings).toEqual([]);
    expect(r.selections.items['head']).toEqual({
      typeName: 'head',
      name: 'Human male',
      variant: 'tanned2',
    });
  });

  it('strips a leading "?" after "#"', () => {
    const cat = makeCatalog([sandals]);
    const r = parseHash('#?shoes=Sandals_blue', cat);
    expect(r.selections.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Sandals',
      variant: 'blue',
    });
  });

  it('falls back to the first variant when name has no variant suffix', () => {
    const cat = makeCatalog([humanMale]);
    const r = parseHash('#head=Human_male', cat);
    expect(r.selections.items['head']).toEqual({
      typeName: 'head',
      name: 'Human male',
      variant: 'light',
    });
  });

  it('treats "none" as a skip (not an unknown)', () => {
    const cat = makeCatalog([sandals]);
    const r = parseHash('#sex=male&shoes=none', cat);
    expect(r.warnings).toEqual([]);
    expect(r.unknownKeys).toEqual([]);
    expect(r.selections.items).toEqual({});
  });

  it('surfaces an unknown type as a warning', () => {
    const cat = makeCatalog([sandals]);
    const r = parseHash('#mystery=Foo_bar', cat);
    expect(r.warnings).toEqual([
      { key: 'mystery', value: 'Foo_bar', reason: 'unknown_type_name' },
    ]);
    expect(r.unknownKeys).toEqual(['mystery']);
  });

  it('surfaces a known type but unresolvable item as a warning', () => {
    const cat = makeCatalog([sandals]);
    const r = parseHash('#shoes=Notashoe_purple', cat);
    expect(r.warnings).toEqual([
      { key: 'shoes', value: 'Notashoe_purple', reason: 'unknown_item' },
    ]);
  });

  it('without palettes, recolor-variant items still defer to unknown_item (Q2 backward-compat)', () => {
    const cat = makeCatalog([bodyColor]);
    const r = parseHash('#body=Body_color_light', cat);
    expect(r.warnings).toEqual([
      { key: 'body', value: 'Body_color_light', reason: 'unknown_item' },
    ]);
  });

  it('applies an exact alias redirect', () => {
    const aliases = new Map<TypeName, Map<string, AliasEntry>>([
      [
        'sash',
        new Map([
          [
            'Waistband_rose',
            { typeName: 'waistband', name: 'Waistband', variant: 'rose' },
          ],
        ]),
      ],
    ]);
    const waistband: ItemDefinition = {
      name: 'Waistband',
      type_name: 'waistband',
      animations: ['walk'],
      credits: [],
      variants: ['rose', 'sky'],
    };
    const cat = makeCatalog([waistband], aliases);
    const r = parseHash('#sash=Waistband_rose', cat);
    expect(r.warnings).toEqual([]);
    expect(r.selections.items).toEqual({
      waistband: {
        typeName: 'waistband',
        name: 'Waistband',
        variant: 'rose',
      },
    });
  });

  it('applies a wildcard ("*") alias that preserves the original nameAndVariant', () => {
    const aliases = new Map<TypeName, Map<string, AliasEntry>>([
      [
        'shoesAlias',
        new Map([
          ['*', { typeName: 'shoes', name: '*', variant: '*' }],
        ]),
      ],
    ]);
    const cat = makeCatalog([sandals], aliases);
    const r = parseHash('#shoesAlias=Sandals_forest', cat);
    expect(r.warnings).toEqual([]);
    expect(r.selections.items).toEqual({
      shoes: { typeName: 'shoes', name: 'Sandals', variant: 'forest' },
    });
  });

  it('reads bodyType from either "bodyType" or "sex"', () => {
    const cat = makeCatalog([]);
    expect(parseHash('#bodyType=female', cat).selections.bodyType).toBe('female');
    expect(parseHash('#sex=teen', cat).selections.bodyType).toBe('teen');
  });
});

describe('parseHash with palettes (Step 4.3 — Q2 closed)', () => {
  it('resolves a real body recolor-variant hash value (bare ulpc key)', () => {
    const cat = realBodyCatalog();
    const r = parseHash('#body=Body_Color_brown', cat, realPalettes());
    expect(r.warnings).toEqual([]);
    expect(r.unknownKeys).toEqual([]);
    expect(r.selections.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'brown',
    });
  });

  it('resolves a cross-version recolor key (lpcr.tan on a ulpc-default material)', () => {
    const cat = realBodyCatalog();
    const r = parseHash('#body=Body_Color_lpcr.tan', cat, realPalettes());
    expect(r.warnings).toEqual([]);
    expect(r.selections.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'lpcr.tan',
    });
  });

  it('round-trips a recolor selection', () => {
    const cat = realBodyCatalog();
    const palettes = realPalettes();
    const original = 'sex=male&body=Body_Color_brown';
    const parsed = parseHash(`#${original}`, cat, palettes);
    expect(serializeHash(parsed.selections)).toBe(original);
    const again = parseHash(`#${serializeHash(parsed.selections)}`, cat, palettes);
    expect(serializeHash(again.selections)).toBe(original);
  });

  // Synthetic: an item with BOTH explicit variants and recolors.
  const palettes = createPaletteCatalog({
    'cloth/meta_cloth.json': { type: 'material', default: 'v1', base: 'c0' },
    'cloth/cloth_v1.json': {
      c0: ['#000000'],
      crimson: ['#dc143c'],
    },
  }).palettes;
  const tunic: ItemDefinition = {
    name: 'Tunic',
    type_name: 'torso',
    animations: ['walk'],
    credits: [],
    variants: ['red', 'blue'],
    recolors: { material: 'cloth', palettes: ['v1'] },
  };
  const tunicCat = makeCatalog([tunic]);

  it('an explicit name_variant|recolor resolves to the recolor (upstream precedence)', () => {
    const r = parseHash('#torso=Tunic_red|crimson', tunicCat, palettes);
    expect(r.warnings).toEqual([]);
    // Upstream's later-assignment-wins: the recolor overrides the variant.
    expect(r.selections.items['torso']).toEqual({
      typeName: 'torso',
      name: 'Tunic',
      recolor: 'crimson',
    });
  });

  it('a plain variant token still resolves to the variant when it is not a recolor', () => {
    const r = parseHash('#torso=Tunic_red', tunicCat, palettes);
    expect(r.warnings).toEqual([]);
    expect(r.selections.items['torso']).toEqual({
      typeName: 'torso',
      name: 'Tunic',
      variant: 'red',
    });
  });
});

describe('serializeHash', () => {
  it('emits sex first, then selections in insertion order, no leading "#"', () => {
    const out = serializeHash({
      bodyType: 'male',
      items: {
        shoes: { typeName: 'shoes', name: 'Sandals', variant: 'blue' },
        head: { typeName: 'head', name: 'Human male', variant: 'light' },
      },
    });
    expect(out).toBe('sex=male&shoes=Sandals_blue&head=Human_male_light');
  });

  it('joins variant and recolor with "|" (percent-encoded as %7C)', () => {
    const out = serializeHash({
      bodyType: 'male',
      items: {
        torso: {
          typeName: 'torso',
          name: 'Tunic',
          variant: 'red',
          recolor: 'lpcr.crimson',
        },
      },
    });
    expect(out).toBe('sex=male&torso=Tunic_red%7Clpcr.crimson');
  });

  it('omits variant/recolor markers when both are absent', () => {
    const out = serializeHash({
      bodyType: 'male',
      items: {
        shoes: { typeName: 'shoes', name: 'Sandals' },
      },
    });
    expect(out).toBe('sex=male&shoes=Sandals');
  });
});

describe('parseHash ↔ serializeHash round-trip', () => {
  it('is stable for a representative selection', () => {
    const cat = makeCatalog([sandals, humanMale, neutral]);
    const original =
      'sex=male&shoes=Sandals_blue&head=Human_male_light&expression=Neutral_light';
    const parsed = parseHash(`#${original}`, cat);
    const re = serializeHash(parsed.selections);
    expect(re).toBe(original);

    // Idempotent: re-parse, re-serialize gives the same string.
    const parsedAgain = parseHash(`#${re}`, cat);
    expect(serializeHash(parsedAgain.selections)).toBe(original);
  });

  it('proves legacy identity remains valid for display-name separated assets', () => {
    const bow: ItemDefinition = {
      name: 'Normal',
      display_name: 'Normal Bow',
      type_name: 'weapon',
      animations: ['walk'],
      credits: [],
      variants: ['dark'],
    };
    const cat = makeCatalog([bow]);
    expect(parseHash('sex=male&weapon=Normal_dark', cat).selections.items.weapon).toMatchObject({
      typeName: 'weapon', name: 'Normal', variant: 'dark',
    });
    expect(serializeHash({ bodyType: 'male', items: { weapon: { typeName: 'weapon', name: 'Normal', variant: 'dark' } } }))
      .toContain('weapon=Normal_dark');
  });
});

describe('selection tokens', () => {
  it('round-trips selections through a versioned reversible token', () => {
    const cat = makeCatalog([sandals, humanMale]);
    const selections = {
      bodyType: 'male',
      items: {
        shoes: { typeName: 'shoes', name: 'Sandals', variant: 'blue' },
        head: { typeName: 'head', name: 'Human male', variant: 'light' },
      },
    };

    const token = encodeSelectionToken(selections);
    const decoded = decodeSelectionToken(token, cat);

    expect(token.startsWith('v1.')).toBe(true);
    expect(decoded.warnings).toEqual([]);
    expect(decoded.selections).toEqual(selections);
  });

  it('rejects unsupported token versions', () => {
    const cat = makeCatalog([sandals]);
    expect(() => decodeSelectionToken('v2.abc', cat)).toThrow(
      'Unsupported selection token version',
    );
  });

  it('rejects malformed token payloads', () => {
    const cat = makeCatalog([sandals]);
    expect(() => decodeSelectionToken('v1.a', cat)).toThrow(
      'Malformed selection token',
    );
  });

  it('surfaces parser warnings from the decoded payload', () => {
    const cat = makeCatalog([sandals]);
    const token = encodeSelectionToken({
      bodyType: 'male',
      items: {
        shoes: { typeName: 'shoes', name: 'Notashoe' },
      },
    });

    const decoded = decodeSelectionToken(token, cat);

    expect(decoded.warnings).toEqual([
      { key: 'shoes', value: 'Notashoe', reason: 'unknown_item' },
    ]);
  });
});
