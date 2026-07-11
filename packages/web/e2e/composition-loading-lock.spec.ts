import { expect, test, type Route } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';
import { clickPresetMenuAction } from './helpers/preset-menu';

interface ZipGate {
  handler(route: Route): Promise<void>;
  waitUntilBlocked(): Promise<void>;
  release(): Promise<void>;
}

function createZipGate(): ZipGate {
  let blocked = true;
  const pending = new Set<Route>();
  let resolveBlocked: () => void;
  const blockedPromise = new Promise<void>((resolve) => {
    resolveBlocked = resolve;
  });

  return {
    async handler(route: Route): Promise<void> {
      if (!blocked) {
        await route.continue();
        return;
      }

      pending.add(route);
      resolveBlocked();
    },
    waitUntilBlocked(): Promise<void> {
      return blockedPromise;
    },
    async release(): Promise<void> {
      blocked = false;
      const routes = [...pending];
      pending.clear();
      await Promise.all(routes.map((route) => route.continue()));
    },
  };
}

test.describe('composition loading lock', () => {
  test('shows initial progress and locks composition controls', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    const gate = createZipGate();
    await page.route('**/zips/*.zip', (route) => gate.handler(route));
    await page.goto('/compose');

    const overlay = page.getByTestId('composition-loading-overlay');
    await gate.waitUntilBlocked();
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Loading character');
    await expect(overlay).toContainText(/\d+%/);
    await expect(page.getByRole('searchbox', { name: 'Search all assets…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Presets' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();

    await gate.release();
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('searchbox', { name: 'Search all assets…' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Presets' })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('retains the old preview and locks presets during replacement composition', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.goto('/compose');

    const overlay = page.getByTestId('composition-loading-overlay');
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    const downloadButton = page.getByRole('button', { name: /Download/ });
    await expect(downloadButton).toBeEnabled();
    await page.getByRole('button', { name: 'Pause' }).click();

    const previewCanvas = page.locator('main canvas').first();
    const before = await previewCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    const gate = createZipGate();
    await page.route('**/zips/*.zip', (route) => gate.handler(route));

    await clickPresetMenuAction(page, 'Farmer', 'Apply');

    await gate.waitUntilBlocked();
    await expect(overlay).toBeVisible();
    await expect(page.getByRole('button', { name: 'Presets' })).toBeDisabled();
    await expect(downloadButton).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(await previewCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);

    await gate.release();
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Presets' })).toBeEnabled();
    await expect(downloadButton).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('defers Back selection until composition unlocks without replacing history', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.goto('/compose?e2eProbe=1');

    const overlay = page.getByTestId('composition-loading-overlay');
    await expect(overlay).toBeHidden({ timeout: 30_000 });

    await clickPresetMenuAction(page, 'Farmer', 'Apply');
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    const farmerUrl = page.url();

    const gate = createZipGate();
    await page.route('**/zips/*.zip', (route) => gate.handler(route));
    await clickPresetMenuAction(page, 'Mage', 'Apply');
    await gate.waitUntilBlocked();
    const mageUrl = page.url();
    const mageStateHash = await page.evaluate(() => window.__LPC_E2E__?.hash);

    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(farmerUrl);
    await expect(overlay).toBeVisible();
    expect(await page.evaluate(() => window.__LPC_E2E__?.hash)).toBe(mageStateHash);

    await gate.release();
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    expect(await page.evaluate(() => window.__LPC_E2E__?.hash)).toBe(
      new URL(page.url()).hash.slice(1),
    );

    await page.evaluate(() => window.history.forward());
    await expect(page).toHaveURL(mageUrl);
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('defers Back to the default empty hash until composition unlocks', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.goto('/compose?e2eProbe=1');

    const overlay = page.getByTestId('composition-loading-overlay');
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    const defaultUrl = page.url();
    const defaultHash = await page.evaluate(() => window.__LPC_E2E__?.hash);

    await clickPresetMenuAction(page, 'Farmer', 'Apply');
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    const farmerUrl = page.url();
    const farmerHash = await page.evaluate(() => window.__LPC_E2E__?.hash);

    const gate = createZipGate();
    await page.route('**/zips/*.zip', (route) => gate.handler(route));
    await clickPresetMenuAction(page, 'Mage', 'Apply');
    await gate.waitUntilBlocked();

    await page.evaluate(() => window.history.go(-2));
    await expect(page).toHaveURL(defaultUrl);
    await expect(overlay).toBeVisible();
    expect(await page.evaluate(() => window.__LPC_E2E__?.hash)).not.toBe(
      defaultHash,
    );

    await gate.release();
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect
      .poll(() => page.evaluate(() => window.__LPC_E2E__?.hash))
      .toBe(defaultHash);

    await page.evaluate(() => window.history.forward());
    await expect(page).toHaveURL(farmerUrl);
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect
      .poll(() => page.evaluate(() => window.__LPC_E2E__?.hash))
      .toBe(farmerHash);
    expect(errors).toEqual([]);
  });
});
