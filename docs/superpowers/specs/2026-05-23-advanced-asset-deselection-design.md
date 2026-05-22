# Advanced asset deselection

**Status:** approved
**Date:** 2026-05-23

## Goal

Give the user a way to cancel (deselect) a material picked from the
"Advanced: all upstream assets" tree. Add two entry points: click a
selected tree item again to toggle it off, and a new "Selected items"
panel in the right column that lists every active selection with a
remove button.

## Why

The advanced tree (`slice-harness.tsx:467-478`) dispatches `pick` on
every click. A selected item is highlighted but clicking it again only
re-`pick`s the same values — it never removes the selection. The only
existing deselect affordance is the `— None —` option in the "Common"
picker dropdowns, which covers just the 8 common type names (body,
head, hair, expression, eyes, torso, legs, feet).

So a material of any non-common type picked from the tree (weapon,
cape, hat, wings, ...) can never be removed through the UI. The `clear`
reducer action already exists (`selection.ts:57-61`); only the UI entry
points are missing.

## Scope

In scope:

- Advanced tree: clicking an already-selected item dispatches `clear`
  instead of `pick` (toggle-off). Picking a different item of the same
  type still replaces it, as today.
- A `title` hint on selected tree items so the toggle is discoverable.
- New "Selected items" panel in the right column, above the token
  block. Lists all current selections (common + advanced); each row has
  a ✕ button that clears that type.
- Two pure helpers in `slice/selection.ts`, unit tested.
- i18n entries for `en` and `zh-TW`.

Out of scope:

- The reducer. `clear` and `pick` already do everything needed.
- The "Common" picker dropdowns. Their `— None —` option stays as-is.
- `packages/core` and the `upstream/` submodule. Untouched.
- React component render tests. The repo has no component tests; the
  testable logic is extracted into pure helpers instead.
- Variant / recolor display in the panel. Rows show type + item name
  only.

## Design

### 1. Pure helpers (`packages/web/src/slice/selection.ts`)

Export the existing `COMMON_TYPE_ORDER` const (currently module-private)
so the panel can reuse the head-to-toe ordering.

Add `treeItemAction` — the toggle decision for a tree click:

```ts
import type { CatalogTreeItem } from './catalog-tree';

export function treeItemAction(
  selections: Readonly<Record<TypeName, Selection>>,
  item: CatalogTreeItem,
  def: ItemDefinition | undefined,
): SliceAction {
  if (selections[item.typeName]?.name === item.name) {
    return { type: 'clear', typeName: item.typeName };
  }
  return {
    type: 'pick',
    typeName: item.typeName,
    name: item.name,
    ...(def?.variants?.[0] ? { variant: def.variants[0] } : {}),
  };
}
```

`catalog-tree.ts` imports only from `@lpc-toolkit/core`, so the
type-only import of `CatalogTreeItem` introduces no import cycle.

Add `orderedSelectionEntries` — the panel's display order:

```ts
export function orderedSelectionEntries(
  selections: Readonly<Record<TypeName, Selection>>,
): [TypeName, Selection][] {
  const entries = Object.entries(selections).filter(
    ([, sel]) => sel.name,
  ) as [TypeName, Selection][];
  const rank = (tn: TypeName) => {
    const i = COMMON_TYPE_ORDER.indexOf(tn);
    return i === -1 ? COMMON_TYPE_ORDER.length : i;
  };
  return entries.sort(([a], [b]) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
}
```

Common types come first in their established order; any remaining
types follow, sorted alphabetically by raw `typeName` (deterministic
without needing the translator).

### 2. Advanced tree toggle (`packages/web/src/components/slice-harness.tsx`)

`pickTreeItem` delegates to the helper:

```ts
function pickTreeItem(item: CatalogTreeItem): void {
  const def = itemByTypeAndName.get(`${item.typeName}:${item.name}`);
  dispatch(treeItemAction(state.selections, item, def));
}
```

The tree button's `title` (currently `slice-harness.tsx:249-253`) gains
a selected case so the toggle behaviour is discoverable:

```ts
title={
  !compatible
    ? t('picker.incompatibleBodyType')
    : selected
      ? t('picker.clickToRemove')
      : tl.category(item.typeName)
}
```

`selected` is already computed in scope (`slice-harness.tsx:242-243`).
When a selected item is incompatible with the current body type its
button is `disabled` and cannot be toggled from the tree — the
right-column panel is the way to remove it in that case.

### 3. Selected items panel (`packages/web/src/components/selected-items-panel.tsx`)

New file, so the already-large `slice-harness.tsx` (~754 lines) does
not grow further.

```tsx
import type { Selection, TypeName } from '@lpc-toolkit/core';
import { orderedSelectionEntries, type SliceAction } from '../slice/selection';
import type { Translator, LabelTranslator } from '../i18n';

export function SelectedItemsPanel({
  selections,
  dispatch,
  t,
  tl,
}: {
  selections: Readonly<Record<TypeName, Selection>>;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  tl: LabelTranslator;
}) {
  const entries = orderedSelectionEntries(selections);
  return (
    <section className="border-b border-border pb-3">
      <h2 className="text-xs font-bold uppercase">{t('selected.title')}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-text-mute">{t('selected.empty')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {entries.map(([typeName, sel]) => (
            <li key={typeName} className="flex items-center gap-2 text-xs">
              <span className="flex-1">
                <span className="text-text-mute">
                  {tl.category(typeName)}:{' '}
                </span>
                <span>{tl.itemName(sel.name)}</span>
              </span>
              <button
                type="button"
                aria-label={`${t('selected.remove')} ${tl.itemName(sel.name)}`}
                className="rounded px-1 text-text-dim hover:text-danger"
                onClick={() => dispatch({ type: 'clear', typeName })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Wire it into the right `<aside>` of `SliceHarness`, immediately before
the token `<section>` (`slice-harness.tsx:533`):

```tsx
<SelectedItemsPanel
  selections={state.selections}
  dispatch={dispatch}
  t={t}
  tl={tl}
/>
```

### 4. i18n (`packages/web/src/i18n.ts`)

Add four keys to both the `en` and `zh-TW` blocks:

| key                    | en                      | zh-TW              |
| ---------------------- | ----------------------- | ------------------ |
| `selected.title`       | `Selected items`        | `已選素材`         |
| `selected.empty`       | `No items selected`     | `目前未選取任何素材` |
| `selected.remove`      | `Remove`                | `移除`             |
| `picker.clickToRemove` | `Click again to remove` | `再點一次可取消`   |

`i18n.test.ts` checks `en` / `zh-TW` key parity, so missing a locale
fails the test suite.

### 5. Tests (`packages/web/test/selection.test.ts`)

Extend the existing reducer test file with cases for the two helpers:

`treeItemAction`:

- Item not currently selected for its type → returns a `pick` action;
  includes `variant` when the `def` has `variants[0]`, omits it when
  not.
- Item is the current selection for its type → returns a `clear`
  action for that type.
- A different item of the same type is selected → returns a `pick`
  action (replace, not clear).

`orderedSelectionEntries`:

- Common types are ordered by `COMMON_TYPE_ORDER`, ahead of any
  non-common types.
- Non-common types follow, sorted alphabetically by `typeName`.
- Entries with an empty `name` are filtered out.
- Empty `selections` → empty array.

No component render tests, consistent with the rest of `packages/web`.

### 6. Manual smoke test

1. `pnpm --filter @lpc-toolkit/web dev`.
2. From the advanced tree, pick a non-common material (e.g. a weapon).
   Confirm it appears in the right-column "Selected items" panel.
3. Click that same tree item again → it is removed; panel row vanishes.
4. Pick it again, then click its ✕ in the panel → removed.
5. Confirm common picks (body, hair, ...) also show in the panel and
   their ✕ clears them, matching the `— None —` dropdown option.
6. Switch locale to `zh-TW`; verify the four new strings render.

## Verification

- `pnpm --filter @lpc-toolkit/web test` passes.
- No TypeScript errors (`pnpm -r typecheck` or equivalent).
- Manual smoke test passes in both locales.

## Risks

- **Toggle footgun.** Clicking a highlighted tree item to inspect it
  instead removes it. Mitigated by the `picker.clickToRemove` `title`
  hint and the existing highlight; the panel ✕ remains the explicit,
  unambiguous removal path.
