# Ranger Random Narrowing Design

- Date: 2026-07-05
- Scope: `packages/web`
- Status: design approved, pending user review

## Background

Preset random uses web-only `RandomProfile` data in
`packages/web/src/slice/random-profiles.ts`. Farmer random was recently narrowed
at the profile level with item allow-lists, required slots, and random color
slots instead of UI call-site special cases.

The current Ranger profile is already narrower than normal random because it
lists Ranger-oriented type names and uses item pools for the fixed Ranger kit:

- `Leather` armour
- `Pants`
- `Basic Boots`
- `Hood`
- `Normal` bow
- `Quiver`

It still has important gaps:

- identity is not restricted to human body/head items
- expression is not fixed
- core Ranger equipment can be omitted by `optionalProb`
- Ranger color variation is not expressed through `randomColorTypeNames`

The desired behavior is a complete, human, bow-and-quiver Ranger with enough
variation to make random useful.

## Goals

- Keep Ranger random human, while allowing male or female body type based on
  the caller/current selection.
- Prevent Ranger random from selecting skeleton, zombie, fantasy, beast,
  reptile, or other non-standard body/head identities.
- Make Ranger random always use `Neutral` expression.
- Make the core Ranger kit always appear:
  - `Leather` armour
  - `Pants`
  - `Basic Boots`
  - `Hood`
  - `Normal` bow
  - `Quiver`
- Avoid incomplete Rangers with no bow, no quiver, no hood, no leather armour,
  no pants, or no boots.
- Preserve meaningful randomness through human gender/body type, skin color,
  optional hair, leather colours, boot colours, hood colours, bow variants, and
  quiver variants.
- Keep the behavior in pure web slice logic and focused tests.

## Non-Goals

- Do not change the fixed Ranger apply preset.
- Do not change random behavior for Farmer, Villager, Mage, Knight, Noble, or
  Normal profiles.
- Do not add new UI controls or UI call-site special cases.
- Do not add dependencies.
- Do not modify `upstream/`.
- Do not modify `packages/core/`.
- Do not change attribution, rendering, export, download, or URL behavior.
- Do not curate broader alternate Ranger gear pools in this pass.

## Design Decision

Use the same profile-level mechanisms that now power Farmer random:

- `itemPools` for allow-listed identity and fixed equipment choices
- `requiredTypeNames` for slots that must bypass `optionalProb`
- `randomColorTypeNames` for slots whose selected item color can vary

Do not set `RANGER_RANDOM_PROFILE.bodyType`. Ranger should not force male. The
effective body type remains `args.bodyType`, so a male caller can generate a
male human Ranger and a female caller can generate a female human Ranger.

Identity should be constrained with item pools:

```ts
itemPools: {
  body: ['Body Color'],
  head: ['Human Male', 'Human Female'],
  expression: ['Neutral'],
  armour: ['Leather'],
  legs: ['Pants'],
  shoes: ['Basic Boots'],
  hat: ['Hood'],
  weapon: ['Normal'],
  quiver: ['Quiver'],
}
```

This excludes special body entries such as `Skeleton` and `Zombie`, and excludes
non-standard head entries by allowing only the two standard adult human heads.

## Ranger Profile

Update `RANGER_RANDOM_PROFILE` with:

- no `bodyType`
- `typeNames`: keep the current Ranger list:
  - `body`
  - `head`
  - `expression`
  - `hair`
  - `armour`
  - `legs`
  - `shoes`
  - `hat`
  - `weapon`
  - `quiver`
- `requiredTypeNames`:
  - `body`
  - `head`
  - `expression`
  - `armour`
  - `legs`
  - `shoes`
  - `hat`
  - `weapon`
  - `quiver`
- `itemPools`:
  - `body`: `Body Color`
  - `head`: `Human Male`, `Human Female`
  - `expression`: `Neutral`
  - `armour`: `Leather`
  - `legs`: `Pants`
  - `shoes`: `Basic Boots`
  - `hat`: `Hood`
  - `weapon`: `Normal`
  - `quiver`: `Quiver`
- `randomColorTypeNames`:
  - `body`
  - `armour`
  - `legs`
  - `shoes`
  - `hat`
  - `weapon`
  - `quiver`

`hair` remains optional. It is included in `typeNames` so Ranger can still vary
hair style when appearance randomization and `optionalProb` allow it, but it is
not required and does not need an item pool in this pass.

## Resulting Behavior

- `body`: always `Body Color`; recolor may vary when color randomization is
  enabled and palette metadata is available.
- `head`: `Human Male` or `Human Female`, filtered by the effective body type.
- `expression`: always `Neutral`.
- `hair`: optional compatible random hair.
- `armour`: always `Leather`; color or variant may vary.
- `legs`: always `Pants`; color or variant may vary.
- `shoes`: always `Basic Boots`; color or variant may vary.
- `hat`: always `Hood`; color or variant may vary.
- `weapon`: always `Normal`; variant may vary when the catalog provides bow
  variants.
- `quiver`: always `Quiver`; variant may vary.

This avoids incomplete random Rangers with no bow, no quiver, no hood, no
leather armour, no pants, or no boots. It intentionally keeps the first pass
conservative by not adding alternate Ranger gear names.

## Data Flow

```text
user clicks Ranger / Random
  -> preset menu resolves randomProfileForStyle('ranger')
  -> pickRandomOutfit receives RANGER_RANDOM_PROFILE
  -> effective body type remains args.bodyType
  -> body/head/expression pools restrict identity to standard human Ranger
  -> required Ranger kit slots bypass optional probability
  -> color-enabled Ranger slots choose random color options
  -> apply_selections receives a complete human Ranger with variable skin, hair, leather, hood, bow, and quiver colors
```

The preset menu does not need to know that Ranger requires leather armour, a
hood, a bow, a quiver, or human identity. It continues to pass the matching
random profile into `pickRandomOutfit`.

## Error Handling

- Unknown profile ids continue to fall back to the normal profile.
- If an allow-listed optional item is missing from the catalog, the existing
  picker skips that slot.
- If an allow-listed required item is missing or incompatible, the existing
  picker still skips it rather than throwing. Tests should cover the expected
  catalog path where required Ranger items exist.
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

Update `packages/web/test/random-outfit.test.ts` with focused Ranger coverage:

- Ranger profile type-name coverage remains limited to `body`, `head`,
  `expression`, `hair`, `armour`, `legs`, `shoes`, `hat`, `weapon`, and
  `quiver`.
- A catalog containing `Body Color`, `Skeleton`, and `Zombie` body entries
  selects only `Body Color` for Ranger.
- A catalog containing `Human Male`, `Human Female`, `Skeleton`, `Zombie`, and
  non-human heads selects only the compatible standard human head for the
  effective body type.
- Ranger random always selects `Neutral` expression.
- With `optionalProb: 0`, Ranger random still includes `Leather`, `Pants`,
  `Basic Boots`, `Hood`, `Normal`, and `Quiver`.
- With `optionalProb: 0`, optional `hair` may be absent.
- With `scope.colors: true`, palette metadata, and multi-option variants,
  Ranger random can vary skin, leather, pants, boots, hood, bow, and quiver
  color fields through `randomColorTypeNames`.
- With `scope.colors: false`, Ranger random keeps the existing default color or
  variant behavior.
- Ranger random excludes heavy plate, chainmail, farmer workwear, mage crystal
  parts, formal/noble clothing, fantasy parts, and `fx` because those slots are
  omitted from `typeNames` or excluded by profile groups.

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm check:boundaries
```

Run broader web tests if the implementation touches shared random behavior more
than Ranger profile data and focused random-profile tests.
