# CATEGORY_GROUPS coverage — close the 54 missing type_names

**Issue**: [#29](https://github.com/ochowei/lpc-toolkit-2026-1/issues/29)
**Date**: 2026-05-25
**Scope**: v2 web UI only (`?ui=v2`). v1 does not consume `CATEGORY_GROUPS`.

## Problem

`packages/web/src/slice/category-groups.ts` defines 5 super-groups
(`body` / `face` / `clothing` / `accessories` / `weapons`). They cover
**53 of the 108** catalog `type_name` values. The remaining **55** (54
listed in the issue plus `visor` which the issue missed) fall through to
"unclassified", which means:

1. **v2 Randomize 🎲 (`pickRandomOutfit`)** never picks them — they are
   absent from the random pool built via `CATEGORY_GROUPS.flatMap`.
2. **v2 AddLayer grouped UI** and **AdvancedPalette group sections**
   silently drop them — they are reachable only via `⌘K` search.
3. **4 dead keys** (`facial` / `torso` / `hands` / `feet`) exist inside
   the group declarations but match no catalog `type_name`.

This spec fixes coverage to 100% by adding two new super-groups and
slotting every remaining `type_name` into an existing group.

## Goals

- Every catalog `type_name` belongs to exactly one `CategoryGroup`.
- Randomize keeps current default behaviour for body / face / clothing /
  accessories / weapons / fantasy, and **excludes the new `fx` group by
  default** (so wound / shadow / prosthesis / wheelchair never appear in
  a random outfit unless explicitly requested).
- Dead keys are removed.
- A regression test asserts coverage so future catalog additions
  surface as a test failure rather than a silent UX hole.

## Non-goals

- **No v1 UI changes.** Only v2 consumes `CATEGORY_GROUPS`.
- **No catalog or upstream changes.** `upstream/` is read-only.
- **No new dependencies.**
- **No React rendering tests.** Project convention is pure-logic tests
  only.
- **No refactor of `random-outfit.ts`** beyond the new `excludeGroups`
  parameter. Required-vs-optional behaviour (body group required, others
  optional with `optionalProb`) stays as-is.

## Design

### 1. Two new super-groups

| Group | Rationale | TypeNames |
|---|---|---|
| `fx` | Post-effect / replacement layers that should not appear unless the user opts in. Same semantic class as "decals you add on top of a finished character". | `wound_arm`, `wound_brain`, `wound_eye_left`, `wound_eye_right`, `wound_mouth`, `wound_ribs`, `shadow`, `wrinkles`, `prosthesis_hand`, `prosthesis_leg`, `wheelchair` |
| `fantasy` | Race / species features (wings, horns, tail, fins, furry ears). Distinct enough from `body` that they deserve their own section in AddLayer. Randomize still picks them (consistent with current "50% optional" behaviour). | `horns`, `wings`, `wings_dots`, `wings_edge`, `fins`, `furry_ears`, `furry_ears_skin`, `tail` |

i18n keys added (en + zh-TW):

| Key | en | zh-TW |
|---|---|---|
| `group.fx` | `FX & Wounds` | `特效與傷痕` |
| `group.fantasy` | `Fantasy & Race` | `奇幻與種族` |

### 2. Complete type_name → group mapping

All 108 catalog `type_name` values, grouped. **Bold** = newly assigned
in this spec; plain = unchanged.

**`body`** (7, unchanged): `body`, `head`, `eyes`, `eyebrows`, `nose`,
`ears`, `ears_inner`

**`face`** (24): `hair`, `hair_tie`, `beard`, `expression`,
`expression_crying`, `bandana`, `bandana_overlay`, `earrings`,
`earring_left`, `earring_right`, **`ponytail`**, **`updo`**,
**`mustache`**, **`hairextl`**, **`hairextr`**, **`hairtie`**,
**`hairtie_rune`**, **`facial_eyes`**, **`facial_left`**,
**`facial_left_trim`**, **`facial_mask`**, **`facial_right`**,
**`facial_right_trim`**, **`visor`**

Removed dead key: `facial`.

**`clothing`** (34): `shoulders`, `arms`, `wrists`, `legs`, `clothes`,
`dress`, `dress_sleeves`, `dress_sleeves_trim`, `dress_trim`, `shoes`,
`overalls`, `apron`, `armour`, `chainmail`, `bracers`, `bauldron`,
`hat`, `hat_secondary`, `hat_accessory_secondary`, `neck`,
**`jacket`**, **`jacket_collar`**, **`jacket_pockets`**,
**`jacket_trim`**, **`sleeves`**, **`socks`**, **`vest`**,
**`hat_accessory`**, **`hat_buckle`**, **`hat_overlay`**,
**`hat_trim`**, **`headcover`**, **`headcover_rune`**, **`shoes_toe`**

Removed dead keys: `torso`, `hands`, `feet`.

**`accessories`** (17): `cape`, `cape_trim`, `belt`, `backpack`,
`backpack_straps`, `quiver`, `charm`, `accessory`, `buckles`,
`leather_armor_belt`, `bandages`, `cargo`, **`gloves`**, **`necklace`**,
**`ring`**, **`sash`**, **`sash_tie`**

**`weapons`** (7): `weapon`, `weapon_magic_crystal`, `shield`, `ammo`,
**`shield_paint`**, **`shield_pattern`**, **`shield_trim`**

**`fx`** (11, NEW — see table above)

**`fantasy`** (8, NEW — see table above)

**Total**: 7 + 24 + 34 + 17 + 7 + 11 + 8 = **108** ✓ matches catalog.

### 3. Dead key handling

The 4 dead keys are removed from the group `typeNames` arrays. A brief
TODO comment is added above the affected groups explaining what was
removed and why, so a future contributor extending the catalog does not
re-introduce these names by accident:

```ts
// TODO(2026-05-25): removed dead keys `facial` / `torso` / `hands` /
// `feet`. These had no matching catalog `type_name` (catalog uses
// `facial_*`, `clothes`, accessories etc. instead). Do not re-add
// without a matching catalog entry — coverage test will fail.
```

### 4. `pickRandomOutfit` — new `excludeGroups` parameter

`PickRandomOutfitArgs` gains an optional `excludeGroups`:

```ts
export interface PickRandomOutfitArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly rng?: () => number;
  readonly optionalProb?: number;
  readonly excludeGroups?: readonly GroupId[];   // NEW
}
```

**Default**: `excludeGroups = ['fx']` (when the caller omits the
parameter). This keeps the FX/wounds/prosthesis layers out of random
outfits unless the caller opts in. Existing UI call site is the
Randomize button in v2; it will rely on the default.

Implementation: when building `allGroupedTypes`, filter out groups
whose `id` is in the exclude set.

```ts
const excluded = new Set(args.excludeGroups ?? ['fx']);
const allGroupedTypes = new Set<TypeName>(
  CATEGORY_GROUPS
    .filter((g) => !excluded.has(g.id))
    .flatMap((g) => g.typeNames),
);
```

The `requiredGroup` lookup is unchanged — `body` is never in the
default exclude set, so required behaviour is preserved.

### 5. `GroupId` type extension

```ts
// Before
export type GroupId = 'body' | 'face' | 'clothing' | 'accessories' | 'weapons';
// After
export type GroupId = 'body' | 'face' | 'clothing' | 'accessories' | 'weapons' | 'fx' | 'fantasy';
```

### 6. Tests

Pure-logic tests only. No React render tests (project convention).

**`packages/web/src/slice/category-groups.test.ts`** (new or extended)
adds two assertions:

1. **Full coverage check** — load every catalog `type_name`, assert
   `CATEGORY_GROUPS.flatMap((g) => g.typeNames)` covers all of them
   with zero unclassified. (`allowedUnclassified = new Set()`).
2. **No dead keys** — every `typeName` in `CATEGORY_GROUPS` exists in
   the catalog. (Inverse direction of (1).)

To avoid loading the full catalog at test time, the test reads
`type_name` values directly from `upstream/sheet_definitions/**/*.json`
using `fs`-driven test setup (test runs in Node). Helper signature:

```ts
function readCatalogTypeNames(): Set<string> {
  // glob upstream/sheet_definitions/**/*.json, parse, collect type_name
}
```

**`packages/web/src/slice/random-outfit.test.ts`** extends the existing
test file with:

1. **Default excludes fx** — given a catalog that includes fx items
   (e.g. `shadow`), repeated calls to `pickRandomOutfit` never produce
   an outfit containing an fx `type_name`. Deterministic RNG; run e.g.
   200 trials.
2. **Explicit `excludeGroups: []`** — fx items can appear (probabilistic
   sanity check with `optionalProb: 1`).
3. **Custom excludeGroups overrides default** — passing
   `excludeGroups: ['weapons']` still allows fx items in the pool.

### 7. AddLayer / AdvancedPalette consumers

Both consumers iterate `CATEGORY_GROUPS` and translate `labelKey` via
the existing i18n machinery. No code change needed in
`add-layer.tsx` or AdvancedPalette — the new groups appear automatically
once `CATEGORY_GROUPS` is extended and the i18n keys are present.

## File-touch summary

| File | Change |
|---|---|
| `packages/web/src/slice/category-groups.ts` | Extend `GroupId`, add `fx` + `fantasy` groups, expand existing group `typeNames`, remove dead keys |
| `packages/web/src/slice/random-outfit.ts` | Add `excludeGroups` param, default `['fx']` |
| `packages/web/src/slice/category-groups.test.ts` | New file. Coverage + no-dead-keys assertions |
| `packages/web/src/slice/random-outfit.test.ts` | Extend with excludeGroups tests |
| `packages/web/src/i18n.ts` | Add `group.fx` / `group.fantasy` (en + zh-TW) |

**No changes** to `packages/core/`, `upstream/`, v1 UI files, or any
other web file.

## Risks

- **Test reads `upstream/sheet_definitions/**/*.json` at runtime.**
  Mitigation: the file is already a submodule checked out at test
  time (baseline test setup verifies this). If the submodule is
  missing, the existing test setup already fails earlier.
- **`gloves` placement (accessories vs clothing) is a judgment call.**
  Following the issue's explicit mapping — `accessories`.
- **`fantasy` group makes wings/horns/tail randomly appear in
  Randomize.** Acceptable per issue Q1 — fx is the only "definitely
  don't" bucket; fantasy is "playful, OK to roll".

## Open questions

None. All five issue-listed decisions plus the `visor` edge case were
resolved during brainstorming.
