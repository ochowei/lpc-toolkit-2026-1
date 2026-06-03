import { test, expect } from '@playwright/test';
import { diffRgba } from './helpers/pixel-diff';
import { OBSERVED_REGRESSION_CASE } from './helpers/seeded-rng';
import {
  formatErrors,
  openToolkitCase,
  type ToolkitProbeSnapshot,
} from './helpers/parity-pages';

test.describe('ZIP asset source', () => {
  test('renders the same layers as local assets for a complex outfit', async ({
    context,
  }) => {
    const local = await openToolkitCase(
      context,
      OBSERVED_REGRESSION_CASE.hash,
      'local',
    );
    const zip = await openToolkitCase(
      context,
      OBSERVED_REGRESSION_CASE.hash,
      'zip',
    );

    try {
      expect(
        significantErrors(local.errors).length,
        `local captured errors:\n${formatErrorPreview(significantErrors(local.errors))}`,
      ).toBe(0);
      expect(
        significantErrors(zip.errors).length,
        `zip captured errors:\n${formatErrorPreview(significantErrors(zip.errors))}`,
      ).toBe(0);
      expect(zip.snapshot.layers).toEqual(local.snapshot.layers);
      expect(
        `${zip.snapshot.rgba.width}x${zip.snapshot.rgba.height}`,
        diagnostic(local.snapshot, zip.snapshot, []),
      ).toBe(`${local.snapshot.rgba.width}x${local.snapshot.rgba.height}`);

      const diff = diffRgba(
        decodeRgba(local.snapshot.rgba.dataBase64),
        decodeRgba(zip.snapshot.rgba.dataBase64),
        local.snapshot.rgba.width,
        local.snapshot.rgba.height,
      );

      expect(
        diff.mismatchCount,
        diagnostic(local.snapshot, zip.snapshot, diff.samples),
      ).toBe(0);
    } finally {
      await local.page.close();
      await zip.page.close();
    }
  });
});

function decodeRgba(dataBase64: string): Uint8Array {
  return Buffer.from(dataBase64, 'base64');
}

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

function diagnostic(
  local: ToolkitProbeSnapshot,
  zip: ToolkitProbeSnapshot,
  pixelSamples: ReturnType<typeof diffRgba>['samples'],
): string {
  return [
    `case=${OBSERVED_REGRESSION_CASE.name}`,
    `hash=${OBSERVED_REGRESSION_CASE.hash}`,
    `localStatus=${local.status}`,
    `zipStatus=${zip.status}`,
    `localLayers=${JSON.stringify(local.layers)}`,
    `zipLayers=${JSON.stringify(zip.layers)}`,
    `pixelSamples=${JSON.stringify(pixelSamples)}`,
  ].join('\n');
}
