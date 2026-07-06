# Villager Random Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Villager preset random produce a complete ordinary human villager with Neutral expression, plain shirt, pants, and shoes while preserving the caller's male or female body type.

**Architecture:** This is a web-only pure selection change. Existing `RandomProfile` fields already support identity allow-lists, required slots, and random color slots, so implementation should only add focused Villager tests and tighten `VILLAGER_RANDOM_PROFILE`. React UI, core rendering, attribution, exports, URL behavior, assets, and `upstream/` remain untouched.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@lpc-toolkit/core` catalog test helpers.

---

## File Structure

- Modify `packages/web/test/random-outfit.test.ts`: replace the current Villager coverage with stricter mundane-human coverage and add focused tests for required outfit slots, color randomization, colors-disabled defaults, and female body type compatibility.
- Modify `packages/web/src/slice/random-profiles.ts`: tighten `VILLAGER_RANDOM_PROFILE` with standard human identity pools, required Villager slots, and Villager random color slots.
- Modify this plan file after each completed task: mark checkboxes, add a short implementation note, record the produced commit hash, and record verification status.

No changes are planned for `packages/core/`, `packages/web/src/components/`, `packages/web/src/hooks/`, `packages/web/src/adapter/`, `packages/web/src/lib/`, `packages/web/src/slice/random-outfit.ts`, `assets/`, or `upstream/`.

## Task 1: Add Failing Villager Narrowing Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-06-villager-random-narrowing.md`

- [x] **Step 1: Replace the current Villager exclusion test with stricter human Villager coverage**

In `packages/web/test/random-outfit.test.ts`, replace the existing `villager profile keeps random outfits mundane and clothing-only` test with this version:

```ts
  it('villager profile keeps random outfits human, neutral, mundane, and clothing-only', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton Body', 'body'),
      'body/zombie.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'head/orc.json': makeItem('Orc', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/formal.json': makeItem('Collared/Formal Longsleeve', 'clothes'),
      'clothes/longsleeve.json': makeItem('Longsleeve', 'clothes'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', ['tan']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'apron/plain.json': makeItem('Apron', 'apron'),
      'hat/hood.json': makeItem('Hood', 'hat'),
      'cape/solid.json': makeItem('Solid', 'cape'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
      'arms/armour.json': makeItem('Armour', 'arms'),
      'gloves/gloves.json': makeItem('Gloves', 'gloves'),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 1.0,
      profile: 'villager',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'brown',
    });

    for (const typeName of [
      'overalls',
      'apron',
      'hat',
      'cape',
      'armour',
      'chainmail',
      'weapon',
      'weapon_magic_crystal',
      'shield',
      'quiver',
      'arms',
      'gloves',
      'wings',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });
```

This test proves Villager excludes non-human identities and non-villager slots while staying inside the existing Villager type-name surface.

- [x] **Step 2: Add required outfit and random color coverage**

Add this test immediately after the stricter Villager exclusion test:

```ts
  it('villager profile requires human neutral outfit while preserving body type and random colors', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton Body', 'body'),
      'body/zombie.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/longsleeve.json': makeRecolorItem('Longsleeve', 'clothes'),
      'clothes/shortsleeve.json': makeRecolorItem('Shortsleeve', 'clothes'),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'tan',
        'black',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      palettes,
      bodyType: 'male',
      rng: seqRng([
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0,
        0.99,
      ]),
      optionalProb: 0,
      profile: 'villager',
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
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
      recolor: 'red',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Pants',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
  });
```

This test proves `body`, `head`, `expression`, `clothes`, `legs`, and `shoes` bypass `optionalProb`, optional hair can remain absent, and `randomColorTypeNames` drives Villager skin, shirt, pants, and shoe color variation.

- [x] **Step 3: Add female body type compatibility coverage**

Add this test immediately after the random color coverage test:

```ts
  it('villager profile keeps female body type and selects the compatible human head', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body', ['v1'], 'female'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression', 'female'),
      'clothes/longsleeve.json': makeItem('Longsleeve', 'clothes', 'female'),
      'legs/pants.json': makeItem('Pants', 'legs', 'female'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'female', [
        'tan',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      bodyType: 'female',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'villager',
    });

    expect(sel.bodyType).toBe('female');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Female' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Longsleeve',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'tan',
    });
  });
```

This test proves Villager does not force `bodyType: 'male'` and that the `Human Male` / `Human Female` head pool respects catalog compatibility filtering.

- [x] **Step 4: Add colors-disabled default coverage**

Add this test immediately after the female body type compatibility test:

```ts
  it('villager profile keeps default villager colors when random colors are disabled', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/longsleeve.json': makeRecolorItem('Longsleeve', 'clothes'),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'tan',
        'black',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'villager',
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
      name: 'Longsleeve',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'tan',
    });
  });
```

This test proves disabling random colors keeps the existing default selection behavior for newly selected Villager items.

- [x] **Step 5: Run the focused random outfit test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL before implementation. The failure should show Villager selecting a non-`Body Color` body, non-human head, non-`Neutral` expression, missing required clothing at `optionalProb: 0`, or default colors instead of the expected random color fields.

- [x] **Step 6: Commit the failing tests**

Run:

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-06-villager-random-narrowing.md
rtk git commit -m "test(web): cover narrowed villager random profile"
rtk git rev-parse --short HEAD
```

Then update this task with:

```markdown
Implementation note: Added focused failing coverage for Villager human identity, Neutral expression, complete everyday outfit requirements, female body type compatibility, color randomization, colors-disabled defaults, and off-theme exclusions.
Commit: paste the exact short hash printed by `rtk git rev-parse --short HEAD`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation.
```

Implementation note: Added focused failing coverage for Villager human identity, Neutral expression, complete everyday outfit requirements, female body type compatibility, color randomization, colors-disabled defaults, and off-theme exclusions.
Commit: bc4c83fb9
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation.

## Task 2: Tighten the Villager Random Profile

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `docs/superpowers/plans/2026-07-06-villager-random-narrowing.md`

- [x] **Step 1: Replace `VILLAGER_RANDOM_PROFILE` with the narrowed profile**

In `packages/web/src/slice/random-profiles.ts`, replace the current `VILLAGER_RANDOM_PROFILE` with:

```ts
export const VILLAGER_RANDOM_PROFILE: RandomProfile = {
  id: 'villager',
  labelKey: 'preset.villager',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories'],
  excludeGroups: ['fantasy', 'weapons', 'fx'],
  optionalProb: 0.6,
  typeNames: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes'],
  requiredTypeNames: ['body', 'head', 'expression', 'clothes', 'legs', 'shoes'],
  randomColorTypeNames: ['body', 'clothes', 'legs', 'shoes'],
  itemPools: {
    body: ['Body Color'],
    head: ['Human Male', 'Human Female'],
    expression: ['Neutral'],
    clothes: ['Longsleeve', 'Shortsleeve'],
    legs: ['Pants'],
    shoes: ['Basic Shoes', 'Basic Boots'],
  },
};
```

Do not add `bodyType`; Villager must preserve the caller's current male or female body type.

- [x] **Step 2: Run the focused random outfit test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS. The new Villager tests and existing Farmer, Mage, Knight, Ranger, Noble, and Normal tests should all pass.

- [x] **Step 3: Run the web typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS. No TypeScript strict-mode errors.

- [x] **Step 4: Commit the implementation**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts docs/superpowers/plans/2026-07-06-villager-random-narrowing.md
rtk git commit -m "fix(web): narrow villager preset random profile"
rtk git rev-parse --short HEAD
```

Then update this task with:

```markdown
Implementation note: Tightened Villager random with standard human identity pools, Neutral expression, required everyday clothing slots, and Villager color-randomized slots while preserving caller body type.
Commit: paste the exact short hash printed by `rtk git rev-parse --short HEAD`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web typecheck` PASS.
```

Implementation note: Tightened Villager random with standard human identity pools, Neutral expression, required everyday clothing slots, and Villager color-randomized slots while preserving caller body type.
Commit: 1655f4950
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web typecheck` reported `TypeScript: No errors found` but exited 1 through the `rtk` shorthand; `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS; `rtk pnpm --dir packages/web typecheck` PASS.

## Task 3: Run Boundary Verification And Record Final Status

**Files:**
- Modify: `docs/superpowers/plans/2026-07-06-villager-random-narrowing.md`

- [x] **Step 1: Run the architecture boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS. The change stays inside `packages/web/src/slice/` and focused web tests, with no `packages/core/`, browser adapter, asset, or `upstream/` changes.

- [x] **Step 2: Confirm the final git status**

Run:

```bash
rtk git status --short
```

Expected: Only this plan file should be modified for final verification bookkeeping, or the worktree should be clean after the bookkeeping commit.

- [x] **Step 3: Commit final verification bookkeeping**

After marking Task 3 complete and recording the verification result in this plan file, run:

```bash
rtk git add docs/superpowers/plans/2026-07-06-villager-random-narrowing.md
rtk git commit -m "docs: record villager random verification"
rtk git rev-parse --short HEAD
```

Then update this task with:

```markdown
Implementation note: Recorded final Villager random narrowing verification.
Commit: paste the exact short hash printed by `rtk git rev-parse --short HEAD`.
Verification: `rtk pnpm check:boundaries` PASS.
```

Implementation note: Recorded final Villager random narrowing verification.
Commit: pending final hash update after bookkeeping commit.
Verification: `rtk pnpm check:boundaries` PASS; `rtk git status --short` clean before bookkeeping.

## Final Acceptance Criteria

- Villager random preserves the caller's `male` or `female` body type.
- Villager random selects only `Body Color` for `body`.
- Villager random selects only the compatible `Human Male` or `Human Female` head.
- Villager random selects only `Neutral` expression.
- Villager random includes shirt, pants, and shoes even with `optionalProb: 0`.
- Villager random still allows optional hair when appearance optional slots are included.
- Villager random excludes farmer workwear, formal/noble-only slots, combat slots, weapons, fantasy slots, and `fx`.
- Villager random can vary body, shirt, pants, and shoe colors when colors are enabled.
- Villager random keeps default colors and variants when colors are disabled.
- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` passes.
- `rtk pnpm --filter @lpc-toolkit/web typecheck` passes.
- `rtk pnpm check:boundaries` passes.
