import {
  createCanvas,
  loadImage as napiLoadImage,
  type SKRSContext2D,
} from '@napi-rs/canvas';
import type { CanvasAdapter, CanvasLike, ImageLike } from '../../src/adapters.js';

/**
 * Node-side `CanvasAdapter` backed by `@napi-rs/canvas` (MIT, prebuilt
 * binaries). Lives under `test/` only — `packages/core/src/` must never
 * import a concrete canvas library (CLAUDE.md hard rule 4). Step 3.2's
 * compose tests will import this same helper.
 *
 * `@napi-rs/canvas`'s `Canvas` / `SKRSContext2D` are structurally a
 * superset of `CanvasLike` / `Context2DLike`, so the objects are returned
 * directly with no wrapping.
 */
export function createNodeCanvasAdapter(): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      return createCanvas(width, height);
    },
    loadImage(path: string): Promise<ImageLike> {
      // Step 3.2: real file-backed loading. `@napi-rs/canvas` accepts a
      // filesystem path (or URL / Buffer); compose passes
      // `joinUrl(spritesheetsBaseUrl, layerPath)`, so tests point
      // `spritesheetsBaseUrl` at the read-only `assets/` checkout.
      return napiLoadImage(path);
    },
  };
}

/**
 * Build a synthetic image fixture by painting onto a real
 * `@napi-rs/canvas` canvas. The returned canvas satisfies `ImageLike`
 * (and is accepted by `Context2DLike.drawImage` at runtime, where it is
 * a real `Canvas`).
 */
export function makeImage(
  width: number,
  height: number,
  paint: (ctx: SKRSContext2D) => void,
): ImageLike {
  const canvas = createCanvas(width, height);
  paint(canvas.getContext('2d'));
  return canvas;
}

/** Fully filled `width × height` image of a single solid hex color. */
export function solidImage(
  width: number,
  height: number,
  hex: string,
): ImageLike {
  return makeImage(width, height, (ctx) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, width, height);
  });
}

/**
 * Like `makeImage`, but typed as `CanvasLike` — for tests that need a
 * hand-painted `ComposedSheet.canvas` (e.g. `extractAnimation`), since
 * `Context2DLike` deliberately doesn't expose `fillRect`.
 */
export function makeCanvas(
  width: number,
  height: number,
  paint: (ctx: SKRSContext2D) => void,
): CanvasLike {
  const canvas = createCanvas(width, height);
  paint(canvas.getContext('2d'));
  return canvas;
}
