import { describe, expect, it } from 'vitest';
import { extractAnimationFrames } from '../src/frames.js';
import type { ComposedSheet, CreditsManifest } from '../src/types.js';
import {
  createNodeCanvasAdapter,
  makeCanvas,
} from './helpers/node-canvas-adapter.js';

const adapter = createNodeCanvasAdapter();

const EMPTY_CREDITS: CreditsManifest = {
  entries: [],
  resolvedPaths: [],
  licenses: [],
};

function paintedSheet(): ComposedSheet {
  // Paint walk row group (row 8, num 4, y=512, h=256). Fill only the first
  // 3 frame columns so we can verify skipEmpty drops the rest.
  const canvas = makeCanvas(832, 3456, (ctx) => {
    ctx.fillStyle = '#ff0000';
    for (let dir = 0; dir < 4; dir++) {
      for (let f = 0; f < 3; f++) {
        ctx.fillRect(f * 64, 512 + dir * 64, 64, 64);
      }
    }
  });
  return {
    canvas,
    width: 832,
    height: 3456,
    selections: { bodyType: 'male', items: {} },
    credits: EMPTY_CREDITS,
    layers: [],
    animations: ['walk'],
  };
}

describe('extractAnimationFrames — standard', () => {
  it('returns 4 directions for num=4 animation (walk)', () => {
    const sheet = paintedSheet();
    const frames = extractAnimationFrames(sheet, 'walk', { adapter });
    expect([...frames.keys()]).toEqual(['up', 'left', 'down', 'right']);
  });

  it('returns only "up" for num=1 animation (hurt)', () => {
    // Paint hurt row (row 20, num 1, y=1280, h=64). Frames 0–5 only.
    const sheet: ComposedSheet = {
      ...paintedSheet(),
      canvas: makeCanvas(832, 3456, (ctx) => {
        ctx.fillStyle = '#00ff00';
        for (let f = 0; f < 6; f++) {
          ctx.fillRect(f * 64, 1280, 64, 64);
        }
      }),
    };
    const frames = extractAnimationFrames(sheet, 'hurt', { adapter });
    expect([...frames.keys()]).toEqual(['up']);
    expect(frames.get('up')!).toHaveLength(6);
    expect(frames.get('up')![0]!.frameNumber).toBe(1);
  });

  it('drops fully transparent frames when skipEmpty is true (default)', () => {
    const sheet = paintedSheet();
    const frames = extractAnimationFrames(sheet, 'walk', { adapter });
    // walk row painted frames 0–2 only → each direction has 3 frames
    expect(frames.get('up')!).toHaveLength(3);
    expect(frames.get('up')!.map((f) => f.frameNumber)).toEqual([1, 2, 3]);
  });

  it('emits 13 frames per row when skipEmpty is false', () => {
    const sheet = paintedSheet();
    const frames = extractAnimationFrames(sheet, 'walk', {
      adapter,
      skipEmpty: false,
    });
    expect(frames.get('up')!).toHaveLength(13);
  });

  it('produces 64×64 frame canvases with correct pixel content', () => {
    const sheet = paintedSheet();
    const frames = extractAnimationFrames(sheet, 'walk', { adapter });
    const first = frames.get('up')![0]!.canvas;
    expect(first.width).toBe(64);
    expect(first.height).toBe(64);
    const px = first.getContext('2d').getImageData(0, 0, 1, 1).data;
    expect([px[0], px[1], px[2], px[3]]).toEqual([255, 0, 0, 255]);
  });

  it('throws on unknown animation name', () => {
    const sheet = paintedSheet();
    expect(() =>
      extractAnimationFrames(sheet, 'nope-animation', { adapter }),
    ).toThrow(/unknown animation/);
  });
});

describe('extractAnimationFrames — custom', () => {
  function customSheet(rows: number, cols: number, frameSize: number): ComposedSheet {
    const sheetH = 3456 + rows * frameSize;
    const canvas = makeCanvas(832, sheetH, (ctx) => {
      ctx.fillStyle = '#0000ff';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillRect(c * frameSize, 3456 + r * frameSize, frameSize, frameSize);
        }
      }
    });
    return {
      canvas,
      width: 832,
      height: sheetH,
      selections: { bodyType: 'male', items: {} },
      credits: EMPTY_CREDITS,
      layers: [],
      animations: [],
      customAnimations: new Map([
        ['wheelchair', { offsetY: 3456, frameSize, rows, cols }],
      ]),
    };
  }

  it('returns 4 directions when region.rows === 4', () => {
    const sheet = customSheet(4, 8, 64);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    expect([...frames.keys()]).toEqual(['up', 'left', 'down', 'right']);
    expect(frames.get('right')!).toHaveLength(8);
  });

  it('returns only "up" when region.rows === 1', () => {
    const sheet = customSheet(1, 5, 64);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    expect([...frames.keys()]).toEqual(['up']);
    expect(frames.get('up')!).toHaveLength(5);
  });

  it('returns first `rows` DIRECTIONS for rows=2', () => {
    const sheet = customSheet(2, 3, 64);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    expect([...frames.keys()]).toEqual(['up', 'left']);
  });

  it('uses region.frameSize for frame canvas size (non-64)', () => {
    const sheet = customSheet(4, 2, 128);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    const first = frames.get('up')![0]!.canvas;
    expect(first.width).toBe(128);
    expect(first.height).toBe(128);
  });

  it('drops empty frames in custom path when skipEmpty is true (default)', () => {
    // 4×4 region. Only column 0 and column 2 painted in each direction row;
    // columns 1 and 3 are fully transparent.
    const rows = 4, cols = 4, frameSize = 64;
    const sheetH = 3456 + rows * frameSize;
    const canvas = makeCanvas(832, sheetH, (ctx) => {
      ctx.fillStyle = '#0000ff';
      for (let r = 0; r < rows; r++) {
        ctx.fillRect(0 * frameSize, 3456 + r * frameSize, frameSize, frameSize);
        ctx.fillRect(2 * frameSize, 3456 + r * frameSize, frameSize, frameSize);
      }
    });
    const sheet: ComposedSheet = {
      canvas,
      width: 832,
      height: sheetH,
      selections: { bodyType: 'male', items: {} },
      credits: EMPTY_CREDITS,
      layers: [],
      animations: [],
      customAnimations: new Map([
        ['wheelchair', { offsetY: 3456, frameSize, rows, cols }],
      ]),
    };
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    expect(frames.get('up')!.map((f) => f.frameNumber)).toEqual([1, 3]);

    const all = extractAnimationFrames(sheet, 'wheelchair', {
      adapter,
      skipEmpty: false,
    });
    expect(all.get('up')!).toHaveLength(4);
  });
});
