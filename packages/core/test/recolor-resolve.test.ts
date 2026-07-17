import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import { createPaletteCatalog } from '../src/palettes.js';
import {
  getRecolorSwatches,
  getRecolorVariantsForType,
  itemSupportsSelectionType,
  makeResolvePalette,
} from '../src/recolor-resolve.js';
import { composeSelections } from '../src/compose.js';
import type { CanvasLike } from '../src/adapters.js';
import type {
  Catalog,
  FilePath,
  ItemDefinition,
  PaletteMetadata,
  Selections,
} from '../src/types.js';
import { createNodeCanvasAdapter } from './helpers/node-canvas-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetMetadataBase = path.join(here, '../../../assets');
const sheetRoot = path.join(assetMetadataBase, 'sheet_definitions');
const paletteRoot = path.join(assetMetadataBase, 'palette_definitions');
const realPixelFixtureBase = path.join(
  here,
  'fixtures/upstream-pixels',
);

function loadCatalog(rels: readonly FilePath[]): Catalog {
  const records: Record<FilePath, ItemDefinition> = {};
  for (const rel of rels) {
    records[rel] = JSON.parse(
      readFileSync(path.join(sheetRoot, rel), 'utf8'),
    ) as ItemDefinition;
  }
  return createCatalog(records).catalog;
}

function loadRealPalettes(): PaletteMetadata {
  const records: Record<FilePath, unknown> = {};
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, relPath);
      else if (entry.name.endsWith('.json')) {
        records[`palette_definitions/${relPath}`] = JSON.parse(
          readFileSync(abs, 'utf8'),
        );
      }
    }
  };
  walk(paletteRoot, '');
  return createPaletteCatalog(records).palettes;
}

function syntheticCatalog(items: ItemDefinition[]): Catalog {
  const records: Record<FilePath, ItemDefinition> = {};
  for (let i = 0; i < items.length; i++) {
    records[`item_${i}.json`] = items[i]!;
  }
  return createCatalog(records).catalog;
}

describe('makeResolvePalette', () => {
  describe('with real attributed fixtures', () => {
    const palettes = loadRealPalettes();
    const catalog = loadCatalog(['body/body.json']);
    const bodyItem = catalog.byItemId.get('body')!;

    it('resolves a body skin recolor to the ulpc base→target ramps', () => {
      const selections: Selections = {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
        },
      };
      const resolve = makeResolvePalette(catalog, palettes, selections);
      const swap = resolve(selections.items.body!, bodyItem);

      expect(swap).toBeDefined();
      expect(swap?.material).toBe('body');
      // Base ramp = material default version (ulpc) + base recolor (light).
      expect(swap?.source).toEqual(
        palettes.materials.body?.palettes.ulpc?.light,
      );
      expect(swap?.target).toEqual(
        palettes.materials.body?.palettes.ulpc?.brown,
      );
    });

    it('resolves a cross-version key (lpcr.tan) on a ulpc-default material', () => {
      const selections: Selections = {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'lpcr.tan' },
        },
      };
      const resolve = makeResolvePalette(catalog, palettes, selections);
      const swap = resolve(selections.items.body!, bodyItem);

      expect(swap?.source).toEqual(
        palettes.materials.body?.palettes.ulpc?.light,
      );
      expect(swap?.target).toEqual(
        palettes.materials.body?.palettes.lpcr?.tan,
      );
    });

    it('propagates the body color to a match_body_color accessory (QD)', () => {
      const cat = loadCatalog([
        'body/body.json',
        'body/lizard/tail_lizard.json',
      ]);
      const tail = cat.byItemId.get('tail_lizard')!;
      const selections: Selections = {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
          tail: { typeName: 'tail', name: 'Lizard tail' },
        },
      };
      const resolve = makeResolvePalette(cat, palettes, selections);
      // The tail has no recolor of its own, but match_body_color makes it
      // inherit the body's chosen skin tone.
      const swap = resolve(selections.items.tail!, tail);
      expect(swap?.source).toEqual(
        palettes.materials.body?.palettes.ulpc?.light,
      );
      expect(swap?.target).toEqual(
        palettes.materials.body?.palettes.ulpc?.brown,
      );
    });

    it('returns undefined when no recolor is chosen (draw raw)', () => {
      const selections: Selections = {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Body Color' } },
      };
      const resolve = makeResolvePalette(catalog, palettes, selections);
      // body is match_body_color, but nothing in the selection carries a
      // recolor → no body color → undefined.
      expect(resolve(selections.items.body!, bodyItem)).toBeUndefined();
    });

    it('recolors pixels end-to-end through composeSelections', async () => {
      const adapter = createNodeCanvasAdapter();
      const selections: Selections = {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
        },
      };
      const base = {
        catalog,
        adapter,
        spritesheetsBaseUrl: realPixelFixtureBase,
      };

      const raw = await composeSelections(selections, base);
      const recolored = await composeSelections(selections, {
        ...base,
        resolvePalette: makeResolvePalette(catalog, palettes, selections),
      });

      const region = (c: CanvasLike): Uint8ClampedArray =>
        c.getContext('2d').getImageData(0, 512, 832, 256).data; // walk
      const a = region(raw.canvas);
      const b = region(recolored.canvas);
      let differs = false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          differs = true;
          break;
        }
      }
      expect(differs).toBe(true);
    });
  });

  describe('synthetic', () => {
    // material 'm', default version 'v1', base recolor 'c0'.
    const palettes = createPaletteCatalog({
      'meta_v1.json': { type: 'version', label: 'V1' },
      'm/meta_m.json': { type: 'material', default: 'v1', base: 'c0' },
      'm/m_v1.json': {
        c0: ['#000000', '#111111'],
        red: ['#ff0000', '#ee0000'],
      },
    }).palettes;

    const item: ItemDefinition = {
      name: 'Thing',
      type_name: 't',
      animations: ['walk'],
      credits: [],
      recolors: { material: 'm', palettes: ['v1'] },
      layer_1: { zPos: 1, male: 't/' },
    };
    const catalog = syntheticCatalog([item]);

    it.each(['red', 'v1.red', 'm.v1.red'])(
      'accepts recolor key form %s (QI parseRecolorKey)',
      (key) => {
        const selections: Selections = {
          bodyType: 'male',
          items: { t: { typeName: 't', name: 'Thing', recolor: key } },
        };
        const swap = makeResolvePalette(catalog, palettes, selections)(
          selections.items.t!,
          item,
        );
        expect(swap?.source).toEqual(['#000000', '#111111']);
        expect(swap?.target).toEqual(['#ff0000', '#ee0000']);
      },
    );

    it('warns and skips an unknown material (QH)', () => {
      const bad: ItemDefinition = {
        name: 'Bad',
        type_name: 't',
        animations: ['walk'],
        credits: [],
        recolors: { material: 'nope', palettes: ['v1'] },
        layer_1: { zPos: 1, male: 't/' },
      };
      const cat = syntheticCatalog([bad]);
      const warnings: string[] = [];
      const selections: Selections = {
        bodyType: 'male',
        items: { t: { typeName: 't', name: 'Bad', recolor: 'red' } },
      };
      const swap = makeResolvePalette(cat, palettes, selections, {
        onWarn: (m) => warnings.push(m),
      })(selections.items.t!, bad);

      expect(swap).toBeUndefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/unknown material "nope"/);
    });

    it('warns and skips an unknown recolor color (QH)', () => {
      const warnings: string[] = [];
      const selections: Selections = {
        bodyType: 'male',
        items: { t: { typeName: 't', name: 'Thing', recolor: 'chartreuse' } },
      };
      const swap = makeResolvePalette(catalog, palettes, selections, {
        onWarn: (m) => warnings.push(m),
      })(selections.items.t!, item);

      expect(swap).toBeUndefined();
      expect(warnings[0]).toMatch(/not a valid m color/);
    });

    it('returns undefined for an item with no recolors', () => {
      const plain: ItemDefinition = {
        name: 'Plain',
        type_name: 't',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 1, male: 't/' },
      };
      const cat = syntheticCatalog([plain]);
      const selections: Selections = {
        bodyType: 'male',
        items: { t: { typeName: 't', name: 'Plain', recolor: 'red' } },
      };
      expect(
        makeResolvePalette(cat, palettes, selections)(
          selections.items.t!,
          plain,
        ),
      ).toBeUndefined();
    });

    it('flattens a multi-color (color_N) item into one concatenated swap', () => {
      const multiPalettes = createPaletteCatalog({
        'metal/meta_metal.json': { type: 'material', default: 'v1', base: 'c0' },
        'metal/metal_v1.json': {
          c0: ['#100000', '#200000'],
          gold: ['#ffd700', '#ccaa00'],
        },
        'cloth/meta_cloth.json': { type: 'material', default: 'v1', base: 'c0' },
        'cloth/cloth_v1.json': {
          c0: ['#001000', '#002000'],
          blue: ['#0000ff', '#0000cc'],
        },
      }).palettes;

      const sword: ItemDefinition = {
        name: 'Sword',
        type_name: 'weapon',
        animations: ['walk'],
        credits: [],
        recolors: {
          color_1: { material: 'metal', palettes: ['v1'] },
          color_2: { material: 'cloth', palettes: ['v1'], type_name: 'grip' },
        },
        layer_1: { zPos: 1, male: 'weapon/' },
      };
      const cat = syntheticCatalog([sword]);
      const selections: Selections = {
        bodyType: 'male',
        items: {
          weapon: { typeName: 'weapon', name: 'Sword', recolor: 'gold' },
          grip: { typeName: 'grip', name: 'Grip', recolor: 'blue' },
        },
      };
      const swap = makeResolvePalette(cat, multiPalettes, selections)(
        selections.items.weapon!,
        sword,
      );

      expect(swap?.material).toBe('metal+cloth');
      expect(swap?.source).toEqual([
        '#100000',
        '#200000',
        '#001000',
        '#002000',
      ]);
      expect(swap?.target).toEqual([
        '#ffd700',
        '#ccaa00',
        '#0000ff',
        '#0000cc',
      ]);
    });

    it('falls back to a secondary material base when that slot has no selected recolor', () => {
      const multiPalettes = createPaletteCatalog({
        'metal/meta_metal.json': { type: 'material', default: 'v1', base: 'c0' },
        'metal/metal_v1.json': {
          c0: ['#100000', '#200000'],
          gold: ['#ffd700', '#ccaa00'],
        },
        'cloth/meta_cloth.json': { type: 'material', default: 'v1', base: 'c0' },
        'cloth/cloth_v1.json': {
          c0: ['#001000', '#002000'],
          blue: ['#0000ff', '#0000cc'],
        },
      }).palettes;

      const sword: ItemDefinition = {
        name: 'Sword',
        type_name: 'weapon',
        animations: ['walk'],
        credits: [],
        recolors: {
          color_1: { material: 'metal', palettes: ['v1'] },
          color_2: { material: 'cloth', palettes: ['v1'], type_name: 'grip' },
        },
        layer_1: { zPos: 1, male: 'weapon/' },
      };
      const cat = syntheticCatalog([sword]);
      const selections: Selections = {
        bodyType: 'male',
        items: {
          weapon: { typeName: 'weapon', name: 'Sword', recolor: 'gold' },
        },
      };
      const swap = makeResolvePalette(cat, multiPalettes, selections)(
        selections.items.weapon!,
        sword,
      );

      expect(swap?.material).toBe('metal+cloth');
      expect(swap?.target).toEqual([
        '#ffd700',
        '#ccaa00',
        '#001000',
        '#002000',
      ]);
    });
  });
});

describe('getRecolorSwatches', () => {
  it('returns each recolor name with its resolved color ramp', () => {
    const palettes = createPaletteCatalog({
      'm/meta_m.json': { type: 'material', default: 'v1', base: 'c0' },
      'm/m_v1.json': {
        c0: ['#000000', '#111111'],
        red: ['#ff0000', '#ee0000'],
      },
    }).palettes;
    const item: ItemDefinition = {
      name: 'Thing',
      type_name: 't',
      animations: ['walk'],
      credits: [],
      recolors: { material: 'm', palettes: ['v1'] },
      layer_1: { zPos: 1, male: 't/' },
    };
    expect(getRecolorSwatches(item, palettes)).toEqual([
      { recolor: 'c0', colors: ['#000000', '#111111'] },
      { recolor: 'red', colors: ['#ff0000', '#ee0000'] },
    ]);
  });

  it('returns an empty array for an item with no recolors', () => {
    const palettes = createPaletteCatalog({}).palettes;
    const plain: ItemDefinition = {
      name: 'Plain',
      type_name: 't',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 1, male: 't/' },
    };
    expect(getRecolorSwatches(plain, palettes)).toEqual([]);
  });

  it('returns an empty array for an item with an unknown material', () => {
    const palettes = createPaletteCatalog({}).palettes;
    const item: ItemDefinition = {
      name: 'Ghost',
      type_name: 't',
      animations: ['walk'],
      credits: [],
      recolors: { material: 'nonexistent', palettes: ['v1'] },
      layer_1: { zPos: 1, male: 't/' },
    };
    expect(getRecolorSwatches(item, palettes)).toEqual([]);
  });
});

describe('type-specific recolor metadata', () => {
  const palettes = createPaletteCatalog({
    'cloth/meta_cloth.json': {
      type: 'material',
      default: 'v1',
      base: 'blue',
    },
    'cloth/cloth_v1.json': {
      blue: ['#0000ff'],
      red: ['#ff0000'],
    },
    'metal/meta_metal.json': {
      type: 'material',
      default: 'v1',
      base: 'iron',
    },
    'metal/metal_v1.json': {
      iron: ['#777777'],
      gold: ['#d4af37'],
    },
  }).palettes;
  const coat: ItemDefinition = {
    name: 'Coat',
    type_name: 'coat',
    animations: ['walk'],
    credits: [],
    recolors: {
      color_1: { material: 'cloth', palettes: ['v1'] },
      color_2: {
        material: 'metal',
        palettes: ['v1'],
        type_name: 'trim',
      },
    },
    layer_1: { zPos: 1, male: 'coat/' },
  };

  it('recognizes both the primary item type and recolor sub-binding type', () => {
    expect(itemSupportsSelectionType(coat, 'coat')).toBe(true);
    expect(itemSupportsSelectionType(coat, 'trim')).toBe(true);
    expect(itemSupportsSelectionType(coat, 'lining')).toBe(false);
  });

  it('returns variants for the requested primary or sub-binding type', () => {
    expect(getRecolorVariantsForType(coat, palettes, 'coat')).toEqual([
      'blue',
      'red',
    ]);
    expect(getRecolorVariantsForType(coat, palettes, 'trim')).toEqual([
      'iron',
      'gold',
    ]);
    expect(getRecolorVariantsForType(coat, palettes, 'lining')).toEqual([]);
  });
});
