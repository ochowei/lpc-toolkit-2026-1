# Task 13 Download and Unsaved-Work Report

Status: complete

## Implementation

- Added deterministic draft/formal archive filenames and a direct Worker-byte-to-`Blob` download handoff with `application/zip`; the main thread does not regenerate, edit, or persist archive bytes.
- Formal downloads recheck the current formal blockers and validate current revision, kind, and candidate digest metadata before calling `downloadBlob`.
- `latestDownloadedRevision` is recorded only after `downloadBlob` returns successfully. Stale Worker responses and download failures cannot mark work saved.
- Added draft/formal download controls. Draft confirmation lists the current error/warning diagnostics; controls stay disabled during assembly and expose Worker status through `aria-live`.
- Added `useUnsavedWorkGuard`: `beforeunload` is installed only when `currentRevision > (latestDownloadedRevision ?? 0)`, and the same injected confirm function gates App programmatic navigation and `popstate`. Cleanup removes listeners and blockers on unmount.
- No dependencies, durable browser storage, `any`, `upstream/`, asset, cache, or Task 14 changes.

## Changed files

- `packages/web/src/App.tsx`
- `packages/web/src/components/asset-pack-workbench/download-bar.tsx`
- `packages/web/src/components/asset-pack-workbench/harness.tsx`
- `packages/web/src/components/asset-pack-workbench/workbench-preview.tsx`
- `packages/web/src/hooks/use-asset-pack-workbench.ts`
- `packages/web/src/hooks/use-unsaved-work-guard.ts`
- `packages/web/src/lib/asset-pack-download.ts`
- `packages/web/test/app-shell.test.tsx`
- `packages/web/test/asset-pack-download-bar.test.tsx`
- `packages/web/test/asset-pack-download.test.ts`
- `packages/web/test/use-asset-pack-workbench.test.ts`
- `packages/web/test/use-unsaved-work-guard.test.ts`

## TDD and verification evidence

RED:

```text
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx
```

The sandboxed attempt was blocked in the package pretest `tsx` IPC setup with `listen EPERM`. The exact permitted rerun reached Vitest and failed as required: 4 files failed, with missing `asset-pack-download`, `use-unsaved-work-guard`, and `download-bar` modules plus the missing `createAppNavigationOwner`; 2 existing App tests passed.

GREEN:

```text
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx use-asset-pack-workbench.test.ts
```

PASS — 5 files, 25 tests.

Additional verification:

- `rtk pnpm --filter @lpc-toolkit/web run typecheck` — PASS.
- `rtk pnpm check:boundaries` — PASS, architecture boundary check passed.
- `rtk pnpm --filter @lpc-toolkit/web test` — PASS, 104 files, 821 tests. The suite emitted existing optional-spritesheet and catalog warning logs but exited 0.
- `rtk git diff --check` — PASS before product commit.

## Commits

- Product: `e7719ca4083a6f9a0973c11a23398a4318300f03` — `feat(web): download governed asset pack archives`
- Review-fix product: `ace0983076808266135119cb6c1992a06ddbc7aa` — `fix(web): close Task 13 review findings`
- Report: recorded in the follow-up report commit after this update.

## Fresh Luna review fixes

- Draft confirmation now derives its error/warning list from the reducer’s current `state.diagnostics`, so a stale `workbench.diagnostics` snapshot cannot hide current Worker diagnostics.
- App history entries now carry a monotonic internal index. Accepted programmatic navigation pushes the next indexed entry; canceled indexed `popstate` restores with `history.go(-delta)` and never `pushState`s a duplicate. Unknown-entry cancellation uses `replaceState` as a no-growth fallback.
- Exact-revision assembly, formal gate recheck, response metadata validation, and success-only downloaded markers were not changed.
- Added focused regressions for stale diagnostic snapshots and canceled back navigation without history growth.

Review-fix RED:

```text
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx use-asset-pack-workbench.test.ts
```

FAIL — 5 files, 26 tests collected; 2 new regressions failed: the current Worker diagnostic was absent from draft confirmation, and canceled popstate called the old-path `pushState` restoration.

Review-fix GREEN and gates:

- `rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx use-asset-pack-workbench.test.ts` — PASS, 5 files, 26 tests.
- `rtk pnpm --filter @lpc-toolkit/web run typecheck` — PASS.
- `rtk pnpm check:boundaries` — PASS.
- `rtk git diff --check` — PASS before the review-fix commit.

## Concerns

No concrete implementation blocker remains. Browser-level `beforeunload`/history behavior is covered by the injected navigation-owner and guard tests; the repository’s Vitest environment does not provide a browser DOM harness. Minor review items were intentionally left unchanged.
