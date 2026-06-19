# Remove the redundant Add layer control

## Goal

Remove the bottom-of-sidebar **Add layer** control. Every asset type it can
add is already available through the inline slot list within one of the ten
upstream category sections (Body through Weapons).

## Current behaviour and finding

`StackPanel` derives both the category sections and the `AddLayer` inactive
type list from `shownTypeNames`. `shownTypeNames` is itself built exclusively
from the upstream category groups. Consequently, `AddLayer` cannot expose a
type that is absent from the category sections.

The two paths also use the same body-type compatibility rule. The inline slot
list is the better path: it opens the item picker so the user chooses an
asset, whereas `AddLayer` immediately selects the first compatible item.

## Design

Remove `AddLayer` and its local open/closed state from `StackPanel`. Keep the
per-category slot disclosure as the only way to add an unselected layer.

The category sections remain visible even when empty. For a compatible,
unselected type, its section's **Show N slots** control reveals a `+ <type>`
entry, which opens the existing `TypeItemPicker`. Incompatible types remain
unavailable through both the previous and retained paths.

Remove Add-layer-only translation strings if no other consumer remains.

## Scope and non-goals

This change does not alter category membership, type visibility,
compatibility, search, selection, or attribution. It does not add a new
navigation path or change how an item is selected.

## Verification

- Update component tests so the sidebar no longer renders `Add layer`.
- Preserve coverage that all ten category groups render and that unselected
  slots can be revealed and selected in their respective group.
- Run the affected web tests and the workspace typecheck.
