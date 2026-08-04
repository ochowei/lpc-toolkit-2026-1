# Agent-Assisted Asset Pack Release Lifecycle — Phase 3 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with vertical
> red → green loops. Do not begin a later task until the current task's
> focused checks pass and its implementation record is committed.

**Goal:** Implement Phase 3 of GitHub Issue [#150](https://github.com/ochowei/lpc-toolkit-2026-1/issues/150): add session-aware formal asset-pack publication and exact-byte archive inspection after the existing release gates pass, while preserving the existing formal archive bytes and leaf command behavior.

**Base:** Continue from Phase 2 product/plan records at `e1546e44d6401ab81be3412344ed99d7902aa295`. The complete contract is [`2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md`](../specs/2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md). Phase 4 independent consumer installation remains deferred.

**Architecture:** The shared asset-pack format and existing CLI packaging/inspection modules remain authoritative for manifest normalization, deterministic archive bytes, checksums, safety limits, validation, attribution, and inspection. The authoring layer only projects current release gates, supplies the session-contained publication target, records formal/inspection receipts, and exposes bounded recovery actions. No second archive, manifest, checksum, validation, attribution, or installation implementation is introduced.

**Tech stack:** Strict TypeScript, Node.js 22+, pnpm, Vitest, existing CLI filesystem/runtime adapters, and the existing asset-pack-format APIs. Add no dependency and no `any`.

## Global constraints

- Implement only Phase 3: formal gate projection, session-aware `pack`, exact-byte `inspect`, formal fixture parity, release-artifact containment, and packed CLI formal-flow acceptance.
- Do not implement consumer installation, provider invocation/discovery, a Codex authoring skill, a Web-to-CLI bridge, a backend, remote registry/signing, global installation, or npm publication.
- Reuse `packAssetPack`, `inspectAssetPackArchive`, `readAssetPackArchive`, `validateAssetPackPayload`, and the existing session/release-gate authorities. If a leaf result needs an optional publication target, extend that existing seam without changing its default behavior.
- Formal pack requires a trusted current session, fresh validation, current acknowledgement/declaration/preview-acceptance evidence, explicit `--confirm`, a contained regular-file output, and no draft marker. It must not publish a formal archive before any gate or race check passes.
- Formal inspect is read-only. It must inspect the exact archive bytes, reject drafts/unsafe or invalid archives, and update the session inspection checkpoint only when the inspected archive digest equals the current formal-pack receipt.
- Preserve stale receipts as evidence. Never silently adopt external archive bytes, newer source bytes, or copied archive bytes into the session checkpoint. A failed or raced publication leaves the prior receipt and files unchanged.
- Preserve existing formal archive bytes and leaf diagnostics when using the default `asset pack` and `asset inspect` commands.
- Keep public response compatibility: retain `lpc-toolkit.asset-authoring-session.v1` and `lpc-toolkit.asset-authoring-response.v1`; add only documented formal/inspection receipt fields. Older Phase 1/2 sessions remain readable with missing/null Phase 3 receipts.
- Prefix every repository terminal command with `rtk`. Use pnpm for repository development.
- Never initialize, modify, install packages inside, or commit inside `upstream/`. Do not write checked-in `assets/`, the verified base cache, generated `assets_custom/`, installed snapshots, or unowned output.
- After each completed implementation task, check its boxes, add a short note, record the full product commit hash, and record exact verification commands in this plan. Commit the plan record separately with `docs(plan): record ...`.

## Observable success

- `asset authoring pack --session <id> [--output <archive>] --confirm [--json]` refuses to publish when any release gate is missing/stale/blocked, when the session manifest/source evidence is not current, or without explicit confirmation.
- Formal pack calls the existing deterministic pack authority, writes only below the session-owned release-artifact root, omits the draft marker, returns an absolute archive path/digest, and records a digest-bound `formalArchive` receipt only after the bytes are verified.
- Repeating formal pack with unchanged current evidence is idempotent and preserves the same archive digest/receipt bytes. Equivalent canonical source ordering preserves the existing formal fixture bytes.
- `asset authoring inspect --session <id> --archive <archive> [--json]` calls the existing inspection authority, remains read-only, returns bounded inspection data, and records `archiveInspection` only for a valid formal archive whose digest equals the current formal-pack receipt.
- External archive mutation, source/manifest drift, release evidence drift, unsafe output, and digest races preserve the old receipt and expose one safe or explicit recovery action; copied valid archives are inspectable but do not become the session checkpoint unless their digest matches the formal pack receipt.
- JSON and human output distinguish `formalArchiveReceipt` and `inspectionReceipt` from `draftReceipt`, `syncReceipt`, and release gates. Phase 3 never reports consumer installation.
- Focused tests cover every gate refusal, explicit confirmation, deterministic output parity, contained paths, formal/draft distinction, exact-byte inspect, stale receipts, idempotency, and packed public-CLI acceptance.

## Confirmed public seams for TDD

1. **Public CLI seam:** `runCli` with exact argv for `asset authoring pack` and `asset authoring inspect`, using real temporary authoring workspaces and runtime fixtures.
2. **Existing leaf seam:** `packAssetPack` and `inspectAssetPackArchive` with real files/bytes; do not mock internal archive or validation collaborators.
3. **Session persistence seam:** `createAssetAuthoringSessionStore(...).read/status/resume/replace` and persisted session JSON. Inject only filesystem/clock/rename boundaries when testing races or failed publication.
4. **Response seam:** `authoringResponseProjection`, `formatJsonResponse`, and `formatHumanResponse`; assert bounded receipt fields, freshness/recovery state, and stable human lines.
5. **Packed acceptance seam:** the installed public CLI smoke flow with a real formal pack and exact-byte inspect, while preserving protected sentinels.

## Implementation sequence

### Task 1: Lock the formal pack/inspect public contract

- [x] Add the first failing public argv tests for formal pack refusal before missing release gates and for missing `--confirm`.
- [x] Add failing command-spec, preflight, capability/schema, and response-shape assertions for `pack` and `inspect`.
- [x] Add failing containment/idempotency tests that require a session-owned absolute artifact path and preserve existing formal leaf fixture bytes.
- [x] Verification: focused CLI tests RED; `rtk git diff --check` PASS.

Implementation note:
- Added the public `pack`/`inspect` argv contract, preflight, command specs,
  capability schemas, bounded response fields, and first public refusal and
  confirmation cases while preserving the existing leaf command defaults.

- Commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`

- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- main-json.test.ts command-spec.test.ts asset-authoring-release.test.ts asset-authoring-session.test.ts main-human.test.ts response.test.ts` PASS (162 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc --noEmit` PASS; `rtk git diff --check` PASS.

### Task 2: Add formal archive publication and receipt persistence

- [x] Extend the existing pack authority only enough to accept a contained publication target while preserving its default output path and bytes.
- [x] Add strict backward-readable formal receipt parsing, scope validation, checkpoint/provenance support, and response projection.
- [x] Implement explicit confirmation, fresh release-gate/source checks, atomic publication, digest race checks, and idempotent formal pack.
- [x] Verification: focused formal pack tests GREEN; CLI typecheck and relevant archive/packaging tests PASS.
- [x] Commit: record full product hash here.

Implementation note:
- Extended the existing deterministic pack authority with an optional explicit
  target and no-overwrite guard. The authoring coordinator now projects the
  current validation/declaration/preview-acceptance gates, publishes below the
  session release-artifact root, verifies archive identity/digests, and records
  a strict `formalArchive` receipt without a second archive implementation.

- Commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`

- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-release.test.ts asset-authoring-session.test.ts` PASS (27 tests); `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-archive-format.test.ts` PASS (82 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc --noEmit` PASS.

### Task 3: Add exact-byte inspection and stale recovery

- [x] Implement session-aware inspect through the existing inspection authority with no archive mutation.
- [x] Persist inspection evidence only for the exact current formal archive digest; reject draft/invalid/unsafe/copied mismatches without replacing the formal receipt.
- [x] Add external archive/source drift, repeated inspect, and failed publication recovery tests.
- [x] Verification: focused inspect/receipt tests GREEN; boundaries and diff checks PASS.
- [x] Commit: record full product hash here.

Implementation note:
- Added exact-byte inspection receipts, formal archive/source/evidence stale
  detection, safe recovery actions, copied-archive non-adoption, repeated
  inspection idempotency, and read-only invalid-archive handling through the
  existing inspection authority.

- Commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`

- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-release.test.ts asset-authoring-session.test.ts` PASS (27 tests); `rtk pnpm check:boundaries` PASS; `rtk git diff --check` PASS.

### Task 4: Documentation and packed formal-flow acceptance

- [x] Reassess and update every CLI-sensitive surface:

```text
help: update — add formal pack/inspect commands, confirmations, gates, and recovery states
cli-readme: update — document declarations, draft/formal archives, inspect, and containment
root-readme: update — distinguish authoring, draft recovery, formal publication, and consumer install
landing: update — keep composition, source creation, archive publication, and installation separate
architecture: update — record formal receipts, archive ownership, and no Web session bridge
engineering: update — add Phase 3 focused, parity, packed, and recovery verification
releasing: update — add formal archive and capability release/post-publication checks
plugin: update — document that the current plugin still refuses the newer release capabilities; no skill is added
```

- [x] Extend the packed public CLI acceptance through formal pack and exact-byte inspect; prove no writes to protected paths or consumer workspace.
- [x] Verification: focused tests, CLI docs policy, plugin policy, boundaries, package smoke, full `rtk pnpm verify`, and protected-path checks PASS.
- [x] Commit: record full product hash and separate plan-record hash here.

Implementation note:
- Updated all eight CLI documentation surfaces and plugin compatibility
  references. The packed smoke now exercises public acknowledgement, release
  declaration, preview acceptance, formal pack, exact inspect, and idempotent
  reruns; formal output remains session-contained and non-draft. Consumer
  installation remains explicitly deferred to Phase 4.

- Product commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`

- Verification: `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS; `rtk pnpm verify:cli-docs-policy` PASS; `rtk pnpm verify:plugin` PASS (40 tests and structure check); `rtk pnpm check:boundaries` PASS; `rtk pnpm verify` PASS (Web 861 tests; CLI 1,147 passed and 1 skipped); `rtk git status --short -- upstream` PASS (clean); `rtk git status --short -- assets assets_custom .lpc-toolkit` PASS (clean).

## Plan record

- [x] Task 1 — public pack/inspect contract and response seams recorded.
  - Commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`
  - Verification: focused public contract tests and CLI typecheck PASS.
- [x] Task 2 — formal archive publication and receipt persistence recorded.
  - Commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`
  - Verification: formal pack/session/archive tests PASS.
- [x] Task 3 — exact-byte inspection and stale recovery recorded.
  - Commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`
  - Verification: inspection/session tests, boundaries, and diff check PASS.
- [x] Task 4 — documentation, packed acceptance, protected paths, and full
  verification recorded.
  - Product commit: `d240ff779b9cece402cd8cd7f05f0955395d91f9`
  - Plan-record commit: pending; recorded after the separate plan commit.
  - Verification: `rtk pnpm verify` PASS; `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS.
