# Random Profiles Design

- Date: 2026-07-02
- Scope: `packages/web`
- Status: design approved, pending implementation plan

## Background

The web UI currently has two related but separate concepts:

- Fixed outfit presets in `packages/web/src/presets.ts`, such as farmer,
  mage, knight, ranger, and noble.
- The random outfit button, which directly calls `pickRandomOutfit` with the
  current catalog, palettes, and body type.

The current random behavior is effectively one implicit mode: generate a broad
random outfit from the available category groups while excluding `fx`. Future
random behavior should support style-specific generation. For example, after
choosing a mage style, the random button should be able to generate mage-like
outfits and optionally randomize only parts of the character.

## Goals

- Add a separate random-generation concept that can support multiple styles.
- Define `normal` as the first random profile, preserving today's random
  behavior.
- Keep fixed outfit presets and random-generation rules separate.
- Support coarse random scopes in the first version: appearance, clothing,
  equipment, and colors.
- Leave room for future slot-level random controls without building them now.

## Non-Goals

- Do not merge random-generation rules into the existing `Preset` type.
- Do not add user-authored or persisted random profiles.
- Do not add per-slot random controls in the first implementation.
- Do not move this feature into `packages/core`; this remains a web UI feature.
- Do not add new dependencies.

## Design Decision

Introduce a new `RandomProfile` model alongside, but separate from, fixed
`Preset` data.

`Preset` continues to mean "apply this fixed set of items." `RandomProfile`
means "generate a random selection using these style rules." This keeps
`computePresetSelection` focused on fixed preset application and avoids adding
mode-specific branches to the existing preset model.

The first profile is `normal`. It is the explicit version of the current random
button behavior and must remain behaviorally equivalent to today's
`pickRandomOutfit` defaults.

## Data Model

The first implementation can keep the model in `packages/web`, near the current
random outfit helper.

```ts
export interface RandomProfile {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly requiredGroups: readonly GroupId[];
  readonly optionalGroups: readonly GroupId[];
  readonly excludeGroups: readonly GroupId[];
  readonly optionalProb: number;
  readonly itemPools?: Partial<Record<TypeName, readonly string[]>>;
}

export interface RandomScope {
  readonly appearance: boolean;
  readonly clothing: boolean;
  readonly equipment: boolean;
  readonly colors: boolean;
}
```

`itemPools` is optional. Profiles that do not define it use all compatible
catalog items for the included groups. Style-specific profiles, such as a
future mage profile, can use it to constrain individual type names to curated
item names.

`RandomScope` is intentionally coarse. It gives the UI a small first version
while preserving a clean path to future slot-level controls.

## Normal Profile

`normal` represents the current random behavior:

- Required group: `body`.
- Excluded groups: `fx`.
- Optional probability: current default `0.5`.
- Item pool: unrestricted compatible catalog items.
- Body type: current body type from UI state.
- Palettes: current loaded palette metadata.

Existing tests around `pickRandomOutfit` should be updated or extended so that
using `normal` produces the same behavior as the current implementation.

## Style Profiles

Future style profiles can be added without changing the fixed preset data.

Examples:

- `mage`: constrain clothes, cape, hat, weapon, and magic crystal pools to
  mage-appropriate items, and allow color randomization inside those pools.
- `knight`: constrain armor, helmet, weapon, shield, gloves, and boot pools to
  knight-appropriate items.
- `farmer`: constrain clothing and equipment to civilian and farming-oriented
  items.

If the active style has no matching random profile, the random button falls
back to `normal`.

## UI Behavior

The existing preset dropdown can remain the main place where the user chooses a
style. The UI stores an `activeStyleId`.

- Clicking a preset row still applies that fixed preset through
  `computePresetSelection`.
- The selected style id is remembered as `activeStyleId`.
- Clicking the random button looks up a matching `RandomProfile`.
- Missing profile ids fall back to `normal`.
- Random options are exposed as four coarse toggles:
  - Appearance
  - Clothing
  - Equipment
  - Colors

The first implementation should avoid making a new complex slot-level editor.
Those controls can be added later by mapping the same scope concept to
individual type names.

## Data Flow

```ts
activeStyleId + randomScope + catalog + palettes + current selections
  -> pickRandomOutfit(profile-aware args)
  -> Selections
  -> dispatch({ type: 'apply_selections', selections })
```

The random helper becomes profile-aware. Its output remains `Selections`, so
rendering, URL/hash behavior, downloads, and attribution continue to use the
existing flow.

When a scope is disabled, random generation should preserve the current
selection for the affected categories instead of clearing or replacing them.
For example, disabling equipment means the current weapon, shield, quiver, and
similar selections remain unchanged.

When `colors` is disabled, the helper should not choose a new variant or
recolor for an item that is being preserved. For newly selected items, it can
use the existing default selection behavior.

## Category Mapping

The first coarse scopes map to category groups or curated type-name sets:

- Appearance: body, head, hair, expression, eyes, beard, and related personal
  appearance categories.
- Clothing: torso, legs, feet, clothes, overalls, apron, armour, chainmail,
  shoes, cape, hat, arms, and gloves.
- Equipment: weapon, weapon-related extras, shield, quiver, and similar held or
  carried equipment.
- Colors: variant and recolor choices within selected or preserved items.

The implementation should reuse existing category group metadata where it is
accurate and introduce only small local mapping helpers where the coarse UI
scope does not match existing groups exactly.

## Error Handling

- If a profile id is unknown, use `normal`.
- If a profile references item names that do not exist in the catalog, skip
  those names and use any remaining compatible pool entries.
- If a profile pool for a type name has no compatible items for the current body
  type, skip that type name.
- The random helper should not throw for incomplete style profiles.

Validation tests should catch broken built-in profile item pools so mistakes are
visible during development.

## Testing

Unit tests should cover:

- `normal` profile preserves current random behavior.
- The default `fx` exclusion remains in place.
- Unknown profile ids fall back to `normal`.
- Disabling appearance, clothing, or equipment preserves current selections in
  that scope.
- Disabling colors avoids arbitrary recolor or variant changes for preserved
  items.
- Style-specific item pools constrain random choices to allowed items.
- Fixed preset application through `computePresetSelection` remains unchanged.

No end-to-end test is required for the design phase. During implementation, a
small browser smoke check is useful to verify the random button uses the active
style and scope toggles.

## Implementation Notes

The implementation should be incremental:

1. Extract the current implicit random behavior into `normal`.
2. Make `pickRandomOutfit` accept an optional profile and scope while preserving
   current defaults.
3. Add UI state for `activeStyleId` and coarse `RandomScope`.
4. Wire the random button through the active profile.
5. Add one style profile only after `normal` is verified.

This sequencing keeps the first behavior-preserving refactor separate from the
style-specific random work.
