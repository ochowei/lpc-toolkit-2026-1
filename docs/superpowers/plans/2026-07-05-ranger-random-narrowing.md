# Ranger Random Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ranger preset random always produce a complete human Ranger with Neutral expression, leather kit, hood, bow, and quiver while preserving body type, optional hair, and color variation.

**Architecture:** This is a web-only pure selection change. The existing `RandomProfile` mechanisms from Farmer narrowing already support item allow-lists, required slots, and random color slots, so Ranger only needs focused tests and profile data changes. React UI, core rendering, attribution, exports, and `upstream/` remain untouched.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@lpc-toolkit/core` catalog test helpers.

---

## File Structure

- Modify `packages/web/test/random-outfit.test.ts`: add focused failing Ranger coverage for human identity, Neutral expression, required kit completeness, color randomization, colors-disabled defaults, and off-theme exclusions.
- Modify `packages/web/src/slice/random-profiles.ts`: tighten `RANGER_RANDOM_PROFILE` with human identity pools, required kit slots, and Ranger random color slots.
- Modify this plan file after each completed task: mark checkboxes, add a short implementation note, record the produced commit hash, and record verification status.

No changes are planned for `packages/core/`, `packages/web/src/components/`, `packages/web/src/hooks/`, `packages/web/src/adapter/`, `packages/web/src/lib/`, `assets/`, or `upstream/`.

## Task 1: Add Failing Ranger Narrowing Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-05-ranger-random-narrowing.md`

- [x] **Step 1: Add a focused Ranger identity, required kit, and color test**

In `packages/web/test/random-outfit.test.ts`, add this test immediately after the existing `ranger profile excludes heavy plate and formal noble clothing` test:

```ts
  it('ranger profile fixes human neutral required kit while preserving body type and random colors', () => {
    const { catalog: rangerCatalog } = createCatalog({
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
      'armour/leather.json': makeItem('Leather', 'armour', 'male', [
        'brown',
        'green',
      ]),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'black',
      ]),
      'hat/hood.json': makeItem('Hood', 'hat', 'male', ['brown', 'green']),
      'weapon/bow.json': makeItem('Normal', 'weapon', 'male', ['dark', 'light']),
      'quiver/quiver.json': makeItem('Quiver', 'quiver', 'male', [
        'quiver',
        'green',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'ranger',
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
    expect(sel.items['armour']).toEqual({
      typeName: 'armour',
      name: 'Leather',
      variant: 'green',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Pants',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Hood',
      variant: 'green',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Normal',
      variant: 'light',
    });
    expect(sel.items['quiver']).toEqual({
      typeName: 'quiver',
      name: 'Quiver',
      variant: 'green',
    });
  });
```

This test proves all core Ranger kit slots bypass `optionalProb`, identity is human-only, expression is fixed, caller body type remains male, and `randomColorTypeNames` drives color variation.

- [x] **Step 2: Add a female body type compatibility test**

Add this test immediately after the test from Step 1:

```ts
  it('ranger profile keeps female body type and selects the compatible human head', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body', ['v1'], 'female'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression', 'female'),
      'armour/leather.json': makeItem('Leather', 'armour', 'female'),
      'legs/pants.json': makeItem('Pants', 'legs', 'female'),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'female', [
        'brown',
      ]),
      'hat/hood.json': makeItem('Hood', 'hat', 'female'),
      'weapon/bow.json': makeItem('Normal', 'weapon', 'female', ['dark']),
      'quiver/quiver.json': makeItem('Quiver', 'quiver', 'female', ['quiver']),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      bodyType: 'female',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'ranger',
    });

    expect(sel.bodyType).toBe('female');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Female' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Leather' });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Normal',
      variant: 'dark',
    });
    expect(sel.items['quiver']).toEqual({
      typeName: 'quiver',
      name: 'Quiver',
      variant: 'quiver',
    });
  });
```

This test proves Ranger does not force `bodyType: 'male'` and that the `Human Male` / `Human Female` head pool still respects catalog compatibility filtering.

- [x] **Step 3: Add a colors-disabled default test**

Add this test immediately after the test from Step 2:

```ts
  it('ranger profile keeps default ranger colors when random colors are disabled', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'armour/leather.json': makeItem('Leather', 'armour', 'male', [
        'brown',
        'green',
      ]),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'black',
      ]),
      'hat/hood.json': makeItem('Hood', 'hat', 'male', ['brown', 'green']),
      'weapon/bow.json': makeItem('Normal', 'weapon', 'male', ['dark', 'light']),
      'quiver/quiver.json': makeItem('Quiver', 'quiver', 'male', [
        'quiver',
        'green',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'ranger',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['armour']).toEqual({
      typeName: 'armour',
      name: 'Leather',
      variant: 'brown',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'brown',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Hood',
      variant: 'brown',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Normal',
      variant: 'dark',
    });
    expect(sel.items['quiver']).toEqual({
      typeName: 'quiver',
      name: 'Quiver',
      variant: 'quiver',
    });
  });
```

This test proves `scope.colors: false` does not use Ranger `randomColorTypeNames`, while required kit slots still appear.

- [x] **Step 4: Tighten the existing Ranger exclusion test**

Replace the existing `ranger profile excludes heavy plate and formal noble clothing` test with this broader version:

```ts
  it('ranger profile excludes heavy, formal, farmer, mage, fantasy, and fx items', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'armour/leather.json': makeItem('Leather', 'armour'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/boots.json': makeItem('Basic Boots', 'shoes'),
      'hat/hood.json': makeItem('Hood', 'hat'),
      'weapon/bow.json': makeItem('Normal', 'weapon'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'clothes/formal.json': makeItem('Collared/Formal Longsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'apron/plain.json': makeItem('Plain Apron', 'apron'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'ranger',
    });

    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Leather' });
    expect(sel.items['weapon']).toEqual({ typeName: 'weapon', name: 'Normal' });
    expect(sel.items['quiver']).toEqual({ typeName: 'quiver', name: 'Quiver' });

    for (const typeName of [
      'chainmail',
      'clothes',
      'overalls',
      'apron',
      'weapon_magic_crystal',
      'shield',
      'wings',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });
```

This keeps the existing exclusion coverage and expands it to the off-theme categories from the approved design.

- [x] **Step 5: Run the focused test file and verify the new tests fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL before implementation. The first new Ranger test should fail because the current Ranger profile can select a non-`Body Color` body and omits required kit slots when `optionalProb: 0`.

Implementation note: Added focused failing Ranger random coverage for human identity, Neutral expression, required leather/hood/bow/quiver kit, color randomization, colors-disabled defaults, female body type preservation, and off-theme exclusions.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation; key failures included body recolor remaining `c0` instead of Ranger random color `red`, female head selecting `Skeleton` instead of `Human Female`, and required `armour` omitted when `optionalProb: 0`.

- [x] **Step 6: Commit the failing tests**

Run:

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-05-ranger-random-narrowing.md
rtk git commit -m "test(web): cover narrowed ranger random profile"
```

After the commit succeeds, update this task with:

```md
Implementation note: Added focused failing Ranger random coverage for human identity, Neutral expression, required leather/hood/bow/quiver kit, color randomization, colors-disabled defaults, female body type preservation, and off-theme exclusions.
Commit: 99bb0caf0 (`test(web): cover narrowed ranger random profile`).
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation, with the key Ranger narrowing failure recorded.
```

## Task 2: Tighten the Ranger Random Profile

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `docs/superpowers/plans/2026-07-05-ranger-random-narrowing.md`

- [x] **Step 1: Replace `RANGER_RANDOM_PROFILE`**

In `packages/web/src/slice/random-profiles.ts`, replace the existing `RANGER_RANDOM_PROFILE` object with:

```ts
export const RANGER_RANDOM_PROFILE: RandomProfile = {
  id: 'ranger',
  labelKey: 'preset.ranger',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories', 'weapons'],
  excludeGroups: ['fantasy', 'fx'],
  optionalProb: 0.7,
  typeNames: [
    'body',
    'head',
    'expression',
    'hair',
    'armour',
    'legs',
    'shoes',
    'hat',
    'weapon',
    'quiver',
  ],
  requiredTypeNames: [
    'body',
    'head',
    'expression',
    'armour',
    'legs',
    'shoes',
    'hat',
    'weapon',
    'quiver',
  ],
  randomColorTypeNames: [
    'body',
    'armour',
    'legs',
    'shoes',
    'hat',
    'weapon',
    'quiver',
  ],
  itemPools: {
    body: ['Body Color'],
    head: ['Human Male', 'Human Female'],
    expression: ['Neutral'],
    armour: ['Leather'],
    legs: ['Pants'],
    shoes: ['Basic Boots'],
    hat: ['Hood'],
    weapon: ['Normal'],
    quiver: ['Quiver'],
  },
};
```

Do not add `bodyType` to Ranger. The caller/current body type must remain effective.

- [x] **Step 2: Run the focused test file and verify it passes**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

Implementation note: Tightened Ranger random with human identity pools, Neutral expression, required leather/hood/bow/quiver kit, and Ranger random color slots.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS.

- [x] **Step 3: Commit the implementation**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts docs/superpowers/plans/2026-07-05-ranger-random-narrowing.md
rtk git commit -m "fix(web): narrow ranger preset random profile"
```

After the commit succeeds, update this task with:

```md
Implementation note: Tightened Ranger random with human identity pools, Neutral expression, required leather/hood/bow/quiver kit, and Ranger random color slots.
Commit: b32377075 (`fix(web): narrow ranger preset random profile`).
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS.
```

## Task 3: Run Final Verification and Record Status

**Files:**
- Modify: `docs/superpowers/plans/2026-07-05-ranger-random-narrowing.md`

- [ ] **Step 1: Run focused random outfit tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 4: Record verification in this plan**

Append a final status note under this task:

```md
Implementation note: Recorded final Ranger random narrowing verification.
Commit: paste the short hash produced by `rtk git log -1 --oneline` for the docs verification commit.
Verification:
- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS.
- `rtk pnpm --filter @lpc-toolkit/web typecheck` PASS.
- `rtk pnpm check:boundaries` PASS.
```

- [ ] **Step 5: Commit the verification note**

Run:

```bash
rtk git add docs/superpowers/plans/2026-07-05-ranger-random-narrowing.md
rtk git commit -m "docs: record ranger random verification"
```

After committing, update Step 4's `Commit:` line with the produced short hash.

## Self-Review

- Spec coverage: The plan covers human identity, caller body type preservation, Neutral expression, required Ranger kit, avoidance of incomplete Rangers, random color slots, colors-disabled behavior, off-theme exclusions, and verification commands from the approved spec.
- Placeholder scan: No placeholder tokens remain; execution-time commit hashes are described as explicit update instructions.
- Type consistency: The plan uses existing `RandomProfile` fields (`requiredTypeNames`, `randomColorTypeNames`, `itemPools`, `typeNames`) and existing test helpers (`makeItem`, `makeRecolorItem`, `seqRng`, `palettes`, `pickRandomOutfit`) already present in `packages/web/test/random-outfit.test.ts`.
