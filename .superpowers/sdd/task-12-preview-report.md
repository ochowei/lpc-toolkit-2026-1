# Task 12 implementation report — current-revision preview and attribution

## Outcome

Implemented the Task 12 current-revision asset-pack preview, canonical character
import, focused pack selection, and exact attribution behavior.

Product commit:

```text
89cd749af4a1a513fc7e80432d9ea9dbeb0bc1a2
feat(web): preview attributed asset packs
```

## TDD evidence

Tests were added before the implementation.

RED command from the brief:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx character-document.test.ts
```

The first sandboxed attempt stopped in the package `pretest` hook because `tsx`
could not open its temporary IPC pipe (`listen EPERM`). The exact command was
rerun with local IPC access and failed as intended:

```text
4 failed | 1 passed suites
4 passed tests
Failed suites: attribution panel, preview canvas adapter, preview model, and preview hook
Reason: the four new preview/attribution modules did not exist yet.
```

GREEN command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx character-document.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests       15 passed (15)
```

Related Task 8 and existing regression suite:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-workbench-shell.test.tsx asset-pack-workbench.test.ts browser-canvas-adapter.test.ts asset-pack-worker-protocol.test.ts asset-pack-worker-session.test.ts
```

Result: 6 files and 49 tests passed.

## Implementation

- Added `asset-pack-preview-canvas-adapter.ts`. It decodes exact PNG bytes for
  compile-plan destination paths without object URLs, delegates only explicitly
  authorized official paths to the existing browser adapter, and rejects source
  paths or unowned destinations.
- Added `asset-pack-preview.ts`. It merges baseline and compiled definitions
  through Core `createCatalog`, builds the fixed default character through the
  existing `pickInitialSelections`, applies imported canonical selections only
  after compiled-catalog validation, applies the focused pack item afterward,
  and requires matched credits before computing the effective license.
- Added `use-asset-pack-preview.ts`. Its latest-only request identity includes
  revision, body type, focused asset, imported selection digest, and source-byte
  identity. Current pending/error states synchronously expose no sheet,
  animation, or credits. Animation changes re-extract from the validated sheet;
  direction changes remain playback-only.
- Added `attribution-panel.tsx` and wired `workbench-preview.tsx` and
  `harness.tsx` with focused asset, body type, animation, direction, and
  canonical JSON import controls. The panel shows authors, licenses, URLs,
  notes, resolved paths, effective license, and official baseline release tag;
  it exposes no unattributed export action.
- Extended `character-document.test.ts` with compiled-catalog canonical import
  rejection coverage.

## Changed files

```text
packages/web/src/adapter/asset-pack-preview-canvas-adapter.ts
packages/web/src/lib/asset-pack-preview.ts
packages/web/src/hooks/use-asset-pack-preview.ts
packages/web/src/components/asset-pack-workbench/attribution-panel.tsx
packages/web/src/components/asset-pack-workbench/workbench-preview.tsx
packages/web/src/components/asset-pack-workbench/harness.tsx
packages/web/test/asset-pack-preview-canvas-adapter.test.ts
packages/web/test/asset-pack-preview.test.ts
packages/web/test/use-asset-pack-preview.test.ts
packages/web/test/asset-pack-attribution-panel.test.tsx
packages/web/test/character-document.test.ts
```

No dependencies, `any` types, object URLs for preview bytes, Task 13 files,
`upstream/`, checked-in assets, or cache files were changed.

## Verification

```sh
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

PASS — TypeScript completed with exit code 0.

```sh
rtk pnpm check:boundaries
```

PASS — `Architecture boundary check passed.`

```sh
rtk git diff --check
```

PASS.

## Concerns

- The focused tests stub `createImageBitmap`; browser-native decoding and a
  real canvas composition remain covered by the existing browser adapter and
  Worker suites rather than a browser E2E run.
- The official fallback predicate intentionally excludes the compiled
  `spritesheets/packages/` namespace; any future official asset source using
  that namespace would need an explicit ownership rule before being allowed.
