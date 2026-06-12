# Replacement Card Display Modes Design

**Date:** 2026-06-12

## Goal

Let users choose how item names appear in the replacement-item grid inside an
expanded active layer. The additional layouts give thumbnails more usable
space while preserving a text-forward option.

## Scope

- Add three display modes to the expanded replacement-item grid:
  `stacked`, `overlay`, and `hidden`.
- Add a compact icon-and-text segmented control beside the replacement-grid
  heading.
- Apply one shared mode to every expanded layer.
- Default to `overlay`.
- Persist the selected mode across reloads in the same browser.
- Keep replacement-card dimensions, grid columns, and spacing unchanged when
  switching modes.

This change does not affect collapsed active-layer rows, sidebar search
results, the add-layer picker, character selections, composition, URL hashes,
exports, attribution, or `packages/core`.

## Display Modes

### Stacked

This mode preserves the current visual structure:

- The thumbnail appears above the item name.
- The item name occupies a separate single-line area below the thumbnail.
- Long names remain truncated.

### Overlay

This is the default mode:

- The thumbnail area fills the complete card height.
- The item name appears as a single-line label over the bottom of the
  thumbnail.
- The label uses a dark translucent background with enough contrast for
  readability.
- Long names remain truncated.

### Hidden

This mode maximizes unobstructed thumbnail space:

- The thumbnail area fills the complete card height, identically to the
  `overlay` mode.
- No visible item-name label is rendered over or below the thumbnail.
- The item name remains available through the button's accessible name and
  existing tooltip behavior.

The `overlay` and `hidden` modes differ only in whether the bottom label is
visible. Both use the full card height for the thumbnail.

Establish one explicit shared card height based on the current `stacked` card
footprint. In `overlay` and `hidden`, enlarge the square thumbnail canvas to
use the available inner card height while preserving its aspect ratio. Do not
stretch the rendered sprite.

## Layout and Interaction

The replacement-grid heading becomes a flexible row:

- The translated “Swap {category}” heading appears first.
- A three-option segmented control appears to its right.
- Each option displays an icon and a short translated label:
  “Stacked,” “Overlay,” or “Hidden.”
- The active option has a clear selected style and
  `aria-pressed="true"`.
- Every option is keyboard-focusable.
- On narrow sidebar widths, the heading and control may wrap onto another
  line. Labels remain visible rather than collapsing to icon-only controls.

Changing modes updates all expanded replacement grids immediately. The mode
buttons are separate from replacement-item buttons, so changing the layout
cannot select an item.

All three modes retain the existing replacement-card minimum width, grid
column behavior, gap, selection styling, disabled styling, incompatibility
indicators, and tooltips. They share the newly explicit card height, derived
from the current `stacked` footprint. Switching modes changes only the
thumbnail size within that footprint and the label arrangement.

## State and Persistence

`LayerStackHarness` owns one global replacement-card display mode because it
already coordinates the sidebar and passes shared UI state to `StackPanel`.

The data flow is:

1. `LayerStackHarness` initializes the preference from `localStorage`.
2. `LayerStackHarness` passes the mode and an update callback to `StackPanel`.
3. `StackPanel` forwards them to each `LayerRow`.
4. A segmented-control click updates the harness state and persists the new
   value.
5. Every rendered `LayerRow` receives the same updated mode.

Use a versioned storage key dedicated to this preference. A small pure helper
in `packages/web` defines the `ReplacementCardDisplayMode` type and validates
persisted values. Missing, malformed, or unsupported values return the
`overlay` default.

Storage read or write failures must not block rendering or interaction. A
failed read uses `overlay`; a failed write leaves the in-memory selection
active for the current page session.

This preference is browser-local UI state. It is not part of the character URL
hash or selection reducer.

## Components

### `LayerStackHarness`

- Owns the current replacement-card display mode.
- Reads the initial preference safely.
- Updates React state and persists user changes.

### `StackPanel`

- Accepts the display mode and update callback.
- Passes them unchanged to active `LayerRow` instances.

### `LayerRow`

- Renders the segmented control in the expanded replacement-grid heading.
- Applies mode-specific classes or markup to replacement cards.
- Preserves all existing item-selection, filtering, compatibility, and color
  picker behavior.

### Preference Helper

- Exposes the three allowed values and the `overlay` default.
- Parses unknown persisted input without using browser APIs.
- Keeps validation independently unit-testable.

## Internationalization and Accessibility

Add English and Traditional Chinese translations for the three short mode
labels and any control-level accessible label needed to describe the group.

Each mode button:

- Has visible icon-and-text content.
- Exposes its selected state through `aria-pressed`.
- Has a translated accessible name.
- Retains an obvious keyboard focus style.

Every replacement-item button keeps an accessible name containing the
translated item name in all modes. Hidden mode removes only visible label
text; it must not remove the name from assistive technology or the tooltip.

## Error Handling

- Missing or invalid persisted values fall back to `overlay`.
- Unavailable or throwing `localStorage` falls back without affecting the
  editor.
- Persistence failure does not revert the user's current in-memory choice.
- Long translated labels may wrap the heading/control row, but may not overlap
  the replacement grid.
- Long item names remain single-line and truncated in visible-label modes.

## Testing

### Unit Tests

Add focused tests for:

- All three valid persisted mode values.
- Missing, malformed, and unsupported values falling back to `overlay`.
- The exported default mode.

### Component Tests

Extend `LayerRow` coverage to verify:

- The segmented control renders icon-and-text labels.
- The active mode exposes `aria-pressed="true"`.
- Clicking each mode invokes the update callback without selecting an item.
- `stacked` renders a separate label area.
- `overlay` uses a full-height thumbnail with a bottom translucent label.
- `hidden` uses the same full-height thumbnail arrangement without a visible
  label.
- Card height and grid sizing classes stay identical across modes.
- Full-height modes enlarge the square thumbnail without distorting its aspect
  ratio.
- Item names remain available to accessibility APIs and tooltips in hidden
  mode.
- Existing selected, disabled, and incompatibility states remain intact.

Add harness or focused integration coverage for:

- `overlay` as the initial mode without a saved preference.
- Applying a valid saved preference.
- Persisting a mode change.
- Graceful behavior when storage access throws.
- All active layer rows receiving the same mode.

### Internationalization Tests

Verify the new English and Traditional Chinese keys are present and return the
expected short labels.

## Non-Goals

- Per-layer display-mode preferences
- Different card dimensions or column counts per mode
- User-configurable thumbnail scaling
- Applying these modes to collapsed layer rows, sidebar search, or add-layer
  controls
- Storing the preference in the URL
- Adding a dependency
