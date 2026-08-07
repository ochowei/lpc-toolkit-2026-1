# lpc-toolkit

`lpc-toolkit` provides an environment-agnostic TypeScript engine for composing
[Liberated Pixel Cup](https://lpc.opengameart.org/) character spritesheets, a
React web editor, shared outfit presets, and an agent-first Node CLI.

LPC art is distributed as layered body, hair, clothing, weapon, expression,
and accessory sheets. The toolkit turns those layers into one reusable,
attribution-aware composition pipeline that runs in browsers and Node.

## Status

| Package | State | Responsibility |
| --- | --- | --- |
| `packages/core/` | **Working** | Pure catalog, composition, recolor, animation, token, validation, and credits logic. |
| `packages/presets/` | **Working** | Shared themed presets and pure preset-application rules. |
| `packages/web/` | **Working** | React 18, Vite, Tailwind CSS v4, and shadcn-style browser editor. |
| `packages/cli/` | **Working** | Node CLI for named characters, catalog search, validation, tokens, presets, preview, and rendering. |

The composition pipeline, presets, web editor, and CLI are working and tested.

## What Is Included

```text
assets/            active LPC spritesheets, definitions, palettes, and CREDITS.csv
upstream/          optional read-only provenance/reference gitlink
packages/core/     environment-agnostic TypeScript engine
packages/presets/  shared pure preset logic
packages/web/      React/Vite browser application
packages/cli/      Node CLI, filesystem adapters, canvas, ZIP, and JSON output
```

The most important product invariants are:

- `packages/core/` imports no browser, React, Node filesystem, concrete canvas,
  ZIP, web, CLI, or presets implementation.
- Every rendered or exported sprite preserves matching credit metadata from
  the active asset source's `CREDITS.csv`.
- Repository development uses pnpm and strict TypeScript.
- `upstream/` remains optional and read-only; normal workflows neither install
  packages nor write generated files inside it.
- The project metadata declares GPL-3.0-or-later; new dependencies must be
  compatible and require review.

See [`AGENTS.md`](AGENTS.md) for the authoritative Agent rules and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for detailed boundaries.

## Getting Started

Repository development requires Node.js 22 or newer and pnpm 9. Use a standard
clone:

```sh
git clone <repo-url>
cd lpc-toolkit-2026-1
pnpm install --frozen-lockfile
pnpm verify
```

The standard clone does not initialize the submodule. Install, verification,
builds, ordinary E2E, CLI packaging, and publish validation use checked-in or
pinned cache-backed assets and fixtures instead.

Build the reusable packages, web application, and CLI:

```sh
pnpm build
```

The root build covers core, presets, web, and CLI. Core and presets compile
their reusable TypeScript output; web prepares assets and builds the Vite SPA;
CLI builds and vendors the workspace runtime needed by its npm tarball.

Contributor setup, package tours, and focused checks are documented in:

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- [`docs/ENGINEERING.md`](docs/ENGINEERING.md)
- [`docs/RELEASING.md`](docs/RELEASING.md) for authorized maintainers

## Web Editor

Start the local development server:

```sh
pnpm --filter @lpc-toolkit/web dev
```

The web app exposes three top-level product pages: the editor at `/compose`,
the CLI guide at `/cli`, and agent integration guidance at `/agents`. The root
entry `/` currently redirects to `/cli`; it can change independently without
changing the three stable product URLs. The editor keeps attribution reachable
while users compose, preview, and export characters.

## Command-Line Interface

Node.js 22 or newer is required. Install the public package:

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit --help
```

Repository development still uses pnpm. npm/npx here are consumer commands for
the published CLI.

### Character authoring quick start

Create and edit a named character without writing selection JSON by hand:

```sh
lpc-toolkit character create hero --preset farmer
lpc-toolkit character search hero --type hair --query braid --limit 20
lpc-toolkit catalog item hair_braid --json
lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown
lpc-toolkit character set-color hero --type expression --channel eyes --color green
lpc-toolkit character preview hero
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

Named selections live under `./characters/`. Preview and render outputs include
metadata plus TXT and CSV attribution. See
[`packages/cli/README.md`](packages/cli/README.md) for every command, `npx`
usage, cache locations, local asset precedence, output defaults, and
troubleshooting.

### Local D4 distribution verification

The CLI also exposes a local-fixture-only `asset distribution` contract for
the reviewed D4 trust boundary. It can inspect and capture an exact detached
record/archive pair, evaluate an explicitly supplied trust policy and
deterministic verifier fixture, require confirmation before a temporary
consumer-prefix install, select a prior verified rollback candidate, and
verify a fake npm or marketplace receipt:

```sh
lpc-toolkit asset distribution inspect --namespace example --pack-id example.hair --version 1.2.3 --record record.json --archive release.lpc-assets.zip --json
lpc-toolkit asset distribution verify --namespace example --pack-id example.hair --version 1.2.3 --record record.json --archive release.lpc-assets.zip --trust-policy policy.json --verifier verifier.json --json
lpc-toolkit asset distribution post-publication --inspection inspection.json --receipt fake-receipt.json --transport fake-npm --json
```

These commands read only caller-supplied local fixtures. They never discover
or mutate a remote registry/marketplace, create or enroll keys, call
`npm publish`, claim real publication, or mutate a system-wide prefix. Existing
v1 archive inspection/install, attribution, validation, preview, release, D1,
D2, and D3 authorities remain required.

Final render output includes a standalone `<name>.viewer.html` offline animation viewer.

### Artist asset-pack lifecycle

Artists can author, validate, preview, link, and package an asset pack using
only the public CLI. Git and a repository clone are optional; neither the
author nor the consumer needs to initialize `upstream/` or create local base
assets.

These are separate workflows: `character create`/`character set` compose an
existing character; `catalog audit-animations --json` is a read-only audit
handoff; `asset init --new` creates a source item while
`asset init --from-audit` turns a complete audit report into a bounded source
worklist; `asset validate` checks the source; `asset pack` publishes a formal
archive; and `asset inspect`/`asset install` handle a consumer's installation.
The authoring-session commands documented in the [CLI asset lifecycle
guide](packages/cli/README.md#strict-asset-authoring-sessions) coordinate
contract-bound candidate PNGs but do not replace formal archive publication.
After a current attributed preview, a session may pause at three explicit human
release boundaries: one exact warning acknowledgement, a declaration of the
author/source and license authority, and final acceptance of the exact PNG plus
metadata/TXT/CSV credit artifacts. Their `releaseGates` and `releaseReady`
response fields describe session evidence only; no identity or approval is
inferred from Git, an Agent, a provider, or the operating system, and these
receipts do not publish an archive until the separate formal pack boundary.

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit catalog audit-animations --animation climb --json
lpc-toolkit asset workspace init ./my-lpc-art
cd ./my-lpc-art
lpc-toolkit asset init --from-audit audit.json --item hair_braid --pack-id acme.audit --display-name "ACME Audit" --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/audit
lpc-toolkit asset init --new --pack-id acme.fantasy-hair --asset-id moon-braid --display-name "Moon Braid" --type hair --body-type male --body-type female --animation walk --animation climb --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/fantasy-hair
lpc-toolkit asset validate ./artist-packs/<pack-id>
lpc-toolkit asset preview ./artist-packs/<pack-id>
lpc-toolkit asset sync ./artist-packs/<pack-id>
lpc-toolkit asset pack ./artist-packs/<pack-id>
```

For the separate governed authoring-session boundary, use the exact current
evidence and explicit confirmation:

```sh
lpc-toolkit asset authoring acknowledge --session <session-id> --acknowledgement <record.json> --confirm
lpc-toolkit asset authoring declare --session <session-id> --declaration <declaration.json> --confirm
lpc-toolkit asset authoring accept-preview --session <session-id> --preview-digest <sha256> --confirm
```

Phase 2 adds two separate session recovery boundaries. `asset authoring draft`
writes a deterministic, explicitly non-installable recovery archive below the
session's `release-artifacts/` directory and records a digest-bound
`draftArchive` receipt. Existing `asset inspect` reports its `status: "draft"`
and `asset install` rejects it before changing a consumer workspace. After an
explicit confirmation, `asset authoring sync --session <session-id> --confirm`
calls the existing linked-sync transaction and records a `sync` receipt for the
actual manager-owned `assets_custom/` output and registry generation. Without
`--confirm`, sync does not mutate manager output, registry, transaction state,
or the session receipt. Source packs, checked-in assets, the managed base cache,
installed snapshots, unowned output, and `upstream/` remain outside both
operations.

```sh
lpc-toolkit asset authoring draft --session <session-id>
lpc-toolkit asset authoring sync --session <session-id> --confirm
```

Stale manifest, source, validation, warning, preview-input, artifact, or
declaration evidence, draft bytes, registry bytes, or generated output is
preserved for review and requires the structured next action from `status` or
`resume`. Phase 3 adds an explicit session-owned formal boundary: after all
release gates are current, `asset authoring pack --session <session-id> --confirm`
writes a non-draft archive below `release-artifacts/`, and
`asset authoring inspect --session <session-id> --archive <archive>` records
the exact-byte inspection only when its digest matches the formal pack receipt.
Changed or copied archive bytes remain stale/mismatch evidence and are never
adopted silently. Phase 4 adds an optional, explicit consumer activation for
the exact inspected archive. It requires an initialized managed consumer
workspace outside the artist workspace, repository, base cache, and generated
output roots; it never initializes or mutates that workspace before
confirmation. The successful response records an `installationReceipt` with
the consumer identity, installed source payload digests, registry/output
digests, and matching `CREDITS.csv` digest. Consumer drift remains stale
evidence and preserves the previous receipt.

```sh
lpc-toolkit asset authoring pack --session <session-id> --confirm
lpc-toolkit asset authoring inspect --session <session-id> --archive <archive>
lpc-toolkit asset authoring install --session <session-id> --archive <archive> --consumer-workspace <directory> --confirm
```

`asset authoring install` is never implicit after `pack` or `inspect`. Without
`--confirm` it returns a bounded confirmation action without changing the
artist session, archive, or consumer workspace. Repeating the same confirmed
install against unchanged consumer state returns the same installation receipt
without rewriting it; version replacement and downgrade behavior remain owned
by the ordinary `asset install` lifecycle policy.

After exact formal pack and inspection, an author may publish optional
generation provenance as a separate companion receipt and a consumer may verify
copied archive/receipt bytes independently:

```sh
lpc-toolkit asset authoring provenance --session <session-id> [--records <records.json>] --confirm
lpc-toolkit asset provenance verify --archive <archive> --provenance <receipt> --json
```

This evidence describes bounded generation inputs and transformations; it is
not LPC credits, authorship or license authority, human release approval, or a
provider invocation. The receipt stays outside the ZIP and is ignored by
ordinary `asset inspect`/`asset install`; verification is read-only and does not
require the authoring session, a provider, an Agent skill, or a Web bridge.

An optional D2 provider-neutral Agent handoff can sit between the drawing
contract and candidate import. The CLI has no built-in provider, provider
registry, credential store, network client, or bundled authoring skill. An
external integration may supply bounded provider descriptors and coordinate a
provider, but the CLI performs the compatibility checks and remains the sole
authority for session state, candidate inspection, source import, validation,
attribution, and release approval:

```sh
lpc-toolkit agent integration check --manifest manifest.json --json
lpc-toolkit asset authoring provider discover --session <session-id> --contract-digest <sha256> --descriptors providers.json --json
lpc-toolkit asset authoring provider preflight --session <session-id> --contract-digest <sha256> --descriptor provider.json --json
lpc-toolkit asset authoring provider handoff --session <session-id> --descriptor provider.json --consent consent.json --confirm --json
lpc-toolkit asset authoring provider result --session <session-id> --invocation invocation.json --result result.json --candidate candidate.png --workspace ./my-lpc-art --json
```

Discovery reads only explicitly supplied descriptors; preflight is read-only;
handoff requires explicit consent and `--confirm`; and result re-digests a
bounded PNG before staging it below the session-owned provider-candidate root.
Provider output never edits `asset-pack.json`, source PNGs, credits, archives,
or release receipts directly. The existing `asset authoring import` command
must perform the next candidate-to-source mutation, followed by the existing
validation, attributed preview, human declaration, preview acceptance, formal
pack, inspect, and install gates. Unsupported, stale, cancelled, timed-out, or
scope-changing work preserves the last valid checkpoint and returns one safe
next action; optional capability absence is reported as an external-author fallback
and hands the work back to the user. The flow does not add persistent browser
authoring state, and no real provider is invoked by the shipped CLI.

### D5 deterministic authoring intelligence

D5 adds deterministic, catalog-first authoring routing above the existing
session and candidate-import authorities. It can explain a bounded request and
prepare digest-bound variant, recolor, explicit `sprite-drawing-contract.v2`,
or multi-layer candidate operations. It does not require a model, provider,
backend, authentication, network access, or persistent browser authoring state.

```sh
lpc-toolkit asset authoring intelligence route --request "Use hair braid" --catalog catalog-snapshot.json --json
lpc-toolkit asset authoring intelligence stage --session <session-id> --operation operation.json --candidate candidate.png --consent consent.json --workspace ./my-lpc-art --confirm --json
lpc-toolkit asset authoring intelligence recover --session <session-id> --operation-digest <sha256> --action resume --workspace ./my-lpc-art --json
```

Route is read-only. Stage requires exact session, catalog/contract/input,
target, resource, and explicit consent bindings, writes only session-owned
candidate bytes and receipts, and returns `re-import-candidate` rather than
calling import. Replays are verified no-ops; changed inputs, contracts, output
bytes, attribution evidence, or layer scope stop with one safe recovery action.
Import, validation, attributed preview, human review, release, archive, and
installation remain separate existing gates. D2 provider results are optional
validated evidence only, and D3 remains an explicit file-scoped handoff.

### D6 cross-pack conflict review

D6 handles competing pack/version contributions through an explicit, local-file
workflow. `asset conflict inspect` is read-only and reports the canonical
conflict identity, contenders, compatibility/trust eligibility, attribution,
policy, audit evidence, and one safe next action. It never chooses a winner
from version, filesystem order, provider, Agent, `replaces`, or D1/D2/D4/D5
evidence.

```sh
lpc-toolkit asset conflict inspect --conflict conflict.json --json
lpc-toolkit asset conflict resolve --conflict conflict.json --selection selection.json --workspace ./my-lpc-art --confirm --json
lpc-toolkit asset conflict recover --receipt .lpc-toolkit/asset-packs/staging/conflict-resolutions/<conflict-id>/receipt.json --action resume --workspace ./my-lpc-art --confirm --json
```

`resolve` accepts only a complete digest-bound user selection and review
evidence, then stages a receipt below the owned workspace staging root. It does
not import a candidate, rewrite a source pack or `CREDITS.csv`, publish an
archive, modify the registry, install output, or satisfy validation, attributed
preview, human review, or release gates. `recover` resumes an exact receipt or
discards only its D6 staging directory after `--confirm`; stale, tampered,
blocked, and refused outcomes remain auditable. Equivalent contenders may be
coalesced only with retained evidence; disjoint merge still requires explicit
selection and a shared digest-bound base.

D6 uses local fixtures/fakes only. It adds no remote registry, signing/key
operation, marketplace, backend, authentication, network, npm publication, or
persistent browser authoring state. Existing v1 archive/manifest/install/plugin
behavior and the D1 parser remain unchanged; D6 evidence stays session/workspace
evidence until a separate versioned downstream contract accepts it.

### Web-to-CLI handoff

The Web Asset Pack Workbench can explicitly export one stable in-memory
revision as the existing asset archive plus a strict
`lpc-toolkit.web-cli-handoff.v1` sidecar. This is a one-way local-file bridge:
it does not upload, add a backend, or persist browser authoring state.

Review and import the pair in a standalone CLI workspace:

```sh
lpc-toolkit asset authoring handoff inspect --handoff handoff.json --archive pack.lpc-assets.zip --json
lpc-toolkit asset authoring handoff import --handoff handoff.json --archive pack.lpc-assets.zip --plan attach-pack-plan.json --workspace ./my-lpc-art --confirm --json
lpc-toolkit asset authoring handoff recover --handoff handoff.json --archive pack.lpc-assets.zip --workspace ./my-lpc-art --action resume --confirm --json
```

Inspection is read-only; import requires a matching attach-pack plan and
separate human confirmation. Recovery can resume or discard only the exact
CLI-owned staging directory. A successful import writes a separate
`web-handoff-receipt.json` sidecar and leaves the existing v1 session,
validation, preview, candidate-import, D1 provenance, provider, attribution,
and release authorities unchanged. `asset authoring status` may show bounded
`webHandoff` evidence, but stale handoff data is rejected before mutation and
Web handoff is never release approval. Older sessions without the sidecar
remain readable with `webHandoff: null`.

Give the resulting `<pack-id>-<version>.lpc-assets.zip` to a consumer. They use
a separate standalone workspace and run the lifecycle in order:

```sh
lpc-toolkit asset workspace init ./consumer-workspace
cd ./consumer-workspace
lpc-toolkit asset inspect ../my-lpc-art/artist-packs/<pack-id>-<version>.lpc-assets.zip
lpc-toolkit asset install ../my-lpc-art/artist-packs/<pack-id>-<version>.lpc-assets.zip
lpc-toolkit asset list
lpc-toolkit asset doctor
# When the pack is no longer needed:
lpc-toolkit asset remove <pack-id>
```

Put complete animation PNGs under
`artist-packs/<pack-id>/sprites/`. The detailed
[CLI asset lifecycle guide](packages/cli/README.md#artist-asset-pack-authoring-and-lifecycle)
documents audit-derived scaffolds, acknowledgements, deterministic archive
security and limits, compatibility, install/upgrade/downgrade policy, registry
and journal recovery, workspace ownership, attribution, output, and exit
semantics.

Installed packs participate in catalog audit, character preview, and render;
their TXT/CSV attribution retains inherited base credits and pack contributions.
The browser Asset Pack Workbench uploads an existing archive, preserves
matching attribution, validates and repairs it in memory, and downloads draft
or formal corrected archives. Draft archives retain `status: "draft"` and are
rejected by CLI installation until the release gates are satisfied. The CLI
continues to own pack creation, inspection, installation, upgrades, removal,
and lifecycle diagnosis; neither workflow requires cloning this repository.

Catalog and character searches return 20 items by default. Use `--limit 20`
to set a bounded page size, `--offset 20` (or the returned `page.nextOffset`)
to continue the same result set, and `--all` only when an explicit unbounded
result is appropriate. JSON responses include `page.limit`, `page.offset`,
`page.returned`, `page.total`, `page.hasMore`, and `page.nextOffset`. Search
summaries report license families and credit counts; run
`lpc-toolkit catalog item <itemId> --json` to inspect the full matching credits
before selecting an item. Restart at offset zero after changing the catalog
source, custom overlay, query filters, or character selection.

### Character JSON interchange

The web editor's **Save character JSON** action and CLI selection outputs write
the canonical `lpc-toolkit.selection.v2` format. It stores independent
secondary colors in an asset-owned `channelRecolors` map while retaining the
primary `recolor` field. Web import and CLI `--selection` readers accept Toolkit
selection v1 and v2 plus upstream version 1 and version 2 JSON. Read-only CLI
commands migrate these inputs in memory without rewriting the source file.
Successful CLI mutations atomically normalize imported input to Toolkit v2.
Use `character set-color --channel <id> --color <id>` for an explicit
asset-owned color, or `--default` to clear it; linked channels are read-only.
Rendered artifacts still obtain credits from the active asset source rather
than trusting attribution embedded in imported JSON.

### Codex Plugin

1. Install or upgrade the CLI to the range supported by plugin `0.3.0`:

```sh
npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'
```

2. Add the repository marketplace once:

```sh
codex plugin marketplace add ochowei/lpc-toolkit-2026-1
```

3. Install or enable the plugin:

```sh
codex plugin add lpc-toolkit@lpc-toolkit
```

The plugin requires an installed compatible `lpc-toolkit` CLI and does not
automatically install the CLI. Its supported CLI range is
`>=0.2.0 <0.3.0`. Restart the ChatGPT desktop app or start a new Codex
task if the newly installed skill is not visible. Public Plugins Directory
distribution can later remove the marketplace-add step.

The plugin offers three goal-based journeys: build a character from existing
catalog art, run `catalog audit-animations` and extend one confirmed missing
animation, or create a new asset for a supported LPC layout. The audit stage is
read-only; source mutation and optional provider disclosure require explicit
confirmation. Asset authoring stops at a validated, attributed review-ready
preview. Formal release and installation remain separate human-confirmed CLI
steps. Preview, render, and export outputs preserve metadata plus TXT and CSV
credits.

The CLI performs first-time asset preparation from a pinned release download,
verifies checksums, and stores a platform cache. Later commands rely on
verified cache reuse. A valid offline cache needs no network; a missing or invalid
offline cache fails with recovery guidance. A complete working-directory
`assets/` tree takes precedence outside an artist workspace, with
`assets_custom/` applied as an overlay. Inside an initialized artist workspace,
asset-dependent commands use the same verified managed-cache baseline as
lifecycle compilation and activate only an authenticated registry v2 generation.

CLI rendering writes the composed sheet with required metadata and credit
files, plus optional animation strips, frames, and ZIP bundles. Node-specific
dependencies such as `@napi-rs/canvas` (MIT) and `jszip` (MIT) remain in the CLI
package and outside core runtime source.

## Core Library

The core does not load files or create canvases. Callers supply a
`CanvasAdapter`:

```ts
interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(path: string): Promise<ImageLike>;
}
```

Concrete browser and Node implementations remain outside
`packages/core/src/`. See the
[`packages/core/README.md`](packages/core/README.md) for the executable example,
public API map, attribution contract, and link to full exported signatures.

The standard animation atlas is `832×3456` pixels.
For custom-animation source sheets, callers must not assume those dimensions:
each block is computed as `frameSize × columns` by `frameSize × rows` and
appended to the composed sheet.

## Architecture and Contributing

The repository follows a core-first, ports-and-adapters dependency direction:

```text
web ───────┐
           ├──> presets ──> core
CLI ───────┘          └────> core
```

Web components render and dispatch; pure `slice/` helpers own selection
decisions; hooks own effects and async orchestration; browser adapters/libs own
canvas, ZIP, download, storage, and URL behavior. CLI-specific filesystem,
canvas, persistence, cache, and publication behavior remains in the CLI.

Read the [architecture guide](docs/ARCHITECTURE.md) before broad package or web
responsibility changes. Read [CONTRIBUTING.md](CONTRIBUTING.md) before preparing
a pull request. The isolated parity checkout is the only executable upstream
source checkout; it is separate from the tracked read-only gitlink.

## Design Reference

The production web app uses a layer sidebar and sidebar splitter beside the
preview canvas. Its top-bar popovers own settings and export actions, and the
responsive layout collapses the same workflow into mobile navigation without
changing composition or attribution behavior.

The checked-in
[Layer Stack reference](reference/v2/LPC-Toolkit-LayerStack.html) is design
reference material; the production implementation remains the React/Vite app.

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE). The project inherits GPL-3.0 source
and LPC asset obligations from upstream; keep generated attribution metadata
with composed output and comply with the effective licenses it reports.
