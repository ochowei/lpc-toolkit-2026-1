# Agent-Assisted Asset Authoring Foundation Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with test-first
> loops. Do not begin a later task until the current task's focused checks pass
> and its implementation record is committed.

**Goal:** Implement GitHub issue
[#149](https://github.com/ochowei/lpc-toolkit-2026-1/issues/149) so a public
CLI consumer can create and resume one bounded asset authoring session, obtain
an exact provider-neutral sprite drawing contract and drawing artifacts,
safely import a candidate sprite, and retain current validation and attributed
preview receipts without understanding the asset-pack manifest.

**Architecture:** Core owns strict authoring-plan parsing, normalized drawing
intent, pure geometry/cell policy, deterministic target identity, drawing
contract construction, and contract digest projection. The CLI owns capability
advertisement, artist-workspace session state, filesystem containment, atomic
session and sprite publication, PNG decoding, template/guide/reference
materialization, existing asset-pack command orchestration, human/JSON
presentation, and recovery. Existing asset-pack validation and preview logic
remain authoritative and are reused rather than copied.

**Tech Stack:** TypeScript strict mode, Node.js 22+, pnpm, Vitest, existing
Core/catalog/asset-pack APIs, existing `@lpc-toolkit/asset-pack-format` PNG
preflight, existing `@napi-rs/canvas` Node adapter, and existing workspace and
transaction safety helpers. Add no dependency.

**Product design:**
[`2026-08-03-agent-assisted-asset-pack-authoring-design.md`](../specs/2026-08-03-agent-assisted-asset-pack-authoring-design.md)

**Specification:**
[#149 — CLI agent-assisted asset authoring foundation](https://github.com/ochowei/lpc-toolkit-2026-1/issues/149)

**ADRs:**
[ADR-0007](../../adr/0007-keep-sprite-generation-provider-neutral.md),
[ADR-0008](../../adr/0008-keep-animation-audit-read-only.md), and
[ADR-0009](../../adr/0009-require-human-asset-release-declarations.md)

## Global Constraints

- Implement only the foundation in #149: capabilities, authoring plan/session,
  drawing contracts and artifacts, candidate import, session-aware validation
  and preview, manifest reconciliation, and structured recovery.
- Do not implement the Codex asset-pack authoring skill, Antigravity or Claude
  Code packaging, generation-provider invocation, sync/pack/install session
  orchestration, formal release declarations, acknowledgement entry, or Web
  Workbench changes.
- Existing `asset init`, `asset validate`, and `asset preview` behavior remains
  the source of truth. New authoring wrappers must call the same application
  logic and preserve diagnostic and attribution semantics.
- Preserve the existing CLI envelope. Authoring `state` describes the bounded
  workflow result; it does not redefine envelope `ok` or formal release
  readiness.
- Keep `packages/core/` environment-agnostic. Core must not import Node,
  filesystem, DOM, React, concrete canvas, ZIP, CLI, Agent, or provider code.
- Add no dependency and no `any`. If either appears necessary, stop and ask.
- Never initialize, modify, or install packages inside `upstream/`. Never write
  into checked-in `assets/`, the verified managed cache, generated overlay,
  installed pack source, or unowned output.
- Candidate files remain untouched. Candidate import publishes only the exact
  contract-selected target below the artist pack's `sprites/` root.
- Every preview must publish matching metadata plus TXT and CSV credits.
- Audit input remains immutable evidence. Do not expand the read-only audit
  skill or change audit findings to make authoring easier.
- Use the glossary in [`CONTEXT.md`](../../../CONTEXT.md). Do not conflate a
  character document, sprite composition, asset-pack manifest, sprite pixels,
  animation extension, asset validation, formal archive, or installation.
- Prefix every repository terminal command with `rtk`.
- Make surgical changes. Preserve unrelated user work and existing public
  behavior.
- After each task's product commit, update this checked-in plan: check the
  completed boxes, add a concise implementation note, record the full product
  commit hash, and record each exact verification command with PASS/FAIL.
  Commit that record separately with `docs(plan): record ...`.

## Observable Success

- A packed public CLI reports authoring capability and schema identifiers.
- A user starts one new-item, audit-derived extension, or existing-pack session
  from a strict plan and receives an opaque session ID plus safe next actions.
- Missing manifest-required credits create a durable `needs-user-action`
  session without invented author, license, or acknowledgement data.
- The CLI produces deterministic contract JSON, transparent templates,
  separate guides, and attributed references from Core-owned geometry.
- A valid real PNG candidate imports atomically to the exact contract target;
  unsafe, stale, malformed, or raced candidates leave pack and session state
  unchanged.
- A correction iteration may replace a session-owned target. A pre-existing
  target requires explicit replacement plus its exact expected digest.
- Validation and attributed preview receipts remain current only for their
  exact manifest, sources, validation result, and preview inputs.
- `status` is read-only. `resume` changes only session bookkeeping and safely
  adopts external PNG evidence while refusing to resolve manifest conflicts.
- Manifest reconciliation requires an explicit choice and expected digest.
- JSON output always includes structured state, diagnostics, artifacts,
  required inputs, retry safety, and next actions. Human output communicates
  the same material information without requiring manifest knowledge.
- The clean packed-CLI acceptance proves interruption and recovery with real
  PNGs and untouched protected sentinels.

## Fixed Public Contracts

Implementation must use these names unless this plan and #149 are amended
before product work begins.

### Commands

```text
lpc-toolkit capabilities --json
lpc-toolkit asset authoring start --plan <plan.json> [--workspace <directory>] [--json]
lpc-toolkit asset authoring status --session <session-id> [--workspace <directory>] [--json]
lpc-toolkit asset authoring resume --session <session-id> [--workspace <directory>] [--json]
lpc-toolkit asset authoring contract --session <session-id> [--refresh] [--workspace <directory>] [--json]
lpc-toolkit asset authoring import --session <session-id> --target <target-id> --candidate <png> --contract-digest <sha256> [--replace-existing --expected-target-digest <sha256>] [--workspace <directory>] [--json]
lpc-toolkit asset authoring validate --session <session-id> [--workspace <directory>] [--json]
lpc-toolkit asset authoring preview --session <session-id> [existing preview options] [--workspace <directory>] [--json]
lpc-toolkit asset authoring reconcile-manifest --session <session-id> --use <external|session> --expected-external-digest <sha256> [--workspace <directory>] [--json]
```

All commands are non-interactive. Session IDs are workspace-local opaque UUIDs.

### Schemas and capabilities

```text
lpc-toolkit.asset-authoring-plan.v1
lpc-toolkit.asset-authoring-session.v1
lpc-toolkit.asset-authoring-response.v1
lpc-toolkit.sprite-drawing-contract.v1

asset-authoring-session.v1
sprite-drawing-contract.v1
asset-authoring-candidate-import.v1
asset-authoring-recovery.v1
```

### Workflow values

- Result state: `completed | needs-user-action | failed`
- Phase: `planned | scaffolded | contract-ready | awaiting-candidate |
  imported | validated | previewed | blocked`
- Checkpoint freshness: `missing | current | stale | blocked`
- Next-action safety: `safe | requires-confirmation | blocked`
- Drawing-cell policy: `required-drawn | optional-transparent |
  required-transparent | unchanged`
- Plan goal: `new-item | extend-item | attach-pack`

### Response invariants

- The existing envelope `ok` describes command execution trustworthiness.
- `ok: true` may contain `state: needs-user-action`.
- Untrusted or corrupt session/contract state uses `ok: false` and exposes no
  mutating next action.
- Authoring data includes schema, session ID, goal, state, reason, phase,
  latest valid checkpoint, checkpoint freshness, diagnostics, artifacts,
  inputs needed, next actions, retry safety, manifest digest, source digests,
  CLI version, capabilities, and schema versions.
- Next actions include stable ID, summary, command/argv or argv template,
  safety, required inputs, precondition digests, and expected checkpoint.
- Artifact filesystem paths are absolute. Logical target paths remain portable.

## Intended File Structure

Adjust only if existing ownership makes a smaller placement clearly better;
record any deviation before implementation.

### Core

- `packages/core/src/asset-authoring-schema.ts` — strict plan types/parser,
  normalized authoring intent, shared diagnostics, schema constants.
- `packages/core/src/sprite-drawing-contract.ts` — pure target planning,
  geometry/cell mapping, stable target IDs, deterministic projection/digest
  input.
- `packages/core/src/index.ts` — export the approved public pure contracts.
- `packages/core/test/asset-authoring-schema.test.ts` — plan parsing,
  normalization, goals, strict fields, bounded audit evidence.
- `packages/core/test/sprite-drawing-contract.test.ts` — geometry, cells,
  ordering, identities, and digest behavior.

### CLI

- `packages/cli/src/asset-authoring-session.ts` — session schema, strict read,
  atomic write, workspace binding, phases/checkpoints, drift and conflict
  derivation, status/resume/reconciliation decisions.
- `packages/cli/src/asset-authoring-contract.ts` — Core planner orchestration,
  contract digest, template/guide/reference artifact materialization.
- `packages/cli/src/asset-authoring-import.ts` — candidate pinning, PNG/pixel
  inspection, contract enforcement, replacement authorization, atomic target
  publication, import receipt.
- `packages/cli/src/asset-authoring-commands.ts` — start/status/resume/contract,
  import, validate, preview, reconcile, and response construction.
- `packages/cli/src/capabilities.ts` — stable machine-readable capability and
  schema advertisement.
- Existing command parser/spec, asset command dispatch, main dispatch, response
  presentation, validation, preview, workspace, source-file, and PNG helpers —
  extend at their current seams without duplicating behavior.
- Focused CLI tests mirroring each new module plus command/help, human/JSON,
  main dispatch, and public E2E coverage.
- Packed CLI smoke — extend the existing clean installation workflow.

### Documentation

- Command help and CLI README — complete authoring command, schema, state,
  artifact, and recovery contract.
- Root README and landing content — clearly separate existing composition,
  asset authoring, audit handoff, formal publication, and installation.
- Architecture — Core/CLI/Agent/Web ownership and session non-publication.
- Engineering — focused tests and packed-CLI acceptance mapping.
- Releasing — capability/schema compatibility and public-package checks.
- Plugin references/tests — compatibility and safe refusal only; no new skill
  implementation in this plan.

## CLI Documentation Impact

Initial assessment; reassess before implementation and again before handoff.

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: update
```

- **help:** new command group, flags, state, recovery, and examples.
- **cli-readme:** full plan/session/contract/import workflow and JSON contract.
- **root-readme:** primary Agent-assisted CLI workflow and concept separation.
- **landing:** public discoverability without implying provider bundling.
- **architecture:** Core contract ownership, CLI session/filesystem ownership,
  and provider-neutral boundary.
- **engineering:** focused test map, real-PNG fixtures, build/package smoke, and
  complete handoff gate.
- **releasing:** capability/schema version changes and post-publication checks.
- **plugin:** old plugin safe refusal, compatibility guidance, and contract
  fixtures; do not add the future authoring skill here.
- Correct CLI README plugin-version drift from `0.2.0` to `0.2.1` and retain a
  documentation-contract test.

---

## Phase 1 — Lock Pure Authoring and Drawing Contracts

### Task 1: Add the strict authoring-plan contract

**Files:**

- Create: `packages/core/src/asset-authoring-schema.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/asset-authoring-schema.test.ts`

- [x] Write failing tests for strict schema identity, unknown fields, each
  plan goal, normalized stable ordering, exact audit/remediation evidence,
  missing required intent, optional draft credits, and no partial parse.
- [x] Define stable authoring diagnostic codes and strict parse results using
  existing Core conventions; do not add a second generic JSON parser.
- [x] Normalize one bounded pack/asset scope and preserve approved consent and
  provider metadata without treating them as execution authority.
- [x] Ensure `extend-item` retains full report digest, selected finding,
  consumer, path confidence, geometry evidence, and source-cell context.
- [x] Export the plan contract through Core's public entry point.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/core test -- asset-authoring-schema.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added the strict Core `lpc-toolkit.asset-authoring-plan.v1`
    parser and normalized plan union for `new-item`, `extend-item`, and
    `attach-pack`. It rejects unknown fields and invalid schema/intent without
    returning partial plans, preserves bounded consent/provider metadata and
    optional draft credits, and retains digest-bound audit/remediation evidence
    including selected consumers, path confidence, geometry, and source cells.
  - Product commit: `df9035a3c1c39d968f96690fead47f14b4b987ef`
    (`feat(core): add asset authoring plan schema`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-authoring-schema.test.ts`
    FAIL (expected: `asset-authoring-schema.ts` did not exist; Vitest loaded 0 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-authoring-schema.test.ts`
    PASS (12 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS
    (26 files, 383 tests).

### Task 2: Build deterministic sprite drawing contracts in Core

**Files:**

- Create: `packages/core/src/sprite-drawing-contract.ts`
- Modify: `packages/core/src/asset-animation-audit.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/sprite-drawing-contract.test.ts`

- [x] Write failing tests for stable target IDs, complete PNG geometry,
  directions, logical-frame/source-cell mappings, body/layer/variant/consumer
  context, and all four cell policies.
- [x] Reuse registered standard/custom animation geometry; export the smallest
  existing pure helper needed instead of duplicating LPC constants.
- [x] Cover simple male/female walk and optional idle new-item targets, exact
  missing-file extension, and exact blank-frame repair with unchanged-cell
  baseline digests.
- [x] Define a deterministic semantic projection whose digest changes for
  every geometry/source/reference input but not JSON property ordering.
- [x] Keep filesystem paths, absolute artifact paths, timestamps, providers,
  and runtime objects out of the pure contract.
- [x] Export the drawing contract types/planner through Core.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/core test -- sprite-drawing-contract.test.ts asset-animation-audit.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added the pure Core `lpc-toolkit.sprite-drawing-contract.v1`
    planner with stable target identities, portable logical target/source paths,
    complete registered standard/custom PNG geometry, direction and
    logical-frame mappings, layer/body/variant/consumer context, explicit
    transparency rules, all four cell policies, audit-derived missing-file and
    blank-frame repair targets, unchanged-cell baseline digests, and canonical
    reference/source projection input for caller-owned hashing. Exported the
    registry-backed standard/custom geometry helpers and kept provider,
    timestamps, absolute artifact paths, and runtime objects outside the pure
    contract.
  - Product commit: `1c62f9c75ca4b88a67ed7c4c74bbd3a317a552b2`
    (`feat(core): add deterministic sprite drawing contracts`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/core test -- sprite-drawing-contract.test.ts`
    FAIL (6 tests; expected `planSpriteDrawingContract is not a function` before
    the Task 2 implementation existed).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- sprite-drawing-contract.test.ts asset-animation-audit.test.ts`
    PASS (2 files, 18 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS
    (27 files, 390 tests).
  - Additional verification: `rtk git diff --check` PASS.

---

## Phase 2 — Establish Public CLI and Durable Session State

### Task 3: Add capability advertisement and the authoring command contract

**Files:**

- Create: `packages/cli/src/capabilities.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/src/args.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/test/args.test.ts`
- Modify: `packages/cli/test/command-spec.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

- [x] Write failing parser/help tests for the exact fixed command surface,
  mutual requirements, replacement flags, preview option reuse, and rejected
  extra positional/unknown options.
- [x] Write failing JSON tests for `capabilities --json`, schema identifiers,
  stable capability ordering, and the initial authoring response projection.
- [x] Add human summaries that distinguish command success, workflow state,
  stale checkpoints, missing inputs, and confirmation-required actions.
- [x] Keep capability discovery read-only and independent of workspace/cache
  preparation.
- [x] Do not dispatch mutating behavior until Tasks 4–8 provide the owning
  application modules; use explicit structured not-yet-reachable test seams,
  not silent placeholders in production output.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added read-only CLI capability advertisement with the fixed
    schema/capability ordering, parsed the complete three-token `asset authoring`
    command tree, enforced required and replacement/reconciliation flag
    relationships before dispatch, reused existing asset preview options, and
    added typed initial authoring-response projection plus human summaries for
    state, stale checkpoints, missing inputs, and confirmation-required actions.
    Authoring leaves stop at an explicit structured not-yet-reachable seam; no
    session, workspace, cache, asset, or candidate mutation is dispatched before
    Tasks 4–8 provide the owning application modules.
  - Product commit: `f2ee62a222a2eb9663ffcd386631de0fba8c01d3`
    (`feat(cli): add authoring command contract`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts`
    FAIL (5 focused tests failed as expected; the parser returned `import` as a
    positional, fixed authoring/capabilities help was absent, the capabilities
    module could not load, and the response projection was not implemented).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts`
    PASS (4 files, 131 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk git diff --check` PASS.
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/cli test` FAIL
    (54 files passed, 1 skipped, 1,050 tests passed; 13 existing
    `web-server.test.ts` cases could not bind `127.0.0.1` in the sandbox and
    returned `listen EPERM`).
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/cli test -- web-server.test.ts`
    PASS (22 tests when rerun with the required loopback-binding escalation;
    confirms the full-suite failures are environmental and unrelated).
  - CLI documentation impact reassessment for this contract-only task:
    `help: update` (generated command help changed here); `cli-readme: N/A — prose
    workflow documentation remains a later plan documentation surface`;
    `root-readme: N/A — the overall workflow landing remains a later plan
    documentation surface`; `landing: N/A — public positioning remains a later
    plan documentation surface`; `architecture: N/A — ownership prose remains a
    later plan documentation surface`; `engineering: N/A — verification mapping
    remains a later plan documentation surface`; `releasing: N/A — release
    compatibility prose remains a later plan documentation surface`; `plugin:
    N/A — plugin compatibility and skill documentation remain a later plan
    documentation surface`.

### Task 4: Persist strict workspace-bound authoring sessions

**Files:**

- Create: `packages/cli/src/asset-authoring-session.ts`
- Modify: `packages/cli/src/asset-workspace.ts`
- Create: `packages/cli/test/asset-authoring-session.test.ts`

- [x] Write failing tests for UUID identity, workspace binding, strict schema,
  atomic create/replace, prior-state survival after injected failure, foreign
  workspace refusal, tamper/unknown-version refusal, and containment.
- [x] Implement the fixed phases, per-target checkpoints, freshness values,
  receipts, provenance events, conflict record, and session timestamps.
- [x] Store session state only in manager-owned workspace state outside pack,
  overlay, registry/installed state, and base cache.
- [x] Add pure invalidation decisions for manifest semantic drift, contract
  replacement, PNG drift, validation receipts, and preview receipts.
- [x] Implement read-only status inspection separately from bookkeeping-only
  resume reconciliation.
- [x] Prove repeated status/resume with unchanged files is semantically
  idempotent.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session.test.ts asset-workspace.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added a strict v1 session document and workspace-scoped
    store under `<workspace stateRoot>/authoring-sessions`, with UUIDv4 identity,
    strict plan/schema parsing, workspace and pack containment checks, atomic
    create/replace, cleanup and prior-state survival on injected replacement
    failure. The session records fixed phases, per-target checkpoints and
    freshness, validation/preview receipts, provenance, manifest conflicts, and
    timestamps. `status` is read-only; `resume` performs only idempotent
    bookkeeping for supplied invalidation decisions. No pack, overlay,
    registry/installed, base-cache, checked-in asset, or `upstream/` state was
    changed.
  - Product commit: `3142ef9974d251c855681466b5885f1119613d87`
    (`feat(cli): persist authoring sessions`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session.test.ts asset-workspace.test.ts`
    FAIL (the new focused test module could not load the not-yet-created
    `../src/asset-authoring-session.js`; existing `asset-workspace.test.ts`
    passed 18 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session.test.ts asset-workspace.test.ts`
    PASS (2 files, 26 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS
    (the first implementation iteration reported one unused helper; the helper
    was removed and the final run passed).
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk git diff --check` PASS.
  - CLI documentation impact reassessment for this persistence-only task:
    `help: N/A — no public command/help text changed`; `cli-readme: N/A — no
    user-facing workflow prose changed`; `root-readme: N/A — no root workflow
    landing changed`; `landing: N/A — no public positioning changed`;
    `architecture: N/A — the existing ownership boundaries remain unchanged`;
    `engineering: N/A — no verification policy or command contract changed`;
    `releasing: N/A — no release or package compatibility contract changed`;
    `plugin: N/A — no plugin capability or compatibility contract changed`.

### Task 5: Start, attach, inspect, resume, and reconcile sessions

**Files:**

- Create: `packages/cli/src/asset-authoring-commands.ts`
- Modify: `packages/cli/src/asset-commands.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Create: `packages/cli/test/asset-authoring-commands.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

- [x] Write failing command tests for new-item, exact audit-derived extension,
  attach-pack, missing draft credits, workspace discovery/override, and one-pack
  scope enforcement.
- [x] Reuse existing scaffold behavior when plan inputs satisfy its contract;
  do not reproduce asset-pack manifest generation.
- [x] Persist a session before returning `needs-user-action` for missing
  manifest-required author/license data; invent no placeholder declarations.
- [x] Implement `status` as read-only and `resume` as session-bookkeeping-only.
- [x] Detect external PNG drift and record provenance/invalidation without
  overwriting source.
- [x] Detect all manifest byte drift as conflict. Implement explicit adopt
  external and restore session revisions with the required expected digest and
  race-safe atomic behavior.
- [x] Return structured next actions with precise safety and precondition
  digests for every recoverable state.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-commands.test.ts main-json.test.ts main-human.test.ts main-assets.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added the public CLI authoring command application for
    start, attach-pack, status, resume, and manifest reconciliation. It
    discovers or honors the explicit workspace override, parses strict plans,
    persists sessions before missing-credit pauses, reuses the existing new-item
    scaffold without duplicating manifest generation, preserves exact
    audit-derived extension evidence for the next contract step, and keeps
    attach-pack manifests unchanged. Status is read-only; resume records
    external PNG evidence and detects every manifest-byte drift as a conflict;
    external adoption and session-revision restore require the expected digest,
    with manager-owned manifest snapshots and atomic replacement. Responses
    expose stable JSON/human state, inputs, artifacts, safety, preconditions, and
    next actions. Removed the obsolete not-yet-reachable production seam.
  - Product commit: `2cba86b4c76f9b52ef900440f3fa9ae9ed224763`
    (`feat(cli): orchestrate authoring sessions`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-commands.test.ts main-json.test.ts main-human.test.ts main-assets.test.ts`
    FAIL (13 focused tests failed before the command application existed: 8 new
    command tests, 3 dispatch requirement cases, and the new JSON/human routing
    cases).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-commands.test.ts main-json.test.ts main-human.test.ts main-assets.test.ts`
    PASS (4 files, 209 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session.test.ts asset-workspace.test.ts`
    PASS (2 files, 26 tests).
  - Additional verification: `rtk git diff --check` PASS.
  - CLI documentation impact reassessment for this command-orchestration task:
    `help: N/A — the fixed authoring help surface was added in Task 3 and no
    help text changed here`; `cli-readme: N/A — workflow prose is deferred to
    Task 10`; `root-readme: N/A — no root workflow copy changed`; `landing: N/A
    — no public positioning changed`; `architecture: N/A — ownership
    boundaries remain unchanged`; `engineering: N/A — the verification policy
    remains unchanged`; `releasing: N/A — no release compatibility contract
    changed`; `plugin: N/A — no plugin capability or compatibility contract
    changed`.

---

## Phase 3 — Materialize Drawing Work and Import Pixels Safely

### Task 6: Publish contract, template, guide, and reference artifacts

**Files:**

- Create: `packages/cli/src/asset-authoring-contract.ts`
- Modify: `packages/cli/src/asset-authoring-commands.ts`
- Create: `packages/cli/test/asset-authoring-contract.test.ts`
- Add: legally attributed real PNG/reference fixtures under existing CLI test
  fixture ownership.

- [x] Write failing tests for deterministic contract JSON, exact target paths,
  transparent templates, separate non-importable guides, reference overlays,
  artifact metadata, and absolute returned paths.
- [x] Build contracts only through Core's planner and current catalog/baseline
  evidence. Never infer remembered LPC geometry in CLI code.
- [x] Use existing image/canvas and PNG preflight capabilities. Add no image
  dependency or parallel PNG parser.
- [x] For blank-frame repair, materialize an attributed, digest-bound working
  copy and identify every unchanged cell; do not alter its base source.
- [x] Bind every artifact to session ID, stable target ID, and contract digest.
- [x] Reject stale planning input; implement explicit `--refresh` that
  invalidates prior candidate/import checkpoints.
- [x] Prove guides/reference overlays cannot be mistaken for candidate sprites.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-contract.test.ts asset-pack-validation.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record fixture author/license/source in the owning fixture metadata.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added the strict CLI contract materializer at the existing
    authoring command seam. It asks Core for registered geometry and cell
    policies, binds the canonical contract digest to session-owned contract
    JSON, transparent templates, separate visual guides, and deterministic
    absolute artifact paths. Blank-frame repair loads the active catalog and
    attributed base PNG through existing runtime/PNG capabilities, emits an
    unchanged working copy plus a dimmed reference overlay, records every
    unchanged cell and attribution in non-importable metadata, and leaves the
    base source untouched. Contract planning rejects changed source evidence
    unless `--refresh` explicitly invalidates prior session checkpoints and
    receipts. The fixture metadata records Fixture Artist, GPL 3.0, and the
    existing attributed viewer PNG/source; no binary asset was changed.
  - Product commit: `723e6bd75a28d05cc8287661ee004596581e0f89`
    (`feat(cli): publish authoring contract artifacts`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-contract.test.ts asset-pack-validation.test.ts`
    FAIL (1 focused file failed with 2 contract tests failing at the deferred
    contract response; the existing validation file passed 22 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-contract.test.ts asset-pack-validation.test.ts`
    PASS (2 files, 24 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/cli test -- main-assets.test.ts main-json.test.ts asset-authoring-commands.test.ts asset-authoring-session.test.ts`
    PASS (4 files, 181 tests).
  - Additional verification: `rtk git diff --check` PASS.
  - CLI documentation impact reassessment for this artifact-publication task:
    `help: N/A — the fixed authoring command/help surface was added in Task 3;
    this task only supplies its deferred implementation`; `cli-readme: N/A —
    end-to-end workflow prose remains a later plan documentation surface`;
    `root-readme: N/A — no root workflow copy changed`; `landing: N/A — no
    public positioning changed`; `architecture: N/A — the existing Core
    planner/CLI materializer ownership is implemented without changing the
    documented boundary`; `engineering: N/A — no repository verification
    policy changed`; `releasing: N/A — no release compatibility contract
    changed`; `plugin: N/A — no plugin capability or compatibility contract
    changed`.

### Task 7: Import candidate sprites through one atomic trust boundary

**Files:**

- Create: `packages/cli/src/asset-authoring-import.ts`
- Modify: `packages/cli/src/asset-authoring-commands.ts`
- Modify: `packages/cli/src/asset-pack-files.ts`
- Create: `packages/cli/test/asset-authoring-import.test.ts`

- [x] Write a valid real-PNG failing test through the public import application
  seam before implementing success.
- [x] Add failure tests for wrong target/digest, stale contract, malformed PNG,
  corrupt CRC, decode/dimension/resource failures, background/alpha policy,
  blank/forbidden cells, changed unchanged-cells, guide/template confusion,
  traversal, symlinks, non-files, and inspection races.
- [x] Pin a regular candidate file, bound bytes before decode, reuse existing
  PNG preflight and Node decode, and verify contract cell policies.
- [x] Resolve the destination only through contract target ID; candidate name
  and metadata grant no destination authority.
- [x] Snapshot validated bytes, verify target identity/digest again, publish by
  sibling staging plus atomic replacement, and leave the candidate untouched.
- [x] Permit session-owned correction iteration only when the current target
  matches its last import receipt.
- [x] Require both replacement flag and exact expected digest for any
  pre-existing/user-owned target; provide no force or wildcard bypass.
- [x] On any failure, prove old target and prior session receipt remain exact.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-import.test.ts asset-pack-files.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added the public candidate-import application for one
    contract target. It validates the session-bound contract and artifact
    metadata, pins and byte-bounds regular candidate files, reuses the asset
    pack PNG preflight plus Node RGBA decoder, checks complete PNG chunk CRCs,
    enforces transparent/blank/forbidden/unchanged cell policies, and ignores
    candidate names and metadata for destination authority. Target publication
    uses pinned pack paths, sibling staging, identity/digest rechecks, and
    atomic replacement; candidates remain untouched. Existing targets require
    explicit replacement plus their exact digest, while a target matching the
    session's current import checkpoint may be corrected without force flags.
    Import receipt/checkpoint updates happen only after successful publication,
    and failure/race tests prove prior bytes and receipts remain unchanged.
  - Product commit: `d0e05081212a50228df541efc5ae6292d663624c`
    (`feat(cli): import contract-bound authoring candidates`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-import.test.ts`
    FAIL (1 test; the valid real-PNG public import case returned exit code 1
    because import was still at the explicit deferred-command seam).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-import.test.ts asset-pack-files.test.ts`
    PASS (2 files, 35 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-contract.test.ts asset-authoring-commands.test.ts main-json.test.ts main-human.test.ts`
    PASS (4 files, 86 tests).
  - Additional verification: `rtk git diff --check` PASS.
  - CLI documentation impact reassessment for this import/atomicity task:
    `help: N/A — the fixed import command and options were already documented
    and unchanged`; `cli-readme: N/A — end-to-end workflow prose remains the
    planned Task 10 documentation surface`; `root-readme: N/A — no root
    workflow landing text changed`; `landing: N/A — no public positioning text
    changed`; `architecture: N/A — the existing Core/CLI ownership boundary was
    preserved`; `engineering: N/A — focused verification evidence is recorded
    here and the consolidated verification map remains Task 10`; `releasing:
    N/A — no release or package compatibility contract changed`; `plugin: N/A
    — no plugin capability or compatibility contract changed`.

---

## Phase 4 — Close Validation, Preview, and Recovery

### Task 8: Record current validation and attributed preview receipts

**Files:**

- Modify: `packages/cli/src/asset-authoring-commands.ts`
- Modify: `packages/cli/src/asset-pack-validation.ts`
- Modify: `packages/cli/src/asset-pack-preview.ts`
- Modify: `packages/cli/src/response.ts`
- Create: `packages/cli/test/asset-authoring-receipts.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

- [x] Write failing tests proving session validation returns the same report,
  warnings, and acknowledgement templates as leaf validation.
- [x] Reuse fresh asset-pack validation; record a receipt only for the exact
  manifest and complete captured source-digest set.
- [x] Reuse attributed preview and its existing options. Do not add a second
  composition or preview path.
- [x] Record preview input, validation revision, image/metadata/TXT/CSV paths
  and digests, warnings, manifest digest, and source digests.
- [x] Treat missing metadata, TXT credits, or CSV credits as a failed preview
  checkpoint even when a PNG exists.
- [x] Prove manifest/source/validation/preview-input drift makes the correct
  receipt stale and yields one safe next action.
- [x] Complete bounded human/JSON recovery presentation without dumping full
  session state or requiring manifest inspection.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-receipts.test.ts asset-pack-validation.test.ts asset-pack-preview.test.ts main-json.test.ts main-human.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

  - Implementation: Added session-bound validation and preview commands that
    capture one complete asset-pack snapshot, reuse the leaf validator, and
    record a validation receipt only when the session manifest and complete
    source digest set match. The attributed preview command delegates to the
    existing `previewAssetPack` path and records the requested input,
    validation revision, four required artifact paths/digests, warnings,
    manifest digest, and source digests. Preview artifact capture rejects
    missing image, metadata, TXT-credit, or CSV-credit outputs before a
    preview receipt is written. The existing invalidation evaluator now also
    detects preview-input drift; JSON and human output expose only bounded
    validation/preview evidence and safe recovery commands, without session
    plan/provenance dumps or manifest inspection.
  - Product commit: `6e379276c6b2a868617be0d66e5998d9663f570a`
    (`feat(cli): record authoring validation and preview receipts`).
  - TDD RED verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-receipts.test.ts`
    FAIL (the focused session-validation test returned exit code 1 because
    validation was still at the deferred authoring-command seam).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-receipts.test.ts asset-pack-validation.test.ts asset-pack-preview.test.ts main-json.test.ts main-human.test.ts`
    PASS (5 files, 117 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Additional verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session.test.ts asset-authoring-commands.test.ts asset-authoring-contract.test.ts asset-authoring-import.test.ts`
    PASS (4 files, 36 tests).
  - Additional verification: `rtk git diff --check` PASS.
  - CLI documentation impact reassessment for this validation/preview receipt task:
    `help: N/A — the fixed authoring validate/preview commands and options were
    documented in Task 3 and their help text is unchanged`; `cli-readme: N/A —
    end-to-end workflow and receipt documentation remains the planned Task 10
    surface`; `root-readme: N/A — no root workflow copy changed`; `landing: N/A
    — no public positioning copy changed`; `architecture: N/A — validation
    remains in the existing CLI leaf validator and preview remains in the
    existing attributed preview seam`; `engineering: N/A — no verification
    policy changed, with focused evidence recorded here`; `releasing: N/A — no
    release or package compatibility contract changed`; `plugin: N/A — no
    plugin capability or compatibility contract changed`.

### Task 9: Prove the foundation through the public packed CLI

**Files:**

- Create: `packages/cli/test/asset-authoring-session-e2e.test.ts`
- Modify: `packages/cli/test/asset-authoring-e2e.test.ts`
- Modify: `packages/cli/test/asset-lifecycle-e2e.test.ts` only if shared public
  setup must expose the new capability without changing lifecycle assertions.
- Modify: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/test/plugin-contract.test.ts`

- [x] Add a clean-workspace public-argv E2E that performs capability discovery,
  session start, contract/template generation, real candidate import,
  validation, attributed preview, interruption, external PNG drift, resume,
  stale receipt detection, correction import, and current preview.
- [x] Cover one simple male/female walk new item and one exact blank-frame
  repair with unchanged-cell and inherited-credit evidence.
- [x] Assert JSON next actions and artifact/digest bindings at every boundary;
  do not call implementation modules directly in this acceptance.
- [x] Extend packed CLI smoke so the built tarball proves the same foundation
  works outside the monorepo with no repository checkout.
- [x] Assert sentinels for base cache, checked-in assets, generated output,
  unowned output, and dormant `upstream/` remain untouched.
- [x] Add compatibility contract coverage showing the current plugin does not
  claim the new authoring capability and can safely refuse it.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session-e2e.test.ts asset-authoring-e2e.test.ts plugin-contract.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli build`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Commit product changes with a focused conventional commit.
- [x] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

Implementation note:

- The public acceptance now covers capability discovery, a male/female walk
  new-item session, contract/template artifacts, real PNG import, validation
  acknowledgement/reconciliation, attributed preview, interruption/resume,
  external PNG drift, exact-digest correction import, stale receipt recovery,
  and current male/female previews. The blank-frame path asserts unchanged-cell
  evidence, a non-importable reference overlay, inherited source attribution,
  and unchanged runtime source bytes.
- Correction import after `external-png-drift` is allowed only with
  `--replace-existing` and the exact observed `--expected-target-digest`; every
  candidate import clears prior validation/preview receipts and exposes
  `validate-session` as the next action. The packed smoke exercises the same
  flow from the installed tarball in a repository-free workspace and checks
  base-cache, checked-in-asset, generated-output, unowned-output, and dormant
  `upstream/` sentinels.
- TDD evidence: RED —
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session-e2e.test.ts`
  failed at correction import with `asset_authoring_contract_stale`; GREEN —
  the same command passed with 2 tests after the minimum recovery and receipt
  invalidation changes.
- Product commit:
  `c99db968dc82bf53bc28b0d421da96135efb1410`
- Verification:
  - `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session-e2e.test.ts asset-authoring-e2e.test.ts plugin-contract.test.ts` PASS (3 files, 23 tests)
  - `rtk pnpm --filter @lpc-toolkit/cli build` PASS
  - `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS (`Packed CLI install smoke test passed.`)
  - `rtk pnpm check:boundaries` PASS
  - `rtk pnpm --filter @lpc-toolkit/cli typecheck` PASS
  - `rtk git diff --check` PASS
- CLI documentation impact reassessment: `help: N/A — no command or option
  text changed`; `cli-readme: N/A — end-to-end workflow documentation remains
  Task 10`; `root-readme: N/A — no root workflow copy changed`; `landing: N/A —
  no positioning copy changed`; `architecture: N/A — no package boundary or
  ownership changed`; `engineering: N/A — verification policy is unchanged`;
  `releasing: N/A — no release metadata or publication contract changed`;
  `plugin: N/A — compatibility coverage confirms the current plugin refuses
  the newer capability without claiming it`.

---

## Phase 5 — Synchronize Documentation and Close the Gate

### Task 10: Update every owned contract and run final verification

**Files:**

- Modify: command help specification/tests.
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: landing page copy/tests.
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ENGINEERING.md`
- Modify: `docs/RELEASING.md`
- Modify: plugin compatibility references/tests without adding a skill.
- Modify: this plan with final reassessment and evidence.

- [x] Reassess the CLI documentation-impact matrix. Update every owned surface
  whose command, workflow, architecture, verification, compatibility, or
  release contract changed; record any changed `N/A` with a specific reason.
- [x] Document all commands, schema/capability identifiers, state/checkpoint
  meanings, candidate replacement policy, attribution requirement, recovery
  flow, and public artifact paths.
- [x] Correct CLI README plugin version `0.2.0` to `0.2.1` and add/retain a test
  that compares the documented version with plugin compatibility metadata.
- [x] Ensure root and landing copy distinguish character composition, source
  asset creation, audit handoff, validation, formal archive publication, and
  installation.
- [x] Ensure architecture describes shipped behavior only and preserves the
  provider-neutral, read-only audit, Core/CLI, Web, cache, attribution, and
  `upstream/` boundaries.
- [x] Add the final focused verification map to Engineering and the capability
  release/post-publication procedure to Releasing.
- [x] Run: `rtk pnpm verify:cli-docs-policy`
- [x] Run: `rtk pnpm verify:plugin`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/core test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli build`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Run: `rtk pnpm verify`
- [x] Confirm `rtk git status` contains no unexpected generated or product
  files and no change inside `upstream/`.
- [x] Commit documentation and verification-contract changes with a focused
  conventional commit.
- [x] Record implementation note, full commit hash, exact PASS/FAIL evidence,
  final documentation-impact matrix, and any intentional deferral here; commit
  the final plan record separately.

Implementation note:

- Added the strict authoring-session documentation across the CLI README,
  architecture, engineering, release, root README, and landing page. The
  public command table now covers capability discovery, all eight authoring
  commands, versioned capability/schema identifiers, state/checkpoint meaning,
  digest-bound candidate replacement, attribution, receipt invalidation,
  manifest/PNG recovery, contract artifact paths, formal archive boundaries,
  cache/output/upstream containment, and the current Web/plugin boundaries.
- Updated the command help description to name strict plans. The existing
  lightweight Codex plugin remains limited to its two shipped workflows; both
  compatibility references explicitly refuse `asset-authoring-session.v1` and
  `sprite-drawing-contract.v1`, with tests covering that boundary and aligning
  CLI README plugin `0.2.1` with the manifest and compatibility metadata.
- Root and landing copy now distinguish character composition, read-only audit
  handoff, source creation, audit-derived scaffolding, validation, formal
  `asset pack` publication, and separate consumer installation. Engineering
  contains the final focused verification map; Releasing contains capability
  release and post-publication checks. No provider invocation, new skill, Web
  bridge, or formal release orchestration was added.
- TDD RED evidence:
  - `rtk node --test scripts/verify-codex-plugin.test.mjs` FAIL — the new
    assertion reported that CLI README did not document plugin `0.2.1`.
  - `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts plugin-contract.test.ts`
    FAIL — 2 focused tests failed: strict-plan help wording and plugin
    authoring-capability boundary.
  - `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx` first
    hit an environment-only `listen EPERM` in the pretest `tsx` IPC helper;
    the same exact command passed when rerun with the required sandbox
    permission and then exercised the landing assertions.
- TDD GREEN evidence:
  - `rtk node --test scripts/verify-codex-plugin.test.mjs` PASS (10 tests).
  - `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts plugin-contract.test.ts`
    PASS (2 files, 67 tests).
  - `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx` PASS
    (3 tests).
- Product commit:
  `8a52da4182da78d24370ac0fa9a5accb8bc5584d`
  (`docs: document asset authoring contract`).
- Verification evidence:
  - `rtk pnpm verify:cli-docs-policy` PASS (19 tests).
  - `rtk pnpm verify:plugin` PASS (40 tests; plugin structure valid).
  - `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - `rtk pnpm --filter @lpc-toolkit/core test` PASS (27 files, 390 tests).
  - `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck` PASS.
  - `rtk pnpm --filter @lpc-toolkit/asset-pack-format test` PASS (6 files,
    72 tests).
  - `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - `rtk pnpm --filter @lpc-toolkit/cli test` PASS (61 files, 1116 tests,
    1 skipped) after the sandbox-safe rerun for localhost web-server tests.
  - `rtk pnpm --filter @lpc-toolkit/cli build` PASS.
  - `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS (`Packed CLI install
    smoke test passed.`).
  - `rtk pnpm check:boundaries` PASS.
  - `rtk pnpm verify` PASS (repository-wide typecheck and workspace tests;
    Core 390, asset-pack-format 72, CLI 1117 with 1 skipped, Web 861).
  - `rtk git diff --check` PASS.
  - `rtk git status --short` PASS (`ok`, no unexpected generated/product files).
  - `rtk git status --short -- upstream` PASS (`ok`, no `upstream/` change).
- Final CLI documentation-impact matrix:
  `help: update — strict-plan help wording and focused help test`;
  `cli-readme: update — authoring-session contract and plugin version`;
  `root-readme: update — workflow ownership and formal-install distinction`;
  `landing: update — audit handoff and source/publication workflow copy`;
  `architecture: update — Core/CLI/Web/provider/cache/attribution boundaries`;
  `engineering: update — final authoring and documentation verification map`;
  `releasing: update — capability release and post-publication procedure`;
  `plugin: update — compatibility refusal boundary and tests`.
  Eventual PR declaration: `CLI docs impact: updated`; surfaces are `help,
  cli-readme, root-readme, landing, architecture, engineering, releasing,
  plugin`.
- Intentional deferral: no next plan task remains after Task 10. The current
  Codex plugin still does not claim the new capability, `attach-pack` does not
  publish a drawing contract, and provider invocation, a future authoring
  skill, a Web bridge, formal release orchestration, and speculative MVP
  capability remain out of scope.

## Final Acceptance Checklist

- [x] All 10 tasks are checked and contain implementation notes, full product
  commit hashes, and exact verification results.
- [x] Public command/help and JSON contracts exactly match #149.
- [x] Packed-CLI acceptance proves real PNG authoring, interruption, and
  recovery from a clean workspace.
- [x] All preview pixels retain metadata and TXT/CSV credits.
- [x] No provider invocation, future skill, Web bridge, formal release
  orchestration, or speculative MVP capability entered scope.
- [x] No dependency, `any`, architecture bypass, cache mutation, generated
  overlay mutation, installed-source mutation, or `upstream/` mutation was
  introduced.
- [x] CLI documentation-impact declaration for the eventual PR lists every
  updated owned surface.
- [x] Full repository verification and conditional packed-CLI gate pass.
