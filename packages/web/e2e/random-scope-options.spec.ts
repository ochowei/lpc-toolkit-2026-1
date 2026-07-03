import { expect, test } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';
import { clickPresetMenuAction } from './helpers/preset-menu';

const PRESET_LABELS = ['Farmer', 'Mage', 'Knight', 'Ranger', 'Noble'] as const;

test('preset random actions can be triggered repeatedly without page errors', async ({
  page,
}) => {
  const errors = attachConsoleCollector(page);

  await page.goto('/?assetSource=zip');

  const overlay = page.getByTestId('composition-loading-overlay');
  await expect(page.getByRole('button', { name: 'Presets' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Random options')).toHaveCount(0);
  await expect(overlay).toBeHidden({ timeout: 30_000 });

  for (const label of PRESET_LABELS) {
    for (let i = 0; i < 2; i++) {
      await clickPresetMenuAction(page, label, 'Random');
      await expect(overlay).toBeHidden({ timeout: 30_000 });
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
