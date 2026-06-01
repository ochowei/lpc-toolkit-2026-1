import type { CanvasAdapter, CanvasLike } from './adapters.js';
import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
  STANDARD_ANIMATION_FRAMES_PER_ROW,
  type Direction,
} from './constants.js';
import type { AnimationName, ComposedSheet, CustomAnimationRegion } from './types.js';

/**
 * Options configuring the sprite frame extraction process.
 */
export interface ExtractFramesOptions {
  /** Canvas adapter utilized to create Canvas elements for each cropped frame. */
  readonly adapter: CanvasAdapter;
  /**
   * If true, frames containing only fully transparent pixels will be skipped/omitted
   * from the returned map. Defaults to true.
   */
  readonly skipEmpty?: boolean;
}

/**
 * Represents a single cropped sprite frame slice.
 */
export interface FrameSlice {
  /** The Canvas containing the cropped 64x64 (or custom size) frame image. */
  readonly canvas: CanvasLike;
  /** 1-based index of this frame inside the specific animation. */
  readonly frameNumber: number;
  /** The movement/facing direction this frame belongs to. */
  readonly direction: Direction;
}

/**
 * Scan one frame's column-slice of pre-fetched row `ImageData` for any non-
 * transparent pixel. `rowStride` is the ImageData's actual row width (i.e.
 * `rowData.width`), which equals the second `getImageData` argument the
 * caller used — usually `sheet.width`, but Task 3's custom-animation path
 * may pass a narrower stride.
 * 
 * Flat ImageData array contains 4 bytes (RGBA) per pixel.
 * We scan every pixel within the bounding box of the frame `(startX, 0)` to `(startX + frameWidth, frameHeight)`
 * looking for any alpha channel byte greater than 0.
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
      // Offset calculation: (y * stride + x) * 4 bytes/pixel + 3 (Alpha channel)
      if (data[(y * rowStride + x) * 4 + 3]! > 0) return true;
    }
  }
  return false;
}

/**
 * Extracts all frame slices for a specific animation from a composed sheet, grouped by direction.
 * Automatically switches between standard spritesheet extraction and custom region extraction.
 *
 * @param sheet The ComposedSheet master canvas to extract frames from.
 * @param name The logical name of the animation (e.g., "walk", "spellcast", "wheelchair").
 * @param options Configuration options including the canvas adapter.
 * @returns A map matching each movement Direction to its chronological list of FrameSlice objects.
 */
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

/**
 * Handles standard spritesheet frame extraction.
 *
 * Standard spritesheets have:
 * - Row Indexing: Standard spritesheets allocate standard rows of 13 columns (832px width).
 * - Direction Coordinates: A standard block represents up to 4 direction rows corresponding to
 *   `north` (index 0), `west` (index 1), `south` (index 2), `east` (index 3).
 *   The vertical pixel offset `sourceY` on the master canvas is calculated as:
 *   `(row_index + direction_index) * FRAME_SIZE` (64px).
 * - Frame Interval Slices: We walk column columns `0` to `12` (STANDARD_ANIMATION_FRAMES_PER_ROW)
 *   where `sourceX = frame_index * FRAME_SIZE` represents each successive frame.
 *   Each slice is cropped out and returned.
 */
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

  // Iterate over each direction row in the animation block
  for (let dirIndex = 0; dirIndex < num; dirIndex++) {
    const direction = DIRECTIONS[dirIndex]!;
    // Calculate vertical row indexing coordinate
    const sourceY = row * frameSize + dirIndex * frameSize;
    // Extract the full direction row in one step for faster pixel analysis
    const rowData = sourceCtx.getImageData(
      0,
      sourceY,
      sheet.width,
      frameSize,
    );

    const slices: FrameSlice[] = [];
    // Extract frame interval slices horizontally
    for (let frameIndex = 0; frameIndex < framesPerRow; frameIndex++) {
      const sourceX = frameIndex * frameSize;
      // Optimize by skipping empty (transparent) frames if requested
      if (
        skipEmpty &&
        !rowHasContent(rowData.data, rowData.width, sourceX, frameSize, frameSize)
      ) {
        continue;
      }
      // Slice the sub-image frame and add to our list
      slices.push(
        sliceFrame(sheet, adapter, sourceX, sourceY, frameSize, frameIndex + 1, direction),
      );
    }
    out.set(direction, slices);
  }
  return out;
}

/**
 * Handles custom layout spritesheet frame extraction (e.g., wheelchair, oversized swings).
 *
 * Custom animations live in dynamic blocks below the standard sheet (Y >= 3456).
 * - Row Indexing: The start Y coordinate is defined by `region.offsetY`.
 * - Direction Coordinates: Map rows to movement directions. Standard directions cap at 4.
 * - Frame Interval Slices: Walk through `0` to `region.cols` frame columns.
 *   Since custom regions are often narrower than standard sheet.width (cols * frameSize <= 832),
 *   we only extract the active `regionWidth = cols * frameSize` bytes to prevent scanning out-of-bounds transparent pixels.
 */
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
    // Calculate vertical indexing coordinate within the custom region
    const sourceY = offsetY + dirIndex * frameSize;
    
    // Restrict read stride to region width to prevent CPU overhead on out-of-bounds padding
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

/**
 * Crops a square frame slice out of the ComposedSheet canvas and draws it onto a new Canvas.
 */
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
