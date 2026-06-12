# Replacement Card Display Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent stacked, overlay, and hidden label layouts to expanded replacement-item cards, with overlay as the default.

**Architecture:** Keep display-mode validation and best-effort storage access in a pure `packages/web` helper. Let `LayerStackHarness` own the single browser-local preference and pass it through `StackPanel` to each `LayerRow`, where one segmented control and mode-specific card markup update every expanded grid.

**Tech Stack:** TypeScript strict, React 18 hooks, Tailwind CSS v4, Vitest in Node environment, Playwright Chromium, pnpm workspaces. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-06-12-replacement-card-display-modes-design.md`

---

## File Structure

**Create:**

- `packages/web/src/lib/replacement-card-display-mode.ts` — mode type, default, versioned storage key, validation, safe load/save
- `packages/web/test/replacement-card-display-mode.test.ts` — pure preference and storage tests
- `packages/web/e2e/replacement-card-display-modes.spec.ts` — browser interaction, persistence, shared state, and layout checks

**Modify:**

- `packages/web/src/i18n.ts` — English and Traditional Chinese control labels
- `packages/web/test/i18n.test.ts` — translation assertions
- `packages/web/src/components/layer-stack/item-thumbnail.tsx` — permit the 56px full-height thumbnail size
- `packages/web/src/components/layer-stack/layer-row.tsx` — segmented control, explicit card height, and three layouts
- `packages/web/test/layer-row.test.tsx` — static markup contracts for all modes and accessibility
- `packages/web/src/components/layer-stack/stack-panel.tsx` — forward the shared mode and update callback
- `packages/web/src/components/layer-stack/harness.tsx` — initialize, update, and persist the preference

**Untouched:**

- `packages/core/**`
- `upstream/**`
- Sidebar search, add-layer controls, and collapsed layer layout
- Selection reducer, URL hash, composition, export, and attribution behavior

## Approved Dimensions

- All replacement cards use `h-16` (`64px`) and the existing `minmax(72px, 1fr)` grid.
- `stacked` keeps the existing 40px square thumbnail above a one-line label.
- `overlay` and `hidden` use a 56px square thumbnail, filling the 64px card after `p-1` inner spacing.
- The canvas remains square and pixel-rendered; no sprite aspect-ratio distortion is introduced.
- `overlay` adds an absolutely positioned bottom label; `hidden` omits only that visible label.

## Plan Tracking Rule

After each task:

1. Commit the task's code and tests.
2. Run `rtk git rev-parse --short HEAD`.
3. Update this plan's completed task checkbox and add:
   - `Commit: <hash>`
   - `Implementation: <one short note>`
   - `Verification: <command and PASS result>`
4. Commit the plan tracking update separately:
   `rtk git commit -m "docs(superpowers): track replacement card modes task N"`.

---

### Task 1: Add Pure Display-Mode Preference Rules

**Files:**

- Create: `packages/web/src/lib/replacement-card-display-mode.ts`
- Test: `packages/web/test/replacement-card-display-mode.test.ts`

- [x] **Step 1: Write the failing helper tests**

Create `packages/web/test/replacement-card-display-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE,
  REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY,
  loadReplacementCardDisplayMode,
  parseReplacementCardDisplayMode,
  saveReplacementCardDisplayMode,
} from '../src/lib/replacement-card-display-mode';

describe('replacement card display mode', () => {
  it('uses overlay as the approved default', () => {
    expect(DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE).toBe('overlay');
    expect(REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY)
      .toBe('lpc.replacement-card-display-mode.v1');
  });

  it.each(['stacked', 'overlay', 'hidden'] as const)(
    'accepts %s',
    (mode) => {
      expect(parseReplacementCardDisplayMode(mode)).toBe(mode);
      expect(loadReplacementCardDisplayMode({ getItem: () => mode })).toBe(mode);
    },
  );

  it.each([undefined, null, '', 'grid', 'OVERLAY'])(
    'falls back for %s',
    (value) => {
      expect(parseReplacementCardDisplayMode(value)).toBe('overlay');
    },
  );

  it('falls back when storage is unavailable or throws', () => {
    expect(loadReplacementCardDisplayMode(undefined)).toBe('overlay');
    expect(loadReplacementCardDisplayMode({
      getItem: () => {
        throw new Error('blocked');
      },
    })).toBe('overlay');
  });

  it('uses the versioned key and safely persists valid modes', () => {
    const stored: Array<[string, string]> = [];
    saveReplacementCardDisplayMode(
      { setItem: (key, value) => stored.push([key, value]) },
      'hidden',
    );
    expect(stored).toEqual([
      [REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY, 'hidden'],
    ]);
    expect(() => saveReplacementCardDisplayMode({
      setItem: () => {
        throw new Error('blocked');
      },
    }, 'stacked')).not.toThrow();
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- replacement-card-display-mode.test.ts
```

Expected: FAIL because `../src/lib/replacement-card-display-mode` does not exist.

- [x] **Step 3: Implement the minimal helper**

Create `packages/web/src/lib/replacement-card-display-mode.ts`:

```ts
export const REPLACEMENT_CARD_DISPLAY_MODES = [
  'stacked',
  'overlay',
  'hidden',
] as const;

export type ReplacementCardDisplayMode =
  (typeof REPLACEMENT_CARD_DISPLAY_MODES)[number];

export const DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE:
  ReplacementCardDisplayMode = 'overlay';

export const REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY =
  'lpc.replacement-card-display-mode.v1';

export interface ReadableReplacementCardModeStorage {
  getItem(key: string): string | null;
}

export interface WritableReplacementCardModeStorage {
  setItem(key: string, value: string): void;
}

export function parseReplacementCardDisplayMode(
  value: unknown,
): ReplacementCardDisplayMode {
  return typeof value === 'string' &&
    REPLACEMENT_CARD_DISPLAY_MODES.includes(
      value as ReplacementCardDisplayMode,
    )
    ? (value as ReplacementCardDisplayMode)
    : DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE;
}

export function loadReplacementCardDisplayMode(
  storage: ReadableReplacementCardModeStorage | undefined,
): ReplacementCardDisplayMode {
  if (!storage) return DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE;
  try {
    return parseReplacementCardDisplayMode(
      storage.getItem(REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE;
  }
}

export function saveReplacementCardDisplayMode(
  storage: WritableReplacementCardModeStorage | undefined,
  mode: ReplacementCardDisplayMode,
): void {
  if (!storage) return;
  try {
    storage.setItem(REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort.
  }
}
```

- [x] **Step 4: Run the focused test and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- replacement-card-display-mode.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both PASS.

- [x] **Step 5: Commit and update this plan**

```bash
rtk git add packages/web/src/lib/replacement-card-display-mode.ts packages/web/test/replacement-card-display-mode.test.ts
rtk git commit -m "feat(web): add replacement card display preference"
```

- Commit: aa3a1ca1e
- Implementation: Add pure helper/types for parsing/storing/loading display mode preferences.
- Verification: unit tests and typecheck pass.

---

### Task 2: Add Translated Segmented-Control Labels

**Files:**

- Modify: `packages/web/src/i18n.ts`
- Modify: `packages/web/test/i18n.test.ts`

- [x] **Step 1: Add failing translation assertions**

In the representative-label test in `packages/web/test/i18n.test.ts`, add:

```ts
expect(en('replacementCards.displayMode')).toBe('Card labels');
expect(en('replacementCards.stacked')).toBe('Stacked');
expect(en('replacementCards.overlay')).toBe('Overlay');
expect(en('replacementCards.hidden')).toBe('Hidden');
expect(zh('replacementCards.displayMode')).toBe('卡片文字');
expect(zh('replacementCards.stacked')).toBe('上下');
expect(zh('replacementCards.overlay')).toBe('覆蓋');
expect(zh('replacementCards.hidden')).toBe('隱藏');
```

- [x] **Step 2: Run the i18n test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts
```

Expected: FAIL because the new translation keys are absent.

- [x] **Step 3: Add the keys to both locales**

Add beside `layer.swap` in each locale in `packages/web/src/i18n.ts`:

```ts
'replacementCards.displayMode': 'Card labels',
'replacementCards.stacked': 'Stacked',
'replacementCards.overlay': 'Overlay',
'replacementCards.hidden': 'Hidden',
```

```ts
'replacementCards.displayMode': '卡片文字',
'replacementCards.stacked': '上下',
'replacementCards.overlay': '覆蓋',
'replacementCards.hidden': '隱藏',
```

- [x] **Step 4: Run the focused test and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both PASS.

- [x] **Step 5: Commit and update this plan**

```bash
rtk git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts
rtk git commit -m "feat(web): translate replacement card display modes"
```

- Commit: 45f086e60
- Implementation: Add English and Traditional Chinese localization labels for replacement card display modes.
- Verification: vitest unit tests and typecheck pass.

---

### Task 3: Render the Three Card Layouts and Segmented Control

**Files:**

- Modify: `packages/web/src/components/layer-stack/item-thumbnail.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/test/layer-row.test.tsx`

- [x] **Step 1: Expand the LayerRow test fixture and write failing mode tests**

Import the mode type:

```ts
import type { ReplacementCardDisplayMode } from
  '../src/lib/replacement-card-display-mode';
```

Add a render helper that always supplies the new props:

```tsx
function renderExpanded(mode: ReplacementCardDisplayMode): string {
  return renderToStaticMarkup(
    <LayerRow
      disabled={false}
      typeName="tools"
      catalog={catalog}
      palettes={palettes}
      state={state}
      dispatch={() => {}}
      tl={createLabelTranslator('en')}
      t={createTranslator('en')}
      licenseFilter={ALL_LICENSE_GROUPS}
      animationFilter={new Set()}
      expanded
      onToggle={() => {}}
      replacementCardDisplayMode={mode}
      onReplacementCardDisplayModeChange={() => {}}
    />,
  );
}
```

Update the collapsed render to pass `replacementCardDisplayMode="overlay"` and
`onReplacementCardDisplayModeChange={() => {}}`, then replace the current
expanded test with:

```ts
it('renders an accessible icon-and-text segmented control', () => {
  const html = renderExpanded('overlay');
  expect(html).toContain('aria-label="Card labels"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('Overlay');
  expect(html).toContain('Stacked');
  expect(html).toContain('Hidden');
});

it('keeps one card height while changing thumbnail and label layout', () => {
  const stacked = renderExpanded('stacked');
  const overlay = renderExpanded('overlay');
  const hidden = renderExpanded('hidden');

  for (const html of [stacked, overlay, hidden]) {
    expect(html).toContain('h-16');
    expect(html).toContain(
      'grid-cols-[repeat(auto-fill,minmax(72px,1fr))]',
    );
  }

  expect(stacked.match(/style="width:40px;height:40px"/g)).toHaveLength(2);
  expect(stacked).toContain('data-label-layout="stacked"');

  expect(overlay.match(/style="width:56px;height:56px"/g)).toHaveLength(2);
  expect(overlay).toContain('data-label-layout="overlay"');
  expect(overlay).toContain('bg-black/65');

  expect(hidden.match(/style="width:56px;height:56px"/g)).toHaveLength(2);
  expect(hidden).toContain('data-label-layout="hidden"');
  expect(hidden).not.toContain('data-visible-item-label="true"');
  expect(hidden).toContain('aria-label="Smash"');
  expect(hidden).toContain('aria-label="Hammer"');
});
```

- [x] **Step 2: Run the LayerRow test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- layer-row.test.tsx
```

Expected: FAIL because the new props, 56px size, control, and mode markup do not exist.

- [x] **Step 3: Permit 56px item thumbnails**

Change the size union in `item-thumbnail.tsx`:

```ts
size: 20 | 24 | 28 | 40 | 56;
```

- [x] **Step 4: Add LayerRow props and mode metadata**

In `layer-row.tsx`, import and add:

```ts
import {
  REPLACEMENT_CARD_DISPLAY_MODES,
  type ReplacementCardDisplayMode,
} from '../../lib/replacement-card-display-mode';
import type { TranslationKey } from '../../i18n';

const DISPLAY_MODE_ICONS: Record<ReplacementCardDisplayMode, string> = {
  stacked: '▤',
  overlay: '▣',
  hidden: '□',
};

const DISPLAY_MODE_LABEL_KEYS:
  Record<ReplacementCardDisplayMode, TranslationKey> = {
    stacked: 'replacementCards.stacked',
    overlay: 'replacementCards.overlay',
    hidden: 'replacementCards.hidden',
  };
```

Extend `Props`:

```ts
replacementCardDisplayMode: ReplacementCardDisplayMode;
onReplacementCardDisplayModeChange: (
  mode: ReplacementCardDisplayMode,
) => void;
```

Destructure both props in `LayerRow`.

- [x] **Step 5: Render the segmented control in the expanded heading**

Replace the existing heading `div` with:

```tsx
<div className="mb-1 flex flex-wrap items-center gap-1">
  <div className="mr-auto text-[10px] uppercase tracking-wide text-text-mute">
    {t('layer.swap').replace('{name}', tl.category(typeName))}
  </div>
  <div
    className="flex flex-wrap items-center gap-0.5"
    role="group"
    aria-label={t('replacementCards.displayMode')}
  >
    {REPLACEMENT_CARD_DISPLAY_MODES.map((mode) => {
      const selected = replacementCardDisplayMode === mode;
      return (
        <button
          key={mode}
          type="button"
          aria-pressed={selected}
          onClick={() => onReplacementCardDisplayModeChange(mode)}
          className={[
            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
            'text-[9px] focus-visible:outline-none focus-visible:ring-1',
            'focus-visible:ring-accent',
            selected
              ? 'border-accent bg-accent/15 text-text'
              : 'border-border bg-surface-2 text-text-mute hover:bg-surface-3',
          ].join(' ')}
        >
          <span aria-hidden>{DISPLAY_MODE_ICONS[mode]}</span>
          <span>{t(DISPLAY_MODE_LABEL_KEYS[mode])}</span>
        </button>
      );
    })}
  </div>
</div>
```

- [x] **Step 6: Apply the shared card height and mode-specific content**

Before mapping items, derive:

```ts
const fullHeightThumbnail = replacementCardDisplayMode !== 'stacked';
const thumbnailSize = fullHeightThumbnail ? 56 : 40;
```

Change each replacement button to include an explicit accessible name and
shared height:

```tsx
aria-label={tl.itemName(it.name)}
data-label-layout={replacementCardDisplayMode}
className={[
  'relative flex h-16 items-center justify-center overflow-hidden',
  'rounded-md border p-1 text-[10px]',
  replacementCardDisplayMode === 'stacked' ? 'flex-col gap-1' : '',
  isSelected
    ? 'border-accent bg-accent/10 text-text'
    : 'border-border bg-surface-2 text-text-2',
  disabled || !supports ? 'cursor-not-allowed opacity-30' : '',
  !disabled && exceeds && supports ? 'opacity-60' : '',
].filter(Boolean).join(' ')}
```

Render the thumbnail with `size={thumbnailSize}`. Replace the unconditional
label with:

```tsx
{replacementCardDisplayMode !== 'hidden' && (
  <span
    data-visible-item-label="true"
    className={[
      'max-w-full truncate',
      replacementCardDisplayMode === 'overlay'
        ? 'absolute inset-x-1 bottom-1 rounded-sm bg-black/65 px-1 py-0.5 text-white'
        : '',
    ].filter(Boolean).join(' ')}
  >
    {tl.itemName(it.name)}
  </span>
)}
```

Keep the incompatibility badge as an absolute child after this label.

- [x] **Step 7: Run focused tests and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- layer-row.test.tsx
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both PASS.

- [x] **Step 8: Commit and update this plan**

```bash
rtk git add packages/web/src/components/layer-stack/item-thumbnail.tsx packages/web/src/components/layer-stack/layer-row.tsx packages/web/test/layer-row.test.tsx
rtk git commit -m "feat(web): add replacement card display layouts"
```

- Commit: 5350852a8
- Implementation: Render stacked, overlay, and hidden layouts for expanded replacement cards and add segmented control inside LayerRow.
- Verification: unit tests and typecheck pass.

---

### Task 4: Wire Global State, Persistence, and Browser Coverage

**Files:**

- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Create: `packages/web/e2e/replacement-card-display-modes.spec.ts`

- [x] **Step 1: Add the failing browser test**

Create `packages/web/e2e/replacement-card-display-modes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'lpc.replacement-card-display-mode.v1';

async function openFirstReplacementGrid(
  page: import('@playwright/test').Page,
) {
  const firstLayer = page.locator('aside button[aria-expanded]').first();
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

    const firstLayer = page.locator('aside button[aria-expanded]').first();
    await firstLayer.click();
    const secondLayer = page.locator('aside button[aria-expanded]').nth(1);
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
```

- [x] **Step 2: Run the browser test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test:e2e -- replacement-card-display-modes.spec.ts
```

Expected: FAIL because summary rows lack `aria-expanded`, and shared/persistent mode state is not wired.

- [x] **Step 3: Forward mode props through StackPanel**

Import the type in `stack-panel.tsx`:

```ts
import type { ReplacementCardDisplayMode } from
  '../../lib/replacement-card-display-mode';
```

Add to `Props` and destructuring:

```ts
replacementCardDisplayMode: ReplacementCardDisplayMode;
onReplacementCardDisplayModeChange: (
  mode: ReplacementCardDisplayMode,
) => void;
```

Pass both values to every `LayerRow`.

- [x] **Step 4: Add accessible expansion state to summary rows**

On the top-level summary button in `layer-row.tsx`, add:

```tsx
aria-expanded={expanded}
```

This exposes existing expand/collapse state without changing behavior.

- [x] **Step 5: Own and persist the preference in LayerStackHarness**

Import:

```ts
import {
  loadReplacementCardDisplayMode,
  saveReplacementCardDisplayMode,
  type ReplacementCardDisplayMode,
} from '../../lib/replacement-card-display-mode';
```

Add state beside the existing sidebar UI preferences:

```ts
const [
  replacementCardDisplayMode,
  setReplacementCardDisplayMode,
] = useState<ReplacementCardDisplayMode>(() =>
  loadReplacementCardDisplayMode(browserLocalStorage()),
);

const changeReplacementCardDisplayMode = useCallback(
  (mode: ReplacementCardDisplayMode) => {
    setReplacementCardDisplayMode(mode);
    saveReplacementCardDisplayMode(browserLocalStorage(), mode);
  },
  [],
);
```

Pass both to `StackPanel`:

```tsx
replacementCardDisplayMode={replacementCardDisplayMode}
onReplacementCardDisplayModeChange={changeReplacementCardDisplayMode}
```

- [x] **Step 6: Run focused, browser, and full web verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- replacement-card-display-mode.test.ts i18n.test.ts layer-row.test.tsx
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm --filter @lpc-toolkit/web test:e2e -- replacement-card-display-modes.spec.ts
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/web build
```

Expected: all PASS. The browser test must confirm default `overlay`, all three
card layouts, unchanged card dimensions, shared state across layers, reload
persistence, and graceful storage failures.

- [x] **Step 7: Commit and update this plan**

```bash
rtk git add packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/layer-row.tsx packages/web/e2e/replacement-card-display-modes.spec.ts
rtk git commit -m "feat(web): persist replacement card display mode"
```

- Commit: 67f6cdfbd
- Implementation: Wire state, callbacks, and localStorage persistence in harness/panel/row components, and add E2E test coverage.
- Verification: unit tests, typecheck, Playwright E2E browser tests, and production build all pass successfully.

---

## Final Review

- [x] Confirm `rtk git diff --check` passes.
- [x] Confirm `rtk git status --short` contains only expected plan-tracking changes, then commit them.
- [x] Inspect the desktop UI in the in-app browser at `http://127.0.0.1:5173/?assetSource=zip`.
- [x] Verify the segmented control retains icon and short text at both 320px and 640px sidebar widths.
- [x] Verify overlay and hidden use the full inner card height and do not stretch sprites.
- [x] Verify stacked, overlay, and hidden keep identical card dimensions and column behavior.
- [x] Verify hidden mode still exposes item names through accessible names and existing tooltips.
- [x] Verify `upstream/`, `packages/core/`, selection state, URL state, exports, and attribution are unchanged.
