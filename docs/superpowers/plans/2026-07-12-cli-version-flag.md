# CLI Version Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add root-level `--version` and `-V` flags that print the installed CLI package version and exit successfully without preparing assets.

**Architecture:** Handle both version flags in `runCli` before general argument parsing, using the existing `CLI_VERSION` export backed by the packaged `package.json`. Extend existing CLI behavior tests and the help summary without changing the parser, command dispatch, or asset lifecycle.

**Tech Stack:** TypeScript strict mode, Node.js 22+, Vitest, pnpm workspaces

## Global Constraints

- Support both `lpc-toolkit --version` and `lpc-toolkit -V`.
- Print only the package version plus a trailing newline to stdout and return status `0`.
- Do not prepare runtime assets or write to stderr for either version flag.
- Read the version from the existing `CLI_VERSION`; do not duplicate the version or add a dependency.
- Only a first argument of `--version` or `-V` triggers root-level version output.
- List `lpc-toolkit --version` and `lpc-toolkit -V` on separate lines in root help.
- Do not modify `upstream/` or bypass attribution behavior.
- Run terminal commands with the `rtk` prefix and use pnpm.

---

### Task 1: Add root-level version flags

**Files:**
- Modify: `packages/cli/test/main-assets.test.ts`
- Modify: `packages/cli/test/smoke.test.ts`
- Modify: `packages/cli/src/main.ts`

**Interfaces:**
- Consumes: `CLI_VERSION: string` from `packages/cli/src/package-info.ts` and the existing `runCli(argv, io, dependencies): Promise<number>` interface.
- Produces: `runCli(['--version'], ...)` and `runCli(['-V'], ...)` output `${CLI_VERSION}\n` with status `0`, no stderr, and no asset preparation.

- [x] **Step 1: Write failing version behavior tests**

In `packages/cli/test/main-assets.test.ts`, import `CLI_VERSION` and add this test inside `describe('asset preparation dispatch', ...)` after the existing help test:

```ts
import { CLI_VERSION } from '../src/package-info.js';

it.each(['--version', '-V'])('prints the package version for %s without preparing assets', async (flag) => {
  const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
  const capture = captureIo(runtime.context.repoRoot);

  expect(await runCli([flag], capture.io, { prepareRuntimeAssets: prepare })).toBe(0);
  expect(prepare).not.toHaveBeenCalled();
  expect(capture.stdout).toEqual([`${CLI_VERSION}\n`]);
  expect(capture.stderr).toEqual([]);
});
```

In the existing `prints help for no command` test in `packages/cli/test/smoke.test.ts`, add:

```ts
expect(writes.join('')).toContain('lpc-toolkit --version');
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/main-assets.test.ts test/smoke.test.ts
```

Expected: FAIL because `--version` currently reaches unknown-command handling, `-V` is parsed as a command, and help does not list `lpc-toolkit --version`.

- [x] **Step 3: Implement the minimal version handling**

In `packages/cli/src/main.ts`, add the package version import:

```ts
import { CLI_VERSION } from './package-info.js';
```

Add this line to `HELP` before the command list:

```text
  lpc-toolkit --version
```

Immediately after the existing help early return in `runCli`, add:

```ts
if (argv[0] === '--version' || argv[0] === '-V') {
  io.stdout(`${CLI_VERSION}\n`);
  return 0;
}
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/main-assets.test.ts test/smoke.test.ts
```

Expected: both test files PASS with no warnings or errors.

- [x] **Step 5: Run package and boundary verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm check:boundaries
```

Expected: typecheck PASS, all CLI tests PASS, and boundary checks PASS. If the full CLI test requires localhost binding, rerun the same test command with approved elevated sandbox access.

- [x] **Step 6: Record completion and commit**

Update this task checkbox and append an implementation note, verification result, and the commit hash after committing. Stage only the three implementation files and this plan file, leaving unrelated working-tree files untouched:

```bash
rtk git add packages/cli/src/main.ts packages/cli/test/main-assets.test.ts packages/cli/test/smoke.test.ts docs/superpowers/plans/2026-07-12-cli-version-flag.md
rtk git commit -m "feat(cli): add version flags"
rtk git rev-parse --short HEAD
```

Implementation note: Added root-level `--version` and `-V` early returns using
the existing `CLI_VERSION`, documented `--version` in help, and added exact
output and asset-independence coverage for both flags.

- Commit: `2a43c494cdd4ab682709be0c626cc1c2fa51460f`
- Verification: focused tests PASS (41/41); CLI tests PASS (194 passed,
  1 skipped); TypeScript typecheck PASS; architecture boundary check PASS;
  direct CLI entry checks print `0.1.2` for both flags; independent code review
  reports no Critical, Important, or Minor issues.

---

### Task 2: Show the short version flag in help

**Files:**
- Modify: `packages/cli/test/smoke.test.ts`
- Modify: `packages/cli/src/main.ts`

**Interfaces:**
- Consumes: the existing `HELP` string returned by `runCli([], io)`.
- Produces: root help containing separate `lpc-toolkit --version` and
  `lpc-toolkit -V` invocation lines.

- [x] **Step 1: Write the failing help test**

In the existing `prints help for no command` test in
`packages/cli/test/smoke.test.ts`, add:

```ts
expect(writes.join('')).toContain('lpc-toolkit -V');
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/smoke.test.ts
```

Expected: FAIL because root help contains `lpc-toolkit --version` but does not
contain `lpc-toolkit -V`.

- [x] **Step 3: Add the short invocation to help**

In `packages/cli/src/main.ts`, add this line immediately after the existing
`lpc-toolkit --version` line in `HELP`:

```text
  lpc-toolkit -V
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/smoke.test.ts
```

Expected: the test file PASS with no warnings or errors.

- [x] **Step 5: Run package and boundary verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm check:boundaries
```

Expected: typecheck PASS, all CLI tests PASS, and boundary checks PASS. If the
full CLI test requires localhost binding, rerun the same test command with
approved elevated sandbox access.

- [x] **Step 6: Record completion and commit**

Commit the two implementation files first, then update this task with its
checkboxes, implementation note, commit hash, and verification result. Leave
unrelated working-tree files untouched:

```bash
rtk git add packages/cli/src/main.ts packages/cli/test/smoke.test.ts
rtk git commit -m "docs(cli): show version alias in help"
rtk git rev-parse --short HEAD
```

Implementation note: Added `lpc-toolkit -V` on its own line in root help and
extended the existing help smoke test to require the short invocation.

- Commit: `9205684ec219f46ef93caa01d1d4f836f61f80aa`
- Verification: TDD RED observed for the missing help text; focused smoke tests
  PASS (4/4); CLI tests PASS (194 passed, 1 skipped); TypeScript typecheck PASS;
  architecture boundary check PASS; direct CLI help output contains both
  version invocations; independent code review reports no Critical, Important,
  or Minor issues.
