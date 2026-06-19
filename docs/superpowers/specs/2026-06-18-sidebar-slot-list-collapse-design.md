# Sidebar Slot List Collapse Design

## Context

The web layer stack sidebar currently uses one `expanded` type state for two
related interactions:

- opening the selected layer row so its replacement/style controls are visible
- keeping the grouped "show/hide N slots" area open when the expanded type is
  inside that group

This coupling makes the "Hide 16 slots" control appear ineffective when a
selected layer in the same group, such as `fins` / "Fin", has its style panel
open. The selected layer should be allowed to stay open while the slot list
below it collapses.

## Goal

Allow the grouped slot list to collapse independently from a selected layer
row's expanded style/replacement panel.

Success criteria:

- A selected layer row can remain expanded.
- The section's "Hide N slots" button hides the lower slot list even when the
  selected expanded type belongs to that section.
- Search and add flows that target an unselected slot still reveal the relevant
  inline picker instead of leaving it hidden inside a collapsed section.

## Proposed Behavior

`expanded` continues to identify the one type whose detail picker is open. This
preserves the current active row behavior and avoids broader interaction
changes.

`expandedSectionId` becomes the source of truth for whether the grouped slot
list is visible. A selected active row no longer forces its section's slot list
open.

When a user explicitly presses a section toggle:

- if the slot list is visible, set `expandedSectionId` to `null`
- if the slot list is hidden, set `expandedSectionId` to that section id
- do not clear `expanded`, so any selected layer row panel can remain open

When code navigates to an unselected type, it should explicitly open the
containing slot section. This covers search result picks and add-layer flows.
Navigation to an already selected type should only set `expanded`; it should not
force the lower slot list open.

## Components

`StackPanel`

- Remove the current derived `sectionHasExpandedType` behavior from
  `sectionOpen`.
- Add a small helper to find the section id for a `TypeName`.
- Add a helper such as `expandType(typeName)` that sets `expanded` and opens
  the containing section only when `state.selections[typeName]` is absent.
- Use the helper for `SidebarSearch.onPicked` and `AddLayer.onAdded`.
- Keep `LayerRow.onToggle` as a direct selected-row expand/collapse action.

`GroupTypeSlotEntries`

- Keep receiving `sectionOpen` and `onToggleSection`.
- No longer depends on active row expansion to decide whether to render the slot
  list.

`LayerRow` and `TypeItemPicker`

- No intended behavior change.

## Data Flow

The sidebar will have two distinct UI states:

- `expanded: TypeName | null` controls the open type detail picker.
- `expandedSectionId: string | null` controls the visible grouped slot list.

These states can overlap. For example, `expanded === "fins"` can keep the Fin
style panel open while `expandedSectionId === null` keeps the lower slot list
hidden.

## Edge Cases

If a body type or filter change removes a type from `shownTypeNames`, the
existing guard that clears invalid `expanded` remains valid. If the currently
open section no longer exists, the implementation should also clear
`expandedSectionId` or allow it to become harmlessly unmatched.

If search selects an already active type, the active row expands but the lower
slot list does not reopen. If search selects an inactive type, its section opens
so the inline picker is visible.

## Testing

Add focused tests around `StackPanel` behavior:

- render a section with at least one active type and additional compatible
  inactive slots
- expand the active type so its picker/style panel is visible
- open and then hide the section slot list
- assert the active type panel remains visible while the lower slot entries are
  absent
- assert navigating to an inactive type through the exposed callback opens the
  containing slot list

Run the existing web test/typecheck command used for this package after
implementation.
