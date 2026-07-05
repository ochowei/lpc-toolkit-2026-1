# Mage Random Narrowing Design

- Date: 2026-07-05
- Scope: `packages/web`
- Status: design approved, pending implementation plan

## Background

Preset random already uses web-only `RandomProfile` data in
`packages/web/src/slice/random-profiles.ts`. The current Mage profile is
narrower than normal random because it lists only mage-oriented type names and
uses item pools for the fixed Mage outfit pieces:

- `Longsleeve laced`
- `Pants`
- `Basic Shoes`
- `Solid` cape
- `Wizard Hat Base`
- `Gnarled staff`
- `Crystal`

However, it does not yet apply the stricter profile-level strategy recently
used by Farmer random:

- identity is not restricted to human body/head items
- expression is not fixed
- core mage equipment can be omitted by `optionalProb`
- fixed mage item choices do not randomize colors through
  `randomColorTypeNames`

The desired Mage random behavior should stay recognizably human and mage-like
without hard-coding special cases in UI call sites.

## Goals

- Keep Mage random human, while allowing male or female body type based on the
  caller/current selection.
- Prevent Mage random from selecting skeleton, zombie, fantasy, beast, farm, or
  other non-standard body/head identities.
- Make Mage random always use `Neutral` expression.
- Make the core Mage outfit/equipment always appear:
  - `Longsleeve laced`
  - `Pants`
  - `Basic Shoes`
  - `Solid` cape
  - `Wizard Hat Base`
  - `Gnarled staff`
  - `Crystal`
- Preserve meaningful randomness through human gender/body type, skin color,
  optional hair, and mage clothing/equipment colors.
- Keep the behavior in pure web slice logic and focused tests.

## Non-Goals

- Do not change the fixed Mage apply preset.
- Do not change random behavior for Farmer, Villager, Knight, Ranger, Noble, or
  Normal profiles.
- Do not add new UI controls or UI call-site special cases.
- Do not add dependencies.
- Do not modify `upstream/`.
- Do not modify `packages/core/`.
- Do not change attribution, rendering, export, download, or URL behavior.
- Do not curate a broader set of alternate mage hats, robes, capes, staves, or
  crystals in this pass.

## Design Decision

Use the same profile-level mechanisms that now power Farmer random:

- `itemPools` for allow-listed identity and item choices
- `requiredTypeNames` for slots that must bypass `optionalProb`
- `randomColorTypeNames` for slots whose selected item color can vary

Do not set `MAGE_RANDOM_PROFILE.bodyType`. Unlike Farmer, Mage should not force
male. The effective body type remains `args.bodyType`, so a male caller can
generate a male human mage and a female caller can generate a female human mage.

Identity should be constrained with item pools instead:

```ts
itemPools: {
  body: ['Body Color'],
  head: ['Human Male', 'Human Female'],
  expression: ['Neutral'],
  clothes: ['Longsleeve laced'],
  legs: ['Pants'],
  shoes: ['Basic Shoes'],
  cape: ['Solid'],
  hat: ['Wizard Hat Base'],
  weapon: ['Gnarled staff'],
  weapon_magic_crystal: ['Crystal'],
}
```

This excludes special body entries such as `Skeleton` and `Zombie`, and excludes
non-standard head entries by allowing only the two standard adult human heads.

## Mage Profile

Update `MAGE_RANDOM_PROFILE` with:

- no `bodyType`
- `typeNames`: keep the current mage list:
  - `body`
  - `head`
  - `expression`
  - `hair`
  - `clothes`
  - `legs`
  - `shoes`
  - `cape`
  - `hat`
  - `weapon`
  - `weapon_magic_crystal`
- `requiredTypeNames`:
  - `body`
  - `head`
  - `expression`
  - `clothes`
  - `legs`
  - `shoes`
  - `cape`
  - `hat`
  - `weapon`
  - `weapon_magic_crystal`
- `itemPools`:
  - `body`: `Body Color`
  - `head`: `Human Male`, `Human Female`
  - `expression`: `Neutral`
  - `clothes`: `Longsleeve laced`
  - `legs`: `Pants`
  - `shoes`: `Basic Shoes`
  - `cape`: `Solid`
  - `hat`: `Wizard Hat Base`
  - `weapon`: `Gnarled staff`
  - `weapon_magic_crystal`: `Crystal`
- `randomColorTypeNames`:
  - `body`
  - `clothes`
  - `legs`
  - `shoes`
  - `cape`
  - `hat`
  - `weapon`
  - `weapon_magic_crystal`

`hair` remains optional. It is included in `typeNames` so Mage can still vary
hair style when appearance randomization and `optionalProb` allow it, but it is
not required and does not need an item pool in this pass.

## Resulting Behavior

- `body`: always `Body Color`; recolor may vary when color randomization is
  enabled and palette metadata is available.
- `head`: `Human Male` or `Human Female`, filtered by the effective body type.
- `expression`: always `Neutral`.
- `hair`: optional compatible random hair.
- `clothes`: always `Longsleeve laced`; color/variant may vary.
- `legs`: always `Pants`; color/recolor may vary.
- `shoes`: always `Basic Shoes`; color/variant may vary.
- `cape`: always `Solid`; color/variant may vary.
- `hat`: always `Wizard Hat Base`; color/variant may vary.
- `weapon`: always `Gnarled staff`; color/variant may vary.
- `weapon_magic_crystal`: always `Crystal`; color/variant may vary.

## Data Flow

```text
user clicks Mage / Random
  -> preset menu resolves randomProfileForStyle('mage')
  -> pickRandomOutfit receives MAGE_RANDOM_PROFILE
  -> effective body type remains args.bodyType
  -> body/head/expression pools restrict identity to standard human mage
  -> required mage clothing/equipment slots bypass optional probability
  -> color-enabled mage slots choose random color options
  -> apply_selections receives a complete human mage with variable skin, hair, and mage colors
```

The preset menu does not need to know that Mage requires a staff, crystal, hat,
or human identity. It continues to pass the matching random profile into
`pickRandomOutfit`.

## Error Handling

- Unknown profile ids continue to fall back to the normal profile.
- If an allow-listed optional item is missing from the catalog, the existing
  picker skips that slot.
- If an allow-listed required item is missing or incompatible, the existing
  picker still skips it rather than throwing. Tests should cover the expected
  catalog path where required Mage items exist.
- If the current/effective body type is `male`, `Human Female` is filtered out
  by compatibility. If it is `female`, `Human Male` is filtered out by
  compatibility.
- If `palettes` is unavailable for a recolor-backed random color slot, keep the
  existing default selection behavior for that slot.
- If a variant-backed random color slot has no variants, keep the existing
  default selection behavior for that slot.
- If `scope.colors` is false, do not randomize color fields beyond existing
  default selection behavior.
- Disabled random scopes continue to preserve current selections as they do
  today.

## Testing

Update `packages/web/test/random-outfit.test.ts` with focused Mage coverage:

- Mage profile type-name coverage remains limited to `body`, `head`,
  `expression`, `hair`, `clothes`, `legs`, `shoes`, `cape`, `hat`, `weapon`,
  and `weapon_magic_crystal`.
- A catalog containing `Body Color`, `Skeleton`, and `Zombie` body entries
  selects only `Body Color` for Mage.
- A catalog containing `Human Male`, `Human Female`, `Skeleton`, `Zombie`, and
  non-human heads selects only the compatible standard human head for the
  effective body type.
- Mage random always selects `Neutral` expression.
- With `optionalProb: 0`, Mage random still includes `Longsleeve laced`,
  `Pants`, `Basic Shoes`, `Solid`, `Wizard Hat Base`, `Gnarled staff`, and
  `Crystal`.
- With `optionalProb: 0`, optional `hair` may be absent.
- With `scope.colors: true`, palette metadata, and multi-option variants, Mage
  random can select non-first colors for `body`, `clothes`, `legs`, `shoes`,
  `cape`, `hat`, `weapon`, and `weapon_magic_crystal`.
- With `scope.colors: false`, Mage random does not apply the profile-level
  random color override.
- Mage random continues to omit armor, chainmail, shields, quivers, farmer
  workwear, ranger-only equipment, and other non-mage slots by virtue of its
  `typeNames` list.

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Run broader web tests only if implementation touches shared random behavior
beyond `MAGE_RANDOM_PROFILE` data and focused test expectations.
