import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function waitForComposition(page: Page) {
  await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({
    timeout: 30_000,
  });
}

async function expandLayer(page: Page, itemName: string, typeName: string) {
  const row = page.getByRole('button', {
    name: new RegExp(`${itemName}.*${typeName}`, 'i'),
  }).first();
  await row.click();
}

async function activate(button: Locator, key: 'Enter' | 'Space') {
  await button.focus();
  await button.press(key);
}

test('independent head and expression colors survive canonical save and import', async ({
  page,
}) => {
  await page.goto('/compose?assetSource=zip');
  await waitForComposition(page);
  const pause = page.getByRole('button', { name: 'Pause' });
  if (await pause.isVisible()) await pause.click();

  await expandLayer(page, 'Human Male', 'head');
  const headEyes = page
    .locator('[data-channel-id="eyes"]')
    .filter({ visible: true });
  await expect(headEyes.getByText('Base Eye Color', { exact: true })).toBeVisible();
  await expect(page.getByText(
    'The visible eye color is currently controlled by Expression.',
    { exact: true },
  )).toBeVisible();
  await expect(
    headEyes.getByRole('button', { name: 'Base Eye Color: Red' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit base eye color' }).click();
  await activate(
    headEyes.getByRole('button', { name: 'Base Eye Color: Red' }),
    'Enter',
  );
  await waitForComposition(page);

  await page.getByRole('button', { name: 'Edit visible eye color' }).click();
  const expressionEyes = page
    .locator('[data-channel-id="eyes"]')
    .filter({ visible: true });
  await expect.poll(() => expressionEyes.evaluate((element) =>
    element.contains(document.activeElement),
  )).toBe(true);
  await expect.poll(() => expressionEyes.evaluate((element) => {
    const scrollContainer = element.closest('[data-layer-scroll-container]');
    if (!scrollContainer) return false;
    const targetRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    return targetRect.top >= containerRect.top
      && targetRect.bottom <= containerRect.bottom;
  })).toBe(true);
  await activate(
    expressionEyes.getByRole('button', {
      name: 'Eye Color: Green (green)',
      exact: true,
    }),
    'Space',
  );
  await waitForComposition(page);

  const savedHash = await page.evaluate(() => window.location.hash);
  expect(savedHash).toContain('color.head.eyes=red');
  expect(savedHash).toContain('color.expression.eyes=green');
  const preview = page.locator('main canvas').filter({ visible: true }).first();
  const savedRender = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Share \/ Import/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save character JSON' }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not expose the saved JSON path.');
  const savedBytes = await readFile(savedPath);
  const savedDocument = JSON.parse(savedBytes.toString('utf8')) as {
    items: Record<string, { channelRecolors?: Record<string, string> }>;
  };
  expect(savedDocument.items.head?.channelRecolors).toEqual({ eyes: 'red' });
  expect(savedDocument.items.expression?.channelRecolors).toEqual({
    eyes: 'green',
  });

  await page.keyboard.press('Escape');
  await expandLayer(page, 'Neutral', 'expression');
  await expandLayer(page, 'Human Male', 'head');
  await page.getByRole('button', { name: 'Edit base eye color' }).click();
  await page
    .locator('[data-channel-id="eyes"]')
    .filter({ visible: true })
    .getByRole('button', { name: 'Base Eye Color: Asset default' })
    .click();
  await waitForComposition(page);
  await expect.poll(() => page.evaluate(() => window.location.hash))
    .not.toBe(savedHash);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Share \/ Import/ }).click();
  const importInput = page.locator(
    'input[type="file"][accept="application/json,.json"]',
  );
  await importInput.setInputFiles({
    name: 'character.selection.json',
    mimeType: 'application/json',
    buffer: savedBytes,
  });
  await expect.poll(async () => ({
    hash: await page.evaluate(() => window.location.hash),
    statuses: await page.getByRole('status').allTextContents(),
  })).toEqual({
    hash: savedHash,
    statuses: expect.arrayContaining(['Character JSON imported. ✓']),
  });
  await expect(page.getByText('Character JSON imported. ✓', { exact: true }))
    .toBeVisible();
  await waitForComposition(page);
  await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  )).toBe(savedRender);
});
