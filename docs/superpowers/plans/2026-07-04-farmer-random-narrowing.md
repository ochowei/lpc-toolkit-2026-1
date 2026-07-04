# Farmer Random Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Farmer preset random always produce a male farmer with Neutral expression and complete farmer workwear, while keeping skin color and hair style random.

**Architecture:** This is a web-only pure selection change. Add small reusable metadata to `RandomProfile`, consume it in `pickRandomOutfit`, and tighten the existing Farmer profile data. React UI, core rendering, attribution, exports, and `upstream/` remain untouched.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@lpc-toolkit/core` catalog test helpers.

---

## File Structure

- Modify `packages/web/test/random-outfit.test.ts`: add focused failing coverage for Farmer random body type, Neutral expression, required overalls, and retained skin/hair variation.
- Modify `packages/web/src/slice/random-profiles.ts`: extend `RandomProfile` with optional `bodyType` and `requiredTypeNames`, then tighten `FARMER_RANDOM_PROFILE`.
- Modify `packages/web/src/slice/random-outfit.ts`: resolve profile body type and honor `requiredTypeNames` in the existing picker.
- Modify this plan file after each completed task: mark checkboxes, add implementation notes, record commit hashes, and record verification status.

## Task 1: Add Failing Farmer Narrowing Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-04-farmer-random-narrowing.md`

- [x] **Step 1: Add a focused Farmer random test**

In `packages/web/test/random-outfit.test.ts`, add this test immediately after the existing `farmer profile excludes fantasy, combat, and fx categories` test:

```ts
  it('farmer profile fixes male neutral required workwear while keeping skin random', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'body/dark.json': makeItem('Dark', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'hair/curly.json': makeItem('Curly', 'hair'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      bodyType: 'female',
      rng: seqRng([0.99, 0.99, 0, 0.99, 0, 0, 0]),
      optionalProb: 0,
      profile: 'farmer',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Dark' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
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

- [x] **Step 2: Add a hair variation assertion test**

Add this test immediately after the test from Step 1:

```ts
  it('farmer profile can still randomize hair when appearance optional slots are included', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'hair/curly.json': makeItem('Curly', 'hair'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      bodyType: 'male',
      rng: seqRng([0, 0, 0, 0, 0.99, 0.99, 0, 0, 0]),
      optionalProb: 1,
      profile: 'farmer',
    });

    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Curly' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'brown',
    });
  });
```

- [x] **Step 3: Run the focused test file and verify the new tests fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL. The failure should show that Farmer random still returns the caller-provided `bodyType` or omits `overalls` when `optionalProb: 0`.

- [x] **Step 4: Commit the failing tests**

Run:

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-04-farmer-random-narrowing.md
rtk git commit -m "test(web): cover narrowed farmer random profile"
```

After committing, update this task with:

```md
Implementation note: Added focused failing coverage for Farmer random male body type, Neutral expression, required farmer workwear, and retained hair variation.
Commit: record the actual short commit hash for `test(web): cover narrowed farmer random profile`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation.
```

Implementation note: Added focused failing coverage for Farmer random male body type, Neutral expression, required farmer workwear, and retained hair variation.
Commit: 86b619b77.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation. Key failure: `expected 'female' to be 'male'` at `test/random-outfit.test.ts:494`.

## Task 2: Implement Profile Body Type and Required Slots

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `packages/web/src/slice/random-outfit.ts`
- Modify: `docs/superpowers/plans/2026-07-04-farmer-random-narrowing.md`

- [x] **Step 1: Extend the RandomProfile interface**

In `packages/web/src/slice/random-profiles.ts`, change the core type import from:

```ts
import type { Selection, TypeName } from '@lpc-toolkit/core';
```

to:

```ts
import type { BodyType, Selection, TypeName } from '@lpc-toolkit/core';
```

Then change `RandomProfile` to include the two optional fields:

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
  readonly itemPools?: Partial<Record<TypeName, readonly string[]>>;
}
```

- [x] **Step 2: Tighten FARMER_RANDOM_PROFILE**

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
  itemPools: {
    expression: ['Neutral'],
    clothes: ['Shortsleeve'],
    overalls: ['Overalls'],
    shoes: ['Basic Boots'],
  },
};
```

- [x] **Step 3: Honor profile required type names**

In `packages/web/src/slice/random-outfit.ts`, replace `isRequiredType` with:

```ts
function isRequiredType(profile: RandomProfile, typeName: TypeName): boolean {
  if (profile.requiredTypeNames?.includes(typeName)) return true;

  const requiredGroups = new Set<GroupId>(profile.requiredGroups);
  return CATEGORY_GROUPS.some(
    (group) => requiredGroups.has(group.id) && group.typeNames.includes(typeName),
  );
}
```

- [x] **Step 4: Honor profile body type**

In `packages/web/src/slice/random-outfit.ts`, inside `pickRandomOutfit`, add an effective body type after `profile` is resolved:

```ts
  const profile = resolveProfile(args.profile);
  const bodyType = profile.bodyType ?? args.bodyType;
  const scope = args.scope ?? DEFAULT_RANDOM_SCOPE;
```

Then change compatibility filtering from:

```ts
    const compatible = pooled.filter((d) => itemSupportsBodyType(d, args.bodyType));
```

to:

```ts
    const compatible = pooled.filter((d) => itemSupportsBodyType(d, bodyType));
```

Finally change the return statement from:

```ts
  return { bodyType: args.bodyType, items };
```

to:

```ts
  return { bodyType, items };
```

- [x] **Step 5: Run the focused random outfit test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [x] **Step 6: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 7: Commit the implementation**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts packages/web/src/slice/random-outfit.ts docs/superpowers/plans/2026-07-04-farmer-random-narrowing.md
rtk git commit -m "fix(web): narrow farmer preset random profile"
```

After committing, update this task with:

```md
Implementation note: Added profile-level body type and required type names, then used them to make Farmer random male, Neutral, and fully dressed.
Commit: record the actual short commit hash for `fix(web): narrow farmer preset random profile`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web typecheck` PASS.
```

Implementation note: Added profile-level body type and required type names, then used them to make Farmer random male, Neutral, and fully dressed.
Commit: fce732056.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS (29 tests); `rtk pnpm --filter @lpc-toolkit/web typecheck` reported `TypeScript: No errors found` but exited 1 with an RTK warning that `--filter` is not yet supported for pnpm tsc; `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS; `rtk pnpm --dir packages/web typecheck` PASS.

Review fix note: Added regression coverage for Farmer random with a profile body-type override and disabled appearance scope, then filtered preserved disabled-scope selections against the effective profile body type only when the profile overrides the caller body type.
Commit: pending.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS (30 tests); `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.

## Task 3: Boundary Verification and Final Plan Update

**Files:**
- Modify: `docs/superpowers/plans/2026-07-04-farmer-random-narrowing.md`

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
rtk git add docs/superpowers/plans/2026-07-04-farmer-random-narrowing.md
rtk git commit -m "docs: record farmer random verification"
```

After committing, update this task with:

```md
Implementation note: Ran boundary verification and recorded final verification status.
Commit: record the actual short commit hash for `docs: record farmer random verification`.
Verification: `rtk pnpm check:boundaries` PASS.
```

If no final notes are needed because the implementation agent already recorded them, do not create an empty commit.
