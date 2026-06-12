import { describe, expect, it } from 'vitest';
import type { Catalog } from '@lpc-toolkit/core';
import {
  deriveThumbnailMetrics,
  findAlphaBounds,
  expandAuditCases,
  rowsToCsv,
  summaryToMarkdown,
  type ThumbnailAuditRow,
} from '../scripts/thumbnail-visible-bounds-audit-lib';

function rgba(width: number, height: number, visible: readonly [number, number][]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of visible) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

describe('findAlphaBounds', () => {
  it('returns null for a transparent frame', () => {
    expect(findAlphaBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });

  it('returns inclusive bounds for visible pixels touching frame edges', () => {
    expect(findAlphaBounds(rgba(4, 4, [[0, 1], [3, 2]]), 4, 4)).toEqual({
      x: 0,
      y: 1,
      width: 4,
      height: 2,
    });
  });
});

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

