import type { CanvasLike, Context2DLike, ImageLike } from './adapters.js';
import { FRAME_SIZE } from './constants.js';
import {
  animationRowsLayout,
  type CustomAnimationDefinition,
} from './custom-animations.js';

type SpriteSource = ImageLike | CanvasLike;

/**
 * Draws a single frame from a source sprite onto a destination canvas context at a specific position.
 * Supports source and destination frame size mismatch by centering the source frame.
 * 
 * Centering Math:
 * - If the source frame size (e.g., 64x64) is smaller than the destination frame size (e.g., 128x128),
 *   we calculate a centering offset: `offset = (destFrameSize - srcFrameSize) / 2` (e.g., `(128 - 64) / 2 = 32px`).
 * - The frame is drawn at `(destPos.x + offset, destPos.y + offset)` with the source width/height,
 *   keeping the character centered in the larger slot.
 *
 * @param destCtx The destination Canvas 2D context to draw onto.
 * @param destPos The destination coordinates `(x, y)`.
 * @param destFrameSize The width/height of the target slot.
 * @param src The source sprite canvas or image element.
 * @param srcPos The source frame coordinates `(x, y)` inside the source sprite.
 * @param srcFrameSize The width/height of the source frame.
 */
export function drawFrameToFrame(
  destCtx: Context2DLike,
  destPos: { x: number; y: number },
  destFrameSize: number,
  src: SpriteSource,
  srcPos: { x: number; y: number },
  srcFrameSize: number,
): void {
  if (srcFrameSize === destFrameSize) {
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x,
      destPos.y,
      destFrameSize,
      destFrameSize,
    );
  } else {
    // Coordinate centering offset calculation
    const offset = (destFrameSize - srcFrameSize) / 2;
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x + offset,
      destPos.y + offset,
      srcFrameSize,
      srcFrameSize,
    );
  }
}

/**
 * Maps and draws standard base animation frames (e.g., standard "sit" frames) onto a custom
 * animation region (e.g., the wheelchair layout) below the standard sheet.
 *
 * Coordinate Slicing and Mapping Math:
 * 1. Iterates through each custom row `i` and column `j` in the custom animation definition's grid.
 * 2. Parses the frame spec string at grid `(i, j)`, e.g., `"sit-n,2"`:
 *    - `srcRowName` = `"sit-n"`
 *    - `srcColumn` = `2` (parsed from string `"2"`)
 * 3. Identifies the source row `srcRow` coordinates:
 *    - If `isSingleAnimation` is true (the source sheet is a small single-action PNG, height <= 256px, e.g., `sit.png` which has 4 rows corresponding to N, W, S, E):
 *      We extract the direction suffix (e.g., `"n"` from `"sit-n"`) and map it using `directionMap = { n: 0, w: 1, s: 2, e: 3 }` to get `srcRow`.
 *    - If `isSingleAnimation` is false (full standard master sheet):
 *      We look up the absolute standard row index using `animationRowsLayout[srcRowName]`.
 * 4. Calculates the source pixel coordinates:
 *    - `srcX = FRAME_SIZE * srcColumn`
 *    - `srcY = FRAME_SIZE * srcRow`
 * 5. Calculates the destination pixel coordinates:
 *    - `destX = frameSize * j`
 *    - `destY = frameSize * i + offsetY` (where `offsetY` is the block's vertical offset in the composed master sheet)
 * 6. Invokes `drawFrameToFrame` to crop from `(srcX, srcY)` and render centered onto `(destX, destY)`.
 *
 * @param customAnimationContext The destination canvas 2D context.
 * @param customAnimationDefinition The custom animation definition including dimensions and frame grid.
 * @param offsetY The vertical offset of this custom block inside the master canvas.
 * @param src The source sprite containing base animation frames.
 */
export function drawFramesToCustomAnimation(
  customAnimationContext: Context2DLike,
  customAnimationDefinition: CustomAnimationDefinition,
  offsetY: number,
  src: SpriteSource,
): void {
  const frameSize = customAnimationDefinition.frameSize;

  // Single-animation sprites (e.g. sit.png) are ≤256px tall; the full
  // universal sheet is taller. In our DI pipeline the source is always a
  // per-animation PNG (≤256), so the direction-map branch is taken (Q5).
  const isSingleAnimation = src.height <= 256;

  for (let i = 0; i < customAnimationDefinition.frames.length; ++i) {
    const frames = customAnimationDefinition.frames[i];
    if (!frames) continue;
    for (let j = 0; j < frames.length; ++j) {
      const frameSpec = frames[j]; // e.g. "sit-n,2"
      if (frameSpec === undefined) continue;
      const [srcRowName, srcColumnStr] = frameSpec.split(',');
      if (srcRowName === undefined) continue;
      const srcColumn = parseInt(srcColumnStr ?? '0');

      let srcRow: number;
      if (isSingleAnimation) {
        // Rows 0-3 = n, w, s, e. Extract direction from e.g. "sit-n".
        const direction = srcRowName.split('-')[1];
        const directionMap: Record<string, number> = { n: 0, w: 1, s: 2, e: 3 };
        srcRow = (direction === undefined ? undefined : directionMap[direction]) ?? 0;
      } else {
        srcRow = animationRowsLayout[srcRowName] ?? i;
      }

      // Compute coordinate slicing math
      const srcX = FRAME_SIZE * srcColumn;
      const srcY = FRAME_SIZE * srcRow;
      const destX = frameSize * j;
      const destY = frameSize * i + offsetY;

      drawFrameToFrame(
        customAnimationContext,
        { x: destX, y: destY },
        frameSize,
        src,
        { x: srcX, y: srcY },
        FRAME_SIZE,
      );
    }
  }
}
