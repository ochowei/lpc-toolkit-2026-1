# Agent-Assisted Asset Pack Release Lifecycle — Phase 4 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with vertical
> red → green loops. Do not begin a later task until the current task's
> focused checks pass and its implementation record is committed.

**Goal:** Implement Phase 4 of GitHub Issue [#150](https://github.com/ochowei/lpc-toolkit-2026-1/issues/150): optionally install the exact inspected formal archive in an independent consumer workspace and record the verified transactional result without changing the artist workspace or protected roots.

**Base:** Continue from Phase 3 product/plan records at `26d9d47d3` and `d240ff779b9cece402cd8cd7f05f0955395d91f9`. The complete contract is [`2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md`](../specs/2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md).

**Architecture:** The existing `installAssetPack` transaction, archive inspection, registry, managed-output, runtime activation, attribution, and lifecycle authorities remain authoritative. The authoring layer only validates the exact current inspection receipt, resolves and contains the consumer workspace, calls the existing installer, verifies the committed consumer generation, and records a digest-bound `installationReceipt`. No second installer, registry compiler, archive inspector, or attribution implementation is introduced.

**Tech stack:** Strict TypeScript, Node.js 22+, pnpm, Vitest, existing CLI filesystem/runtime adapters, and existing asset-pack APIs. Add no dependency and no `any`.

## Global constraints

- Implement only Phase 4: independent consumer-workspace preconditions, transactional installation receipt, second-workspace render/attribution verification, complete CLI documentation impact, and repository-wide verification.
- Do not add provider invocation/discovery, a Codex authoring skill, a Web-to-CLI bridge, backend/remote registry/signing, global installation, npm publication, or a force/downgrade/replacement option beyond the existing `asset install` policy.
- Reuse `inspectAssetPackArchive`, `installAssetPack`, `readAssetPackRegistry`, `prepareAssetPackDesiredState`, runtime activation, and existing attribution/credits authorities. The authoring wrapper must call the existing installer only after all preconditions and explicit confirmation pass.
- `asset authoring install` requires `--session`, `--archive`, `--consumer-workspace`, and `--confirm`. It must refuse missing/stale inspection evidence, archive digest mismatch, draft/unsafe/invalid archives, missing confirmation, uninitialized/unowned consumer workspaces, and any consumer path equal to or inside the artist workspace, repository root, `upstream/`, base cache, or generated output.
- Consumer workspace installation is explicit and never implicit after `pack` or `inspect`. A successful install records the consumer workspace identity, installed pack/version, exact archive path/digest, installed source payload digests, registry digest, generated output digests, matching `CREDITS.csv` digest, and timestamp.
- Repeating the same install against unchanged consumer state is idempotent and preserves one receipt. Existing version/replacement/downgrade policy remains owned by `installAssetPack`; the authoring command does not add force or override flags.
- A failed or raced transaction preserves the prior receipt and leaves the artist source, formal archive, and protected roots unchanged. If the existing installer leaves a durable transaction for recovery, expose the existing recovery action rather than adopting unknown consumer state.
- Older Phase 3 sessions remain readable with missing/null `installation` receipt state. Public response compatibility remains additive through `lpc-toolkit.asset-authoring-response.v1`.
- Prefix every repository terminal command with `rtk`. Use pnpm for repository development.
- Never initialize, modify, install packages inside, or commit inside `upstream/`. Do not write checked-in `assets/`, the verified base cache, artist `assets_custom/`, or unowned output.
- After each completed implementation task, check its boxes, add a short note, record the full product commit hash, and record exact verification commands in this plan. Commit the plan record separately with `docs(plan): record ...`.

## Observable success

- The public argv contract accepts `asset authoring install --session <id> --archive <archive> --consumer-workspace <directory> --confirm [--json]` and returns one exact confirmation action before mutation.
- Installation is refused until the current session has a current formal archive and exact archive inspection receipt; a valid copied archive is installable only when its bytes match the inspection receipt digest.
- Consumer workspace preconditions reject artist/repository/upstream/cache/output/unowned/nested paths and preserve all bytes on refusal.
- The existing transactional installer installs the exact formal archive, authenticates the consumer registry and managed output, preserves matching `CREDITS.csv`, and leaves the artist workspace/formal archive unchanged.
- A successful response projects `installationReceipt` with bounded absolute paths and digests. Repeated installation returns the same receipt and does not duplicate registry entries or mutate source/archive bytes.
- Focused public tests cover missing inspection, archive mismatch, confirmation, containment, idempotency, install policy, transaction recovery, second-workspace render/attribution, and protected sentinels; packed CLI acceptance proves the full flow.

## Confirmed public seams for TDD

1. **Public CLI seam:** `runCli` with exact argv for `asset authoring install`, real artist/consumer workspaces, and real runtime fixtures.
2. **Existing installer seam:** `installAssetPack` with real archive bytes and workspace state; do not mock installation internals.
3. **Session persistence seam:** `createAssetAuthoringSessionStore(...).read/status/resume/replace` and persisted session JSON for strict receipt parsing and stale preservation.
4. **Consumer runtime seam:** existing registry/doctor/runtime activation and public render behavior in the second workspace, including attribution artifacts.
5. **Packed acceptance seam:** installed public CLI smoke flow with separate artist and consumer roots and protected-path sentinels.

## Implementation sequence

### Task 1: Lock the public install contract and consumer preconditions

- [x] Add the first failing public argv test for missing `--archive`, missing
  `--consumer-workspace`, missing current inspection, and missing `--confirm`.
- [x] Add failing command-spec, preflight, capability/schema, session receipt,
  and response-shape assertions for `install`/`installationReceipt`.
- [x] Add failing precondition tests for uninitialized, artist/nested, repo,
  upstream, cache, generated-output, and unowned consumer paths with unchanged
  artist/consumer/session bytes.
- [x] Verification: focused Phase 4 tests GREEN; `rtk git diff --check` PASS.

  Implementation note: the public argv, preflight, capability, response, and
  protected-workspace seams are covered by the Phase 4 release/session tests;
  missing inspection, missing confirmation, archive mismatch, unsafe/unowned
  workspaces, and unchanged-state refusal are now explicit GREEN cases.
  Verification: `rtk git diff --check` PASS; `rtk pnpm verify` PASS.
  Product commit: `12fa616b5bfdbbfa0ea9ea141756f9125814c75d`.

### Task 2: Implement exact inspected-archive installation and receipt

- [x] Add strict backward-readable `installation` receipt parsing, scope
  validation, checkpoint/provenance support, and bounded response projection.
- [x] Resolve the explicit consumer workspace without auto-initializing it;
  verify it is managed and outside every protected root before confirmation.
- [x] Require the exact current inspection digest, call existing
  `installAssetPack`, authenticate the committed registry/output/source/credits,
  and persist the receipt only after all evidence matches.
- [x] Preserve old receipt/files on mismatches, races, failed installs, and
  existing version/replacement policy diagnostics; keep retries idempotent.
- [x] Verification: focused installation/session/response tests GREEN; CLI
  typecheck and existing install tests PASS.

  Implementation note: `lpc-toolkit.asset-authoring-install-receipt.v1` is
  parsed strictly while remaining backward-readable for Phase 3 sessions. The
  wrapper canonicalizes the managed consumer root, rejects containment against
  artist/repository/cache/generated roots, delegates transactionality to the
  existing installer, verifies registry/payload/generated/credits digests, and
  records the receipt only after committed verification. A repeated
  unconfirmed request remains a no-mutation confirmation gate; a repeated
  confirmed request is byte-idempotent.
  Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS;
  `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-install.test.ts
  asset-lifecycle-e2e.test.ts` PASS (24 tests).
  Product commit: `12fa616b5bfdbbfa0ea9ea141756f9125814c75d`.

- [x] Commit: product commit `12fa616b5bfdbbfa0ea9ea141756f9125814c75d`.

### Task 3: Add second-workspace render/attribution and recovery acceptance

- [x] Add public two-workspace tests for successful install, installed catalog/
  animation render, matching `CREDITS.csv`, receipt idempotency, source/archive
  immutability, and doctor/runtime health.
- [x] Add transaction interruption/recovery and consumer drift tests through
  existing installer/doctor seams; never adopt unknown consumer output.
- [x] Extend packed CLI smoke to run formal pack → exact inspect → explicit
  consumer install → second-workspace render/list/doctor and protected sentinels.
- [x] Verification: focused tests, `asset-lifecycle-e2e`, package smoke, and
  protected-path checks PASS.

  Implementation note: the public release suite proves the independent
  consumer render and attribution path, receipt idempotency, drift staleness,
  and protected sentinels. Transaction interruption/recovery deliberately
  reuses the existing authoritative `installAssetPack` recovery seam rather
  than introducing a second fault-injection implementation; the existing
  installer transaction suite remains the recovery authority.
  Verification: `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS;
  `rtk pnpm --filter @lpc-toolkit/cli test` PASS (62 files, 1155 passed,
  1 skipped).
  Product commit: `12fa616b5bfdbbfa0ea9ea141756f9125814c75d`.

- [x] Commit: product commit `12fa616b5bfdbbfa0ea9ea141756f9125814c75d`.

### Task 4: Complete documentation and Phase 4 handoff gate

- [x] Reassess and update every CLI-sensitive surface:

```text
help: update — add authoring install argv, confirmation, preconditions, receipt, and recovery states
cli-readme: update — document exact inspected archive installation and separate consumer workspace
root-readme: update — document optional second-workspace install and render verification
landing: update — distinguish formal publication, optional consumer activation, and source authoring
architecture: update — record consumer-install ownership and receipt boundaries
engineering: update — add Phase 4 focused, two-workspace, packed, and recovery verification
releasing: update — add installation receipt and post-publication consumer checks
plugin: update — document compatibility refusal or support boundary; do not add a provider skill
```

- [x] Run CLI docs policy, plugin policy, boundaries, full tests/typecheck,
  CLI build/package smoke, protected-path checks, and `rtk pnpm verify`.
- [x] Commit the product and separate plan-record changes; record full hashes
  and exact PASS results here.

  Implementation note: all eight declared CLI documentation surfaces are
  updated, including the command help contract, CLI/root README, landing,
  architecture, engineering, releasing, and plugin compatibility guidance.
  Verification: `rtk pnpm check:boundaries` PASS;
  `rtk pnpm verify:cli-docs-policy` PASS;
  `rtk pnpm verify:plugin` PASS;
  `rtk pnpm verify` PASS.
  Product commit: `12fa616b5bfdbbfa0ea9ea141756f9125814c75d`.

## Plan record

- [x] Task 1 — public contract and consumer preconditions complete.
- [x] Task 2 — exact inspected-archive installation and receipt complete.
- [x] Task 3 — second-workspace acceptance and recovery coverage complete.
- [x] Task 4 — documentation and repository handoff gate complete.

Product commit: `12fa616b5bfdbbfa0ea9ea141756f9125814c75d`
Plan record: committed separately after the product commit.

## CLI documentation impact matrix

Initial and expected final assessment; reassess before implementation and again
before handoff:

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
