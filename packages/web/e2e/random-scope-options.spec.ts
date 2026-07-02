import { expect, test } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';

const RANDOM_SCOPE_LABELS = ['Appearance', 'Clothing', 'Equipment', 'Colors'] as const;

test('random scope checkboxes can be toggled repeatedly without page errors', async ({
  page,
}) => {
  const errors = attachConsoleCollector(page);

  await page.goto('/?assetSource=zip');

  const overlay = page.getByTestId('composition-loading-overlay');
  const randomBtn = page.getByTitle('Randomize outfit');
  await expect(randomBtn).toBeVisible({ timeout: 30_000 });
  await expect(overlay).toBeHidden({ timeout: 30_000 });

  for (const label of RANDOM_SCOPE_LABELS) {
    const checkbox = page.getByLabel(label, { exact: true });
    await expect(checkbox).toBeVisible();

    for (let i = 0; i < 2; i++) {
      await checkbox.click();
      await expect(page.getByText('Random options')).toBeVisible();
      await expect(randomBtn).toBeVisible();
      await expect(overlay).toBeHidden();

      await checkbox.click();
      await expect(page.getByText('Random options')).toBeVisible();
      await expect(randomBtn).toBeVisible();
      await expect(overlay).toBeHidden();
    }
  }

  if (errors.length > 0) {
    const report = errors
      .map(
        (error, index) =>
          `[${index}] ${error.kind}: ${error.text}${
            error.location ? `\n    @ ${error.location}` : ''
          }`,
      )
      .join('\n');
    throw new Error(`Captured ${errors.length} page error(s):\n${report}`);
  }
});
