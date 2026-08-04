# Agent-Assisted Asset Pack Release Lifecycle Follow-Up

**Status:** Proposed follow-up spec  
**Date:** 2026-08-04  
**Parent:** [Issue #149](https://github.com/ochowei/lpc-toolkit-2026-1/issues/149)  
**Predecessor:** [Agent-assisted asset authoring foundation](../plans/2026-08-03-agent-assisted-asset-authoring-foundation.md)  
**Related design:** [Agent-Assisted Asset Pack Authoring Product Design](2026-08-03-agent-assisted-asset-pack-authoring-design.md)  
**Related decision:** [ADR-0009](../../adr/0009-require-human-asset-release-declarations.md)

## Summary

Issue #149 establishes a provider-neutral CLI authoring session through
contract-bound candidate import, current validation, and an attributed preview.
That foundation deliberately stops before release. This follow-up turns a
technically valid session into a governed, inspectable, optionally synchronized
and optionally installable asset release.

The follow-up adds:

- explicit human declarations for attribution author, license/source authority,
  warning acknowledgement, and final attributed-preview acceptance;
- session-aware synchronization into the manager-owned generated overlay;
- a deterministic, non-installable draft recovery archive;
- formal asset-pack archive creation and inspection;
- an optional independent consumer-workspace installation; and
- digest-bound receipts and recovery after every release boundary.

The existing asset-pack manifest, validation, preview, sync, pack, inspect,
install, registry, and transaction implementations remain authoritative. The
new authoring commands coordinate those behaviors and do not create a second
manifest or archive implementation.

## Boundary after Issue #149

The foundation can report a current `validated` or `previewed` session, but
a current preview is not a release. The next workflow is:

```text
current attributed preview
-> human release declarations
-> final attributed-preview acceptance
-> optional sync
-> optional draft recovery archive
-> formal asset-pack archive
-> exact archive inspect
-> optional independent consumer installation
```

The session remains resumable at every arrow. A failure keeps the last valid
checkpoint and exposes one structured next action. A source, manifest,
validation, preview, declaration, archive, registry, or consumer-workspace
change never leaves a stale success checkpoint looking current.

## Problem

The current CLI can author and validate source pixels, and the existing asset
lifecycle can synchronize, package, inspect, and install packs. The two layers
do not yet share a release-ready session contract.

Without this slice:

- an Agent can report a valid preview without a human accepting the exact
  attributed result;
- credits and warning reasons can be present in source without a formal,
  digest-bound declaration that a person or authorized organization reviewed
  them;
- a user cannot create a safe recovery archive from an interrupted session;
- `asset sync` and `asset pack` are not represented as current session
  checkpoints;
- an archive can be created without the session proving that it was inspected;
  and
- an optional install cannot be demonstrated in an independent consumer
  workspace without conflating installation with source authoring.

## Goals

1. Require an explicit, human-originated release declaration before formal
   archive publication.
2. Bind final visual acceptance to the exact validation, source, manifest,
   preview image, metadata, TXT-credit, and CSV-credit digests.
3. Reuse the existing leaf commands and asset-pack-format contracts for sync,
   draft output, formal pack, archive inspection, and installation.
4. Keep draft recovery deterministic, safe to share, explicitly non-installable,
   and independent of the session file.
5. Make sync, pack, inspect, and install transactional and retry-safe.
6. Preserve attribution for physical source files, generated destinations,
   inherited baseline assets, previews, draft archives, formal archives, and
   installed sources.
7. Prove the complete flow through the packed public CLI in a clean author
   workspace and a separate consumer workspace.

## Non-goals

- Calling ImageGen, `generate2dsprite`, an external generation provider, or any
  other pixel-generation service.
- Adding or shipping the `lpc-asset-pack-authoring` Codex skill.
- Adding a Web-to-CLI session bridge, browser persistence, backend, account,
  registry, signing service, or remote artifact store.
- Natural-language routing, catalog interpretation, prompt generation, provider
  switching, or automatic consent inference.
- Automatic warning acknowledgement, acknowledge-all behavior, invented
  acknowledgement reasons, or inferred author/license identity.
- Replacing existing `asset sync`, `asset pack`, `asset inspect`, or
  `asset install` semantics with a parallel implementation.
- Making a draft archive installable by filename, status omission, or a force
  flag.
- Installing into the artist workspace, the repository, the managed base cache,
  generated overlay, checked-in assets, or `upstream/`.
- Adding a release/provenance sidecar to formal archive bytes in this slice.
  Human release declarations remain session receipts; the existing manifest
  credits and acknowledgements remain the publishable attribution/governance
  record. A release-safe provenance projection needs its own versioned contract.
- Global installation, package registries, marketplace distribution, or npm
  publication.

## Domain separation

The implementation must keep these concepts distinct:

| Concept | This follow-up owns | It must not be reported as |
| --- | --- | --- |
| Authoring session | Workflow state, declarations, provenance, artifacts, receipts, and invalidation | A published asset-pack manifest |
| Asset-pack manifest | Canonical identity, assets, source paths, credits, compatibility, and acknowledgements | A release approval or preview |
| Asset validation | Current schema, geometry, pixel, attribution, ownership, and warning checks | Human visual acceptance |
| Attributed preview | Review artifact bound to current pixels and matching credit metadata | A formal archive |
| Draft recovery archive | Safe, deterministic, non-installable recovery snapshot | A formal asset-pack archive |
| Formal asset-pack archive | Immutable bytes that passed release gates and inspection | A source directory or installed pack |
| Asset-pack installation | Activation of an inspected formal archive in a consumer workspace | Sync or source authoring |

## Ownership and compatibility decisions

### Existing authorities remain authoritative

Core continues to own normalized asset-pack schema, content digest,
acknowledgement matching, deterministic compile decisions, and pure release
gate predicates. `asset-pack-format` continues to own archive bounds, safe
paths, checksums, draft recognition, deterministic archive bytes, and shared
inspection inputs. The CLI continues to own workspace discovery, filesystem
containment, staging, atomic publication, session receipts, registry state,
and consumer installation. Web remains a separate archive repair and review
surface; it does not attach to a CLI authoring session.

Session commands call existing leaf application logic and return the same
diagnostics and attribution artifacts. They may add session identifiers,
checkpoint freshness, receipts, and next actions, but may not weaken a gate or
reinterpret a warning.

### Formal archive bytes stay compatible

The formal archive remains the existing deterministic payload:

```text
asset-pack.json
checksums.json
sprites/...
```

Formal output omits `status: "draft"`. Existing formal fixtures retain their
archive bytes, digests, inspection results, and installation behavior. New
release declarations are recorded in the session-owned release receipt and are
bound to the manifest credits, acknowledgements, and preview digests; they are
not silently added as an unversioned archive member.

The existing optional `status: "draft"` manifest field is the only draft
marker. Unknown status values remain strict errors. A draft is rejected by
`asset install` even if a user renames it to a formal-looking filename.

### Providers are provenance, not authors

Provider, tool, model, reference, prompt-digest, candidate, and import records
remain generation provenance. They do not satisfy attribution-author or
license/source authority declarations. A human external artist may be the
attribution author only when the declarant explicitly confirms that role.

## Public contract

### Capability and schema identifiers

`lpc-toolkit capabilities --json` advertises these additive capabilities:

- `asset-authoring-release.v1`
- `asset-authoring-draft-recovery.v1`
- `asset-authoring-consumer-install.v1`

The public schemas are:

- `lpc-toolkit.asset-release-declaration.v1`
- `lpc-toolkit.asset-authoring-release-receipt.v1`
- `lpc-toolkit.asset-authoring-draft-receipt.v1`
- `lpc-toolkit.asset-authoring-install-receipt.v1`

Older integrations that do not advertise these identifiers must refuse the
new release actions or stop at the #149 preview checkpoint. They must not
guess new fields or invoke a provider as a fallback.

### Session-aware commands

All commands remain non-interactive and return the existing CLI envelope plus
`lpc-toolkit.asset-authoring-response.v1` data. Commands that require a human
decision return `ok: true`, `state: "needs-user-action"`, and a structured
next action until the explicit confirmation is supplied.

```text
lpc-toolkit asset authoring acknowledge \
  --session <session-id> --acknowledgement <record.json> [--confirm]

lpc-toolkit asset authoring declare \
  --session <session-id> --declaration <declaration.json> [--confirm]

lpc-toolkit asset authoring accept-preview \
  --session <session-id> --preview-digest <sha256> --confirm

lpc-toolkit asset authoring sync \
  --session <session-id> [--confirm]

lpc-toolkit asset authoring draft \
  --session <session-id> [--output <archive>] [--json]

lpc-toolkit asset authoring pack \
  --session <session-id> [--output <archive>] --confirm [--json]

lpc-toolkit asset authoring inspect \
  --session <session-id> --archive <archive> [--json]

lpc-toolkit asset authoring install \
  --session <session-id> --archive <archive> \
  --consumer-workspace <directory> --confirm [--json]
```

The exact option ordering is owned by the command specification and must be
tested as public argv. `--workspace` remains available on every session
command. `--confirm` is an explicit consent boundary, not a bypass for a
missing digest or an unsafe path.

The existing leaf commands remain available and authoritative:

```text
lpc-toolkit asset sync <pack-directory>
lpc-toolkit asset pack <pack-directory>
lpc-toolkit asset inspect <pack.lpc-assets.zip> [--json]
lpc-toolkit asset install <pack.lpc-assets.zip>
```

### Release declaration input

The declaration is strict, user-supplied input. The CLI may prefill a template
from current evidence, but it never fills identity, license authority, source
authority, or reasons from Git, the operating system, an Agent, or a provider.

The minimum shape is:

```json
{
  "schema": "lpc-toolkit.asset-release-declaration.v1",
  "expectedManifestDigest": "sha256:...",
  "declarant": {
    "displayName": "Alice Example",
    "kind": "person",
    "role": "authorized-release-declarant"
  },
  "authorAndSource": {
    "confirmed": true,
    "creditDigest": "sha256:..."
  },
  "licenseAuthority": {
    "confirmed": true,
    "creditDigest": "sha256:..."
  },
  "acknowledgements": {
    "confirmed": true,
    "contentDigest": "sha256:...",
    "recordDigests": ["sha256:..."]
  }
}
```

The CLI validates that the declaration matches the current pack credits,
source URLs, supported licenses, current warning acknowledgement records, and
manifest digest. If a pack still needs an exact credit or acknowledgement
record, the command returns the existing structured template and does not
invent or partially persist a declaration. Applying an explicitly supplied
credit correction is limited to the current session's declared pack scope and
requires the expected manifest digest; arbitrary asset or destination edits
are rejected.

The CLI adds generated receipt fields that are not accepted as user authority:
confirmation time, CLI version, session ID, source digests, and the normalized
declaration digest. A declaration is stale after any relevant manifest, source,
warning, validation, preview-input, or preview-artifact change.

### Final preview acceptance

`accept-preview` is separate from technical validation and separate from an
Agent's visual inspection. It requires:

- the exact current validation receipt;
- the exact current preview receipt;
- matching manifest and complete source digests;
- the rendered image digest;
- matching metadata, TXT-credit, and CSV-credit artifact digests; and
- an explicit `--confirm` with the exact preview digest.

The acceptance receipt records no free-form claim that could detach it from
the preview. It records the digest bindings, declarant identity from the
release declaration, timestamp, and optional human note. A source or preview
input change invalidates it. Re-running `pack` with unchanged bindings does
not require a second acceptance.

## Gates and session state

### Release gates

Formal packaging is allowed only when all of these gates are current:

1. The session, workspace, pack, and target scope are trusted and contained.
2. The manifest and every referenced source PNG are unchanged from the current
   session snapshot.
3. Fresh asset validation has no errors and all warnings have exact persisted
   acknowledgement records with non-empty human reasons.
4. Credits, licenses, source URLs, baseline attribution, and generated
   destinations pass the existing attribution checks.
5. The release declaration confirms the current author/source and license
   authority values.
6. A human has accepted the exact current attributed preview.
7. Formal archive assembly succeeds deterministically and a fresh inspection
   of those exact bytes passes.
8. No draft marker, stale receipt, unresolved manifest conflict, unsafe path,
   output ownership mismatch, or target race remains.

Sync is optional. If the user requests sync, a current sync receipt is an
additional gate before the session can report the requested sync action as
completed. A formal archive may be created without sync because the formal
archive is built from canonical artist source, not generated overlay state.

### Checkpoints

The existing session checkpoints are extended with:

```text
acknowledgements
releaseDeclaration
previewAcceptance
sync
draftArchive
formalArchive
archiveInspection
consumerInstallation
```

Every checkpoint records the relevant manifest digest, complete source digest
set, validation revision, preview input, artifact digests, and predecessor
receipt digests. Freshness remains `missing`, `current`, `stale`, or
`blocked`.

The session's cumulative milestones become:

```text
technically-valid
visually-accepted
release-ready
drafted              # optional recovery artifact; not a formal milestone
synced               # optional requested action
packed
inspected
installed            # optional consumer verification
```

`completed` for a formal authoring request means `release-ready` plus a
current formal archive and archive inspection. An archive may be drafted
without reaching `release-ready`. Optional sync and installation are reported
as separate completed actions and never silently inferred.

### Invalidation matrix

| Change | Invalidates |
| --- | --- |
| Manifest identity, asset, source, compatibility, credit, or acknowledgement change | validation, preview, declaration, preview acceptance, sync, draft, pack, inspect, install |
| Source PNG bytes or source path change | validation, preview, declaration when attribution changes, preview acceptance, sync, draft, pack, inspect, install |
| Validation result or warning acknowledgement changes | preview, declaration acknowledgement binding, preview acceptance, sync, draft, pack, inspect, install |
| Preview input or any preview artifact changes | preview acceptance, pack, inspect, install |
| Release declaration changes | release declaration, preview acceptance when its declarant binding changes, pack, inspect, install |
| Generated overlay or registry drift after sync | sync receipt; source/manifest checkpoints remain independent |
| Draft archive bytes change outside the session | draft receipt only; never adopt silently |
| Formal archive bytes change outside the session | formal archive and inspection receipts; never install silently |
| Consumer workspace or installed registry drift | installation receipt; never repair unowned files |

`resume` detects these changes, preserves the last valid receipt, and returns
a single safe next action or explicit human conflict action. It never chooses
session-known bytes over newer external bytes.

## Draft recovery archive

`asset authoring draft` creates a deterministic `.draft.lpc-assets.zip` in
the session-owned release-artifact directory unless an explicit contained
output path is supplied.

The draft writer:

- snapshots the current manifest and safe source bytes before assembly;
- includes only allowed manifest and `sprites/` payload paths;
- writes `status: "draft"` in the manifest projection;
- regenerates sorted checksums and deterministic archive metadata;
- preserves current credits, source evidence, warning records, and repairable
  diagnostics; and
- atomically publishes the draft artifact and records its archive/content/source
  digests.

The draft writer refuses unsafe ZIP structure, invalid JSON envelopes, path
traversal, symlinks, non-regular payloads, archive/resource limits, and any
output outside the approved session or explicit output root. It does not require
formal declarations or final preview acceptance, but it never reports the
result as release-ready.

`asset inspect` reports a stable blocking `asset_pack_draft` diagnostic for
the draft. `asset install` rejects it before staging or mutating the consumer
workspace. The draft remains useful as a recovery handoff or Web Workbench
upload, but it is not a substitute for the session record and does not silently
embed or restore session state.

Repeated draft commands with unchanged inputs return the same artifact digest
and do not create duplicate registry entries. A failed write leaves the prior
draft receipt and existing files unchanged.

## Synchronization

`asset authoring sync` calls the existing linked-pack sync behavior for the
session's exact pack directory. Before publishing it:

1. re-reads and pins the manifest and every source file;
2. performs fresh validation and attribution checks;
3. verifies the workspace registry and generated-output ownership;
4. stages a complete desired overlay and registry generation;
5. compiles all active linked and installed packs in deterministic order; and
6. atomically publishes the manager-owned output and registry.

The sync receipt records pack ID/version, manifest and source digests, registry
generation, generated definition/sprite/credit digests, and the exact output
root. Artist source, base cache, checked-in assets, installed sources, and
`upstream/` remain untouched.

Sync requires explicit confirmation because it changes manager-owned workspace
state. A retry with the same inputs is idempotent. If a transaction is
interrupted, `resume` or `asset doctor` completes or rolls back only the
manager-owned generation and never adopts an unknown output directory.

## Formal asset-pack archive and inspection

`asset authoring pack` calls the existing `asset pack` application only
after the formal release gates pass. It:

- performs fresh validation rather than trusting only stored exit codes;
- assembles deterministic formal archive bytes from the canonical pack source;
- omits the draft marker;
- verifies checksums, archive bounds, safe paths, attribution, and output
  ownership;
- atomically publishes the formal archive under the session-owned artifact
  root; and
- records the archive digest and release receipt.

`asset authoring inspect` calls the existing archive inspection behavior
against the exact produced bytes. It must prove that the archive is formal,
structurally safe, checksum-complete, attribution-complete, and installable.
It is read-only and may be run against a copied archive, but the session only
marks its formal checkpoint current when the inspected archive digest equals
the pack receipt.

The session reports `needs-user-action` for missing declarations, missing
acknowledgement reasons, stale preview acceptance, or an archive that is valid
but not yet inspected. It reports `failed` for untrusted session state, unsafe
archive input, digest races, or forbidden mutation attempts.

## Optional independent consumer installation

`asset authoring install` is an explicit, optional verification action. It
must:

- receive the exact archive digest recorded by the current inspect receipt;
- require a consumer workspace distinct from and outside the artist workspace;
- refuse the repository root, `upstream/`, base-cache roots, generated output
  roots, and unowned paths;
- call the existing transactional `asset install` behavior;
- verify installed source, registry, generated output, and matching credits;
- record the consumer workspace identity, installed pack/version, archive,
  registry, and output digests; and
- leave the artist source and formal archive unchanged.

Installation is never implicit after `pack` or `inspect`. A repeated install
with the same archive and consumer state is idempotent. A newer version or
replacement continues to use the existing explicit lifecycle policy; the
authoring wrapper does not add a force, downgrade, or cross-pack replacement
option.

## Response and recovery rules

Release responses retain the #149 response fields and add:

```text
releaseGates
releaseDeclaration
previewAcceptance
syncReceipt
draftReceipt
formalArchiveReceipt
inspectionReceipt
installationReceipt
```

Every next action includes:

- stable action ID and exact command argv;
- `safe`, `requires-confirmation`, or `blocked` safety;
- required file, identity, consent, or conflict inputs;
- precondition digests;
- expected checkpoint; and
- retry safety and mutation scope.

Human output explains which declaration or receipt is missing without dumping
the entire session record. JSON output includes absolute artifact paths and
bounded diagnostics, with the preserved full report available through the
existing evidence path.

## Testing strategy

### Core and shared asset-pack-format

- strict declaration parsing, unknown-field rejection, and schema identity;
- no inferred declarant, license, source, or warning reason;
- digest binding for credits, acknowledgements, validation, preview artifacts,
  release declarations, and acceptance;
- release-gate projection stability under JSON property reordering;
- draft marker parsing, formal omission, deterministic bytes, and install
  rejection;
- archive bounds, checksums, path containment, and existing formal fixture byte
  parity; and
- no environment-specific paths, provider calls, or session filesystem values
  in pure contracts.

### CLI session and lifecycle

- exact acknowledgement application with expected manifest digest and atomic
  update;
- explicit author/license/source declaration and stale-declaration refusal;
- final preview acceptance tied to current PNG, metadata, TXT, and CSV credit
  artifacts;
- sync receipt invalidation after source, manifest, registry, or generated
  output drift;
- deterministic draft creation, safe draft inspection, and install refusal;
- formal pack refusal before every release gate and successful pack/inspect
  after all gates pass;
- interrupted sync, draft, pack, inspect, and install publication recovery;
- external archive and consumer-workspace changes detected without silent
  adoption;
- repeated commands are idempotent and do not duplicate registry entries or
  receipts; and
- protected sentinels prove no mutation of checked-in assets, the managed base
  cache, unowned output, installed sources outside the target consumer
  workspace, or dormant `upstream/`.

### Packed public-CLI acceptance

In a clean temporary environment with only the packed public CLI:

1. create a bounded authoring session and complete a real candidate import;
2. validate and produce an attributed preview with PNG, metadata, TXT, and CSV
   credit artifacts;
3. show `needs-user-action` for missing acknowledgements, declarations, and
   final preview acceptance;
4. persist exact human-supplied acknowledgement and declaration evidence;
5. accept the exact preview digest;
6. create and inspect a non-installable draft recovery archive;
7. sync when explicitly confirmed and verify the generated overlay/registry;
8. create and inspect the formal archive from the exact current bytes; and
9. optionally install it in a second clean consumer workspace and render a
   current attributed result.

The acceptance must interrupt and resume after each release boundary, mutate a
source or archive externally, and prove the correct checkpoint becomes stale
without losing the last valid receipt.

## Documentation impact

This is CLI-sensitive work. The implementation plan must carry and reassess
the complete matrix before handoff:

```text
help: update — add release commands, confirmations, gates, and recovery states
cli-readme: update — document declarations, draft/formal archives, inspect, sync, and install
root-readme: update — distinguish authoring, draft recovery, formal publication, and consumer install
landing: update — keep composition, source creation, archive publication, and installation separate
architecture: update — record release receipts, archive/registry ownership, and no Web session bridge
engineering: update — add shared format, CLI lifecycle, packed acceptance, and recovery verification
releasing: update — add formal archive and capability release/post-publication checks
plugin: update — document that the current plugin still refuses the new release capabilities; no skill is added
```

No documentation update may imply that a provider, Codex skill, or Web bridge
is part of this slice.

## Delivery phases

### Phase 1: declarations and acceptance

- pure declaration and release-receipt schemas;
- exact acknowledgement persistence;
- final attributed-preview acceptance;
- stale-receipt invalidation; and
- focused human/JSON response tests.

### Phase 2: draft recovery and sync

- deterministic draft archive writer and receipt;
- draft inspect/install rejection parity;
- session-aware sync and registry/output receipts;
- transaction interruption and doctor recovery; and
- protected workspace sentinels.

### Phase 3: formal pack and inspect

- formal gate projection;
- session-aware pack and exact-byte inspect;
- existing formal fixture parity;
- release artifact containment; and
- packed CLI formal-flow acceptance.

### Phase 4: optional consumer installation and handoff

- independent consumer-workspace preconditions;
- transactional installation receipt;
- second-workspace render and attribution verification;
- complete documentation-impact updates; and
- repository-wide verification.

Each phase receives a separate implementation plan with focused red/green
tests, a conventional commit, exact verification commands, and no writes to
`upstream/`.

## Acceptance criteria

This follow-up is complete when:

1. A current #149 session can request exact acknowledgement, attribution,
   license/source, and final-preview confirmations without inferred identity.
2. Every formal release receipt is bound to current manifest/source,
   validation, preview, and credit artifact digests.
3. Any relevant edit makes release declarations and downstream receipts stale.
4. A draft recovery archive is deterministic, safe, explicitly marked draft,
   inspectable, and rejected by install.
5. Sync publishes only complete manager-owned generations and rolls back or
   recovers after interruption without touching artist source.
6. Formal pack creates only inspected, non-draft archives after all human
   release gates pass.
7. Optional install requires an explicit confirmation and a separate consumer
   workspace, and proves the exact inspected archive is installed.
8. Existing formal archive bytes, leaf command diagnostics, attribution
   artifacts, and lifecycle behavior remain compatible.
9. The packed public-CLI acceptance covers real PNGs, interruption, external
   drift, draft recovery, formal inspect, and independent installation.
10. No provider invocation, authoring skill, Web session bridge, backend,
    dependency, `any`, cache mutation, checked-in asset mutation, or
    `upstream/` mutation is introduced.

## Deferred after this follow-up

- Release-safe generation-provenance projection inside formal archives.
- Codex, Antigravity, Claude Code, or other Agent skill packaging.
- Provider invocation and provider discovery APIs.
- Web-to-CLI session bridging or persistent browser authoring state.
- Remote registries, signing, marketplaces, global installation, and npm
  publication.
- Natural-language routing, automatic variant/recolor authoring, custom
  geometry, complex multi-layer authoring, and cross-pack conflict resolution.
