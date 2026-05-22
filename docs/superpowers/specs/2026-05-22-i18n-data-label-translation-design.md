# Data-Label Translation Design

## Problem

When the user switches the web UI to Traditional Chinese, fixed UI strings
translate correctly, but options sourced from catalog data stay English:

- Common-section headers — `Body`, `Head`, `Hair`, `Expression`, `Eyes`,
  `Torso`, `Legs`, `Feet`.
- Advanced-section tree folder headers and per-item type badges.
- Every asset name shown in the common dropdowns and the advanced tree.
- The body-type dropdown values (`male`, `female`, ...).
- The animation-name dropdown values (`walk`, `idle`, ...).

These strings come from `upstream/` sheet definitions (`type_name`, the
`sourcePath` directory segments, the `name` field) rather than from the
`i18n.ts` translation table, so they never follow the locale switch.

This design extends the original `2026-05-19-web-i18n-design.md` decision,
which deliberately left catalog-derived identifiers untranslated. It now
translates category labels, asset names, body-type values, and animation
values. License names and credit file names remain English — they are
technical identifiers, not user-facing options.

## Goal

In Traditional Chinese, every picker option — category labels, asset names,
body-type values, animation values — displays in Chinese. English display
stays pixel-identical to today.

## Principles

- **Translation is a display layer only.** Selection state, token encoding,
  and all catalog keys stay English. Save/restore and token compatibility
  are unaffected.
- **English is untouched.** Translation maps hold `zh-TW` entries only. Any
  lookup with no entry falls back to the raw English value, so the English
  UI renders exactly as before and a missing Chinese entry degrades to
  English instead of breaking.

## Scope

In scope:

- Category / type labels: common-section headers, advanced-tree folder
  headers, advanced-item type badges, and the incompatible-item `title`.
- Asset names: every `name` shown in common dropdowns and the advanced tree.
- Body-type dropdown values.
- Animation-name dropdown values.
- Advanced-search matching, so Chinese queries find Chinese-labelled items.

Out of scope:

- License codes (`CC-BY-SA 3.0`, ...) — license identifiers, stay English.
- The runtime status text (`ready` / `error`) — technical state, not an
  option.
- List ordering: `buildCatalogTree` sorts by English `name`. In Chinese the
  list shows Chinese labels but keeps English sort order. Fixing this would
  push locale into `catalog-tree.ts`; tracked as a known limitation, not
  done here.

## Architecture

Approach: keep the existing UI-string translator `t` unchanged and add a
parallel **label translator** `tl` for data-derived strings.

### Files

| File | Change | Content |
|------|--------|---------|
| `packages/web/src/i18n.ts` | edit | Keep `TRANSLATIONS` / `createTranslator` as-is. Add three `zh-TW` label maps (category, body type, animation), `createLabelTranslator()`, and the `LabelTranslator` type. |
| `packages/web/src/i18n-item-names.ts` | new | Generated file: `ITEM_NAME_LABELS_ZH: Record<string, string>` — every asset name → Traditional Chinese. ~1000–1500 entries (exact count confirmed at implementation time). |
| `packages/web/src/App.tsx` | edit | Create `tl = createLabelTranslator(locale)` and pass it into `SliceHarness`. |
| `packages/web/src/components/slice-harness.tsx` | edit | Accept the `tl` prop; route 8 display sites through it; make advanced search translation-aware. |

`i18n.ts` grows from ~126 to ~230 lines (finite maps inlined). The large
generated asset-name dictionary stays isolated in `i18n-item-names.ts` so it
does not bloat `i18n.ts` review or break its strict `TranslationKey` typing.

### Label translator API

```ts
export interface LabelTranslator {
  category(typeOrSegment: string): string; // body → 身體, weapon → 武器
  bodyType(value: string): string;         // male → 男性, female → 女性
  anim(value: string): string;             // walk → 行走, slash → 揮砍
  itemName(name: string): string;          // "Plate armor" → 板甲
}

export function createLabelTranslator(locale: Locale): LabelTranslator;
```

Every method shares one lookup rule: `map[locale]?.[key] ?? rawValue`.

- For `locale === 'en'` there is no map, so the raw value is returned and
  English display is unchanged.
- For `zh-TW`, a missing key (e.g. an asset added upstream after the
  dictionary was generated) falls back to English — the UI never breaks.

Asset names are keyed by the English `name` string. This de-duplicates the
dictionary and covers both display sites. Two assets in different categories
could in principle share a `name`; for LPC data this is effectively absent,
and a shared translation is acceptable if it ever occurs.

## Display-Site Changes

All eight changes in `slice-harness.tsx` are display-only; no logic changes.

| # | Location | Now | After |
|---|----------|-----|-------|
| 1 | `:351` body-type dropdown option | `{bt}` | `{tl.bodyType(bt)}` |
| 2 | `:377` common-section header | `{tn}` | `{tl.category(tn)}` |
| 3 | `:401` common dropdown asset option | `{it.name}` | `{tl.itemName(it.name)}` |
| 4 | `:441` animation dropdown option | `{a}` | `{tl.anim(a)}` |
| 5 | `:202` advanced-tree folder header | `{node.name}` | `{tl.category(node.name)}` |
| 6 | `:234` advanced-tree item button name | `{item.name}` | `{tl.itemName(item.name)}` |
| 7 | `:237` advanced-tree item type badge | `{item.typeName}` | `{tl.category(item.typeName)}` |
| 8 | `:255` advanced-tree item button (root branch) | `{item.name}` | `{tl.itemName(item.name)}` |

Also: the incompatible-item `title` at `:223` switches to
`tl.category(item.typeName)` for consistency.

Line numbers are current-state references; the implementer matches by code,
not line number.

### Translation-aware search

`treeItemMatches` (`:171`) currently matches the query against the English
`name` and `typeName` only. After translation it must also match the
displayed Chinese text, otherwise a Chinese user sees Chinese labels but
must type English to find anything:

```ts
return (
  item.name.toLowerCase().includes(q) ||
  item.typeName.toLowerCase().includes(q) ||
  tl.itemName(item.name).toLowerCase().includes(q) ||
  tl.category(item.typeName).toLowerCase().includes(q)
);
```

Both English and Chinese queries match. `tl` is in scope inside
`SliceHarness`, so the nested `treeItemMatches` / `nodeHasMatches` helpers
use it directly. `.toLowerCase()` on CJK text is a harmless no-op.

## Dictionary Generation

Generating `i18n-item-names.ts` (and the finite label maps) needs the
asset list, which requires the upstream submodule:

1. Run `git submodule update --init` to populate `upstream/`. This only
   reads upstream content — the app already requires it to run — and does
   not modify the submodule, so it respects the read-only rule.
2. A one-off script enumerates the distinct `name` values across
   `sheet_definitions/**/*.json`, plus the distinct `type_name` values and
   `sourcePath` directory segments (for the category map), the
   `ANIMATION_CONFIGS` keys, and `BODY_TYPES`.
3. Translate each collected string into Traditional Chinese. Per the agreed
   scope this is machine-translation-grade quality; individual entries can
   be corrected later.
4. Commit `i18n-item-names.ts` and the finite maps in `i18n.ts`.

Translation quality is expected to be machine-grade; the English fallback
keeps any future upstream additions functional until their entries land.

## Testing

Add focused unit tests for the label translator:

- `createLabelTranslator('en')` returns the raw value for every method.
- `createLabelTranslator('zh-TW')` resolves a representative category, body
  type, animation, and asset name to its Chinese label.
- An unknown key falls back to the raw value under `zh-TW`.

Run the web package test suite and typecheck after implementation.

## Success Criteria

- Switching to Traditional Chinese shows Chinese text for every common and
  advanced category label, asset name, body-type value, and animation value.
- The English UI is unchanged.
- Advanced search matches both English and Chinese queries.
- Selection token round-trips are unaffected.
- Web tests and typecheck pass.
