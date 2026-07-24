import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  MoreMenuPopover,
  navigateToAssetPacksFromMoreMenu,
} from '../src/components/layer-stack/popovers/more-menu-popover';
import { createTranslator } from '../src/i18n';

vi.mock('../src/components/layer-stack/popovers/use-popover', () => ({
  usePopover: () => ({
    panelRef: { current: null },
    pos: { top: 0, left: 0 },
  }),
}));

describe('MoreMenuPopover asset editor action', () => {
  it('places the action below attribution and above preferences', () => {
    const html = renderToStaticMarkup(
      <MoreMenuPopover
        open
        setOpen={vi.fn()}
        t={createTranslator('en')}
        locale="en"
        theme="dark"
        attributionCount={0}
        attributionIncompatible={false}
        onSelect={vi.fn()}
        onNavigateAssetPacks={vi.fn()}
        onToggleLocale={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(html).toContain('Repair an Asset Pack');
    expect(html.indexOf('Repair an Asset Pack')).toBeGreaterThan(
      html.indexOf('Attribution'),
    );
    expect(html.indexOf('Repair an Asset Pack')).toBeLessThan(
      html.indexOf('Preferences'),
    );
  });

  it('closes the menu before navigating to the asset editor', () => {
    const setOpen = vi.fn();
    const onNavigateAssetPacks = vi.fn();

    navigateToAssetPacksFromMoreMenu(setOpen, onNavigateAssetPacks);

    expect(setOpen).toHaveBeenCalledWith(false);
    expect(onNavigateAssetPacks).toHaveBeenCalledOnce();
    expect(setOpen.mock.invocationCallOrder[0]).toBeLessThan(
      onNavigateAssetPacks.mock.invocationCallOrder[0],
    );
  });
});
