# Farmer Random Profile and Scope Toggle Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a farmer-only random profile and stabilize the random scope checkbox UI so farmer random output stays civilian/farming-oriented and checkbox toggles do not black-screen the app.

**Architecture:** Keep fixed presets separate from random profiles. Extend the web-only `RandomProfile` model with an optional `typeNames` allow-list so `normal` keeps its group-based behavior while `farmer` can restrict generation to a small civilian slot set. Add focused unit coverage for farmer exclusions and server-render coverage for the random scope controls before applying the smallest implementation changes.

**Tech Stack:** TypeScript strict, React 18 functional components, pnpm workspaces, Vitest, existing React server rendering tests. No new dependencies.

---

## Files

- Modify: `packages/web/src/slice/random-profiles.ts`
  - Add optional `typeNames` to `RandomProfile`.
  - Add `FARMER_RANDOM_PROFILE`.
  - Include farmer in `RANDOM_PROFILES`.
  - Make `profileTypeNames` honor explicit profile type names.
- Modify: `packages/web/test/random-outfit.test.ts`
  - Add farmer profile regression tests.
  - Keep existing `normal` and fallback tests passing.
- Modify: `packages/web/test/stack-panel.test.tsx`
  - Add server-render coverage for random scope checkboxes.
  - Assert the scope controls render without dispatching selection changes.
- Do not modify: `upstream/`.

## Project Rules

- Use `rtk` for every terminal command.
- Use `pnpm`.
- Do not add dependencies.
- Do not introduce `any`.
- Keep changes surgical and limited to the files above unless a failing test identifies a direct cause elsewhere.
- After each task commit, update this plan file:
  - Mark completed checkboxes.
  - Add a short implementation note.
  - Record the commit hash.
  - Record verification status.

## Task 1: Add Farmer Random Profile

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-02-random-profile-farmer-stability.md`

- [ ] **Step 1: Add failing farmer profile tests**

In `packages/web/test/random-outfit.test.ts`, update the import:

```ts
import { pickRandomOutfit } from '../src/slice/random-outfit';
import { randomProfileForStyle } from '../src/slice/random-profiles';
```

Append these tests inside the existing `describe('pickRandomOutfit', () => { ... })` block, after the existing `profile itemPools constrain choices to allowed names` test:

```ts
  it('resolves farmer as a dedicated random profile', () => {
    expect(randomProfileForStyle('farmer').id).toBe('farmer');
  });

  it('farmer profile excludes fantasy, combat, and fx categories', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'head/human.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'horns/basic.json': makeItem('Horns', 'horns'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'farmer',
    });

    expect(sel.items['body']).toBeDefined();
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

    for (const typeName of [
      'wings',
      'horns',
      'armour',
      'chainmail',
      'weapon',
      'weapon_magic_crystal',
      'shield',
      'quiver',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });
```

- [ ] **Step 2: Run the focused random tests and verify failure**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL because `randomProfileForStyle('farmer')` currently returns `normal`.

- [ ] **Step 3: Extend `RandomProfile` with explicit type names**

In `packages/web/src/slice/random-profiles.ts`, add `typeNames` to the interface:

```ts
export interface RandomProfile {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly requiredGroups: readonly GroupId[];
  readonly optionalGroups: readonly GroupId[];
  readonly excludeGroups: readonly GroupId[];
  readonly optionalProb: number;
  readonly typeNames?: readonly TypeName[];
  readonly itemPools?: Partial<Record<TypeName, readonly string[]>>;
}
```

Then update `profileTypeNames` so explicit type names override group expansion:

```ts
export function profileTypeNames(profile: RandomProfile): readonly TypeName[] {
  if (profile.typeNames) return profile.typeNames;

  const included = new Set<GroupId>([
    ...profile.requiredGroups,
    ...profile.optionalGroups,
  ]);
  const excluded = new Set<GroupId>(profile.excludeGroups);
  return CATEGORY_GROUPS
    .filter((group) => included.has(group.id) && !excluded.has(group.id))
    .flatMap((group) => group.typeNames);
}
```

- [ ] **Step 4: Add `FARMER_RANDOM_PROFILE`**

In `packages/web/src/slice/random-profiles.ts`, add this profile after `NORMAL_RANDOM_PROFILE`:

```ts
export const FARMER_RANDOM_PROFILE: RandomProfile = {
  id: 'farmer',
  labelKey: 'preset.farmer',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories'],
  excludeGroups: ['fantasy', 'weapons', 'fx'],
  optionalProb: 0.5,
  typeNames: ['body', 'head', 'expression', 'hair', 'clothes', 'overalls', 'shoes'],
  itemPools: {
    clothes: ['Shortsleeve'],
    overalls: ['Overalls'],
    shoes: ['Basic Boots'],
  },
};
```

Update `RANDOM_PROFILES`:

```ts
export const RANDOM_PROFILES: readonly RandomProfile[] = [
  NORMAL_RANDOM_PROFILE,
  FARMER_RANDOM_PROFILE,
];
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --dir packages/web typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
rtk git add packages/web/src/slice/random-profiles.ts packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-02-random-profile-farmer-stability.md
rtk git commit -m "feat(web): add farmer random profile"
```

Implementation note:
Commit:
Verification:

## Task 2: Stabilize Random Scope Checkbox UI

**Files:**
- Modify: `packages/web/src/components/layer-stack/preset-bar.tsx` if the failing test identifies a direct state/update issue
- Modify: `packages/web/test/stack-panel.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-02-random-profile-farmer-stability.md`

- [ ] **Step 1: Add server-render coverage for random scope controls**

In `packages/web/test/stack-panel.test.tsx`, add `vi` to the Vitest import:

```ts
import { describe, expect, it, vi } from 'vitest';
```

Add this test to the existing `describe('StackPanel upstream selected-layer groups', () => { ... })` block:

```tsx
  it('renders random scope controls without dispatching selection changes', () => {
    const dispatch = vi.fn();
    const html = renderToStaticMarkup(
      <StackPanel
        disabled={false}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        shownTypeNames={[
          'body',
          'head',
          'hair',
          'hat',
          'gloves',
          'clothes',
          'legs',
          'shoes',
          'tools',
          'weapon',
        ]}
        licenseFilter={ALL_LICENSE_GROUPS}
        toggleLicenseGroup={() => {}}
        licenseIncompatibleCount={0}
        removeLicenseIncompatibleSelections={() => {}}
        animationFilter={new Set()}
        toggleAnimation={() => {}}
        animationIncompatibleCount={0}
        removeAnimationIncompatibleSelections={() => {}}
        customOverlay={null}
        customOverlayZPos={95}
        onCustomOverlayUpload={() => {}}
        onCustomOverlayZPosChange={() => {}}
        onClearCustomOverlay={() => {}}
        t={createTranslator('en')}
        tl={createLabelTranslator('en')}
        onPresetApplied={() => {}}
        onReset={() => {}}
        status={null}
        searchInputRef={{ current: null }}
        expanded={null}
        setExpanded={() => {}}
        replacementCardDisplayMode="overlay"
        onReplacementCardDisplayModeChange={() => {}}
      />
    );

    expect(html).toContain('Random options');
    expect(html).toContain('Appearance');
    expect(html).toContain('Clothing');
    expect(html).toContain('Equipment');
    expect(html).toContain('Colors');
    expect(dispatch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the focused stack panel test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx
```

Expected: PASS if the black-screen cause is not reproducible in server render. If it fails, fix the direct render error before continuing.

- [ ] **Step 3: Inspect the checkbox state update for partial-state risk**

Open `packages/web/src/components/layer-stack/preset-bar.tsx` and verify the checkbox update keeps a complete `RandomScope` object:

```tsx
onChange={(event) =>
  setRandomScope((current) => ({
    ...current,
    [key]: event.currentTarget.checked,
  }))
}
```

If the code still matches this shape, do not change it in this task. If a failing test or browser console error points to a direct cause, apply only that focused fix.

- [ ] **Step 4: Run focused verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx test/random-outfit.test.ts
rtk pnpm --dir packages/web typecheck
```

Expected: both PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
rtk git add packages/web/src/components/layer-stack/preset-bar.tsx packages/web/test/stack-panel.test.tsx docs/superpowers/plans/2026-07-02-random-profile-farmer-stability.md
rtk git commit -m "test(web): cover random scope controls"
```

If `preset-bar.tsx` was not changed, omit it from `git add`.

Implementation note:
Commit:
Verification:

## Task 3: Final Verification and Browser Smoke

**Files:**
- Modify: `docs/superpowers/plans/2026-07-02-random-profile-farmer-stability.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts test/stack-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
rtk pnpm --dir packages/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full web test suite if available**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test
```

Expected: PASS. If sandboxing blocks the `tsx` IPC pipe with `listen EPERM`, rerun the same command with escalation and record both results in the verification note.

- [ ] **Step 4: Manual smoke the reported UI path**

Run the dev server:

```bash
rtk pnpm --filter @lpc-toolkit/web dev
```

Open `http://localhost:5173/` or the port Vite reports, then verify:

- Toggling Appearance, Clothing, Equipment, and Colors repeatedly does not black-screen the app.
- Applying the Farmer preset and pressing random does not add wings, armour, weapons, shields, magic crystals, quiver, or `fx` selections.

Stop the dev server after the smoke check.

- [ ] **Step 5: Commit verification note**

Run:

```bash
rtk git add docs/superpowers/plans/2026-07-02-random-profile-farmer-stability.md
rtk git commit -m "docs: record farmer random verification"
```

Implementation note:
Commit:
Verification:

