# Inline Group Asset Picker Design

## Summary

The layer stack currently shows selected layers grouped by upstream category, while adding a new inactive layer happens through the `AddLayer` control at the bottom of the scroll area. This makes users scroll away from the group they are thinking about before they can add a related asset.

Add an inline entry area inside each upstream group. The entry area lists the group's type slots in place:

- Unselected type slots show as add entries, for example `+ Clothes`.
- Selected type slots show as replace entries, for example `Clothes: Long Sleeve - Replace`.
- Clicking either kind of entry opens an item picker for that type in the same group area.

This keeps add and replace workflows local to the group, while preserving the existing selected layer rows.

## Goals

- Let users start adding a new asset from the relevant selected-layer group without scrolling to the bottom.
- Make selected slots visible in the same entry area, so a chosen asset does not make its type appear to vanish from the group.
- Use the same item picking behavior for add and replace: body type compatibility, license warnings, animation warnings, thumbnails, display mode, custom animation switching, and selection actions.
- Keep the existing active `LayerRow` behavior available for users who already know to expand a selected row.

## Non-Goals

- Do not change the catalog model or selection reducer semantics.
- Do not add new dependencies.
- Do not modify `upstream/`.
- Do not change attribution generation or export behavior.
- Do not remove the existing bottom `AddLayer` control in this change unless implementation reveals it is redundant and the user explicitly approves removal.

## Current Context

`StackPanel` builds upstream groups with `buildUpstreamCategoryGroups(catalog, shownTypeNames)`. It renders active selections per group with `LayerRow`, then renders `AddLayer` at the bottom using the inactive type names.

`LayerRow` already contains the most complete item picker for a type:

- It lists all catalog items for a `typeName`.
- It blocks incompatible body types.
- It marks license and animation filter mismatches.
- It renders `ItemThumbnail`.
- It respects `replacementCardDisplayMode`.
- It dispatches `pickActionForItem`.
- It applies a selected item's `custom_animation`.
- It shows `ColorPicker` for the current selected item.

The implementation should reuse or extract this picker rather than creating a second independent item-selection surface.

## User Experience

Each upstream group renders in this order:

1. Group label.
2. Selected `LayerRow` entries, if any.
3. Inline type-slot entries for that group.

Inline type-slot entries are compact and grouped together. They include every shown type name in that upstream group:

- If a type is not selected, the entry label is `+ {category}`.
- If a type is selected, the entry label is `{category}: {item} - Replace`.
- If a type has no body-compatible items, the entry is disabled and uses the existing incompatible-body tooltip text where practical.

Clicking an unselected entry opens the item picker for that type without selecting an item yet. The first click only exposes choices. The user chooses a specific asset from the picker.

Clicking a selected entry opens the same picker for that type, with the current asset marked selected. Choosing another asset replaces the current selection. Choosing the already selected asset keeps current toggle semantics only if the existing shared picker preserves them; otherwise it can be treated as a no-op to avoid accidental clearing from a replace surface.

After a user picks an asset:

- Dispatch the same selection action used by existing item pickers.
- Dispatch `set_anim` when the chosen item declares a custom animation, matching current behavior.
- Keep that type expanded so color/style controls remain reachable.
- The entry changes from add state to replace state because the type is now selected.

## Component Design

Introduce a small shared picker component if needed, tentatively `TypeItemPicker`, owned under `packages/web/src/components/layer-stack/`.

Responsibilities:

- Receive `typeName`, catalog, palettes, state, dispatch, filters, translator objects, and replacement-card display mode props.
- Render the item grid currently embedded in `LayerRow`.
- Apply body type, license, and animation compatibility presentation.
- Dispatch item selection and optional custom animation changes.
- Optionally render `ColorPicker` when the type is currently selected.

`LayerRow` should call the shared picker when expanded. The new inline group entry area should call the same picker when a type entry is expanded.

`StackPanel` should own one expanded type state for the group picker surface. It already receives `expanded` and `setExpanded` for selected rows; the implementation can reuse that type-level state so only one type picker is open at a time. For an unselected type, `expanded === typeName` means the inline picker is open. Once an item is picked and the type becomes selected, the normal `LayerRow` can render expanded for the same type.

## Data Flow

- `StackPanel` computes active and inactive type names from `shownTypeNames` and `state.selections`.
- For each upstream group, it renders selected rows from the active subset.
- For each group's full `typeNames`, it renders an inline entry representing selected or unselected state.
- Entry click calls `setExpanded(typeName)`.
- Picker item click dispatches `pickActionForItem(typeName, item)`.
- Picker item click also dispatches `set_anim` for custom animation items.

No reducer changes are expected.

## Error Handling and Edge Cases

- If body type changes and `expanded` points to a type that is no longer shown or no longer selectable, keep the existing cleanup behavior and extend it to inline picker types if needed.
- If a selected item is missing from the catalog, the selected row already handles a fallback label. The inline replace entry should also fall back to `selection.name`.
- If a group has no shown type names, it should not render inline entries.
- If every item for a type is incompatible with the selected body type, the entry should be disabled or the picker should show disabled choices consistently with current `LayerRow` behavior.

## Testing

Add focused tests around `StackPanel` rendering:

- Groups render inline entries for both selected and unselected type slots.
- A selected slot appears as a replace entry with the current item name.
- An unselected slot appears as an add entry.
- Empty groups still remain visible, now with their available add entries instead of only `No layer selected` when they have shown types.

If the item grid is extracted, add a focused component test or update existing `LayerRow` tests to verify the shared picker still renders replacement cards and display mode labels.

## Verification

Implementation verification should include:

- `rtk pnpm --filter @lpc-toolkit/web test -- stack-panel`
- A broader relevant web test command if shared picker extraction touches `LayerRow`.
- Manual browser check that adding and replacing can both be started from the same group area.
