import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import { getThumbnailCropRect } from '../src/hooks/use-item-thumbnail';

describe('getThumbnailCropRect', () => {
  it('resolves standard animations using ANIMATION_OFFSETS', () => {
    // Standard item definition with standard preview metadata (or defaults)
    const def = {
      name: 'Shirt',
      type_name: 'torso',
      layer_1: { zPos: 10, male: 't/' },
    } as unknown as ItemDefinition;

    const rect = getThumbnailCropRect(def, 'walk', new Map());
    expect(rect).toEqual({
      sx: 0, // preview_column defaults to 0
      sy: 512 + 128, // walk offset (512) + preview_row defaults (2 * 64 = 128) = 640
      size: 64,
    });
  });

  it('resolves custom animations using the custom animation block offsetY', () => {
    // Custom item definition (like Fishing Rod)
    const def = {
      name: 'Rod',
      type_name: 'weapon',
      preview_row: 0,
      preview_column: 0,
      preview_x_offset: 304,
      preview_y_offset: 24,
      layer_1: {
        zPos: 9,
        custom_animation: 'tool_rod',
        male: 't/',
      },
    } as unknown as ItemDefinition;

    const customAnimationsMap = new Map([
      ['tool_rod', { offsetY: 3456 }],
    ]);

    const rect = getThumbnailCropRect(def, 'tool_rod', customAnimationsMap);
    expect(rect).toEqual({
      sx: 304, // 0 * 64 + 304 = 304
      sy: 3480, // 3456 + 0 * 64 + 24 = 3480
      size: 64,
    });
  });

  it('resolves custom animations (like Longsword Alt) with negative offset', () => {
    // Custom item definition with offset values
    const def = {
      name: 'Longsword alt',
      type_name: 'weapon',
      preview_row: 5,
      preview_column: 0,
      preview_x_offset: 28,
      preview_y_offset: -16,
      layer_1: {
        zPos: 140,
        custom_animation: 'walk_128',
        male: 't/',
      },
    } as unknown as ItemDefinition;

    const customAnimationsMap = new Map([
      ['walk_128', { offsetY: 3456 }],
    ]);

    const rect = getThumbnailCropRect(def, 'walk_128', customAnimationsMap);
    expect(rect).toEqual({
      sx: 28, // 0 * 64 + 28 = 28
      sy: 3760, // 3456 + 5 * 64 - 16 = 3456 + 320 - 16 = 3760
      size: 64,
    });
  });

  it('falls back to defaults if def is undefined', () => {
    const rect = getThumbnailCropRect(undefined, 'walk', new Map());
    expect(rect).toEqual({
      sx: 0,
      sy: 640,
      size: 64,
    });
  });

  it('retains original source crop values for representative item without modifications to sx, sy, or size', () => {
    const def = {
      name: 'Stud Ring',
      type_name: 'ring',
      preview_row: 2,
      preview_column: 0,
      layer_1: { zPos: 10, male: 'r/' },
    } as unknown as ItemDefinition;

    const rect = getThumbnailCropRect(def, 'walk', new Map());
    expect(rect).toEqual({
      sx: 0,
      sy: 640,
      size: 64,
    });
  });
});
