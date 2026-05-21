# Match Upstream Default Selections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `pickInitialSelections`'s "first catalog item per preferred type" heuristic with a stable itemId lookup that selects the same 3-item starting outfit (body + head + face, all `light`) as the upstream Universal LPC Spritesheet Character Generator.

**Architecture:** A single source-file change in `packages/web/src/slice/selection.ts` (the `pickInitialSelections` function + its doc comment), plus a rewrite of its unit test. The function signature, its callers (`App.tsx`, `copy-spritesheets.ts`), and the `SliceState` shape are unchanged. The full catalog is always available at runtime (loaded via Vite glob from the full `upstream/sheet_definitions/`), so the new lookup-by-itemId can throw on missing items with confidence — missing means a real bug.

**Tech Stack:** TypeScript (strict), Vitest, pnpm workspaces. Lives in `packages/web/`.

**Spec:** `docs/superpowers/specs/2026-05-21-match-upstream-defaults-design.md`

---

## File structure

- **Modify** `packages/web/src/slice/selection.ts:100-164` — replace the `PREFERRED` constant + `supportsBodyType` helper + `pickInitialSelections` body. Constants for default itemIds and recolor live in this file, scoped to the function's concern.
- **Modify** `packages/web/test/selection.test.ts:1-47` — rewrite the catalog fixture and the `pickInitialSelections` describe block. Other describes (`toSelections`, `sliceReducer`) are unchanged.

No new files. No changes to:
- `packages/web/scripts/copy-spritesheets.ts` (still calls `pickInitialSelections`, picks the same 3 items now; the DETERMINISM CONTRACT comment becomes redundant but stays — it documents prior intent and still holds trivially).
- `packages/web/test/integration.test.ts` (the `pickInitialSelections determinism` describe still passes — itemId lookup is trivially order-independent).
- `packages/core/src/*` (Selection type already supports optional `recolor`).
- `packages/web/src/App.tsx` (uses the function's return tuple unchanged).

---

## Task 1: Rewrite the unit test (RED)

**Files:**
- Modify: `packages/web/test/selection.test.ts`

The current test fixture uses synthetic items (`Body A`, `Hair A`) and asserts the "first-item-per-type" behavior. The new test needs upstream-aligned itemIds and asserts recolors + the missing-item throw.

- [ ] **Step 1.1: Replace the catalog fixture and `pickInitialSelections` describe block**

Open `packages/web/test/selection.test.ts` and replace lines 24–47 (the `const { catalog } = createCatalog({...})` block and the first `describe(...)` block) with:

```ts
function makeFullCatalog() {
  return createCatalog({
    'body.json': defn('Body Color', 'body'),
    'heads_human_male.json': defn('Human Male', 'head'),
    'face_neutral.json': defn('Neutral', 'expression'),
    'hair_a.json': defn('Hair A', 'hair'),
  }).catalog;
}

describe('pickInitialSelections', () => {
  it('selects body + heads_human_male + face_neutral with light recolor', () => {
    const { state } = pickInitialSelections(makeFullCatalog());
    expect(state.bodyType).toBe('male');
    expect(state.selections['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'light',
    });
    expect(state.selections['head']).toEqual({
      typeName: 'head',
      name: 'Human Male',
      recolor: 'light',
    });
    expect(state.selections['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
      recolor: 'light',
    });
    expect(state.anim).toBe('walk');
    expect(state.dir).toBe('down');
    expect(state.playing).toBe(true);
  });

  it('does not pre-select hair / eyes / torso / legs / feet', () => {
    const { state } = pickInitialSelections(makeFullCatalog());
    expect(state.selections['hair']).toBeUndefined();
    expect(state.selections['eyes']).toBeUndefined();
    expect(state.selections['torso']).toBeUndefined();
    expect(state.selections['legs']).toBeUndefined();
    expect(state.selections['feet']).toBeUndefined();
  });

  it('exposes body / head / hair / expression in shownTypeNames so the Common picker shows them', () => {
    const { shownTypeNames } = pickInitialSelections(makeFullCatalog());
    expect(shownTypeNames).toContain('body');
    expect(shownTypeNames).toContain('head');
    expect(shownTypeNames).toContain('expression');
    expect(shownTypeNames).toContain('hair');
    // Order: defaults first, then the remaining "common" types in the
    // declared order.
    expect(shownTypeNames.indexOf('body')).toBeLessThan(
      shownTypeNames.indexOf('head'),
    );
    expect(shownTypeNames.indexOf('head')).toBeLessThan(
      shownTypeNames.indexOf('hair'),
    );
    expect(shownTypeNames.indexOf('hair')).toBeLessThan(
      shownTypeNames.indexOf('expression'),
    );
  });

  it('omits common types whose catalog lookup is empty', () => {
    const { catalog } = createCatalog({
      'body.json': defn('Body Color', 'body'),
      'heads_human_male.json': defn('Human Male', 'head'),
      'face_neutral.json': defn('Neutral', 'expression'),
    });
    const { shownTypeNames } = pickInitialSelections(catalog);
    expect(shownTypeNames).not.toContain('hair');
    expect(shownTypeNames).not.toContain('legs');
  });

  it('throws when a required default itemId is missing from the catalog', () => {
    const { catalog } = createCatalog({
      'body.json': defn('Body Color', 'body'),
      'face_neutral.json': defn('Neutral', 'expression'),
      // heads_human_male intentionally absent
    });
    expect(() => pickInitialSelections(catalog)).toThrowError(
      /heads_human_male/,
    );
  });
});
```

Keep the existing `describe('toSelections', ...)` and `describe('sliceReducer', ...)` blocks below this unchanged.

- [ ] **Step 1.2: Run the new tests and confirm they fail**

```bash
pnpm --filter @lpc-toolkit/web test -- selection.test.ts
```

Expected: the four `pickInitialSelections` tests FAIL. Failure modes will look like:
- "expected `{typeName: 'body', name: 'Body Color'}` to deeply equal `{typeName: 'body', name: 'Body Color', recolor: 'light'}`" — current code does not set `recolor`.
- The missing-item test will FAIL because current code does not throw (it silently falls back when an itemId isn't found, since it iterates `byTypeName` not `byItemId`).
- `toSelections` and `sliceReducer` tests still PASS.

The `pretest` hook runs `copy-spritesheets.ts` first; that uses the still-old `pickInitialSelections` (untouched code) and should succeed. If `pretest` fails for an unrelated reason (e.g. missing submodule), fix that first.

- [ ] **Step 1.3: Do NOT commit yet**

Tests are red; commit after the implementation lands in Task 2.

---

## Task 2: Implement the new `pickInitialSelections` (GREEN)

**Files:**
- Modify: `packages/web/src/slice/selection.ts`

Replace the `PREFERRED` constant, the `supportsBodyType` helper, and the `pickInitialSelections` function (lines 100–164 in the current file) in one edit.

- [ ] **Step 2.1: Replace lines 100–164 of `packages/web/src/slice/selection.ts`**

The text to remove starts at:

```ts
const PREFERRED: readonly TypeName[] = [
  'body',
  'head',
  'hair',
  'eyes',
  'torso',
  'legs',
  'feet',
];

function supportsBodyType(item: ItemDefinition, bt: BodyType): boolean {
  return typeof item.layer_1?.[bt] === 'string';
}

/**
 * Derive a known-good starting outfit from the live catalog (spec deviation
 * ...
 */
export function pickInitialSelections(catalog: Catalog): {
  state: SliceState;
  shownTypeNames: TypeName[];
} {
  // ...existing body...
}
```

…and ends at the closing `}` of `pickInitialSelections` (line 164).

Replace with:

```ts
/**
 * itemId (filename minus `.json`) of each default the upstream generator
 * pre-selects on first load. Keyed by the `type_name` field each item
 * declares so the lookup result can be assigned straight into selections.
 *
 * Source: upstream `selectDefaults()` at
 * `upstream/sources/state/state.ts:161`.
 */
const DEFAULT_ITEM_IDS = {
  body: 'body',
  head: 'heads_human_male',
  expression: 'face_neutral',
} as const;

const DEFAULT_RECOLOR = 'light';

const DEFAULT_BODY_TYPE: BodyType = 'male';

/**
 * Common-picker order. `expression` is slotted next to its visual
 * neighbours (head/hair); the other entries preserve the previous flat
 * head-to-toe order. Types with no defaults (hair/eyes/torso/legs/feet)
 * render as empty selectors the user can pick into. A type-name is
 * included only if the catalog has at least one item of that type, so
 * pared-down test catalogs still work.
 */
const COMMON_TYPE_ORDER: readonly TypeName[] = [
  'body',
  'head',
  'hair',
  'expression',
  'eyes',
  'torso',
  'legs',
  'feet',
];

/**
 * Build the initial outfit matching the upstream generator's defaults:
 * male body + `heads_human_male` + `face_neutral`, all with the `light`
 * recolor. Items are looked up by stable itemId (the JSON filename), so
 * the result is independent of catalog insertion order.
 *
 * Throws if any of the three required items is missing from the catalog
 * — that means a real bundling bug, not a runtime fallback case.
 */
export function pickInitialSelections(catalog: Catalog): {
  state: SliceState;
  shownTypeNames: TypeName[];
} {
  const selections: Record<TypeName, Selection> = {};
  for (const [typeName, itemId] of Object.entries(DEFAULT_ITEM_IDS) as [
    TypeName,
    string,
  ][]) {
    const item = catalog.byItemId.get(itemId);
    if (!item) {
      throw new Error(
        `pickInitialSelections: missing required default item "${itemId}" in catalog`,
      );
    }
    selections[typeName] = {
      typeName,
      name: item.name,
      recolor: DEFAULT_RECOLOR,
    };
  }

  const shownTypeNames = COMMON_TYPE_ORDER.filter(
    (tn) => (catalog.byTypeName.get(tn) ?? []).length > 0,
  );

  return {
    state: {
      bodyType: DEFAULT_BODY_TYPE,
      selections,
      anim: 'walk',
      dir: 'down',
      playing: true,
    },
    shownTypeNames,
  };
}
```

- [ ] **Step 2.2: Remove the now-unused `BODY_TYPES` import**

After Step 2.1, `BODY_TYPES` is no longer referenced inside `selection.ts` (we hard-code `'male'`). Open the import block at the top of `packages/web/src/slice/selection.ts` and remove `BODY_TYPES` from the import list. Final import block:

```ts
import {
  type AnimationName,
  type BodyType,
  type Catalog,
  type Direction,
  type ItemDefinition,
  type Selection,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
```

Note: `ItemDefinition` is no longer referenced after removing `supportsBodyType`, but `selectionForItem` (still exported above) takes an `ItemDefinition` parameter — keep the type import.

- [ ] **Step 2.3: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: clean (no errors). If you see "unused import" complaints from a stricter rule, prune accordingly; the project's tsconfig in strict mode does not normally flag unused type-only imports.

- [ ] **Step 2.4: Run the unit tests and confirm GREEN**

```bash
pnpm --filter @lpc-toolkit/web test -- selection.test.ts
```

Expected: all `pickInitialSelections`, `toSelections`, and `sliceReducer` tests PASS.

- [ ] **Step 2.5: Run the full web test suite**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all tests PASS, including:
- `integration.test.ts` → `pickInitialSelections determinism` (passes trivially — itemId lookup is order-independent).
- `integration.test.ts` → `core pipeline (real assets)` (composes the new 3-item outfit; sheet dimensions and credits assertions still hold because the new outfit is a subset of what was previously composed).

If `core pipeline (real assets)` fails on a recolor-resolution path because `light` isn't recognized on one of the 3 items, that's the risk called out in the spec — stop and investigate before continuing. Most likely cause: the `recolor` field on the resolved Selection needs to match a `version` name in the item's palette, and `light` should be valid for all three upstream defaults.

- [ ] **Step 2.6: Commit test + implementation together**

```bash
git add packages/web/src/slice/selection.ts packages/web/test/selection.test.ts
git commit -m "$(cat <<'EOF'
feat(web): match upstream default selections

Replace the first-item-per-type heuristic with a stable itemId lookup
that selects body + heads_human_male + face_neutral, all with the
"light" recolor — matching the starting character the upstream
Universal LPC Spritesheet Character Generator ships. Also adds
"expression" to the Common picker so users can change/clear the face.

EOF
)"
```

---

## Task 3: Visual verification in the dev server

The unit tests prove the function returns the right data, and the integration test proves the composed sheet has the right dimensions. Neither confirms the pixels rendered for a user opening the app match upstream. This task is manual.

- [ ] **Step 3.1: Rebuild the bundled sprite subset**

```bash
pnpm --filter @lpc-toolkit/web copy-sprites
```

Expected: prints `[copy-sprites] N dir(s), ~X.X MB -> public/spritesheets/`. The new subset includes Pass A across all body types for the new default outfit, plus Pass B for every item of every shown type-name (now including `expression`) at the male body type.

If the script fails with a missing-itemId error from `pickInitialSelections`, that means `upstream/` is missing one of the three default items — verify the submodule is up-to-date with `git submodule status` from the repo root.

- [ ] **Step 3.2: Start the dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```

Open the URL printed by Vite (typically `http://localhost:5173/`) in a **clean tab with no URL hash** (the hash carries encoded selections that override defaults).

- [ ] **Step 3.3: Verify the starting character**

Check all of:
- Body type selector shows `male`.
- The character renders with a light skin tone (body).
- The head is "Human Male" in light tone.
- The face shows the "Neutral" expression.
- No hair, no shirt/torso, no pants/legs, no shoes/feet are drawn.
- The "Common" picker on the left exposes sliders for body, head, hair, expression, eyes, torso, legs, feet in that order. The body/head/expression sliders show the correct value; the others are empty.

For a side-by-side: open `https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/` in another tab with no hash. The two characters should match pixel-for-pixel in the preview area (modulo zoom/animation phase).

- [ ] **Step 3.4: Verify hash-encoded URLs still override defaults**

In the dev server tab, change the body type or pick a hair item. The URL should update with a hash. Copy the URL, open it in a fresh tab. The character should load with the encoded selections, not the defaults. (This proves we haven't regressed the `apply_selections` reducer path.)

- [ ] **Step 3.5: Stop the dev server**

Ctrl-C in the terminal running `pnpm dev`.

- [ ] **Step 3.6: Commit the regenerated `public/spritesheets/` subset**

The copy-sprites step rewrote `packages/web/public/spritesheets/`. Check what changed:

```bash
git status packages/web/public/spritesheets/
```

If files were added (likely: any `expression`-typed sprites that weren't previously bundled, plus any new male-variant sprites for the new defaults), commit them:

```bash
git add packages/web/public/spritesheets/
git commit -m "$(cat <<'EOF'
chore(web): refresh bundled sprite subset for new defaults

Regenerated by `pnpm --filter @lpc-toolkit/web copy-sprites` after
pickInitialSelections changed.

EOF
)"
```

If `git status` shows no changes, skip this commit — the previous heuristic happened to bundle the same set.

---

## Task 4: Final sanity check

- [ ] **Step 4.1: Run the full test suite once more from a clean state**

```bash
pnpm --filter @lpc-toolkit/web test
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both green. The `pretest` hook re-runs `copy-sprites`, which calls the new `pickInitialSelections` against the full upstream catalog and succeeds.

- [ ] **Step 4.2: Confirm the branch state**

```bash
git log --oneline -5
git status
```

Expected:
- Two new commits on top (one `feat(web): match upstream default selections`, optionally one `chore(web): refresh bundled sprite subset...`).
- Working tree clean.

Done. The plan does not push or open a PR — that's the user's call.
