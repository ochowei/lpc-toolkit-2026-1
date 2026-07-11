# Web Responsibility Extractions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move single-item composition, custom-overlay lifecycle, and character-export orchestration out of presentation components while preserving every existing user-visible and serialized behavior.

**Architecture:** Keep `LayerStackHarness` as the editor orchestrator, but replace its low-level browser/composition responsibilities with three focused hooks. Browser export assembly and download mechanics move to `src/lib/character-export.ts`; `DownloadPopover` receives only render state and action callbacks. Pure factories/lifetime guards accompany the hooks so Vitest can exercise lifecycle and concurrency behavior without adding a DOM test dependency.

**Tech Stack:** TypeScript strict mode, React 18 hooks, Vitest, Playwright, existing `@lpc-toolkit/core`, JSZip (MIT), and `@napi-rs/canvas` (MIT, tests only).

## Global Constraints

- Prefix every local terminal command with `rtk`; use pnpm for this monorepo.
- Do not add dependencies or modify, install into, start a server from, or create generated files under `upstream/`.
- Keep `packages/core/` environment-agnostic and unchanged.
- `harness.tsx` remains the top-level editor orchestrator; use small local extractions, not a new global controller or state store.
- Preserve reducer actions, selection identity, URL hash, selection tokens, rendered pixels, attribution, all seven download actions, ZIP filenames/layouts, progress behavior, and visible editor layout.
- The basic bundle and all four ZIP layouts must continue using one frozen ready `ComposedSheet` and its exact credits; empty credits and stale retained sheets remain non-exportable.
- Preserve custom overlay dimensions, z-position parsing, composition placement, per-item ZIP inclusion, status copy, and object URL ownership.
- Lifecycle coverage must prove stale async overlay results are discarded, frozen export inputs do not drift, replacement and unmount revoke URLs exactly once, failed exports are retryable, and duplicate export execution is prevented.
- Do not add `any`; do not broaden public package APIs or change i18n copy.
- Run `rtk pnpm check:boundaries` after architecture-sensitive changes.

---

## File Structure

- `packages/web/src/hooks/use-single-item-composer.ts` — constructs stable full-item and layer-specific composition callbacks around core plus the browser adapter.
- `packages/web/test/use-single-item-composer.test.ts` — verifies exact selections, palette resolver wiring, adapter reuse, and `onlyLayerNumber` behavior.
- `packages/web/src/hooks/use-custom-overlay.ts` — owns overlay state, request freshness, z-position, status reporting, and URL replacement/disposal.
- `packages/web/test/use-custom-overlay.test.ts` — exercises the pure lifetime owner and request-freshness rules used by the hook.
- `packages/web/src/lib/character-export.ts` — builds/downloads bundle, TXT, CSV, and four ZIP layouts from a frozen export input.
- `packages/web/test/character-export.test.ts` — validates action routing, filenames, precise frozen inputs, and failure propagation.
- `packages/web/src/hooks/use-character-export.ts` — owns ready-sheet gating, execution lock, progress, error/status mapping, retry, and popover-close success behavior.
- `packages/web/test/use-character-export.test.ts` — tests ready-sheet selection and the execution gate independently of React rendering.
- `packages/web/src/components/layer-stack/popovers/download-popover.tsx` — presentation-only controls driven by action callbacks and progress props.
- `packages/web/src/components/layer-stack/harness.tsx` — composes the three hooks and passes narrow props to `StackPanel` and `DownloadPopover`.
- `packages/web/test/download-popover.test.ts` — moves readiness assertions to the export hook contract and statically protects presentation-only imports/props.
- `packages/web/e2e/download-attribution.spec.ts` and `packages/web/e2e/composition-loading-lock.spec.ts` — retain all download, frozen attribution, empty-credit, and stale-composition browser contracts.
- `docs/superpowers/plans/2026-07-11-web-responsibility-extractions.md` — task status, implementation notes, commit hashes, and verification evidence.

## Task 1: Extract the single-item composer hook

**Files:**
- Create: `packages/web/src/hooks/use-single-item-composer.ts`
- Create: `packages/web/test/use-single-item-composer.test.ts`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

**Interfaces:**
- Produces `SingleItemComposer` with `composeSingleItem(selections)` and `composeSingleItemLayer(selections, layerNumber)`.
- Produces `createSingleItemComposer(args)` for deterministic Node tests; `args` includes `catalog`, `palettes`, `adapter`, and optional `compose` defaulting to core `composeSelections`.
- Produces `useSingleItemComposer(catalog, palettes)` that memoizes one browser adapter and one composer object.
- Both callbacks pass `spritesheetsBaseUrl: ''` and a resolver created from the exact passed selections; only the layer callback supplies `onlyLayerNumber`.

- [ ] **Step 1: Write the failing factory tests**

Create tests with a typed compose spy and assert the full-item call omits `onlyLayerNumber`, the layer call supplies it, both calls preserve the exact selections and adapter, and `resolvePalette` resolves against those selections:

```ts
const composer = createSingleItemComposer({
  catalog,
  palettes,
  adapter,
  compose: async (selections, options) => {
    calls.push({ selections, options });
    return sheet;
  },
});

await composer.composeSingleItem(selections);
await composer.composeSingleItemLayer(selections, 3);

expect(calls[0]?.selections).toBe(selections);
expect(calls[0]?.options).not.toHaveProperty('onlyLayerNumber');
expect(calls[1]?.options.onlyLayerNumber).toBe(3);
expect(calls[0]?.options.adapter).toBe(adapter);
expect(calls[0]?.options.spritesheetsBaseUrl).toBe('');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/use-single-item-composer.test.ts`

Expected: FAIL because the new hook module does not exist.

- [ ] **Step 3: Implement the factory and hook**

Use this public shape:

```ts
export interface SingleItemComposer {
  readonly composeSingleItem: (selections: Selections) => Promise<ComposedSheet>;
  readonly composeSingleItemLayer: (
    selections: Selections,
    layerNumber: number,
  ) => Promise<ComposedSheet>;
}

export function createSingleItemComposer(args: {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly adapter: CanvasAdapter;
  readonly compose?: typeof composeSelections;
}): SingleItemComposer {
  const compose = args.compose ?? composeSelections;
  const run = (selections: Selections, onlyLayerNumber?: number) =>
    compose(selections, {
      catalog: args.catalog,
      adapter: args.adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(args.catalog, args.palettes, selections),
      ...(onlyLayerNumber === undefined ? {} : { onlyLayerNumber }),
    });
  return {
    composeSingleItem: (selections) => run(selections),
    composeSingleItemLayer: (selections, layerNumber) =>
      run(selections, layerNumber),
  };
}
```

The hook creates the adapter with `useMemo(() => createBrowserCanvasAdapter(), [])` and memoizes the factory result from `catalog`, `palettes`, and `adapter`.

- [ ] **Step 4: Replace the harness callback and verify**

Delete the harness imports of `composeSelections`, `makeResolvePalette`, and `createBrowserCanvasAdapter`. Replace its callback with:

```ts
const { composeSingleItem, composeSingleItemLayer } =
  useSingleItemComposer(props.catalog, props.palettes);
```

Pass the distinct callbacks to the existing export wiring. Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/use-single-item-composer.test.ts test/zip-export.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS; existing ZIP tests remain unchanged.

- [ ] **Step 5: Commit Task 1**

```bash
rtk git add packages/web/src/hooks/use-single-item-composer.ts packages/web/test/use-single-item-composer.test.ts packages/web/src/components/layer-stack/harness.tsx
rtk git commit -m "refactor(web): extract single-item composer hook"
```

After review, mark the task complete and record implementation note, commit hash, and verification.

## Task 2: Extract custom-overlay ownership and stale-result handling

**Files:**
- Create: `packages/web/src/hooks/use-custom-overlay.ts`
- Create: `packages/web/test/use-custom-overlay.test.ts`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

**Interfaces:**
- Produces `CustomOverlayLifetime`, a small owner with `replace`, `updateZPos`, `discard`, `clear`, and `dispose`; every URL it owns is revoked at most once.
- Produces `isCurrentOverlayRequest(requestId, latestRequestId, locked): boolean`.
- Produces `useCustomOverlay({ lockedRef, t, onStatus, load? })` returning `overlay`, `zPos`, `upload`, `changeZPos`, and `clear`; `lockedRef.current` breaks the composition/overlay hook-order cycle without conditional hooks.
- A new upload, clear, or unmount invalidates older pending requests. A result resolving after invalidation or while composition is locked is discarded and its URL revoked.

- [ ] **Step 1: Write failing lifetime and freshness tests**

Cover replacement, z-position updates without revocation, clear, idempotent dispose, stale request rejection, and locked request rejection:

```ts
const revoke = vi.fn();
const lifetime = new CustomOverlayLifetime(revoke);
lifetime.replace(first);
lifetime.replace(second);
expect(revoke).toHaveBeenCalledWith(first.objectUrl);

expect(lifetime.updateZPos(42)).toMatchObject({ zPos: 42 });
expect(revoke).not.toHaveBeenCalledWith(second.objectUrl);

lifetime.dispose();
lifetime.dispose();
expect(revoke.mock.calls.filter(([url]) => url === second.objectUrl)).toHaveLength(1);

expect(isCurrentOverlayRequest(1, 2, false)).toBe(false);
expect(isCurrentOverlayRequest(2, 2, true)).toBe(false);
expect(isCurrentOverlayRequest(2, 2, false)).toBe(true);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/use-custom-overlay.test.ts`

Expected: FAIL because `use-custom-overlay.ts` does not exist.

- [ ] **Step 3: Implement the lifetime owner and hook**

Use `useRef` for one `CustomOverlayLifetime` and a monotonic request id. Read the caller-owned `lockedRef.current` at action start and again after async loading. The async upload flow must follow this order:

```ts
const requestId = ++requestIdRef.current;
const loaded = await load({ file, zPos: zPosRef.current });
if ('ok' in loaded) {
  if (isCurrentOverlayRequest(requestId, requestIdRef.current, lockedRef.current)) {
    onStatus(invalidSizeStatus(loaded));
  }
  return;
}
if (!isCurrentOverlayRequest(requestId, requestIdRef.current, lockedRef.current)) {
  lifetimeRef.current.discard(loaded);
  return;
}
setOverlay(lifetimeRef.current.replace(loaded));
```

`clear` and the unmount cleanup increment the request id before clearing/disposing. `changeZPos` updates both the numeric input state and the owned overlay. Preserve the existing localized loaded/cleared/invalid/error messages and `console.error` label.

- [ ] **Step 4: Wire the hook into harness and verify lifecycle contracts**

Replace all overlay `useState`, `isComposingRef`, URL revocation effects, and upload callbacks with an unconditional lock ref plus the hook:

```ts
const compositionLockedRef = useRef(false);
const customOverlayState = useCustomOverlay({
  lockedRef: compositionLockedRef,
  t,
  onStatus: setStatus,
});
const composeResult = useComposedCharacter(
  props.catalog,
  props.palettes,
  props.state,
  reloadCounter,
  customOverlayState.overlay,
);
const isComposing = isCompositionLocked(composeResult.status);
compositionLockedRef.current = isComposing;
```

Both hooks remain unconditional. Event and async callbacks always read the ref's current value, so they observe the latest composition lock even though the overlay hook is declared before composition.

Pass its narrow state/actions to `StackPanel`, reset, and exports. Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/use-custom-overlay.test.ts test/custom-overlay.test.ts test/use-composed-character.test.ts test/zip-export.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS; no direct `URL.revokeObjectURL` remains in `harness.tsx`.

- [ ] **Step 5: Commit Task 2**

```bash
rtk git add packages/web/src/hooks/use-custom-overlay.ts packages/web/test/use-custom-overlay.test.ts packages/web/src/components/layer-stack/harness.tsx
rtk git commit -m "refactor(web): own custom overlay lifecycle in hook"
```

After review, mark the task complete and record implementation note, commit hash, and verification.

## Task 3: Move browser artifact assembly into one export helper

**Files:**
- Create: `packages/web/src/lib/character-export.ts`
- Create: `packages/web/test/character-export.test.ts`
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`

**Interfaces:**
- Produces `CharacterExportKind = 'bundle' | 'creditsTxt' | 'creditsCsv' | ZipExportKind`.
- Produces immutable `CharacterExportInput` containing one ready sheet, cloned selections, catalog, animation, single-item composer, cloned overlay metadata, and item-label callback.
- Produces `freezeCharacterExportInput(input): CharacterExportInput`; it clones `Selections.items`, each `Selection`, and overlay metadata while retaining immutable catalog/sheet/image/function references.
- Produces `exportCharacterArtifact(kind, input, options): Promise<void>`; options allow typed injection of adapter creation, download, timestamp, ZIP exporters, and progress only for tests.
- The helper keeps exact existing filenames, ZIP exporter routing, credit guards, and errors; it performs `downloadBlob` only after complete artifact assembly.

- [ ] **Step 1: Write failing action-routing and frozen-input tests**

Use typed dependency spies. Assert bundle/TXT/CSV exact names, all four ZIP kinds route to the corresponding exporter, ZIP name uses the frozen `input.selections.bodyType`, and an async exporter continues using the original input after a separate later input object is created. Assert thrown encoder/exporter errors cause no download and propagate:

```ts
await exportCharacterArtifact('creditsTxt', input, deps);
expect(download).toHaveBeenCalledWith(expect.any(Blob), 'credits.txt');

await exportCharacterArtifact('byFrame', input, deps);
expect(exportByFrame).toHaveBeenCalledWith(
  expect.objectContaining({ sheet: input.sheet, selections: input.selections }),
);
expect(download).toHaveBeenCalledWith(
  zipBlob,
  'lpc_male_individual_frames_2026-07-11T00-00-00.zip',
);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/character-export.test.ts`

Expected: FAIL because `character-export.ts` does not exist.

- [ ] **Step 3: Implement the browser workflow helper**

Implement `freezeCharacterExportInput` as:

```ts
export function freezeCharacterExportInput(
  input: CharacterExportInput,
): CharacterExportInput {
  return {
    ...input,
    selections: {
      bodyType: input.selections.bodyType,
      items: Object.fromEntries(
        Object.entries(input.selections.items).map(([typeName, selection]) => [
          typeName,
          { ...selection },
        ]),
      ),
    },
    customOverlay: input.customOverlay ? { ...input.customOverlay } : null,
  };
}
```

Use that frozen input at invocation and this routing table:

```ts
const ZIP_EXPORTERS: Readonly<
  Record<ZipExportKind, (ctx: ExportContext) => Promise<Blob>>
> = {
  byAnimation: exportByAnimationZip,
  byItem: exportByItemZip,
  byAnimItem: exportByAnimItemZip,
  byFrame: exportByFrameZip,
};
```

Bundle uses `exportSpritesheetBundle`; TXT/CSV use core credit formatters; ZIP creates the browser adapter and exact `ExportContext`. Call `assertExportableCredits` before artifact work. Do not catch errors in this helper.

- [ ] **Step 4: Run export helper and existing artifact tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/character-export.test.ts test/spritesheet-export.test.ts test/zip-export.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS. `DownloadPopover` may temporarily call the new helper while still owning state; UI behavior remains unchanged.

- [ ] **Step 5: Commit Task 3**

```bash
rtk git add packages/web/src/lib/character-export.ts packages/web/test/character-export.test.ts packages/web/src/components/layer-stack/popovers/download-popover.tsx
rtk git commit -m "refactor(web): centralize browser export workflows"
```

After review, mark the task complete and record implementation note, commit hash, and verification.

## Task 4: Extract character-export state and concurrency into a hook

**Files:**
- Create: `packages/web/src/hooks/use-character-export.ts`
- Create: `packages/web/test/use-character-export.test.ts`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`
- Modify: `packages/web/test/download-popover.test.ts`

**Interfaces:**
- Produces `readyExportSheet(result): ComposedSheet | null`, returning a sheet only for `status === 'ready'`.
- Produces `ExportExecutionGate` with `tryStart(): boolean`, `finish(): void`, and `running: boolean`; a second synchronous start is rejected and finish enables retry.
- Produces `UseCharacterExportResult` with `disabled`, `disabledReasonKey`, `running`, and callbacks `downloadBundle`, `downloadCreditsTxt`, `downloadCreditsCsv`, and `downloadZip(kind)`.
- Hook freezes one `CharacterExportInput` before awaiting, rejects duplicate execution, maps missing-credit versus generic errors, keeps the popover open on error, clears running state in `finally`, and closes/reports success only after download completes.

- [ ] **Step 1: Write failing readiness and execution-gate tests**

Move the retained-sheet test from `download-popover.test.ts` and add duplicate/retry cases:

```ts
expect(readyExportSheet(loadingWithPriorSheet)).toBeNull();

const gate = new ExportExecutionGate();
expect(gate.tryStart()).toBe(true);
expect(gate.tryStart()).toBe(false);
gate.finish();
expect(gate.tryStart()).toBe(true);
```

Add a pure `runGuardedExport(gate, task)` helper test where the first task rejects, `gate.running` returns false, and a second task succeeds. This is the hook's retry contract without adding a DOM hook-testing dependency.

- [ ] **Step 2: Run focused test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/use-character-export.test.ts test/download-popover.test.ts`

Expected: FAIL because the hook contract is absent and the old component export still owns readiness.

- [ ] **Step 3: Implement the hook and guarded runner**

Use this state shape:

```ts
export interface ExportRunningState {
  readonly kind: CharacterExportKind;
  readonly progress: number;
}

export interface UseCharacterExportResult {
  readonly disabled: boolean;
  readonly disabledReasonKey: 'download.loading' | 'download.failed';
  readonly running: ExportRunningState | null;
  readonly downloadBundle: () => Promise<void>;
  readonly downloadCreditsTxt: () => Promise<void>;
  readonly downloadCreditsCsv: () => Promise<void>;
  readonly downloadZip: (kind: ZipExportKind) => Promise<void>;
}
```

All action callbacks call one internal `run(kind)`. Capture `sheet`, `anim`, selections, composer callbacks, overlay, and label callback through `freezeCharacterExportInput` before the first `await`. `runGuardedExport` must always release the gate in `finally`; progress callbacks must be ignored after that run finishes.

- [ ] **Step 4: Wire harness and reduce popover to action props**

Move `zipRunning` state out of harness into the hook. `DownloadPopover` props become:

```ts
interface Props {
  open: boolean;
  setOpen: (value: boolean) => void;
  disabled: boolean;
  disabledReason: string;
  running: ExportRunningState | null;
  onBundle: () => void;
  onCreditsTxt: () => void;
  onCreditsCsv: () => void;
  onZip: (kind: ZipExportKind) => void;
  t: Translator;
}
```

The component must not import from core, adapters, `lib/character-export`, `lib/spritesheet-export`, `lib/zip-export` values, or `lib/download`. A type-only `ZipExportKind` import may come from the export hook or a focused shared type module.

- [ ] **Step 5: Verify lifecycle, UI, and browser contracts**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/use-character-export.test.ts test/download-popover.test.ts test/character-export.test.ts test/spritesheet-export.test.ts test/zip-export.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web exec playwright test -c playwright.download.config.ts e2e/download-attribution.spec.ts e2e/composition-loading-lock.spec.ts
rtk pnpm check:boundaries
```

Expected: PASS; seven download controls, error copy, popover-open-on-error, stale-sheet lock, filenames, archive contents, and progress display remain unchanged.

- [ ] **Step 6: Commit Task 4**

```bash
rtk git add packages/web/src/hooks/use-character-export.ts packages/web/test/use-character-export.test.ts packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/test/download-popover.test.ts
rtk git commit -m "refactor(web): extract character export hook"
```

After review, mark the task complete and record implementation note, commit hash, and verification.

## Task 5: Verify the complete extraction and record evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-web-responsibility-extractions.md`

**Interfaces:**
- Produces the completed Plan 4 record with checked tasks, implementation notes, exact commit hashes, reviewer outcomes, and fresh verification.
- Does not change runtime behavior or touch `upstream/`.

- [ ] **Step 1: Inspect responsibility boundaries**

Run:

```bash
rtk rg -n "composeSelections|createBrowserCanvasAdapter|URL\.revokeObjectURL|exportByAnimationZip|exportSpritesheetBundle|downloadBlob" packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/popovers/download-popover.tsx
rtk wc -l packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/src/hooks/use-single-item-composer.ts packages/web/src/hooks/use-custom-overlay.ts packages/web/src/hooks/use-character-export.ts packages/web/src/lib/character-export.ts
```

Expected: the forbidden low-level symbols produce no component matches; `harness.tsx` remains the orchestrator and `DownloadPopover` contains only rendering/event forwarding.

- [ ] **Step 2: Run full workspace and browser verification**

Run:

```bash
rtk pnpm check:boundaries
rtk pnpm typecheck
rtk pnpm test
rtk pnpm --filter @lpc-toolkit/web test:e2e
rtk git diff --check
rtk git status --short
```

Expected: PASS; status shows only intentional Plan 4 work plus the preserved untracked `docs/README-ARCHITECTURE-AUDIT.tmp.md`.

- [ ] **Step 3: Run isolated parity when execution approval allows it**

Use the absolute isolated checkout at the pinned SHA, never tracked `upstream/`:

```bash
rtk env LPC_UPSTREAM_PARITY_DIR=/private/tmp/lpc-toolkit-upstream-parity-212abfd pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected: all parity cases PASS. If approval review again blocks third-party dependency/server execution, record the exact external blocker and rely on the dedicated CI parity job; do not substitute the submodule or report PASS.

- [ ] **Step 4: Review behavior preservation and commit evidence**

Compare the final diff to Batch D and confirm reducer actions, hash/token identity, pixels, attribution, ZIP layouts, filenames, status/progress, custom overlay lifecycle, and visible controls are unchanged. Update every completed task with implementation note, commit hash, and verification, then run:

```bash
rtk git add docs/superpowers/plans/2026-07-11-web-responsibility-extractions.md
rtk git commit -m "docs(plan): record web extraction completion"
```

## Final Acceptance Criteria

- `harness.tsx` remains the editor orchestrator but no longer constructs browser adapters, calls core composition for single items, or revokes overlay URLs.
- `DownloadPopover` imports no core composition/export/browser workflow implementation and only renders props plus forwards actions.
- Full-item and layer-specific ZIP composition preserve exact selections, palette resolution, and layer behavior.
- Overlay replacement, stale completion, clear, and unmount ownership revoke each object URL exactly once.
- Every export uses frozen ready-sheet inputs, blocks duplicates, clears state after failure, and permits retry.
- All existing download artifacts, credit rules, names, ZIP layouts, progress UI, status copy, and editor layout remain unchanged.
- Focused unit tests, workspace tests/typecheck/boundaries, general E2E, download E2E, and approved isolated parity verification pass or carry only the explicitly documented external parity-execution blocker.
- `packages/core/`, dependencies, assets, and tracked `upstream/` remain unchanged.
