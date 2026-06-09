import { expect, test, type Route } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';

function createZipGate() {
  let blocked = true;
  const pending = new Set<Route>();

  return {
    async handler(route: Route) {
      if (!blocked) {
        await route.continue();
        return;
      }

      pending.add(route);
    },
    async release() {
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
    await page.goto('/');

    const overlay = page.getByTestId('composition-loading-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Loading character');
    await expect(overlay).toContainText(/\d+%/);
    await expect(page.getByRole('searchbox', { name: 'Search all assets…' })).toBeDisabled();
    await expect(page.getByTitle('Randomize outfit')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();

    await gate.release();
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('searchbox', { name: 'Search all assets…' })).toBeEnabled();
    await expect(page.getByTitle('Randomize outfit')).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('retains the old preview and locks presets during replacement composition', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.goto('/');

    const overlay = page.getByTestId('composition-loading-overlay');
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pause' }).click();

    const previewCanvas = page.locator('main canvas').first();
    const before = await previewCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    const gate = createZipGate();
    await page.route('**/zips/*.zip', (route) => gate.handler(route));

    await page.getByRole('button', { name: 'Presets' }).click();
    await page.getByRole('menuitem', { name: /Farmer/ }).click();

    await expect(overlay).toBeVisible();
    await expect(page.getByRole('button', { name: 'Presets' })).toBeDisabled();
    await expect(page.getByTitle('Randomize outfit')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(await previewCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);

    await gate.release();
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Presets' })).toBeEnabled();
    await expect(page.getByTitle('Randomize outfit')).toBeEnabled();
    expect(errors).toEqual([]);
  });
});
