export interface PixelMismatchSample {
  readonly x: number;
  readonly y: number;
  readonly actual: readonly [number, number, number, number];
  readonly expected: readonly [number, number, number, number];
}

export interface PixelDiffResult {
  readonly mismatchCount: number;
  readonly samples: readonly PixelMismatchSample[];
}

const SAMPLE_LIMIT = 10;

export function diffRgba(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  width: number,
  height: number,
): PixelDiffResult {
  if (actual.length !== expected.length) {
    throw new Error(
      `RGBA buffer length mismatch: actual=${actual.length} expected=${expected.length}`,
    );
  }

  const expectedLength = width * height * 4;
  if (actual.length !== expectedLength) {
    throw new Error(
      `RGBA buffer dimensions do not match length: width=${width} height=${height} length=${actual.length}`,
    );
  }

  let mismatchCount = 0;
  const samples: PixelMismatchSample[] = [];

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const actualPixel = [
      actual[offset]!,
      actual[offset + 1]!,
      actual[offset + 2]!,
      actual[offset + 3]!,
    ] as const;
    const expectedPixel = [
      expected[offset]!,
      expected[offset + 1]!,
      expected[offset + 2]!,
      expected[offset + 3]!,
    ] as const;

    if (
      actualPixel[0] !== expectedPixel[0] ||
      actualPixel[1] !== expectedPixel[1] ||
      actualPixel[2] !== expectedPixel[2] ||
      actualPixel[3] !== expectedPixel[3]
    ) {
      mismatchCount += 1;

      if (samples.length < SAMPLE_LIMIT) {
        samples.push({
          x: pixelIndex % width,
          y: Math.floor(pixelIndex / width),
          actual: actualPixel,
          expected: expectedPixel,
        });
      }
    }
  }

  return { mismatchCount, samples };
}
