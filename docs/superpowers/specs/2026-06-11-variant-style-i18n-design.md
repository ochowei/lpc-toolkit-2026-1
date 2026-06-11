# Spec: Variant Style Labels and Tools Translation

## Status

- Date: 2026-06-11
- Status: Approved

## Problem

The layer editor currently sends both palette recolors and asset variants
through the same color-oriented UI:

- Recolors such as `brown` are correctly presented as colors.
- Variants such as `axe`, `hammer`, and `pickaxe` are incorrectly placed under
  the label "Color".
- Variant values are translated through `LabelTranslator.color()`, even when
  they describe an object, material, pattern, or style rather than a color.
- The four upstream Tools item names use translations that do not consistently
  describe the assets. In particular, `Rod` is currently translated as
  `法棒`, although the sprite depicts a fishing rod.

This behavior originates in `ColorPicker`: `getColorOptions()` already
distinguishes `recolors` from `variants`, but both modes use the caller's
`picker.color` label and `tl.color()` translator.

## Goals

- Keep real recolor options under the localized "Color" / "顏色" label.
- Present asset variants under a localized "Style" / "款式" label.
- Translate variants through a dedicated `LabelTranslator.variant()` method.
- Correct the Traditional Chinese names of the four Tools items.
- Translate every variant used by those Tools items.
- Use the same variant translation in the selected layer summary.
- Keep catalog values and selection tokens unchanged.

## Non-Goals

- Renaming upstream item names, item IDs, variant keys, or animation names.
- Introducing a Tools-specific picker or a new catalog type.
- Translating every unknown future variant automatically.
- Modifying `upstream/`, `packages/core/`, asset definitions, or attribution
  data.
- Adding dependencies.

## Considered Approaches

### 1. Distinguish recolors and variants by their existing data mode

Use `ColorOptions.mode` to select both the heading and translator:

- `recolors` uses "Color" and `tl.color()`.
- `variants` uses "Style" and `tl.variant()`.

This is the approved approach. It follows the existing data model and fixes
the semantic problem for all variant-backed assets without hard-coding Tools.

### 2. Special-case the Tools items

Detect the four Tools item names and label their options as "Tool type".
This is narrowly scoped but leaves every other non-color variant under the
incorrect "Color" heading.

### 3. Rename the heading to "Style" for all options

This is the smallest UI change, but real palette swatches would no longer be
described accurately.

## Design

### Translation API

Extend `LabelTranslator` with:

```ts
variant(value: string): string;
```

English will humanize the raw variant key. Traditional Chinese will look up a
dedicated variant dictionary and fall back to the same English humanization.
`color()` remains responsible only for palette and recolor keys.

The initial Tools variant translations are:

| Variant | Traditional Chinese |
| --- | --- |
| `axe` | 斧頭 |
| `hammer` | 鐵鎚 |
| `pickaxe` | 十字鎬 |
| `hoe` | 鋤頭 |
| `shovel` | 鏟子 |
| `watering` | 澆水壺 |
| `rod` | 釣竿 |
| `whip` | 鞭子 |

Correct the Tools item-name translations:

| Item | Traditional Chinese |
| --- | --- |
| `Rod` | 釣竿 |
| `Smash` | 敲擊工具 |
| `Thrust` | 推刺工具 |
| `Whip` | 鞭子 |

### Picker Labels

Add `picker.style`:

| Locale | Value |
| --- | --- |
| English | `Style` |
| Traditional Chinese | `款式` |

`ColorPicker` will receive both localized labels, or receive the translator
needed to obtain them. After `getColorOptions()` resolves the mode:

- `recolors`: render the `picker.color` label and translate option accessibility
  text with `tl.color()`.
- `variants`: render the `picker.style` label and translate chip text with
  `tl.variant()`.

The component must continue to render nothing when the mode is `none`.

### Layer Summary

The selected layer metadata currently displays `selection.variant` through
`tl.color()`. Change this path to `tl.variant()` so the summary and picker use
the same terminology.

### Data Flow

1. Catalog item selection remains unchanged.
2. `getColorOptions()` classifies options as recolors, variants, or none.
3. `ColorPicker` chooses the heading and translation method from that mode.
4. Selecting an option continues to dispatch the original raw variant or
   recolor value.
5. Composition, URL tokens, exports, and attribution continue to receive the
   unchanged catalog key.

## Error Handling

An unknown variant must not block selection or rendering. `tl.variant()` falls
back to a humanized English label, matching the current behavior for unknown
color keys. No runtime error or placeholder text is introduced.

## Testing

Add focused web tests that verify:

- English and Traditional Chinese include `picker.style`.
- `tl.variant()` translates every Tools variant listed above.
- Unknown variants use the humanized English fallback.
- Existing `tl.color()` behavior remains unchanged.
- Variant mode renders "Style" / "款式" and translated variant chips.
- Recolor mode still renders "Color" / "顏色" and color translations.
- The layer summary uses the variant translator.
- Corrected Tools item names are returned by `tl.itemName()`.

Run:

```sh
pnpm --filter @lpc-toolkit/web test
pnpm --filter @lpc-toolkit/web typecheck
```

## Success Criteria

- Selecting `Smash` shows the heading `款式` with `斧頭`, `鐵鎚`, and
  `十字鎬`.
- `Rod`, `Smash`, `Thrust`, and `Whip` display the approved Traditional
  Chinese names.
- Tools variants no longer pass through the color dictionary.
- Real recolor swatches continue to display under `顏色`.
- Raw catalog values, composition behavior, exports, and attribution are
  unchanged.
