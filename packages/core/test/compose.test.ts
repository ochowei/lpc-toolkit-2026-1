import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import { composeSelections, getSpritePathsForSelections } from '../src/compose.js';
import type { CanvasAdapter, CanvasLike } from '../src/adapters.js';
import type { PaletteSwap } from '../src/recolor.js';
import type {
  Catalog,
  FilePath,
  ItemDefinition,
  Selections,
} from '../src/types.js';
import {
  createNodeCanvasAdapter,
  solidImage,
} from './helpers/node-canvas-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const upstreamRoot = path.join(here, '../../../upstream/sheet_definitions');
const upstreamBase = path.join(here, '../../../upstream');

function loadFixture(relPath: FilePath): ItemDefinition {
  return JSON.parse(
    readFileSync(path.join(upstreamRoot, relPath), 'utf8'),
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

    it('honours custom_animation filter from layer_1', () => {
      // layer_1 has custom_animation 'wheelchair', layer_2 has no
      // custom_animation. Only layer_1 should survive the filter.
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

      expect(layers).toHaveLength(1);
      expect(layers[0]?.path).toBe('spritesheets/wheels/wheelchair/wood.png');
      expect(layers[0]?.customAnimation).toBe('wheelchair');
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

    it('keeps unresolved ${...} placeholders when the referenced selection is missing', () => {
      // If selections has no `head`, the ${head} stays as literal text —
      // matches upstream es6DynamicTemplate fallback.
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
      expect(layers[0]?.path).toBe(
        'spritesheets/head/faces/${head}/blush/walk.png',
      );
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

  describe('with real upstream spritesheets', () => {
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
        spritesheetsBaseUrl: upstreamBase,
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
        spritesheetsBaseUrl: upstreamBase,
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
      // Credits are still resolved from the catalog, not the pixels.
      expect(sheet.credits.entries.map((e) => e.file)).toEqual(['test/body']);
    });

    it('skips custom-animation layers from the standard sheet (B1)', async () => {
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
      };
      const { adapter, loadCalls } = syntheticAdapter();

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

      // No standard-sheet draw for a custom-animation-only item.
      expect(loadCalls).toEqual([]);
      expect(sheet.animations).toEqual([]);
      expect(sheet.width).toBe(832);
      expect(sheet.height).toBe(3456);
    });
  });
});
