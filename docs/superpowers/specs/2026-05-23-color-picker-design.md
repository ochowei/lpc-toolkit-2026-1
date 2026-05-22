# Color Picker Design

Date: 2026-05-23

## Goal

The web UI lets users pick assets but not their colors. A selected hair,
body, or earring renders in one fixed color with no way to change it. This
adds upstream-style color selection so every colorable asset can be
recolored from the web UI.

## Background

Upstream LPC sources express asset color through two distinct mechanisms,
and a sheet definition uses exactly one of them (verified: zero upstream
definitions carry both):

- **`variants`** — pre-rendered color folders. The chosen variant becomes
  part of the spritesheet path. About 331 definitions (earrings, masks,
  metal accessories, etc.). The variant value is a folder name like
  `black` or `steel`; there is **no color value** attached.
- **`recolors`** — runtime palette swapping. The definition declares a
  `material` plus palette references; the chosen recolor name maps to a
  color ramp that is swapped into the base PNG at compose time. About 324
  definitions, including the most prominent parts — **body, head, hair,
  clothing**.

## Current State

`packages/core` already implements **both** mechanisms in full:

- `Selection` carries both `variant?` and `recolor?` (`types.ts`).
- `compose.ts` accepts a `resolvePalette` callback and recolors layers.
- `makeResolvePalette`, `getRecolorVariants`, `recolorImage`, and
  `createPaletteCatalog` are implemented and exported.

The gap is entirely in the web layer:

1. `variants` — picking an item auto-locks `variants[0]`; no UI to change
   it.
2. `recolors` — `upstream/palette_definitions/` is never loaded, and
   `useComposedCharacter` calls `composeSelections` **without**
   `resolvePalette`. Recolor selections (including the default
   `recolor: 'light'`) are never applied.
3. There is no color picker UI of any kind.

This work is therefore ~90% in the web layer; core is nearly untouched.

## Design

### Core: `getRecolorSwatches` (the one core addition)

To draw real color swatches the web needs, for a `recolors` item, the
color ramp behind each recolor option. The name-to-ramp resolution
(`parseRecolorKey` / `getTargetPalette`) lives privately inside
`recolor-resolve.ts`, so the web cannot compute it without duplicating
core logic.

Add one additive function to `packages/core/src/recolor-resolve.ts`:

```ts
export interface RecolorSwatch {
  readonly recolor: string;            // recolor name (e.g. "amber", "lpcr.tan")
  readonly colors: readonly string[];  // its resolved color ramp (hex)
}

export function getRecolorSwatches(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): readonly RecolorSwatch[];
```

It reuses the existing `collectRecolorEntries` + `normalizeRecolor` +
`getTargetPalette` path — the same expansion `getRecolorVariants` uses, so
no logic drift. It returns `[]` when the item has no recolors or the
material is unknown, matching `getRecolorVariants`' contract.
`getRecolorVariants` keeps its signature unchanged (`hash.ts` depends on
it). Export `getRecolorSwatches` and `RecolorSwatch` from
`packages/core/src/index.ts`.

No other core changes. The `Selection` / `pick` model already supports
`variant` and `recolor`.

### Web gap A: load palette definitions

New file `packages/web/src/catalog/load-palettes.ts`. Uses
`import.meta.glob('../../../../upstream/palette_definitions/**/*.json',
{ eager: true })` and passes the records to `createPaletteCatalog`,
returning `PaletteMetadata`. Mirrors `load-catalog.ts`: throws with a
`git submodule update --init` hint if the glob is empty; logs warnings.

`App.tsx` builds `PaletteMetadata` in the same `init` `useMemo` that
builds the catalog, and threads it into `SliceHarness`.

### Web gap B: wire `resolvePalette` into compose

`useComposedCharacter` receives `PaletteMetadata`. Inside its compose
effect it builds `makeResolvePalette(catalog, palettes, selections)` and
passes it as `composeSelections({ ..., resolvePalette })`.
`makeResolvePalette` closes over `selections`, so it is rebuilt per
compose — correct, since the effect already re-runs when selections
change.

This also makes `match_body_color` accessories follow the body skin tone
automatically (handled inside `makeResolvePalette`).

### Web gap C: the `ColorPicker` component

New file `packages/web/src/components/color-picker.tsx`. One component,
used in both placements.

Props: the selected `ItemDefinition`, the current `Selection`, the
`PaletteMetadata`, and a callback to dispatch a `pick`.

Mode is determined by the item (mutually exclusive):

- **recolors item** — a wrapping row of real color swatches from
  `getRecolorSwatches(item, palettes)`. Each swatch is a single solid
  square using a representative entry from the ramp (a fixed mid-ramp
  index, chosen for visibility); the recolor name shows as a hover
  tooltip. The active recolor is highlighted; if `selection.recolor` is
  unset, the material's `base` recolor is treated as active.
- **variants item** — a wrapping row of text chips, one per
  `item.variants` entry, label = variant name capitalized with `_`
  replaced by space. The active variant is highlighted.
- **neither** — renders nothing.

Clicking an option dispatches `{ type: 'pick', typeName, name, ... }`
reusing the item's current `name` and changing only `variant` or
`recolor`. The existing reducer handles it.

### Placement

- **Common section** — render `ColorPicker` inline directly below each
  selected item's `<select>` in `slice-harness.tsx`.
- **Advanced tree** — render the same `ColorPicker` inline below the tree
  node of the item currently selected for its `type_name`.

### Many-colors handling

`recolors` items such as body skin tone expand to roughly 40–60 colors.
The swatch row wraps and is given a `max-height` of about 3–4 rows with
vertical scrolling, so the left panel is not overrun.

## No Regressions

Wiring `resolvePalette` does not change current output: the default
`recolor: 'light'` is the `body` material's `base` ramp, so the swap is an
identity. Items picked without a recolor render the base ramp (also
identity). Existing rendered characters look unchanged.

## Non-Goals

- No translation of color/variant names. Swatches are self-evident and
  carry tooltips; only one new i18n key (`picker.color`, for the section
  label) is added. Color-name i18n can come later.
- Outfit presets are not extended to set colors; they keep their current
  behavior.
- No upstream-style per-color rendered sprite thumbnails.
- No changes to `upstream/`, the license, or build tooling. No `any`.

## Files To Change

Core:

- `packages/core/src/recolor-resolve.ts` — add `getRecolorSwatches` /
  `RecolorSwatch`.
- `packages/core/src/index.ts` — export them.

Web:

- `packages/web/src/catalog/load-palettes.ts` — new.
- `packages/web/src/components/color-picker.tsx` — new.
- `packages/web/src/App.tsx` — load palettes, thread `PaletteMetadata`.
- `packages/web/src/components/slice-harness.tsx` — render `ColorPicker`
  in the Common section and the Advanced tree; accept `PaletteMetadata`.
- `packages/web/src/hooks/use-composed-character.ts` — build and pass
  `resolvePalette`.
- `packages/web/src/i18n.ts` — add `picker.color` for both locales.

## Testing

- Core: `getRecolorSwatches` unit test — a `recolors` item resolves to the
  expected recolor names and ramps; an item with no recolors returns `[]`.
- Web: `load-palettes` builds a non-empty `PaletteMetadata`; `ColorPicker`
  renders swatches for a `recolors` item, chips for a `variants` item, and
  nothing for an item with neither; clicking dispatches a `pick` with the
  correct `recolor` / `variant`; `useComposedCharacter` passes a
  `resolvePalette` so a recolored body differs from the base render.
- Existing selection and compose tests stay green.
- Manual: select body → pick a dark skin tone → preview updates
  immediately; select earrings → pick a variant chip → preview updates;
  confirm both the Common section and the Advanced tree can pick colors;
  confirm attribution/credits still render.

## Acceptance Criteria

- Every colorable asset (Common section and Advanced tree) exposes a color
  picker: swatches for `recolors` items, chips for `variants` items.
- Changing a color updates the live preview.
- `match_body_color` accessories follow the body skin tone.
- No visual regression for default selections; all existing tests pass.
