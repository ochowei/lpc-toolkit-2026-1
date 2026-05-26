import type { CanvasAdapter, CanvasLike } from './adapters.js';
import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
  STANDARD_ANIMATION_FRAMES_PER_ROW,
  type Direction,
} from './constants.js';
import type { AnimationName, ComposedSheet } from './types.js';

export interface ExtractFramesOptions {
  readonly adapter: CanvasAdapter;
  readonly skipEmpty?: boolean;
}

export interface FrameSlice {
  readonly canvas: CanvasLike;
  readonly frameNumber: number;
  readonly direction: Direction;
}

function rowHasContent(
  data: Uint8ClampedArray,
  imageWidth: number,
  startX: number,
  frameWidth: number,
  frameHeight: number,
): boolean {
  for (let y = 0; y < frameHeight; y++) {
    for (let x = startX; x < startX + frameWidth && x < imageWidth; x++) {
      if (data[(y * imageWidth + x) * 4 + 3]! > 0) return true;
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
  if (!config) {
    throw new Error(`extractAnimationFrames: unknown animation "${name}"`);
  }

  const { row, num } = config;
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
        !rowHasContent(rowData.data, sheet.width, sourceX, frameSize, frameSize)
      ) {
        continue;
      }
      const frameCanvas = options.adapter.createCanvas(frameSize, frameSize);
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
      slices.push({
        canvas: frameCanvas,
        frameNumber: frameIndex + 1,
        direction,
      });
    }
    out.set(direction, slices);
  }

  return out;
}
