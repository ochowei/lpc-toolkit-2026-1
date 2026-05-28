# Responsive Web UI Design

## Goal

Make the web UI usable on phone-sized screens while preserving the current
desktop layout and behavior. Mobile users should be able to preview the
composed sprite, switch animation controls, edit layers, adjust filters, and
download outputs without horizontal overflow or unusably cramped panels.

## Non-Goals

- Do not change `packages/core/`.
- Do not modify `upstream/`.
- Do not redesign the desktop two-column editor.
- Do not change attribution, download, token, preset, filter, or composition
  behavior beyond responsive layout fixes.
- Do not add a router, backend, global state library, or new dependency.

## Current Context

The current web shell is desktop-first:

- `LayerStackHarness` renders `TopBar`, then a fixed two-column grid:
  `340px StackPanel` and flexible `PreviewPane`.
- `StackPanel` already contains the editor workflow: search, presets, active
  layers, add-layer flow, filters, asset source, and custom overlay settings.
- `PreviewPane` owns animation controls, the sprite canvas, zoom controls, and
  optional full spritesheet preview.
- Popovers are anchored from the top bar and currently use fixed widths that can
  exceed a narrow viewport.

## Chosen Approach

Use a preview-first mobile shell below the desktop breakpoint.

On desktop, keep the existing two-column layout:

```text
TopBar
└── grid: 340px StackPanel | PreviewPane
```

On mobile, use a single main panel with a bottom tab switcher:

```text
TopBar
└── active panel: PreviewPane or StackPanel
Bottom nav: Preview | Layers
```

The default mobile view is `Preview`, because sprite composition needs constant
visual feedback. Users can switch to `Layers` to get the full height for search,
layer rows, filters, and custom overlay settings.

## Responsive Behavior

### Desktop

- `md` and wider keeps the current grid layout.
- `StackPanel` remains visible in a left `340px` sidebar.
- `PreviewPane` remains visible in the main content area.
- No bottom mobile navigation is shown.
- Desktop spacing, toolbar placement, and interaction model are preserved.

### Mobile

- The shell becomes a single-column layout.
- `PreviewPane` is shown by default.
- `StackPanel` is available through a `Layers` tab in a fixed bottom mobile nav.
- Switching tabs does not reset selections, filters, expanded layer, search
  input, full sheet state, or download state.
- The active panel owns the available vertical space and scrolls internally as
  needed.
- The app must not create horizontal body scroll.

### Top Bar

- Keep high-frequency controls available: body type, download, reload, and more.
- On narrow screens, the brand treatment may be shortened by hiding the subtitle.
- Low-frequency controls remain in the existing More menu.
- The top bar may wrap or compress controls, but must not push content outside
  the viewport.

### Preview Pane

- Preserve direction, animation, play/pause, frame status, zoom controls, and
  full sheet toggle.
- The preview action bar may wrap on mobile to prevent overflow.
- The sprite canvas stays centered and constrained by the available panel size.
- Full Sheet remains available on mobile and stacks vertically inside the
  preview panel; constrained areas scroll internally instead of growing the app
  beyond the viewport.

### Stack Panel

- Reuse the existing `StackPanel` instead of creating a separate mobile editor.
- Search, presets, layer rows, add-layer flow, settings, filters, asset source,
  and custom overlay controls remain available.
- The layer list keeps internal scrolling so the bottom nav remains reachable.

### Popovers

- Token, attribution, download, body type, and More popovers must fit inside the
  viewport on mobile.
- Use max width and max height constraints based on `100vw` and `100vh`, with
  internal scrolling where needed.
- Preserve existing popover behavior and actions.

## State

Add local UI state in `LayerStackHarness`:

```ts
type MobileView = 'preview' | 'layers';
```

- Default: `'preview'`.
- Only mobile layout reads this state.
- Desktop renders both panels regardless of `mobileView`.
- Existing selection, filter, attribution, custom overlay, full sheet, and
  download state remains unchanged.

## Component Plan

- Update `LayerStackHarness` to choose either the desktop shell or the mobile
  shell at render time using a small web-only media query hook. Do not mount
  duplicate `PreviewPane` or `StackPanel` instances and hide one with CSS,
  because those components own refs, canvas effects, and scroll state.
- Add a small `MobileBottomNav` component for the `Preview` / `Layers` switcher.
- Adjust `TopBar` responsive classes so the subtitle can hide on narrow screens.
- Adjust `PreviewPane` control bar classes so controls can wrap or compress.
- Add mobile-safe max width and max height classes to popover panels.

The media query hook belongs in `packages/web/` and may use browser APIs. It
does not affect the environment-agnostic rule for `packages/core/`.

## Accessibility

- `MobileBottomNav` uses real buttons.
- The active tab exposes `aria-pressed` or equivalent selected state.
- Controls keep existing accessible names.
- Mobile popovers remain keyboard dismissible through the existing popover
  behavior.

## Testing

Automated and manual checks should verify:

- Mobile viewport opens to Preview.
- Mobile user can switch to Layers and back without losing state.
- Mobile Layers view can scroll layer content and settings.
- Mobile Preview controls do not overflow horizontally.
- Mobile popovers fit within the viewport.
- Desktop viewport still shows the two-column layout with the left sidebar and
  right preview at the same breakpoint and approximate sidebar width.
- Existing web tests continue to pass.

Use a local dev server and browser screenshots for visual verification on at
least one phone-sized viewport and one desktop viewport.

## Success Criteria

- Phone-sized screens can perform the main compose/edit/preview/download flow.
- No horizontal viewport overflow in the top bar, preview controls, stack panel,
  or popovers.
- Desktop layout remains visually and behaviorally unchanged.
- No new dependency is introduced.
- Attribution and download behavior remain intact.
