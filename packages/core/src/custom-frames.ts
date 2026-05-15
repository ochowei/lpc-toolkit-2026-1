import type { CanvasLike, Context2DLike, ImageLike } from './adapters.js';
import { FRAME_SIZE } from './constants.js';
import {
  animationRowsLayout,
  type CustomAnimationDefinition,
} from './custom-animations.js';

/**
 * Core-internal port of `upstream/sources/canvas/draw-frames.ts`
 * (`drawFrameToFrame` + `drawFramesToCustomAnimation`) — API.md Step 3.4
 * N2. Env-agnostic: only `Context2DLike` / `ImageLike | CanvasLike`, never
 * a concrete canvas lib (CLAUDE.md hard rule 4). Not re-exported from
 * `index.ts`; this is a `composeSelections` implementation detail.
 *
 * Faithful (not byte-verbatim): upstream's unchecked array indexing does
 * not type-check under `noUncheckedIndexedAccess`, so the loops carry
 * strict-safe guards with identical observable behaviour on real custom
 * definitions.
 */

type SpriteSource = ImageLike | CanvasLike;

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
    // e.g. 64×64 source centered in 128×128 dest = offset by 32px.
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
