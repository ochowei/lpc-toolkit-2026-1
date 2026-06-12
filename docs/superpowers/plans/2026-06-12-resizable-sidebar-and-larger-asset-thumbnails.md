# Resizable Sidebar and Larger Asset Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop layer sidebar resizable and persistent, while enlarging expanded replacement-item thumbnails from 24px to 40px.

**Architecture:** Keep width rules and storage parsing in a pure injected-dependency helper, put pointer and keyboard behavior in a focused `SidebarSplitter` component, and let `LayerStackHarness` own the preferred width plus viewport-aware rendered width. Use Vitest for pure functions and server-rendered markup, and Playwright for browser interaction, persistence, viewport constraints, and mobile behavior.

**Tech Stack:** TypeScript strict, React 18 hooks, Tailwind CSS v4, Vitest in Node environment, Playwright Chromium, pnpm workspaces. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-06-12-resizable-sidebar-and-larger-asset-thumbnails-design.md`

---

## File Structure

**Create:**

- `packages/web/src/lib/sidebar-width.ts` — constants, parsing, storage access, viewport clamping, and pointer math
- `packages/web/test/sidebar-width.test.ts` — pure helper tests
- `packages/web/src/components/layer-stack/sidebar-splitter.tsx` — vertical pointer and keyboard separator
- `packages/web/test/sidebar-splitter.test.tsx` — server-rendered accessibility contract

**Modify:**

- `packages/web/src/components/layer-stack/harness.tsx` — desktop width state, viewport tracking, persistence callbacks, and three-track layout
- `packages/web/e2e/responsive-layout.spec.ts` — drag, keyboard, reload persistence, constrained viewport, cleanup, and mobile checks
- `packages/web/src/components/layer-stack/item-thumbnail.tsx` — permit the 40px thumbnail size
- `packages/web/src/components/layer-stack/layer-row.tsx` — use 40px thumbnails and 72px cards
- `packages/web/test/layer-row.test.tsx` — verify expanded replacement-card markup

**Untouched:**

- `packages/core/**`
- `upstream/**`
- URL hash state and composition/export code
- Existing horizontal preview splitter behavior

---

### Task 1: Add Pure Sidebar Width and Persistence Rules

**Files:**

- Create: `packages/web/src/lib/sidebar-width.ts`
- Test: `packages/web/test/sidebar-width.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `packages/web/test/sidebar-width.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_PREVIEW_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_STORAGE_KEY,
  SIDEBAR_SPLITTER_WIDTH,
  clampSidebarWidth,
  computeSidebarWidthFromPointer,
  getRenderedSidebarMax,
  loadSidebarWidth,
  saveSidebarWidth,
} from '../src/lib/sidebar-width';

describe('sidebar width constants', () => {
  it('exports the approved dimensions', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(400);
    expect(MIN_SIDEBAR_WIDTH).toBe(320);
    expect(MAX_SIDEBAR_WIDTH).toBe(640);
    expect(MIN_PREVIEW_WIDTH).toBe(320);
    expect(SIDEBAR_SPLITTER_WIDTH).toBe(6);
    expect(SIDEBAR_STORAGE_KEY).toBe('lpc.sidebar-width.v1');
  });
});

describe('clampSidebarWidth', () => {
  it('keeps widths inside the active range', () => {
    expect(clampSidebarWidth(400, 640)).toBe(400);
    expect(clampSidebarWidth(320, 640)).toBe(320);
    expect(clampSidebarWidth(640, 640)).toBe(640);
  });

  it('clamps to the minimum and active maximum', () => {
    expect(clampSidebarWidth(200, 640)).toBe(320);
    expect(clampSidebarWidth(700, 640)).toBe(640);
    expect(clampSidebarWidth(600, 442)).toBe(442);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampSidebarWidth(Number.NaN, 640)).toBe(400);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY, 640)).toBe(400);
  });
});

describe('getRenderedSidebarMax', () => {
  it('reserves the splitter and at least 320px for preview', () => {
    expect(getRenderedSidebarMax(1280)).toBe(640);
    expect(getRenderedSidebarMax(900)).toBe(574);
    expect(getRenderedSidebarMax(768)).toBe(442);
  });

  it('never returns less than the sidebar minimum', () => {
    expect(getRenderedSidebarMax(600)).toBe(320);
  });
});

describe('computeSidebarWidthFromPointer', () => {
  it('converts viewport x to a sidebar width relative to the container', () => {
    expect(computeSidebarWidthFromPointer(520, 100, 640)).toBe(420);
  });

  it('clamps pointer positions to the active bounds', () => {
    expect(computeSidebarWidthFromPointer(0, 100, 640)).toBe(320);
    expect(computeSidebarWidthFromPointer(900, 100, 574)).toBe(574);
  });
});

describe('sidebar width storage', () => {
  it('loads a valid stored width', () => {
    const storage = { getItem: vi.fn(() => '512') };
    expect(loadSidebarWidth(storage)).toBe(512);
    expect(storage.getItem).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY);
  });

  it.each([null, '', 'wide', '319', '641', 'Infinity'])(
    'falls back for invalid stored value %s',
    (stored) => {
      const storage = { getItem: vi.fn(() => stored) };
      expect(loadSidebarWidth(storage)).toBe(DEFAULT_SIDEBAR_WIDTH);
    },
  );

  it('falls back when storage access throws', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    expect(loadSidebarWidth(storage)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('persists an integer width and ignores storage failures', () => {
    const setItem = vi.fn();
    saveSidebarWidth({ setItem }, 511.7);
    expect(setItem).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY, '512');

    expect(() =>
      saveSidebarWidth(
        {
          setItem: () => {
            throw new Error('blocked');
          },
        },
        400,
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- sidebar-width.test.ts
```

Expected: FAIL because `../src/lib/sidebar-width` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Create `packages/web/src/lib/sidebar-width.ts`:

```ts
export const DEFAULT_SIDEBAR_WIDTH = 400;
export const MIN_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 640;
export const MIN_PREVIEW_WIDTH = 320;
export const SIDEBAR_SPLITTER_WIDTH = 6;
export const SIDEBAR_KEYBOARD_STEP = 16;
export const SIDEBAR_STORAGE_KEY = 'lpc.sidebar-width.v1';

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage {
  setItem(key: string, value: string): void;
}

export function clampSidebarWidth(
  width: number,
  activeMax: number = MAX_SIDEBAR_WIDTH,
): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), activeMax);
}

export function getRenderedSidebarMax(viewportWidth: number): number {
  const available = viewportWidth - SIDEBAR_SPLITTER_WIDTH - MIN_PREVIEW_WIDTH;
  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, available),
  );
}

export function computeSidebarWidthFromPointer(
  pointerX: number,
  containerLeft: number,
  activeMax: number,
): number {
  return clampSidebarWidth(pointerX - containerLeft, activeMax);
}

export function loadSidebarWidth(
  storage: ReadableStorage | undefined,
): number {
  if (!storage) return DEFAULT_SIDEBAR_WIDTH;
  try {
    const raw = storage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw === null || raw.trim() === '') return DEFAULT_SIDEBAR_WIDTH;
    const width = Number(raw);
    if (
      !Number.isFinite(width) ||
      width < MIN_SIDEBAR_WIDTH ||
      width > MAX_SIDEBAR_WIDTH
    ) {
      return DEFAULT_SIDEBAR_WIDTH;
    }
    return width;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function saveSidebarWidth(
  storage: WritableStorage | undefined,
  width: number,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      SIDEBAR_STORAGE_KEY,
      String(Math.round(clampSidebarWidth(width))),
    );
  } catch {
    // Storage can be unavailable in privacy modes; resizing still works.
  }
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- sidebar-width.test.ts
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: all sidebar-width tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the pure rules**

```bash
git add packages/web/src/lib/sidebar-width.ts packages/web/test/sidebar-width.test.ts
git commit -m "feat(web): add sidebar width rules"
```

---

### Task 2: Add the Accessible Vertical Sidebar Splitter

**Files:**

- Create: `packages/web/src/components/layer-stack/sidebar-splitter.tsx`
- Create: `packages/web/test/sidebar-splitter.test.tsx`

- [ ] **Step 1: Write the failing server-rendered contract test**

Create `packages/web/test/sidebar-splitter.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SidebarSplitter } from '../src/components/layer-stack/sidebar-splitter';

describe('SidebarSplitter', () => {
  it('renders an accessible vertical separator with current bounds', () => {
    const html = renderToStaticMarkup(
      <SidebarSplitter
        value={400}
        min={320}
        max={640}
        onChange={() => {}}
        onCommit={() => {}}
        onReset={() => {}}
      />,
    );

    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-valuemin="320"');
    expect(html).toContain('aria-valuemax="640"');
    expect(html).toContain('aria-valuenow="400"');
    expect(html).toContain('aria-label="Resize sidebar"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('cursor-ew-resize');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- sidebar-splitter.test.tsx
```

Expected: FAIL because `sidebar-splitter.tsx` does not exist.

- [ ] **Step 3: Implement pointer, keyboard, reset, and cleanup behavior**

Create `packages/web/src/components/layer-stack/sidebar-splitter.tsx` with this
public contract:

```ts
export interface SidebarSplitterProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  onReset: () => void;
}
```

Implement it using the established `PreviewPaneSplitter` pattern:

```tsx
import { useCallback, useEffect, useRef } from 'react';
import {
  SIDEBAR_KEYBOARD_STEP,
  clampSidebarWidth,
  computeSidebarWidthFromPointer,
} from '../../lib/sidebar-width';

export interface SidebarSplitterProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  onReset: () => void;
}

export function SidebarSplitter({
  value,
  min,
  max,
  onChange,
  onCommit,
  onReset,
}: SidebarSplitterProps) {
  const draggingRef = useRef(false);
  const containerLeftRef = useRef(0);
  const latestWidthRef = useRef(value);

  useEffect(() => {
    latestWidthRef.current = value;
  }, [value]);

  const onMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const next = computeSidebarWidthFromPointer(
        event.clientX,
        containerLeftRef.current,
        max,
      );
      latestWidthRef.current = next;
      onChange(next);
    },
    [max, onChange],
  );

  const onUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onCommit(latestWidthRef.current);
  }, [onCommit, onMove]);

  const cleanup = useCallback(() => {
    draggingRef.current = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onMove, onUp]);

  useEffect(() => cleanup, [cleanup]);

  const commit = useCallback(
    (next: number) => {
      const clamped = clampSidebarWidth(next, max);
      latestWidthRef.current = clamped;
      onChange(clamped);
      onCommit(clamped);
    },
    [max, onChange, onCommit],
  );

  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') commit(value - SIDEBAR_KEYBOARD_STEP);
        else if (event.key === 'ArrowRight') commit(value + SIDEBAR_KEYBOARD_STEP);
        else if (event.key === 'Home') commit(min);
        else if (event.key === 'End') commit(max);
        else return;
        event.preventDefault();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        draggingRef.current = true;
        latestWidthRef.current = value;
        containerLeftRef.current =
          event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      }}
      className="group relative w-1.5 cursor-ew-resize bg-border transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
    >
      <div className="pointer-events-none absolute -inset-x-1 inset-y-0" />
    </div>
  );
}
```

Keep the implementation strict: no `any`, no dependency addition, and no
direct persistence inside the component.

- [ ] **Step 4: Run the splitter test and typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- sidebar-splitter.test.tsx
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: the SSR contract test PASSes and TypeScript reports no errors.

- [ ] **Step 5: Commit the splitter**

```bash
git add packages/web/src/components/layer-stack/sidebar-splitter.tsx packages/web/test/sidebar-splitter.test.tsx
git commit -m "feat(web): add accessible sidebar splitter"
```

---

### Task 3: Integrate Resizing, Viewport Constraints, and Persistence

**Files:**

- Modify: `packages/web/e2e/responsive-layout.spec.ts`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Replace the fixed-width desktop E2E assertion with failing resize tests**

In `packages/web/e2e/responsive-layout.spec.ts`, add:

```ts
const SIDEBAR_STORAGE_KEY = 'lpc.sidebar-width.v1';

async function sidebarWidth(page: import('@playwright/test').Page): Promise<number> {
  return page.locator('aside').first().evaluate(
    (element) => element.getBoundingClientRect().width,
  );
}
```

Replace the fixed `grid-cols-[340px_1fr]` assertions in the desktop test:

```ts
const separator = page.getByRole('separator', { name: 'Resize sidebar' });
await expect(separator).toBeVisible();
await expect(separator).toHaveAttribute('aria-valuenow', '400');
expect(await sidebarWidth(page)).toBeCloseTo(400, 0);
```

Add the following tests:

```ts
test('desktop resizes and persists the sidebar', async ({ page }) => {
  const errors = attachConsoleCollector(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?assetSource=zip');

  const separator = page.getByRole('separator', { name: 'Resize sidebar' });
  const box = await separator.boundingBox();
  if (!box) throw new Error('sidebar separator has no bounding box');

  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(520, box.y + 40);
  expect(await sidebarWidth(page)).toBeCloseTo(520, 0);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), SIDEBAR_STORAGE_KEY),
  ).toBeNull();
  await page.mouse.up();

  expect(await sidebarWidth(page)).toBeCloseTo(520, 0);
  expect(
    await page.evaluate(() => ({
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    })),
  ).toEqual({ cursor: '', userSelect: '' });
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), SIDEBAR_STORAGE_KEY),
  ).toBe('520');

  await page.reload();
  expect(await sidebarWidth(page)).toBeCloseTo(520, 0);
  await expect(
    page.getByRole('separator', { name: 'Resize sidebar' }),
  ).toHaveAttribute('aria-valuenow', '520');
  expect(errors).toEqual([]);
});

test('desktop splitter cleans up when mobile layout unmounts during drag', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?assetSource=zip');

  const separator = page.getByRole('separator', { name: 'Resize sidebar' });
  const box = await separator.boundingBox();
  if (!box) throw new Error('sidebar separator has no bounding box');

  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  expect(
    await page.evaluate(() => document.body.style.cursor),
  ).toBe('ew-resize');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(separator).toBeHidden();
  expect(
    await page.evaluate(() => ({
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    })),
  ).toEqual({ cursor: '', userSelect: '' });
});

test('desktop splitter supports keyboard bounds and reset', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?assetSource=zip');

  const separator = page.getByRole('separator', { name: 'Resize sidebar' });
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '416');
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), SIDEBAR_STORAGE_KEY),
  ).toBe('416');
  await page.keyboard.press('Home');
  await expect(separator).toHaveAttribute('aria-valuenow', '320');
  await page.keyboard.press('End');
  await expect(separator).toHaveAttribute('aria-valuenow', '640');
  await separator.dblclick();
  await expect(separator).toHaveAttribute('aria-valuenow', '400');
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), SIDEBAR_STORAGE_KEY),
  ).toBe('400');
});

test('desktop constrains the rendered width without overwriting preference', async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: SIDEBAR_STORAGE_KEY, value: '640' },
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/?assetSource=zip');

  expect(await sidebarWidth(page)).toBeCloseTo(574, 0);
  await expect(page.locator('main').first()).toBeVisible();
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), SIDEBAR_STORAGE_KEY),
  ).toBe('640');
});
```

Extend the existing mobile test with:

```ts
await expect(
  page.getByRole('separator', { name: 'Resize sidebar' }),
).toBeHidden();
```

- [ ] **Step 2: Run the responsive E2E file and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e -- responsive-layout.spec.ts
```

Expected: FAIL because the desktop separator is absent and the sidebar remains
fixed at 340px.

- [ ] **Step 3: Add desktop width state and viewport tracking to the harness**

In `packages/web/src/components/layer-stack/harness.tsx`, import:

```ts
import { SidebarSplitter } from './sidebar-splitter';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_SPLITTER_WIDTH,
  getRenderedSidebarMax,
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
} from '../../lib/sidebar-width';
```

Above `LayerStackHarness`, add a browser-only storage accessor so an exception
from the `window.localStorage` property itself is also contained:

```ts
function browserLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
```

Near the existing responsive state, add:

```ts
const [sidebarWidth, setSidebarWidth] = useState(() => {
  if (
    typeof window === 'undefined' ||
    !window.matchMedia('(min-width: 768px)').matches
  ) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  return loadSidebarWidth(browserLocalStorage());
});
const [viewportWidth, setViewportWidth] = useState(() =>
  typeof window === 'undefined' ? 1280 : window.innerWidth,
);

useEffect(() => {
  if (!isDesktop) return;
  const update = () => setViewportWidth(window.innerWidth);
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}, [isDesktop]);

const renderedSidebarMax = getRenderedSidebarMax(viewportWidth);
const renderedSidebarWidth = clampSidebarWidth(
  sidebarWidth,
  renderedSidebarMax,
);

const commitSidebarWidth = useCallback((next: number) => {
  setSidebarWidth(next);
  saveSidebarWidth(browserLocalStorage(), next);
}, []);

const resetSidebarWidth = useCallback(() => {
  setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  saveSidebarWidth(browserLocalStorage(), DEFAULT_SIDEBAR_WIDTH);
}, []);
```

Do not write the viewport-constrained `renderedSidebarWidth` during resize
effects. This preserves a saved 640px preference while a 900px viewport
temporarily renders 574px.

- [ ] **Step 4: Replace the desktop fixed grid with explicit tracks**

Replace the desktop block around the current
`grid-cols-[340px_1fr]` container with:

```tsx
<div
  className="relative grid min-h-0 flex-1"
  style={{
    gridTemplateColumns: `${renderedSidebarWidth}px ${SIDEBAR_SPLITTER_WIDTH}px minmax(0, 1fr)`,
  }}
>
  <aside className="min-h-0 overflow-hidden bg-surface">
    {stackPanel}
  </aside>
  <SidebarSplitter
    value={renderedSidebarWidth}
    min={MIN_SIDEBAR_WIDTH}
    max={renderedSidebarMax}
    onChange={setSidebarWidth}
    onCommit={commitSidebarWidth}
    onReset={resetSidebarWidth}
  />
  <main className="min-h-0 overflow-hidden bg-app">
    {previewPane}
  </main>
</div>
```

The splitter now supplies the visual border, so remove the old `border-r` from
the `aside`. Keep the mobile branch unchanged.

- [ ] **Step 5: Run focused unit, E2E, and type checks**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- sidebar-width.test.ts sidebar-splitter.test.tsx
pnpm --filter @lpc-toolkit/web test:e2e -- responsive-layout.spec.ts
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: all focused tests PASS, the selected width survives reload, a 900px
viewport renders 574px without changing the stored `640`, and mobile has no
desktop separator.

- [ ] **Step 6: Commit desktop integration**

```bash
git add packages/web/src/components/layer-stack/harness.tsx packages/web/e2e/responsive-layout.spec.ts
git commit -m "feat(web): persist resizable desktop sidebar"
```

---

### Task 4: Enlarge Expanded Replacement Asset Cards

**Files:**

- Modify: `packages/web/test/layer-row.test.tsx`
- Modify: `packages/web/src/components/layer-stack/item-thumbnail.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`

- [ ] **Step 1: Add a failing expanded-row markup test**

In `packages/web/test/layer-row.test.tsx`, add a second item so the replacement
grid is meaningful:

```ts
const hammerItem: ItemDefinition = {
  ...smashItem,
  name: 'Hammer',
  variants: ['hammer'],
};

const { catalog } = createCatalog({
  'smash.json': smashItem,
  'hammer.json': hammerItem,
});
```

Extract the repeated state into:

```ts
const state: SliceState = {
  bodyType: 'male',
  selections: {
    tools: { typeName: 'tools', name: 'Smash', variant: 'axe' },
  },
  anim: 'walk',
  dir: 'down',
  playing: false,
  zoom: 4,
};
```

Then add:

```tsx
it('uses 40px thumbnails and 72px cards in the expanded replacement grid', () => {
  const html = renderToStaticMarkup(
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
    />,
  );

  expect(html).toContain(
    'grid-cols-[repeat(auto-fill,minmax(72px,1fr))]',
  );
  expect(html.match(/width:40px;height:40px/g)).toHaveLength(2);
  expect(html).toContain('max-w-full truncate');
});
```

The server render produces thumbnail placeholders because effects do not run,
which makes their inline dimensions deterministic.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- layer-row.test.tsx
```

Expected: FAIL because the grid still uses 56px cards and 24px thumbnails.

- [ ] **Step 3: Permit and request the approved thumbnail size**

In `packages/web/src/components/layer-stack/item-thumbnail.tsx`, change:

```ts
size: 20 | 24 | 28 | 40;
```

In `packages/web/src/components/layer-stack/layer-row.tsx`, change only the
expanded replacement grid:

```tsx
<div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1">
```

and:

```tsx
<ItemThumbnail
  typeName={typeName}
  name={it.name}
  size={40}
  bodyType={state.bodyType}
  catalog={catalog}
  palettes={palettes}
/>
```

Do not change the collapsed active-layer thumbnail, which remains 28px.

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- layer-row.test.tsx
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: the expanded-grid test PASSes and TypeScript reports no errors.

- [ ] **Step 5: Commit the asset-card change**

```bash
git add packages/web/src/components/layer-stack/item-thumbnail.tsx packages/web/src/components/layer-stack/layer-row.tsx packages/web/test/layer-row.test.tsx
git commit -m "feat(web): enlarge replacement asset thumbnails"
```

---

### Task 5: Verify the Complete Feature

**Files:**

- Verify all files changed in Tasks 1-4

- [ ] **Step 1: Run the complete web unit suite**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all Vitest tests PASS.

- [ ] **Step 2: Run the responsive browser suite**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e -- responsive-layout.spec.ts
```

Expected: all responsive layout tests PASS with no collected console errors.

- [ ] **Step 3: Run strict type checking**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run the production build**

Run:

```bash
pnpm --filter @lpc-toolkit/web build
```

Expected: Vite completes a production build successfully.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~4..HEAD
```

Expected: no whitespace errors; only the planned web helper, component,
harness, tests, E2E spec, and plan/spec history are present.

- [ ] **Step 6: Commit only if verification required a corrective edit**

If verification exposed a defect, make the smallest correction, rerun the
relevant failing command plus typecheck, then commit:

```bash
git add packages/web/src/lib/sidebar-width.ts \
  packages/web/src/components/layer-stack/sidebar-splitter.tsx \
  packages/web/src/components/layer-stack/harness.tsx \
  packages/web/src/components/layer-stack/item-thumbnail.tsx \
  packages/web/src/components/layer-stack/layer-row.tsx \
  packages/web/test/sidebar-width.test.ts \
  packages/web/test/sidebar-splitter.test.tsx \
  packages/web/test/layer-row.test.tsx \
  packages/web/e2e/responsive-layout.spec.ts
git commit -m "fix(web): correct sidebar resize behavior"
```

If no corrective edit was needed, do not create an empty commit.
