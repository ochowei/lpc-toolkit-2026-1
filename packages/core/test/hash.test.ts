import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  serializeHash,
  serializeLegacyHash,
  serializeUpstreamHash,
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

  it('without palettes, recolor sub-types retain the legacy unknown-type warning', () => {
    const coat: ItemDefinition = {
      name: 'Coat',
      type_name: 'coat',
      animations: ['walk'],
      credits: [],
      recolors: {
        color_1: { material: 'cloth', palettes: ['ulpc'] },
        color_2: {
          material: 'metal',
          palettes: ['ulpc'],
          type_name: 'trim',
        },
      },
    };

    const decoded = parseHash('#trim=Coat_gold', makeCatalog([coat]));

    expect(decoded.warnings).toEqual([
      { key: 'trim', value: 'Coat_gold', reason: 'unknown_type_name' },
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
    const legacy = 'sex=male&body=Body_Color_brown';
    const canonical = 'v=2&sex=male&body=Body_Color_brown';
    const parsed = parseHash(`#${legacy}`, cat, palettes);
    expect(serializeHash(parsed.selections)).toBe(canonical);
    const again = parseHash(`#${serializeHash(parsed.selections)}`, cat, palettes);
    expect(serializeHash(again.selections)).toBe(canonical);
  });

  // Synthetic: an item with BOTH explicit variants and recolors.
  const palettes = createPaletteCatalog({
    'cloth/meta_cloth.json': { type: 'material', default: 'v1', base: 'c0' },
    'cloth/cloth_v1.json': {
      c0: ['#000000'],
      crimson: ['#dc143c'],
      azure: ['#007fff'],
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

  it('retains a catalog-recognized __proto__ recolor sub-type through hashes and tokens', () => {
    const protoItem: ItemDefinition = {
      name: 'Proto Coat',
      type_name: 'coat',
      animations: ['walk'],
      credits: [],
      recolors: {
        color_1: { material: 'cloth', palettes: ['v1'] },
        color_2: {
          material: 'cloth',
          palettes: ['v1'],
          type_name: '__proto__',
        },
      },
    };
    const catalog = makeCatalog([protoItem]);
    const hash = 'sex=male&__proto__=Proto_Coat_crimson';

    const parsed = parseHash(hash, catalog, palettes);

    expect(parsed.warnings).toEqual([]);
    expect(Object.hasOwn(parsed.selections.items, '__proto__')).toBe(true);
    expect(parsed.selections.items['__proto__']).toEqual({
      typeName: '__proto__',
      name: 'Proto Coat',
      recolor: 'crimson',
    });
    expect(serializeLegacyHash(parsed.selections)).toBe(hash);
  });

  it('rejects an unknown __proto__ type through hash catalog validation', () => {
    const decoded = parseHash(
      '#__proto__=Proto_Coat_crimson',
      tunicCat,
      palettes,
    );

    expect(decoded.selections.items).toEqual({});
    expect(decoded.warnings).toEqual([
      {
        key: '__proto__',
        value: 'Proto_Coat_crimson',
        reason: 'unknown_type_name',
      },
    ]);
  });

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
  it('emits a deterministic v2 hash with selections sorted by slot', () => {
    const out = serializeHash({
      bodyType: 'male',
      items: {
        shoes: { typeName: 'shoes', name: 'Sandals', variant: 'blue' },
        head: { typeName: 'head', name: 'Human male', variant: 'light' },
      },
    });
    expect(out).toBe(
      'v=2&sex=male&head=Human_male_light&shoes=Sandals_blue',
    );
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
    expect(out).toBe('v=2&sex=male&torso=Tunic_red%7Clpcr.crimson');
  });

  it('omits variant/recolor markers when both are absent', () => {
    const out = serializeHash({
      bodyType: 'male',
      items: {
        shoes: { typeName: 'shoes', name: 'Sandals' },
      },
    });
    expect(out).toBe('v=2&sex=male&shoes=Sandals');
  });

  it('sorts asset-owned channel values after selections', () => {
    const out = serializeHash({
      bodyType: 'male',
      items: {
        head: {
          typeName: 'head',
          name: 'Human male',
          channelRecolors: { trim: 'azure', eyes: 'crimson' },
        },
        expression: {
          typeName: 'expression',
          name: 'Neutral',
          channelRecolors: { eyes: 'azure' },
        },
      },
    });

    expect(out).toBe(
      'v=2&sex=male&expression=Neutral&head=Human_male'
      + '&color.expression.eyes=azure&color.head.eyes=crimson&color.head.trim=azure',
    );
  });
});

describe('parseHash ↔ serializeHash round-trip', () => {
  it('is stable for a representative selection', () => {
    const cat = makeCatalog([sandals, humanMale, neutral]);
    const legacy =
      'sex=male&shoes=Sandals_blue&head=Human_male_light&expression=Neutral_light';
    const canonical =
      'v=2&sex=male&expression=Neutral_light&head=Human_male_light&shoes=Sandals_blue';
    const parsed = parseHash(`#${legacy}`, cat);
    const re = serializeHash(parsed.selections);
    expect(re).toBe(canonical);

    // Idempotent: re-parse, re-serialize gives the same string.
    const parsedAgain = parseHash(`#${re}`, cat);
    expect(serializeHash(parsedAgain.selections)).toBe(canonical);
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

    expect(token.startsWith('v2.')).toBe(true);
    expect(decoded.warnings).toEqual([]);
    expect(decoded.selections).toEqual(selections);
  });

  it('reads a legacy v1 token and rewrites it as v2', () => {
    const cat = makeCatalog([sandals]);
    const legacyToken = 'v1.c2V4PW1hbGUmc2hvZXM9U2FuZGFsc19ibHVl';

    const decoded = decodeSelectionToken(legacyToken, cat);

    expect(decoded.warnings).toEqual([]);
    expect(decoded.selections.items.shoes).toEqual({
      typeName: 'shoes',
      name: 'Sandals',
      variant: 'blue',
    });
    expect(encodeSelectionToken(decoded.selections).startsWith('v2.')).toBe(true);
  });

  it('rejects unsupported token versions', () => {
    const cat = makeCatalog([sandals]);
    expect(() => decodeSelectionToken('v3.abc', cat)).toThrow(
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

describe('v2 asset-owned color channels', () => {
  const palettes = createPaletteCatalog({
    'cloth/meta_cloth.json': { type: 'material', default: 'v1', base: 'c0' },
    'cloth/cloth_v1.json': {
      c0: ['#000000'],
      crimson: ['#dc143c'],
      azure: ['#007fff'],
    },
  }).palettes;
  const head: ItemDefinition = {
    name: 'Human Head',
    type_name: 'head',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 40, male: 'head/' },
    recolors: {
      color_1: { material: 'cloth', palettes: ['v1'] },
      color_2: {
        material: 'cloth',
        palettes: ['v1'],
        type_name: 'eyes',
      },
      color_3: {
        material: 'cloth',
        palettes: ['v1'],
        type_name: 'linked',
        linked_to: { selection: 'body', channel: 'primary' },
      },
    },
  };
  const expression: ItemDefinition = {
    ...head,
    name: 'Smile',
    type_name: 'expression',
    layer_1: { zPos: 30, male: 'expression/' },
  };
  const catalog = makeCatalog([head, expression]);

  it('parses independent channels into their owning selections', () => {
    const decoded = parseHash(
      'v=2&sex=male&head=Human_Head_crimson&expression=Smile'
      + '&color.head.eyes=azure&color.expression.eyes=crimson',
      catalog,
      palettes,
    );

    expect(decoded.warnings).toEqual([]);
    expect(decoded.selections.items.head).toEqual({
      typeName: 'head',
      name: 'Human Head',
      recolor: 'crimson',
      channelRecolors: { eyes: 'azure' },
    });
    expect(decoded.selections.items.expression).toEqual({
      typeName: 'expression',
      name: 'Smile',
      channelRecolors: { eyes: 'crimson' },
    });
  });

  it('warns and falls back to authored defaults for invalid or linked values', () => {
    const decoded = parseHash(
      'v=2&sex=male&head=Human_Head'
      + '&color.head.missing=azure'
      + '&color.head.eyes=missing'
      + '&color.head.linked=azure',
      catalog,
      palettes,
    );

    expect(decoded.selections.items.head?.channelRecolors).toBeUndefined();
    expect(decoded.warnings).toEqual([
      {
        key: 'color.head.missing',
        value: 'azure',
        reason: 'unknown_channel',
      },
      {
        key: 'color.head.eyes',
        value: 'missing',
        reason: 'unknown_channel_recolor',
      },
      {
        key: 'color.head.linked',
        value: 'azure',
        reason: 'linked_channel_value',
      },
    ]);
  });

  it('round-trips exact channel state through a v2 token', () => {
    const selections = {
      bodyType: 'male',
      items: {
        head: {
          typeName: 'head',
          name: 'Human Head',
          recolor: 'crimson',
          channelRecolors: { eyes: 'azure' },
        },
      },
    };

    const token = encodeSelectionToken(selections);
    const decoded = decodeSelectionToken(token, catalog, palettes);

    expect(token.startsWith('v2.')).toBe(true);
    expect(decoded.warnings).toEqual([]);
    expect(decoded.selections).toEqual(selections);
    expect(encodeSelectionToken(decoded.selections)).toBe(token);
  });

  it('projects collisions to the visibly dominant asset with diagnostics', () => {
    const projected = serializeUpstreamHash(
      {
        bodyType: 'male',
        items: {
          head: {
            typeName: 'head',
            name: 'Human Head',
            channelRecolors: { eyes: 'azure' },
          },
          expression: {
            typeName: 'expression',
            name: 'Smile',
            channelRecolors: { eyes: 'crimson' },
          },
        },
      },
      catalog,
      palettes,
    );

    expect(projected.hash).toBe(
      'sex=male&head=Human_Head&expression=Smile&eyes=Human_Head_azure',
    );
    expect(projected.losses).toEqual([
      {
        reason: 'channel_collision',
        channelId: 'eyes',
        keptSlot: 'head',
        omittedSlots: ['expression'],
      },
    ]);
    expect(projected.hash).not.toContain('v=2');
    expect(projected.hash).not.toContain('color.');
  });

  it('preserves primary selection order for stable same-z upstream rendering', () => {
    const projected = serializeUpstreamHash(
      {
        bodyType: 'male',
        items: {
          expression: {
            typeName: 'expression',
            name: 'Smile',
          },
          head: {
            typeName: 'head',
            name: 'Human Head',
          },
        },
      },
      catalog,
      palettes,
    );

    expect(projected.hash).toBe(
      'sex=male&expression=Smile&head=Human_Head',
    );
  });
});
