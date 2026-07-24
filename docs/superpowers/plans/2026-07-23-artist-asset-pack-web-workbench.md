# Artist Asset Pack Web Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only workbench that safely uploads, repairs, validates, previews, and downloads one Phase 2 LPC asset pack while preserving CLI archive parity, attribution, and non-installable draft governance.

**Architecture:** Extract the environment-neutral asset-pack payload, ZIP trust boundary, deterministic writer, PNG preflight, and compatibility contracts into a new internal `@lpc-toolkit/asset-pack-format` workspace package with injected runtime ports. Keep Core responsible for schema, normalization, validation, compilation, and attribution; keep Node filesystem/install transactions in CLI; keep browser capabilities, Worker orchestration, in-memory editing, preview, and download in Web.

**Tech Stack:** TypeScript 5.7 strict mode, pnpm 9 workspaces, Vitest 2, React 18, Vite 6 Web Workers, Playwright 1.60, Web Crypto, `DecompressionStream`, existing JSZip 3.10.1 (MIT), Node 22 `crypto`/`zlib`, existing Core canvas ports, Tailwind and existing shadcn-style controls.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-07-23-artist-asset-pack-web-workbench-design.md`.
- Prefix every repository command with `rtk`; use pnpm for repository development.
- Add no new third-party dependency. Reuse the existing `jszip@^3.10.1` dependency, licensed MIT, only for trusted deterministic writing.
- Do not add `any`. Preserve strict TypeScript, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Never initialize, read as a normal workflow dependency, mutate, or commit inside `upstream/`.
- Do not mutate checked-in `assets/`, the managed cache, the uploaded `File`, or an artist workspace.
- Keep `packages/core/` free of Node, React, DOM/browser globals, filesystem APIs, ZIP implementations, and concrete canvas implementations.
- Keep `packages/asset-pack-format/` free of Node, React, DOM/browser globals, filesystem APIs, CLI imports, Web imports, and concrete canvas implementations.
- Preserve Phase 2 formal archive bytes, limits, checksum schema, digest values, diagnostic codes, and lifecycle outcomes for existing fixtures.
- Preserve exact archive limits: 4,096 entries; 1 MiB manifest; 64 MiB encoded or decoded entry; 512 MiB encoded-entry total and decoded total; 1,024 UTF-8 path bytes; existing encoded-archive maximum; no ZIP64.
- Parse untrusted ZIP metadata before inflation and stop inflation before output exceeds declared or configured bounds.
- Use the one optional v1 manifest field `status: "draft"`; omit it from formal packs and from the existing acknowledgement content-digest projection.
- CLI `asset inspect` must report draft, `asset install` must reject draft before staging, and `asset doctor` must treat any draft in managed state as unhealthy.
- The Web workbench edits exactly one pack in memory. No IndexedDB, backend, registry, second third-party pack, blank-pack creator, or full embedded composer.
- Preview only the current error-free revision; never show a stale image as current.
- Every preview and formal download must preserve matching base-plus-pack attribution. Missing attribution is never acknowledgeable.
- A warning requires one exact acknowledgement with a non-empty human reason. Do not implement acknowledge-all.
- Formal download requires zero errors, every current warning acknowledged, complete credits, a valid candidate archive, and a greater version when the release fingerprint changed, the upload is draft, or candidate bytes differ from an uploaded formal archive.
- Use the repository's plan record rule after every implemented step: check the item, add implementation and exact verification PASS/FAIL notes, and record the full product commit hash after committing.
- Keep each task's product commit separate from its plan-record commit.

## CLI Documentation Impact

Reassess this matrix before implementation and again before handoff:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: update
```

The eventual PR body must declare:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering, releasing, plugin
CLI docs reason: Phase 3 adds shared archive packaging, explicit draft rejection, browser correction, and new verification/release ownership.
```

## File and Responsibility Map

### New shared package

- `packages/asset-pack-format/package.json` — private workspace package metadata, existing JSZip dependency, build/test/typecheck scripts.
- `packages/asset-pack-format/tsconfig.json` — environment-neutral source build.
- `packages/asset-pack-format/vitest.config.ts` — source-level tests with public Core alias.
- `packages/asset-pack-format/src/runtime.ts` — SHA-256, fatal UTF-8, UTF-8 encoding, and bounded raw-DEFLATE ports.
- `packages/asset-pack-format/src/canonical-json.ts` — recursively sorted JSON bytes.
- `packages/asset-pack-format/src/payload.ts` — immutable manifest/source parsing, expected-source coverage, source/content digests.
- `packages/asset-pack-format/src/deflate.ts` — allocation-free raw-DEFLATE block/Huffman preflight with exact stream consumption and decoded-size accounting.
- `packages/asset-pack-format/src/archive.ts` — ZIP metadata parser, repair/verified snapshots, checksums, deterministic formal/draft writer.
- `packages/asset-pack-format/src/png.ts` — PNG IHDR/CRC preflight and decoded-pixel inspection.
- `packages/asset-pack-format/src/compatibility.ts` — shared CLI-version/capability diagnostics.
- `packages/asset-pack-format/src/index.ts` — public package exports only.
- `packages/asset-pack-format/test/*.test.ts` — payload, archive, deterministic-byte, PNG, compatibility, and cross-runtime conformance coverage.

### Core changes

- `packages/core/src/asset-pack-schema.ts` — optional strict draft status.
- `packages/core/src/asset-pack-model.ts` — normalized draft status, reconstruction, unchanged content projection.
- `packages/core/src/asset-pack-baseline.ts` — canonical definition and credit projections for runtime hashing.
- `packages/core/src/asset-pack-validation.ts` — recolor source-ramp decisions shared by Node and Web.
- `packages/core/src/index.ts` — public exports for the new pure contracts.
- Existing Core tests — strict status, content-digest projection, baseline projection, acknowledgement, and recolor parity.

### CLI changes

- `packages/cli/src/asset-pack-node-runtime.ts` — Node implementations of shared format and PNG decode ports.
- `packages/cli/src/asset-pack-archive-format.ts` — bounded filesystem wrapper and verified extraction only.
- `packages/cli/src/asset-pack-payload.ts` — Node digest wrapper or compatibility re-export around shared payload parsing.
- `packages/cli/src/asset-pack-compatibility.ts` — compatibility re-export for existing internal imports.
- Existing inspection, validation, packaging, install, state, doctor, and command presentation modules — asynchronous shared format calls and draft policy.
- `packages/cli/scripts/vendor-workspace-deps.mjs` and CLI build metadata — vendor the internal format package into the public tarball.

### Web runtime and domain

- `packages/web/src/adapter/asset-pack-format-runtime.ts` — Web Crypto, fatal UTF-8, and bounded streaming DEFLATE.
- `packages/web/src/adapter/asset-pack-png-decoder.ts` — worker-safe `createImageBitmap`/`OffscreenCanvas` PNG pixels.
- `packages/web/src/adapter/asset-pack-preview-canvas-adapter.ts` — exact pack destination bytes before official base ZIP fallback.
- `packages/web/src/lib/asset-pack-worker-protocol.ts` — serializable request, progress, validation, and archive message types.
- `packages/web/src/lib/asset-pack-worker-client.ts` — request IDs, revision filtering, worker lifetime, and retry.
- `packages/web/src/lib/asset-pack-baseline.ts` — official catalog, palettes, definition/credit digests, release identity, and compatibility baseline.
- `packages/web/src/lib/asset-pack-preview.ts` — compiled overlay catalog, focused pack selection, imported character selection, matched credits.
- `packages/web/src/lib/asset-pack-download.ts` — filenames, exact revision download, and Blob handoff.
- `packages/web/src/workers/asset-pack-worker.ts` — browser Worker entry.
- `packages/web/src/workers/asset-pack-worker-session.ts` — one in-memory archive session, edits, validation, candidate caching, and assembly.
- `packages/web/src/slice/asset-pack-workbench.ts` — pure UI state and navigation transitions.
- `packages/web/src/slice/asset-pack-release.ts` — release fingerprint and draft/formal gate decisions.
- `packages/web/src/hooks/use-asset-pack-workbench.ts` — Worker orchestration and unload protection.
- `packages/web/src/hooks/use-asset-pack-preview.ts` — latest-only composition and object lifetime.

### Web presentation

- `packages/web/src/components/asset-pack-workbench/harness.tsx` — top-level route orchestrator.
- `upload-panel.tsx` — initial drop zone and file picker.
- `workbench-nav.tsx` — left status/navigation region.
- `workbench-preview.tsx` — center preview and controls.
- `workbench-editor.tsx` — right panel routing.
- `overview-editor.tsx`, `manifest-json-editor.tsx`, `source-list.tsx`, `warnings-editor.tsx`, `credits-editor.tsx`, `diagnostic-list.tsx` — focused editors.
- `attribution-panel.tsx` and `download-bar.tsx` — matched credits and release actions.

### Verification and documentation

- New Web unit tests and `packages/web/e2e/asset-pack-workbench.spec.ts`.
- Existing CLI archive/lifecycle/package smoke tests and Web app/landing tests.
- `scripts/check-boundaries.mjs`, `packages/web/test/boundary-check.test.ts`, `.github/workflows/ci.yml`, and package-script tests.
- CLI help/README, root README, landing, architecture, engineering, releasing, and the animation-audit plugin workflow reference.

## Stable Interfaces

These names are fixed for this plan. Change them only by updating every later task and its snippets before implementation continues.

```ts
// packages/core/src/asset-pack-schema.ts
export type AssetPackStatus = 'draft';

export interface AssetPackSource {
  readonly schema: typeof ASSET_PACK_SCHEMA;
  readonly status?: AssetPackStatus;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly credits: AssetPackCreditSource;
  readonly creditOverrides?: Readonly<Record<string, AssetPackCreditSource>>;
  readonly replaces?: readonly AssetPackReplacementSource[];
  readonly acknowledgements?: readonly AssetPackAcknowledgement[];
  readonly compatibility?: AssetPackCompatibilitySource;
  readonly assets: readonly AssetPackAssetSource[];
}
```

```ts
// packages/asset-pack-format/src/runtime.ts
export type AssetPackSha256 = `sha256:${string}`;

export interface InflateRawBoundedOptions {
  readonly compressed: Uint8Array;
  readonly declaredSize: number;
  readonly maximumSize: number;
}

export interface AssetPackFormatRuntime {
  readonly sha256: (bytes: Uint8Array) => Promise<AssetPackSha256>;
  readonly decodeUtf8Fatal: (bytes: Uint8Array) => string;
  readonly encodeUtf8: (value: string) => Uint8Array;
  readonly inflateRawBounded: (
    options: InflateRawBoundedOptions,
  ) => Promise<Uint8Array>;
}
```

```ts
// packages/asset-pack-format/src/deflate.ts
export interface RawDeflateInspection {
  readonly decodedSize: number;
  readonly consumedBytes: number;
}

export function inspectRawDeflate(
  options: InflateRawBoundedOptions,
): RawDeflateInspection;
```

```ts
// packages/asset-pack-format/src/payload.ts
export interface AssetPackPayloadDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly sourcePath?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackPayloadSuccess {
  readonly ok: true;
  readonly manifestBytes: Uint8Array;
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly sourceDigests: ReadonlyMap<string, AssetPackSha256>;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: AssetPackSha256;
}

export type AssetPackPayloadResult =
  | AssetPackPayloadSuccess
  | {
      readonly ok: false;
      readonly diagnostics: readonly AssetPackPayloadDiagnostic[];
    };

export async function parseAssetPackPayload(options: {
  readonly manifestBytes: Uint8Array;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly runtime: AssetPackFormatRuntime;
}): Promise<AssetPackPayloadResult>;
```

```ts
// packages/asset-pack-format/src/archive.ts
export interface AssetPackArchiveDiagnostic {
  readonly code:
    | 'asset_archive_unsafe'
    | 'asset_archive_limit_exceeded'
    | 'asset_archive_invalid'
    | 'asset_checksum_invalid'
    | 'asset_digest_mismatch';
  readonly message: string;
  readonly path?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackRepairSnapshot {
  readonly archiveBytes: Uint8Array;
  readonly archiveDigest: AssetPackSha256;
  readonly manifestBytes?: Uint8Array;
  readonly manifestDocument?: Readonly<Record<string, unknown>>;
  readonly checksumsBytes?: Uint8Array;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly entryCount: number;
  readonly totalUncompressedBytes: number;
}

export interface AssetPackVerifiedSnapshot extends AssetPackRepairSnapshot {
  readonly manifestBytes: Uint8Array;
  readonly manifestDocument: Readonly<Record<string, unknown>>;
  readonly checksumsBytes: Uint8Array;
  readonly payload: AssetPackPayloadSuccess;
}

export type AssetPackArchiveInspection =
  | {
      readonly kind: 'unsafe';
      readonly diagnostics: readonly AssetPackArchiveDiagnostic[];
    }
  | {
      readonly kind: 'repairable';
      readonly snapshot: AssetPackRepairSnapshot;
      readonly diagnostics: readonly AssetPackArchiveDiagnostic[];
    }
  | {
      readonly kind: 'verified';
      readonly snapshot: AssetPackVerifiedSnapshot;
      readonly diagnostics: readonly [];
    };

export async function inspectAssetPackArchiveBytes(options: {
  readonly archiveBytes: Uint8Array;
  readonly runtime: AssetPackFormatRuntime;
}): Promise<AssetPackArchiveInspection>;

export async function createAssetPackArchive(options: {
  readonly kind: 'draft' | 'formal';
  readonly manifestDocument: Readonly<Record<string, unknown>>;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly runtime: AssetPackFormatRuntime;
}): Promise<{
  readonly archiveBytes: Uint8Array;
  readonly archiveDigest: AssetPackSha256;
  readonly inspection: Extract<AssetPackArchiveInspection, { readonly kind: 'verified' | 'repairable' }>;
}>;
```

```ts
// packages/web/src/lib/asset-pack-worker-protocol.ts
export interface AssetPackWorkerBaseline {
  readonly releaseTag: string;
  readonly cliVersion: string;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly definitionDigests: ReadonlyMap<ItemId, AssetPackSha256>;
  readonly creditDigests: ReadonlyMap<ItemId, AssetPackSha256>;
}

export type AssetPackWorkerRequest =
  | {
      readonly type: 'open';
      readonly requestId: number;
      readonly revision: 0;
      readonly file: File;
      readonly baseline: AssetPackWorkerBaseline;
    }
  | {
      readonly type: 'replace-manifest';
      readonly requestId: number;
      readonly revision: number;
      readonly manifestText: string;
      readonly origin:
        | 'overview-form'
        | 'credits-form'
        | 'advanced-json'
        | 'raw-repair'
        | 'acknowledgement';
    }
  | {
      readonly type: 'replace-source';
      readonly requestId: number;
      readonly revision: number;
      readonly path: string;
      readonly file: File;
    }
  | {
      readonly type: 'remove-source';
      readonly requestId: number;
      readonly revision: number;
      readonly path: string;
    }
  | {
      readonly type: 'assemble';
      readonly requestId: number;
      readonly revision: number;
      readonly kind: 'draft' | 'formal';
    };

export interface AssetPackSourceSummary {
  readonly path: string;
  readonly referenced: boolean;
  readonly consumerCount: number;
  readonly byteLength?: number;
  readonly digest?: AssetPackSha256;
  readonly width?: number;
  readonly height?: number;
  readonly state: 'ready' | 'missing' | 'unreferenced' | 'invalid';
}

export interface AssetPackWorkbenchDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly scope:
    | 'archive'
    | 'manifest'
    | 'source'
    | 'warning'
    | 'credit'
    | 'release';
  readonly path?: string;
  readonly subject?: Readonly<Record<string, string | readonly string[]>>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackPreviewSource {
  readonly destinationPath: string;
  readonly sourcePath: string;
  readonly bytes: Uint8Array;
}

export interface AssetPackPreviewPayload {
  readonly revision: number;
  readonly packId: string;
  readonly compilePlan: AssetPackCompilePlan;
  readonly sources: readonly AssetPackPreviewSource[];
}

export interface AssetPackFormalCandidate {
  readonly revision: number;
  readonly archiveDigest: AssetPackSha256;
  readonly version: string;
  readonly byteIdenticalToUploadedFormal: boolean;
}

export interface AssetPackWorkbenchRevision {
  readonly revision: number;
  readonly manifestText: string;
  readonly sourceSummaries: readonly AssetPackSourceSummary[];
  readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
  readonly contentDigest?: AssetPackSha256;
  readonly releaseFingerprint?: AssetPackSha256;
  readonly preview?: AssetPackPreviewPayload;
  readonly formalCandidate?: AssetPackFormalCandidate;
  readonly draftSerializable: boolean;
}

export type AssetPackWorkerProgressStage =
  | 'reading-archive'
  | 'inspecting-archive'
  | 'verifying-checksums'
  | 'inspecting-sources'
  | 'compiling-preview'
  | 'assembling-archive';

export type AssetPackWorkerResponse =
  | {
      readonly type: 'progress';
      readonly requestId: number;
      readonly revision: number;
      readonly stage: AssetPackWorkerProgressStage;
    }
  | {
      readonly type: 'session';
      readonly requestId: number;
      readonly revision: number;
      readonly outcome: 'editing';
      readonly workbench: AssetPackWorkbenchRevision;
    }
  | {
      readonly type: 'session';
      readonly requestId: number;
      readonly revision: 0;
      readonly outcome: 'unsafe';
      readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[];
    }
  | {
      readonly type: 'assembled';
      readonly requestId: number;
      readonly revision: number;
      readonly kind: 'draft' | 'formal';
      readonly archiveBytes: ArrayBuffer;
      readonly archiveDigest: AssetPackSha256;
    }
  | {
      readonly type: 'failed';
      readonly requestId: number;
      readonly revision: number;
      readonly diagnostic: AssetPackWorkbenchDiagnostic;
    };
```

```ts
// packages/web/src/slice/asset-pack-release.ts
export type AssetPackFormalBlocker =
  | 'validation-pending'
  | 'errors-present'
  | 'warnings-unacknowledged'
  | 'credits-incomplete'
  | 'version-invalid'
  | 'version-increase-required'
  | 'candidate-not-verified';

export interface AssetPackFormalGate {
  readonly ready: boolean;
  readonly blockers: readonly AssetPackFormalBlocker[];
  readonly suggestedVersion?: string;
}
```

## Task 1: Extend Core with draft status and shared digest projections

**Files:**
- Modify: `packages/core/src/asset-pack-schema.ts`
- Modify: `packages/core/src/asset-pack-model.ts`
- Create: `packages/core/src/asset-pack-baseline.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/asset-pack-schema.test.ts`
- Modify: `packages/core/test/asset-pack-validation.test.ts`
- Create: `packages/core/test/asset-pack-baseline.test.ts`

**Interfaces:**
- Consumes: existing strict v1 parser, normalized source reconstruction, acknowledgement content projection, `ItemDefinition`.
- Produces: `AssetPackStatus`, normalized optional `status`, unchanged existing content projection, `assetPackDefinitionProjection`, and `assetPackCreditProjection`.

- [x] **Step 1: Write failing strict-status and content-projection tests**
  - Added strict draft status and content projection equivalence tests to `packages/core/test/asset-pack-schema.test.ts`.
  - Added test proving draft status change preserves existing acknowledgements while version or substantive field change invalidates them in `packages/core/test/asset-pack-validation.test.ts`.

- [x] **Step 2: Write failing baseline-projection tests**
  - Created `packages/core/test/asset-pack-baseline.test.ts` testing `assetPackDefinitionProjection` (omitting `credits`, `itemId`, `sourcePath`) and `assetPackCreditProjection`, with key-order independence.

- [x] **Step 3: Run Core tests and verify RED**
  - Command: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts asset-pack-validation.test.ts asset-pack-baseline.test.ts`
  - Output: RED (FAIL - `asset-pack-baseline.js` missing; `status` parsing failure on draft test case).

- [x] **Step 4: Implement the minimal pure Core contracts**
  - Updated `packages/core/src/asset-pack-schema.ts`: added `AssetPackStatus` type (`'draft'`), optional `status` to `AssetPackSource`, schema validation for top-level `status`.
  - Updated `packages/core/src/asset-pack-model.ts`: added `status` to `NormalizedAssetPack`, updated normalization and source reconstruction without changing `assetPackContentProjection`.
  - Created `packages/core/src/asset-pack-baseline.ts`: added `assetPackDefinitionProjection` and `assetPackCreditProjection` with recursive key sorting.
  - Updated `packages/core/src/index.ts`: exported `AssetPackStatus`, `assetPackDefinitionProjection`, and `assetPackCreditProjection`.

- [x] **Step 5: Verify GREEN and architecture isolation**
  - Verification:
    - `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts asset-pack-validation.test.ts asset-pack-baseline.test.ts` PASS (51 tests passed)
    - `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
    - `rtk pnpm check:boundaries` PASS
    - `rtk pnpm --filter @lpc-toolkit/core test` PASS (334 tests passed)

- [x] **Step 6: Commit Task 1**
  - Product Commit: `138858fd68a1d4beb7fc3f883cf839bc8b2a79f6` (`feat(core): model asset pack draft status`)


---

## Task 2: Scaffold the environment-neutral format package and payload contract

**Files:**
- Create: `packages/asset-pack-format/package.json`
- Create: `packages/asset-pack-format/tsconfig.json`
- Create: `packages/asset-pack-format/vitest.config.ts`
- Create: `packages/asset-pack-format/src/runtime.ts`
- Create: `packages/asset-pack-format/src/canonical-json.ts`
- Create: `packages/asset-pack-format/src/payload.ts`
- Create: `packages/asset-pack-format/src/compatibility.ts`
- Create: `packages/asset-pack-format/src/index.ts`
- Create: `packages/asset-pack-format/test/payload.test.ts`
- Create: `packages/asset-pack-format/test/compatibility.test.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/check-boundaries.mjs`
- Modify: `packages/web/test/boundary-check.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/web/test/package-scripts.test.ts`

**Interfaces:**
- Consumes: Core parse/normalize/content projection/version comparison, existing supported capability list, injected `AssetPackFormatRuntime`.
- Produces: public runtime types, canonical JSON bytes, immutable `AssetPackPayloadSuccess`, and shared compatibility diagnostics.

- [x] **Step 1: Write failing package payload and compatibility tests**
  - Created `packages/asset-pack-format/test/payload.test.ts` and `packages/asset-pack-format/test/compatibility.test.ts`.

- [x] **Step 2: Write failing boundary and CI-routing tests**
  - Added format package boundary check cases to `packages/web/test/boundary-check.test.ts` and CI filter verification to `packages/web/test/package-scripts.test.ts`.

- [x] **Step 3: Run focused tests and verify RED**
  - Ran `rtk pnpm --filter @lpc-toolkit/asset-pack-format test`: RED (No projects matched filter)
  - Ran `rtk pnpm --filter @lpc-toolkit/web test -- boundary-check.test.ts package-scripts.test.ts`: RED (9 tests failed: boundary check rules missing for format package, CI filter missing in ci.yml)

- [x] **Step 4: Create the package and minimal payload implementation**
  - Created `packages/asset-pack-format/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/runtime.ts`, `src/canonical-json.ts`, `src/payload.ts`, `src/compatibility.ts`, `src/index.ts`.

- [x] **Step 5: Extend boundaries and CI routing**
  - Updated `scripts/check-boundaries.mjs` and `.github/workflows/ci.yml`.
  - Historical correction: the `pnpm-lock.yaml` workspace entry was omitted from the Task 2 product commit and landed in Task 3 product commit `63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab`.

- [x] **Step 6: Verify GREEN**
  - `rtk pnpm --filter @lpc-toolkit/asset-pack-format test`: PASS (7 passed)
  - `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck`: PASS
  - `rtk pnpm --filter @lpc-toolkit/asset-pack-format build`: PASS
  - `rtk pnpm --filter @lpc-toolkit/web test -- boundary-check.test.ts package-scripts.test.ts`: PASS (115 passed)
  - `node scripts/check-boundaries.mjs`: PASS

- [x] **Step 7: Commit Task 2**
  - Product Commit: `9b6b09f150dd30dd45f72bffe2019143b4dbb158` (`feat(format): add shared asset pack payload contracts`)

---

## Task 3: Extract the strict ZIP trust boundary and deterministic writer

**Files:**
- Create: `packages/asset-pack-format/src/deflate.ts`
- Create: `packages/asset-pack-format/src/archive.ts`
- Create: `packages/asset-pack-format/test/deflate.test.ts`
- Create: `packages/asset-pack-format/test/archive.test.ts`
- Create: `packages/asset-pack-format/test/archive-conformance.test.ts`
- Modify: `packages/asset-pack-format/src/index.ts`
- Modify: `packages/cli/test/asset-pack-archive-format.test.ts`
- Read-only source for porting: `packages/cli/src/asset-pack-archive-format.ts`

**Interfaces:**
- Consumes: Task 2 runtime/payload/canonical JSON contracts and existing JSZip writer behavior.
- Produces: allocation-free raw-DEFLATE preflight, `inspectAssetPackArchiveBytes`, unsafe/repairable/verified snapshots, exact archive constants, and `createAssetPackArchive`.

- [x] **Step 1: Port failing raw-ZIP security and bounds tests**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- archive.test.ts` PASS

- [x] **Step 2: Write failing allocation-free raw-DEFLATE tests**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- deflate.test.ts` PASS

- [x] **Step 3: Write failing repairable-versus-verified tests**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- archive.test.ts` PASS

- [x] **Step 4: Write failing deterministic formal/draft writer tests**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- archive-conformance.test.ts` PASS

- [x] **Step 5: Run shared archive tests and verify RED**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- deflate.test.ts archive.test.ts archive-conformance.test.ts` PASS (Verified RED before implementation, now GREEN)

- [x] **Step 6: Implement the raw-DEFLATE preflight and port ZIP metadata parsing**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- deflate.test.ts archive.test.ts` PASS

- [x] **Step 7: Implement checksum classification and deterministic assembly**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- archive.test.ts` PASS

- [x] **Step 8: Verify GREEN and exact legacy fixture parity**
  - Commit: 63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab
  - Verification:
    - `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- deflate.test.ts archive.test.ts archive-conformance.test.ts` PASS
    - `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts` PASS
    - `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck` PASS
    - `rtk pnpm check:boundaries` PASS

- [x] **Step 9: Commit Task 3**
  - Product Commit: `63fda43d551ac2c761eb6fbfccac0cf3ab7b80ab` (`feat(format): share bounded asset pack archives`)
  - Plan Record Commit: `1a904b152c5433930b43859b9903dbc29030331c` (`docs(plan): record task 3 implementation evidence`)

---

## Task 4: Migrate CLI archive and payload behavior to the shared package

**Files:**
- Create: `packages/cli/src/asset-pack-node-runtime.ts`
- Modify: `packages/cli/src/asset-pack-archive-format.ts`
- Modify: `packages/cli/src/asset-pack-payload.ts`
- Modify: `packages/cli/src/asset-pack-compatibility.ts`
- Modify: `packages/cli/src/asset-pack-files.ts`
- Modify: `packages/cli/src/asset-pack-packaging.ts`
- Modify: `packages/cli/src/asset-pack-inspection.ts`
- Modify: `packages/cli/src/asset-pack-install.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/tsconfig.json`
- Modify: `packages/cli/tsconfig.build.json`
- Modify: `packages/cli/scripts/vendor-workspace-deps.mjs`
- Modify: existing CLI payload/archive/packaging/inspection/install tests
- Modify: `packages/cli/test/package-metadata.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3 shared package and Phase 2 filesystem/extraction contracts.
- Produces: Node runtime adapter, asynchronous shared archive inspection, unchanged CLI public reports, and a packed CLI with vendored format code.

- [x] **Step 1: Write failing Node-adapter and vendoring tests**

Assert SHA-256 includes the `sha256:` prefix, fatal UTF-8 rejects invalid bytes, and bounded inflate rejects output beyond `declaredSize` or `maximumSize`. Extend package metadata and smoke assertions so the built CLI contains `dist/vendor/@lpc-toolkit/asset-pack-format/dist/index.js` and no unresolved workspace import.

  - Added `asset-pack-node-runtime.test.ts`, package metadata assertions, and packed-smoke vendoring assertions.
  - Commit: `96e70f4592ecd47686fc414fcaca551b318950c7`
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-node-runtime.test.ts package-metadata.test.ts` PASS.

- [x] **Step 2: Change existing archive tests to await shared inspection**

Update each direct `readAssetPackArchive(...)` call to `await`. Preserve every existing expected diagnostic, byte count, immutable snapshot, extraction, and deterministic writer assertion. Do not delete raw ZIP cases merely because they also exist in the shared suite.

Retain the Task 3 frozen archive-hex/digest/manifest inline snapshots. After
the legacy writer body is removed, make the same test exercise the shared
package through `nodeAssetPackFormatRuntime`; the expected values must not be
updated.

  - Awaited every archive inspection call while retaining raw ZIP, limit, diagnostic, extraction, and immutable-copy coverage.
  - The production Node runtime now drives frozen archive hex, digest, and manifest-byte assertions.
  - Commits: `96e70f4592ecd47686fc414fcaca551b318950c7`, `dca93ac2a7963ae3f417adffa6d18e7a94afbfca`
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts` PASS.

- [x] **Step 3: Run CLI focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts package-metadata.test.ts
```

Expected: FAIL because CLI is not wired to the new package and vendoring omits it.

  - RED: FAIL with 111 passed and 27 failed across the six requested suites; failures covered incomplete async migration, snapshot shape/copy mismatches, safety-limit parity, and deterministic output.

- [x] **Step 4: Implement the Node runtime and thin wrappers**

Use `node:crypto`, `node:zlib`, and WHATWG encoders only in CLI:

```ts
export const nodeAssetPackFormatRuntime: AssetPackFormatRuntime = {
  sha256: async (bytes) =>
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  decodeUtf8Fatal: (bytes) =>
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  encodeUtf8: (value) => new TextEncoder().encode(value),
  inflateRawBounded: async ({ compressed, declaredSize, maximumSize }) => {
    const limit = Math.min(declaredSize, maximumSize);
    const output = inflateRawSync(compressed, { maxOutputLength: limit });
    if (output.byteLength !== declaredSize) {
      throw new Error('Raw DEFLATE output length does not match its declaration.');
    }
    return new Uint8Array(output);
  },
};
```

Keep descriptor-capped regular-file reads, no-follow filesystem checks, pinned staging identity, and verified extraction in CLI. The wrapper converts shared `Uint8Array` snapshots to copied `Buffer` values and brands only `verified` snapshots for extraction.

  - Added the Node runtime and thin archive/payload wrappers; shared snapshots are copied into CLI `Buffer` values and extraction remains verified-snapshot-only.
  - Preserved the legacy persisted `contentDigest` bytes while keeping archive JSON ordering locale-independent.
  - Removed the shared package's DOM dependency by routing UTF-8 path measurement through the injected runtime.
  - Commits: `96e70f4592ecd47686fc414fcaca551b318950c7`, `dca93ac2a7963ae3f417adffa6d18e7a94afbfca`
  - Verification: `rtk pnpm exec vitest run packages/asset-pack-format/test/payload.test.ts packages/cli/test/asset-pack-archive-format.test.ts packages/cli/test/asset-pack-install.test.ts` PASS (91 tests).

- [x] **Step 5: Migrate callers without changing public output**

Await archive inspection in packaging, inspection, and tests. Keep `asset-pack-payload.ts` and `asset-pack-compatibility.ts` as narrow compatibility wrappers while call sites migrate; they must contain no duplicate domain decisions. A repairable shared result maps to the existing CLI invalid inspection report and never exposes an install snapshot.

Build Core, format, presets, and embedded Web before CLI TypeScript. Add
`@lpc-toolkit/asset-pack-format` as a CLI workspace development dependency,
add format source aliases to development/build tsconfigs, and vendor it beside
Core/presets. Keep JSZip as the existing public runtime dependency used by the
vendored format writer.

  - Migrated archive, payload, files, packaging, inspection, install, state, sync, validation, doctor, and remove call sites without changing public command syntax or report shapes.
  - Added the format production build, CLI source/build/test aliases, workspace dependency, vendor rewrite, and packed-smoke coverage.
  - Commit: `96e70f4592ecd47686fc414fcaca551b318950c7`
  - CLI documentation impact reassessment:

```text
help: N/A — public command syntax and human/JSON output are unchanged.
cli-readme: N/A — no user-facing CLI workflow or option changed.
root-readme: N/A — package-internal archive implementation only.
landing: N/A — no website or product messaging changed.
architecture: N/A — the approved shared-format/runtime boundary is implemented, not redesigned.
engineering: N/A — existing verification commands remain accurate.
releasing: N/A — no release or publication procedure changed.
plugin: N/A — plugin contracts and command workflow are unchanged.
```

- [x] **Step 6: Verify focused parity and packed output**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts package-metadata.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: PASS. Existing formal archive fixtures retain exact bytes and SHA-256. The packed smoke runs without a workspace checkout or `upstream/`.

  - `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts package-metadata.test.ts` PASS (139 tests).
  - `rtk pnpm --filter @lpc-toolkit/asset-pack-format test` PASS (57 tests).
  - Extended archive/lifecycle matrix PASS (308 tests).
  - `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck` PASS.
  - `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - `rtk pnpm check:boundaries` PASS.
  - `rtk pnpm --filter @lpc-toolkit/cli build` PASS.
  - `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS.
  - `rtk pnpm --filter @lpc-toolkit/cli test` PASS with local-loopback permission.
  - `rtk pnpm verify` PASS with local-loopback permission.
  - Independent Task 4 review: spec compliant and task quality approved; no Critical, Important, or Minor findings remain.

- [x] **Step 7: Commit Task 4**

```sh
rtk git add packages/cli/src packages/cli/test packages/cli/package.json packages/cli/tsconfig.json packages/cli/tsconfig.build.json packages/cli/scripts/vendor-workspace-deps.mjs
rtk git commit -m "refactor(cli): consume shared asset pack archives"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product Commit: `96e70f4592ecd47686fc414fcaca551b318950c7` (`refactor(cli): consume shared asset pack archives`)
  - Review Fix Commit: `dca93ac2a7963ae3f417adffa6d18e7a94afbfca` (`fix(format): preserve archive compatibility boundaries`)
  - Plan Record Commit: recorded separately after these product commits.

---

## Task 5: Share PNG inspection and recolor validation across runtimes

**Files:**
- Create: `packages/asset-pack-format/src/png.ts`
- Create: `packages/asset-pack-format/test/png.test.ts`
- Modify: `packages/asset-pack-format/src/index.ts`
- Modify: `packages/core/src/asset-pack-validation.ts`
- Modify: `packages/core/test/asset-pack-validation.test.ts`
- Modify: `packages/cli/src/asset-pack-node-runtime.ts`
- Modify: `packages/cli/src/asset-pack-validation.ts`
- Modify: `packages/cli/test/asset-pack-validation.test.ts`
- Modify: `packages/cli/test/asset-pack-inspection.test.ts`

**Interfaces:**
- Consumes: normalized pack source uses, Core `standardAnimationGeometry`, runtime-decoded RGBA pixels, palette metadata.
- Produces: strict PNG IHDR preflight, shared `inspectAssetPackSourceBytes`, Node PNG decoder port, and Core-owned recolor source-ramp diagnostics.

- [x] **Step 1: Write failing shared PNG tests**

Port PNG signature, IHDR length/type/CRC, zero/oversized dimensions, bit-depth/color-type, compression, filter, interlace, dimension mismatch, required/optional cell, palette color, and multi-use geometry cases.

Define:

```ts
export interface AssetPackPngDecoder {
  readonly decode: (bytes: Uint8Array) => Promise<{
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8ClampedArray;
  }>;
}

export async function inspectAssetPackSourceBytes(options: {
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly sourceDigests: ReadonlyMap<string, AssetPackSha256>;
  readonly decoder: AssetPackPngDecoder;
}): Promise<readonly AssetPackSourceInspection[]>;
```

Assert malformed IHDR never calls `decoder.decode`.

  - Added `packages/asset-pack-format/test/png.test.ts` covering signature, IHDR structure/CRC, dimensions, bit depth/color type, compression/filter/interlace, geometry, required/optional cells, palettes, decoder call count, and exact same-bounds multi-use layout.

- [x] **Step 2: Write failing Core recolor tests**

Move the configured source-ramp cases out of CLI-only assertions. Given `AssetPackSourceInspection.decoded.paletteColors`, assert missing configured colors produce a deterministic `asset_pack_schema_invalid` error and valid ramps pass for single and multi-color recolor forms.

  - Added Core cases for missing configured source colors, valid single-color ramps, valid multi-color ramps, and same-bounds incompatible shared geometry.

- [x] **Step 3: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- png.test.ts
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-validation.test.ts asset-pack-inspection.test.ts
```

Expected: FAIL because PNG parity and Core recolor validation are not shared.

  - RED evidence: shared PNG failed with `inspectAssetPackSourceBytes is not a function`; Core recolor failed because the new missing-ramp assertion observed the old CLI-only behavior; the CLI focused suites remained green because existing CLI parity had not yet been rewired. The actual RED was recorded before production implementation as required.

- [x] **Step 4: Implement shared inspection and Node decode**

Use `DataView` for IHDR and CRC preflight. Decode once through the injected port, scan exact geometry cells over RGBA bytes, collect sorted `row:column` non-transparent cells and lowercase `#rrggbb` colors, and return Core's existing inspection shape.

The Node decoder uses `@napi-rs/canvas` and the existing canvas adapter to return one full RGBA buffer. It must not enter the shared package.

  - Implemented DataView/CRC PNG preflight, injected `AssetPackPngDecoder`, one decode per source, exact geometry scanning, stable cells/colors, and CLI-only full RGBA decoding through `@napi-rs/canvas`.

- [x] **Step 5: Move recolor decisions into Core**

Fold the existing `validateRecolorSourceRamps` behavior into `validateAssetPack` after geometry/source checks. Delete the duplicate CLI helper. CLI validation calls shared source inspection and then the same Core validator used by Web.

  - Moved source-ramp decisions into Core, removed the duplicate CLI helper, and routed CLI directory/payload/partial-snapshot inspection through the shared inspector. The shared `AssetPackSha256` type was also applied at the CLI payload boundary.

- [x] **Step 6: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- png.test.ts
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-validation.test.ts asset-pack-inspection.test.ts asset-authoring-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm check:boundaries
```

Expected: PASS with identical Node validation diagnostics and attributed preview behavior.

  - Focused PASS: `rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- png.test.ts` (13 tests); `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts` (16 tests); `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-validation.test.ts asset-pack-inspection.test.ts asset-authoring-e2e.test.ts` (37 tests, including attributed authoring preview).
  - Type/boundary PASS: all three listed package typechecks and `rtk pnpm check:boundaries`.
  - Review regression PASS: same-bounds `slash`/`watering` tests now require exact geometry signatures in shared inspection and Core recolor gating.
  - Repository gate PASS: `rtk pnpm verify` passed after a sandbox EPERM on the first attempt; the formal escalated rerun completed all asset-pin, docs-policy, plugin, typecheck, and workspace test stages. Existing test stderr diagnostics were expected fixture logs; process exit was 0.

- [x] **Step 7: Commit Task 5**

```sh
rtk git add packages/asset-pack-format/src packages/asset-pack-format/test/png.test.ts packages/core/src/asset-pack-validation.ts packages/core/test/asset-pack-validation.test.ts packages/cli/src/asset-pack-node-runtime.ts packages/cli/src/asset-pack-validation.ts packages/cli/test/asset-pack-validation.test.ts packages/cli/test/asset-pack-inspection.test.ts
rtk git commit -m "refactor(asset-pack): share PNG validation"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product Commit: `2ec8fd734f289ea6ec7b251085466a4d3b209afe` (`refactor(asset-pack): share PNG validation`)
  - Review Fix Commit: `c6cf930ba73ad1e5a05ef586096c7584589755a6` (`fix(asset-pack): require exact PNG geometry`)
  - Review package: `.superpowers/sdd/review-task-5-web-workbench-4ff7716..c6cf930.diff`
  - Independent review: Spec compliant; Task quality Approved; no Critical, Important, or Minor findings remain.
  - CLI documentation impact reassessment:

```text
help: N/A — no command, flag, help text, or output contract changed.
cli-readme: N/A — validation internals changed, not the public CLI workflow.
root-readme: N/A — no top-level workflow or quick start changed.
landing: N/A — no landing page or checked-in landing artifacts changed.
architecture: N/A — boundaries follow the existing shared-format/Core/CLI design.
engineering: N/A — no verification command or CI mapping changed.
releasing: N/A — no release or publication flow changed.
plugin: N/A — no plugin contract or workflow changed.
```

---

## Task 6: Enforce draft governance in CLI lifecycle commands

**Files:**
- Modify: `packages/cli/src/asset-pack-packaging.ts`
- Modify: `packages/cli/src/asset-pack-inspection.ts`
- Modify: `packages/cli/src/asset-pack-install.ts`
- Modify: `packages/cli/src/asset-pack-state.ts`
- Modify: `packages/cli/src/asset-pack-doctor.ts`
- Modify: `packages/cli/src/asset-commands.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/test/asset-pack-packaging.test.ts`
- Modify: `packages/cli/test/asset-pack-inspection.test.ts`
- Modify: `packages/cli/test/asset-pack-install.test.ts`
- Modify: `packages/cli/test/asset-pack-doctor.test.ts`
- Modify: `packages/cli/test/command-spec.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`

**Interfaces:**
- Consumes: Core draft status and shared formal/draft archive recognition.
- Produces: stable `asset_pack_draft` lifecycle diagnostic, inspect reporting, install pre-staging rejection, doctor unhealthy state, and formal CLI pack refusal.

- [x] **Step 1: Write failing draft lifecycle tests**

Generate a checksum-valid archive with `status: "draft"` and otherwise valid content. Assert:

```ts
expect((await inspectAssetPackArchive(options)).report).toMatchObject({
  valid: false,
  status: 'draft',
  diagnostics: [{ code: 'asset_pack_draft', severity: 'error' }],
});
```

Assert install returns the same code without creating staging, registry, installed source, journal, or output. Seed a managed-state fixture containing a draft and assert doctor is unhealthy. Assert `asset pack` refuses a draft source rather than silently stripping the marker.

- [x] **Step 2: Write failing help and human/JSON presentation tests**

Require `asset inspect --help` to say it reports draft status and `asset install --help` to say draft archives are rejected. Human inspect output must label `DRAFT`; JSON report gains optional `status: "draft"` without changing existing formal report keys.

- [x] **Step 3: Run focused CLI tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts asset-pack-doctor.test.ts command-spec.test.ts main-human.test.ts main-json.test.ts
```

Expected: FAIL because draft is currently treated as an ordinary valid v1 pack.

- [x] **Step 4: Add one lifecycle diagnostic and fail before mutation**

Keep draft out of Core validation errors so Web can preview a draft. Add the lifecycle diagnostic only in CLI packaging/inspection/state:

```ts
export function draftAssetPackDiagnostic(packId: string): AssetPackLifecycleDiagnostic {
  return {
    code: 'asset_pack_draft',
    severity: 'error',
    message: 'Draft asset-pack archives are not installable.',
    packId,
    details: { status: 'draft' },
  };
}
```

Inspection reports identity and counts but no installable snapshot. Install receives no verified inspection snapshot and therefore fails before transaction staging. Doctor reports any impossible legacy/tampered draft state as unhealthy.

- [x] **Step 5: Update help with the exact public contract**

Change only command descriptions/examples required for draft behavior. Do not add `--force`, `--ignore-warnings`, or an install override. Keep existing exit code `1` for invalid inspection/install.

- [x] **Step 6: Verify GREEN and lifecycle non-mutation**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts asset-pack-doctor.test.ts command-spec.test.ts main-human.test.ts main-json.test.ts asset-lifecycle-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS. Existing formal install/no-op/upgrade/downgrade behavior remains unchanged.

- [x] **Step 7: Commit Task 6**

```sh
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): reject draft asset pack archives"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product Commit: `b3bdb942cc1ff9723041c1bbf004846bd6190a96` (`feat(cli): reject draft asset pack archives`)
  - RED: lifecycle/help tests failed for draft archives before CLI policy implementation; GREEN: focused Task 6 suite plus lifecycle E2E passed (210 tests), CLI typecheck passed, and `rtk pnpm verify` passed after the required sandbox-external IPC rerun.
  - Independent review: Spec compliant; Task quality Approved; no Critical, Important, or Minor findings.
  - CLI docs: help update; cli-readme, root-readme, landing, architecture, engineering, releasing, plugin N/A — internal lifecycle policy/no owned contract change.

---

## Task 7: Add browser crypto, bounded inflation, PNG decode, and official baseline adapters

**Files:**
- Create: `packages/web/src/adapter/asset-pack-format-runtime.ts`
- Create: `packages/web/src/adapter/asset-pack-png-decoder.ts`
- Create: `packages/web/src/lib/asset-pack-baseline.ts`
- Create: `packages/web/test/asset-pack-format-runtime.test.ts`
- Create: `packages/web/test/asset-pack-format-conformance.test.ts`
- Create: `packages/web/test/asset-pack-png-decoder.test.ts`
- Create: `packages/web/test/asset-pack-baseline.test.ts`
- Modify: `packages/web/package.json`
- Modify: `packages/web/tsconfig.json`
- Modify: `packages/web/vitest.config.ts`
- Modify: `packages/web/vite.config.ts`
- Modify: `packages/web/src/vite-env.d.ts`

**Interfaces:**
- Consumes: shared runtime/PNG interfaces, Core baseline projections, official catalog/palettes, root `asset-release.json`, CLI package version at build time.
- Produces: `createBrowserAssetPackFormatRuntime`, `browserAssetPackPngDecoder`, and `loadBrowserAssetPackBaseline`.

- [x] **Step 1: Write failing Web Crypto and bounded-inflate tests**

Assert SHA-256 of `hello`, strict UTF-8 failure, exact UTF-8 round trip,
successful raw-DEFLATE, declared-size mismatch, and a stream whose second
chunk crosses the maximum. Inject a stream factory so Node Vitest does not
determine product support:

```ts
const runtime = createBrowserAssetPackFormatRuntime({
  crypto: globalThis.crypto,
  createDecompressionStream: (format) =>
    new DecompressionStream(format),
});
await expect(runtime.inflateRawBounded({
  compressed,
  declaredSize: 5,
  maximumSize: 4,
})).rejects.toThrow(/bounded output/i);
```

The implementation must cancel the reader immediately when accumulated output would exceed the bound. Trailing-input detection belongs to the shared Task 3 `inspectRawDeflate` preflight and must run before this adapter is invoked; do not claim `DecompressionStream` itself enforces exact compressed-input consumption.

  - RED coverage included SHA-256/strict UTF-8, raw-DEFLATE bounds, declared-size mismatch, overflow cancellation, and reader cancellation behavior.

- [x] **Step 2: Write failing browser archive conformance tests**

Copy the frozen minimal Phase 2 archive hex and expected snapshots established
in Task 3 into `asset-pack-format-conformance.test.ts`. Inspect those exact
bytes through `createBrowserAssetPackFormatRuntime`, then assemble the same
formal pack and assert byte-identical archive hex, archive/content/source
digests, normalized manifest, and diagnostics. Also run the shared unsafe,
repairable, stored-method-without-inflater, and declared-size vectors through
the browser runtime.

Use the actual Web Crypto and raw `DecompressionStream` capabilities available
to the test runtime. Capability absence is an explicit skipped-platform
condition only for this conformance case; adapter capability-error behavior
remains covered unconditionally by the injected unit tests and browser E2E
must run the conformance flow without a skip.

  - Added independent frozen Task 3 archive bytes and expected archive/content/source digests, normalized manifest, diagnostics, unsafe/repairable/stored/no-inflater, declared-size, and Chromium E2E parity vectors.

- [x] **Step 3: Write failing worker-safe PNG decoder tests**

Inject `createImageBitmap` and `OffscreenCanvas` factories. Assert decoded width, height, full RGBA byte order, bitmap close, canvas dimension, and deterministic capability diagnostics when either API is unavailable. Do not use `document`, `HTMLImageElement`, or object URLs in this adapter.

  - RED tests covered decoded dimensions/RGBA bytes, bitmap cleanup, canvas sizing, and missing worker capability diagnostics.

- [x] **Step 4: Write failing official baseline tests**

Build a tiny Catalog with reversed insertion order and assert stable definition/credit digests, palettes, `asset-release.json` tag, and `__LPC_CLI_VERSION__`. The baseline result must match the Node projection hashes for the same definitions.

  - Added reversed-insertion-order stability checks, literal Node projection definition/credit hashes, palettes, release tag, and CLI version metadata assertions.

- [x] **Step 5: Run focused Web tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts
```

Expected: FAIL because browser adapters and build constants do not exist.

  - RED: the initial focused run failed at module loading with four missing adapter/baseline suites; the existing pretest IPC hook required the approved sandbox-external rerun.

- [x] **Step 6: Implement bounded browser runtime**

`inflateRawBounded` pipes a Blob stream through `DecompressionStream('deflate-raw')`, reads chunks, checks `total + chunk.byteLength` before retaining each chunk, cancels on violation, requires exact declared length, and copies the final bytes. Report unsupported APIs through a typed `AssetPackBrowserCapabilityError` with code `asset_browser_capability_missing`.

Convert Web Crypto bytes to lowercase hex:

```ts
const digest = await crypto.subtle.digest('SHA-256', bytes);
const hex = [...new Uint8Array(digest)]
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');
return `sha256:${hex}`;
```

  - Implemented Web Crypto SHA-256, fatal UTF-8, bounded raw-DEFLATE with pre-retain cancellation and declared-size checks, plus unconditional capability-error tests.

- [x] **Step 7: Implement PNG decoder and baseline loading**

Decode one Blob with `createImageBitmap`, draw it once to `OffscreenCanvas`, copy `getImageData(...).data`, and close the bitmap in `finally`.

Load the official catalog/palettes only inside the workbench route. Hash `assetPackDefinitionProjection` and `assetPackCreditProjection` through canonical JSON bytes and Web Crypto. Import the root asset release tag as build data. In Vite config, read `packages/cli/package.json` at config time and define:

```ts
define: {
  __LPC_CLI_VERSION__: JSON.stringify(cliPackage.version),
}
```

Declare the constant as `string` in `vite-env.d.ts`. Add
`@lpc-toolkit/asset-pack-format` as a Web runtime workspace dependency and add
its aliases to Vite, Vitest, and TypeScript.

  - Implemented worker-safe PNG decoding and canonical Core baseline projections; derived Vite/Vitest CLI version metadata and added the workspace alias/lockfile entry.

- [x] **Step 8: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS without reading `upstream/` or fetching a base release.

  - PASS: focused Web suites (5 files, 19 tests), missing-capability simulations (2 skipped platform cases), Web typecheck, `rtk pnpm check:boundaries`, Chromium E2E (1 test, no skip), frozen-lockfile install, and `rtk git diff --check`.

- [x] **Step 9: Commit Task 7**

```sh
rtk git add packages/web/src/adapter/asset-pack-format-runtime.ts packages/web/src/adapter/asset-pack-png-decoder.ts packages/web/src/lib/asset-pack-baseline.ts packages/web/src/vite-env.d.ts packages/web/test/asset-pack-format-runtime.test.ts packages/web/test/asset-pack-format-conformance.test.ts packages/web/test/asset-pack-png-decoder.test.ts packages/web/test/asset-pack-baseline.test.ts packages/web/package.json packages/web/tsconfig.json packages/web/vitest.config.ts packages/web/vite.config.ts
rtk git commit -m "feat(web): add safe asset pack browser adapters"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product Commit: `7772ae85b46e5e87f7c5edd0d2371534a4d720c2` (`feat(web): add safe asset pack browser adapters`)
  - Review Fix Commits: `bd30d3e0e6f66dc21091a34711d3c183b80256c9` (`fix(web): complete asset pack adapter parity`) and `247d2c783a26d99bd60f436717696cbce82f2ff1` (`fix(web): skip unsupported archive conformance`).
  - Evidence Commits: `e2da51281e5069d1bd59c18839976c0e796e157f`, `eda50e6b86b1f135ad601168f8e227828931f61e`, and `760fc00a59e75a3af2a4d9cb54011ded34562244` (Task 7 verification/review-fix reports).
  - Independent final review: capability skip fixed; no Critical or remaining product Important findings. The separate plan-record commit follows this update.

---

## Task 8: Implement the stateful asset-pack Worker validation pipeline

**Files:**
- Create: `packages/web/src/lib/asset-pack-worker-protocol.ts`
- Create: `packages/web/src/workers/asset-pack-worker-session.ts`
- Create: `packages/web/src/workers/asset-pack-worker.ts`
- Create: `packages/web/test/asset-pack-worker-session.test.ts`
- Create: `packages/web/test/asset-pack-worker-protocol.test.ts`
- Modify: `packages/web/src/lib/asset-pack-baseline.ts`

**Interfaces:**
- Consumes: Task 7 browser ports/baseline, shared archive/payload/PNG/compatibility, Core validate/compile.
- Produces: the Stable Interfaces Worker protocol, one in-memory Worker session, current-revision diagnostics, preview payloads, release fingerprints, cached formal candidates, and draft/formal archive responses.

- [x] **Step 1: Write failing open-outcome and size-gate tests**

Use a fake runtime and decoder. Cover:

- `File.size` above `ASSET_PACK_ARCHIVE_LIMITS.archiveBytes` returns a terminal `asset_archive_limit_exceeded` response without calling `arrayBuffer`.
- Unsafe archive returns no session.
- Safe invalid checksum or schema opens repair mode with source summaries.
- Valid formal and valid draft uploads retain original archive digest, original version/status, and baseline release tag.
- A safely decoded non-object or invalid-JSON manifest opens editable raw-manifest repair with exact diagnostics and `draftSerializable: false`; unsafe ZIP metadata still creates no session.

  - RED: the Worker suites initially failed to load because the protocol/session modules did not exist. Added size-gate, unsafe/no-session, repair/raw-manifest, formal/draft metadata, and exact Core diagnostic coverage.

- [x] **Step 2: Write failing edit, revision, and acknowledgement tests**

Open revision `0`; send manifest/source/remove edits at revisions `1`, `2`, and `3`. Assert exact monotonic acceptance, stale request rejection, copied source bytes, missing/unreferenced diagnostics, content digest changes, exact acknowledgement candidates, and acknowledgement invalidation after PNG or version changes.

The test must prove direct acknowledgement edits from raw/advanced JSON are rejected:

```ts
expect(result.diagnostics).toContainEqual(
  expect.objectContaining({ code: 'asset_acknowledgement_edit_forbidden' }),
);
```

Only `replace-manifest` with `origin: 'acknowledgement'`, produced by the governance helper, may change acknowledgements. It must carry exactly the current candidate subjects and one non-empty reason per selected warning. Requests from `advanced-json` or `raw-repair` that add, remove, or alter acknowledgement records return `asset_acknowledgement_edit_forbidden`; ordinary overview/credit edits preserve records only while their candidate digest remains current.

  - Added monotonic/stale revision, copied source, source removal, acknowledgement governance/invalidation, atomic async mutation, source-bound, and stale-acknowledgement draft/formal assembly regressions.

- [x] **Step 3: Write failing validation, preview, and candidate tests**

Cover PNG preflight/decode, Core geometry/frame/recolor/credit validation, compatibility, compile diagnostics, and base identity. Assert:

- zero errors plus warnings returns a preview payload;
- any error returns no preview;
- preview payload maps every compiled destination to exact current source bytes;
- matched compile credits are present;
- release fingerprint includes acknowledgements/credits/sources and excludes version/status;
- formal candidate is cached only after validation, acknowledgements, credits, and assembly/read-back pass;
- draft assembly remains available at the draft serialization threshold.

  - Added validation/preview/source-byte mapping, compile-credit, release-fingerprint, formal read-back candidate, bounded draft serialization, upload/assembly metadata, and acknowledgement assembly assertions.

- [x] **Step 4: Run Worker tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
```

Expected: FAIL because the protocol and session do not exist.

  - RED was confirmed after the known sandbox tsx IPC restriction was bypassed with the exact command; both suites failed at module loading with 0 tests.

- [x] **Step 5: Implement serializable protocol and session ownership**

Every request and response carries `requestId` and `revision`. Keep archive/source bytes only in the Worker session. Main-thread responses contain source summaries and copies needed for the current preview or download, never the complete unreferenced byte map.

Validate `replace-manifest.origin` inside the Worker. Treat the origin as the
requested edit workflow, not proof that acknowledgements are valid: recompute
the exact warning candidates and compare normalized subjects and trimmed,
non-empty reasons before accepting an acknowledgement-origin request.

Use one diagnostic shape:

```ts
export interface AssetPackWorkbenchDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly scope: 'archive' | 'manifest' | 'source' | 'warning' | 'credit' | 'release';
  readonly path?: string;
  readonly subject?: Readonly<Record<string, string | readonly string[]>>;
  readonly details?: Readonly<Record<string, unknown>>;
}
```

Sort by severity, code, path, and stable serialized subject. Preserve shared/Core diagnostic codes.

  - Implemented serializable protocol, private session-owned bytes, deterministic diagnostics, request/revision propagation, governance validation, atomic session queueing, and bounded source replacement.

- [x] **Step 6: Implement validation and release calculations**

For each accepted edit:

1. parse current manifest text as a JSON object;
2. parse/normalize through Core;
3. hash expected/current sources and content projection;
4. inspect current PNGs through the shared PNG workflow;
5. validate compatibility, Core domain rules, acknowledgements, and attribution;
6. compile exactly one pack against the official baseline;
7. construct current preview bytes only when there are no errors;
8. calculate release fingerprint from normalized manifest with `version` and `status` omitted but acknowledgements included;
9. assemble/read back a candidate formal archive when non-version formal gates permit it.

Do not filter a diagnostic merely to enable preview or download.

  - Implemented Core/PNG/compatibility/credit validation, zero-error preview gating and source maps, release fingerprint calculation, attribution checks, and revision-bound formal candidate caching/read-back.

- [x] **Step 7: Implement draft/formal assembly messages**

Draft requests accept repairable domain state but require one JSON object and safe bounded sources. Formal requests require the cached candidate to belong to the exact revision and return `candidate-not-verified` otherwise. Transfer only the final archive `ArrayBuffer` to the main thread and retain enough immutable metadata to report its digest and filename.

  - Implemented bounded draft/formal assembly, final digest/filename reporting, original upload metadata and baseline release tag retention, and stale acknowledgement filtering in both archive paths.

- [x] **Step 8: Wire the Worker entry and verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS. The Worker source imports no React component or Node module.

  - PASS: focused Worker suites (2 files, 22 tests), baseline plus Worker suites (3 files, 23 tests), full Web Vitest (84 files, 740 tests), Web typecheck, `rtk pnpm check:boundaries`, and repository `rtk pnpm verify` (55 CLI files, 1032 tests plus 1 skipped; Web 84 files, 740 tests).

- [x] **Step 9: Commit Task 8**

```sh
rtk git add packages/web/src/lib/asset-pack-worker-protocol.ts packages/web/src/workers/asset-pack-worker-session.ts packages/web/src/workers/asset-pack-worker.ts packages/web/src/lib/asset-pack-baseline.ts packages/web/test/asset-pack-worker-session.test.ts packages/web/test/asset-pack-worker-protocol.test.ts
rtk git commit -m "feat(web): validate asset packs in a worker"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product Commit: `ef58af4c8e3676ab549360801c6322bbc840c598` (`feat(web): validate asset packs in a worker`).
  - Review Fix Commits: `5ea8165d2da577539bb04dbfe8a38c9b0ff4db22` (`fix(web): harden asset pack worker revisions`), `50ab2ff87ac9f19cbca0716b9fdec08504a006d4` (`fix(web): preserve asset pack worker metadata`), and `d4fa2ab0f352a2f01c5dafea9601f0b7d54e9956` (`fix(web): invalidate stale acknowledgements`).
  - Evidence Commits: `cbefad0111745f96d5c514451e565ea6681b8a52`, `b6eecbdfc495557b67389dfd6141d1eaa6b1ef2a`, `35bcd90fb494d25ffef42aa803adb6135a1d6bca`, and `1e588018a6cee7dca1e5831637a3d12d73b55694`.
  - Independent final Luna review: Approved; no Critical or Important findings remain. The separate plan-record commit follows this update.

---

## Task 9: Add pure workbench state, editor projections, and latest-only Worker orchestration

**Files:**
- Create: `packages/web/src/lib/asset-pack-worker-client.ts`
- Create: `packages/web/src/lib/asset-pack-manifest-editor.ts`
- Create: `packages/web/src/slice/asset-pack-workbench.ts`
- Create: `packages/web/src/slice/asset-pack-release.ts`
- Create: `packages/web/src/hooks/use-asset-pack-workbench.ts`
- Create: `packages/web/test/asset-pack-worker-client.test.ts`
- Create: `packages/web/test/asset-pack-manifest-editor.test.ts`
- Create: `packages/web/test/asset-pack-workbench.test.ts`
- Create: `packages/web/test/asset-pack-release.test.ts`
- Create: `packages/web/test/use-asset-pack-workbench.test.ts`

**Interfaces:**
- Consumes: Task 8 Worker protocol and revisions.
- Produces: one testable Worker client, pure reducer, form/advanced projections, exact acknowledgement mutation, formal gate, and React orchestration hook.

- [x] **Step 1: Write failing reducer and stale-result tests**

Define these phases:

```ts
export type AssetPackWorkbenchPhase =
  | 'empty'
  | 'opening'
  | 'unsafe'
  | 'editing'
  | 'validating'
  | 'assembling'
  | 'failed';
```

Test upload reset, active panel navigation, revision increment per accepted edit, pending progress, unsafe reset, retry, current validation, and latest downloaded revision. Send responses in reverse order and prove only matching `requestId` plus current revision can update state.

Simulate a Worker crash after manifest, source replacement, and source removal
edits. The main-thread model must retain the original `File` plus its ordered,
immutable accepted-edit log. Retry creates a fresh Worker, replays `open` and
those exact revisioned edits, reaches the same current revision, and ignores
all replies from the terminated Worker.

  - RED: the five requested suites initially failed with missing Task 9 modules. Added phase/revision/stale-response, crash/retry, immutable File/edit-log, and reset/navigation/progress coverage.

- [x] **Step 2: Write failing editor-projection and governance tests**

Define:

```ts
export interface AssetPackAdvancedProjection {
  readonly creditOverrides?: AssetPackSource['creditOverrides'];
  readonly replaces?: AssetPackSource['replaces'];
  readonly assets: AssetPackSource['assets'];
}
```

Prove overview owns ID/displayName/version/compatibility, Credits owns top-level credits, and advanced JSON owns only the interface above. Reject unknown advanced keys and any `schema`, `status`, `acknowledgements`, or common-field mutation.

`acknowledgeWarning(source, candidate, reason)` trims the reason, rejects blank text, replaces only an exact code/subject/content-digest match, and removes stale acknowledgements before returning a new source.

  - Added disjoint Overview/Credits/Advanced projections, unknown/common-field rejection, exact acknowledgement binding, reason trimming, and stale-record tests.

- [x] **Step 3: Write failing release-gate tests**

Cover every `AssetPackFormalBlocker`. Assert next-patch suggestions for stable/prerelease SemVer; no suggestion for invalid original version; greater custom versions accepted; draft upload always requires increase; changed release fingerprint requires increase; and unchanged formal upload may retain version only when candidate and original archive digests match.

Apply a required version change before enabling acknowledgement submission, because the existing content digest includes version and a later version edit would correctly invalidate prior acknowledgements.

  - Added coverage for every formal blocker, SemVer suggestions, draft/formal status, archive/release fingerprint changes, candidate/original digest matching, and version-before-ack ordering.

- [x] **Step 4: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts
```

Expected: FAIL because workbench state/orchestration does not exist.

  - RED confirmed after the known sandbox tsx IPC restriction was bypassed with the exact command: 5 suites failed and 0 tests collected.

- [x] **Step 5: Implement Worker client and reducer**

Inject a minimal Worker port for tests:

```ts
export interface AssetPackWorkerPort {
  readonly postMessage: (message: AssetPackWorkerRequest, transfer?: Transferable[]) => void;
  readonly addEventListener: Worker['addEventListener'];
  readonly removeEventListener: Worker['removeEventListener'];
  readonly terminate: () => void;
}

export type AssetPackWorkerFactory = () => AssetPackWorkerPort;
```

`createAssetPackWorkerClient` assigns request IDs, tracks current revision,
rejects stale replies, and exposes `open`, `replaceManifest`, `replaceSource`,
`removeSource`, `assemble`, and `dispose`. The hook receives a Worker factory,
owns one client at a time, replaces it during retry, and terminates it on
failure, Reset, replacement, or unmount.

The hook retains only the original archive `File`, replacement `File`
references, manifest text edits, removal paths, and UI summaries needed for
recovery—not decoded archive/source byte maps. On Worker failure, keep the
editor state visible, mark validation failed, and make `retry` construct a new
client and replay the ordered accepted requests. Clear the replay log on Reset
or a newly accepted upload.

  - Implemented latest-only Worker client, request/revision tracking, disposal, pure reducer, crash recovery, contiguous accepted-edit replay, and no decoded byte maps in hook state.

- [x] **Step 6: Implement pure edits and release gate**

All editor paths reconstruct one manifest text and send that exact text to the Worker. Preserve existing acknowledgements unless the dedicated governance helper removes/replaces them. Never let a form and JSON editor retain separate manifest copies.

Calculate formal blockers in stable UI order. `ready` is exactly `blockers.length === 0`; do not hide a blocker after the user clicks download.

  - Implemented single-manifest editor projections, exact governance helper, authoritative formal gate, blocker transitions for empty/opening/retry/unsafe/failed states, and terminal assembly transitions.

- [x] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS, including stale response and acknowledgement/version ordering.

  - PASS: Task 9 focused suites (5 files, 32 tests), Task 8 regression suites (3 files, 24 tests), Web typecheck, `rtk pnpm check:boundaries`, and diff checks.

- [x] **Step 8: Commit Task 9**

```sh
rtk git add packages/web/src/lib/asset-pack-worker-client.ts packages/web/src/lib/asset-pack-manifest-editor.ts packages/web/src/slice/asset-pack-workbench.ts packages/web/src/slice/asset-pack-release.ts packages/web/src/hooks/use-asset-pack-workbench.ts packages/web/test/asset-pack-worker-client.test.ts packages/web/test/asset-pack-manifest-editor.test.ts packages/web/test/asset-pack-workbench.test.ts packages/web/test/asset-pack-release.test.ts packages/web/test/use-asset-pack-workbench.test.ts
rtk git commit -m "feat(web): model asset pack workbench state"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product Commits: `7b04cba00054a3949cefeabd3ee3780fe2b8fcd3` (`feat(web): model asset pack workbench state`), `de67f40fe0791d4e2611fad5b3ca9d47a3df7dc8` (`fix(web): enforce workbench release governance`), `747af08b309d5cef5aafcaf822bb94f7a1b03a02` (`fix(web): close Task 9 workbench review findings`), `ccaf745e950224eddfc45d113a45415a1edc95cb` (`fix(web): block formal assembly after worker failure`), and `43eba4eae3a9908ebbe3c263d29e299c429edcd1` (`fix(web): close remaining Task 9 workbench gates`).
  - Evidence Commits: `074bf1debd6897eaddb8f64370bd5a83f705f779`, `f9afe0d55008a9f133993a0551c00a179cd43c31`, `37a59d1af3165e4574b234fad2b969414933fc3c`, `a8125f7272e14437daf3c9ce88f8d38b3f64ab7c`, and `1d36018fa68cd969ba47ebe2fc99aa066714d4a1`.
  - Independent final Luna review: product findings resolved; no Critical or remaining product Important findings. The separate plan-record commit follows this update.

---

## Task 10: Add the `/asset-packs` route, upload entry, and responsive workbench shell

**Files:**
- Modify: `packages/web/src/lib/app-route.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/landing-page.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/harness.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/upload-panel.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/workbench-nav.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/workbench-editor.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/workbench-preview.tsx`
- Modify: `packages/web/test/app-route.test.ts`
- Modify: `packages/web/test/app-shell.test.tsx`
- Modify: `packages/web/test/landing-page.test.tsx`
- Create: `packages/web/test/asset-pack-upload-panel.test.tsx`
- Create: `packages/web/test/asset-pack-workbench-shell.test.tsx`

**Interfaces:**
- Consumes: Task 7 baseline loader and Task 9 hook/state.
- Produces: navigable `/asset-packs`, lazy baseline initialization, upload/drop entry, and the three stable layout responsibilities.

- [x] **Step 1: Write failing route and lazy-load tests**

Assert:

```ts
expect(routeFromPathname('/asset-packs')).toBe('asset-packs');
expect(pathForRoute('asset-packs')).toBe('/asset-packs');
```

Render `/`, `/compose`, `/asset-packs`, and an unknown route. Composer loaders run only on `/compose`; workbench baseline loaders run only on `/asset-packs`; neither initializes on landing/404.

  - Implementation: Added the route/path contract and route-local lazy baseline assertions covering landing, composer, workbench, and unknown-route loader ownership.

- [x] **Step 2: Write failing upload and shell tests**

Static markup must include one file input accepting `.lpc-assets.zip,.draft.lpc-assets.zip`, a labeled drop zone, size/help text, an accessible progress live region, and Reset/Back actions. Editing markup must contain left navigation, center preview, and right editor landmarks with stable labels and tabs for narrow screens.

  - Implementation: Added focused upload-panel and workbench-shell tests for the constrained input/drop entry, declared-size gate, explicit actions, progress/status semantics, desktop landmarks, and narrow-screen tabs.

- [x] **Step 3: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- app-route.test.ts app-shell.test.tsx landing-page.test.tsx asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx
```

Expected: FAIL because the route and components do not exist.

  - Verification: The exact focused command failed before implementation as expected: 5 test files failed; 5 tests failed and 7 passed. The sandbox-only attempt stopped earlier at the known `tsx` IPC `listen EPERM` hook, so RED was rerun with the approved local IPC escalation.

- [x] **Step 4: Implement lazy route ownership**

Add `asset-packs` to `AppRoute`, `NavigableAppRoute`, and `AppPath`. Create an `AssetPackApp` child that calls `loadBrowserAssetPackBaseline()` once and renders the harness. Do not place baseline loading in root `App`.

Add a landing CTA labeled `Repair an Asset Pack` and replace the Phase 3 deferral text with the actual browser capability plus the CLI/Web distinction.

  - Implementation: Added `asset-packs` routing and an `AssetPackApp` child whose baseline loader is route-local; Composer remains `/compose`-owned. Updated the landing CTA and Phase 3 CLI/Web capability copy.

- [x] **Step 5: Implement upload and three-region shell**

The upload panel sends one selected/dropped File to the hook after the declared-size gate. The desktop shell uses named `nav`, `main`, and `aside` regions; narrow screens switch the same region state through tabs. Do not render all detailed editors in this task.

Use text plus icon for status counts and `role="status" aria-live="polite"` for Worker progress. Keep Reset explicit; never silently replace the current pack after a second drop.

  - Implementation: Added the upload panel and responsive workbench harness/nav/editor/preview regions with explicit reset/back controls, guarded second-drop behavior, status icon/count text, and polite Worker progress announcements.

- [x] **Step 6: Verify GREEN and build**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- app-route.test.ts app-shell.test.tsx landing-page.test.tsx asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web build
```

Expected: PASS. Landing and 404 do not initialize composer or workbench data.

  - Verification: Focused suite PASS (5 files, 18 tests), web typecheck PASS, web build PASS, boundary check PASS, and `rtk git diff --check` PASS. Full `rtk pnpm verify` also PASS: Web 91 files/781 tests; CLI 55 files/1032 passed plus 1 skipped. Sandboxed prepare-assets/build/verify attempts hit the known `tsx` IPC `listen EPERM`; the exact commands passed with approved escalation. Build emitted only existing Vite chunk-size/dynamic-import warnings.

- [x] **Step 7: Commit Task 10**

```sh
rtk git add packages/web/src/lib/app-route.ts packages/web/src/App.tsx packages/web/src/components/landing-page.tsx packages/web/src/components/asset-pack-workbench packages/web/test/app-route.test.ts packages/web/test/app-shell.test.tsx packages/web/test/landing-page.test.tsx packages/web/test/asset-pack-upload-panel.test.tsx packages/web/test/asset-pack-workbench-shell.test.tsx
rtk git commit -m "feat(web): add asset pack workbench route"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Commit: `4a54af2ff5b9f3a7ea035b2a39c5ac7fe7dd3651` — `feat(web): add asset pack workbench route`
  - Evidence report: `459640004767aff0a3777a883b1163bc9790d116`
  - Independent final Luna review: Approved; no Critical or Important findings. Review package: `.superpowers/sdd/review-task-10-route-shell-d491a5..4a54af2.diff`.
  - Scope note: No Task 11 files, dependencies, assets, caches, or `upstream/` content changed. The separate plan-record commit follows this update.

---

## Task 11: Implement manifest, PNG, diagnostics, warning, and credits editors

**Files:**
- Create: `packages/web/src/components/asset-pack-workbench/overview-editor.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/manifest-json-editor.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/source-list.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/warnings-editor.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/credits-editor.tsx`
- Create: `packages/web/src/components/asset-pack-workbench/diagnostic-list.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/workbench-editor.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/workbench-nav.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/harness.tsx`
- Create: `packages/web/test/asset-pack-overview-editor.test.tsx`
- Create: `packages/web/test/asset-pack-manifest-json-editor.test.tsx`
- Create: `packages/web/test/asset-pack-source-list.test.tsx`
- Create: `packages/web/test/asset-pack-warnings-editor.test.tsx`
- Create: `packages/web/test/asset-pack-credits-editor.test.tsx`
- Create: `packages/web/test/asset-pack-diagnostic-list.test.tsx`

**Interfaces:**
- Consumes: Task 9 edit/governance actions and current `AssetPackWorkbenchRevision`.
- Produces: the complete correction UI without adding another manifest representation.

- [x] **Step 1: Write failing Overview, JSON, and Credits tests**

Overview exposes ID, display name, version, minimum CLI, and required capabilities with associated labels and current diagnostic text. Credits exposes repeatable authors/licenses/URLs plus notes and credit override navigation.

Advanced editor shows only `AssetPackAdvancedProjection`, formats two-space JSON with a final newline, reports parse errors without sending an edit, and never exposes acknowledgements/status as writable content. Raw repair mode shows complete manifest text but refuses an acknowledgement-array diff.

  - Implementation: Added RED coverage for Overview/Credits projections, advanced JSON ownership and serialization, raw repair governance, and controlled manifest submission.

- [x] **Step 2: Write failing source and diagnostic tests**

Source rows display path, consumer count, dimensions, digest, state, Replace, and Remove when unreferenced. A JSON-introduced missing path renders an upload slot. Accept only PNG file selection; Worker remains the authority for signature/decode.

Diagnostic rows render severity/code/message/path/scope and a corrective action. Selecting one invokes the exact panel/path navigation target. No diagnostic is represented by color alone.

  - Implementation: Added RED coverage for PNG-only source replacement/removal governance, missing-source upload slots, diagnostic scope mapping, corrective targets, and focus navigation.

- [x] **Step 3: Write failing individual-warning tests**

Each warning card shows full code, subject JSON, scope, content digest, one reason input, and one Confirm button. Blank/whitespace reason stays disabled. There is no acknowledge-all text or control. Version blockers disable confirmation with a message to set the release version first.

  - Implementation: Added RED coverage for per-warning subject/digest/reason rendering, blank-reason disabling, acknowledgement governance, and version-gated confirmation.

- [x] **Step 4: Run editor tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx
```

Expected: FAIL because detailed editors do not exist.

  - Verification: The exact command first hit the known sandbox `tsx` IPC `listen EPERM`; with approved escalation, all six new suites failed during collection because their editor modules did not exist and collected zero tests.

- [x] **Step 5: Implement controlled focused editors**

Every editor receives immutable values and named callbacks; it owns only transient input text. Submit a complete new manifest through Task 9 helpers. Use stable keys from path or warning binding, never array index for mutable author/license/URL rows.

Source replacement calls `replaceSource(path, file)` and does not create an object URL. Unreferenced removal calls `removeSource(path)` after explicit confirmation.

  - Implementation: Added Overview, Credits, Manifest JSON/raw repair, Source, Warning, and Diagnostic editors. They submit complete manifests through existing Task 9 helpers/controller callbacks, keep transient drafts local, use stable keys, enforce PNG-only replacement, and explicitly confirm unreferenced removal.

- [x] **Step 6: Implement exact diagnostics and warning governance**

Map diagnostic scope to Overview/Manifest/Source/Warnings/Credits. On navigation, focus the relevant heading or input using a stable element ID derived from a safe hash, not the raw path.

Warning confirmation calls only `acknowledgeWarning` with the current candidate and reason. Render imported valid acknowledgements as confirmed; render stale acknowledgements only as diagnostics until the Worker removes them from generated output.

  - Implementation: Added hashed diagnostic identities and focus targets, visible projection/acknowledgement errors, invalid-manifest raw repair, Worker-revision conflict protection for all mutable credit fields, and warning reason pruning keyed by revision/candidate digest. No acknowledgement bypass was added.

- [x] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx asset-pack-manifest-editor.test.ts asset-pack-release.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS with no acknowledgement bypass and no new editor dependency.

  - Verification: Task 11 focused suite PASS (8 files, 23 tests); shell/upload regression PASS (2 files, 7 tests); web typecheck PASS; boundary check PASS; full `rtk pnpm verify` PASS with Web 97 files/794 tests and CLI 55 files/1032 passed plus 1 skipped. The exact focused/shell commands were rerun with approved escalation for the repository's `tsx` IPC hook.

- [x] **Step 8: Commit Task 11**

```sh
rtk git add packages/web/src/components/asset-pack-workbench packages/web/test/asset-pack-overview-editor.test.tsx packages/web/test/asset-pack-manifest-json-editor.test.tsx packages/web/test/asset-pack-source-list.test.tsx packages/web/test/asset-pack-warnings-editor.test.tsx packages/web/test/asset-pack-credits-editor.test.tsx packages/web/test/asset-pack-diagnostic-list.test.tsx
rtk git commit -m "feat(web): add asset pack correction editors"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product commits: `da793bd0968b72a6a39f1e210081388adf1d02a9` (`feat(web): add asset pack correction editors`), `4eb090ed15f52049678c6c6c4a6cba768a23d8a3` (`fix(web): address Task 11 editor review findings`), and `151a7f022b3464738fc0ffcc236d868471cf3fc2` (`fix(web): protect Task 11 credits and warning drafts`).
  - Evidence commits: `709a41714b7541d306be2f2d70b33116ca067a1f`, `af7b00ea1185dd8d7e91281c475f26bf0d539c81`, `bb2c6c8d987a1c46e9e3a0e512f1f402be7adc33`, and `5c3f2db300d60f4ca160081bf4e82ae1d03c76e7`.
  - Independent final Luna review: Approved; no Critical or Important findings. Review packages covered the initial implementation and both fix ranges. Minor note: broader browser event-level interaction coverage remains outside this task's server-rendered test setup.
  - Scope note: No dependencies, Task 12 files, assets, caches, or `upstream/` content changed. The separate plan-record commit follows this update.

---

## Task 12: Add current-revision preview, character import, and exact attribution

**Files:**
- Create: `packages/web/src/adapter/asset-pack-preview-canvas-adapter.ts`
- Create: `packages/web/src/lib/asset-pack-preview.ts`
- Create: `packages/web/src/hooks/use-asset-pack-preview.ts`
- Create: `packages/web/src/components/asset-pack-workbench/attribution-panel.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/workbench-preview.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/harness.tsx`
- Create: `packages/web/test/asset-pack-preview-canvas-adapter.test.ts`
- Create: `packages/web/test/asset-pack-preview.test.ts`
- Create: `packages/web/test/use-asset-pack-preview.test.ts`
- Create: `packages/web/test/asset-pack-attribution-panel.test.tsx`
- Modify: `packages/web/test/character-document.test.ts`

**Interfaces:**
- Consumes: Task 8 `AssetPackPreviewPayload`, official baseline, existing browser canvas/ZIP loader, Core composition/credits, canonical character JSON importer.
- Produces: current-revision composed preview, focused pack selection, optional imported character selection, and visible matched credits.

- [x] **Step 1: Write failing overlay resolution tests**

Given a map from compiled destination path to PNG bytes, assert `loadImage` decodes exact pack bytes first and delegates only unmatched official paths to `createBrowserCanvasAdapter`. Assert no arbitrary source path can shadow a base path absent from the compile plan and all created ImageBitmaps are closed or transferred to the composition lifetime.

  - Implementation: Added RED coverage for destination-authorized pack bytes, finite official fallback paths, source-path shadow rejection, and ImageBitmap disposal lifecycle.

- [x] **Step 2: Write failing catalog, selection, and attribution tests**

Build a preview catalog from official definitions plus compile-plan definitions. Assert:

- new item selection replaces only its type in the standard character;
- extend item selection targets the compiled base item;
- body type/animation/direction/asset controls choose valid values;
- imported canonical character JSON is validated against the compiled catalog;
- matched credits equal Core `getCredits` for the exact composed selections;
- pack and official base credits both appear;
- missing credit data returns an error and no preview.

  - Implementation: Added RED coverage for merged catalogs, new/extend focused selection behavior, body/animation/direction validity, canonical import validation, exact Core credits, pack/base attribution, and missing-credit errors.

- [x] **Step 3: Write failing freshness tests**

Resolve revision `4`, then start revision `5`. The hook must immediately return pending with no image. Resolve revision `4` late and prove it is discarded. Reject revision `5` and prove no prior canvas/image remains. Switch only animation/direction and prove source composition is reused when the validated revision and selection are unchanged.

  - Implementation: Added RED coverage for latest-only revision clearing/discarding, body type, and pending animation freshness while preserving animation-only reuse.

- [x] **Step 4: Run preview tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx character-document.test.ts
```

Expected: FAIL because preview overlay/catalog ownership does not exist.

  - Verification: The exact command first hit the known sandbox `tsx` IPC `listen EPERM`; with approved escalation, four new suites failed during collection because preview/attribution modules did not exist, while the existing character-document suite passed.

- [x] **Step 5: Implement compiled overlay preview**

Convert baseline `catalog.byItemId` values and compile-plan definitions into one Core `createCatalog` input. Build a destination-to-source byte map only from compile-plan sprites. Use Task 7 palettes and the existing browser canvas adapter fallback.

Construct the fixed standard character from `pickInitialSelections`, then apply the focused pack asset. Imported character JSON replaces that base selection only after Core import succeeds; the focused pack asset is applied afterward so it remains visible.

  - Implementation: Added the destination-authorized overlay canvas adapter, merged official/compiled Core catalog construction, focused new/extend selection application, validated body type and canonical import, exact source-byte identity, and Core-derived credits.

- [x] **Step 6: Implement latest-only hook and attribution panel**

Key composition by validated revision, body type, focused asset, imported selection digest, and pack source-byte identity. On any current error/pending revision, clear canvas/sheet/credits synchronously. Reuse existing animation extraction and player helpers after composition.

Render authors, licenses, URLs, notes, resolved paths, and effective license adjacent to the preview. Show the official base release tag. Do not offer an unattributed image export.

  - Implementation: Added the latest-only preview hook with synchronous pending/error clearing, stale-result disposal, latest animation extraction, and source reuse. Wired body/animation/direction/asset/import controls and an attribution panel showing matched credits plus the official release tag, without an unattributed export path.

- [x] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx character-document.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS, including current-revision clearing and exact base-plus-pack credits.

  - Verification: Focused suite PASS (5 files, 19 tests); related Task 8/workbench regression PASS (6 files, 49 tests); web typecheck PASS; boundary check PASS; full `rtk pnpm verify` PASS with Web 101 files/810 tests and CLI 55 files/1032 passed plus 1 skipped. Exact focused/regression commands were rerun with approved escalation for the `tsx` IPC hook.

- [x] **Step 8: Commit Task 12**

```sh
rtk git add packages/web/src/adapter/asset-pack-preview-canvas-adapter.ts packages/web/src/lib/asset-pack-preview.ts packages/web/src/hooks/use-asset-pack-preview.ts packages/web/src/components/asset-pack-workbench/attribution-panel.tsx packages/web/src/components/asset-pack-workbench/workbench-preview.tsx packages/web/src/components/asset-pack-workbench/harness.tsx packages/web/test/asset-pack-preview-canvas-adapter.test.ts packages/web/test/asset-pack-preview.test.ts packages/web/test/use-asset-pack-preview.test.ts packages/web/test/asset-pack-attribution-panel.test.tsx packages/web/test/character-document.test.ts
rtk git commit -m "feat(web): preview attributed asset packs"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product commits: `89cd749af4a1a513fc7e80432d9ea9dbeb0bc1a2` (`feat(web): preview attributed asset packs`) and `fc61503f55169d2574a7d6cd62802209fa03c0b7` (`fix(web): close and authorize preview assets`).
  - Evidence commits: `3c989e95893a9b2d437ace8753433fcc663f79b4` and `7a0cb2f8c1a0f0739f05176732ba4d4594ce355b`.
  - Independent final Luna review: Approved; no Critical, Important, or Minor findings. The review accepted finite baseline-derived fallback authorization and the conservative exclusion of dynamic official paths.
  - Scope note: No dependencies, Task 13 files, assets, caches, or `upstream/` content changed. The separate plan-record commit follows this update.

---

## Task 13: Implement draft/formal downloads and unsaved-work protection

**Files:**
- Create: `packages/web/src/lib/asset-pack-download.ts`
- Create: `packages/web/src/hooks/use-unsaved-work-guard.ts`
- Create: `packages/web/src/components/asset-pack-workbench/download-bar.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/harness.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/workbench-preview.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/hooks/use-asset-pack-workbench.ts`
- Create: `packages/web/test/asset-pack-download.test.ts`
- Create: `packages/web/test/use-unsaved-work-guard.test.ts`
- Create: `packages/web/test/asset-pack-download-bar.test.tsx`
- Modify: `packages/web/test/app-shell.test.tsx`
- Modify: `packages/web/test/asset-pack-workbench-shell.test.tsx`

**Interfaces:**
- Consumes: Task 9 formal gate, Task 8 assembly response, existing `downloadBlob`.
- Produces: deterministic filenames, exact-revision draft/formal download, downloaded-revision tracking, `beforeunload`, and in-app route blocking.

- [x] **Step 1: Write failing filename and exact-revision tests**

Assert:

```ts
expect(assetPackDownloadFilename({
  packId: 'acme.hair',
  version: '1.2.4',
  kind: 'draft',
})).toBe('acme.hair-1.2.4.draft.lpc-assets.zip');
expect(assetPackDownloadFilename({
  packId: 'acme.hair',
  version: '1.2.4',
  kind: 'formal',
})).toBe('acme.hair-1.2.4.lpc-assets.zip');
```

Start assembly for revision `8`, accept revision `9` edit, then resolve revision `8`; assert no download and no saved marker. Only exact current revision bytes may reach `downloadBlob`.

  - Added deterministic filename, stale-response, exact-byte, failed-handoff, and success-only downloaded-marker tests in `packages/web/test/asset-pack-download.test.ts` and `packages/web/test/use-asset-pack-workbench.test.ts`.
  - RED was confirmed before implementation by the focused command in Step 4.

- [x] **Step 2: Write failing download-gate and status tests**

Draft button is enabled only at `draftSerializable`. It lists remaining errors/warnings before confirmation. Formal button is enabled only when `AssetPackFormalGate.ready` and Worker candidate digest belongs to the current revision. Buttons remain disabled while assembling and expose status through `aria-live`.

  - Added draft/formal gate, current diagnostics, assembling status, and rejected-download alert coverage in `packages/web/test/asset-pack-download-bar.test.tsx` and `packages/web/test/asset-pack-workbench-shell.test.tsx`.

- [x] **Step 3: Write failing unload and route-navigation tests**

Assert no prompt immediately after upload, a prompt after revision change, no prompt after exact current draft/formal download, and prompt again after another edit. Cover reload/close `beforeunload`, Home CTA, programmatic navigation, and browser back. Cancelled navigation must leave pathname and workbench state unchanged.

  - Added pure guard and App navigation-owner coverage for beforeunload eligibility, accepted/cancelled programmatic navigation, popstate cancellation, and no history growth in `packages/web/test/use-unsaved-work-guard.test.ts` and `packages/web/test/app-shell.test.tsx`.

- [x] **Step 4: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx
```

Expected: FAIL because download and navigation guards do not exist.

  - RED: the exact command failed as required with missing download/guard modules and navigation owner before implementation; the permitted rerun reached Vitest and preserved the two existing App passes.

- [x] **Step 5: Implement exact download handoff**

Convert transferred bytes to `Blob` with `application/zip`, call existing `downloadBlob`, and mark `latestDownloadedRevision` only after the handoff returns without throwing. Do not regenerate or edit bytes on the main thread.

Formal click rechecks current gate, requests the cached exact candidate, verifies response revision/kind/digest metadata, and downloads. Draft click shows remaining diagnostics and requests current draft assembly.

  - Implemented `packages/web/src/lib/asset-pack-download.ts` and controller handoff in `packages/web/src/hooks/use-asset-pack-workbench.ts`; Worker bytes are transferred directly to an `application/zip` Blob, with no main-thread regeneration or durable storage.
  - Formal gate, revision, kind, and digest are rechecked before handoff; `latestDownloadedRevision` is dispatched only after `downloadBlob` returns successfully.
  - Product commit: `e7719ca4083a6f9a0973c11a23398a4318300f03` (`feat(web): download governed asset pack archives`).

- [x] **Step 6: Implement unsaved-work guards**

`useUnsavedWorkGuard` registers `beforeunload` only while `currentRevision > latestDownloadedRevision`. Add a blocker registration to the App navigation owner so in-app navigation and `popstate` consult the same injected confirm function before changing route state. Remove listeners/blocker on workbench unmount.

Do not use a custom modal for browser reload/close because browsers control that text. Use one concise confirm message for in-app navigation.

  - Implemented `useUnsavedWorkGuard` with conditional `beforeunload` registration and cleanup, plus one App navigation owner for programmatic and popstate confirmation.
  - Review fix `ace0983076808266135119cb6c1992a06ddbc7aa` corrected current diagnostics and cancelled history restoration without duplicate `pushState` entries.
  - Final UI fix `241b5612469d90994ec44d1ce47a94a8a0bb6fef` surfaces rejected downloads as retryable transient alerts.

- [x] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx use-asset-pack-workbench.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS with exact revision ownership and no durable browser storage.

  - Focused GREEN: `rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx asset-pack-workbench-shell.test.tsx use-asset-pack-workbench.test.ts` PASS — 6 files, 30 tests.
  - `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS; `rtk pnpm check:boundaries` PASS; `rtk git diff --check` PASS.
  - Full `rtk pnpm verify` PASS: Core 338 tests, format 70, presets 3, Web 823, CLI 1032 passed + 1 skipped. Existing optional-spritesheet/catalog warning logs remain non-failing and are documented in the evidence report.
  - Final Luna review: Approved; no Critical or Important findings. Minor notes were lifecycle coverage and pre-existing warning noise.

- [x] **Step 8: Commit Task 13**

```sh
rtk git add packages/web/src/lib/asset-pack-download.ts packages/web/src/hooks/use-unsaved-work-guard.ts packages/web/src/components/asset-pack-workbench/download-bar.tsx packages/web/src/components/asset-pack-workbench/harness.tsx packages/web/src/App.tsx packages/web/src/hooks/use-asset-pack-workbench.ts packages/web/test/asset-pack-download.test.ts packages/web/test/use-unsaved-work-guard.test.ts packages/web/test/asset-pack-download-bar.test.tsx packages/web/test/app-shell.test.tsx
rtk git commit -m "feat(web): download governed asset pack archives"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product commits: `e7719ca4083a6f9a0973c11a23398a4318300f03` (`feat(web): download governed asset pack archives`), `ace0983076808266135119cb6c1992a06ddbc7aa` (`fix(web): close Task 13 review findings`), and `241b5612469d90994ec44d1ce47a94a8a0bb6fef` (`fix(web): surface asset pack download failures`).
  - Evidence commits: `6b1d69501a21324d925b1b6d357b14e192958b6e`, `b9dc11f4da09a7851e18e6d54a8e35ee4c58a903`, and `9f7f97468fb2b6e47a30acc724684ff03f026dc7`.
  - Scope: Web-only; no dependencies, CLI documentation matrix, Task 14 files, assets, caches, or `upstream/` content changed. Plan record commit follows this update.

---

## Task 14: Prove the browser-to-CLI workflow and update every owned contract

**Files:**
- Create: `packages/web/e2e/asset-pack-workbench.spec.ts`
- Create: `packages/web/e2e/helpers/asset-pack-fixture.ts`
- Modify: `packages/web/package.json`
- Modify: `packages/web/test/package-scripts.test.ts`
- Modify: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/test/plugin-contract.test.ts`
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `packages/web/test/landing-page.test.tsx`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ENGINEERING.md`
- Modify: `docs/RELEASING.md`
- Modify: `plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md`
- Modify: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs`

**Interfaces:**
- Consumes: complete Tasks 1–13 implementation and public CLI build.
- Produces: exact browser workflow acceptance, CLI install acceptance for downloaded bytes, packed-package draft behavior, and all eight documentation surfaces.

- [x] **Step 1: Write the failing Playwright workflow**

Generate a deterministic, attributed new-item fixture in the E2E helper using shared archive writing and `@napi-rs/canvas`. Fill every required walk cell, use male body coverage to create a known warning, and retain exact authors/licenses/URLs.

Drive this sequence:

1. visit `/asset-packs`;
2. upload formal `1.0.0`;
3. observe official release identity, focused pack preview, and base-plus-pack credits;
4. replace a PNG and observe a new revision plus version blocker;
5. set `1.0.1`;
6. enter one non-empty reason for each warning and confirm each separately;
7. download draft and prove its manifest contains `status: "draft"`;
8. reset, re-upload draft, and prove manifest/sources/acknowledgements survive;
9. satisfy formal gates and download formal;
10. invoke built CLI `asset inspect` and `asset install` on that exact Playwright download in a clean temporary workspace from repository root;
11. assert formal install succeeds, draft install exits `1` with `asset_pack_draft`, doctor is healthy after formal install, and all temp writes stay under the workspace.

  - Implementation: added the deterministic attributed fixture and full browser-to-CLI workflow in `packages/web/e2e/`.

- [x] **Step 2: Run E2E and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts
```

Expected: FAIL until the E2E script builds CLI and the final UX/CLI handoff is complete.

  - Verification: RED observed during the first E2E iterations; the failing run exposed the missing CLI build, StrictMode disposal, legacy animation authorization, pooled warning input, stale acknowledgement, and draft re-upload gate issues.

- [x] **Step 3: Make E2E and packed CLI execute the public contracts**

Extend Web `pretest:e2e` to prepare/verify assets and build CLI so `packages/cli/dist/index.js` is available to Playwright. Keep ordinary E2E independent of `upstream/` and network.

Extend packed CLI smoke with one generated draft archive:

```js
const draftInspect = runInstalledCli([
  'asset', 'inspect', draftArchive, '--json',
]);
assert.equal(draftInspect.status, 1);
assert.equal(JSON.parse(draftInspect.stdout).data.status, 'draft');

const draftInstall = runInstalledCli([
  'asset', 'install', draftArchive, '--workspace', consumerRoot, '--json',
]);
assert.equal(draftInstall.status, 1);
assert.match(draftInstall.stdout, /asset_pack_draft/u);
```

Assert no installed state changed after draft rejection.

  - Implementation: `pretest:e2e` now builds CLI; packed smoke creates a safe draft ZIP and asserts status-1 inspection/install plus unchanged workspace state.

- [x] **Step 4: Update all documentation surfaces**

Apply the matrix exactly:

- `help`: already changed in Task 6; recheck output against CLI README.
- `cli-readme`: document `status: "draft"`, inspect JSON/human output, install refusal, no override, and Web correction versus CLI creation/lifecycle.
- `root-readme`: replace Web Phase 3 deferral with browser upload/correction/draft/formal flow and retain no-clone CLI creation.
- `landing`: expose Workbench CTA and explain Web repairs one archive while CLI creates/installs/manages packs.
- `architecture`: document the format package, runtime ports, unsafe/repairable/verified results, Worker, baseline, preview overlay, release fingerprints, and attribution.
- `engineering`: list shared package, Worker/Web unit tests, focused E2E, CLI build/package smoke, and complete Phase 3 commands.
- `releasing`: document format package build/vendoring, Web bundle, no independent publication, and packed smoke draft gate.
- `plugin`: update the animation-audit workflow handoff to say CLI `asset init --from-audit` creates source, Web Workbench repairs an existing archive, and Web drafts cannot be installed.

Update tests so every claim is executable or asserted.

  - Documentation impact: `help: update`; `cli-readme: update`; `root-readme: update`; `landing: update`; `architecture: update`; `engineering: update`; `releasing: update`; `plugin: update`.

- [x] **Step 5: Verify E2E, package smoke, docs, and plugin**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx package-scripts.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts plugin-contract.test.ts
rtk pnpm verify:plugin
rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: PASS. The exact formal browser download installs; the exact draft does not.

  - Verification: focused Web 38 tests PASS; focused CLI 60 tests PASS; plugin 40 tests PASS; browser E2E 1 passed; CLI build PASS; packed CLI smoke PASS; repository `rtk pnpm verify` PASS after the fixture typing correction.

- [x] **Step 6: Commit Task 14**

```sh
rtk git add packages/web/e2e packages/web/package.json packages/web/test/package-scripts.test.ts packages/cli/scripts/smoke-packed-cli.mjs packages/cli/test/plugin-contract.test.ts packages/cli/README.md README.md packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx docs/ARCHITECTURE.md docs/ENGINEERING.md docs/RELEASING.md plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md plugins/lpc-toolkit/test/animation-asset-audit.test.mjs
rtk git commit -m "docs(asset-pack): publish browser correction workflow"
```

Record the full hash and PASS evidence, then commit the plan record separately.

  - Product commit: `368794d4458740c9e6896d63824e0e868ad2f196` (`docs(asset-pack): publish browser correction workflow`).
  - Evidence: `.superpowers/sdd/task-14-e2e-report.md`; plan/evidence commit follows this update.

---

## Task 15: Run the complete Phase 3 verification and review gate

**Files:**
- Modify only files required to fix failures traceable to Tasks 1–14.
- Modify: `docs/superpowers/plans/2026-07-23-artist-asset-pack-web-workbench.md`

**Interfaces:**
- Consumes: every Phase 3 task.
- Produces: final evidence that shared format, Core, CLI, Web, E2E, package, documentation, plugin, and architecture gates agree.

- [x] **Step 1: Run focused shared/Core/CLI/Web suites**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts asset-pack-baseline.test.ts asset-pack-validation.test.ts asset-pack-compile.test.ts asset-pack-version.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-validation.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts asset-pack-registry.test.ts asset-pack-state.test.ts asset-pack-transaction.test.ts asset-pack-remove.test.ts asset-pack-doctor.test.ts asset-authoring-e2e.test.ts asset-lifecycle-e2e.test.ts command-spec.test.ts main-human.test.ts main-json.test.ts plugin-contract.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-route.test.ts app-shell.test.tsx landing-page.test.tsx boundary-check.test.ts package-scripts.test.ts
```

Expected: PASS. Record exact test counts in the plan.

  - Verification: `asset-pack-format` 70 tests PASS; Core 85 tests PASS; CLI 460 tests PASS; Web 239 tests PASS; total 854 tests PASS.

- [x] **Step 2: Run architecture, types, builds, browser, and package gates**

```sh
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck
rtk pnpm --filter @lpc-toolkit/asset-pack-format build
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web build
rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm verify:plugin
```

Expected: PASS with no initialized `upstream/`.

  - Verification: boundaries PASS; asset-pack-format/Core/CLI/Web typechecks PASS; format build PASS; Web build PASS; CLI build PASS; browser E2E 1 passed; packed CLI smoke PASS; plugin verification 40 tests PASS.

- [x] **Step 3: Run the complete repository gate**

```sh
rtk pnpm verify
rtk git diff --check
rtk git status --short
```

Expected: PASS. Status contains only intentional plan-record changes before the final record commit; no generated archive, cache, Playwright report, temp workspace, asset mutation, `upstream/`, lockfile drift beyond the new workspace importer, or unrelated file.

  - Verification: `rtk pnpm verify` completed with boundary, CLI-doc policy, plugin, typecheck, and recursive test gates passing; generated `.lpc-toolkit-cache/` was removed; no asset/upstream/lockfile drift observed.

- [x] **Step 4: Reassess documentation and acceptance**

Confirm every CLI matrix item is still `update` and present in the diff. Manually map each of the ten design acceptance criteria to a passing test or exact command. Verify the plan contains no unchecked completed implementation step and every completed task contains full commit hash plus exact PASS/FAIL evidence.

  - Documentation: all eight CLI surfaces remain `update` in the Task 14 record and corresponding owned files are present.
  - Acceptance mapping: byte-identical formal fixtures are covered by format archive/conformance tests; unsafe/repairable bounds by archive/deflate tests; draft status and acknowledgement preservation by Web manifest/release/workbench tests plus browser round-trip; monotonic revisions and stale responses by worker/session/workbench tests; raw JSON acknowledgement isolation by manifest-editor/workbench tests; preview/error/attribution by preview, attribution, and download tests; formal CLI handoff and draft no-mutation by browser E2E and packed smoke; no clone/backend/IndexedDB by architecture and E2E contracts; vendored format package by CLI packaging smoke; repository hygiene by boundary, upstream-pin, CLI-doc, plugin, and verify gates.

- [x] **Step 5: Request code review and address findings**

Invoke `superpowers:requesting-code-review`. Review for archive safety regressions, unbounded browser allocation, stale revision races, acknowledgement bypass, same-version/different-bytes, draft install mutation, missing attribution, Worker/main ownership, route initialization, unload behavior, package vendoring, and documentation drift.

For each accepted fix, start with a failing regression test, implement the minimum correction, rerun the narrow suite, and commit:

```sh
rtk git diff --name-only
rtk git add --patch
rtk git commit -m "fix(asset-pack): address Phase 3 review"
```

Before staging, write the exact accepted-fix paths and narrow verification
commands into this task's plan record. Stage only those reviewed hunks. Record
every fix commit and verification result in this task.

  - Review: Sol fast review returned two valid Important archive-allocation findings and one documentation finding. Before staging, the accepted fix paths are `packages/asset-pack-format/src/archive.ts` and `packages/asset-pack-format/test/archive.test.ts`; narrow verification is `rtk pnpm --filter @lpc-toolkit/asset-pack-format test` (72 tests PASS), `rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck` (PASS), and `rtk git diff --check` (PASS). Luna review attempts timed out without findings and were not reported as approval.
  - Fix commit: `d2f3377460bce086ca0dbfab0600f53be8d46c81` (`fix(asset-pack): bound archive allocation`).

- [x] **Step 6: Rerun final gates after review**

```sh
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm verify
rtk git diff --check
rtk git status --short --branch
```

Expected: PASS and a clean product worktree except the final plan record.

  - Final post-fix verification: boundaries PASS; asset-pack-format 72 tests and typecheck PASS; browser E2E 1 passed; packed CLI smoke PASS; `rtk pnpm verify` PASS; generated cache removed; `rtk git diff --check` PASS; only this plan record remains modified.

- [x] **Step 7: Commit the final plan record**

```sh
rtk git add docs/superpowers/plans/2026-07-23-artist-asset-pack-web-workbench.md
rtk git commit -m "docs(plan): record Phase 3 verification"
```

Record that full hash only after the commit succeeds. Do not push, open a PR, publish npm, tag a release, deploy, or mutate external state without a separate user request.

  - Earlier plan-record commit: `4117419cc9ee9a9515a08b2d24f9cd54906f6c94` (`docs(plan): record Phase 3 verification`).
  - Final verification record commit: `fce75f984679a28ce2527d47f328870db38555d4` (`docs(plan): record Sol review fix and final verification`); this hash is recorded by the follow-up finalization commit.


## Handoff Success Checklist

- [x] Existing formal archive fixtures are byte-identical before and after shared extraction.
- [x] Unsafe archives expose no editable bytes; repairable archives remain bounded.
- [x] Browser inflation aborts before configured output limits.
- [x] Draft status does not alter the existing acknowledgement content digest.
- [x] CLI inspect reports draft and install rejects it before state mutation.
- [x] Every Web edit has a monotonic revision and stale Worker/preview/download responses are ignored.
- [x] Advanced/raw JSON cannot write acknowledgements outside the warning workflow.
- [x] Version is resolved before acknowledgement when a bump is required.
- [x] Preview represents only the current error-free revision.
- [x] Preview attribution includes exact official base and pack credits.
- [x] Draft round-trip restores repair state and remains non-installable.
- [x] Formal bytes pass shared inspection plus clean CLI inspect/install.
- [x] No repository clone, CLI installation, backend, or IndexedDB is needed by the browser artist.
- [x] All eight CLI documentation surfaces are updated and tested.
- [x] Packed CLI contains the vendored internal format package.
- [x] `upstream/`, checked-in assets, managed cache, and unrelated user files remain untouched.
- [x] All focused, E2E, package, plugin, boundary, build, and `rtk pnpm verify` gates pass.
