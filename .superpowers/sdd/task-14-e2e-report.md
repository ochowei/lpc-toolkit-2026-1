# Task 14 Browser-to-CLI Workflow Report

Status: complete

## Implementation

- Added a deterministic Playwright fixture and browser workflow covering formal upload, official/base preview attribution, PNG replacement, revision/version gating, per-warning acknowledgement, draft download, draft re-upload persistence, formalization, and final download.
- The browser test invokes the built CLI against the exact downloaded draft/formal bytes in a clean temporary workspace, asserting draft inspect/install refusal, formal install, healthy doctor output, and workspace-contained paths.
- Extended packed CLI smoke with a generated draft archive. Draft inspect exits `1` with `status: "draft"`; draft install exits `1` with `asset_pack_draft` and leaves the initialized workspace config byte-identical.
- Fixed StrictMode controller disposal, legacy preview animation authorization, warning-input event capture, same-binding warning acknowledgement after governed edits, and draft re-upload formalization semantics exposed by the E2E flow.

## TDD and verification evidence

- RED: the initial browser workflow failed before the CLI build was present and exposed the StrictMode, legacy-animation, pooled-event, stale-acknowledgement, and draft-status/version-gate defects.
- PASS: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx package-scripts.test.ts asset-pack-manifest-editor.test.ts asset-pack-preview.test.ts asset-pack-release.test.ts asset-pack-warnings-editor.test.tsx` — 7 files, 38 tests.
- PASS: `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts plugin-contract.test.ts` — 2 files, 60 tests.
- PASS: `rtk pnpm verify:plugin` — 40 tests and valid plugin structure.
- PASS: `rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts --timeout=30000` — 1 browser test passed; pretest built CLI.
- PASS: `rtk pnpm --filter @lpc-toolkit/cli build`.
- PASS: `rtk pnpm --filter @lpc-toolkit/cli test:package` — packed CLI install smoke passed, including draft rejection/no mutation.
- PASS: `rtk pnpm verify` — boundary, CLI-doc policy, plugin, typecheck, and recursive test gates completed without failure after the fixture typing correction.

## Documentation impact

```text
help: update — rechecked against the unchanged CLI help/output contract from Task 6
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: update
```

The public contract now distinguishes Web Workbench repair/draft creation from CLI pack creation, installation, and lifecycle management. Draft archives have no install override.

## Commits

Product commit: `368794d4458740c9e6896d63824e0e868ad2f196` (`docs(asset-pack): publish browser correction workflow`)
Plan/evidence commit: `698e6e6fe0828514c60dcc3b0a3a9f8a2cf99f6a` (`docs(plan): record task 14 implementation evidence`)

## Concerns

- A draft re-upload keeps its draft status and acknowledgement/source records, then requires a governed version increment before formal release. Version-bound warning fingerprints are intentionally re-acknowledged after that edit.
- The smoke fixture explicitly disables implicit ZIP directory entries so the generated draft remains accepted as a safe archive by the public parser.
