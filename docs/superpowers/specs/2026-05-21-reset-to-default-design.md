# Reset to default

**Status:** approved
**Date:** 2026-05-21

## Goal

Add a header button that lets the user restore the app's first-load
state. The user picks which categories to reset (outfit, view state,
filters) from a dropdown attached to the button, then confirms.

## Why

After experimenting with the pickers, users often want to start over.
Today the only way to clear the character is to manually re-pick or
clear each slot. The asset-source / language / theme toggles live in
the header alongside the pickers but there is no "back to defaults"
affordance for the actual character or view state.

## Scope

In scope:

- New `Reset` button in the header dropdown.
- Reset categories the user can opt into:
  - **Outfit**: `bodyType` and `selections` back to `pickInitialSelections`.
  - **View**: `anim` → `'walk'`, `dir` → `'down'`, `playing` → `true`.
  - **Filters**: `licenseFilter` → `null`, all-assets search input → `''`.
- New `reset` reducer action for outfit + view scopes.
- i18n entries for `en` and `zh-TW`.
- Unit tests for the reducer and integration tests for the menu.

Out of scope:

- Theme, locale, asset source. These are sticky app preferences and
  intentionally not reset.
- Per-picker (per-slot) reset icons. The dropdown is category-level.
- Confirmation modal. The two-click flow (check → "Reset selected")
  is the safety net.
- Keyboard shortcut. Can be added later if requested.

## Design

### 1. Reducer action (`packages/web/src/slice/selection.ts`)

Add to `SliceAction`:

```ts
| {
    type: 'reset';
    scopes: { outfit: boolean; view: boolean };
    init: SliceState;
  }
```

The reducer branch:

```ts
case 'reset': {
  const next = { ...s };
  if (a.scopes.outfit) {
    next.bodyType = a.init.bodyType;
    next.selections = a.init.selections;
  }
  if (a.scopes.view) {
    next.anim = a.init.anim;
    next.dir = a.init.dir;
    next.playing = a.init.playing;
  }
  return next;
}
```

`init` is the `SliceState` returned by `pickInitialSelections(catalog)`
in `App.tsx`. Passing it through the action keeps the reducer pure (it
does not need to import the catalog).

`Filters` is intentionally not handled by the reducer: license filter
and search input live in `SliceHarness` local state, not in
`SliceState`.

### 2. `App.tsx`

`init.state` is already memoized via `useMemo`. Add an `onReset` handler
that dispatches `{ type: 'reset', scopes, init: init.state }` and pass
it as a prop to `<SliceHarness>`.

### 3. `SliceHarness.tsx`

Header (`packages/web/src/components/slice-harness.tsx:262`): insert a
new `<ResetMenu>` immediately before the language `Button`, so the
order becomes `Reset · 中文/English · Light/Dark`.

`ResetMenu` is co-located in the same file (~50 lines):

- Trigger: a `Button` styled like the existing header buttons
  (`size="sm" variant="ghost"`), labelled `t('reset.button')`. Sets
  `aria-haspopup="menu"` and `aria-expanded`.
- Popover state via `useState<boolean>(false)`.
- Outside-click dismissal: a single `useEffect` with `document`
  `mousedown` listener; menu closes when the click is outside the
  popover root.
- `Escape` key also closes the popover.
- Popover content: a positioned `<div role="menu">` anchored under the
  button. Three `role="menuitemcheckbox"` rows for Outfit / View /
  Filters with `aria-checked`. Each row is a clickable `<button>` that
  toggles its checkbox-style indicator.
- Local state: `useState<{ outfit: boolean; view: boolean; filters: boolean }>`
  initialised to `{ outfit: true, view: false, filters: false }`.
- Footer row: `Reset selected` primary button (disabled when all three
  are false) and a `Cancel` ghost button.
- On confirm: if `filters` is checked, call the harness's
  `setLicenseFilter(null)` and the all-assets picker's search-state
  setter (whichever name it uses today). Then call
  `onReset({ outfit, view })`. Finally close the popover.
- On cancel: reset the local checkbox state to defaults and close.
- On re-open: local checkbox state resets to defaults (`Outfit` only).

Props from `SliceHarness` into `ResetMenu`:

- `t: Translator`
- `onReset: (scopes: { outfit: boolean; view: boolean }) => void`
- `onResetLicenseFilter: () => void` — wraps `setLicenseFilter(null)`
- `onResetSearch: () => void` — wraps `setAssetSearch('')` (the
  all-assets search state defined at
  `packages/web/src/components/slice-harness.tsx:84`)

No new dependency. The existing toolbar (language / theme / asset
source) is also hand-rolled with Tailwind + the shadcn `Button`, so
this keeps the style consistent.

### 4. i18n (`packages/web/src/i18n.ts`)

Add seven keys per locale:

| key                  | en                 | zh-TW              |
| -------------------- | ------------------ | ------------------ |
| `reset.button`       | `Reset`            | `重置`             |
| `reset.menuTitle`    | `What to reset`    | `要重置的項目`     |
| `reset.scope.outfit` | `Outfit`           | `服裝`             |
| `reset.scope.view`   | `View`             | `檢視`             |
| `reset.scope.filters`| `Filters`          | `篩選`             |
| `reset.confirm`      | `Reset selected`   | `重置選取項目`     |
| `reset.cancel`       | `Cancel`           | `取消`             |

`reset.menuTitle` is used both as the popover heading and as
`aria-label` on the menu container.

### 5. Tests

**Reducer** (`packages/web/src/slice/selection.test.ts` — extend the
existing test file if present, otherwise create one alongside other
slice tests):

- Build a `init` `SliceState` (e.g., from `pickInitialSelections` on a
  fixture catalog) and a `mutated` state (different body type, custom
  hair pick, `paused`, facing `left`, anim `idle`).
- `reset` with `{ outfit: true, view: false }` from `mutated` →
  `bodyType` and `selections` match `init`; `anim`/`dir`/`playing` are
  untouched.
- `reset` with `{ outfit: false, view: true }` → `anim`/`dir`/`playing`
  match `init`; outfit untouched.
- `reset` with both true → all four fields match `init`.
- `reset` with both false → returned state deep-equals input (no-op).

**Menu** (extend `slice-harness.test.tsx` if it exists, otherwise add
one):

- Menu is closed by default; clicking the `Reset` button opens it.
- `Outfit` checkbox is checked by default; `View` and `Filters` are
  not.
- `Reset selected` is disabled when all three are unchecked, enabled
  otherwise.
- Clicking outside the popover closes it without dispatching a reset.
- `Escape` closes it without dispatching a reset.
- With `Filters` checked and confirmed: license filter `<select>`
  returns to the "All licenses" option and the all-assets search input
  becomes empty.
- aria: button has `aria-haspopup="menu"`, menu has `role="menu"`,
  items have `role="menuitemcheckbox"` with correct `aria-checked`.

**Manual smoke test:**

1. `pnpm --filter @lpc-toolkit/web dev`.
2. Change a few outfit pieces, change animation to `idle` and direction
   to `left`, pause, set a license filter, type a query into the
   all-assets search.
3. Open `Reset`, leave only `Outfit` checked, confirm. → Character is
   back to defaults; animation, direction, paused state, filter, and
   search are unchanged.
4. Repeat with all three checked. → Everything reverts.
5. Switch locale to `zh-TW`; verify all seven labels render.

## Verification

- `pnpm --filter @lpc-toolkit/web test` passes.
- Manual smoke test above passes in both locales.
- No TypeScript errors (`pnpm -r typecheck` or equivalent).

## Risks

- **Popover positioning.** Hand-rolled absolute positioning may clip
  on narrow viewports. Acceptable for now since the existing toolbar
  is also fixed-width and the popover is small (~220px wide).
