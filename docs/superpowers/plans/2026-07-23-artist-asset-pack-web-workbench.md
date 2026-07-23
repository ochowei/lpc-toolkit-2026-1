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

- [ ] **Step 1: Write failing package payload and compatibility tests**

Port the immutable payload cases from `packages/cli/test/asset-pack-payload.test.ts`. Assert missing and unexpected sources, copied bytes, deterministic source ordering, identical content digests for formal versus draft status, acknowledgement-only stability, and substantive invalidation.

Use an explicit fake runtime:

```ts
const runtime: AssetPackFormatRuntime = {
  sha256: async (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  decodeUtf8Fatal: (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  encodeUtf8: (value) => new TextEncoder().encode(value),
  inflateRawBounded: async () => {
    throw new Error('not used by payload tests');
  },
};
```

Port compatibility expectations for absent/equal/higher minimum CLI versions, the two exact supported capabilities, and unknown capabilities.

- [ ] **Step 2: Write failing boundary and CI-routing tests**

Extend the executable boundary fixture to prove:

- Web and CLI may import `@lpc-toolkit/asset-pack-format`.
- The format package may import only its local files, public Core, and JSZip.
- The format package rejects `node:*`, React, DOM runtime globals, CLI/Web source imports, filesystem imports, and internal Core paths.
- Core still rejects importing the format package.
- Changes below `packages/asset-pack-format/**` activate both Web E2E and CLI package CI filters.

- [ ] **Step 3: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test
rtk pnpm --filter @lpc-toolkit/web test -- boundary-check.test.ts package-scripts.test.ts
```

Expected: FAIL because the workspace package and boundary ownership do not exist.

- [ ] **Step 4: Create the package and minimal payload implementation**

Use this package metadata shape:

```json
{
  "name": "@lpc-toolkit/asset-pack-format",
  "version": "0.0.0",
  "private": true,
  "license": "GPL-3.0-or-later",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@lpc-toolkit/core": "workspace:*",
    "jszip": "^3.10.1"
  }
}
```

`parseAssetPackPayload` accepts `Uint8Array` and a runtime, copies every input byte array, parses through Core, reports exact expected/missing/extra source paths, hashes recursively sorted content input, and returns readonly maps. It must not import `Buffer` or call a global runtime API.

Move `SUPPORTED_ASSET_PACK_CAPABILITIES`, `AssetPackLifecycleDiagnostic`, and `checkAssetPackCompatibility(pack, cliVersion)` into the new package without changing messages or sorting.

- [ ] **Step 5: Extend boundaries and CI routing**

Teach `scripts/check-boundaries.mjs` the new package root and dependency direction. Add `packages/asset-pack-format/**` to both `web` and `cli` path filters. Keep the existing unit job unchanged because `rtk pnpm verify` already traverses every workspace package.

- [ ] **Step 6: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test
rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck
rtk pnpm --filter @lpc-toolkit/asset-pack-format build
rtk pnpm --filter @lpc-toolkit/web test -- boundary-check.test.ts package-scripts.test.ts
rtk pnpm check:boundaries
```

Expected: PASS. Inspect `pnpm-lock.yaml` and confirm only the new workspace importer and existing JSZip/Core edges changed.

- [ ] **Step 7: Commit Task 2**

```sh
rtk git add packages/asset-pack-format pnpm-lock.yaml scripts/check-boundaries.mjs packages/web/test/boundary-check.test.ts packages/web/test/package-scripts.test.ts .github/workflows/ci.yml
rtk git commit -m "feat(format): add shared asset pack payload contracts"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Port failing raw-ZIP security and bounds tests**

Move reusable byte fixtures into the shared test without weakening a case. Cover absolute, drive, UNC, backslash, NUL, empty, dot, parent, device names, ASCII-case and NFC collisions, duplicate entries, directory/symlink/FIFO modes, encryption, unsupported methods, flag mismatch, local/central mismatch, invalid offsets, overlap, data descriptors, trailing DEFLATE data, ZIP64, and all exact bounds.

Assert structural attacks return:

```ts
expect(result).toMatchObject({
  kind: 'unsafe',
  diagnostics: [{ code: 'asset_archive_unsafe' }],
});
expect('snapshot' in result).toBe(false);
```

- [ ] **Step 2: Write failing allocation-free raw-DEFLATE tests**

Exercise `inspectRawDeflate` directly with stored, fixed-Huffman, and
dynamic-Huffman streams. Assert exact decoded-size accounting and byte
consumption without materializing decoded output. Reject:

- truncated headers or bit fields, and complete trailing bytes after the final
  block (unused padding bits in the final consumed byte remain permitted);
- invalid `LEN`/`NLEN`, reserved block types, and missing end-of-block symbols;
- empty or oversubscribed trees, and incomplete trees except the
  RFC-permitted single-symbol literal/distance cases;
- invalid repeat instructions, literal/length symbols, distance symbols, and
  back-references beyond decoded history;
- decoded size greater than either the ZIP declaration or configured entry
  limit.

Use a test runtime whose inflater records calls. Prove archive inspection
rejects malformed or trailing raw DEFLATE before the runtime inflater is
called. This closes the browser parity gap where
`DecompressionStream('deflate-raw')` may otherwise accept unused trailing
input.

- [ ] **Step 3: Write failing repairable-versus-verified tests**

Create safe envelopes with bad checksum JSON, missing checksum rows, digest mismatch, invalid manifest JSON, schema errors, missing referenced PNG, and safe unreferenced `sprites/...` entries.

Assert checksum/payload failures return bounded repair snapshots, while a complete archive returns `verified`. Verify all returned arrays are copies and later input mutation changes no snapshot bytes or digest.

- [ ] **Step 4: Write failing deterministic formal/draft writer tests**

Assert reversed map insertion order and different process time zones produce byte-identical archives. Inspect sorted paths, fixed DOS time `1980-01-01 00:00:00`, UNIX `0o100644`, DEFLATE level 9, no directory entries, exact checksums, and read-back result.

While the Phase 2 CLI writer is still unmodified, add one CLI conformance case
that builds the same minimal formal archive through the old writer and the new
shared writer. Assert byte equality, then freeze the old writer's complete
archive hex, archive digest, content digest, source digests, normalized
manifest, and diagnostics as inline snapshots. The shared conformance suite
must assert those same values without importing CLI source.

For draft:

```ts
const draft = await createAssetPackArchive({
  kind: 'draft',
  manifestDocument: validManifest(),
  sourceBytes,
  runtime,
});
expect(draft.inspection.kind).toBe('verified');
expect(draft.inspection.snapshot.payload.pack.status).toBe('draft');
```

Also prove draft can preserve a safe unreferenced sprite as a repairable diagnostic, while formal assembly rejects it.

- [ ] **Step 5: Run shared archive tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- deflate.test.ts archive.test.ts archive-conformance.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts
```

Expected: FAIL because `deflate.ts` and `archive.ts` do not exist.

- [ ] **Step 6: Implement the raw-DEFLATE preflight and port ZIP metadata parsing**

Retain every Phase 2 constant and comparison. Parse EOCD and all central/local metadata before the first inflation. Use the runtime's fatal UTF-8 decoder only for UTF-8-flagged names; require printable ASCII otherwise. Use `entryPath.normalize('NFC').toLowerCase()` only after all path-shape validation.

Implement a bounded bit reader and RFC 1951 block decoder that validates
stored/fixed/dynamic Huffman structure and counts decoded bytes and
back-reference history without allocating decoded output. Require its decoded
count to equal the ZIP declaration, reject any complete byte remaining after
the final block, and run it before the concrete inflater for every method-8
entry.

Inflate each method-8 entry through:

```ts
const contents = await runtime.inflateRawBounded({
  compressed,
  declaredSize: entry.uncompressedSize,
  maximumSize: Math.min(
    entry.uncompressedSize,
    ASSET_PACK_ARCHIVE_LIMITS.entryBytes,
  ),
});
```

Require exact output length and CRC before adding bytes to a repair snapshot. Never expose bytes for unsafe metadata or a resource-limit failure.

- [ ] **Step 7: Implement checksum classification and deterministic assembly**

Malformed or mismatched checksums retain a safe bounded snapshot and return `repairable`; complete checksum and payload verification returns `verified`. Formal writer normalizes through Core and rejects draft status, missing/extra sources, and every domain-invalid payload. Draft writer canonicalizes the JSON object, writes `status: "draft"`, retains safe `sprites/` bytes, and may return repairable when semantic errors remain.

Use JSZip only after entries pass output validation:

```ts
zip.file(entryPath, contents, {
  binary: true,
  date: new Date(Date.UTC(1980, 0, 1, 0, 0, 0)),
  createFolders: false,
  unixPermissions: 0o100644,
});
const archiveBytes = await zip.generateAsync({
  type: 'uint8array',
  platform: 'UNIX',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
  streamFiles: false,
});
```

Reject generated bytes above the existing encoded-archive maximum before
read-back. Read back the exact generated bytes with the same runtime before
returning, and require the result kind allowed by the requested draft/formal
mode.

- [ ] **Step 8: Verify GREEN and exact legacy fixture parity**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- deflate.test.ts archive.test.ts archive-conformance.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts
rtk pnpm --filter @lpc-toolkit/asset-pack-format run typecheck
rtk pnpm check:boundaries
```

Expected: PASS, including byte-for-byte equality with archives generated by the still-unmodified Phase 2 CLI writer.

- [ ] **Step 9: Commit Task 3**

```sh
rtk git add packages/asset-pack-format/src/deflate.ts packages/asset-pack-format/src/archive.ts packages/asset-pack-format/src/index.ts packages/asset-pack-format/test/deflate.test.ts packages/asset-pack-format/test/archive.test.ts packages/asset-pack-format/test/archive-conformance.test.ts packages/cli/test/asset-pack-archive-format.test.ts
rtk git commit -m "feat(format): share bounded asset pack archives"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing Node-adapter and vendoring tests**

Assert SHA-256 includes the `sha256:` prefix, fatal UTF-8 rejects invalid bytes, and bounded inflate rejects output beyond `declaredSize` or `maximumSize`. Extend package metadata and smoke assertions so the built CLI contains `dist/vendor/@lpc-toolkit/asset-pack-format/dist/index.js` and no unresolved workspace import.

- [ ] **Step 2: Change existing archive tests to await shared inspection**

Update each direct `readAssetPackArchive(...)` call to `await`. Preserve every existing expected diagnostic, byte count, immutable snapshot, extraction, and deterministic writer assertion. Do not delete raw ZIP cases merely because they also exist in the shared suite.

Retain the Task 3 frozen archive-hex/digest/manifest inline snapshots. After
the legacy writer body is removed, make the same test exercise the shared
package through `nodeAssetPackFormatRuntime`; the expected values must not be
updated.

- [ ] **Step 3: Run CLI focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts package-metadata.test.ts
```

Expected: FAIL because CLI is not wired to the new package and vendoring omits it.

- [ ] **Step 4: Implement the Node runtime and thin wrappers**

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

- [ ] **Step 5: Migrate callers without changing public output**

Await archive inspection in packaging, inspection, and tests. Keep `asset-pack-payload.ts` and `asset-pack-compatibility.ts` as narrow compatibility wrappers while call sites migrate; they must contain no duplicate domain decisions. A repairable shared result maps to the existing CLI invalid inspection report and never exposes an install snapshot.

Build Core, format, presets, and embedded Web before CLI TypeScript. Add
`@lpc-toolkit/asset-pack-format` as a CLI workspace development dependency,
add format source aliases to development/build tsconfigs, and vendor it beside
Core/presets. Keep JSZip as the existing public runtime dependency used by the
vendored format writer.

- [ ] **Step 6: Verify focused parity and packed output**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts package-metadata.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: PASS. Existing formal archive fixtures retain exact bytes and SHA-256. The packed smoke runs without a workspace checkout or `upstream/`.

- [ ] **Step 7: Commit Task 4**

```sh
rtk git add packages/cli/src packages/cli/test packages/cli/package.json packages/cli/tsconfig.json packages/cli/tsconfig.build.json packages/cli/scripts/vendor-workspace-deps.mjs
rtk git commit -m "refactor(cli): consume shared asset pack archives"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing shared PNG tests**

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

- [ ] **Step 2: Write failing Core recolor tests**

Move the configured source-ramp cases out of CLI-only assertions. Given `AssetPackSourceInspection.decoded.paletteColors`, assert missing configured colors produce a deterministic `asset_pack_schema_invalid` error and valid ramps pass for single and multi-color recolor forms.

- [ ] **Step 3: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test -- png.test.ts
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-validation.test.ts asset-pack-inspection.test.ts
```

Expected: FAIL because PNG parity and Core recolor validation are not shared.

- [ ] **Step 4: Implement shared inspection and Node decode**

Use `DataView` for IHDR and CRC preflight. Decode once through the injected port, scan exact geometry cells over RGBA bytes, collect sorted `row:column` non-transparent cells and lowercase `#rrggbb` colors, and return Core's existing inspection shape.

The Node decoder uses `@napi-rs/canvas` and the existing canvas adapter to return one full RGBA buffer. It must not enter the shared package.

- [ ] **Step 5: Move recolor decisions into Core**

Fold the existing `validateRecolorSourceRamps` behavior into `validateAssetPack` after geometry/source checks. Delete the duplicate CLI helper. CLI validation calls shared source inspection and then the same Core validator used by Web.

- [ ] **Step 6: Verify GREEN**

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

- [ ] **Step 7: Commit Task 5**

```sh
rtk git add packages/asset-pack-format/src packages/asset-pack-format/test/png.test.ts packages/core/src/asset-pack-validation.ts packages/core/test/asset-pack-validation.test.ts packages/cli/src/asset-pack-node-runtime.ts packages/cli/src/asset-pack-validation.ts packages/cli/test/asset-pack-validation.test.ts packages/cli/test/asset-pack-inspection.test.ts
rtk git commit -m "refactor(asset-pack): share PNG validation"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing draft lifecycle tests**

Generate a checksum-valid archive with `status: "draft"` and otherwise valid content. Assert:

```ts
expect((await inspectAssetPackArchive(options)).report).toMatchObject({
  valid: false,
  status: 'draft',
  diagnostics: [{ code: 'asset_pack_draft', severity: 'error' }],
});
```

Assert install returns the same code without creating staging, registry, installed source, journal, or output. Seed a managed-state fixture containing a draft and assert doctor is unhealthy. Assert `asset pack` refuses a draft source rather than silently stripping the marker.

- [ ] **Step 2: Write failing help and human/JSON presentation tests**

Require `asset inspect --help` to say it reports draft status and `asset install --help` to say draft archives are rejected. Human inspect output must label `DRAFT`; JSON report gains optional `status: "draft"` without changing existing formal report keys.

- [ ] **Step 3: Run focused CLI tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts asset-pack-doctor.test.ts command-spec.test.ts main-human.test.ts main-json.test.ts
```

Expected: FAIL because draft is currently treated as an ordinary valid v1 pack.

- [ ] **Step 4: Add one lifecycle diagnostic and fail before mutation**

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

- [ ] **Step 5: Update help with the exact public contract**

Change only command descriptions/examples required for draft behavior. Do not add `--force`, `--ignore-warnings`, or an install override. Keep existing exit code `1` for invalid inspection/install.

- [ ] **Step 6: Verify GREEN and lifecycle non-mutation**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts asset-pack-doctor.test.ts command-spec.test.ts main-human.test.ts main-json.test.ts asset-lifecycle-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS. Existing formal install/no-op/upgrade/downgrade behavior remains unchanged.

- [ ] **Step 7: Commit Task 6**

```sh
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): reject draft asset pack archives"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing Web Crypto and bounded-inflate tests**

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

- [ ] **Step 2: Write failing browser archive conformance tests**

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

- [ ] **Step 3: Write failing worker-safe PNG decoder tests**

Inject `createImageBitmap` and `OffscreenCanvas` factories. Assert decoded width, height, full RGBA byte order, bitmap close, canvas dimension, and deterministic capability diagnostics when either API is unavailable. Do not use `document`, `HTMLImageElement`, or object URLs in this adapter.

- [ ] **Step 4: Write failing official baseline tests**

Build a tiny Catalog with reversed insertion order and assert stable definition/credit digests, palettes, `asset-release.json` tag, and `__LPC_CLI_VERSION__`. The baseline result must match the Node projection hashes for the same definitions.

- [ ] **Step 5: Run focused Web tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts
```

Expected: FAIL because browser adapters and build constants do not exist.

- [ ] **Step 6: Implement bounded browser runtime**

`inflateRawBounded` pipes a Blob stream through `DecompressionStream('deflate-raw')`, reads chunks, checks `total + chunk.byteLength` before retaining each chunk, cancels on violation, requires exact declared length, and copies the final bytes. Report unsupported APIs through a typed `AssetPackBrowserCapabilityError` with code `asset_browser_capability_missing`.

Convert Web Crypto bytes to lowercase hex:

```ts
const digest = await crypto.subtle.digest('SHA-256', bytes);
const hex = [...new Uint8Array(digest)]
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');
return `sha256:${hex}`;
```

- [ ] **Step 7: Implement PNG decoder and baseline loading**

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

- [ ] **Step 8: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS without reading `upstream/` or fetching a base release.

- [ ] **Step 9: Commit Task 7**

```sh
rtk git add packages/web/src/adapter/asset-pack-format-runtime.ts packages/web/src/adapter/asset-pack-png-decoder.ts packages/web/src/lib/asset-pack-baseline.ts packages/web/src/vite-env.d.ts packages/web/test/asset-pack-format-runtime.test.ts packages/web/test/asset-pack-format-conformance.test.ts packages/web/test/asset-pack-png-decoder.test.ts packages/web/test/asset-pack-baseline.test.ts packages/web/package.json packages/web/tsconfig.json packages/web/vitest.config.ts packages/web/vite.config.ts
rtk git commit -m "feat(web): add safe asset pack browser adapters"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing open-outcome and size-gate tests**

Use a fake runtime and decoder. Cover:

- `File.size` above `ASSET_PACK_ARCHIVE_LIMITS.archiveBytes` returns a terminal `asset_archive_limit_exceeded` response without calling `arrayBuffer`.
- Unsafe archive returns no session.
- Safe invalid checksum or schema opens repair mode with source summaries.
- Valid formal and valid draft uploads retain original archive digest, original version/status, and baseline release tag.
- A safely decoded non-object or invalid-JSON manifest opens editable raw-manifest repair with exact diagnostics and `draftSerializable: false`; unsafe ZIP metadata still creates no session.

- [ ] **Step 2: Write failing edit, revision, and acknowledgement tests**

Open revision `0`; send manifest/source/remove edits at revisions `1`, `2`, and `3`. Assert exact monotonic acceptance, stale request rejection, copied source bytes, missing/unreferenced diagnostics, content digest changes, exact acknowledgement candidates, and acknowledgement invalidation after PNG or version changes.

The test must prove direct acknowledgement edits from raw/advanced JSON are rejected:

```ts
expect(result.diagnostics).toContainEqual(
  expect.objectContaining({ code: 'asset_acknowledgement_edit_forbidden' }),
);
```

Only `replace-manifest` with `origin: 'acknowledgement'`, produced by the governance helper, may change acknowledgements. It must carry exactly the current candidate subjects and one non-empty reason per selected warning. Requests from `advanced-json` or `raw-repair` that add, remove, or alter acknowledgement records return `asset_acknowledgement_edit_forbidden`; ordinary overview/credit edits preserve records only while their candidate digest remains current.

- [ ] **Step 3: Write failing validation, preview, and candidate tests**

Cover PNG preflight/decode, Core geometry/frame/recolor/credit validation, compatibility, compile diagnostics, and base identity. Assert:

- zero errors plus warnings returns a preview payload;
- any error returns no preview;
- preview payload maps every compiled destination to exact current source bytes;
- matched compile credits are present;
- release fingerprint includes acknowledgements/credits/sources and excludes version/status;
- formal candidate is cached only after validation, acknowledgements, credits, and assembly/read-back pass;
- draft assembly remains available at the draft serialization threshold.

- [ ] **Step 4: Run Worker tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
```

Expected: FAIL because the protocol and session do not exist.

- [ ] **Step 5: Implement serializable protocol and session ownership**

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

- [ ] **Step 6: Implement validation and release calculations**

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

- [ ] **Step 7: Implement draft/formal assembly messages**

Draft requests accept repairable domain state but require one JSON object and safe bounded sources. Formal requests require the cached candidate to belong to the exact revision and return `candidate-not-verified` otherwise. Transfer only the final archive `ArrayBuffer` to the main thread and retain enough immutable metadata to report its digest and filename.

- [ ] **Step 8: Wire the Worker entry and verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS. The Worker source imports no React component or Node module.

- [ ] **Step 9: Commit Task 8**

```sh
rtk git add packages/web/src/lib/asset-pack-worker-protocol.ts packages/web/src/workers/asset-pack-worker-session.ts packages/web/src/workers/asset-pack-worker.ts packages/web/src/lib/asset-pack-baseline.ts packages/web/test/asset-pack-worker-session.test.ts packages/web/test/asset-pack-worker-protocol.test.ts
rtk git commit -m "feat(web): validate asset packs in a worker"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing reducer and stale-result tests**

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

- [ ] **Step 2: Write failing editor-projection and governance tests**

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

- [ ] **Step 3: Write failing release-gate tests**

Cover every `AssetPackFormalBlocker`. Assert next-patch suggestions for stable/prerelease SemVer; no suggestion for invalid original version; greater custom versions accepted; draft upload always requires increase; changed release fingerprint requires increase; and unchanged formal upload may retain version only when candidate and original archive digests match.

Apply a required version change before enabling acknowledgement submission, because the existing content digest includes version and a later version edit would correctly invalidate prior acknowledgements.

- [ ] **Step 4: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts
```

Expected: FAIL because workbench state/orchestration does not exist.

- [ ] **Step 5: Implement Worker client and reducer**

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

- [ ] **Step 6: Implement pure edits and release gate**

All editor paths reconstruct one manifest text and send that exact text to the Worker. Preserve existing acknowledgements unless the dedicated governance helper removes/replaces them. Never let a form and JSON editor retain separate manifest copies.

Calculate formal blockers in stable UI order. `ready` is exactly `blockers.length === 0`; do not hide a blocker after the user clicks download.

- [ ] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS, including stale response and acknowledgement/version ordering.

- [ ] **Step 8: Commit Task 9**

```sh
rtk git add packages/web/src/lib/asset-pack-worker-client.ts packages/web/src/lib/asset-pack-manifest-editor.ts packages/web/src/slice/asset-pack-workbench.ts packages/web/src/slice/asset-pack-release.ts packages/web/src/hooks/use-asset-pack-workbench.ts packages/web/test/asset-pack-worker-client.test.ts packages/web/test/asset-pack-manifest-editor.test.ts packages/web/test/asset-pack-workbench.test.ts packages/web/test/asset-pack-release.test.ts packages/web/test/use-asset-pack-workbench.test.ts
rtk git commit -m "feat(web): model asset pack workbench state"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing route and lazy-load tests**

Assert:

```ts
expect(routeFromPathname('/asset-packs')).toBe('asset-packs');
expect(pathForRoute('asset-packs')).toBe('/asset-packs');
```

Render `/`, `/compose`, `/asset-packs`, and an unknown route. Composer loaders run only on `/compose`; workbench baseline loaders run only on `/asset-packs`; neither initializes on landing/404.

- [ ] **Step 2: Write failing upload and shell tests**

Static markup must include one file input accepting `.lpc-assets.zip,.draft.lpc-assets.zip`, a labeled drop zone, size/help text, an accessible progress live region, and Reset/Back actions. Editing markup must contain left navigation, center preview, and right editor landmarks with stable labels and tabs for narrow screens.

- [ ] **Step 3: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- app-route.test.ts app-shell.test.tsx landing-page.test.tsx asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx
```

Expected: FAIL because the route and components do not exist.

- [ ] **Step 4: Implement lazy route ownership**

Add `asset-packs` to `AppRoute`, `NavigableAppRoute`, and `AppPath`. Create an `AssetPackApp` child that calls `loadBrowserAssetPackBaseline()` once and renders the harness. Do not place baseline loading in root `App`.

Add a landing CTA labeled `Repair an Asset Pack` and replace the Phase 3 deferral text with the actual browser capability plus the CLI/Web distinction.

- [ ] **Step 5: Implement upload and three-region shell**

The upload panel sends one selected/dropped File to the hook after the declared-size gate. The desktop shell uses named `nav`, `main`, and `aside` regions; narrow screens switch the same region state through tabs. Do not render all detailed editors in this task.

Use text plus icon for status counts and `role="status" aria-live="polite"` for Worker progress. Keep Reset explicit; never silently replace the current pack after a second drop.

- [ ] **Step 6: Verify GREEN and build**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- app-route.test.ts app-shell.test.tsx landing-page.test.tsx asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web build
```

Expected: PASS. Landing and 404 do not initialize composer or workbench data.

- [ ] **Step 7: Commit Task 10**

```sh
rtk git add packages/web/src/lib/app-route.ts packages/web/src/App.tsx packages/web/src/components/landing-page.tsx packages/web/src/components/asset-pack-workbench packages/web/test/app-route.test.ts packages/web/test/app-shell.test.tsx packages/web/test/landing-page.test.tsx packages/web/test/asset-pack-upload-panel.test.tsx packages/web/test/asset-pack-workbench-shell.test.tsx
rtk git commit -m "feat(web): add asset pack workbench route"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing Overview, JSON, and Credits tests**

Overview exposes ID, display name, version, minimum CLI, and required capabilities with associated labels and current diagnostic text. Credits exposes repeatable authors/licenses/URLs plus notes and credit override navigation.

Advanced editor shows only `AssetPackAdvancedProjection`, formats two-space JSON with a final newline, reports parse errors without sending an edit, and never exposes acknowledgements/status as writable content. Raw repair mode shows complete manifest text but refuses an acknowledgement-array diff.

- [ ] **Step 2: Write failing source and diagnostic tests**

Source rows display path, consumer count, dimensions, digest, state, Replace, and Remove when unreferenced. A JSON-introduced missing path renders an upload slot. Accept only PNG file selection; Worker remains the authority for signature/decode.

Diagnostic rows render severity/code/message/path/scope and a corrective action. Selecting one invokes the exact panel/path navigation target. No diagnostic is represented by color alone.

- [ ] **Step 3: Write failing individual-warning tests**

Each warning card shows full code, subject JSON, scope, content digest, one reason input, and one Confirm button. Blank/whitespace reason stays disabled. There is no acknowledge-all text or control. Version blockers disable confirmation with a message to set the release version first.

- [ ] **Step 4: Run editor tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx
```

Expected: FAIL because detailed editors do not exist.

- [ ] **Step 5: Implement controlled focused editors**

Every editor receives immutable values and named callbacks; it owns only transient input text. Submit a complete new manifest through Task 9 helpers. Use stable keys from path or warning binding, never array index for mutable author/license/URL rows.

Source replacement calls `replaceSource(path, file)` and does not create an object URL. Unreferenced removal calls `removeSource(path)` after explicit confirmation.

- [ ] **Step 6: Implement exact diagnostics and warning governance**

Map diagnostic scope to Overview/Manifest/Source/Warnings/Credits. On navigation, focus the relevant heading or input using a stable element ID derived from a safe hash, not the raw path.

Warning confirmation calls only `acknowledgeWarning` with the current candidate and reason. Render imported valid acknowledgements as confirmed; render stale acknowledgements only as diagnostics until the Worker removes them from generated output.

- [ ] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx asset-pack-manifest-editor.test.ts asset-pack-release.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS with no acknowledgement bypass and no new editor dependency.

- [ ] **Step 8: Commit Task 11**

```sh
rtk git add packages/web/src/components/asset-pack-workbench packages/web/test/asset-pack-overview-editor.test.tsx packages/web/test/asset-pack-manifest-json-editor.test.tsx packages/web/test/asset-pack-source-list.test.tsx packages/web/test/asset-pack-warnings-editor.test.tsx packages/web/test/asset-pack-credits-editor.test.tsx packages/web/test/asset-pack-diagnostic-list.test.tsx
rtk git commit -m "feat(web): add asset pack correction editors"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write failing overlay resolution tests**

Given a map from compiled destination path to PNG bytes, assert `loadImage` decodes exact pack bytes first and delegates only unmatched official paths to `createBrowserCanvasAdapter`. Assert no arbitrary source path can shadow a base path absent from the compile plan and all created ImageBitmaps are closed or transferred to the composition lifetime.

- [ ] **Step 2: Write failing catalog, selection, and attribution tests**

Build a preview catalog from official definitions plus compile-plan definitions. Assert:

- new item selection replaces only its type in the standard character;
- extend item selection targets the compiled base item;
- body type/animation/direction/asset controls choose valid values;
- imported canonical character JSON is validated against the compiled catalog;
- matched credits equal Core `getCredits` for the exact composed selections;
- pack and official base credits both appear;
- missing credit data returns an error and no preview.

- [ ] **Step 3: Write failing freshness tests**

Resolve revision `4`, then start revision `5`. The hook must immediately return pending with no image. Resolve revision `4` late and prove it is discarded. Reject revision `5` and prove no prior canvas/image remains. Switch only animation/direction and prove source composition is reused when the validated revision and selection are unchanged.

- [ ] **Step 4: Run preview tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx character-document.test.ts
```

Expected: FAIL because preview overlay/catalog ownership does not exist.

- [ ] **Step 5: Implement compiled overlay preview**

Convert baseline `catalog.byItemId` values and compile-plan definitions into one Core `createCatalog` input. Build a destination-to-source byte map only from compile-plan sprites. Use Task 7 palettes and the existing browser canvas adapter fallback.

Construct the fixed standard character from `pickInitialSelections`, then apply the focused pack asset. Imported character JSON replaces that base selection only after Core import succeeds; the focused pack asset is applied afterward so it remains visible.

- [ ] **Step 6: Implement latest-only hook and attribution panel**

Key composition by validated revision, body type, focused asset, imported selection digest, and pack source-byte identity. On any current error/pending revision, clear canvas/sheet/credits synchronously. Reuse existing animation extraction and player helpers after composition.

Render authors, licenses, URLs, notes, resolved paths, and effective license adjacent to the preview. Show the official base release tag. Do not offer an unattributed image export.

- [ ] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx character-document.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
```

Expected: PASS, including current-revision clearing and exact base-plus-pack credits.

- [ ] **Step 8: Commit Task 12**

```sh
rtk git add packages/web/src/adapter/asset-pack-preview-canvas-adapter.ts packages/web/src/lib/asset-pack-preview.ts packages/web/src/hooks/use-asset-pack-preview.ts packages/web/src/components/asset-pack-workbench/attribution-panel.tsx packages/web/src/components/asset-pack-workbench/workbench-preview.tsx packages/web/src/components/asset-pack-workbench/harness.tsx packages/web/test/asset-pack-preview-canvas-adapter.test.ts packages/web/test/asset-pack-preview.test.ts packages/web/test/use-asset-pack-preview.test.ts packages/web/test/asset-pack-attribution-panel.test.tsx packages/web/test/character-document.test.ts
rtk git commit -m "feat(web): preview attributed asset packs"
```

Record the full hash and PASS evidence, then commit the plan record separately.

---

## Task 13: Implement draft/formal downloads and unsaved-work protection

**Files:**
- Create: `packages/web/src/lib/asset-pack-download.ts`
- Create: `packages/web/src/hooks/use-unsaved-work-guard.ts`
- Create: `packages/web/src/components/asset-pack-workbench/download-bar.tsx`
- Modify: `packages/web/src/components/asset-pack-workbench/harness.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/hooks/use-asset-pack-workbench.ts`
- Create: `packages/web/test/asset-pack-download.test.ts`
- Create: `packages/web/test/use-unsaved-work-guard.test.ts`
- Create: `packages/web/test/asset-pack-download-bar.test.tsx`
- Modify: `packages/web/test/app-shell.test.tsx`

**Interfaces:**
- Consumes: Task 9 formal gate, Task 8 assembly response, existing `downloadBlob`.
- Produces: deterministic filenames, exact-revision draft/formal download, downloaded-revision tracking, `beforeunload`, and in-app route blocking.

- [ ] **Step 1: Write failing filename and exact-revision tests**

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

- [ ] **Step 2: Write failing download-gate and status tests**

Draft button is enabled only at `draftSerializable`. It lists remaining errors/warnings before confirmation. Formal button is enabled only when `AssetPackFormalGate.ready` and Worker candidate digest belongs to the current revision. Buttons remain disabled while assembling and expose status through `aria-live`.

- [ ] **Step 3: Write failing unload and route-navigation tests**

Assert no prompt immediately after upload, a prompt after revision change, no prompt after exact current draft/formal download, and prompt again after another edit. Cover reload/close `beforeunload`, Home CTA, programmatic navigation, and browser back. Cancelled navigation must leave pathname and workbench state unchanged.

- [ ] **Step 4: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx
```

Expected: FAIL because download and navigation guards do not exist.

- [ ] **Step 5: Implement exact download handoff**

Convert transferred bytes to `Blob` with `application/zip`, call existing `downloadBlob`, and mark `latestDownloadedRevision` only after the handoff returns without throwing. Do not regenerate or edit bytes on the main thread.

Formal click rechecks current gate, requests the cached exact candidate, verifies response revision/kind/digest metadata, and downloads. Draft click shows remaining diagnostics and requests current draft assembly.

- [ ] **Step 6: Implement unsaved-work guards**

`useUnsavedWorkGuard` registers `beforeunload` only while `currentRevision > latestDownloadedRevision`. Add a blocker registration to the App navigation owner so in-app navigation and `popstate` consult the same injected confirm function before changing route state. Remove listeners/blocker on workbench unmount.

Do not use a custom modal for browser reload/close because browsers control that text. Use one concise confirm message for in-app navigation.

- [ ] **Step 7: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-shell.test.tsx use-asset-pack-workbench.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS with exact revision ownership and no durable browser storage.

- [ ] **Step 8: Commit Task 13**

```sh
rtk git add packages/web/src/lib/asset-pack-download.ts packages/web/src/hooks/use-unsaved-work-guard.ts packages/web/src/components/asset-pack-workbench/download-bar.tsx packages/web/src/components/asset-pack-workbench/harness.tsx packages/web/src/App.tsx packages/web/src/hooks/use-asset-pack-workbench.ts packages/web/test/asset-pack-download.test.ts packages/web/test/use-unsaved-work-guard.test.ts packages/web/test/asset-pack-download-bar.test.tsx packages/web/test/app-shell.test.tsx
rtk git commit -m "feat(web): download governed asset pack archives"
```

Record the full hash and PASS evidence, then commit the plan record separately.

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

- [ ] **Step 1: Write the failing Playwright workflow**

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

- [ ] **Step 2: Run E2E and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts
```

Expected: FAIL until the E2E script builds CLI and the final UX/CLI handoff is complete.

- [ ] **Step 3: Make E2E and packed CLI execute the public contracts**

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

- [ ] **Step 4: Update all documentation surfaces**

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

- [ ] **Step 5: Verify E2E, package smoke, docs, and plugin**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx package-scripts.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts plugin-contract.test.ts
rtk pnpm verify:plugin
rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: PASS. The exact formal browser download installs; the exact draft does not.

- [ ] **Step 6: Commit Task 14**

```sh
rtk git add packages/web/e2e packages/web/package.json packages/web/test/package-scripts.test.ts packages/cli/scripts/smoke-packed-cli.mjs packages/cli/test/plugin-contract.test.ts packages/cli/README.md README.md packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx docs/ARCHITECTURE.md docs/ENGINEERING.md docs/RELEASING.md plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md plugins/lpc-toolkit/test/animation-asset-audit.test.mjs
rtk git commit -m "docs(asset-pack): publish browser correction workflow"
```

Record the full hash and PASS evidence, then commit the plan record separately.

---

## Task 15: Run the complete Phase 3 verification and review gate

**Files:**
- Modify only files required to fix failures traceable to Tasks 1–14.
- Modify: `docs/superpowers/plans/2026-07-23-artist-asset-pack-web-workbench.md`

**Interfaces:**
- Consumes: every Phase 3 task.
- Produces: final evidence that shared format, Core, CLI, Web, E2E, package, documentation, plugin, and architecture gates agree.

- [ ] **Step 1: Run focused shared/Core/CLI/Web suites**

```sh
rtk pnpm --filter @lpc-toolkit/asset-pack-format test
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts asset-pack-baseline.test.ts asset-pack-validation.test.ts asset-pack-compile.test.ts asset-pack-version.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-validation.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-install.test.ts asset-pack-registry.test.ts asset-pack-state.test.ts asset-pack-transaction.test.ts asset-pack-remove.test.ts asset-pack-doctor.test.ts asset-authoring-e2e.test.ts asset-lifecycle-e2e.test.ts command-spec.test.ts main-human.test.ts main-json.test.ts plugin-contract.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts asset-pack-worker-client.test.ts asset-pack-manifest-editor.test.ts asset-pack-workbench.test.ts asset-pack-release.test.ts use-asset-pack-workbench.test.ts asset-pack-upload-panel.test.tsx asset-pack-workbench-shell.test.tsx asset-pack-overview-editor.test.tsx asset-pack-manifest-json-editor.test.tsx asset-pack-source-list.test.tsx asset-pack-warnings-editor.test.tsx asset-pack-credits-editor.test.tsx asset-pack-diagnostic-list.test.tsx asset-pack-preview-canvas-adapter.test.ts asset-pack-preview.test.ts use-asset-pack-preview.test.ts asset-pack-attribution-panel.test.tsx asset-pack-download.test.ts use-unsaved-work-guard.test.ts asset-pack-download-bar.test.tsx app-route.test.ts app-shell.test.tsx landing-page.test.tsx boundary-check.test.ts package-scripts.test.ts
```

Expected: PASS. Record exact test counts in the plan.

- [ ] **Step 2: Run architecture, types, builds, browser, and package gates**

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

- [ ] **Step 3: Run the complete repository gate**

```sh
rtk pnpm verify
rtk git diff --check
rtk git status --short
```

Expected: PASS. Status contains only intentional plan-record changes before the final record commit; no generated archive, cache, Playwright report, temp workspace, asset mutation, `upstream/`, lockfile drift beyond the new workspace importer, or unrelated file.

- [ ] **Step 4: Reassess documentation and acceptance**

Confirm every CLI matrix item is still `update` and present in the diff. Manually map each of the ten design acceptance criteria to a passing test or exact command. Verify the plan contains no unchecked completed implementation step and every completed task contains full commit hash plus exact PASS/FAIL evidence.

- [ ] **Step 5: Request code review and address findings**

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

- [ ] **Step 6: Rerun final gates after review**

```sh
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-workbench.spec.ts
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm verify
rtk git diff --check
rtk git status --short --branch
```

Expected: PASS and a clean product worktree except the final plan record.

- [ ] **Step 7: Commit the final plan record**

```sh
rtk git add docs/superpowers/plans/2026-07-23-artist-asset-pack-web-workbench.md
rtk git commit -m "docs(plan): record Phase 3 verification"
```

Record that full hash only after the commit succeeds. Do not push, open a PR, publish npm, tag a release, deploy, or mutate external state without a separate user request.


## Handoff Success Checklist

- [ ] Existing formal archive fixtures are byte-identical before and after shared extraction.
- [ ] Unsafe archives expose no editable bytes; repairable archives remain bounded.
- [ ] Browser inflation aborts before configured output limits.
- [ ] Draft status does not alter the existing acknowledgement content digest.
- [ ] CLI inspect reports draft and install rejects it before state mutation.
- [ ] Every Web edit has a monotonic revision and stale Worker/preview/download responses are ignored.
- [ ] Advanced/raw JSON cannot write acknowledgements outside the warning workflow.
- [ ] Version is resolved before acknowledgement when a bump is required.
- [ ] Preview represents only the current error-free revision.
- [ ] Preview attribution includes exact official base and pack credits.
- [ ] Draft round-trip restores repair state and remains non-installable.
- [ ] Formal bytes pass shared inspection plus clean CLI inspect/install.
- [ ] No repository clone, CLI installation, backend, or IndexedDB is needed by the browser artist.
- [ ] All eight CLI documentation surfaces are updated and tested.
- [ ] Packed CLI contains the vendored internal format package.
- [ ] `upstream/`, checked-in assets, managed cache, and unrelated user files remain untouched.
- [ ] All focused, E2E, package, plugin, boundary, build, and `rtk pnpm verify` gates pass.
