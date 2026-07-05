# Knight Random Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Knight preset random generate a complete human armored knight while preserving body type, hair, armor color, shield color, and optional arm/glove variation.

**Architecture:** This is a web-only profile-data change. The existing `RandomProfile` fields already support item allow-lists, required slots, and random color slots, so the implementation should update `KNIGHT_RANDOM_PROFILE` and focused random outfit tests without touching React UI, core, rendering, attribution, exports, or `upstream/`.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@lpc-toolkit/core` catalog test helpers.

---

## File Structure

- Modify `packages/web/test/random-outfit.test.ts`: add focused failing coverage for Knight human identity, required core equipment, optional arms/gloves, and random colors.
- Modify `packages/web/src/slice/random-profiles.ts`: tighten `KNIGHT_RANDOM_PROFILE` with human item pools, required slots, optional `hair`, and random color slots.
- Modify `docs/superpowers/plans/2026-07-05-knight-random-narrowing.md`: after each task, mark the checkbox, add an implementation note, record the commit hash, and record verification status.

Do not modify `packages/web/src/slice/random-outfit.ts` unless an existing `RandomProfile` mechanism is missing. Current project state already includes `requiredTypeNames`, `itemPools`, and `randomColorTypeNames`.

## Task 1: Add Failing Knight Narrowing Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-05-knight-random-narrowing.md`

- [x] **Step 1: Update expected Knight type names**

In `packages/web/test/random-outfit.test.ts`, find the `preset random profiles only expose their intended type names` test and update only the `knight` expected array to include optional `hair` after `expression`:

```ts
      knight: [
        'body',
        'head',
        'expression',
        'hair',
        'armour',
        'legs',
        'shoes',
        'hat',
        'weapon',
        'shield',
        'arms',
        'gloves',
      ],
```

- [x] **Step 2: Add required core equipment and optional arm/glove coverage**

In `packages/web/test/random-outfit.test.ts`, add this test immediately after the existing `knight profile excludes farmer workwear and mage crystal parts` test:

```ts
  it('knight profile requires human identity and core equipment while leaving arms and gloves optional', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton', 'body'),
      'body/zombie.json': makeItem('Zombie', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'head/wolf.json': makeItem('Wolf male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour'),
      'legs/armour.json': makeRecolorItem('Armour', 'legs'),
      'shoes/armour.json': makeItem('Armour', 'shoes', 'male', [
        'steel',
        'gold',
      ]),
      'hat/armet.json': makeRecolorItem('Armet', 'hat'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'male', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'male', [
        'kite blue gray',
        'kite red gray',
      ]),
      'arms/armour.json': makeRecolorItem('Armour', 'arms'),
      'gloves/gloves.json': makeRecolorItem('Gloves', 'gloves'),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      bodyType: 'male',
      rng: () => 0.5,
      optionalProb: 0,
      profile: 'knight',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Plate' });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Armour' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Armour',
      variant: 'steel',
    });
    expect(sel.items['hat']).toEqual({ typeName: 'hat', name: 'Armet' });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Longsword',
      variant: 'longsword',
    });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite blue gray',
    });
    expect(sel.items['arms']).toBeUndefined();
    expect(sel.items['gloves']).toBeUndefined();
  });
```

- [x] **Step 3: Add female identity compatibility coverage**

Add this test immediately after the test from Step 2:

```ts
  it('knight profile keeps female body type and selects the compatible human head', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body', ['v1'], 'female'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression', 'female'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour', ['v1'], 'female'),
      'legs/armour.json': makeRecolorItem('Armour', 'legs', ['v1'], 'female'),
      'shoes/armour.json': makeItem('Armour', 'shoes', 'female', ['steel']),
      'hat/armet.json': makeRecolorItem('Armet', 'hat', ['v1'], 'female'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'female', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'female', [
        'kite blue gray',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      bodyType: 'female',
      rng: () => 0,
      optionalProb: 0,
      profile: 'knight',
    });

    expect(sel.bodyType).toBe('female');
    expect(sel.items['head']).toEqual({
      typeName: 'head',
      name: 'Human Female',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Longsword',
      variant: 'longsword',
    });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite blue gray',
    });
  });
```

- [x] **Step 4: Add optional arms/gloves and color randomization coverage**

Add this test immediately after the test from Step 3:

```ts
  it('knight profile can randomize armor and shield colors when optional arms and gloves are included', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour'),
      'legs/armour.json': makeRecolorItem('Armour', 'legs'),
      'shoes/armour.json': makeItem('Armour', 'shoes', 'male', [
        'steel',
        'gold',
      ]),
      'hat/armet.json': makeRecolorItem('Armet', 'hat'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'male', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'male', [
        'kite blue gray',
        'kite red gray',
      ]),
      'arms/armour.json': makeRecolorItem('Armour', 'arms'),
      'gloves/gloves.json': makeRecolorItem('Gloves', 'gloves'),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 1,
      profile: 'knight',
    });

    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Messy3' });
    expect(sel.items['armour']).toEqual({
      typeName: 'armour',
      name: 'Plate',
      recolor: 'red',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Armour',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Armour',
      variant: 'gold',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Armet',
      recolor: 'red',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Longsword',
      variant: 'longsword',
    });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite red gray',
    });
    expect(sel.items['arms']).toEqual({
      typeName: 'arms',
      name: 'Armour',
      recolor: 'red',
    });
    expect(sel.items['gloves']).toEqual({
      typeName: 'gloves',
      name: 'Gloves',
      recolor: 'red',
    });
  });
```

- [x] **Step 5: Add color-disabled coverage**

Add this test immediately after the test from Step 4:

```ts
  it('knight profile keeps default colors when random colors are disabled', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour'),
      'legs/armour.json': makeRecolorItem('Armour', 'legs'),
      'shoes/armour.json': makeItem('Armour', 'shoes', 'male', [
        'steel',
        'gold',
      ]),
      'hat/armet.json': makeRecolorItem('Armet', 'hat'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'male', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'male', [
        'kite blue gray',
        'kite red gray',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'knight',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Plate' });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Armour' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Armour',
      variant: 'steel',
    });
    expect(sel.items['hat']).toEqual({ typeName: 'hat', name: 'Armet' });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite blue gray',
    });
  });
```

- [x] **Step 6: Run the focused test file and verify the new tests fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL. The failure should show at least one of these current gaps:

- Knight profile type names do not include `hair`.
- Knight random can select `Skeleton`, `Zombie`, or another non-human identity.
- Knight required equipment is omitted with `optionalProb: 0`.
- Knight colors are not randomized through `randomColorTypeNames`.

- [x] **Step 7: Commit the failing tests**

Run:

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-05-knight-random-narrowing.md
rtk git commit -m "test(web): cover narrowed knight random profile"
```

After committing, update this task with:

```md
Implementation note: Added focused failing coverage for Knight human identity, required core equipment, optional arms/gloves, and profile-level color randomization.
Commit: paste the output of `rtk git log -1 --format=%h`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation.
```

Implementation note: Added focused failing coverage for Knight human identity, required core equipment, optional arms/gloves, and profile-level color randomization.
Commit: 7facb7913.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected before implementation. Key failures: Knight type names missing `hair`; expected human male head but received `Zombie`; expected randomized body recolor `red` but received `c0`; expected required `armour` selection but received `undefined`.

## Task 2: Tighten the Knight Random Profile

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `docs/superpowers/plans/2026-07-05-knight-random-narrowing.md`

- [ ] **Step 1: Update KNIGHT_RANDOM_PROFILE type names**

In `packages/web/src/slice/random-profiles.ts`, find `KNIGHT_RANDOM_PROFILE` and add `hair` immediately after `expression` in `typeNames`:

```ts
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
    'shield',
    'arms',
    'gloves',
  ],
```

- [ ] **Step 2: Add required core Knight slots**

Still in `KNIGHT_RANDOM_PROFILE`, add `requiredTypeNames` after `typeNames`:

```ts
  requiredTypeNames: [
    'body',
    'head',
    'expression',
    'armour',
    'legs',
    'shoes',
    'hat',
    'weapon',
    'shield',
  ],
```

Do not include `hair`, `arms`, or `gloves` in `requiredTypeNames`.

- [ ] **Step 3: Constrain Knight item pools to human identity and fixed equipment**

Replace the existing `itemPools` block in `KNIGHT_RANDOM_PROFILE` with:

```ts
  itemPools: {
    body: ['Body Color'],
    head: ['Human Male', 'Human Female'],
    expression: ['Neutral'],
    armour: ['Plate'],
    legs: ['Armour'],
    shoes: ['Armour'],
    hat: ['Armet'],
    weapon: ['Longsword'],
    shield: ['Kite'],
    arms: ['Armour'],
    gloves: ['Gloves'],
  },
```

- [ ] **Step 4: Add Knight random color slots**

Add `randomColorTypeNames` immediately before `itemPools`:

```ts
  randomColorTypeNames: [
    'body',
    'armour',
    'legs',
    'shoes',
    'hat',
    'shield',
    'arms',
    'gloves',
  ],
```

Do not include `weapon` because the current `Longsword` item has only the `longsword` variant.

- [ ] **Step 5: Run the focused random outfit test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts docs/superpowers/plans/2026-07-05-knight-random-narrowing.md
rtk git commit -m "fix(web): narrow knight preset random profile"
```

After committing, update this task with:

```md
Implementation note: Tightened Knight random profile with human identity pools, required core equipment, optional hair/arms/gloves, and random color slots.
Commit: paste the output of `rtk git log -1 --format=%h`.
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS.
```

## Task 3: Run Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-05-knight-random-narrowing.md`

- [ ] **Step 1: Run the focused test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 4: Commit verification notes**

Update this task with the exact verification results, then run:

```bash
rtk git add docs/superpowers/plans/2026-07-05-knight-random-narrowing.md
rtk git commit -m "docs: record knight random verification"
```

After committing, update this task with:

```md
Implementation note: Recorded final focused test, typecheck, and boundary verification.
Commit: paste the output of `rtk git log -1 --format=%h`.
Verification: focused random outfit test PASS; web typecheck PASS; boundary check PASS.
```
