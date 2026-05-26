/**
 * Render a `ComposedSheet.canvas` onto a display canvas with optional
 * transparency-grid background and pink-mask replacement. Algorithm and
 * constants byte-identical to upstream `canvas-utils.ts` /
 * `mask.ts` / `preview-canvas.ts`. Never mutates the source canvas.
 */

const GRID_LIGHT = '#CCCCCC';
const GRID_DARK = '#999999';
const GRID_TILE_DEFAULT = 8;

const MASK_R = 255;
const MASK_G = 44;
const MASK_B = 230;

/**
 * Draw an 8×8 checkerboard (or custom tile) over the entire context, in
 * #CCCCCC / #999999 — matches upstream `drawTransparencyBackground`.
 */
export function drawTransparencyBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  squareSize: number = GRID_TILE_DEFAULT,
): void {
  for (let y = 0; y < height; y += squareSize) {
    for (let x = 0; x < width; x += squareSize) {
      const isEvenRow = Math.floor(y / squareSize) % 2 === 0;
      const isEvenCol = Math.floor(x / squareSize) % 2 === 0;
      const isLight = isEvenRow === isEvenCol;
      ctx.fillStyle = isLight ? GRID_LIGHT : GRID_DARK;
      ctx.fillRect(x, y, squareSize, squareSize);
    }
  }
}

/**
 * Replace every opaque RGB(255,44,230) "magic pink" pixel with full
 * transparency. Mutates `ctx`'s pixel buffer in place (callers must own
 * the canvas or operate on a copy). Algorithm byte-identical to
 * upstream `applyTransparencyMaskToCanvas`.
 */
export function applyTransparencyMaskToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const pix = imgData.data;
  const n = pix.length;
  for (let i = 0; i < n; i += 4) {
    const a = pix[i + 3]!;
    if (a > 0) {
      if (pix[i] === MASK_R && pix[i + 1] === MASK_G && pix[i + 2] === MASK_B) {
        pix[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export interface RenderFullSheetOptions {
  readonly grid: boolean;
  readonly mask: boolean;
}

/**
 * Resize `displayCanvas` to match `sourceCanvas`, then render in this
 * order: clear → (optional) grid → (optional) mask-on-tmpCanvas → drawImage.
 * Never mutates `sourceCanvas` (matches upstream `copyToPreviewCanvas`
 * which uses a tmpCanvas for the same reason — toggling mask multiple
 * times must remain idempotent).
 */
export function renderFullSheet(
  displayCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  options: RenderFullSheetOptions,
): void {
  const { width, height } = sourceCanvas;
  displayCanvas.width = width;
  displayCanvas.height = height;

  const ctx = displayCanvas.getContext('2d');
  if (!ctx) throw new Error('renderFullSheet: failed to acquire 2d context');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  if (options.grid) {
    drawTransparencyBackground(ctx, width, height);
  }

  if (options.mask) {
    // tmpCanvas keeps the mutation off `sourceCanvas`. document.createElement
    // is fine here because this function is browser-only (lives in web/lib).
    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) throw new Error('renderFullSheet: failed to acquire tmp 2d context');
    tmpCtx.imageSmoothingEnabled = false;
    tmpCtx.drawImage(sourceCanvas, 0, 0);
    applyTransparencyMaskToCanvas(tmpCtx, width, height);
    ctx.drawImage(tmp, 0, 0);
  } else {
    ctx.drawImage(sourceCanvas, 0, 0);
  }
}
