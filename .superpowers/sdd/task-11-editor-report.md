# Task 11 implementation report

## Status

PASS. Task 11 manifest, PNG source, diagnostics, warning, and credits editors are implemented and wired to the existing Worker-backed workbench controller.

## TDD evidence

Tests were added before the editor modules.

RED command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx
```

The first run was blocked in the package pretest hook by the sandbox denying tsx's temporary IPC pipe (`listen EPERM`). The same exact command was rerun with the required process permission and failed during collection as expected: all six suites reported that their detailed editor module did not exist, with zero tests collected.

GREEN command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx asset-pack-manifest-editor.test.ts asset-pack-release.test.ts
```

Result: PASS — 8 test files, 18 tests.

Additional regression check:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-workbench-shell.test.tsx asset-pack-upload-panel.test.tsx
```

Result: PASS — 2 test files, 7 tests.

## Verification

```sh
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

PASS.

```sh
rtk pnpm check:boundaries
```

PASS — Architecture boundary check passed.

`rtk git diff --check` also passed. The self-review found no new `any` types, source object URL creation, mutable-row index keys, acknowledgement-all control, or writable acknowledgement/status fields in the advanced projection editor.

## Implementation notes

- Overview and credits edit immutable projections and submit complete serialized manifests through the existing controller callback.
- Advanced JSON serializes only the Task 9 advanced projection with two-space indentation and a final newline; raw repair preserves the acknowledgement array exactly.
- Source replacement accepts only `image/png`, delegates signature/decode authority to the Worker, and removes unreferenced sources only after an explicit confirmation step.
- Warning confirmation uses `acknowledgeWarning` with the current candidate and reason, with blank reasons and version blockers disabled.
- Diagnostics map scope to the existing panels and use safe hashed target IDs for focus navigation.
- Mutable credit rows use stable local row IDs; source and warning rows use path/binding-derived keys.

## Changed files

- `packages/web/src/components/asset-pack-workbench/credits-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/diagnostic-list.tsx`
- `packages/web/src/components/asset-pack-workbench/harness.tsx`
- `packages/web/src/components/asset-pack-workbench/manifest-json-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/overview-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/source-list.tsx`
- `packages/web/src/components/asset-pack-workbench/warnings-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/workbench-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/workbench-nav.tsx`
- `packages/web/test/asset-pack-credits-editor.test.tsx`
- `packages/web/test/asset-pack-diagnostic-list.test.tsx`
- `packages/web/test/asset-pack-manifest-json-editor.test.tsx`
- `packages/web/test/asset-pack-overview-editor.test.tsx`
- `packages/web/test/asset-pack-source-list.test.tsx`
- `packages/web/test/asset-pack-warnings-editor.test.tsx`

## Commits

- Product changes: `da793bd0968b72a6a39f1e210081388adf1d02a9` — `feat(web): add asset pack correction editors`
- Report: `709a41714b7541d306be2f2d70b33116ca067a1f`

## Concerns

No known implementation blockers. The focused component tests use the repository's server-rendered markup style and pure helpers; browser event-level interaction and E2E coverage remain outside this Task 11 verification scope.

## Task 11 Luna review fixes

Fixed all four Important findings:

- Raw repair now renders whenever a Worker revision exists, even when JSON parsing or schema validation fails. Invalid current JSON can be repaired as long as the repaired document does not introduce an acknowledgement array; parsed acknowledgement arrays must remain unchanged.
- Overview, credits, and manifest editors synchronize clean Worker-approved prop revisions. Active drafts are preserved with field-level dirty tracking for Overview; credits and manifest drafts surface a revision conflict and require an explicit reload before submission, preventing stale values from being submitted.
- Diagnostic identity hashes now include severity, message, scope, path, subject, and details. Every mapped panel renders a unique focusable corrective target, with fallback targets for diagnostics that do not match a row. Selecting a diagnostic focuses the panel target after navigation, with a bounded list-row fallback.
- Projection and acknowledgement helper failures are converted to visible editor errors in the existing diagnostics surface instead of being swallowed.

### Fix changed files

Fix commit: `4eb090ed15f52049678c6c6c4a6cba768a23d8a3` — `fix(web): address Task 11 editor review findings`

- `packages/web/src/components/asset-pack-workbench/credits-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/diagnostic-list.tsx`
- `packages/web/src/components/asset-pack-workbench/manifest-json-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/overview-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/source-list.tsx`
- `packages/web/src/components/asset-pack-workbench/warnings-editor.tsx`
- `packages/web/src/components/asset-pack-workbench/workbench-editor.tsx`
- `packages/web/test/asset-pack-credits-editor.test.tsx`
- `packages/web/test/asset-pack-diagnostic-list.test.tsx`
- `packages/web/test/asset-pack-manifest-json-editor.test.tsx`
- `packages/web/test/asset-pack-overview-editor.test.tsx`

### Fix verification

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx asset-pack-manifest-editor.test.ts asset-pack-release.test.ts
```

PASS — 8 files, 22 tests.

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-workbench-shell.test.tsx asset-pack-upload-panel.test.tsx
```

PASS — 2 files, 7 tests.

```sh
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

PASS — both commands.

Fix concerns: browser event-level interaction remains outside the repository's server-rendered focused test setup; no known functional blocker remains.
