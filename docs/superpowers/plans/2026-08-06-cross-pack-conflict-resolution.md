# D6 — Cross-pack Conflict Resolution Implementation Plan

**Status:** D6 implementation complete — PR #181 and plan closure PR #182 merged
**Issue:** [#179](https://github.com/ochowei/lpc-toolkit-2026-1/issues/179)  
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Spec:** [D6 — Cross-pack Conflict Resolution](../specs/2026-08-06-cross-pack-conflict-resolution.md)  
**Base:** D5 implementation merge commit `a7442dd85cfc6ac07bf218032b7fb73e3ecf717f` ([PR #178](https://github.com/ochowei/lpc-toolkit-2026-1/pull/178))  
**Spec/plan branch:** `codex/issue-179-d6-cross-pack-conflict-spec`  
**Spec/plan PR:** [#180](https://github.com/ochowei/lpc-toolkit-2026-1/pull/180)  
**Implementation branch:** `codex/issue-179-d6-cross-pack-conflict-implementation`

This plan is limited to D6 cross-pack conflict identity, selection, merge,
compatibility, attribution, recovery, and audit contracts. It does not combine
D5 implementation work, D4 publication/trust mutation, or any later roadmap
track. No product code, public capability, dependency, registry, signing,
backend, auth, network service, or external mutation is permitted before this
spec/plan is reviewed and merged.

## Review gate and non-negotiable boundaries

- [x] Review the D6 spec and this plan against Issue #179 and roadmap #153.
  - Review outcome: D6 contract and implementation plan accepted for implementation.
- [x] Merge the independent D6 spec/plan review PR.
  - Merge: PR #180, merge commit `327d11016391841b78d1dbfb939e774a87f69684`.
- [x] Obtain explicit user confirmation before creating the D6 implementation
  branch or changing product code.
  - Confirmation: user reported PR #180 merged on 2026-08-06.
- [x] Keep all work on `codex/` branches and leave `upstream/` untouched.
  - Implementation branch: `codex/issue-179-d6-cross-pack-conflict-implementation`; `upstream/` was not modified.
- [x] Use only local pack/archive/registry/credit/trust/provenance/D5 fixtures
  and deterministic fakes in tests.
- [x] Add no dependency, backend, auth, registry client, signing key,
  marketplace, npm publication, network call, or external service mutation.
- [x] Keep TypeScript strict and add no `any`.
  - Verification: CLI/Core typechecks and full `rtk pnpm verify` PASS; no D6 `any` was added.
- [x] Preserve attribution, licenses, acknowledgements, provenance, consent,
  validation, attributed preview, human review, release, trust, archive,
  install, and architecture boundaries.
- [x] Keep `asset-pack.v1` archive, manifest, registry, install, plugin, and
  existing conflict refusal behavior unchanged unless the approved D6 contract
  and regression tests explicitly require a versioned extension.
  - Verification: existing CLI/Core regression suites and full `rtk pnpm verify` PASS; D6 only stages a receipt for downstream authorities.
- [ ] Never infer conflict precedence, human identity, consent, authorship,
  license authority, or visual approval.

## Public behavior and mutation boundary

The proposed public seams are read-only `asset conflict inspect`, explicit
selection/confirmation through `asset conflict resolve`, and exact-receipt
`asset conflict recover`. The implementation must stage a resolution below an
owned workspace/session root and return the existing import, validation,
attributed preview, human review, release, and installation actions. It must
not publish canonical source, rewrite another pack, change a manifest or
registry, accept a preview, declare a release, sign, distribute, or install.

The D6 implementation may extend existing compile/state authorities only after
the conflict record and resolution receipt have been validated. It may not
create a parallel compiler or silently translate a conflict into a winning
pack.

## Implementation tasks

### 0. Establish authority map and local fixtures

- [x] Confirm the existing Core pack schema/normalization, compile plan,
  `asset_path_conflict` diagnostics, registry ownership, transaction/recovery,
  D1 provenance, D2 provider evidence, D4 trust evidence, and D5 candidate
  operation authorities.
  - Notes: inspected the Core pack/model/compile/baseline contracts and the CLI
    registry, transaction, provenance, provider, distribution, and D5 staging
    authorities before implementation.
- [x] Add checked-in local fixtures for equivalent contenders, disjoint
  patches, same-target byte conflicts, definition/credit/replacement conflicts,
  incompatible versions/capabilities, missing attribution, stale baselines,
  tampered receipts, D2 refusal/result evidence, D5 candidate evidence, and D4
  fake trust records.
- [x] Define protected sentinels for source packs, current managed output,
  registry, archive, credits, unowned output, and `upstream/`.
  - Notes: checked-in Core/CLI fixtures carry target, definition, credit,
    replacement, compatibility, trust, D2, D5, attribution, and provenance
    evidence; deterministic test variants cover equivalent, disjoint, changed
    output, stale, incompatible, incomplete-attribution, and tampered-receipt
    paths. The CLI protected-root test proves conflict inputs outside the caller
    root are refused; the implementation has no source, registry, archive,
    credits, unowned-output, or `upstream/` write path.
- [x] Write failing contract tests before implementation.
  - Commit: `e02c1b2e78a8c443fd1e1633fc8137175966dbcd`
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-conflict.test.ts` PASS (9 tests).

**TDD evidence:** fixture and contract tests must fail for missing D6 identity,
selection, merge, attribution, compatibility, and recovery behavior without
requiring a real registry, provider, or external service.

### 1. Implement the conflict identity and contender schemas

- [x] Add strict Core types/parsers for
  `lpc-toolkit.asset-pack-conflict.v1` and bounded conflict diagnostics.
- [x] Normalize pack snapshots, target keys, contenders, source/credit/license
  evidence, compatibility evidence, and provenance references deterministically.
- [x] Compute stable `conflictId` and contender IDs from canonical semantic
  projections only; exclude paths, timestamps, discovery order, raw prompts,
  credentials, and payload bytes. The environment-agnostic Core exposes the
  canonical digest input; the Node CLI owns SHA-256 calculation and verifies
  the supplied `conflictId`.
- [x] Distinguish equivalent same-digest contenders from true semantic/output,
  ownership, credit, replacement, and compatibility conflicts.
- [x] Reject unknown fields, duplicate contenders, malformed digests, unsafe
  logical paths, unsupported versions, unbounded records, and missing evidence.

**Task 1 verification record:**

- Commits: `e02c1b2e78a8c443fd1e1633fc8137175966dbcd`, `7ac145cb09f3c32b56671f601edc03c447a6e80e`.
- Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-conflict.test.ts` PASS (8 tests); `rtk pnpm --filter @lpc-toolkit/core typecheck` PASS.

**Verification record:** record the full implementation commit and exact Core
test/typecheck commands with PASS/FAIL after completion.

### 2. Implement explicit precedence and compatibility policy

- [x] Add the versioned policy projection and supported outcomes:
  `retain-current`, `select-contender`, `merge-disjoint`, and `decline`.
- [x] Ensure trust/signature/provenance/compatibility evidence filters
  eligibility but never ranks or selects an otherwise eligible contender.
- [x] Require exact user selection for every target; refuse incomplete,
  duplicate, ineligible, ambiguous, or stale selection records.
- [x] Parse pack semver, minimum CLI, required capability, base definition/credit
  digest, and D4 trust evidence without weakening them; keep the current
  registry as a downstream read-only authority.
- [x] Prove pack `replaces` declarations are intent evidence only and cannot
  authorize an unconfirmed overwrite.

**Task 2 verification record:**

- Commits: `e02c1b2e78a8c443fd1e1633fc8137175966dbcd`, `7ac145cb09f3c32b56671f601edc03c447a6e80e`, `2d82c2ca610f90a0ef7b142ae0346c9c2d94048d`, `6406ccbf3340d7c6b69c963dccfc73e0316e6b16`.
- Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-conflict.test.ts` PASS (9 tests); `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-conflict.test.ts` PASS (4 tests); `rtk pnpm --filter @lpc-toolkit/core typecheck` PASS.

**Verification record:** record policy identity, compatibility fixtures, exact
Core tests/typecheck, and PASS/FAIL.

### 3. Implement deterministic merge and attribution projection

- [x] Add strict `lpc-toolkit.asset-pack-resolution.v1` projection and canonical
  resolution digest.
- [x] Merge only disjoint digest-bound semantic fields against the same base;
  require explicit selection for different output bytes.
- [x] Coalesce same-result contenders only when all attribution/license evidence
  is compatible and every contributing reference is retained.
- [x] Refuse incomplete attribution, changed baselines, ownership reassignment,
  missing source evidence, changed baselines, and unsafe merge scopes.
- [x] Sort pack IDs, versions, logical paths, assets, consumers, credits,
  licenses, and provenance references deterministically.
- [x] Preserve source/credit/license/acknowledgement mappings for every output
  field and keep D1/D2/D4/D5 evidence as digest-bound references.

**Task 3 verification record:**

- Commits: `e02c1b2e78a8c443fd1e1633fc8137175966dbcd`, `2d82c2ca610f90a0ef7b142ae0346c9c2d94048d`, `6406ccbf3340d7c6b69c963dccfc73e0316e6b16`.
- Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-conflict.test.ts` PASS (9 tests); `rtk pnpm --filter @lpc-toolkit/core typecheck` PASS; D2 `d2EvidenceDigests` are retained as evidence only and never used for precedence.

**Verification record:** record deterministic merge, attribution, and refusal
tests plus strict typecheck with PASS/FAIL.

### 4. Add explicit CLI inspect/resolve/recover seams

- [x] Add the smallest command/help/argument surface for `asset conflict
  inspect`, `resolve`, and `recover`.
- [x] Make `inspect` read-only and bounded to explicit allowed roots.
- [x] Require exact conflict ID, baseline digest, complete selection record,
  compatible evidence, and `--confirm` before D6 staging mutation.
- [x] Write only session/workspace-owned resolution candidates and
  `lpc-toolkit.asset-pack-conflict-audit.v1` receipts; never write canonical
  source or a release archive.
- [x] Return stable JSON/human status, refusal, mutation, and one-next-action
  fields without absolute paths or raw payloads in portable records.
- [x] Implement exact resume/discard recovery, stale detection, tamper
  detection, idempotent replay, and protected-root containment.

**Task 4 verification record:**

- Commits: `7ac145cb09f3c32b56671f601edc03c447a6e80e`, `bb9d7990d5a41f21265c191fc7f770c94eb030f1`.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-conflict.test.ts` PASS (4 tests); `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-json.test.ts` PASS (95 tests); `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-conflict.test.ts command-spec.test.ts main-json.test.ts` PASS (99 tests); `rtk pnpm --filter @lpc-toolkit/cli typecheck` PASS.

**Verification record:** record full CLI implementation commit, focused public
argv tests, typecheck, help tests, and PASS/FAIL.

### 5. Integrate D1, D2, D4, D5, and existing release boundaries

- [x] Keep D1 source transformation evidence behind a future reviewed/versioned
  `cross-pack-merge` capability; D6 does not extend the existing D1 parser, and
  its staged receipt is not formal release input.
- [x] Treat D2 provider result/refusal as optional evidence only, never as
  authorship, precedence, trust, consent, or approval. D2 evidence is carried
  by bounded `d2EvidenceDigests` references.
- [x] Treat D4 archive/signature/trust/provenance evidence as eligibility input
  only; tests use fake local evidence and never mutate external distribution.
- [x] Treat D5 candidate/operation/contract/provider evidence as unimported
  contender evidence until the existing candidate import authority validates it.
- [x] Leave validation, attributed preview, human review, release declaration,
  archive, distribution, and install as the existing downstream authorities.
- [x] Prove unchanged v1 archive/manifest/install/plugin behavior with regression
  tests and protected source/registry/output sentinels.

**Task 5 verification record:**

- Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-conflict.test.ts asset-pack-schema.test.ts asset-pack-compile.test.ts asset-pack-validation.test.ts asset-release-provenance-schema.test.ts asset-authoring-intelligence.test.ts asset-provider-schema.test.ts asset-provider-provenance.test.ts asset-distribution-schema.test.ts asset-distribution-trust.test.ts` PASS (10 files, 127 tests); the full `rtk pnpm verify` regression suites PASS; `rtk pnpm check:boundaries` PASS.

**Verification record:** record cross-boundary tests, existing regression tests,
and exact PASS/FAIL commands.

### 6. Run TDD, packed acceptance, and recovery coverage

- [x] Run Core schema/identity/policy/merge tests with local fixtures.
- [x] Run CLI conflict command, response, receipt, stale, tamper, recovery,
  protected-root, and explicit-confirmation tests.
- [x] Run existing pack compile/state/registry/transaction/validation/preview,
  D1, D2, D4, and D5 regression suites.
- [x] Run the packed CLI acceptance flow through D6 inspect and explicit
  confirm/stage; return the existing import, validation, attributed preview,
  human review, and release gate as downstream next actions without invoking
  them or mutating their authorities.
- [x] Verify no test reads or writes `upstream/`, uses a real service, or
  mutates an external registry, key, marketplace, npm, or system-wide prefix.
- [x] Run strict typecheck, architecture boundaries, and package smoke without
  weakening any checker.

**Verification record:** record every exact command and PASS/FAIL result after
the implementation is complete.

- `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-conflict.test.ts` PASS (9 tests).
- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-conflict.test.ts` PASS (4 tests).
- Full existing regression: `rtk pnpm verify` PASS — Core 459 tests, presets 8, asset-pack-format 75, Web 867, CLI 1,286 passed / 1 skipped; all workspace typechecks PASS.
- `rtk pnpm --filter @lpc-toolkit/cli build` PASS (only normal Vite chunk/dynamic-import warnings).
- `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS (`Packed CLI install smoke test passed.`).
- No external service, registry, signing key, marketplace, npm publication, or `upstream/` mutation was used.

### 7. Complete the CLI documentation impact matrix

- [x] Reassess every CLI-sensitive surface before implementation handoff:
  help, CLI README, root README, landing, architecture, engineering,
  releasing, and plugin contract.
- [x] Update all surfaces marked `update` with inspect/resolve/recover examples,
  explicit selection/confirmation, refusal/recovery, attribution, version
  compatibility, D1–D5 boundaries, and no external mutation.
- [x] Record a concrete N/A reason for plugin if no plugin command/skill changes
  are made.
- [x] Run the live CLI documentation impact checker, not only its unit tests.
  - Verification: `rtk pnpm check:cli-docs-impact -- --base origin/main --head HEAD --body-file /private/tmp/d6-pr-body.md` PASS; `CLI documentation impact declaration is valid.`

**Final D6 documentation impact matrix:**

```text
help: update — add inspect, resolve, recover, selection, and refusal contract
cli-readme: update — document conflict records, commands, receipts, and gates
root-readme: update — explain explicit cross-pack conflict resolution workflow
landing: update — explain conflict review without implying an automatic winner
architecture: update — record conflict ownership and D1–D5 integration bounds
engineering: update — add local fixture and deterministic conflict verification
releasing: update — document compatibility, provenance, attribution, and release gates
plugin: N/A — D6 adds no plugin skill or plugin command contract
```

Documentation commit: `be51ac832faaf20ca874760b4a7a33d5eeac0392`.
Verification: `rtk pnpm verify:cli-docs-policy` PASS (19 tests); live impact
checker PASS with the PR body declaration.

### 8. Final verification and independent implementation PR handoff

- [x] Run the complete required repository verification from the D6
  implementation branch:

  ```text
  rtk pnpm verify
  rtk pnpm check:boundaries
  rtk pnpm verify:plugin
  rtk pnpm verify:cli-docs-policy
  rtk git diff --check
  ```
- Verification: `rtk pnpm verify` PASS; `rtk pnpm check:boundaries` PASS;
  `rtk pnpm verify:plugin` PASS (40 tests); `rtk pnpm verify:cli-docs-policy`
  PASS (19 tests); `rtk git diff --check` PASS.

- [x] Run the live CLI impact checker with the PR event/body declaration and
  record PASS/FAIL separately from `verify:cli-docs-policy`.
  - Verification: same live checker command PASS; this is separate from the 19-test policy suite.
- [x] Record the full hash of every implementation, documentation, plan, and
  handoff commit in this checked-in plan.
- [x] Create an independent D6 implementation branch and Draft PR; never merge
  automatically and never start another roadmap track from it.
  - PR: [#181](https://github.com/ochowei/lpc-toolkit-2026-1/pull/181), merged; head `f80c4a3300e920b603afd8671a5d6e5cd2cf8737`.
- [x] Wait for CI and user confirmation of the D6 implementation PR merge before
  marking D6 complete.
  - Merge: PR #181, merge commit `e92a623ea513ba90e2011ed7c6d55e2cb6a92b70`.
  - CI: workflow run #403 completed with conclusion `success`.
  - Plan closure: PR #182, merge commit `2fac94a1cda92b129639ae39342d291db9f33a3b`.

**Final implementation record:**

```text
Implementation branch: codex/issue-179-d6-cross-pack-conflict-implementation
Spec/plan PR: #180 merged as `327d11016391841b78d1dbfb939e774a87f69684`
Implementation PR: [#181](https://github.com/ochowei/lpc-toolkit-2026-1/pull/181) merged as `e92a623ea513ba90e2011ed7c6d55e2cb6a92b70`
Implementation commits: `2334ecd73ccce8d7a15de21793d8f02251bd5ec9`,
`e02c1b2e78a8c443fd1e1633fc8137175966dbcd`,
`7ac145cb09f3c32b56671f601edc03c447a6e80e`,
`8fc2d80315e3b1592c7428c3be60ff36acf67628`,
`2d82c2ca610f90a0ef7b142ae0346c9c2d94048d`,
`be51ac832faaf20ca874760b4a7a33d5eeac0392`,
`6406ccbf3340d7c6b69c963dccfc73e0316e6b16`,
`bb9d7990d5a41f21265c191fc7f770c94eb030f1`.
Spec/plan commits: `296cb4d5a71ab704d35ead3f71f8c0a78809d135` and
`8ddfafce6eaa24cc7214f9470c84769dcd1a1591`.
Checked-in implementation-plan commits: `a6410a3690233cdce124b57e0f1a44008c485bc9`
and `5cd203e26a38d4cad55508a57ca0de632ab7636a`, with the merged PR handoff
record at `f80c4a3300e920b603afd8671a5d6e5cd2cf8737` and plan closure commit
`e5da24c83f5aa3ffe1e2c0b1a17383eb1fe37bac`.
Verification: `rtk pnpm verify` PASS — Core 459 tests, presets 8,
asset-pack-format 75, Web 867, CLI 1,286 passed / 1 skipped; workspace
typecheck, boundaries, plugin 40 tests, CLI docs policy 19 tests, CLI build,
packed CLI install smoke, `rtk git diff --check`, and live CLI documentation
impact checker PASS. Live checker command:
`rtk pnpm check:cli-docs-impact -- --base origin/main --head HEAD --body-file
/private/tmp/d6-pr-body.md` → `CLI documentation impact declaration is valid.`
Implementation PR handoff is complete; CI workflow run #403 passed and the user
confirmed the merge.
Handoff: D6 is complete. All D6 implementation and plan records are merged;
there is no D7 roadmap track.
```

## Review questions

1. Is the conflict identity stable without paths, discovery order, timestamps,
   or provider/Agent preference?
2. Are equivalent same-digest contenders safely distinguishable from true
   output, ownership, credit, replacement, and compatibility conflicts?
3. Does every precedence decision require a complete user selection and exact
   baseline/contender digests?
4. Are disjoint merge rules deterministic and conservative when attribution or
   license authority differs?
5. Is D1’s new cross-pack provenance capability versioned rather than silently
   added to the current parser?
6. Do D2 provider records and D5 candidates remain evidence rather than
   authorship, precedence, import, or release authority?
7. Do D4 trust records filter eligibility without becoming an automatic winner?
8. Are stale/refused/tampered/recovered/discarded outcomes auditable and safe?
9. Do existing v1 archive, manifest, install, plugin, validation, preview,
   release, and architecture boundaries remain intact?

## Pre-implementation verification

The spec/plan review PR is documentation-only. Before opening it, run:

```text
rtk git diff --check
rtk rg -n "conflict identity|precedence|selection|merge|attribution|license|compatibility|refusal|recovery|audit|D1|D2|D4|D5|upstream" \
  docs/superpowers/specs/2026-08-06-cross-pack-conflict-resolution.md \
  docs/superpowers/plans/2026-08-06-cross-pack-conflict-resolution.md
```

Full product verification belongs to the later D6 implementation PR and must
not be reported as passing during this spec/plan review.

**Spec/plan review verification record:**

- `rtk git diff --check` PASS.
- `rtk rg -n "conflict identity|precedence|selection|merge|attribution|license|compatibility|refusal|recovery|audit|D1|D2|D4|D5|upstream" docs/superpowers/specs/2026-08-06-cross-pack-conflict-resolution.md docs/superpowers/plans/2026-08-06-cross-pack-conflict-resolution.md` PASS; all required D6 contract terms are present.
- `rtk pnpm verify:cli-docs-policy` PASS (19 tests); Task 8 later recorded the D6 implementation live checker PASS against the implementation diff and PR body.
