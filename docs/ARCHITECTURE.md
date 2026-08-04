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
- pure playback descriptions for composed standard and custom animations
- credits and attribution manifests
- strict artist asset-pack schema, normalized models, validation decisions,
  warning acknowledgements, and deterministic compile plans
- pure asset-release declaration and receipt schemas, canonical digest
  projections, exact preview artifact identifiers, and release-gate predicates
- hash/token serialization and parsing
- the canonical character document and pure upstream compatibility adapter
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
- atomic canonical normalization writes and response warnings for imported
  upstream character documents
- catalog-backed character editing, search, and validation decisions
- transactional attributed preview and render publication
- Node `CanvasAdapter` wiring through `@napi-rs/canvas`
- render output staging and atomic publishing
- metadata, credits, animation, frame, and ZIP artifact writing
- self-contained offline animation viewer generation
- token and preset commands for automation
- standalone artist-workspace discovery and ownership
- artist pack scaffolding, PNG inspection, attributed preview, linked-pack
  registry orchestration, deterministic archive inspection/packaging,
  linked/installed desired-state compilation, and journaled publication/recovery
- strict release declaration and preview-acceptance input handling, session
  receipt persistence, current evidence collection, artifact re-digestion, and
  bounded human/JSON release-gate responses

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

The plugin's current character and animation skills intentionally stop before
the newer authoring-session release capability. They do not claim or invoke
`asset-authoring-release.v1`,
`lpc-toolkit.asset-release-declaration.v1`,
`lpc-toolkit.asset-authoring-release-receipt.v1`, or the
`acknowledge`/`declare`/`accept-preview` commands; the installed CLI remains
the sole owner of those release receipts.

### Release evidence ownership

Core owns the environment-agnostic declaration, discriminated receipt, exact
artifact-ID, canonical digest, and release-gate contracts. It never reads a
session file or decides who a human is. The CLI owns strict user-file loading,
manifest/source containment, session receipt timestamps, atomic persistence,
fresh validation and attribution evidence, preview artifact re-digestion, and
the explicit `--confirm` boundaries. A preview is not release-ready by itself:
the CLI must expose current acknowledgement, validation, declaration, preview,
four-artifact, and preview-acceptance gates before a session can report
`releaseReady: true`. These Phase 1 receipts remain authoring-session state and
do not create a formal archive, sync a generated overlay, or install a pack.

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

## Character JSON Interchange

Core owns canonical character document v2 (`lpc-toolkit.selection.v2`), strict
v2 parsing, Toolkit v1-to-v2 in-memory migration, and the pure upstream
compatibility adapter for upstream version 1 and version 2 documents. Primary
color remains in `recolor`; independent secondary values are asset-owned in
`channelRecolors`, and linked channels cannot store values. The adapter
identifies its source as `canonical`, `upstream-v1`, or `upstream-v2`, validates
resolved items and channel values against the current catalog and palettes, and
returns a v2 selection payload. Imported `credits` and rendered `layers` are not
part of the selection contract and are ignored; composition recomputes
attribution from the active asset source.

Core also owns color-channel discovery, authored defaults, link resolution,
same-name channel independence across assets, deterministic hash/token v2
encoding, and the lossy compatibility projection used for upstream links.
Only an explicit `linked_to` declaration may synchronize a channel; the
selected `body` asset's primary channel is the sole body-color source. The Web
may present projection losses, but it must not forward toolkit-only v2 fields
to upstream or reinterpret which value the Core projection retained.

The Web owns browser file-picker and download I/O. Components dispatch import
and save intent, while hooks and browser helpers read a selected file, call the
Core adapter, apply the validated selection, and download only canonical
character JSON. The CLI owns filesystem reads and writes, atomic replacement,
and normalization warnings. Read-only commands may convert an upstream document
in memory but never rewrite it. After a successful mutation, the CLI atomically
normalizes upstream input to the canonical format; failed imports or mutations
leave the original bytes unchanged.

CLI color edits use the catalog-backed `character set-color` command. CLI
parses command intent and owns atomic persistence and human/JSON responses;
Core-derived channel metadata remains the authority for valid IDs, colors,
defaults, and read-only links. Plugins must invoke this public command instead
of mutating `recolor` or `channelRecolors` by hand.

The canonical character document is a portable selection payload, not the CLI
JSON response envelope. CLI `--json` responses continue to wrap command data,
warnings, and errors separately, and any character document written to disk is
canonical regardless of its input format.

Render publication stages the self-contained offline viewer with the attributed
sheet, metadata, TXT and CSV credits, optional pixel exports, and ZIP before
publishing the artifact set transactionally. The viewer uses relative sibling
filenames and contains no absolute local paths.

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

1. Outside an artist workspace, a complete working-directory `assets/` tree
   takes precedence.
2. Otherwise, the verified platform cache for the pinned release is created or
   reused.
3. The working-directory `assets_custom/` tree overlays custom definitions and
   sprites without replacing the base asset source.

Asset-dependent runtime commands discovered inside an initialized artist
workspace are the deliberate exception: they always prepare the verified
managed cache used by lifecycle compilation, never a coincidental local
`assets/` tree.

Verified cache reuse requires no network access. Offline first use, a missing
release, checksum failure, corrupt archive, or incomplete cache produces a
typed cache error with release and cache-path context; it never silently falls
back to the read-only submodule.

The `AssetStore` port isolates logical sprite lookup from storage. A complete
local tree uses `createDirectoryAssetStore`; the managed compressed cache uses
`createZipAssetStore`, its sprite index, and lazy category ZIP reads. Both stay
inside `packages/cli/` and supply core through its injected image-loading port.

### Phase 1 artist asset-pack flow

Core owns the strict `lpc-toolkit.asset-pack.v1` source schema, normalized pack
identity and body/layer inheritance, catalog and geometry validation,
acknowledgement matching, deterministic patch/credit/conflict decisions, and
the compile plan. These are pure values: Core receives catalog, palette,
source-digest, and pixel-inspection inputs and never reads an artist workspace
or imports Node filesystem/canvas implementations.

The CLI owns the `lpc-toolkit.asset-workspace.v1` marker/config contract and
the filesystem flow:

```text
artist-packs/<pack-id>/asset-pack.json + sprites/
  -> safe read and complete-PNG inspection
  -> Core validation and compile plan
  -> temporary attributed preview, or complete linked desired state
  -> manager-owned assets_custom/ plus registry.json
```

For the documented new `acme.fantasy-hair` item plus the `hair_messy` climb
extension, linked sync generates this exact overlay layout:

```text
assets_custom/
├── .lpc-toolkit-managed.json
├── CREDITS.csv
├── sheet_definitions/
│   └── hair/
│       ├── acme.fantasy-hair--moon-braid.json
│       └── hair_messy.json
└── spritesheets/
    ├── hair/
    │   └── messy/
    │       └── climb.png
    └── packages/
        └── acme.fantasy-hair/
            └── moon-braid/
                └── foreground/
                    └── male-female/
                        ├── climb.png
                        └── walk.png
```

Every definition, PNG, `CREDITS.csv`, and `.lpc-toolkit-managed.json` in that
tree is generated manager output. Artists edit only the manifest and source
PNGs below `artist-packs/<pack-id>/`, then resync; generated output is never an
authoring input.

The compile baseline is the active base catalog plus any explicitly supplied
unmanaged baseline, with this workspace's manager-generated output excluded.
That exclusion prevents the generated overlay from changing its own baseline
definition and credit digests. Artist source remains below `artist-packs/`;
manager output never becomes source input.

The Phase 1 registry records linked source directories, content/source digests,
baseline definition and credit digests, and every generated logical path. The
CLI alone owns that registry and the output marker. It refuses unowned,
mismatched, or tampered output and rebuilds all active linked packs as one
desired state, so no pack wins implicitly by write order.

Runtime composition receives an injected overlay `AssetStore`. It resolves
only compiler-authorized generated logical paths before delegating to the
unchanged directory or ZIP base store; arbitrary files in `assets_custom/`
cannot shadow the base. The wrapped runtime points catalog loading at generated
sheet definitions without mutating the prepared base runtime.

New-item selection identity is stable: definition basename,
`ItemDefinition.name`, and persisted catalog identity are all
`<pack-id>--<local-id>`, while `display_name` remains the artist-facing label.
Existing-item extensions retain the baseline name and identity.

Attribution follows the same compile path as pixels. Each physical source has
one complete pack credit record; extension output unions inherited baseline
credits with the pack contribution, and an override replaces only that
contribution. The compiler emits generated credits, overlay composition freezes
them into `ComposedSheet.credits`, and preview/render publication writes the
PNG plus metadata and TXT/CSV credit artifacts from that frozen manifest.

Phase 1 linked sync stages the complete generated overlay and registry,
validates all paths and credits, and only then publishes. Its original caught
failure boundary restored prior bytes or retained explicit recovery paths.
Phase 2 generalizes that publisher into the durable journal described below and
routes linked sync through the same desired-generation transaction as install
and removal.

### Phase 2 archive and installed lifecycle

Directory sources and archives converge at one immutable payload snapshot:
normalized `lpc-toolkit.asset-pack.v1` source, captured manifest/source bytes,
source digests, PNG inspections, and content digest. Packaging performs fresh
source, geometry, pixel, compatibility, acknowledgement, and attribution
validation; inspection/install never trust a prior validation result or a
mutable artist path.

Archive writing is deterministic, but untrusted reading has a separate trust
boundary. The reader validates encoded size, the end record, central and local
headers, paths, flags, regular-file type, compression method, CRC/checksum
coverage, and exact limits before bounded inflation or PNG decode. Only
`asset-pack.json`, strict `lpc-toolkit.asset-pack-checksums.v1`, and referenced
`sprites/**` files are accepted. ZIP64, encryption, aliases/collisions,
directories, links, special files, unsafe paths, unsupported compression, and
checksum drift are rejected. A verified snapshot alone may enter extraction.

Installed payloads are manager-owned and content-addressed:

```text
<stateRoot>/installed/<pack-id>/<version>/<archive-digest>/
├── asset-pack.json
├── sprites/
└── install-receipt.json
```

The strict receipt binds the workspace ID, pack/content/archive identity,
installation time, and exact extracted payload digests. Installed-source reads
recheck containment, directory identity, receipt coverage, and payload bytes;
unknown or symlink-escaped content never becomes active.

Registry `lpc-toolkit.asset-workspace-registry.v2` is a sorted union of linked
and installed source entries. It records source and generated digests,
acknowledgements, logical destinations, sprite consumers/ownership,
replacements, baseline definition/credit digests, generated credits, and a
compile digest. A valid Phase 1 v1 registry can be read and enriched from fresh
linked snapshots, but every Phase 2 publication writes only v2.

`prepareAssetPackDesiredState` is the lifecycle compiler. Under one source
snapshot it loads all active linked/installed packs, applies exactly one
upsert/removal mutation, reuses Core replacement/conflict decisions, compiles
the whole set in pack-ID order, produces every manager-owned output byte, and
projects the matching v2 registry. There is no incremental last-writer-wins
overlay mutation.

Install policy compares strict Core semantic versions. Greater is upgrade;
equal plus identical archive digest is no-op; equal plus different bytes is a
conflict. A lower version requires an incoming self-replacement matching the
installed version and exactly covering its asset keys. An installed candidate
cannot replace an active linked entry with the same ID; the linked pack must be
removed first. Cross-pack replacement remains exact and compiler-authorized.

Sync, install/upgrade/downgrade, and remove publish through durable journal
`lpc-toolkit.asset-pack-transaction.v1`:

```text
prepared -> output-published -> sources-published -> registry-published
```

The transaction pins manager-owned directories and source identities, stages
complete output/registry bytes, fsyncs durable boundaries, and uses an explicit
cleanup allowlist. Recovery rolls back phases before registry publication and
completes phases at/after registry publication; a second recovery is
idempotent. Installed source cleanup occurs only after the replacement registry
and output are durable. Linked removal never deletes artist source.

Lifecycle reads recover a valid interrupted transaction before observing state.
`asset doctor` then audits registry, linked/installed source snapshots,
generated output, ownership, compile projection, baseline definitions/palettes,
and attribution against one authenticated generation. Healthy/tampered audits
are read-only: the only allowed mutation is deterministic rollback/completion
of a valid manager journal. Doctor never adopts, repairs, or deletes unknown
content.

At runtime, only registry v2 is activatable; v1 remains readable by lifecycle
manager commands solely so their next successful publication can migrate it.
Activation holds the exclusive lifecycle claim while it revalidates linked and
installed sources, receipts, generated output, and the freshly compiled desired
state over the managed-cache baseline. It then captures generated definition,
palette, and sprite data in memory, and the claim remains held until the command
finishes consuming that snapshot. Catalog audit, character preview, render,
frame, viewer, bundle, metadata, TXT, and CSV paths therefore cannot mix
generations or allow arbitrary `assets_custom/` shadowing. Composition still
freezes one credit manifest; extension credits union inherited base credits
with the pack contribution, and all publication formats preserve that complete
attribution.

The browser Asset Pack Workbench uploads a bounded archive into a Worker-owned
in-memory session. Shared `asset-pack-format` ports inspect safe, repairable,
and verified results; the baseline loader supplies pinned catalog, palette,
credit, and CLI-version data; the preview overlays compiled pack sprites only
over official paths; and release fingerprints/formal candidates gate exact
revision downloads. Draft output adds `status: "draft"`; formal output must
clear it and preserve governed acknowledgements. Attribution remains attached
to preview, draft, formal, and CLI lifecycle paths. The Web reuses the Core
schema and does not introduce an alternate manifest format.

### Strict authoring session foundation

The shipped authoring foundation is a provider-neutral CLI application layer
around the pure Core plan and drawing contracts. Core owns strict parsing for
`lpc-toolkit.asset-authoring-plan.v1` and deterministic planning for
`lpc-toolkit.sprite-drawing-contract.v1`; it receives plan, catalog, geometry,
credit, and source-evidence values as inputs and never reads a workspace,
invokes a provider, or writes a PNG. The CLI owns the Node filesystem session,
candidate trust boundary, digest checkpoints, receipt invalidation, and the
existing validation/preview leaf commands.

`lpc-toolkit capabilities --json` advertises the shipped capability identifiers
`asset-authoring-session.v1`, `sprite-drawing-contract.v1`,
`asset-authoring-candidate-import.v1`, and `asset-authoring-recovery.v1`.
Their public schema set is
`lpc-toolkit.asset-authoring-plan.v1`,
`lpc-toolkit.asset-authoring-session.v1`,
`lpc-toolkit.asset-authoring-response.v1`, and
`lpc-toolkit.sprite-drawing-contract.v1`. Contract artifact metadata is
session-local and uses `lpc-toolkit.asset-authoring-artifact-metadata.v1`; it
is not a publishable asset-pack schema.

The public session flow is `start`, `status`, `resume`, `contract`, `import`,
`validate`, `preview`, and `reconcile-manifest` below
`asset authoring`. A strict plan may describe `new-item`, `extend-item`, or
`attach-pack`; the current contract planner supports drawing targets for the
first two goals and explicitly refuses to publish a drawing contract for
`attach-pack`. The CLI records session state below
`.lpc-toolkit/asset-packs/authoring-sessions/<session-id>/`, while the
publishable source remains the ordinary
`artist-packs/<pack-id>/asset-pack.json` and `sprites/` tree. Session state is
not silently embedded in a formal archive.

Contract generation writes `contract.json`, metadata, transparent templates,
guides, and any attributed working/reference artifacts in a session-owned
`contract-artifacts/` directory. Metadata binds every artifact to the session
and contract digest and marks it `importable: false`. Candidate import accepts
only a workspace-contained regular transparent RGBA PNG with exact contract
geometry and a supplied contract digest; artifact paths or bytes cannot be
reused as candidates. New targets write only the declared artist-pack source
path. Replacement requires explicit `--replace-existing` plus the exact
currently observed `--expected-target-digest`. External PNG drift and manifest
drift block the session and expose digest-bound review/reconcile actions;
`resume` never chooses external or session bytes implicitly.

Validation and preview receipts bind the current manifest/source digests and,
for preview, the requested input and validation revision. A source correction
clears stale receipts and requires validation again. Warnings still require
the existing structured acknowledgement and human reason. Preview artifacts
remain the existing attributed PNG, metadata, TXT-credit, and CSV-credit files
under the artist pack. New-item credits come from declared human draft credits;
extension contracts preserve inherited source attribution. Neither the
authoring session nor the Web Workbench invokes a drawing provider or creates
a second attribution path.

Animation audit remains read-only and provider-neutral.
`catalog audit-animations --json` reports unsupported, missing-file, blank-frame, and
inspection-error findings without writing; only a complete report can feed
`asset init --from-audit` or explicit extend-item remediation evidence. The Web
Workbench remains an in-memory archive repair/download surface for draft or
formal archives, not a bridge to the CLI authoring session. All authoring
session reads and writes stay in the standalone workspace; they do not modify
checked-in assets, the verified base cache, generated `assets_custom/` output,
installed snapshots, or the dormant read-only `upstream/` gitlink.

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

`pnpm check:boundaries` enforces core isolation, presets purity,
public-core import ownership, and component workflow boundaries. The main CI
unit gate invokes it through `pnpm verify`; the publish workflow also runs it
before packaging or publication.

AI agents should prefix this command with `rtk`; human contributors may run it
directly.

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
