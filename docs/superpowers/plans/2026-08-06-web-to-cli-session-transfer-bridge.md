# D3 — Web-to-CLI Session Transfer and Recovery Implementation Plan

> **For agentic workers:** Do not implement this plan until the D3
> specification, this plan, and the public TDD seams have been reviewed and
> confirmed. After confirmation, work one vertical red → green slice at a
> time. Do not begin a later task until the current focused checks pass and
> its implementation record is committed.

**Goal:** Implement the reviewed [D3 Issue #170](https://github.com/ochowei/lpc-toolkit-2026-1) Web-to-CLI handoff contract under roadmap [Issue #153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153), without a backend, authentication, persistent browser state, new dependency, custom archive format, or weakened attribution/release authority.

**Base:** `origin/main` at `c289e7e9808b8b66f3bf968f64f34eff1eb073a3`, containing merged D2 implementation PR #169. Normative specification: [`2026-08-06-web-to-cli-session-transfer-bridge.md`](../specs/2026-08-06-web-to-cli-session-transfer-bridge.md).

**Implementation branch:** `codex/issue-170-web-to-cli-bridge-implementation` (to be created only after spec/plan review).

**Implementation PR:** separate D3 implementation PR; do not combine with D4–D6.

## Global constraints

- Implement only the reviewed D3 Web→CLI file handoff and explicit recovery
  boundary.
- Use an existing asset-pack archive plus a strict JSON sidecar. Do not add a
  second archive/container implementation.
- Keep the bridge one-way. Do not add a CLI→Web live session, backend, shared
  authentication, browser persistence, URL token, remote upload, registry,
  signing, marketplace, global installation, npm publication, or external
  service mutation.
- Preserve the existing `lpc-toolkit.asset-authoring-session.v1`, response
  envelope, manifest, archive, attribution, candidate-import, validation,
  preview, release, D1, D2, install, and plugin behavior.
- Store D3 handoff evidence in a session-owned sidecar rather than adding an
  incompatible unknown field to existing session JSON. Never copy a Web
  preview or handoff click into release/provider/validation authority fields.
- Strict TypeScript only. Add no `any`, dependency, backend, auth, or
  architecture-boundary exception.
- Reuse `@lpc-toolkit/asset-pack-format` archive inspection and the existing
  CLI session/pack staging authorities. Do not weaken path, symlink, size,
  checksum, attribution, consent, preview, release, or recovery checks.
- Web state remains in memory until explicit export. Do not use
  `localStorage`, IndexedDB, Cache Storage, service-worker persistence,
  browser extension state, or hidden cross-tab state.
- `--confirm` is a human import decision, not a bypass. Without it, return
  `ok: true`, `state: "needs-user-action"`, one exact next action, and no
  mutation.
- Every repository command is prefixed with `rtk`; use pnpm. Never modify or
  initialize `upstream/`.
- After each completed implementation task, update this plan, record a short
  note, record the full related commit hash, and record exact PASS/FAIL
  verification commands. Commit plan records separately when required by
  `AGENTS.md`.

## Public TDD seams — pending review confirmation

The TDD skill requires agreement on public seams before implementation tests
are written. The following seams are proposed for user review:

1. **Core handoff contract seam** — exported strict parser,
   canonical projection/digest, privacy predicate, and stale-state predicate
   for `lpc-toolkit.web-cli-handoff.v1`. Tests use fixed independent digest
   fixtures and do not call the implementation helper to compute expectations.
2. **Web snapshot/export seam** — exported pure snapshot/handoff builder and
   the public Workbench controller download/export action using real `File`,
   `Blob`, Worker response fixtures, and a downloader spy. Tests observe the
   revision race, pair metadata, attribution digest requirement, and no
   persistence behavior without testing React internals.
3. **CLI inspection seam** — `runCli` with exact public argv for
   `asset authoring handoff inspect`, real handoff/archive fixture files, and
   a temporary workspace. Assert current/stale/blocked states and unchanged
   sentinels.
4. **CLI import/recovery seam** — `runCli` with exact public argv for
   `asset authoring handoff import` and `recover`, real attach plans, temporary
   workspaces, injected filesystem/race boundaries, and existing archive
   inspection. Assert created session/sidecar bytes, idempotency, no overwrite,
   interrupted staging, explicit resume/discard, and protected paths.
5. **Response/capability seam** — `runCli(['capabilities', '--json'])`,
   `authoringResponseProjection`, `formatJsonResponse`, and
   `formatHumanResponse`. Assert bounded D3 fields, privacy redaction, stable
   human wording, and existing response compatibility.

**Seam confirmation:** pending user review of the D3 specification and this
plan. No product-code test commit is authorized before confirmation.

## CLI documentation impact matrix

The implementation changes public CLI commands and session responses, so the
following matrix is mandatory and must be reassessed before the implementation
PR is opened:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: N/A — D3 adds no plugin capability, skill, or command
```

The implementation plan must record any final `N/A` reason after the impact
review. A public Web export action, CLI handoff command, schema, receipt,
recovery state, or compatibility rule cannot be omitted from the matrix.

## Vertical implementation tasks

### 0. Review gate and fixture boundary

- [ ] Review the D3 specification and this plan with the user.
- [ ] Confirm the five public TDD seams above, or record the user's changes.
- [ ] Create implementation branch from the merged D3 spec/plan base only
      after confirmation.
- [ ] Add local-only handoff, archive, attach-plan, stale-pair, tamper,
      attribution, and interrupted-staging fixtures. Fixtures contain no
      credentials, private URLs, real provider output, or `upstream/` checkout.

### 1. Core strict handoff contract (red → green)

- [ ] Add the versioned handoff and receipt types, strict parser, exact-key
      validation, UUID/digest/path/size constraints, and canonical projection.
- [ ] Add deterministic `stateDigest` and handoff digest helpers using the
      existing canonical Core conventions.
- [ ] Add stale-state, privacy, attribution-required, and compatibility
      predicates. A handoff is provenance of transfer only, never release or
      authorship authority.
- [ ] Test unknown fields, duplicate sources, traversal/absolute paths,
      unsupported status, missing credits, privacy violations, digest stability,
      property-order stability, and fixed independent digest fixtures.
- [ ] Verify `packages/core/` remains environment-agnostic.

### 2. Web explicit snapshot and export (red → green)

- [ ] Add a pure snapshot builder from the current Workbench revision and the
      existing assembled archive response.
- [ ] Verify assembly and sidecar creation are bound to one unchanged revision;
      reject a race without downloading a stale pair.
- [ ] Add the explicit `Export for CLI` action and confirmation UI for draft
      and formal archive choices, using two downloads and the existing browser
      download adapter.
- [ ] Keep the Workbench state memory-only. Add tests proving reset/refresh
      does not recover hidden state and export never uploads or persists it.
- [ ] Preserve credits, acknowledgement digest, and attribution-required
      evidence; do not add Web release approval or provider payloads.

### 3. CLI read-only handoff inspection (red → green)

- [ ] Add public command specification/help for
      `asset authoring handoff inspect` and its exact options.
- [ ] Read both inputs as regular files with existing limits and no symlink or
      traversal acceptance.
- [ ] Reuse existing archive inspection and re-compute archive, manifest,
      content, source, credit, acknowledgement, and pack identity bindings.
- [ ] Return deterministic `current`, `stale`, `blocked`, or
      `needs-user-action` data without creating sessions or writing files.
- [ ] Add human and JSON response tests with bounded digest comparisons and
      actionable re-export/repair commands.

### 4. CLI explicit import and sidecar receipt (red → green)

- [ ] Require an explicit strict `attach-pack` plan and exact pack identity/
      version match; never infer a workspace or scope from the sidecar.
- [ ] Add `asset authoring handoff import` with no-confirm pause and explicit
      `--confirm` mutation boundary.
- [ ] Stage the existing archive payload under a contained, new CLI workspace
      destination; reuse existing pack/session authorities and fail closed on
      existing destinations or races.
- [ ] Create a new CLI session without reusing a Web/session ID and without
      marking validation, preview, release, provider, D1, or import receipts
      current.
- [ ] Persist the D3 web-handoff receipt only after atomic completion. Prove
      repeat import idempotency for unchanged bindings and explicit conflict
      for changed bindings.

### 5. Explicit recovery (red → green)

- [ ] Add `asset authoring handoff recover --action resume|discard` with exact
      handoff/archive/workspace bindings and required confirmation.
- [ ] Simulate interruption during staging/commit and prove prior user-owned
      files, existing packs, sentinels, and session bytes remain unchanged.
- [ ] Resume only matching pending staging; discard only the matching
      CLI-owned temporary directory. Never delete inputs or broad roots.
- [ ] Preserve stale/pending evidence and return one safe next action after a
      failed or raced recovery.

### 6. Session/receipt compatibility and capability projection

- [ ] Project optional D3 sidecar state from `asset authoring status` without
      changing the v1 session file shape or exposing private paths.
- [ ] Add D3 capabilities and schema identifiers only after public commands,
      refusal behavior, and tests are complete.
- [ ] Prove older session fixtures without a sidecar remain readable and that
      D2 provider receipts and D1 provenance are not rewritten.
- [ ] Prove stale Web handoff evidence cannot satisfy existing release gates or
      replace candidate-import authority.

### 7. Documentation impact and final verification

- [ ] Update CLI help, CLI README, root README, landing, architecture,
      engineering, and releasing documentation for the final public contract.
- [ ] Reassess the complete impact matrix and record `update` or an exact
      `N/A — reason` for every surface, including plugin.
- [ ] Run focused Core/Web/CLI/response/packed acceptance tests, boundary
      checks, plugin verification, full repository verification, CLI docs
      policy/impact checks, and `rtk git diff --check`.
- [ ] Record exact commands and PASS/FAIL results below before the PR handoff.

## Protected-path and privacy assertions

Every import/recovery acceptance test must assert that these remain unchanged:

- the handoff JSON and selected archive input files;
- an existing pack with a conflicting identity;
- a workspace sentinel outside the selected pack root;
- checked-in `assets/` and the verified base cache;
- installed source and generated overlay roots;
- unowned output; and
- `upstream/` and its gitlink state.

Every JSON response and persisted handoff/receipt fixture must assert absence
of absolute paths, home/repository paths, browser tokens, credentials, raw
prompts, provider payloads, and raw pixel/archive bytes.

## Verification record

### Spec/plan review branch

- [x] D3 Issue #170 created with the Web→CLI scope and hard boundaries.
  - Issue: https://github.com/ochowei/lpc-toolkit-2026-1/issues/170
- [x] Branch created from merged D2 `origin/main`.
  - Base: `c289e7e9808b8b66f3bf968f64f34eff1eb073a3`
- [ ] Spec and plan reviewed by the user.
- [ ] Public seams confirmed by the user.
- [ ] Docs-only verification command and commit recorded after the files are added.

### Implementation branch

- [ ] Implementation branch and PR created only after review confirmation.
- [ ] No implementation task may be marked complete before its focused red →
      green test and exact verification command are recorded.

## Handoff criteria

D3 is not complete until the implementation PR has passed CI and been merged.
After merge, wait for explicit user confirmation before starting D4. Do not
start D4 from an open or unmerged D3 PR.

