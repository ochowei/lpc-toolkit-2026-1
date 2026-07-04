# Farmer Random Body Head Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Farmer random human and adult-male while allowing skin and all Farmer clothing colors to randomize.

**Architecture:** This is a web-only pure random-selection change. Extend `RandomProfile` with a small color-randomization field, keep Farmer body/head constraints in profile data, and reuse existing `getColorOptions` logic inside `pickRandomOutfit`. No UI, core, adapter, attribution, export, or `upstream/` changes are needed.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@lpc-toolkit/core` catalog and palette test helpers.

---

## File Structure

- Modify `packages/web/test/random-outfit.test.ts`: add focused failing Farmer tests for body/head allow-lists and random Farmer colors.
- Modify `packages/web/src/slice/random-profiles.ts`: add `randomColorTypeNames` to `RandomProfile`, constrain Farmer `body` and `head`, and mark Farmer color-randomized slots.
- Modify `packages/web/src/slice/random-outfit.ts`: add a small profile-gated color random helper that uses existing `getColorOptions`.
- Modify this plan file after each completed task: mark checkboxes, add implementation notes, record commit hashes, and record verification status.

## Task 1: Add Failing Farmer Body Head Color Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-04-farmer-random-body-head-colors.md`

- [x] **Step 1: Add a helper for recolor-backed test items**

In `packages/web/test/random-outfit.test.ts`, add this helper immediately after `makeItem`:

```ts
function makeRecolorItem(
  name: string,
  typeName: string,
  palettesForItem: readonly string[] = ['v1'],
  layerKey: 'male' | 'female' = 'male',
): ItemDefinition {
  return {
    ...makeItem(name, typeName, layerKey),
    recolors: { material: 'm', palettes: palettesForItem },
  } as unknown as ItemDefinition;
}
```

- [x] **Step 2: Add the focused Farmer body/head/color test**

In `packages/web/test/random-outfit.test.ts`, add this test immediately after the existing `farmer profile fixes male neutral required workwear while keeping skin random` test:

```ts
  it('farmer profile uses human body and adult male head while randomizing farmer colors', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton', 'body', 'male', ['skeleton']),
      'body/zombie.json': makeItem('Zombie', 'body', 'male', ['zombie']),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/shortsleeve.json': makeRecolorItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', [
        'brown',
        'blue',
      ]),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'tan',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      palettes,
      bodyType: 'female',
      rng: seqRng([
        0, 0.99,
        0,
        0,
        0, 0,
        0, 0.99,
        0, 0.99,
        0, 0.99,
      ]),
      optionalProb: 1,
      profile: 'farmer',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Messy3' });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
      recolor: 'red',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'blue',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'tan',
    });
  });
```

- [x] **Step 3: Add the colors-disabled Farmer test**

Add this test immediately after the test from Step 2:

```ts
  it('farmer profile keeps default farmer colors when random colors are disabled', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/shortsleeve.json': makeRecolorItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', [
        'brown',
        'blue',
      ]),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'tan',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'farmer',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'brown',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'brown',
    });
  });
```

- [x] **Step 4: Run the focused random outfit test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL before implementation. The failure should show Farmer selecting a non-`Body Color` body or non-`Human Male` head, or using first/default colors instead of the requested random color fields.

- [x] **Step 5: Commit the failing tests**

Run:

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-04-farmer-random-body-head-colors.md
rtk git commit -m "test(web): cover farmer human body and random colors"
```

After committing, update this task with:

```md
Implementation note: Added failing Farmer random coverage for Body Color-only bodies, Human Male-only head, randomized Farmer clothing colors, and colors-disabled defaults.
Commit: record the actual short commit hash for `test(web): cover farmer human body and random colors`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation.
```

Implementation note: Added failing Farmer random coverage for Body Color-only bodies, Human Male-only head, randomized Farmer clothing colors, and colors-disabled defaults.
Commit: 566c7d693 (`test(web): cover farmer human body and random colors`).
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation. Focused failure: expected Farmer `body` recolor `red`, received `c0`.

Review follow-up note: Tightened Farmer body color coverage so the existing Farmer test expects `Body Color` with randomized skin recolor instead of legacy `Dark`, and the focused allow-list test uses high body/head RNG with distinct body fixture IDs so it selects `Zombie Body` before the Farmer body pool implementation.
Review follow-up commit: 93287a055 (`test(web): tighten farmer body color coverage`).
Review follow-up verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation. Key focused failure: expected Farmer `body` `Body Color` with recolor `red`, received `Zombie Body`.

## Task 2: Implement Farmer Body Head Color Constraints

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `packages/web/src/slice/random-outfit.ts`
- Modify: `docs/superpowers/plans/2026-07-04-farmer-random-body-head-colors.md`

- [x] **Step 1: Extend RandomProfile with randomColorTypeNames**

In `packages/web/src/slice/random-profiles.ts`, change the `RandomProfile` interface to include `randomColorTypeNames` immediately after `requiredTypeNames`:

```ts
export interface RandomProfile {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly requiredGroups: readonly GroupId[];
  readonly optionalGroups: readonly GroupId[];
  readonly excludeGroups: readonly GroupId[];
  readonly optionalProb: number;
  readonly bodyType?: BodyType;
  readonly typeNames?: readonly TypeName[];
  readonly requiredTypeNames?: readonly TypeName[];
  readonly randomColorTypeNames?: readonly TypeName[];
  readonly itemPools?: Partial<Record<TypeName, readonly string[]>>;
}
```

- [x] **Step 2: Tighten FARMER_RANDOM_PROFILE pools and random color slots**

In `packages/web/src/slice/random-profiles.ts`, replace `FARMER_RANDOM_PROFILE` with:

```ts
export const FARMER_RANDOM_PROFILE: RandomProfile = {
  id: 'farmer',
  labelKey: 'preset.farmer',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories'],
  excludeGroups: ['fantasy', 'weapons', 'fx'],
  optionalProb: 0.5,
  bodyType: 'male',
  typeNames: ['body', 'head', 'expression', 'hair', 'clothes', 'overalls', 'shoes'],
  requiredTypeNames: ['body', 'head', 'expression', 'clothes', 'overalls', 'shoes'],
  randomColorTypeNames: ['body', 'clothes', 'overalls', 'shoes'],
  itemPools: {
    body: ['Body Color'],
    head: ['Human Male'],
    expression: ['Neutral'],
    clothes: ['Shortsleeve'],
    overalls: ['Overalls'],
    shoes: ['Basic Boots'],
  },
};
```

- [x] **Step 3: Import getColorOptions**

In `packages/web/src/slice/random-outfit.ts`, add:

```ts
import { getColorOptions } from './color-options';
```

Place it with the other local imports.

- [x] **Step 4: Add random color helpers**

In `packages/web/src/slice/random-outfit.ts`, add these helpers after `filterSelectionsByBodyType`:

```ts
function randomColorFieldsForItem(
  item: ItemDefinition,
  palettes: PaletteMetadata | undefined,
  rng: () => number,
): { variant?: string; recolor?: string } {
  if (!palettes && (!item.variants || item.variants.length === 0)) return {};

  if (palettes) {
    const colors = getColorOptions(item, palettes);
    if (colors.mode === 'recolors') {
      const pick = colors.options[Math.floor(rng() * colors.options.length)];
      return pick ? { recolor: pick.value } : {};
    }
    if (colors.mode === 'variants') {
      const pick = colors.options[Math.floor(rng() * colors.options.length)];
      return pick ? { variant: pick.value } : {};
    }
  }

  const variants = item.variants ?? [];
  const pick = variants[Math.floor(rng() * variants.length)];
  return pick ? { variant: pick } : {};
}

function shouldRandomizeColor(profile: RandomProfile, typeName: TypeName): boolean {
  return profile.randomColorTypeNames?.includes(typeName) ?? false;
}
```

- [x] **Step 5: Apply random color fields for profile-enabled slots**

In `packages/web/src/slice/random-outfit.ts`, replace the current assignment:

```ts
    items[typeName] = selectionForItem(
      typeName,
      pick,
      scope.colors ? args.palettes : undefined,
    );
```

with:

```ts
    const selection = selectionForItem(
      typeName,
      pick,
      scope.colors ? args.palettes : undefined,
    );
    items[typeName] =
      scope.colors && shouldRandomizeColor(profile, typeName)
        ? {
            ...selection,
            ...randomColorFieldsForItem(pick, args.palettes, rng),
          }
        : selection;
```

- [x] **Step 6: Run the focused random outfit test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [x] **Step 7: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS.

- [x] **Step 8: Commit the implementation**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts packages/web/src/slice/random-outfit.ts docs/superpowers/plans/2026-07-04-farmer-random-body-head-colors.md
rtk git commit -m "fix(web): constrain farmer random body head colors"
```

After committing, update this task with:

```md
Implementation note: Added profile-level random color slots, constrained Farmer body/head pools, and randomized Farmer skin/clothing colors through existing color options.
Commit: record the actual short commit hash for `fix(web): constrain farmer random body head colors`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
```

Implementation note: Added profile-level random color slots, constrained Farmer body/head pools to Body Color/Human Male, randomized Farmer skin/clothing colors through existing color options, and aligned existing Farmer tests with the new Body Color/Human Male/random-color contract.
Commit: 940f3b6da (`fix(web): constrain farmer random body head colors`).
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.

## Task 3: Boundary Verification and PR Update

**Files:**
- Modify: `docs/superpowers/plans/2026-07-04-farmer-random-body-head-colors.md`

- [ ] **Step 1: Run architecture boundary checks**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 2: Check final git status**

Run:

```bash
rtk git status --short
```

Expected: only this plan file is modified for final task notes, or a clean tree after the final docs commit.

- [ ] **Step 3: Commit final plan notes**

If Task 3 notes changed this file, run:

```bash
rtk git add docs/superpowers/plans/2026-07-04-farmer-random-body-head-colors.md
rtk git commit -m "docs: record farmer random body head color verification"
```

After committing, update this task with:

```md
Implementation note: Ran boundary verification and recorded final verification status.
Commit: record the final docs commit hash in the response if recording it in this file would change the hash.
Verification: `rtk pnpm check:boundaries` PASS.
```

- [ ] **Step 4: Push the PR branch**

Run:

```bash
rtk git push
```

Expected: PASS. The existing draft PR updates with the new commits.
