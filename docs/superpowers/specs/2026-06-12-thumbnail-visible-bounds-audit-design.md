# Thumbnail Visible Bounds Audit Design

## Context

The layer replacement picker currently uses fixed 56-pixel cards containing a
24-by-24 thumbnail. `useItemThumbnail` composes one catalog item, extracts the
first south-facing frame, and scales the entire frame into that canvas.
Localized parts such as hair occupy only a small portion of the frame, so their
visible pixels can be difficult to distinguish.

Before changing card dimensions, we need measured data for the actual composed
content shown by the picker. Counting source PNG files or scanning whole
spritesheets would not represent multi-layer items, path substitutions, or the
representative frame used by the UI.

## Goals

- Measure the non-transparent bounds of every selectable catalog item after
  running the real core composition pipeline.
- Audit all supported combinations of:
  - body type: `male`, `female`, `teen`, `child`, `elderly`, `muscular`, and
    `pregnant`;
  - every declared non-color `variant`;
  - the default recolor only.
- Match the current thumbnail frame selection: prefer `walk`, otherwise use the
  first composed animation, facing `down`, frame zero.
- Report how large the visible content is under the current 24-by-24 thumbnail
  treatment and how much additional scaling could fit with a two-pixel margin.
- Record empty frames, missing assets, and hard composition failures without
  stopping the full audit.

## Non-Goals

- Do not change picker card or thumbnail dimensions in this work.
- Do not implement transparent-bound cropping or thumbnail zooming.
- Do not enumerate every recolor or palette color.
- Do not modify `assets/` or the read-only `upstream/` submodule.
- Do not add a dependency. The existing MIT-licensed `@napi-rs/canvas`
  development dependency is sufficient for Node-side composition and pixel
  inspection.

## Audit Scope

The script loads sorted JSON records from `assets/sheet_definitions` and
`assets/palette_definitions`, then constructs the catalog and palette metadata
with the existing core APIs.

For each non-meta catalog item, it checks each requested body type that the item
supports. Combination expansion follows these rules:

- An item with variants produces one case per declared variant.
- An item without variants produces one case with no explicit variant.
- Recolor is left unset so the normal default palette resolution is used.
- Items that require sibling selections for path replacement receive the same
  synthesized sibling context as the current thumbnail renderer.

The audit measures combinations rather than raw PNG files. One case can compose
multiple foreground and background source layers.

## Composition And Measurement

Each case builds a one-item `Selections` value and calls
`composeSelections` with a Node canvas adapter backed by local
`assets/spritesheets`. It then:

1. Selects `walk` when available, otherwise the first animation returned by the
   composed sheet.
2. Extracts that animation with the existing core helper.
3. Locates the `down`, frame-zero rectangle with the existing animation config
   and frame-rectangle logic.
4. Reads the frame's RGBA pixels.
5. Treats every pixel with alpha greater than zero as visible.
6. Computes the inclusive minimum and maximum visible coordinates and derives
   `boundsX`, `boundsY`, `boundsWidth`, and `boundsHeight`.

The frame size is recorded from animation configuration instead of assuming
64 pixels, even though standard LPC frames are 64 by 64.

## Derived Metrics

For a successful non-empty frame:

- `widthRatio = boundsWidth / frameSize`
- `heightRatio = boundsHeight / frameSize`
- `visibleWidthAt24 = boundsWidth * 24 / frameSize`
- `visibleHeightAt24 = boundsHeight * 24 / frameSize`
- `fitScalePxPerSourcePixel = min(20 / boundsWidth, 20 / boundsHeight)`
- `additionalScaleOverCurrent = fitScalePxPerSourcePixel / (24 / frameSize)`

The 20-pixel fitting area represents a fixed 24-by-24 canvas with a two-pixel
margin on every side. `additionalScaleOverCurrent` answers how much larger the
part could appear compared with today's full-frame scaling while still fitting
inside that margin.

Metrics use unrounded values internally. CSV decimal values are rounded to four
decimal places.

## Outputs

By default, the script writes a timestamp-independent report pair to
`packages/web/.audit-output/thumbnail-visible-bounds/`. Implementation adds
`packages/web/.audit-output/` to `.gitignore`. An optional `--output-dir`
argument overrides the destination:

- `thumbnail-visible-bounds.csv`: one row per audited combination.
- `thumbnail-visible-bounds-summary.md`: human-readable aggregate findings.

The CSV columns are:

- item category/type name and item name;
- body type and variant;
- selected animation, direction, frame index, and frame size;
- status: `ok`, `empty`, or `error`;
- alpha bounds;
- width and height ratios;
- visible width and height at 24 pixels;
- fit scale and additional scale over the current treatment;
- concise error detail when applicable.

The Markdown summary includes:

- total item and combination counts;
- success, empty, and error totals;
- overall minimum, median, P90, P95, and maximum visible dimensions and
  additional-scale values;
- the same aggregates grouped by type name;
- the smallest and largest visible-content cases;
- cases with empty output or errors.

Rows and summary groups are sorted deterministically so repeated runs on the
same asset snapshot produce stable output.

## Error Handling

The core composer intentionally tolerates individual missing image loads. To
distinguish incomplete cases from valid transparent frames, the Node adapter
records failed asset paths for the active case. A case is:

- `ok` when it has visible pixels and no hard failure;
- `empty` when composition completes but the representative frame has no
  visible pixels;
- `error` when catalog expansion, composition, animation extraction, frame
  lookup, or pixel reading fails.

Missing source paths are included in the diagnostic field even when composition
returns a partially visible result. The script continues through all remaining
cases and exits non-zero only for a script-level failure such as an unreadable
catalog or unwritable output directory. Asset-level case failures remain in the
report so the complete distribution is still produced.

## Testing

Unit tests cover the pure alpha-bound scanner and metric calculations with:

- a transparent frame;
- one visible pixel;
- visible pixels touching frame edges;
- a rectangular region with known expected ratios and fit scale.

An integration test uses a small deterministic set of real catalog items to
verify catalog expansion, Node-side composition, animation/frame selection, and
stable report rows. It includes at least one multi-layer item and one item with
multiple non-color variants.

## Success Criteria

- Every selectable item is considered for all requested supported body types.
- Every declared non-color variant is represented exactly once per supported
  body type, with default recolor behavior.
- The audit completes using only local `assets/`.
- CSV rows contain reproducible alpha bounds and current/possible thumbnail
  size metrics.
- The Markdown summary identifies the distribution needed to choose a larger
  fixed card and thumbnail size.
- Unit tests, focused integration tests, and workspace typechecking pass.
