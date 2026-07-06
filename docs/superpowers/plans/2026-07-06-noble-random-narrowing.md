# Noble Random Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Noble preset random produce a complete male human noble with paired formal clothing sets and controlled color variation.

**Architecture:** Keep this as a web-only pure selection change. Add a small generic `RandomProfile.itemSets` mechanism for linked slot choices, use it only in `NOBLE_RANDOM_PROFILE`, and verify the behavior through focused random-outfit tests.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@lpc-toolkit/core` catalog test helpers.

---

## File Structure

- Modify `packages/web/test/random-outfit.test.ts`: add focused failing tests for Noble identity, complete formal outfit requirements, non-noble exclusions, paired plain/striped formal sets, random colors, and colors-disabled defaults.
- Modify `packages/web/src/slice/random-profiles.ts`: add the `RandomItemSet` type, expose optional `itemSets` on `RandomProfile`, and tighten `NOBLE_RANDOM_PROFILE`.
- Modify `packages/web/src/slice/random-outfit.ts`: select one compatible profile item set before the existing per-slot random loop, while preserving existing scope and body-type compatibility behavior.
- Modify this plan file after each completed task: mark checkboxes, add implementation notes, record commit hashes, and record verification status.

## Task 1: Add Failing Noble Random Narrowing Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-06-noble-random-narrowing.md`

- [x] **Step 1: Add a Noble identity and complete outfit test**

In `packages/web/test/random-outfit.test.ts`, add this test immediately after the existing `noble profile excludes weapons, shields, armor, workwear, and fantasy parts` test:

```ts
  it('noble profile fixes male human neutral identity and complete formalwear', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton Body', 'body'),
      'body/zombie.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/parted.json': makeItem('Parted', 'hair'),
      'clothes/formal.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal.json': makeRecolorItem('Formal Pants', 'legs'),
      'legs/formal-striped.json': makeRecolorItem('Striped Formal Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'blue',
      ]),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', [
        'black',
        'blue',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'female',
      rng: () => 0,
      optionalProb: 0,
      profile: 'noble',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Formal Pants',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Formal Tophat',
      variant: 'black',
    });
  });
```

- [x] **Step 2: Replace the existing Noble exclusion test with stricter coverage**

Replace the existing `noble profile excludes weapons, shields, armor, workwear, and fantasy parts` test with this version:

```ts
  it('noble profile excludes undead, non-human, workwear, combat, fantasy, and fx items', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton Body', 'body'),
      'body/zombie.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'head/orc.json': makeItem('Orc', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal.json': makeItem('Formal Pants', 'legs'),
      'legs/formal-striped.json': makeItem('Striped Formal Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes'),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'apron/plain.json': makeItem('Apron', 'apron'),
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
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 1.0,
      profile: 'noble',
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
    });
    expect(sel.items['shoes']?.name).toBe('Basic Shoes');
    expect(sel.items['hat']?.name).toBe('Formal Tophat');

    for (const typeName of [
      'overalls',
      'apron',
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

- [x] **Step 3: Add paired formal set coverage**

Add this test after the stricter Noble exclusion test:

```ts
  it('noble profile keeps plain and striped formal tops paired with matching pants', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal.json': makeItem('Formal Pants', 'legs'),
      'legs/formal-striped.json': makeItem('Striped Formal Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', ['black']),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', ['black']),
    });

    const plain = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1,
      profile: 'noble',
    });
    const striped = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 1,
      profile: 'noble',
    });

    expect(plain.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(plain.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Formal Pants',
    });
    expect(striped.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(striped.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
    });
  });
```

- [x] **Step 4: Add Noble random color coverage**

Add this test after the paired formal set test:

```ts
  it('noble profile randomizes skin, pants, shoes, and tophat colors', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal.json': makeRecolorItem('Formal Pants', 'legs'),
      'legs/formal-striped.json': makeRecolorItem('Striped Formal Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'blue',
      ]),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', [
        'black',
        'blue',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'noble',
    });

    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'blue',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Formal Tophat',
      variant: 'blue',
    });
  });
```

- [x] **Step 5: Add Noble colors-disabled coverage**

Add this test after the random color coverage test:

```ts
  it('noble profile keeps default colors when random colors are disabled', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal.json': makeRecolorItem('Formal Pants', 'legs'),
      'legs/formal-striped.json': makeRecolorItem('Striped Formal Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'blue',
      ]),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', [
        'black',
        'blue',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'noble',
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
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Formal Tophat',
      variant: 'black',
    });
  });
```

- [x] **Step 6: Run the focused test file and verify the new tests fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL before implementation. The failure should show Noble random returning the caller body type, omitting required formal slots when `optionalProb: 0`, mixing or not selecting the intended paired formal set, or not applying the intended random colors.

- [x] **Step 7: Commit the failing tests**

Run:

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-06-noble-random-narrowing.md
rtk git commit -m "test(web): cover narrowed noble random profile"
```

After committing, update this task with:

```md
Implementation note: Added focused failing coverage for Noble random identity, required formalwear, paired formal sets, non-noble exclusions, and Noble color behavior.
Commit: output of `rtk git rev-parse --short HEAD` after `test(web): cover narrowed noble random profile`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation.
```

Implementation note: Added focused failing coverage for Noble random identity, required formalwear, paired formal sets, non-noble exclusions, and Noble color behavior.
Commit: ad96f953e
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation.

## Task 2: Implement Profile Item Sets and Tighten Noble Profile

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `packages/web/src/slice/random-outfit.ts`
- Modify: `docs/superpowers/plans/2026-07-06-noble-random-narrowing.md`

- [ ] **Step 1: Add the profile item set type**

In `packages/web/src/slice/random-profiles.ts`, insert this interface immediately before `export interface RandomProfile`:

```ts
export interface RandomItemSet {
  readonly requiredTypeNames: readonly TypeName[];
  readonly items: Partial<Record<TypeName, string>>;
}
```

Then add this property to `RandomProfile` after `itemPools`:

```ts
  readonly itemSets?: readonly RandomItemSet[];
```

The complete `RandomProfile` interface should be:

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
  readonly itemSets?: readonly RandomItemSet[];
}
```

- [ ] **Step 2: Tighten `NOBLE_RANDOM_PROFILE`**

In `packages/web/src/slice/random-profiles.ts`, replace `NOBLE_RANDOM_PROFILE` with:

```ts
export const NOBLE_RANDOM_PROFILE: RandomProfile = {
  id: 'noble',
  labelKey: 'preset.noble',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories'],
  excludeGroups: ['fantasy', 'weapons', 'fx'],
  optionalProb: 0.6,
  bodyType: 'male',
  typeNames: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes', 'hat'],
  requiredTypeNames: ['body', 'head', 'expression', 'clothes', 'legs', 'shoes', 'hat'],
  randomColorTypeNames: ['body', 'legs', 'shoes', 'hat'],
  itemPools: {
    body: ['Body Color'],
    head: ['Human Male'],
    expression: ['Neutral'],
    shoes: ['Basic Shoes'],
    hat: ['Formal Tophat'],
  },
  itemSets: [
    {
      requiredTypeNames: ['clothes', 'legs'],
      items: {
        clothes: 'Collared/Formal Longsleeve',
        legs: 'Formal Pants',
      },
    },
    {
      requiredTypeNames: ['clothes', 'legs'],
      items: {
        clothes: 'Striped Collared/Formal Longsleeve',
        legs: 'Striped Formal Pants',
      },
    },
  ],
};
```

- [ ] **Step 3: Add helpers for compatible profile item sets**

In `packages/web/src/slice/random-outfit.ts`, add these helper functions immediately after `shouldRandomizeColor`:

```ts
function hasSelectionForType(
  items: Readonly<Record<TypeName, Selection>>,
  typeName: TypeName,
): boolean {
  return Object.prototype.hasOwnProperty.call(items, typeName);
}

function itemForProfileSetEntry(
  catalog: Catalog,
  typeName: TypeName,
  itemName: string,
  bodyType: BodyType,
): ItemDefinition | undefined {
  const defs = catalog.byTypeName.get(typeName) ?? [];
  return defs.find(
    (item) => item.name === itemName && itemSupportsBodyType(item, bodyType),
  );
}

function compatibleProfileItemSetEntries(
  catalog: Catalog,
  profile: RandomProfile,
  bodyType: BodyType,
  scope: RandomScope,
  excluded: ReadonlySet<GroupId>,
  currentItems: Readonly<Record<TypeName, Selection>>,
): readonly (readonly [TypeName, ItemDefinition])[][] {
  const compatibleSets: (readonly [TypeName, ItemDefinition])[][] = [];

  for (const itemSet of profile.itemSets ?? []) {
    const entries = Object.entries(itemSet.items) as readonly [TypeName, string][];
    const entryByTypeName = new Map<TypeName, string>(entries);

    if (
      itemSet.requiredTypeNames.some(
        (typeName) => !entryByTypeName.has(typeName),
      )
    ) {
      continue;
    }

    const compatibleEntries: (readonly [TypeName, ItemDefinition])[] = [];
    let isCompatible = true;

    for (const [typeName, itemName] of entries) {
      const group = CATEGORY_GROUPS.find((g) => g.typeNames.includes(typeName));
      if (group && excluded.has(group.id)) {
        isCompatible = false;
        break;
      }
      if (!isTypeEnabledByRandomScope(typeName, scope)) {
        isCompatible = false;
        break;
      }
      if (hasSelectionForType(currentItems, typeName)) {
        isCompatible = false;
        break;
      }

      const item = itemForProfileSetEntry(catalog, typeName, itemName, bodyType);
      if (!item) {
        isCompatible = false;
        break;
      }

      compatibleEntries.push([typeName, item]);
    }

    if (isCompatible) {
      compatibleSets.push(compatibleEntries);
    }
  }

  return compatibleSets;
}

function pickProfileItemSetSelections(args: {
  readonly catalog: Catalog;
  readonly profile: RandomProfile;
  readonly bodyType: BodyType;
  readonly scope: RandomScope;
  readonly excluded: ReadonlySet<GroupId>;
  readonly currentItems: Readonly<Record<TypeName, Selection>>;
  readonly palettes?: PaletteMetadata;
  readonly rng: () => number;
}): Record<TypeName, Selection> {
  const compatibleSets = compatibleProfileItemSetEntries(
    args.catalog,
    args.profile,
    args.bodyType,
    args.scope,
    args.excluded,
    args.currentItems,
  );
  if (compatibleSets.length === 0) return {};

  const pick = compatibleSets[Math.floor(args.rng() * compatibleSets.length)]!;
  const selections: Record<TypeName, Selection> = {};

  for (const [typeName, item] of pick) {
    const selection = selectionForItem(
      typeName,
      item,
      args.scope.colors ? args.palettes : undefined,
    );
    selections[typeName] =
      args.scope.colors && shouldRandomizeColor(args.profile, typeName)
        ? {
            ...selection,
            ...randomColorFieldsForItem(item, args.palettes, args.rng),
          }
        : selection;
  }

  return selections;
}
```

- [ ] **Step 4: Use profile item sets before the per-slot loop**

In `packages/web/src/slice/random-outfit.ts`, replace the current initialization:

```ts
  const items: Record<TypeName, Selection> = {
    ...compatiblePreserved,
  };
```

with:

```ts
  const items: Record<TypeName, Selection> = {
    ...compatiblePreserved,
  };
  Object.assign(
    items,
    pickProfileItemSetSelections({
      catalog: args.catalog,
      profile,
      bodyType,
      scope,
      excluded,
      currentItems: items,
      palettes: args.palettes,
      rng,
    }),
  );
```

Then replace the existing per-slot ownership check inside the loop:

```ts
    if (Object.prototype.hasOwnProperty.call(items, typeName)) continue;
```

with:

```ts
    if (hasSelectionForType(items, typeName)) continue;
```

- [ ] **Step 5: Run the focused random-outfit tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Run boundary checks**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 8: Commit the implementation**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts packages/web/src/slice/random-outfit.ts docs/superpowers/plans/2026-07-06-noble-random-narrowing.md
rtk git commit -m "fix(web): narrow noble preset random profile"
```

After committing, update this task with:

```md
Implementation note: Added profile-level item sets, used them to keep Noble formal tops and pants paired, and tightened Noble identity, required slots, item pools, and random color slots.
Commit: output of `rtk git rev-parse --short HEAD` after `fix(web): narrow noble preset random profile`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web typecheck` PASS; `rtk pnpm check:boundaries` PASS.
```

## Task 3: Final Verification and Plan Bookkeeping

**Files:**
- Modify: `docs/superpowers/plans/2026-07-06-noble-random-narrowing.md`

- [ ] **Step 1: Re-run focused random-outfit tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Re-run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Re-run boundary checks**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 4: Record final verification**

Append this note under Task 3 after the checkbox list, replacing the command result words with the observed result:

```md
Implementation note: Recorded final Noble random narrowing verification.
Commit: output of `rtk git rev-parse --short HEAD` after `docs: record noble random verification`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web typecheck` PASS; `rtk pnpm check:boundaries` PASS.
```

- [ ] **Step 5: Commit the verification note**

Run:

```bash
rtk git add docs/superpowers/plans/2026-07-06-noble-random-narrowing.md
rtk git commit -m "docs: record noble random verification"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: Task 1 covers the approved Noble identity, required formal outfit, exclusions, paired formal set, random color, and colors-disabled requirements. Task 2 implements the generic profile item-set mechanism and Noble profile data. Task 3 repeats final verification and records the outcome.
- Placeholder scan: The plan contains concrete paths, code snippets, commands, and expected results. Commit bookkeeping tells the executing worker which command output to record.
- Type consistency: The plan consistently uses `RandomItemSet`, `itemSets`, `requiredTypeNames`, `items`, `pickProfileItemSetSelections`, `compatibleProfileItemSetEntries`, `hasSelectionForType`, and existing `RandomProfile`/`Selection`/`TypeName` names.
