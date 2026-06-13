# Thumbnail Auto-Framing Design

## Goal

Improve asset identification in web asset-selection thumbnails by enlarging
types whose visible pixels occupy too little of the current frame. The change
affects thumbnails only. Character composition, preview coordinates, sprite
exports, attribution, and `packages/core/` behavior remain unchanged.

## Current Behavior

`useItemThumbnail` composes an isolated item, selects a representative frame,
and scales the complete source frame into the thumbnail canvas. Transparent
space therefore consumes most of the canvas for small assets such as rings,
earrings, eyebrows, charms, and buckles.

The existing thumbnail visible-bounds audit measures the same isolated
composition and representative frame. Its alpha bounds and derived scale
metrics provide a suitable basis for generating framing policy.

## Selected Approach

Generate and commit a type-level thumbnail scale configuration from the audit.
At runtime, each thumbnail uses its type's fixed scale but computes its own
visible bounds to center the rendered pixels.

This is a hybrid framing policy:

- types that need less than `1.5x` additional scale retain current full-frame
  rendering;
- qualifying types use one consistent scale across all body types, variants,
  and recolors;
- each thumbnail is centered from its own visible bounds so differently
  positioned assets remain visible;
- generated scales never exceed `4x`;
- successfully audited cases constrain the type scale so all visible pixels
  fit with a two-pixel destination margin.

The static type scale preserves visual consistency. Runtime bounds affect
centering only and do not produce a different scale for each item.

## Scale Generation

Only audit rows with `status=ok` participate in scale statistics.

For each type:

1. Calculate `targetScale` as the median
   `additionalScaleOverCurrent` across all successful cases.
2. Calculate `safeScale` as the largest common multiplier at which every
   successful case fits inside the smallest supported 20-by-20 thumbnail. Its
   fixed two-pixel margin leaves a 16-by-16 fitting area.
3. Calculate:

   ```text
   candidateScale = min(targetScale, safeScale, 4)
   ```

4. Emit the type only when `candidateScale >= 1.5`; omitted types retain
   current rendering.

The safe limit must cover every successfully audited combination of body type,
variant, and recolor. A large variant therefore limits the scale for its entire
type instead of being cropped. Using the smallest thumbnail size guarantees
the fixed margin for the supported 20, 24, 28, 40, and 56 pixel canvases while
keeping one multiplier per type.

Generated output must be deterministically sorted and must not change when run
twice against identical assets and metadata.

## Alpha Bounds

The default bounds algorithm treats every pixel with alpha greater than zero
as visible, including disconnected or isolated pixels. This is conservative
and prevents intentional details from being discarded.

A small explicit override mechanism may be included for confirmed asset-data
anomalies. Overrides are exceptions, not a heuristic: no connected-component
filtering or automatic noise removal is applied by default. Each override must
identify its scope and reason.

## Generated Configuration

The audit workflow generates a committed TypeScript configuration consumed by
the web package. Each generated entry contains the type name and final scale.
An optional, separately maintained override section may describe confirmed
exceptions.

The generated file must not include per-item bounds. Runtime rendering derives
those bounds from the actual composed thumbnail pixels, so recolors and future
position differences remain correctly centered.

The thumbnail cache key includes a framing-policy version. Regenerating or
changing the policy must invalidate thumbnails produced by the previous
framing behavior.

## Runtime Rendering

`useItemThumbnail` continues to compose and select the source frame using the
existing pipeline.

After selecting the frame:

1. Look up the scale for `typeName`.
2. If no scale is configured, draw the complete frame exactly as today.
3. If a scale is configured, read the frame pixels and calculate alpha bounds.
4. Center the bounds in the destination canvas and draw the source frame using
   the configured type scale.
5. Preserve nearest-neighbor rendering with image smoothing disabled.

The draw calculation must keep the bounds center aligned with the thumbnail
center. The generated safe scale guarantees a two-pixel margin for successful
audit cases at every supported thumbnail size.

## Empty And Error Audit Cases

The audit currently reports 107 errors and 5 empty cases. These rows do not
participate in median or safe-scale calculations because they do not provide
usable bounds.

They still inherit their type's generated scale at runtime:

- when runtime composition succeeds and visible bounds are found, apply the
  type scale and center normally;
- when composition fails, retain the existing error placeholder;
- when composition succeeds but the representative frame has no visible
  pixels, use the existing full-frame result rather than attempting
  auto-framing.

Because unsuccessful audit rows do not constrain `safeScale`, the audit alone
cannot guarantee that those cases will retain a two-pixel margin. They must be
included in targeted visual verification where they can render in the web
runtime.

## Failure Handling

Auto-framing is an enhancement and must not make an otherwise usable thumbnail
fail.

- Missing configuration uses current full-frame rendering.
- Missing 2D context follows the existing thumbnail error behavior.
- Missing runtime bounds falls back to current full-frame rendering.
- Composition failure follows the existing placeholder behavior.
- Invalid generated scales fail generation or tests rather than being silently
  accepted at runtime.

## Components And Boundaries

- `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts` retains bounds
  measurement and gains pure type-scale aggregation and generation support.
- The audit command writes both its diagnostic reports and the committed
  type-scale configuration.
- A focused web utility calculates runtime alpha bounds and framing geometry.
- `useItemThumbnail` orchestrates composition, policy lookup, framing, and
  caching.
- `ItemThumbnail` remains a display component.
- No browser-specific behavior moves into `packages/core/`.

## Testing

Pure unit tests cover:

- median target calculation;
- maximum `4x` scale;
- `1.5x` activation threshold;
- safe-scale restriction from the largest successful case;
- inclusion of all alpha-positive pixels;
- empty images;
- deterministic generated ordering;
- explicit overrides;
- centering and two-pixel margin geometry;
- full-frame fallback when no policy or runtime bounds exist.

Integration-level web tests verify:

- configured types use the generated scale;
- all variants of one type use the same scale;
- runtime bounds change centering but not scale;
- cache keys change with framing-policy version;
- smoothing remains disabled;
- composition errors retain the placeholder behavior.

Verification commands must use `pnpm` through the `rtk` prefix and include the
targeted web tests, web typecheck, and a regenerated audit/config diff check.

## Visual Verification

Compare current and auto-framed thumbnails for representative small, normal,
and oversized types, including:

- `ring`;
- `eyebrows`;
- `charm`;
- `backpack`;
- `weapon`.

Also inspect renderable examples corresponding to audit `empty` or `error`
rows. Acceptance requires:

- small assets are materially easier to identify;
- normal assets are not unnecessarily enlarged;
- successfully audited combinations retain every alpha-positive pixel and the
  two-pixel margin;
- type-level scaling remains visually consistent across variants;
- runtime failures degrade to existing behavior.

## Non-Goals

- Cropping or modifying source asset files.
- Changing LPC layer positions.
- Changing character preview or export framing.
- Per-item or per-variant scale configuration.
- Automatic removal of isolated pixels.
- Fixing missing or invalid asset paths reported by the audit.
