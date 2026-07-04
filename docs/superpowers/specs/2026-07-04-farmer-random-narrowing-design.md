# Farmer Random Narrowing Design

- Date: 2026-07-04
- Scope: `packages/web`
- Status: design approved, pending implementation plan

## Background

Preset random currently uses dedicated random profiles in
`packages/web/src/slice/random-profiles.ts`. The farmer profile is already
narrower than the normal random profile: it excludes fantasy, weapons, and
`fx`, and limits item pools to farmer workwear.

The current behavior is still too broad for the farmer preset:

- Farmer random can use the current body type instead of always producing a
  male farmer.
- Farmer random can produce non-neutral expressions.
- Farmer random can omit `overalls`, leaving the character without lower-body
  coverage.

The desired farmer random behavior is narrower but still meaningfully random:
skin color and hair style should vary, while the farmer silhouette and required
outfit coverage remain stable.

## Goals

- Make farmer preset random always generate a male character.
- Make farmer preset random always use the `Neutral` expression.
- Keep skin color random.
- Keep hair style random.
- Ensure farmer random always includes lower-body coverage by requiring
  `overalls`.
- Keep farmer random restricted to farmer-safe civilian workwear.
- Keep the change in web pure selection logic and tests.

## Non-Goals

- Do not change the fixed farmer preset.
- Do not change random behavior for villager, mage, knight, ranger, noble, or
  normal profiles.
- Do not redesign the preset menu UI.
- Do not add new dependencies.
- Do not modify `upstream/`.
- Do not change attribution, rendering, export, or core composition behavior.

## Design Decision

Extend the existing `RandomProfile` model instead of adding farmer-specific UI
special cases.

Add optional profile metadata for:

- `bodyType?: BodyType`
- `requiredTypeNames?: readonly TypeName[]`

`pickRandomOutfit` will resolve an effective body type from
`profile.bodyType ?? args.bodyType`. It will use that effective body type both
for compatibility filtering and for the returned `Selections.bodyType`.

`pickRandomOutfit` will also treat any type name listed in
`profile.requiredTypeNames` as required. Required type names bypass
`optionalProb`, just like type names that belong to required profile groups.

This keeps preset-specific random constraints inside profile data, where the
other preset random rules already live. It also gives future preset profiles a
small reusable mechanism for fixed body type and required slots without pushing
style rules into React components.

## Farmer Profile

Update `FARMER_RANDOM_PROFILE` with:

- `bodyType: 'male'`
- `typeNames`: `body`, `head`, `expression`, `hair`, `clothes`, `overalls`,
  `shoes`
- `requiredTypeNames`: `body`, `head`, `expression`, `clothes`, `overalls`,
  `shoes`
- `itemPools.expression`: `Neutral`
- `itemPools.clothes`: `Shortsleeve`
- `itemPools.overalls`: `Overalls`
- `itemPools.shoes`: `Basic Boots`

Do not add item pools for `body`, `head`, or `hair`. That leaves skin color and
hair style free to randomize through the available compatible catalog entries.

The profile continues to exclude fantasy, weapons, and `fx`, and continues to
omit combat/formal slots by limiting `typeNames`.

## Data Flow

```text
user clicks Farmer / Random
  -> preset menu resolves randomProfileForStyle('farmer')
  -> pickRandomOutfit receives FARMER_RANDOM_PROFILE
  -> effective body type becomes male
  -> required farmer slots bypass optional probability
  -> compatible random body, head, and hair are selected
  -> Neutral expression, Shortsleeve, Overalls, and Basic Boots are selected
  -> apply_selections receives male farmer selections
```

The preset menu does not need to know that farmer fixes body type or requires
overalls. It continues to pass the matching random profile into
`pickRandomOutfit`.

## Error Handling

- Unknown profile ids continue to fall back to the normal profile.
- If an allow-listed optional item is missing from the catalog, the existing
  picker skips that slot.
- If an allow-listed required item is missing or incompatible, the picker still
  skips it rather than throwing. Tests will cover the expected catalog path
  where the farmer-required items exist.
- Disabled random scopes continue to preserve current selections as they do
  today.

## Testing

Update `packages/web/test/random-outfit.test.ts` with focused farmer coverage:

- Farmer profile type-name coverage remains limited to body, head, expression,
  hair, clothes, overalls, and shoes.
- Farmer random returns `bodyType: 'male'`, even when called with a different
  current body type.
- Farmer random picks `Neutral` expression.
- Farmer random still allows body/head/hair catalog choices to be selected from
  compatible random pools.
- Farmer random includes `Shortsleeve`, `Overalls`, and `Basic Boots` even with
  `optionalProb: 0`.
- Farmer random still excludes fantasy, weapons, `fx`, armour, shields, and
  other non-farmer slots.

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm check:boundaries
```

Run broader web tests if the implementation touches shared random behavior more
than the profile model and `pickRandomOutfit`.
