# Random Variant Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make random outfits include default physical variants and add a real-catalog regression audit for random-covered variant sprite paths.

**Architecture:** Reuse the existing web selection helper so random selections follow the same default-variant contract as manual item picks. Add focused tests in the web package: one synthetic unit test for random selection shape and one real-catalog audit that loads `assets/sheet_definitions` and verifies representative sprite paths under `assets/spritesheets`.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest Node environment, existing `@lpc-toolkit/core` source alias.

---

## File Structure

- Modify `packages/web/src/slice/random-outfit.ts`
  - Responsibility: choose random compatible items and emit `Selections`.
  - Change: import and use `selectionForItem` for each picked item.

- Modify `packages/web/test/random-outfit.test.ts`
  - Responsibility: synthetic unit coverage for `pickRandomOutfit`.
  - Change: add variants support to the local `makeItem` helper and a failing test for default variant selection.

- Create `packages/web/test/random-outfit-variant-audit.test.ts`
  - Responsibility: real-catalog regression audit for random-covered variant item paths.
  - Change: load assets JSON, create catalog, inspect random-covered male-compatible items with physical variants, build selections with `selectionForItem`, and assert generated representative paths exist.

## Task 1: Add Failing Unit Test For Random Default Variants

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`

- [ ] **Step 1: Update the synthetic item helper to support variants**

Replace the current `makeItem` helper with this version:

```ts
function makeItem(
  name: string,
  typeName: string,
  layerKey: 'male' | 'female' = 'male',
  variants: readonly string[] = [],
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [{ file: '', notes: '', authors: ['A'], licenses: ['CC0'], urls: [] }],
    layer_1: { zPos: 10, [layerKey]: `${typeName}/${name}/` },
    ...(variants.length > 0 ? { variants } : {}),
  } as unknown as ItemDefinition;
}
```

- [ ] **Step 2: Add the failing random-variant test**

Add this test inside `describe('pickRandomOutfit', () => { ... })`, near the existing compatibility tests:

```ts
  it('sets the first variant for randomly picked variant-backed items', () => {
    const { catalog: variantCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'shield/round.json': makeItem('Round Shield', 'shield', 'male', [
        'brown',
        'silver',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: variantCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
    });

    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Round Shield',
      variant: 'brown',
    });
  });
```

- [ ] **Step 3: Run the single test file and verify failure**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- random-outfit.test.ts
```

Expected: FAIL. The new test should show that `sel.items['shield']` does not include `variant: 'brown'`.

- [ ] **Step 4: Commit the failing test**

```bash
git add packages/web/test/random-outfit.test.ts
git commit -m "test: reproduce random variant omission"
```

## Task 2: Implement Default Variant Selection In Random Outfits

**Files:**
- Modify: `packages/web/src/slice/random-outfit.ts`

- [ ] **Step 1: Import the existing selection helper**

Add `selectionForItem` to the imports:

```ts
import { itemSupportsBodyType } from './catalog-tree';
import { CATEGORY_GROUPS, type GroupId } from './category-groups';
import { selectionForItem } from './selection';
```

- [ ] **Step 2: Use the helper when storing each random pick**

Replace:

```ts
    const pick = compatible[Math.floor(rng() * compatible.length)]!;
    items[typeName] = { typeName, name: pick.name };
```

with:

```ts
    const pick = compatible[Math.floor(rng() * compatible.length)]!;
    items[typeName] = selectionForItem(typeName, pick);
```

- [ ] **Step 3: Run the focused unit test and verify it passes**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- random-outfit.test.ts
```

Expected: PASS for all tests in `random-outfit.test.ts`.

- [ ] **Step 4: Commit the implementation**

```bash
git add packages/web/src/slice/random-outfit.ts packages/web/test/random-outfit.test.ts
git commit -m "fix: include default variants in random outfits"
```

## Task 3: Add Real-Catalog Variant Path Audit

**Files:**
- Create: `packages/web/test/random-outfit-variant-audit.test.ts`

- [ ] **Step 1: Create the audit test file**

Create `packages/web/test/random-outfit-variant-audit.test.ts` with this content:

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createCatalog,
  getSpritePathsForSelections,
  type ItemDefinition,
  type Selection,
  type TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../src/slice/catalog-tree';
import { CATEGORY_GROUPS } from '../src/slice/category-groups';
import { selectionForItem } from '../src/slice/selection';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const spritesheetsDir = path.join(repoRoot, 'assets/spritesheets');
const DEFAULT_EXCLUDED_GROUPS = new Set(['fx']);

function walkJson(dir: string): Record<string, ItemDefinition> {
  const out: Record<string, ItemDefinition> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.json')) {
        const rel = path.relative(sheetDefsDir, full).replaceAll(path.sep, '/');
        out[rel] = JSON.parse(readFileSync(full, 'utf8')) as ItemDefinition;
      }
    }
  };
  walk(dir);
  return out;
}

function randomCoveredTypeNames(): Set<TypeName> {
  return new Set(
    CATEGORY_GROUPS
      .filter((group) => !DEFAULT_EXCLUDED_GROUPS.has(group.id))
      .flatMap((group) => group.typeNames),
  );
}

function spritePathExists(spritePath: string): boolean {
  const rel = spritePath.replace(/^spritesheets\//, '');
  return existsSync(path.join(spritesheetsDir, rel));
}

describe('random outfit variant path audit', () => {
  it('random-covered variant-backed male items resolve representative sprite paths', () => {
    const { catalog } = createCatalog(walkJson(sheetDefsDir));
    const coveredTypes = randomCoveredTypeNames();
    const failures: string[] = [];
    let auditedItems = 0;

    for (const [itemId, item] of catalog.byItemId) {
      if (!coveredTypes.has(item.type_name)) continue;
      if (!itemSupportsBodyType(item, 'male')) continue;
      if (!item.variants || item.variants.length === 0) continue;

      auditedItems++;
      const selection = selectionForItem(item.type_name, item);
      const items: Record<TypeName, Selection> = {
        [item.type_name]: selection,
      };
      const layers = getSpritePathsForSelections(
        { bodyType: 'male', items },
        catalog,
      );

      if (layers.length === 0) {
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) produced no representative layers`,
        );
        continue;
      }

      for (const layer of layers) {
        if (!spritePathExists(layer.path)) {
          failures.push(
            `${item.type_name}/${item.name} (${itemId}) variant=${selection.variant ?? ''} missing ${layer.path}`,
          );
        }
      }
    }

    expect(auditedItems).toBeGreaterThan(0);
    expect(
      failures,
      `${failures.length} random-covered variant path failure(s):\n${failures.join('\n')}`,
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new audit test**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- random-outfit-variant-audit.test.ts
```

Expected: PASS. A preflight against the current catalog audited 293
random-covered male-compatible variant items with zero missing representative
paths, so any failure here should be treated as a real regression or a real
data-path mismatch to investigate before changing the audit.

- [ ] **Step 3: Run the full web test suite**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [ ] **Step 4: Commit the audit test**

```bash
git add packages/web/test/random-outfit-variant-audit.test.ts
git commit -m "test: audit random variant sprite paths"
```

## Task 4: Final Verification

**Files:**
- Verify only; no expected file edits.

- [ ] **Step 1: Run workspace typecheck**

Run:

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 2: Run broader tests if practical**

Run:

```bash
pnpm -r test
```

Expected: PASS. If this is too slow or blocked by environment constraints, run `pnpm --filter @lpc-toolkit/web test` and `pnpm --filter @lpc-toolkit/core test`, then record the limitation in the final handoff.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional committed changes are absent from the working tree. Pre-existing untracked files such as `.antigravitycli/`, `RTK.md`, or `cache/` may remain and should not be modified.

- [ ] **Step 4: Final summary**

Report:

- The commits created.
- The exact verification commands run and whether they passed.
- That this phase intentionally did not implement default recolor selection.
