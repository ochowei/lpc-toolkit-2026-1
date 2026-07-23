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
