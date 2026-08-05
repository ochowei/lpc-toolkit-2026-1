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

- [x] Add injected signer/verifier and trust-policy interfaces without making
      Core or public code discover keys, create keys, or call a network.
- [x] Evaluate algorithm allowlists, namespace authorization, key fingerprint,
      valid-from/until, rotation/grandfathering, revocation, compromise, and
      policy digest deterministically.
- [x] Verify signatures only over canonical release bytes and distinguish
      `key-untrusted`, `signature-invalid`, `key-revoked`, and
      `namespace-unauthorized`.
- [x] Test deterministic fake signatures, unknown keys, mismatched public-key
      fingerprints, disallowed algorithms, rotation, revocation, expiry,
      policy changes, and no private-key persistence.
- [x] Record full implementation commit and exact focused tests before Task 3.
      - Commits: `dbb130a7004d093f67511bc8441fffdabe0d4b74`, `820e23738b4bd87b70cd10e2ddb8bdeaff8ae36c`
      - Verification: `rtk pnpm --filter @lpc-toolkit/core exec vitest run test/asset-distribution-trust.test.ts` FAIL (red: `parseAssetDistributionTrustPolicy is not a function`); same command PASS (6 tests); `rtk pnpm --filter @lpc-toolkit/core exec tsc -p tsconfig.json --noEmit` PASS; `rtk git diff --check` PASS.

### 3. Fake registry and marketplace transport (red → green)

- [x] Add a CLI-owned adapter boundary for retrieving immutable records and
      exact archive bytes from a registry fixture; transport metadata remains
      non-authoritative.
- [x] Add marketplace listing/reference fixtures that point to an exact
      namespace/version/archive digest without becoming a signing or license
      authority.
- [x] Verify capture-before-trust, record/archive mismatch detection, same
      version/different digest conflicts, mirror disagreement, listing digest
      drift, withdrawn status, and no overwrite of prior evidence.
- [x] Test registry/marketplace adapters with no live HTTP, auth, account,
      backend, or remote mutation.
      - Commit: `3b9952177b61622d3b9c0f4b8540280cc0480212`
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-transport.test.ts` FAIL (red: module `../src/asset-distribution-transport.js` was missing); same command PASS (4 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; `rtk git diff --check` PASS.

### 4. Provenance, attribution, license, and release authorization binding
    (red → green)

- [x] Reuse exact formal archive inspection and existing `CREDITS.csv`/license
      authorities; bind their digests without synthesizing authors or licenses.
- [x] Verify optional D1 provenance receipt against the exact archive,
      manifest, content, source, preview, and release evidence digests.
- [x] Preserve D2 provider/result/refusal evidence as bounded provenance only;
      preserve D3 handoff as local transfer evidence only.
- [x] Require existing validation, preview acceptance, explicit release
      declaration, and human approval before a release record can be marked
      publishable/trusted for an external mutation.
- [x] Test missing/changed credits, contradictory/unsupported licenses,
      provenance mismatch, provider-as-author refusal, and signature-without-
      approval refusal.
      - Commit: `5df3bb1db8ed9e54f544490f22467828593ce6f2`
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-release-evidence.test.ts` FAIL (red: module `../src/asset-distribution-release-evidence.js` was missing); same command PASS (3 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; `rtk git diff --check` PASS.

### 5. Global installation and compatibility (red → green)

- [x] Add a local-only explicit global-prefix/consumer operation that delegates
      payload publication, receipt, attribution, and transaction recovery to
      the existing install authority.
- [x] Require exact record/archive selection, successful trust/provenance/
      license/credit verification, initialized protected-prefix checks, and
      explicit `--confirm` before mutation.
- [x] Refuse draft/untrusted/tampered/withdrawn/incompatible records, same
      version replacement, unsafe paths/symlinks, and automatic downgrade.
- [x] Test repeated exact install as a verified no-op, explicit permitted
      downgrade, failed preflight with no mutation, interrupted staging,
      protected sentinels, old local v1 install, and matching `CREDITS.csv`.
- [x] Never mutate a real OS-wide prefix in tests or infer that a temp prefix
      proves global installation.
      - Implementation: `installAssetDistributionToConsumerPrefix` accepts only the explicit temporary consumer-prefix mutation seam, performs exact capture/archive/trust/evidence/capability/preflight checks, requires confirmation, and delegates successful mutation to `installAssetPack`; system-wide prefixes are refused. Registry projection bytes remain compatible with existing v2 records: the reader accepts both the historical empty-ownership-row digest and the compiler-normalized digest with empty rows omitted, without rewriting the caller's registry.
      - Tests: the focused consumer-prefix suite covers no-confirm/no-mutation, system-wide refusal, trust/withdrawal/archive/capability refusal, explicit downgrade gating, exact install, repeated verified no-op, and matching generated credits. Existing install-authority regression coverage supplies same-version conflict, protected sentinels, old v1 registry handling, interrupted staging, rollback, and recovery evidence.
      - Commits: `22e8fed37382dceb98543791c7ae6584bd1ffc68`, compatibility fix `c07527d1d13426c2bcd8dbf085e570a78beb7c3e`.
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-global-install.test.ts` FAIL (initial actual-installer slice exposed an empty-pack registry compileDigest mismatch), then PASS (5 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-pack-install.test.ts test/asset-pack-registry.test.ts` PASS (44 tests); `rtk pnpm --filter @lpc-toolkit/core exec vitest run test/asset-pack-compile.test.ts` PASS (14 tests); after the full-suite regression exposed 41 legacy transaction failures, `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-pack-registry.test.ts test/asset-pack-transaction.test.ts` PASS (117 tests) with the compatibility fix; `rtk git diff --check` PASS.

### 6. npm package publication and post-publication verification (red → green)

- [x] Add a local `pnpm pack`/tarball inspection seam for package name/version,
      package integrity, entrypoint/help/version behavior, release commit/tag
      evidence, and optional D4 asset-release binding.
- [x] Add a fake publisher and fake npm/marketplace receipt adapter that can
      return success, metadata drift, integrity drift, version conflict, and
      unavailable states without `npm publish`.
- [x] Verify a clean-prefix post-publication report is read-only and clearly
      distinguishes package transport/auth evidence from LPC archive trust.
- [x] Test no token creation, no OIDC/Trusted Publisher mutation, no real
      registry access, and no accidental asset publication.
      - Implementation: `inspectAssetDistributionPackage` verifies local tarball bytes, npm-style SHA-512 integrity, strict package metadata/bin/ESM/license, packed entrypoint/help/version behavior, commit/tag/CI evidence, and optional D4 asset-release evidence without retaining payload bytes. `verifyAssetDistributionPackageReceipt` is read-only and accepts only bounded fake npm/fake marketplace receipt transport; package transport/auth evidence is separate from the optional LPC archive binding.
      - Tests: fake publisher and receipt-adapter seams cover one verified fake npm receipt, one verified fake marketplace receipt, metadata/integrity/version/unavailable refusal states, receipt digest drift, credential refusal, asset-binding drift, and accidental `.lpc-assets.zip`/private payload refusal. No production code invokes `npm`, a registry, network, token, OIDC, or Trusted Publisher mutation.
      - Commit: `94fcd3a94d7a923d126dec341493e6f3feb076d6`
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-package.test.ts` FAIL (red: package inspection module was missing), then PASS (8 tests); `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-package.test.ts test/asset-distribution-global-install.test.ts test/asset-distribution-release-evidence.test.ts test/asset-distribution-transport.test.ts` PASS (20 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/package-metadata.test.ts test/release-workflows.test.ts` PASS (23 tests); `rtk pnpm pack --pack-destination /private/tmp/lpc-d4-cli-pack` PASS; tarball-only `rtk pnpm exec node --input-type=module -e "...inspectAssetDistributionPackage(...)..."` PASS; `rtk pnpm run test:package` was intentionally interrupted with exit 130 because its internal `npm install` would access a real registry, outside the D4 fake-only boundary; `rtk git diff --check` PASS.

### 7. Tamper detection, withdrawal, rollback, recovery, and audit evidence
    (red → green)

- [x] Add stable state/diagnostic projections for invalid, untrusted,
      tampered, conflict, withdrawn, recoverable, and verified outcomes.
- [x] Model non-destructive withdrawal/quarantine and explicit selection of a
      prior verified immutable version; never delete, overwrite, retag, or
      mutate an external artifact in local code.
- [x] Reuse existing local transaction claims/recovery for staging and
      consumer installation; preserve the old receipt and exact prior bytes on
      interruption or drift.
- [x] Emit bounded, privacy-safe local verification/audit evidence containing
      exact digests, policy/key identifiers, decision, and recovery action.
- [x] Test archive tamper, record tamper, key compromise, listing drift,
      failed publish/fetch/install, rollback selection, repeated recovery, and
      protected-path preservation.
      - Implementation: `projectAssetDistributionOutcome` maps bounded diagnostic codes to stable states and next actions; `quarantineAssetDistributionRelease` preserves exact withdrawn/compromised evidence without deleting or rewriting it; `selectAssetDistributionRollbackRelease` requires one explicit prior verified identity and returns `mutation: none`; `recoverAssetDistributionConsumerPrefix` delegates confirmed local recovery to the existing transaction claim/recovery authority and returns privacy-safe audit evidence.
      - Tests: stable state projections, record/archive/listing drift, revoked key, version conflict, withdrawal quarantine, failed publish/fetch/install, explicit rollback selection, withdrawn rollback refusal, repeated recovery no-op, prior receipt binding, protected-path/no-mutation assertions, and existing transaction/doctor recovery suites.
      - Commit: `62b592d9a62a797e726e77c938fd3aa3fb66446c`
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-audit.test.ts` FAIL (red: audit module was missing), then PASS (12 tests); `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-audit.test.ts test/asset-pack-install.test.ts test/asset-pack-doctor.test.ts` PASS (82 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; `rtk git diff --check` PASS. No external artifact, registry, key, token, or system-wide prefix was mutated.

### 8. Public responses, help, documentation, and capability gate

- [x] Add public capability/schema identifiers only after Tasks 1–7 tests pass.
      - Implementation: advertised `asset-pack-remote-distribution.v1`, `asset-pack-signature-verification.v1`, `asset-pack-global-install.v1`, and `asset-pack-npm-publication.v1` only after the D4 local seams were green; added the additive release, verification, and trust-policy schema identifiers while retaining all prior capabilities and schemas.
      - Commit: `3eac9773f971462b29170c75e02eb25f5834f62a`
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-command.test.ts test/command-spec.test.ts test/main-json.test.ts test/main-human.test.ts` PASS (141 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; `rtk git diff --cached --check` PASS.
- [x] Add exact inspect/verify/fetch/install/rollback/post-publication CLI
      response contracts only for approved local seams; no hidden publish path.
      - Implementation: added `asset distribution` local fixture-only commands with bounded `lpc-toolkit.asset-distribution-verification.v1` JSON/human responses, stable state/next-action projections, deterministic verifier fixtures, fake package receipt verification, explicit temporary-prefix confirmation, and system-wide refusal. Responses redact absolute paths, raw archive bytes, credentials, and publication claims.
      - Commit: `3eac9773f971462b29170c75e02eb25f5834f62a`
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-command.test.ts` PASS (7 tests); `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/command-spec.test.ts test/main-json.test.ts test/main-human.test.ts` PASS (134 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; no registry, marketplace, key, token, network, npm, or system-wide prefix mutation.
- [x] Update help, CLI README, root README, architecture, engineering, and
      releasing docs; retain the landing/plugin N/A reasons unless the public
      scope changes.
      - Implementation: updated `packages/cli/README.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/ENGINEERING.md`, and `docs/RELEASING.md`; `packages/cli/src/command-spec.ts` owns the help update. Landing remains unchanged because D4 adds no Web distribution UI; plugin remains unchanged because D4 adds no plugin capability, skill, or command.
      - Commit: `cabb4bdc541b1b898d13f1403482784ad69210a6`
      - Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/readme-architecture-docs.test.ts test/landing-page.test.tsx test/landing-artifacts.test.ts` PASS (27 tests); `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-command.test.ts test/command-spec.test.ts test/main-json.test.ts test/main-human.test.ts` PASS (141 tests); `rtk git diff --cached --check` PASS.
- [x] Reassess and record the complete CLI documentation impact matrix and
      live PR-body declaration.
      - CLI docs impact matrix: `help: update`; `cli-readme: update`; `root-readme: update`; `landing: N/A — D4 v1 is CLI/release trust work and adds no Web distribution UI`; `architecture: update`; `engineering: update`; `releasing: update`; `plugin: N/A — D4 adds no plugin capability, skill, or command`.
      - PR body declaration: `CLI docs impact: updated`; `CLI docs surfaces: help, cli-readme, root-readme, architecture, engineering, releasing`; `CLI docs reason: landing and plugin are not applicable because D4 adds no Web distribution UI or plugin capability.` The matrix retains explicit landing/plugin N/A reasons; the live checker requires only changed surfaces in an `updated` declaration.
- [x] Test JSON/human wording, stable next actions, privacy redaction, explicit
      confirmation, old capabilities, and no claim of real publication.
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-command.test.ts test/command-spec.test.ts test/main-json.test.ts test/main-human.test.ts` PASS (141 tests); no absolute fixture path, raw archive bytes, credentials, real publication claim, or old capability/schema removal was observed.

### 9. Final verification and handoff

- [x] Run focused Core/CLI/archive/response tests and all fake adapter suites.
      - Verification: `rtk pnpm --filter @lpc-toolkit/core exec vitest run test/asset-distribution-schema.test.ts test/asset-distribution-trust.test.ts` PASS (10 tests); `rtk pnpm --filter @lpc-toolkit/core exec tsc -p tsconfig.json --noEmit` PASS; `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-distribution-command.test.ts test/asset-distribution-transport.test.ts test/asset-distribution-release-evidence.test.ts test/asset-distribution-global-install.test.ts test/asset-distribution-package.test.ts test/asset-distribution-audit.test.ts test/asset-pack-install.test.ts test/asset-pack-doctor.test.ts test/asset-pack-registry.test.ts` PASS (131 tests, 9 files); `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/asset-pack-registry.test.ts test/asset-pack-transaction.test.ts` PASS (117 tests); `rtk pnpm --filter @lpc-toolkit/cli exec tsc -p tsconfig.json --noEmit` PASS; `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/readme-architecture-docs.test.ts test/landing-page.test.tsx test/landing-artifacts.test.ts` PASS (27 tests).
- [x] Run CLI typecheck/build and local packed acceptance using a tarball only.
      - Verification: `rtk pnpm --filter @lpc-toolkit/cli build` PASS (existing Vite chunk/dynamic-import warnings only); `rtk mkdir -p /private/tmp/lpc-d4-cli-pack-final && rtk pnpm pack --pack-destination /private/tmp/lpc-d4-cli-pack-final` PASS; `rtk pnpm exec node --input-type=module -e 'import { execFileSync } from "node:child_process"; import { readFileSync } from "node:fs"; import { inspectAssetDistributionPackage } from "./packages/cli/dist/asset-distribution-package.js"; const tarball = "/private/tmp/lpc-d4-cli-pack-final/lpc-toolkit-cli-0.2.0.tgz"; const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim().split(/\r?\n/u).filter(Boolean); const entries = listing.map((entryPath) => entryPath.endsWith("/") ? { path: entryPath, kind: "directory" } : { path: entryPath, kind: "file", bytes: execFileSync("tar", ["-xOf", tarball, entryPath], { maxBuffer: 64 * 1024 * 1024 }) }); const help = execFileSync("node", ["./packages/cli/dist/index.js", "--help"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8"); const version = execFileSync("node", ["./packages/cli/dist/index.js", "--version"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8"); const result = inspectAssetDistributionPackage({ expected: { packageName: "@lpc-toolkit/cli", version: "0.2.0" }, tarballBytes: readFileSync(tarball), entries, entrypoint: { path: "package/dist/index.js", help, version }, releaseEvidence: { commit: "c07527d1d13426c2bcd8dbf085e570a78beb7c3e", tag: "v0.2.0", ciEvidenceDigest: "sha256:" + "f".repeat(64), assetReleaseEvidenceDigest: "sha256:" + "e".repeat(64) } }); if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); console.log("PASS " + result.inspection.package.name + " " + result.inspection.package.version + " " + result.inspection.tarball.integrity);'` PASS (`@lpc-toolkit/cli 0.2.0`, tarball-only bytes/entries and local entrypoint probe). `rtk pnpm run test:package` remains intentionally excluded because its internal `npm install` would access a real registry; the prior Task 6 record documents exit 130 and the D4 fake-only boundary.
- [x] Run `rtk pnpm check:boundaries`.
      - Verification: `rtk pnpm check:boundaries` PASS (`Architecture boundary check passed.`).
- [x] Run `rtk pnpm verify:plugin`.
      - Verification: `rtk pnpm verify:plugin` PASS (40 TAP tests; Codex plugin structure valid).
- [x] Run `rtk pnpm verify:cli-docs-policy` and the live CLI docs impact checker.
      - Verification: `rtk pnpm verify:cli-docs-policy` PASS (19 TAP tests); `rtk pnpm check:cli-docs-impact -- --base origin/main --head HEAD --body-file /private/tmp/d4-pr-body.md` PASS (`CLI documentation impact declaration is valid.`).
- [x] Run `rtk pnpm verify` and `rtk git diff --check`.
      - Verification: initial sandbox-only `rtk pnpm verify` FAIL (tsx `prepare-assets` could not create its IPC socket: `listen EPERM`; environment limitation, not a product assertion); authorized local-IPC `rtk pnpm verify` PASS (CLI 1,274 tests with 1 skipped, Web 867 tests, all repository verification stages green); `rtk git diff --check` PASS.
- [x] Record every exact command and PASS/FAIL result in this plan, including
      the explicit statement that no external mutation occurred.
      - Commit: `c07527d1d13426c2bcd8dbf085e570a78beb7c3e` records the empty-pack registry compatibility regression fix; this final plan record records the complete verification cycle.
      - Boundary statement: no real registry, marketplace, key creation/registration, signing service, auth credential, npm publication, tag/release mutation, external service, system-wide prefix, or `upstream/` mutation occurred. Tests used local fixtures/fakes and a temporary consumer prefix only.
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
