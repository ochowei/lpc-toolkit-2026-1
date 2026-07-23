# Task 9 Workbench State Evidence

## Scope

Implemented only the five Task 9 Web source modules and their five focused Web
test files. No Task 10 work, upstream/assets/cache/artist workspace changes,
dependencies, lockfiles, or plan edits were made.

The product models pure workbench phases/revisions/progress/recovery, latest-only
Worker client responses, immutable accepted edit replay with original and
replacement `File` references, Overview/Credits/Advanced manifest projections,
exact warning acknowledgement governance, formal release blockers/version
policy, and a React orchestration hook that owns one disposable Worker client.

## TDD evidence

RED was recorded with the exact requested command after the package preparation
hooks completed:

```text
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts
```

Result: FAIL, 5 test suites failed and 0 tests collected because all five new
source modules were intentionally absent. The initial sandboxed invocation
stopped earlier at the existing `tsx` preparation hook with `listen EPERM`; the
same command was rerun with the required execution approval to obtain this
actual Vitest RED result.

GREEN was rerun with the same exact command:

```text
Test Files  5 passed (5)
Tests       18 passed (18)
```

## Verification

- Product commit: `7b04cba00054a3949cefeabd3ee3780fe2b8fcd3`
- `rtk pnpm --filter @lpc-toolkit/web run typecheck` — PASS
- `rtk pnpm check:boundaries` — PASS (`Architecture boundary check passed.`)
- Existing regression command:
  `rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-protocol.test.ts asset-pack-worker-session.test.ts asset-pack-format-conformance.test.ts`
  — PASS, 3 files and 24 tests

## Caveats

Task 10’s route/components/download UI remains intentionally untouched. The
hook/controller surface is node-testable and ready for that consumer; this
commit does not add UI integration or browser E2E coverage.

## Task 9 product-findings fix evidence

The final review findings were fixed without editing the checked-in Task 9
implementation plan. The controller now authoritatively computes and exposes
current formal blockers with preserved original upload metadata and release
fingerprint, refuses blocked formal assembly, clears assembly transient state,
and commits only Worker-accepted current-revision edits to the retry log. The
Worker request/response protocol and byte-map boundary are unchanged.

Product commit:

- `de67f40fe0791d4e2611fad5b3ca9d47a3df7dc8` — `fix(web): enforce workbench release governance`

TDD and verification:

- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/asset-pack-worker-client.test.ts test/asset-pack-manifest-editor.test.ts test/asset-pack-workbench.test.ts test/asset-pack-release.test.ts test/use-asset-pack-workbench.test.ts` — RED: 6 intended regression failures before the fix; final GREEN: 5 files, 26 tests passed.
- `rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts` — PASS: 5 files, 26 tests. The first sandboxed attempt was blocked by the existing `tsx` IPC pipe; the exact command passed with approved escalation after `prepare-assets` reported a cache hit.
- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/asset-pack-worker-protocol.test.ts test/asset-pack-worker-session.test.ts test/asset-pack-format-conformance.test.ts` — PASS: 3 files, 24 Task 8 regression tests.
- `rtk pnpm --filter @lpc-toolkit/web run typecheck` — PASS.
- `rtk pnpm check:boundaries` — PASS.
- `rtk git diff --check` — PASS.

Scope check: no Task 10 files, plan files, dependencies, `upstream/`, checked-in
assets, cache, or artist sources were changed.

## Remaining Task 9 product-finding fix evidence

The final workbench review findings were fixed without editing the checked-in
Task 9 implementation plan. Opening and retry now expose a non-empty
`missing-candidate` formal blocker until a current Worker revision exists;
unsafe uploads retain `unsafe-archive` through formal assembly attempts; and
`ready` remains exactly equivalent to an empty blocker list. Stale but
Worker-accepted session replies are retained as ordered replay edits while the
visible workbench remains latest-only, so concurrent manifest/source/remove
requests replay contiguously after a crash.

Product commit:

- `747af08b309d5cef5aafcaf822bb94f7a1b03a02` — `fix(web): close Task 9 workbench review findings`

TDD and verification:

- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/asset-pack-workbench.test.ts test/use-asset-pack-workbench.test.ts` — RED: 5 intended regression failures before the fix; final GREEN: 2 files, 18 tests.
- `rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts` — PASS: 5 files, 30 tests.
- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/asset-pack-worker-protocol.test.ts test/asset-pack-worker-session.test.ts test/asset-pack-format-conformance.test.ts` — PASS: 3 files, 24 Task 8 regression tests.
- `rtk pnpm --filter @lpc-toolkit/web run typecheck` — PASS.
- `rtk pnpm check:boundaries` — PASS.
- `rtk git diff --check` — PASS.

Scope check: product commit contains only the five requested Web source/test
files. No Task 10 files, plan files, dependencies, `upstream/`, checked-in
assets, cache, or artist sources were changed.

## Undiagnosed Worker failure formal-gate fix evidence

The remaining Important finding is fixed without editing the checked-in Task 9
implementation plan. A Worker `error` event without a diagnostic now moves a
ready session into `failed` with a deterministic `worker-failed` formal blocker;
the controller honors that failed-state blocker before attempting formal
assembly. Diagnostic failures still retain their existing diagnostics, and
retry continues to replay the preserved accepted edits.

Product commit:

- `ccaf745e950224eddfc45d113a45415a1edc95cb` — `fix(web): block formal assembly after worker failure`

TDD and verification:

- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/use-asset-pack-workbench.test.ts` — RED: 1 intended regression failure (`formalBlockers` remained empty after the undiagnosed Worker error); final GREEN: 1 file, 9 tests.
- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/asset-pack-worker-client.test.ts test/asset-pack-manifest-editor.test.ts test/asset-pack-workbench.test.ts test/asset-pack-release.test.ts test/use-asset-pack-workbench.test.ts` — PASS: 5 files, 31 tests.
- `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/asset-pack-worker-protocol.test.ts test/asset-pack-worker-session.test.ts test/asset-pack-format-conformance.test.ts` — PASS: 3 files, 24 Task 8 regression tests.
- `rtk pnpm --filter @lpc-toolkit/web run typecheck` — PASS.
- `rtk pnpm check:boundaries` — PASS.
- `rtk git diff --check` — PASS.

Scope check: product commit contains only the Task 9 Web gate/controller and
regression-test changes. No Task 10 files, plan files, dependencies,
`upstream/`, checked-in assets, cache, or artist sources were changed.
