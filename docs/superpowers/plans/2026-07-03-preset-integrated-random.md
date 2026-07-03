# Preset-Integrated Random Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move random character generation into the Presets menu so each fixed preset has a matching style-specific Random action.

**Architecture:** Keep random profiles as web-only data in `packages/web/src/slice/random-profiles.ts`, with `normal` retained as a fallback but no longer exposed by the first UI. `PresetBar` becomes a simple Presets/Reset toolbar, while `PresetMenuPopover` owns both row actions: fixed Apply through `computePresetSelection` and style-matched Random through `pickRandomOutfit` using the row preset id.

**Tech Stack:** TypeScript strict, React 18 functional components, pnpm workspaces, Vitest, existing React server rendering tests, Tailwind utilities. No new dependencies.

---

## Files

- Modify: `packages/web/src/slice/random-profiles.ts`
  - Add `MAGE_RANDOM_PROFILE`, `KNIGHT_RANDOM_PROFILE`, `RANGER_RANDOM_PROFILE`, and `NOBLE_RANDOM_PROFILE`.
  - Keep `NORMAL_RANDOM_PROFILE` as fallback and keep `FARMER_RANDOM_PROFILE`.
  - Include all five preset profiles in `RANDOM_PROFILES`.
- Modify: `packages/web/test/random-outfit.test.ts`
  - Add pure random profile coverage for all current preset ids, fallback behavior, profile type-name allow-lists, and style exclusions.
- Modify: `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`
  - Render each preset row with separate `Apply` and `Random` buttons.
  - Export a small row component and action helpers so UI/wiring can be tested without adding React Testing Library or jsdom.
- Modify: `packages/web/src/components/layer-stack/preset-bar.tsx`
  - Remove the standalone dice button.
  - Remove `activeStyleId`, `randomScope`, and the global `Random options` checkbox row.
  - Continue passing `catalog`, `palettes`, `state`, `dispatch`, and `onApplied` into the preset menu.
- Modify: `packages/web/test/stack-panel.test.tsx`
  - Replace random-scope render coverage with static markup coverage for the new Presets menu actions.
  - Add direct helper tests for Apply and Random dispatch wiring.
- Modify: `packages/web/src/i18n.ts`
  - Add a short menu label for the Random row action.
- Do not modify: `upstream/`.
- Do not add dependencies.

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

## Task 1: Pure Random Profile Tests

**Files:**
- Modify: `packages/web/test/random-outfit.test.ts`
- Modify: `docs/superpowers/plans/2026-07-03-preset-integrated-random.md`

- [x] **Step 1: Expand random profile imports**

In `packages/web/test/random-outfit.test.ts`, update the imports:

```ts
import { PRESETS } from '../src/presets';
import { pickRandomOutfit } from '../src/slice/random-outfit';
import {
  NORMAL_RANDOM_PROFILE,
  profileTypeNames,
  randomProfileForStyle,
} from '../src/slice/random-profiles';
```

- [x] **Step 2: Add preset profile resolution tests**

Append these tests inside the existing `describe('pickRandomOutfit', () => { ... })` block:

```ts
  it('resolves every current preset id to a dedicated non-normal random profile', () => {
    for (const preset of PRESETS) {
      const profile = randomProfileForStyle(preset.id);
      expect(profile.id).toBe(preset.id);
      expect(profile).not.toBe(NORMAL_RANDOM_PROFILE);
    }
  });

  it('unknown profile ids still fall back to normal', () => {
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
```

If the existing `unknown profile ids fall back to normal` test is already present, replace it with the version above so the file has one copy.

- [x] **Step 3: Add profile type-name allow-list tests**

Append this table-driven test after the profile resolution tests:

```ts
  it('preset random profiles only expose their intended type names', () => {
    const expected: Readonly<Record<string, readonly string[]>> = {
      farmer: ['body', 'head', 'expression', 'hair', 'clothes', 'overalls', 'shoes'],
      mage: [
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
      knight: [
        'body',
        'head',
        'expression',
        'armour',
        'legs',
        'shoes',
        'hat',
        'weapon',
        'shield',
        'arms',
        'gloves',
      ],
      ranger: [
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
      noble: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes', 'hat'],
    };

    for (const [styleId, typeNames] of Object.entries(expected)) {
      expect(profileTypeNames(randomProfileForStyle(styleId))).toEqual(typeNames);
    }
  });
```

- [x] **Step 4: Add style exclusion tests**

Append these tests after the existing farmer exclusion test:

```ts
  it('mage profile excludes heavy armor while allowing staff and crystal slots', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'clothes/laced.json': makeItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes'),
      'cape/solid.json': makeItem('Solid', 'cape'),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat'),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'mage',
    });

    expect(sel.items['weapon']).toBeDefined();
    expect(sel.items['weapon_magic_crystal']).toBeDefined();
    expect(sel.items['armour']).toBeUndefined();
    expect(sel.items['chainmail']).toBeUndefined();
  });

  it('knight profile excludes farmer workwear and mage crystal parts', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'legs/armour.json': makeItem('Armour', 'legs'),
      'shoes/armour.json': makeItem('Armour', 'shoes'),
      'hat/armet.json': makeItem('Armet', 'hat'),
      'weapon/sword.json': makeItem('Longsword', 'weapon'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'arms/armour.json': makeItem('Armour', 'arms'),
      'gloves/gloves.json': makeItem('Gloves', 'gloves'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'apron/plain.json': makeItem('Plain Apron', 'apron'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'knight',
    });

    expect(sel.items['armour']).toBeDefined();
    expect(sel.items['weapon']).toBeDefined();
    expect(sel.items['shield']).toBeDefined();
    expect(sel.items['overalls']).toBeUndefined();
    expect(sel.items['apron']).toBeUndefined();
    expect(sel.items['weapon_magic_crystal']).toBeUndefined();
  });

  it('ranger profile excludes heavy plate and formal noble clothing', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'armour/leather.json': makeItem('Leather', 'armour'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/boots.json': makeItem('Basic Boots', 'shoes'),
      'hat/hood.json': makeItem('Hood', 'hat'),
      'weapon/bow.json': makeItem('Normal', 'weapon'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'clothes/formal.json': makeItem('Collared/Formal Longsleeve', 'clothes'),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'ranger',
    });

    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Leather' });
    expect(sel.items['weapon']).toBeDefined();
    expect(sel.items['quiver']).toBeDefined();
    expect(sel.items['chainmail']).toBeUndefined();
    expect(sel.items['clothes']).toBeUndefined();
  });

  it('noble profile excludes weapons, shields, armor, workwear, and fantasy parts', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'clothes/formal.json': makeItem('Collared/Formal Longsleeve', 'clothes'),
      'legs/formal.json': makeItem('Formal Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes'),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'wings/feather.json': makeItem('Wings', 'wings'),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'noble',
    });

    expect(sel.items['clothes']).toBeDefined();
    expect(sel.items['legs']).toBeDefined();
    expect(sel.items['shoes']).toBeDefined();
    expect(sel.items['hat']).toBeDefined();
    expect(sel.items['weapon']).toBeUndefined();
    expect(sel.items['shield']).toBeUndefined();
    expect(sel.items['armour']).toBeUndefined();
    expect(sel.items['overalls']).toBeUndefined();
    expect(sel.items['wings']).toBeUndefined();
  });
```

- [x] **Step 5: Run the focused random tests and verify failure**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: FAIL because `mage`, `knight`, `ranger`, and `noble` still resolve to `normal`.

- [x] **Step 6: Commit the failing tests**

```bash
rtk git add packages/web/test/random-outfit.test.ts docs/superpowers/plans/2026-07-03-preset-integrated-random.md
rtk git commit -m "test(web): cover preset random profiles"
```

Implementation note: Added pure preset random profile coverage for all current presets, fallback resolution, profile type-name allow-lists, and style exclusion behavior without implementing the missing profiles.
Commit: b9eb1d1a638b4b210cb886ac0df954cd7fac2ffa.
Verification: RED `rtk env CI=true pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` FAIL as expected (6 failed, 20 passed) because mage, knight, ranger, and noble still resolve through normal behavior. The exact requested command without `CI=true` did not reach Vitest because pnpm aborted a non-TTY modules purge.

## Task 2: Random Profile Implementation

**Files:**
- Modify: `packages/web/src/slice/random-profiles.ts`
- Modify: `docs/superpowers/plans/2026-07-03-preset-integrated-random.md`

- [x] **Step 1: Add preset random profiles**

In `packages/web/src/slice/random-profiles.ts`, add these exports after `FARMER_RANDOM_PROFILE`:

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
  itemPools: {
    clothes: ['Longsleeve laced'],
    legs: ['Pants'],
    shoes: ['Basic Shoes'],
    cape: ['Solid'],
    hat: ['Wizard Hat Base'],
    weapon: ['Gnarled staff'],
    weapon_magic_crystal: ['Crystal'],
  },
};

export const KNIGHT_RANDOM_PROFILE: RandomProfile = {
  id: 'knight',
  labelKey: 'preset.knight',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories', 'weapons'],
  excludeGroups: ['fantasy', 'fx'],
  optionalProb: 0.75,
  typeNames: [
    'body',
    'head',
    'expression',
    'armour',
    'legs',
    'shoes',
    'hat',
    'weapon',
    'shield',
    'arms',
    'gloves',
  ],
  itemPools: {
    armour: ['Plate'],
    legs: ['Armour'],
    shoes: ['Armour'],
    hat: ['Armet'],
    weapon: ['Longsword'],
    shield: ['Kite'],
    arms: ['Armour'],
    gloves: ['Gloves'],
  },
};

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
  itemPools: {
    armour: ['Leather'],
    legs: ['Pants'],
    shoes: ['Basic Boots'],
    hat: ['Hood'],
    weapon: ['Normal'],
    quiver: ['Quiver'],
  },
};

export const NOBLE_RANDOM_PROFILE: RandomProfile = {
  id: 'noble',
  labelKey: 'preset.noble',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories'],
  excludeGroups: ['fantasy', 'weapons', 'fx'],
  optionalProb: 0.6,
  typeNames: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes', 'hat'],
  itemPools: {
    clothes: ['Collared/Formal Longsleeve'],
    legs: ['Formal Pants'],
    shoes: ['Basic Shoes'],
    hat: ['Formal Tophat'],
  },
};
```

- [x] **Step 2: Register preset profiles**

Replace `RANDOM_PROFILES` with:

```ts
export const RANDOM_PROFILES: readonly RandomProfile[] = [
  NORMAL_RANDOM_PROFILE,
  FARMER_RANDOM_PROFILE,
  MAGE_RANDOM_PROFILE,
  KNIGHT_RANDOM_PROFILE,
  RANGER_RANDOM_PROFILE,
  NOBLE_RANDOM_PROFILE,
];
```

- [x] **Step 3: Run focused random tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit profile implementation**

```bash
rtk git add packages/web/src/slice/random-profiles.ts docs/superpowers/plans/2026-07-03-preset-integrated-random.md
rtk git commit -m "feat(web): add preset random profiles"
```

Implementation note: Added mage, knight, ranger, and noble random profiles; registered them with the random profile resolver; and made the narrow noble test fixture basename correction discovered during verification so `createCatalog` no longer overwrites its clothes entry.
Commit: e05edbb8af4ea61890d81d7d3f8eb8e6bef47836.
Verification: GREEN `rtk env CI=true pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` PASS (26 passed). The exact requested command `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts` did not reach Vitest because pnpm aborted a non-TTY modules purge.

## Task 3: Preset Menu UI and Wiring Tests

**Files:**
- Modify: `packages/web/test/stack-panel.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-03-preset-integrated-random.md`

- [ ] **Step 1: Expand test imports**

In `packages/web/test/stack-panel.test.tsx`, update imports:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
  type TypeName,
} from '@lpc-toolkit/core';
import { StackPanel } from '../src/components/layer-stack/stack-panel';
import {
  applyPresetMenuRow,
  PresetMenuRows,
  randomizePresetMenuRow,
} from '../src/components/layer-stack/popovers/preset-menu-popover';
import { PRESETS } from '../src/presets';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';
```

- [ ] **Step 2: Replace the old random scope render test**

Delete the existing test named `renders random scope controls without dispatching selection changes`.

Add these tests in its place:

```tsx
  it('removes the standalone random dice and global random scope controls', () => {
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

    expect(html).toContain('Presets');
    expect(html).toContain('Reset');
    expect(html).not.toContain('🎲');
    expect(html).not.toContain('Random options');
    expect(html).not.toContain('Appearance');
    expect(html).not.toContain('Clothing');
    expect(html).not.toContain('Equipment');
    expect(html).not.toContain('Colors');
    expect(dispatch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Add preset menu static markup test**

Append this test after the removal test:

```tsx
  it('renders Apply and Random actions for each preset row when the menu is open', () => {
    const html = renderToStaticMarkup(
      <PresetMenuRows
        disabled={false}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={() => {}}
        t={createTranslator('en')}
        onApplied={() => {}}
        setOpen={() => {}}
      />
    );

    for (const label of ['Farmer', 'Mage', 'Knight', 'Ranger', 'Noble']) {
      expect(html).toContain(label);
    }
    expect(html.match(/>Apply</g)?.length).toBe(PRESETS.length);
    expect(html.match(/>Random</g)?.length).toBe(PRESETS.length);
  });
```

- [ ] **Step 4: Add direct Apply wiring test**

Append this test:

```ts
  it('Apply menu action dispatches fixed preset selections and reports skipped items', () => {
    const dispatch = vi.fn();
    const onApplied = vi.fn();
    const setOpen = vi.fn();
    const farmer = PRESETS.find((preset) => preset.id === 'farmer');
    expect(farmer).toBeDefined();

    applyPresetMenuRow({
      preset: farmer!,
      catalog,
      palettes,
      state,
      dispatch,
      t: createTranslator('en'),
      onApplied,
      setOpen,
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'apply_selections',
      selections: expect.objectContaining({
        bodyType: 'male',
        items: expect.objectContaining({
          clothes: expect.objectContaining({ name: 'Shortsleeve' }),
        }),
      }),
    });
    expect(onApplied).toHaveBeenCalledWith('Farmer', expect.any(Number), expect.any(Array));
    expect(setOpen).toHaveBeenCalledWith(false);
  });
```

- [ ] **Step 5: Add direct Random wiring test**

Append this test:

```ts
  it('Random menu action dispatches random selections through the matching preset profile', () => {
    const dispatch = vi.fn();
    const setOpen = vi.fn();
    const knight = PRESETS.find((preset) => preset.id === 'knight');
    expect(knight).toBeDefined();

    randomizePresetMenuRow({
      preset: knight!,
      catalog,
      palettes,
      state,
      dispatch,
      setOpen,
      rng: () => 0,
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'apply_selections',
      selections: expect.objectContaining({
        bodyType: 'male',
        items: expect.objectContaining({
          weapon: expect.objectContaining({ typeName: 'weapon' }),
        }),
      }),
    });
    expect(setOpen).toHaveBeenCalledWith(false);
  });
```

- [ ] **Step 6: Run component tests and verify failure**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx
```

Expected: FAIL because `applyPresetMenuRow` and `randomizePresetMenuRow` do not exist yet, and the current toolbar still renders the dice/random scope UI.

- [ ] **Step 7: Commit the failing component tests**

```bash
rtk git add packages/web/test/stack-panel.test.tsx docs/superpowers/plans/2026-07-03-preset-integrated-random.md
rtk git commit -m "test(web): cover preset menu random actions"
```

Implementation note: Pending.
Commit: Pending.
Verification: Pending.

## Task 4: Preset Menu Apply/Random Wiring

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`
- Modify: `packages/web/src/i18n.ts`
- Modify: `docs/superpowers/plans/2026-07-03-preset-integrated-random.md`

- [ ] **Step 1: Add Random action translation**

In `packages/web/src/i18n.ts`, add this English key near the preset keys:

```ts
    'preset.random': 'Random',
```

Add this Traditional Chinese key near the zh-TW preset keys:

```ts
    'preset.random': '隨機',
```

- [ ] **Step 2: Update preset menu imports and props**

In `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`, add imports:

```ts
import { pickRandomOutfit } from '../../../slice/random-outfit';
import { randomProfileForStyle } from '../../../slice/random-profiles';
```

Remove `onStyleSelected` from `Props` and from the component parameter list.

- [ ] **Step 3: Add exported row action helpers**

Add these interfaces and functions above `PresetMenuPopover`:

```ts
interface PresetMenuActionArgs {
  readonly preset: Preset;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly state: SliceState;
  readonly dispatch: (a: SliceAction) => void;
  readonly setOpen: (v: boolean) => void;
}

interface ApplyPresetMenuRowArgs extends PresetMenuActionArgs {
  readonly t: Translator;
  readonly onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

interface RandomizePresetMenuRowArgs extends PresetMenuActionArgs {
  readonly rng?: () => number;
}

interface PresetMenuRowsProps {
  readonly disabled: boolean;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly state: SliceState;
  readonly dispatch: (a: SliceAction) => void;
  readonly t: Translator;
  readonly onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
  readonly setOpen: (v: boolean) => void;
}

export function applyPresetMenuRow({
  preset,
  catalog,
  palettes,
  state,
  dispatch,
  setOpen,
  t,
  onApplied,
}: ApplyPresetMenuRowArgs): void {
  const preview = computePresetSelection(
    preset,
    state.selections,
    state.bodyType,
    catalog,
    palettes,
  );
  const label = t(preset.labelKey);

  dispatch({
    type: 'apply_selections',
    selections: { bodyType: preview.bodyType, items: preview.selections },
  });
  onApplied(
    label,
    preview.skipped.length,
    preview.skipped.map((skipped) => skipped.typeName),
  );
  setOpen(false);
}

export function randomizePresetMenuRow({
  preset,
  catalog,
  palettes,
  state,
  dispatch,
  setOpen,
  rng,
}: RandomizePresetMenuRowArgs): void {
  dispatch({
    type: 'apply_selections',
    selections: pickRandomOutfit({
      catalog,
      palettes,
      bodyType: state.bodyType,
      profile: randomProfileForStyle(preset.id),
      rng,
    }),
  });
  setOpen(false);
}
```

- [ ] **Step 4: Render each preset row with Apply and Random buttons**

Add this exported row component below the helper functions:

```tsx
export function PresetMenuRows({
  disabled,
  catalog,
  palettes,
  state,
  dispatch,
  t,
  onApplied,
  setOpen,
}: PresetMenuRowsProps) {
  return (
    <>
      {PRESETS.map((preset: Preset) => {
        const preview = computePresetSelection(
          preset,
          state.selections,
          state.bodyType,
          catalog,
          palettes,
        );
        const willSkip = preview.skipped.length;
        const label = t(preset.labelKey);
        return (
          <div
            key={preset.id}
            role="none"
            className={cn(
              'grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded px-2 py-1.5 text-[12px]',
              willSkip && 'opacity-80',
              disabled && 'opacity-50',
            )}
          >
            <span
              title={willSkip ? `${label} — ${t('preset.skipPreview').replace('{n}', String(willSkip))}` : label}
              className="flex min-w-0 items-center gap-2"
            >
              <span>{preset.emoji}</span>
              <span className="truncate">{label}</span>
              {willSkip > 0 && <span className="text-danger">⚠</span>}
            </span>
            <button
              type="button"
              disabled={disabled}
              role="menuitem"
              onClick={() =>
                applyPresetMenuRow({
                  preset,
                  catalog,
                  palettes,
                  state,
                  dispatch,
                  setOpen,
                  t,
                  onApplied,
                })
              }
              className={cn(
                'rounded px-2 py-1 text-[11px] hover:bg-surface-2',
                disabled && 'cursor-not-allowed hover:bg-transparent',
              )}
            >
              {t('token.apply')}
            </button>
            <button
              type="button"
              disabled={disabled}
              role="menuitem"
              onClick={() =>
                randomizePresetMenuRow({
                  preset,
                  catalog,
                  palettes,
                  state,
                  dispatch,
                  setOpen,
                })
              }
              className={cn(
                'rounded px-2 py-1 text-[11px] hover:bg-surface-2',
                disabled && 'cursor-not-allowed hover:bg-transparent',
              )}
            >
              {t('preset.random')}
            </button>
          </div>
        );
      })}
    </>
  );
}
```

Then replace the existing `PRESETS.map(...)` block inside `PresetMenuPopover` with:

```tsx
      <PresetMenuRows
        disabled={disabled}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onApplied}
        setOpen={setOpen}
      />
```

Change the popover width class from `w-44` to `w-64` so the row actions fit:

```tsx
      className="w-64 rounded-md border border-border bg-surface p-1 shadow-lg"
```

- [ ] **Step 5: Run component tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx
```

Expected: still FAIL until `PresetBar` removes the old dice/scope props and stops passing `onStyleSelected`.

- [ ] **Step 6: Commit preset menu wiring**

```bash
rtk git add packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx packages/web/src/i18n.ts docs/superpowers/plans/2026-07-03-preset-integrated-random.md
rtk git commit -m "feat(web): add preset menu random actions"
```

Implementation note: Pending.
Commit: Pending.
Verification: Pending.

## Task 5: Remove Standalone Dice and Global Random Scope UI

**Files:**
- Modify: `packages/web/src/components/layer-stack/preset-bar.tsx`
- Modify: `packages/web/test/stack-panel.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-03-preset-integrated-random.md`

- [ ] **Step 1: Simplify `PresetBar` imports**

In `packages/web/src/components/layer-stack/preset-bar.tsx`, remove:

```ts
import { pickRandomOutfit } from '../../slice/random-outfit';
import {
  DEFAULT_RANDOM_SCOPE,
  randomProfileForStyle,
  type RandomScope,
} from '../../slice/random-profiles';
```

Keep:

```ts
import { useRef, useState } from 'react';
```

- [ ] **Step 2: Remove local random state**

Delete these state declarations:

```ts
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  const [randomScope, setRandomScope] = useState<RandomScope>(DEFAULT_RANDOM_SCOPE);
```

- [ ] **Step 3: Remove standalone dice button**

Delete the first toolbar `<button>` whose title is `t('randomize.title')` and whose contents are `🎲`.

- [ ] **Step 4: Remove global random options row**

Delete the entire `<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-dim">...</div>` that renders `t('randomScope.title')` and the four checkboxes.

- [ ] **Step 5: Stop passing `onStyleSelected`**

In the `PresetMenuPopover` usage, delete:

```tsx
        onStyleSelected={setActiveStyleId}
```

- [ ] **Step 6: Update the Random wiring test catalog if needed**

If the `Random menu action dispatches random selections through the matching preset profile` test does not pick a knight weapon because profile item pools are stricter than the test catalog, change the test catalog item names at the top of `packages/web/test/stack-panel.test.tsx` to include the pooled names:

```ts
  'weapons/longsword.json': defn('Longsword', 'weapon'),
  'shield/kite.json': defn('Kite', 'shield'),
  'torso/armour/plate.json': defn('Plate', 'armour'),
  'legs/armour/armour.json': defn('Armour', 'legs'),
  'feet/armour/armour.json': defn('Armour', 'shoes'),
  'headwear/armet.json': defn('Armet', 'hat'),
  'arms/armour.json': defn('Armour', 'arms'),
  'arms/gloves/gloves.json': defn('Gloves', 'gloves'),
```

Keep existing unrelated catalog entries unless the duplicate type/name makes assertions ambiguous.

- [ ] **Step 7: Run component tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit UI removal**

```bash
rtk git add packages/web/src/components/layer-stack/preset-bar.tsx packages/web/test/stack-panel.test.tsx docs/superpowers/plans/2026-07-03-preset-integrated-random.md
rtk git commit -m "feat(web): move random into preset menu"
```

Implementation note: Pending.
Commit: Pending.
Verification: Pending.

## Task 6: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-03-preset-integrated-random.md`

- [ ] **Step 1: Run focused random profile tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run preset menu/component tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run web typecheck**

Run:

```bash
rtk pnpm --dir packages/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Inspect git status**

Run:

```bash
rtk git status --short
```

Expected: only intentional files are modified, or clean after the verification commit.

- [ ] **Step 5: Commit final plan verification update**

```bash
rtk git add docs/superpowers/plans/2026-07-03-preset-integrated-random.md
rtk git commit -m "docs: record preset random verification"
```

Implementation note: Pending.
Commit: Pending.
Verification: Pending.

## Self-Review

- Spec coverage: The plan covers pure random profile tests, preset menu UI/component tests, random profile implementation, Apply/Random row wiring, removal of standalone dice/global random scope UI, and the three requested verification commands.
- Dependency/license check: The plan uses only existing React server rendering and Vitest; no dependency additions are planned.
- `upstream/` check: The plan explicitly avoids `upstream/`.
- UI exposure check: `normal` remains as fallback in `random-profiles.ts` and is not exposed in `PresetBar` or `PresetMenuPopover`.
- TypeScript check: All new helper signatures use existing project types and avoid `any`.
