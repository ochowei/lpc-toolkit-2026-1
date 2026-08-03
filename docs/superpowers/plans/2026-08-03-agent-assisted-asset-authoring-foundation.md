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

- [ ] Write failing tests for stable target IDs, complete PNG geometry,
  directions, logical-frame/source-cell mappings, body/layer/variant/consumer
  context, and all four cell policies.
- [ ] Reuse registered standard/custom animation geometry; export the smallest
  existing pure helper needed instead of duplicating LPC constants.
- [ ] Cover simple male/female walk and optional idle new-item targets, exact
  missing-file extension, and exact blank-frame repair with unchanged-cell
  baseline digests.
- [ ] Define a deterministic semantic projection whose digest changes for
  every geometry/source/reference input but not JSON property ordering.
- [ ] Keep filesystem paths, absolute artifact paths, timestamps, providers,
  and runtime objects out of the pure contract.
- [ ] Export the drawing contract types/planner through Core.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/core test -- sprite-drawing-contract.test.ts asset-animation-audit.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

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

- [ ] Write failing parser/help tests for the exact fixed command surface,
  mutual requirements, replacement flags, preview option reuse, and rejected
  extra positional/unknown options.
- [ ] Write failing JSON tests for `capabilities --json`, schema identifiers,
  stable capability ordering, and the initial authoring response projection.
- [ ] Add human summaries that distinguish command success, workflow state,
  stale checkpoints, missing inputs, and confirmation-required actions.
- [ ] Keep capability discovery read-only and independent of workspace/cache
  preparation.
- [ ] Do not dispatch mutating behavior until Tasks 4–8 provide the owning
  application modules; use explicit structured not-yet-reachable test seams,
  not silent placeholders in production output.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

### Task 4: Persist strict workspace-bound authoring sessions

**Files:**

- Create: `packages/cli/src/asset-authoring-session.ts`
- Modify: `packages/cli/src/asset-workspace.ts`
- Create: `packages/cli/test/asset-authoring-session.test.ts`

- [ ] Write failing tests for UUID identity, workspace binding, strict schema,
  atomic create/replace, prior-state survival after injected failure, foreign
  workspace refusal, tamper/unknown-version refusal, and containment.
- [ ] Implement the fixed phases, per-target checkpoints, freshness values,
  receipts, provenance events, conflict record, and session timestamps.
- [ ] Store session state only in manager-owned workspace state outside pack,
  overlay, registry/installed state, and base cache.
- [ ] Add pure invalidation decisions for manifest semantic drift, contract
  replacement, PNG drift, validation receipts, and preview receipts.
- [ ] Implement read-only status inspection separately from bookkeeping-only
  resume reconciliation.
- [ ] Prove repeated status/resume with unchanged files is semantically
  idempotent.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session.test.ts asset-workspace.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

### Task 5: Start, attach, inspect, resume, and reconcile sessions

**Files:**

- Create: `packages/cli/src/asset-authoring-commands.ts`
- Modify: `packages/cli/src/asset-commands.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Create: `packages/cli/test/asset-authoring-commands.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

- [ ] Write failing command tests for new-item, exact audit-derived extension,
  attach-pack, missing draft credits, workspace discovery/override, and one-pack
  scope enforcement.
- [ ] Reuse existing scaffold behavior when plan inputs satisfy its contract;
  do not reproduce asset-pack manifest generation.
- [ ] Persist a session before returning `needs-user-action` for missing
  manifest-required author/license data; invent no placeholder declarations.
- [ ] Implement `status` as read-only and `resume` as session-bookkeeping-only.
- [ ] Detect external PNG drift and record provenance/invalidation without
  overwriting source.
- [ ] Detect all manifest byte drift as conflict. Implement explicit adopt
  external and restore session revisions with the required expected digest and
  race-safe atomic behavior.
- [ ] Return structured next actions with precise safety and precondition
  digests for every recoverable state.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-commands.test.ts main-json.test.ts main-human.test.ts main-assets.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

---

## Phase 3 — Materialize Drawing Work and Import Pixels Safely

### Task 6: Publish contract, template, guide, and reference artifacts

**Files:**

- Create: `packages/cli/src/asset-authoring-contract.ts`
- Modify: `packages/cli/src/asset-authoring-commands.ts`
- Create: `packages/cli/test/asset-authoring-contract.test.ts`
- Add: legally attributed real PNG/reference fixtures under existing CLI test
  fixture ownership.

- [ ] Write failing tests for deterministic contract JSON, exact target paths,
  transparent templates, separate non-importable guides, reference overlays,
  artifact metadata, and absolute returned paths.
- [ ] Build contracts only through Core's planner and current catalog/baseline
  evidence. Never infer remembered LPC geometry in CLI code.
- [ ] Use existing image/canvas and PNG preflight capabilities. Add no image
  dependency or parallel PNG parser.
- [ ] For blank-frame repair, materialize an attributed, digest-bound working
  copy and identify every unchanged cell; do not alter its base source.
- [ ] Bind every artifact to session ID, stable target ID, and contract digest.
- [ ] Reject stale planning input; implement explicit `--refresh` that
  invalidates prior candidate/import checkpoints.
- [ ] Prove guides/reference overlays cannot be mistaken for candidate sprites.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-contract.test.ts asset-pack-validation.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record fixture author/license/source in the owning fixture metadata.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

### Task 7: Import candidate sprites through one atomic trust boundary

**Files:**

- Create: `packages/cli/src/asset-authoring-import.ts`
- Modify: `packages/cli/src/asset-authoring-commands.ts`
- Modify: `packages/cli/src/asset-pack-files.ts`
- Create: `packages/cli/test/asset-authoring-import.test.ts`

- [ ] Write a valid real-PNG failing test through the public import application
  seam before implementing success.
- [ ] Add failure tests for wrong target/digest, stale contract, malformed PNG,
  corrupt CRC, decode/dimension/resource failures, background/alpha policy,
  blank/forbidden cells, changed unchanged-cells, guide/template confusion,
  traversal, symlinks, non-files, and inspection races.
- [ ] Pin a regular candidate file, bound bytes before decode, reuse existing
  PNG preflight and Node decode, and verify contract cell policies.
- [ ] Resolve the destination only through contract target ID; candidate name
  and metadata grant no destination authority.
- [ ] Snapshot validated bytes, verify target identity/digest again, publish by
  sibling staging plus atomic replacement, and leave the candidate untouched.
- [ ] Permit session-owned correction iteration only when the current target
  matches its last import receipt.
- [ ] Require both replacement flag and exact expected digest for any
  pre-existing/user-owned target; provide no force or wildcard bypass.
- [ ] On any failure, prove old target and prior session receipt remain exact.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-import.test.ts asset-pack-files.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

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

- [ ] Write failing tests proving session validation returns the same report,
  warnings, and acknowledgement templates as leaf validation.
- [ ] Reuse fresh asset-pack validation; record a receipt only for the exact
  manifest and complete captured source-digest set.
- [ ] Reuse attributed preview and its existing options. Do not add a second
  composition or preview path.
- [ ] Record preview input, validation revision, image/metadata/TXT/CSV paths
  and digests, warnings, manifest digest, and source digests.
- [ ] Treat missing metadata, TXT credits, or CSV credits as a failed preview
  checkpoint even when a PNG exists.
- [ ] Prove manifest/source/validation/preview-input drift makes the correct
  receipt stale and yields one safe next action.
- [ ] Complete bounded human/JSON recovery presentation without dumping full
  session state or requiring manifest inspection.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-receipts.test.ts asset-pack-validation.test.ts asset-pack-preview.test.ts main-json.test.ts main-human.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

### Task 9: Prove the foundation through the public packed CLI

**Files:**

- Create: `packages/cli/test/asset-authoring-session-e2e.test.ts`
- Modify: `packages/cli/test/asset-authoring-e2e.test.ts`
- Modify: `packages/cli/test/asset-lifecycle-e2e.test.ts` only if shared public
  setup must expose the new capability without changing lifecycle assertions.
- Modify: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/test/plugin-contract.test.ts`

- [ ] Add a clean-workspace public-argv E2E that performs capability discovery,
  session start, contract/template generation, real candidate import,
  validation, attributed preview, interruption, external PNG drift, resume,
  stale receipt detection, correction import, and current preview.
- [ ] Cover one simple male/female walk new item and one exact blank-frame
  repair with unchanged-cell and inherited-credit evidence.
- [ ] Assert JSON next actions and artifact/digest bindings at every boundary;
  do not call implementation modules directly in this acceptance.
- [ ] Extend packed CLI smoke so the built tarball proves the same foundation
  works outside the monorepo with no repository checkout.
- [ ] Assert sentinels for base cache, checked-in assets, generated output,
  unowned output, and dormant `upstream/` remain untouched.
- [ ] Add compatibility contract coverage showing the current plugin does not
  claim the new authoring capability and can safely refuse it.
- [ ] Run:
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session-e2e.test.ts asset-authoring-e2e.test.ts plugin-contract.test.ts`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli build`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Commit product changes with a focused conventional commit.
- [ ] Record implementation note, full product commit hash, and exact PASS/FAIL
  verification evidence here; commit the plan record separately.

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

- [ ] Reassess the CLI documentation-impact matrix. Update every owned surface
  whose command, workflow, architecture, verification, compatibility, or
  release contract changed; record any changed `N/A` with a specific reason.
- [ ] Document all commands, schema/capability identifiers, state/checkpoint
  meanings, candidate replacement policy, attribution requirement, recovery
  flow, and public artifact paths.
- [ ] Correct CLI README plugin version `0.2.0` to `0.2.1` and add/retain a test
  that compares the documented version with plugin compatibility metadata.
- [ ] Ensure root and landing copy distinguish character composition, source
  asset creation, audit handoff, validation, formal archive publication, and
  installation.
- [ ] Ensure architecture describes shipped behavior only and preserves the
  provider-neutral, read-only audit, Core/CLI, Web, cache, attribution, and
  `upstream/` boundaries.
- [ ] Add the final focused verification map to Engineering and the capability
  release/post-publication procedure to Releasing.
- [ ] Run: `rtk pnpm verify:cli-docs-policy`
- [ ] Run: `rtk pnpm verify:plugin`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/core test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli build`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Run: `rtk pnpm verify`
- [ ] Confirm `rtk git status` contains no unexpected generated or product
  files and no change inside `upstream/`.
- [ ] Commit documentation and verification-contract changes with a focused
  conventional commit.
- [ ] Record implementation note, full commit hash, exact PASS/FAIL evidence,
  final documentation-impact matrix, and any intentional deferral here; commit
  the final plan record separately.

## Final Acceptance Checklist

- [ ] All 10 tasks are checked and contain implementation notes, full product
  commit hashes, and exact verification results.
- [ ] Public command/help and JSON contracts exactly match #149.
- [ ] Packed-CLI acceptance proves real PNG authoring, interruption, and
  recovery from a clean workspace.
- [ ] All preview pixels retain metadata and TXT/CSV credits.
- [ ] No provider invocation, future skill, Web bridge, formal release
  orchestration, or speculative MVP capability entered scope.
- [ ] No dependency, `any`, architecture bypass, cache mutation, generated
  overlay mutation, installed-source mutation, or `upstream/` mutation was
  introduced.
- [ ] CLI documentation-impact declaration for the eventual PR lists every
  updated owned surface.
- [ ] Full repository verification and conditional packed-CLI gate pass.
