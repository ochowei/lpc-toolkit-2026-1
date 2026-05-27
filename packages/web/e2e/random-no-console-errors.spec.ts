import { test, expect } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';

const RANDOM_CLICKS = 20;

test('clicking random 20 times produces no console errors', async ({ page }) => {
  const errors = attachConsoleCollector(page);

  await page.goto('/');

  const randomBtn = page.getByTitle('Randomize outfit');
  await expect(randomBtn).toBeVisible({ timeout: 30_000 });

  for (let i = 0; i < RANDOM_CLICKS; i++) {
    await randomBtn.click();
    await page.waitForTimeout(150);
  }

  await page.waitForTimeout(1_000);

  if (errors.length > 0) {
    const report = errors
      .map(
        (e, i) =>
          `[${i}] ${e.kind}: ${e.text}${e.location ? `\n    @ ${e.location}` : ''}`,
      )
      .join('\n');
    throw new Error(
      `Captured ${errors.length} console error(s) during ${RANDOM_CLICKS} random clicks:\n${report}`,
    );
  }
});
