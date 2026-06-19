# Incompatible Asset Thumbnail Design

## Goal

Keep assets that do not support the selected body type disabled, while showing
their thumbnails in the sidebar search. On hover or keyboard focus, explain
why the asset cannot be selected.

## Scope

- Applies to sidebar search result rows.
- Does not change selection eligibility, composition, license filtering,
  animation filtering, attribution, or assets.
- Does not modify `upstream/` or `packages/core/`.

## Design

### Thumbnail body type

Each result keeps its existing `supports` value, computed against the active
body type. The thumbnail renderer receives a separately resolved preview body
type:

1. Use the active body type when the item supports it.
2. Otherwise, select the first body type for which the item's primary layer
   defines a spritesheet path.
3. If no body type is available, retain the existing empty thumbnail
   placeholder.

The resolved preview body type is passed to the existing thumbnail rendering
pipeline. It must also participate in the thumbnail cache key so an asset
rendered for different body types cannot reuse the wrong canvas.

This gives an incompatible item (for example, Tanktop while a male body is
selected) a useful visual preview without making it selectable.

### Incompatibility explanation

The disabled result button is wrapped in an interactive tooltip trigger so
the message works reliably despite the button itself being disabled. The
tooltip is available on pointer hover and keyboard focus.

For a body-type mismatch, the text identifies the active body type, such as
"Not available for current body type: male". The row remains visibly disabled
and its click and keyboard selection behavior remains blocked. License and
animation filter indicators keep their existing behavior; this change does
not treat them as selection blockers.

## Edge cases

- An item with no primary-layer path for any known body type gets the existing
  grey placeholder and remains disabled.
- A thumbnail composition failure preserves the existing placeholder/error
  behavior.
- The fallback preview body type is display-only; it is never written into
  character state or selection tokens.

## Verification

- Unit tests cover active-body previews, fallback-body previews, and cache-key
  separation for differing preview body types.
- Component tests cover an incompatible result with a thumbnail, a disabled
  control, and an accessible concrete incompatibility explanation.
- Run the web package typecheck and the focused thumbnail/sidebar tests.
