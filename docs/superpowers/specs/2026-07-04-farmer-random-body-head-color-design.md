# Farmer Random Body Head Color Design

- Date: 2026-07-04
- Scope: `packages/web`
- Status: design approved, pending implementation plan

## Background

The current Farmer preset random profile already narrows the generated outfit:

- body type is forced to `male`
- expression is forced to `Neutral`
- farmer workwear is required so the character is fully dressed
- skin color and hair style remain random

One gap remains. The profile allows any compatible `body` and `head` item, so
the farmer random output can still select special bodies such as `Skeleton` or
`Zombie`, and non-human or non-adult-male heads. The clothing item choices are
also fixed, but their color fields currently default to the first available
variant or recolor instead of randomizing.

## Goals

- Prevent Farmer random from selecting `Skeleton`, `Zombie`, or any other
  non-standard body item.
- Keep Farmer random skin color variable by selecting only `Body Color` and
  randomizing its recolor.
- Keep Farmer random head fixed to adult male by selecting only `Human Male`.
- Keep Farmer random expression fixed to `Neutral`.
- Keep Farmer random hair style variable.
- Keep the Farmer workwear item choices fixed to `Shortsleeve`, `Overalls`,
  and `Basic Boots`.
- Randomize colors for all three Farmer clothing slots:
  - `clothes` / `Shortsleeve` recolor
  - `overalls` / `Overalls` variant
  - `shoes` / `Basic Boots` variant

## Non-Goals

- Do not change the fixed Farmer apply preset.
- Do not change random behavior for non-Farmer profiles.
- Do not add UI controls for color randomization.
- Do not add dependencies.
- Do not modify `upstream/`.
- Do not modify `packages/core/`.
- Do not change attribution, rendering, export, or download behavior.

## Design Decision

Keep the behavior in the web random profile layer.

Add a small optional profile field:

```ts
randomColorTypeNames?: readonly TypeName[];
```

`pickRandomOutfit` will continue selecting items through `itemPools`. After an
item is selected, if its type name is listed in `profile.randomColorTypeNames`
and `scope.colors` is enabled, the picker will use the existing
`getColorOptions(item, palettes)` helper to choose a random color option with
the same RNG used for item selection.

The random color selection should support both existing color systems:

- recolor-backed items produce `{ recolor: value }`
- variant-backed items produce `{ variant: value }`

If palette metadata is unavailable, recolor-backed items will keep the existing
default behavior because no recolor options can be resolved. Variant-backed
items can still randomize from their declared variants.

This keeps the implementation pure, reusable, and local to `packages/web/src/slice`.
It avoids Farmer-specific conditionals in UI components or render code.

## Farmer Profile

Update `FARMER_RANDOM_PROFILE.itemPools` to include body and head allow-lists:

```ts
itemPools: {
  body: ['Body Color'],
  head: ['Human Male'],
  expression: ['Neutral'],
  clothes: ['Shortsleeve'],
  overalls: ['Overalls'],
  shoes: ['Basic Boots'],
},
```

Add random color slots:

```ts
randomColorTypeNames: ['body', 'clothes', 'overalls', 'shoes'],
```

The resulting Farmer random behavior is:

- `body`: always `Body Color`; recolor may vary
- `head`: always `Human Male`
- `expression`: always `Neutral`
- `hair`: random compatible hair item
- `clothes`: always `Shortsleeve`; recolor may vary
- `overalls`: always `Overalls`; variant may vary
- `shoes`: always `Basic Boots`; variant may vary

## Data Flow

```text
user clicks Farmer / Random
  -> preset menu resolves FARMER_RANDOM_PROFILE
  -> pickRandomOutfit filters body pool to Body Color
  -> pickRandomOutfit filters head pool to Human Male
  -> selected Farmer workwear items are required
  -> color-enabled Farmer slots choose random color options
  -> apply_selections receives a male human farmer with variable skin, hair, and clothing colors
```

## Error Handling

- If an allow-listed item is absent from a catalog, the existing picker skips
  that slot instead of throwing.
- If `palettes` is unavailable for a recolor-backed random color slot, keep the
  current default behavior for that slot.
- If a variant-backed random color slot has no variants, keep the current
  default behavior for that slot.
- If `scope.colors` is false, do not randomize colors.

## Testing

Update `packages/web/test/random-outfit.test.ts` with focused Farmer tests:

- A catalog containing `Body Color`, `Skeleton`, and `Zombie` should select only
  `Body Color`.
- A catalog containing multiple heads should select only `Human Male`.
- Farmer random should still allow hair to vary.
- With `scope.colors: true`, palette metadata, and multi-option variants,
  Farmer random should be able to select non-first colors for `body`,
  `clothes`, `overalls`, and `shoes`.
- With `scope.colors: false`, Farmer random should not randomize color fields
  beyond existing default behavior.

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```
