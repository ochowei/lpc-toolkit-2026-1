# lpc-toolkit Onboarding Guide

## Project Overview

`lpc-toolkit` is a TypeScript monorepo for composing LPC character
spritesheets. It provides an environment-agnostic core library, a React/Vite
web editor, and a planned CLI.

Primary stack:

- TypeScript
- React
- Vite
- Tailwind CSS
- Vitest
- GitHub Actions

Core constraints to internalize early:

- `packages/core/` must stay browser/Node agnostic.
- Canvas and image loading are injected through adapters.
- GPL-3.0-or-later compatibility matters.
- Every rendered sprite must preserve attribution metadata.
- `upstream/` is optional read-only reference material.
- Do not initialize `upstream/` for normal setup.

## Architecture Layers

### Core Composition Library

Key files: [`packages/core/src/index.ts`](../packages/core/src/index.ts),
[`types.ts`](../packages/core/src/types.ts),
[`adapters.ts`](../packages/core/src/adapters.ts),
[`catalog.ts`](../packages/core/src/catalog.ts),
[`frames.ts`](../packages/core/src/frames.ts),
[`compose.ts`](../packages/core/src/compose.ts),
[`credits.ts`](../packages/core/src/credits.ts).

This layer owns the reusable sprite engine: catalog modeling, frame selection,
recoloring, composition, validation, hashing, and credit metadata.

### React UI Layer

Key files: [`packages/web/src/App.tsx`](../packages/web/src/App.tsx),
[`harness.tsx`](../packages/web/src/components/layer-stack/harness.tsx),
[`layer-row.tsx`](../packages/web/src/components/layer-stack/layer-row.tsx),
[`sidebar-search.tsx`](../packages/web/src/components/layer-stack/sidebar-search.tsx),
[`preview-pane.tsx`](../packages/web/src/components/layer-stack/preview-pane.tsx).

This layer turns the core engine into an interactive character editor with
previews, layer controls, search, popovers, filters, and responsive layout.

### Web Application Logic

Key files:
[`packages/web/src/slice/selection.ts`](../packages/web/src/slice/selection.ts),
[`use-composed-character.ts`](../packages/web/src/hooks/use-composed-character.ts),
[`use-animation-player.ts`](../packages/web/src/hooks/use-animation-player.ts),
[`i18n.ts`](../packages/web/src/i18n.ts).

This layer coordinates state, derived catalog behavior, animation playback,
localization, presets, and UI-facing selection models.

### Browser and Asset Integration

Key files:
[`browser-canvas-adapter.ts`](../packages/web/src/adapter/browser-canvas-adapter.ts),
[`asset-source.ts`](../packages/web/src/adapter/asset-source.ts),
[`zip-loader.ts`](../packages/web/src/adapter/zip-loader.ts),
[`zip-export.ts`](../packages/web/src/lib/zip-export.ts),
[`download.ts`](../packages/web/src/lib/download.ts).

This layer connects browser runtime APIs and packaged assets to the
environment-neutral core contracts.

### Asset Build Tooling

Key files:
[`asset-release.ts`](../packages/web/scripts/asset-release.ts),
[`copy-spritesheets.ts`](../packages/web/scripts/copy-spritesheets.ts),
[`validate-assets.ts`](../packages/web/scripts/validate-assets.ts),
[`gen-i18n-data.ts`](../packages/web/scripts/gen-i18n-data.ts).

This layer prepares migrated LPC assets, validates release metadata, copies
spritesheets, audits thumbnail framing, and generates runtime data.

### Test and Quality Layer

Key areas: [`packages/core/test/`](../packages/core/test/),
[`packages/web/test/`](../packages/web/test/),
[`packages/web/e2e/`](../packages/web/e2e/).

This layer contains Vitest coverage, Playwright scenarios, fixtures, probes,
and regression tests across core and web behavior.

### Documentation and Governance

Key files: [`README.md`](../README.md), [`API.md`](../API.md),
[`RESEARCH.md`](../RESEARCH.md), [`AGENTS.md`](../AGENTS.md),
[`CLAUDE.md`](../CLAUDE.md), [`RTK.md`](../RTK.md).

This layer explains project purpose, public API, upstream research, contributor
constraints, and command conventions.

## Key Concepts

- **Environment-agnostic core:** `packages/core` exposes pure composition logic
  and depends on injected adapters.
- **Composition pipeline:** Catalog selections become frame draws, recolor
  operations, composed sheets, and credit manifests.
- **Attribution as product logic:** Credits are not optional output decoration;
  they are part of every render workflow.
- **Selection reducer:** Web UI state is centralized in
  `packages/web/src/slice/selection.ts`.
- **Browser boundary:** ZIP loading, downloads, URL sync, image loading, and
  canvas behavior stay in `packages/web`.
- **Asset pipeline:** Migrated LPC assets are validated and materialized by
  scripts before runtime use.

## Guided Tour

1. Read [`README.md`](../README.md) for purpose, package layout, and hard
   constraints.
2. Read [`packages/core/src/index.ts`](../packages/core/src/index.ts) with
   [`API.md`](../API.md) to understand the public API.
3. Read [`packages/core/src/types.ts`](../packages/core/src/types.ts) and
   [`adapters.ts`](../packages/core/src/adapters.ts) to understand portability
   boundaries.
4. Read [`catalog.ts`](../packages/core/src/catalog.ts),
   [`frames.ts`](../packages/core/src/frames.ts), and
   [`animation.ts`](../packages/core/src/animation.ts) to understand spritesheet
   structure.
5. Read [`compose.ts`](../packages/core/src/compose.ts),
   [`recolor.ts`](../packages/core/src/recolor.ts), and
   [`credits.ts`](../packages/core/src/credits.ts) to understand rendering and
   attribution.
6. Read [`packages/web/src/main.tsx`](../packages/web/src/main.tsx) and
   [`App.tsx`](../packages/web/src/App.tsx) to see browser startup.
7. Read [`selection.ts`](../packages/web/src/slice/selection.ts), catalog-tree
   helpers, filters, and [`i18n.ts`](../packages/web/src/i18n.ts) for app state.
8. Read [`harness.tsx`](../packages/web/src/components/layer-stack/harness.tsx),
   [`stack-panel.tsx`](../packages/web/src/components/layer-stack/stack-panel.tsx),
   [`layer-row.tsx`](../packages/web/src/components/layer-stack/layer-row.tsx),
   and
   [`sidebar-search.tsx`](../packages/web/src/components/layer-stack/sidebar-search.tsx)
   for the editor workflow.
9. Read browser adapters and [`zip-export.ts`](../packages/web/src/lib/zip-export.ts)
   for asset loading and export.
10. Read [`asset-release.ts`](../packages/web/scripts/asset-release.ts),
    [`copy-spritesheets.ts`](../packages/web/scripts/copy-spritesheets.ts), core
    tests, and [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for
    quality gates.

## File Map

### Core

- `packages/core/src/index.ts`: Public package exports.
- `packages/core/src/types.ts`: Shared domain types and API contracts.
- `packages/core/src/adapters.ts`: Injected canvas and image-loading contracts.
- `packages/core/src/catalog.ts`: Catalog construction and asset lookup.
- `packages/core/src/compose.ts`: Main layered sprite composition pipeline.
- `packages/core/src/frames.ts`: Animation frame selection and geometry.
- `packages/core/src/palettes.ts`: Palette definitions and catalog behavior.
- `packages/core/src/recolor.ts`: Pixel recoloring operations.
- `packages/core/src/recolor-resolve.ts`: Resolves material and palette choices.
- `packages/core/src/credits.ts`: Builds mandatory attribution metadata.
- `packages/core/src/hash.ts`: Serializes and parses shareable composition state.

### Web Application

- `packages/web/src/main.tsx`: Browser entry point.
- `packages/web/src/App.tsx`: Top-level application startup and asset loading.
- `packages/web/src/components/layer-stack/harness.tsx`: Main editor
  orchestration.
- `packages/web/src/components/layer-stack/layer-row.tsx`: Per-layer editing
  controls.
- `packages/web/src/components/layer-stack/preview-pane.tsx`: Character preview
  and animation controls.
- `packages/web/src/components/layer-stack/sidebar-search.tsx`: Catalog search,
  ranking, and keyboard navigation.
- `packages/web/src/hooks/use-composed-character.ts`: Connects React state to
  asynchronous core composition.
- `packages/web/src/hooks/use-animation-player.ts`: Draws synchronized animation
  frames to preview canvases.
- `packages/web/src/slice/selection.ts`: Immutable selection operations.
- `packages/web/src/i18n.ts`: UI and catalog label translation.

### Browser and Export Integration

- `packages/web/src/adapter/browser-canvas-adapter.ts`: Browser implementation
  of the core canvas contract.
- `packages/web/src/adapter/asset-source.ts`: Selects and accesses asset
  sources.
- `packages/web/src/adapter/zip-loader.ts`: Loads sprite assets from ZIP
  archives.
- `packages/web/src/lib/url-hash-sync.ts`: Synchronizes editor state with the
  URL.
- `packages/web/src/lib/zip-export.ts`: Exports animation PNGs and attribution
  metadata.
- `packages/web/src/lib/download.ts`: Browser download helpers.

### Tooling and Quality

- `packages/web/scripts/asset-release.ts`: Validates and materializes pinned LPC
  asset releases.
- `packages/web/scripts/copy-spritesheets.ts`: Copies deterministic spritesheet
  subsets for the web application.
- `packages/web/scripts/validate-assets.ts`: Checks asset consistency through
  the core validator.
- `packages/web/scripts/gen-i18n-data.ts`: Regenerates catalog-derived
  translation data.
- `packages/core/test/`: Core unit and regression tests.
- `packages/web/test/`: Web unit and integration tests.
- `packages/web/e2e/`: Playwright browser scenarios.
- `.github/workflows/ci.yml`: Continuous integration workflow.

## Complexity Hotspots

Approach these files with their associated tests open:

- `packages/core/src/compose.ts`
- `packages/core/src/catalog.ts`
- `packages/core/src/types.ts`
- `packages/core/src/hash.ts`
- `packages/core/src/palettes.ts`
- `packages/core/src/recolor.ts`
- `packages/core/src/recolor-resolve.ts`
- `packages/web/src/slice/selection.ts`
- `packages/web/src/hooks/use-composed-character.ts`
- `packages/web/src/components/layer-stack/harness.tsx`
- `packages/web/src/components/layer-stack/layer-row.tsx`
- `packages/web/src/components/layer-stack/sidebar-search.tsx`
- `packages/web/src/lib/zip-export.ts`

When changing these areas, verify attribution behavior, environment boundaries,
selection state transitions, and stale asynchronous composition handling.

## First Contributions

Good first areas:

- Documentation updates in `README.md`, `API.md`, or `docs/`.
- Focused UI polish in isolated layer-stack components.
- Small test additions around reducers, hooks, or pure utility functions.
- Asset-tooling improvements that do not alter `upstream/`.

Avoid as first changes:

- Reworking core adapter contracts.
- Changing attribution behavior.
- Modifying `upstream/`.
- Broad refactors in `harness.tsx`, `selection.ts`, or `compose.ts`.
