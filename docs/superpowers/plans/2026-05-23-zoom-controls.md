# Zoom Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `const ZOOM = 4` in the character-preview canvas with a user-controlled integer zoom (1×–8×, default 4×) driven by buttons, a slider, and Ctrl/Cmd + mousewheel.

**Architecture:** Add `zoom: number` to the existing `SliceState`, alongside `anim`/`dir`/`playing`. New `set_zoom` action with clamp-and-round. The existing `reset` action's `view` scope also restores zoom to the initial value. Zoom is **not** encoded into the selection token and **not** persisted. UI sits in the existing toolbar row above the canvas; wheel handler is attached via `useEffect` + `{ passive: false }` so `preventDefault` works.

**Tech Stack:** React 18, TypeScript (strict), Vitest, Tailwind. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-23-zoom-controls-design.md`.

---

## File touch list

- Modify `packages/web/src/slice/selection.ts` — constants, `SliceState.zoom`, `set_zoom` action, reducer cases, `pickInitialSelections` init.
- Modify `packages/web/test/selection.test.ts` — add zoom assertions to existing tests, add new tests for `set_zoom` and zoom-in-view-reset.
- Modify `packages/web/src/i18n.ts` — three new keys × two locales.
- Modify `packages/web/src/components/slice-harness.tsx` — remove `ZOOM` const, pass `state.zoom` to hook, add toolbar UI, attach wheel listener via effect.

No new files. The hook `use-animation-player.ts` already accepts `zoom: number`; its signature is unchanged.

---

## Task 1: Slice state — add `zoom` field, action, reducer, init

This is one TDD cycle. Adding `zoom` to `SliceState` is a type-breaking change — every existing `SliceState` literal in tests must be updated in the same commit for typecheck to pass.

**Files:**
- Modify: `packages/web/src/slice/selection.ts`
- Test: `packages/web/test/selection.test.ts`

- [ ] **Step 1: Add the failing test for `set_zoom` and the new initial-state assertion**

In `packages/web/test/selection.test.ts`, in the existing `describe('pickInitialSelections', ...)` block — inside the first `it(...)` (the one at lines ~49-57 that already asserts `anim`/`dir`/`playing`) — add at the end:

```ts
    expect(state.zoom).toBe(4);
```

Then, at the bottom of the file, after the last `describe(...)` block, add:

```ts
describe('sliceReducer set_zoom', () => {
  const base: SliceState = {
    bodyType: 'male',
    selections: { body: { typeName: 'body', name: 'Body A' } },
    anim: 'walk',
    dir: 'down',
    playing: true,
    zoom: 4,
  };

  it('clamps zoom to MIN_ZOOM lower bound', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 0 });
    expect(s.zoom).toBe(1);
  });

  it('clamps zoom to MAX_ZOOM upper bound', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 12 });
    expect(s.zoom).toBe(8);
  });

  it('rounds non-integer zoom to nearest integer (defensive)', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 3.6 });
    expect(s.zoom).toBe(4);
    const s2 = sliceReducer(base, { type: 'set_zoom', zoom: 3.4 });
    expect(s2.zoom).toBe(3);
  });

  it('accepts in-range integer unchanged', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 6 });
    expect(s.zoom).toBe(6);
  });
});
```

Also update the existing reducer tests that compare full state shapes. In the `describe('sliceReducer reset', ...)` block (near line 209), update the `init` constant by appending `zoom: 4,` after `playing: true,`. Update the `mutated` constant by appending `zoom: 2,` after `playing: false,`.

In the `it('view-only reset restores anim/dir/playing, leaves outfit untouched', ...)` test, add this assertion at the end:

```ts
    expect(s.zoom).toBe(init.zoom);
```

In the `it('outfit-only reset restores bodyType + selections, leaves view untouched', ...)` test, add:

```ts
    expect(s.zoom).toBe(mutated.zoom);
```

In the `it('outfit + view reset restores all four fields', ...)` test (currently checking all four — now five), add:

```ts
    expect(s.zoom).toBe(init.zoom);
```

For every other `SliceState` literal in the file (there are 7 of them: lines ~112, 131, 148, 183, 210, 222 from the current file), append `zoom: 4,` after the `playing: ...` line. Also update the `s1` equality check in the `apply_selections` test (around line 170-179) — add `zoom: 4,` to the expected object.

No new imports are needed in the test file — the assertions above use literal `1`, `4`, `8`, which document the expected source-of-truth values. The constants themselves are exercised indirectly through the reducer's clamping behaviour.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: typecheck error (red) because `SliceState` does not yet have `zoom`, and `'set_zoom'` is not in `SliceAction`. Concretely you'll see TS2353 (`'zoom' does not exist`) on every literal and TS2322 / TS2769 on the new `set_zoom` dispatches.

- [ ] **Step 3: Add constants and extend types in `packages/web/src/slice/selection.ts`**

Near the top of the file, after the import block, add:

```ts
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 4;

function clampZoom(z: number): number {
  const r = Math.round(z);
  if (r < MIN_ZOOM) return MIN_ZOOM;
  if (r > MAX_ZOOM) return MAX_ZOOM;
  return r;
}
```

Extend `SliceState` (currently lines 13-19):

```ts
export interface SliceState {
  readonly bodyType: BodyType;
  readonly selections: Readonly<Record<TypeName, Selection>>;
  readonly anim: AnimationName;
  readonly dir: Direction;
  readonly playing: boolean;
  readonly zoom: number;
}
```

Extend `SliceAction` (currently lines 21-39) by adding one new variant at the end of the union:

```ts
  | { type: 'set_zoom'; zoom: number };
```

- [ ] **Step 4: Add reducer case and update `reset` for `set_zoom`**

In `sliceReducer`, add a new `case` (alongside the existing `set_anim`/`set_dir`/`toggle_play`):

```ts
    case 'set_zoom':
      return { ...s, zoom: clampZoom(a.zoom) };
```

In the existing `case 'reset'`, inside the `if (a.scopes.view) { ... }` block, add `zoom: a.init.zoom,` to the assignment:

```ts
      if (a.scopes.view) {
        next = {
          ...next,
          anim: a.init.anim,
          dir: a.init.dir,
          playing: a.init.playing,
          zoom: a.init.zoom,
        };
      }
```

In `pickInitialSelections` (around line 196-205), add `zoom: DEFAULT_ZOOM,` to the returned `state` object:

```ts
  return {
    state: {
      bodyType: DEFAULT_BODY_TYPE,
      selections,
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: DEFAULT_ZOOM,
    },
    shownTypeNames,
  };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all green, including the four new `sliceReducer set_zoom` tests and updated reset tests.

- [ ] **Step 6: Run typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors. The harness still references the local `const ZOOM = 4` so nothing breaks at the call site yet.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/slice/selection.ts packages/web/test/selection.test.ts
git commit -m "feat(web): add zoom to slice state with set_zoom action and view-reset wiring"
```

---

## Task 2: i18n keys for zoom controls

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add English keys**

In `packages/web/src/i18n.ts`, inside the `en:` translation block, immediately after the line `'controls.play': 'Play',` (around line 37), insert:

```ts
    'controls.zoom': 'Zoom',
    'controls.zoomIn': 'Zoom in',
    'controls.zoomOut': 'Zoom out',
```

- [ ] **Step 2: Add Traditional Chinese keys**

In the `'zh-TW':` translation block, immediately after the line `'controls.play': '播放',` (around line 107), insert:

```ts
    'controls.zoom': '縮放',
    'controls.zoomIn': '放大',
    'controls.zoomOut': '縮小',
```

- [ ] **Step 3: Run i18n test to confirm both locales stay in sync**

```bash
pnpm --filter @lpc-toolkit/web test -- i18n
```

Expected: green. The existing `i18n.test.ts` verifies that `en` and `zh-TW` have identical key sets — adding 3 keys to both keeps it balanced.

- [ ] **Step 4: Run typecheck (i18n keys are typed)**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): add i18n keys for zoom controls"
```

---

## Task 3: Wire harness to `state.zoom` (no new UI yet)

This step is intentionally minimal — it proves the slice→hook wiring works end-to-end with the new state field before any UI is added.

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Remove the `ZOOM` constant**

In `packages/web/src/components/slice-harness.tsx`, delete line 56:

```ts
const ZOOM = 4;
```

- [ ] **Step 2: Pass `state.zoom` to the animation player**

Find the `useAnimationPlayer` call (around lines 112-118) and replace the last argument `ZOOM` with `state.zoom`:

```ts
  useAnimationPlayer(
    canvasRef,
    result.animation,
    state.dir,
    state.playing,
    state.zoom,
  );
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all green (no harness tests exist; slice tests still pass).

- [ ] **Step 5: Smoke-test in dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```

Expected: app loads, character renders at 4× (same as before). Stop the dev server with Ctrl-C once verified. If the character is missing or sized wrong, you've broken the wiring — investigate.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx
git commit -m "refactor(web): drive canvas zoom from state.zoom instead of constant"
```

---

## Task 4: Zoom controls UI in the toolbar

Add `[−] [N×] ──slider── [+]` to the existing toolbar row (the one with the animation `<select>`, direction buttons, and play/pause), positioned just before the `<div className="flex-1" />` spacer.

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Import the constants from the slice**

In `packages/web/src/components/slice-harness.tsx`, find the existing import from `'../slice/selection'` (it currently imports things like `sliceReducer`, `toSelections`, etc.) and add the three constants:

```ts
import {
  // ... existing imports unchanged ...
  MIN_ZOOM,
  MAX_ZOOM,
} from '../slice/selection';
```

(You only need `MIN_ZOOM` and `MAX_ZOOM` here; `DEFAULT_ZOOM` is only used in `pickInitialSelections`.)

- [ ] **Step 2: Insert the zoom control group in the toolbar**

Locate the toolbar row that contains the play/pause button. After the `Button` whose text is `state.playing ? t('controls.pause') : t('controls.play')` (around line 555-560) and **before** `<div className="flex-1" />` (around line 561), insert:

```tsx
            <div className="ml-2 flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={state.zoom <= MIN_ZOOM}
                aria-label={t('controls.zoomOut')}
                onClick={() =>
                  dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })
                }
              >
                −
              </Button>
              <span className="text-text-mute w-8 text-center text-xs tabular-nums">
                {state.zoom}×
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={state.zoom >= MAX_ZOOM}
                aria-label={t('controls.zoomIn')}
                onClick={() =>
                  dispatch({ type: 'set_zoom', zoom: state.zoom + 1 })
                }
              >
                +
              </Button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={1}
                value={state.zoom}
                aria-label={t('controls.zoom')}
                onChange={(e) =>
                  dispatch({
                    type: 'set_zoom',
                    zoom: Number(e.target.value),
                  })
                }
                className="w-24"
              />
            </div>
```

Notes on styling:
- `tabular-nums` keeps the `4×` label width stable so the slider doesn't shift when the digit changes.
- `w-8` width on the label is enough for `1×`–`8×`.
- `w-24` slider width is a starting point; tweak only if it looks visually cramped.
- The label uses a Unicode minus `−` (U+2212), not an ASCII hyphen `-`, for visual symmetry with `+`.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all green.

- [ ] **Step 5: Smoke-test in dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```

Verify in the browser:
- `−` and `+` buttons step zoom by 1.
- The `N×` label updates in lockstep with the canvas size.
- The slider thumb snaps to integer positions; dragging it scales the canvas.
- `−` is disabled at 1×, `+` is disabled at 8×.
- "Reset view" (existing button) brings zoom back to 4× along with anim/dir/playing.

Stop the dev server once verified.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx
git commit -m "feat(web): add zoom in/out controls to preview toolbar"
```

---

## Task 5: Ctrl/Cmd + mousewheel zoom on the canvas

React 17+ attaches `onWheel` as a passive listener by default, which means `e.preventDefault()` is silently ignored. To reliably prevent the page from scrolling while zooming, attach the listener via `useEffect` with `{ passive: false }` on the canvas container element.

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Add a ref to the canvas container**

In `packages/web/src/components/slice-harness.tsx`, near the existing `canvasRef` declaration (around line 93), add a second ref:

```ts
  const previewRef = useRef<HTMLDivElement | null>(null);
```

Attach it to the `<div className="checker flex flex-1 items-center justify-center">` element (around line 568):

```tsx
          <div
            ref={previewRef}
            className="checker flex flex-1 items-center justify-center"
          >
```

- [ ] **Step 2: Attach a non-passive wheel listener via effect**

After the existing `useAnimationPlayer(...)` call (around lines 112-118), add a `useEffect` block. Place it grouped with other effects/hooks at the top of the component body:

```ts
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? +1 : -1;
      dispatch({ type: 'set_zoom', zoom: state.zoom + delta });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dispatch, state.zoom]);
```

Notes:
- `state.zoom` is in the dep list so `delta` always operates on the current value. The reducer clamps, so we don't clamp here.
- Both `ctrlKey` (Windows/Linux) and `metaKey` (macOS Cmd) are accepted. On macOS, trackpad pinch surfaces as a wheel event with `ctrlKey: true`, so trackpad pinch zoom works without extra code.
- The cleanup removes the listener; the next render re-attaches with the latest `state.zoom` closure.

If `useEffect` / `useRef` are not already imported at the top of the file, extend the React import:

```ts
import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
```

(Adjust the list based on whichever of these are already there. `useEffect` is the one most likely missing.)

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all green.

- [ ] **Step 5: Smoke-test in dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```

Verify in the browser:
- Hover the cursor over the character preview area.
- Hold Ctrl (or Cmd on macOS) and scroll up → zoom increases by 1 per notch, page does not scroll.
- Ctrl/Cmd + scroll down → zoom decreases by 1 per notch.
- At 1× further down-scroll does nothing; at 8× further up-scroll does nothing.
- Without Ctrl/Cmd, scrolling behaves normally (page scrolls).
- On macOS with a trackpad: pinch-zoom on the canvas changes the zoom.

Stop the dev server once verified.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx
git commit -m "feat(web): zoom canvas with Ctrl/Cmd + mousewheel"
```

---

## Verification checklist (run before declaring the feature complete)

- [ ] `pnpm --filter @lpc-toolkit/web typecheck` — clean
- [ ] `pnpm --filter @lpc-toolkit/web test` — green
- [ ] `pnpm --filter @lpc-toolkit/web build` — succeeds
- [ ] Dev server: zoom buttons, slider, and wheel all change canvas size
- [ ] Dev server: zoom resets to 4× on "Reset view"
- [ ] Dev server: zoom is unchanged on "Reset outfit"
- [ ] Dev server: page refresh resets zoom to 4× (no persistence — by design)
- [ ] Dev server: selection token text does not include any zoom info (zoom is view-only)

## Out of scope reminders (do not implement)

- Continuous/fractional zoom
- Fit-to-window auto-zoom
- localStorage / URL persistence of zoom
- Encoding zoom into the selection token
- Keyboard shortcuts (Ctrl/Cmd + plus/minus)
