# Release-Safe Generation Provenance Projection — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with vertical red
> → green loops. Do not begin a later task until the current task's focused
> checks pass and its implementation record is committed.

**Goal:** Implement the D1 contract from GitHub Issue [#155](https://github.com/ochowei/lpc-toolkit-2026-1/issues/155): publish a bounded, deterministic generation-provenance projection for one exact formal asset-pack release, and verify that companion receipt without changing the existing v1 archive, manifest, attribution, or installation behavior.

**Base:** Start from the merged `main` commit containing PR #156 (`5d21b5eb6e01effb0b705327614ab5b748b08ce7`). The accepted contract is [`2026-08-05-release-safe-generation-provenance-projection.md`](../specs/2026-08-05-release-safe-generation-provenance-projection.md). The glossary update is in [`CONTEXT.md`](../../../CONTEXT.md), and the deferred roadmap remains [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153).

**Architecture:** Core owns the environment-agnostic provenance record types, strict parser, bounded-value rules, normalized projection, and graph/digest predicates. `asset-pack-format` owns canonical UTF-8 receipt encoding and reuses the existing archive/payload/content-digest authorities; it must not add a ZIP member or manifest field. CLI owns session evidence collection, provider-record input, session receipt persistence, atomic companion-file publication, public command routing, and the read-only archive/receipt verifier. Existing formal archive, inspection, release declaration, preview acceptance, attribution, and installation authorities remain authoritative.

**Tech stack:** Strict TypeScript, Node.js 22+, pnpm, Vitest, existing Core/CLI/asset-pack-format APIs, and existing filesystem/runtime adapters. Add no dependency and no `any`.

## Global constraints

- Implement only D1: a versioned external companion receipt and an explicit provenance-aware verifier. Do not add provider invocation/discovery, authentication, remote services, signing, a Web-to-CLI bridge, a Codex/provider skill, automatic drawing operations, a new archive format, or an npm publication path.
- Preserve `lpc-toolkit.asset-pack.v1`, strict `asset-pack.json`, deterministic formal ZIP bytes, existing content-digest projection, `asset install` semantics, and the current archive checksum table byte-for-byte. `release-provenance.json` is never an archive member and is never installed by ordinary `asset install`.
- Preserve the separation between generation provenance, credits/authorship, license authority, acknowledgement reasons, human preview acceptance, and release approval. A provider identifier never supplies a credit or release authority; the companion receipt is evidence, not a signature or approval.
- Reuse `assetAuthoringReleaseReceiptProjection`/digest, `inspectAssetPackArchive`, `readAssetPackArchive`, the existing payload/content-digest authority, formal archive receipts, declaration/preview-acceptance receipts, session freshness, and existing response projection. Do not create a second manifest, installer, archive inspector, attribution path, or content projection.
- Core must remain environment-agnostic. It must not import Node, filesystem, DOM, React, ZIP, concrete canvas, CLI, Agent, or provider code. File bytes, timestamps, paths, and cryptographic hashing stay at caller seams.
- The companion receipt accepts only exact schema keys and bounded values. Reject unknown fields, duplicate logical records, invalid digests, unsorted arrays in parsed public documents, absolute/private paths or URLs, arbitrary nested provider JSON, forbidden secret/prompt/reference payloads, and values over the specified limits. Never truncate or silently redact after digest calculation.
- Enforce the D1 limits before publication: canonical receipt ≤256 KiB; ≤128 records; ≤64 `inputDigests` and `referenceDigests` per record; ≤256 UTF-8 bytes for provider/tool/model, target, and operation identifiers.
- `sourceDigests` and preview artifacts are pack-relative/logical projections only. The receipt must not contain local absolute paths, home/repository paths, session-private paths, raw prompts, source/reference bytes, generated pixels, credentials, environment values, private URLs, human identity, credit text, license authority, or free-form approval claims.
- The only source-transformation operation identifiers are the bounded v1 enum: `candidate-import`, `crop`, `resize`, `recolor`, `format-conversion`, and `manual-edit`. The CLI never invents a transformation record or executes one; it only validates records supplied at the public input seam.
- `--confirm` is a publication consent boundary, not a bypass. Generation must refuse missing/stale release evidence, archive/source/manifest drift, unsafe paths, invalid records, unsupported schemas, or digest mismatches before mutation. Verification is read-only and never requires confirmation.
- A generated receipt is written atomically under the session-owned `release-artifacts` root, next to the formal archive by default. An existing different receipt is never overwritten silently: an unchanged receipt is idempotent; a changed projection requires an explicit new contained output path, leaving the prior receipt and session evidence available for diagnosis.
- A provenance-aware verifier may read copied archive/receipt files, but it must require exact archive bytes, manifest bytes, content/source digests, pack identity, projection digest, and strict receipt validity. It must fail closed with stable D1 diagnostics and leave every input/output workspace byte unchanged.
- Older sessions remain readable with an absent/null provenance receipt. A missing companion receipt does not make ordinary v1 inspection or installation fail. Unsupported provenance-aware operations fail closed rather than being treated as complete.
- Never initialize, modify, install packages inside, or commit inside `upstream/`. Do not write checked-in `assets/`, the verified base cache, artist source outside the session boundary, consumer workspaces, or unowned output during tests.
- Prefix every repository terminal command with `rtk`. Use pnpm for repository development.
- After each completed implementation task, check its boxes, add a short implementation note, record the full product commit hash, and record exact PASS results in this plan. Commit plan-record changes separately with `docs(plan): record ...` as required by `AGENTS.md`.

## Observable success

- `lpc-toolkit capabilities --json` advertises `asset-authoring-release-provenance.v1` and `lpc-toolkit.asset-release-provenance.v1` only after the implementation is shipped; no provider capability or embedded archive capability is advertised.
- The public authoring command accepts:

  ```text
  lpc-toolkit asset authoring provenance --session <session-id> [--records <records.json>] [--output <receipt>] --confirm [--workspace <directory>] [--json]
  ```

  It produces one strict canonical companion receipt only from current formal-archive, inspection, declaration, preview-acceptance, artifact, manifest, content, and source evidence.
- The public consumer command accepts:

  ```text
  lpc-toolkit asset provenance verify --archive <archive> --provenance <receipt> [--json]
  ```

  It verifies copied exact archive bytes and the companion receipt without requiring or mutating the authoring session. It reports the bound release evidence digests but does not claim to have re-created private human receipts that were not supplied to it.
- Core contract tests prove strict schema identity, exact record kinds, operation allowlist, duplicate/unbound-result rejection, privacy/resource limits, canonical property/order normalization, digest-input stability, and exclusion of timestamps, random IDs, environment values, or paths.
- Generation tests prove the receipt binds exact ZIP/manifest/content/source/declaration/preview/artifact digests, uses the existing content projection, refuses stale or mismatched evidence, protects the old receipt on output conflict, and is idempotent when all bindings are unchanged.
- Verification tests prove exact archive-copy acceptance only when bytes match, malformed/unsupported/stale/digest-mismatched receipt refusal, source/manifest/content mismatch refusal, no mutation on failure, and ordinary v1 inspect/install compatibility.
- Packed acceptance proves a clean authoring workspace can run formal pack → exact inspect → provenance generation, and a separate clean consumer can verify the copied archive/receipt without receiving or mutating session-private files. Protected sentinels include `upstream/`, checked-in assets, base cache, artist source, formal archive, receipt, and unowned output.

## Confirmed public seams for TDD

The plan records these seams for review before implementation. Tests must use public behavior and system boundaries; do not mock private Core/CLI collaborators or assert helper call order.

1. **Pure Core seam:** exported provenance parser, normalized projection, digest-input projection, record ordering, and release-binding predicates with plain values and fixed independent digest fixtures.
2. **Canonical format seam:** the existing `asset-pack-format` canonical JSON encoder and runtime SHA-256 seam for exact UTF-8 companion bytes; no ZIP writer/parser changes beyond reuse.
3. **Authoring CLI seam:** `runCli` with exact `asset authoring provenance` argv, a real temporary workspace, real formal archive/inspection/release receipts, optional strict records input, and real session persistence.
4. **Consumer CLI seam:** `runCli` with exact `asset provenance verify` argv and copied archive/receipt files outside the authoring workspace; assert the public human/JSON response and unchanged filesystem snapshots.
5. **Session persistence seam:** `createAssetAuthoringSessionStore(...).read/status/resume/replace`, strict backward-readable receipt parsing, atomic file operations, and existing freshness/invalidation decisions.
6. **Packed acceptance seam:** installed public CLI smoke with separate author/consumer roots and protected-path sentinels.

Seam confirmation is required before the first implementation test commit. The user's `已經 merge 了` confirms the base is ready; it does not authorize private-helper tests or implementation beyond this plan.

## Fixed D1 contract

### Core receipt document

The only public receipt schema is `lpc-toolkit.asset-release-provenance.v1`:

```json
{
  "schema": "lpc-toolkit.asset-release-provenance.v1",
  "projection": {
    "pack": { "id": "example-pack", "version": "1.2.3" },
    "releaseBindings": {
      "archiveDigest": "sha256:...",
      "manifestDigest": "sha256:...",
      "contentDigest": "sha256:...",
      "sourceDigests": [{ "path": "sprites/item/walk.png", "digest": "sha256:..." }],
      "releaseDeclarationReceiptDigest": "sha256:...",
      "previewAcceptanceReceiptDigest": "sha256:...",
      "previewArtifacts": [{ "id": "preview:preview", "digest": "sha256:..." }]
    },
    "records": []
  },
  "projectionDigest": "sha256:..."
}
```

The exact accepted record shapes are `provider-output`, `external-input`, and `source-transformation`. Records use only identifiers and digests. `provider-output` requires `targetId`, `contractDigest`, `provider.id`, `provider.tool`, `resultDigest`, and bounded input/reference/prompt evidence. `external-input` requires `targetId` and `resultDigest`, with optional contract/reference digests. `source-transformation` requires `targetId`, one or more predecessor `inputDigests`, an allowlisted `operation`, and `resultDigest`, with optional contract/reference digests. A result must be release-bound directly or through a valid predecessor chain.

`sourceDigests`, `previewArtifacts`, `inputDigests`, and `referenceDigests` are normalized by their logical key. `records` are sorted by canonical UTF-8 record bytes. `projectionDigest` is calculated over the canonical UTF-8 projection and excludes itself. The complete receipt is canonical UTF-8 JSON and is bounded before atomic publication.

### Session receipt

Add an optional, backward-readable `releaseProvenance` slot to `AssetAuthoringSessionReceipts`. Its strict session-owned receipt records the companion path, exact file digest, projection digest, pack/version, formal archive digest, and timestamp. It contains no raw provider payload and no private provenance path inside the public Core projection. Existing session JSON without this slot parses as `null`; unknown session receipt fields remain errors.

### Records input

`--records` is optional. When supplied, it is a UTF-8 JSON array of the exact Core-valid record objects; it is parsed before any archive or receipt mutation. An omitted file produces an empty records array, which remains a valid release-bound provenance projection. The input file is never copied into the public receipt. A changed record set may be published only to a new explicit contained `--output` path, preserving the previous companion bytes.

## Intended ownership and files

Adjust only when existing ownership makes a smaller placement clearly better; record any deviation in this plan before implementation.

### Core

- Create `packages/core/src/asset-release-provenance-schema.ts` for strict public types, parser diagnostics, record operation allowlist, bounded string/path/privacy checks, source-binding graph predicates, and normalized projection.
- Modify `packages/core/src/index.ts` to export only the approved pure provenance surface.
- Add `packages/core/test/asset-release-provenance-schema.test.ts` for exact keys, all record kinds, canonical ordering, independent digest fixtures, duplicate/unbound results, forbidden values, all resource limits, and no ambient data.
- Do not import `asset-pack-format` or move Node/runtime hashing into Core. Core returns deterministic projection/digest-input values; callers supply UTF-8 encoding and cryptographic hashing.

### Asset-pack format

- Add a focused pure serializer/encoder module under `packages/asset-pack-format/src/` only if needed to use the existing canonical JSON authority for the companion document and projection digest input.
- Export no archive member or manifest extension. Existing `archive.ts`, `payload.ts`, checksum fixtures, and `asset-pack.v1` compatibility remain unchanged.
- Add format tests for exact canonical UTF-8 bytes, projection digest input, 256 KiB boundary, and round-trip strict parsing through the Core contract.

### CLI session and commands

- Modify `packages/cli/src/asset-authoring-session.ts` for additive strict session receipt parsing, release-artifact containment, backward compatibility, provenance checkpoint/invalidation, and atomic receipt persistence.
- Prefer a focused `packages/cli/src/asset-release-provenance.ts` coordinator for current evidence assembly, records-file loading, output-path containment, archive/manifest/source binding, receipt construction, stale/conflict handling, and read-only verification. Keep existing archive/validation/attribution authorities in their current modules.
- Modify `packages/cli/src/asset-authoring-commands.ts`, `asset-commands.ts`, `main.ts`, `command-spec.ts`, `capabilities.ts`, and `response.ts` only at their existing public seams for the two fixed commands.
- Generation must reuse the current formal archive and archive-inspection receipts, existing release declaration/preview acceptance digest projection, existing `AssetPackInspectionReport.contentDigest`, and current source digest set. It must re-digest the exact preview artifacts before publication.
- Verification must use existing archive inspection/payload parsing and compare the receipt's archive, manifest, content, source, pack/version, and projection digests without initializing a workspace or writing a session.

### Focused tests and documentation

- Add `packages/cli/test/asset-release-provenance.test.ts` for generation, output conflicts, stale evidence, records privacy/limits, idempotency, and read-only verification.
- Extend `packages/cli/test/asset-authoring-session.test.ts`, `asset-authoring-session-e2e.test.ts`, `command-spec.test.ts`, `main-json.test.ts`, `main-human.test.ts`, and `response.test.ts` for receipt persistence, exact argv, capability/schema advertisement, diagnostics, and public projection.
- Extend `packages/asset-pack-format/test/archive.test.ts`, `payload.test.ts`, and add a focused provenance format test to prove no ZIP/manifest/content-digest regression.
- Update all eight CLI-sensitive documentation surfaces listed in the matrix below.

## Implementation sequence

### Task 1: Lock the pure provenance contract and canonical encoding

- [x] Record seam confirmation for the Core and canonical-format public seams before the first test commit.
- [x] Write failing Core tests for schema/record exact keys, digest syntax, pack/version identity, source/path rules, provider/operation allowlists, duplicate records, unbound-result chains, stable ordering, property-order invariance, privacy classes, and every resource limit.
- [x] Implement the minimum Core parser, diagnostics, normalized projection, record sorting, and binding predicates without I/O, timestamps, random IDs, environment reads, or provider behavior.
- [x] Add the canonical format encoder/digest-input seam using the existing canonical JSON authority; prove exact UTF-8 bytes and receipt size enforcement.
- [x] Verification: focused Core and asset-pack-format tests GREEN; Core/format typechecks PASS; `rtk git diff --check` PASS.
- [x] Commit the product slice with a conventional `feat(core): add release provenance contract` message.

Implementation note: PR #157 was merged before implementation, confirming the
public Core and canonical-format seams recorded in this plan. The first RED
slice observed the absent public parser export; subsequent vertical slices
added strict receipt/record parsing, release-bound predecessor checks,
canonical ordering, privacy/resource limits, and the external canonical UTF-8
encoder. No private collaborator mocks, provider calls, timestamps, paths, or
archive members were introduced.
Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-release-provenance-schema.test.ts` PASS (11 tests); `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS; `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- release-provenance.test.ts` PASS (3 tests); `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck` PASS; `rtk pnpm --filter @lpc-toolkit/core test -- asset-release-schema.test.ts` PASS (10 tests); `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- archive.test.ts payload.test.ts compatibility.test.ts` PASS (48 tests); `rtk pnpm check:boundaries` PASS; `rtk git diff --check` PASS.
Product commit: `2cd43a3fe3d77b30b311b344e797cf0b62f5471d`

### Task 2: Generate and persist a release-bound companion receipt

- [x] Add failing public `runCli` tests for missing/stale formal archive or inspection, incomplete declaration/preview evidence, invalid records, missing confirmation, unsafe output, output conflict, exact binding, idempotency, and protected-path immutability.
- [x] Add backward-readable strict `releaseProvenance` session receipt parsing, release-artifact containment, stale detection, and atomic persistence. Preserve the old artifact/session receipt on conflicts or failed/raced writes.
- [x] Implement `asset authoring provenance` with optional strict `--records`, deterministic default sibling output, explicit contained `--output` recovery, and `--confirm` publication gate. Reuse all existing release and archive authorities; do not call a provider.
- [x] Record only the companion file's exact bytes/path/digest in the session receipt; keep raw records outside the public receipt and reject any path/secret/payload leakage before writing.
- [x] Verification: focused authoring/session/response tests GREEN; CLI typecheck PASS; existing formal pack/inspect tests PASS.
- [x] Commit the product slice with a conventional `feat(cli): publish release provenance receipt` message.

Implementation note: The public CLI now generates the external canonical
companion receipt only after current formal-archive, archive-inspection,
declaration, preview-acceptance, artifact, manifest, content, and source
evidence pass. `--records` is parsed through the Core privacy/limit/binding
contract; publication is atomic, contained, confirmation-gated, conflict-safe,
and idempotent. Session persistence is additive/backward-readable and stores
only the companion path, exact file digest, projection digest, pack identity,
formal archive digest, and timestamp. No provider is invoked and the v1 ZIP,
manifest, installation, or attribution paths were changed.
Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-release-provenance.test.ts asset-authoring-release.test.ts asset-authoring-session.test.ts asset-authoring-session-e2e.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts response.test.ts` PASS (182 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- archive.test.ts payload.test.ts` PASS (45 tests); `rtk pnpm check:boundaries` PASS; `rtk git diff --check` PASS.
Product commit: `d1f964f03e46cd39cb99501204bf95c996bdd787`

### Task 3: Add read-only provenance verification and compatibility refusal

- [ ] Add failing public argv tests for `asset provenance verify`, missing inputs, malformed/unsupported/stale receipts, archive/manifest/content/source mismatch, copied-archive mismatch, and successful exact-copy verification.
- [ ] Implement the verifier as a no-workspace, no-session, no-mutation operation using existing archive inspection/payload/content-digest authorities. Verify the projection digest and all release bindings; report that declaration/preview receipt digests are bound evidence rather than re-created human approval.
- [ ] Add capability/schema advertisement, command help, stable D1 diagnostic identifiers, JSON/human response projections, and ordinary v1 install/inspect regression assertions. A missing companion receipt must remain irrelevant to ordinary install.
- [ ] Verification: focused CLI/format/archive tests GREEN; CLI package smoke PASS; existing ordinary install and archive conformance tests PASS.
- [ ] Commit the product slice with a conventional `feat(cli): verify release provenance receipts` message.

Implementation note: 
Verification: 
Product commit: 

### Task 4: Complete packed acceptance, documentation, and handoff gate

- [ ] Add packed acceptance for clean author formal pack → exact inspect → provenance generation, copied archive/receipt verification from a separate consumer root, unsupported/missing provenance refusal, ordinary install compatibility, and protected sentinels.
- [ ] Reassess and update every CLI-sensitive surface:

```text
help: update — add both provenance commands, exact prerequisites, confirmation, output containment, and refusal diagnostics
cli-readme: update — document the optional companion receipt, records input, copying, and read-only verification
root-readme: update — distinguish generation evidence from credits, release authority, and ordinary installation
landing: update — describe optional release provenance without presenting it as attribution or approval
architecture: update — record Core/format/CLI ownership and the external-receipt/no-ZIP-member boundary
engineering: update — add focused, stale, privacy, packed, compatibility, and protected-path verification
releasing: update — add companion receipt publication, conflict handling, and independent verification
plugin: update — document the capability/receipt boundary; do not add provider invocation or a new skill
```

- [ ] Run the complete verification gate, including CLI docs policy, plugin policy, boundaries, all relevant typechecks/tests, package smoke, diff checks, and protected-path evidence.
- [ ] Commit product changes and the separate plan record; record full hashes and exact PASS results here.

Implementation note: 
Verification: 
Product commit: 

## Plan record

- [x] Task 1 — pure provenance contract and canonical encoding complete.
- [x] Task 2 — release-bound companion generation and session persistence complete.
- [ ] Task 3 — read-only verification and v1 compatibility complete.
- [ ] Task 4 — packed acceptance, documentation, and handoff gate complete.

Product commits: Task 1 — `2cd43a3fe3d77b30b311b344e797cf0b62f5471d`; Task 2 — `d1f964f03e46cd39cb99501204bf95c996bdd787`
Plan-record commit: 

## CLI documentation impact matrix

Initial and expected final assessment; reassess before implementation and again before handoff:

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

## Verification and handoff gate

The implementation is not ready for handoff until the exact commands below have recorded PASS results in the completed plan:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-release-provenance-schema.test.ts asset-release-schema.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- release-provenance.test.ts archive.test.ts payload.test.ts
rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck
rtk pnpm --filter @lpc-toolkit/cli test -- asset-release-provenance.test.ts asset-authoring-session.test.ts asset-authoring-session-e2e.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts response.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm check:boundaries
rtk pnpm verify:cli-docs-policy
rtk pnpm verify:plugin
rtk pnpm verify
rtk git diff --check
rtk git status --short
rtk git status --short -- upstream
```

The final record must explicitly state that `upstream/` stayed untouched, existing formal archive fixtures and ordinary installation remained unchanged, no dependency or `any` was added, and all eight documentation surfaces were updated or reassessed with a concrete reason.
