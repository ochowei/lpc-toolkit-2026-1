/** Verifies mobile/desktop responsive layout behavior in the browser. */
import { expect, test } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';

const SIDEBAR_STORAGE_KEY = 'lpc.sidebar-width.v1';

async function sidebarWidth(page: import('@playwright/test').Page) {
  return page.locator('aside').first().evaluate((element) => {
    return element.getBoundingClientRect().width;
  });
}

test.describe('responsive layout', () => {
  test('mobile opens to preview and can switch to layers', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?assetSource=zip');

    await expect(page.getByRole('navigation', { name: 'Mobile view' })).toBeVisible();
    await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({ timeout: 30_000 });
    await page.getByTitle('Reload assets').click();
    await expect(page.getByText('Reloaded.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Layers' }).click();
    await expect(page.getByText('Your layers')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Layers' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });

  test('desktop keeps the two-column editor and hides mobile nav', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?assetSource=zip');

    await expect(page.getByRole('navigation', { name: 'Mobile view' })).toBeHidden();
    await expect(page.getByText('Your layers')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });

    const separator = page.getByRole('separator', { name: 'Resize sidebar' });
    await expect(separator).toBeVisible();
    await expect(separator).toHaveAttribute('aria-valuenow', '400');
    expect(await sidebarWidth(page)).toBeCloseTo(400, 0);
    expect(errors).toEqual([]);
  });

  test('desktop drag updates live and persists only on commit', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.addInitScript((storageKey) => {
      const initializationKey = `${storageKey}.test-initialized`;
      if (window.sessionStorage.getItem(initializationKey) === null) {
        window.localStorage.removeItem(storageKey);
        window.sessionStorage.setItem(initializationKey, 'true');
      }
    }, SIDEBAR_STORAGE_KEY);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?assetSource=zip');

    const separator = page.getByRole('separator', { name: 'Resize sidebar' });
    const box = await separator.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(520, box!.y + box!.height / 2);

    expect(await sidebarWidth(page)).toBeCloseTo(520, 0);
    expect(
      await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SIDEBAR_STORAGE_KEY),
    ).toBeNull();

    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe('');
    await expect.poll(() => page.evaluate(() => document.body.style.userSelect)).toBe('');
    expect(
      await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SIDEBAR_STORAGE_KEY),
    ).toBe('520');

    await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({ timeout: 30_000 });
    await page.reload();
    expect(await sidebarWidth(page)).toBeCloseTo(520, 0);
    await expect(separator).toHaveAttribute('aria-valuenow', '520');
    expect(errors).toEqual([]);
  });

  test('desktop drag cleanup restores body styles when switching to mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?assetSource=zip');

    const separator = page.getByRole('separator', { name: 'Resize sidebar' });
    const box = await separator.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe('ew-resize');

    await page.setViewportSize({ width: 390, height: 844 });

    await expect(separator).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe('');
    await expect.poll(() => page.evaluate(() => document.body.style.userSelect)).toBe('');
  });

  test('desktop keyboard resizing and reset persist preferred widths', async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.removeItem(storageKey);
    }, SIDEBAR_STORAGE_KEY);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?assetSource=zip');

    const separator = page.getByRole('separator', { name: 'Resize sidebar' });
    await separator.focus();

    await separator.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '416');
    expect(
      await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SIDEBAR_STORAGE_KEY),
    ).toBe('416');

    await separator.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', '320');

    await separator.press('End');
    await expect(separator).toHaveAttribute('aria-valuenow', '640');

    await separator.dblclick();
    await expect(separator).toHaveAttribute('aria-valuenow', '400');
    expect(
      await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SIDEBAR_STORAGE_KEY),
    ).toBe('400');
  });

  test('desktop constrains rendering without overwriting the preferred width', async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.setItem(storageKey, '640');
    }, SIDEBAR_STORAGE_KEY);
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/?assetSource=zip');

    expect(await sidebarWidth(page)).toBeCloseTo(574, 0);
    await expect(page.locator('main')).toBeVisible();
    expect(
      await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SIDEBAR_STORAGE_KEY),
    ).toBe('640');
  });

  test('mobile download popover fits within the viewport', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?assetSource=zip');

    await page.getByRole('button', { name: /Download/ }).click();
    const panel = page.getByTestId('download-popover');
    await expect(panel).toBeVisible();

    const fits = await panel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    });
    expect(fits).toBe(true);
    expect(errors).toEqual([]);
  });
});
