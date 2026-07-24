import { expect, test } from '@playwright/test';

interface BrowserConformanceProbe {
  readonly status: 'verified';
  readonly archiveDigest: string;
  readonly contentDigest: string;
  readonly sourceDigest: string;
  readonly diagnostics: readonly unknown[];
}

test('runs asset-pack archive conformance in Chromium without capability skip', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });
  await page.goto('/compose?assetSource=zip&e2eProbe=1&assetPackConformance=1');
  try {
    await expect.poll(async () => page.evaluate(() => {
      const value = (window as Window & { __LPC_ASSET_PACK_CONFORMANCE__?: BrowserConformanceProbe })
        .__LPC_ASSET_PACK_CONFORMANCE__;
      return value ?? null;
    }), { timeout: 30_000 }).not.toBeNull();
  } catch (error) {
    const browserState = await page.evaluate(() => ({
      href: window.location.href,
      e2eProbe: new URLSearchParams(window.location.search).get('e2eProbe'),
      conformance: new URLSearchParams(window.location.search).get('assetPackConformance'),
    }));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nPage errors: ${pageErrors.join(' | ')}\nBrowser state: ${JSON.stringify(browserState)}`);
  }

  const result = await page.evaluate(() =>
    (window as Window & { __LPC_ASSET_PACK_CONFORMANCE__?: BrowserConformanceProbe })
      .__LPC_ASSET_PACK_CONFORMANCE__,
  );
  expect(result).toEqual({
    status: 'verified',
    archiveDigest: 'sha256:fa9795d2924c7e88a1553caaf583d25f246f1398070af20ebdc7f5e83818dee0',
    contentDigest: 'sha256:e8bf8cafde81d21dd9b77456a4a41512b8fd133e328ef2f5ce40c42c2e20a317',
    sourceDigest: 'sha256:657887e347c8392b6023fddf211f80adf632d6e209aceb1931727b4b799f513e',
    diagnostics: [],
  });
});
