# Mage Random Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mage preset random generate a complete human mage with required mage equipment, fixed mage item pools, and randomized mage colors.

**Architecture:** This is a web-only profile-data change. The existing `RandomProfile` fields `itemPools`, `requiredTypeNames`, and `randomColorTypeNames` already express the needed behavior, so implementation should only tighten `MAGE_RANDOM_PROFILE` and add focused slice tests. No React UI, core composition, assets, attribution, export, or `upstream/` changes are needed.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing web slice random-profile helpers.

---

## File Structure

- Modify `packages/web/test/random-outfit.test.ts`
  - Add focused Mage random coverage near the existing Mage profile test.
  - Keep test fixtures local to this test file using existing helpers:
    `makeItem`, `makeRecolorItem`, `seqRng`, and `palettes`.
- Modify `packages/web/src/slice/random-profiles.ts`
  - Update only `MAGE_RANDOM_PROFILE`.
  - Do not change `RandomProfile`, `pickRandomOutfit`, UI callers, core code,
    or catalog helpers.
- Modify `docs/superpowers/plans/2026-07-05-mage-random-narrowing.md`
  - As each implementation step is completed, update the checkbox, add a short
    implementation note, record the commit hash, and record verification status
    per repository workflow.

## Task 1: Add Failing Mage Narrowing Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-05-mage-random-narrowing.md`

- [x] **Step 1: Add the Mage identity and required equipment test**

In `packages/web/test/random-outfit.test.ts`, add this test immediately after
the existing test named
`mage profile excludes heavy armor while allowing staff and crystal slots`:

```ts
  it('mage profile uses standard human identity and requires full mage equipment', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton', 'body'),
      'body/zombie.json': makeItem('Zombie', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'head/orc.json': makeItem('Orc Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/angry.json': makeItem('Angry', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/laced.json': makeItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes'),
      'cape/solid.json': makeItem('Solid', 'cape'),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat'),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      bodyType: 'male',
      rng: seqRng([
        0.99, 0.99, 0.99,
        0.99,
        0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99,
      ]),
      optionalProb: 0,
      profile: 'mage',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
    });
    expect(sel.items['head']).toEqual({
      typeName: 'head',
      name: 'Human Male',
    });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Longsleeve laced',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
    });
    expect(sel.items['cape']).toEqual({ typeName: 'cape', name: 'Solid' });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Wizard Hat Base',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
    });

    for (const typeName of [
      'armour',
      'chainmail',
      'overalls',
      'shield',
      'quiver',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });
```

- [x] **Step 2: Add the female-compatible Mage identity test**

Add this test immediately after the test from Step 1:

```ts
  it('mage profile supports female human identity without forcing male', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body', ['v1'], 'female'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/zombie.json': makeItem('Zombie', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression', 'female'),
      'clothes/laced.json': makeItem('Longsleeve laced', 'clothes', 'female'),
      'legs/pants.json': makeItem('Pants', 'legs', 'female'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes', 'female'),
      'cape/solid.json': makeItem('Solid', 'cape', 'female'),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat', 'female'),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon', 'female'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal', 'female'),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      bodyType: 'female',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'mage',
    });

    expect(sel.bodyType).toBe('female');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
    });
    expect(sel.items['head']).toEqual({
      typeName: 'head',
      name: 'Human Female',
    });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
    });
  });
```

- [x] **Step 3: Add the Mage random color test**

Add this test immediately after the test from Step 2:

```ts
  it('mage profile randomizes mage skin clothing and equipment colors', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/laced.json': makeRecolorItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'purple',
      ]),
      'cape/solid.json': makeItem('Solid', 'cape', 'male', [
        'black',
        'purple',
      ]),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat', 'male', [
        'black',
        'purple',
      ]),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon', 'male', [
        'light',
        'dark',
      ]),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal', 'male', [
        'blue',
        'purple',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      palettes,
      bodyType: 'male',
      rng: seqRng([
        0, 0.99,
        0,
        0,
        0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
      ]),
      optionalProb: 0,
      profile: 'mage',
    });

    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Longsleeve laced',
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
      variant: 'purple',
    });
    expect(sel.items['cape']).toEqual({
      typeName: 'cape',
      name: 'Solid',
      variant: 'purple',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Wizard Hat Base',
      variant: 'purple',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
      variant: 'dark',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
      variant: 'purple',
    });
  });
```

- [x] **Step 4: Add the Mage colors-disabled test**

Add this test immediately after the test from Step 3:

```ts
  it('mage profile keeps default mage colors when random colors are disabled', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/laced.json': makeRecolorItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'purple',
      ]),
      'cape/solid.json': makeItem('Solid', 'cape', 'male', [
        'black',
        'purple',
      ]),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat', 'male', [
        'black',
        'purple',
      ]),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon', 'male', [
        'light',
        'dark',
      ]),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal', 'male', [
        'blue',
        'purple',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'mage',
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
      name: 'Longsleeve laced',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
    expect(sel.items['cape']).toEqual({
      typeName: 'cape',
      name: 'Solid',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Wizard Hat Base',
      variant: 'black',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
      variant: 'light',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
      variant: 'blue',
    });
  });
```

- [x] **Step 5: Run the focused test file and confirm the new tests fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL before implementation. At least one new Mage test should show
that the current profile can select non-human identity, omit required Mage
equipment with `optionalProb: 0`, or keep first/default colors instead of
profile-level random colors.

- [x] **Step 6: Commit the failing Mage tests**

Run:

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-05-mage-random-narrowing.md
rtk git commit -m "test(web): cover mage random narrowing"
```

After committing, run `rtk git log -1 --format=%h` and update this task with:

- the implementation note:
  `Added failing Mage random coverage for human identity, required mage equipment, female compatibility, randomized Mage colors, and colors-disabled defaults.`
- the actual short commit hash for `test(web): cover mage random narrowing`
- the verification status from Step 5, including the first focused Mage failure
  line from the Vitest output

## Task 2: Tighten Mage Random Profile

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `docs/superpowers/plans/2026-07-05-mage-random-narrowing.md`

- [ ] **Step 1: Update `MAGE_RANDOM_PROFILE`**

In `packages/web/src/slice/random-profiles.ts`, replace the current
`MAGE_RANDOM_PROFILE` definition with this version:

```ts
export const MAGE_RANDOM_PROFILE: RandomProfile = {
  id: 'mage',
  labelKey: 'preset.mage',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories', 'weapons'],
  excludeGroups: ['fantasy', 'fx'],
  optionalProb: 0.65,
  typeNames: [
    'body',
    'head',
    'expression',
    'hair',
    'clothes',
    'legs',
    'shoes',
    'cape',
    'hat',
    'weapon',
    'weapon_magic_crystal',
  ],
  requiredTypeNames: [
    'body',
    'head',
    'expression',
    'clothes',
    'legs',
    'shoes',
    'cape',
    'hat',
    'weapon',
    'weapon_magic_crystal',
  ],
  randomColorTypeNames: [
    'body',
    'clothes',
    'legs',
    'shoes',
    'cape',
    'hat',
    'weapon',
    'weapon_magic_crystal',
  ],
  itemPools: {
    body: ['Body Color'],
    head: ['Human Male', 'Human Female'],
    expression: ['Neutral'],
    clothes: ['Longsleeve laced'],
    legs: ['Pants'],
    shoes: ['Basic Shoes'],
    cape: ['Solid'],
    hat: ['Wizard Hat Base'],
    weapon: ['Gnarled staff'],
    weapon_magic_crystal: ['Crystal'],
  },
};
```

Do not add `bodyType` to the Mage profile. Mage should preserve the effective
body type passed to `pickRandomOutfit`.

- [ ] **Step 2: Run the focused test file and confirm it passes**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit the profile implementation**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts docs/superpowers/plans/2026-07-05-mage-random-narrowing.md
rtk git commit -m "fix(web): narrow mage random profile"
```

After committing, run `rtk git log -1 --format=%h` and update this task with:

- the implementation note:
  `Tightened Mage random through profile-level body/head/expression pools, required Mage slots, and Mage random color slots without UI or core changes.`
- the actual short commit hash for `fix(web): narrow mage random profile`
- the verification status:
  `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS

## Task 3: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-05-mage-random-narrowing.md`

- [ ] **Step 1: Run web typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run architecture boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 3: Run focused random outfit tests one final time**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the verification record**

Run:

```bash
rtk git add docs/superpowers/plans/2026-07-05-mage-random-narrowing.md
rtk git commit -m "docs: record mage random verification"
```

After committing, run `rtk git log -1 --format=%h` and update this task with:

- the implementation note:
  `Recorded final Mage random narrowing verification.`
- the actual short commit hash for `docs: record mage random verification`
- the verification status:
  `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS;
  `rtk pnpm check:boundaries` PASS;
  `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS

## Completion Criteria

- Mage random preserves caller body type instead of forcing male.
- Mage random only uses `Body Color` for body.
- Mage random only uses compatible `Human Male` or `Human Female` for head.
- Mage random always uses `Neutral` expression.
- Mage random always includes the fixed Mage clothing, cape, hat, staff, and
  crystal slots when compatible art exists.
- Mage random keeps hair optional.
- Mage random can vary skin and Mage outfit/equipment colors when colors are
  enabled.
- Mage random keeps default color behavior when colors are disabled.
- No core, upstream, UI, attribution, export, or dependency changes are made.
- Focused tests, typecheck, and boundary checks pass.
