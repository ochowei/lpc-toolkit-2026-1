import { test, expect } from '@playwright/test';
import { OBSERVED_REGRESSION_CASE } from './helpers/seeded-rng';
import {
  formatErrors,
  openToolkitCase,
  type ToolkitProbeSnapshot,
} from './helpers/parity-pages';

test.describe('ZIP asset source', () => {
  test('renders a complex outfit without significant errors', async ({
    context,
  }) => {
    const result = await openToolkitCase(
      context,
      OBSERVED_REGRESSION_CASE.hash,
    );

    try {
      const errors = significantErrors(result.errors);
      expect(
        errors.length,
        `captured errors:\n${formatErrorPreview(errors)}`,
      ).toBe(0);
      expect(result.snapshot.status).toBe('ready');
      expect(result.snapshot.layers.length).toBeGreaterThan(0);
      const content = summarizeRgbaContent(result.snapshot.rgba);
      expect(
        content.byteLength,
        diagnostic(result.snapshot, content),
      ).toBe(content.expectedByteLength);
      expect(
        content.visiblePixelCount,
        diagnostic(result.snapshot, content),
      ).toBeGreaterThan(0);
    } finally {
      await result.page.close();
    }
  });
});

function formatErrorPreview(
  errors: Parameters<typeof formatErrors>[0],
): string {
  const previewLimit = 20;
  const preview = formatErrors(errors.slice(0, previewLimit));
  if (errors.length <= previewLimit) return preview;
  return `${preview}\n... ${errors.length - previewLimit} more error(s)`;
}

function significantErrors(
  errors: Parameters<typeof formatErrors>[0],
): Parameters<typeof formatErrors>[0] {
  return errors.filter(
    (error) =>
      !(
        error.kind === 'console.warn' &&
        /^\[catalog\] \d+ load warning\(s\)(?: \[Object(?:, Object)*\])?$/.test(
          error.text,
        )
      ),
  );
}

interface RgbaContentSummary {
  readonly byteLength: number;
  readonly expectedByteLength: number;
  readonly visiblePixelCount: number;
  readonly maxAlpha: number;
}

function summarizeRgbaContent(
  rgba: ToolkitProbeSnapshot['rgba'],
): RgbaContentSummary {
  const bytes = Buffer.from(rgba.dataBase64, 'base64');
  let visiblePixelCount = 0;
  let maxAlpha = 0;

  for (let alphaIndex = 3; alphaIndex < bytes.length; alphaIndex += 4) {
    const alpha = bytes[alphaIndex] ?? 0;
    if (alpha > 0) {
      visiblePixelCount += 1;
      maxAlpha = Math.max(maxAlpha, alpha);
    }
  }

  return {
    byteLength: bytes.length,
    expectedByteLength: rgba.width * rgba.height * 4,
    visiblePixelCount,
    maxAlpha,
  };
}

function diagnostic(
  snapshot: ToolkitProbeSnapshot,
  content: RgbaContentSummary,
): string {
  return [
    `case=${OBSERVED_REGRESSION_CASE.name}`,
    `hash=${OBSERVED_REGRESSION_CASE.hash}`,
    `status=${snapshot.status}`,
    `dimensions=${snapshot.rgba.width}x${snapshot.rgba.height}`,
    `rgbaBytes=${content.byteLength}/${content.expectedByteLength}`,
    `visiblePixels=${content.visiblePixelCount}`,
    `maxAlpha=${content.maxAlpha}`,
    `layers=${JSON.stringify(snapshot.layers)}`,
  ].join('\n');
}
