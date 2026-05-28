# Responsive Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web UI usable on phone-sized screens with a preview-first mobile layout while keeping the desktop two-column editor unchanged.

**Architecture:** `LayerStackHarness` chooses one layout shell at runtime: the existing desktop grid for `md` and wider, or a mobile single-panel shell below `md`. The mobile shell switches between the existing `PreviewPane` and `StackPanel` with a small bottom nav, so editor logic and attribution/download behavior stay shared.

**Tech Stack:** TypeScript strict mode, React 18, Vite, Tailwind CSS v4 utilities, Vitest, Playwright, pnpm workspaces.

---

## File Structure

- Create `packages/web/src/hooks/use-media-query.ts`
  - Web-only hook for selecting the desktop or mobile shell without mounting duplicate panes.
- Create `packages/web/test/use-media-query.test.ts`
  - Unit tests for the hook's pure query reader helper.
- Create `packages/web/src/components/layer-stack/mobile-bottom-nav.tsx`
  - Two-button mobile tab switcher for Preview and Layers.
- Modify `packages/web/src/i18n.ts`
  - Add translated labels for the mobile nav.
- Modify `packages/web/src/components/layer-stack/harness.tsx`
  - Add `mobileView` state, select desktop/mobile shell with the media query hook, and render the bottom nav only in mobile shell.
- Modify `packages/web/src/components/layer-stack/top-bar.tsx`
  - Add responsive wrapping and hide the subtitle on narrow screens.
- Modify `packages/web/src/components/layer-stack/preview-pane.tsx`
  - Let the preview action bar wrap on mobile and keep frame status/full sheet controls from forcing horizontal overflow.
- Modify popover components:
  - `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`
  - `packages/web/src/components/layer-stack/popovers/body-type-popover.tsx`
  - `packages/web/src/components/layer-stack/popovers/download-popover.tsx`
  - `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`
  - `packages/web/src/components/layer-stack/popovers/token-popover.tsx`
  - Add viewport-safe max width/height and internal scroll where needed.
- Create `packages/web/e2e/responsive-layout.spec.ts`
  - Playwright coverage for mobile default preview, mobile Layers switch, desktop two-column preservation, and mobile popover fit.

## Task 1: Media Query Hook

**Files:**
- Create: `packages/web/src/hooks/use-media-query.ts`
- Create: `packages/web/test/use-media-query.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `packages/web/test/use-media-query.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { readMediaQuery } from '../src/hooks/use-media-query';

describe('readMediaQuery', () => {
  it('returns false when matchMedia is unavailable', () => {
    expect(readMediaQuery('(min-width: 768px)', undefined)).toBe(false);
  });

  it('reads the current media query match', () => {
    const matchMedia = vi.fn<(query: string) => MediaQueryList>((query) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(readMediaQuery('(min-width: 768px)', matchMedia)).toBe(true);
    expect(readMediaQuery('(min-width: 1024px)', matchMedia)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- use-media-query.test.ts
```

Expected: FAIL because `../src/hooks/use-media-query` does not exist.

- [ ] **Step 3: Implement the hook**

Create `packages/web/src/hooks/use-media-query.ts`:

```ts
import { useEffect, useState } from 'react';

type MatchMedia = typeof window.matchMedia;

export function readMediaQuery(
  query: string,
  matchMedia: MatchMedia | undefined,
): boolean {
  if (!matchMedia) return false;
  return matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    readMediaQuery(query, typeof window === 'undefined' ? undefined : window.matchMedia),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- use-media-query.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/use-media-query.ts packages/web/test/use-media-query.test.ts
git commit -m "feat(web): add media query hook"
```

## Task 2: Mobile Bottom Nav And Labels

**Files:**
- Create: `packages/web/src/components/layer-stack/mobile-bottom-nav.tsx`
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add translation keys**

In `packages/web/src/i18n.ts`, add these keys to the English dictionary near `more.theme`:

```ts
'mobile.preview': 'Preview',
'mobile.layers': 'Layers',
```

Add these keys to the `zh-TW` dictionary near `more.theme`:

```ts
'mobile.preview': '預覽',
'mobile.layers': '圖層',
```

- [ ] **Step 2: Create the mobile nav component**

Create `packages/web/src/components/layer-stack/mobile-bottom-nav.tsx`:

```tsx
import { Button } from '../ui/button';
import type { Translator } from '../../i18n';

export type MobileView = 'preview' | 'layers';

interface Props {
  value: MobileView;
  onChange: (value: MobileView) => void;
  t: Translator;
}

export function MobileBottomNav({ value, onChange, t }: Props) {
  return (
    <nav
      className="flex shrink-0 items-center gap-1 border-t border-border bg-surface p-2 md:hidden"
      aria-label="Mobile view"
    >
      <Button
        type="button"
        size="sm"
        variant={value === 'preview' ? 'primary' : 'ghost'}
        className="min-w-0 flex-1"
        aria-pressed={value === 'preview'}
        onClick={() => onChange('preview')}
      >
        {t('mobile.preview')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'layers' ? 'primary' : 'ghost'}
        className="min-w-0 flex-1"
        aria-pressed={value === 'layers'}
        onClick={() => onChange('layers')}
      >
        {t('mobile.layers')}
      </Button>
    </nav>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS. If it fails because translation key types are inferred and the keys are missing in one locale, add the missing key to the reported locale.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/mobile-bottom-nav.tsx packages/web/src/i18n.ts
git commit -m "feat(web): add mobile bottom navigation"
```

## Task 3: Responsive Shell In LayerStackHarness

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Import the hook and mobile nav**

In `packages/web/src/components/layer-stack/harness.tsx`, add imports:

```ts
import { useMediaQuery } from '../../hooks/use-media-query';
import {
  MobileBottomNav,
  type MobileView,
} from './mobile-bottom-nav';
```

- [ ] **Step 2: Add responsive state**

Inside `LayerStackHarness`, near the other `useState` calls, add:

```ts
const isDesktop = useMediaQuery('(min-width: 768px)');
const [mobileView, setMobileView] = useState<MobileView>('preview');
```

- [ ] **Step 3: Extract the shared panes into constants**

Before the `return`, after `handlePresetApplied`, add:

```tsx
const stackPanel = (
  <StackPanel
    catalog={props.catalog}
    palettes={props.palettes}
    state={props.state}
    dispatch={props.dispatch}
    shownTypeNames={props.shownTypeNames}
    licenseFilter={licenseFilter}
    toggleLicenseGroup={toggleLicenseGroup}
    licenseIncompatibleCount={licenseIncompatibleCount}
    removeLicenseIncompatibleSelections={removeLicenseIncompatibleSelections}
    animationFilter={animationFilter}
    toggleAnimation={toggleAnimation}
    animationIncompatibleCount={animationIncompatibleCount}
    removeAnimationIncompatibleSelections={removeAnimationIncompatibleSelections}
    assetSource={props.assetSource}
    setAssetSource={props.onAssetSourceChange}
    customOverlay={customOverlay}
    customOverlayZPos={customOverlayZPos}
    onCustomOverlayUpload={handleCustomOverlayUpload}
    onCustomOverlayZPosChange={handleCustomOverlayZPosChange}
    onClearCustomOverlay={clearCustomOverlay}
    t={props.t}
    tl={props.tl}
    onPresetApplied={handlePresetApplied}
    onReset={handleReset}
    status={status}
    expanded={expanded}
    setExpanded={setExpanded}
    searchInputRef={searchInputRef}
  />
);

const previewPane = (
  <PreviewPane
    state={props.state}
    dispatch={props.dispatch}
    t={t}
    result={composeResult}
    fullSheet={fullSheet}
    fullSheetActions={fullSheetActions}
  />
);
```

- [ ] **Step 4: Replace the layout grid after `TopBar`**

In the return JSX, keep the existing `<TopBar>...</TopBar>` block. Replace the current grid block that starts with:

```tsx
<div className="relative grid min-h-0 flex-1 grid-cols-[340px_1fr]">
```

with:

```tsx
{isDesktop ? (
  <div className="relative grid min-h-0 flex-1 grid-cols-[340px_1fr]">
    <aside className="min-h-0 overflow-hidden border-r border-border bg-surface">
      {stackPanel}
    </aside>
    <main className="min-h-0 overflow-hidden bg-app">
      {previewPane}
    </main>
  </div>
) : (
  <div className="flex min-h-0 flex-1 flex-col">
    <main className="min-h-0 flex-1 overflow-hidden bg-app">
      {mobileView === 'preview' ? previewPane : stackPanel}
    </main>
    <MobileBottomNav value={mobileView} onChange={setMobileView} t={props.t} />
  </div>
)}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): add responsive editor shell"
```

## Task 4: Mobile Overflow Fixes For Top Bar, Preview Controls, And Popovers

**Files:**
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/body-type-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/token-popover.tsx`

- [ ] **Step 1: Make the top bar wrap safely on mobile**

In `top-bar.tsx`, change the header class to:

```tsx
<header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-2 text-xs sm:px-3 md:flex-nowrap">
```

Change the brand container class to:

```tsx
<div className="mr-1 flex min-w-0 flex-col leading-none">
```

Change the subtitle span class to hide on narrow screens:

```tsx
<span className="hidden font-mono text-[9px] text-text-dim sm:inline">
```

Change the spacer class to:

```tsx
<div className="min-w-2 flex-1" />
```

- [ ] **Step 2: Make preview controls wrap safely**

In `preview-pane.tsx`, change the action bar class to:

```tsx
<div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-2 text-xs sm:gap-3 sm:px-3">
```

Change the frame status span class to:

```tsx
<span className="ml-auto whitespace-nowrap font-mono text-[10px] text-text-mute">
```

Change the Full Sheet button to include a non-shrinking class:

```tsx
<Button
  size="sm"
  variant={fullSheet.open ? 'primary' : 'default'}
  className="shrink-0"
  onClick={() => fullSheetActions.setOpen(!fullSheet.open)}
  title={t('fullSheet.toggle')}
>
```

- [ ] **Step 3: Add viewport-safe popover panel classes**

For each listed popover panel, keep existing positioning style but add max viewport classes to the panel `className`.

In `download-popover.tsx`, change:

```tsx
className="w-72 rounded-md border border-border bg-surface p-3 shadow-lg"
```

to this panel opening:

```tsx
data-testid="download-popover"
className="max-h-[calc(100vh-5rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
```

In `token-popover.tsx`, change the panel class from `w-80 ...` to:

```tsx
className="max-h-[calc(100vh-5rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
```

In `attribution-popover.tsx`, change the panel class from `max-h-96 w-96 ...` to:

```tsx
className="max-h-[calc(100vh-5rem)] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
```

In `more-menu-popover.tsx`, change the panel class from `w-56 ...` to:

```tsx
className="max-h-[calc(100vh-5rem)] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-1 text-[12px] shadow-lg"
```

In `body-type-popover.tsx`, change the panel class from `rounded-md ...` to:

```tsx
className="max-h-[calc(100vh-5rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-2 shadow-lg"
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/top-bar.tsx packages/web/src/components/layer-stack/preview-pane.tsx packages/web/src/components/layer-stack/popovers/attribution-popover.tsx packages/web/src/components/layer-stack/popovers/body-type-popover.tsx packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx packages/web/src/components/layer-stack/popovers/token-popover.tsx
git commit -m "fix(web): constrain mobile controls and popovers"
```

## Task 5: Responsive Playwright Coverage

**Files:**
- Create: `packages/web/e2e/responsive-layout.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `packages/web/e2e/responsive-layout.spec.ts`:

```ts
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
  });

  test('mobile download popover fits within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?assetSource=local');

    await page.getByRole('button', { name: /Download/ }).click();
    const panel = page.getByTestId('download-popover');
    await expect(panel).toBeVisible();

    const fits = await panel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    });
    expect(fits).toBe(true);
  });
});
```

- [ ] **Step 2: Run the e2e spec**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e -- responsive-layout.spec.ts
```

Expected: PASS after Tasks 1-4.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/responsive-layout.spec.ts
git commit -m "test(web): cover responsive editor layout"
```

## Task 6: Final Verification

**Files:**
- No new files expected unless verification reveals a small fix.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- use-media-query.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run responsive e2e**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e -- responsive-layout.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Run full web tests if time allows**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [ ] **Step 5: Manual browser verification**

Run the dev server:

```bash
pnpm --filter @lpc-toolkit/web dev
```

Open the local URL shown by Vite. Check:

- At 390x844, Preview is the default view and no horizontal scroll appears.
- At 390x844, Layers can be selected and the layer list scrolls.
- At 390x844, Download and More popovers fit on screen.
- At 1280x900, the desktop sidebar and preview are both visible and the bottom nav is absent.

- [ ] **Step 6: Commit any verification fixes**

If verification required small fixes, commit them:

```bash
git add packages/web/src packages/web/e2e packages/web/test
git commit -m "fix(web): polish responsive layout"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: The plan covers preview-first mobile layout, desktop preservation, top bar compression, preview controls wrapping, popover viewport constraints, mobile state, accessibility labels, and Playwright verification.
- Placeholder scan: No incomplete marker, vague task, or cross-reference-only step remains.
- Type consistency: `MobileView` is defined once in `mobile-bottom-nav.tsx` and imported by `harness.tsx`; translation keys are `mobile.preview` and `mobile.layers`; the media query hook exports `useMediaQuery` and `readMediaQuery`.
