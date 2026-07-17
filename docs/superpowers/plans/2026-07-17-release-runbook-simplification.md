# Release Runbook Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `docs/RELEASING.md` with a shorter maintainer runbook that preserves every current release, authorization, and attribution contract.

**Architecture:** GitHub Actions workflows and CLI verifier scripts remain the executable release mechanics. `docs/RELEASING.md` remains the repository-owned human runbook, while the installed `releasing-lpc-toolkit` skill continues to coordinate version decisions, compatibility review, and just-in-time authorization.

**Tech Stack:** Markdown, GitHub Actions, pnpm, Vitest, Node.js release audit

## Global Constraints

- Do not modify `.github/workflows/cli-release-candidate.yml`, `.github/workflows/publish.yml`, CLI tag-verifier scripts, or `upstream/`.
- Do not change tag patterns, npm OIDC publication, platform coverage, package contents, attribution output, or approval requirements.
- Preserve `v<version>-rc.<number>`, `macos-latest`, `windows-latest`, `advisory`, and `never publishes npm` for `packages/cli/test/release-workflows.test.ts`.
- Keep `docs/RELEASING.md` as the repository-owned `releasing` surface required by the release audit and CLI documentation-impact policy.
- Prefix repository commands with `rtk` and use pnpm for repository verification.
- After each completed step, check its box and add the exact verification result; after the implementation commit, record its full hash in this plan.

## File Structure

- Modify: `docs/RELEASING.md` — thin human-facing maintainer runbook.
- Modify: `docs/superpowers/plans/2026-07-17-release-runbook-simplification.md` — checked execution notes, verification evidence, and implementation commit hash.
- Verify: `packages/cli/test/release-workflows.test.ts` — existing release documentation contract assertions; no source change expected.

---

### Task 1: Replace the release guide with the thin runbook

**Files:**
- Modify: `docs/RELEASING.md:1`
- Modify: `docs/superpowers/plans/2026-07-17-release-runbook-simplification.md`
- Test: `packages/cli/test/release-workflows.test.ts`

**Interfaces:**
- Consumes: `.github/workflows/cli-release-candidate.yml`, `.github/workflows/publish.yml`, `packages/cli/scripts/verify-rc-tag.mjs`, and `packages/cli/scripts/verify-release-tag.mjs` as executable contracts.
- Produces: A standalone maintainer runbook retaining the current local package, RC, stable publication, public verification, attribution, and immutable-state requirements.

- [x] **Step 1: Establish the focused documentation-contract baseline**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts
```

Expected: PASS for `packages/cli/test/release-workflows.test.ts`, including the tagged RC gate and advisory manual-run assertions. Record the exact test count and result beneath this step.

- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts` PASS — 1 test file, 4 tests.

- [x] **Step 2: Replace `docs/RELEASING.md` with the approved thin runbook**

Replace the complete file with:

````markdown
# CLI Release Guide

This is the repository-owned maintainer runbook for releasing
`@lpc-toolkit/cli`. The workflows and tag-verifier scripts are the executable
source of truth; this guide records the required gates and human decisions.

## Authority

Creating or pushing tags, publishing to npm, and changing registry or Trusted
Publisher settings require explicit maintainer authorization. Repository work
uses pnpm; npm is used only for authorized registry publication and public
install verification.

## Pre-Release Verification

Before creating an RC tag, exercise the unpublished package:

```sh
rtk pnpm --filter @lpc-toolkit/cli build
rtk node packages/cli/dist/index.js --help
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
```

Install the resulting tarball into a clean prefix. Verify `lpc-toolkit --help`
and one real asset-dependent command; the package must not require unpublished
workspace dependencies.

## Release Candidate

1. Set `packages/cli/package.json` to the intended version, including any
   prerelease suffix.
2. Verify a matching `v<version>-rc.<number>` tag with the repository RC tag
   verifier before pushing it.
3. Push the authorized RC tag and wait for the tag-triggered **CLI Release
   Candidate** workflow on both `macos-latest` and `windows-latest`.

The RC workflow validates the package but never publishes npm. A manually
dispatched run is advisory and does not replace a successful tagged run.

## Stable Publication

After the tagged RC passes, obtain separate authorization and push the matching
stable `v<version>` tag. The **Publish CLI** workflow verifies the release tag,
boundaries, types, tests, packed install, and real assets before publishing
through npm OIDC.

`v0.1.0` used a one-time manual bootstrap and remains excluded from the OIDC
publish step for historical compatibility. Current releases must not repeat
that bootstrap.

## Public Verification and Failure Handling

Install the exact published version into a clean prefix and verify:

- help and version output;
- a real catalog or render command using the pinned verified asset cache;
- metadata plus TXT and CSV credit files;
- independence from unpublished workspace packages; and
- equality between registry version, package version, and release tag.

Record workflow URLs, the published version, commands, and PASS/FAIL results.
Never delete or retarget a pushed tag, overwrite a published npm version,
change registry settings, or introduce an npm token to repair a failure. Stop
and record the immutable external state before proposing recovery.
````

After applying the replacement, record that only `docs/RELEASING.md` changed in this step.

- Implementation: Replaced only `docs/RELEASING.md`; workflows, verifier scripts, package metadata, plugin files, attribution paths, and `upstream/` were not changed.

- [x] **Step 3: Run focused and repository-wide verification**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts
rtk node /Users/william/.agents/skills/releasing-lpc-toolkit/scripts/audit-release.mjs --repo .
rtk pnpm verify
```

Expected:

- The focused release workflow test passes with the same test count as Step 1.
- The audit reports `releaseContracts.missingRequiredFiles: []`. In the managed Codex worktree it may exit nonzero solely with `blockers: ["detached_head"]`; that blocks an actual release transition, not this documentation-only change.
- `rtk pnpm verify` exits zero with all stages passing.

Record each exact command and PASS, FAIL, or expected-environment-blocker result beneath this step.

- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts` PASS — 1 test file, 4 tests.
- Audit: `rtk node /Users/william/.agents/skills/releasing-lpc-toolkit/scripts/audit-release.mjs --repo .` CONTRACT PASS — `releaseContracts.missingRequiredFiles` was empty; expected managed-worktree blockers were `detached_head` and `worktree_dirty` while the documentation edit was uncommitted.
- Verification: first `rtk pnpm verify` run FAIL — `packages/web/test/readme-architecture-docs.test.ts` required the contiguous phrase `CLI Release Candidate`, which the approved prose had split across a Markdown line break.
- Repair verification: `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` PASS — 1 test file, 21 tests; `rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts` remained PASS — 1 test file, 4 tests.
- Verification: final `rtk pnpm verify` PASS — boundaries, CLI docs policy (19 tests), plugin contract (17 tests), all typechecks, core (171 tests), presets (3 tests), CLI (355 passed, 1 skipped), and web (684 passed, 1 skipped).

- [x] **Step 4: Review scope and documentation impact**

Run:

```sh
rtk git diff --check
rtk git diff -- docs/RELEASING.md
rtk git status --short
```

Expected: no whitespace errors; the release guide is the only implementation file changed; workflow, verifier, package, plugin, attribution, and `upstream/` files are untouched.

- Scope: PASS — `rtk git diff --check` reported no errors; `docs/RELEASING.md` is the only implementation file, reduced from 100 to 66 lines. The execution plan contains only required progress evidence; all excluded paths remain untouched.

Record this final matrix beneath the step:

```text
help: N/A — no CLI help or command behavior changes
cli-readme: N/A — no public CLI usage changes
root-readme: N/A — no public quick-start changes
landing: N/A — no landing workflow changes
architecture: N/A — no package ownership or output-contract changes
engineering: N/A — no command or CI mapping changes
releasing: update — simplified the maintainer runbook without changing its contract
plugin: N/A — no installed skill or plugin contract changes
```

- [x] **Step 5: Commit the runbook simplification**

Run:

```sh
rtk git add docs/RELEASING.md
rtk git commit -m "docs: simplify CLI release runbook"
rtk git rev-parse HEAD
```

Expected: one focused documentation commit. Append the full hash printed by `rtk git rev-parse HEAD` beneath this step, together with the exact verification commands and their results.

- Commit: `907f75dd6b65b510d34e9c728bfe758bb680a22f`
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` PASS; `rtk pnpm verify` PASS; release audit required-file contract PASS with expected managed-worktree state recorded in Step 3.

- [x] **Step 6: Commit the completed plan record**

Run:

```sh
rtk git add docs/superpowers/plans/2026-07-17-release-runbook-simplification.md
rtk git commit -m "docs(plan): record release runbook verification"
```

Expected: the plan checkboxes, implementation commit hash, and verification evidence are committed without modifying the runbook implementation commit.

- Plan record: all checkboxes, the implementation commit hash, focused verification, full verification, audit result, and documentation-impact matrix are recorded here for the final plan-record commit.
