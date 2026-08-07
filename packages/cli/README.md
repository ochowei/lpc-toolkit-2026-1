# @lpc-toolkit/cli

Node.js 22+ CLI for cataloging, validating, and rendering attributed
[Liberated Pixel Cup](https://lpc.opengameart.org/) character sprites.

## Install and run

Install the public package globally:

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit --help
```

Or run it without a global install:

```sh
npx @lpc-toolkit/cli --help
```

The package installs only the `lpc-toolkit` binary. Node.js 22 or newer is
required.

## Character authoring quick start

Create and edit a named character without writing a selection JSON file:

```sh
lpc-toolkit character create hero --preset farmer
lpc-toolkit character search hero --type hair --query braid --limit 20
lpc-toolkit catalog item hair_braid --json
lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown
lpc-toolkit character set-color hero --type expression --channel eyes --color green
lpc-toolkit character preview hero
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

The character selection is saved under `./characters/`. Preview and render
commands write the sprite together with metadata and both TXT and CSV credit
files; keep those attribution artifacts with the generated image.

## Artist asset-pack authoring and lifecycle

An artist can create and test local LPC asset packs using only the published
CLI. Cloning this repository, initializing `upstream/`, and creating a local
`assets/` directory are unnecessary.

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit asset workspace init ./my-lpc-art
cd ./my-lpc-art
lpc-toolkit asset init --new --pack-id acme.fantasy-hair --asset-id moon-braid --display-name "Moon Braid" --type hair --body-type male --body-type female --animation walk --animation climb --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/fantasy-hair
lpc-toolkit asset validate ./artist-packs/<pack-id>
lpc-toolkit asset preview ./artist-packs/<pack-id>
lpc-toolkit asset sync ./artist-packs/<pack-id>
lpc-toolkit asset pack ./artist-packs/<pack-id>
lpc-toolkit asset workspace init ../consumer-workspace
cd ../consumer-workspace
lpc-toolkit asset inspect ../my-lpc-art/artist-packs/<pack-id>-<version>.lpc-assets.zip
lpc-toolkit asset install ../my-lpc-art/artist-packs/<pack-id>-<version>.lpc-assets.zip
lpc-toolkit asset list
lpc-toolkit asset doctor
```

Place every authored PNG below
`artist-packs/<pack-id>/sprites/`. Phase 1 accepts one complete PNG for each
declared animation, layer, effective body-type group, and optional variant. It
does not assemble separate frame images, extract base pixels, or generate
runtime-recolor PNGs.

### Workspace and generated output

`asset workspace init <directory>` creates this standalone layout without
preparing the managed asset cache or making a network request:

```text
my-lpc-art/
├── lpc-asset-workspace.json
├── artist-packs/
│   └── <pack-id>/
│       ├── asset-pack.json
│       ├── sprites/
│       └── previews/                  created by asset preview
├── assets_custom/
│   └── .lpc-toolkit-managed.json
└── .lpc-toolkit/
    ├── asset-packs/
    │   ├── registry.json              created by first successful publication
    │   ├── installed/                 verified installed archive snapshots
    │   ├── transaction.json           present only during active/recoverable work
    │   ├── transactions/              operation staging/backups while journaled
    │   ├── validation/
    │   └── staging/
    └── authoring-sessions/
        └── <session-id>/
            ├── provider-candidates/   session-owned, re-digested result PNGs
            ├── intelligence-receipts/ deterministic D5 operation evidence
            ├── web-handoff-receipt.json  optional Web-to-CLI import sidecar
            └── release-artifacts/     deterministic draft/formal/provenance outputs
```

The workspace config uses schema `lpc-toolkit.asset-workspace.v1` and records
the source, generated-output, and manager-state directories. Asset commands
find it by walking upward from the current directory. Use
`--workspace <directory>` to resolve exactly that workspace instead, which is
useful for automation.

Workspace initialization refuses a non-empty `assets_custom/` directory that
does not have the CLI-created management marker. Sync likewise refuses missing,
mismatched, or tampered ownership data; it never adopts unknown output. The
artist source in `artist-packs/` remains authoritative. `assets_custom/` and
`.lpc-toolkit/asset-packs/` are reproducible manager-owned state.

After syncing the example `acme.fantasy-hair` new-item pack and an
`acme.messy-climb` extension for `hair_messy`, the generated output has this
exact shape:

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

The definitions under `sheet_definitions/`, complete animation PNGs under
`spritesheets/`, merged `CREDITS.csv`, and management marker are all generated
and owned by the CLI. Do not edit them. Edit `asset-pack.json` or the source
PNGs under `artist-packs/<pack-id>/sprites/`, then run `asset sync` again.

Workspace creation needs no base assets. The first later command that needs
catalog data or pixels prepares or reuses the existing pinned, verified managed
cache with the workspace root as its working context. A valid cache is reused
offline. Artist commands never write the pack into that cache, checked-in
assets, or `upstream/`.

### Asset commands, options, and defaults

Every leaf command accepts `--help`; every command below also accepts `--json`.

| Command | Options and behavior |
| --- | --- |
| `asset workspace init <directory>` | Create or reopen the exact standalone workspace. It does not accept `--workspace` and does not prepare runtime assets. |
| `asset init --new` | Requires `--pack-id`, `--display-name`, `--asset-id`, `--type`, one or more `--body-type`, one or more `--animation`, one or more `--author`, and one or more `--license`. Optional: `--version` (default `0.1.0`), repeatable `--url`, `--notes`, `--advanced`, `--out`, and `--workspace`. |
| `asset init --from-audit <report.json>` | Requires the common pack/credit options plus at least one repeatable `--item` or `--type`. Repeatable `--animation` and `--body-type` narrow the report selection. Optional: `--version`, repeatable `--url`, `--notes`, `--out`, and `--workspace`. It is mutually exclusive with `--new`. |
| `asset validate <pack-directory>` | Validate the strict manifest, active catalog, complete PNG geometry/pixels, credits, ownership, conflicts, and acknowledgements. Optional: `--workspace`. |
| `asset preview <pack-directory>` | Build a temporary overlay and write attributed PNG, metadata, TXT credits, and CSV credits below `<pack>/previews/<asset-id>/` without changing active sync state. Optional: `--asset`, `--animation`, `--body-type`, `--character <selection.json>`, and `--workspace`. The default preview uses a standard farmer body. |
| `asset sync <pack-directory>` | Validate all active linked packs, rebuild the complete desired overlay, and link this source pack in the workspace registry. Optional: `--workspace`. |
| `asset pack <pack-directory>` | Freshly validate source, complete PNGs, compatibility, acknowledgements, and attribution, then atomically publish `<pack-parent>/<pack-id>-<version>.lpc-assets.zip`. Optional: `--workspace`. |
| `asset inspect <archive>` | Strictly inspect and validate an archive without installing it. This command has no workspace option; it reports schema `lpc-toolkit.asset-pack-inspection.v1`, digests, entry/byte counts, diagnostics, and acknowledgement records. |
| `asset provenance verify --archive <archive> --provenance <receipt>` | Read-only verification of an exact copied formal archive and its optional external generation-provenance receipt. This command has no workspace option and never writes a session or consumer workspace. |
| `asset conflict inspect|resolve|recover` | Inspect a bounded cross-pack conflict, stage only an explicit digest-bound resolution, or resume/discard one exact staging receipt. No automatic winner, import, release, or installation is implied. |
| `asset install <archive>` | Inspect the immutable archive snapshot, stage it below manager state, compile all active packs, and publish the installed source, generated output, and registry together. Optional: `--workspace`. |
| `asset distribution inspect|verify|fetch` | Read only caller-supplied local D4 record/archive fixtures. `inspect` captures exact bytes without trust; `fetch` uses only the local fixture transport; `verify` evaluates an explicit trust policy and deterministic verifier fixture. No network adapter is available. |
| `asset distribution install` | After the same exact record/archive/trust/evidence checks, return confirmation or delegate to the existing installer only for `--prefix-kind temporary-consumer-prefix`. `system-wide-prefix` is always refused. |
| `asset distribution rollback` | Select one explicitly named prior verified immutable candidate with `mutation: none`; it never deletes, rewrites, or replaces published evidence. |
| `asset distribution post-publication` | Verify a caller-supplied fake npm or fake marketplace receipt against a local package inspection. `fake-receipt-verified` is not real publication evidence. |
| `asset list` | List active linked and installed entries in pack-ID order, including version, source kind/path, content digest, and installed archive digest. Optional: `--workspace`. It does not prepare base assets. |
| `asset remove <pack-id>` | Deactivate one linked or installed pack and publish the remaining desired state. Optional: `--workspace`. Linked artist source is retained; an installed source is deleted only after output and registry publication. |
| `asset doctor` | Recover only a valid interrupted manager transaction, then audit registry, linked/installed sources, generated output, ownership, compile state, and attribution. Optional: `--workspace`. There is no `--repair` mode. |

### D4 local distribution and trust contract

The additive D4 CLI surface is deliberately local-only during this release
cycle. Every input is an explicit local record, archive, policy, verifier,
evidence, candidate, inspection, or fake receipt fixture. The public response
schema is `lpc-toolkit.asset-distribution-verification.v1` and returns a
bounded `state`, `decision`, exact identity/digests when available, one or
more stable `nextActions`, and explicit `mutation`/`publication` fields. It
does not return archive bytes, private paths, credentials, private keys, raw
provider payloads, or approval text.

The advertised additive identifiers are:

- `asset-pack-remote-distribution.v1`
- `asset-pack-signature-verification.v1`
- `asset-pack-global-install.v1`
- `asset-pack-npm-publication.v1`
- `lpc-toolkit.asset-distribution-release.v1`
- `lpc-toolkit.asset-distribution-verification.v1`
- `lpc-toolkit.asset-distribution-trust-policy.v1`

Example local workflow:

```sh
lpc-toolkit asset distribution inspect --namespace example --pack-id example.hair --version 1.2.3 --record record.json --archive release.lpc-assets.zip --json
lpc-toolkit asset distribution verify --namespace example --pack-id example.hair --version 1.2.3 --record record.json --archive release.lpc-assets.zip --trust-policy policy.json --verifier verifier.json --json
lpc-toolkit asset distribution install --namespace example --pack-id example.hair --version 1.2.3 --record record.json --archive release.lpc-assets.zip --trust-policy policy.json --verifier verifier.json --evidence evidence.json --workspace ./consumer-prefix --prefix-kind temporary-consumer-prefix --confirm --json
lpc-toolkit asset distribution rollback --candidates candidates.json --selected <identity> --prior-receipt-digest <sha256> --json
lpc-toolkit asset distribution post-publication --inspection inspection.json --receipt fake-receipt.json --transport fake-npm --json
```

`inspect`, `verify`, `fetch`, `rollback`, and post-publication verification
are read-only. Install without `--confirm` returns `needs-user-action` and
does not mutate the prefix. Existing v1 archive inspection/install, matching
`CREDITS.csv`, validation, preview, human release gates, D1 provenance, D2
provider evidence, and D3 handoff remain authoritative. D4 does not create or
enroll keys, contact a registry or marketplace, run `npm publish`, claim a
real publication, or mutate a system-wide prefix.

The Phase 2 `--json` success payloads are stable command reports:

- `asset pack`: `packId`, `version`, `contentDigest`, `archiveDigest`, absolute
  `archivePath`, and `entryCount`.
- `asset inspect`: schema `lpc-toolkit.asset-pack-inspection.v1`, absolute
  `archivePath`, available archive/pack/content digests and identity, `valid`,
  `entryCount`, `totalUncompressedBytes`, sorted diagnostics, and exact
  `acknowledgementRecords`.
- `asset provenance verify`: schema
  `lpc-toolkit.asset-release-provenance-verification.v1`, exact archive and
  companion-receipt bindings, and bounded human-evidence flags. It is read-only.
- `asset install`: `action`, identity/version/archive digest, absolute
  `installedDirectory`, `outputPath`, and generated-file count.
- `asset list`: recovery action plus sorted entries with identity, version,
  display name, `linked`/`installed` kind, source path, content digest, and the
  archive digest for installed entries.
- `asset remove`: removed identity/kind, remaining sorted pack IDs/count, and
  generated-file count.
- `asset doctor`: schema `lpc-toolkit.asset-pack-doctor.v1`, `healthy`, recovery
  action, deterministically sorted checks, and sorted active pack summaries.

Common scaffold credit flags are repeatable `--author <name>`,
`--license <license>`, and `--url <url>`; `--notes <text>` supplies credit
context. `--out <directory>` must remain below this workspace's
`artist-packs/`. The advanced new-item mode adds a sibling authoring README but
keeps `asset-pack.json` strict JSON.

Audit scaffolding accepts only a complete successful
`catalog audit-animations --json` response. `unsupported` findings preserve
their inferred or manual-review evidence; inferred destinations remain warnings
until accepted and acknowledged. `missingFiles` uses the report's exact path.
`blankFrames` cannot be scaffolded in Phase 1, and audit `errors` never become
drawing tasks. Recolors remain consumer metadata rather than extra source PNGs.
If any selected finding is not scaffoldable, no partial pack is published.

Validation errors always block preview and sync. Warnings also block until the
manifest contains the exact acknowledgement record returned by validation,
bound to its diagnostic code, structured subject, and current content digest,
with a non-empty human reason. Changing substantive manifest data or a source
PNG invalidates the acknowledgement; changing only the acknowledgement array
does not change the content digest. There is no broad force or ignore-warnings
flag.

### Strict asset-authoring sessions

The CLI also exposes a provider-neutral, resumable authoring foundation. It
does not invoke an image provider and it does not treat a generated artifact as
an input. An external artist or tool stages a candidate PNG inside the
workspace; the CLI verifies the candidate against the session's drawing
contract before importing it into the artist pack.

Discover the public contract without preparing the asset cache:

```sh
lpc-toolkit capabilities --json
```

The advertisement includes these capability identifiers:

- `asset-authoring-session.v1`
- `sprite-drawing-contract.v1`
- `asset-authoring-candidate-import.v1`
- `asset-authoring-recovery.v1`
- `asset-authoring-provider-discovery.v1`
- `asset-authoring-provider-invocation.v1`
- `agent-integration-packaging.v1`
- `asset-authoring-release.v1`
- `asset-authoring-release-provenance.v1`
- `asset-authoring-web-cli-handoff.v1`
- `asset-authoring-web-cli-recovery.v1`
- `asset-authoring-draft-recovery.v1`
- `asset-authoring-consumer-install.v1`
- `asset-authoring-intelligence-routing.v1`
- `asset-authoring-deterministic-operations.v1`
- `asset-authoring-custom-geometry.v1`
- `asset-authoring-multi-layer-candidates.v1`
- `asset-pack-conflict-resolution.v1`

and these schema identifiers:

- `lpc-toolkit.asset-authoring-plan.v1`
- `lpc-toolkit.asset-authoring-session.v1`
- `lpc-toolkit.asset-authoring-response.v1`
- `lpc-toolkit.web-cli-handoff.v1`
- `lpc-toolkit.asset-authoring-web-handoff-receipt.v1`
- `lpc-toolkit.sprite-drawing-contract.v1`
- `lpc-toolkit.asset-provider-descriptor.v1`
- `lpc-toolkit.asset-provider-discovery.v1`
- `lpc-toolkit.asset-provider-invocation.v1`
- `lpc-toolkit.asset-provider-result.v1`
- `lpc-toolkit.asset-provider-refusal.v1`
- `lpc-toolkit.agent-integration-manifest.v1`
- `lpc-toolkit.asset-release-declaration.v1`
- `lpc-toolkit.asset-authoring-release-receipt.v1`
- `lpc-toolkit.asset-authoring-draft-receipt.v1`
- `lpc-toolkit.asset-authoring-formal-archive-receipt.v1`
- `lpc-toolkit.asset-authoring-archive-inspection-receipt.v1`
- `lpc-toolkit.asset-authoring-install-receipt.v1`
- `lpc-toolkit.asset-release-provenance.v1`
- `lpc-toolkit.asset-release-provenance-verification.v1`
- `lpc-toolkit.asset-authoring-intelligence-request.v1`
- `lpc-toolkit.asset-authoring-intelligence-route.v1`
- `lpc-toolkit.asset-authoring-operation-plan.v1`
- `lpc-toolkit.asset-authoring-candidate-operation.v1`
- `lpc-toolkit.asset-authoring-candidate-set.v1`
- `lpc-toolkit.asset-authoring-intelligence-receipt.v1`
- `lpc-toolkit.asset-authoring-intelligence-consent.v1`
- `lpc-toolkit.sprite-drawing-contract.v2`
- `lpc-toolkit.asset-pack-conflict.v1`
- `lpc-toolkit.asset-pack-conflict-selection.v1`
- `lpc-toolkit.asset-pack-conflict-policy.v1`
- `lpc-toolkit.asset-pack-resolution.v1`
- `lpc-toolkit.asset-pack-conflict-audit.v1`

### Optional provider-neutral Agent handoff

D2 adds an explicit, provider-neutral handoff around the drawing contract and
candidate stages. The CLI does not ship a provider, provider registry,
credential store, network client, or Agent skill. An external Agent integration
may supply bounded descriptors and coordinate a provider, but the CLI remains
the authority for the contract, session paths, candidate inspection, import,
validation, attribution, and release gates.

Check an integration manifest without loading assets, provider code, or a
workspace:

```sh
lpc-toolkit agent integration check --manifest manifest.json --json
```

Required capability or CLI-range mismatches fail with a stable refusal;
optional capability absence is reported as an external-author fallback. The
manifest checker never installs or executes an integration.

The provider handoff is a bounded sequence:

```sh
lpc-toolkit asset authoring provider discover --session <session-id> --contract-digest <sha256> --descriptors providers.json --json
lpc-toolkit asset authoring provider preflight --session <session-id> --contract-digest <sha256> --descriptor provider.json --workspace ./my-lpc-art --json
lpc-toolkit asset authoring provider handoff --session <session-id> --descriptor provider.json --consent consent.json --confirm --json
lpc-toolkit asset authoring provider result --session <session-id> --invocation invocation.json --result result.json --candidate candidate.png --workspace ./my-lpc-art --json
lpc-toolkit asset authoring import --session <session-id> --target <target-id> --candidate <candidate.png> --contract-digest <sha256> --json
```

`discover` consumes only explicitly supplied descriptors and reports supported,
unsupported, unavailable, or consent-required entries; it never enumerates or
selects a provider. `preflight` is read-only and checks the current contract,
capabilities, limits, target/reference scope, credential policy, protected
roots, and declared network requirements. Network is disabled by default.

`handoff` persists only a bounded invocation envelope after the exact consent
scope and `--confirm` are present; it does not execute a provider or mutate
pack source. `result` validates the result/refusal envelope, re-digests the
candidate PNG, and stages it under the session-owned
`.lpc-toolkit/asset-packs/authoring-sessions/<session-id>/provider-candidates/`
root using a logical candidate ID. It never writes `asset-pack.json`, source
PNGs, credits, an archive, or a release receipt. A refused, stale, cancelled,
timed-out, or scope-changing result preserves the last valid checkpoint and
returns one safe next action. The existing `asset authoring import` command is
the only candidate-to-source mutation authority; validation, attributed
preview, human release declaration, preview acceptance, formal pack, inspect,
and install remain separate gates.

Successful provider results can later be projected into D1's bounded
`provider-output` provenance record. Provider identity is evidence of a
reported production input, never LPC attribution, authorship/license
authority, human consent, or release approval. No raw prompt, provider
payload, credential, private path, or human identity enters the public D2
envelopes or D1 receipt.

### D5 deterministic authoring intelligence

D5 adds a catalog-first, deterministic authoring-intelligence boundary. It
normalizes a bounded request and explains whether the existing catalog can
compose, extend, derive a variant, recolor, use an explicit custom-geometry
contract, or prepare a bounded multi-layer candidate set. It does not require
a model, provider, backend, authentication, network access, or persistent
browser authoring state.

Route a request with a caller-supplied local catalog snapshot:

```sh
lpc-toolkit asset authoring intelligence route --request "Use hair braid" --catalog catalog-snapshot.json --json
```

Route responses contain the request/catalog digests, bounded logical
candidates, required capabilities, a stable outcome, and one safe next action.
They never return the raw request, private paths, credentials, provider
payloads, or candidate pixels. Ambiguous, unsupported, stale, attribution, and
resource conditions remain `needs-user-action` or refusal states.

To materialize an explicit operation, supply a digest-bound operation plan,
candidate inputs, and a separate D5 consent record. `--confirm` is required for
the session-owned staging mutation:

```sh
lpc-toolkit asset authoring intelligence stage --session <session-id> --operation operation.json --candidate candidate.png --consent consent.json --workspace ./my-lpc-art --confirm --json
```

Variant, recolor, explicit `sprite-drawing-contract.v2` geometry, and
multi-layer operations are bounded by exact target/contract/input digests and
fixed PNG, canvas, layer, and total-byte limits. Repeated identical staging is
a verified no-op; changed bytes or stale contracts return a recovery action and
never overwrite an existing candidate. D5 writes only session-owned
`provider-candidates/` bytes and an `intelligence-receipts/` sidecar. D2
provider evidence is optional, validated evidence only; it is never approval or
an import authority.

Staging stops before source mutation. Import each output through the existing
candidate-import authority, then run the existing validation, attributed
preview, human declaration/review, release, archive, and installation gates:

```sh
lpc-toolkit asset authoring import --session <session-id> --target <target-id> --candidate <staged-candidate.png> --contract-digest <sha256> --workspace ./my-lpc-art --json
lpc-toolkit asset authoring intelligence recover --session <session-id> --operation-digest <sha256> --action resume --workspace ./my-lpc-art --json
lpc-toolkit asset authoring intelligence recover --session <session-id> --operation-digest <sha256> --action discard --workspace ./my-lpc-art --confirm --json
```

Recovery is exact-operation and session scoped. D5 does not import, edit
`asset-pack.json`, rewrite credits, accept a preview, declare release, publish,
install, or alter D3's explicit file-scoped Web-to-CLI handoff. Existing v1
archive, manifest, install, plugin, attribution, consent, preview, release,
D1, D2, and D3 behavior remains authoritative.

### D6 cross-pack conflict review

The CLI exposes the local, explicit D6 conflict boundary through three commands:

```sh
lpc-toolkit asset conflict inspect --conflict conflict.json --json
lpc-toolkit asset conflict resolve --conflict conflict.json --selection selection.json --workspace ./my-lpc-art --confirm --json
lpc-toolkit asset conflict recover --receipt .lpc-toolkit/asset-packs/staging/conflict-resolutions/<conflict-id>/receipt.json --action resume --workspace ./my-lpc-art --confirm --json
```

`inspect` reads one bounded `lpc-toolkit.asset-pack-conflict.v1` record and
reports the canonical identity, contenders, compatibility/trust eligibility,
attribution evidence, policy, audit evidence, and exactly one safe next action.
It is read-only and never infers a winner from version, filesystem order,
provider, Agent, `replaces`, or D1/D2/D4/D5 evidence. Equivalent contenders are
reported as equivalent; a changed baseline, incompatible evidence, missing
credits/license/provenance, or stale identity is a refusal rather than a merge.

`resolve` requires the exact conflict and selection records, a complete
digest-bound target selection, review evidence and reason, and `--confirm`. It
writes only an owned receipt below the workspace staging root using schema
`lpc-toolkit.asset-pack-conflict-receipt.v1`; the resolution and audit records
retain source, credit, license, acknowledgement, provenance, D2, D4, and D5
evidence digests. The output is a staged candidate with one next action for the
existing candidate import, validation, attributed preview, human review, and
release gates. It does not edit source packs, `asset-pack.json`, `CREDITS.csv`,
the current managed output, an archive, a registry, or an installation.

`recover --action resume` rechecks the exact receipt and optionally the current
conflict evidence. `recover --action discard` removes only the exact D6 staging
directory; both actions require `--confirm`. Tampered, stale, blocked, and
refused records return a stable `status`, `code`, `mutation`, and one
`nextAction`, without absolute paths or raw payloads. D6 uses only local
fixtures/fakes: it adds no registry client, signing/key operation, marketplace,
backend, authentication, network call, npm publication, or persistent browser
authoring state. The existing v1 archive/manifest/install/plugin behavior and
the D1 parser remain unchanged; D6 evidence cannot become a formal release
until a separately versioned downstream contract accepts it.

### Explicit Web-to-CLI handoff

D3 provides a one-way local-file bridge from the Web Asset Pack Workbench to a
CLI workspace. The Web `Export for CLI` action captures one stable in-memory
revision and downloads the existing archive plus a strict
`lpc-toolkit.web-cli-handoff.v1` JSON sidecar. It does not upload, use a
backend, or persist browser authoring state. The sidecar contains only bounded
identity and digest bindings; it never replaces credits, consent, validation,
preview, candidate import, human approval, or release authority.

Inspect the pair before choosing an attach-pack plan:

```sh
lpc-toolkit asset authoring handoff inspect --handoff handoff.json --archive pack.lpc-assets.zip --json
lpc-toolkit asset authoring handoff import --handoff handoff.json --archive pack.lpc-assets.zip --plan attach-pack-plan.json --workspace ./my-lpc-art --confirm --json
```

`handoff inspect` is read-only. `handoff import` requires a matching explicit
attach-pack plan and a separate CLI `--confirm`; it creates a new contained
session and writes `web-handoff-receipt.json` only after the existing archive
inspection and staging authorities complete. Repeated unchanged imports are
idempotent. An interrupted import can be resumed or discarded only through
the exact digest-bound recovery action:

```sh
lpc-toolkit asset authoring handoff recover --handoff handoff.json --archive pack.lpc-assets.zip --workspace ./my-lpc-art --action resume --confirm --json
lpc-toolkit asset authoring handoff recover --handoff handoff.json --archive pack.lpc-assets.zip --workspace ./my-lpc-art --action discard --confirm --json
```

`asset authoring status` may project the sidecar as bounded optional
`webHandoff` data. Sessions created before D3 return `webHandoff: null`; a
malformed or mismatched sidecar is `blocked`. The sidecar is not copied into
`session.json`, provider receipts, D1 provenance, validation/preview receipts,
candidate-import state, or release gates. A stale pair is rejected before
candidate or pack mutation, and Web handoff is never release approval.

The strict plan schema has three goals: `new-item`, `extend-item`, and
`attach-pack`. New-item plans declare pack and asset identity, body types,
animations, layers, paths, human draft credits, and optional consent/provider
metadata. Extend-item plans add audit remediation evidence, including the
report digest, selected finding, consumer, geometry, source-cell mapping, and
path confidence. Attach-pack sessions can inspect an existing pack, but this
foundation does not publish a drawing contract for that goal.

The public session commands are:

| Command | Contract |
| --- | --- |
| `asset authoring start --plan <plan.json> [--workspace <directory>] [--json]` | Strictly parse the plan, create or attach the artist pack, and return a session response. |
| `asset authoring status --session <session-id> [--workspace <directory>] [--json]` | Read state, checkpoint freshness, bounded diagnostics, optional Web-handoff sidecar evidence, and safe next actions; the sidecar is not release approval. |
| `asset authoring resume --session <session-id> [--workspace <directory>] [--json]` | Reconcile current manifest/PNG/receipt evidence and return the next safe action. |
| `asset authoring contract --session <session-id> [--refresh] [--workspace <directory>] [--json]` | Materialize or inspect the provider-neutral drawing contract and non-importable artifacts. |
| `asset authoring intelligence route --request <text> --catalog <catalog.json> [options]` | Read-only deterministic catalog-first routing; it never prepares runtime assets or persists the raw request. |
| `asset authoring intelligence stage --session <session-id> --operation <operation.json> --candidate <candidate.png> --consent <consent.json> [--confirm] [options]` | Consent-bound deterministic candidate staging below the session-owned root; it never imports, validates, previews, releases, or publishes. |
| `asset authoring intelligence recover --session <session-id> --operation-digest <sha256> --action <resume\|discard> [--confirm] [options]` | Verify or explicitly discard one exact D5 staging operation without touching source-pack bytes. |
| `asset authoring provider discover --session <session-id> --contract-digest <sha256> --descriptors <providers.json> [--json]` | Normalize only explicitly supplied provider descriptors; no provider is selected, invoked, enumerated, or written. |
| `asset authoring provider preflight --session <session-id> --contract-digest <sha256> --descriptor <descriptor.json> [options]` | Read the current contract and return bounded compatibility, scope, network, credential, and protected-root checks without mutation. |
| `asset authoring provider handoff --session <session-id> --descriptor <descriptor.json> --consent <consent.json> [--confirm] [--workspace <directory>] [--json]` | Persist a consent-scoped invocation only after explicit confirmation; no provider executes and no pack source changes. |
| `asset authoring provider result --session <session-id> --invocation <invocation.json> --result <result.json> [--candidate <candidate.png>] [--workspace <directory>] [--json]` | Re-digest a bounded result, stage valid candidate bytes below the session-owned root, or preserve one refusal/recovery action. It does not import source. |
| `asset authoring handoff inspect --handoff <handoff.json> --archive <pack.lpc-assets.zip> [--json]` | Read-only inspect the Web sidecar/archive pair and report current, stale, or blocked digest bindings without creating a session. |
| `asset authoring handoff import --handoff <handoff.json> --archive <pack.lpc-assets.zip> --plan <attach-pack-plan.json> [--workspace <directory>] --confirm [--json]` | Import one current pair into a new attach-pack session after explicit plan selection and confirmation; it does not mark release or candidate evidence current. |
| `asset authoring handoff recover --handoff <handoff.json> --archive <pack.lpc-assets.zip> --workspace <directory> --action <resume\|discard> --confirm [--json]` | Resume or discard only the exact CLI-owned interrupted staging directory after digest re-check and confirmation. |
| `asset authoring import --session <session-id> --target <target-id> --candidate <png> --contract-digest <sha256> [--replace-existing --expected-target-digest <sha256>] [--workspace <directory>] [--json]` | Import one contract-bound candidate through the trust boundary; this remains the only provider-result-to-source mutation step. |
| `asset authoring validate --session <session-id> [--workspace <directory>] [--json]` | Validate the session-owned pack and record a digest-bound validation receipt. |
| `asset authoring preview --session <session-id> [existing preview options] [--workspace <directory>] [--json]` | Render an attributed preview from the current validation receipt. |
| `asset authoring acknowledge --session <session-id> --acknowledgement <record.json> [--confirm] [--workspace <directory>] [--json]` | Persist one exact warning acknowledgement with its non-empty human reason; without `--confirm`, return the pending action without mutation. |
| `asset authoring declare --session <session-id> --declaration <declaration.json> [--confirm] [--workspace <directory>] [--json]` | Record explicit human author/source and license authority for the current manifest, credits, validation, and acknowledgement evidence. |
| `asset authoring accept-preview --session <session-id> --preview-digest <sha256> --confirm [--workspace <directory>] [--json]` | Accept the exact current attributed PNG plus matching metadata, TXT-credit, and CSV-credit artifacts. |
| `asset authoring reconcile-manifest --session <session-id> --use <external\|session> --expected-external-digest <sha256> [--workspace <directory>] [--json]` | Resolve an observed external manifest change with an explicit digest-bound choice. |
| `asset authoring draft --session <session-id> [--output <archive>] [--workspace <directory>] [--json]` | Snapshot the current contained manifest and source files into a deterministic, explicitly non-installable recovery archive. The default output is below the session's `release-artifacts/` directory; an explicit path must remain there. |
| `asset authoring sync --session <session-id> [--confirm] [--workspace <directory>] [--json]` | Without `--confirm`, return one confirmation action without mutation. With confirmation, run the existing linked-sync transaction for the session pack and record the actual manager-owned output/registry generation. |
| `asset authoring pack --session <session-id> [--output <archive>] --confirm [--workspace <directory>] [--json]` | After fresh validation and every release gate is current, publish a deterministic formal archive below the session's `release-artifacts/` root. Without `--confirm`, return the confirmation action without publication. |
| `asset authoring inspect --session <session-id> --archive <archive> [--workspace <directory>] [--json]` | Inspect the exact formal archive bytes through the existing archive authority and record an inspection receipt only when its digest matches the current formal archive receipt. |
| `asset authoring provenance --session <session-id> [--records <records.json>] [--output <receipt>] --confirm [--workspace <directory>] [--json]` | Publish an optional canonical generation-provenance companion receipt from current formal pack, inspection, declaration, preview, artifact, manifest, content, and source evidence. The default output is below the session's `release-artifacts/` root; an explicit output must remain there. |
| `asset authoring install --session <session-id> --archive <archive> --consumer-workspace <directory> --confirm [--workspace <directory>] [--json]` | Optionally install the exact inspected formal archive into an already initialized, managed consumer workspace outside the artist and protected roots. Without `--confirm`, return the confirmation action without mutation; success records a verified installation receipt. |

Each JSON command returns the normal `ok`, `command`, `data`, `warnings`, and
`errors` envelope. Authoring data uses schema
`lpc-toolkit.asset-authoring-response.v1` and exposes `sessionId`, `goal`,
`state`, `reason`, `phase`, `checkpoint`, `checkpointFreshness`,
`diagnostics`, `inputsNeeded`, `artifacts`, `nextActions`, `retrySafety`,
`manifestDigest`, `sourceDigests`, `validation`, `preview`, `releaseGates`,
`releaseDeclaration`, `previewAcceptance`, `draftArchive`, `syncReceipt`,
`formalArchiveReceipt`, `inspectionReceipt`, `installationReceipt`,
`releaseProvenanceReceipt`, and additive `provider` evidence,
optional `webHandoff` sidecar evidence,
`capabilities`, and
`schemaVersions`. `releaseGates.gates` reports current, missing, stale, or
blocked acknowledgement, validation, declaration, preview, preview-artifact,
and preview-acceptance evidence; `releaseReady` is true only when every Phase 1
gate is current. `installationReceipt` binds the exact inspected archive to one
distinct consumer workspace and includes verified installed payload, registry,
managed-output, and `CREDITS.csv` digests. It is written only after the
existing transactional `asset install` authority commits and the consumer
generation is re-verified. The response deliberately projects bounded
evidence; it does not make session internals or provider output part of the
publishable pack.

The additive `provider` response projection reports only bounded IDs, digests,
status, refusal code, candidate ID, and safe next actions. The session receipts
`receipts.providerInvocation` and `receipts.providerResult` are backward-
readable and become stale when the contract, source, manifest, invocation
scope, or staged candidate bytes drift. Absolute candidate paths and provider
payloads are never exposed.

The optional `webHandoff` projection reports only the receipt schema, imported
or blocked status, handoff/archive/session binding digests, logical source
paths, and the sidecar receipt digest. It never exposes the sidecar file path,
archive bytes, browser state, provider payloads, credentials, or inferred human
identity. It is informational evidence only and cannot satisfy release gates.

The state and checkpoint fields are recovery data, not asset identity:

| Field | Values and meaning |
| --- | --- |
| `state` | `needs-user-action` means a bounded session is waiting for a safe or explicitly confirmed next action; `failed` means the current operation is blocked; `completed` means the requested operation reached a trustworthy boundary. For draft/sync operations it means the receipt is current; formal `pack` reaches a current archive, formal `inspect` reaches the exact-byte inspection checkpoint, and formal `install` reaches a verified consumer generation. Consumer installation is optional and never implicit. |
| `phase` | `planned`, `scaffolded`, `contract-ready`, `awaiting-candidate`, `imported`, `validated`, `previewed`, or `blocked`; each records the furthest trustworthy session boundary. |
| `checkpoint` | `null` or an `{id, digest}` pair naming the last trustworthy session boundary and the exact evidence digest that established it. |
| `checkpointFreshness` | `missing`, `current`, `stale`, or `blocked`; stale evidence must not be treated as current. |
| `nextActions[].safety` | `safe`, `requires-confirmation`, or `blocked`; callers must honor this value and the listed precondition digests. |

Sessions live below
`.lpc-toolkit/asset-packs/authoring-sessions/<session-id>/session.json`.
The session is workflow state only; the canonical publishable source remains
`artist-packs/<pack-id>/asset-pack.json` plus `sprites/`. The contract command
writes session-owned artifacts below
`contract-artifacts/`: `contract.json`, `metadata.json`, transparent templates,
guides, attributed working copies, and reference overlays where a baseline is
available. Artifact metadata uses
`lpc-toolkit.asset-authoring-artifact-metadata.v1`; every listed artifact has a
digest, session/contract binding, and `importable: false`. Never pass a template,
guide, working copy, reference overlay, or metadata file as a candidate.

Candidates must be workspace-contained, regular transparent RGBA PNGs with the
exact target geometry and contract-bound digest. A candidate is never read
from `contract-artifacts/`, may not be the destination itself, and may not
match a non-importable artifact by path or bytes. Importing a new target writes
the declared logical source path below the artist pack. Replacing an existing
target requires both `--replace-existing` and the exact currently observed
`--expected-target-digest`; external PNG drift first blocks the session with a
`review-external-png` action. A successful correction import clears stale
validation and preview receipts, so the next required action is validation.

Validation remains the existing strict pack validator. Warnings require the
exact acknowledgement record and a non-empty human reason bound to the current
content digest. The validation receipt records the manifest digest and every
source digest; the preview receipt additionally records the preview input,
validation revision, and exact absolute paths/digests for `preview:preview`,
`preview:metadata`, `preview:credits_txt`, and `preview:credits_csv`.
Manifest drift is resolved only by
`reconcile-manifest --use external|session` with the observed external digest.
`resume` re-evaluates these bindings and exposes recovery actions instead of
silently choosing a side.

`asset authoring preview` publishes the same attributed preview artifacts as
the existing leaf command under
`artist-packs/<pack-id>/previews/<asset-id>/`: the PNG, metadata JSON,
`credits.txt`, and `credits.csv`. These paths and their digests are returned in
the response. New-item attribution comes from the plan's human draft credits;
extend-item contracts carry inherited source attribution, and all previews
retain effective base and pack credits. Authoring sessions do not create a
formal archive. Before separate formal publication, a current session can
record the human release boundary:

```sh
lpc-toolkit asset authoring acknowledge --session <session-id> --acknowledgement <record.json> --confirm
lpc-toolkit asset authoring declare --session <session-id> --declaration <declaration.json> --confirm
lpc-toolkit asset authoring accept-preview --session <session-id> --preview-digest <sha256> --confirm
```

The declaration input must explicitly identify the human declarant, confirm
author/source and license authority, and match the current credit and warning
evidence. `accept-preview` re-digests all four attributed artifacts and accepts
only the supplied rendered PNG digest. Omitting `--confirm`, supplying stale or
wrong evidence, or losing an artifact leaves the session unchanged and returns
one structured next action. `resume` preserves the last valid receipt as stale
evidence after source, manifest, validation, preview-input, artifact, or
declaration drift. These receipts make the session release-ready but do not
publish or inspect an archive. `asset authoring pack --confirm` then calls the
existing formal pack authority only after every gate is current and writes the
archive below the session-owned `release-artifacts/` root. `asset authoring
inspect` reads the exact archive bytes and records `inspectionReceipt` only for
the current formal archive digest. External archive changes and copied valid
archives remain visible as stale or mismatch evidence; they are never adopted
silently. Consumer installation remains the separate `asset install` workflow.

Phase 2 adds session recovery and manager-generation evidence without changing
that boundary. `asset authoring draft` uses the shared deterministic archive
writer to snapshot the current manifest and referenced regular source files.
The default `<pack-id>-<version>.draft.lpc-assets.zip` is contained below
`.lpc-toolkit/asset-packs/authoring-sessions/<session-id>/release-artifacts/`;
an explicit `--output` path must remain in that directory. The persisted
`draftArchive` receipt binds the archive, raw manifest, content, source, and
recording-time digests. Equal existing bytes are reused; a changed, symlinked,
or non-regular target is a conflict and is never overwritten. The archive keeps
`status: "draft"`, so public `asset inspect` reports `asset_pack_draft` and
public `asset install` rejects it before staging or changing a consumer
workspace.

`asset authoring sync` requires `--confirm` because it mutates only the
manager-owned `assets_custom/` generation and workspace registry. It calls the
existing linked-sync transaction, then captures the committed registry bytes,
ownership marker, compile generation, and every generated definition, sprite,
and credit digest into the `syncReceipt`. Repeating unchanged sync is
idempotent. A source, manifest, registry, marker, output, or compile-generation
change preserves the last receipt as stale evidence and exposes a structured
confirmation or recovery action; it never silently adopts an unknown
generation. Neither command writes checked-in `assets/`, the managed base
cache, installed snapshots, unowned output, or `upstream/`.

Phase 3 adds the formal session boundary. `asset authoring pack` requires a
fresh validation receipt, current release gates, explicit `--confirm`, and a
regular output path contained below the session's `release-artifacts/` root.
It delegates archive bytes, checksums, draft-marker exclusion, attribution,
and safety limits to the existing formal `asset pack` authority, then records
`formalArchiveReceipt` only after re-reading and digest-checking the published
bytes. Repeating unchanged publication is idempotent. A changed or missing
recorded archive is preserved as stale evidence; the changed path is never
silently overwritten, while an explicit new contained output can recover the
formal receipt after review.

`asset authoring inspect --archive <archive>` delegates to the existing
`asset inspect` authority and never mutates archive bytes. It records
`inspectionReceipt` only when the archive is valid, formal, and its exact
digest matches the current `formalArchiveReceipt`. A valid copied archive with
different bytes remains a bounded mismatch and cannot become the session
checkpoint. Formal pack and inspect do not install a consumer; `asset install`
remains an independent later workflow.

D1 adds optional generation provenance after the exact formal archive has been
inspected. It is a canonical external companion file, written by default beside
the formal archive as
`release-artifacts/<pack-id>-<version>.release-provenance.json`:

```sh
lpc-toolkit asset authoring provenance --session <session-id> --confirm
lpc-toolkit asset authoring provenance --session <session-id> --records <records.json> --confirm
lpc-toolkit asset provenance verify --archive <archive> --provenance <receipt> --json
```

The optional `--records` input is a strict array of bounded
`provider-output`, `external-input`, or `source-transformation` records. It
contains only identifiers and digests; raw prompts, provider payloads, source
paths, secrets, credits, and human approval claims are refused and never copied
into the companion receipt. Publication requires current release evidence and
`--confirm`; unchanged publication is idempotent, while a changed projection
requires an explicit new output path contained by the session artifact root.

The public verifier accepts copied archive and receipt bytes from a separate
consumer root. It checks the exact formal ZIP, manifest, content, source, and
projection bindings without initializing or mutating a workspace or session.
Declaration and preview digests are reported as bound evidence, not as human
approval recreated by the verifier. The companion receipt is never a ZIP member
or an installed asset, and ordinary `asset inspect` and `asset install` remain
valid when it is absent.

Authoring sessions use the standalone workspace's artist source and managed
state only. They never modify checked-in `assets/`, the verified base cache,
generated `assets_custom/` output, installed archive snapshots, or the dormant
read-only `upstream/` gitlink.

Sync, install, upgrade, downgrade, and removal compile every active linked and
installed pack in deterministic order. Path, semantic-field, baseline-digest,
credit, replacement, and ownership conflicts fail instead of using
last-write-wins. Every mutation stages a complete desired generation before
publishing it.

Human-readable successes go to stdout. Human diagnostics and cache progress go
to stderr. With `--json`, the response envelope is written to stdout and
progress remains on stderr. Successful commands exit `0`; fatal input/runtime
failures exit `1`. `asset validate` and `asset inspect` return completed reports
but exit `1` when `data.valid` is false. `asset doctor` returns its complete
report but exits `1` when `data.healthy` is false.

### Deterministic archive contract and trust boundary

The archive contains only `asset-pack.json`, `checksums.json`, and the exact
referenced regular files below `sprites/`. The optional generation-provenance
companion is published beside the archive and is never a ZIP member. `checksums.json` uses strict schema
`lpc-toolkit.asset-pack-checksums.v1`; its rows are sorted by `path` and contain
`path`, uncompressed `size`, and a lowercase `sha256:<64-hex>` digest. Coverage
must equal `asset-pack.json` plus every referenced sprite, with no omission or
extra entry. `checksums.json` does not checksum itself.

Archive creation normalizes the source manifest, recursively sorts JSON object
keys, uses LF with a final newline, sorts ZIP entry names, writes no directory
entries, fixes the DOS timestamp at `1980-01-01 00:00:00`, uses UNIX regular-file
mode `0o100644`, and compresses at DEFLATE level 9. Equivalent normalized inputs
therefore produce byte-identical archives and the same `archiveDigest`.

Inspection parses and bounds the central directory before inflation. Phase 2
accepts only stored or DEFLATE regular-file entries and rejects ZIP64,
encryption, unsupported flags or compression, data-descriptor/metadata
mismatches, directory/symlink/special entries, duplicate or Unicode/case
canonical-collision paths, absolute or drive-qualified paths, backslashes,
empty/dot/parent segments, unsafe platform names, checksum mismatches, and files
outside the three allowed roots. Limits are exact and enforced before pixel
decode:

| Limit | Maximum |
| --- | ---: |
| Archive entries | 4,096 |
| UTF-8 path length | 1,024 bytes |
| `asset-pack.json` | 1 MiB uncompressed |
| Any entry | 64 MiB uncompressed |
| All entries | 512 MiB uncompressed |
| Encoded archive | 1,074,110,485 bytes |

PNG signature and IHDR geometry are checked against the declared animation
before canvas decode. Install extracts only the already verified immutable
snapshot into:

```text
<stateRoot>/installed/<pack-id>/<version>/<archive-sha256-without-prefix>/
├── asset-pack.json
├── sprites/
└── install-receipt.json
```

The receipt schema is `lpc-toolkit.asset-pack-install-receipt.v1`. It binds the
workspace ID, pack/version, archive and content digests, installation time, and
every extracted payload digest. It is manager metadata, not an archive entry or
artist input.

The optional strict source field below declares compatibility. Omission means
only the `lpc-toolkit.asset-pack.v1` schema is required. Unknown compatibility
fields/capabilities, malformed versions, a minimum above the running CLI, or an
unsupported capability fail inspection and install.

```json
{
  "compatibility": {
    "minimumCliVersion": "0.2.0",
    "requiredCapabilities": [
      "lpc-toolkit.asset-pack.v1",
      "lpc-toolkit.asset-pack.lifecycle.v1"
    ]
  }
}
```

### Install, registry, and recovery policy

For the same pack ID, a greater semantic version is `upgraded`; the same version
and identical archive digest is `unchanged`; the same version with different
bytes is an error. A lower version is `downgraded` only when its incoming
self-`replaces` entry matches the currently installed version and exactly covers
all installed asset keys. There is no force-downgrade flag. Installing a pack ID
that is active as a linked source fails with `asset_source_kind_conflict`; run
`asset remove <pack-id>` first. Cross-pack replacement remains subject to exact
Core owner/version/asset authorization.

The registry schema is `lpc-toolkit.asset-workspace-registry.v2`. It stores a
sorted union of linked and installed sources plus source/output digests,
authorized logical destinations, generated sprite ownership and credits, and a
compile digest. A valid Phase 1 v1 registry is read and enriched from freshly
validated linked sources by lifecycle manager commands; the next successful
publication writes only v2. Runtime catalog, preview, and render commands refuse
v1 activation until that migration occurs. Phase 2 never downgrades v2 state.

Publication uses journal schema `lpc-toolkit.asset-pack-transaction.v1` with
phases `prepared`, `output-published`, `sources-published`, and
`registry-published`. Before registry publication, recovery deterministically
rolls back; at or after registry publication, it completes cleanup. Lifecycle
commands recover first and report `none`, `rolled-back`, or `completed`.
Installed source deletion happens only after the new output and registry are
durable; linked removal never deletes artist files.

`asset doctor` is deliberately not a general repair command. Healthy or
tampered state is audited without repair. Its only mutation is completing or
rolling back an authentic interrupted manager-owned journal before the audit.
It never adopts unregistered installed content, rewrites tampered sources or
registry/output, fills missing credits, or deletes unknown installed/staging
content.

Installed manager output is activated through the same authorized overlay as
linked output. Activation holds the lifecycle claim while it strictly verifies
registry v2, linked/installed source identity, receipts, generated output, and
the freshly compiled desired state. Definitions, palettes, and generated sprite
bytes are then consumed from one in-memory generation snapshot for the complete
command. Catalog audit, character preview, and render therefore cannot mix a
concurrent publication or arbitrary files from `assets_custom/`. Preview/render
metadata and TXT/CSV credits come from one frozen composed credit manifest,
retaining both inherited base credits and pack contributions through install,
upgrade, and removal.

The Web Workbench repairs an existing `.lpc-assets.zip` in memory: it previews
the official base plus pack credits, accepts governed manifest/source edits,
and downloads attributed draft or formal archives. A draft archive carries
`status: "draft"`; `asset inspect` reports it with exit code 1 and
`asset install` refuses it with `asset_pack_draft` before changing workspace
state. Use the CLI for package creation, inspection, installation, upgrades,
removal, and lifecycle diagnosis; it does not require a browser or repository
clone.

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
animation, or create a new asset for a supported LPC layout. Read-only audit,
source mutation, provider disclosure, formal release, and installation remain
distinct authority stages. The authoring journey stops at a validated,
attributed review-ready preview; release and install require separate human
confirmation. Preview, render, and export outputs preserve metadata plus TXT
and CSV credits.

### Character commands and locators

| Command | Purpose |
| --- | --- |
| `character create` | Create a named selection, optionally from a preset. |
| `character list` | List selections stored under `./characters/`. |
| `character show` | Show a stored or explicitly located selection. |
| `character search` | Find compatible catalog items for one selection type. |
| `character set` | Set or replace one selected item. |
| `character set-color` | Set or clear one color channel owned by a selected asset. |
| `character remove` | Remove one selected item. |
| `character validate` | Validate the complete selection against the catalog. |
| `character preview` | Render one attributed animation frame. |
| `character render` | Render the attributed sheet and optional exports. |

Locator-based commands accept either a character name or
`--selection <file>`, never both. A named preview defaults to
`characters/previews/<name>/`; use `--out <directory>` to override it.
Character rendering is strict by default. Use `--allow-partial` only when
attributed partial animation output is acceptable; missing paths are reported
in warnings and metadata rather than silently credited.

`lpc-toolkit.selection.v2` is the canonical saved selection format. It retains
the primary `recolor` field and stores independent secondary colors under the
selected asset's `channelRecolors`. Wherever `--selection` reads an existing
file, the CLI accepts Toolkit selection v1 and v2 plus upstream version 1 and
version 2 selection JSON. Read-only commands migrate these documents in memory
without rewriting the source. A successful `character set`, `character
set-color`, or `character remove` mutation of non-v2 input atomically rewrites
that file as Toolkit v2 and emits the `selection_format_normalized` warning.
Set an explicit primary or secondary value with `character set-color <locator>
--type <slot> --channel <id> --color <id>`. Use `--default` instead of `--color`
to remove the stored value and restore the asset-authored default. Linked
channels refuse both operations because their value comes from the selected
body asset.
`character create --selection <file>` remains an output destination for the
new character rather than an input file.

### Render output

Every successful render writes this attributed artifact set. Entries marked as
optional are present only when their corresponding flag is used:

```text
<out>/
├── <name>.sheet.png
├── <name>.viewer.html
├── <name>.metadata.json
├── <name>.credits.txt
├── <name>.credits.csv
├── animations/
│   └── <animation>.png                 optional: --animation
├── frames/
│   └── <animation>/<direction>-<frame>.png  optional: --frames
└── <name>.bundle.zip                   optional: --bundle zip
```

`<name>.viewer.html` is always produced. Double-click it in the render directory
to play every composed standard and custom animation offline. When using
`--bundle zip`, extract the complete ZIP before double-clicking the viewer so its
relative sheet and artifact links remain beside it. `--animation` and `--frames`
control only the separate PNG outputs; they do not limit the animations available
in the viewer.

## Commands

Commands print human-readable output by default. Add `--json` when a command is
being consumed by a script or agent.

```sh
# Explore the catalog.
lpc-toolkit catalog types
lpc-toolkit catalog items --type hair
lpc-toolkit catalog item hair_braid

# Validate a selection document.
lpc-toolkit selection validate --selection selection.json

# Encode and decode selection tokens.
lpc-toolkit token encode --selection selection.json
lpc-toolkit token decode --token 'sex=male&hair=Braid' --out decoded.json

# List, materialize, and render built-in presets.
lpc-toolkit preset list
lpc-toolkit preset materialize farmer --out farmer.json
lpc-toolkit preset render farmer --out ./farmer --animation walk

# Render a selection, including an animation strip, all frames, and a ZIP.
lpc-toolkit render --selection selection.json --out ./rendered \
  --animation walk --frames all --bundle zip
```

Token encoding writes deterministic `v2.` tokens, including asset-owned color
channels. Token decoding remains compatible with `v1.` and `v2.` tokens as well
as legacy upstream-style hashes.

Catalog and `character search` discovery return a deterministic 20-item page by
default. Use `--limit 20` to choose a bounded page size, `--offset 20` (or the
returned `page.nextOffset`) to continue an unchanged result set, and `--all`
for an explicit unbounded response. The JSON `page` object contains `limit`,
`offset`, `returned`, `total`, `hasMore`, and `nextOffset`. Item summaries expose
license families and credit counts; `catalog item <itemId> --json` returns the
full credit entries for exact attribution review. Restart from offset zero when
the catalog source, custom overlay, query filters, or character selection
changes.

`catalog item <itemId>` keeps `animations` as the asset's native animation
identifiers. Item detail also reports `compatibleAnimations`, derived from
registered custom-animation bases such as `wheelchair` → `sit`, and
`unsupportedAnimations`, the ordered standard animation names supported by
neither the native nor compatible set. Human output labels the latter fields
`compatible standard animations` and `unsupported standard animations`.
Definitions without a valid `animations` array use the same standard defaults
as Core composition; an explicit empty array remains empty.

### Animation asset audit

Use `catalog audit-animations` to produce a complete, unpaginated drawing
worklist for a chosen catalog scope. Supply at least one registered standard
animation; repeat `--animation` to audit more than one animation.

```sh
lpc-toolkit catalog audit-animations \
  --animation walk \
  --animation run \
  --type weapon \
  --body-type male \
  --json
```

The report is complete for the selected `--type` and `--body-type` scope; it
does not use discovery pagination. Its finding categories have distinct
meanings: `unsupported` identifies item animations that require drawing work,
`missingFiles` identifies expected PNGs that are absent, `blankFrames`
identifies referenced transparent source cells, and `errors` identifies assets
that could not be inspected. These findings exit successfully. Invalid input or
fatal runtime asset preparation instead fails the command.

Runtime recolors listed in a finding are dependent outputs, not additional PNG
files to draw. The command reads the current runtime asset store and catalog
definition overlay, and writes nothing.

Run `lpc-toolkit --help` for the command summary.

## Local Web UI

Start the packaged production UI with the same verified asset cache used by
render commands:

```sh
lpc-toolkit web
lpc-toolkit web --port 4173 --no-open
```

Use `--port 0` to let the operating system select an available port. The first
run downloads the pinned assets when needed; later runs share the verified cache
with render commands and work offline. Press `Ctrl+C` to stop the server.

The server binds to `127.0.0.1` by default. Using `--host 0.0.0.0` exposes it to
other devices on the local network; only do this on a trusted network. This is a
production server, so it does not provide Vite hot reload.

## Asset download and cache

The npm package does not contain the art archive. The first asset-dependent
command downloads a pinned asset manifest and about 205 MB of compressed assets
from the project's GitHub release. Download, verification, extraction, and
ready progress is written to stderr so stdout remains safe for `--json` output.
`--help`, `--version`, `token decode`, `preset list`, `character list`, and
`character create` without `--preset` do not prepare the managed cache.

The default cache root is platform-specific:

| Platform | Cache root |
| --- | --- |
| macOS | `~/Library/Caches/lpc-toolkit` |
| Windows | `%LOCALAPPDATA%\lpc-toolkit\Cache` (or `%USERPROFILE%\AppData\Local\lpc-toolkit\Cache` when `LOCALAPPDATA` is unset) |
| Linux and other Unix systems | `$XDG_CACHE_HOME/lpc-toolkit`, or `~/.cache/lpc-toolkit` when `XDG_CACHE_HOME` is unset |

Set `LPC_TOOLKIT_CACHE_DIR` to override the cache root:

```sh
LPC_TOOLKIT_CACHE_DIR=/path/to/writable/cache lpc-toolkit catalog types
```

Each pinned asset release has its own directory under that root. Its durable
layout is:

```text
<cache-root>/<release-tag>/
├── CREDITS.csv
├── asset-manifest.json
├── sprite-index.json
├── metadata-index.json
├── zips/
│   ├── sheet_definitions.zip
│   ├── palette_definitions.zip
│   └── <sprite-category>.zip
├── sheet_definitions/
└── palette_definitions/
```

Sprite category ZIPs remain compressed and are read on demand; only definition
metadata is expanded. The downloaded tarball is a temporary preparation input,
not a second durable copy. Before reuse, the CLI validates the pinned manifest,
hashes, retained ZIP set, attribution file, and generated indexes. A valid cache
causes no network requests, so later commands work offline. If the cache is
missing or invalid, a network connection is required to prepare it again.

### Working-directory assets and custom overlays

The current working directory controls local asset discovery:

- A complete `./assets` tree takes precedence over the managed cache. It must
  contain `sheet_definitions/`, `palette_definitions/`, `spritesheets/`, and
  `CREDITS.csv`.
- `./assets_custom/sheet_definitions/` overlays definitions with matching paths
  from either the complete local tree or the managed base. This overlay is
  checked whether the base comes from `./assets` or the cache.
- An incomplete `./assets` tree is not mixed into the managed base; the CLI uses
  the verified cache instead.
- When the command runs inside an initialized artist workspace, the verified
  managed cache is always the compilation/runtime base. A complete local
  `./assets` tree is not combined with registry-owned output, and only the
  authenticated workspace generation may supply custom definitions or sprites.

Run from the directory containing those folders when using local or custom
assets.

### Troubleshooting

- **Checksum or integrity failure:** the CLI refuses unverified content and does
  not publish it into the cache. Retry on a trusted network. If a local release
  directory was modified, remove only that `<cache-root>/<release-tag>`
  directory and retry; do not bypass checksum validation.
- **`tar` is missing:** initial cache preparation requires a `tar` executable on
  `PATH`. Install the platform's standard tar implementation, then rerun the
  command.
- **Network or GitHub release failure:** confirm HTTPS access to GitHub releases
  and any proxy/firewall configuration. An already valid cache works offline,
  but a missing or invalid cache cannot be rebuilt without the pinned files.
- **Cache-write failure:** check permissions and free disk space, or point
  `LPC_TOOLKIT_CACHE_DIR` at an absolute, writable location. Preparation needs
  temporary space in addition to the retained compressed cache.

## Attribution and license

Every render writes the composed sheet, offline animation viewer, a metadata JSON
file, and both `<name>.credits.txt` and `<name>.credits.csv`. Animation strips,
individual frames, and ZIP bundles are optional; the viewer, attribution files,
and effective-license metadata are not. Credits are derived from the selected
assets and the pinned `CREDITS.csv`.

This package is licensed under GPL-3.0-or-later. Keep the generated attribution
artifacts with rendered sprites and comply with the effective licenses reported
in the render metadata and credit files when copying, modifying, or
redistributing the software or art output.
