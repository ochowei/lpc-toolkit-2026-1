import { expect, test } from '@playwright/test';
import { clickPresetMenuAction } from './helpers/preset-menu';

test('saved canonical JSON restores the complete Web selection', async ({ page }) => {
  await page.goto('/compose?assetSource=zip');
  await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({
    timeout: 30_000,
  });
  const originalHash = await page.evaluate(() => window.location.hash);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Share \/ Import/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save character JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('character.selection.json');
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not expose the saved JSON path.');

  await page.keyboard.press('Escape');
  await clickPresetMenuAction(page, 'Farmer', 'Apply');
  await expect.poll(() => page.evaluate(() => window.location.hash))
    .not.toBe(originalHash);
  await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Share \/ Import/ }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles(savedPath);

  await expect(page.getByText('Character JSON imported. ✓', { exact: true }))
    .toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash))
    .toBe(originalHash);
});
