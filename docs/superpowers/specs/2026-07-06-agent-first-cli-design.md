# Agent-First CLI Design

## Goal

Build the first `packages/cli/` package for `lpc-toolkit` as an agent-first
Node CLI for game asset creation.

The CLI should help an AI agent explore LPC assets, assemble and validate a
character selection, render usable game sprites, and carry attribution metadata
with every rendered output. The first version is designed for use inside this
monorepo, but its command contract, JSON schema, and asset-root configuration
should not assume that it will always run from the repository root.

## Non-Goals

- No game-engine-specific atlas, importer, or project registry in the first
  version.
- No large batch pipeline for whole game casts.
- No natural-language character generator.
- No Node, filesystem, canvas, ZIP, or package-specific dependency inside
  `packages/core/src/**`.
- No writes to `upstream/`.

## Approach

Use an Agent-first Toolkit CLI.

The CLI defaults to human-readable output for normal terminal use. Every command
also accepts `--json`; when present, stdout is a stable machine-readable JSON
envelope and progress, warnings, and human-oriented messages go to stderr.

This keeps the CLI comfortable for humans while giving AI agents a predictable
contract.

## Package Shape

Create `packages/cli/` as a TypeScript package depending on
`@lpc-toolkit/core`.

Runtime dependencies:

- `@napi-rs/canvas` for Node canvas and PNG writing. License: MIT,
  GPL-3.0-or-later compatible.
- `jszip` for optional ZIP bundles. License: MIT, GPL-3.0-or-later compatible.

CLI-only Node concerns live in `packages/cli/`:

- filesystem reads and writes
- directory walking
- asset-root resolution
- Node canvas adapter
- PNG serialization
- ZIP creation
- command parsing and response formatting

`packages/core/` remains environment-agnostic and continues to receive canvas
and image loading through injected adapters.

## Commands

The first version exposes these command groups:

```text
lpc catalog types
lpc catalog items --type hair --body-type male --search braid --license GPL --animation walk
lpc catalog item <item-id-or-type/name>

lpc selection validate --selection hero.json

lpc render --selection hero.json --out dist/hero --animation walk --frames walk --bundle zip

lpc token decode --token <hash-or-token> --out hero.json
lpc token encode --selection hero.json

lpc preset list
lpc preset materialize farmer --out farmer.json
lpc preset render farmer --out dist/farmer
```

`catalog` commands provide agent navigation:

- list body types and type names
- list items under a type
- search by text
- filter by body type, license, and animation
- show variants, recolors, animations, credit summary, and compatibility hints

The first version does not implement a full automatic outfit planner. It should
provide enough structured information for an agent to make its own choices.

## Runtime Context

Each command builds a runtime context:

1. Resolve the CLI package and repository defaults.
2. Locate `assets/`, `assets_custom/`, `assets/palette_definitions/`, and the
   sprite PNG base.
3. Accept asset-root overrides through flags or config so a future installed CLI
   can run from a game project.
4. Load catalog and palette data.
5. Collect warnings rather than printing them directly when `--json` is active.

The initial monorepo default may use the checked-in `assets/` tree for metadata
and `upstream/` or the prepared asset snapshot as the sprite image base,
following the current project layout. The design should keep that path choice
centralized so a future package distribution can replace it.

## Catalog And Palette Loading

CLI catalog loading mirrors the web data shape:

- read `assets/sheet_definitions/**/*.json`
- read `assets_custom/sheet_definitions/**/*.json`
- normalize keys relative to the `sheet_definitions/` root
- pass records to core `createCatalog`

Palette loading:

- read `assets/palette_definitions/**/*.json`
- normalize keys relative to `palette_definitions/`
- pass records to core `createPaletteCatalog`

Catalog and palette warnings appear in command responses. In human output they
may be summarized. In JSON output they must be included as structured warnings.

## Selection JSON

Selection JSON is the primary authoring format for agents and game projects.
It stays close to core `Selections` while adding lightweight metadata.

Example:

```json
{
  "schema": "lpc-toolkit.selection.v1",
  "name": "hero-farmer",
  "bodyType": "male",
  "items": {
    "body": { "name": "Body Color", "recolor": "light" },
    "head": { "name": "Human Male" },
    "expression": { "name": "Neutral" },
    "hair": { "name": "Messy3", "variant": "brown" }
  }
}
```

CLI parsing converts this into core `Selections`:

- `bodyType` maps to `Selections.bodyType`
- each `items` key becomes the core `Selection.typeName`
- each item value supplies `name`, optional `variant`, and optional `recolor`

The CLI preserves `schema` and `name` in metadata outputs so generated game
assets remain traceable.

URL hash and selection tokens are secondary interoperability formats:

- `token decode` converts a web hash/token into selection JSON.
- `token encode` converts selection JSON into a web-compatible token using the
  core hash/token helpers.

## Presets

Presets provide convenient entry points without replacing selection JSON.

Built-in presets:

- reuse the existing web preset data where possible
- extract shared preset data into a pure module if needed
- do not import React components or browser-only web code into the CLI

External presets:

- accept preset JSON through `--preset-file` or config
- allow game projects to add names such as `town-guard` or `merchant`
- allow external presets to override built-in presets by name

Preset commands should make the resulting selection explicit:

- `preset materialize` writes editable selection JSON.
- `preset render` renders directly but still records the materialized selection
  in metadata.

## Validation

`selection validate` and `render` share validation logic.

Validation checks:

- unknown type names
- unknown item names
- unknown variants
- unknown recolors
- body type incompatibility
- missing sprite paths
- missing or unusable animation output
- catalog and palette loading warnings

Default render behavior is strict. Any blocker exits non-zero and avoids writing
misleading successful artifacts.

`--allow-partial` permits partial output by downgrading skippable layer problems
to warnings. JSON responses must report skipped layers and warning codes
explicitly.

Error and warning codes are stable machine-readable strings such as:

- `unknown_type_name`
- `unknown_item`
- `unknown_variant`
- `unknown_recolor`
- `body_type_incompatible`
- `missing_sprite_path`
- `missing_animation`
- `catalog_warning`
- `palette_warning`

## Rendering And Export

`render` composes through core:

- `composeSelections`
- `extractAnimation`
- `extractAnimationFrames`
- `creditsToTxt`
- `creditsToCsv`
- effective license helpers

The CLI supplies:

- Node canvas adapter backed by `@napi-rs/canvas`
- image loading from filesystem paths
- PNG writing
- output directory creation
- optional ZIP packaging through `jszip`

Every rendered pixel output must include attribution files. This is required for
spritesheets, animation strips, frame exports, and ZIP bundles.

Render options:

- default: write full spritesheet PNG, credits TXT, credits CSV, and metadata
  JSON
- `--animation walk`: also write the selected animation strip
- `--frames walk`: write frames for one animation
- `--frames all`: write frames for all selected/rendered animations
- `--bundle zip`: write a ZIP containing the generated artifacts
- `--allow-partial`: allow skipped layers with explicit warnings

## Output Layout

For `lpc render --selection hero.json --out dist/hero --animation walk --frames walk --bundle zip`,
the output layout is:

```text
dist/hero/
  hero.sheet.png
  hero.metadata.json
  hero.credits.txt
  hero.credits.csv
  animations/
    walk.png
  frames/
    walk/
      n-000.png
      n-001.png
      e-000.png
      e-001.png
  hero.bundle.zip
```

If multiple animations are requested, each gets its own file under
`animations/` and each frame set gets its own subdirectory under `frames/`.

## Metadata Contract

`metadata.json` contains:

- schema and CLI version
- source selection schema, name, body type, and items
- generated artifact list
- sheet dimensions
- animation dimensions and frame counts
- included animations and frames
- effective license
- credits summary
- paths to `credits.txt` and `credits.csv`
- source asset root and asset manifest information when available
- warnings
- skipped layers when `--allow-partial` is used

Artifact entries include:

- type, such as `sheet`, `animation`, `frame`, `credits_txt`, `credits_csv`,
  `metadata`, or `zip`
- path
- width and height when applicable
- animation and direction/frame index when applicable

## JSON Response Envelope

All `--json` responses use a stable envelope:

```json
{
  "ok": true,
  "command": "render",
  "data": {},
  "warnings": [],
  "errors": []
}
```

Failure responses use the same shape with `ok: false`, a non-zero process exit
code, and structured `errors`.

Human-readable output can be compact and friendly, but it must not be the only
source of important information. Any information an agent needs must exist in
the JSON response.

## Testing

Unit tests:

- command argument parsing
- JSON response envelope formatting
- selection JSON parsing
- selection validation
- catalog filters and search
- preset materialization
- error/warning code formatting

Integration tests:

- load real `assets/` and `assets_custom/`
- render a body-only selection with the Node canvas adapter
- assert PNG, metadata, credits TXT, and credits CSV are written
- render one animation strip
- optionally verify ZIP contents for `--bundle zip`

Boundary verification:

- `packages/cli/` may use Node APIs and concrete canvas dependencies.
- `packages/core/src/**` must continue to avoid Node, browser, React, web, and
  canvas implementation imports.
- CLI changes that touch architecture-sensitive areas must run
  `rtk pnpm check:boundaries`.

Expected verification commands for implementation:

```bash
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm check:boundaries
```

Use broader `rtk pnpm typecheck` or `rtk pnpm test` when shared package changes
make that appropriate.
