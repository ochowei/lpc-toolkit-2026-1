# D3 — Web-to-CLI Session Transfer and Recovery

**Status:** Proposed track specification — review required before implementation  
**Date:** 2026-08-06  
**Successor issue:** [Issue #170](https://github.com/ochowei/lpc-toolkit-2026-1/issues/170)  
**Roadmap:** [Issue #153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Base:** D2 implementation merged by [PR #169](https://github.com/ochowei/lpc-toolkit-2026-1/pull/169)  
**Dependency:** Stable D1 provenance vocabulary and D2 provider/session receipt compatibility

## Summary

D3 defines a local, explicit handoff from the Web Asset Pack Workbench to the
CLI authoring workflow. The Web UI may assemble an existing draft or formal
asset-pack archive and offer the user a companion handoff manifest. The user
chooses both files and explicitly imports them into a CLI workspace. The CLI
re-reads, re-digests, and re-validates the archive and the manifest before it
creates a new `attach-pack` authoring session.

The bridge is intentionally a file exchange, not a shared runtime session. It
does not add a backend, account, authentication, browser persistence, URL
token, remote upload, registry, or second archive format. The existing archive
format, CLI session store, candidate-import boundary, validation, attribution,
preview, release gates, and D1/D2 receipts remain authoritative.

The D3 implementation must not begin until this specification and its
implementation plan have been reviewed and the public TDD seams have been
confirmed.

## Decision at a glance

| Decision | D3 contract |
| --- | --- |
| Direction | Web → CLI only. A CLI → Web session bridge is deferred. |
| Transfer files | A strict JSON handoff sidecar plus one existing `.lpc-assets.zip` archive. No custom wrapper archive. |
| Browser state | In-memory workbench state only. Export is a user gesture and download; no `localStorage`, IndexedDB, service-worker store, URL token, or background upload. |
| Session identity | The Web side never creates or supplies a CLI session ID. CLI import creates a new session from an explicit `attach-pack` plan. |
| Receipt placement | `lpc-toolkit.asset-authoring-web-handoff-receipt.v1` is a session-owned sidecar. Existing `lpc-toolkit.asset-authoring-session.v1` and its release/provider receipt fields are not rewritten. |
| Authority | CLI re-inspection and explicit human `--confirm` control import. Web preview, Web download, provider metadata, and handoff consent never satisfy CLI release gates. |
| Recovery | Read-only inspect first; explicit import; explicit resume or discard of CLI-owned staging after a crash. No automatic adoption or overwrite. |

## Current boundary

The existing Web Workbench has an in-memory revisioned Worker session. It can
inspect an uploaded archive, apply manifest/source edits, validate and preview
the current revision, and download a draft or formal archive. The existing CLI
has a filesystem-owned authoring session with a strict plan, pack root,
validation/preview receipts, candidate-import receipts, release gates, and D1/D2
evidence. Neither side may treat the other side's in-memory or persisted state
as authoritative without a digest-bound transfer.

The D3 path is:

```text
Web Worker revision
  -> assemble existing draft/formal archive
  -> verify revision did not change
  -> explicit user export
  -> handoff.json + existing archive download
  -> user selects both files for CLI
  -> CLI inspect (read-only, strict, digest-bound)
  -> explicit CLI confirmation
  -> CLI-owned staging and attach-pack session
  -> Web-handoff sidecar receipt
  -> existing CLI validation / preview / candidate / release gates
```

The handoff is a checkpoint transfer, not a claim that a CLI session existed in
the browser. If the browser closes before export, the in-memory revision is
lost and the user must reopen an archive. The CLI can recover only files that
the user explicitly exported and retained.

## Goals

1. Define a strict, versioned Web/CLI handoff manifest with a deterministic
   state digest and an exact archive binding.
2. Detect mixed files, stale Web revisions, archive tampering, manifest/source
   drift, missing attribution, unsupported status, and unsafe input before any
   CLI workspace mutation.
3. Keep ownership explicit: Web controls only its in-memory state, the user
   controls the downloaded handoff files, and the CLI controls only a selected
   contained workspace after explicit confirmation.
4. Preserve the existing session and receipt compatibility contract without
   copying Web claims into validation, preview, release, provider, or
   provenance authority fields.
5. Provide deterministic inspect, import, and recovery responses in human and
   JSON forms.
6. Preserve attribution and consent evidence while requiring a new human
   approval at the CLI import boundary.
7. Prove the transfer with local fixtures and temporary workspaces only.

## Non-goals

- A backend, database, authentication, authorization service, account link,
  shared login, WebSocket, remote upload, or external service.
- Persistent browser authoring state, including `localStorage`, IndexedDB,
  Cache Storage, service-worker persistence, URL-encoded session state,
  browser-extension state, or a hidden cross-tab database.
- A bidirectional session protocol or browser-to-CLI live connection.
- A custom archive/container format, archive reimplementation, or change to
  formal v1 archive bytes.
- Automatic session discovery, workspace discovery from Web metadata, or
  implicit overwrite of an existing pack or session.
- Treating a Web preview, archive status, provider result, or handoff click as
  release declaration, visual acceptance, attribution authorship, license
  authority, warning acknowledgement, or candidate import approval.
- Provider invocation, natural-language routing, automatic variants/recolors,
  custom geometry, complex multi-layer authoring, remote distribution, signing,
  marketplaces, global installation, npm publication, or cross-pack conflict
  resolution.
- Modifying `upstream/`, checked-in assets, the managed base cache, installed
  sources, generated overlay, or unowned output.

## Ownership and permission boundary

| Boundary | Owner | Allowed D3 behavior | Forbidden behavior |
| --- | --- | --- | --- |
| Web Workbench revision | Web Worker and UI | Read current in-memory revision, assemble through existing archive authority, and offer an explicit download | Persisting a session, inferring identity, uploading bytes, or claiming CLI/release authority |
| Handoff sidecar and archive | User-selected input files | User may copy, rename, or select both files; CLI reads them as untrusted input | CLI mutating, replacing, deleting, or trusting a path or filename from the sidecar |
| CLI workspace | CLI plus the human who selected `--workspace` | Create a new contained `attach-pack` pack root and session after validation and `--confirm` | Using an envelope path, writing outside workspace, modifying an existing pack, or touching protected roots |
| Existing session receipts | CLI session store | Continue to own validation, preview, provider, release, and D1 receipts | Copying Web fields into those receipts or silently marking a gate current |
| Recovery staging | CLI-owned temporary area | Resume or explicitly discard one exact pending import after digest re-check and confirmation | Automatic cleanup, broad deletion, or recovery of a different handoff |

The sidecar contains no absolute path. CLI responses may expose the existing
CLI artifact paths required by the response contract, but persisted D3
metadata remains portable and bounded. The CLI never infers a user, owner,
license authority, or approval from the local account, Git, browser profile,
file owner, or handoff creator.

## Public identifiers

The D3 implementation adds these versioned identifiers only when the related
public seams and tests are complete:

- capability: `asset-authoring-web-cli-handoff.v1`;
- capability: `asset-authoring-web-cli-recovery.v1`;
- handoff manifest: `lpc-toolkit.web-cli-handoff.v1`; and
- receipt sidecar: `lpc-toolkit.asset-authoring-web-handoff-receipt.v1`.

The existing identifiers remain unchanged:

- `lpc-toolkit.asset-authoring-session.v1`;
- `lpc-toolkit.asset-authoring-response.v1`;
- D1 release-provenance schemas; and
- D2 provider invocation/result/refusal schemas.

An older Web or CLI that does not advertise the D3 capability must stop with a
bounded unsupported-capability diagnostic. It must not guess fields or fall
back to an implicit archive import.

## Handoff manifest contract

The Web export is a strict JSON sidecar. Its complete v1 shape is:

```json
{
  "schema": "lpc-toolkit.web-cli-handoff.v1",
  "direction": "web-to-cli",
  "handoffId": "550e8400-e29b-41d4-a716-446655440000",
  "purpose": "cli-authoring-review",
  "createdAt": "2026-08-06T12:00:00.000Z",
  "web": {
    "workbenchRevision": 4,
    "stateDigest": "sha256:...",
    "baselineReleaseTag": "lpc-toolkit-..."
  },
  "pack": {
    "id": "example.pack",
    "version": "1.0.0",
    "archiveKind": "draft",
    "manifestDigest": "sha256:...",
    "contentDigest": "sha256:...",
    "releaseFingerprint": "sha256:..."
  },
  "payload": {
    "fileName": "example.pack-1.0.0.draft.lpc-assets.zip",
    "byteLength": 12345,
    "archiveDigest": "sha256:..."
  },
  "sources": [
    { "path": "spritesheets/example.png", "digest": "sha256:..." }
  ],
  "attribution": {
    "creditDigest": "sha256:...",
    "acknowledgementDigest": "sha256:...",
    "required": true
  },
  "consent": {
    "handoffConfirmed": true
  },
  "privacy": {
    "absolutePaths": false,
    "credentials": false,
    "providerPayloads": false,
    "browserState": false
  }
}
```

The parser rejects unknown keys, duplicate collection entries, invalid UUIDs,
non-`sha256:` digests, absolute or traversal paths, empty identity, unsupported
archive kinds, `handoffConfirmed: false`, privacy flags other than `false`,
and any `sessionId`, `workspaceRoot`, `providerPayload`, `prompt`, cookie,
token, URL-token, or raw-pixel field. `sources` contains normalized logical
asset-pack paths only and is sorted by path. It never contains an OS path.

`fileName` is descriptive metadata. The CLI never resolves it, opens it, or
writes it. The user supplies the actual archive path separately with
`--archive`.

The JSON sidecar is not an archive member and is not copied into the asset-pack
archive. The Web download operation produces two downloads from one verified
revision: the existing archive bytes and this sidecar. The sidecar must not
contain base64 archive bytes or duplicate source pixels.

### Canonical state digest

`web.stateDigest` is the digest of a canonical projection containing only:

```text
schema version
baseline release tag
workbench revision
pack id and version
archive kind
manifest digest
content digest
release fingerprint
archive digest and byte length
sorted source path/digest pairs
credit digest
acknowledgement digest
```

`handoffId` and `createdAt` are not included in `stateDigest`; they identify a
transfer event but do not change the represented Web state. The canonical
projection has deterministic object and collection ordering. The expected
digest in tests is an independent fixture literal, not a digest recomputed by
the same helper under test.

Before download, Web assembles the requested archive through the existing
Worker path, captures the current revision and all metadata, and verifies that
the controller revision is still unchanged before creating the sidecar. If a
revision changes during assembly, no handoff is offered and no stale pair is
downloaded.

## Transfer lifecycle

### Web export

The UI exposes an explicit `Export for CLI` action for the current draft or
formal archive. The action:

1. reuses existing archive assembly and attribution/diagnostic results;
2. requires a user gesture and a confirmation message that this creates local
   files for a CLI review workflow;
3. verifies the revision and archive metadata as one snapshot;
4. creates the strict sidecar and downloads it alongside the existing archive;
5. does not create a CLI session or claim release readiness; and
6. loses unexported state if the page is closed or refreshed.

No Web action silently sends files to a CLI process. A browser download is the
handoff boundary.

### CLI inspection

The CLI adds a read-only command:

```text
lpc-toolkit asset authoring handoff inspect \
  --handoff <handoff.json> --archive <pack.lpc-assets.zip> [--json]
```

Inspection reads both inputs as regular files, validates the strict sidecar,
inspects the existing archive with the shared archive authority, re-computes
archive/manifest/content/source/credit/acknowledgement bindings, and returns a
bounded state:

- `current` — the pair is internally consistent and may be imported;
- `stale` — the pair is valid but no longer represents the sidecar's exact
  state digest, so the user must export a fresh pair;
- `blocked` — unsafe, malformed, unsupported, missing, or policy-disallowed
  input; or
- `needs-user-action` — inspection is current but import still needs the
  explicit CLI confirmation and an attach plan.

Inspection never creates a session, extracts files, writes a receipt, or
changes a workspace.

### CLI import

The CLI adds an explicit import command:

```text
lpc-toolkit asset authoring handoff import \
  --handoff <handoff.json> --archive <pack.lpc-assets.zip> \
  --plan <attach-pack-plan.json> [--workspace <directory>] --confirm [--json]
```

The plan must be a current strict `lpc-toolkit.asset-authoring-plan.v1` with
`goal: "attach-pack"`, and its pack identity/version must match the inspected
archive. The plan, not the Web sidecar, selects the CLI workspace and scope.

With no `--confirm`, the command returns `ok: true`,
`state: "needs-user-action"`, one exact confirmation action, and no mutation.
With confirmation, the CLI:

1. repeats the complete read and digest inspection immediately before staging;
2. refuses an existing/conflicting destination rather than overwriting it;
3. stages archive payload files below the selected contained CLI workspace;
4. re-validates manifest, source files, attribution, and pack scope from the
   staged bytes;
5. creates a new CLI-owned `attach-pack` session through the existing session
   authority;
6. writes the D3 sidecar receipt only after the session and staged pack are
   atomically committed; and
7. returns the new session ID and one safe next CLI action, without reporting
   validation, preview acceptance, release readiness, or installation unless
   those existing commands have independently produced current receipts.

The CLI does not reuse a `sessionId` from the Web input. The same sidecar is
never allowed to choose an output path or replace an existing pack. Repeating
an unchanged import in the same workspace is idempotent when its existing D3
receipt matches the same handoff/archive/plan bindings; a different binding
returns an explicit conflict.

## Stale-state and tamper detection

The following are stale or blocked before mutation:

| Condition | Result | Recovery |
| --- | --- | --- |
| Sidecar archive digest or byte length differs from selected archive | `stale` | Re-select the matching archive or export a fresh pair |
| Archive pack identity/version/status differs from sidecar | `stale` | Export a fresh sidecar and archive from the same Web revision |
| Manifest, content, source, credit, or acknowledgement digest differs | `stale` | Do not import; inspect the current archive or re-export |
| Sidecar has absolute/traversal path, secret, provider payload, or unknown field | `blocked` | Discard the unsafe sidecar and export again |
| Archive inspection reports unsafe paths, invalid checksums, unsupported status, or missing credits | `blocked` | Repair through the existing authoritative workflow |
| Attach plan identity/scope differs from archive | `blocked` | Supply an explicit matching plan |
| Destination exists or changes during staging | `blocked` | Resolve the destination conflict explicitly; never force it |
| Input changes between inspection and commit | `stale` | Leave prior state unchanged and repeat inspection |
| Web revision changes during assembly | Web export refused | Re-run export for the new revision |

The CLI never treats a stale receipt as current. It preserves stale evidence
for inspection and exposes the exact expected and observed digest bindings in
bounded JSON, without embedding raw archive bytes or private paths.

## Recovery contract

Import uses a session-owned staging directory and a small recovery marker. A
process interruption may leave a `recovery-pending` marker, but it must not
publish a partial pack or a current D3 receipt.

The CLI adds:

```text
lpc-toolkit asset authoring handoff recover \
  --handoff <handoff.json> --archive <pack.lpc-assets.zip> \
  --workspace <directory> --action resume|discard --confirm [--json]
```

Recovery is explicit and exact:

- `resume` re-checks the same handoff, archive, plan/staging bindings, and
  destination identity before completing an interrupted import;
- `discard` removes only the matching CLI-owned staging directory after the
  exact handoff identity and digest are confirmed; it cannot delete input
  files, an artist pack, checked-in assets, `upstream/`, or unowned output;
- missing, changed, or mismatched recovery evidence returns `blocked` and
  leaves the staging marker for inspection; and
- recovery never infers a new plan, accepts a new archive, or marks an old
  release/preview receipt current.

If the browser is closed before export, there is no browser recovery contract:
the user must reopen the original archive and make a new explicit export.

## Session and receipt compatibility

The existing `lpc-toolkit.asset-authoring-session.v1` file remains valid and
backward-readable. D3 does not add an unknown field to the existing session
JSON and does not copy the Web handoff into any of these authoritative fields:

- validation receipt;
- preview receipt or preview artifact set;
- release declaration or preview acceptance;
- provider invocation/result/refusal;
- D1 release-provenance projection; or
- candidate-import receipt.

The CLI writes a separate, session-owned sidecar:

```json
{
  "schema": "lpc-toolkit.asset-authoring-web-handoff-receipt.v1",
  "handoffId": "550e8400-e29b-41d4-a716-446655440000",
  "handoffDigest": "sha256:...",
  "archiveDigest": "sha256:...",
  "sessionId": "...",
  "manifestDigest": "sha256:...",
  "contentDigest": "sha256:...",
  "sourceDigests": [
    { "path": "spritesheets/example.png", "digest": "sha256:..." }
  ],
  "creditDigest": "sha256:...",
  "status": "imported",
  "recordedAt": "2026-08-06T12:00:00.000Z"
}
```

The sidecar contains no absolute path and is not a release receipt. A D3-aware
`asset authoring status` may project its bounded state as optional `webHandoff`
data; older sessions with no sidecar continue to report the same state. The
existing response schema remains additive and privacy-safe.

The handoff sidecar is provenance of a user-selected transfer, not proof that
the Web user is the attribution author or license authority. A CLI session
created from a handoff begins at the existing attach-pack checkpoint and must
run current validation, preview, human declarations, candidate import, and
release actions as applicable.

## Privacy, attribution, consent, and human approval

### Privacy

The sidecar and its JSON response projection must not contain:

- absolute local paths, home/repository paths, filesystem ownership, or
  environment variables;
- browser cookies, local/session storage, browser profile IDs, URL tokens,
  authentication headers, credentials, private URLs, or hidden tab state;
- raw prompts, provider payloads, model outputs, or provider network metadata;
- raw source pixels or base64 archive content; or
- inferred human identity, account name, or release authority.

Logical pack/source paths and SHA-256 digests are allowed because they are
needed for deterministic binding and already exist in the asset-pack contract.

### Attribution

The existing archive's manifest, credits, source URLs, licenses, and
acknowledgement records remain the only attribution authority. The sidecar
contains digests and a `required: true` marker, not replacement credit data.
The CLI must reject a missing or mismatched credit/acknowledgement binding and
must not import a sidecar that says attribution is optional.

### Consent and human approval

The Web confirmation records only that the user requested a local file
handoff. CLI `--confirm` records the separate human decision to import into a
selected CLI workspace. Neither event is a release declaration or final visual
acceptance. Existing `--confirm` release gates remain separate and cannot be
satisfied by the handoff fields.

No provider, Agent, browser UI, file owner, Git identity, or operating-system
account may be used to infer attribution, consent, license authority, warning
reasons, or release approval.

## Public response rules

All D3 commands retain `{ ok, command, data, warnings, errors }` and the
existing `lpc-toolkit.asset-authoring-response.v1` projection. D3 data may
include only:

- schema/capability identifiers;
- handoff ID and digest;
- pack/archive identity and bounded digest comparisons;
- current/stale/blocked/needs-user-action state;
- new CLI session ID after successful import;
- sidecar receipt status; and
- one exact next action with safe CLI argv.

Human output must say that Web handoff is not release approval. JSON must not
include raw input JSON, raw archive bytes, provider metadata, or unbounded
diagnostic payloads.

## Architecture and compatibility invariants

1. Pure handoff parsing, canonical projection, digest, privacy predicates, and
   stale-state predicates belong in environment-agnostic Core.
2. The Web adapter/UI owns only snapshot capture and explicit downloads. It
   does not import Node, CLI session storage, or a browser persistence layer.
3. The CLI owns regular-file checks, archive inspection, workspace containment,
   staging, atomic publication, session creation, sidecar receipts, and
   response formatting.
4. Existing `@lpc-toolkit/asset-pack-format` remains the only archive authority.
5. Existing Core candidate import, validation, preview, attribution, D1, and
   D2 contracts are reused; no parallel gates or receipt schemas are created.
6. `packages/core/` remains free of Node, filesystem, DOM, React, Vite, Worker,
   concrete canvas, ZIP, Web, CLI, provider, network, or secret-handling APIs.
7. No change is made to existing v1 archive bytes, manifest semantics, install
   behavior, plugin behavior, or upstream provenance.

## Acceptance criteria

- A Web export is possible only from a stable in-memory revision and produces
  a strict sidecar plus the existing archive for that exact revision.
- Mixed sidecar/archive pairs are detected before CLI mutation.
- `handoff inspect` is read-only and returns deterministic current/stale/
  blocked/needs-user-action states.
- `handoff import` requires an explicit attach plan and `--confirm`, creates
  only a new contained CLI session, and preserves the existing release gates.
- Existing destinations, changed staging, unsafe paths, invalid archives,
  missing credits, and digest races fail closed with protected sentinels
  unchanged.
- A sidecar receipt is written only after atomic import completion; interrupted
  imports are recoverable only through the exact explicit recovery command.
- Older sessions remain readable because D3 receipt data is a sidecar.
- Human and JSON responses have equivalent bounded state and next actions.
- No browser persistence, backend, auth, external service, new dependency,
  real provider, registry, signing, npm publication, or `upstream/` mutation is
  needed by tests or production behavior.

## Review checklist

Before implementation, review and confirm:

- the two-file sidecar/archive transfer shape;
- the one-way Web→CLI boundary and deferred reverse bridge;
- the sidecar receipt compatibility decision;
- the exact stale/blocked/recovery states;
- the ownership and explicit-confirmation rules; and
- the public TDD seams recorded in the implementation plan.

