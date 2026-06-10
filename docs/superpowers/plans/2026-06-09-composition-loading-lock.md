# Composition Loading Indicator and Layer Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real composition progress over the retained preview and prevent character-composition changes until the active load settles.

**Architecture:** Keep `useComposedCharacter` as the source of loading state and progress. Add a pure action-classification helper, guard composition-changing reducer dispatches in `LayerStackHarness`, and pass an explicit `disabled` prop to controls whose non-reducer handlers also change the composed character. Render the progress overlay inside `PreviewPane`, leaving view controls interactive.

**Tech Stack:** TypeScript strict mode, React 18, Vite, Tailwind CSS, Vitest, Playwright, pnpm.

---

## File Structure

- Create `packages/web/src/lib/composition-lock.ts`: classify reducer actions that change the composed character and format normalized progress for display.
- Create `packages/web/test/composition-lock.test.ts`: unit coverage for action classification and progress formatting.
- Modify `packages/web/src/components/layer-stack/harness.tsx`: derive `isComposing`, guard composition dispatches, pass disabled state, and lock custom-overlay/reload handlers.
- Modify `packages/web/src/components/layer-stack/preview-pane.tsx`: render the spinner, localized loading text, and progress over the retained canvas.
- Modify `packages/web/src/components/layer-stack/stack-panel.tsx`: distribute the disabled state to composition-changing controls.
- Modify `packages/web/src/components/layer-stack/sidebar-search.tsx`: disable search input, keyboard selection, and result buttons.
- Modify `packages/web/src/components/layer-stack/preset-bar.tsx`: disable random, preset, and composition-changing reset operations.
- Modify `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`: disable preset menu items during composition.
- Modify `packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx`: disable confirmation only when the selected reset scopes include outfit.
- Modify `packages/web/src/components/layer-stack/layer-row.tsx`: disable clear, replacement, and color operations.
- Modify `packages/web/src/components/layer-stack/add-layer.tsx`: disable add-layer entry and item selection.
- Modify `packages/web/src/components/color-picker.tsx`: disable recolor and variant choices.
- Modify `packages/web/src/components/layer-stack/settings-collapsible.tsx`: disable incompatible-item removal and custom-overlay mutations while leaving filter toggles usable.
- Modify `packages/web/src/components/layer-stack/popovers/body-type-popover.tsx`: disable body-type changes.
- Modify `packages/web/src/components/layer-stack/popovers/token-popover.tsx`: disable pasted-token application while preserving copy operations.
- Modify `packages/web/src/i18n.ts`: add dedicated loading-overlay text in both locales.
- Create `packages/web/e2e/composition-loading-lock.spec.ts`: deterministic browser coverage for initial loading and subsequent composition.
- Modify `packages/web/e2e/responsive-layout.spec.ts`: wait for composition readiness before using the now-locked reload button.

---

### Task 1: Composition Action Contract

**Files:**
- Create: `packages/web/test/composition-lock.test.ts`
- Create: `packages/web/src/lib/composition-lock.ts`

- [ ] **Step 1: Write the failing action and progress tests**

Create `packages/web/test/composition-lock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SliceAction, SliceState } from '../src/slice/selection';
import {
  formatCompositionProgress,
  isCompositionChangingAction,
  isCompositionLocked,
} from '../src/lib/composition-lock';

const initialState: SliceState = {
  bodyType: 'male',
  selections: {},
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
};

const compositionActions: readonly SliceAction[] = [
  { type: 'set_body_type', bodyType: 'female' },
  { type: 'pick', typeName: 'hair', name: 'plain' },
  { type: 'clear', typeName: 'hair' },
  {
    type: 'apply_selections',
    selections: { bodyType: 'male', items: {} },
  },
  {
    type: 'reset',
    scopes: { outfit: true, view: false },
    init: initialState,
  },
];

const viewActions: readonly SliceAction[] = [
  { type: 'set_anim', anim: 'slash' },
  { type: 'set_dir', dir: 'left' },
  { type: 'toggle_play' },
  { type: 'set_zoom', zoom: 8 },
  {
    type: 'reset',
    scopes: { outfit: false, view: true },
    init: initialState,
  },
];

describe('isCompositionChangingAction', () => {
  it.each(compositionActions)('classifies $type as composition-changing', (action) => {
    expect(isCompositionChangingAction(action)).toBe(true);
  });

  it.each(viewActions)('allows view action $type during composition', (action) => {
    expect(isCompositionChangingAction(action)).toBe(false);
  });
});

describe('formatCompositionProgress', () => {
  it('rounds normalized progress to a clamped integer percentage', () => {
    expect(formatCompositionProgress(-1)).toBe(0);
    expect(formatCompositionProgress(0)).toBe(0);
    expect(formatCompositionProgress(0.456)).toBe(46);
    expect(formatCompositionProgress(1)).toBe(100);
    expect(formatCompositionProgress(2)).toBe(100);
  });
});

describe('isCompositionLocked', () => {
  it('locks only while status is loading', () => {
    expect(isCompositionLocked('idle')).toBe(false);
    expect(isCompositionLocked('loading')).toBe(true);
    expect(isCompositionLocked('ready')).toBe(false);
    expect(isCompositionLocked('error')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- composition-lock
```

Expected: FAIL because `src/lib/composition-lock.ts` does not exist.

- [ ] **Step 3: Implement the pure contract**

Create `packages/web/src/lib/composition-lock.ts`:

```ts
import type { SliceAction } from '../slice/selection';

type CompositionStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Whether a reducer action changes inputs consumed by composeSelections. */
export function isCompositionChangingAction(action: SliceAction): boolean {
  switch (action.type) {
    case 'set_body_type':
    case 'pick':
    case 'clear':
    case 'apply_selections':
      return true;
    case 'reset':
      return action.scopes.outfit;
    case 'set_anim':
    case 'set_dir':
    case 'toggle_play':
    case 'set_zoom':
      return false;
  }
}

/** Convert normalized composition progress to a display-safe percentage. */
export function formatCompositionProgress(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

/** Error and settled states must always release the composition lock. */
export function isCompositionLocked(status: CompositionStatus): boolean {
  return status === 'loading';
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- composition-lock
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/composition-lock.ts packages/web/test/composition-lock.test.ts
git commit -m "test(web): define composition lock contract"
```

---

### Task 2: Preview Loading Overlay

**Files:**
- Modify: `packages/web/src/i18n.ts`
- Modify: `packages/web/test/i18n.test.ts`
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Add the failing translation assertion**

In the `translates representative labels` test in
`packages/web/test/i18n.test.ts`, add:

```ts
expect(en('composition.loading')).toBe('Loading character');
expect(zh('composition.loading')).toBe('角色載入中');
```

- [ ] **Step 2: Run the i18n test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n
```

Expected: FAIL because `composition.loading` is not a translation key.

- [ ] **Step 3: Add localized loading copy**

Add this key to the English translation object in
`packages/web/src/i18n.ts`:

```ts
'composition.loading': 'Loading character',
```

Add the matching key to the `zh-TW` translation object:

```ts
'composition.loading': '角色載入中',
```

- [ ] **Step 4: Render the loading overlay in `PreviewPane`**

Import the formatter in
`packages/web/src/components/layer-stack/preview-pane.tsx`:

```ts
import { formatCompositionProgress } from '../../lib/composition-lock';
```

Inside `PreviewPane`, before the return, derive:

```ts
const isComposing = result.status === 'loading';
const progressPercent = formatCompositionProgress(result.progress);
```

Inside the single-preview container, immediately after the canvas wrapper,
add:

```tsx
{isComposing && (
  <div
    role="status"
    aria-live="polite"
    data-testid="composition-loading-overlay"
    className="absolute inset-0 z-20 flex items-center justify-center bg-app/45 backdrop-blur-[1px]"
  >
    <div className="flex min-w-36 flex-col items-center gap-2 rounded-md border border-border bg-surface/95 px-4 py-3 shadow-lg">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden="true"
      />
      <span className="text-xs font-medium text-text">
        {t('composition.loading')}
      </span>
      <span className="font-mono text-[11px] text-text-mute">
        {progressPercent}%
      </span>
    </div>
  </div>
)}
```

Do not clear or replace `result.animation` when `status` becomes `loading`.
The current `useComposedCharacter` loading update spreads the previous result,
so the last successful animation already remains available to
`useAnimationPlayer`.

- [ ] **Step 5: Add accessible play/pause labeling for unlocked-control E2E coverage**

Replace the play/pause button in `PreviewPane` with:

```tsx
<Button
  size="sm"
  variant="ghost"
  aria-label={state.playing ? t('controls.pause') : t('controls.play')}
  onClick={() => dispatch({ type: 'toggle_play' })}
>
  {state.playing ? '⏸' : '▶'}
</Button>
```

- [ ] **Step 6: Keep the harness progress source unchanged**

In `packages/web/src/components/layer-stack/harness.tsx`, retain:

```ts
const loadingProgress =
  composeResult.status === 'loading' ? composeResult.progress : null;
```

Continue passing the full `composeResult` to `PreviewPane`. No core or hook API
change is needed.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n composition-lock
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both commands PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts packages/web/src/components/layer-stack/preview-pane.tsx
git commit -m "feat(web): show composition loading overlay"
```

---

### Task 3: Guard Reducer-Based Composition Changes

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/body-type-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/token-popover.tsx`

- [ ] **Step 1: Add `isComposing` and guarded dispatch in the harness**

Import the lock helpers:

```ts
import {
  isCompositionChangingAction,
  isCompositionLocked,
} from '../../lib/composition-lock';
```

Immediately after `composeResult` is created, add:

```ts
const isComposing = isCompositionLocked(composeResult.status);
const guardedDispatch = useCallback(
  (action: SliceAction) => {
    if (isComposing && isCompositionChangingAction(action)) return;
    props.dispatch(action);
  },
  [isComposing, props.dispatch],
);
```

Replace each `dispatch={props.dispatch}` occurrence on `StackPanel`,
`PreviewPane`, `BodyTypePopover`, and `TokenPopover` with
`dispatch={guardedDispatch}`.

Also pass:

```tsx
disabled={isComposing}
```

to `BodyTypePopover` and `TokenPopover`. `StackPanel` receives the visual
disabled prop in Task 4 when its child prop contracts are updated together.

Pass `guardedDispatch` into `useUrlHashSync` so browser hash changes cannot
replace the outfit during composition:

```ts
useUrlHashSync({
  state: props.state,
  defaults: props.defaults,
  dispatch: guardedDispatch,
  catalog: props.catalog,
  palettes: props.palettes,
  t,
  onStatus: (text) => setStatus({ kind: 'info', text }),
});
```

- [ ] **Step 2: Disable body-type changes**

Add `disabled: boolean` to `BodyTypePopover` props and destructuring.
Set the trigger and each body-type item to disabled:

```tsx
<Button
  ref={anchorRef}
  size="sm"
  variant={open ? 'primary' : 'default'}
  disabled={disabled}
  onClick={() => setOpen(!open)}
>
```

```tsx
<button
  key={bt}
  type="button"
  disabled={disabled}
  onClick={handleBodyTypeSelection}
  className={`rounded px-2 py-1 text-left text-[12px] disabled:cursor-not-allowed disabled:opacity-50 ${
    bt === state.bodyType
      ? 'bg-accent/20 text-text'
      : 'hover:bg-surface-2 text-text-2'
  }`}
>
```

Extract the current inline body-type click body without changing it:

```ts
const handleBodyTypeSelection = (): void => {
  const incompatible: string[] = [];
  for (const [tn, sel] of Object.entries(state.selections)) {
    const def = (catalog.byTypeName.get(tn) ?? []).find(
      (item) => item.name === sel.name,
    );
    if (def && !itemSupportsBodyType(def, bt)) {
      incompatible.push(tl.category(tn));
    }
  }
  dispatch({ type: 'set_body_type', bodyType: bt });
  setOpen(false);
  if (incompatible.length > 0) onIncompatibilityWarning(incompatible);
};
```

Define that callback inside the `BODY_TYPES.map` callback so `bt` is in
scope.

- [ ] **Step 3: Disable token application but keep copy controls enabled**

Add `disabled: boolean` to `TokenPopover` props and destructuring. Leave both
copy buttons and textareas unchanged. Change only the paste/apply button:

```tsx
<Button
  size="sm"
  variant="primary"
  disabled={disabled || !paste.trim()}
  onClick={() => {
    try {
      const decoded = decodeSelectionToken(paste.trim(), catalog);
      if (decoded.warnings.length > 0) {
        onStatus(t('token.unresolved'));
        return;
      }
      dispatch({ type: 'apply_selections', selections: decoded.selections });
      setPaste('');
      setOpen(false);
      onStatus(`${t('token.paste')} ✓`);
    } catch (err) {
      onStatus(`${t('token.invalid')}: ${String(err)}`);
    }
  }}
>
  {t('token.paste')}
</Button>
```

- [ ] **Step 4: Run unit tests and typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- composition-lock url-hash-sync
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both commands PASS after every new required prop has been supplied.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/popovers/body-type-popover.tsx packages/web/src/components/layer-stack/popovers/token-popover.tsx
git commit -m "feat(web): guard composition-changing actions"
```

---

### Task 4: Disable Layer, Search, Preset, and Reset Controls

**Files:**
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`
- Modify: `packages/web/src/components/layer-stack/preset-bar.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/add-layer.tsx`
- Modify: `packages/web/src/components/color-picker.tsx`

- [ ] **Step 1: Add the stack-panel disabled contract**

Add `disabled: boolean` to `StackPanel` props and destructuring. Pass
`disabled={disabled}` to `SidebarSearch`, `PresetBar`, every `LayerRow`, and
`AddLayer`. Do not pass it to `SettingsCollapsible` until Task 5 updates that
component's prop contract.

In the existing `StackPanel` invocation in `LayerStackHarness`, add
`disabled={isComposing}`.

- [ ] **Step 2: Disable sidebar search and result selection**

Add `disabled: boolean` to `SidebarSearch` props and destructuring.

Guard the local picker:

```ts
function onPick(result: PaletteResult) {
  if (disabled || !result.supports) return;
  dispatch(pickActionForItem(result.typeName, result.item));
  onPicked(result.typeName);
  setQuery('');
  setActiveIndex(-1);
  inputRef.current?.blur();
}
```

At the start of `onKeyDown`, add:

```ts
if (disabled) return;
```

Disable and style the search input:

```tsx
<input
  ref={inputRef}
  type="search"
  disabled={disabled}
  value={query}
  onChange={(event) => {
    setQuery(event.target.value);
    setActiveIndex(-1);
  }}
  onFocus={() => setIsFocused(true)}
  onKeyDown={onKeyDown}
  placeholder={t('palette.placeholder')}
  aria-label={t('palette.title')}
  className="flex-1 bg-transparent text-[12px] text-text outline-none disabled:cursor-not-allowed disabled:opacity-50"
/>
```

Change each result button to:

```tsx
disabled={disabled || !r.supports}
```

and include:

```ts
disabled ? 'cursor-not-allowed opacity-50' : ''
```

in its class list.

- [ ] **Step 3: Disable random and preset application**

Add `disabled: boolean` to `PresetBar` props and destructuring.

Set `disabled={disabled}` and disabled cursor/opacity classes on the random
button and preset trigger. Keep the reset trigger enabled so view-only and
filter-only resets remain reachable. Pass `disabled` to both popovers:

Add `disabled={disabled}` to the existing `PresetMenuPopover` and
`ResetMenuPopover` invocations.

Add `disabled: boolean` to `PresetMenuPopover`, then set every preset item:

```tsx
disabled={disabled}
```

and extend its classes with:

```ts
disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
```

- [ ] **Step 4: Keep view-only reset usable**

Add `disabled: boolean` to `ResetMenuPopover` props. Do not disable the
checkboxes or the popover trigger. Derive:

```ts
const compositionResetBlocked = disabled && outfit;
```

Change the confirm button to:

```tsx
disabled={compositionResetBlocked || (!outfit && !view && !filters)}
```

This permits view-only and filter-only reset while loading, but blocks any
combination that includes outfit reset.

- [ ] **Step 5: Disable active-layer mutations**

Add `disabled: boolean` to `LayerRow` props and destructuring.

Keep the row expansion button usable. The clear control is nested inside that
row button, so retain its current `span role="button"` structure rather than
creating invalid nested buttons. Add disabled semantics and guards:

```tsx
<span
  role="button"
  aria-disabled={disabled}
  tabIndex={disabled ? -1 : 0}
  onClick={(event) => {
    event.stopPropagation();
    if (disabled) return;
    dispatch({ type: 'clear', typeName });
  }}
  onKeyDown={(event) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dispatch({ type: 'clear', typeName });
    }
  }}
  className={[
    'rounded p-1 text-text-mute',
    disabled
      ? 'cursor-not-allowed opacity-50'
      : 'hover:bg-surface-3 hover:text-danger',
  ].join(' ')}
  aria-label={`Clear ${typeName}`}
>
  ✕
</span>
```

Change replacement item buttons to:

```tsx
disabled={disabled || !supports}
```

Pass `disabled={disabled}` to `ColorPicker`.

- [ ] **Step 6: Disable recolor and variant choices**

Add this prop to `ColorPicker`:

```ts
disabled?: boolean;
```

Default it in destructuring:

```ts
disabled = false,
```

Set `disabled={disabled}` on every recolor and variant button. Add
`disabled:cursor-not-allowed disabled:opacity-50` to both button class strings.

- [ ] **Step 7: Disable add-layer operations**

Add `disabled: boolean` to `AddLayer` props and destructuring.

On the collapsed add button, set:

```tsx
disabled={disabled}
```

and add:

```text
disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent
```

Keep the close button usable. For each category item, use:

```ts
const itemDisabled = disabled || !firstCompatible;
```

Then set:

```tsx
disabled={itemDisabled}
```

and use `itemDisabled` for the disabled class branch.

- [ ] **Step 8: Run typecheck and focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/web test -- composition-lock selection presets presets-apply sidebar-search-keyboard
```

Expected: both commands PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/sidebar-search.tsx packages/web/src/components/layer-stack/preset-bar.tsx packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx packages/web/src/components/layer-stack/layer-row.tsx packages/web/src/components/layer-stack/add-layer.tsx packages/web/src/components/color-picker.tsx
git commit -m "feat(web): disable layer controls while composing"
```

---

### Task 5: Disable Non-Reducer Composition Mutations

**Files:**
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Add the settings disabled contract**

Add `disabled: boolean` to `SettingsCollapsible` props and destructuring.
Pass `disabled={disabled}` from `StackPanel`.

Leave license and animation filter checkboxes enabled. Disable only the
buttons that remove selected layers:

```tsx
<Button
  size="sm"
  variant="primary"
  disabled={disabled}
  onClick={removeLicenseIncompatibleSelections}
  className="w-full"
>
```

```tsx
<Button
  size="sm"
  variant="primary"
  disabled={disabled}
  onClick={removeAnimationIncompatibleSelections}
  className="w-full"
>
```

Disable custom-overlay inputs:

```tsx
<input
  type="file"
  disabled={disabled}
  accept="image/*"
  onChange={(event) => {
    const file = event.currentTarget.files?.[0];
    if (file) onCustomOverlayUpload(file);
    event.currentTarget.value = '';
  }}
  className="block w-full text-[11px] text-text disabled:cursor-not-allowed disabled:opacity-50 file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[11px] file:text-text"
/>
```

```tsx
<input
  type="number"
  disabled={disabled}
  value={customOverlayZPos}
  onChange={(e) => onCustomOverlayZPosChange(e.currentTarget.value)}
  className="w-full rounded border border-border bg-app px-2 py-1 text-[11px] text-text disabled:cursor-not-allowed disabled:opacity-50"
/>
```

Set `disabled={disabled}` on the custom-overlay clear button.

- [ ] **Step 2: Guard non-reducer harness handlers**

At the beginning of each named handler in `harness.tsx`, insert the shown
guard and add `isComposing` to its dependency array:

```ts
if (isComposing) return;
```

Apply it to `clearCustomOverlay`, `handleCustomOverlayZPosChange`,
`handleCustomOverlayUpload`, and `handleForceReload`. The resulting callback
dependency arrays are `[isComposing, t]`, `[isComposing]`, and
`[customOverlayZPos, isComposing, t]` respectively; `handleForceReload`
remains a local function.

Move the `composeResult`/`isComposing` declarations above these callbacks so
their dependency arrays are valid. Keep hook order unconditional.

- [ ] **Step 3: Disable the reload button**

Change the reload button in `harness.tsx` to:

```tsx
<Button
  size="sm"
  variant="ghost"
  disabled={isComposing}
  onClick={handleForceReload}
  title={t('reload.title')}
  aria-label={t('reload.title')}
>
  ↻
</Button>
```

- [ ] **Step 4: Avoid composition-changing reset side effects**

Update `handleReset` so custom overlay clearing only occurs when outfit reset
is allowed:

```ts
const handleReset = ({
  outfit,
  view,
  filters,
}: {
  outfit: boolean;
  view: boolean;
  filters: boolean;
}) => {
  const allowedOutfit = outfit && !isComposing;
  if (allowedOutfit) {
    clearCustomOverlay();
  }
  if (allowedOutfit || view) {
    guardedDispatch({
      type: 'reset',
      scopes: { outfit: allowedOutfit, view },
      init: props.defaults,
    });
  }
  if (filters) {
    setLicenseFilter(ALL_LICENSE_GROUPS);
    setAnimationFilter(new Set<AnimationName>());
  }
  setStatus({ kind: 'info', text: 'Reset ✓' });
};
```

Remove the `props.onReset` call because it dispatches through `App.tsx` and
would bypass `guardedDispatch`. Remove `onReset` from
`LayerStackHarnessProps`, delete `handleReset` from `App.tsx`, and stop passing
the prop to `LayerStackHarness`.

- [ ] **Step 5: Run typecheck and focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/web test -- composition-lock custom-overlay selection
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/settings-collapsible.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/App.tsx
git commit -m "feat(web): lock composition side effects"
```

---

### Task 6: Browser Loading and Lock Coverage

**Files:**
- Create: `packages/web/e2e/composition-loading-lock.spec.ts`
- Modify: `packages/web/e2e/responsive-layout.spec.ts`

- [ ] **Step 1: Write the initial-load E2E test**

Create `packages/web/e2e/composition-loading-lock.spec.ts`:

```ts
import { expect, test, type Route } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';

function createZipGate() {
  let blocked = true;
  const pending = new Set<Route>();

  return {
    async handler(route: Route): Promise<void> {
      if (!blocked) {
        await route.continue();
        return;
      }
      pending.add(route);
    },
    async release(): Promise<void> {
      blocked = false;
      const routes = [...pending];
      pending.clear();
      await Promise.all(routes.map((route) => route.continue()));
    },
  };
}

test.describe('composition loading lock', () => {
  test('shows initial progress and locks composition controls', async ({ page }) => {
    const errors = attachConsoleCollector(page);
    const gate = createZipGate();
    await page.route('**/zips/*.zip', (route) => gate.handler(route));

    await page.goto('/');

    const overlay = page.getByTestId('composition-loading-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Loading character');
    await expect(overlay).toContainText(/\d+%/);
    await expect(page.getByRole('searchbox', { name: 'Search all assets…' })).toBeDisabled();
    await expect(page.getByTitle('Randomize outfit')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();

    await gate.release();

    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('searchbox', { name: 'Search all assets…' })).toBeEnabled();
    await expect(page.getByTitle('Randomize outfit')).toBeEnabled();
    expect(errors).toEqual([]);
  });
```

- [ ] **Step 2: Add subsequent-load retained-preview coverage**

Append the second test and close the `describe`:

```ts
  test('retains the old preview and locks presets during replacement composition', async ({
    page,
  }) => {
    const errors = attachConsoleCollector(page);
    await page.goto('/');

    const overlay = page.getByTestId('composition-loading-overlay');
    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pause' }).click();

    const previewCanvas = page.locator('main canvas').first();
    const before = await previewCanvas.evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    );

    const gate = createZipGate();
    await page.route('**/zips/*.zip', (route) => gate.handler(route));

    await page.getByRole('button', { name: 'Presets' }).click();
    await page.getByRole('menuitem', { name: /Farmer/ }).click();

    await expect(overlay).toBeVisible();
    await expect(page.getByRole('button', { name: 'Presets' })).toBeDisabled();
    await expect(page.getByTitle('Randomize outfit')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();

    const during = await previewCanvas.evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    );
    expect(during).toBe(before);

    await gate.release();

    await expect(overlay).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Presets' })).toBeEnabled();
    await expect(page.getByTitle('Randomize outfit')).toBeEnabled();
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the new E2E test and verify the intended red state**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e -- composition-loading-lock.spec.ts
```

Expected before all UI wiring is complete: FAIL on at least one disabled-state
or loading-overlay assertion. After Tasks 2-5 are complete: PASS.

- [ ] **Step 4: Make the existing reload E2E wait for readiness**

In the mobile test in `packages/web/e2e/responsive-layout.spec.ts`, replace:

```ts
await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
await page.getByTitle('Reload assets').click();
```

with:

```ts
await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({
  timeout: 30_000,
});
await page.getByTitle('Reload assets').click();
```

This prevents the test from clicking a correctly disabled reload button during
initial composition.

- [ ] **Step 5: Run browser coverage**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e -- composition-loading-lock.spec.ts responsive-layout.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/e2e/composition-loading-lock.spec.ts packages/web/e2e/responsive-layout.spec.ts
git commit -m "test(web): cover composition loading lock"
```

---

### Task 7: Full Verification

**Files:**
- Verify all files changed in Tasks 1-6.

- [ ] **Step 1: Run formatting and whitespace validation**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 2: Run the complete web unit suite**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [ ] **Step 3: Run strict TypeScript checks**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/core typecheck
```

Expected: both commands PASS.

- [ ] **Step 4: Run the relevant browser suite**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e -- composition-loading-lock.spec.ts responsive-layout.spec.ts zip-asset-source.spec.ts
```

Expected: PASS with no unexpected browser console errors.

- [ ] **Step 5: Inspect the final scope**

Run:

```bash
git status --short
git diff --stat HEAD~6
```

Expected: only the loading-overlay, composition-lock, affected UI, tests, and
plan files are changed. Existing untracked `.antigravitycli/`, `RTK.md`, and
`cache/` remain untouched.

- [ ] **Step 6: Commit any final test-only corrections**

If verification required a narrowly scoped correction, stage exactly the
files changed for that correction and commit them with:

```bash
git commit -m "test(web): finalize composition loading coverage"
```

If no correction was needed, do not create an empty commit.
