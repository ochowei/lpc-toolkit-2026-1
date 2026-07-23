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
