export const MIN_THUMBNAIL_SIZE = 20;
export const THUMBNAIL_MARGIN = 2;
export const MIN_AUTO_FRAME_SCALE = 1.5;
export const MAX_AUTO_FRAME_SCALE = 4;

export interface AlphaBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ThumbnailDrawRect {
  readonly dx: number;
  readonly dy: number;
  readonly dWidth: number;
  readonly dHeight: number;
}

export function findAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): AlphaBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < 0
    ? null
    : {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
}

export function computeThumbnailDrawRect(
  bounds: AlphaBounds,
  frameSize: number,
  outputSize: number,
  scale: number,
): ThumbnailDrawRect {
  const destinationFrameSize = outputSize * scale;
  const sourceToDestination = destinationFrameSize / frameSize;
  const boundsCenterX = (bounds.x + bounds.width / 2) * sourceToDestination;
  const boundsCenterY = (bounds.y + bounds.height / 2) * sourceToDestination;

  return {
    dx: outputSize / 2 - boundsCenterX,
    dy: outputSize / 2 - boundsCenterY,
    dWidth: destinationFrameSize,
    dHeight: destinationFrameSize,
  };
}
