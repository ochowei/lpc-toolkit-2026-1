import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { assertExportableCredits } from '../src/lib/spritesheet-export';
import { downloadErrorTranslationKey } from '../src/components/layer-stack/popovers/download-popover';

test('maps the shared empty-credit guard to localized download copy', () => {
  let guardError: unknown;
  try {
    assertExportableCredits({ entries: [], resolvedPaths: [], licenses: [] });
  } catch (error) {
    guardError = error;
  }

  expect(downloadErrorTranslationKey(guardError)).toBe('download.noCredits');
  expect(downloadErrorTranslationKey(new Error('encoding failed')))
    .toBe('download.failed');
});

test('empty download credits block every action with a retryable localized error', async ({
  page,
}) => {
  const downloadedFiles: string[] = [];
  page.on('download', (download) => {
    downloadedFiles.push(download.suggestedFilename());
  });
  await page.goto(
    '/compose?assetSource=zip&e2eProbe=1&emptyDownloadCredits=1',
  );
  await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: /Download/ }).click();
  const panel = page.getByTestId('download-popover');
  await expect(panel).toBeVisible();

  const actionNames = [
    'Spritesheet + Credits (ZIP)',
    'Credits (TXT)',
    'Credits (CSV)',
    'ZIP · By Animation',
    'ZIP · By Item',
    'ZIP · Animation + Item',
    'ZIP · By Frame',
  ] as const;
  for (const name of actionNames) {
    const downloadOccurred = page
      .waitForEvent('download', { timeout: 250 })
      .then(() => true, () => false);
    await page.getByRole('button', { name, exact: true }).click();
    await expect(
      page.getByText('Cannot download without resolved credits.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(panel).toBeVisible();
    expect(await downloadOccurred).toBe(false);
  }
  expect(downloadedFiles).toEqual([]);
});

test('spritesheet download bundles pixels and attribution', async ({ page }) => {
  await page.goto('/compose?assetSource=zip');
  await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: /Download/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Spritesheet/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const savedPath = await download.path();
  expect(savedPath).not.toBeNull();
  const archive = await JSZip.loadAsync(await readFile(savedPath!));
  expect(Object.keys(archive.files).sort()).toEqual([
    'character-spritesheet.png',
    'credits/credits.csv',
    'credits/credits.txt',
  ]);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Attribution/ }).click();
  await expect(page.getByText('body/bodies/male/walk.png', { exact: true }))
    .toBeVisible();
});
