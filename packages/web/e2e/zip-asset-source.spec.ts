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
      expect(
        `${result.snapshot.rgba.width}x${result.snapshot.rgba.height}`,
        diagnostic(result.snapshot),
      ).not.toBe('0x0');
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

function diagnostic(snapshot: ToolkitProbeSnapshot): string {
  return [
    `case=${OBSERVED_REGRESSION_CASE.name}`,
    `hash=${OBSERVED_REGRESSION_CASE.hash}`,
    `status=${snapshot.status}`,
    `layers=${JSON.stringify(snapshot.layers)}`,
  ].join('\n');
}
