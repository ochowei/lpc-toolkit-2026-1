import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCanvas,
  loadImage as napiLoadImage,
} from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { createCatalog, createPaletteCatalog } from '@lpc-toolkit/core';
import type { Catalog, CanvasAdapter, CanvasLike, ImageLike } from '@lpc-toolkit/core';
import {
  deriveThumbnailMetrics,
  expandAuditCases,
  rowsToCsv,
  summaryToMarkdown,
  runAuditCase,
  type ThumbnailAuditRow,
} from '../scripts/thumbnail-visible-bounds-audit-lib';


describe('deriveThumbnailMetrics', () => {
  it('calculates current visible size and two-pixel-margin fit scale', () => {
    expect(deriveThumbnailMetrics({ x: 10, y: 8, width: 16, height: 8 }, 64))
      .toEqual({
        widthRatio: 0.25,
        heightRatio: 0.125,
        visibleWidthAt24: 6,
        visibleHeightAt24: 3,
        fitScalePxPerSourcePixel: 1.25,
        additionalScaleOverCurrent: 10 / 3,
      });
  });
});

describe('expandAuditCases', () => {
  it('expands catalog items into deterministic audit cases based on supported body types and variants', () => {
    const catalog = {
      byItemId: new Map([
        [
          'hair/twists',
          {
            name: 'Twists',
            type_name: 'hair',
            animations: ['walk'],
            credits: [],
            layer_1: { zPos: 10 },
            variants: ['long', 'short'],
            body_types: { male: true },
          },
        ],
        [
          'hat/crown',
          {
            name: 'Crown',
            type_name: 'hat',
            animations: ['walk'],
            credits: [],
            layer_1: { zPos: 11 },
            body_types: { female: true },
          },
        ],
      ]),
      byTypeName: new Map(),
      typeNames: [],
      aliases: new Map(),
    } as unknown as Catalog;

    const cases = expandAuditCases(catalog, ['male', 'female']);
    expect(cases).toEqual([
      {
        itemId: 'hair/twists',
        item: catalog.byItemId.get('hair/twists'),
        bodyType: 'male',
        variant: 'long',
      },
      {
        itemId: 'hair/twists',
        item: catalog.byItemId.get('hair/twists'),
        bodyType: 'male',
        variant: 'short',
      },
      {
        itemId: 'hat/crown',
        item: catalog.byItemId.get('hat/crown'),
        bodyType: 'female',
      },
    ]);
  });
});

describe('serialization', () => {
  const sampleRows: ThumbnailAuditRow[] = [
    {
      itemId: 'hair/twists',
      typeName: 'hair',
      itemName: 'Twists',
      bodyType: 'male',
      variant: 'long',
      animation: 'walk',
      direction: 'down',
      frameIndex: 0,
      frameSize: 64,
      status: 'ok',
      bounds: { x: 10, y: 10, width: 10, height: 10 },
      metrics: {
        widthRatio: 0.15625,
        heightRatio: 0.15625,
        visibleWidthAt24: 3.75,
        visibleHeightAt24: 3.75,
        fitScalePxPerSourcePixel: 2.0,
        additionalScaleOverCurrent: 5.3333,
      },
      missingPaths: [],
    },
    {
      itemId: 'hat/crown',
      typeName: 'hat',
      itemName: 'Crown',
      bodyType: 'female',
      direction: 'down',
      frameIndex: 0,
      status: 'empty',
      missingPaths: ['spritesheets/hat/crown_female.png'],
    },
  ];

  it('rowsToCsv formats rows cleanly as CSV', () => {
    const csv = rowsToCsv(sampleRows);
    expect(csv).toContain('itemId,typeName,itemName,bodyType,variant,animation,direction,frameIndex,frameSize,status');
    expect(csv).toContain('"hair/twists","hair","Twists","male","long","walk","down","0","64","ok"');
    expect(csv).toContain('"spritesheets/hat/crown_female.png"');
  });

  it('summaryToMarkdown creates a summary report', () => {
    const md = summaryToMarkdown(sampleRows);
    expect(md).toContain('# Thumbnail Visible Bounds Audit');
    expect(md).toContain('| ok | 1 |');
    expect(md).toContain('| empty | 1 |');
    expect(md).toContain('## By Type');
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const paletteDefsDir = path.join(repoRoot, 'assets/palette_definitions');
const spritesheetsDir = path.join(repoRoot, 'assets/spritesheets');

describe.runIf(existsSync(sheetDefsDir))('real-asset integration audit test', () => {
  function walkJson(dir: string, base = dir): Record<string, any> {
    const out: Record<string, any> = {};
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) Object.assign(out, walkJson(full, base));
      else if (e.name.endsWith('.json')) {
        const key = path.relative(base, full).split(path.sep).join('/');
        out[key] = JSON.parse(readFileSync(full, 'utf8'));
      }
    }
    return out;
  }

  function loadRealPalettes() {
    const records: Record<string, unknown> = {};
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
    walk(paletteDefsDir, '');
    return createPaletteCatalog(records).palettes;
  }

  it('runs runAuditCase on twists_fade, braid, and arming sword', async () => {
    const sheetRecs = walkJson(sheetDefsDir);
    const sortedSheetRecs = Object.fromEntries(
      Object.entries(sheetRecs).sort(([a], [b]) => a.localeCompare(b))
    );
    const { catalog } = createCatalog(sortedSheetRecs);
    const palettes = loadRealPalettes();

    const twistsFadeItem = catalog.byItemId.get('hair_twists_fade');
    const braidItem = catalog.byItemId.get('hair_braid');
    const swordItem = catalog.byItemId.get('weapon_sword_arming');

    expect(twistsFadeItem).toBeDefined();
    expect(braidItem).toBeDefined();
    expect(swordItem).toBeDefined();

    const cases = [
      { itemId: 'hair_twists_fade', item: twistsFadeItem!, bodyType: 'male' },
      { itemId: 'hair_braid', item: braidItem!, bodyType: 'male' },
      { itemId: 'weapon_sword_arming', item: swordItem!, bodyType: 'male', variant: 'steel' },
    ];

    const failedPaths: string[] = [];
    const adapter: CanvasAdapter = {
      createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
      loadImage: async (logicalPath): Promise<ImageLike> => {
        const rel = logicalPath.replace(/^spritesheets\//, '');
        try {
          return await napiLoadImage(path.join(spritesheetsDir, rel)) as unknown as ImageLike;
        } catch (error) {
          failedPaths.push(logicalPath);
          throw error;
        }
      },
    };

    const deps = {
      catalog,
      palettes,
      adapter,
      failedPaths,
    };

    for (const caseData of cases) {
      const row = await runAuditCase(caseData, deps);
      expect(row.itemId).toBe(caseData.itemId);
      expect(row.bodyType).toBe(caseData.bodyType);
      expect(row.variant).toBe(caseData.variant);
      expect(row.direction).toBe('down');
      expect(row.frameIndex).toBe(0);
      if (row.status === 'ok') {
        expect(row.frameSize).toBe(64);
        expect(row.bounds).toBeDefined();
        expect(row.bounds!.width).toBeGreaterThan(0);
        expect(row.bounds!.height).toBeGreaterThan(0);
        expect(row.metrics).toBeDefined();
      } else {
        expect(row.status === 'empty' || row.status === 'error').toBe(true);
      }
    }
  });
});

describe('runAuditCase behavior for custom animations and fallbacks', () => {
  it('falls back to alternate directions for empty default directions', async () => {
    const mockBackpackItem = {
      name: 'Backpack',
      type_name: 'backpack',
      credits: [],
      variants: ['standard'],
      layer_1: {
        male: 'backpack_male',
        zPos: 10,
      },
      animations: ['walk'],
    };

    const catalog = {
      byItemId: new Map([['backpack', mockBackpackItem]]),
    } as unknown as Catalog;

    const palettes = {
      materials: new Map(),
    } as unknown as any;

    const adapter: CanvasAdapter = {
      createCanvas: (w, h) => {
        return createCanvas(w, h) as unknown as CanvasLike;
      },
      loadImage: async () => {
        const imgCanvas = createCanvas(832, 256);
        const ctx = imgCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(255, 0, 0, 1)';
        ctx.fillRect(74, 10, 10, 10);
        return imgCanvas as unknown as ImageLike;
      },
    };

    const caseData = {
      itemId: 'backpack',
      item: mockBackpackItem as any,
      bodyType: 'male',
    };

    const row = await runAuditCase(caseData, {
      catalog,
      palettes,
      adapter,
      failedPaths: [],
    });

    expect(row.status).toBe('ok');
    expect(row.direction).toBe('up');
    expect(row.bounds).toEqual({
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    });
  });

  it('correctly calculates custom animation bounds', async () => {
    const mockWheelchairItem = {
      name: 'Wheelchair',
      type_name: 'wheelchair',
      credits: [],
      variants: ['standard'],
      layer_1: {
        male: 'wheelchair_male',
        zPos: 10,
        custom_animation: 'wheelchair',
      },
      animations: [],
    };

    const catalog = {
      byItemId: new Map([['wheelchair', mockWheelchairItem]]),
    } as unknown as Catalog;

    const palettes = {
      materials: new Map(),
    } as unknown as any;

    const adapter: CanvasAdapter = {
      createCanvas: (w, h) => {
        return createCanvas(w, h) as unknown as CanvasLike;
      },
      loadImage: async () => {
        const imgCanvas = createCanvas(128, 256);
        const ctx = imgCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(255, 0, 0, 1)';
        ctx.fillRect(15, 143, 10, 10);
        return imgCanvas as unknown as ImageLike;
      },
    };

    const caseData = {
      itemId: 'wheelchair',
      item: mockWheelchairItem as any,
      bodyType: 'male',
    };

    const row = await runAuditCase(caseData, {
      catalog,
      palettes,
      adapter,
      failedPaths: [],
    });

    expect(row.status).toBe('ok');
    expect(row.direction).toBe('down');
    expect(row.frameSize).toBe(64);
    expect(row.bounds).toEqual({
      x: 15,
      y: 15,
      width: 10,
      height: 10,
    });
  });
});


