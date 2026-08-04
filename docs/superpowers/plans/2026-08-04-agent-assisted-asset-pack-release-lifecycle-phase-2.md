# Agent-Assisted Asset Pack Release Lifecycle — Phase 2 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with vertical
> red → green loops. Do not begin a later task until the current task's
> focused checks pass and its implementation record is committed.

**Goal:** Implement Phase 2 of GitHub Issue [#150](https://github.com/ochowei/lpc-toolkit-2026-1/issues/150): add deterministic, explicitly non-installable draft recovery and a session-aware wrapper around the existing linked-pack sync, with digest-bound receipts, stale recovery, idempotent confirmation, transaction recovery, and protected workspace evidence.

**Base:** Continue from Phase 1 commit `a11695cab787a1c192e563a4e36b348f0a373597`. The complete contract is [`2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md`](../specs/2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md). Phase 3 formal pack/inspect and Phase 4 consumer installation remain deferred.

**Architecture:** `@lpc-toolkit/asset-pack-format` remains the authority for draft/formal archive bytes, canonical JSON, checksums, safe paths, archive limits, and archive inspection inputs. Existing CLI packaging, inspection, linked sync, registry, transaction, and doctor modules remain the authorities for their leaf behavior. The CLI authoring layer only snapshots current session evidence, requests explicit consent, records receipts, and exposes bounded recovery actions. Artist source, checked-in assets, managed base cache, installed sources, generated output outside the manager root, and `upstream/` remain outside the mutation scope.

**Tech stack:** Strict TypeScript, Node.js 22+, pnpm, Vitest, existing CLI filesystem/runtime adapters, and the existing asset-pack-format APIs. Add no dependency, no `any`, and no architecture-boundary exception.

## Global constraints

- Implement only Phase 2: deterministic draft recovery, draft inspect/install parity, session-aware sync, registry/output receipts, stale invalidation, and transaction/doctor recovery evidence.
- Do not implement session-aware formal `pack`, exact-byte `inspect`, consumer `install`, provider invocation/discovery, a Codex authoring skill, a Web-to-CLI bridge, a backend, remote registry/signing, global installation, or npm publication.
- Reuse `createAssetPackArchive({ kind: 'draft' })`, `readAssetPackArchive`, `inspectAssetPackArchive`, `installAssetPack`, `syncLinkedAssetPack`, `readAssetPackRegistry`, `snapshotManagedOutputFiles`, `auditPublishedManagedOutput`, and the existing transaction/doctor authorities. Do not create a second manifest, archive, checksum, registry, or sync implementation.
- The draft archive is always marked `status: "draft"` by the shared format authority. It is never made formal by filename, omission of a field, or a force flag. Existing `asset inspect` must report `asset_pack_draft`; existing `asset install` must reject before staging or consumer-workspace mutation.
- Draft creation may proceed without formal release gates, but it must snapshot the current contained manifest and every referenced regular source file, preserve credits/acknowledgement evidence, and never report `releaseReady` or a formal archive milestone.
- `asset authoring sync` requires `--confirm`; without it, return `ok: true`, `state: "needs-user-action"`, and one exact confirmation action without mutating manager-owned output, registry, transaction state, or the session receipt.
- The sync wrapper must re-read and validate the exact session pack through the existing linked sync application, publish only the manager-owned desired generation, and capture the resulting registry/output digests after the transaction commits. It must never mutate artist source, checked-in `assets/`, the managed base cache, installed sources, unowned output, or `upstream/`.
- Preserve the last valid draft/sync receipt as stale evidence. Never silently adopt changed archive bytes, registry bytes, generated output, or newer external source bytes. A failed or raced publication leaves the previous receipt and previously published files unchanged.
- Repeated draft/sync commands with unchanged inputs are idempotent. A draft command must not overwrite a conflicting external archive; a sync retry must use the existing transaction claim/recovery/doctor behavior.
- Keep public response compatibility: retain `lpc-toolkit.asset-authoring-session.v1` and `lpc-toolkit.asset-authoring-response.v1`; add only documented receipt fields. Older Phase 1 sessions read with `sync` and `draftArchive` as missing/null and are not treated as having completed Phase 2 actions.
- Prefix every repository terminal command with `rtk`. Use pnpm for repository development.
- Never initialize, modify, install packages inside, or commit inside `upstream/`. Do not write checked-in `assets/`, the verified base cache, generated `assets_custom/`, installed snapshots, or unowned output.
- After each completed implementation task, check its boxes, add a short note, record the full product commit hash, and record exact PASS/FAIL verification commands in this plan. Commit the plan record separately with `docs(plan): record ...`.

## Observable success

- `lpc-toolkit capabilities --json` adds `asset-authoring-draft-recovery.v1` and `lpc-toolkit.asset-authoring-draft-receipt.v1`; `asset-authoring-consumer-install.v1` and install receipt capability remain absent.
- `asset authoring draft --session <id> [--output <archive>] [--json]` writes a deterministic `.draft.lpc-assets.zip` below the session-owned release-artifact root, records a digest-bound draft receipt, and returns the absolute archive path and draft status without claiming release readiness.
- Equivalent manifest property ordering and source map ordering produce the same draft bytes and archive digest. Repeating an unchanged draft request is a no-op; changing the existing archive externally produces a stable stale/conflict diagnostic and leaves it untouched.
- The produced draft can be passed to the existing public `asset inspect` and reports `status: "draft"`, `valid: false`, and `asset_pack_draft`; the existing public `asset install` rejects it before changing a separate consumer workspace.
- `asset authoring sync --session <id>` pauses for explicit confirmation and, after confirmation, calls the existing linked sync behavior for the session's exact pack root. Its receipt binds pack identity/version, raw manifest digest, content/source digests, workspace/output identity, registry digest and compile generation, and all manager-owned generated definition/sprite/credit digests.
- Sync receipts become stale after source or manifest drift, a registry edit, a generated-output edit, a missing/extra managed file, or an output marker/ownership change. The last receipt remains readable as evidence and the response exposes one safe or explicit conflict action.
- Interrupted sync publication is recovered by the existing transaction/doctor path before a new receipt is recorded. Artist source, protected sentinels, and unowned paths remain unchanged.
- JSON and human output distinguish `draftArchive` and `syncReceipt` from Phase 1 release gates. No Phase 2 command reports a formal archive, archive inspection checkpoint, or consumer installation.
- Focused tests prove the public argv, strict session persistence, deterministic bytes, safe path/regular-file checks, draft rejection parity, output/registry drift, confirmation/idempotency, transaction recovery, and protected-path sentinels.

## Confirmed public seams for TDD

The user continued the implementation on 2026-08-04 (`繼續`) after Phase 1 and the Phase 2 boundary was stated. This confirms the following behavior seams for this phase. Tests must observe behavior through these seams and must not mock internal CLI/Core collaborators:

1. **Shared archive seam:** exported `createAssetPackArchive`, `inspectAssetPackArchiveBytes`, and the existing CLI `readAssetPackArchive`/`inspectAssetPackArchive`/`installAssetPack` behavior with real bytes and temporary regular files. ZIP internals are not unit-test seams.
2. **Session persistence seam:** `createAssetAuthoringSessionStore(...).read/status/resume/replace` and the persisted session JSON. Clock, UUID, filesystem, and atomic rename failures may be injected only as system boundaries.
3. **Public CLI seam:** `runCli` with exact argv for `asset authoring draft` and `asset authoring sync`, using real temporary author and consumer/sentinel workspaces plus the existing runtime fixtures.
4. **Existing lifecycle seam:** `syncLinkedAssetPack` and `doctorAssetPacks` public results for transaction interruption/recovery; assert published bytes and diagnostics rather than private call order.
5. **Response seam:** `authoringResponseProjection`, `formatJsonResponse`, and `formatHumanResponse`; assert bounded receipt fields, freshness/recovery state, and stable human lines without exposing private provenance or mocking helpers.

## Fixed Phase 2 public contract

### Commands

```text
lpc-toolkit asset authoring draft \
  --session <session-id> [--output <archive>] [--workspace <directory>] [--json]

lpc-toolkit asset authoring sync \
  --session <session-id> [--confirm] [--workspace <directory>] [--json]
```

`draft` does not require `--confirm`; it is a recovery snapshot, not a release
approval. `sync` requires `--confirm` because it changes manager-owned
generated output and registry state. Existing leaf commands retain their
current argv and semantics.

### Receipt fields

The additive session receipt slots are `draftArchive` and `sync`. A draft
receipt uses the advertised `lpc-toolkit.asset-authoring-draft-receipt.v1`
schema and binds:

```text
schema, packId, version, archivePath, archiveDigest, manifestDigest,
contentDigest, sourceDigests, recordedAt
```

The session-owned sync receipt binds:

```text
packId, version, manifestDigest, contentDigest, sourceDigests, workspaceId,
outputRoot, registryDigest, compileDigest, generatedDigests, recordedAt
```

All digest/path maps are stable lexical order. Session parsing rejects unknown
receipt fields, malformed digests, duplicate paths, unsafe paths, non-absolute
receipt paths, and receipts that do not match the containing workspace/session
scope. Receipt paths are evidence, not authorization to write outside the
manager-owned root.

### Draft publication

The default path is the session-owned release-artifact directory below the
session directory, with a deterministic `<pack-id>-<version>.draft.lpc-assets.zip`
name. An explicit `--output` path must resolve inside that same session-owned
artifact root and must be a regular-file target. The writer stages bytes with
exclusive creation, verifies the generated digest, and atomically renames them;
an existing equal file may be reused, while an existing different file is a
conflict and is never overwritten.

### Sync publication

The wrapper first checks the session manifest/source evidence and current
workspace ownership, then invokes the existing linked sync application. After
success it reads the canonical registry and managed output through existing
registry/output authorities, captures the actual bytes/digests, and atomically
persists the session receipt only after the manager generation is complete.
The receipt is stale when any bound source, manifest, registry, marker, output,
compile, or generated digest changes.

## Intended file structure

Adjust only when existing ownership makes a smaller placement clearly better;
record any deviation in this plan before implementation.

### CLI lifecycle/session

- Add a focused `packages/cli/src/asset-authoring-release-lifecycle.ts` only if
  needed for draft publication, receipt construction, contained artifact roots,
  and manager-generation evidence. Keep it as a coordinator around existing
  leaf modules; do not move archive or registry policy into it.
- Modify `packages/cli/src/asset-authoring-session.ts` for backward-readable
  `draftArchive`/`sync` receipt parsing, strict receipt types, and downstream
  invalidation decisions. Preserve old Phase 1 session files.
- Modify `packages/cli/src/asset-authoring-commands.ts` for the two public
  commands, explicit confirmation, current source/manifest checks, receipt
  publication, stale recovery, and next actions.
- Modify `packages/cli/src/response.ts`, `command-spec.ts`, `asset-commands.ts`,
  `main.ts`, and `capabilities.ts` only at existing public capability,
  validation, dispatch, and bounded projection seams.
- Reuse existing `asset-pack-format`, `asset-pack-archive-format`,
  `asset-pack-inspection`, `asset-pack-install`, `asset-pack-sync`,
  `asset-pack-registry`, `asset-pack-transaction`, and `asset-pack-doctor`
  authorities. Extend a leaf result only when the session wrapper needs an
  already-owned digest; record that deviation here first.

### Tests

- Add/extend `packages/cli/test/asset-authoring-release.test.ts` for draft and
  sync public argv, receipts, confirmation, stale/conflict behavior, and
  idempotency through real temporary workspaces.
- Extend `asset-authoring-session.test.ts` for additive receipt parsing,
  backward compatibility, persistence, and draft/sync invalidation.
- Extend `asset-authoring-session-e2e.test.ts`, `main-json.test.ts`,
  `main-human.test.ts`, and `command-spec.test.ts` for the public packed-style
  authoring flow and response contracts.
- Extend `asset-pack-archive-format.test.ts` or `asset-pack-install.test.ts`
  only when Phase 2 needs a missing public shared-format assertion; preserve
  existing formal fixture bytes.
- Use the existing `asset-pack-sync.test.ts` and `asset-pack-doctor.test.ts`
  public lifecycle seams for transaction interruption and protected sentinels;
  do not rewrite their internal transaction tests.

## Implementation sequence

### Task 1: Lock the draft archive seam and deterministic writer

**Files:** Phase 2 plan, draft lifecycle helper/tests, and only the shared
format wrapper files required by an existing public authority.

- [ ] Write the first failing public test for `asset authoring draft` and the
  shared draft bytes: forced draft marker, sorted checksums, deterministic
  archive digest, absolute contained output path, and unchanged session bytes
  before any command-side mutation.
- [ ] Add failing tests for output traversal, symlink/non-regular source or
  destination, invalid manifest/source snapshot, conflicting pre-existing
  archive, and a failed staged write leaving the prior archive/receipt intact.
- [ ] Implement the minimum deterministic writer around
  `createAssetPackArchive({ kind: 'draft' })`, current `loadAssetPackFiles`,
  contained session artifact roots, and atomic exclusive publication.
- [ ] Add the strict draft receipt value and persist it only after the archive
  bytes are verified. Repeating unchanged inputs must return the same digest.
- [ ] Run focused RED/GREEN shared-format and CLI tests, typecheck, and
  `git diff --check`.
- [ ] Commit the product slice with `feat(cli): add deterministic draft recovery archives`.

Implementation note:

Commit:

Verification:

### Task 2: Expose draft receipt state and draft inspect/install parity

**Files:** session, response, command parser/dispatch/capabilities, focused
CLI/session/JSON/human tests, and documentation only when the public contract
is finalized.

- [ ] Write failing tests for backward-readable Phase 1 sessions, strict
  `draftArchive` receipt parsing, `status`/`resume` projection, and stale draft
  archive detection after external byte changes or removal.
- [ ] Add `asset authoring draft` help, preflight, dispatch, response fields,
  stable `draft-archive` next/recovery actions, and the draft capability/schema
  advertisement. Keep consumer-install capability absent.
- [ ] Exercise the produced archive through existing public `asset inspect`
  and `asset install` seams. Assert `asset_pack_draft` and no consumer-workspace
  mutation before any staging or registry publication.
- [ ] Extend session invalidation so manifest/source/validation changes make
  draft evidence stale without deleting the prior receipt.
- [ ] Run focused draft/session/JSON/human tests and CLI typecheck.
- [ ] Commit the product slice with `feat(cli): expose authoring draft recovery state`.

Implementation note:

Commit:

Verification:

### Task 3: Add confirmed session-aware sync and generation receipt

**Files:** session/command lifecycle, existing sync/registry seam only as
needed, response/parser/dispatch/capability files, and focused sync/authoring
tests.

- [ ] Write a failing `runCli` test showing sync without `--confirm` returns
  `needs-user-action`, one exact command, and unchanged manager output/registry
  and session receipt bytes.
- [ ] Write failing green-target tests for confirmed sync, receipt binding to
  raw manifest/source/content/registry/compile/generated digests, repeated
  sync idempotency, source/manifest drift, registry/output drift, output marker
  ownership failure, and protected sentinels.
- [ ] Implement current evidence checks and call the existing
  `syncLinkedAssetPack` only after explicit confirmation. Capture the actual
  canonical registry and manager-owned generated output after transaction
  publication; persist the session sync receipt atomically afterward.
- [ ] Detect a pending/interrupted transaction through existing recovery/doctor
  behavior before recording a receipt. Do not adopt an unknown output or
  registry generation.
- [ ] Extend `status`/`resume` and human/JSON output with `syncReceipt`, stale
  evidence, output scope, registry generation, and one safe next action.
- [ ] Run focused sync, transaction, doctor, session-E2E, JSON/human tests and
  CLI typecheck. Commit with `feat(cli): add confirmed authoring sync receipts`.

Implementation note:

Commit:

Verification:

### Task 4: Reassess documentation and complete the Phase 2 gate

**Files:** all owned CLI documentation surfaces below, relevant contract tests,
this plan, and no plugin skill implementation.

- [ ] Reassess the complete CLI documentation matrix against the final diff.
- [ ] Update help and CLI README with exact draft/sync commands, output roots,
  confirmation, receipt fields, draft rejection, and stale/recovery actions.
- [ ] Update root README and landing copy to distinguish recovery drafts and
  manager-owned sync from source authoring, formal archive publication, and
  consumer installation.
- [ ] Update Architecture with receipt/output/registry ownership and update
  Engineering with Phase 2 deterministic archive, transaction, doctor, and
  protected-sentinel verification.
- [ ] Update Releasing with the new capability/schema compatibility and the
  fact that formal pack/inspect/install remain deferred.
- [ ] Update plugin compatibility references/tests so the current plugin still
  refuses the new release/draft capabilities; do not add a skill or invoke it.
- [ ] Run documentation policy, plugin, full verification, and protected-path
  checks. Commit docs and plan-record changes separately from product code.

Implementation note:

Commit:

Verification:

## CLI documentation impact matrix

Initial and expected final assessment; reassess before implementation and
again before handoff:

```text
help: update — add authoring draft/sync commands, flags, receipt fields, confirmation, and recovery states
cli-readme: update — document deterministic draft recovery, draft rejection, session-aware sync, and stale receipts
root-readme: update — distinguish draft recovery and manager sync from formal publication and consumer install
landing: update — keep source authoring, recovery snapshots, generated overlay sync, formal archives, and installation separate
architecture: update — record session receipt ownership, manager registry/output evidence, and reuse of existing lifecycle authorities
engineering: update — add Phase 2 red/green, archive parity, transaction/doctor, packed CLI, and protected-sentinel verification
releasing: update — add draft/sync capability compatibility while keeping formal pack/inspect/install deferred
plugin: update — current plugin refuses the newer release/draft capability; no authoring skill is added
```

The eventual CLI-sensitive PR body must contain:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering, releasing, plugin
CLI docs reason: Phase 2 adds public draft recovery and session-aware sync commands with new receipt state.
```

## Verification and handoff gate

Use the narrowest checks while iterating. Before handoff, run and record the
exact result for each applicable command:

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck
rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- archive.test.ts payload.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-release.test.ts asset-authoring-session.test.ts asset-authoring-session-e2e.test.ts asset-pack-archive-format.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts asset-pack-sync.test.ts asset-pack-transaction.test.ts asset-pack-doctor.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm verify:cli-docs-policy
rtk pnpm verify:plugin
rtk pnpm check:boundaries
rtk pnpm verify
rtk git diff --check
rtk git status --short
rtk git status --short -- upstream
rtk git status --short -- assets assets_custom .lpc-toolkit
```

The final evidence must prove no writes to `upstream/`, checked-in assets,
managed cache, installed snapshots, unowned output, or consumer workspace
outside the existing explicitly targeted lifecycle fixtures. Phase 3 formal
archive orchestration and Phase 4 independent consumer installation remain
deferred.

## Final acceptance checklist

- [ ] Deterministic draft archive uses the shared format authority, is safely
  contained, explicitly marked draft, and publishes atomically.
- [ ] Draft receipt is strict, digest-bound, backward-readable, and stale after
  external archive/source/manifest evidence changes.
- [ ] Existing inspect/install reject drafts with stable diagnostics and no
  consumer-workspace mutation.
- [ ] Confirmed authoring sync calls the existing linked sync transaction and
  records exact manager registry/output generation evidence.
- [ ] Sync receipt is stale after source, manifest, registry, marker, generated
  output, or compile-generation drift; the old receipt remains preserved.
- [ ] Confirmation, retry, transaction interruption, and doctor recovery are
  covered through public seams and protected sentinels.
- [ ] JSON/human output and all eight documentation surfaces accurately
  describe Phase 2 without claiming formal pack/inspect/install.
- [ ] Focused, type, boundary, documentation, plugin, full verify, build/
  package, diff, and protected-path checks pass.
- [ ] No dependency, `any`, provider, skill, Web bridge, backend, parallel
  archive/registry/sync implementation, cache mutation, checked-in asset
  mutation, or `upstream/` mutation entered the Phase 2 change.
