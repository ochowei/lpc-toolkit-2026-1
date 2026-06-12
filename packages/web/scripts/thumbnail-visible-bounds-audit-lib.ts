export interface AlphaBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ThumbnailMetrics {
  readonly widthRatio: number;
  readonly heightRatio: number;
  readonly visibleWidthAt24: number;
  readonly visibleHeightAt24: number;
  readonly fitScalePxPerSourcePixel: number;
  readonly additionalScaleOverCurrent: number;
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

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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

export function deriveThumbnailMetrics(
  bounds: AlphaBounds,
  frameSize: number,
): ThumbnailMetrics {
  const currentScale = 24 / frameSize;
  const fitScalePxPerSourcePixel = Math.min(
    20 / bounds.width,
    20 / bounds.height,
  );
  return {
    widthRatio: bounds.width / frameSize,
    heightRatio: bounds.height / frameSize,
    visibleWidthAt24: bounds.width * currentScale,
    visibleHeightAt24: bounds.height * currentScale,
    fitScalePxPerSourcePixel,
    additionalScaleOverCurrent: fitScalePxPerSourcePixel / currentScale,
  };
}
