# Advanced Asset Deselection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user cancel a material picked from the advanced "all upstream assets" tree, via click-to-toggle in the tree and a new "Selected items" panel in the right column.

**Architecture:** Two pure helpers in `slice/selection.ts` carry the toggle decision and the panel ordering, so they are unit-testable without rendering. The advanced tree's click handler delegates to one helper; a new `SelectedItemsPanel` component renders the other. The `clear` / `pick` reducer actions already exist and are unchanged.

**Tech Stack:** TypeScript (strict), React 18, Vite, Tailwind, vitest.

---

## File Structure

- `packages/web/src/slice/selection.ts` — **modify.** Export the existing `COMMON_TYPE_ORDER`; add pure helpers `orderedSelectionEntries` and `treeItemAction`.
- `packages/web/test/selection.test.ts` — **modify.** Add unit tests for the two new helpers.
- `packages/web/src/i18n.ts` — **modify.** Add four translation keys to the `en` and `zh-TW` blocks.
- `packages/web/test/i18n.test.ts` — **modify.** Add a key-presence test for the new keys.
- `packages/web/src/components/selected-items-panel.tsx` — **create.** The right-column "Selected items" panel component.
- `packages/web/src/components/slice-harness.tsx` — **modify.** Mount the panel; route advanced-tree clicks through `treeItemAction`; add a `title` hint on selected tree items.

---

## Task 1: `orderedSelectionEntries` helper

Returns the current selections as ordered `[typeName, Selection]` pairs for the "Selected items" panel: common types first in head-to-toe order, then any other types alphabetically.

**Files:**
- Modify: `packages/web/src/slice/selection.ts`
- Test: `packages/web/test/selection.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/web/test/selection.test.ts`, change the import from `../src/slice/selection` to add `orderedSelectionEntries`:

```ts
import {
  orderedSelectionEntries,
  pickInitialSelections,
  sliceReducer,
  toSelections,
  type SliceState,
} from '../src/slice/selection';
```

Then append this `describe` block at the end of the file:

```ts
describe('orderedSelectionEntries', () => {
  it('orders common types head-to-toe, ahead of non-common types', () => {
    const entries = orderedSelectionEntries({
      weapon: { typeName: 'weapon', name: 'Sword' },
      hair: { typeName: 'hair', name: 'Hair A' },
      body: { typeName: 'body', name: 'Body A' },
    });
    expect(entries.map(([tn]) => tn)).toEqual(['body', 'hair', 'weapon']);
  });

  it('sorts non-common types alphabetically by typeName', () => {
    const entries = orderedSelectionEntries({
      wings: { typeName: 'wings', name: 'Wings A' },
      cape: { typeName: 'cape', name: 'Cape A' },
    });
    expect(entries.map(([tn]) => tn)).toEqual(['cape', 'wings']);
  });

  it('drops entries with an empty name', () => {
    const entries = orderedSelectionEntries({
      body: { typeName: 'body', name: 'Body A' },
      hair: { typeName: 'hair', name: '' },
    });
    expect(entries.map(([tn]) => tn)).toEqual(['body']);
  });

  it('returns an empty array for empty selections', () => {
    expect(orderedSelectionEntries({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test selection`
Expected: FAIL — `orderedSelectionEntries` is not exported from `../src/slice/selection`.

- [ ] **Step 3: Implement the helper**

In `packages/web/src/slice/selection.ts`, find this line (currently ~line 149):

```ts
const COMMON_TYPE_ORDER: readonly TypeName[] = [
```

and change it to export the const:

```ts
export const COMMON_TYPE_ORDER: readonly TypeName[] = [
```

Then append this function at the end of the file:

```ts
/**
 * The selections as `[typeName, Selection]` pairs in the order the
 * "Selected items" panel renders them: common types first in their
 * head-to-toe order, then any remaining types alphabetically by
 * `typeName`. Entries with an empty `name` are dropped.
 */
export function orderedSelectionEntries(
  selections: Readonly<Record<TypeName, Selection>>,
): [TypeName, Selection][] {
  const entries = Object.entries(selections).filter(
    ([, sel]) => sel.name,
  ) as [TypeName, Selection][];
  const rank = (tn: TypeName): number => {
    const i = COMMON_TYPE_ORDER.indexOf(tn);
    return i === -1 ? COMMON_TYPE_ORDER.length : i;
  };
  return entries.sort(([a], [b]) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test selection`
Expected: PASS — all `orderedSelectionEntries` cases plus the pre-existing tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/slice/selection.ts packages/web/test/selection.test.ts
git commit -m "feat(web): add orderedSelectionEntries selection helper"
```

---

## Task 2: `treeItemAction` helper

Decides which `SliceAction` an advanced-tree click should dispatch: `clear` when the item is already the selection for its type (toggle off), otherwise `pick`.

**Files:**
- Modify: `packages/web/src/slice/selection.ts`
- Test: `packages/web/test/selection.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/web/test/selection.test.ts`, update the import from `../src/slice/selection` to add `treeItemAction`:

```ts
import {
  orderedSelectionEntries,
  pickInitialSelections,
  sliceReducer,
  toSelections,
  treeItemAction,
  type SliceState,
} from '../src/slice/selection';
```

Then append this `describe` block at the end of the file:

```ts
describe('treeItemAction', () => {
  const item = { id: 'sword_a', name: 'Sword', typeName: 'weapon' };

  it('returns a pick action when the item is not selected', () => {
    const action = treeItemAction({}, item, undefined);
    expect(action).toEqual({
      type: 'pick',
      typeName: 'weapon',
      name: 'Sword',
    });
  });

  it('includes the first variant when the definition has variants', () => {
    const def = { variants: ['steel', 'iron'] } as unknown as ItemDefinition;
    const action = treeItemAction({}, item, def);
    expect(action).toEqual({
      type: 'pick',
      typeName: 'weapon',
      name: 'Sword',
      variant: 'steel',
    });
  });

  it('returns a clear action when the item is the current selection', () => {
    const action = treeItemAction(
      { weapon: { typeName: 'weapon', name: 'Sword' } },
      item,
      undefined,
    );
    expect(action).toEqual({ type: 'clear', typeName: 'weapon' });
  });

  it('returns a pick action when a different item of the same type is selected', () => {
    const action = treeItemAction(
      { weapon: { typeName: 'weapon', name: 'Axe' } },
      item,
      undefined,
    );
    expect(action).toEqual({
      type: 'pick',
      typeName: 'weapon',
      name: 'Sword',
    });
  });
});
```

`ItemDefinition` is already imported at the top of `selection.test.ts` — no import change needed for it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test selection`
Expected: FAIL — `treeItemAction` is not exported from `../src/slice/selection`.

- [ ] **Step 3: Implement the helper**

In `packages/web/src/slice/selection.ts`, add this import immediately after the existing `@lpc-toolkit/core` import block (after the line `} from '@lpc-toolkit/core';`):

```ts
import type { CatalogTreeItem } from './catalog-tree';
```

Then append this function at the end of the file:

```ts
/**
 * The `SliceAction` an advanced-tree click should dispatch. Clicking the
 * item already selected for its type toggles it off (`clear`); any other
 * click selects it (`pick`), replacing whatever was selected for that
 * type.
 */
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

`catalog-tree.ts` imports only from `@lpc-toolkit/core`, so this type-only import introduces no cycle.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test selection`
Expected: PASS — all `treeItemAction` cases plus the pre-existing tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/slice/selection.ts packages/web/test/selection.test.ts
git commit -m "feat(web): add treeItemAction toggle helper"
```

---

## Task 3: i18n keys

Add the four strings the panel and the tree hint need, to both locales.

**Files:**
- Modify: `packages/web/src/i18n.ts`
- Test: `packages/web/test/i18n.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/web/test/i18n.test.ts`, inside the `describe('i18n', ...)` block, add this test immediately after the `includes outfit preset keys in both locales` test:

```ts
  it('includes selected-items keys in both locales', () => {
    const keys = [
      'selected.title',
      'selected.empty',
      'selected.remove',
      'picker.clickToRemove',
    ];
    for (const key of keys) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(key);
      expect(Object.keys(TRANSLATIONS['zh-TW'])).toContain(key);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test i18n`
Expected: FAIL — `selected.title` / `selected.empty` / `selected.remove` / `picker.clickToRemove` are not in `TRANSLATIONS`.

- [ ] **Step 3: Add the keys**

In `packages/web/src/i18n.ts`, in the **`en`** block, add `picker.clickToRemove` right after the `'picker.incompatibleBodyType'` line:

```ts
    'picker.incompatibleBodyType': 'Not available for current body type',
    'picker.clickToRemove': 'Click again to remove',
```

Still in the **`en`** block, add the three `selected.*` keys right after the last `'preset.skipped'` line (keep them as the final entries of the block, before the closing `},`):

```ts
    'preset.skipped': 'skipped',
    'selected.title': 'Selected items',
    'selected.empty': 'No items selected',
    'selected.remove': 'Remove',
```

In the **`zh-TW`** block, add `picker.clickToRemove` right after the `'picker.incompatibleBodyType'` line:

```ts
    'picker.incompatibleBodyType': '不支援目前身形',
    'picker.clickToRemove': '再點一次可取消',
```

Still in the **`zh-TW`** block, add the three `selected.*` keys right after the last `'preset.skipped'` line:

```ts
    'preset.skipped': '已略過',
    'selected.title': '已選素材',
    'selected.empty': '目前未選取任何素材',
    'selected.remove': '移除',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lpc-toolkit/web test i18n`
Expected: PASS — the new test passes and `keeps English and Chinese translation keys in sync` still passes (both locales got all four keys).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "feat(web): add i18n keys for selected-items panel"
```

---

## Task 4: `SelectedItemsPanel` component + mount

Create the right-column panel and mount it above the token block. No render test — `packages/web` has no component tests; the panel's logic lives in `orderedSelectionEntries`, already tested in Task 1.

**Files:**
- Create: `packages/web/src/components/selected-items-panel.tsx`
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Create the component**

Create `packages/web/src/components/selected-items-panel.tsx` with this exact content:

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
            <li
              key={typeName}
              className="flex items-center gap-2 text-xs"
            >
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

- [ ] **Step 2: Mount the component in `slice-harness.tsx`**

In `packages/web/src/components/slice-harness.tsx`, add this import after the existing `Button` import (`import { Button } from './ui/button';`):

```ts
import { SelectedItemsPanel } from './selected-items-panel';
```

Then find the start of the right `<aside>` and its token section:

```tsx
        <aside className="scroll border-l border-border p-3">
          <section className="border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase">
              {t('token.title')}
            </h2>
```

and insert `<SelectedItemsPanel>` as the first child of the `<aside>`:

```tsx
        <aside className="scroll border-l border-border p-3">
          <SelectedItemsPanel
            selections={state.selections}
            dispatch={dispatch}
            t={t}
            tl={tl}
          />
          <section className="border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase">
              {t('token.title')}
            </h2>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full web test suite**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS — no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/selected-items-panel.tsx packages/web/src/components/slice-harness.tsx
git commit -m "feat(web): add selected-items panel to slice harness"
```

---

## Task 5: Advanced tree toggle-to-deselect

Route advanced-tree clicks through `treeItemAction` so clicking a selected item removes it, and add the discoverability `title` hint.

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Import `treeItemAction`**

In `packages/web/src/components/slice-harness.tsx`, update the import from `../slice/selection`:

```ts
import {
  toSelections,
  treeItemAction,
  type SliceState,
  type SliceAction,
} from '../slice/selection';
```

- [ ] **Step 2: Route `pickTreeItem` through the helper**

Replace the existing `pickTreeItem` function:

```ts
  function pickTreeItem(item: CatalogTreeItem): void {
    const def = itemByTypeAndName.get(`${item.typeName}:${item.name}`);
    dispatch({
      type: 'pick',
      typeName: item.typeName,
      name: item.name,
      ...(def?.variants?.[0] ? { variant: def.variants[0] } : {}),
    });
  }
```

with:

```ts
  function pickTreeItem(item: CatalogTreeItem): void {
    const def = itemByTypeAndName.get(`${item.typeName}:${item.name}`);
    dispatch(treeItemAction(state.selections, item, def));
  }
```

- [ ] **Step 3: Add the `title` hint on selected tree items**

In the same file, in the tree-item `<button>` inside `renderTreeNode`, replace the `title` prop:

```tsx
                    title={
                      !compatible
                        ? t('picker.incompatibleBodyType')
                        : tl.category(item.typeName)
                    }
```

with:

```tsx
                    title={
                      !compatible
                        ? t('picker.incompatibleBodyType')
                        : selected
                          ? t('picker.clickToRemove')
                          : tl.category(item.typeName)
                    }
```

`selected` and `compatible` are already computed just above this `<button>` in `renderTreeNode`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full web test suite**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx
git commit -m "feat(web): toggle-deselect advanced tree items"
```

---

## Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS — all suites, including the new `orderedSelectionEntries`, `treeItemAction`, and `includes selected-items keys` tests.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run `pnpm --filter @lpc-toolkit/web dev` and in the browser:

1. From the advanced tree, pick a non-common material (e.g. a weapon). It appears in the right-column "Selected items" panel.
2. Click that same tree item again → it is removed; its panel row disappears.
3. Pick it again, then click its ✕ in the panel → removed.
4. Confirm common picks (body, hair, …) also appear in the panel and their ✕ clears them, matching the `— none —` dropdown option.
5. Hover a selected tree item → tooltip reads "Click again to remove".
6. Switch locale to 中文 → the panel title, empty text, remove label, and tree tooltip render in Traditional Chinese.

Expected: all six steps behave as described.
