import type { CanvasAdapter, CanvasLike } from './adapters.js';
import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
  STANDARD_ANIMATION_FRAMES_PER_ROW,
  type Direction,
} from './constants.js';
import type { AnimationName, ComposedSheet, CustomAnimationRegion } from './types.js';

export interface ExtractFramesOptions {
  readonly adapter: CanvasAdapter;
  readonly skipEmpty?: boolean;
}

export interface FrameSlice {
  readonly canvas: CanvasLike;
  readonly frameNumber: number;
  readonly direction: Direction;
}

/**
 * Scan one frame's column-slice of pre-fetched row `ImageData` for any non-
 * transparent pixel. `rowStride` is the ImageData's actual row width (i.e.
 * `rowData.width`), which equals the second `getImageData` argument the
 * caller used — usually `sheet.width`, but Task 3's custom-animation path
 * may pass a narrower stride.
 */
function rowHasContent(
  data: Uint8ClampedArray,
  rowStride: number,
  startX: number,
  frameWidth: number,
  frameHeight: number,
): boolean {
  for (let y = 0; y < frameHeight; y++) {
    for (let x = startX; x < startX + frameWidth && x < rowStride; x++) {
      if (data[(y * rowStride + x) * 4 + 3]! > 0) return true;
    }
  }
  return false;
}

export function extractAnimationFrames(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractFramesOptions,
): ReadonlyMap<Direction, readonly FrameSlice[]> {
  const skipEmpty = options.skipEmpty ?? true;
  const config = ANIMATION_CONFIGS[name];
  if (config) {
    return extractStandard(sheet, config.row, config.num, options.adapter, skipEmpty);
  }
  const region = sheet.customAnimations?.get(name);
  if (region) {
    return extractCustom(sheet, region, options.adapter, skipEmpty);
  }
  throw new Error(`extractAnimationFrames: unknown animation "${name}"`);
}

function extractStandard(
  sheet: ComposedSheet,
  row: number,
  num: 1 | 4,
  adapter: CanvasAdapter,
  skipEmpty: boolean,
): ReadonlyMap<Direction, readonly FrameSlice[]> {
  const frameSize = FRAME_SIZE;
  const framesPerRow = STANDARD_ANIMATION_FRAMES_PER_ROW;
  const sourceCtx = sheet.canvas.getContext('2d');
  const out = new Map<Direction, FrameSlice[]>();

  for (let dirIndex = 0; dirIndex < num; dirIndex++) {
    const direction = DIRECTIONS[dirIndex]!;
    const sourceY = row * frameSize + dirIndex * frameSize;
    const rowData = sourceCtx.getImageData(
      0,
      sourceY,
      sheet.width,
      frameSize,
    );

    const slices: FrameSlice[] = [];
    for (let frameIndex = 0; frameIndex < framesPerRow; frameIndex++) {
      const sourceX = frameIndex * frameSize;
      if (
        skipEmpty &&
        !rowHasContent(rowData.data, rowData.width, sourceX, frameSize, frameSize)
      ) {
        continue;
      }
      slices.push(
        sliceFrame(sheet, adapter, sourceX, sourceY, frameSize, frameIndex + 1, direction),
      );
    }
    out.set(direction, slices);
  }
  return out;
}

function extractCustom(
  sheet: ComposedSheet,
  region: CustomAnimationRegion,
  adapter: CanvasAdapter,
  skipEmpty: boolean,
): ReadonlyMap<Direction, readonly FrameSlice[]> {
  const { offsetY, frameSize, rows, cols } = region;
  const sourceCtx = sheet.canvas.getContext('2d');
  const out = new Map<Direction, FrameSlice[]>();
  const directionsToEmit = Math.min(rows, DIRECTIONS.length);

  for (let dirIndex = 0; dirIndex < directionsToEmit; dirIndex++) {
    const direction = DIRECTIONS[dirIndex]!;
    const sourceY = offsetY + dirIndex * frameSize;
    // Custom regions are usually narrower than sheet.width (cols * frameSize
    // ≤ sheet.width). Restrict the ImageData read to the block's actual width
    // to match the sibling `animation.ts` cropping pattern and avoid scanning
    // transparent pixels beyond the region.
    const regionWidth = cols * frameSize;
    const rowData = sourceCtx.getImageData(
      0,
      sourceY,
      regionWidth,
      frameSize,
    );

    const slices: FrameSlice[] = [];
    for (let frameIndex = 0; frameIndex < cols; frameIndex++) {
      const sourceX = frameIndex * frameSize;
      if (
        skipEmpty &&
        !rowHasContent(rowData.data, rowData.width, sourceX, frameSize, frameSize)
      ) {
        continue;
      }
      slices.push(
        sliceFrame(sheet, adapter, sourceX, sourceY, frameSize, frameIndex + 1, direction),
      );
    }
    out.set(direction, slices);
  }
  return out;
}

function sliceFrame(
  sheet: ComposedSheet,
  adapter: CanvasAdapter,
  sourceX: number,
  sourceY: number,
  frameSize: number,
  frameNumber: number,
  direction: Direction,
): FrameSlice {
  const frameCanvas = adapter.createCanvas(frameSize, frameSize);
  const frameCtx = frameCanvas.getContext('2d');
  frameCtx.drawImage(
    sheet.canvas,
    sourceX,
    sourceY,
    frameSize,
    frameSize,
    0,
    0,
    frameSize,
    frameSize,
  );
  return { canvas: frameCanvas, frameNumber, direction };
}
