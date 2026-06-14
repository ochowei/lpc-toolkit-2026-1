# lpc-toolkit Onboarding Guide

## Project Overview

`lpc-toolkit` is a TypeScript monorepo for composing Liberated Pixel Cup
character sprites.

- **Core:** Environment-agnostic composition library
- **Web:** React 18, Vite, and Tailwind CSS
- **CLI:** Planned
- **Tests:** Vitest and Playwright
- **License:** GPL-3.0-or-later
- **Package manager:** pnpm

Critical constraints:

- Never modify `upstream/`.
- Every rendered sprite must include attribution metadata.
- Keep `packages/core/` independent of browser and Node APIs.
- Use strict TypeScript without undocumented `any`.

## Architecture Layers

### Core Composition Library

Catalog loading, frames, palettes, recoloring, composition, validation,
hashing, and credits.

### React UI Layer

Editor components, responsive layout, preview controls, layer rows, popovers,
and styling.

### Web Application Logic

Hooks, selection reducers, presets, localization, and derived catalog state.

### Browser and Asset Integration

Canvas adapters, asset loading, URL state, downloads, ZIP export, and browser
utilities.

### Asset Build Tooling

Asset preparation, validation, parity checks, thumbnail audits, and ZIP
generation.

### Test and Quality Layer

Core unit tests, web tests, Playwright scenarios, and parity checks.

### Reference Prototypes

Earlier UI explorations under `reference/`; useful for design context, not
production behavior.

### Documentation and Governance

README, API documentation, contribution rules, licensing, and attribution
requirements.

### Configuration and Delivery

Workspace manifests, TypeScript/Vite/Vitest configuration, and GitHub Actions.

## Key Concepts

- **Dependency injection:** Core receives canvas creation and image loading
  from callers.
- **Attribution by construction:** Composition results include credits rather
  than adding them later.
- **Layered composition:** Catalog selections resolve into ordered spritesheet
  layers.
- **Palette recoloring:** Material and palette definitions transform source
  pixels.
- **Reducer-driven editing:** Web selections are updated through immutable
  operations.
- **Stale-result prevention:** Asynchronous composition avoids replacing
  current state with old results.
- **Generated asset bindings:** Preparation scripts convert local assets into
  web-consumable data.

## Guided Tour

1. Read the project overview in [`README.md`](../README.md).
2. Inspect the workspace manifest in [`package.json`](../package.json).
3. Follow browser startup in
   [`packages/web/src/main.tsx`](../packages/web/src/main.tsx).
4. Study editor orchestration in
   [`harness.tsx`](../packages/web/src/components/layer-stack/harness.tsx).
5. Review the core public API in
   [`packages/core/src/index.ts`](../packages/core/src/index.ts).
6. Learn the domain contracts in
   [`packages/core/src/types.ts`](../packages/core/src/types.ts).
7. Trace composition through
   [`packages/core/src/compose.ts`](../packages/core/src/compose.ts).
8. Inspect browser integration in
   [`browser-canvas-adapter.ts`](../packages/web/src/adapter/browser-canvas-adapter.ts).
9. Review attribution and export behavior in
   [`credits.ts`](../packages/core/src/credits.ts) and
   [`zip-export.ts`](../packages/web/src/lib/zip-export.ts).
10. Study asset preparation in
    [`prepare-assets.ts`](../packages/web/scripts/prepare-assets.ts).
11. Finish with the CI workflow in
    [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## File Map

### Core

- `packages/core/src/index.ts`: Public package exports.
- `packages/core/src/types.ts`: Shared domain types and API contracts.
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
- `packages/web/src/App.tsx`: Top-level application component.
- `packages/web/src/components/layer-stack/harness.tsx`: Main editor
  orchestration.
- `packages/web/src/components/layer-stack/layer-row.tsx`: Per-layer editing
  controls.
- `packages/web/src/components/layer-stack/preview-pane.tsx`: Character preview
  and animation controls.
- `packages/web/src/hooks/use-composed-character.ts`: Connects React state to
  asynchronous core composition.
- `packages/web/src/slice/selection.ts`: Immutable selection operations.
- `packages/web/src/catalog/load-catalog.ts`: Loads generated catalog data into
  the core model.

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

### Tooling and Quality

- `packages/web/scripts/prepare-assets.ts`: Prepares local assets for the web
  application.
- `packages/web/scripts/validate-assets.ts`: Checks asset consistency.
- `packages/web/scripts/verify-upstream-parity.ts`: Verifies migrated asset
  parity.
- `packages/core/test/`: Core unit and regression tests.
- `packages/web/test/`: Web unit and integration tests.
- `packages/web/e2e/`: Playwright browser scenarios.
- `.github/workflows/ci.yml`: Continuous integration workflow.

## Complexity Hotspots

Approach these files with their associated tests open:

- `packages/core/src/compose.ts`
- `packages/core/src/hash.ts`
- `packages/core/src/palettes.ts`
- `packages/core/src/recolor-resolve.ts`
- `packages/core/src/types.ts`
- `packages/web/src/components/layer-stack/harness.tsx`
- `packages/web/src/components/layer-stack/layer-row.tsx`
- `packages/web/src/hooks/use-composed-character.ts`
- `packages/web/src/slice/selection.ts`
- `packages/web/src/lib/zip-export.ts`

When changing these areas, verify attribution behavior, environment boundaries,
selection state transitions, and stale asynchronous composition handling.
