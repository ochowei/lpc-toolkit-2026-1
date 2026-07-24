# Task 10 Route Shell Report

## Status

Implemented the `/asset-packs` route, route-local baseline loading, landing CTA/capability distinction, upload/drop entry, and responsive three-region workbench shell.

Product scope stayed within the Task 10 route-shell brief:

- `packages/web/src/lib/app-route.ts`
- `packages/web/src/App.tsx`
- `packages/web/src/components/landing-page.tsx`
- `packages/web/src/components/asset-pack-workbench/`
- the five focused Task 10 web tests

No Task 9 hook/state or attribution logic changed. No upstream, asset, cache, dependency, lockfile, or Task 11 files changed.

## RED evidence

Command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- app-route.test.ts app-shell.test.tsx landing-page.test.tsx asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx
```

After the approved escalation for the repository's `tsx` IPC pretest hook, the focused suite failed as intended before implementation:

- route tests failed for `/asset-packs` classification and path generation;
- app-shell failed because the new route was still a 404;
- landing tests failed for the missing CTA and obsolete Phase 3 copy;
- upload and workbench shell suites failed because the requested modules did not exist;
- Vitest summary: `Test Files 5 failed (5)`, `Tests 5 failed | 7 passed (12)`.

The initial sandboxed attempt failed earlier at `tsx scripts/prepare-assets.ts` with `listen EPERM`; escalation was used only for the known IPC hook and required verification commands.

## GREEN evidence

Command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- app-route.test.ts app-shell.test.tsx landing-page.test.tsx asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx
```

Result: PASS — 5 test files, 18 tests.

Coverage includes route/path mapping, route-local lazy baseline initialization, composer-only loading, landing/404 loader absence, the single constrained upload input, drop and size gate, explicit Reset/Back, no silent second-drop replacement, progress `role="status" aria-live="polite"`, status icon/count text, desktop landmarks, narrow tabs, and landing CLI/Web capability copy.

Additional verification:

```text
rtk pnpm --filter @lpc-toolkit/web run typecheck — PASS
rtk pnpm --filter @lpc-toolkit/web build — PASS
rtk pnpm check:boundaries — PASS
rtk git diff --check — PASS
```

The production build emitted only Vite chunk-size/dynamic-import warnings and completed successfully.

## Commits

- Product: `4a54af2ff5b9f3a7ea035b2a39c5ac7fe7dd3651` — `feat(web): add asset pack workbench route`
- This report is committed separately as a docs-only commit.
