# Architecture

`lpc-toolkit` uses a core-first architecture with Clean Architecture /
Hexagonal Architecture style boundaries. The reusable sprite engine lives in
`packages/core/`; shared presets live in `packages/presets/`; the React web app
and Node CLI adapt their runtime state, assets, canvas, ZIP, download, and
filesystem behavior around that engine.

This is not an MVC codebase. Do not reorganize it into
`models/views/controllers`. The important boundary is dependency direction:
domain and composition logic stay in core, application decisions stay in pure
web helpers, React effects coordinate runtime work, and browser APIs stay in
web adapters and libs.

## Architecture Shape

### `packages/core/`

`packages/core/` is the domain/core engine. It owns reusable, environment-free
LPC behavior:

- catalog modeling and lookup
- composition and layer resolution
- recolor and palette swap execution
- animation extraction and frame slicing
- credits and attribution manifests
- hash/token serialization and parsing
- static asset validation
- adapter contracts such as `CanvasAdapter`

Core can define abstract ports and domain types. It must not know whether the
caller is React, a browser, Node, Vite, a test, the web app, or the CLI.

### `packages/presets/`

`packages/presets/` owns shared preset definitions and pure preset-application
logic:

- themed outfit preset metadata
- clothing-slot clearing rules for applying presets
- catalog-backed preset item resolution
- default variant and recolor selection for preset items

Presets may depend on core types and pure catalog/palette helpers. They must
not own React UI, browser APIs, filesystem access, canvas creation, image
loading, ZIP creation, downloads, or CLI command parsing.

### `packages/web/src/slice/`

`slice/` owns pure web application logic:

- reducers and immutable state transitions
- selectors and decision helpers
- catalog-derived UI behavior
- selection transitions
- filters, ordering, compatibility, and default choices

These files may depend on core types and pure core helpers. They should avoid
React effects, DOM APIs, fetch, storage, ZIP handling, and canvas plumbing.

### `packages/web/src/hooks/`

`hooks/` owns React effects and async orchestration:

- composition lifecycle
- stale async request handling
- animation playback
- thumbnail orchestration
- observing reducer state and calling core through adapters

Hooks are the bridge between pure app state and runtime work. For example,
`use-composed-character.ts` observes `SliceState`, builds core `Selections`,
calls `composeSelections`, extracts the active animation, and exposes loading,
ready, and error states to the UI.

### `packages/web/src/components/`

`components/` own presentation and interaction UI:

- rendering controls, previews, popovers, panels, and rows
- dispatching user intent
- showing derived status, errors, attribution, and export controls

Components should delegate domain decisions to `slice/` helpers, hooks, or core.
They should not grow their own composition engine or browser export pipeline.

### `packages/web/src/adapter/`

`adapter/` owns concrete runtime bridges to core contracts and browser asset
loading:

- browser `CanvasAdapter` implementation
- image loading through browser APIs
- ZIP-backed sprite materialization
- runtime asset-source selection

Browser-only APIs such as `document`, `fetch`, `createImageBitmap`, `URL`, and
ZIP object URLs belong here or in `lib/`, not in core.

### `packages/web/src/lib/`

`lib/` owns browser-only workflows and focused helpers:

- ZIP export
- download helpers
- URL/hash sync
- full-sheet render helpers
- composition lock helpers
- object URL and browser storage helpers

Use `lib/` when the behavior is reusable browser workflow code rather than a
React component, reducer decision, or core domain rule.

### `packages/web/scripts/`

`scripts/` own asset preparation, validation, release snapshots, audit, and
generation tooling. Script-only code may use Node APIs when the script is not
part of browser runtime or core runtime source.

Scripts may read generated asset paths and materialize local assets. They must
not modify `upstream/`.

### `packages/cli/`

`packages/cli/` owns Node runtime behavior around the core engine:

- agent-first command parsing and JSON/human responses
- filesystem-backed catalog, palette, custom asset, and selection loading
- filesystem-backed character documents with atomic create and replace in
  `character-store.ts`
- catalog-backed character editing, search, and validation decisions
- transactional attributed preview and render publication
- Node `CanvasAdapter` wiring through `@napi-rs/canvas`
- render output staging and atomic publishing
- metadata, credits, animation, frame, and ZIP artifact writing
- token and preset commands for automation

CLI code may use Node APIs, `@napi-rs/canvas` (MIT), and `jszip` (MIT) because
it is a Node runtime package. Those dependencies must not move into
`packages/core/src/**`.

### `plugins/lpc-toolkit/`

`plugins/lpc-toolkit/` is a Codex distribution and workflow layer around the
external `lpc-toolkit` executable. It owns plugin installation metadata, one
focused character-authoring skill, compatibility checks, and command workflow
references. It does not duplicate CLI product logic, read asset caches on its
own, or own catalog, selection, validation, rendering, or attribution rules.

The plugin may invoke the public CLI and inspect returned artifact paths. It
must not import CLI source, add Node runtime behavior to core, suppress credit
artifacts, install the CLI silently, or introduce MCP/apps/hooks without a new
approved design.

### Documentation and Governance

Documentation has explicit ownership:

- `docs/ARCHITECTURE.md` owns stable package boundaries and design decisions.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) owns contributor and pull request flow.
- [`docs/ENGINEERING.md`](ENGINEERING.md) owns commands, tests, and CI mapping.
- [`docs/RELEASING.md`](RELEASING.md) owns authorized release operations.
- `AGENTS.md` and `CLAUDE.md` are identical indexes of non-negotiable Agent
  rules and change-specific guidance.

No document grants permission to bypass the hard rules in `AGENTS.md`.

## Dependency Direction

Allowed dependency direction:

- `packages/web` -> `packages/core`
- `packages/web` -> `packages/presets`
- `packages/cli` -> `packages/core`
- `packages/cli` -> `packages/presets`
- `packages/presets` -> `packages/core`
- web components -> hooks, `slice/`, and `lib/`
- hooks -> core, `slice/`, `adapter/`, and `lib/`
- `adapter/` -> core adapter contracts
- `lib/` -> core types/functions when implementing browser workflows
- scripts -> Node APIs and generated asset paths, when script-only
- tests -> Node adapters or test-only concrete canvas implementations

Forbidden dependency direction:

- core -> web
- core -> presets
- core -> CLI
- core -> React
- core -> DOM, `window`, or `document`
- core -> `fetch`, `createImageBitmap`, or `localStorage`
- core -> Node `fs`, `node-canvas`, or `@napi-rs/canvas` in runtime source
- components -> direct `composeSelections` orchestration when a hook should own
  the lifecycle
- components -> ZIP, download, object URL, or canvas plumbing when a lib, hook,
  or adapter should own it
- scripts or runtime code modifying `upstream/`

The intended flow is inward for policy and outward for implementation details:
web and CLI depend on core contracts; presets depends on core; core never
depends on web, CLI, or preset implementations.

## Core Package Rules

`packages/core/src/**` must stay environment-agnostic. It can work with canvas
and image-like objects only through injected contracts such as `CanvasAdapter`.

Core may define abstract types, contracts, data models, and pure behavior. It
must not import concrete browser or Node APIs. In particular, do not import or
reference `window`, `document`, `fetch`, `localStorage`, `fs`, `node-canvas`, or
`@napi-rs/canvas` from core runtime source.

Attribution is product and domain logic, not optional UI decoration. Core
composition returns credit metadata because every rendered sprite needs it.
Future cleanup must preserve that expectation.

Public selection, hash, and token compatibility are user-facing behavior. Do
not change serialized identity, parsed selection meaning, or token compatibility
just to make architecture cleanup look neater.

## Web Package Rules

Use these responsibilities when choosing where code belongs:

- `slice/` owns pure app decisions.
- `hooks/` own effects and async lifecycle.
- `components/` render and dispatch.
- `adapter/` owns concrete runtime bridges to core contracts.
- `lib/` owns browser workflows such as ZIP export, download, URL hash sync,
  full sheet render support, composition lock behavior, and storage helpers.

React components can compose these pieces, but they should not absorb all of
them. If a component starts deciding compatibility rules, resolving catalog
defaults, managing object URLs, and composing canvases directly, move those
concerns back to the appropriate layer.

## CLI Package Rules

`packages/cli/` is the only package that should own command-line runtime
behavior. Keep CLI-specific filesystem access, Node canvas loading, ZIP writing,
process IO, and output publishing there.

CLI commands should continue to call core through injected adapter contracts and
shared package APIs. Do not add CLI conveniences by importing Node APIs into
`packages/core/src/**`, and do not bypass attribution files when rendering or
bundling output.

Agent-facing catalog and character search use CLI-owned bounded discovery
summaries and deterministic pagination. Detail lookup remains the source of
exact raw credits. Plugins and other clients may sequence public JSON commands.
They must not duplicate discovery logic or reinterpret attribution data.

The character store owns named selection persistence under `./characters/` and
explicit selection-file access. Character commands validate a complete
candidate before atomic mutation, and preview/render stage every pixel,
metadata, TXT credit, and CSV credit artifact before transactional publication.
Shared selection parsing, composition, attribution, and preset rules remain in
core or presets; CLI persistence must not introduce Node filesystem APIs into
those packages.

## Presets Package Rules

`packages/presets/` is shared product logic, not a web component and not a CLI
command layer. It should stay pure enough for both web and CLI to consume.
Preset changes should preserve catalog-backed validation, skipped-item reporting,
and body-type compatibility behavior.

## React Data Flow

```text
user event
  -> component dispatch
  -> slice reducer/helper updates state
  -> hook observes state
  -> hook calls core compose/extract through adapters
  -> result returns with credits
  -> component renders preview/layers/attribution/export controls
```

This is a React + reducer / MVU-style application flow. Components emit actions,
the reducer produces state, hooks react to state changes, and core performs the
domain work through injected browser adapters.

## Attribution and Licensing

Every rendered or exported sprite must preserve attribution metadata derived
from `assets/CREDITS.csv` or the upstream credits data.

UI preview, download, ZIP export, and CLI rendering must not bypass credits.
Any workflow that creates pixels for users must include or preserve the
required credits and license output. ZIP exports should continue writing credit
files, previews should continue exposing attribution, and new export paths must
carry the same metadata expectations.

Catalog picker thumbnails are editor-internal previews and do not require their
own credit sidecar. The editor must keep the active composition's attribution
surface reachable. The attribution popover consumes the active
`ComposedSheet.credits`; catalog filter warnings are compatibility information,
not additional attribution.

Any downloadable pixel artifact must be built from one frozen `ComposedSheet`
and include credits derived from that sheet's `credits` manifest. Catalog
filters may report compatibility warnings, but must not broaden the attribution
manifest.

Because the project is GPL-3.0-or-later and inherits upstream LPC licensing
requirements, attribution behavior is part of correctness.

The thumbnail attribution exception is intentionally narrow: catalog picker
thumbnails are editor-internal previews, while every active composition and
download remains covered by the attribution surface and export contract.
Browser downloads are built from one frozen `ComposedSheet.credits` manifest
and package the PNG/TXT/CSV artifacts together.

## CLI Asset Lifecycle and AssetStore Ownership

The CLI ships a pinned manifest and tarball configuration in its built output.
The configuration identifies the release tag and source SHA, HTTPS manifest and
tarball URLs, and their SHA-256 digests. First use downloads into a staging
area, performs checksum verification before publication, and materializes a
platform cache under the operating system's cache convention (or
`LPC_TOOLKIT_CACHE_DIR`). Cache publication is atomic so interrupted downloads
do not replace a valid release.

`prepareRuntimeAssets` selects assets in this order:

1. A complete working-directory `assets/` tree takes precedence.
2. Otherwise, the verified platform cache for the pinned release is created or
   reused.
3. The working-directory `assets_custom/` tree overlays custom definitions and
   sprites without replacing the base asset source.

Verified cache reuse requires no network access. Offline first use, a missing
release, checksum failure, corrupt archive, or incomplete cache produces a
typed cache error with release and cache-path context; it never silently falls
back to the read-only submodule.

The `AssetStore` port isolates logical sprite lookup from storage. A complete
local tree uses `createDirectoryAssetStore`; the managed compressed cache uses
`createZipAssetStore`, its sprite index, and lazy category ZIP reads. Both stay
inside `packages/cli/` and supply core through its injected image-loading port.

Production asset resolution uses the local tree or pinned managed cache.
`upstream/` is an optional read-only provenance dormant gitlink that preserves source
provenance without participating in normal install, test, build, E2E, package,
or publish flows. Checked-in Core real-pixel fixtures with credits provide
fixture provenance for composition and parity-sensitive tests without requiring
an initialized submodule. Provenance verification is four-way: the dormant
gitlink pin, the CLI release tag/source SHA, the published asset manifest
digests, and the checked-in fixture provenance metadata must all agree on the
same source lineage. The isolated parity checkout is the only executable
upstream source checkout and uses a separate isolated checkout of the same
pinned revision; package installation inside the submodule is forbidden.

## Web Catalog Ownership

`packages/web/src/catalog/` owns browser catalog and palette loading,
normalization, and the merge of generated base definitions with
`assets_custom/` definitions. Components and hooks consume that normalized
catalog rather than reading asset files or Vite glob records themselves.

## Browser and Asset Boundary

Browser/runtime concerns belong in `packages/web`, not in `packages/core`.
Examples include:

- ZIP loading
- downloads
- URL/hash sync
- image loading
- canvas creation
- object URL lifecycle
- local/generated asset materialization
- browser storage
- Vite/dev-server behavior such as fetch concurrency limits

`packages/web/src/adapter/browser-canvas-adapter.ts` is the concrete browser
implementation of core's canvas and image loading port. `zip-loader.ts`,
`zip-export.ts`, `download.ts`, and URL/hash helpers are browser workflows
around the core engine.

The CLI has equivalent Node behavior through CLI-specific adapters and export
workflows outside core. Do not put CLI filesystem, ZIP, or canvas dependencies
into `packages/core/src/**`.

## Executable Architecture Gate

`rtk pnpm check:boundaries` enforces core isolation, presets purity,
public-core import ownership, and component workflow boundaries. The main CI
unit gate invokes it through `pnpm verify`; the publish workflow also runs it
before packaging or publication.

See the [Engineering guide](ENGINEERING.md) for the canonical command matrix,
package-scoped checks, CI mapping, and isolated parity procedure.

## Anti-Patterns

Do not:

- introduce MVC folders for the sake of MVC
- move core compose logic into web
- move browser APIs into core
- bypass attribution metadata
- change public selection/hash/token identity just for architecture cleanliness
- modify `upstream/`
