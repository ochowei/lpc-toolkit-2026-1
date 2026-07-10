# Attribution Export Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every browser-exported pixel artifact is bundled with the exact credits from its composed sheet, and render those exact credits in the attribution UI.

**Architecture:** Keep core unchanged: `ComposedSheet.credits` remains the source of truth. Add focused browser helpers for a basic spritesheet ZIP and export-credit validation in `packages/web/src/lib/`; pass the ready sheet manifest from `LayerStackHarness` to the attribution presentation. Catalog-derived filters remain a separate compatibility signal and must not expand actual attribution.

**Tech Stack:** TypeScript strict mode, React 18, Vitest, Playwright, JSZip (MIT; existing GPL-compatible dependency), `@napi-rs/canvas` (MIT; existing test-only dependency).

## Global Constraints

- Use pnpm and prefix every terminal command with `rtk`.
- Do not add dependencies or modify `upstream/`.
- Do not alter core composition output, selection/hash/token semantics, existing ZIP layouts, or editor layout.
- A user-exportable pixel artifact must be blocked when `ComposedSheet.credits.entries` is empty; standalone TXT/CSV must report the same error instead of producing a misleading file.
- The basic download ZIP must contain exactly `character-spritesheet.png`, `credits/credits.txt`, and `credits/credits.csv`, all derived from the same frozen `ComposedSheet`.
- Existing four ZIP layouts must also reject an empty credit manifest before a blob is downloaded.
- Picker thumbnails remain editor-internal previews: no thumbnail sidecar is required, but the ready composition’s attribution popover remains reachable.
- Keep `DownloadPopover` changes limited to this product-contract batch; the export-state/hook extraction belongs to Plan 4.

---

## File Structure

- `packages/web/src/lib/spritesheet-export.ts` — validates a frozen sheet’s credit manifest, encodes its canvas, and assembles the three-file basic ZIP.
- `packages/web/src/lib/zip-export.ts` — reuses the shared credit-manifest guard before producing each existing ZIP layout.
- `packages/web/src/components/layer-stack/popovers/attribution-manifest.ts` — pure conversion of a `CreditsManifest` into deduplicated display rows while independently retaining catalog filter incompatibility flags.
- `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx` — presentation-only rendering of exact manifest rows and an explicit no-resolved-credits state.
- `packages/web/src/components/layer-stack/popovers/download-popover.tsx` — invokes the basic bundle helper, freezes inputs, blocks empty manifests, and uses localized image-and-credits copy.
- `packages/web/src/components/layer-stack/harness.tsx` — supplies `composeResult.sheet?.credits` to the attribution popover without recomputing credits.
- `packages/web/src/i18n.ts` — localized labels for the bundle action and empty-credit error/state.
- `packages/web/playwright.download.config.ts` — focused browser controller that starts only the toolkit web server and never starts tracked `upstream/`.
- `packages/web/test/spritesheet-export.test.ts` — ZIP contents, frozen sheet provenance, and empty-credit rejection.
- `packages/web/test/attribution-manifest.test.ts` — precise manifest rows, effective license, filter incompatibility, and no-credit state.
- `packages/web/test/zip-export.test.ts` — empty-credit rejection for each existing pixel ZIP layout.
- `packages/web/e2e/download-attribution.spec.ts` — browser contract: bundle download, exact attribution display, and blocked empty-credit behavior via deterministic test fixture/probe.
- `docs/ARCHITECTURE.md` — narrow policy note defining the thumbnail preview exception and browser export credit contract.

## Task 1: Add a basic spritesheet bundle helper and credit guard

**Files:**
- Create: `packages/web/src/lib/spritesheet-export.ts`
- Create: `packages/web/test/spritesheet-export.test.ts`

**Interfaces:**
- Produces `assertExportableCredits(credits: CreditsManifest): void`; it throws `Error('Cannot export pixels without resolved credits.')` when `entries` is empty.
- Produces `exportSpritesheetBundle(sheet: ComposedSheet, animation: string): Promise<Blob>`; it calls the guard, encodes `sheet.canvas` once, and writes the required three paths.
- Uses `creditsToTxt`, `creditsToCsv`, `ComposedSheet`, and `CreditsManifest` only through `@lpc-toolkit/core`; it lazily imports the existing `jszip` runtime dependency.

- [x] **Step 1: Write the failing bundle-helper tests**

Create fixtures with a 1×1 painted `@napi-rs/canvas` and a non-empty manifest. Assert that loading the returned blob with `JSZip.loadAsync` yields exactly:

```ts
expect(Object.keys(zip.files).sort()).toEqual([
  'character-spritesheet.png',
  'credits/credits.csv',
  'credits/credits.txt',
]);
expect(await zip.file('character-spritesheet.png')!.async('uint8array')).not.toHaveLength(0);
expect(await zip.file('credits/credits.txt')!.async('text')).toContain('Artist');
```

Use two sheets with distinct red/blue pixels and distinct credit authors to prove the helper uses only the passed `sheet`, not mutable selection state. Add an empty-manifest test:

```ts
await expect(exportSpritesheetBundle(emptySheet, 'walk')).rejects.toThrow(
  'Cannot export pixels without resolved credits.',
);
```

- [x] **Step 2: Run the new test to verify the helper is absent**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/spritesheet-export.test.ts`

Expected: FAIL because `spritesheet-export.ts` does not yet export the helper.

- [x] **Step 3: Implement the minimal helper**

Implement `assertExportableCredits` and `exportSpritesheetBundle` in `packages/web/src/lib/spritesheet-export.ts`. Keep canvas encoding local to the helper and use this archive layout:

```ts
zip.file('character-spritesheet.png', await encodePng(sheet.canvas));
zip.file('credits/credits.txt', creditsToTxt(sheet.credits, animation));
zip.file('credits/credits.csv', creditsToCsv(sheet.credits, animation));
return zip.generateAsync({ type: 'blob' });
```

`encodePng` must reject when `canvas.toBlob` supplies `null`; it must not call `downloadBlob` or create object URLs.

- [x] **Step 4: Run the helper tests**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/spritesheet-export.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the isolated helper**

```bash
rtk git add packages/web/src/lib/spritesheet-export.ts packages/web/test/spritesheet-export.test.ts
rtk git commit -m "feat(web): bundle spritesheet credits"
```

Implementation note: added the exact three-file bundle helper and the shared
empty-credit guard using test-first development.

- Commit: `54cccc722` (`feat(web): bundle spritesheet credits`)
- Verification: focused helper tests PASS (3/3); web typecheck PASS; boundary
  check PASS; task spec/quality review PASS.

## Task 2: Protect all existing pixel ZIP workflows

**Files:**
- Modify: `packages/web/src/lib/zip-export.ts:1-120,161-520`
- Modify: `packages/web/test/zip-export.test.ts`

**Interfaces:**
- Consumes `assertExportableCredits` from `./spritesheet-export`.
- Every public `exportByAnimationZip`, `exportByItemZip`, `exportByAnimItemZip`, and `exportByFrameZip` rejects before importing/generating a ZIP when `ctx.sheet.credits.entries` is empty.
- Credit-only TXT/CSV actions are not handled in this task; they are wired in Task 4.

- [x] **Step 1: Add failing empty-credit cases for all four exporters**

Replace the default test fixture’s empty manifest with a non-empty `CREDITS` fixture so existing success tests remain valid. Add a table test that supplies the existing `EMPTY_CREDITS` fixture and asserts each exporter rejects with the exact shared message:

```ts
for (const exportZip of [exportByAnimationZip, exportByItemZip, exportByAnimItemZip, exportByFrameZip]) {
  await expect(exportZip(emptyCreditContext)).rejects.toThrow(
    'Cannot export pixels without resolved credits.',
  );
}
```

- [x] **Step 2: Run the focused ZIP tests and observe failure**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/zip-export.test.ts`

Expected: the new empty-credit cases FAIL because current exporters create ZIP blobs.

- [x] **Step 3: Guard each public ZIP entry point**

Import `assertExportableCredits` and make it the first executable statement in each of the four exported functions:

```ts
assertExportableCredits(ctx.sheet.credits);
```

Do not change file names, progress mapping, extraction, custom-overlay inclusion, or existing credit-file content.

- [x] **Step 4: Run focused ZIP tests**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/zip-export.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the ZIP guard**

```bash
rtk git add packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts
rtk git commit -m "fix(web): block uncredited ZIP exports"
```

Implementation note: all four public ZIP exporters now reject an empty credit
manifest before importing JSZip or doing export work.

- Commit: `bf854bca0` (`fix(web): block uncredited ZIP exports`)
- Verification: focused ZIP tests PASS (23/23); web typecheck PASS; boundary
  check PASS; task spec/quality review PASS.

## Task 3: Make actual attribution manifest-driven while preserving filters

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/attribution-manifest.ts`
- Create: `packages/web/test/attribution-manifest.test.ts`
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx:655-665`
- Modify: `packages/web/src/i18n.ts`

**Interfaces:**
- Produces `attributionRows(credits, catalog, state, licenseFilter, animationFilter)`, returning one display row per `CreditsManifest.entries` record and an `empty` boolean.
- Each display row contains the manifest entry’s `file`, `authors`, `licenses`, and effective license calculated from the manifest’s licenses only.
- Filter compatibility remains calculated from `state.selections` and catalog items; it is displayed as a separate warning and never injects catalog credit rows into actual attribution.
- `AttributionPopover` accepts `credits: CreditsManifest | null`. `null` represents an in-flight or failed composition; a ready empty manifest renders a deliberate no-resolved-credits message.

- [x] **Step 1: Write failing pure attribution-model tests**

Use a catalog item containing both a resolved `CC0` credit and an unmatched `GPL 3.0` credit, with the passed manifest containing only the `CC0` record. Assert the rows omit the GPL record and effective license is `CC0`. With a license filter excluding the selected catalog item, assert incompatibility is still true while the actual manifest rows remain unchanged. Add empty-manifest coverage:

```ts
expect(attributionRows(emptyManifest, catalog, state, filters)).toEqual({
  rows: [],
  empty: true,
  incompatibleTypeNames: [],
});
```

- [x] **Step 2: Run the model test to confirm it fails**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/attribution-manifest.test.ts`

Expected: FAIL because the model module does not exist.

- [x] **Step 3: Implement the pure model and simplify the popover**

Move the current catalog/filter iteration out of `attribution-popover.tsx` into the new pure helper. In the component, render rows keyed by `entry.file`, include corresponding resolved paths from `credits.resolvedPaths`, and show a localized no-resolved-credits state when `credits` is non-null with no entries. Do not call `computeEffectiveLicense` with an empty manifest.

Add `attribution.noResolvedCredits` in English and Traditional Chinese in the
same task so the intermediate commit typechecks.

Pass the exact ready manifest from the harness:

```tsx
credits={composeResult.status === 'ready' ? composeResult.sheet.credits : null}
```

Keep the top-bar incompatibility badge catalog-derived in this batch; its redesign is not required for precise popover attribution.

- [x] **Step 4: Run focused attribution tests and web typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/attribution-manifest.test.ts test/attribution-summary.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: both commands PASS.

- [x] **Step 5: Commit precise attribution rendering**

```bash
rtk git add packages/web/src/components/layer-stack/popovers/attribution-manifest.ts packages/web/src/components/layer-stack/popovers/attribution-popover.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/i18n.ts packages/web/test/attribution-manifest.test.ts
rtk git commit -m "fix(web): render exact composition credits"
```

Implementation note: the attribution popover now renders only exact manifest
entries while catalog-derived filter incompatibilities remain a separate signal.

- Commit: `e534731a5` (`fix(web): render exact composition credits`)
- Verification: focused attribution tests PASS (9/9); web typecheck PASS;
  boundary check PASS; task spec/quality review PASS.

## Task 4: Wire the bundle UI, credit-only errors, and browser contract tests

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`
- Modify: `packages/web/src/i18n.ts`
- Create: `packages/web/playwright.download.config.ts`
- Create: `packages/web/e2e/download-attribution.spec.ts`

**Interfaces:**
- `DownloadPopover` calls `exportSpritesheetBundle(frozenSheet, frozenAnim)` and downloads its resulting blob as `character-spritesheet-with-credits.zip`.
- PNG, TXT, CSV, and layout ZIP actions all use `assertExportableCredits` before calling `downloadBlob`.
- The component never downloads an individual PNG after this task.
- `download.png` translation becomes an image-and-credits bundle label in English and Traditional Chinese; add the localized `download.noCredits` message. Task 3 already adds `attribution.noResolvedCredits`.

- [x] **Step 1: Write the browser test before UI implementation**

Create an E2E spec that opens `/compose?assetSource=zip`, waits for composition readiness, clicks the localized download control, and captures the browser download. Assert the suggested filename ends in `.zip`, then parse the saved archive with JSZip in Node and assert exact sorted equality with the three required paths. Open Attribution and assert that a resolved credit filename is visible. Add a deterministic empty-credit route/probe only if the existing E2E fixture machinery cannot produce one; the probe must not alter production behavior.

- [x] **Step 2: Run the E2E spec and verify the old PNG behavior fails the assertion**

Run: `rtk pnpm --filter @lpc-toolkit/web exec playwright test -c playwright.download.config.ts e2e/download-attribution.spec.ts`

Expected: FAIL because the current action downloads `character-spritesheet.png`.

- [x] **Step 3: Replace the bare PNG handler with a frozen bundle handler**

In `DownloadPopover`, replace `handlePng` with an `async` handler that captures `const frozenSheet = sheet` and `const frozenAnim = anim`, awaits `exportSpritesheetBundle`, then downloads the bundle. Catch encoding/archive/credit errors, emit `download.noCredits` for the shared guard error and `download.failed` otherwise, and leave the popover open on failure.

Apply `assertExportableCredits(sheet.credits)` to TXT and CSV actions before creating their Blob. Reuse the same error mapping in `runZip` before setting progress; this prevents intentionally triggered downloads for all empty-manifest paths.

- [x] **Step 4: Run focused unit, E2E, and type checks**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/spritesheet-export.test.ts test/zip-export.test.ts test/attribution-manifest.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web exec playwright test -c playwright.download.config.ts e2e/download-attribution.spec.ts e2e/responsive-layout.spec.ts
```

Expected: all commands PASS; the responsive test continues to verify popover containment.

- [x] **Step 5: Commit the UI contract**

```bash
rtk git add packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/src/i18n.ts packages/web/playwright.download.config.ts packages/web/e2e/download-attribution.spec.ts
rtk git commit -m "fix(web): bundle credits with spritesheet download"
```

Implementation note: the primary browser action now downloads one frozen
spritesheet-and-credits ZIP; all credit-only and layout ZIP actions surface a
retryable localized error for empty manifests.

- Commit: `4c5bbc535` (`fix(web): bundle credits with spritesheet download`)
- Verification: focused unit tests PASS (29); browser tests PASS (13); web
  typecheck PASS; boundary check PASS; task spec/quality review PASS.

## Task 5: Document the thumbnail exception and verify the completed batch

**Files:**
- Modify: `docs/ARCHITECTURE.md:251-263`
- Modify: `docs/superpowers/plans/2026-07-10-attribution-export-contract.md`

**Interfaces:**
- Documentation states that catalog thumbnails are editor-internal previews without per-thumbnail sidecars, while any user-exportable pixels must carry the exact composed-sheet credit files.
- Documentation states that the attribution popover consumes `ComposedSheet.credits`; filter warnings are compatibility information, not additional attribution.

- [x] **Step 1: Add the narrow architecture policy text**

Extend the attribution section with these explicit statements:

```md
Catalog picker thumbnails are editor-internal previews and do not require their own credit sidecar. The editor must keep the active composition's attribution surface reachable.

Any downloadable pixel artifact must be built from one frozen `ComposedSheet` and include credits derived from that sheet's `credits` manifest. Catalog filters may report compatibility warnings, but must not broaden the attribution manifest.
```

- [x] **Step 2: Run the complete batch verification suite**

Run:

```bash
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/web exec playwright test -c playwright.download.config.ts e2e/download-attribution.spec.ts e2e/responsive-layout.spec.ts
rtk git diff --check
```

Expected: every command exits 0. Upstream parity E2E is deliberately deferred
until Plan 3 provides the isolated checkout; do not install packages inside the
tracked `upstream/` submodule to force parity green.

- [x] **Step 3: Record verification and commit the policy/plan record**

After all applicable checks pass, replace this task’s checkboxes with `[x]` and append an implementation record containing each commit hash and each command’s PASS result. Then commit:

```bash
rtk git add docs/ARCHITECTURE.md docs/superpowers/plans/2026-07-10-attribution-export-contract.md
rtk git commit -m "docs: define browser attribution contract"
```

Implementation note: documented the editor-internal thumbnail exception, the
reachable active-composition attribution surface, and the frozen-sheet export
contract. Verified the completed attribution-contract batch without starting
the tracked `upstream/` submodule; isolated upstream parity remains deferred to
Plan 3.

- Task 1 commit: `54cccc722` (`feat(web): bundle spritesheet credits`)
- Task 2 commit: `bf854bca0` (`fix(web): block uncredited ZIP exports`)
- Task 3 commit: `e534731a5` (`fix(web): render exact composition credits`)
- Task 4 commit: `4c5bbc535` (`fix(web): bundle credits with spritesheet download`)
- Task 5 documentation commit: `e7c831530e5f9db918469789664a96415bfcfe83`
  (`docs: define browser attribution contract`)
- Verification: `rtk pnpm check:boundaries` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/web test` PASS (65 files, 507
  tests). The known 35 catalog alias warnings remain baseline noise.
- Verification: `rtk pnpm --filter @lpc-toolkit/web exec playwright test -c
  playwright.download.config.ts e2e/download-attribution.spec.ts
  e2e/responsive-layout.spec.ts` PASS (13 tests).
- Verification: `rtk git diff --check` PASS.

Follow-up review implementation note: promoted the toolkit-only Playwright
controller into tracked configuration, tightened the bundle assertion to exact
three-entry equality, and corrected every required typecheck/browser command to
its reproducible spelling. The duplicated empty-credit error classification is
recorded as a Minor and deliberately remains unchanged; introducing a new error
hierarchy is outside this focused review fix. These corrections are committed
separately from `e7c831530e5f9db918469789664a96415bfcfe83` as the follow-up
review-fix commit `test(web): make attribution browser checks reproducible`.

- Review-fix verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck`
  PASS.
- Review-fix verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run
  test/spritesheet-export.test.ts test/zip-export.test.ts
  test/attribution-manifest.test.ts` PASS (3 files, 29 tests).
- Review-fix verification: `rtk pnpm --filter @lpc-toolkit/web exec playwright
  test -c playwright.download.config.ts e2e/download-attribution.spec.ts
  e2e/responsive-layout.spec.ts` PASS (13 tests).
- Review-fix verification: `rtk pnpm check:boundaries` PASS.
- Review-fix verification: `rtk git diff --check` PASS.

## Plan Self-Review

- Finding 2 is covered by Tasks 1, 2, and 4: no bare PNG remains, all pixel archives require credits, and browser E2E verifies the bundle.
- Finding 11 is covered by Task 3: actual attribution and effective license come only from the composition manifest while filters remain separate.
- Finding 15 is covered by Task 5: the thumbnail exception and reachable attribution surface are explicit policy.
- The plan deliberately leaves isolated upstream parity, export/overlay hook extraction, boundary expansion, and full README alignment to Plans 3–6.
- No dependencies, upstream modifications, or core runtime imports are introduced.
