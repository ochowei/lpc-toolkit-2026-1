# CATEGORY_GROUPS coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 55-type_name gap in v2 `CATEGORY_GROUPS`, add `fx` + `fantasy` super-groups, remove 4 dead keys, and give `pickRandomOutfit` an `excludeGroups` parameter (default `['fx']`).

**Architecture:** Surgical edits to 4 web-package files (`category-groups.ts`, `random-outfit.ts`, `i18n.ts`, plus their two existing test files in `packages/web/test/`). No core/upstream/v1 changes. New regression test reads `upstream/sheet_definitions/**/*.json` at test time (same pattern as `integration.test.ts`).

**Tech Stack:** TypeScript 5 (strict), pnpm workspaces, Vitest (Node env), no React render tests.

**Spec:** `docs/superpowers/specs/2026-05-25-category-groups-coverage-design.md`

---

## Pre-flight (subagent dispatch instructions)

**EVERY subagent prompt MUST start with:**

```
WORKING DIRECTORY CHECK:
1. Run `pwd` — MUST output a path containing `category-groups-coverage`
2. Run `git rev-parse --abbrev-ref HEAD` — MUST output a name starting with
   `worktree-category-groups-coverage` (the EnterWorktree branch)
3. If either check fails, STOP and report. Do NOT proceed.
```

This is non-negotiable. The previous PRs were polluted because subagents
committed to the wrong worktree. Re-check before every commit too.

---

## Task 1: Add i18n keys for `group.fx` and `group.fantasy`

**Files:**
- Modify: `packages/web/src/i18n.ts` (en block + zh-TW block)

i18n keys must exist before `CATEGORY_GROUPS` references them, otherwise
the runtime label lookup returns `undefined` during the interim state
between commits.

- [ ] **Step 1: Add `group.fx` and `group.fantasy` to the `en` block**

In `packages/web/src/i18n.ts`, find the line:

```ts
    'group.weapons': 'Weapons',
```

(around line 100) and add two keys immediately after it, inside the same
`en:` object:

```ts
    'group.weapons': 'Weapons',
    'group.fx': 'FX & Wounds',
    'group.fantasy': 'Fantasy & Race',
```

- [ ] **Step 2: Add the same keys to the `zh-TW` block**

Find the line:

```ts
    'group.weapons': '武器',
```

(around line 198) and add:

```ts
    'group.weapons': '武器',
    'group.fx': '特效與傷痕',
    'group.fantasy': '奇幻與種族',
```

- [ ] **Step 3: Type-check the web package**

```bash
pnpm --filter @lpc-toolkit/web exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Run the i18n tests to confirm no regressions**

```bash
pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "$(cat <<'EOF'
feat(web): add group.fx and group.fantasy i18n keys

Preparing for two new CATEGORY_GROUPS super-groups; keys land first
so the labels resolve correctly when category-groups.ts references
them in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `CATEGORY_GROUPS` to 7 super-groups, remove dead keys

**Files:**
- Modify: `packages/web/src/slice/category-groups.ts` (full rewrite of `CATEGORY_GROUPS` constant + `GroupId` type)
- Modify: `packages/web/test/category-groups.test.ts` (update two existing assertions + add coverage assertions in Task 3, not here)

This is the heart of the change. TDD order: update the failing assertions
in the existing test, see them fail, then change the source. The new
coverage test is in Task 3.

- [ ] **Step 1: Update the existing `category-groups.test.ts` assertions to expect the new shape**

Replace the two affected `it` blocks. Find:

```ts
  it('has the five canonical super-groups', () => {
    const ids = CATEGORY_GROUPS.map((g) => g.id);
    expect(ids).toEqual(['body', 'face', 'clothing', 'accessories', 'weapons']);
  });
```

Replace with:

```ts
  it('has the seven canonical super-groups in display order', () => {
    const ids = CATEGORY_GROUPS.map((g) => g.id);
    expect(ids).toEqual([
      'body', 'face', 'clothing', 'accessories', 'weapons', 'fx', 'fantasy',
    ]);
  });
```

Then find:

```ts
  it('returns clothing for torso/legs/feet/etc.', () => {
    expect(groupForType('torso')).toBe('clothing');
    expect(groupForType('legs')).toBe('clothing');
    expect(groupForType('feet')).toBe('clothing');
    expect(groupForType('clothes')).toBe('clothing');
  });
```

Replace with:

```ts
  it('returns clothing for legs / clothes / jacket / shoes_toe / etc.', () => {
    expect(groupForType('legs')).toBe('clothing');
    expect(groupForType('clothes')).toBe('clothing');
    expect(groupForType('jacket')).toBe('clothing');
    expect(groupForType('shoes_toe')).toBe('clothing');
    expect(groupForType('hat_trim')).toBe('clothing');
  });

  it('returns fx for wound / shadow / prosthesis / wheelchair', () => {
    expect(groupForType('wound_arm')).toBe('fx');
    expect(groupForType('shadow')).toBe('fx');
    expect(groupForType('wrinkles')).toBe('fx');
    expect(groupForType('prosthesis_hand')).toBe('fx');
    expect(groupForType('wheelchair')).toBe('fx');
  });

  it('returns fantasy for wings / horns / tail / fins / furry_ears', () => {
    expect(groupForType('wings')).toBe('fantasy');
    expect(groupForType('horns')).toBe('fantasy');
    expect(groupForType('tail')).toBe('fantasy');
    expect(groupForType('fins')).toBe('fantasy');
    expect(groupForType('furry_ears')).toBe('fantasy');
  });

  it('returns null for the four removed dead keys', () => {
    expect(groupForType('facial' as never)).toBeNull();
    expect(groupForType('torso' as never)).toBeNull();
    expect(groupForType('hands' as never)).toBeNull();
    expect(groupForType('feet' as never)).toBeNull();
  });
```

- [ ] **Step 2: Run the test file to confirm the failing assertions**

```bash
pnpm --filter @lpc-toolkit/web exec vitest run test/category-groups.test.ts
```

Expected: at least the five updated/new assertions fail. The exact failure messages will mention `'fx'` and `'fantasy'` not being in the group id list, `groupForType('jacket')` returning `null`, etc.

- [ ] **Step 3: Replace `CATEGORY_GROUPS` and `GroupId` in `category-groups.ts`**

Open `packages/web/src/slice/category-groups.ts` and replace lines 4 onwards (everything after the `import` block) with:

```ts
export type GroupId =
  | 'body'
  | 'face'
  | 'clothing'
  | 'accessories'
  | 'weapons'
  | 'fx'
  | 'fantasy';

export interface CategoryGroup {
  readonly id: GroupId;
  readonly labelKey: TranslationKey;
  readonly typeNames: readonly TypeName[];
}

// TODO(2026-05-25): removed dead keys `facial` / `torso` / `hands` /
// `feet` (no matching catalog `type_name`). Coverage test in
// category-groups.test.ts will fail if either direction breaks.
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  {
    id: 'body',
    labelKey: 'group.body' as TranslationKey,
    typeNames: ['body', 'head', 'eyes', 'eyebrows', 'nose', 'ears', 'ears_inner'],
  },
  {
    id: 'face',
    labelKey: 'group.face' as TranslationKey,
    typeNames: [
      'hair', 'hair_tie', 'beard', 'expression', 'expression_crying',
      'bandana', 'bandana_overlay', 'earrings', 'earring_left', 'earring_right',
      'ponytail', 'updo', 'mustache',
      'hairextl', 'hairextr', 'hairtie', 'hairtie_rune',
      'facial_eyes', 'facial_left', 'facial_left_trim',
      'facial_mask', 'facial_right', 'facial_right_trim',
      'visor',
    ],
  },
  {
    id: 'clothing',
    labelKey: 'group.clothing' as TranslationKey,
    typeNames: [
      'shoulders', 'arms', 'wrists', 'legs', 'clothes',
      'dress', 'dress_sleeves', 'dress_sleeves_trim', 'dress_trim',
      'shoes', 'overalls', 'apron', 'armour', 'chainmail',
      'bracers', 'bauldron', 'hat', 'hat_secondary',
      'hat_accessory_secondary', 'neck',
      'jacket', 'jacket_collar', 'jacket_pockets', 'jacket_trim',
      'sleeves', 'socks', 'vest',
      'hat_accessory', 'hat_buckle', 'hat_overlay', 'hat_trim',
      'headcover', 'headcover_rune',
      'shoes_toe',
    ],
  },
  {
    id: 'accessories',
    labelKey: 'group.accessories' as TranslationKey,
    typeNames: [
      'cape', 'cape_trim', 'belt', 'backpack', 'backpack_straps', 'quiver',
      'charm', 'accessory', 'buckles', 'leather_armor_belt', 'bandages', 'cargo',
      'gloves', 'necklace', 'ring', 'sash', 'sash_tie',
    ],
  },
  {
    id: 'weapons',
    labelKey: 'group.weapons' as TranslationKey,
    typeNames: [
      'weapon', 'weapon_magic_crystal', 'shield', 'ammo',
      'shield_paint', 'shield_pattern', 'shield_trim',
    ],
  },
  {
    id: 'fx',
    labelKey: 'group.fx' as TranslationKey,
    typeNames: [
      'wound_arm', 'wound_brain', 'wound_eye_left', 'wound_eye_right',
      'wound_mouth', 'wound_ribs',
      'shadow', 'wrinkles',
      'prosthesis_hand', 'prosthesis_leg', 'wheelchair',
    ],
  },
  {
    id: 'fantasy',
    labelKey: 'group.fantasy' as TranslationKey,
    typeNames: [
      'horns', 'wings', 'wings_dots', 'wings_edge',
      'fins', 'furry_ears', 'furry_ears_skin', 'tail',
    ],
  },
];

const TYPE_TO_GROUP: ReadonlyMap<TypeName, GroupId> = new Map(
  CATEGORY_GROUPS.flatMap((g) => g.typeNames.map((tn) => [tn, g.id] as const)),
);

export function groupForType(typeName: TypeName): GroupId | null {
  return TYPE_TO_GROUP.get(typeName) ?? null;
}
```

(Keep the existing `import` block at the top unchanged.)

- [ ] **Step 4: Type-check the web package**

```bash
pnpm --filter @lpc-toolkit/web exec tsc --noEmit
```

Expected: zero errors. If you see errors about `TypeName` not accepting one of the new strings, that means `@lpc-toolkit/core`'s `TypeName` is narrowly typed — STOP and report (the spec assumes it accepts arbitrary strings).

- [ ] **Step 5: Run the category-groups test file**

```bash
pnpm --filter @lpc-toolkit/web exec vitest run test/category-groups.test.ts
```

Expected: all pass.

- [ ] **Step 6: Run the full web test suite to check no other test depended on the dead keys**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all pass. If anything else fails, STOP and report — likely something else also assumed `groupForType('torso') === 'clothing'`.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/slice/category-groups.ts packages/web/test/category-groups.test.ts
git commit -m "$(cat <<'EOF'
feat(web): extend CATEGORY_GROUPS to 7 super-groups, drop 4 dead keys

Adds fx (wounds/shadow/wrinkles/prosthesis/wheelchair) and fantasy
(wings/horns/fins/furry_ears/tail) groups. Slots the remaining 47
missing type_names into existing body/face/clothing/accessories/
weapons groups. Removes the four dead keys facial/torso/hands/feet
that never matched any catalog type_name.

Refs #29.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Coverage regression test (catalog ⊆ CATEGORY_GROUPS, both directions)

**Files:**
- Modify: `packages/web/test/category-groups.test.ts` (add a new `describe` block at the end)

This test reads `upstream/sheet_definitions/**/*.json` (Node env, same
pattern as `test/integration.test.ts`) and asserts mutual subset.

- [ ] **Step 1: Append the coverage test block**

Add to the end of `packages/web/test/category-groups.test.ts`, after the
existing `describe('groupForType', ...)`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'upstream/sheet_definitions');

function readCatalogTypeNames(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.endsWith('.json')) {
        const data = JSON.parse(readFileSync(full, 'utf8')) as { type_name?: string };
        if (typeof data.type_name === 'string') out.add(data.type_name);
      }
    }
  };
  walk(sheetDefsDir);
  return out;
}

describe('CATEGORY_GROUPS coverage vs upstream catalog', () => {
  const catalogTypeNames = readCatalogTypeNames();
  const groupedTypeNames = new Set<string>(
    CATEGORY_GROUPS.flatMap((g) => g.typeNames),
  );

  it('every catalog type_name belongs to exactly one group', () => {
    const missing = [...catalogTypeNames].filter((tn) => !groupedTypeNames.has(tn)).sort();
    expect(
      missing,
      `${missing.length} catalog type_name(s) not in any CATEGORY_GROUP: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every group typeName exists in the catalog (no dead keys)', () => {
    const dead = [...groupedTypeNames].filter((tn) => !catalogTypeNames.has(tn)).sort();
    expect(
      dead,
      `${dead.length} CATEGORY_GROUPS entries with no matching catalog type_name: ${dead.join(', ')}`,
    ).toEqual([]);
  });
});
```

Note the `import` lines at the top — they go at the very top of the file
(merge with the existing import block, don't duplicate). Move them up if
the file's import order convention requires it. Existing file's first
line is `import { describe, expect, it } from 'vitest';` — put the
node-builtin imports right below.

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @lpc-toolkit/web exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run the category-groups test file**

```bash
pnpm --filter @lpc-toolkit/web exec vitest run test/category-groups.test.ts
```

Expected: all pass (both coverage assertions report empty arrays). If
either fails, the source-of-truth count in `CATEGORY_GROUPS` is wrong —
STOP and report which type_names are missing or dead.

- [ ] **Step 4: Commit**

```bash
git add packages/web/test/category-groups.test.ts
git commit -m "$(cat <<'EOF'
test(web): assert CATEGORY_GROUPS covers every catalog type_name

Reads upstream/sheet_definitions/**/*.json at test time (Node env)
and asserts CATEGORY_GROUPS == catalog type_names in both directions.
Future upstream additions now surface as a failing test rather than
silently disappearing from v2 AddLayer / Randomize.

Refs #29.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `pickRandomOutfit` gains `excludeGroups` parameter (default `['fx']`)

**Files:**
- Modify: `packages/web/src/slice/random-outfit.ts`
- Modify: `packages/web/test/random-outfit.test.ts`

TDD order: failing tests first, then implementation.

- [ ] **Step 1: Append three new tests to `random-outfit.test.ts`**

At the end of `packages/web/test/random-outfit.test.ts`, before the final closing `});` of `describe('pickRandomOutfit', ...)`, insert:

```ts
  describe('excludeGroups', () => {
    const fxItem = makeItem('Bleeding', 'wound_arm');
    const shadowItem = makeItem('Shadow', 'shadow');
    const wingsItem = makeItem('Wings', 'wings');
    const { catalog: cWithFx } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'head/round.json': makeItem('Round', 'head'),
      'eyes/blue.json': makeItem('Blue', 'eyes'),
      'wound_arm/bleed.json': fxItem,
      'shadow/dark.json': shadowItem,
      'wings/feather.json': wingsItem,
    });

    it('default excludeGroups (["fx"]) never includes wound/shadow items', () => {
      for (let i = 0; i < 200; i++) {
        const sel = pickRandomOutfit({
          catalog: cWithFx,
          bodyType: 'male',
          rng: () => Math.random(),
          optionalProb: 1.0,
        });
        expect(sel.items['wound_arm']).toBeUndefined();
        expect(sel.items['shadow']).toBeUndefined();
      }
    });

    it('default excludeGroups still allows fantasy group items', () => {
      const sel = pickRandomOutfit({
        catalog: cWithFx,
        bodyType: 'male',
        rng: () => 0.5,
        optionalProb: 1.0,
      });
      expect(sel.items['wings']).toBeDefined();
    });

    it('excludeGroups: [] re-enables fx items', () => {
      const sel = pickRandomOutfit({
        catalog: cWithFx,
        bodyType: 'male',
        rng: () => 0.5,
        optionalProb: 1.0,
        excludeGroups: [],
      });
      expect(sel.items['wound_arm']).toBeDefined();
      expect(sel.items['shadow']).toBeDefined();
    });

    it('custom excludeGroups overrides the default', () => {
      // Exclude weapons (none in this catalog anyway) — fx should still be excluded? No: default is replaced.
      // With excludeGroups: ['weapons'], fx becomes pickable.
      const sel = pickRandomOutfit({
        catalog: cWithFx,
        bodyType: 'male',
        rng: () => 0.5,
        optionalProb: 1.0,
        excludeGroups: ['weapons'],
      });
      expect(sel.items['wound_arm']).toBeDefined();
      expect(sel.items['wings']).toBeDefined();
    });
  });
```

- [ ] **Step 2: Run the test file to confirm failure**

```bash
pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: tests fail because (a) `excludeGroups` is not a recognised arg
(TS won't fail since it's silently ignored, but the runtime assertion
will: with the current code, fx items get picked when `optionalProb: 1`
since there's no exclusion).

If you get a TS error from `excludeGroups: []` because the type doesn't
allow it yet, that's fine — move on to Step 3, the type will be added.

- [ ] **Step 3: Update `random-outfit.ts`**

Replace `packages/web/src/slice/random-outfit.ts` with:

```ts
import type {
  BodyType,
  Catalog,
  Selection,
  Selections,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './catalog-tree';
import { CATEGORY_GROUPS, type GroupId } from './category-groups';

export interface PickRandomOutfitArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly rng?: () => number;          // defaults to Math.random
  readonly optionalProb?: number;       // defaults to 0.5
  readonly excludeGroups?: readonly GroupId[]; // defaults to ['fx']
}

// The `body` super-group's typeNames are treated as required (always
// included if a compatible item exists). All other typeNames are
// optional (included with probability `optionalProb`).
const REQUIRED_GROUP_ID: GroupId = 'body';
const DEFAULT_EXCLUDE: readonly GroupId[] = ['fx'];

/**
 * Generate a Feeling Lucky outfit. Required categories (body-part group)
 * always get an item; optional categories are included with probability
 * `optionalProb`. Groups in `excludeGroups` are skipped entirely
 * (defaults to `['fx']` so wounds/shadow/prosthesis never appear
 * unless the caller opts in). Compatible items only.
 */
export function pickRandomOutfit(args: PickRandomOutfitArgs): Selections {
  const rng = args.rng ?? Math.random;
  const optionalProb = args.optionalProb ?? 0.5;
  const excluded = new Set<GroupId>(args.excludeGroups ?? DEFAULT_EXCLUDE);

  const requiredGroup = CATEGORY_GROUPS.find((g) => g.id === REQUIRED_GROUP_ID);
  const requiredTypes = new Set<TypeName>(requiredGroup?.typeNames ?? []);
  const allGroupedTypes = new Set<TypeName>(
    CATEGORY_GROUPS
      .filter((g) => !excluded.has(g.id))
      .flatMap((g) => g.typeNames),
  );

  const items: Record<TypeName, Selection> = {};
  for (const typeName of allGroupedTypes) {
    const isRequired = requiredTypes.has(typeName);
    if (!isRequired && rng() > optionalProb) continue;

    const defs = args.catalog.byTypeName.get(typeName) ?? [];
    const compatible = defs.filter((d) => itemSupportsBodyType(d, args.bodyType));
    if (compatible.length === 0) continue;

    const pick = compatible[Math.floor(rng() * compatible.length)]!;
    items[typeName] = { typeName, name: pick.name };
  }

  return { bodyType: args.bodyType, items };
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @lpc-toolkit/web exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Run the random-outfit test file**

```bash
pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
```

Expected: all pass.

- [ ] **Step 6: Run the full web test suite (final check)**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/slice/random-outfit.ts packages/web/test/random-outfit.test.ts
git commit -m "$(cat <<'EOF'
feat(web): pickRandomOutfit gains excludeGroups (default ['fx'])

The new fx super-group holds wounds/shadow/wrinkles/prosthesis/
wheelchair — content the user opts into, never random. Adding a
GroupId-typed excludeGroups parameter with default ['fx'] keeps
Randomize behaviour intuitive while leaving the door open for
future opt-out groups. fantasy group is NOT excluded by default
so wings/horns can still appear (50% optional).

Refs #29.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Manual v2 smoke (CONTROLLER ONLY — not a subagent task)

Subagents cannot run a browser. After Task 4 commits, the controller
(top-level Claude session) runs the dev server and verifies in the
browser:

- [ ] **Step 1: Controller starts dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```

- [ ] **Step 2: Verify v2 UI shows the new groups**

Visit `http://localhost:5173/?ui=v2`. In AddLayer:
- Confirm "FX & Wounds" section appears
- Confirm "Fantasy & Race" section appears
- Confirm previously-missing items appear in their assigned groups
  (e.g. `Jacket` under Clothing, `Wings` under Fantasy)

- [ ] **Step 3: Verify Randomize behaviour**

Click 🎲 Randomize 5–10 times. Confirm:
- Wounds / shadow / prosthesis NEVER appear
- Wings / horns / tail SOMETIMES appear (50% optional)

- [ ] **Step 4: Verify zh-TW labels**

Switch language. Confirm "特效與傷痕" and "奇幻與種族" appear instead of the en strings.

- [ ] **Step 5: Stop dev server**

(After verification, kill the dev server. No commit here — smoke test only.)

---

## Self-review checklist

**Spec coverage:**
- §1 (two new groups): Task 2 + Task 1 (i18n) ✓
- §2 (complete mapping): Task 2 ✓
- §3 (dead keys removed): Task 2 ✓
- §4 (`excludeGroups`): Task 4 ✓
- §5 (`GroupId` extension): Task 2 ✓
- §6 (tests): Task 2 + Task 3 + Task 4 ✓
- §7 (AddLayer/AdvancedPalette auto-pickup): Task 5 manual smoke ✓

**Placeholder scan:** clear — every code block contains the exact code to write.

**Type consistency:**
- `GroupId` defined once in `category-groups.ts` (Task 2), imported in
  `random-outfit.ts` (Task 4). ✓
- `excludeGroups: readonly GroupId[]` matches across `PickRandomOutfitArgs`
  in Task 4 source and test usage. ✓
- i18n key names (`group.fx`, `group.fantasy`) consistent across Task 1
  (i18n.ts) and Task 2 (labelKey cast). ✓
