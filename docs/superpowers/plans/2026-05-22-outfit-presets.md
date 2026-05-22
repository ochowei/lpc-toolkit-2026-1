# Outfit Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a row of themed "outfit preset" buttons to the web UI that apply a curated set of clothing/equipment in one click while preserving the user's personal appearance.

**Architecture:** Preset data lives in a structured TypeScript file (`packages/web/src/presets.ts`). A pure function (`packages/web/src/presets-apply.ts`) computes the new selections — clearing all clothing categories, keeping personal-appearance categories, adding preset items that are compatible with the current body type. The web component dispatches the existing `apply_selections` reducer action with the result. No `packages/core` changes, no new dependencies.

**Tech Stack:** TypeScript (strict), React 18, Vite, Tailwind, Vitest. pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-22-outfit-presets-design.md`

**Branch:** `feat/outfit-presets` (already checked out).

---

## File Structure

- **Create** `packages/web/src/presets.ts` — `PresetItem` / `Preset` types, `CLOTHING_TYPES` constant, `PRESETS` data (6 themes).
- **Create** `packages/web/src/presets-apply.ts` — `computePresetSelection()` pure function + `PresetApplyResult` type.
- **Create** `packages/web/test/presets.test.ts` — validates `PRESETS` against the real upstream catalog.
- **Create** `packages/web/test/presets-apply.test.ts` — unit tests for `computePresetSelection()`.
- **Modify** `packages/web/src/i18n.ts` — add `preset.*` translation keys (en + zh-TW).
- **Modify** `packages/web/test/i18n.test.ts` — assert preset keys exist in both locales.
- **Modify** `packages/web/src/components/slice-harness.tsx` — add the preset button row + apply handler.

Commands (run from repo root):
- Single test file: `pnpm --filter @lpc-toolkit/web exec vitest run test/<file>`
- Full web suite: `pnpm --filter @lpc-toolkit/web test`
- Typecheck: `pnpm --filter @lpc-toolkit/web typecheck`

---

## Task 1: i18n keys for presets

Translation keys must exist first because `Preset.labelKey` (Task 2) is typed as `TranslationKey`, which is derived from `TRANSLATIONS.en`.

**Files:**
- Modify: `packages/web/test/i18n.test.ts`
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Write the failing test**

In `packages/web/test/i18n.test.ts`, add this `it` block inside the existing `describe('i18n', ...)` block (after the `'keeps English and Chinese translation keys in sync'` test):

```ts
  it('includes outfit preset keys in both locales', () => {
    const presetKeys = [
      'preset.title',
      'preset.farmer',
      'preset.mage',
      'preset.knight',
      'preset.ranger',
      'preset.noble',
      'preset.rogue',
      'preset.applied',
      'preset.skipped',
    ];
    for (const key of presetKeys) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(key);
      expect(Object.keys(TRANSLATIONS['zh-TW'])).toContain(key);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts`
Expected: FAIL — `includes outfit preset keys in both locales` fails because `Object.keys(TRANSLATIONS.en)` does not contain `preset.title`.

- [ ] **Step 3: Add the English keys**

In `packages/web/src/i18n.ts`, inside the `en:` object, add these entries immediately after the `'reset.cancel': 'Cancel',` line:

```ts
    'preset.title': 'Presets',
    'preset.farmer': 'Farmer',
    'preset.mage': 'Mage',
    'preset.knight': 'Knight',
    'preset.ranger': 'Ranger',
    'preset.noble': 'Noble',
    'preset.rogue': 'Rogue',
    'preset.applied': 'Applied',
    'preset.skipped': 'skipped',
```

- [ ] **Step 4: Add the Chinese keys**

In `packages/web/src/i18n.ts`, inside the `'zh-TW':` object, add these entries immediately after the `'reset.cancel': '取消',` line:

```ts
    'preset.title': '預設套裝',
    'preset.farmer': '農民',
    'preset.mage': '魔法師',
    'preset.knight': '騎士',
    'preset.ranger': '遊俠',
    'preset.noble': '貴族',
    'preset.rogue': '盜賊',
    'preset.applied': '已套用',
    'preset.skipped': '已略過',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts`
Expected: PASS — all i18n tests pass, including the new one and the existing `keeps English and Chinese translation keys in sync` test (en/zh stay in sync).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add i18n keys for outfit presets

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Preset data model and catalog validation

`presets.ts` holds the types, the `CLOTHING_TYPES` constant, and the 6 preset definitions. The test validates every preset item against the real upstream catalog so an upstream rename/recolor turns the suite red.

All item names, type names, and variants below were verified against `upstream/sheet_definitions/` JSON files.

**Files:**
- Create: `packages/web/src/presets.ts`
- Test: `packages/web/test/presets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/presets.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createCatalog,
  type Catalog,
  type FilePath,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { CLOTHING_TYPES, PRESETS } from '../src/presets';
import { TRANSLATIONS } from '../src/i18n';

const here = path.dirname(fileURLToPath(import.meta.url));
const sheetDefsDir = path.resolve(here, '../../../upstream/sheet_definitions');
const haveUpstream = existsSync(sheetDefsDir);

function walkJson(dir: string, base = dir): Record<FilePath, ItemDefinition> {
  const out: Record<FilePath, ItemDefinition> = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, walkJson(full, base));
    else if (e.name.endsWith('.json')) {
      const key = path.relative(base, full).split(path.sep).join('/');
      out[key] = JSON.parse(readFileSync(full, 'utf8')) as ItemDefinition;
    }
  }
  return out;
}

describe('PRESETS data', () => {
  it('has 6 presets with unique ids', () => {
    expect(PRESETS).toHaveLength(6);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(6);
  });

  it('every preset item type is a clearable clothing category', () => {
    for (const preset of PRESETS) {
      for (const item of preset.items) {
        expect(
          CLOTHING_TYPES.has(item.typeName),
          `${preset.id}: "${item.typeName}" not in CLOTHING_TYPES`,
        ).toBe(true);
      }
    }
  });

  it('every preset labelKey exists in the translations', () => {
    for (const preset of PRESETS) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(preset.labelKey);
    }
  });
});

describe.runIf(haveUpstream)('PRESETS catalog validation', () => {
  let catalog: Catalog;

  beforeAll(() => {
    catalog = createCatalog(walkJson(sheetDefsDir)).catalog;
  });

  function findDef(typeName: string, name: string) {
    return (catalog.byTypeName.get(typeName) ?? []).find(
      (d) => d.name === name,
    );
  }

  it('every preset item resolves in the catalog', () => {
    for (const preset of PRESETS) {
      for (const item of preset.items) {
        expect(
          findDef(item.typeName, item.name),
          `${preset.id}: ${item.typeName}/"${item.name}" not found in catalog`,
        ).toBeDefined();
      }
    }
  });

  it('preset variants are consistent with the catalog item variants', () => {
    for (const preset of PRESETS) {
      for (const item of preset.items) {
        const def = findDef(item.typeName, item.name)!;
        const variants = def.variants ?? [];
        if (variants.length > 0) {
          expect(
            item.variant,
            `${preset.id}/"${item.name}" must specify a variant`,
          ).toBeDefined();
          expect(
            variants,
            `${preset.id}/"${item.name}" variant "${item.variant}"`,
          ).toContain(item.variant);
        } else {
          expect(
            item.variant,
            `${preset.id}/"${item.name}" must not specify a variant`,
          ).toBeUndefined();
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts`
Expected: FAIL — the file cannot resolve the import `'../src/presets'` (module does not exist yet).

- [ ] **Step 3: Create the preset data file**

Create `packages/web/src/presets.ts`:

```ts
import type { TypeName } from '@lpc-toolkit/core';
import type { TranslationKey } from './i18n';

/** One item slot in a preset: a catalog item plus an optional variant. */
export interface PresetItem {
  readonly typeName: TypeName;
  /** Must equal the catalog ItemDefinition.name. */
  readonly name: string;
  /** Color/variant; required when the catalog item declares variants. */
  readonly variant?: string;
}

/** A themed outfit the user can apply with one click. */
export interface Preset {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly emoji: string;
  readonly items: readonly PresetItem[];
}

/**
 * Clothing / equipment categories cleared before a preset is applied.
 * Personal-appearance categories (body, head, hair, expression, eyes,
 * beard, ...) are NOT in this set and are never touched by a preset.
 * Covers the common-picker clothing slots (torso/legs/feet) plus every
 * type_name used by a preset. Items the user added via advanced search in
 * a category outside this set are not auto-cleared (a documented edge).
 */
export const CLOTHING_TYPES: ReadonlySet<TypeName> = new Set<TypeName>([
  'torso',
  'legs',
  'feet',
  'clothes',
  'overalls',
  'apron',
  'armour',
  'chainmail',
  'shoes',
  'cape',
  'hat',
  'weapon',
  'weapon_magic_crystal',
  'shield',
  'quiver',
]);

/**
 * Six themed outfit presets. Item names / type names / variants are
 * verified against the upstream catalog by presets.test.ts. Some items
 * only ship art for a subset of body types (e.g. armour: male/female/teen
 * only); incompatible items are skipped at apply time.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'farmer',
    labelKey: 'preset.farmer',
    emoji: '🌾',
    items: [
      { typeName: 'clothes', name: 'Shortsleeve' },
      { typeName: 'overalls', name: 'Overalls', variant: 'brown' },
      { typeName: 'shoes', name: 'Sandals', variant: 'brown' },
      { typeName: 'hat', name: 'Leather Cap', variant: 'brown' },
    ],
  },
  {
    id: 'mage',
    labelKey: 'preset.mage',
    emoji: '🔮',
    items: [
      { typeName: 'clothes', name: 'Longsleeve' },
      { typeName: 'hat', name: 'Wizard Hat Base', variant: 'purple' },
      { typeName: 'weapon_magic_crystal', name: 'Crystal', variant: 'purple' },
    ],
  },
  {
    id: 'knight',
    labelKey: 'preset.knight',
    emoji: '⚔️',
    items: [
      { typeName: 'armour', name: 'Plate' },
      { typeName: 'hat', name: 'Kettle helm' },
      { typeName: 'weapon', name: 'Longsword', variant: 'longsword' },
      { typeName: 'shield', name: 'Round Shield', variant: 'silver' },
    ],
  },
  {
    id: 'ranger',
    labelKey: 'preset.ranger',
    emoji: '🏹',
    items: [
      { typeName: 'armour', name: 'Leather' },
      { typeName: 'cape', name: 'Solid', variant: 'forest' },
      { typeName: 'hat', name: 'Hood' },
      { typeName: 'weapon', name: 'Normal', variant: 'dark' },
      { typeName: 'quiver', name: 'Quiver', variant: 'quiver' },
    ],
  },
  {
    id: 'noble',
    labelKey: 'preset.noble',
    emoji: '👑',
    items: [
      {
        typeName: 'clothes',
        name: 'Collared/Formal Longsleeve',
        variant: 'white',
      },
      { typeName: 'legs', name: 'Formal Pants' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'black' },
      { typeName: 'hat', name: 'Formal Tophat', variant: 'black' },
    ],
  },
  {
    id: 'rogue',
    labelKey: 'preset.rogue',
    emoji: '🗡️',
    items: [
      { typeName: 'chainmail', name: 'Chainmail' },
      { typeName: 'legs', name: 'Pants' },
      { typeName: 'hat', name: 'Hood' },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts`
Expected: PASS — all `PRESETS data` tests pass; `PRESETS catalog validation` tests pass (or are skipped if the upstream submodule is not initialized).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS — no type errors. (Confirms every `labelKey` is a real `TranslationKey`.)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/presets.ts packages/web/test/presets.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add outfit preset data and catalog validation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `computePresetSelection` apply logic

The pure function that produces the post-apply selections: clear all `CLOTHING_TYPES` entries, keep personal-appearance categories, add each preset item that resolves in the catalog and supports the current body type. Incompatible/missing items go to `skipped`.

**Files:**
- Create: `packages/web/src/presets-apply.ts`
- Test: `packages/web/test/presets-apply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/presets-apply.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition, type Selection } from '@lpc-toolkit/core';
import { computePresetSelection } from '../src/presets-apply';
import type { Preset } from '../src/presets';

function defn(
  name: string,
  type_name: string,
  bodyType = 'male',
): ItemDefinition {
  return {
    name,
    type_name,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, [bodyType]: `${type_name}/${name}/` },
  } as unknown as ItemDefinition;
}

const { catalog } = createCatalog({
  'tunic.json': defn('Tunic', 'clothes', 'male'),
  'helm.json': defn('Helm', 'hat', 'male'),
  'gown.json': defn('Gown', 'clothes', 'female'),
});

const malePreset: Preset = {
  id: 'm',
  labelKey: 'preset.farmer',
  emoji: '🌾',
  items: [
    { typeName: 'clothes', name: 'Tunic' },
    { typeName: 'hat', name: 'Helm' },
  ],
};

const femaleOnlyPreset: Preset = {
  id: 'f',
  labelKey: 'preset.mage',
  emoji: '🔮',
  items: [
    { typeName: 'clothes', name: 'Gown' }, // female-only art
    { typeName: 'hat', name: 'Helm' },
  ],
};

describe('computePresetSelection', () => {
  it('clears clothing categories but keeps personal appearance', () => {
    const current: Record<string, Selection> = {
      body: { typeName: 'body', name: 'Body' },
      hair: { typeName: 'hair', name: 'Hair' },
      torso: { typeName: 'torso', name: 'Old Shirt' },
      weapon: { typeName: 'weapon', name: 'Old Sword' },
    };
    const { selections } = computePresetSelection(
      malePreset,
      current,
      'male',
      catalog,
    );
    expect(selections.body).toEqual(current.body);
    expect(selections.hair).toEqual(current.hair);
    expect('torso' in selections).toBe(false);
    expect('weapon' in selections).toBe(false);
  });

  it('adds compatible preset items', () => {
    const { selections, skipped } = computePresetSelection(
      malePreset,
      {},
      'male',
      catalog,
    );
    expect(skipped).toHaveLength(0);
    expect(selections.clothes).toEqual({ typeName: 'clothes', name: 'Tunic' });
    expect(selections.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });

  it('skips items not available for the current body type', () => {
    const { selections, skipped } = computePresetSelection(
      femaleOnlyPreset,
      {},
      'male',
      catalog,
    );
    expect(skipped.map((i) => i.name)).toEqual(['Gown']);
    expect('clothes' in selections).toBe(false);
    expect(selections.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });

  it('skips items missing from the catalog', () => {
    const badPreset: Preset = {
      id: 'b',
      labelKey: 'preset.rogue',
      emoji: '🗡️',
      items: [{ typeName: 'clothes', name: 'Nonexistent' }],
    };
    const { skipped } = computePresetSelection(badPreset, {}, 'male', catalog);
    expect(skipped.map((i) => i.name)).toEqual(['Nonexistent']);
  });

  it('carries the preset variant into the selection', () => {
    const variantPreset: Preset = {
      id: 'v',
      labelKey: 'preset.knight',
      emoji: '⚔️',
      items: [{ typeName: 'clothes', name: 'Tunic', variant: 'red' }],
    };
    const { selections } = computePresetSelection(
      variantPreset,
      {},
      'male',
      catalog,
    );
    expect(selections.clothes).toEqual({
      typeName: 'clothes',
      name: 'Tunic',
      variant: 'red',
    });
  });

  it('leaves no residue when switching from one preset to another', () => {
    const afterA = computePresetSelection(malePreset, {}, 'male', catalog)
      .selections;
    const afterB = computePresetSelection(
      femaleOnlyPreset,
      afterA,
      'male',
      catalog,
    ).selections;
    // malePreset's Tunic was cleared; femaleOnlyPreset's Gown was skipped.
    expect('clothes' in afterB).toBe(false);
    expect(afterB.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/presets-apply.test.ts`
Expected: FAIL — the file cannot resolve the import `'../src/presets-apply'` (module does not exist yet).

- [ ] **Step 3: Create the apply-logic file**

Create `packages/web/src/presets-apply.ts`:

```ts
import type { BodyType, Catalog, Selection, TypeName } from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './slice/catalog-tree';
import { CLOTHING_TYPES, type Preset, type PresetItem } from './presets';

export interface PresetApplyResult {
  /** Full new selections: personal categories kept, clothing replaced. */
  readonly selections: Record<TypeName, Selection>;
  /** Preset items dropped — catalog miss or unsupported body type. */
  readonly skipped: readonly PresetItem[];
}

/**
 * Compute the selections after applying `preset`:
 * - every CLOTHING_TYPES entry is removed from `current` (clean slate);
 * - personal-appearance categories are kept untouched;
 * - each preset item that resolves in the catalog AND supports `bodyType`
 *   is added; the rest are returned in `skipped`.
 */
export function computePresetSelection(
  preset: Preset,
  current: Readonly<Record<TypeName, Selection>>,
  bodyType: BodyType,
  catalog: Catalog,
): PresetApplyResult {
  const selections: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(current)) {
    if (!CLOTHING_TYPES.has(typeName)) selections[typeName] = selection;
  }

  const skipped: PresetItem[] = [];
  for (const item of preset.items) {
    const def = (catalog.byTypeName.get(item.typeName) ?? []).find(
      (d) => d.name === item.name,
    );
    if (!def || !itemSupportsBodyType(def, bodyType)) {
      skipped.push(item);
      continue;
    }
    selections[item.typeName] = {
      typeName: item.typeName,
      name: item.name,
      ...(item.variant ? { variant: item.variant } : {}),
    };
  }

  return { selections, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/presets-apply.test.ts`
Expected: PASS — all 6 `computePresetSelection` tests pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS — no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/presets-apply.ts packages/web/test/presets-apply.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add computePresetSelection apply logic

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Preset buttons in the slice harness

Wire the preset row into the UI: an apply handler that dispatches the existing `apply_selections` action with the current body type (so body type is preserved), and a button row placed above the Common pickers. There is no React component test harness in this project, so this task is verified by typecheck, the full test suite, and a manual run.

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Add imports**

In `packages/web/src/components/slice-harness.tsx`, immediately after the existing import block that ends with the `catalog-tree` import (the block ending `} from '../slice/catalog-tree';`), add:

```ts
import { PRESETS, type Preset } from '../presets';
import { computePresetSelection } from '../presets-apply';
```

- [ ] **Step 2: Add the status state**

In the `SliceHarness` function body, immediately after the line:

```ts
  const [tokenError, setTokenError] = useState<string | null>(null);
```

add:

```ts
  const [presetStatus, setPresetStatus] = useState<string | null>(null);
```

- [ ] **Step 3: Add the apply handler**

In the same function, immediately after the closing brace of the `applyToken` function (the `}` that ends `function applyToken(): void { ... }`, just before `function pickTreeItem`), add:

```ts
  function applyPreset(preset: Preset): void {
    const { selections, skipped } = computePresetSelection(
      preset,
      state.selections,
      state.bodyType,
      catalog,
    );
    dispatch({
      type: 'apply_selections',
      selections: { bodyType: state.bodyType, items: selections },
    });
    const label = t(preset.labelKey);
    if (skipped.length === 0) {
      setPresetStatus(`${t('preset.applied')} ${label}`);
    } else {
      const names = skipped.map((it) => tl.itemName(it.name)).join(', ');
      setPresetStatus(
        `${t('preset.applied')} ${label} (${t('preset.skipped')}: ${names})`,
      );
    }
  }
```

- [ ] **Step 4: Add the preset button row**

In the JSX, find the Common pickers section — the `<section>` opening immediately after the `{/* Left: pickers */}`-area `ResetMenu`/filters, identified by:

```tsx
          <section className="space-y-3 border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase">
              {t('picker.common')}
            </h2>
```

Insert this new `<section>` immediately **before** that `<section className="space-y-3 border-b border-border pb-3">` line:

```tsx
          <section className="space-y-2 border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase">
              {t('preset.title')}
            </h2>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="ghost"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.emoji} {t(preset.labelKey)}
                </Button>
              ))}
            </div>
            {presetStatus && (
              <div className="text-xs text-text-mute">{presetStatus}</div>
            )}
          </section>

```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS — no type errors.

- [ ] **Step 6: Run the full web test suite**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS — all tests pass, including `presets.test.ts`, `presets-apply.test.ts`, and `i18n.test.ts`.

- [ ] **Step 7: Manual verification**

Run: `pnpm --filter @lpc-toolkit/web dev` and open the printed local URL.

Verify:
- A "Presets" section with 6 emoji-labelled buttons appears above the "Common" pickers.
- Clicking **Farmer / Knight / Mage** etc. updates the preview to that themed outfit.
- After clicking a preset, the body color / head / hair / expression are unchanged.
- Switching from **Knight** to **Farmer** removes the knight's sword/shield (no leftover clothing).
- With body type set to `muscular` (or `child`), clicking **Knight** still applies the helmet/weapon, shows an "Applied Knight (skipped: …)" line for the armour, and does not crash.
- Toggle the language to 中文; the section title and buttons show Chinese labels.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx
git commit -m "$(cat <<'EOF'
feat(web): add outfit preset buttons to slice harness

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done criteria

- `pnpm --filter @lpc-toolkit/web test` — all green.
- `pnpm --filter @lpc-toolkit/web typecheck` — no errors.
- Manual run: 6 preset buttons apply themed outfits; personal appearance preserved; body-type-incompatible items skipped with a status note; Chinese labels work.
