import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'lpc.replacement-card-display-mode.v1';

function selectedLayerButtons(page: import('@playwright/test').Page) {
  return page
    .locator('aside div:has(> button[aria-label^="Clear "])')
    .locator('> button[aria-expanded]:not([aria-haspopup])');
}

async function openFirstReplacementGrid(
  page: import('@playwright/test').Page,
) {
  const firstLayer = selectedLayerButtons(page).first();
  await expect(firstLayer).toBeVisible();
  await firstLayer.click();
  await expect(
    page.getByRole('group', { name: 'Card labels' }),
  ).toBeVisible();
}

test.describe('replacement card display modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((key) => {
      const initializedKey = `${key}.test-initialized`;
      if (window.sessionStorage.getItem(initializedKey) === null) {
        window.localStorage.removeItem(key);
        window.sessionStorage.setItem(initializedKey, 'true');
      }
    }, STORAGE_KEY);
    await page.goto('/?assetSource=zip');
    await expect(page.getByTestId('composition-loading-overlay'))
      .toBeHidden({ timeout: 30_000 });
  });

  test('defaults to overlay and persists a shared hidden preference', async ({ page }) => {
    await openFirstReplacementGrid(page);

    const overlay = page.getByRole('button', { name: 'Overlay', exact: true });
    await expect(overlay).toHaveAttribute('aria-pressed', 'true');

    const cards = page.locator('button[data-label-layout]');
    await expect(cards.first()).toHaveAttribute('data-label-layout', 'overlay');
    await expect(cards.first().locator(
      'canvas[width="56"], div[style*="width: 56px"]',
    ).first()).toBeVisible();

    const hashBeforeModeChange = await page.evaluate(() => window.location.hash);
    await page.getByRole('button', { name: 'Hidden', exact: true }).click();
    await expect(cards.first()).toHaveAttribute('data-label-layout', 'hidden');
    await expect(cards.first().locator('[data-visible-item-label]')).toHaveCount(0);
    expect(await page.evaluate(() => window.location.hash))
      .toBe(hashBeforeModeChange);
    await expect.poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
    ).toBe('hidden');

    const firstLayer = selectedLayerButtons(page).first();
    await firstLayer.click();
    const secondLayer = selectedLayerButtons(page).nth(1);
    await secondLayer.click();
    await expect(page.locator('button[data-label-layout]').first())
      .toHaveAttribute('data-label-layout', 'hidden');

    await page.reload();
    await expect(page.getByTestId('composition-loading-overlay'))
      .toBeHidden({ timeout: 30_000 });
    await openFirstReplacementGrid(page);
    await expect(page.getByRole('button', { name: 'Hidden', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps card dimensions while switching all three modes', async ({ page }) => {
    await openFirstReplacementGrid(page);
    const firstCard = page.locator('button[data-label-layout]').first();
    const initialBox = await firstCard.boundingBox();
    expect(initialBox).not.toBeNull();

    for (const mode of ['Stacked', 'Overlay', 'Hidden']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const box = await firstCard.boundingBox();
      expect(box?.width).toBeCloseTo(initialBox!.width, 0);
      expect(box?.height).toBeCloseTo(initialBox!.height, 0);
    }
  });

  test('falls back and remains interactive when mode storage throws', async ({ page }) => {
    await page.addInitScript((key) => {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (requestedKey) {
        if (requestedKey === key) throw new Error('blocked read');
        return getItem.call(this, requestedKey);
      };
      Storage.prototype.setItem = function (requestedKey, value) {
        if (requestedKey === key) throw new Error('blocked write');
        return setItem.call(this, requestedKey, value);
      };
    }, STORAGE_KEY);
    await page.reload();
    await expect(page.getByTestId('composition-loading-overlay'))
      .toBeHidden({ timeout: 30_000 });
    await openFirstReplacementGrid(page);

    await expect(page.getByRole('button', { name: 'Overlay', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Hidden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hidden', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button[data-label-layout]').first())
      .toHaveAttribute('data-label-layout', 'hidden');
  });
});
