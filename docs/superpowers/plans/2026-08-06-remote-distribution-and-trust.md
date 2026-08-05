# D4 — Remote Distribution and Trust Implementation Plan

> **For agentic workers:** Do not implement this plan until the D4
> specification, this plan, and the public TDD seams have been reviewed and
> confirmed. A merged spec/plan PR authorizes only local product work with
> fake adapters. It does not authorize real registry, marketplace, key,
> global-install, npm, tag, or external-service mutation.

**Goal:** Implement the reviewed [D4 Issue #173](https://github.com/ochowei/lpc-toolkit-2026-1/issues/173) remote distribution and trust boundary under roadmap [Issue #153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153), preserving formal archive compatibility and existing human/attribution/release authorities.

**Base:** `origin/main` at `dd6379dabbabb8728f6a3ebf69b775977bf89f72`, the merge commit for D3 implementation PR #172. Normative specification: [`2026-08-06-remote-distribution-and-trust.md`](../specs/2026-08-06-remote-distribution-and-trust.md).

**Spec/plan branch:** `codex/issue-173-d4-remote-distribution-trust`.

**Implementation branch:** create a separate `codex/issue-173-d4-remote-distribution-trust-implementation` branch only after this review PR is merged and the user confirms the public seams.

**Implementation PR:** separate D4 implementation PR; do not combine with D5 or D6.

## Global constraints

- Use pnpm and prefix every repository command with `rtk`.
- Strict TypeScript only; do not add `any`, a dependency, backend, auth
  service, network client, or architecture exception without explicit
  approval.
- Do not modify or initialize `upstream/`, checked-in assets, the verified base
  cache, source packs, generated overlays, unowned output, or prior release
  evidence except through the existing explicit local authorities.
- Do not change existing `asset-pack.v1` archive bytes, strict manifest shape,
  ordinary inspect/install behavior, local registry semantics, transaction
  recovery, attribution, matching `CREDITS.csv`, consent, validation,
  preview, release gates, D1 provenance, D2 provider receipts, D3 handoff, or
  plugin behavior.
- No real registry, marketplace, key creation/registration/rotation/revocation,
  signing account, global system prefix, npm publish, tag/release mutation,
  OIDC/Trusted Publisher change, auth credential, or external service call.
- Tests use local archives, fake registries/marketplaces/publishers,
  deterministic test-only signer/verifier adapters, temporary trust policies,
  and temporary consumer prefixes. Test keys are fixtures, not secrets and
  are never published or reused as credentials.
- A signature proves only that an authorized key signed exact canonical bytes.
  It never supplies attribution, license authority, visual acceptance,
  release declaration, consent, or provider trust.
- Every completed task must update this plan, record the full related commit
  hash, and record exact PASS/FAIL commands before the next task starts.

## Review gate and public TDD seams

The user must review and merge this docs-only spec/plan PR before product-code
implementation. The implementation branch must be recreated from the merged
`origin/main`; no implementation work may be hidden on this docs branch.

The following public seams are proposed for review:

1. **Core distribution contract seam** — strict parsers and canonical
   projections for `lpc-toolkit.asset-distribution-release.v1`, trust policy,
   and verification receipt. Tests use independent fixed digest/signature
   fixture expectations and do not call the implementation helper to generate
   their own expected values.
2. **Trust adapter seam** — a pure decision input plus injected signer/verifier
   and trust-policy adapter. Tests use deterministic fake signatures, key
   fingerprints, namespace policies, rotation, revocation, and refusal states;
   no private-key creation or crypto service is invoked.
3. **Registry/marketplace transport seam** — public CLI/application seam with
   fake adapters returning immutable records, exact archive bytes, mirror
   metadata, listings, conflicting versions, and tampered responses. Tests
   assert verification happens before staging or install.
4. **Global-prefix/install seam** — exact public argv/response around an
   explicit local temporary consumer prefix that delegates to the existing
   transactional install authority. Tests assert no-confirm/no-mutation,
   exact idempotency, downgrade/replacement policy, attribution, and recovery.
5. **npm publication/post-publication seam** — local `pnpm pack` tarball and
   fake publisher/receipt adapter. Tests bind package name/version/tarball
   integrity and verify a clean-prefix result without `npm publish`.
6. **Rollback/tamper/audit seam** — fake remote state plus bounded local
   verification receipt. Tests assert immutable prior evidence, non-destructive
   withdrawal/quarantine, explicit prior-version selection, and exact
   recovery/audit diagnostics.
7. **Response/capability/help seam** — `runCli`/capabilities, JSON/human
   projections, help, and release documentation. Tests assert bounded fields,
   stable refusals, privacy redaction, and no claim of external publication.

## CLI documentation impact matrix

D4 adds CLI/release trust behavior and must reassess every owned documentation
surface before implementation handoff:

```text
help: update
cli-readme: update
root-readme: update
landing: N/A — D4 v1 is CLI/release trust work and adds no Web distribution UI
architecture: update
engineering: update
releasing: update
plugin: N/A — D4 adds no plugin capability, skill, or command
```

The implementation PR must include the matching PR-body declaration for every
changed surface. If a Web surface or plugin capability becomes necessary, stop
and update this matrix and the spec before implementation.

## Vertical implementation tasks

### 0. Review gate and local fixture boundary

- [x] Link Issue #173 to roadmap #153 and confirm D3 merge base.
      - Issue: https://github.com/ochowei/lpc-toolkit-2026-1/issues/173
      - Verification: `rtk gh issue view 173 --repo ochowei/lpc-toolkit-2026-1 --json number,url,title,state,labels` PASS; D3 merge base is `dd6379dabbabb8728f6a3ebf69b775977bf89f72`.
- [x] Review this spec, this plan, all seven public seams, the mutation
      approval table, and the CLI impact matrix.
- [x] After user confirmation, create the separate implementation branch from
      merged `origin/main`.
      - Review PR: https://github.com/ochowei/lpc-toolkit-2026-1/pull/174
      - Merge commit: `8a3e445b33628b030c17038f8a8d43d15278ea51`
      - Branch: `codex/issue-173-d4-remote-distribution-trust-implementation`
      - Base: `8a3e445b33628b030c17038f8a8d43d15278ea51`
      - Verification: `rtk gh pr view 174 --repo ochowei/lpc-toolkit-2026-1 --json number,url,state,isDraft,mergedAt,mergeCommit,headRefName,baseRefName,title` PASS (`MERGED`, `isDraft: false`); `rtk git show -s --format=%H%n%P%n%s origin/main` PASS; `rtk git status --short --branch` PASS.
- [ ] Add local-only formal archive, D1 provenance, D2 provider, D3 handoff,
      trust policy, release record, fake registry, fake marketplace, fake npm
      receipt, tampered record, revoked-key, conflict, withdrawal, and
      temporary-prefix fixtures. Assert no credentials/private paths/payloads
      and no `upstream/` access.
- [x] Record the review PR merge/base commit before product TDD begins.
      - Product implementation authorization: user confirmed the merge of PR #174.

### 1. Core strict distribution and signed projection contract (red → green)

- [x] Add strict, bounded types/parsers for the distribution release record and
      signed projection.
- [x] Normalize namespace/pack/version identity, archive kind, byte length,
      archive/manifest/content/source/credits/license/provenance digests,
      capabilities, policy ID, key ID, algorithm, and signature envelope.
- [x] Add canonical JSON projection/digest helpers that exclude mutable
      transport/marketplace/npm observations and remain stable under property
      reordering and collection order.
- [x] Add refusal predicates for unknown fields, duplicate digest paths,
      traversal/absolute paths, unsupported versions, missing digest evidence,
      non-formal archive kinds, and oversized records.
- [x] Test fixed independent canonical bytes/digests, exact archive identity
      bindings, privacy bounds, and preserve the existing v1 archive boundary.
- [x] Verify Core remains environment-agnostic.
      - Commit: `6283026fcbce6e3a9b3e3833d3a42ada2c7d8472`
      - Verification: `rtk pnpm --filter @lpc-toolkit/core exec vitest run test/asset-distribution-schema.test.ts` FAIL (red: `parseAssetDistributionRelease is not a function`); `rtk pnpm --filter @lpc-toolkit/core exec vitest run test/asset-distribution-schema.test.ts` PASS (4 tests); `rtk pnpm --filter @lpc-toolkit/core exec tsc -p tsconfig.json --noEmit` PASS; `rtk git diff --check` PASS.

### 2. Trust policy, signing, verification, and key lifecycle (red → green)

- [ ] Add injected signer/verifier and trust-policy interfaces without making
      Core or public code discover keys, create keys, or call a network.
- [ ] Evaluate algorithm allowlists, namespace authorization, key fingerprint,
      valid-from/until, rotation/grandfathering, revocation, compromise, and
      policy digest deterministically.
- [ ] Verify signatures only over canonical release bytes and distinguish
      `untrusted`, `signature-invalid`, `key-revoked`, and `namespace-unauthorized`.
- [ ] Test deterministic fake signatures, unknown keys, mismatched public-key
      fingerprints, disallowed algorithms, rotation, revocation, expiry,
      policy changes, and no private-key persistence.
- [ ] Record full implementation commit and exact focused tests before Task 3.

### 3. Fake registry and marketplace transport (red → green)

- [ ] Add a CLI-owned adapter boundary for retrieving immutable records and
      exact archive bytes from a registry fixture; transport metadata remains
      non-authoritative.
- [ ] Add marketplace listing/reference fixtures that point to an exact
      namespace/version/archive digest without becoming a signing or license
      authority.
- [ ] Verify capture-before-trust, record/archive mismatch detection, same
      version/different digest conflicts, mirror disagreement, listing digest
      drift, withdrawn status, and no overwrite of prior evidence.
- [ ] Test registry/marketplace adapters with no live HTTP, auth, account,
      backend, or remote mutation.

### 4. Provenance, attribution, license, and release authorization binding
    (red → green)

- [ ] Reuse exact formal archive inspection and existing `CREDITS.csv`/license
      authorities; bind their digests without synthesizing authors or licenses.
- [ ] Verify optional D1 provenance receipt against the exact archive,
      manifest, content, source, preview, and release evidence digests.
- [ ] Preserve D2 provider/result/refusal evidence as bounded provenance only;
      preserve D3 handoff as local transfer evidence only.
- [ ] Require existing validation, preview acceptance, explicit release
      declaration, and human approval before a release record can be marked
      publishable/trusted for an external mutation.
- [ ] Test missing/changed credits, contradictory/unsupported licenses,
      provenance mismatch, provider-as-author refusal, and signature-without-
      approval refusal.

### 5. Global installation and compatibility (red → green)

- [ ] Add a local-only explicit global-prefix/consumer operation that delegates
      payload publication, receipt, attribution, and transaction recovery to
      the existing install authority.
- [ ] Require exact record/archive selection, successful trust/provenance/
      license/credit verification, initialized protected-prefix checks, and
      explicit `--confirm` before mutation.
- [ ] Refuse draft/untrusted/tampered/withdrawn/incompatible records, same
      version replacement, unsafe paths/symlinks, and automatic downgrade.
- [ ] Test repeated exact install as a verified no-op, explicit permitted
      downgrade, failed preflight with no mutation, interrupted staging,
      protected sentinels, old local v1 install, and matching `CREDITS.csv`.
- [ ] Never mutate a real OS-wide prefix in tests or infer that a temp prefix
      proves global installation.

### 6. npm package publication and post-publication verification (red → green)

- [ ] Add a local `pnpm pack`/tarball inspection seam for package name/version,
      package integrity, entrypoint/help/version behavior, release commit/tag
      evidence, and optional D4 asset-release binding.
- [ ] Add a fake publisher and fake npm/marketplace receipt adapter that can
      return success, metadata drift, integrity drift, version conflict, and
      unavailable states without `npm publish`.
- [ ] Verify a clean-prefix post-publication report is read-only and clearly
      distinguishes package transport/auth evidence from LPC archive trust.
- [ ] Test no token creation, no OIDC/Trusted Publisher mutation, no real
      registry access, and no accidental asset publication.

### 7. Tamper detection, withdrawal, rollback, recovery, and audit evidence
    (red → green)

- [ ] Add stable state/diagnostic projections for invalid, untrusted,
      tampered, conflict, withdrawn, recoverable, and verified outcomes.
- [ ] Model non-destructive withdrawal/quarantine and explicit selection of a
      prior verified immutable version; never delete, overwrite, retag, or
      mutate an external artifact in local code.
- [ ] Reuse existing local transaction claims/recovery for staging and
      consumer installation; preserve the old receipt and exact prior bytes on
      interruption or drift.
- [ ] Emit bounded, privacy-safe local verification/audit evidence containing
      exact digests, policy/key identifiers, decision, and recovery action.
- [ ] Test archive tamper, record tamper, key compromise, listing drift,
      failed publish/fetch/install, rollback selection, repeated recovery, and
      protected-path preservation.

### 8. Public responses, help, documentation, and capability gate

- [ ] Add public capability/schema identifiers only after Tasks 1–7 tests pass.
- [ ] Add exact inspect/verify/fetch/install/rollback/post-publication CLI
      response contracts only for approved local seams; no hidden publish path.
- [ ] Update help, CLI README, root README, architecture, engineering, and
      releasing docs; retain the landing/plugin N/A reasons unless the public
      scope changes.
- [ ] Reassess and record the complete CLI documentation impact matrix and
      live PR-body declaration.
- [ ] Test JSON/human wording, stable next actions, privacy redaction, explicit
      confirmation, old capabilities, and no claim of real publication.

### 9. Final verification and handoff

- [ ] Run focused Core/CLI/archive/response tests and all fake adapter suites.
- [ ] Run CLI typecheck/build and local packed acceptance using a tarball only.
- [ ] Run `rtk pnpm check:boundaries`.
- [ ] Run `rtk pnpm verify:plugin`.
- [ ] Run `rtk pnpm verify:cli-docs-policy` and the live CLI docs impact checker.
- [ ] Run `rtk pnpm verify` and `rtk git diff --check`.
- [ ] Record every exact command and PASS/FAIL result in this plan, including
      the explicit statement that no external mutation occurred.
- [ ] Create, push, and open the independent D4 implementation Draft PR only
      after all local verification passes; do not merge automatically.

## Spec/plan review record

- [x] D4 Issue created and linked to roadmap #153.
  - Issue: https://github.com/ochowei/lpc-toolkit-2026-1/issues/173
  - Verification: `rtk gh issue view 173 --repo ochowei/lpc-toolkit-2026-1 --json number,url,title,state,labels` PASS (`OPEN`, `enhancement`, `ready-for-agent`).
- [x] Spec/plan branch created from the merged D3 implementation.
  - Branch: `codex/issue-173-d4-remote-distribution-trust`
  - Base: `dd6379dabbabb8728f6a3ebf69b775977bf89f72`
  - Verification: `rtk git show -s --format=%H%n%P%n%s origin/main` PASS; `rtk git status --short --branch` PASS.
- [x] Added the D4 spec and separate implementation plan with registry,
      signing/verification, trust/key policy, marketplace, global install,
      npm, provenance/license, post-publication, rollback/tamper, human
      approval, and local-fake-only boundaries.
  - Commit: `937f63ff737a28affe53bf296993e462a8192c14`
  - Verification: `rtk git diff --check HEAD^ HEAD` PASS; `rtk rg -n "remote registr|signing|verification|marketplace|global installation|npm publication|trust policy|key lifecycle|post-publication|rollback|tamper|provenance|license|Issue #173|PR #172|Mutation approval table|CLI documentation impact" docs/superpowers/specs/2026-08-06-remote-distribution-and-trust.md docs/superpowers/plans/2026-08-06-remote-distribution-and-trust.md` PASS.
- [x] Pushed the spec/plan branch and opened the independent review Draft PR.
  - Branch: `codex/issue-173-d4-remote-distribution-trust`
  - PR: https://github.com/ochowei/lpc-toolkit-2026-1/pull/174 (Draft)
  - Verification: `rtk gh pr view 174 --repo ochowei/lpc-toolkit-2026-1 --json number,url,state,isDraft,headRefName,baseRefName,title` PASS (`OPEN`, `isDraft: true`, base `main`); `rtk git status --short --branch` PASS after push.
  - Initial CI snapshot: `CLI documentation impact` PASS; `Detect changes` PASS; `Vercel Preview Comments` PASS; `Unit tests` pending; Vercel deployment pending.
- [ ] User review and merge of the D4 spec/plan review PR.

## Mutation approval table

| Operation | D4 default verification behavior | Additional explicit approval required |
| --- | --- | --- |
| Key creation or private-key custody | Fake deterministic signer/verifier only | Maintainer/security approval and external key-management decision |
| Trust-root/namespace registration | Read a local fixture policy only | Maintainer authorization for the exact namespace/key policy |
| Registry publication or withdrawal | Fake registry receipt only | Exact real registry mutation approval |
| Marketplace listing/update | Fake listing reference only | Exact marketplace mutation approval |
| Global/system installation | Temporary local consumer prefix only | Explicit user confirmation and any real system-prefix authorization |
| npm publication | Local tarball and fake receipt only | Explicit npm publication approval, tag/credential/OIDC review |
| Signing a release | Deterministic test signature only | Explicit approved signer/key policy and release authorization |
| Rollback/withdrawal/retarget | Non-destructive local fixture state only | Exact external rollback/withdrawal approval; never delete/retag |

If any implementation step requires an operation in the right-hand column,
stop and ask one concrete approval question before proceeding.

## Plan record requirements

After each task:

- check the task item;
- add a concise implementation/verification note;
- record the full related commit hash;
- record exact `rtk` commands and PASS/FAIL results; and
- keep the implementation PR independent from D5 and D6.

The final handoff must state the current D4 task, all completed tasks,
commit/PR, exact verification results, next step, and any CI/merge blocker.

## Handoff criteria

D4 is not complete until its independent implementation PR has passed CI and
been merged. After merge, wait for explicit user confirmation before starting
D5. Do not start D5 from an open or unmerged D4 PR.
