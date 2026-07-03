# Preset-Integrated Random Design

- Date: 2026-07-03
- Scope: `packages/web`
- Status: design approved, pending user review

## Background

The current web random UI exposes a standalone dice button plus global random
scope toggles for appearance, clothing, equipment, and colors. That model is
not a good fit for preset-style random generation. Different preset styles need
different random slots: a farmer should vary civilian/farming parts, while a
knight should vary armor, weapons, shields, and related combat gear.

Recent random-profile work added a web-only `RandomProfile` model and a farmer
profile. This design takes that direction further by integrating random actions
into the preset menu and making preset-specific profiles the source of random
behavior.

## Goals

- Make random output more style-appropriate and less chaotic.
- Make random easier to understand by integrating it with presets.
- Give every current fixed preset a corresponding random profile.
- Remove the standalone random dice button from the preset bar.
- Remove global `Random options` checkboxes from the preset bar.
- Keep the first version simple: no user-facing slot customization UI.
- Avoid new dependencies and do not modify `upstream/`.

## Non-Goals

- Do not build a per-slot random editor in this pass.
- Do not persist random profile settings.
- Do not add user-authored random profiles.
- Do not move random profiles into `packages/core`; this remains web UI logic.
- Do not redesign the full layer stack sidebar.
- Do not add a rogue UI entry unless a rogue preset exists in `PRESETS`.

## Preset Coverage

The implementation should derive UI rows from the existing `PRESETS` array. As
of this design, `PRESETS` contains:

- `farmer`
- `mage`
- `knight`
- `ranger`
- `noble`

Each of these preset ids should resolve to a matching `RandomProfile`. If a
`rogue` preset is added later, it should get a matching `rogue` random profile
in the same pattern.

`normal` should remain in code as the safe fallback and baseline random profile,
but it is no longer exposed through a standalone dice button in the first UI.

## Interaction Design

The preset bar should show:

```text
Presets ▼    Reset ▼
```

The standalone dice button is removed. The global random scope row is also
removed.

Opening `Presets ▼` shows each preset row with two explicit actions:

```text
🌾 Farmer    Apply    Random
🔮 Mage      Apply    Random
⚔️ Knight    Apply    Random
🏹 Ranger    Apply    Random
👑 Noble     Apply    Random
```

`Apply` keeps the current fixed-preset behavior. It applies the preset through
`computePresetSelection`, preserves the existing skipped-item warning behavior,
and closes the menu.

`Random` generates a random character using the row's preset id. For example,
clicking `Random` on the Farmer row uses the `farmer` random profile. It then
dispatches `apply_selections` and closes the menu.

The menu is now the single place for preset-style character creation: fixed
version or style-matched random version.

## Random Profile Model

Keep the existing `RandomProfile` model in `packages/web/src/slice`.

Each preset random profile should define the slots it controls with `typeNames`.
This replaces the old global appearance/clothing/equipment scopes for the first
version.

Profiles can use:

- `typeNames`: exact type names this style may randomize.
- `itemPools`: optional allow-lists by type name for style quality.
- `requiredGroups`: groups that should get an item when compatible art exists.
- `optionalGroups`: groups that may get an item according to `optionalProb`.
- `excludeGroups`: groups that must never appear.
- `optionalProb`: probability for optional slots.
- `labelKey`: generally reuse the matching preset label.

Profile rules are the built-in source of "which parts should randomize" for a
style. The first version intentionally does not expose those slots as UI
checkboxes.

## Profile Intent

The first profile pass should prioritize avoiding obviously wrong output over
maximizing variety.

- `farmer`: civilian/farming body, face, hair, clothes, overalls, and shoes.
  Must not generate weapons, shields, quivers, fantasy parts, armor, chainmail,
  or fx.
- `mage`: mage-like clothes, pants or robe-like lower body where available,
  shoes, cape, hat, staff, and magic crystal. Avoid heavy armor and farmer-only
  workwear.
- `knight`: armor, armor legs, armor shoes, helmet, weapon, shield, arms, and
  gloves. Avoid farmer-only workwear and mage-only magic crystal parts unless
  explicitly curated later.
- `ranger`: leather or outdoors gear, pants, boots, hood or suitable hat, bow,
  and quiver. Avoid heavy plate, mage crystal, and formal/noble-only clothing.
- `noble`: formal clothes, formal pants, shoes, and formal hat. Avoid weapons,
  shields, armor, workwear, and fantasy parts.

These are design constraints, not a requirement to invent catalog items. If a
specific allow-listed item does not exist or is incompatible with the current
body type, the picker should skip that slot without throwing.

## Data Flow

Apply path:

```text
preset
  -> computePresetSelection(...)
  -> dispatch({ type: 'apply_selections', selections })
  -> onApplied(...)
  -> close menu
```

Random path:

```text
preset.id
  -> randomProfileForStyle(preset.id)
  -> pickRandomOutfit({ catalog, palettes, bodyType: state.bodyType, profile })
  -> dispatch({ type: 'apply_selections', selections })
  -> close menu
```

The random path no longer depends on `activeStyleId`, because the row itself
provides the style id. `PresetBar` no longer needs local `activeStyleId` or
`randomScope` state.

Random generation keeps the current `bodyType`. It does not automatically
switch to a preset's configured body type.

Colors are randomized by default through the existing palette-aware selection
behavior. If a future profile needs color-specific constraints, that should be
added as profile data in a separate pass.

## Error Handling

- Unknown profile ids fall back to `normal`.
- Missing profile item names are skipped.
- Type names with no compatible items for the current body type are skipped.
- Incomplete profiles should not throw during random generation.
- Fixed preset skipped-item warnings remain apply-only behavior.

## Testing

Pure random tests should cover:

- Every current preset id resolves to a non-normal profile.
- Unknown ids still fall back to `normal`.
- `normal` preserves existing broad random behavior for non-UI callers/tests.
- Each preset profile only produces allowed `typeNames`.
- Farmer excludes weapons, fantasy, armor, chainmail, shields, quiver, and fx.
- Knight excludes farmer-only workwear and mage-only magic crystal parts.
- Mage excludes heavy armor.
- Ranger excludes heavy plate and formal/noble-only clothing.
- Noble excludes weapons, shields, armor, workwear, and fantasy parts.

Component tests should cover:

- `PresetBar` no longer renders the standalone random dice button.
- `PresetBar` no longer renders global `Random options`.
- The preset menu renders `Apply` and `Random` actions for each preset row.
- Clicking `Apply` dispatches fixed preset selections.
- Clicking `Random` dispatches random selections through the matching preset
  profile.

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/stack-panel.test.tsx
rtk pnpm --dir packages/web typecheck
```

Run broader web tests if the implementation touches shared render behavior
beyond `PresetBar`, `PresetMenuPopover`, and random-profile helpers.

## Implementation Notes

Suggested implementation sequence:

1. Add missing preset random profiles and focused pure tests.
2. Change the preset menu to expose `Apply` and `Random` per row.
3. Remove standalone dice and global random scope state from `PresetBar`.
4. Update component tests for the new menu behavior.
5. Run focused verification and typecheck.

Each plan step should update its plan checkbox, implementation note, commit
hash, and verification status, following the repository workflow extension.
