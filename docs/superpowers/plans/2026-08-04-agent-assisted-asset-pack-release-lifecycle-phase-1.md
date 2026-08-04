# Agent-Assisted Asset Pack Release Lifecycle — Phase 1 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with vertical
> red → green loops. Do not begin a later task until the current task's
> focused checks pass and its implementation record is committed.

**Goal:** Implement Phase 1 of GitHub Issue [#150](https://github.com/ochowei/lpc-toolkit-2026-1/issues/150): turn the current #149 authoring session's exact, attributed preview into a release-governed session checkpoint through explicit human declarations, exact warning acknowledgement persistence, final preview acceptance, and digest-bound stale-receipt recovery.

**Base:** Start from the merged `main` commit containing PR #151 (`3aac26855f90514a4fc9b996ebbcc469adadab62`). The follow-up specification is [`2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md`](../specs/2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md); ADR-0009 remains normative for human release authority.

**Architecture:** Core owns the pure, environment-agnostic declaration and release-evidence contracts, canonical digest projections, and release-gate predicates. The CLI owns strict file input, session persistence, manifest/source containment, atomic acknowledgement updates, receipt timestamps, current evidence collection, public command orchestration, and human/JSON presentation. Existing Core asset-pack schema/validation and existing CLI attributed-preview behavior remain authoritative. No second manifest, archive, attribution path, or validation implementation is introduced.

**Tech stack:** Strict TypeScript, Node.js 22+, pnpm, Vitest, existing Core/CLI/asset-pack-format APIs, and the existing filesystem/runtime adapters. Add no dependency and no `any`.

## Global constraints

- Implement only Phase 1: pure declaration/release-receipt schemas, exact acknowledgement persistence, final attributed-preview acceptance, stale-receipt invalidation, and focused human/JSON response coverage.
- Do not pull in Phase 2 draft recovery or session-aware sync, Phase 3 formal pack/inspect, or Phase 4 consumer installation.
- Do not invoke ImageGen, `generate2dsprite`, an external provider, or any generation service. Do not add the Codex authoring skill, Web-to-CLI bridge, backend, registry, signing, global installation, or npm publication.
- Providers, tools, models, prompts, candidates, and import records remain provenance. They never satisfy attribution-author, license/source authority, warning acknowledgement, or visual acceptance requirements.
- Never infer human identity, license/source authority, acknowledgement reasons, or visual approval from Git, the operating system, an Agent, a provider, or the current user account. Only explicitly supplied and confirmed input may satisfy a release gate.
- Reuse `AssetPackAcknowledgement`, `parseAssetPackSource`, `warningAcknowledged`, `validateAssetPackDirectory`, and `captureAssetPackPreviewArtifacts`; do not create parallel acknowledgement, attribution, validation, preview, manifest, or archive logic.
- Preserve the existing `lpc-toolkit.asset-authoring-session.v1` and `lpc-toolkit.asset-authoring-response.v1` public identities. Add only explicitly documented, backward-readable release fields; older #149 sessions must read as having missing release checkpoints and must not be treated as release-ready.
- Keep `packages/core/` environment-agnostic. Core must not import Node, filesystem, DOM, React, concrete canvas, ZIP, CLI, Agent, or provider code.
- `--confirm` is a consent boundary, not a bypass for missing evidence, stale digests, unsafe paths, or validation errors. Without it, human-decision commands return `ok: true`, `state: "needs-user-action"`, and a structured next action without mutating the release state.
- No acknowledge-all behavior. One exact acknowledgement record is supplied per invocation; missing, stale, malformed, duplicate, or out-of-scope records leave manifest and session bytes unchanged.
- Acknowledgement updates are limited to the session's declared pack scope, require a fresh current manifest check immediately before atomic publication, and invalidate every downstream receipt affected by the manifest/warning change.
- Every preview acceptance must remain bound to one frozen preview artifact set containing the rendered PNG, metadata JSON, TXT credit, and CSV credit. Never accept only an image digest while allowing its metadata or credits to drift.
- Never initialize, modify, install packages inside, or commit inside `upstream/`. Do not write checked-in `assets/`, the verified base cache, generated `assets_custom/`, installed snapshots, or unowned output.
- Prefix every repository terminal command with `rtk`. Use pnpm for repository development.
- After each completed implementation task, check its boxes, add an implementation note, record the full product commit hash, and record exact PASS/FAIL verification commands in this plan. Commit the plan record separately with `docs(plan): record ...` as required by `AGENTS.md`.

## Observable success

- `lpc-toolkit capabilities --json` advertises only the Phase 1 release capability and pure release schemas; deferred draft-recovery and consumer-install capabilities are not advertised until their phases ship.
- A current #149 session returns one exact acknowledgement template at a time and persists only the supplied record after explicit confirmation. The persisted record is Core-valid, content-digest-bound, deterministically ordered, and idempotent.
- A declaration with unknown fields, inferred/empty identity, unsupported or unconfirmed authority, stale manifest digest, mismatched credit digest, incomplete acknowledgement evidence, or missing human confirmation is rejected or paused without partial persistence.
- A confirmed declaration produces a session-owned release receipt bound to the current manifest, complete source digest set, validation receipt, credit/acknowledgement evidence, declarant identity, session ID, CLI version, timestamp, and normalized declaration digest.
- `accept-preview` requires the current declaration, validation receipt, preview receipt, exact rendered PNG digest, and matching metadata/TXT/CSV artifact digests. It accepts only the exact `preview:preview` digest supplied with `--preview-digest` and `--confirm`.
- `status` and `resume` expose `releaseGates`, `releaseDeclaration`, and `previewAcceptance` without exposing private session provenance. A current final acceptance is never reported as current after a relevant manifest, source PNG, validation/warning, preview input, preview artifact, or declaration change.
- Re-running acceptance or a later pack attempt with unchanged bindings is idempotent; changing only an unrelated JSON property order does not change the canonical release projection digest.
- Human and JSON responses communicate the same missing evidence, safety, precondition digests, and next action. No Phase 1 command reports a formal archive, sync, draft, or installation milestone.
- Focused Core and CLI tests prove strict parsing, no inference, exact acknowledgement application, declaration/acceptance binding, stale invalidation, atomic failure behavior, public argv, JSON projection, and human output.

## Confirmed public seams for TDD

Before writing any implementation test, confirm these seams with the user as required by the TDD skill. Tests must observe behavior through these public boundaries and must not mock internal Core/CLI collaborators:

1. **Pure Core contract seam:** exported `parseAssetReleaseDeclaration`, canonical release-declaration projection/digest, release-receipt parsing, and release-gate projection. Inputs are plain values; expected digests are independent fixed literals or fixtures, not recomputed by the test using the same helper.
2. **Session persistence seam:** `createAssetAuthoringSessionStore(...).read/status/resume/replace` and the persisted `session.json`; filesystem, clock, UUID, and atomic rename failures may be injected only as system boundaries.
3. **CLI application seam:** `runCli` with the exact public argv for `asset authoring acknowledge`, `declare`, and `accept-preview`, using a real temporary workspace and the existing validation/preview leaf implementations.
4. **Response seam:** `authoringResponseProjection`, `formatJsonResponse`, and `formatHumanResponse`; assert the public envelope/projection and stable human lines, not private session fields or helper call order.

The first implementation PR must record the user's seam confirmation before its first test commit. This plan records the seams now so the review can approve or adjust them without starting implementation prematurely.

Seam confirmation: On 2026-08-04 the user replied `繼續` after reviewing this
plan. That confirmation authorizes the four seams above for the Phase 1
implementation and does not authorize private-helper tests or internal-module
mocking.

## Fixed Phase 1 public contract

### Commands

```text
lpc-toolkit asset authoring acknowledge \
  --session <session-id> --acknowledgement <record.json> [--confirm]

lpc-toolkit asset authoring declare \
  --session <session-id> --declaration <declaration.json> [--confirm]

lpc-toolkit asset authoring accept-preview \
  --session <session-id> --preview-digest <sha256> --confirm
```

`--workspace <directory>` remains available on every session command, and
`--json` remains the structured-output switch. Public argv ordering and missing
flag behavior must be tested through the command parser and `runCli`.

### Capability/schema advertisement

Phase 1 adds:

```text
asset-authoring-release.v1
lpc-toolkit.asset-release-declaration.v1
lpc-toolkit.asset-authoring-release-receipt.v1
```

The existing session/response identifiers remain advertised. The follow-up's
`asset-authoring-draft-recovery.v1`, `asset-authoring-consumer-install.v1`,
`lpc-toolkit.asset-authoring-draft-receipt.v1`, and
`lpc-toolkit.asset-authoring-install-receipt.v1` remain deferred and must not be
claimed by Phase 1.

### Declaration input

The strict user-supplied minimum is:

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

The parser rejects unknown fields, empty strings, unsupported kinds/roles,
false confirmations, invalid digest syntax, duplicate record digests, and
missing required evidence; equivalent unsorted digest lists are normalized
deterministically. It never fills a field from ambient identity.
The command compares the declaration to freshly loaded manifest credits,
supported license/source evidence, and current warning acknowledgement records
before writing a session receipt.

### Acknowledgement input and persistence

The acknowledgement file contains exactly one existing
`AssetPackAcknowledgement` record. The command validates it through the Core
asset-pack schema and current validation report, including diagnostic code,
structured subject, content digest, and non-empty human reason. It atomically
adds the exact canonical record to the session pack's existing
`asset-pack.json` acknowledgement list, sorted with the existing Core rules;
it never accepts a broad class or an invented reason. Repeating the same
confirmed command is a no-op with the same manifest evidence. A failed or raced
write leaves both manifest and session unchanged.

### Release receipts and acceptance evidence

`lpc-toolkit.asset-authoring-release-receipt.v1` is a strict, discriminated
receipt contract with `kind: "declaration" | "preview-acceptance"`.

- The declaration receipt binds the normalized declaration digest, declarant,
  session ID, CLI version, timestamp, manifest digest, complete source digest
  set, validation receipt ID/revision, credit digest(s), acknowledgement
  content/record digests, and the exact release evidence used.
- The preview-acceptance receipt binds the current declaration receipt digest,
  declarant, manifest/source digests, validation receipt ID, preview receipt ID
  and input digest, the rendered PNG digest, and all matching metadata,
  `credits.txt`, and `credits.csv` artifact digests. The acceptance contains no
  detached free-form approval claim; any optional note remains bounded by the
  receipt contract and is never used as evidence.

The session stores release receipts under additive `releaseDeclaration` and
`previewAcceptance` receipt slots. The preview receipt is extended to retain
the exact artifact IDs/paths/digests required for later acceptance. Existing
#149 session files without these optional slots parse with `null` release
receipts; unknown fields remain errors.

## Intended file structure

Adjust only when existing ownership makes a smaller placement clearly better;
record any deviation in this plan before implementation.

### Core

- Create `packages/core/src/asset-release-schema.ts` for strict declaration and
  release-receipt types/parsers, canonical declaration/release projections,
  digest-bound evidence types, and pure release-gate status predicates.
- Modify `packages/core/src/index.ts` to export only the approved pure contract
  surface.
- Create `packages/core/test/asset-release-schema.test.ts` for strict fields,
  schema identity, no inference, digest binding, stable property-order
  projections, and discriminated receipt parsing.
- Do not modify `packages/asset-pack-format/`; its archive/payload/checksum
  contracts are Phase 2/3 authorities and are not needed for Phase 1.

### CLI session and command layer

- Modify `packages/cli/src/asset-authoring-session.ts` to add additive
  acknowledgement/declaration/preview-acceptance receipt types, strict
  backward-readable parsing, current evidence collection, and invalidation
  decisions for manifest/source/validation/warning/preview/declaration drift.
- Modify `packages/cli/src/asset-authoring-commands.ts` to add the three public
  commands, explicit confirmation gates, exact manifest acknowledgement update,
  fresh evidence checks, release receipt publication, and safe next actions.
- Prefer a focused helper such as
  `packages/cli/src/asset-authoring-release.ts` for declaration file loading,
  current release-evidence assembly, artifact re-digesting, and receipt
  construction; keep Node filesystem behavior out of Core.
- Modify `packages/cli/src/capabilities.ts`, `command-spec.ts`, `response.ts`,
  and `main.ts` only at their existing capability/parser/projection/dispatch
  seams.
- Preserve `asset-pack-validation.ts`, `asset-pack-preview.ts`, and
  `asset-pack-files.ts` as the authorities for validation, attribution, preview
  artifacts, and source snapshots. Extend their public result only when needed
  to expose already-produced evidence; do not duplicate their internals.

### Focused tests

- Extend `packages/cli/test/asset-authoring-session.test.ts` for additive
  receipt parsing, atomic receipt persistence, old-session compatibility, and
  pure invalidation decisions.
- Add or extend `packages/cli/test/asset-authoring-release.test.ts` (preferred)
  for exact acknowledgement application, declaration and acceptance commands,
  stale/race refusal, and idempotency using real temporary workspaces.
- Extend `packages/cli/test/asset-authoring-receipts.test.ts` and
  `asset-authoring-session-e2e.test.ts` for current PNG/metadata/TXT/CSV
  evidence, declaration binding, final acceptance, and source/manifest/artifact
  drift recovery.
- Extend `packages/cli/test/command-spec.test.ts`, `main-json.test.ts`, and
  `main-human.test.ts` for exact public argv, response fields, missing input,
  confirmation, JSON, and human output contracts.
- Keep deferred draft/sync/pack/inspect/install acceptance in their existing
  test modules for later phases; do not broaden Phase 1 into archive lifecycle
  implementation.

## Implementation sequence

### Task 1: Lock the pure declaration and release-receipt contracts

**Files:** Core schema/index/tests listed above.

- [x] Write the first failing tests through the Core export seam for strict
  declaration schema identity, required human fields, unknown-field rejection,
  invalid/duplicate digest handling, deterministic unsorted-list normalization,
  false confirmation, and no ambient identity inference.
- [x] Add failing tests for declaration/release evidence projection stability
  under JSON property reordering and for receipt binding to independent
  manifest/source/validation/preview/artifact digests.
- [x] Implement the minimum strict parsers and canonical projections in
  `asset-release-schema.ts` without Node or filesystem imports. Keep declaration
  input authority distinct from generated receipt fields.
- [x] Add the discriminated `asset-authoring-release-receipt.v1` contract and
  pure gate predicates for current declaration, acknowledgement, validation,
  preview, and artifact bindings.
- [x] Run the focused Core test and typecheck; record the expected RED result
  before implementation and GREEN result after implementation here.
- [x] Commit the product slice with a conventional `feat(core): add asset release declaration contracts` message.

Implementation note: The user confirmed the four public TDD seams by replying
`繼續` on 2026-08-04. RED evidence was recorded through the Core export seam:
the initial focused run failed because `asset-release-schema.ts` was absent;
the receipt follow-up run failed with four missing-export failures. GREEN then
passed with eight focused tests covering declarations, receipts, projections,
artifact bindings, and gates. The implementation keeps all receipt and gate
logic pure and does not modify `packages/asset-pack-format/`.

Commit: 258fccef4a861625ee4381a395f9554e98dedf88

Verification:

- `rtk pnpm --filter @lpc-toolkit/core test -- asset-release-schema.test.ts` PASS (8 tests)
- `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
- `rtk pnpm check:boundaries` PASS
- `rtk git diff --check` PASS

### Task 2: Persist exact acknowledgements through the session command

**Files:** `asset-authoring-session.ts`, `asset-authoring-release.ts` if
created, `asset-authoring-commands.ts`, and focused CLI tests.

- [x] Write a failing `runCli` test for `acknowledge` without `--confirm`: it
  returns `ok: true`, `state: "needs-user-action"`, a stable confirmation next
  action, and unchanged manifest/session bytes.
- [x] Write failing tests for malformed/unknown acknowledgement fields, a
  wrong content digest/subject, an empty reason, a duplicate record, and an
  acknowledgement outside the session's declared scope. Every tested failure
  leaves prior bytes unchanged; the command also checks the fresh manifest
  digest immediately before the existing atomic replacement boundary.
- [x] Implement strict record loading through existing Core asset-pack parsing,
  fresh validation/template matching, one-record application, deterministic
  ordering, explicit `--confirm`, and atomic manifest/session publication.
- [x] Extend session evidence so the acknowledgement checkpoint and current
  validation/preview receipts become stale after an acknowledged manifest
  change. Release receipt slots remain owned by Tasks 3/4; the last valid
  acknowledgement receipt is preserved as session evidence.
- [x] Add a green idempotency test and verify the exact persisted JSON record,
  including reason, subject, diagnostic code, and content digest.
- [x] Run the focused CLI acknowledgement/session tests and CLI typecheck.
- [x] Commit the product slice with a conventional `feat(cli): persist exact asset warning acknowledgements` message.

Implementation note: The initial `runCli` RED run failed because the public
`acknowledge` command was not yet recognized. The GREEN slice now validates one
Core-parsed record against a fresh warning template, requires explicit
confirmation, atomically replaces only the contained manifest, revalidates the
published bytes, records a sorted acknowledgement receipt, and rolls back the
manifest/snapshot on publication failure. Repeated confirmation with unchanged
bindings is a byte-for-byte no-op. The acknowledgement helper remains in the
existing command owner for this slice; Task 3 will reassess whether the shared
release-evidence assembly warrants extraction.

Commit: 89a58e0b1f7f0e7ce157e81fa90dd3c6c69467c9

Verification:

- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-receipts.test.ts asset-authoring-session.test.ts` PASS (17 tests)
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS
- `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts asset-authoring-session.test.ts` PASS (54 tests)
- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session-e2e.test.ts asset-authoring-commands.test.ts main-json.test.ts main-human.test.ts` PASS (88 tests)
- `rtk pnpm check:boundaries` PASS
- `rtk git diff --check` PASS

### Task 3: Add explicit human release declaration and response projection

**Files:** session/command/release helper, `capabilities.ts`,
`command-spec.ts`, `response.ts`, `main.ts` only where dispatch requires it,
and focused CLI tests/docs contract tests.

- [x] Write failing public-argv tests for `declare` missing `--declaration`,
  unknown options, absent/stale validation, missing exact acknowledgements,
  mismatched manifest/credit/license/source digests, and no `--confirm`.
- [x] Implement declaration file containment/read validation, Core parsing,
  fresh validation and attribution evidence checks, explicit confirmation, and
  atomic session-owned declaration receipt publication. Do not write identity or
  authority back into the asset-pack manifest.
- [x] Add the Phase 1 capability/schema identifiers while keeping draft and
  consumer-install identifiers absent. Older sessions/integrations stop with a
  structured safe action at the #149 preview boundary.
- [x] Extend the bounded response with `releaseGates` and `releaseDeclaration`
  plus the current next action/precondition digests. Keep private plan,
  provenance, and raw session internals out of JSON.
- [x] Add human output lines that distinguish technical validation, human
  declaration, and release readiness; do not claim formal archive publication.
- [x] Run command-spec, JSON, human, declaration, capability, and CLI typecheck
  tests. Commit with `feat(cli): add human asset release declarations`.

Implementation note: The initial public-argv RED run failed because `declare`
was not yet recognized by the command surface. The GREEN slice now confines and
strictly parses a user declaration, revalidates the current manifest/source and
Core attribution evidence, requires explicit confirmation, and publishes only
the session-owned declaration receipt. It never writes human identity or
authority into `asset-pack.json`. Missing/stale validation or exact warning
evidence pauses with a safe structured action; stale manifest and credit
evidence errors leave session bytes unchanged. The normalized pack credit
evidence digest is bound to both declaration authority fields because the
current manifest exposes one combined credit/source projection; the two fields
remain independently required and explicitly confirmed. Release gates and
bounded declaration receipts are projected into JSON and stable human output;
deferred draft, archive, install, and final preview-acceptance behavior remains
unadvertised/unimplemented.

Commit: f6ab370d4b0adfc64e7da3f841bc766efeb849de

Verification:

- `rtk pnpm --filter @lpc-toolkit/core test -- asset-release-schema.test.ts` PASS (10 tests)
- `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS
- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-receipts.test.ts asset-authoring-session.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts` PASS (145 tests)
- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session-e2e.test.ts asset-authoring-commands.test.ts` PASS (10 tests)
- `rtk pnpm check:boundaries` PASS
- `rtk git diff --check` PASS

### Task 4: Accept the exact attributed preview and close Phase 1 invalidation

**Files:** session/command/release helper/response and focused receipt,
session-E2E, JSON, and human tests.

- [x] Write a failing test showing that `accept-preview` without `--confirm`,
  with a wrong rendered PNG digest, with a missing/stale declaration, with a
  stale validation/preview receipt, or with a changed metadata/TXT/CSV credit
  artifact cannot publish acceptance.
- [x] Extend the preview receipt to persist the exact four artifact IDs,
  absolute paths, and byte digests plus validation/preview binding. Re-digest
  those regular files immediately before acceptance and reject races without
  mutating the session.
- [x] Implement exact `--preview-digest` matching against the rendered PNG
  artifact, explicit confirmation, declaration binding, and the
  `previewAcceptance` receipt. Advance only to a release-ready session
  checkpoint; do not create or inspect an archive.
- [x] Extend pure/CLI invalidation to cover manifest identity/asset/source/
  compatibility/credit/acknowledgement changes, source PNG changes, validation
  or warning changes, preview input/artifact changes, and declaration changes.
  `resume` must preserve prior receipts as stale evidence and expose exactly one
  safe or human-conflict next action.
- [x] Prove unchanged artifact bytes are idempotent, JSON property reordering
  keeps release projection digests stable, and an externally changed artifact
  or source makes only the affected downstream checkpoints stale.
- [x] Run the focused receipt, session-E2E, JSON, human, Core/CLI typecheck, and
  CLI tests. Commit with `feat(cli): accept attributed release previews`.

Implementation note: The initial public-argv RED run failed as expected because
`accept-preview` was not yet recognized and returned `unknown_command` instead
of the required missing `--preview-digest` diagnostic. The GREEN slice now
stores a backward-readable validation-revision-bound preview receipt with the
canonical PNG, metadata, TXT-credit, and CSV-credit artifact set; re-digests
every contained regular file before acceptance; requires the exact PNG digest,
current declaration/validation/preview bindings, and explicit `--confirm`; and
publishes an idempotent `previewAcceptance` receipt without archive work. Wrong
digests, missing declarations, stale validation/preview evidence, and artifact
races leave session bytes unchanged. Resume/status preserve old receipts as
stale evidence, expose one recovery action, and the Core release-gate
projection now includes `previewAcceptance`.

Commit: f3c9239a45a2da91aff37d8b5b6f1dfce3577358

Verification:

- `rtk pnpm --filter @lpc-toolkit/core test -- asset-release-schema.test.ts` PASS (10 tests)
- `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS
- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-receipts.test.ts asset-authoring-session.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts` PASS (152 tests)
- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session-e2e.test.ts asset-authoring-commands.test.ts` PASS (10 tests)
- `rtk pnpm check:boundaries` PASS
- `rtk git diff --check` PASS

### Task 5: Synchronize Phase 1 documentation and record the implementation gate

**Files:** Every owned CLI documentation surface below, relevant tests, and
this plan.

- [x] Reassess the complete CLI documentation matrix against the actual diff.
  Update every surface whose contract changed; do not imply provider invocation,
  a Codex skill, a Web bridge, draft recovery, sync, formal archive, or install
  in Phase 1.
- [x] Update help and CLI README with the exact three commands, flags,
  confirmation semantics, declaration/acknowledgement evidence, response
  fields, and stale-receipt recovery.
- [x] Update root README and landing copy to distinguish human release
  declarations/final preview acceptance from validation, formal archive
  publication, and consumer installation.
- [x] Update Architecture with Core/CLI receipt ownership and attribution
  boundaries; update Engineering with focused red/green tests and the Phase 1
  verification map; update Releasing with capability/schema compatibility and
  the fact that Phase 1 does not publish an archive.
- [x] Update plugin compatibility references/tests to keep the current plugin
  refusing the new release capability; do not add a skill.
- [x] Run the documentation policy and plugin checks. Commit documentation and
  plan-record changes separately from product code.

Implementation note: The documentation matrix was reassessed against the
public command/help and capability diff. All eight owned surfaces were updated:
help (the checked-in command specification), CLI README, root README, landing,
Architecture, Engineering, Releasing, and plugin compatibility references/tests.
The copy documents `acknowledge`, `declare`, and `accept-preview`, explicit
confirmation, bounded `releaseGates`/`releaseReady`, exact four-artifact
attribution, stale receipt recovery, and the boundary that Phase 1 does not
invoke providers, add a Codex skill, bridge Web sessions, or publish/sync/
inspect/install archives.

Commit: 741fa885dd3ee3bd7d363cac797a5c98aabca91a

Verification:

- `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts` PASS (4 tests)
- `rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts` PASS (21 tests)
- `rtk pnpm verify:cli-docs-policy` PASS (19 tests)
- `rtk pnpm verify:plugin` PASS (40 tests)
- `rtk pnpm verify` PASS (Core 400, asset-pack-format 72, presets 8, CLI 1132 with 1 skipped, Web 861; all typechecks and gates passed)
- `rtk git diff --check` PASS

## CLI documentation impact matrix

Initial assessment from the follow-up specification; reassess before
implementation and again before handoff:

```text
help: update — add acknowledge/declare/accept-preview commands, confirmations, gates, and recovery states
cli-readme: update — document exact declaration/acknowledgement/preview-acceptance inputs and response evidence
root-readme: update — distinguish human release acceptance from validation, formal publication, and installation
landing: update — keep composition, source creation, release acceptance, archive publication, and installation separate
architecture: update — record Core release contracts, CLI receipts, attribution ownership, and no Web bridge
engineering: update — add Phase 1 red/green, stale-receipt, and public JSON/human verification commands
releasing: update — add capability/schema compatibility and clarify that Phase 1 does not publish formal archives
plugin: update — current plugin refuses the new release capability; no authoring skill is added
```

The eventual CLI-sensitive PR body must contain:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering, releasing, plugin
CLI docs reason: Phase 1 adds public release commands and session receipt contracts.
```

## Verification and handoff gate

Use the narrowest checks while iterating. Before handoff, run and record the
exact result for each applicable command:

```sh
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test -- asset-release-schema.test.ts asset-pack-schema.test.ts asset-pack-validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-session.test.ts asset-authoring-release.test.ts asset-authoring-receipts.test.ts asset-authoring-session-e2e.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts
rtk pnpm verify:cli-docs-policy
rtk pnpm verify:plugin
rtk pnpm check:boundaries
rtk pnpm verify
rtk git diff --check
rtk git status --short
rtk git status --short -- upstream
```

Run the CLI build only if production build output or CLI package metadata is
changed during implementation; if the CLI package metadata/build scripts or
packed public surface changes, also run:

```sh
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

The final evidence must prove no writes to `upstream/`, checked-in assets,
managed cache, generated overlay, installed snapshots, or unowned output. Full
packed formal archive and independent consumer installation acceptance remains
deferred to Phases 3 and 4.

## Final acceptance checklist

- [x] Core declaration and release-receipt contracts are strict, deterministic,
  environment-agnostic, and exported through the approved public surface.
- [x] Exact acknowledgements require a real supplied reason and explicit
  confirmation; no inferred identity or acknowledge-all behavior exists.
- [x] Declaration receipts bind current manifest/source/validation/credit/
  acknowledgement evidence and explicit human identity/authority.
- [x] Preview acceptance binds the exact current validation, preview, PNG,
  metadata, TXT-credit, and CSV-credit artifacts and requires explicit consent.
- [x] Relevant drift makes downstream receipts stale without silently adopting
  external bytes or losing the last valid receipt.
- [x] JSON and human responses expose bounded release gates and safe next
  actions without claiming formal archive, sync, draft, or installation.
- [x] All Phase 1 focused RED/GREEN, type, boundary, documentation-policy,
  plugin, repository verification, and protected-path checks pass.
- [x] No dependency, `any`, provider call, authoring skill, Web bridge,
  backend, archive implementation, cache mutation, checked-in asset mutation,
  or `upstream/` mutation entered the Phase 1 change.
