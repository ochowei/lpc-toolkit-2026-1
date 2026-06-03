# Random Variant Audit Design

## Context

The random outfit flow currently builds selections with only `typeName` and
`name`. Items whose sprite files live under variant filenames then compose
paths like `.../walk.png` instead of `.../walk/<variant>.png`. Missing image
loads are swallowed by the compose pipeline, so those layers silently disappear.

The reported examples are wings and shields, but the pattern applies to any
random-covered catalog item with physical `variants`.

Manual item selection and hash parsing already set a default variant. Random
selection should follow the same contract.

## Goals

- Fix random outfits so selected items with physical variants include the first
  declared variant.
- Add a regression audit that exercises real catalog data and catches future
  random-covered variant items that would render with missing representative
  sprite paths.
- Keep the change surgical: no dependency changes, no upstream edits, no
  palette/recolor behavior changes in this phase.

## Non-Goals

- Do not change how upstream assets are copied or served.
- Do not add a backend, new build tool, or new dependency.
- Do not implement default recolor selection in this phase.
- Do not modify `upstream/`.

## Proposed Change

Update `pickRandomOutfit` so it constructs each random item selection with the
same default-variant behavior used by the picker helpers:

```ts
{
  typeName,
  name: item.name,
  ...(item.variants?.[0] ? { variant: item.variants[0] } : {}),
}
```

This keeps random selection aligned with the existing `selectionForItem` and
`pickActionForItem` behavior without introducing palette metadata into the
random slice.

## Regression Tests

Add a unit test in `packages/web/test/random-outfit.test.ts` proving that a
randomly picked item with variants receives its first variant.

Add a real-catalog audit test that:

1. Loads `assets/sheet_definitions/**/*.json` into `createCatalog`.
2. Uses `CATEGORY_GROUPS` to determine the type names random can select,
   excluding the default `fx` group.
3. For compatible male-body items with `variants`, builds the same selection
   shape random will produce.
4. Calls `getSpritePathsForSelections` and checks that representative paths
   resolve to files under `assets/spritesheets`.

The audit should report failures with enough context to identify the item,
type name, variant, and missing path. It should not require running the web app
or touching `upstream/`.

## Data Flow

Random button:

`PresetBar` -> `pickRandomOutfit` -> `apply_selections` -> `toSelections` ->
`composeSelections`

After this change, selected variant-backed items reach `composeSelections` with
their default variant already present, so compose generates variant paths and
loads existing PNGs.

## Error Handling

The production compose behavior remains unchanged: individual image load
failures are swallowed to match upstream behavior. The regression audit handles
the diagnostic responsibility by failing in tests when random-backed variant
items would produce missing representative sprite paths.

## Next Phase: Default Recolors

Some random-covered items do not have physical `variants` but do have
`recolors`. Those items may still render with default or body-matched colors
that differ from upstream/hash parsing behavior.

The next phase should evaluate whether random selection should also assign a
default recolor. That work is intentionally separate because it likely requires
palette metadata and should align with `parseHash`, `resolvePalette`, and
existing material defaults rather than guessing in the random slice.

Success criteria for that next phase:

- Identify random-covered recolor-only items whose rendered output differs from
  hash-parsed or upstream default behavior.
- Define a single source of truth for default recolor selection.
- Add tests that cover default recolors without duplicating palette resolution
  logic.

## Verification

- `pnpm --filter @lpc-toolkit/web test`
- `pnpm -r typecheck`

If full workspace tests are practical after implementation, run `pnpm -r test`
as a broader safety check.
