/** Verifies custom overlay dimensions, z-order parsing, and ZIP naming. */
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  CUSTOM_OVERLAY_HEIGHT,
  CUSTOM_OVERLAY_WIDTH,
  customOverlayItemFileName,
  parseCustomOverlayZPos,
  validateCustomOverlayDimensions,
  type CustomOverlay,
} from '../src/lib/custom-overlay';

function makeOverlay(zPos = 70): CustomOverlay {
  const image = createCanvas(CUSTOM_OVERLAY_WIDTH, CUSTOM_OVERLAY_HEIGHT);
  return {
    fileName: 'Cape Test.png',
    objectUrl: 'blob:test',
    image: image as unknown as CustomOverlay['image'],
    width: CUSTOM_OVERLAY_WIDTH,
    height: CUSTOM_OVERLAY_HEIGHT,
    zPos,
  };
}

describe('validateCustomOverlayDimensions', () => {
  it('accepts the standard master spritesheet size', () => {
    expect(validateCustomOverlayDimensions(832, 3456)).toEqual({ ok: true });
  });

  it('documents the toolkit full-sheet overlay model instead of upstream per-animation uploads', () => {
    expect(CUSTOM_OVERLAY_WIDTH).toBe(832);
    expect(CUSTOM_OVERLAY_HEIGHT).toBe(3456);
    expect(validateCustomOverlayDimensions(64, 64)).toEqual({
      ok: false,
      width: 64,
      height: 64,
    });
  });

  it('rejects non-standard dimensions with exact actual dimensions', () => {
    expect(validateCustomOverlayDimensions(800, 3456)).toEqual({
      ok: false,
      width: 800,
      height: 3456,
    });
  });
});

describe('parseCustomOverlayZPos', () => {
  it.each([
    ['', 0],
    ['abc', 0],
    ['70', 70],
    ['-5', -5],
    ['42.9', 42],
  ])('maps %s to %s', (raw, expected) => {
    expect(parseCustomOverlayZPos(raw)).toBe(expected);
  });
});

describe('customOverlayItemFileName', () => {
  it('formats a stable custom-upload item name', () => {
    expect(
      customOverlayItemFileName({ fileName: 'Cape Test.PNG', zPos: 70 }),
    ).toBe('070 custom-upload_cape_test.png.png');
  });
});

describe('CustomOverlay shape', () => {
  it('stores loaded image metadata and z-position', () => {
    expect(makeOverlay()).toMatchObject({
      fileName: 'Cape Test.png',
      objectUrl: 'blob:test',
      width: CUSTOM_OVERLAY_WIDTH,
      height: CUSTOM_OVERLAY_HEIGHT,
      zPos: 70,
    });
  });
});
