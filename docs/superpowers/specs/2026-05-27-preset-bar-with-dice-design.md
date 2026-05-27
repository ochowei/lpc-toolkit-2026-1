# Preset Bar With Random Dice Design

## Goal

Replace the horizontal preset chip strip at the top of the sidebar with a compact bar that holds the 🎲 random-outfit button next to a single `🎭 預設套裝 ▼` dropdown. The dropdown reveals the six themed presets in a popover. The 🎲 button is removed from the preview-pane toolbar so randomization and presets live together.

## Motivation

The current layout splits two closely related actions across two panels:

- The sidebar dedicates a full row to a wrapped grid of six emoji chips (`🌾 農民 / 🔮 魔法師 / ⚔️ 騎士 / 🏹 遊俠 / 👑 貴族 / 🗡️ 盜賊`). On narrow sidebar widths the chips wrap to two rows.
- The 🎲 random button sits in the preview-pane toolbar, far away from the presets even though both produce a whole-outfit change.

Collapsing the chip strip into a single dropdown and parking the dice next to it removes the wrapping row, declutters the preview toolbar, and makes the relationship between "pick a preset" and "roll a random outfit" visually obvious.

## Design

### Final sidebar top layout

```
┌────────────────────────────────────┐
│ [🎲]  [🎭 預設套裝 ▼]              │  ← single compact row, no uppercase title
└────────────────────────────────────┘
```

- The uppercase `預設套裝 / Presets` micro-title above the chips is removed; the dropdown trigger carries the same label.
- The bar keeps its current vertical position — first row inside the sidebar, directly below `SidebarSearch`, above `StatusToast`.
- 🎲 sits to the left of the dropdown trigger. Both buttons share the same height so the row reads as a unit.

### Preset dropdown

The dropdown trigger opens a popover anchored to the trigger button:

```
[🎲]  [🎭 預設套裝 ▼]
              │
              ├─ 🌾 農民
              ├─ 🔮 魔法師
              ├─ ⚔️ 騎士  ⚠
              ├─ 🏹 遊俠
              ├─ 👑 貴族
              └─ 🗡️ 盜賊
```

- Each row shows `emoji + 譯名` and, when the preset would skip at least one slot under the current body type, a trailing red `⚠` marker with the existing `preset.skipPreview` tooltip (`會略過 N 項`).
- Clicking a row dispatches the same `apply_selections` payload the chips currently dispatch, fires the existing `onApplied(name, skippedCount, skippedTypes)` callback (which feeds `StatusToast`), and closes the popover.
- Built-in dismissal: `Esc`, click outside, and clicking the trigger again — all handled by the shared `usePopover` hook used by the other sidebar popovers.

### Random dice

- 🎲 is a plain icon button (no dropdown) directly to the left of the preset dropdown.
- Clicking it dispatches `apply_selections` with the result of `pickRandomOutfit({ catalog, bodyType: state.bodyType })`, matching the current preview-pane behavior exactly.
- No status toast on randomize (consistent with current behavior).
- Tooltip uses the existing `randomize.title` key.

### Component-level changes

1. **New file**: `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`
   - Follows the panel pattern of `reset-menu-popover.tsx`: uses `usePopover(open, close, externalAnchorRef)`.
   - Receives `catalog`, `state`, `dispatch`, `t`, `onApplied`, plus the standard `open / setOpen / anchorRef` trio.
   - Renders the six preset rows; computes `willSkip` via `computePresetSelection` (same call the chips use today).

2. **Rename**: `packages/web/src/components/layer-stack/preset-chips.tsx` → `preset-bar.tsx`, exporting `PresetBar` instead of `PresetChips`.
   - Holds the 🎲 button and the preset dropdown trigger button.
   - Owns the popover open state and the trigger `anchorRef`; mounts `PresetMenuPopover` with `anchorRef`.
   - Inherits all of `PresetChips`'s current props (`catalog, state, dispatch, t, onApplied`) unchanged.

3. **`preview-pane.tsx`**: remove the inline 🎲 button (currently lines 144–154) and the now-unused `pickRandomOutfit` import.

4. **`stack-panel.tsx`**: replace the `PresetChips` import/usage with `PresetBar`. Props passed through stay identical.

### Interaction rules

- Only one sidebar popover is open at a time in practice (existing convention — each popover closes when document `mousedown` lands outside its panel and trigger).
- Pressing 🎲 while the preset dropdown is open: the dropdown closes (outside click), then the random outfit is applied. This is acceptable and matches the existing outside-click semantics; no special coordination needed.
- The 🎲 button does not gain a `⚠` indicator — randomization never "skips" a slot the way presets can, because `pickRandomOutfit` already filters by body-type compatibility.

## Out of scope

- Changing the preset data, the random-outfit algorithm, or `computePresetSelection`.
- i18n string changes — all four keys (`preset.title`, `preset.farmer..rogue`, `preset.skipPreview`, `randomize.title`) are reused as-is.
- Keyboard navigation inside the popover (arrow keys / enter to apply). The existing popovers in this codebase are mouse-driven; matching that bar.
- Mobile/narrow-viewport responsive behavior — same desktop-only assumption as the rest of the sidebar.
- Moving any other preview-pane toolbar item. Only the 🎲 is relocated.

## Testing

- Manual verification in the dev server (the project has no React component test setup):
  - The sidebar top row shows `[🎲] [🎭 預設套裝 ▼]` with no wrapped chip grid.
  - Clicking the preset trigger opens the popover; clicking outside, pressing `Esc`, or clicking the trigger again closes it.
  - Selecting each of the six presets applies the same outfit as before and surfaces the same `StatusToast` line.
  - For at least one body type (`teen` or `child`) where a preset has skipped slots, the `⚠` marker appears on the affected row with the correct `會略過 N 項` tooltip.
  - Clicking 🎲 applies a random outfit and does not surface a toast.
  - The preview-pane toolbar no longer shows 🎲, and the rest of that toolbar still works.
- No new unit tests required; the preserved helpers (`computePresetSelection`, `pickRandomOutfit`, `apply_selections`) are already covered by existing tests.

## Implementation plan

See `docs/superpowers/plans/2026-05-27-preset-bar-with-dice.md` (to be written next).
