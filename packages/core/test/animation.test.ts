import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import { composeSelections } from '../src/compose.js';
import { extractAnimation } from '../src/animation.js';
import type { CanvasAdapter, CanvasLike } from '../src/adapters.js';
import type {
  ComposedSheet,
  CreditsManifest,
  FilePath,
  ItemDefinition,
  Selections,
} from '../src/types.js';
import {
  createNodeCanvasAdapter,
  makeCanvas,
  solidImage,
} from './helpers/node-canvas-adapter.js';

const adapter = createNodeCanvasAdapter();

function regionPixels(
  canvas: CanvasLike,
  x: number,
  y: number,
  w: number,
  h: number,
): Uint8ClampedArray {
  return canvas.getContext('2d').getImageData(x, y, w, h).data;
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

function hasContent(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true;
  }
  return false;
}

describe('extractAnimation', () => {
  // ANIMATION_CONFIGS: walk row 8 num 4 (y 512, h 256), cycle length 8.
  //                    hurt row 20 num 1 (y 1280, h 64), cycle length 6.
  //                    spellcast row 0 num 4 (y 0, h 256), cycle length 7.
  const credits: CreditsManifest = {
    entries: [
      {
        file: 'test/a',
        notes: '',
        authors: ['t'],
        licenses: ['CC0'],
        urls: [],
      },
    ],
    resolvedPaths: [],
    licenses: ['CC0'],
  };

  function paintedSheet(): ComposedSheet {
    const canvas = makeCanvas(832, 3456, (ctx) => {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 512, 832, 256); // walk row group
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 1280, 832, 64); // hurt row
    });
    return {
      canvas,
      width: 832,
      height: 3456,
      selections: { bodyType: 'male', items: {} },
      credits,
      layers: [],
      animations: [],
    };
  }

  it('crops the walk row group (832x256, 4 directions)', () => {
    const anim = extractAnimation(paintedSheet(), 'walk', { adapter });

    expect(anim.width).toBe(832);
    expect(anim.height).toBe(256);
    expect(anim.canvas.width).toBe(832);
    expect(anim.canvas.height).toBe(256);
    expect(anim.directions).toBe(4);
    expect(anim.frameCount).toBe(8); // walk cycle [1..8]
    expect(anim.animation).toBe('walk');
    expect(
      everyPixelEquals(regionPixels(anim.canvas, 0, 0, 832, 256), [
        255, 0, 0, 255,
      ]),
    ).toBe(true);
  });

  it('crops the hurt row (832x64, 1 direction)', () => {
    const anim = extractAnimation(paintedSheet(), 'hurt', { adapter });

    expect(anim.width).toBe(832);
    expect(anim.height).toBe(64);
    expect(anim.directions).toBe(1);
    expect(anim.frameCount).toBe(6); // hurt cycle [0..5]
    expect(
      everyPixelEquals(regionPixels(anim.canvas, 0, 0, 832, 64), [
        0, 255, 0, 255,
      ]),
    ).toBe(true);
  });

  it('returns a transparent crop for a known but un-composed animation (Q4)', () => {
    // spellcast row group (y 0) was never painted.
    const anim = extractAnimation(paintedSheet(), 'spellcast', { adapter });

    expect(anim.width).toBe(832);
    expect(anim.height).toBe(256);
    expect(anim.directions).toBe(4);
    expect(anim.frameCount).toBe(7); // spellcast cycle [0..6]
    expect(hasContent(regionPixels(anim.canvas, 0, 0, 832, 256))).toBe(false);
  });

  it('passes the sheet credits through by reference', () => {
    const sheet = paintedSheet();
    const anim = extractAnimation(sheet, 'walk', { adapter });
    expect(anim.credits).toBe(sheet.credits);
  });

  it('throws on an unknown animation name', () => {
    expect(() =>
      extractAnimation(paintedSheet(), 'not-an-animation', { adapter }),
    ).toThrow(/unknown animation "not-an-animation"/);
  });

  describe('on a real composeSelections output', () => {
    function makeCatalog(items: ItemDefinition[]) {
      const records: Record<FilePath, ItemDefinition> = {};
      for (let i = 0; i < items.length; i++) {
        records[`item_${i}.json`] = items[i]!;
      }
      return createCatalog(records).catalog;
    }

    const bodyItem: ItemDefinition = {
      name: 'Test Body',
      type_name: 'body',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: 'test/body/' },
    };

    function syntheticAdapter(): CanvasAdapter {
      const base = createNodeCanvasAdapter();
      return {
        createCanvas: base.createCanvas,
        loadImage: () => Promise.resolve(solidImage(64, 256, '#0000ff')),
      };
    }

    const selections: Selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'Test Body' } },
    };

    it('extracts the composed walk frames; un-composed anim is transparent', async () => {
      const sheet = await composeSelections(selections, {
        catalog: makeCatalog([bodyItem]),
        adapter: syntheticAdapter(),
        spritesheetsBaseUrl: '',
      });

      const walk = extractAnimation(sheet, 'walk', { adapter });
      expect(walk.height).toBe(256);
      // The synthetic 64x256 blue sprite was drawn at the walk offset.
      expect(
        everyPixelEquals(regionPixels(walk.canvas, 0, 0, 64, 256), [
          0, 0, 255, 255,
        ]),
      ).toBe(true);

      // spellcast was not composed (body only declares walk) → transparent.
      const spellcast = extractAnimation(sheet, 'spellcast', { adapter });
      expect(
        hasContent(regionPixels(spellcast.canvas, 0, 0, 832, 256)),
      ).toBe(false);
    });
  });

  describe('custom-animation extraction (Step 3.4 Q3)', () => {
    function makeCatalog(items: ItemDefinition[]) {
      const records: Record<FilePath, ItemDefinition> = {};
      for (let i = 0; i < items.length; i++) {
        records[`item_${i}.json`] = items[i]!;
      }
      return createCatalog(records).catalog;
    }

    const wheelchairItem: ItemDefinition = {
      name: 'Wheelchair',
      type_name: 'wc',
      animations: ['wheelchair'],
      credits: [],
      variants: ['v'],
      layer_1: { zPos: 0, custom_animation: 'wheelchair', male: 'wc/' },
    };

    async function composeWheelchair(): Promise<ComposedSheet> {
      const orange = makeCanvas(128, 256, (ctx) => {
        ctx.fillStyle = '#ffa500';
        ctx.fillRect(0, 0, 128, 256);
      });
      const wcAdapter: CanvasAdapter = {
        createCanvas: createNodeCanvasAdapter().createCanvas,
        loadImage: () => Promise.resolve(orange),
      };
      return composeSelections(
        {
          bodyType: 'male',
          items: { wc: { typeName: 'wc', name: 'Wheelchair', variant: 'v' } },
        },
        {
          catalog: makeCatalog([wheelchairItem]),
          adapter: wcAdapter,
          spritesheetsBaseUrl: '',
        },
      );
    }

    it('tight-crops a custom block (cols×rows·frameSize) with rows=directions, cols=frameCount', async () => {
      const sheet = await composeWheelchair();
      const anim = extractAnimation(sheet, 'wheelchair', { adapter });

      expect(anim.width).toBe(128); // cols 2 × 64
      expect(anim.height).toBe(256); // rows 4 × 64
      expect(anim.canvas.width).toBe(128);
      expect(anim.canvas.height).toBe(256);
      expect(anim.animation).toBe('wheelchair');
      expect(anim.directions).toBe(4); // rows
      expect(anim.frameCount).toBe(2); // cols
      expect(anim.credits).toBe(sheet.credits); // by reference (3.3 Q5)
      expect(
        everyPixelEquals(regionPixels(anim.canvas, 0, 0, 128, 256), [
          255, 165, 0, 255,
        ]),
      ).toBe(true);
    });

    it('documents custom animation extraction as a toolkit API extension', async () => {
      const sheet = await composeWheelchair();
      const anim = extractAnimation(sheet, 'wheelchair', { adapter });

      expect(anim.animation).toBe('wheelchair');
      expect(anim.width).toBe(128);
      expect(anim.height).toBe(256);
    });

    it('still extracts standard animations from the same sheet', async () => {
      const sheet = await composeWheelchair();
      // No body → walk row group is a valid, transparent 832×256 crop.
      const walk = extractAnimation(sheet, 'walk', { adapter });
      expect(walk.width).toBe(832);
      expect(walk.height).toBe(256);
      expect(hasContent(regionPixels(walk.canvas, 0, 0, 832, 256))).toBe(
        false,
      );
    });

    it('throws for a name in neither configs nor this sheet (refines 3.3 Q3)', async () => {
      const sheet = await composeWheelchair();
      expect(() => extractAnimation(sheet, 'tool_rod', { adapter })).toThrow(
        /unknown animation "tool_rod"/,
      );
      // The error lists this sheet's custom blocks among the known names.
      expect(() => extractAnimation(sheet, 'nope', { adapter })).toThrow(
        /wheelchair/,
      );
    });
  });
});
