# Random Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profile-aware random generation so `normal` preserves today's dice behavior and future styles can constrain random outfits without changing fixed presets.

**Architecture:** Keep fixed `Preset` data separate from new random-generation data. Add web-only `RandomProfile` and `RandomScope` helpers, make `pickRandomOutfit` accept optional profile/scope/current selections while preserving its current defaults, then wire the sidebar dice through active style and coarse random toggles.

**Tech Stack:** TypeScript strict, React 18 functional components, pnpm workspaces, Vitest, existing Tailwind/shadcn-style button primitives. No new dependencies.

---

## Files

- Create: `packages/web/src/slice/random-profiles.ts`
  - Owns `RandomProfile`, `RandomScope`, `NORMAL_RANDOM_PROFILE`, default scope, profile lookup, and scope/type helpers.
- Modify: `packages/web/src/slice/random-outfit.ts`
  - Uses optional `profile`, `scope`, and `currentSelections` while preserving old call behavior.
- Modify: `packages/web/test/random-outfit.test.ts`
  - Adds regression coverage for `normal`, fallback, scope preservation, and constrained pools.
- Modify: `packages/web/src/components/layer-stack/preset-bar.tsx`
  - Stores active style and random scope; routes dice through profile-aware random.
- Modify: `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`
  - Reports selected preset id to `PresetBar` when a fixed preset is applied.
- Modify: `packages/web/src/i18n.ts`
  - Adds labels for the random options UI.
- Do not modify: `upstream/`.

## Project Rule

After each task commit, update this plan file:

- Mark completed checkboxes.
- Add a short implementation note below the task.
- Record the commit hash.
- Record verification status.

Use `rtk` for all terminal commands.

### Task 1: Add Random Profile Model

**Files:**
- Create: `packages/web/src/slice/random-profiles.ts`
- Modify: `packages/web/src/i18n.ts`

- [x] **Step 1: Add the normal profile label**

In `packages/web/src/i18n.ts`, add this English key near `randomize.title`:

```ts
    'randomProfile.normal': 'Normal',
```

Add this Traditional Chinese key in the `zh` translation object near the existing `randomize.title` translation:

```ts
    'randomProfile.normal': '一般',
```

- [x] **Step 2: Create the model file**

Create `packages/web/src/slice/random-profiles.ts`:

```ts
import type { Selection, TypeName } from '@lpc-toolkit/core';
import type { TranslationKey } from '../i18n';
import {
  CATEGORY_GROUPS,
  groupForType,
  type GroupId,
} from './category-groups';

export interface RandomProfile {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly requiredGroups: readonly GroupId[];
  readonly optionalGroups: readonly GroupId[];
  readonly excludeGroups: readonly GroupId[];
  readonly optionalProb: number;
  readonly itemPools?: Partial<Record<TypeName, readonly string[]>>;
}

export interface RandomScope {
  readonly appearance: boolean;
  readonly clothing: boolean;
  readonly equipment: boolean;
  readonly colors: boolean;
}

export const DEFAULT_RANDOM_SCOPE: RandomScope = {
  appearance: true,
  clothing: true,
  equipment: true,
  colors: true,
};

export const NORMAL_RANDOM_PROFILE: RandomProfile = {
  id: 'normal',
  labelKey: 'randomProfile.normal',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories', 'weapons', 'fantasy'],
  excludeGroups: ['fx'],
  optionalProb: 0.5,
};

export const RANDOM_PROFILES: readonly RandomProfile[] = [
  NORMAL_RANDOM_PROFILE,
];

const RANDOM_PROFILE_BY_ID: ReadonlyMap<string, RandomProfile> = new Map(
  RANDOM_PROFILES.map((profile) => [profile.id, profile]),
);

const APPEARANCE_GROUPS: ReadonlySet<GroupId> = new Set(['body', 'face', 'fantasy']);
const CLOTHING_GROUPS: ReadonlySet<GroupId> = new Set(['clothing', 'accessories']);
const EQUIPMENT_GROUPS: ReadonlySet<GroupId> = new Set(['weapons']);

export function randomProfileForStyle(styleId: string | null | undefined): RandomProfile {
  if (!styleId) return NORMAL_RANDOM_PROFILE;
  return RANDOM_PROFILE_BY_ID.get(styleId) ?? NORMAL_RANDOM_PROFILE;
}

export function profileTypeNames(profile: RandomProfile): readonly TypeName[] {
  const included = new Set<GroupId>([
    ...profile.requiredGroups,
    ...profile.optionalGroups,
  ]);
  const excluded = new Set<GroupId>(profile.excludeGroups);
  return CATEGORY_GROUPS
    .filter((group) => included.has(group.id) && !excluded.has(group.id))
    .flatMap((group) => group.typeNames);
}

export function isTypeEnabledByRandomScope(
  typeName: TypeName,
  scope: RandomScope,
): boolean {
  const group = groupForType(typeName);
  if (!group) return false;
  if (APPEARANCE_GROUPS.has(group)) return scope.appearance;
  if (CLOTHING_GROUPS.has(group)) return scope.clothing;
  if (EQUIPMENT_GROUPS.has(group)) return scope.equipment;
  return false;
}

export function preserveDisabledScopeSelections(
  currentSelections: Readonly<Record<TypeName, Selection>>,
  scope: RandomScope,
): Record<TypeName, Selection> {
  const preserved: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(currentSelections)) {
    if (!isTypeEnabledByRandomScope(typeName, scope)) {
      preserved[typeName] = selection;
    }
  }
  return preserved;
}
```

- [x] **Step 3: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
rtk git add packages/web/src/slice/random-profiles.ts packages/web/src/i18n.ts docs/superpowers/plans/2026-07-02-random-profiles.md
rtk git commit -m "feat(web): add random profile model"
```

Implementation note: Added the web-only normal random profile model and English/zh-TW label key.
Commit: 81b1e9b7e24f622c3e25687dc7a92f09b09b62a8
Verification: `rtk pnpm --filter @lpc-toolkit/web typecheck` reported no TypeScript errors but exited 1 due the rtk pnpm filter warning; `rtk pnpm --dir packages/web typecheck` PASS.

### Task 2: Make `pickRandomOutfit` Profile-Aware

**Files:**
- Modify: `packages/web/src/slice/random-outfit.ts`
- Test: `packages/web/test/random-outfit.test.ts`

- [x] **Step 1: Add failing tests for profile and scope behavior**

Append these tests inside the existing `describe('pickRandomOutfit', () => { ... })` block in `packages/web/test/random-outfit.test.ts`, before the final closing brace:

```ts
  it('normal profile preserves current default random behavior', () => {
    const rngValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const legacy = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
    });
    const profiled = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
      profile: 'normal',
    });
    expect(profiled).toEqual(legacy);
  });

  it('unknown profile ids fall back to normal', () => {
    const rngValues = [0.2, 0.3, 0.4, 0.5, 0.6];
    const normal = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
      profile: 'normal',
    });
    const unknown = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
      profile: 'missing-style',
    });
    expect(unknown).toEqual(normal);
  });

  it('preserves disabled scope selections from the current outfit', () => {
    const sel = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      currentSelections: {
        weapon: { typeName: 'weapon', name: 'Existing Sword' },
        hair: { typeName: 'hair', name: 'Existing Hair' },
      },
      scope: {
        appearance: false,
        clothing: true,
        equipment: false,
        colors: true,
      },
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Existing Sword',
    });
    expect(sel.items['hair']).toEqual({
      typeName: 'hair',
      name: 'Existing Hair',
    });
  });

  it('profile itemPools constrain choices to allowed names', () => {
    const { catalog: poolCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'weapon/staff.json': makeItem('Staff', 'weapon'),
    });
    const sel = pickRandomOutfit({
      catalog: poolCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: {
        id: 'mage-test',
        labelKey: 'randomProfile.normal',
        requiredGroups: ['body'],
        optionalGroups: ['weapons'],
        excludeGroups: [],
        optionalProb: 1.0,
        itemPools: {
          weapon: ['Staff'],
        },
      },
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Staff',
    });
  });
```

- [x] **Step 2: Run the focused test and verify failure**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL because `profile`, `scope`, and `currentSelections` are not accepted yet.

- [x] **Step 3: Update `random-outfit.ts`**

Replace `packages/web/src/slice/random-outfit.ts` with:

```ts
import type {
  BodyType,
  Catalog,
  ItemDefinition,
  PaletteMetadata,
  Selection,
  Selections,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './catalog-tree';
import { CATEGORY_GROUPS, type GroupId } from './category-groups';
import {
  DEFAULT_RANDOM_SCOPE,
  NORMAL_RANDOM_PROFILE,
  isTypeEnabledByRandomScope,
  preserveDisabledScopeSelections,
  profileTypeNames,
  randomProfileForStyle,
  type RandomProfile,
  type RandomScope,
} from './random-profiles';
import { selectionForItem } from './selection';

/** Inputs for generating a random outfit from the currently loaded catalog. */
export interface PickRandomOutfitArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly rng?: () => number;          // defaults to Math.random
  readonly optionalProb?: number;       // defaults to profile optionalProb
  readonly excludeGroups?: readonly GroupId[]; // defaults to profile excludeGroups
  readonly palettes?: PaletteMetadata;  // enables default recolor selection
  readonly profile?: RandomProfile | string;
  readonly scope?: RandomScope;
  readonly currentSelections?: Readonly<Record<TypeName, Selection>>;
}

function resolveProfile(profile: RandomProfile | string | undefined): RandomProfile {
  if (!profile) return NORMAL_RANDOM_PROFILE;
  if (typeof profile === 'string') return randomProfileForStyle(profile);
  return profile;
}

function isRequiredType(profile: RandomProfile, typeName: TypeName): boolean {
  const requiredGroups = new Set<GroupId>(profile.requiredGroups);
  return CATEGORY_GROUPS.some(
    (group) => requiredGroups.has(group.id) && group.typeNames.includes(typeName),
  );
}

function filterByProfilePool(
  defs: readonly ItemDefinition[],
  allowedNames: readonly string[] | undefined,
): typeof defs {
  if (!allowedNames) return defs;
  const allowed = new Set(allowedNames);
  return defs.filter((item) => allowed.has(item.name));
}

/**
 * Generate a Feeling Lucky outfit. Required profile groups always get an item
 * when compatible art exists. Optional groups are included with probability
 * `optionalProb`. Disabled random scopes preserve current selections.
 */
export function pickRandomOutfit(args: PickRandomOutfitArgs): Selections {
  const rng = args.rng ?? Math.random;
  const profile = resolveProfile(args.profile);
  const scope = args.scope ?? DEFAULT_RANDOM_SCOPE;
  const optionalProb = args.optionalProb ?? profile.optionalProb;
  const excluded = new Set<GroupId>(args.excludeGroups ?? profile.excludeGroups);

  const items: Record<TypeName, Selection> = {
    ...(args.currentSelections
      ? preserveDisabledScopeSelections(args.currentSelections, scope)
      : {}),
  };

  for (const typeName of profileTypeNames(profile)) {
    const group = CATEGORY_GROUPS.find((g) => g.typeNames.includes(typeName));
    if (group && excluded.has(group.id)) continue;
    if (args.scope && !isTypeEnabledByRandomScope(typeName, scope)) continue;
    if (Object.prototype.hasOwnProperty.call(items, typeName)) continue;

    const isRequired = isRequiredType(profile, typeName);
    if (!isRequired && rng() > optionalProb) continue;

    const defs = args.catalog.byTypeName.get(typeName) ?? [];
    const pooled = filterByProfilePool(defs, profile.itemPools?.[typeName]);
    const compatible = pooled.filter((d) => itemSupportsBodyType(d, args.bodyType));
    if (compatible.length === 0) continue;

    const pick = compatible[Math.floor(rng() * compatible.length)]!;
    items[typeName] = selectionForItem(
      typeName,
      pick,
      scope.colors ? args.palettes : undefined,
    );
  }

  return { bodyType: args.bodyType, items };
}
```

- [x] **Step 4: Run focused tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [x] **Step 5: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
rtk git add packages/web/src/slice/random-outfit.ts packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-02-random-profiles.md
rtk git commit -m "feat(web): make random outfit profile aware"
```

Implementation note: Added profile/scope/current selection support to `pickRandomOutfit`, including item pool filtering and disabled-scope preservation. Kept legacy explicit `excludeGroups` behavior for existing callers so `excludeGroups: []` can still re-enable fx.
Commit: 8d89ad6268893a1c481ce4e64c1c1dd397994405
Verification: RED `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` failed as expected on missing scope/itemPool behavior (2 failing assertions). GREEN initially exposed a legacy `excludeGroups` regression; after the compatibility adjustment, `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS. Typecheck: `rtk pnpm --filter @lpc-toolkit/web typecheck` reported no TypeScript errors but exited 1 due the rtk pnpm filter warning; `rtk pnpm --dir packages/web typecheck` PASS.

### Task 3: Add Random Scope UI State

**Files:**
- Modify: `packages/web/src/components/layer-stack/preset-bar.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`
- Modify: `packages/web/src/i18n.ts`

- [x] **Step 1: Add i18n labels**

In `packages/web/src/i18n.ts`, add these English keys near `randomize.title`:

```ts
    'randomScope.title': 'Random options',
    'randomScope.appearance': 'Appearance',
    'randomScope.clothing': 'Clothing',
    'randomScope.equipment': 'Equipment',
    'randomScope.colors': 'Colors',
```

Add these Traditional Chinese keys in the `zh` translation object near the existing `randomize.title` translation:

```ts
    'randomScope.title': '隨機選項',
    'randomScope.appearance': '外貌',
    'randomScope.clothing': '服裝',
    'randomScope.equipment': '裝備',
    'randomScope.colors': '顏色',
```

- [x] **Step 2: Extend `PresetMenuPopover` props**

In `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`, add this prop to the `Props` interface:

```ts
  onStyleSelected: (styleId: string) => void;
```

Add it to the component destructuring:

```ts
  onStyleSelected,
}: Props) {
```

In the existing preset row `onClick`, insert the style update between `onApplied(...)` and `setOpen(false)`:

```ts
onStyleSelected(preset.id);
setOpen(false);
```

Keep the existing fixed preset apply behavior unchanged.

- [x] **Step 3: Update `PresetBar` state and dice call**

In `packages/web/src/components/layer-stack/preset-bar.tsx`, add imports:

```ts
import {
  DEFAULT_RANDOM_SCOPE,
  randomProfileForStyle,
  type RandomScope,
} from '../../slice/random-profiles';
```

Add local state inside `PresetBar`:

```ts
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  const [randomScope, setRandomScope] = useState<RandomScope>(DEFAULT_RANDOM_SCOPE);
```

Change the dice dispatch to:

```ts
dispatch({
  type: 'apply_selections',
  selections: pickRandomOutfit({
    catalog,
    palettes,
    bodyType: state.bodyType,
    profile: randomProfileForStyle(activeStyleId),
    scope: randomScope,
    currentSelections: state.selections,
  }),
});
```

Pass the style callback to `PresetMenuPopover`:

```tsx
onStyleSelected={setActiveStyleId}
```

- [x] **Step 4: Render coarse random toggles**

In `PresetBar`, below the button row and before the popovers, add:

```tsx
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-dim">
        <span>{t('randomScope.title')}</span>
        {([
          ['appearance', t('randomScope.appearance')],
          ['clothing', t('randomScope.clothing')],
          ['equipment', t('randomScope.equipment')],
          ['colors', t('randomScope.colors')],
        ] as const).map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={randomScope[key]}
              onChange={(event) =>
                setRandomScope((current) => ({
                  ...current,
                  [key]: event.currentTarget.checked,
                }))
              }
              className="h-3 w-3"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
```

- [x] **Step 5: Run i18n tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts
```

Expected: PASS.

- [x] **Step 6: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
rtk git add packages/web/src/components/layer-stack/preset-bar.tsx packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx packages/web/src/i18n.ts docs/superpowers/plans/2026-07-02-random-profiles.md
rtk git commit -m "feat(web): add random scope controls"
```

Implementation note: Added random scope labels, tracked the most recently applied preset style in `PresetBar`, routed dice randomization through `randomProfileForStyle` and `randomScope`, and rendered coarse randomization toggles.
Commit: 200434da37a5fb8cf5172076f36995de3065db68
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts` PASS (18 tests). `rtk pnpm --filter @lpc-toolkit/web typecheck` reported no TypeScript errors but exited 1 due the rtk pnpm filter warning; `rtk pnpm --dir packages/web typecheck` PASS.

### Task 4: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-02-random-profiles.md`

- [x] **Step 1: Run random tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [x] **Step 2: Run component-adjacent tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts test/stack-panel.test.tsx
```

Expected: PASS.

- [x] **Step 3: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 4: Run full web test suite**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test
```

Expected: PASS. If it fails, record the exact failure in this plan file and in the final handoff before continuing.

- [x] **Step 5: Commit plan verification update**

```bash
rtk git add docs/superpowers/plans/2026-07-02-random-profiles.md
rtk git commit -m "docs: record random profiles verification"
```

Implementation note: Ran the Task 4 final verification commands fresh and recorded the exact outcomes. The full suite initially failed before tests in sandbox because `tsx` could not create its IPC pipe; rerunning the same command with approved escalation passed.
Commit: 60c44720a1ab43f657c7c69009b2ae4313a1d4ed
Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS (1 file, 17 tests). `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts test/stack-panel.test.tsx` PASS (2 files, 25 tests). `rtk pnpm --filter @lpc-toolkit/web typecheck` reported `TypeScript: No errors found` but exited 1 due the RTK filter warning; `rtk pnpm --dir packages/web typecheck` PASS. `rtk pnpm --filter @lpc-toolkit/web test` initially failed in sandbox during pretest with `listen EPERM` for the `tsx` IPC pipe; escalated rerun PASS (58 files, 446 tests).

## Manual Smoke Check

After implementation, run the dev server:

```bash
rtk pnpm --filter @lpc-toolkit/web dev
```

Open the local Vite URL and verify:

- The preset bar still has the dice, preset dropdown, and reset controls.
- The random options row shows Appearance, Clothing, Equipment, and Colors.
- Turning off Equipment preserves the currently selected weapon/shield when pressing dice.
- Turning off Appearance preserves hair/face/body selections when pressing dice.
- Applying a fixed preset still changes the outfit as before.
- Pressing dice after applying a preset still produces a valid rendered character.

## Final Review Follow-Up

- [x] Fix scoped preservation so excluded `fx` selections are not retained when all random scopes are enabled.
  - Implementation note: Added a regression test for an existing `wound_arm` selection and changed preservation to keep only known appearance, clothing, or equipment groups whose scope flag is disabled.
  - Commit: bb6d89524315da0f179e8b9459bbe2904f01f75e
  - Verification: RED `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` failed with `wound_arm` preserved. GREEN `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS (18 tests). Typecheck: `rtk pnpm --filter @lpc-toolkit/web typecheck` reported no TypeScript errors but exited 1 due the RTK filter warning; `rtk pnpm --dir packages/web typecheck` PASS.
