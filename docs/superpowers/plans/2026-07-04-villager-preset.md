# Villager Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clothing-only everyday Villager preset and matching preset random profile to the web app.

**Architecture:** This is a web-only data, i18n, and test change. Fixed preset data stays in `packages/web/src/presets.ts`; preset labels stay in `packages/web/src/i18n.ts`; random profile behavior stays in `packages/web/src/slice/random-profiles.ts`. No core, adapter, browser runtime, or `upstream/` changes are needed.

**Tech Stack:** TypeScript strict mode, React/Vite web package, Vitest, pnpm workspaces, existing LPC catalog data.

---

## File Structure

- Modify `packages/web/test/presets.test.ts`: update preset-count expectation before adding the new preset.
- Modify `packages/web/src/presets.ts`: add the `villager` fixed preset as a clothing-only preset.
- Modify `packages/web/src/i18n.ts`: add `preset.villager` in English and Traditional Chinese translations.
- Modify `packages/web/test/random-outfit.test.ts`: add `villager` to the expected preset random-profile type-name coverage and add a focused profile behavior test.
- Modify `packages/web/src/slice/random-profiles.ts`: add `VILLAGER_RANDOM_PROFILE` and include it in `RANDOM_PROFILES`.
- Modify `docs/superpowers/plans/2026-07-04-villager-preset.md`: after each completed task, mark the checkbox, add a short implementation note, record the commit hash, and record verification status.

## Task 1: Add Fixed Villager Preset

**Files:**

- Modify: `packages/web/test/presets.test.ts`
- Modify: `packages/web/src/presets.ts`
- Modify: `packages/web/src/i18n.ts`
- Modify: `docs/superpowers/plans/2026-07-04-villager-preset.md`

- [x] **Step 1: Update the preset count test first**

In `packages/web/test/presets.test.ts`, change the first test from:

```ts
  it('has 5 presets with unique ids', () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(5);
  });
```

to:

```ts
  it('has 6 presets with unique ids', () => {
    expect(PRESETS).toHaveLength(6);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(6);
  });
```

- [x] **Step 2: Run the preset test to verify the count fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts
```

Expected: FAIL because `PRESETS` still has length 5.

- [x] **Step 3: Add the fixed villager preset**

In `packages/web/src/presets.ts`, add the new preset after the `farmer` preset and before `mage`:

```ts
  {
    id: 'villager',
    labelKey: 'preset.villager',
    emoji: '🏘️',
    items: [
      { typeName: 'clothes', name: 'Longsleeve', recolor: 'brown' },
      { typeName: 'legs', name: 'Pants', recolor: 'brown' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'tan' },
    ],
  },
```

Do not add `bodyType`, `body`, `head`, `expression`, or `hair` to this preset.

- [x] **Step 4: Add the villager translations**

In `packages/web/src/i18n.ts`, add the English key near the other `preset.*` labels:

```ts
    'preset.villager': 'Villager',
```

Place it after:

```ts
    'preset.farmer': 'Farmer',
```

In the `zh-TW` translation object, add:

```ts
    'preset.villager': '村民',
```

Place it after:

```ts
    'preset.farmer': '農民',
```

- [x] **Step 5: Run the preset test to verify the fixed preset passes**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts
```

Expected: PASS. The catalog validation should confirm `Longsleeve`, `Pants`, `Basic Shoes`, and the `tan` shoe variant resolve.

- [x] **Step 6: Commit the fixed preset task**

Run:

```bash
rtk git status --short
rtk git add packages/web/test/presets.test.ts packages/web/src/presets.ts packages/web/src/i18n.ts docs/superpowers/plans/2026-07-04-villager-preset.md
rtk git commit -m "feat(web): add villager preset"
```

After committing, run:

```bash
rtk git rev-parse --short HEAD
```

Update this task checkbox with an implementation note, the printed commit hash,
and the preset test verification result.

Implementation note: Added the clothing-only `villager` fixed preset after
`farmer`, added English and Traditional Chinese preset labels, and updated the
preset count test to expect six unique presets.
Commit: `08ae4bbe8` (`feat(web): add villager preset`).
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run
test/presets.test.ts` PASS (6 tests).

## Task 2: Add Villager Random Profile

**Files:**

- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `docs/superpowers/plans/2026-07-04-villager-preset.md`

- [ ] **Step 1: Update the expected preset profile type names**

In `packages/web/test/random-outfit.test.ts`, in the `preset random profiles only expose their intended type names` test, add `villager` after `farmer` in the `expected` object:

```ts
      villager: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes'],
```

The start of the `expected` object should become:

```ts
    const expected: Readonly<Record<string, readonly string[]>> = {
      farmer: ['body', 'head', 'expression', 'hair', 'clothes', 'overalls', 'shoes'],
      villager: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes'],
      mage: [
```

- [ ] **Step 2: Add a focused villager profile behavior test**

In `packages/web/test/random-outfit.test.ts`, add this test after the existing `farmer profile excludes fantasy, combat, and fx categories` test:

```ts
  it('villager profile keeps random outfits mundane and clothing-only', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'head/human.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/longsleeve.json': makeItem('Longsleeve', 'clothes'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'clothes/formal.json': makeItem('Collared/Formal Longsleeve', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', ['tan']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'apron/plain.json': makeItem('Apron', 'apron'),
      'hat/hood.json': makeItem('Hood', 'hat'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'villager',
    });

    expect(sel.items['body']).toBeDefined();
    expect(sel.items['clothes']?.name).toBe('Longsleeve');
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'tan',
    });

    for (const typeName of [
      'overalls',
      'apron',
      'hat',
      'weapon',
      'shield',
      'wings',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });
```

- [ ] **Step 3: Run the random outfit test to verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL because `randomProfileForStyle('villager')` still falls back to `normal`.

- [ ] **Step 4: Add `VILLAGER_RANDOM_PROFILE`**

In `packages/web/src/slice/random-profiles.ts`, add this export after `FARMER_RANDOM_PROFILE`:

```ts
export const VILLAGER_RANDOM_PROFILE: RandomProfile = {
  id: 'villager',
  labelKey: 'preset.villager',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories'],
  excludeGroups: ['fantasy', 'weapons', 'fx'],
  optionalProb: 0.6,
  typeNames: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes'],
  itemPools: {
    clothes: ['Longsleeve', 'Shortsleeve'],
    legs: ['Pants'],
    shoes: ['Basic Shoes', 'Basic Boots'],
  },
};
```

Then include it in `RANDOM_PROFILES` immediately after `FARMER_RANDOM_PROFILE`:

```ts
export const RANDOM_PROFILES: readonly RandomProfile[] = [
  NORMAL_RANDOM_PROFILE,
  FARMER_RANDOM_PROFILE,
  VILLAGER_RANDOM_PROFILE,
  MAGE_RANDOM_PROFILE,
  KNIGHT_RANDOM_PROFILE,
  RANGER_RANDOM_PROFILE,
  NOBLE_RANDOM_PROFILE,
];
```

- [ ] **Step 5: Run the random outfit test to verify it passes**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the villager random profile task**

Run:

```bash
rtk git status --short
rtk git add packages/web/test/random-outfit.test.ts packages/web/src/slice/random-profiles.ts docs/superpowers/plans/2026-07-04-villager-preset.md
rtk git commit -m "feat(web): add villager random profile"
```

After committing, run:

```bash
rtk git rev-parse --short HEAD
```

Update this task checkbox with an implementation note, the printed commit hash,
and the random outfit test verification result.

## Task 3: Final Verification

**Files:**

- Modify: `docs/superpowers/plans/2026-07-04-villager-preset.md`

- [ ] **Step 1: Run focused preset tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused random profile tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run web typecheck**

Run:

```bash
rtk pnpm --dir packages/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Run architecture boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 5: Inspect final git status**

Run:

```bash
rtk git status --short
```

Expected: only the plan file may be modified from recording task status and verification notes.

- [ ] **Step 6: Commit final plan notes**

If the plan file changed while recording implementation notes and verification status, run:

```bash
rtk git add docs/superpowers/plans/2026-07-04-villager-preset.md
rtk git commit -m "docs: record villager preset implementation"
```

If the plan file did not change, do not create an empty commit.

After committing, run:

```bash
rtk git status --short
```

Expected: clean working tree.

## Self-Review

- Spec coverage: Task 1 covers the fixed clothing-only preset and i18n labels. Task 2 covers the matching random profile. Task 3 covers the requested focused verification and architecture boundary check.
- Placeholder scan: The plan contains concrete file paths, code snippets, commands, and expected outcomes.
- Type consistency: The new preset id is consistently `villager`, the translation key is consistently `preset.villager`, and the random profile id matches the preset id.
