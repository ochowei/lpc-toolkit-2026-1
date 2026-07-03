import { expect, type Page } from '@playwright/test';

export type PresetMenuAction = 'Apply' | 'Random';

export async function clickPresetMenuAction(
  page: Page,
  presetLabel: string,
  action: PresetMenuAction,
): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Presets' });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();

  const menu = page.getByRole('menu', { name: 'Presets' });
  await expect(menu).toBeVisible();

  const row = menu.locator('[role="none"]').filter({ hasText: presetLabel });
  await expect(row).toHaveCount(1);
  await row.getByRole('menuitem', { name: action, exact: true }).click();
}
