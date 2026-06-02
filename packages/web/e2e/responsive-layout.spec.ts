/** Verifies mobile/desktop responsive layout behavior in the browser. */
import { expect, test } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';

test.describe('responsive layout', () => {
  test('mobile opens to preview and can switch to layers', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?assetSource=local');

    await expect(page.getByRole('navigation', { name: 'Mobile view' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await page.getByTitle('Reload assets').click();
    await expect(page.getByRole('status')).toContainText('Reloaded.');

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
    await page.goto('/?assetSource=local');

    await expect(page.getByRole('navigation', { name: 'Mobile view' })).toBeHidden();
    await expect(page.getByText('Your layers')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });

    const grid = page.locator('div.grid-cols-\\[340px_1fr\\]');
    await expect(grid).toBeVisible();
    const sidebarWidth = await page.locator('aside').first().evaluate((el) => el.getBoundingClientRect().width);
    expect(sidebarWidth).toBeGreaterThanOrEqual(330);
    expect(sidebarWidth).toBeLessThanOrEqual(350);
    expect(errors).toEqual([]);
  });

  test('mobile download popover fits within the viewport', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?assetSource=local');

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
