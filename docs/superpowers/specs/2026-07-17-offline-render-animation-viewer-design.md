# Offline Render Animation Viewer Design

**Date:** 2026-07-17

## Summary

Add a standalone offline animation viewer to every CLI render. The generated
`<name>.viewer.html` plays every standard and custom animation directly from
the existing master spritesheet, shows synchronized directions, and exposes
complete render and attribution information in a collapsible details area.
The viewer works when opened directly through `file://` and is included in ZIP
bundles when requested.

## Context

The LPC Toolkit Codex plugin can create, preview, validate, and render
characters through `@lpc-toolkit/cli`. A final render currently publishes a
master spritesheet, metadata, TXT and CSV credits, optional animation or frame
PNGs, and an optional ZIP. The pixels are complete, but the rendered output has
no browser artifact that presents the spritesheet as animation.

The Web editor already proves the animation playback behavior, while Core owns
the standard animation registry, custom animation regions, frame sizes,
directions, and frame cycles. The viewer must reuse those rules rather than
introduce a second LPC layout model in the CLI or generated JavaScript.

## Goals

- Generate an offline viewer for every character and preset render.
- Play every standard and custom animation present in the composed sheet.
- Show synchronized four-direction playback when the animation has four
  directions and a truthful single-stage presentation for one-direction
  animations.
- Support direct double-click opening without a server, network, CDN, or
  browser `fetch` request.
- Include complete metadata and attribution information in the viewer.
- Preserve existing render, animation, frame, ZIP, and attribution semantics.
- Preserve transactional output publication.

## Non-Goals

- Do not add a long-running viewer server or a new `character view` command.
- Do not require all animations to be emitted as separate PNG files.
- Do not change the meaning of `--animation`, `--frames`, or `--allow-partial`.
- Do not add editing, catalog search, equipment changes, or selection-file
  import to the generated viewer.
- Do not make the viewer depend on the CLI asset cache after rendering.
- Do not add a dependency or modify `upstream/`.

## Considered Approaches

### 1. Master sheet with embedded playback manifest (selected)

Generate one HTML artifact that references the existing sibling master sheet.
Embed CSS, JavaScript, the playback manifest, a portable render summary, and
complete TXT credits into the HTML. This keeps the output compact, works under
`file://`, and preserves the current opt-in behavior for separate animation
PNGs.

### 2. Emit every animation as a separate PNG

The viewer could play from `animations/*.png`, but every render would gain many
files and `--animation` would no longer be the operation that selects those
extra outputs. This is rejected.

### 3. Start a local viewer server

A server could read metadata and credit files dynamically, but it would prevent
the requested double-click and shareable offline workflow. It would also
overlap with the separate `lpc-toolkit web` command. This is rejected.

## Output Contract

Every successful render adds this sibling artifact:

```text
<out>/
  <name>.sheet.png
  <name>.viewer.html
  <name>.metadata.json
  <name>.credits.txt
  <name>.credits.csv
```

When `--bundle zip` is present, the ZIP includes `<name>.viewer.html` alongside
the sheet, metadata, credits, and any explicitly requested animation or frame
outputs. Extracting the ZIP and double-clicking the viewer is the documented
workflow.

The render result and metadata artifact list add an artifact with type
`viewer`. `lpc-toolkit.render-metadata.v1` remains the schema identifier because
the artifact addition is an additive extension and existing fields retain their
meaning. The playback manifest is private to the generated viewer and does not
become a second public JSON schema.

Viewer generation participates in the existing preflight, staging, backup,
publication, and rollback flow. A render never reports success or leaves a
new partial artifact set when HTML generation or publication fails.

## Architecture

### Core playback description

Core owns an environment-independent helper and types that describe how to play
animations from a composed master sheet. For each available animation, the
description provides the minimum browser-neutral data needed by a renderer:

- logical animation name;
- frame size;
- source X and Y origin in the master sheet;
- source columns or explicit frame cycle;
- one or four direction rows;
- direction ordering;
- frame count.

Standard descriptions derive from `ANIMATION_CONFIGS`, `FRAME_SIZE`, and the
existing direction ordering. Custom descriptions derive from the actual
`ComposedSheet.customAnimations` regions, including `offsetY`, `frameSize`,
rows, and columns. Sequential custom frames follow the existing Web player and
Core extraction behavior.

The helper accepts composed domain data and returns plain immutable values. It
imports no Node, DOM, React, CLI, concrete canvas, or Web implementation.

### CLI viewer generation

CLI owns a focused viewer generator that receives:

- the safe render base name and sibling sheet filename;
- the Core playback descriptions;
- render identity, dimensions, effective license, warnings, and portable source
  identity such as runtime source, description, and release tag;
- the complete rendered Credits TXT content;
- relative filenames for the metadata and credit artifacts.

It returns a complete HTML string. `renderSelection()` publishes that string as
another staged artifact. The viewer generator does not load assets, inspect the
catalog, or compose pixels.

The HTML references only the sibling `<name>.sheet.png`. A portable metadata
summary and full TXT credits are embedded so the page does not need to read
local JSON or text files, which browsers commonly block for `file://` pages.
Absolute artifact paths and local definition roots from the machine-oriented
metadata file are not copied into the HTML. Links to the sheet, complete
metadata, TXT credits, and CSV credits remain relative and work in a normal
extracted directory.

### Generated browser runtime

The generated runtime uses native HTML, CSS, Canvas, and JavaScript. It loads
the sibling sheet with an `Image`, selects source rectangles from the embedded
manifest, and draws frames with image smoothing disabled. It contains no
external script, module import, network request, `fetch`, storage dependency,
or generated code execution.

Embedded strings and JSON are serialized so author names, paths, warnings, or
selection values cannot terminate a script element or become executable markup.
The browser inserts user-derived text with `textContent`, not `innerHTML`.

## Viewer Interface

### Playback area

The selected layout is a synchronized direction grid:

- a header shows the rendered character name and animation selector;
- the selector lists every standard and custom animation in manifest order;
- four-direction animations render North, West, South, and East in a responsive
  2-by-2 grid;
- narrow viewports reflow the grid to one column;
- one-direction animations render one centered stage labeled `Single
  direction` instead of duplicating the same pixels four times;
- pixel rendering stays crisp at integer display scales.

Controls provide play or pause, previous frame, next frame, a frame scrubber,
and `current / total · 8 FPS` status. Playback starts automatically unless the
browser reports `prefers-reduced-motion: reduce`, in which case the initial
state is paused. Manual controls always remain available.

### Collapsible information area

A compact summary below the player is always visible and shows:

- master sheet dimensions;
- standard and custom animation counts;
- effective license.

The full area is collapsed initially. Expanding it shows:

- a master spritesheet thumbnail and link to the original PNG;
- animation frame, direction, frame-size, and layout information;
- CLI version, render metadata schema, portable source identity, and warnings;
- the complete Credits TXT content in a readable preformatted region;
- relative links to Credits TXT, Credits CSV, metadata JSON, and the sheet.

The panel can be collapsed again without affecting playback.

## Data Flow

```text
Selection JSON
  -> CLI validation and composition
  -> ComposedSheet + mandatory CreditManifest
  -> Core playback descriptions
  -> CLI render metadata + TXT/CSV credits + viewer HTML
  -> transactional publication
  -> optional ZIP containing the same relative artifact set
  -> browser loads sibling sheet and draws manifest-selected frames
```

The viewer never recomputes selection compatibility, catalog resolution,
composition, recoloring, or attribution.

## Errors And Edge Cases

- If viewer generation fails, the complete render transaction fails and prior
  outputs are restored.
- If the HTML is later separated from its sheet, the page displays an explicit
  missing-spritesheet message with the expected filename instead of leaving
  blank canvases.
- A one-direction animation exposes one stage and valid frame controls.
- A custom animation uses its actual frame size and region, including a master
  sheet wider than the standard 832 pixels.
- Empty warnings render as a clear `None` state rather than an empty error area.
- `--allow-partial` behavior remains unchanged; when explicitly used, viewer
  information presents the returned warnings and skipped-layer metadata.
- Viewer links use encoded relative filenames and do not expose absolute
  filesystem paths.

## Testing

### Core

Add focused tests for:

- standard animation source coordinates, frame cycles, and direction order;
- custom animation offsets, frame size, sequential frames, and direction rows;
- one-direction descriptions;
- custom regions that make the master sheet wider than the standard sheet;
- deterministic manifest ordering.

### CLI

Add focused render and response tests for:

- every render publishing a viewer artifact;
- human and JSON results listing the viewer;
- metadata listing the viewer without changing existing field meanings;
- ZIP bundles containing the viewer and usable relative paths;
- safe serialization of markup-like selection, warning, and credit text;
- viewer generation or publication failure rolling back the transaction;
- preset and character render paths both receiving the viewer through the
  shared render workflow.

### Browser and package verification

Add a browser test that opens an extracted viewer through `file://` and verifies:

- the sheet loads without a server;
- standard four-direction frames advance together;
- pause, previous, next, and scrubber controls work;
- custom and one-direction animations render correctly;
- reduced-motion initialization is paused;
- the information panel expands and exposes full credits;
- a missing sheet produces the intended visible error.

Extend the packed CLI smoke workflow to render and inspect a viewer from the
installed package. Run focused Core and CLI tests and typechecks while
iterating, then run the Web browser test, boundary checker, `rtk pnpm verify`,
build, and packed package smoke suite before handoff.

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: N/A — verification commands and CI mapping do not change
releasing: N/A — packaging, versioning, and publication policy do not change
plugin: update
```

- Help and the CLI README document the new viewer artifact and extracted ZIP
  workflow.
- The root quick start and landing tutorial mention that a final render includes
  an offline animation viewer.
- Architecture records the viewer as part of CLI transactional attributed
  render output.
- The plugin workflow verifies the viewer alongside metadata and TXT/CSV
  credits during final render handoff.

## Success Criteria

- A character produced through the Codex plugin has a browser animation viewer
  in its normal render directory.
- The same viewer survives ZIP bundling and works after extraction by direct
  double-click.
- Every available standard and custom animation plays using Core-owned layout
  rules.
- Four directions remain synchronized, one-direction animations are presented
  honestly, and all playback controls work.
- The collapsible information area exposes a portable metadata summary,
  warnings, effective license, complete Credits TXT content, and a relative
  link to the complete metadata file.
- Existing separate animation and frame output options, metadata fields,
  attribution files, and strict render behavior do not regress.
