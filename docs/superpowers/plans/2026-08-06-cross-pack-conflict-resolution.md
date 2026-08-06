# D6 — Cross-pack Conflict Resolution Implementation Plan

**Status:** Proposed implementation plan — review and merge required before product implementation  
**Issue:** [#179](https://github.com/ochowei/lpc-toolkit-2026-1/issues/179)  
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Spec:** [D6 — Cross-pack Conflict Resolution](../specs/2026-08-06-cross-pack-conflict-resolution.md)  
**Base:** D5 implementation merge commit `a7442dd85cfc6ac07bf218032b7fb73e3ecf717f` ([PR #178](https://github.com/ochowei/lpc-toolkit-2026-1/pull/178))  
**Spec/plan branch:** `codex/issue-179-d6-cross-pack-conflict-spec`  
**Implementation branch:** to be created only after this spec/plan review PR is merged and the user confirms the review gate

This plan is limited to D6 cross-pack conflict identity, selection, merge,
compatibility, attribution, recovery, and audit contracts. It does not combine
D5 implementation work, D4 publication/trust mutation, or any later roadmap
track. No product code, public capability, dependency, registry, signing,
backend, auth, network service, or external mutation is permitted before this
spec/plan is reviewed and merged.

## Review gate and non-negotiable boundaries

- [ ] Review the D6 spec and this plan against Issue #179 and roadmap #153.
- [ ] Merge the independent D6 spec/plan review PR.
- [ ] Obtain explicit user confirmation before creating the D6 implementation
  branch or changing product code.
- [ ] Keep all work on `codex/` branches and leave `upstream/` untouched.
- [ ] Use only local pack/archive/registry/credit/trust/provenance/D5 fixtures
  and deterministic fakes in tests.
- [ ] Add no dependency, backend, auth, registry client, signing key,
  marketplace, npm publication, network call, or external service mutation.
- [ ] Keep TypeScript strict and add no `any`.
- [ ] Preserve attribution, licenses, acknowledgements, provenance, consent,
  validation, attributed preview, human review, release, trust, archive,
  install, and architecture boundaries.
- [ ] Keep `asset-pack.v1` archive, manifest, registry, install, plugin, and
  existing conflict refusal behavior unchanged unless the approved D6 contract
  and regression tests explicitly require a versioned extension.
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

- [ ] Confirm the existing Core pack schema/normalization, compile plan,
  `asset_path_conflict` diagnostics, registry ownership, transaction/recovery,
  D1 provenance, D2 provider evidence, D4 trust evidence, and D5 candidate
  operation authorities.
- [ ] Add checked-in local fixtures for equivalent contenders, disjoint
  patches, same-target byte conflicts, definition/credit/replacement conflicts,
  incompatible versions/capabilities, missing attribution, stale baselines,
  tampered receipts, D2 refusal/result evidence, D5 candidate evidence, and D4
  fake trust records.
- [ ] Define protected sentinels for source packs, current managed output,
  registry, archive, credits, unowned output, and `upstream/`.
- [ ] Write failing contract tests before implementation.

**TDD evidence:** fixture and contract tests must fail for missing D6 identity,
selection, merge, attribution, compatibility, and recovery behavior without
requiring a real registry, provider, or external service.

### 1. Implement the conflict identity and contender schemas

- [ ] Add strict Core types/parsers for
  `lpc-toolkit.asset-pack-conflict.v1` and bounded conflict diagnostics.
- [ ] Normalize pack snapshots, target keys, contenders, source/credit/license
  evidence, compatibility evidence, and provenance references deterministically.
- [ ] Compute stable `conflictId` and contender IDs from canonical semantic
  projections only; exclude paths, timestamps, discovery order, raw prompts,
  credentials, and payload bytes.
- [ ] Distinguish equivalent same-digest contenders from true semantic/output,
  ownership, credit, replacement, and compatibility conflicts.
- [ ] Reject unknown fields, duplicate contenders, malformed digests, unsafe
  logical paths, unsupported versions, unbounded records, and missing evidence.

**Verification record:** record the full implementation commit and exact Core
test/typecheck commands with PASS/FAIL after completion.

### 2. Implement explicit precedence and compatibility policy

- [ ] Add the versioned policy projection and supported outcomes:
  `retain-current`, `select-contender`, `merge-disjoint`, and `decline`.
- [ ] Ensure trust/signature/provenance/compatibility evidence filters
  eligibility but never ranks or selects an otherwise eligible contender.
- [ ] Require exact user selection for every target; refuse incomplete,
  duplicate, ineligible, ambiguous, or stale selection records.
- [ ] Reuse pack semver, minimum CLI, required capability, base definition/credit
  digest, current registry, and D4 trust checks without weakening them.
- [ ] Prove pack `replaces` declarations are intent evidence only and cannot
  authorize an unconfirmed overwrite.

**Verification record:** record policy identity, compatibility fixtures, exact
Core tests/typecheck, and PASS/FAIL.

### 3. Implement deterministic merge and attribution projection

- [ ] Add strict `lpc-toolkit.asset-pack-resolution.v1` parsing and canonical
  resolution digest.
- [ ] Merge only disjoint digest-bound semantic fields against the same base;
  require explicit selection for different output bytes.
- [ ] Coalesce same-result contenders only when all attribution/license evidence
  is compatible and every contributing reference is retained.
- [ ] Refuse incompatible credit/license authority, ownership reassignment,
  missing source evidence, changed baselines, and unsafe merge scopes.
- [ ] Sort pack IDs, versions, logical paths, assets, consumers, credits,
  licenses, and provenance references deterministically.
- [ ] Preserve source/credit/license/acknowledgement mappings for every output
  field and keep D1/D2/D4/D5 evidence as digest-bound references.

**Verification record:** record deterministic merge, attribution, and refusal
tests plus strict typecheck with PASS/FAIL.

### 4. Add explicit CLI inspect/resolve/recover seams

- [ ] Add the smallest command/help/argument surface for `asset conflict
  inspect`, `resolve`, and `recover`.
- [ ] Make `inspect` read-only and bounded to explicit allowed roots.
- [ ] Require exact conflict ID, baseline digest, complete selection record,
  compatible evidence, and `--confirm` before D6 staging mutation.
- [ ] Write only session/workspace-owned resolution candidates and
  `lpc-toolkit.asset-pack-conflict-audit.v1` receipts; never write canonical
  source or a release archive.
- [ ] Return stable JSON/human status, refusal, mutation, and one-next-action
  fields without absolute paths or raw payloads in portable records.
- [ ] Implement exact resume/discard recovery, stale detection, tamper
  detection, idempotent replay, and protected-root containment.

**Verification record:** record full CLI implementation commit, focused public
argv tests, typecheck, help tests, and PASS/FAIL.

### 5. Integrate D1, D2, D4, D5, and existing release boundaries

- [ ] Bind D1 source transformation evidence through a reviewed/versioned
  `cross-pack-merge` capability; do not silently expand the existing D1 parser.
- [ ] Treat D2 provider result/refusal as optional evidence only, never as
  authorship, precedence, trust, consent, or approval.
- [ ] Treat D4 archive/signature/trust/provenance evidence as eligibility input
  only; tests use fake local evidence and never mutate external distribution.
- [ ] Treat D5 candidate/operation/contract/provider evidence as unimported
  contender evidence until the existing candidate import authority validates it.
- [ ] Leave validation, attributed preview, human review, release declaration,
  archive, distribution, and install as the existing downstream authorities.
- [ ] Prove unchanged v1 archive/manifest/install/plugin behavior with regression
  tests and protected source/registry/output sentinels.

**Verification record:** record cross-boundary tests, existing regression tests,
and exact PASS/FAIL commands.

### 6. Run TDD, packed acceptance, and recovery coverage

- [ ] Run Core schema/identity/policy/merge tests with local fixtures.
- [ ] Run CLI conflict command, response, receipt, stale, tamper, recovery,
  protected-root, and explicit-confirmation tests.
- [ ] Run existing pack compile/state/registry/transaction/validation/preview,
  D1, D2, D4, and D5 regression suites.
- [ ] Run the packed CLI acceptance flow: inspect → select → confirm/stage →
  existing import → validate → attributed preview → human review/release gate.
- [ ] Verify no test reads or writes `upstream/`, uses a real service, or
  mutates an external registry, key, marketplace, npm, or system-wide prefix.
- [ ] Run strict typecheck, architecture boundaries, and package smoke without
  weakening any checker.

**Verification record:** record every exact command and PASS/FAIL result after
the implementation is complete.

### 7. Complete the CLI documentation impact matrix

- [ ] Reassess every CLI-sensitive surface before implementation handoff:
  help, CLI README, root README, landing, architecture, engineering,
  releasing, and plugin contract.
- [ ] Update all surfaces marked `update` with inspect/resolve/recover examples,
  explicit selection/confirmation, refusal/recovery, attribution, version
  compatibility, D1–D5 boundaries, and no external mutation.
- [ ] Record a concrete N/A reason for plugin if no plugin command/skill changes
  are made.
- [ ] Run the live CLI documentation impact checker, not only its unit tests.

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

### 8. Final verification and independent implementation PR handoff

- [ ] Run the complete required repository verification from the D6
  implementation branch:

  ```text
  rtk pnpm verify
  rtk pnpm check:boundaries
  rtk pnpm verify:plugin
  rtk pnpm verify:cli-docs-policy
  rtk git diff --check
  ```

- [ ] Run the live CLI impact checker with the PR event/body declaration and
  record PASS/FAIL separately from `verify:cli-docs-policy`.
- [ ] Record the full hash of every implementation, documentation, plan, and
  handoff commit in this checked-in plan.
- [ ] Create an independent D6 implementation branch and Draft PR; never merge
  automatically and never start another roadmap track from it.
- [ ] Wait for CI and user confirmation of the D6 implementation PR merge before
  marking D6 complete.

**Final implementation record:**

```text
Implementation branch: pending spec/plan review
Spec/plan PR: pending
Implementation PR: pending spec/plan review
Commits: pending
Verification: pending implementation
Handoff: D6 remains blocked until its independent spec/plan review is merged
and confirmed, then its independent implementation PR passes CI and merges.
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
- `rtk pnpm verify:cli-docs-policy` PASS (19 tests); the D6 implementation live checker remains pending until a CLI-sensitive implementation diff and PR body exist.
