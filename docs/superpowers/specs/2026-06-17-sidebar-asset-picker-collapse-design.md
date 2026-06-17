# Sidebar Asset Picker Collapse Design

## Summary

The left layer sidebar currently shows every available type slot chip inside each
upstream group. This makes the selectable asset area tall, especially in groups
like Body and Head, and the current typography and section separation make the
sidebar harder to scan.

This design keeps selected layers visible while collapsing only the available
slot chip area per group. It improves density without hiding the user's current
character composition.

## Goals

- Reduce the vertical space used by available slot chips in the left sidebar.
- Keep selected layer rows visible at all times.
- Make Body, Head, Hair, and other upstream group boundaries visually clearer.
- Increase small sidebar text enough to improve readability without changing the
  overall application layout.
- Preserve the existing add/replace workflow and picker behavior.

## Non-Goals

- Replacing the left sidebar navigation model with tabs.
- Collapsing selected layer rows.
- Changing catalog grouping logic.
- Changing attribution, export, canvas rendering, or core package behavior.
- Adding dependencies.

## Chosen Approach

Use group-level collapsing for available slots only:

- Each upstream group remains visible in the layer stack.
- Selected layer rows in that group remain visible.
- The currently long list of type slot chips is replaced by a compact
  show/hide control when collapsed.
- Opening one group's available slots closes the previously opened group's slots.
- When the user is actively working with a type slot, that slot's group opens
  automatically.

This approach is less disruptive than full section collapsing and avoids the
visibility cost of section tabs.

## User Experience

### Default State

Available slot chips are collapsed by default. Each group shows:

- A clearer group header, such as Body, Head, or Hair.
- Any selected layer rows for that group.
- A compact control showing the number of available compatible slots, for
  example `Show 9 available slots`.

### Expanding Slots

Clicking the group control expands that group's available slot chips. Only one
group's slot chips are open at a time.

Clicking the control again collapses the group unless an active type picker in
that group still needs to remain visible.

### Working With a Type

The existing `expanded: TypeName | null` state continues to identify the active
type slot picker.

When `expanded` points to a type inside a group, that group is treated as open.
This covers flows such as:

- The user clicks a slot chip.
- Search picks a type and opens its picker.
- A newly added type is expanded after selection.

The selected layer rows remain visible regardless of the available slot collapse
state.

## Visual Design

Group boundaries should be more obvious than the current thin section divider.
The implementation should use the existing dark/light design tokens and Tailwind
utilities. Suitable options include:

- A stronger group header row with `bg-surface` or `bg-surface-2`.
- Slightly stronger border treatment between groups.
- More consistent vertical spacing before and after group headers.

Typography changes:

- Group labels increase from roughly `10px` to roughly `12px`.
- Available slot chips increase from roughly `11px` to roughly `12px`.
- Slot chip padding increases slightly for readability.
- Existing compact picker cards should remain compact; thumbnail card layout is
  not part of this change.

## Component Design

### `StackPanel`

`StackPanel` keeps ownership of sidebar-level state.

Add group-level state:

```ts
const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
```

When rendering sections, derive whether the currently active `expanded` type
belongs to that section. A section is open when either:

- `expandedSectionId === section.id`, or
- `expanded` is included in `section.typeNames`.

This keeps type picker state and group slot visibility synchronized without
changing the meaning of `expanded`.

### `GroupTypeSlotEntries`

`GroupTypeSlotEntries` becomes responsible for:

- Rendering the compact show/hide control.
- Rendering slot chips only when the group is open.
- Calling `setExpandedSectionId` when the group control is toggled.
- Continuing to call `setExpanded(typeName)` when a slot chip is clicked.

The component should receive:

- `sectionId`
- `sectionOpen`
- `onToggleSection`
- existing type, catalog, state, and picker props

The component should not own catalog grouping logic.

### `LayerRow` and `TypeItemPicker`

No behavior changes are planned. `TypeItemPicker` continues to render when
`expanded` is a type in the current group and that type is not selected. Existing
replacement picker and color picker behavior should remain intact.

## Data Flow

1. `StackPanel` builds upstream category groups.
2. For each group, `StackPanel` derives selected type names and group open
   state.
3. `LayerRow` renders selected layers as before.
4. `GroupTypeSlotEntries` renders a compact collapsed control or the expanded
   slot chips for the group.
5. Clicking a slot chip sets `expanded` to that `TypeName`, which makes the
   containing group open.
6. Selecting an item dispatches the existing `pickActionForItem` action.

## Edge Cases

- If a body type change removes a type from `shownTypeNames`, the existing
  `expanded` cleanup in `StackPanel` still clears stale type state.
- If `expandedSectionId` points to a section that no longer exists after filter
  or body type changes, no section should open from that stale id. This can be
  handled by deriving open state only while rendering existing sections.
- Groups with no compatible available slots should keep their current disabled
  slot behavior and should not imply that unavailable body-type choices are
  selectable.
- Existing license and animation incompatibility indicators remain controlled by
  the current picker logic.

## Testing And Verification

Run:

```sh
pnpm typecheck
```

If a suitable existing component or browser test surface exists, add focused
coverage for:

- Available slot chips are collapsed by default.
- Opening one group closes the previous group's slot chips.
- Setting an active type expands that type's group.
- Selected layer rows remain visible while slots are collapsed.

Manual verification should cover:

- Body and Head groups are visually distinct.
- Slot chips and section labels are easier to read.
- Search/add flows still open the correct type picker.
- Replacement picker display modes still work.
- Dark and light themes remain legible.

## Implementation Notes

- Keep changes scoped to the web layer stack components.
- Do not modify `upstream/`.
- Do not add dependencies.
- Do not change core package APIs.
- Preserve GPL attribution behavior; this change is UI-only and must not bypass
  existing credit metadata flows.
