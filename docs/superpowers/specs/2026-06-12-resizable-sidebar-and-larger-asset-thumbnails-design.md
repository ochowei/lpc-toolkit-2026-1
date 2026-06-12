# Resizable Sidebar and Larger Asset Thumbnails Design

**Date:** 2026-06-12

## Goal

Improve desktop asset selection by making replacement-item thumbnails easier
to recognize and allowing users to choose how much horizontal space the layer
sidebar receives.

## Scope

- Increase replacement-item thumbnails from 24px to 40px.
- Increase replacement-item card minimum width from 56px to 72px so the
  larger thumbnail and label remain comfortable.
- Replace the fixed 340px desktop sidebar with a user-adjustable width.
- Persist the chosen desktop sidebar width across reloads in the same browser.
- Preserve the current mobile layout and behavior.

This change does not affect character selection state, URL hashes, composition,
exports, attribution, or `packages/core`.

## Desktop Layout

The desktop editor uses three horizontal tracks:

1. A left sidebar with an explicit pixel width.
2. A narrow vertical separator.
3. A right preview area that consumes the remaining width.

The sidebar defaults to 400px. User-selected widths are limited to 320-640px.
The rendered width must also respect the current viewport so the preview keeps
at least 320px, excluding the separator. When a saved width is too large for
the available space, the rendered width is temporarily reduced without
overwriting the saved preference.

The separator is not shown in the mobile single-panel layout.

## Separator Interaction

Add a focused desktop separator component that follows the pointer-event model
already used by `PreviewPaneSplitter`.

- Dragging updates the sidebar width continuously.
- Releasing the pointer persists the selected width.
- Double-clicking restores and persists the 400px default.
- Left and right arrow keys adjust the width by 16px.
- `Home` selects 320px.
- `End` selects 640px, subject to the current viewport constraint.
- The separator uses `role="separator"`, vertical orientation semantics, and
  exposes its current, minimum, and maximum values to assistive technology.
- Pointer dragging temporarily applies `ew-resize` and disables text
  selection. Document listeners and temporary body styles are cleaned up after
  pointer release or component unmount.

## Width State and Persistence

`LayerStackHarness` owns the desktop sidebar width because it already chooses
between desktop and mobile layouts.

Width parsing and clamping live in a small environment-independent helper
within `packages/web`. The helper defines:

- default width: 400px
- minimum width: 320px
- maximum width: 640px
- minimum preview width: 320px
- keyboard step: 16px
- validation for persisted values
- viewport-aware calculation of the rendered maximum

Use one versioned `localStorage` key. A missing, non-numeric, non-finite, or
out-of-range stored value falls back to 400px. Storage access failures also
fall back without breaking the editor.

The preference is read and written only for the desktop UI. It is not placed
in the character URL hash. Continuous pointer movement updates React state,
while persistence occurs at the end of the interaction or after a keyboard or
double-click adjustment.

## Asset Cards

In the expanded layer replacement grid:

- Render `ItemThumbnail` at 40px.
- Extend the allowed thumbnail-size type to include 40.
- Change the responsive grid minimum from 56px to 72px.
- Keep item names on one truncated line.
- Keep selection, incompatibility, disabled, and tooltip behavior unchanged.

Thumbnail size remains fixed at 40px as the sidebar grows. Additional sidebar
space increases the number of cards per row rather than scaling individual
images further. The 28px thumbnail in the collapsed active-layer row remains
unchanged.

## Error Handling

- Invalid persisted values use the default width.
- An unavailable or throwing `localStorage` does not block rendering.
- A narrow viewport constrains the rendered sidebar rather than allowing the
  preview to disappear or creating horizontal overflow.
- Separator cleanup restores body cursor and selection styles even if the
  component unmounts during a drag.

## Testing

### Unit Tests

Add focused tests for:

- persisted-width parsing and fallback behavior
- nominal, minimum, and maximum clamping
- viewport-aware maximum width
- pointer-coordinate-to-sidebar-width calculation

Update thumbnail-related tests and types to cover the 40px size.

### Component Tests

Test the separator independently:

- pointer dragging reports clamped widths
- pointer release reports the final value for persistence
- arrow, `Home`, and `End` keyboard controls work
- double-click restores the default
- accessibility attributes reflect the active bounds and value
- listeners and body styles are cleaned up

Verify the replacement grid requests 40px thumbnails and uses the larger card
minimum without changing selection behavior.

### End-to-End Tests

Update desktop responsive-layout coverage to verify:

- the initial sidebar is 400px, within normal browser layout rounding, with no
  saved preference
- dragging changes the sidebar within 320-640px
- the selected width survives a reload
- the preview remains visible at constrained desktop widths

Retain the current mobile checks for single-panel navigation and absence of
horizontal overflow. Mobile must not display the desktop separator.

## Non-Goals

- Resizing the mobile layer or preview views
- Making thumbnail size user-configurable
- Persisting width in the URL
- Changing preview zoom or the existing horizontal preview splitter
- Introducing a split-pane dependency
