import { describe, expect, it } from 'vitest';
import {
  zipExportTimestamp,
  zipName,
  itemFileName,
  exportByAnimationZip,
  exportByItemZip,
  exportByAnimItemZip,
  exportByFrameZip,
  type ExportContext,
} from '../src/lib/zip-export';
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import type { ComposedSheet, CreditsManifest, ItemDefinition } from '@lpc-toolkit/core';
import {
  customOverlayItemFileName,
  type CustomOverlay,
} from '../src/lib/custom-overlay';

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

function makeCustomOverlay(): CustomOverlay {
  const image = createCanvas(832, 3456);
  const ctx = image.getContext('2d');
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 512, 64, 64);
  return {
    fileName: 'Cape Test.png',
    objectUrl: 'blob:test',
    image: image as unknown as CustomOverlay['image'],
    width: 832,
    height: 3456,
    zPos: 70,
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

function makeItem(zPos: number): ItemDefinition {
  return {
    name: 'male light',
    type_name: 'body',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos, male: 'body/bodies/male/' },
  };
}

describe('exportByItemZip (F5)', () => {
  it('produces a ZIP with one items/<zPos> <name>.png entry per selected item', async () => {
    const sheet = makeWalkSheet();
    const selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male light' } },
    };
    const itemDef = makeItem(50);
    const ctx: ExportContext = {
      sheet,
      selections,
      catalog: {
        byItemId: new Map([['body/male_light', itemDef]]),
        byTypeName: new Map([['body', [itemDef]]]),
        typeNames: ['body'],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByItemZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files).sort();
    expect(keys).toContain('credits/credits.txt');
    expect(keys).toContain('credits/credits.csv');
    expect(keys.some((k) => k.startsWith('items/050 '))).toBe(true);
    expect(keys.find((k) => k.startsWith('items/'))).toBe('items/050 male_light.png');
    const itemKey = keys.find((k) => k.startsWith('items/'))!;
    const pngBytes = await zip.file(itemKey)!.async('uint8array');
    expect(pngBytes.length).toBeGreaterThan(0);
  });

  it('includes a custom-upload item entry without adding it to credits', async () => {
    const sheet = makeWalkSheet();
    const customOverlay = makeCustomOverlay();
    const ctx: ExportContext = {
      sheet,
      selections: { bodyType: 'male', items: {} },
      catalog: {
        byItemId: new Map(),
        byTypeName: new Map(),
        typeNames: [],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      customOverlay,
      onProgress: () => {},
    };

    const blob = await exportByItemZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const filename = customOverlayItemFileName({
      fileName: customOverlay.fileName,
      zPos: customOverlay.zPos,
    });
    const keys = Object.keys(zip.files).sort();
    expect(keys).toContain(`items/${filename}`);

    const credits = await zip.file('credits/credits.txt')!.async('string');
    expect(credits).not.toContain('Cape Test');
    expect(credits).not.toContain('custom-upload');
  });
});

describe('exportByAnimItemZip (F6)', () => {
  it('nests item PNGs under standard/<anim>/ folders', async () => {
    const sheet = makeWalkSheet();
    const selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male light' } },
    };
    const itemDef = makeItem(50);
    const ctx: ExportContext = {
      sheet,
      selections,
      catalog: {
        byItemId: new Map([['body/male_light', itemDef]]),
        byTypeName: new Map([['body', [itemDef]]]),
        typeNames: ['body'],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimItemZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files).sort();
    expect(keys).toContain('standard/walk/050 male_light.png');
    expect(keys).toContain('credits/credits.txt');
    expect(keys).toContain('credits/credits.csv');
  });

  it('skips an item for an anim it does not declare', async () => {
    const sheet = makeWalkSheet();
    // Override sheet.animations to include slash even though the item only declares walk.
    const sheet2: ComposedSheet = { ...sheet, animations: ['walk', 'slash'] };
    const selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male light' } },
    };
    const itemDef = makeItem(50);  // itemDef.animations = ['walk'] from makeItem
    const ctx: ExportContext = {
      sheet: sheet2,
      selections,
      catalog: {
        byItemId: new Map([['body/male_light', itemDef]]),
        byTypeName: new Map([['body', [itemDef]]]),
        typeNames: ['body'],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet2,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimItemZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files);
    expect(keys).toContain('standard/walk/050 male_light.png');
    expect(keys.some((k) => k.startsWith('standard/slash/'))).toBe(false);
  });

  it('writes custom/<name>/<item>.png entries when sheet has customAnimations', async () => {
    // Sheet with a 1×3 custom-anim block at offsetY=3456.
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
    const selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male light' } },
    };
    const itemDef = makeItem(50);
    const exportCtx: ExportContext = {
      sheet,
      selections,
      catalog: {
        byItemId: new Map([['body/male_light', itemDef]]),
        byTypeName: new Map([['body', [itemDef]]]),
        typeNames: ['body'],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimItemZip(exportCtx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files).sort();
    expect(keys).toContain('custom/wheelchair/050 male_light.png');
    expect(keys).toContain('credits/credits.txt');
    expect(keys).toContain('credits/credits.csv');
  });

  it('includes custom-upload item entries for standard animations only', async () => {
    const baseCanvas = createCanvas(832, 3456 + 64);
    const ctx2 = baseCanvas.getContext('2d');
    ctx2.fillStyle = '#ff0000';
    ctx2.fillRect(0, 512, 832, 256);
    ctx2.fillStyle = '#00ff00';
    ctx2.fillRect(0, 3456, 3 * 64, 64);
    const sheet: ComposedSheet = {
      canvas: baseCanvas as unknown as import('@lpc-toolkit/core').CanvasLike,
      width: 832,
      height: 3456 + 64,
      selections: { bodyType: 'male', items: {} },
      credits: EMPTY_CREDITS,
      layers: [],
      animations: ['walk'],
      customAnimations: new Map([
        ['wheelchair', { offsetY: 3456, frameSize: 64, rows: 1, cols: 3 }],
      ]),
    };
    const customOverlay = makeCustomOverlay();
    const exportCtx: ExportContext = {
      sheet,
      selections: { bodyType: 'male', items: {} },
      catalog: {
        byItemId: new Map(),
        byTypeName: new Map(),
        typeNames: [],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      customOverlay,
      onProgress: () => {},
    };

    const blob = await exportByAnimItemZip(exportCtx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const filename = customOverlayItemFileName({
      fileName: customOverlay.fileName,
      zPos: customOverlay.zPos,
    });
    const keys = Object.keys(zip.files).sort();
    expect(keys).toContain(`standard/walk/${filename}`);
    expect(keys).not.toContain(`custom/wheelchair/${filename}`);

    const credits = await zip.file('credits/credits.txt')!.async('string');
    expect(credits).not.toContain('Cape Test');
    expect(credits).not.toContain('custom-upload');
  });
});

describe('exportByFrameZip (F7)', () => {
  it('produces standard/<anim>/<dir>/<frame#>.png entries', async () => {
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
    const blob = await exportByFrameZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files);
    // walk row group y=512..768, painted full 832×256, so all 13 cols × 4 dirs.
    expect(keys.filter((k) => k.startsWith('standard/walk/'))).toHaveLength(
      4 * 13,
    );
    expect(keys).toContain('standard/walk/down/3.png');
    expect(keys).toContain('credits/credits.txt');
    expect(keys).toContain('credits/credits.csv');
  });
});
