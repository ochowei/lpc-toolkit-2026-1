# Web UI · Layer Stack v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a parallel "Layer Stack" UI in `packages/web` selectable via `?ui=v2`, reducing the simultaneously-visible controls of the current 3-column editor while preserving full functional parity.

**Architecture:** New `components/layer-stack/` directory with a fresh top-level `LayerStackHarness`. App.tsx switches between the existing `SliceHarness` and the new harness based on `URLSearchParams.get('ui') === 'v2'`. All data (catalog, reducer, hooks, presets, i18n, license filter, asset source, ColorPicker) is shared; only the presentation layer is new.

**Tech Stack:** React 18, TypeScript strict, Vite, Tailwind + shadcn (uses CSS variables like `--surface-2`, `--text`, `--border`, `--accent`), vitest. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-05-24-web-ui-layer-stack-v2-design.md`

**Notes on small deviations from spec:**

- The spec lists `inline-style-block.tsx` as a separate file, but the existing `ColorPicker` already handles both the variant-chip and color-swatch cases (its `colors.mode` branches on `'variants'` vs `'recolors'`). Adding a wrapper is speculative abstraction — we use `ColorPicker` directly in `layer-row.tsx`. The same DOM block is shipped; just one fewer file.
- The spec hypothesises a possible new `apply_preset` reducer action and a `computeSkippedItems` helper. Neither is needed: `computePresetSelection` already returns `{ selections, skipped }`, and the current code dispatches `apply_selections` with the computed selections. The plan reuses both verbatim.
- **Loading progress** is rendered as a small badge inside the preview area (not the top bar). `useComposedCharacter` returns `{ status, progress }`, and it already runs inside `PreviewPane`. Lifting it to the harness only to thread the value back into the top bar would be plumbing for plumbing's sake.
- **Export button** is omitted from this plan. The current codebase has no export pipeline (`SliceHarness` has none either). The spec listed it as "sustain existing flow" — there's no existing flow to sustain. Adding one is a separate feature, tracked outside this plan.

---

## File Structure

**Create:**
- `packages/web/src/lib/should-use-v2.ts` — URL-routing helper
- `packages/web/test/should-use-v2.test.ts` — unit test for above
- `packages/web/src/components/layer-stack/harness.tsx`
- `packages/web/src/components/layer-stack/top-bar.tsx`
- `packages/web/src/components/layer-stack/stack-panel.tsx`
- `packages/web/src/components/layer-stack/layer-row.tsx`
- `packages/web/src/components/layer-stack/add-layer.tsx`
- `packages/web/src/components/layer-stack/preset-chips.tsx`
- `packages/web/src/components/layer-stack/status-toast.tsx`
- `packages/web/src/components/layer-stack/settings-collapsible.tsx`
- `packages/web/src/components/layer-stack/preview-pane.tsx`
- `packages/web/src/components/layer-stack/popovers/use-popover.ts` — shared anchor + outside-click hook
- `packages/web/src/components/layer-stack/popovers/body-type-popover.tsx`
- `packages/web/src/components/layer-stack/popovers/token-popover.tsx`
- `packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx`
- `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`

**Modify:**
- `packages/web/src/App.tsx` — route to LayerStackHarness when `?ui=v2`
- `packages/web/src/i18n.ts` — add ~10 new translation keys

**Do not touch:**
- `packages/core/**` — zero changes
- `packages/web/src/components/slice-harness.tsx` — zero changes
- `packages/web/src/components/selected-items-panel.tsx`, `color-picker.tsx`, `ui/**` — read & reuse only
- `packages/web/src/slice/**`, `hooks/**`, `catalog/**`, `presets*.ts`, `adapter/**`

---

## Task 1: Set up worktree

**Files:** none yet (workspace setup only).

- [ ] **Step 1: Create an isolated worktree using `superpowers:using-git-worktrees`**

Branch suggestion: `layer-stack-v2`. The remainder of the plan assumes the working directory is the worktree root.

---

## Task 2: `shouldUseV2` URL helper (TDD)

Pure function that takes a URL search string and returns `true` only when `ui === 'v2'`. Used by `App.tsx` and easily unit-tested without DOM.

**Files:**
- Create: `packages/web/src/lib/should-use-v2.ts`
- Test: `packages/web/test/should-use-v2.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/test/should-use-v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldUseV2 } from '../src/lib/should-use-v2';

describe('shouldUseV2', () => {
  it('returns true only when ui=v2', () => {
    expect(shouldUseV2('?ui=v2')).toBe(true);
    expect(shouldUseV2('ui=v2')).toBe(true);
  });

  it('treats anything else as v1 (safe default)', () => {
    expect(shouldUseV2('')).toBe(false);
    expect(shouldUseV2('?ui=v1')).toBe(false);
    expect(shouldUseV2('?ui=anything')).toBe(false);
    expect(shouldUseV2('?other=v2')).toBe(false);
  });

  it('is case-sensitive on the value', () => {
    expect(shouldUseV2('?ui=V2')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/web test should-use-v2
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`packages/web/src/lib/should-use-v2.ts`:

```ts
export function shouldUseV2(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('ui') === 'v2';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @lpc-toolkit/web test should-use-v2
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/should-use-v2.ts packages/web/test/should-use-v2.test.ts
git commit -m "feat(web): add shouldUseV2 URL routing helper"
```

---

## Task 3: i18n keys for v2

Add the new translation keys. Both `en` and `zh-TW` are required (the existing TRANSLATIONS shape enforces this via TypeScript).

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Inspect TRANSLATIONS structure**

Open `packages/web/src/i18n.ts`. The `en` block ends near the top of the file; the `zh-TW` block mirrors every key. Find the end of `en`’s object literal and the matching position in `zh-TW`.

- [ ] **Step 2: Add the new English keys**

Append inside the `en: {...}` block (alphabetical order is fine; matching position helps):

```ts
    'layers.title': 'Your layers',
    'layers.on': 'on',
    'layers.off': 'off',
    'add.button': 'Add layer',
    'add.available': 'available',
    'add.search': 'Search all assets',
    'preset.skipPreview': 'Skips {n}',
    'preset.applied.skipped': 'Applied {name} (skipped: {names}).',
    'filters.title': 'Filters & source',
    'status.loading': 'Loading',
    'reset.scope.filters': 'Filters',
    'token.copy': 'Copy',
    'token.paste': 'Paste & apply',
    'token.placeholder': 'Paste token here…',
    'attribution.title': 'Attribution',
    'attribution.exceededShort': 'License exceeded',
    'bodyType.title': 'Body type',
    'common.close': 'Close',
```

- [ ] **Step 3: Add the matching Traditional Chinese keys**

In the `'zh-TW': {...}` block, add the same keys with translations:

```ts
    'layers.title': '你的圖層',
    'layers.on': '已開',
    'layers.off': '未開',
    'add.button': '加圖層',
    'add.available': '可選',
    'add.search': '搜尋全部資產',
    'preset.skipPreview': '會略過 {n} 項',
    'preset.applied.skipped': '已套用 {name}（略過：{names}）。',
    'filters.title': '篩選與來源',
    'status.loading': '載入中',
    'reset.scope.filters': '篩選器',
    'token.copy': '複製',
    'token.paste': '貼上並套用',
    'token.placeholder': '在此貼上 token…',
    'attribution.title': '來源標註',
    'attribution.exceededShort': '超出授權限制',
    'bodyType.title': '體型',
    'common.close': '關閉',
```

- [ ] **Step 4: Typecheck and run tests**

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/web test
```

Expected: both pass. `TranslationKey` updates automatically from the literal keys.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): add i18n keys for layer-stack v2"
```

---

## Task 4: Route `?ui=v2` in App.tsx

Modify `App.tsx` to render the new harness when the URL says so. Until Task 5 lands, this returns a placeholder `<div>` — the route plumbing comes first so subsequent tasks can iterate in-browser.

**Files:**
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/components/layer-stack/harness.tsx` (placeholder)

- [ ] **Step 1: Create a minimal harness placeholder**

`packages/web/src/components/layer-stack/harness.tsx`:

```tsx
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Locale, Translator, LabelTranslator } from '../../i18n';
import type { AssetSource } from '../../adapter/asset-source';

export interface LayerStackHarnessProps {
  catalog: Catalog;
  palettes: PaletteMetadata;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  locale: Locale;
  assetSource: AssetSource;
  t: Translator;
  tl: LabelTranslator;
  onAssetSourceChange: (source: AssetSource) => void;
  onReset: (scopes: { outfit: boolean; view: boolean }) => void;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}

export function LayerStackHarness(_props: LayerStackHarnessProps) {
  return (
    <div className="lpc dark p-6 text-text">
      <h1 className="text-lg font-semibold">Layer Stack v2 (placeholder)</h1>
      <p className="text-text-mute text-sm">Wired in. Implementation lands in later tasks.</p>
    </div>
  );
}
```

- [ ] **Step 2: Switch App.tsx based on `shouldUseV2`**

Open `packages/web/src/App.tsx`. Add the import and replace the `return <SliceHarness ... />` block so it conditionally renders the new harness with the **same props** passed identically. Keep `document.documentElement.className = ...` exactly as today.

```tsx
// add to imports
import { shouldUseV2 } from './lib/should-use-v2';
import { LayerStackHarness } from './components/layer-stack/harness';
```

Replace the existing `return (...)` with:

```tsx
  const useV2 = shouldUseV2(window.location.search);
  const Harness = useV2 ? LayerStackHarness : SliceHarness;

  return (
    <Harness
      catalog={init.catalog}
      palettes={init.palettes}
      shownTypeNames={init.shownTypeNames}
      state={state}
      dispatch={dispatch}
      theme={theme}
      locale={locale}
      assetSource={assetSource}
      t={t}
      tl={tl}
      onAssetSourceChange={setAssetSource}
      onReset={handleReset}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      onToggleLocale={() =>
        setLocale((current) => (current === 'en' ? 'zh-TW' : 'en'))
      }
    />
  );
```

- [ ] **Step 3: Run dev server and manually verify**

```bash
pnpm --filter @lpc-toolkit/web dev
```

- Open `http://localhost:5173/` — should render current `SliceHarness` exactly as before.
- Open `http://localhost:5173/?ui=v2` — should render the "Layer Stack v2 (placeholder)" text.

- [ ] **Step 4: Typecheck and run tests**

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/web test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): route ?ui=v2 to LayerStackHarness placeholder"
```

---

## Task 5: Harness layout shell + minimal TopBar

Replace the placeholder body with the real two-column layout (top bar + flex row: 340px sidebar + 1fr preview). Stub the side panel and preview so subsequent tasks can fill them in. The TopBar gets the locale and theme toggles wired (the easiest two).

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Create: `packages/web/src/components/layer-stack/top-bar.tsx`

- [ ] **Step 1: Build the TopBar component**

`packages/web/src/components/layer-stack/top-bar.tsx`:

```tsx
import type { PropsWithChildren } from 'react';
import { Button } from '../ui/button';
import type { Translator } from '../../i18n';

interface Props {
  t: Translator;
  theme: 'dark' | 'light';
  locale: 'en' | 'zh-TW';
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}

export function TopBar({
  t,
  theme,
  locale,
  onToggleTheme,
  onToggleLocale,
  children,
}: PropsWithChildren<Props>) {
  return (
    <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-xs">
      {children /* slots for BodyType pill, popovers, attribution */}
      <div className="flex-1" />
      <Button size="sm" variant="ghost" onClick={onToggleLocale}>
        {locale === 'en' ? '中文' : 'EN'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onToggleTheme} aria-label="toggle theme">
        {theme === 'dark' ? '☀' : '☾'}
      </Button>
    </header>
  );
}
```

- [ ] **Step 2: Rewrite harness to use the shell**

`packages/web/src/components/layer-stack/harness.tsx` (replace placeholder body, keep the props interface):

```tsx
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Locale, Translator, LabelTranslator } from '../../i18n';
import type { AssetSource } from '../../adapter/asset-source';
import { TopBar } from './top-bar';

export interface LayerStackHarnessProps {
  catalog: Catalog;
  palettes: PaletteMetadata;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  locale: Locale;
  assetSource: AssetSource;
  t: Translator;
  tl: LabelTranslator;
  onAssetSourceChange: (source: AssetSource) => void;
  onReset: (scopes: { outfit: boolean; view: boolean }) => void;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}

export function LayerStackHarness(props: LayerStackHarnessProps) {
  const { t, theme, locale, onToggleTheme, onToggleLocale } = props;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-app text-text">
      <TopBar
        t={t}
        theme={theme}
        locale={locale}
        onToggleTheme={onToggleTheme}
        onToggleLocale={onToggleLocale}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">
        <aside className="border-r border-border bg-surface">
          {/* StackPanel — Task 7 */}
          <div className="p-4 text-xs text-text-mute">stack-panel placeholder</div>
        </aside>
        <main className="bg-bg-app">
          {/* PreviewPane — Task 6 */}
          <div className="p-4 text-xs text-text-mute">preview-pane placeholder</div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

Restart `pnpm --filter @lpc-toolkit/web dev`. Open `?ui=v2`:

- Top bar visible with EN/中文 + theme toggles (right side).
- Clicking 中文/EN toggles language; clicking ☾/☀ toggles theme — both should work because the parent App holds those states.
- Body has a 340px left column and a flex right column with placeholder text.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/top-bar.tsx
git commit -m "feat(web): layer-stack harness shell + minimal top bar"
```

---

## Task 6: Preview pane (canvas + zoom + direction + animation)

Render the character, expose direction/animation/playback/zoom controls. Reuses `useComposedCharacter`, `useAnimationPlayer`, `ANIMATION_CONFIGS`, and `MIN_ZOOM`/`MAX_ZOOM` exactly like the current slice-harness.

**Files:**
- Create: `packages/web/src/components/layer-stack/preview-pane.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Read the wheel-zoom pattern in `slice-harness.tsx`**

Open `packages/web/src/components/slice-harness.tsx`. Find the `useEffect` that adds the `wheel` listener (search for `'wheel'`) and the canvas / direction / animation rendering blocks. The plan reuses the same hooks; copying the wheel pattern keeps Ctrl/⌘+wheel zoom consistent.

- [ ] **Step 2: Implement `preview-pane.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { ANIMATION_CONFIGS, type Direction } from '@lpc-toolkit/core';
import { useComposedCharacter } from '../../hooks/use-composed-character';
import { useAnimationPlayer } from '../../hooks/use-animation-player';
import { MIN_ZOOM, MAX_ZOOM, type SliceAction, type SliceState } from '../../slice/selection';
import type { AssetSource } from '../../adapter/asset-source';
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import { Button } from '../ui/button';

const DIR_LABEL: Record<Direction, string> = { up: '↑', left: '←', down: '↓', right: '→' };

interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  assetSource: AssetSource;
}

export function PreviewPane({ catalog, palettes, state, dispatch, assetSource }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(state.zoom);
  useEffect(() => {
    zoomRef.current = state.zoom;
  }, [state.zoom]);

  const result = useComposedCharacter(catalog, palettes, state, assetSource);
  useAnimationPlayer(canvasRef, result.animation, state.dir, state.playing, state.zoom);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      dispatch({ type: 'set_zoom', zoom: zoomRef.current + delta });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dispatch]);

  return (
    <div ref={previewRef} className="relative flex h-full min-h-0 flex-col">
      <div className="relative flex-1 overflow-hidden">
        <div className="flex h-full items-center justify-center">
          <canvas ref={canvasRef} className="image-render-pixel" />
        </div>
        <div className="absolute top-3 right-3 flex gap-1">
          <Button size="sm" variant="default"
            disabled={state.zoom <= MIN_ZOOM}
            onClick={() => dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })}
            aria-label="zoom out">−</Button>
          <span className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-text-mute">
            {state.zoom * 100}%
          </span>
          <Button size="sm" variant="default"
            disabled={state.zoom >= MAX_ZOOM}
            onClick={() => dispatch({ type: 'set_zoom', zoom: state.zoom + 1 })}
            aria-label="zoom in">+</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-surface px-3 py-2 text-xs">
        <div className="grid grid-cols-2 gap-0.5">
          <Button size="sm" variant={state.dir === 'up' ? 'primary' : 'ghost'}
            className="col-span-2 w-6 px-0"
            onClick={() => dispatch({ type: 'set_dir', dir: 'up' })}>{DIR_LABEL.up}</Button>
          <Button size="sm" variant={state.dir === 'left' ? 'primary' : 'ghost'}
            className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'left' })}>{DIR_LABEL.left}</Button>
          <Button size="sm" variant={state.dir === 'right' ? 'primary' : 'ghost'}
            className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'right' })}>{DIR_LABEL.right}</Button>
          <Button size="sm" variant={state.dir === 'down' ? 'primary' : 'ghost'}
            className="col-span-2 w-6 px-0"
            onClick={() => dispatch({ type: 'set_dir', dir: 'down' })}>{DIR_LABEL.down}</Button>
        </div>

        <select className="rounded-md border border-border bg-surface-2 px-2 py-1"
          value={state.anim}
          onChange={(e) => dispatch({ type: 'set_anim', anim: e.target.value as typeof state.anim })}>
          {Object.keys(ANIMATION_CONFIGS).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'toggle_play' })}>
          {state.playing ? '⏸' : '▶'}
        </Button>

        {result.status === 'loading' && (
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-text-mute">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Loading {Math.round(result.progress * 100)}%
          </span>
        )}
        {result.status !== 'loading' && (
          <span className="ml-auto font-mono text-[10px] text-text-mute">zoom {state.zoom}×</span>
        )}
      </div>
    </div>
  );
}
```

> Tailwind note: the codebase uses CSS-variable-backed utilities like `bg-bg-app`, `text-text`, `border-border`, `bg-surface`, `bg-surface-2`. These come from the existing Tailwind theme — same names as in `slice-harness.tsx`.

- [ ] **Step 3: Wire into harness**

In `harness.tsx`, replace the preview placeholder. Replace:

```tsx
<main className="bg-bg-app">
  <div className="p-4 text-xs text-text-mute">preview-pane placeholder</div>
</main>
```

with:

```tsx
import { PreviewPane } from './preview-pane';
// ... inside JSX:
<main className="bg-bg-app">
  <PreviewPane
    catalog={props.catalog}
    palettes={props.palettes}
    state={props.state}
    dispatch={props.dispatch}
    assetSource={props.assetSource}
  />
</main>
```

- [ ] **Step 4: Manually verify on `?ui=v2`**

- Character renders.
- ↑/←/↓/→ buttons switch direction (highlight follows).
- Animation dropdown switches animations.
- ▶/⏸ toggles playback.
- Zoom −/+ buttons clamp at 1× / 8×; Ctrl/⌘+wheel inside the preview area zooms.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): layer-stack preview pane with zoom/direction/animation"
```

---

## Task 7: StackPanel skeleton

The left column: shows preset chips row at the top, a status-toast slot, the active-layer list (empty for now — Task 8 fills it), and an "Add layer" pill at the bottom of the list. Sub-components for Preset chips and Status toast come in Tasks 11 and 12 respectively; for now keep them as placeholders.

**Files:**
- Create: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Implement `stack-panel.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { Catalog, TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator, LabelTranslator } from '../../i18n';

interface Props {
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  shownTypeNames: string[];
  t: Translator;
  tl: LabelTranslator;
}

export function StackPanel({ catalog, state, shownTypeNames, t, tl }: Props) {
  const [expanded, setExpanded] = useState<TypeName | null>(null);
  const [adding, setAdding] = useState(false);

  const active = useMemo(
    () => shownTypeNames.filter((tn) => state.selections[tn] != null),
    [shownTypeNames, state.selections],
  );
  const inactive = useMemo(
    () => shownTypeNames.filter((tn) => state.selections[tn] == null),
    [shownTypeNames, state.selections],
  );

  // Spec edge case: body-type change can leave `expanded` pointing at a
  // type that no longer has a selection. Reset to null when that happens.
  useEffect(() => {
    if (expanded && !active.includes(expanded)) setExpanded(null);
  }, [expanded, active]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Task 11: <PresetChips /> */}
      <div className="border-b border-border bg-bg-app px-3 py-2 text-[10px] uppercase tracking-wide text-text-mute">
        Presets (placeholder)
      </div>

      {/* Task 12: <StatusToast /> */}

      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text">
          {t('layers.title')}
        </span>
        <span className="font-mono text-[10px] text-text-mute">
          {active.length} {t('layers.on')} · {inactive.length} {t('layers.off')}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {/* Task 8/9: active rows */}
        {active.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-text-mute">No layers yet.</div>
        ) : (
          active.map((tn) => (
            <div key={tn} className="px-2 py-1 text-[12px]">
              {tl(`label.${tn}` as never) || tn}
            </div>
          ))
        )}

        {/* Task 10: AddLayer */}
        <button
          onClick={() => setAdding((a) => !a)}
          className="mt-2 mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
        >
          <span>＋</span>
          <span>{t('add.button')}</span>
          <span className="ml-auto font-mono text-[10px]">
            {inactive.length} {t('add.available')}
          </span>
        </button>
      </div>

      {/* Task 17: <SettingsCollapsible /> */}
      <div className="border-t border-border bg-bg-app px-3 py-2 text-[10px] uppercase tracking-wide text-text-mute">
        {t('filters.title')} (placeholder)
      </div>

      {/* Use the state stubs so TS doesn't complain about unused */}
      <span className="hidden" data-expanded={String(expanded)} data-adding={String(adding)} />
    </div>
  );
}
```

- [ ] **Step 2: Wire StackPanel into harness**

In `harness.tsx`, replace the aside placeholder:

```tsx
import { StackPanel } from './stack-panel';
// ...
<aside className="border-r border-border bg-surface">
  <StackPanel
    catalog={props.catalog}
    state={props.state}
    dispatch={props.dispatch}
    shownTypeNames={props.shownTypeNames}
    t={props.t}
    tl={props.tl}
  />
</aside>
```

- [ ] **Step 3: Manually verify**

`?ui=v2` shows:
- Preset placeholder strip at top of left column.
- "Your layers · N on · M off" header.
- Plain text list of active layer type names.
- Add layer pill at bottom.
- Filters placeholder at very bottom of left column.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): layer-stack panel skeleton"
```

---

## Task 8: LayerRow collapsed display

Replace the plain-text list in StackPanel with a clickable row showing label + current item name + remove button. Expansion (the swap grid + style block) comes in Task 9.

**Files:**
- Create: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`

- [ ] **Step 1: Implement `layer-row.tsx`**

```tsx
import type { Catalog, ItemDefinition, TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { LabelTranslator } from '../../i18n';

interface Props {
  typeName: TypeName;
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  expanded: boolean;
  onToggle: () => void;
}

export function LayerRow({ typeName, catalog, state, dispatch, tl, expanded, onToggle }: Props) {
  const selection = state.selections[typeName];
  if (!selection) return null;

  const item: ItemDefinition | undefined = (catalog.byTypeName.get(typeName) ?? []).find(
    (d) => d.name === selection.name,
  );

  return (
    <div
      className={`mb-1 rounded-md border ${
        expanded ? 'border-border bg-bg-app' : 'border-transparent'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
      >
        <div className="h-7 w-7 shrink-0 rounded bg-surface-2" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-text">
            {item ? tl(`item.${typeName}.${item.name}` as never) || item.name : selection.name}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-text-mute">
            {tl(`label.${typeName}` as never) || typeName}
            {selection.variant ? ` · ${selection.variant}` : ''}
          </div>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'clear', typeName });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              dispatch({ type: 'clear', typeName });
            }
          }}
          className="rounded p-1 text-text-mute hover:bg-surface-3 hover:text-danger"
          aria-label={`Clear ${typeName}`}
        >
          ✕
        </span>
        <span className="text-[10px] text-text-mute">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2">
          {/* Swap grid + ColorPicker — Task 9 */}
          <div className="text-[10px] text-text-mute">Expanded content lands in Task 9.</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use `LayerRow` in StackPanel**

In `stack-panel.tsx`, replace the placeholder list:

```tsx
import { LayerRow } from './layer-row';
// ...
{active.map((tn) => (
  <LayerRow
    key={tn}
    typeName={tn}
    catalog={catalog}
    state={state}
    dispatch={dispatch}
    tl={tl}
    expanded={expanded === tn}
    onToggle={() => setExpanded(expanded === tn ? null : tn)}
  />
))}
```

Remove the local `<div>` rendering of `tn`.

- [ ] **Step 3: Add the missing `dispatch` prop**

The new `LayerRow` needs `dispatch`, which `StackPanel` already accepts. Good — no signature change required.

- [ ] **Step 4: Manually verify**

`?ui=v2`:
- Each active layer is a row with a small thumbnail box, label, item name.
- Clicking a row toggles a "Expanded content lands in Task 9" indicator.
- Clicking ✕ removes the layer (it disappears from active list and the inactive count goes up).

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/layer-row.tsx packages/web/src/components/layer-stack/stack-panel.tsx
git commit -m "feat(web): layer-stack collapsed layer rows + clear action"
```

---

## Task 9: LayerRow expanded content (swap grid + ColorPicker)

When a row is expanded, show a tile grid of all items in that type, with `itemSupportsBodyType` dimming and `licenseExceedsFilter` warnings. Below the grid, the existing `ColorPicker` handles both variant and recolor styles.

**Files:**
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx` (license filter prop pass-through — placeholder until Task 17, accept `null` for now)

- [ ] **Step 1: Extend `LayerRow` props with `palettes` and `licenseFilter`**

Update the `Props` interface and component signature:

```tsx
import type { PaletteMetadata } from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { licenseExceedsFilter, type LicenseFilter } from '../../slice/license-filter';
import { ColorPicker } from '../color-picker';
import { selectionForItem } from '../../slice/selection';

interface Props {
  typeName: TypeName;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  licenseFilter: LicenseFilter;
  expanded: boolean;
  onToggle: () => void;
}
```

- [ ] **Step 2: Render the swap grid + ColorPicker inside the `expanded` branch**

Replace the placeholder expanded block:

```tsx
{expanded && item && (() => {
  const items = catalog.byTypeName.get(typeName) ?? [];
  return (
    <div className="px-2 pb-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">
        Swap {typeName}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1">
        {items.map((it) => {
          const supports = itemSupportsBodyType(it, state.bodyType);
          const exceeds = licenseExceedsFilter(it.license, licenseFilter);
          const isSelected = it.name === item.name;
          return (
            <button
              key={it.name}
              type="button"
              disabled={!supports}
              title={
                !supports ? 'incompatible body type' :
                exceeds ? `exceeds license filter ${licenseFilter ?? ''}` :
                `${it.name} · ${it.license}`
              }
              onClick={() => dispatch({ type: 'pick', typeName, name: it.name })}
              className={[
                'relative flex flex-col items-center gap-1 rounded-md border p-1 text-[10px]',
                isSelected ? 'border-accent bg-accent/10 text-text' : 'border-border bg-surface-2 text-text-2',
                !supports ? 'opacity-30 cursor-not-allowed' : '',
                exceeds && supports ? 'opacity-60' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="h-7 w-7 rounded bg-surface" aria-hidden />
              <span className="max-w-full truncate">{it.name}</span>
              {exceeds && supports && (
                <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-[8px] text-white" aria-label="exceeds license filter">!</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
        <ColorPicker
          item={item}
          selection={selection}
          palettes={palettes}
          colorLabel="Style"
          onSelect={(change) => {
            if ('variant' in change) {
              dispatch({ type: 'pick', typeName, name: item.name, variant: change.variant });
            } else {
              dispatch({ type: 'pick', typeName, name: item.name, recolor: change.recolor });
            }
          }}
        />
      </div>
    </div>
  );
})()}
```

- [ ] **Step 3: Update `StackPanel` to pass `palettes` and `licenseFilter`**

In `stack-panel.tsx`, accept and forward the new props:

```tsx
interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  shownTypeNames: string[];
  licenseFilter: LicenseFilter;     // import { LicenseFilter } from '../../slice/license-filter';
  t: Translator;
  tl: LabelTranslator;
}
```

Forward in the LayerRow call:

```tsx
<LayerRow
  key={tn}
  typeName={tn}
  catalog={catalog}
  palettes={palettes}
  state={state}
  dispatch={dispatch}
  tl={tl}
  licenseFilter={licenseFilter}
  expanded={expanded === tn}
  onToggle={() => setExpanded(expanded === tn ? null : tn)}
/>
```

- [ ] **Step 4: Pass `palettes` and `licenseFilter` from harness**

In `harness.tsx`, hold a local `licenseFilter` state and pass both:

```tsx
import { useState } from 'react';
import type { LicenseFilter } from '../../slice/license-filter';
// inside LayerStackHarness:
const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(null);
// pass into StackPanel:
<StackPanel
  catalog={props.catalog}
  palettes={props.palettes}
  state={props.state}
  dispatch={props.dispatch}
  shownTypeNames={props.shownTypeNames}
  licenseFilter={licenseFilter}
  t={props.t}
  tl={props.tl}
/>
```

`setLicenseFilter` will be wired in Task 17.

- [ ] **Step 5: Manually verify**

`?ui=v2`:
- Click a row → grid of all items in that type appears, current selection highlighted with accent ring.
- Click a tile → preview updates with new item.
- Variant/colour controls below the grid work via ColorPicker (try a body type with skin variants, or a clothing type with recolor swatches).
- Switching to a body type that the row's item doesn't support → grid tiles for incompatible items appear faded and unclickable.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/layer-stack/layer-row.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): expanded swap grid + inline style block per layer row"
```

---

## Task 10: AddLayer expanded picker

When the user clicks the "+ Add layer" pill, expand to show a grouped picker of inactive types. Picking a type creates the first available item in that type (the catalog's first entry) and auto-expands the new row.

For grouping, we use `LICENSE_CONFIG`-style super-groups built locally; alternatively, group by the order returned by `pickInitialSelections` / `shownTypeNames`. For simplicity, this plan groups by the **first letter of the typeName** as a placeholder grouping — replace with the upstream-defined super-groups in a follow-up if needed.

> Trade-off: the spec mentions "5 super-groups" derived from the upstream category structure. We don't have a ready-made grouping object exported from core. To stay focused, this plan ships a single ungrouped list with a search box. If grouping becomes a usability blocker, follow up with a `superGroup` map.

**Files:**
- Create: `packages/web/src/components/layer-stack/add-layer.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`

- [ ] **Step 1: Implement `add-layer.tsx`**

```tsx
import { useState } from 'react';
import type { Catalog, TypeName } from '@lpc-toolkit/core';
import type { SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';

interface Props {
  catalog: Catalog;
  dispatch: (a: SliceAction) => void;
  inactive: TypeName[];
  t: Translator;
  tl: LabelTranslator;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onAdded: (tn: TypeName) => void;
}

export function AddLayer({ catalog, dispatch, inactive, t, tl, adding, setAdding, onAdded }: Props) {
  const [query, setQuery] = useState('');

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
      >
        <span>＋</span>
        <span>{t('add.button')}</span>
        <span className="ml-auto font-mono text-[10px]">
          {inactive.length} {t('add.available')}
        </span>
      </button>
    );
  }

  const filtered = inactive.filter((tn) => {
    if (!query) return true;
    const label = (tl(`label.${tn}` as never) || tn).toLowerCase();
    return label.includes(query.toLowerCase());
  });

  return (
    <div className="mt-2 mb-2 rounded-md border border-border bg-bg-app p-2">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-[11px]"
        />
        <button
          type="button"
          onClick={() => { setAdding(false); setQuery(''); }}
          className="rounded px-2 py-1 text-[11px] text-text-mute hover:bg-surface-2"
        >
          {t('common.close')}
        </button>
      </div>
      <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto">
        {filtered.map((tn) => {
          const first = catalog.byTypeName.get(tn)?.[0];
          return (
            <button
              key={tn}
              type="button"
              disabled={!first}
              onClick={() => {
                if (!first) return;
                dispatch({ type: 'pick', typeName: tn, name: first.name });
                setAdding(false);
                setQuery('');
                onAdded(tn);
              }}
              className="flex items-center justify-between rounded border border-border bg-surface-2 px-2 py-1 text-left text-[11px] hover:bg-surface-3"
            >
              <span>{tl(`label.${tn}` as never) || tn}</span>
              <span className="text-text-mute">{first?.name ?? '—'}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-text-mute">No matches.</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Use `AddLayer` in StackPanel**

In `stack-panel.tsx`, replace the inline `<button onClick={() => setAdding...}>` with:

```tsx
<AddLayer
  catalog={catalog}
  dispatch={dispatch}
  inactive={inactive}
  t={t}
  tl={tl}
  adding={adding}
  setAdding={setAdding}
  onAdded={(tn) => setExpanded(tn)}
/>
```

Add the import at the top.

- [ ] **Step 3: Manually verify**

`?ui=v2`:
- Click Add layer → it expands to a filter input + list of inactive type names.
- Typing in the filter narrows the list.
- Clicking an item adds it to the active list and auto-expands the new row.
- "Close" collapses the picker without changes.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/add-layer.tsx packages/web/src/components/layer-stack/stack-panel.tsx
git commit -m "feat(web): layer-stack add-layer expanded picker"
```

---

## Task 11: Preset chips with skip preview

Render the six presets as chips. On click, compute the new selections via `computePresetSelection` and dispatch `apply_selections` (mirroring the slice-harness pattern). When a preset would skip items for the current body type, chip is rendered with reduced opacity + warning icon + tooltip listing the count.

**Files:**
- Create: `packages/web/src/components/layer-stack/preset-chips.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`

- [ ] **Step 1: Implement `preset-chips.tsx`**

```tsx
import type { Catalog } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator } from '../../i18n';
import { PRESETS, type Preset } from '../../presets';
import { computePresetSelection } from '../../presets-apply';

interface Props {
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

export function PresetChips({ catalog, state, dispatch, t, onApplied }: Props) {
  return (
    <div className="border-b border-border bg-bg-app px-3 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
        {t('preset.title')}
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset: Preset) => {
          const preview = computePresetSelection(preset, state.selections, state.bodyType, catalog);
          const willSkip = preview.skipped.length;
          const label = t(preset.labelKey);
          return (
            <button
              key={preset.id}
              type="button"
              title={willSkip ? `${label} — ${t('preset.skipPreview').replace('{n}', String(willSkip))}` : label}
              onClick={() => {
                dispatch({
                  type: 'apply_selections',
                  selections: { bodyType: state.bodyType, items: preview.selections },
                });
                onApplied(
                  label,
                  willSkip,
                  preview.skipped.map((s) => s.typeName),
                );
              }}
              className={`inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] hover:bg-surface-3 ${
                willSkip ? 'opacity-70' : ''
              }`}
            >
              <span>{preset.emoji}</span>
              <span>{label}</span>
              {willSkip > 0 && <span className="text-warning">⚠</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Use it in StackPanel**

Replace the Preset placeholder strip in `stack-panel.tsx` with:

```tsx
<PresetChips
  catalog={catalog}
  state={state}
  dispatch={dispatch}
  t={t}
  onApplied={onPresetApplied}
/>
```

Add the new `onPresetApplied` prop to StackPanel's interface:

```tsx
onPresetApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
```

And forward it from `harness.tsx`. In `harness.tsx`, define a no-op for now (Task 12 wires it to the status toast):

```tsx
const handlePresetApplied = (_name: string, _n: number, _types: string[]) => {};
// ...
<StackPanel ... onPresetApplied={handlePresetApplied} />
```

- [ ] **Step 3: Manually verify**

`?ui=v2`:
- Six preset chips visible at top of left column with emoji + name.
- Clicking a preset replaces all clothing layers; personal-appearance layers untouched.
- Switching body type to `child` (you can do this temporarily via the dev-tools at `state.bodyType` until Task 13 — or by editing the App.tsx initial state, then revert) makes some chips appear faded with a ⚠. Hover tooltip says "Skips N".

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/preset-chips.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): layer-stack preset chips with skip preview"
```

---

## Task 12: Status toast

Centralised toast with `kind: info | warn` styling. State lives in `harness.tsx`; auto-clears after 4 seconds.

**Files:**
- Create: `packages/web/src/components/layer-stack/status-toast.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`

- [ ] **Step 1: Implement `status-toast.tsx`**

```tsx
interface Props {
  status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
}

export function StatusToast({ status }: Props) {
  if (!status) return null;
  const ring =
    status.kind === 'warn' ? 'border-warning text-warning'
    : status.kind === 'error' ? 'border-danger text-danger'
    : 'border-border text-text';
  return (
    <div className={`mx-3 mt-2 rounded-md border bg-surface-2 px-2 py-1 text-[11px] ${ring}`} role="status">
      {status.text}
    </div>
  );
}
```

- [ ] **Step 2: Add status state + auto-clear in harness**

In `harness.tsx`:

```tsx
const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
useEffect(() => {
  if (!status) return;
  const id = setTimeout(() => setStatus(null), 4000);
  return () => clearTimeout(id);
}, [status]);
```

Replace the previous `handlePresetApplied`:

```tsx
const handlePresetApplied = (name: string, skippedCount: number, skippedTypes: string[]) => {
  if (skippedCount === 0) {
    setStatus({ kind: 'info', text: `${props.t('preset.applied')} ${name}` });
  } else {
    const names = skippedTypes
      .map((tn) => props.tl(`label.${tn}` as never) || tn)
      .join(', ');
    const msg = props.t('preset.applied.skipped')
      .replace('{name}', name)
      .replace('{names}', names);
    setStatus({ kind: 'warn', text: msg });
  }
};
```

- [ ] **Step 3: Render toast in StackPanel below preset chips**

In `stack-panel.tsx`, accept `status` prop:

```tsx
status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
```

Render right after `<PresetChips ... />`:

```tsx
<StatusToast status={status} />
```

Pass it from harness:

```tsx
<StackPanel ... status={status} />
```

- [ ] **Step 4: Manually verify**

`?ui=v2`:
- Click Knight chip with adult body type → "Applied Knight" toast (info), fades after ~4s.
- Switch to a body type where some preset items skip (e.g. child if Knight items don't support child) → click chip → "Applied Knight (skipped: …)." warn toast.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/status-toast.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/stack-panel.tsx
git commit -m "feat(web): layer-stack status toast (info / warn) wired to presets"
```

---

## Task 13: Body-type popover

Top-bar pill that opens a popover listing every `BODY_TYPES` value as a radio-like button. On selection: dispatch `set_body_type`; if any current selections are incompatible with the new body type, surface a warn toast listing them by category label.

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/use-popover.ts`
- Create: `packages/web/src/components/layer-stack/popovers/body-type-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`

- [ ] **Step 1: Implement `use-popover.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

export function usePopover(open: boolean, onClose: () => void) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });

    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return { anchorRef, panelRef, pos };
}
```

- [ ] **Step 2: Implement `body-type-popover.tsx`**

```tsx
import { BODY_TYPES, type BodyType, type Catalog } from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../../../slice/catalog-tree';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { SliceState, SliceAction } from '../../../slice/selection';
import type { LabelTranslator, Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  t: Translator;
  tl: LabelTranslator;
  onIncompatibilityWarning: (typeNames: string[]) => void;
}

export function BodyTypePopover({ open, setOpen, state, dispatch, catalog, t, tl, onIncompatibilityWarning }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant={open ? 'primary' : 'default'}
        onClick={() => setOpen(!open)}
      >
        👤 {state.bodyType} ▾
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="rounded-md border border-border bg-surface p-2 shadow-lg"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('bodyType.title')}
          </div>
          <div className="flex flex-col gap-1">
            {BODY_TYPES.map((bt: BodyType) => (
              <button
                key={bt}
                type="button"
                onClick={() => {
                  // Determine incompatibilities for the new bodyType.
                  const incompatible: string[] = [];
                  for (const [tn, sel] of Object.entries(state.selections)) {
                    const def = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
                    if (def && !itemSupportsBodyType(def, bt)) {
                      incompatible.push(tl(`label.${tn}` as never) || tn);
                    }
                  }
                  dispatch({ type: 'set_body_type', bodyType: bt });
                  setOpen(false);
                  if (incompatible.length > 0) onIncompatibilityWarning(incompatible);
                }}
                className={`rounded px-2 py-1 text-left text-[12px] ${
                  bt === state.bodyType ? 'bg-accent/20 text-text' : 'hover:bg-surface-2 text-text-2'
                }`}
              >
                {bt}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Wire in harness**

In `harness.tsx`, hold a single `popover` discriminator state:

```tsx
const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'reset' | 'attribution'>(null);
const setPop = (id: typeof popover) => setPopover((cur) => (cur === id ? null : id));
```

Render the popover as a child of TopBar:

```tsx
<TopBar ...>
  <BodyTypePopover
    open={popover === 'bodyType'}
    setOpen={(v) => (v ? setPopover('bodyType') : setPopover(null))}
    state={props.state}
    dispatch={props.dispatch}
    catalog={props.catalog}
    t={props.t}
    tl={props.tl}
    onIncompatibilityWarning={(names) => {
      setStatus({
        kind: 'warn',
        text: `Incompatible: ${names.join(', ')}.`,
      });
    }}
  />
</TopBar>
```

- [ ] **Step 4: Manually verify**

`?ui=v2`:
- Top bar starts with a "👤 male ▾" pill (or whatever the default body type is).
- Click → popover with all body types; current one highlighted.
- Click another → preview updates to new body, popover closes.
- If any selected items are incompatible with the new body type → warn toast lists them.
- Escape or outside-click closes the popover.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/ packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): body-type popover with incompatibility warn"
```

---

## Task 14: Token popover

Copy current token + paste-to-apply, sharing the slice-harness logic (`encodeSelectionToken`, `decodeSelectionToken`, `apply_selections`).

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/token-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Implement `token-popover.tsx`**

```tsx
import { useMemo, useState } from 'react';
import {
  decodeSelectionToken,
  encodeSelectionToken,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { toSelections, type SliceAction, type SliceState } from '../../../slice/selection';
import type { Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onStatus: (text: string) => void;
}

export function TokenPopover({ open, setOpen, state, dispatch, t, onStatus }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const token = useMemo(() => encodeSelectionToken(toSelections(state)), [state]);
  const [paste, setPaste] = useState('');

  return (
    <>
      <Button ref={anchorRef} size="sm" variant={open ? 'primary' : 'default'} onClick={() => setOpen(!open)}>
        🔗 Token
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-80 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">Token</div>
          <textarea
            readOnly
            value={token}
            className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
          />
          <div className="mb-2 flex gap-1">
            <Button size="sm" onClick={async () => {
              await navigator.clipboard.writeText(token);
              onStatus(`${t('token.copy')} ✓`);
            }}>{t('token.copy')}</Button>
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={t('token.placeholder')}
            className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
          />
          <div className="flex gap-1">
            <Button size="sm" variant="primary" disabled={!paste.trim()} onClick={() => {
              try {
                const decoded = decodeSelectionToken(paste.trim());
                dispatch({ type: 'apply_selections', selections: decoded.selections });
                setPaste('');
                setOpen(false);
                onStatus(`${t('token.paste')} ✓`);
              } catch (err) {
                onStatus(`Token error: ${String(err)}`);
              }
            }}>{t('token.paste')}</Button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire in harness**

In `harness.tsx`, add to the TopBar slot after BodyTypePopover:

```tsx
<TokenPopover
  open={popover === 'token'}
  setOpen={(v) => (v ? setPopover('token') : setPopover(null))}
  state={props.state}
  dispatch={props.dispatch}
  t={props.t}
  onStatus={(text) => setStatus({ kind: 'info', text })}
/>
```

- [ ] **Step 3: Manually verify**

`?ui=v2`:
- Token pill in top bar.
- Click → popover with current token; Copy puts it on clipboard ("Copy ✓" toast).
- Paste a known token in the text area, click "Paste & apply" → selections + body type swap; popover closes.
- Invalid token → error toast.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/token-popover.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): token popover (copy + paste & apply)"
```

---

## Task 15: Reset menu popover

Three checkboxes (Outfit / View / Filters) + a Reset button. Outfit + View dispatch the existing `reset` action with the matching scopes. The Filters checkbox additionally clears the harness-local `licenseFilter` (the reducer has no such scope).

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Implement `reset-menu-popover.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  t: Translator;
  onReset: (scopes: { outfit: boolean; view: boolean; filters: boolean }) => void;
}

export function ResetMenuPopover({ open, setOpen, t, onReset }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const [outfit, setOutfit] = useState(true);
  const [view, setView] = useState(false);
  const [filters, setFilters] = useState(false);

  return (
    <>
      <Button ref={anchorRef} size="sm" variant={open ? 'primary' : 'default'} onClick={() => setOpen(!open)}>
        ↻ Reset ▾
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-56 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">Reset scopes</div>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={outfit} onChange={(e) => setOutfit(e.target.checked)} />
            <span>Outfit</span>
          </label>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={view} onChange={(e) => setView(e.target.checked)} />
            <span>View</span>
          </label>
          <label className="mb-2 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={filters} onChange={(e) => setFilters(e.target.checked)} />
            <span>{t('reset.scope.filters')}</span>
          </label>
          <Button size="sm" variant="primary" disabled={!outfit && !view && !filters} onClick={() => {
            onReset({ outfit, view, filters });
            setOpen(false);
          }}>Reset</Button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire in harness**

In `harness.tsx`:

```tsx
<ResetMenuPopover
  open={popover === 'reset'}
  setOpen={(v) => (v ? setPopover('reset') : setPopover(null))}
  t={props.t}
  onReset={({ outfit, view, filters }) => {
    if (outfit || view) {
      props.onReset({ outfit, view });
    }
    if (filters) {
      setLicenseFilter(null);
    }
    setStatus({ kind: 'info', text: 'Reset ✓' });
  }}
/>
```

- [ ] **Step 3: Manually verify**

`?ui=v2`:
- Reset pill in top bar. Default checkboxes: Outfit only.
- Clicking Reset with default → outfit reverts to initial selections; view (anim/dir/zoom) unchanged.
- Check View only + uncheck Outfit → only view state reverts.
- After Task 17 wires license filter, "Filters" checkbox clears the dropdown.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): scoped reset popover (outfit / view / filters)"
```

---

## Task 16: Attribution badge + popover

The top-bar attribution badge shows the count of distinct sources currently in use, and on click opens a list popover with `name · author · license` per item. If any selected item exceeds the current `licenseFilter`, the badge shows a warning colour and prepends ⚠.

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Implement `attribution-popover.tsx`**

```tsx
import { useMemo } from 'react';
import {
  computeEffectiveLicense,
  type Catalog,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { licenseExceedsFilter, type LicenseFilter } from '../../../slice/license-filter';
import type { SliceState } from '../../../slice/selection';
import type { LabelTranslator, Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  catalog: Catalog;
  state: SliceState;
  licenseFilter: LicenseFilter;
  t: Translator;
  tl: LabelTranslator;
}

interface Row {
  typeName: string;
  item: ItemDefinition;
  effective: string;
  exceeds: boolean;
}

export function AttributionPopover({ open, setOpen, catalog, state, licenseFilter, t, tl }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [tn, sel] of Object.entries(state.selections)) {
      const item = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
      if (!item) continue;
      const effective = computeEffectiveLicense(item.license);
      out.push({ typeName: tn, item, effective, exceeds: licenseExceedsFilter(effective, licenseFilter) });
    }
    return out;
  }, [catalog, state.selections, licenseFilter]);

  const exceedsAny = rows.some((r) => r.exceeds);
  const sourceCount = new Set(rows.map((r) => `${r.item.author ?? ''}|${r.effective}`)).size;

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant={exceedsAny ? 'primary' : 'default'}
        className={exceedsAny ? 'border-danger text-danger' : ''}
        onClick={() => setOpen(!open)}
      >
        {exceedsAny ? '⚠ ' : '© '}{t('attribution.title')} · {sourceCount}
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="max-h-96 w-96 overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('attribution.title')}
          </div>
          {rows.length === 0 && (
            <div className="text-[11px] text-text-mute">No items selected.</div>
          )}
          <ul className="flex flex-col gap-1 text-[11px]">
            {rows.map((r) => (
              <li key={r.typeName} className={`rounded border border-border bg-surface-2 px-2 py-1 ${r.exceeds ? 'border-danger text-danger' : ''}`}>
                <div className="font-semibold">{tl(`label.${r.typeName}` as never) || r.typeName}</div>
                <div className="font-mono text-[10px] text-text-mute">
                  {r.item.name} · {r.item.author ?? '?'} · {r.effective}
                </div>
                {r.exceeds && <div className="text-[10px]">{t('attribution.exceededShort')}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire in harness**

In `harness.tsx`, append after ResetMenuPopover (Attribution is the right-most pre-locale element, but ordering inside TopBar is flexible — keep it after Reset and before Locale/Theme):

```tsx
<AttributionPopover
  open={popover === 'attribution'}
  setOpen={(v) => (v ? setPopover('attribution') : setPopover(null))}
  catalog={props.catalog}
  state={props.state}
  licenseFilter={licenseFilter}
  t={props.t}
  tl={props.tl}
/>
```

- [ ] **Step 3: Manually verify**

`?ui=v2`:
- Top bar shows `© Attribution · N` where N is the count of distinct author+license pairs.
- Click → list of every selected layer with item, author, effective license.
- After Task 17, setting a license filter that some items exceed → badge becomes red `⚠ Attribution · N`, exceeded rows are red-bordered.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/attribution-popover.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): attribution badge + popover with license-exceeded indicator"
```

---

## Task 17: Settings collapsible (License filter + Asset source)

Bottom of the left column: a single collapsible section housing the License filter dropdown and the Asset source segmented control. Collapsed by default.

**Files:**
- Create: `packages/web/src/components/layer-stack/settings-collapsible.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Implement `settings-collapsible.tsx`**

```tsx
import { useState } from 'react';
import { LICENSE_CONFIG, type License } from '@lpc-toolkit/core';
import { Button } from '../ui/button';
import type { LicenseFilter } from '../../slice/license-filter';
import type { AssetSource } from '../../adapter/asset-source';
import type { Translator } from '../../i18n';

const LICENSE_OPTIONS: readonly License[] = LICENSE_CONFIG.flatMap((g) => g.versions);

interface Props {
  t: Translator;
  licenseFilter: LicenseFilter;
  setLicenseFilter: (v: LicenseFilter) => void;
  assetSource: AssetSource;
  setAssetSource: (v: AssetSource) => void;
}

export function SettingsCollapsible({ t, licenseFilter, setLicenseFilter, assetSource, setAssetSource }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border bg-bg-app">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute hover:bg-surface-2"
      >
        <span>{t('filters.title')}</span>
        <span className="ml-auto">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">{t('picker.licenseFilter')}</div>
            <select
              value={licenseFilter ?? ''}
              onChange={(e) => setLicenseFilter((e.target.value as License) || null)}
              className="w-full rounded border border-border bg-surface-2 px-2 py-1 text-[11px]"
            >
              <option value="">{t('picker.allLicenses')}</option>
              {LICENSE_OPTIONS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">{t('assetSource.title')}</div>
            <div className="flex gap-1">
              {(['auto', 'local', 'upstream'] as const).map((src) => (
                <Button
                  key={src}
                  size="sm"
                  variant={assetSource === src ? 'primary' : 'ghost'}
                  className="flex-1"
                  onClick={() => setAssetSource(src)}
                >
                  {t(`assetSource.${src}` as const)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use it in StackPanel**

Replace the Filters placeholder at the bottom of `stack-panel.tsx`:

```tsx
<SettingsCollapsible
  t={t}
  licenseFilter={licenseFilter}
  setLicenseFilter={setLicenseFilter}
  assetSource={assetSource}
  setAssetSource={setAssetSource}
/>
```

Extend the StackPanel `Props` to accept `setLicenseFilter`, `assetSource`, `setAssetSource`. Pass them from `harness.tsx` (`assetSource` and `onAssetSourceChange` already arrive from App.tsx).

- [ ] **Step 3: Manually verify**

`?ui=v2`:
- "Filters & source" strip at very bottom of left column; collapsed by default.
- Click → reveals License filter dropdown + Asset source segmented control.
- Choose `CC-BY 3.0` → swap grids dim items that exceed; Attribution badge turns red if any current item exceeds.
- Switch Asset source → preview re-renders using the chosen source.
- Reset popover with "Filters" checked clears the license filter dropdown.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/settings-collapsible.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): layer-stack bottom collapsible (license filter + asset source)"
```

---

## Task 18: Golden-path manual verification

Run through the full manual verification list from the spec on a fresh dev server. Capture any blocker; minor cosmetic issues can be follow-ups.

- [ ] **Step 1: Run the dev server fresh**

```bash
pnpm --filter @lpc-toolkit/web dev
```

Open `http://localhost:5173/?ui=v2`.

- [ ] **Step 2: Walk through golden-path 1–12 from the spec**

1. Basic load: left layers, preview character, 7 top-bar elements visible (or 6 if loading is done).
2. Swap item: open a row, click a tile, preview updates.
3. Change style: variant chips / colour swatches inside expanded row work.
4. Add layer: + Add → pick → row auto-expands.
5. Remove layer: ✕ on a row → row gone, available count up.
6. Preset: Knight chip → multi-layer update; with incompatible body type → warn toast lists skipped categories.
7. Body type popover: change body type; incompatibility warning if applicable.
8. Token: copy → reload `?ui=v2` → paste → state restores.
9. Reset scopes: Outfit only — selections revert, view/theme untouched.
10. License filter: set CC-BY 3.0 → swap grids dim exceeding tiles → Attribution badge red.
11. Preview controls: direction quad, animation dropdown, play/pause, zoom +/- and Ctrl/⌘+wheel.
12. i18n / theme: EN ⇄ zh-TW; ☾ ⇄ ☀.

- [ ] **Step 3: Sanity-check `?ui=` defaults**

Open `http://localhost:5173/` (no query) and `http://localhost:5173/?ui=v1` — both should render the unchanged `SliceHarness`.

- [ ] **Step 4: Run typecheck + tests once more**

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/web test
pnpm --filter @lpc-toolkit/web build
```

Expected: all pass; build succeeds.

- [ ] **Step 5: Commit any documentation tidy-up (none if everything passed)**

If the walkthrough surfaced a small bug, fix it with a focused follow-up commit. Otherwise just confirm:

```bash
git status
git log --oneline -n 20
```

No final "complete" commit is needed — every task ends in a commit already.

---

## End-of-plan checks

- [ ] All 12 golden-path scenarios pass in `?ui=v2`.
- [ ] `?ui=` (any other value) renders the unchanged `SliceHarness` with zero regressions.
- [ ] `pnpm --filter @lpc-toolkit/web typecheck` clean.
- [ ] `pnpm --filter @lpc-toolkit/web test` clean.
- [ ] `pnpm --filter @lpc-toolkit/web build` clean.
