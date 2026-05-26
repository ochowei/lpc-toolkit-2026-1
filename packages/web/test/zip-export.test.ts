import { describe, expect, it } from 'vitest';
import {
  zipExportTimestamp,
  zipName,
  itemFileName,
  exportByAnimationZip,
  type ExportContext,
} from '../src/lib/zip-export';
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import type { ComposedSheet, CreditsManifest } from '@lpc-toolkit/core';

describe('zipExportTimestamp', () => {
  it('matches the upstream yyyy-MM-ddTHH-mm-ss pattern', () => {
    expect(zipExportTimestamp()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/,
    );
  });
});

describe('zipName', () => {
  it.each([
    ['byAnimation', 'animations'],
    ['byItem', 'item_spritesheets'],
    ['byAnimItem', 'item_animations'],
    ['byFrame', 'individual_frames'],
  ] as const)('formats %s ZIP filename', (kind, segment) => {
    const name = zipName('male', kind, '2026-05-26T14-32-08');
    expect(name).toBe(`lpc_male_${segment}_2026-05-26T14-32-08.zip`);
  });
});

describe('itemFileName', () => {
  it('zero-pads zPos to 3 digits and lowercases name', () => {
    expect(itemFileName({ name: 'Body Male Light', zPos: 50 })).toBe(
      '050 body_male_light.png',
    );
  });

  it('replaces non-[a-z0-9.] with underscore', () => {
    expect(itemFileName({ name: 'shield #1 (round)', zPos: 200 })).toBe(
      '200 shield__1__round_.png',
    );
  });

  it('falls back to itemId_variant when name is empty', () => {
    expect(
      itemFileName({
        name: '',
        zPos: 7,
        itemId: 'hair_messy',
        variant: 'blonde',
      }),
    ).toBe('007 hair_messy_blonde.png');
  });
});


const EMPTY_CREDITS: CreditsManifest = {
  entries: [],
  resolvedPaths: [],
  licenses: [],
};

function makeAdapter() {
  return {
    createCanvas: (w: number, h: number) =>
      createCanvas(w, h) as unknown as import('@lpc-toolkit/core').CanvasLike,
    loadImage: async () => {
      throw new Error('not used in this test');
    },
  };
}

function makeWalkSheet(): ComposedSheet {
  // Paint walk row group only (row 8 → y 512, h 256).
  const canvas = createCanvas(832, 3456);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 512, 832, 256);
  return {
    canvas: canvas as unknown as import('@lpc-toolkit/core').CanvasLike,
    width: 832,
    height: 3456,
    selections: { bodyType: 'male', items: {} },
    credits: EMPTY_CREDITS,
    layers: [],
    animations: ['walk'],
  };
}

describe('exportByAnimationZip (F4)', () => {
  it('produces a ZIP containing standard/<anim>.png and credits/credits.txt+csv', async () => {
    const sheet = makeWalkSheet();
    const ctx: ExportContext = {
      sheet,
      selections: sheet.selections,
      catalog: {
        byItemId: new Map(),
        byTypeName: new Map(),
        typeNames: [],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimationZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      'credits/credits.csv',
      'credits/credits.txt',
      'standard/walk.png',
    ]);
    const pngBytes = await zip.file('standard/walk.png')!.async('uint8array');
    expect(pngBytes.length).toBeGreaterThan(0);
  });

  it('produces custom/<name>.png entries for sheet.customAnimations', async () => {
    // Compose a sheet with a 1-direction × 3-frame wheelchair-style custom block
    // immediately below the standard sheet (offsetY=3456, rows=1, cols=3, frameSize=64).
    const baseCanvas = createCanvas(832, 3456 + 64);
    const ctx2 = baseCanvas.getContext('2d');
    ctx2.fillStyle = '#00ff00';
    ctx2.fillRect(0, 3456, 3 * 64, 64);
    const sheet: ComposedSheet = {
      canvas: baseCanvas as unknown as import('@lpc-toolkit/core').CanvasLike,
      width: 832,
      height: 3456 + 64,
      selections: { bodyType: 'male', items: {} },
      credits: EMPTY_CREDITS,
      layers: [],
      animations: [],
      customAnimations: new Map([
        ['wheelchair', { offsetY: 3456, frameSize: 64, rows: 1, cols: 3 }],
      ]),
    };
    const ctx: ExportContext = {
      sheet,
      selections: sheet.selections,
      catalog: {
        byItemId: new Map(),
        byTypeName: new Map(),
        typeNames: [],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimationZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      'credits/credits.csv',
      'credits/credits.txt',
      'custom/wheelchair.png',
    ]);
    const pngBytes = await zip.file('custom/wheelchair.png')!.async('uint8array');
    expect(pngBytes.length).toBeGreaterThan(0);
  });
});
