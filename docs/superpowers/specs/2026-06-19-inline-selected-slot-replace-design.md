# Inline Selected Slot Replace Design

## Context

The sidebar currently uses one `expanded` type state for both selected layer
rows and lower slot-list entries. When a selected slot entry such as
`head: Human Male - Replace` is clicked, `expanded` becomes `head`. Because
`head` already has a selected layer row, the replacement picker appears in the
upper selected row instead of under the clicked slot entry.

That makes the lower `Replace` control feel like it jumps the user to another
surface. The slot entry should behave as a local replacement entry while still
remaining visibly active.

## Goal

Clicking a selected slot-list `Replace` entry opens the replacement picker
directly under that entry, and the clicked entry remains highlighted while the
picker is open.

Success criteria:

- A selected slot entry can open `TypeItemPicker` inline under itself.
- The clicked slot entry remains visually highlighted and expanded.
- The upper selected `LayerRow` does not automatically expand when the lower
  slot entry is clicked.
- The existing upper selected row expansion behavior still works when the row
  itself is clicked.

## Non-Goals

- Do not change catalog, selection reducer, credit, or export behavior.
- Do not add dependencies.
- Do not modify `upstream/`.
- Do not remove the existing selected layer rows.
- Do not redesign replacement card display modes.

## Proposed Behavior

Introduce a slot-entry-specific expansion state in `StackPanel` named
`expandedSlotType: TypeName | null`.

The existing `expanded: TypeName | null` continues to control selected
`LayerRow` detail panels. The new `expandedSlotType` controls the lower
slot-list detail panel.

When a user clicks a lower slot entry:

- if the slot is already open, close `expandedSlotType`
- otherwise set `expandedSlotType` to that `typeName`
- if the upper selected row for the same `typeName` is open, close `expanded`
  for that type
- keep the containing slot section open

When a user clicks an upper selected `LayerRow`:

- keep the existing row expand/collapse behavior
- if the lower slot picker for the same `typeName` is open, close
  `expandedSlotType`

This prevents the same type from showing two replacement pickers at once while
keeping the row and slot surfaces independent.

## Components

### `StackPanel`

Own `expandedSlotType` with `useState<TypeName | null>(null)`.

Pass `expandedSlotType` and a slot toggle callback to
`GroupTypeSlotEntries`. The callback should coordinate with the existing
`expanded` state only for the same type, so opening a lower `head` picker closes
an upper `head` row picker.

Update `LayerRow.onToggle` so toggling an upper row closes
`expandedSlotType` only when it matches that same row type.

Keep `expandType` behavior for search and add-layer navigation, but direct
navigation to an unselected type should open the lower slot picker by setting
`expandedSlotType`. Direct navigation to a selected type should continue to
open the selected row with `expanded`.

### `GroupTypeSlotEntries`

Use `expandedSlotType === typeName` to decide whether each lower slot entry is
highlighted and expanded.

Render `TypeItemPicker` directly under the slot entry whenever that slot entry
is expanded, regardless of whether the type is already selected. This changes
the selected-slot case from row-based replacement to local inline replacement.

Continue to reuse `TypeItemPicker`, so replacement selection, body-type
compatibility, license warnings, animation warnings, thumbnails, display mode,
custom animation switching, and color/style controls stay consistent.

### `LayerRow` and `TypeItemPicker`

No intended direct behavior change. `LayerRow` remains the selected-layer
detail surface. `TypeItemPicker` remains the shared item picker.

## Data Flow

- `expanded` controls selected layer row detail panels.
- `expandedSlotType` controls lower slot-list detail panels.
- `sectionOpen` continues to control whether a group's lower slot list is
  visible.
- Slot entry clicks call the slot toggle callback.
- Row clicks call the row toggle callback.
- Picker item clicks continue to dispatch `pickActionForItem(typeName, item)`
  and optional `set_anim` through the existing `TypeItemPicker`.

After a user picks a replacement from the lower slot picker, leave
`expandedSlotType` open. The label updates to the newly selected item and the
same slot entry remains highlighted, with color/style controls still reachable
under the entry.

## Edge Cases

If a body-type change removes the currently expanded slot type from
`shownTypeNames`, clear `expandedSlotType`, matching the existing cleanup for
`expanded`.

If a selected item is missing from the catalog, keep the existing fallback
label behavior in the slot entry and allow the inline picker to render catalog
items for that type when available.

If a slot section is collapsed while `expandedSlotType` points inside it, the
state can remain set but hidden. Reopening the section may show the same slot
picker again. This mirrors normal disclosure behavior and avoids surprising
loss of context.

## Testing

Add focused tests around `StackPanel` and `GroupTypeSlotEntries`:

- Clicking a selected slot entry renders `TypeItemPicker` inline under that
  entry.
- The selected slot entry remains highlighted with `aria-expanded="true"`.
- The upper selected `LayerRow` does not expand from a lower slot entry click.
- Clicking the upper selected row still opens the row picker.
- Opening the upper row for a type closes that type's lower slot picker.
- Opening the lower slot picker for a type closes that type's upper row picker.
- Navigating to an unselected type through search/add opens the containing
  section and the lower slot picker.

## Verification

Run focused web tests after implementation:

- `rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries stack-panel sidebar-slot-section`
- `rtk pnpm --filter @lpc-toolkit/web typecheck`

Manual check:

- Select Head assets, open the Head section slot list, click
  `head: Human Male - Replace`, and verify the picker opens under that clicked
  entry while the clicked entry stays highlighted.
