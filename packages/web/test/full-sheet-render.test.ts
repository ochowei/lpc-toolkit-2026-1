import { createCanvas } from '@napi-rs/canvas';
import { vi, beforeAll, afterAll, describe, expect, it } from 'vitest';
import {
  drawTransparencyBackground,
  applyTransparencyMaskToCanvas,
  renderFullSheet,
} from '../src/lib/full-sheet-render';

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  // napi-rs/canvas is structurally compatible with HTMLCanvasElement for
  // the subset we use (getContext('2d'), width, height).
  return createCanvas(width, height) as unknown as HTMLCanvasElement;
}

function pixelAt(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): [number, number, number, number] {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const { data } = ctx.getImageData(x, y, 1, 1);
  return [data[0]!, data[1]!, data[2]!, data[3]!];
}

beforeAll(() => {
  // renderFullSheet uses `document.createElement('canvas')` for the
  // tmpCanvas when mask=true. Stub it with @napi-rs/canvas so the Node
  // test environment can exercise that path.
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement: ${tag}`);
      // 1×1 is a placeholder — renderFullSheet immediately overwrites
      // .width / .height on the returned canvas (napi-rs supports resize
      // by property assignment).
      return createCanvas(1, 1) as unknown as HTMLCanvasElement;
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('drawTransparencyBackground', () => {
  it('fills an 8×8 checkerboard with #CCCCCC light and #999999 dark', () => {
    const canvas = makeCanvas(16, 16);
    const ctx = canvas.getContext('2d')!;
    drawTransparencyBackground(ctx, 16, 16);

    // (0,0) is "even row, even col" → light
    expect(pixelAt(canvas, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
    // (8,0) is "even row, odd col" → dark
    expect(pixelAt(canvas, 8, 0)).toEqual([0x99, 0x99, 0x99, 0xff]);
    // (0,8) is "odd row, even col" → dark
    expect(pixelAt(canvas, 0, 8)).toEqual([0x99, 0x99, 0x99, 0xff]);
    // (8,8) is "odd row, odd col" → light
    expect(pixelAt(canvas, 8, 8)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
  });

  it('honours a custom square size', () => {
    const canvas = makeCanvas(8, 8);
    const ctx = canvas.getContext('2d')!;
    drawTransparencyBackground(ctx, 8, 8, 4);

    expect(pixelAt(canvas, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
    expect(pixelAt(canvas, 4, 0)).toEqual([0x99, 0x99, 0x99, 0xff]);
  });
});

describe('applyTransparencyMaskToCanvas', () => {
  it('clears RGB(255,44,230) pixels with alpha > 0 to alpha 0', () => {
    const canvas = makeCanvas(2, 1);
    const ctx = canvas.getContext('2d')!;
    // Pixel (0,0): magic pink, opaque  → should become alpha 0
    // Pixel (1,0): plain red, opaque   → unchanged
    const img = ctx.getImageData(0, 0, 2, 1);
    img.data[0] = 255; img.data[1] = 44;  img.data[2] = 230; img.data[3] = 255;
    img.data[4] = 255; img.data[5] = 0;   img.data[6] = 0;   img.data[7] = 255;
    ctx.putImageData(img, 0, 0);

    applyTransparencyMaskToCanvas(ctx, 2, 1);

    // napi-rs normalises RGB to 0 on fully-transparent pixels (premultiplied
    // alpha); real browsers preserve the RGB bytes. The load-bearing
    // invariant — that alpha goes to 0 — holds in both environments.
    expect(pixelAt(canvas, 0, 0)[3]).toBe(0);
    expect(pixelAt(canvas, 1, 0)).toEqual([255, 0, 0, 255]);
  });

  it('does not touch fully transparent magic-pink pixels', () => {
    const canvas = makeCanvas(1, 1);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.getImageData(0, 0, 1, 1);
    img.data[0] = 255; img.data[1] = 44; img.data[2] = 230; img.data[3] = 0;
    ctx.putImageData(img, 0, 0);

    applyTransparencyMaskToCanvas(ctx, 1, 1);

    // Reading a fully-transparent pixel: RGB may be normalized to 0 by some
    // canvas implementations; alpha is the load-bearing assertion here.
    expect(pixelAt(canvas, 0, 0)[3]).toBe(0);
  });
});

describe('renderFullSheet', () => {
  it('copies source to display canvas at full size when grid+mask off', () => {
    const source = makeCanvas(4, 2);
    const sCtx = source.getContext('2d')!;
    const sImg = sCtx.getImageData(0, 0, 4, 2);
    // Fill source with solid blue (0,0,255,255) everywhere
    for (let i = 0; i < sImg.data.length; i += 4) {
      sImg.data[i] = 0; sImg.data[i + 1] = 0; sImg.data[i + 2] = 255; sImg.data[i + 3] = 255;
    }
    sCtx.putImageData(sImg, 0, 0);

    const display = makeCanvas(1, 1); // wrong size — renderFullSheet must resize
    renderFullSheet(display, source, { grid: false, mask: false });

    expect(display.width).toBe(4);
    expect(display.height).toBe(2);
    expect(pixelAt(display, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(display, 3, 1)).toEqual([0, 0, 255, 255]);
  });

  it('draws checkerboard behind the sprite when grid=true', () => {
    const source = makeCanvas(16, 16);
    // leave source fully transparent
    const display = makeCanvas(16, 16);
    renderFullSheet(display, source, { grid: true, mask: false });

    // Top-left tile should be light gray (since source is transparent)
    expect(pixelAt(display, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
    // Adjacent tile (x=8) should be dark gray
    expect(pixelAt(display, 8, 0)).toEqual([0x99, 0x99, 0x99, 0xff]);
  });

  it('applies mask without mutating source canvas when mask=true', () => {
    const source = makeCanvas(1, 1);
    const sCtx = source.getContext('2d')!;
    const sImg = sCtx.getImageData(0, 0, 1, 1);
    sImg.data[0] = 255; sImg.data[1] = 44; sImg.data[2] = 230; sImg.data[3] = 255;
    sCtx.putImageData(sImg, 0, 0);

    const display = makeCanvas(1, 1);
    renderFullSheet(display, source, { grid: false, mask: true });

    // Display: magic pink should be alpha 0
    expect(pixelAt(display, 0, 0)[3]).toBe(0);
    // Source MUST still be the original opaque magic-pink pixel
    expect(pixelAt(source as unknown as HTMLCanvasElement, 0, 0)).toEqual([
      255, 44, 230, 255,
    ]);
  });

  it('layers grid behind masked sprite when both flags are on', () => {
    const source = makeCanvas(16, 16);
    const sCtx = source.getContext('2d')!;
    // Top-left pixel: magic pink opaque → after mask becomes transparent →
    // grid should show through. Use a 16×16 to fall fully within one 8px tile.
    const sImg = sCtx.getImageData(0, 0, 1, 1);
    sImg.data[0] = 255; sImg.data[1] = 44; sImg.data[2] = 230; sImg.data[3] = 255;
    sCtx.putImageData(sImg, 0, 0);

    const display = makeCanvas(16, 16);
    renderFullSheet(display, source, { grid: true, mask: true });

    // At (0,0): grid light gray shows through the cleared mask pixel
    expect(pixelAt(display, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
  });
});
