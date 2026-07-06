# Villager Random Narrowing Design

- Date: 2026-07-06
- Scope: `packages/web`
- Status: design approved, pending implementation plan

## Background

Preset random uses web-only `RandomProfile` data in
`packages/web/src/slice/random-profiles.ts`, consumed by
`packages/web/src/slice/random-outfit.ts`. Recent Farmer, Mage, Knight, Ranger,
and Noble random work narrowed style behavior at the profile level with identity
item pools, required outfit slots, and profile-driven random color slots.

Villager random already has a dedicated profile and is narrower than normal
random because it only exposes everyday appearance and clothing slots:

- `body`
- `head`
- `expression`
- `hair`
- `clothes`
- `legs`
- `shoes`

It also already limits the outfit items to plain village clothing:

- `Longsleeve` or `Shortsleeve`
- `Pants`
- `Basic Shoes` or `Basic Boots`

The current Villager profile is still too loose compared with the newer preset
random strategy:

- It can select non-human body or head items if they exist in the catalog.
- It can select non-neutral expressions.
- It can omit the plain shirt, pants, or shoes because those slots are optional.
- It does not explicitly randomize the intended Villager color slots.

The desired behavior is a complete, ordinary human villager with controlled
variety: current male or female body type, skin color, optional hair, shirt
style, pants color, and shoe color may vary, while the identity and everyday
outfit silhouette stay stable.

## Goals

- Keep Villager random on the caller's current `male` or `female` body type.
- Keep Villager random human by restricting body and head choices to standard
  human entries.
- Make Villager random always use `Neutral` expression.
- Make Villager random always include a plain shirt, pants, and shoes.
- Preserve ordinary variation through skin color, optional hair, shirt choice,
  shirt color, pants color, and shoe choice/color.
- Keep Villager random restricted to mundane civilian clothing.
- Keep the behavior in pure web slice logic and focused tests.

## Non-Goals

- Do not change the fixed Villager preset.
- Do not force Villager random to male.
- Do not change random behavior for Farmer, Mage, Knight, Ranger, Noble, or
  Normal profiles.
- Do not add new UI controls or UI call-site special cases.
- Do not add dependencies.
- Do not modify `packages/core/`.
- Do not modify `upstream/`.
- Do not change attribution, rendering, export, download, URL, or catalog
  loading behavior.
- Do not curate a broader civilian clothing pool in this pass.

## Design Decision

Use the same profile-only mechanisms that now power Mage, Knight, and Ranger:

- `itemPools` for allow-listed identity and clothing choices.
- `requiredTypeNames` for slots that must bypass `optionalProb`.
- `randomColorTypeNames` for slots whose selected item color can vary.

Do not set `VILLAGER_RANDOM_PROFILE.bodyType`. Villager should preserve the
current body type. A male caller generates a male human villager, and a female
caller generates a female human villager.

Identity should be constrained with item pools:

```ts
itemPools: {
  body: ['Body Color'],
  head: ['Human Male', 'Human Female'],
  expression: ['Neutral'],
  clothes: ['Longsleeve', 'Shortsleeve'],
  legs: ['Pants'],
  shoes: ['Basic Shoes', 'Basic Boots'],
}
```

This excludes skeleton, zombie, fantasy, beast, or other non-standard identity
entries without adding UI special cases.

## Villager Profile

Update `VILLAGER_RANDOM_PROFILE` with:

- no `bodyType`
- `typeNames`: keep the current Villager list:
  - `body`
  - `head`
  - `expression`
  - `hair`
  - `clothes`
  - `legs`
  - `shoes`
- `requiredTypeNames`:
  - `body`
  - `head`
  - `expression`
  - `clothes`
  - `legs`
  - `shoes`
- `itemPools`:
  - `body`: `Body Color`
  - `head`: `Human Male`, `Human Female`
  - `expression`: `Neutral`
  - `clothes`: `Longsleeve`, `Shortsleeve`
  - `legs`: `Pants`
  - `shoes`: `Basic Shoes`, `Basic Boots`
- `randomColorTypeNames`:
  - `body`
  - `clothes`
  - `legs`
  - `shoes`

`hair` remains optional. It stays in `typeNames` so Villager can still vary hair
style when appearance randomization and `optionalProb` allow it, but it is not
required and does not need an item pool in this pass.

## Resulting Behavior

- `Selections.bodyType` remains the caller's current body type.
- `body` is always `Body Color`; recolor may vary when color randomization is
  enabled and palette metadata is available.
- `head` is `Human Male` or `Human Female`, filtered by the effective body type.
- `expression` is always `Neutral`.
- `hair` is optional compatible random hair.
- `clothes` is always `Longsleeve` or `Shortsleeve`; color may vary.
- `legs` is always `Pants`; color may vary.
- `shoes` is always `Basic Shoes` or `Basic Boots`; color or variant may vary.

Villager random must not select:

- skeleton, zombie, or other non-human body/head items
- non-neutral expressions
- farmer workwear such as `overalls` or `apron`
- formal/noble-only slots such as `hat`
- mage, ranger, knight, or combat slots such as `cape`, `armour`, `chainmail`,
  `weapon`, `weapon_magic_crystal`, `shield`, `quiver`, `arms`, or `gloves`
- fantasy or `fx` slots

This keeps Villager random distinct from Farmer workwear, Noble formalwear,
Mage equipment, Knight equipment, and Ranger equipment.

## Data Flow

```text
user clicks Villager / Random
  -> preset menu resolves randomProfileForStyle('villager')
  -> pickRandomOutfit receives VILLAGER_RANDOM_PROFILE
  -> effective body type remains args.bodyType
  -> body/head/expression pools restrict identity to standard human villager
  -> required Villager slots bypass optional probability
  -> color-enabled Villager slots choose random color options
  -> apply_selections receives a complete ordinary human Villager
```

The preset menu does not need to know that Villager requires a human identity,
neutral expression, shirt, pants, or shoes. It continues to pass the matching
random profile into `pickRandomOutfit`.

## Error Handling

- Unknown profile ids continue to fall back to the normal profile.
- If an allow-listed optional item is missing from the catalog, the existing
  picker skips that slot.
- If an allow-listed required item is missing or incompatible, the existing
  picker still skips it rather than throwing. Tests should cover the expected
  catalog path where required Villager items exist.
- If the current body type is `male`, `Human Female` is filtered out by
  compatibility. If it is `female`, `Human Male` is filtered out by
  compatibility.
- If `palettes` is unavailable for a recolor-backed random color slot, keep the
  existing default selection behavior for that slot.
- If a variant-backed random color slot has no variants, keep the existing
  default selection behavior for that slot.
- If `scope.colors` is false, do not randomize color fields beyond existing
  default selection behavior.
- Disabled random scopes continue to preserve current selections as they do
  today.

## Attribution And Compatibility

This change only affects which existing catalog items are selected for Villager
random. Rendering, composition, credits, export, and download continue through
the existing pipelines.

Attribution risk is low because selections still reference catalog-backed items
whose credit metadata comes from `assets/CREDITS.csv` or the upstream credits
data. The change must not bypass catalog metadata or create rendered pixels
outside the existing attribution-aware flow.

Selection token, URL, fixed preset, and export compatibility risk is low because
the design does not change selection serialization, parsing, composition output
format, or fixed preset application semantics.

## Testing

Update `packages/web/test/random-outfit.test.ts` with focused Villager coverage:

- Villager profile type-name coverage remains limited to `body`, `head`,
  `expression`, `hair`, `clothes`, `legs`, and `shoes`.
- A catalog containing `Body Color`, skeleton, zombie, and other non-human body
  entries selects only `Body Color` for Villager.
- A catalog containing `Human Male`, `Human Female`, skeleton, zombie, and
  non-human heads selects only the compatible standard human head for the
  effective body type.
- Villager random always selects `Neutral` expression.
- With `optionalProb: 0`, Villager random still includes shirt, pants, and
  shoes.
- With `optionalProb: 0`, optional `hair` may be absent.
- Villager excludes farmer workwear, formal/noble-only slots, combat slots,
  fantasy slots, weapons, and `fx`.
- With `scope.colors: true`, palette metadata, and multi-option variants,
  Villager random can vary body, shirt, pants, and shoe colors.
- With `scope.colors: false`, Villager keeps default colors and variants for
  newly selected items.
- Female Villager random keeps `Selections.bodyType: 'female'` and selects the
  compatible standard human female head when available.

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm check:boundaries
```

Run broader web tests if the implementation touches shared random behavior
beyond `VILLAGER_RANDOM_PROFILE` and focused random-outfit tests.
