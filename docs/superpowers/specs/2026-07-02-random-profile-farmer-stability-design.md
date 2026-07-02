# Farmer Random Profile and Scope Toggle Stability Design

- Date: 2026-07-02
- Scope: `packages/web`
- Status: design approved, pending implementation plan

## Background

The current random profiles branch introduced a separate web-only
`RandomProfile` model, a `normal` profile, and coarse random scope toggles for
appearance, clothing, equipment, and colors.

Two follow-up issues are visible in the web UI:

- Toggling random options such as Appearance, Clothing, Equipment, or Colors can
  intermittently make the UI go black.
- After applying the farmer preset, pressing random can still generate
  fantasy or combat-oriented selections such as wings and armour.

The farmer behavior is expected with the current implementation because
`RANDOM_PROFILES` contains only `normal`. The active `farmer` style id falls
back to `normal`, and `normal` intentionally includes broad groups such as
`fantasy` and clothing.

The checkbox black screen is not expected. Scope checkbox changes should update
only local random UI state. They should not mutate the selected outfit and
should not trigger a render crash.

## Goals

- Add a dedicated farmer random profile.
- Make farmer random generation civilian/farming-only.
- Ensure applying the farmer preset and then pressing random cannot add wings,
  armour, weapons, shields, magic crystals, `fx`, or other unsuitable combat or
  fantasy categories.
- Stabilize the random scope checkbox UI so toggling Appearance, Clothing,
  Equipment, and Colors repeatedly keeps the app mounted and usable.
- Keep the fix surgical and limited to the existing random profile branch
  architecture.

## Non-Goals

- Do not add random profiles for mage, knight, ranger, or noble in this pass.
- Do not redesign the random options UI.
- Do not add slot-level random controls.
- Do not persist random profile or scope settings.
- Do not add new dependencies.
- Do not modify `upstream/`.

## Design Decision

Use the existing `RandomProfile` extension point rather than changing fixed
`Preset` behavior.

Add `FARMER_RANDOM_PROFILE` to `packages/web/src/slice/random-profiles.ts` and
include it in `RANDOM_PROFILES`. After `PresetBar` records `activeStyleId` as
`farmer`, `randomProfileForStyle('farmer')` will return the farmer profile
instead of falling back to `normal`.

The farmer profile should be restrictive. It is a civilian/farming profile, not
a generic low-fantasy profile. It should include body and face/appearance
groups, allow normal civilian clothing and accessories only through curated
item pools, and exclude fantasy, weapons, and `fx`.

The checkbox stability fix should treat random scope toggles as pure UI state.
Toggling a scope should not dispatch selection changes. Tests should exercise
repeated toggles so any render exception or accidental state mutation is caught.

## Farmer Profile

`FARMER_RANDOM_PROFILE` should use:

- `id`: `farmer`
- `labelKey`: reuse or add a random-profile label as needed
- `requiredGroups`: `body`
- `optionalGroups`: `face`, `clothing`, `accessories`
- `excludeGroups`: `fantasy`, `weapons`, `fx`
- `optionalProb`: keep the current normal probability unless tests reveal the
  farmer output is too sparse
- `itemPools`: curated allow-lists for slots that need tighter control

The profile must not rely only on group excludes, because some unsuitable items
live in otherwise useful groups. For example, `armour` is in the clothing
group. The implementation should either omit those type names from the farmer
profile or provide an empty/absent pool so they cannot be selected.

The first farmer profile should favor item pools that already appear in the
fixed farmer preset where possible:

- Civilian body, head, expression, and hair can remain broad unless a specific
  catalog issue is found.
- Clothing should include farmer-safe items such as `Shortsleeve`, `Overalls`,
  `Basic Boots`, and similar civilian/farming entries discovered in the local
  catalog.
- Combat and fantasy slots such as `armour`, `chainmail`, `cape`, `weapon`,
  `weapon_magic_crystal`, `shield`, `quiver`, `horns`, and `wings` must not be
  generated for farmer.

If an allow-listed item is missing from the catalog or incompatible with the
current body type, the existing random helper should skip it without throwing.

## Checkbox Stability

The random options checkboxes live in `PresetBar` and update local
`randomScope` state. The expected behavior is:

- Clicking a checkbox only changes the checkbox state.
- The selected outfit remains unchanged until the random button is pressed.
- The app remains mounted after repeated toggles.
- Scope state remains a complete `RandomScope` object; no key should become
  missing or undefined.

The implementation should first reproduce the black-screen path with a focused
component test or browser smoke test. If the failure is caused by a render
exception, missing translation key, stale event access, or incomplete state
shape, fix that direct cause. Do not mask the issue with broad error swallowing.

## Data Flow

```ts
apply farmer preset
  -> PresetBar records activeStyleId = 'farmer'
  -> user presses random
  -> randomProfileForStyle('farmer') returns FARMER_RANDOM_PROFILE
  -> pickRandomOutfit(profile: farmer, scope, currentSelections)
  -> apply_selections
```

Checkbox toggles follow a separate path:

```ts
click random scope checkbox
  -> setRandomScope(nextCompleteScope)
  -> no selection dispatch
  -> UI re-renders without composition changes
```

## Error Handling

- Unknown profile ids continue to fall back to `normal`.
- Farmer profile item pools with missing names are skipped by existing
  `pickRandomOutfit` logic.
- A farmer profile with no compatible items for an optional slot skips that
  slot.
- Scope toggles should not throw for rapid repeated clicks or any combination
  of true/false values.

## Testing

Unit tests should cover:

- `randomProfileForStyle('farmer')` returns the farmer profile.
- Farmer random output does not include `wings`, `horns`, `armour`,
  `chainmail`, `weapon`, `weapon_magic_crystal`, `shield`, `quiver`, or `fx`
  types when those items exist in the catalog.
- `normal` profile behavior remains unchanged.
- Unknown profile ids still fall back to `normal`.
- Scope preservation still preserves disabled appearance, clothing, and
  equipment selections where intended.

UI or component tests should cover:

- Random scope checkboxes render with their labels.
- Repeatedly toggling Appearance, Clothing, Equipment, and Colors keeps the
  preset bar mounted.
- Toggling checkboxes does not dispatch `apply_selections`.

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx
rtk pnpm --dir packages/web typecheck
```

Run the full web test suite if the focused tests or implementation touch shared
rendering behavior.

## Implementation Notes

The implementation should be split into small commits:

1. Add farmer random profile and focused unit tests.
2. Add/fix checkbox stability coverage and apply the smallest UI fix needed.
3. Update the implementation plan with notes, commit hashes, and verification
   status after each task.

