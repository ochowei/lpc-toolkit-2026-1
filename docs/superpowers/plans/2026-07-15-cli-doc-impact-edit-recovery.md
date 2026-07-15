# CLI Documentation Impact Edit Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a corrected pull-request body create a fresh passing CLI documentation-impact check without rerunning unit, package, or E2E jobs.

**Architecture:** The existing CI workflow will explicitly subscribe to the `opened`, `synchronize`, `reopened`, and `edited` pull-request activity types. The documentation-impact job continues to run on every supported PR event, while the change-detection and unit entry jobs skip `edited`; their dependent package and E2E jobs therefore remain skipped. Repository integration tests lock this event contract, and the Engineering guide documents the recovery behavior.

**Tech Stack:** GitHub Actions YAML, Node.js 22, `node:test`, pnpm, RTK.

## Global Constraints

- Do not add dependencies, secrets, permissions, package-version changes, tags, or publication behavior.
- Preserve the existing behavior for `opened`, `synchronize`, `reopened`, and pushes to `main`.
- A PR-body `edited` event must run `CLI documentation impact` and must not run unit, package, or E2E work.
- Do not use a rerun of the old failed job as recovery; it retains the original event context.
- Prefix every repository terminal command with `rtk`.
- Do not modify or initialize `upstream/`.
- Documentation impact matrix:
  - `help`: N/A — CLI help behavior is unchanged.
  - `cli-readme`: N/A — CLI usage contract is unchanged.
  - `root-readme`: N/A — the public CLI workflow is unchanged.
  - `landing`: N/A — landing guidance is unchanged.
  - `architecture`: N/A — package boundaries are unchanged.
  - `engineering`: update — document PR-body edit recovery and CI isolation.
  - `releasing`: N/A — release and publication flow is unchanged.
  - `plugin`: N/A — plugin behavior and compatibility are unchanged.

---

### Task 1: Lock and implement PR-body edit recovery

**Files:**
- Modify: `scripts/check-cli-doc-impact.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ENGINEERING.md`

**Interfaces:**
- Consumes: GitHub `pull_request` activity type at `github.event.action` and the existing `GITHUB_EVENT_PATH` checker input.
- Produces: A workflow contract where `edited` runs only `cli-docs-impact`, while `changes` and `unit` skip and downstream `needs` jobs remain skipped.

- [x] **Step 1: Write the failing workflow integration assertions**

Extend the existing `repository integration` test in `scripts/check-cli-doc-impact.test.mjs` with these assertions:

```js
assert.match(
  workflow,
  /^  pull_request:\n    types: \[opened, synchronize, reopened, edited\]$/mu,
);
assert.match(
  workflow,
  /^  changes:\n    name: Detect changes\n    if: github\.event_name != 'pull_request' \|\| github\.event\.action != 'edited'$/mu,
);
assert.match(
  workflow,
  /^  unit:\n    name: Unit tests\n    if: github\.event_name != 'pull_request' \|\| github\.event\.action != 'edited'$/mu,
);
```

- [x] **Step 2: Run the policy test to verify RED**

Run:

```sh
rtk pnpm verify:cli-docs-policy
```

Expected: FAIL in `repository integration` because `.github/workflows/ci.yml` has a bare `pull_request:` trigger and no `edited` isolation guards.

Verification: `rtk pnpm verify:cli-docs-policy` FAIL as expected (18 passed,
1 failed; the workflow retained a bare `pull_request:` trigger).

- [x] **Step 3: Implement the minimal workflow event and isolation change**

Change the workflow trigger and the two entry jobs to this shape:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  cli-docs-impact:
    name: CLI documentation impact
    if: github.event_name == 'pull_request'

  changes:
    name: Detect changes
    if: github.event_name != 'pull_request' || github.event.action != 'edited'

  unit:
    name: Unit tests
    if: github.event_name != 'pull_request' || github.event.action != 'edited'
```

Leave the existing steps, permissions, `needs`, and downstream job conditions unchanged. In `docs/ENGINEERING.md`, add this recovery contract immediately after the live-check reproduction paragraph:

```markdown
Editing the pull request body creates a fresh documentation-impact check. That
`edited` event runs only this policy job; unit, package, and E2E jobs remain
skipped. Do not rerun the old failed job after correcting the declaration,
because the rerun retains its original pull-request event context.
```

- [x] **Step 4: Run focused verification to verify GREEN**

Run:

```sh
rtk pnpm verify:cli-docs-policy
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: PASS for the policy suite and documentation contract tests.

Implementation: Added the four explicit PR activity types, skipped the
change-detection and unit entry jobs for `edited`, and documented why correcting
the PR body creates a new check while rerunning an old job does not.

Verification: `rtk pnpm verify:cli-docs-policy` PASS (19 tests);
`rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts`
PASS outside the sandbox (21 tests; required `tsx` IPC access).

- [x] **Step 5: Commit the implementation**

Run:

```sh
rtk git diff --check
rtk git add scripts/check-cli-doc-impact.test.mjs .github/workflows/ci.yml docs/ENGINEERING.md
rtk git commit -m "fix(ci): rerun CLI docs check on PR edits"
rtk git rev-parse HEAD
```

Record the full implementation hash, RED result, and focused PASS results under this task.

Commit: `128fbfefb29f44612df20a73ea2de6ae738edcb0`

### Task 2: Verify, record, push, and observe the fresh PR run

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-cli-doc-impact-edit-recovery.md`

**Interfaces:**
- Consumes: The implementation commit from Task 1 and PR #123's already-correct declaration.
- Produces: A clean pushed branch and a new `synchronize` workflow run whose `CLI documentation impact` job passes.

- [x] **Step 1: Reassess documentation ownership and inspect the complete diff**

Confirm the final matrix remains exactly:

```text
help: N/A — CLI help behavior is unchanged
cli-readme: N/A — CLI usage contract is unchanged
root-readme: N/A — the public CLI workflow is unchanged
landing: N/A — landing guidance is unchanged
architecture: N/A — package boundaries are unchanged
engineering: update
releasing: N/A — release and publication flow is unchanged
plugin: N/A — plugin behavior and compatibility are unchanged
```

Run:

```sh
rtk git diff --check
rtk git status --short
rtk git diff HEAD~1 --stat
```

Expected: only the three Task 1 paths differ in the implementation commit, with no CLI product, release, or plugin path.

Review: The matrix remains unchanged with only `engineering: update`.
`rtk git diff --check` PASS; `rtk git status --short` showed only this expected
plan-record edit; `rtk git show --stat HEAD` confirmed the implementation commit
contains exactly `.github/workflows/ci.yml`, `docs/ENGINEERING.md`, and
`scripts/check-cli-doc-impact.test.mjs`. `rtk git diff HEAD~1 --stat` also
included this in-progress plan record, as expected for the working tree.

- [x] **Step 2: Run the common final verification gate**

Run:

```sh
rtk pnpm verify
```

Expected: PASS, including `verify:cli-docs-policy`, plugin checks, all typechecks, and all workspace tests.

Verification: `rtk pnpm verify` PASS (`verify:cli-docs-policy` 19 tests;
CLI 347 passed, 1 skipped; web 683 passed, 1 skipped; plugin checks and all
typechecks passed).

- [x] **Step 3: Record final evidence and commit the completed plan**

Check every completed item in this plan and add:

Add a concise implementation note, the full hash printed by the Task 1
`rev-parse`, and each exact verification command with its observed PASS or FAIL
result. Do not abbreviate the hash or replace an observed result with an
expectation.

Then run:

```sh
rtk git add docs/superpowers/plans/2026-07-15-cli-doc-impact-edit-recovery.md
rtk git commit -m "docs(plan): complete CLI docs edit recovery"
rtk git rev-parse HEAD
rtk git status --short --branch
```

Expected: the completed-plan commit succeeds and the worktree is clean.

Final evidence before the plan-record commit:

- Baseline: `rtk pnpm verify` PASS (`verify:cli-docs-policy` 19 tests; CLI
  347 passed, 1 skipped; web 683 passed, 1 skipped).
- RED: `rtk pnpm verify:cli-docs-policy` FAIL as expected (18 passed, 1
  failed) before the workflow change.
- Focused GREEN: `rtk pnpm verify:cli-docs-policy` PASS (19 tests).
- Documentation contract: `rtk pnpm --filter @lpc-toolkit/web test --
  readme-architecture-docs.test.ts` PASS (21 tests).
- Final gate: `rtk pnpm verify` PASS (`verify:cli-docs-policy` 19 tests; CLI
  347 passed, 1 skipped; web 683 passed, 1 skipped; plugin checks and all
  typechecks passed).
- Implementation commit: `128fbfefb29f44612df20a73ea2de6ae738edcb0`.

- [ ] **Step 4: Push the approved branch update**

Run:

```sh
rtk git push origin codex/cli-agent
```

Expected: fast-forward push succeeds and creates a new PR `synchronize` workflow run using the current PR body.

- [ ] **Step 5: Observe the new documentation-impact job**

Read the latest CI run for PR #123 and verify:

```text
CLI documentation impact: success
```

If the run is still active, poll without rerunning the old failed job. Report the new run/job URL and any residual failing checks without changing unrelated code.
