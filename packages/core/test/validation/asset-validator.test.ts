import { describe, expect, it } from 'vitest';
import { makeCatalog } from '../helpers/catalog.js';
import { validateAssets } from '../../src/validation/asset-validator.js';
import type { CanvasAdapter, CanvasLike, ImageLike } from '../../src/index.js';

const mockAdapter = (
  loadMock: (url: string) => Promise<ImageLike>,
  createMock?: (w: number, h: number) => CanvasLike
): CanvasAdapter => ({
  createCanvas: createMock ?? ((w, h) => ({
    width: w,
    height: h,
    getContext: () => ({
      drawImage: () => {},
      getImageData: () => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
    }),
  } as unknown as CanvasLike)),
  loadImage: loadMock,
});

describe('validateAssets', () => {
  it('identifies missing body assets as errors and accessory as warnings', async () => {
    const catalog = makeCatalog([
      {
        name: 'Human Male',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 0, male: 'body/male/' },
      },
      {
        name: 'Bowtie',
        type_name: 'neck',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 50, male: 'neck/bowtie/' },
      }
    ]);

    const adapter = mockAdapter(async (url) => {
      if (url.includes('body') || url.includes('neck')) {
        throw new Error('File not found');
      }
      return { width: 64, height: 64 } as ImageLike;
    });

    const issues = await validateAssets({
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
    });

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.itemId).toBe('item_0_human_male');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]?.itemId).toBe('item_1_bowtie');
  });

  it('identifies blank/transparent placeholders', async () => {
    const catalog = makeCatalog([
      {
        name: 'Human Male',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 0, male: 'body/male/' },
      },
    ]);

    // Adapter returns successfully loaded images
    const adapter = mockAdapter(
      async () => ({ width: 64, height: 64 } as ImageLike),
      (w, h) => ({
        width: w,
        height: h,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({
            // All zeros = fully transparent
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
        }),
      } as unknown as CanvasLike)
    );

    const issues = await validateAssets({
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
      getFileSize: async () => 500, // < 1024 bytes
    });

    const blankIssues = issues.filter(i => i.message.includes('empty/transparent placeholder'));
    expect(blankIssues.length).toBeGreaterThan(0);
    expect(blankIssues[0]?.itemId).toBe('item_0_human_male');
    expect(blankIssues[0]?.severity).toBe('error');
  });

  it('does not flag non-blank images even if file size is small', async () => {
    const catalog = makeCatalog([
      {
        name: 'Human Male',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 0, male: 'body/male/' },
      },
    ]);

    // Adapter returns an image with some opaque pixels
    const adapter = mockAdapter(
      async () => ({ width: 64, height: 64 } as ImageLike),
      (w, h) => ({
        width: w,
        height: h,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => {
            const data = new Uint8ClampedArray(w * h * 4);
            // Put a non-transparent pixel (alpha > 0)
            data[3] = 255;
            return {
              data,
              width: w,
              height: h,
            };
          },
        }),
      } as unknown as CanvasLike)
    );

    const issues = await validateAssets({
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
      getFileSize: async () => 500,
    });

    const blankIssues = issues.filter(i => i.message.includes('empty/transparent placeholder'));
    expect(blankIssues.length).toBe(0);
  });
});
