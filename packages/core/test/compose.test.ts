import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import { composeSelections, getSpritePathsForSelections } from '../src/compose.js';
import { computeEffectiveLicense } from '../src/credits.js';
import type { CanvasAdapter, CanvasLike, ImageLike } from '../src/adapters.js';
import type { PaletteSwap } from '../src/recolor.js';
import type {
  Catalog,
  FilePath,
  ItemDefinition,
  Selections,
} from '../src/types.js';
import {
  createNodeCanvasAdapter,
  makeCanvas,
  solidImage,
} from './helpers/node-canvas-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const upstreamRoot = path.join(here, '../../../assets/sheet_definitions');
const customRoot = path.join(here, '../../../assets_custom/sheet_definitions');
const realPixelFixtureBase = path.join(
  here,
  'fixtures/upstream-pixels',
);

function loadFixture(relPath: FilePath): ItemDefinition {
  const customFile = path.join(customRoot, relPath);
  const full = existsSync(customFile) ? customFile : path.join(upstreamRoot, relPath);
  return JSON.parse(
    readFileSync(full, 'utf8'),
  ) as ItemDefinition;
}

function loadCatalog(rels: readonly FilePath[]): Catalog {
  const records: Record<FilePath, ItemDefinition> = {};
  for (const rel of rels) records[rel] = loadFixture(rel);
  return createCatalog(records).catalog;
}

describe('getSpritePathsForSelections', () => {
  it('resolves a body-only selection to its walk PNG (bodyType=male)', () => {
    const catalog = loadCatalog(['body/body.json']);
    const selections: Selections = {
      bodyType: 'male',
      items: {
        body: { typeName: 'body', name: 'Body Color' },
      },
    };

    const layers = getSpritePathsForSelections(selections, catalog);

    expect(layers).toHaveLength(1);
    expect(layers[0]).toEqual({
      itemId: 'body',
      typeName: 'body',
      path: 'spritesheets/body/bodies/male/walk.png',
      zPos: 10,
    });
  });

  it('uses bodyType=female to switch the base folder', () => {
    const catalog = loadCatalog(['body/body.json']);
    const selections: Selections = {
      bodyType: 'female',
      items: { body: { typeName: 'body', name: 'Body Color' } },
    };

    const layers = getSpritePathsForSelections(selections, catalog);
    expect(layers[0]?.path).toBe('spritesheets/body/bodies/female/walk.png');
  });

  it('substitutes ${head} via replace_in_path for face_blush', () => {
    const catalog = loadCatalog([
      'body/body.json',
      'head/heads/human/heads_human_male.json',
      'head/faces/face_blush.json',
    ]);
    const selections: Selections = {
      bodyType: 'male',
      items: {
        body: { typeName: 'body', name: 'Body Color' },
        head: { typeName: 'head', name: 'Human Male' },
        expression: { typeName: 'expression', name: 'Blush' },
      },
    };

    const layers = getSpritePathsForSelections(selections, catalog);
    const blush = layers.find((l) => l.itemId === 'face_blush');
    expect(blush?.path).toBe('spritesheets/head/faces/male/blush/walk.png');
  });

  it('resolves ${head} differently when the head selection is Human Female', () => {
    const catalog = loadCatalog([
      'body/body.json',
      'head/heads/human/heads_human_female.json',
      'head/faces/face_blush.json',
    ]);
    const selections: Selections = {
      bodyType: 'female',
      items: {
        body: { typeName: 'body', name: 'Body Color' },
        head: { typeName: 'head', name: 'Human Female' },
        expression: { typeName: 'expression', name: 'Blush' },
      },
    };

    const layers = getSpritePathsForSelections(selections, catalog);
    const blush = layers.find((l) => l.itemId === 'face_blush');
    expect(blush?.path).toBe('spritesheets/head/faces/female/blush/walk.png');
  });

  it('sorts layers by zPos ascending across items', () => {
    const catalog = loadCatalog([
      'body/body.json',
      'head/heads/human/heads_human_male.json',
      'head/faces/face_blush.json',
    ]);
    const selections: Selections = {
      bodyType: 'male',
      items: {
        // Insertion order intentionally puts the highest-zPos item first
        // to prove the sort is by zPos, not by selection order.
        expression: { typeName: 'expression', name: 'Blush' },
        head: { typeName: 'head', name: 'Human Male' },
        body: { typeName: 'body', name: 'Body Color' },
      },
    };

    const layers = getSpritePathsForSelections(selections, catalog);
    const zs = layers.map((l) => l.zPos);
    const sorted = [...zs].sort((a, b) => a - b);
    expect(zs).toEqual(sorted);
    // body zPos 10 should come before face_blush zPos 101.
    const bodyIdx = layers.findIndex((l) => l.itemId === 'body');
    const blushIdx = layers.findIndex((l) => l.itemId === 'face_blush');
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(blushIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeLessThan(blushIdx);
  });

  it('appends the variant filename for items with variants', () => {
    const catalog = loadCatalog(['legs/pants/legs_childpants.json']);
    const selections: Selections = {
      bodyType: 'child',
      items: {
        legs: { typeName: 'legs', name: 'Child pants', variant: 'black' },
      },
    };

    const layers = getSpritePathsForSelections(selections, catalog);
    expect(layers).toHaveLength(1);
    expect(layers[0]?.path).toBe(
      'spritesheets/legs/pants/child/walk/black.png',
    );
  });

  it('skips layers with no path for the requested bodyType', () => {
    // legs_childpants only declares "child". With bodyType=female the
    // single layer should be skipped — no throw, body still resolves.
    const catalog = loadCatalog([
      'body/body.json',
      'legs/pants/legs_childpants.json',
    ]);
    const selections: Selections = {
      bodyType: 'female',
      items: {
        body: { typeName: 'body', name: 'Body Color' },
        legs: { typeName: 'legs', name: 'Child pants', variant: 'black' },
      },
    };

    const layers = getSpritePathsForSelections(selections, catalog);
    // Body resolves; childpants doesn't (no female path).
    expect(layers.map((l) => l.itemId)).toEqual(['body']);
  });

  it('skips a selection whose (typeName, name) is not in the catalog', () => {
    const catalog = loadCatalog([
      'body/body.json',
      'head/heads/human/heads_human_male.json',
    ]);
    const selections: Selections = {
      bodyType: 'male',
      items: {
        body: { typeName: 'body', name: 'Body Color' },
        head: { typeName: 'head', name: 'Does Not Exist' },
      },
    };

    const layers = getSpritePathsForSelections(selections, catalog);
    expect(layers.map((l) => l.itemId)).toEqual(['body']);
  });

  it('returns [] for empty selections', () => {
    const catalog = loadCatalog(['body/body.json']);
    const selections: Selections = { bodyType: 'male', items: {} };
    expect(getSpritePathsForSelections(selections, catalog)).toEqual([]);
  });

  it('omits the `customAnimation` field when the layer has none', () => {
    const catalog = loadCatalog(['body/body.json']);
    const selections: Selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'Body Color' } },
    };
    const layers = getSpritePathsForSelections(selections, catalog);
    expect(layers[0]).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(layers[0], 'customAnimation'))
      .toBe(false);
  });

  describe('with synthetic catalog', () => {
    function makeCatalog(items: ItemDefinition[]): Catalog {
      const records: Record<FilePath, ItemDefinition> = {};
      for (let i = 0; i < items.length; i++) {
        const name = items[i]!.name.toLowerCase().replaceAll(' ', '_');
        records[`item_${i}_${name}.json`] = items[i]!;
      }
      return createCatalog(records).catalog;
    }

    it('resolves both standard and custom animation layers from the same item', () => {
      // both custom and standard layers from the same item should be resolved.
      const wheels: ItemDefinition = {
        name: 'Wheelchair',
        type_name: 'wheels',
        animations: ['walk'],
        credits: [],
        variants: ['wood'],
        layer_1: {
          zPos: 50,
          custom_animation: 'wheelchair',
          male: 'wheels/wheelchair/',
        },
        layer_2: {
          zPos: 60,
          male: 'wheels/cover/',
        },
      };
      const catalog = makeCatalog([wheels]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: {
            wheels: { typeName: 'wheels', name: 'Wheelchair', variant: 'wood' },
          },
        },
        catalog,
      );

      expect(layers).toHaveLength(2);
      expect(layers[0]).toEqual({
        itemId: 'item_0_wheelchair',
        typeName: 'wheels',
        path: 'spritesheets/wheels/wheelchair/wood.png',
        zPos: 50,
        customAnimation: 'wheelchair',
      });
      expect(layers[1]).toEqual({
        itemId: 'item_0_wheelchair',
        typeName: 'wheels',
        path: 'spritesheets/wheels/cover/walk/wood.png',
        zPos: 60,
      });
    });

    it('keeps the default representative path when no existence hook is provided', () => {
      const item: ItemDefinition = {
        name: 'Shades',
        type_name: 'facial_eyes',
        animations: ['walk'],
        credits: [],
        variants: ['base'],
        layer_1: { zPos: 115, male: 'facial/glasses/shades/adult/' },
      };
      const catalog = makeCatalog([item]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: {
            facial_eyes: {
              typeName: 'facial_eyes',
              name: 'Shades',
              variant: 'base',
            },
          },
        },
        catalog,
      );

      expect(layers[0]?.path).toBe(
        'spritesheets/facial/glasses/shades/adult/walk/base.png',
      );
    });

    it('uses the flat animation file when a variant representative path is missing', () => {
      const item: ItemDefinition = {
        name: 'Shades',
        type_name: 'facial_eyes',
        animations: ['walk'],
        credits: [],
        variants: ['base'],
        layer_1: { zPos: 115, male: 'facial/glasses/shades/adult/' },
      };
      const catalog = makeCatalog([item]);
      const existing = new Set([
        'spritesheets/facial/glasses/shades/adult/walk.png',
      ]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: {
            facial_eyes: {
              typeName: 'facial_eyes',
              name: 'Shades',
              variant: 'base',
            },
          },
        },
        catalog,
        { pathExists: (spritePath) => existing.has(spritePath) },
      );

      expect(layers[0]?.path).toBe(
        'spritesheets/facial/glasses/shades/adult/walk.png',
      );
    });

    it('uses another supported animation when walk has no representative file', () => {
      const item: ItemDefinition = {
        name: 'Shield',
        type_name: 'shield',
        animations: ['walk', 'idle'],
        credits: [],
        variants: ['red'],
        layer_1: { zPos: 2, male: 'shield/heater/original/wood/bg/' },
      };
      const catalog = makeCatalog([item]);
      const existing = new Set([
        'spritesheets/shield/heater/original/wood/bg/idle/red.png',
      ]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: {
            shield: {
              typeName: 'shield',
              name: 'Shield',
              variant: 'red',
            },
          },
        },
        catalog,
        { pathExists: (spritePath) => existing.has(spritePath) },
      );

      expect(layers[0]?.path).toBe(
        'spritesheets/shield/heater/original/wood/bg/idle/red.png',
      );
    });

    it('honours standard-only filter when layer_1 has no custom_animation', () => {
      // layer_1 standard, layer_2 custom. Only layer_1 survives.
      const item: ItemDefinition = {
        name: 'Mixed',
        type_name: 'mixed',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 50, male: 'mixed/std/' },
        layer_2: {
          zPos: 60,
          male: 'mixed/cus/',
          custom_animation: 'wheelchair',
        },
      };
      const catalog = makeCatalog([item]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: { mixed: { typeName: 'mixed', name: 'Mixed' } },
        },
        catalog,
      );
      expect(layers).toHaveLength(1);
      expect(layers[0]?.path).toBe('spritesheets/mixed/std/walk.png');
    });

    it("falls back to animations[0] when 'walk' is absent", () => {
      const item: ItemDefinition = {
        name: 'Special',
        type_name: 'special',
        animations: ['idle', 'jump'],
        credits: [],
        layer_1: { zPos: 5, male: 'special/' },
      };
      const catalog = makeCatalog([item]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: { special: { typeName: 'special', name: 'Special' } },
        },
        catalog,
      );
      expect(layers[0]?.path).toBe('spritesheets/special/idle.png');
    });

    it('walks layer_1..N and stops at the first missing layer', () => {
      const item: ItemDefinition = {
        name: 'Multi',
        type_name: 'multi',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 1, male: 'multi/a/' },
        // layer_2 intentionally absent.
        layer_3: { zPos: 3, male: 'multi/c/' },
      };
      const catalog = makeCatalog([item]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: { multi: { typeName: 'multi', name: 'Multi' } },
        },
        catalog,
      );
      // layer_3 must NOT be picked up; iteration breaks at layer_2.
      expect(layers).toHaveLength(1);
      expect(layers[0]?.path).toBe('spritesheets/multi/a/walk.png');
    });

    it('skips layers whose ${...} placeholder cannot be resolved', () => {
      // Safety net: if selections has no `head`, the unresolved ${head}
      // would become a literal in the URL and guarantee a 404. The layer
      // is dropped instead. (Upstream's es6DynamicTemplate emits the
      // literal; we diverge to keep the network quiet.)
      const face: ItemDefinition = {
        name: 'Blush',
        type_name: 'expression',
        animations: ['walk'],
        credits: [],
        replace_in_path: { head: { Human_Male: 'male' } },
        layer_1: { zPos: 101, male: 'head/faces/${head}/blush/' },
      };
      const catalog = makeCatalog([face]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: {
            expression: { typeName: 'expression', name: 'Blush' },
          },
        },
        catalog,
      );
      expect(layers).toEqual([]);
    });

    it('skips layers whose ${X} placeholder has no entry in replace_in_path[X]', () => {
      // Head IS selected, but its name isn't in the expression's
      // replace_in_path.head table (non-human heads against a
      // human-only expression). Layer is dropped, not emitted with the
      // literal `${head}` left in the URL.
      const face: ItemDefinition = {
        name: 'Blush',
        type_name: 'expression',
        animations: ['walk'],
        credits: [],
        replace_in_path: { head: { Human_Male: 'male' } },
        layer_1: { zPos: 101, male: 'head/faces/${head}/blush/' },
      };
      const catalog = makeCatalog([face]);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: {
            head: { typeName: 'head', name: 'Wolf' },
            expression: { typeName: 'expression', name: 'Blush' },
          },
        },
        catalog,
      );
      expect(layers).toEqual([]);
    });
  });
});

describe('composeSelections', () => {
  function regionPixels(
    canvas: CanvasLike,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Uint8ClampedArray {
    return canvas.getContext('2d').getImageData(x, y, w, h).data;
  }

  function hasContent(data: Uint8ClampedArray): boolean {
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  }

  function everyPixelEquals(
    data: Uint8ClampedArray,
    rgba: readonly [number, number, number, number],
  ): boolean {
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] !== rgba[0] ||
        data[i + 1] !== rgba[1] ||
        data[i + 2] !== rgba[2] ||
        data[i + 3] !== rgba[3]
      ) {
        return false;
      }
    }
    return true;
  }

  // ANIMATION_OFFSETS: spellcast=0, walk=8*64=512.
  const WALK_Y = 512;
  const SPELLCAST_Y = 0;

  describe('with real attributed fixtures', () => {
    const adapter = createNodeCanvasAdapter();

    it('composes a body-only male selection into an 832x3456 sheet', async () => {
      const catalog = loadCatalog(['body/body.json']);
      const selections: Selections = {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Body Color' } },
      };

      const sheet = await composeSelections(selections, {
        catalog,
        adapter,
        spritesheetsBaseUrl: realPixelFixtureBase,
      });

      expect(sheet.width).toBe(832);
      expect(sheet.height).toBe(3456);
      expect(sheet.canvas.width).toBe(832);
      expect(sheet.canvas.height).toBe(3456);
      expect(sheet.credits.entries.length).toBeGreaterThan(0);
      expect(sheet.layers.map((l) => l.itemId)).toEqual(['body']);
      // body declares walk/spellcast/hurt → logical names reported.
      expect(sheet.animations).toContain('walk');
      expect(sheet.animations).toContain('spellcast');
      expect(sheet.animations).toContain('hurt');
      // 'watering' has no ANIMATION_OFFSETS folder (shares thrust row),
      // so it is never independently composed even though body declares it.
      expect(sheet.animations).not.toContain('watering');
      // The walk block is drawn at its vertical offset.
      expect(
        hasContent(regionPixels(sheet.canvas, 0, WALK_Y, 832, 256)),
      ).toBe(true);
    });

    it('honours the options.animations filter (logical names)', async () => {
      const catalog = loadCatalog(['body/body.json']);
      const selections: Selections = {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Body Color' } },
      };

      const sheet = await composeSelections(selections, {
        catalog,
        adapter,
        spritesheetsBaseUrl: realPixelFixtureBase,
        animations: ['walk'],
      });

      expect(sheet.animations).toEqual(['walk']);
      expect(hasContent(regionPixels(sheet.canvas, 0, WALK_Y, 832, 256))).toBe(
        true,
      );
      // Spellcast was filtered out → that row group stays transparent.
      expect(
        hasContent(regionPixels(sheet.canvas, 0, SPELLCAST_Y, 832, 256)),
      ).toBe(false);
    });
  });

  describe('with a synthetic single-color sprite', () => {
    function makeCatalog(items: ItemDefinition[]): Catalog {
      const records: Record<FilePath, ItemDefinition> = {};
      for (let i = 0; i < items.length; i++) {
        const name = items[i]!.name.toLowerCase().replaceAll(' ', '_');
        records[`item_${i}_${name}.json`] = items[i]!;
      }
      return createCatalog(records).catalog;
    }

    const bodyItem: ItemDefinition = {
      name: 'Test Body',
      type_name: 'body',
      animations: ['walk'],
      credits: [
        {
          file: 'test/body',
          notes: '',
          authors: ['tester'],
          licenses: ['CC0'],
          urls: [],
        },
      ],
      layer_1: { zPos: 10, male: 'test/body/' },
    };

    function syntheticAdapter(image = solidImage(8, 8, '#ff0000')): {
      adapter: CanvasAdapter;
      loadCalls: string[];
    } {
      const base = createNodeCanvasAdapter();
      const loadCalls: string[] = [];
      return {
        loadCalls,
        adapter: {
          createCanvas: base.createCanvas,
          loadImage(p: string) {
            loadCalls.push(p);
            return Promise.resolve(image);
          },
        },
      };
    }

    const selections: Selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'Test Body' } },
    };

    it('draws the raw sprite at the walk offset when no palette resolver', async () => {
      const { adapter, loadCalls } = syntheticAdapter();
      const progress: Array<[number, number]> = [];

      const sheet = await composeSelections(selections, {
        catalog: makeCatalog([bodyItem]),
        adapter,
        spritesheetsBaseUrl: '',
        onProgress: (loaded, total) => progress.push([loaded, total]),
      });

      // Only 'walk' is supported → exactly one image load.
      expect(loadCalls).toEqual(['spritesheets/test/body/walk.png']);
      expect(progress).toEqual([[1, 1]]);
      expect(sheet.animations).toEqual(['walk']);
      expect(
        everyPixelEquals(regionPixels(sheet.canvas, 0, WALK_Y, 8, 8), [
          255, 0, 0, 255,
        ]),
      ).toBe(true);
    });

    it('can compose only one item layer for split-by-item exports', async () => {
      const multiLayerItem: ItemDefinition = {
        ...bodyItem,
        layer_1: { zPos: 10, male: 'test/body/back/' },
        layer_2: { zPos: 20, male: 'test/body/front/' },
      };
      const { adapter, loadCalls } = syntheticAdapter();

      await composeSelections(selections, {
        catalog: makeCatalog([multiLayerItem]),
        adapter,
        spritesheetsBaseUrl: '',
        onlyLayerNumber: 2,
      });

      expect(loadCalls).toEqual(['spritesheets/test/body/front/walk.png']);
    });

    it('draws extra standard layers according to z-position', async () => {
      const base = createNodeCanvasAdapter();
      const extra = makeCanvas(832, 3456, (ctx) => {
        ctx.fillStyle = '#0000ff';
        ctx.fillRect(0, WALK_Y, 16, 16);
      });

      const sheet = await composeSelections(selections, {
        catalog: makeCatalog([bodyItem]),
        adapter: {
          ...base,
          loadImage: async () => {
            const img = base.createCanvas(832, 256);
            const ctx = img.getContext('2d');
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, 16, 16);
            return img;
          },
        },
        spritesheetsBaseUrl: '',
        extraStandardLayers: [{ image: extra, zPos: 20 }],
      });

      const [r, g, b] = sheet.canvas
        .getContext('2d')
        .getImageData(1, WALK_Y + 1, 1, 1).data;
      expect([r, g, b]).toEqual([0, 0, 255]);
    });

    it('applies recolor via options.resolvePalette before drawing (A2)', async () => {
      const { adapter } = syntheticAdapter();
      const swap: PaletteSwap = {
        material: 'body',
        source: ['#ff0000'],
        target: ['#0000ff'],
      };

      const sheet = await composeSelections(selections, {
        catalog: makeCatalog([bodyItem]),
        adapter,
        spritesheetsBaseUrl: '',
        resolvePalette: (sel, item) => {
          expect(sel.name).toBe('Test Body');
          expect(item.type_name).toBe('body');
          return swap;
        },
      });

      expect(
        everyPixelEquals(regionPixels(sheet.canvas, 0, WALK_Y, 8, 8), [
          0, 0, 255, 255,
        ]),
      ).toBe(true);
    });

    it('swallows per-image load failures and still returns a sheet', async () => {
      const base = createNodeCanvasAdapter();
      const adapter: CanvasAdapter = {
        createCanvas: base.createCanvas,
        loadImage: () => Promise.reject(new Error('404')),
      };

      const sheet = await composeSelections(selections, {
        catalog: makeCatalog([bodyItem]),
        adapter,
        spritesheetsBaseUrl: '',
      });

      expect(sheet.width).toBe(832);
      expect(sheet.height).toBe(3456);
      expect(sheet.animations).toEqual([]);
      expect(
        hasContent(regionPixels(sheet.canvas, 0, WALK_Y, 8, 8)),
      ).toBe(false);
      // Failed layers do not contribute pixels or attribution.
      expect(sheet.layers).toEqual([]);
      expect(sheet.credits.entries).toEqual([]);
    });

    it('composes a custom-only item into a block below the standard sheet (B1 closed)', async () => {
      // Previously asserted the B1 deferral (custom layers skipped). Step
      // 3.4 closes B1: the wheelchair block is now composed below 3456 and
      // the standard region stays untouched (no pollution).
      const wheels: ItemDefinition = {
        name: 'Wheelchair',
        type_name: 'wheels',
        animations: ['wheelchair'],
        credits: [],
        variants: ['wood'],
        layer_1: {
          zPos: 50,
          custom_animation: 'wheelchair',
          male: 'wheels/wheelchair/',
        },
      };
      // wheelchair def: frameSize 64, 4 rows × 2 cols → 128×256 block.
      const { adapter, loadCalls } = syntheticAdapter(
        solidImage(128, 256, '#ff00ff'),
      );

      const sheet = await composeSelections(
        {
          bodyType: 'male',
          items: {
            wheels: { typeName: 'wheels', name: 'Wheelchair', variant: 'wood' },
          },
        },
        {
          catalog: makeCatalog([wheels]),
          adapter,
          spritesheetsBaseUrl: '',
        },
      );

      // The custom-sprite PNG is loaded via its direct (no-anim) path.
      expect(loadCalls).toEqual(['spritesheets/wheels/wheelchair/wood.png']);
      // Custom names are a separate axis — not standard `animations`.
      expect(sheet.animations).toEqual([]);
      // Variable-size canvas: 832 × (3456 + 256).
      expect(sheet.width).toBe(832);
      expect(sheet.height).toBe(3712);
      expect(sheet.canvas.width).toBe(832);
      expect(sheet.canvas.height).toBe(3712);
      // Geometry exposed for extractAnimation (Q3).
      expect(sheet.customAnimations?.get('wheelchair')).toEqual({
        offsetY: 3456,
        frameSize: 64,
        rows: 4,
        cols: 2,
      });
      // Block has content; standard region is untouched (no pollution).
      expect(
        hasContent(regionPixels(sheet.canvas, 0, 3456, 128, 256)),
      ).toBe(true);
      expect(
        hasContent(regionPixels(sheet.canvas, 0, 0, 832, 3456)),
      ).toBe(false);
    });
  });

  describe('custom-animation compositing (Step 3.4)', () => {
    function makeCatalog(items: ItemDefinition[]): Catalog {
      const records: Record<FilePath, ItemDefinition> = {};
      for (let i = 0; i < items.length; i++) {
        const name = items[i]!.name.toLowerCase().replaceAll(' ', '_');
        records[`item_${i}_${name}.json`] = items[i]!;
      }
      return createCatalog(records).catalog;
    }

    // Returns a distinct image per requested path (custom sprite vs. the
    // standard base-anim PNG), so we can assert exact pixel landing.
    function byPathAdapter(
      images: Readonly<Record<string, CanvasLike>>,
    ): CanvasAdapter {
      const base = createNodeCanvasAdapter();
      return {
        createCanvas: base.createCanvas,
        loadImage(p: string) {
          for (const [suffix, img] of Object.entries(images)) {
            if (p.endsWith(suffix)) return Promise.resolve(img);
          }
          return Promise.reject(new Error(`no fixture for ${p}`));
        },
      };
    }

    const wheelchairItem: ItemDefinition = {
      name: 'Wheelchair',
      type_name: 'wc',
      animations: ['wheelchair'],
      credits: [],
      variants: ['v'],
      layer_1: { zPos: 0, custom_animation: 'wheelchair', male: 'wc/' },
    };

    // Body declares only 'sit' → exactly one standard load. wheelchair's
    // base anim is 'sit' (customAnimationBase: frames[0][0]="sit-n,2").
    const sitBody: ItemDefinition = {
      name: 'Body',
      type_name: 'body',
      animations: ['sit'],
      credits: [],
      layer_1: { zPos: 10, male: 'bd/' },
    };

    const bothSelections: Selections = {
      bodyType: 'male',
      items: {
        wc: { typeName: 'wc', name: 'Wheelchair', variant: 'v' },
        body: { typeName: 'body', name: 'Body' },
      },
    };

    // sit.png-shaped fixture (192×256, single-animation → direction-map
    // branch, Q5). Column 2 (x 128..192) carries the colors the wheelchair
    // def samples ("sit-{n,w,s,e},2"); the 'e' row is left transparent so
    // the wheelchair sprite shows through it (proves draw order / zPos).
    function sitSource(): CanvasLike {
      return makeCanvas(192, 256, (ctx) => {
        ctx.fillStyle = '#ff0000'; // n  → src row 0
        ctx.fillRect(128, 0, 64, 64);
        ctx.fillStyle = '#00ff00'; // w  → src row 1
        ctx.fillRect(128, 64, 64, 64);
        ctx.fillStyle = '#0000ff'; // s  → src row 2
        ctx.fillRect(128, 128, 64, 64);
        // e (src row 3, y 192..256) intentionally left transparent.
      });
    }

    it('re-lays the base-anim frames into the block via the direction map (Q5)', async () => {
      const adapter = byPathAdapter({
        'wc/v.png': makeCanvas(128, 256, (ctx) => {
          ctx.fillStyle = '#ffff00'; // wheelchair sprite (behind, zPos 0)
          ctx.fillRect(0, 0, 128, 256);
        }),
        'bd/sit.png': sitSource(),
      });

      const sheet = await composeSelections(bothSelections, {
        catalog: makeCatalog([wheelchairItem, sitBody]),
        adapter,
        spritesheetsBaseUrl: '',
      });

      expect(sheet.height).toBe(3712);
      // Each src column-2 cell is copied to BOTH j=0 and j=1 dest columns
      // (wheelchair frames are ["sit-x,2","sit-x,2"]); destY = 64*i+3456.
      const at = (x: number, y: number) =>
        regionPixels(sheet.canvas, x, y, 1, 1);
      // i=0 (n) → red, both frame columns.
      expect(everyPixelEquals(at(10, 3456 + 10), [255, 0, 0, 255])).toBe(true);
      expect(everyPixelEquals(at(74, 3456 + 10), [255, 0, 0, 255])).toBe(true);
      // i=1 (w) → green.
      expect(everyPixelEquals(at(10, 3520 + 10), [0, 255, 0, 255])).toBe(true);
      // i=2 (s) → blue.
      expect(everyPixelEquals(at(10, 3584 + 10), [0, 0, 255, 255])).toBe(true);
      // i=3 (e) → sit frame transparent there, so the wheelchair sprite
      // (drawn first, zPos 0) shows through: proves custom_sprite landing
      // at (0, offsetY) AND zPos draw order.
      expect(everyPixelEquals(at(10, 3648 + 10), [255, 255, 0, 255])).toBe(
        true,
      );
    });

    it('applies resolvePalette to custom_sprite and extracted_frames (Q4)', async () => {
      const adapter = byPathAdapter({
        'wc/v.png': makeCanvas(128, 256, (ctx) => {
          ctx.fillStyle = '#ff00ff';
          ctx.fillRect(0, 0, 128, 256);
        }),
        'bd/sit.png': sitSource(),
      });

      const sheet = await composeSelections(bothSelections, {
        catalog: makeCatalog([wheelchairItem, sitBody]),
        adapter,
        spritesheetsBaseUrl: '',
        resolvePalette: (_sel, item) => {
          if (item.type_name === 'wc') {
            return { material: 'wc', source: ['#ff00ff'], target: ['#00ffff'] };
          }
          return { material: 'body', source: ['#ff0000'], target: ['#ff00ff'] };
        },
      });

      const at = (x: number, y: number) =>
        regionPixels(sheet.canvas, x, y, 1, 1);
      // extracted_frames recolored: sit 'n' red → magenta.
      expect(everyPixelEquals(at(10, 3456 + 10), [255, 0, 255, 255])).toBe(
        true,
      );
      // custom_sprite recolored: visible through the transparent 'e' row,
      // wheelchair magenta → cyan.
      expect(everyPixelEquals(at(10, 3648 + 10), [0, 255, 255, 255])).toBe(
        true,
      );
    });
  });

  describe('custom-animation compositing with real attributed fixtures', () => {
    const adapter = createNodeCanvasAdapter();

    it('composes the wheelchair block below a real body and re-lays its sit frames', async () => {
      const catalog = loadCatalog(['body/body.json', 'body/wheelchair.json']);
      const withBody: Selections = {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color' },
          wheelchair: {
            typeName: 'wheelchair',
            name: 'Wheelchair',
            variant: 'black',
          },
        },
      };

      const sheet = await composeSelections(withBody, {
        catalog,
        adapter,
        spritesheetsBaseUrl: realPixelFixtureBase,
      });

      // Variable canvas: 832 × (3456 + wheelchair block 256).
      expect(sheet.width).toBe(832);
      expect(sheet.height).toBe(3712);
      expect(sheet.canvas.height).toBe(3712);
      expect(sheet.customAnimations?.get('wheelchair')).toEqual({
        offsetY: 3456,
        frameSize: 64,
        rows: 4,
        cols: 2,
      });
      expect(sheet.credits.entries.length).toBeGreaterThan(0);
      // The wheelchair block has non-transparent pixels.
      expect(
        hasContent(regionPixels(sheet.canvas, 0, 3456, 128, 256)),
      ).toBe(true);
      // Standard sheet still composed (no pollution either way): the body
      // declares walk, so its walk block is present.
      expect(sheet.animations).toContain('walk');
      expect(
        hasContent(regionPixels(sheet.canvas, 0, WALK_Y, 832, 256)),
      ).toBe(true);

      // The body's sit frames are re-laid into the block: composing the
      // wheelchair WITHOUT the body yields a different (sparser) block.
      const wheelOnly = await composeSelections(
        {
          bodyType: 'male',
          items: {
            wheelchair: {
              typeName: 'wheelchair',
              name: 'Wheelchair',
              variant: 'black',
            },
          },
        },
        { catalog, adapter, spritesheetsBaseUrl: realPixelFixtureBase },
      );
      expect(wheelOnly.credits.entries.map((entry) => entry.file)).toEqual([
        'body/wheelchair',
      ]);
      expect(wheelOnly.credits.entries.map((entry) => entry.authors)).toEqual([
        ['Eliza Wyatt'],
      ]);
      expect(wheelOnly.credits.resolvedPaths).toEqual([
        'body/wheelchair/adult/background/black.png',
      ]);

      const blockWith = regionPixels(sheet.canvas, 0, 3456, 128, 256);
      const blockWithout = regionPixels(
        wheelOnly.canvas,
        0,
        3456,
        128,
        256,
      );
      let differs = false;
      for (let i = 0; i < blockWith.length; i++) {
        if (blockWith[i] !== blockWithout[i]) {
          differs = true;
          break;
        }
      }
      expect(differs).toBe(true);
    });
  });

  describe('missing layers error handling', () => {
    const mockCanvasAdapter = (
      loadImageFn: (url: string) => ImageLike,
    ): CanvasAdapter => {
      const base = createNodeCanvasAdapter();
      return {
        createCanvas: base.createCanvas,
        loadImage: async (url: string) => loadImageFn(url),
      };
    };
    const createMockImage = (w: number, h: number) => {
      return solidImage(w, h, '#ff0000');
    };
    const testCatalog = () => {
      const bodyItem: ItemDefinition = {
        name: 'Human Female',
        type_name: 'body',
        animations: ['walk'],
        credits: [{
          file: 'body',
          authors: ['Loaded Artist'],
          licenses: ['CC-BY 4.0'],
          urls: [],
        }],
        layer_1: { zPos: 10, female: 'body/' },
      };
      const neckItem: ItemDefinition = {
        name: 'Bowtie',
        type_name: 'neck',
        animations: ['walk'],
        credits: [{
          file: 'neck',
          authors: ['Missing Artist'],
          licenses: ['GPL 3.0'],
          urls: [],
        }],
        layer_1: { zPos: 20, female: 'neck/' },
      };
      const wheelsItem: ItemDefinition = {
        name: 'Wheelchair',
        type_name: 'wheels',
        animations: [],
        variants: ['black'],
        credits: [],
        layer_1: {
          zPos: 20,
          female: 'wheels/',
          custom_animation: 'wheelchair',
        },
      };
      const records: Record<FilePath, ItemDefinition> = {
        'body/body.json': bodyItem,
        'neck/neck.json': neckItem,
        'wheels/wheelchair.json': wheelsItem,
      };
      return createCatalog(records).catalog;
    };

    it('records missing optional layers while completing composition', async () => {
      const selections: Selections = {
        bodyType: 'female',
        items: {
          body: { typeName: 'body', name: 'Human Female' },
          neck: { typeName: 'neck', name: 'Bowtie' },
        },
      };

      const adapter = mockCanvasAdapter((url) => {
        if (url.includes('neck')) {
          throw new Error('Optional asset missing');
        }
        return createMockImage(64, 64);
      });

      const sheet = await composeSelections(selections, {
        catalog: testCatalog(),
        adapter,
        spritesheetsBaseUrl: '',
      });

      expect(sheet.canvas).toBeDefined();
      expect(sheet.missingPaths).toEqual([
        'spritesheets/neck/walk.png',
      ]);
      expect(sheet.layers.map((layer) => layer.path)).toEqual([
        'spritesheets/body/walk.png',
      ]);
      expect(sheet.credits.entries.map((entry) => entry.authors)).toEqual([
        ['Loaded Artist'],
      ]);
      expect(sheet.credits.resolvedPaths).toEqual(['body/walk.png']);
      expect(computeEffectiveLicense(sheet.credits)).toBe('CC-BY 4.0');
    });

    it('attributes every successfully composed animation path', async () => {
      const bodyItem: ItemDefinition = {
        name: 'Human Male',
        type_name: 'body',
        animations: ['spellcast', 'walk'],
        credits: [
          {
            file: 'body/spellcast.png',
            authors: ['Spellcast Artist'],
            licenses: ['CC-BY 4.0'],
            urls: [],
          },
          {
            file: 'body/walk.png',
            authors: ['Walk Artist'],
            licenses: ['GPL 3.0'],
            urls: [],
          },
        ],
        layer_1: { zPos: 10, male: 'body/' },
      };
      const catalog = createCatalog({
        'body/body.json': bodyItem,
      }).catalog;
      const selections: Selections = {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Human Male' },
        },
      };

      const sheet = await composeSelections(selections, {
        catalog,
        adapter: mockCanvasAdapter(() => createMockImage(64, 64)),
        spritesheetsBaseUrl: '',
      });

      expect(sheet.credits.entries.map((entry) => entry.file)).toEqual([
        'body/spellcast.png',
        'body/walk.png',
      ]);
      expect(sheet.credits.resolvedPaths).toEqual([
        'body/spellcast.png',
        'body/walk.png',
      ]);
    });

    it('uses the default animation path for a folder-level credit', async () => {
      const bodyItem: ItemDefinition = {
        name: 'Human Male',
        type_name: 'body',
        animations: ['spellcast', 'walk'],
        credits: [
          {
            file: 'body',
            authors: ['Body Artist'],
            licenses: ['CC-BY 4.0'],
            urls: [],
          },
        ],
        layer_1: { zPos: 10, male: 'body/' },
      };
      const catalog = createCatalog({
        'body/body.json': bodyItem,
      }).catalog;
      const selections: Selections = {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Human Male' },
        },
      };

      const sheet = await composeSelections(selections, {
        catalog,
        adapter: mockCanvasAdapter(() => createMockImage(64, 64)),
        spritesheetsBaseUrl: '',
      });

      expect(sheet.credits.resolvedPaths).toEqual(['body/walk.png']);
    });

    it('records missing custom-animation layers while completing composition', async () => {
      const selections: Selections = {
        bodyType: 'female',
        items: {
          wheels: {
            typeName: 'wheels',
            name: 'Wheelchair',
            variant: 'black',
          },
        },
      };
      const adapter = mockCanvasAdapter(() => {
        throw new Error('Custom asset missing');
      });

      const sheet = await composeSelections(selections, {
        catalog: testCatalog(),
        adapter,
        spritesheetsBaseUrl: '',
      });

      expect(sheet.canvas).toBeDefined();
      expect(sheet.missingPaths).toEqual([
        'spritesheets/wheels/black.png',
      ]);
    });
  });
});
