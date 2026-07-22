# Artist Asset Pack Authoring Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic `.lpc-assets.zip` packaging and inspection plus project-local install, upgrade, explicit downgrade/replacement, list, remove, doctor, and crash-recoverable publication so a pack created in one clean artist workspace can be safely consumed in another.

**Architecture:** Reuse the completed Phase 1 source schema, payload digest, validation, compiler, overlay, and attributed rendering paths. Add a bounded archive reader that validates the ZIP central directory before inflation, a registry-v2 desired-state layer that treats linked and installed sources uniformly, and a journaled publisher that atomically converges manager-owned installed sources, generated output, and registry state after interruption. Core remains pure and owns semantic version/range and manifest normalization decisions; CLI owns bytes, ZIPs, filesystem state, recovery, and presentation.

**Tech Stack:** TypeScript 5.7 strict mode, Node.js 22+, pnpm 9, Vitest 2, existing `jszip` 3.10 for deterministic writing, built-in `node:zlib` for bounded reading, existing `@napi-rs/canvas`, Phase 1 Core asset-pack APIs, and existing CLI runtime/cache/overlay adapters. No new dependency.

**Design:** `docs/superpowers/specs/2026-07-21-artist-asset-pack-authoring-design.md`

**Phase 1 baseline:** completed on `codex/artist-asset-pack-authoring-design`; handoff bookkeeping head before this plan is `4d7ac386a`.

## Global Constraints

- Implement only Phase 2 package lifecycle. Do not add the Phase 3 Web upload/validation/acknowledgement/download UI and do not create an alternate browser manifest.
- Add no dependency and no `any` type. Use the existing `jszip` dependency only for writing; parse untrusted archive metadata with bounded local code before inflating entries.
- Never initialize, require, modify, or commit inside `upstream/`. Never write into checked-in `assets/` or the managed base-asset cache.
- Preserve the Phase 1 `lpc-toolkit.asset-pack.v1` source model, content-digest semantics, namespaced selection identity, strict unknown-field behavior, complete-animation PNG rule, warning acknowledgements, and attribution union.
- Packaging always performs fresh source and pixel validation. Install and upgrade always inspect, verify, stage, compile, validate attribution, and publish from the archive snapshot; no command trusts a previous exit code or mutable source path.
- Archive entries are limited to `asset-pack.json`, `checksums.json`, and referenced `sprites/**` regular files. Reject absolute, drive-qualified, backslash, empty, dot, parent, duplicate, canonical-collision, directory, symlink, special, encrypted, unsupported-compression, and checksum-invalid entries.
- Enforce exact archive limits before pixel decode: at most `4_096` entries; `asset-pack.json` at most `1 MiB`; each entry at most `64 MiB` uncompressed; all entries at most `512 MiB` uncompressed. Reject ZIP64 in Phase 2.
- Check PNG signature and IHDR dimensions against registered animation geometry before invoking `@napi-rs/canvas`; do not allocate a full pixel buffer for an impossible declared geometry.
- Generated archive bytes are deterministic: sorted entry names, recursively sorted normalized JSON, LF plus final newline, DOS timestamp `1980-01-01 00:00:00`, UNIX regular-file mode `0o100644`, DEFLATE level `9`, no directory entries, and no platform-dependent metadata.
- Installing the same pack ID at a greater semantic version is an upgrade. The same version plus identical archive digest is a no-op; the same version plus different bytes is an error. A lower version requires an incoming self-`replaces` declaration whose range matches the installed version and whose asset keys exactly cover the installed pack.
- Installing over an active linked entry of the same pack ID is an error. The user must `asset remove <pack-id>` first; removal never deletes linked artist source.
- Cross-package replacement continues to use Core compiler authorization and exact owner/version/asset matching. Never add implicit last-write-wins.
- Registry v2 reads Phase 1 registry v1, enriches it from validated source snapshots, and writes only v2. A Phase 1 CLI encountering v2 may fail safely; Phase 2 never silently downgrades registry state.
- Sync, install, upgrade, downgrade, and removal publish a complete desired generation. A durable manager-owned journal deterministically rolls back before registry publication and completes after registry publication.
- `asset doctor` is read-only for healthy or tampered state. Its only mutation is deterministic completion/rollback of a valid interrupted manager-owned journal before auditing; it reports that recovery and never adopts, repairs, or deletes unknown content.
- Removing an installed pack deletes its installed source only after the new registry and output are durably published. Removing a linked pack only deactivates the registry entry and generated output.
- Runtime render, preview, frame, sheet, viewer, bundle, ZIP, TXT, CSV, and metadata outputs continue to consume the frozen composed credit manifest. Installed custom assets must retain both base and pack credits.
- Preserve Phase 1 command behavior and tests for workspace init, scaffold, validate, preview, sync, overlay loading, and no-repository authoring.
- Prefix every repository command with `rtk` and use pnpm for repository development.
- After each task's product commit, update this checked-in plan: check completed steps, add a short implementation note, record the full product commit hash, and record every exact verification command with PASS/FAIL. Commit that record separately with `docs(plan): record ...`.

## Phase 2 Contract Elaborations

These details make the approved design executable without changing its intent.

### Compatibility source field

`asset-pack.json` remains `lpc-toolkit.asset-pack.v1` and may add this optional strict field:

```json
{
  "compatibility": {
    "minimumCliVersion": "0.2.0",
    "requiredCapabilities": [
      "lpc-toolkit.asset-pack.v1",
      "lpc-toolkit.asset-pack.lifecycle.v1"
    ]
  }
}
```

Unknown compatibility fields and capabilities fail inspection/install. Omission means no requirement beyond understanding the declared source schema.

### Checksums document

`checksums.json` is strict and does not checksum itself:

```json
{
  "schema": "lpc-toolkit.asset-pack-checksums.v1",
  "files": [
    {
      "path": "asset-pack.json",
      "size": 1234,
      "sha256": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    },
    {
      "path": "sprites/moon-braid/foreground/climb.png",
      "size": 4567,
      "sha256": "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    }
  ]
}
```

Rows sort by `path`. Coverage must equal exactly `asset-pack.json` plus every referenced source path; omissions and extras fail.

### Archive and installed-source names

```text
packed archive: <pack-parent>/<pack-id>-<version>.lpc-assets.zip
installed source: <stateRoot>/installed/<pack-id>/<version>/<archive-sha256-without-prefix>/
installed receipt: <installed source>/install-receipt.json
active transaction: <stateRoot>/transaction.json
transaction data: <stateRoot>/transactions/<operation-id>/
```

`install-receipt.json` is manager metadata, not part of the archive or pack source. It records schema, workspace ID, archive digest, content digest, installed time, and exact extracted payload digests.

### Doctor recovery resolution

The design says doctor normally verifies without mutation and also repairs interrupted manager transactions. Phase 2 treats journal recovery as the narrow exception: all workspace lifecycle commands run recovery first; doctor reports `none`, `rolled-back`, or `completed`. Doctor never repairs source, registry tampering, generated digest drift, missing credits, or unknown files.

## File Structure

### Core

- `packages/core/src/asset-pack-version.ts` — strict SemVer precedence, replacement-range matching, stable asset keys, and lifecycle downgrade authorization.
- `packages/core/src/asset-pack-schema.ts` — optional strict compatibility field and replacement keys that can identify both new and extended assets.
- `packages/core/src/asset-pack-model.ts` — normalized compatibility plus deterministic normalized source reconstruction including acknowledgements.
- `packages/core/src/asset-pack-compile.ts` — consume shared range matching without changing compile output.
- `packages/core/src/index.ts` — publish Phase 2 pure interfaces.
- `packages/core/test/asset-pack-version.test.ts` — SemVer, ranges, asset keys, upgrade/downgrade, and self-replacement coverage.
- `packages/core/test/asset-pack-schema.test.ts` — compatibility strictness and extended replacement-key parsing.
- `packages/core/test/asset-pack-compile.test.ts` — shared range-helper regression.

### CLI payload and archive

- `packages/cli/src/asset-pack-payload.ts` — parse manifest/source byte maps into the same immutable payload snapshot and content digest used by directory sources.
- `packages/cli/src/asset-pack-files.ts` — retain filesystem containment/symlink checks, then delegate byte parsing and hashing to payload.
- `packages/cli/src/asset-pack-archive-format.ts` — limits, safe canonical paths, central-directory parser, bounded inflater, checksums schema, archive snapshot, deterministic ZIP writer, and safe extraction of already-verified payloads.
- `packages/cli/src/asset-pack-compatibility.ts` — compare a normalized pack's optional minimum CLI and capabilities with the running CLI contract.
- `packages/cli/src/asset-pack-packaging.ts` — fresh validation, normalized manifest, checksums, sibling temporary output, atomic archive publication, and pack receipt result.
- `packages/cli/src/asset-pack-inspection.ts` — compatibility checks, archive payload validation, PNG IHDR preflight, attributed Core validation, and inspection report.
- `packages/cli/src/asset-pack-validation.ts` — expose payload-snapshot validation and reuse its existing bounded captured-byte pixel inspector.
- `packages/cli/test/asset-pack-payload.test.ts` — directory/archive digest parity and immutable snapshot behavior.
- `packages/cli/test/asset-pack-archive-format.test.ts` — deterministic bytes plus every archive safety/bounds/checksum case.
- `packages/cli/test/asset-pack-packaging.test.ts` — fresh validation, output naming, receipts, atomic replacement, and source non-mutation.
- `packages/cli/test/asset-pack-inspection.test.ts` — compatibility, IHDR-before-decode, validation, warnings, and attribution.

### CLI lifecycle state

- `packages/cli/src/asset-pack-registry.ts` — registry v1 reader, v2 strict parser/writer, linked/installed entry union, enrichment, ownership, and digest validation.
- `packages/cli/src/asset-pack-state.ts` — load all active snapshots, apply one candidate/removal mutation, compile complete desired state, and build registry v2 metadata.
- `packages/cli/src/asset-pack-transaction.ts` — durable journal, fsync/close adapter, publish phases, recovery, cleanup allowlist, and failure diagnostics.
- `packages/cli/src/asset-pack-sync.ts` — thin linked-candidate wrapper over generalized desired state and journaled publication.
- `packages/cli/src/asset-pack-preview.ts` — consume generalized desired-state preparation for transient previews without publication.
- `packages/cli/src/asset-pack-install.ts` — verified archive staging, lifecycle policy, installed receipt, desired state, install/upgrade/downgrade/no-op, and journaled publication.
- `packages/cli/src/asset-pack-remove.ts` — list summaries and desired-state removal without deleting artist source.
- `packages/cli/src/asset-pack-doctor.ts` — journal recovery report plus registry/source/output/compile/credit/ownership audit.
- `packages/cli/src/asset-workspace.ts` — installed/transactions paths and registry-v2 constants.
- `packages/cli/test/asset-pack-registry.test.ts` — v1 migration, v2 strictness, source unions, digests, and tampering.
- `packages/cli/test/asset-pack-state.test.ts` — mixed linked/installed compilation, ordering, ownership, conflicts, and attribution.
- `packages/cli/test/asset-pack-transaction.test.ts` — failure injection and recovery at every journal phase.
- `packages/cli/test/asset-pack-sync.test.ts` — sync regression through registry v2 and journaled publisher.
- `packages/cli/test/asset-pack-preview.test.ts` — transient generalized-state regression.
- `packages/cli/test/asset-pack-install.test.ts` — install/no-op/upgrade/downgrade/replacement and staging safety.
- `packages/cli/test/asset-pack-remove.test.ts` — list plus linked/installed removal and source deletion boundaries.
- `packages/cli/test/asset-pack-doctor.test.ts` — healthy, recovered, and every tamper category.

### CLI surface, acceptance, and documentation

- `packages/cli/src/asset-commands.ts` — Phase 2 preflight, service dispatch, optional workspace/runtime requirements, and lifecycle result envelopes.
- `packages/cli/src/command-spec.ts` — six Phase 2 commands, options, examples, and help hierarchy.
- `packages/cli/src/main.ts` — command requirement routing, recovery preflight, and `inspect`/`doctor` validity exit status.
- `packages/cli/src/response.ts` — deterministic human pack/inspect/install/list/remove/doctor output.
- `packages/cli/test/command-spec.test.ts` — Phase 2 help/options.
- `packages/cli/test/main-assets.test.ts` — workspace/runtime preparation matrix.
- `packages/cli/test/main-json.test.ts` — JSON envelopes and report schemas.
- `packages/cli/test/main-human.test.ts` — lifecycle human output and recovery guidance.
- `packages/cli/test/asset-lifecycle-e2e.test.ts` — two clean workspaces through pack/install/render/upgrade/remove.
- `packages/cli/scripts/smoke-packed-cli.mjs` — installed public CLI package lifecycle smoke.
- `packages/cli/README.md` — archive, install, lifecycle, recovery, security, and stdout/stderr contracts.
- `README.md` — complete CLI-only author-to-consumer workflow.
- `packages/web/src/components/landing-page.tsx` — replace Phase 2 deferral with package/install workflow while keeping Phase 3 deferred.
- `packages/web/test/landing-page.test.tsx` — lifecycle command/order assertions.
- `docs/ARCHITECTURE.md` — archive trust boundary, registry v2, installed ownership, desired state, journal, recovery, and attribution.
- `docs/ENGINEERING.md` — focused archive/security/lifecycle/recovery/acceptance verification mapping.

## Stable Interfaces

Later tasks must use these names and shapes exactly unless this plan is amended before implementation.

```ts
// packages/core/src/asset-pack-version.ts
export interface AssetPackSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
}

export function parseAssetPackSemver(value: string): AssetPackSemver | undefined;
export function compareAssetPackVersions(left: string, right: string): number;
export function assetPackVersionRangeMatches(range: string, version: string): boolean;
export function assetPackAssetKeys(pack: NormalizedAssetPack): readonly string[];
export function assetPackLifecycleReplacementAllows(
  incoming: NormalizedAssetPack,
  installed: NormalizedAssetPack,
): boolean;

// packages/core/src/asset-pack-schema.ts
export interface AssetPackCompatibilitySource {
  readonly minimumCliVersion?: string;
  readonly requiredCapabilities?: readonly string[];
}

// AssetPackSource gains:
readonly compatibility?: AssetPackCompatibilitySource;

// packages/core/src/asset-pack-model.ts
export interface NormalizedAssetPackCompatibility {
  readonly minimumCliVersion?: string;
  readonly requiredCapabilities: readonly string[];
}

// NormalizedAssetPack gains:
readonly compatibility?: NormalizedAssetPackCompatibility;

export function assetPackSourceFromNormalized(pack: NormalizedAssetPack): AssetPackSource;
```

`assetPackAssetKeys` returns each new-item `localId` and each extend-item `itemId`, sorted and deduplicated. Replacement `assets` accept either current kebab local IDs or non-path catalog item IDs matching `^[A-Za-z0-9][A-Za-z0-9_.-]*$`.

`parseAssetPackSemver` accepts exactly the version grammar already accepted by the Phase 1 source schema and returns `undefined` for malformed input. `compareAssetPackVersions` is called only with successfully parsed values and throws `RangeError` if that precondition is violated; `assetPackVersionRangeMatches` returns `false` for a malformed range or version. Build metadata does not affect precedence.

```ts
// packages/cli/src/asset-pack-payload.ts
export interface AssetPackPayloadSuccess {
  readonly ok: true;
  readonly manifestBytes: Buffer;
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
  readonly sourceDigests: ReadonlyMap<string, string>;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: string;
}

export type AssetPackPayloadResult =
  | AssetPackPayloadSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackFileDiagnostic[] };

export function parseAssetPackPayload(input: {
  readonly manifestBytes: Buffer;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
}): AssetPackPayloadResult;

// packages/cli/src/asset-pack-archive-format.ts
export const ASSET_PACK_CHECKSUMS_SCHEMA =
  'lpc-toolkit.asset-pack-checksums.v1' as const;

export const ASSET_PACK_ARCHIVE_LIMITS = {
  entries: 4_096,
  manifestBytes: 1 * 1_024 * 1_024,
  entryBytes: 64 * 1_024 * 1_024,
  totalBytes: 512 * 1_024 * 1_024,
} as const;

export interface AssetPackChecksumEntry {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface AssetPackArchiveSnapshot {
  readonly archivePath: string;
  readonly archiveBytes: Buffer;
  readonly archiveDigest: string;
  readonly manifestBytes: Buffer;
  readonly checksumsBytes: Buffer;
  readonly checksums: readonly AssetPackChecksumEntry[];
  readonly payload: AssetPackPayloadSuccess;
}

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

export type AssetPackArchiveReadResult =
  | { readonly ok: true; readonly snapshot: AssetPackArchiveSnapshot }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackArchiveDiagnostic[] };

export function readAssetPackArchive(options: {
  readonly archivePath: string;
  readonly archiveBytes?: Buffer;
}): AssetPackArchiveReadResult;

export async function createDeterministicAssetPackArchive(options: {
  readonly manifestBytes: Buffer;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
}): Promise<Buffer>;

export function extractVerifiedAssetPackPayload(options: {
  readonly snapshot: AssetPackArchiveSnapshot;
  readonly targetDirectory: string;
}): void;

// packages/cli/src/asset-pack-compatibility.ts
export const SUPPORTED_ASSET_PACK_CAPABILITIES = [
  'lpc-toolkit.asset-pack.v1',
  'lpc-toolkit.asset-pack.lifecycle.v1',
] as const;

export function checkAssetPackCompatibility(
  pack: NormalizedAssetPack,
  cliVersion: string,
): readonly AssetPackLifecycleDiagnostic[];
```

```ts
// packages/cli/src/asset-pack-registry.ts
export const ASSET_WORKSPACE_REGISTRY_V1_SCHEMA =
  'lpc-toolkit.asset-workspace-registry.v1' as const;
export const ASSET_WORKSPACE_REGISTRY_SCHEMA =
  'lpc-toolkit.asset-workspace-registry.v2' as const;

export interface AssetPackRegistryEntryBase {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly contentDigest: string;
  readonly acknowledgements: readonly AssetPackAcknowledgement[];
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly generatedPaths: readonly string[];
  readonly logicalDestinations: readonly string[];
  readonly replacements: readonly NormalizedAssetPackReplacement[];
  readonly baselineDefinitionDigests: Readonly<Record<string, string>>;
  readonly baselineCreditDigests: Readonly<Record<string, string>>;
  readonly generatedCredits: readonly CreditEntry[];
}

export interface LinkedAssetPackRegistryEntry extends AssetPackRegistryEntryBase {
  readonly kind: 'linked';
  readonly sourceDirectory: string;
}

export interface InstalledAssetPackRegistryEntry extends AssetPackRegistryEntryBase {
  readonly kind: 'installed';
  readonly installedDirectory: string;
  readonly archiveDigest: string;
}

export type AssetPackRegistryEntry =
  | LinkedAssetPackRegistryEntry
  | InstalledAssetPackRegistryEntry;

export interface AssetPackRegistryDocument {
  readonly schema: typeof ASSET_WORKSPACE_REGISTRY_SCHEMA;
  readonly workspaceId: string;
  readonly entries: readonly AssetPackRegistryEntry[];
  readonly generatedDigests: Readonly<Record<string, string>>;
  readonly compileDigest: string;
}

export interface LinkedAssetPackRegistryEntryV1 {
  readonly kind: 'linked';
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly sourceDirectory: string;
  readonly contentDigest: string;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly generatedPaths: readonly string[];
  readonly baselineDefinitionDigests: Readonly<Record<string, string>>;
  readonly baselineCreditDigests: Readonly<Record<string, string>>;
}

export interface AssetPackRegistryV1Read {
  readonly schema: typeof ASSET_WORKSPACE_REGISTRY_V1_SCHEMA;
  readonly workspaceId: string;
  readonly entries: readonly LinkedAssetPackRegistryEntryV1[];
  readonly generatedDigests: Readonly<Record<string, string>>;
}

export type AssetPackRegistryReadResult =
  | {
      readonly ok: true;
      readonly document: AssetPackRegistryDocument | AssetPackRegistryV1Read;
      readonly needsMigration: boolean;
    }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

export interface AssetPackLifecycleDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly path?: string;
  readonly packId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function readAssetPackRegistry(options: {
  readonly workspace: AssetWorkspace;
  readonly markerWorkspaceId: string;
}): AssetPackRegistryReadResult;

export function assetPackRegistryBytes(document: AssetPackRegistryDocument): Buffer;
```

```ts
// packages/cli/src/asset-pack-state.ts
export interface ValidatedActiveAssetPack {
  readonly kind: 'linked' | 'installed';
  readonly sourceDirectory: string;
  readonly archiveDigest?: string;
  readonly loaded: AssetPackPayloadSuccess;
  readonly diagnostics: readonly AssetPackLifecycleDiagnostic[];
}

export type AssetPackStateMutation =
  | { readonly kind: 'upsert'; readonly candidate: ValidatedActiveAssetPack }
  | { readonly kind: 'remove'; readonly packId: string }
  | { readonly kind: 'none' };

export async function prepareAssetPackDesiredState(options: {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly mutation: AssetPackStateMutation;
}): Promise<AssetPackDesiredStateResult>;

export type AssetPackDesiredStateResult =
  | AssetPackDesiredState
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

// packages/cli/src/asset-pack-transaction.ts
export const ASSET_PACK_TRANSACTION_SCHEMA =
  'lpc-toolkit.asset-pack-transaction.v1' as const;

export type AssetPackTransactionPhase =
  | 'prepared'
  | 'output-published'
  | 'sources-published'
  | 'registry-published';

export type AssetPackRecoveryAction = 'none' | 'rolled-back' | 'completed';

export async function publishAssetPackGeneration(
  options: PublishAssetPackGenerationOptions,
): Promise<AssetPackPublicationResult>;

export function recoverAssetPackTransaction(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}): AssetPackRecoveryResult;

export type AssetPackRecoveryResult =
  | { readonly ok: true; readonly action: AssetPackRecoveryAction }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

export interface AssetTransactionFileOps {
  readonly mkdirSync: typeof mkdirSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly readFileSync: typeof readFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmSync: typeof rmSync;
  readonly openSync: typeof openSync;
  readonly fsyncSync: typeof fsyncSync;
  readonly closeSync: typeof closeSync;
}

export interface PublishAssetPackGenerationOptions {
  readonly operation: 'sync' | 'install' | 'remove';
  readonly workspace: AssetWorkspace;
  readonly desiredState: AssetPackDesiredState;
  readonly stagedInstalledSource?: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
  readonly fileOps?: AssetTransactionFileOps;
}

export type AssetPackPublicationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };
```

```ts
// service entry points
export async function packAssetPack(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetPackArchivePublicationFileOps;
}): Promise<PackAssetPackResult>;
export async function inspectAssetPackArchive(
  options: {
    readonly archivePath: string;
    readonly runtime: RuntimeAssets;
  },
): Promise<AssetPackInspectionResult>;
export async function installAssetPack(
  options: {
    readonly archivePath: string;
    readonly workspace: AssetWorkspace;
    readonly runtime: RuntimeAssets;
    readonly now?: () => Date;
    readonly fileOps?: AssetTransactionFileOps;
  },
): Promise<AssetPackInstallResult>;
export function listAssetPacks(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}): AssetPackListResult;
export async function removeAssetPack(
  options: {
    readonly packId: string;
    readonly workspace: AssetWorkspace;
    readonly runtime: RuntimeAssets;
    readonly fileOps?: AssetTransactionFileOps;
  },
): Promise<AssetPackRemoveResult>;
export async function doctorAssetPacks(
  options: {
    readonly workspace: AssetWorkspace;
    readonly runtime: RuntimeAssets;
    readonly fileOps?: AssetTransactionFileOps;
  },
): Promise<AssetPackDoctorReport>;
```

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: N/A — no npm publication, CLI versioning, or pinned base-asset release procedure changes
plugin: N/A — the animation-audit skill remains read-only and no asset-authoring skill is added
```

The implementation pull request must declare:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering
```

Reassess this matrix in Task 13 before handoff.

---

### Task 1: Add Core compatibility, SemVer, normalized-source, and lifecycle decisions

**Files:**
- Create: `packages/core/src/asset-pack-version.ts`
- Create: `packages/core/test/asset-pack-version.test.ts`
- Modify: `packages/core/src/asset-pack-schema.ts`
- Modify: `packages/core/src/asset-pack-model.ts`
- Modify: `packages/core/src/asset-pack-compile.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/asset-pack-schema.test.ts`
- Modify: `packages/core/test/asset-pack-compile.test.ts`

**Interfaces:**
- Consumes: completed Phase 1 `AssetPackSource`, `NormalizedAssetPack`, replacements, and compiler ownership.
- Produces: every Core interface under Stable Interfaces, used by Tasks 2, 4, 5, and 9.

- [x] **Step 1: Write failing SemVer and lifecycle tests**

  - Implementation: Added focused SemVer precedence, comparator range, stable asset-key, and lifecycle replacement tests.

Cover core precedence, numeric versus string prerelease identifiers, build metadata equality, malformed input, all five replacement comparators, compound ranges, stable new/extend asset keys, greater-version upgrade, same-version equality, self-replacement-authorized downgrade, incomplete asset coverage, wrong pack ID, and unmatched installed version.

```ts
expect(compareAssetPackVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
expect(compareAssetPackVersions('1.0.0+build.2', '1.0.0+build.1')).toBe(0);
expect(assetPackAssetKeys(packWithNewAndExtend)).toEqual(['hair_messy', 'moon-braid']);
expect(assetPackLifecycleReplacementAllows(downgrade, installed)).toBe(true);
```

- [x] **Step 2: Write failing compatibility and round-trip tests**

  - Implementation: Added strict compatibility parsing, absent-field preservation, normalized-source round-trip, acknowledgement, and compiler range regression coverage.

Assert exact compatibility keys, semantic minimum version, unique non-empty capability strings, unknown fields rejected, absent compatibility preserved as absent, normalized source property/array ordering, complete acknowledgement preservation, and this round trip:

```ts
const normalized = normalizeAssetPack(parseOk(sourceWithCompatibility));
expect(normalizeAssetPack(parseOk(assetPackSourceFromNormalized(normalized))))
  .toEqual(normalized);
```

- [x] **Step 3: Run the focused tests and verify RED**

  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts` FAIL (16 expected failures: missing Phase 2 exports and compatibility parsing).

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts
```

Expected: FAIL because the Phase 2 interfaces do not exist.

- [x] **Step 4: Implement strict SemVer and share range matching**

  - Implementation: Added the strict pure SemVer/lifecycle module and made the compiler consume its shared range matcher.

Move the complete precedence logic from `asset-pack-compile.ts` into the new module. Return `undefined` for invalid values; never fall back to lexical ordering. Make the compiler call `assetPackVersionRangeMatches` and preserve existing replacement tests.

```ts
export function assetPackLifecycleReplacementAllows(
  incoming: NormalizedAssetPack,
  installed: NormalizedAssetPack,
): boolean {
  const required = assetPackAssetKeys(installed);
  return incoming.replacements.some((replacement) =>
    replacement.packId === installed.id
    && assetPackVersionRangeMatches(replacement.versions, installed.version)
    && sameStrings([...replacement.assets].sort(), required),
  );
}
```

- [x] **Step 5: Implement compatibility parsing and source reconstruction**

  - Implementation: Added strict compatibility normalization/content projection and deterministic source reconstruction while preserving acknowledgement digest exclusion.

Add `compatibility` to the top-level exact-key set, normalized model, content projection, and reconstructed source. Sort capabilities, replacements, acknowledgements, assets, layers, sprites, bodies, variants, and override keys with their Phase 1 semantic order; omit optional empty fields rather than inventing defaults.

- [x] **Step 6: Verify GREEN and Core boundaries**

  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts asset-pack-compile.test.ts` PASS (60 tests); `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS; `rtk pnpm check:boundaries` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts asset-pack-compile.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm check:boundaries
```

Expected: PASS.

- [x] **Step 7: Commit product code**

  - Commit: `9b7ccc74c4339f7643368827869fce662a2a7ab5`

```sh
rtk git add packages/core/src/asset-pack-version.ts packages/core/src/asset-pack-schema.ts packages/core/src/asset-pack-model.ts packages/core/src/asset-pack-compile.ts packages/core/src/index.ts packages/core/test/asset-pack-version.test.ts packages/core/test/asset-pack-schema.test.ts packages/core/test/asset-pack-compile.test.ts
rtk git commit -m "feat(core): define asset pack lifecycle compatibility"
```

Task 1 record:

- Implementation: Added strict compatibility parsing, precision-safe ASCII SemVer/range matching, lifecycle replacement authorization, normalized-source reconstruction, and compiler range-helper reuse while preserving Phase 1 animation declaration order and content-digest semantics.
- Product/fix commits: `9b7ccc74c4339f7643368827869fce662a2a7ab5`, `92042d97b743a2b232b13dc47d615aa132bb3e99`, `d6501f960015b68703199408bf05597f974ff779`, `3c7b9ba3a82f8888ad18fc0e07bb1211015fbd4f`, `bc6f03fa3f9fcfce372ec219aabfd1c9587c7c03`.
- Plan-record commit: `c1056c6208fe52ce01fd931fba99efeb3818d1fd`.
- Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts asset-pack-compile.test.ts` PASS (66 tests); `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS; `rtk pnpm check:boundaries` PASS.
- Review: Task reviewer APPROVED with no Critical, Important, or Minor findings after the final fix wave.

Then update this task's plan record and commit it separately.

---

### Task 2: Share immutable directory and archive payload parsing

**Files:**
- Create: `packages/cli/src/asset-pack-payload.ts`
- Create: `packages/cli/test/asset-pack-payload.test.ts`
- Modify: `packages/cli/src/asset-pack-files.ts`
- Modify: `packages/cli/src/asset-pack-validation.ts`
- Modify: `packages/cli/test/asset-pack-files.test.ts`
- Modify: `packages/cli/test/asset-pack-validation.test.ts`

**Interfaces:**
- Consumes: `assetPackSourceFromNormalized`, current directory containment checks, and captured-byte pixel inspection.
- Produces: `parseAssetPackPayload`, `AssetPackPayloadSuccess`, and payload validation used by Tasks 3–11.

- [x] **Step 1: Write failing payload parity tests**

  - Implementation: Added immutable directory/archive payload parity and digest-stability coverage.

Use one manifest and source byte map through both directory loading and direct payload parsing. Assert equal normalized pack, source digests, content digest, source order, immutable copied buffers, schema diagnostics, missing/extra referenced source behavior, and acknowledgement-only content-digest stability.

```ts
const direct = parsePayloadOk({ manifestBytes, sourceBytes });
const directory = loadFilesOk(packRoot);
expect(direct.contentDigest).toBe(directory.contentDigest);
expect([...direct.sourceDigests]).toEqual([...directory.sourceDigests]);
```

- [x] **Step 2: Write failing payload-validation tests**

  - Implementation: Added payload-snapshot validation coverage with captured PNG bytes and unchanged validation semantics.

Call a new snapshot entry point with captured PNG bytes and assert the same report as directory validation without requiring a synthetic filesystem root:

```ts
const report = await validateAssetPackPayload({ payload, runtime });
expect(report).toMatchObject({ valid: true, contentDigest: payload.contentDigest });
```

- [x] **Step 3: Run focused tests and verify RED**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts` RED as expected before implementation.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts
```

Expected: FAIL because payload parsing/validation is not exported.

- [x] **Step 4: Extract byte parsing without weakening filesystem safety**

  - Implementation: Reused existing directory containment/symlink/regular-file gates and delegated only trusted captured bytes to the shared payload parser.

`asset-pack-files.ts` must still reject source traversal, missing entries, non-regular files, every symlink, and duplicate canonical files before reading bytes. It passes only the exact referenced byte map to `parseAssetPackPayload`; direct payload parsing rejects missing referenced paths and ignores no extra map keys—extras are diagnostics so archive checksum coverage cannot hide payload files.

- [x] **Step 5: Expose payload validation**

  - Implementation: Added `parseAssetPackPayload` and `validateAssetPackPayload`; directory validation delegates through the immutable payload snapshot.

Refactor `inspectCapturedAssetPackSources` to accept `AssetPackPayloadSuccess`. Add:

```ts
export async function validateAssetPackPayload(options: {
  readonly payload: AssetPackPayloadSuccess;
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
  readonly origin: string;
}): Promise<AssetPackValidationReport>;
```

Keep `validateAssetPackDirectory` public and make its snapshot branch delegate to the new function.

- [x] **Step 6: Verify GREEN and Phase 1 regressions**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts asset-pack-sync.test.ts asset-pack-preview.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts asset-pack-sync.test.ts asset-pack-preview.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit product code**

  - Commit: `4a24fe6cc6fbcabed9cb20760baf7f7ffd6e64b4`

```sh
rtk git add packages/cli/src/asset-pack-payload.ts packages/cli/src/asset-pack-files.ts packages/cli/src/asset-pack-validation.ts packages/cli/test/asset-pack-payload.test.ts packages/cli/test/asset-pack-files.test.ts packages/cli/test/asset-pack-validation.test.ts
rtk git commit -m "refactor(cli): share immutable asset pack payloads"
```

Task 2 record:

- Implementation: Shared immutable manifest/source byte payload parsing between directory and archive workflows, preserved directory safety checks, and exposed payload-snapshot validation without changing Phase 1 attribution or acknowledgement semantics.
- Product commit: `4a24fe6cc6fbcabed9cb20760baf7f7ffd6e64b4`.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts` PASS (18 tests); `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts asset-pack-sync.test.ts asset-pack-preview.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Review: Task reviewer APPROVED with no Critical, Important, or Minor findings.

Then update this task's plan record and commit it separately.

---

### Task 3: Enforce the bounded archive and checksum trust boundary

**Files:**
- Create: `packages/cli/src/asset-pack-archive-format.ts`
- Create: `packages/cli/test/asset-pack-archive-format.test.ts`

**Interfaces:**
- Consumes: `parseAssetPackPayload` and the exact Phase 2 archive constants.
- Produces: archive reader/writer/extractor under Stable Interfaces for Tasks 4, 5, 9, and 13.

- [x] **Step 1: Write failing safe-path and central-directory tests**

  - Implementation: Added raw ZIP fixtures for traversal, Windows portability/device names (including superscript COM/LPT forms), collisions, special entries, metadata mismatches, overlap, ZIP64, and entry-count bounds.

Create raw ZIP fixtures for absolute POSIX, Windows drive, UNC, backslash, NUL, empty segment, dot, parent, directory, duplicate exact path, ASCII-case collision, Unicode NFC collision, symlink UNIX mode, FIFO/special mode, encrypted flag, unsupported compression, central/local filename mismatch, invalid offsets/lengths, overlapping local data, ZIP64 markers, and more than `4_096` entries.

The canonical collision key is `validatedPath.normalize('NFC').toLowerCase()` after all path-shape checks; this conservative rule keeps archives portable across supported filesystems. UTF-8-flagged names use fatal UTF-8 decoding; unflagged names must be printable ASCII so ambiguous legacy encodings cannot create a second spelling.

- [x] **Step 2: Write failing bounds and checksum tests**

  - Implementation: Added manifest/entry/aggregate/encoded archive bounds, bounded inflation and trailing DEFLATE, strict checksum schema/order/coverage, digest, root, and required-entry tests.

Cover manifest `1 MiB` pass and `1 MiB + 1` fail, entry `64 MiB` pass and `+1` fail without inflation, declared total `512 MiB + 1`, inflater output exceeding declared/bounded length, checksum JSON syntax/schema/unknown fields/order, missing/extra rows, size mismatch, digest mismatch, unexpected roots, unreferenced sprite, missing manifest/checksums, and `checksums.json` attempting to cover itself.

- [x] **Step 3: Write failing deterministic-writer tests**

  - Implementation: Added byte-identical sorted UNIX archive, fixed timestamp/permission, compression, and checksum coverage assertions.

Create the same archive twice with reversed input-map order and different process timezone. Assert identical SHA-256 and bytes; inspect central entries for sorted paths, fixed timestamp, UNIX `0o100644`, no directory entries, method `8`, and checksum coverage.

- [x] **Step 4: Run the focused test and verify RED**

  - Verification: Initial focused archive test was RED before the module implementation, as expected.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts
```

Expected: FAIL because the archive trust-boundary module does not exist.

- [x] **Step 5: Implement metadata-first bounded reading**

  - Implementation: Added strict EOCD/central/local metadata parsing, archive/entry/encoded/decoded limits, single-descriptor regular-file reads capped at archiveBytes + 1, bounded DEFLATE consumption, CRC and checksum verification, and immutable verified snapshots.

Parse EOCD and central records before calling `inflateRawSync`. Capture general-purpose flags, compression, compressed/uncompressed sizes, creator platform, external attributes, local-header offset, and raw filename bytes. Reject the complete archive on any diagnostic. For method `8`, call `inflateRawSync(compressed, { maxOutputLength: declaredSize })`; require exact output length. Parse and verify checksums before constructing `AssetPackPayloadSuccess`.

- [x] **Step 6: Implement deterministic writing and verified extraction**

  - Implementation: Added deterministic JSZip writing with read-back validation and verified extraction under a private staging-root contract with canonical device/inode pinning, no-follow file creation, symlink/race fail-closed checks, and safe cleanup.

Use `JSZip` only after payload bytes are trusted:

```ts
zip.file(entry.path, entry.bytes, {
  binary: true,
  date: new Date(1980, 0, 1, 0, 0, 0),
  createFolders: false,
  unixPermissions: 0o100644,
});
return zip.generateAsync({
  type: 'nodebuffer',
  platform: 'UNIX',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
  streamFiles: false,
});
```

Extraction accepts only a successful snapshot, requires a newly created empty target below the caller-validated staging root, writes exact verified bytes with mode `0o600`, and never follows symlinks.

- [x] **Step 7: Verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts` PASS (62 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 8: Commit product code**

  - Commit: `993bcf52622dbb5605bf1ebb0201dd5ff48254a3`

```sh
rtk git add packages/cli/src/asset-pack-archive-format.ts packages/cli/test/asset-pack-archive-format.test.ts
rtk git commit -m "feat(cli): enforce asset pack archive safety"
```

Task 3 record:

- Implementation: Added the bounded archive/checksum trust boundary, deterministic writer, verified extraction, descriptor-capped archive reads, Windows device-name portability checks, and canonical extraction identity hardening.
- Product/fix commits: `993bcf52622dbb5605bf1ebb0201dd5ff48254a3`, `f18722e8f1c5228405e95d34c7fdbdf48cea2c76`, `f84d500a32b6a9ebe96b05490235e105f271497a`, `b0657ab669860448073305803c6084f6d2dcfa1d`.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-archive-format.test.ts` PASS (62 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Review: Task reviewer APPROVED with no Critical or Important findings after the final security fix waves.

Then update this task's plan record and commit it separately.

---

### Task 4: Package freshly validated sources into deterministic archives

**Files:**
- Create: `packages/cli/src/asset-pack-packaging.ts`
- Create: `packages/cli/src/asset-pack-compatibility.ts`
- Create: `packages/cli/test/asset-pack-packaging.test.ts`
- Modify: `packages/cli/src/asset-pack-validation.ts`
- Modify: `packages/cli/test/asset-pack-validation.test.ts`

**Interfaces:**
- Consumes: directory `loadAssetPackFiles`, `validateAssetPackPayload`, `assetPackSourceFromNormalized`, and deterministic archive writer.
- Produces: `packAssetPack` and `PackAssetPackResult` for Task 12.

- [x] **Step 1: Write failing packaging tests**

  - Implementation: Added new/extend, normalization, acknowledgement, compatibility, fresh-pixel, digest, mtime, deterministic-byte, and no-mutation packaging coverage.

Cover valid new/extend packs, default sibling archive name, normalized manifest rather than artist byte order, persisted acknowledgements, exact checksums, fresh pixel validation, supported/unsupported minimum CLI and capability declarations, unacknowledged warning failure, missing/changed source failure, identical output bytes across two runs, source manifest/PNG mtime preservation, and no write to workspace output/base/cache/upstream sentinels.

```ts
const first = packOk(await packAssetPack({ packDirectory, workspace, runtime }));
const second = packOk(await packAssetPack({ packDirectory, workspace, runtime }));
expect(first).toMatchObject({ packId: 'acme.hair', version: '1.0.0' });
expect(readFileSync(first.archivePath)).toEqual(readFileSync(second.archivePath));
```

- [x] **Step 2: Write failing publication rollback tests**

  - Implementation: Added before/after-backup failure, first-publication failure, owned sibling cleanup, foreign sentinel preservation, and directory/symlink/FIFO target tests.

Pre-create the target archive, inject failure before and after backup rename, and assert the previous archive is restored byte-for-byte. A failed first publication leaves no final archive. Temporary/backup paths stay beside the target and are removed only when owned by the current invocation.

- [x] **Step 3: Run the focused test and verify RED**

  - Verification: Packaging tests were RED before the new compatibility and packaging modules existed.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts
```

Expected: FAIL because packaging orchestration does not exist.

- [x] **Step 4: Implement the shared CLI compatibility gate**

  - Implementation: Added stable CLI-version/capability diagnostics and applied the gate to both directory and captured-payload validation.

Create `checkAssetPackCompatibility(pack, cliVersion)` returning stable `asset_cli_version_incompatible` or `asset_capability_unsupported` diagnostics. Call it from payload/directory validation so `asset validate`, packaging, inspection, desired-state loading, and doctor converge on one decision.

- [x] **Step 5: Implement normalized archive assembly**

  - Implementation: Added one-snapshot validation/archive assembly, acknowledgement-preserving normalized manifests, locale-independent ordering, exact captured source bytes, and deterministic archive publication.

Load one immutable directory snapshot, validate that same snapshot, reject `valid: false`, reconstruct the complete normalized source including acknowledgements, encode recursively sorted two-space JSON plus newline, and call `createDeterministicAssetPackArchive` with exact captured source bytes.

```ts
export interface AssetPackArchivePublicationFileOps {
  readonly lstatSync: typeof lstatSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmSync: typeof rmSync;
}

export interface PackAssetPackSuccess {
  readonly ok: true;
  readonly packId: string;
  readonly version: string;
  readonly contentDigest: string;
  readonly archiveDigest: string;
  readonly archivePath: string;
  readonly entryCount: number;
}

export type PackAssetPackResult =
  | PackAssetPackSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };
```

- [x] **Step 6: Implement sibling atomic publication**

  - Implementation: Added exclusive sibling temporary/backup publication, digest verification, rollback, target type/symlink safety, and ownership-aware cleanup.

The target is `path.join(path.dirname(packRoot), `${pack.id}-${pack.version}.lpc-assets.zip`)`. Write and close a unique sibling temporary file, verify its digest, move an existing regular target to a unique backup, rename temporary to target, restore on error, and reject directories/symlinks/special targets.

- [x] **Step 7: Verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts` PASS (29 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk git diff --check` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 8: Commit product code**

  - Commits: `3d19d418afd5ded2548446d50e61d8dc40551020`, `5e987c4c52b8e33d033aed84f27e2d7588fd39a4`

```sh
rtk git add packages/cli/src/asset-pack-compatibility.ts packages/cli/src/asset-pack-packaging.ts packages/cli/src/asset-pack-validation.ts packages/cli/test/asset-pack-packaging.test.ts packages/cli/test/asset-pack-validation.test.ts
rtk git commit -m "feat(cli): package deterministic asset archives"
```

Task 4 record:

- Implementation: Added shared compatibility gating, one-snapshot deterministic archive packaging, locale-independent normalized manifest ordering, acknowledgement/attribution preservation, and atomic sibling publication with rollback and mutation-boundary coverage.
- Product/fix commits: `3d19d418afd5ded2548446d50e61d8dc40551020`, `5e987c4c52b8e33d033aed84f27e2d7588fd39a4`.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-packaging.test.ts asset-pack-files.test.ts asset-pack-validation.test.ts` PASS (29 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk git diff --check` PASS.
- Review: Initial review found locale-ordering and coverage gaps; final reviewer APPROVED with no Critical or Important findings after the fix wave.

Then update this task's plan record and commit it separately.

---

### Task 5: Inspect compatibility, PNG geometry, pixels, and attribution from archive bytes

**Files:**
- Create: `packages/cli/src/asset-pack-inspection.ts`
- Create: `packages/cli/test/asset-pack-inspection.test.ts`
- Modify: `packages/cli/src/asset-pack-validation.ts`
- Modify: `packages/cli/test/asset-pack-validation.test.ts`

**Interfaces:**
- Consumes: archive snapshot, Core compatibility/version helpers, `CLI_VERSION`, runtime baseline/palettes, and payload validation.
- Produces: `inspectAssetPackArchive`, report schemas, and verified snapshots for Task 9.

- [x] **Step 1: Write failing compatibility tests**

  - Implementation: Added absent/equal/higher CLI-version, capability, malformed archive, and manifest-schema inspection cases.

Cover absent compatibility, equal/lower minimum CLI, higher minimum CLI, supported capabilities, unknown capability, malformed archive, and manifest schema failure. Reuse the exact exported capability list:

```ts
expect(SUPPORTED_ASSET_PACK_CAPABILITIES).toEqual([
  'lpc-toolkit.asset-pack.v1',
  'lpc-toolkit.asset-pack.lifecycle.v1',
]);
```

- [x] **Step 2: Write failing IHDR-before-decode tests**

  - Implementation: Added IHDR geometry, truncation, exact dimensions, corrupt CRC isolation, required/optional frames, recolor ramps, and shared-source consumer coverage.

Provide PNG bytes with a valid signature/IHDR declaring huge or wrong dimensions and spy on the canvas decoder. Assert `asset_geometry_mismatch` is returned and decode is never called. Cover truncated IHDR, corrupt CRC/decode, exact dimensions, required blank frames, optional blank warnings, recolor ramp, and multiple consumers of one source.

- [x] **Step 3: Write failing inspection-report tests**

  - Implementation: Added JSON-safe report shape, archive identity/byte totals, deterministic diagnostics, and valid-report-only snapshot assertions.

Assert deterministic diagnostics and this JSON-safe shape:

```ts
export interface AssetPackInspectionReport {
  readonly schema: 'lpc-toolkit.asset-pack-inspection.v1';
  readonly archivePath: string;
  readonly archiveDigest?: string;
  readonly packId?: string;
  readonly version?: string;
  readonly contentDigest?: string;
  readonly valid: boolean;
  readonly entryCount: number;
  readonly totalUncompressedBytes: number;
  readonly diagnostics: readonly AssetPackLifecycleDiagnostic[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
}

export interface AssetPackInspectionResult {
  readonly report: AssetPackInspectionReport;
  readonly snapshot?: AssetPackArchiveSnapshot;
}
```

Only a valid report carries `snapshot`; `asset-commands.ts` serializes `report` and never the byte-bearing result wrapper.

- [x] **Step 4: Run focused tests and verify RED**

  - Verification: Initial inspection test run was RED because archive inspection did not exist.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-inspection.test.ts asset-pack-validation.test.ts
```

Expected: FAIL because archive inspection and IHDR preflight do not exist.

- [x] **Step 5: Implement predecode geometry gate and full validation**

  - Implementation: Added archive inspection/reporting, strict IHDR format/CRC/dimension preflight before native decode, captured-byte validation reuse, and configured recolor source-ramp enforcement with attribution/acknowledgement preservation.

Read width/height from PNG signature plus IHDR bytes using unsigned big-endian integers. Compare each source's declared uses to registered geometry before canvas decode. After the gate passes, call the existing captured-byte inspector and Core validator so required/optional cells, palettes, credits, baseline digests, and acknowledgement semantics remain identical to directory validation.

- [x] **Step 6: Verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-inspection.test.ts asset-pack-validation.test.ts` PASS (31 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk git diff --check` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-inspection.test.ts asset-pack-validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit product code**

  - Commits: `b3c85619ff172777af1f139ced7ae732d9505fad`, `3998b10a731a0aa97d9892526a1666611a1c0c6b`

```sh
rtk git add packages/cli/src/asset-pack-inspection.ts packages/cli/src/asset-pack-validation.ts packages/cli/test/asset-pack-inspection.test.ts packages/cli/test/asset-pack-validation.test.ts
rtk git commit -m "feat(cli): inspect attributed asset archives"
```

Task 5 record:

- Implementation: Added archive inspection reports with valid-snapshot gating, predecode PNG IHDR safety, full captured-byte validation, attribution/acknowledgement continuity, and configured recolor source-ramp enforcement.
- Product/fix commits: `b3c85619ff172777af1f139ced7ae732d9505fad`, `3998b10a731a0aa97d9892526a1666611a1c0c6b`.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-inspection.test.ts asset-pack-validation.test.ts` PASS (31 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk git diff --check` PASS.
- Review: Initial review found a native-decoder crash boundary and missing source-ramp enforcement; final reviewer APPROVED with no Critical or Important findings after the fix wave.

Then update this task's plan record and commit it separately.

---

### Task 6: Introduce strict registry v2 with linked and installed sources

**Files:**
- Create: `packages/cli/src/asset-pack-registry.ts`
- Create: `packages/cli/test/asset-pack-registry.test.ts`
- Modify: `packages/cli/src/asset-workspace.ts`
- Modify: `packages/cli/src/asset-pack-sync.ts`
- Modify: `packages/cli/test/asset-workspace.test.ts`
- Modify: `packages/cli/test/asset-pack-sync.test.ts`

**Interfaces:**
- Consumes: Phase 1 v1 registry bytes, managed output marker, payload snapshots, compile ownership, and Stable Interfaces.
- Produces: strict v2 document/entry APIs for Tasks 7–12.

- [x] **Step 1: Write failing v1 migration tests**

  - Implementation: Added empty/populated v1 fidelity, migration, digest/source drift, identity, and no-mutation coverage.

Load an empty v1 registry and a populated linked v1 registry. Assert the registry reader returns strict v1 values plus `needsMigration: true`; generalized state then validates each linked source, preserves pack/version/digests, derives acknowledgements/destinations/replacements/credits, and writes only v2 on the next sync. Invalid v1 digests/source mismatch fail during desired-state preparation rather than being migrated.

- [x] **Step 2: Write failing v2 strictness and ownership tests**

  - Implementation: Added strict field/path/digest/receipt/ownership/credit/attribution, symlink/special-file, conflict, and nested ordering/tamper coverage.

Cover unknown document/entry fields, wrong workspace ID, duplicate pack IDs, unsorted duplicates, invalid digest formats, generated-digest coverage mismatch, compile digest mismatch, linked path symlink/escape, installed path outside `stateRoot/installed`, installed receipt mismatch, entry kind/field cross-contamination, logical destination conflict, and generated credit ordering.

- [x] **Step 3: Run focused tests and verify RED**

  - Verification: Initial registry test run was RED because v2 registry APIs did not exist.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-registry.test.ts asset-pack-sync.test.ts
```

Expected: FAIL because v2 registry APIs do not exist.

- [x] **Step 4: Extract registry parsing from sync**

  - Implementation: Added strict v1/v2 parsing, migration markers, canonical paths, ownership/receipt/output auditing, and attribution-preserving registry APIs.

Move Phase 1 exact-key/digest/marker logic into `asset-pack-registry.ts`. Read v1 without mutating or enriching it, return a migration-needed marker, and accept v2 only when every path/digest/credit relationship is exact. Task 7 performs source-backed enrichment. Keep generated output auditing available as a separate exported function so doctor can reuse it.

- [x] **Step 5: Build deterministic v2 entries**

  - Implementation: Added typed canonical compile projection/digest, per-entry generated sprite/destination/credit ownership, exact generated digest coverage, and normalized acknowledgements/replacements.

Create entries only from validated payload plus compiler output. `generatedPaths` is compiler ownership; `logicalDestinations` is owned sprite destinations; `generatedCredits` filters compiled credits by owned logical prefixes; acknowledgements/replacements copy normalized values. `compileDigest` hashes canonical definitions, sprite source/destination/digests, credits, and ownership for the complete generation.

- [x] **Step 6: Keep sync behavior passing during extraction**

  - Implementation: Updated linked sync to reject outside/symlink roots before publication and migrate v1 state to strict v2 without creating installed entries.

Update `syncLinkedAssetPack` to call registry APIs while it still uses the Phase 1 publisher. A successful sync from v1 writes v2; a subsequent sync reads v2. No installed entry is created by sync.

- [x] **Step 7: Verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-registry.test.ts asset-pack-sync.test.ts asset-workspace.test.ts` PASS (66 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk git diff --check` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-registry.test.ts asset-pack-sync.test.ts asset-workspace.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 8: Commit product code**

  - Commits: `894315f00f487849cd0638bb41105c1d188b2497`, `2e6f1f1117123a5da8b95ee5d7b34a8730ac942e`, `e2b1f190af809cbad3c1e2c643746a5f5f942fe7`, `f8c4bb5f710c98d74f2165911f08e60e3218bbbe`.

```sh
rtk git add packages/cli/src/asset-pack-registry.ts packages/cli/src/asset-workspace.ts packages/cli/src/asset-pack-sync.ts packages/cli/test/asset-pack-registry.test.ts packages/cli/test/asset-workspace.test.ts packages/cli/test/asset-pack-sync.test.ts
rtk git commit -m "feat(cli): migrate asset registry to lifecycle v2"
```

Task 6 record:

- Implementation: Added strict registry v2, v1 migration, typed compile digest/ownership projections, linked/installed containment and receipt verification, attribution integrity, output auditing, and sync migration safety.
- Product/fix commits: `894315f00f487849cd0638bb41105c1d188b2497`, `2e6f1f1117123a5da8b95ee5d7b34a8730ac942e`, `e2b1f190af809cbad3c1e2c643746a5f5f942fe7`, `f8c4bb5f710c98d74f2165911f08e60e3218bbbe`.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-registry.test.ts asset-pack-sync.test.ts asset-workspace.test.ts` PASS (66 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk git diff --check` PASS.
- Review: Initial reviews found eight Important integrity/path issues across two waves; final reviewer APPROVED with no Critical or Important findings after all fix waves.

Then update this task's plan record and commit it separately.

---

### Task 7: Compile one desired state from mixed linked and installed packs

**Files:**
- Create: `packages/cli/src/asset-pack-state.ts`
- Create: `packages/cli/test/asset-pack-state.test.ts`
- Modify: `packages/cli/src/asset-pack-sync.ts`
- Modify: `packages/cli/src/asset-pack-preview.ts`
- Modify: `packages/cli/test/asset-pack-sync.test.ts`
- Modify: `packages/cli/test/asset-pack-preview.test.ts`

**Interfaces:**
- Consumes: registry v2, directory/payload loading, runtime baseline, validator, compiler, and Stable Interfaces.
- Produces: `prepareAssetPackDesiredState` plus staged-generation materialization used by Tasks 8–11.

- [x] **Step 1: Write failing mixed-state tests**

  - Implementation: Added linked-only, installed-only, mixed, upsert/remove/none, ordering, conflict, replacement, attribution, and stale-baseline tests.

Build registries with linked only, installed only, and both. Assert stable pack-ID order, fresh linked validation, installed payload/receipt verification, upsert replacing the same pack ID candidate only, remove excluding exactly one pack, none preserving all, disjoint patches merging, cross-package replacement authorization, true conflict, attribution union, and stale baseline rejection.

- [x] **Step 2: Write failing generated-state tests**

  - Implementation: Added deterministic definitions/sprites/CREDITS/ownership/digest/registry output and manager-generated baseline exclusion coverage.

Assert definitions, sprites, `CREDITS.csv`, ownership, generated digests, logical destinations, generated credits, compile digest, and registry v2 bytes are deterministic across reversed source/registry order. Assert manager-generated output is excluded from baseline digests.

- [x] **Step 3: Run focused tests and verify RED**

  - Verification: Initial desired-state test run was RED because generalized desired state did not exist.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-state.test.ts
```

Expected: FAIL because generalized desired state does not exist.

- [x] **Step 4: Implement active-source loading and mutation**

  - Implementation: Added linked/installed active-source loading with containment, receipts, payload validation, one mutation semantics, and safe candidate replacement/removal.

Resolve linked directories through existing containment rules. Resolve installed directories only beneath canonical `stateRoot/installed`, verify `install-receipt.json`, then parse their exact manifest/source bytes. Apply one mutation before compilation; duplicate pack IDs or candidate/registry source-kind ambiguity are errors.

- [x] **Step 5: Implement generated-state materialization as values**

  - Implementation: Added immutable output byte maps, deterministic compiler/registry materialization, generated ownership/digests/credits, and attribution-preserving state values.

Return immutable byte maps rather than writing:

```ts
export interface AssetPackDesiredState {
  readonly ok: true;
  readonly active: readonly ValidatedActiveAssetPack[];
  readonly compilePlan: AssetPackCompilePlan;
  readonly outputFiles: ReadonlyMap<string, Buffer>;
  readonly registry: AssetPackRegistryDocument;
  readonly warnings: readonly AssetPackLifecycleDiagnostic[];
}
```

The map includes the manager marker, definitions, sprites, and `CREDITS.csv`; registry bytes remain separate for the transaction publisher.

- [x] **Step 6: Migrate sync and preview orchestration**

  - Implementation: Migrated sync and preview to generalized state while preserving Phase 1 result schemas and ensuring previews do not publish or duplicate warnings.

Sync creates a linked candidate and publishes the generalized state with its existing publisher until Task 8. Preview uses mutation `upsert` for its transient target, materializes to validation state, and never changes the active registry/output. Preserve all Phase 1 result schemas.

- [x] **Step 7: Verify GREEN and Phase 1 behavior**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-state.test.ts asset-pack-sync.test.ts asset-pack-preview.test.ts asset-authoring-e2e.test.ts` PASS (56 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk pnpm check:boundaries` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-state.test.ts asset-pack-sync.test.ts asset-pack-preview.test.ts asset-authoring-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm check:boundaries
```

Expected: PASS.

- [x] **Step 8: Commit product code**

  - Commits: `1dc27a6abc628464329cd8af3047c43dd0920cf5`, `79442f04e487275720d75c760197bbb96192fb7c`.

```sh
rtk git add packages/cli/src/asset-pack-state.ts packages/cli/src/asset-pack-sync.ts packages/cli/src/asset-pack-preview.ts packages/cli/test/asset-pack-state.test.ts packages/cli/test/asset-pack-sync.test.ts packages/cli/test/asset-pack-preview.test.ts
rtk git commit -m "refactor(cli): unify linked and installed asset state"
```

Task 7 record:

- Implementation: Unified linked and installed desired state, deterministic immutable generation, mixed-source mutations, attribution/ownership, stale-baseline/conflict handling, and no-publication previews.
- Product/fix commits: `1dc27a6abc628464329cd8af3047c43dd0920cf5`, `79442f04e487275720d75c760197bbb96192fb7c`.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-state.test.ts asset-pack-sync.test.ts asset-pack-preview.test.ts asset-authoring-e2e.test.ts` PASS (56 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk pnpm check:boundaries` PASS.
- Review: Initial review found installed-candidate trust and preview-warning duplication; final reviewer APPROVED with no Critical or Important findings after the fix wave.

Then update this task's plan record and commit it separately.

---

### Task 8: Publish and recover manager-owned lifecycle transactions durably

**Files:**
- Create: `packages/cli/src/asset-pack-transaction.ts`
- Create: `packages/cli/test/asset-pack-transaction.test.ts`
- Modify: `packages/cli/src/asset-pack-sync.ts`
- Modify: `packages/cli/test/asset-pack-sync.test.ts`

**Interfaces:**
- Consumes: desired output/registry bytes, workspace marker/roots, and new/obsolete installed-source paths.
- Produces: journal publisher/recovery under Stable Interfaces for Tasks 9–12.

- [x] **Step 1: Write failing journal schema and path tests**

  - Implementation: Added strict journal schema parsing, role-specific containment, workspace/operation identity checks, same-parent publication layout, persisted role ownership evidence, and child identity validation.

Assert exact keys/schema/workspace ID/operation kind/phase, UUID operation ID, relative allowlisted paths, digest validation, no symlinks, no path outside `outputRoot`, `registryPath`, `stateRoot/staging`, `stateRoot/transactions`, or `stateRoot/installed`, and rejection of a journal that names artist source/base/cache/upstream.

```ts
export interface AssetPackTransactionJournal {
  readonly schema: typeof ASSET_PACK_TRANSACTION_SCHEMA;
  readonly workspaceId: string;
  readonly operationId: string;
  readonly operation: 'sync' | 'install' | 'remove';
  readonly phase: AssetPackTransactionPhase;
  readonly oldOutputBackup: string;
  readonly oldRegistryBackup?: string;
  readonly stagedOutput: string;
  readonly stagedRegistry: string;
  readonly stagedInstalledSource?: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
}
```

- [x] **Step 2: Write failing phase-by-phase recovery tests**

  - Implementation: Added crash/restart coverage for all approved phases, rollback/completion transitions, cursor validation, persisted installed/staging role substitution, claim recovery, and idempotent replay.

Inject failure/crash after journal durable write, output swap, source publication, and registry swap. Assert:

```text
prepared / output-published / sources-published -> restore old output and registry, remove only new installed source, action rolled-back
registry-published -> retain new output/registry/source, delete only recorded backups/obsolete installed sources, action completed
```

Repeat recovery to prove idempotence. A malformed journal returns `asset_transaction_unsafe` and mutates nothing.

- [x] **Step 3: Write failing durability adapter tests**

  - Implementation: Added durable file/journal writes, fsync ordering, parent-directory durability, unsupported-directory error handling, stable-cwd coverage, and claim release failure coverage.

Verify staged files are closed, file `fsyncSync` happens before rename, journal temp is fsynced then renamed, parent-directory fsync is attempted, and only `EINVAL`, `ENOTSUP`, or `EPERM` from directory fsync are tolerated. Other durability failures abort before active-state mutation.

- [x] **Step 4: Run the focused test and verify RED**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-transaction.test.ts` — RED before implementation as expected because the transaction module did not exist.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-transaction.test.ts
```

Expected: FAIL because the transaction module does not exist.

- [x] **Step 5: Implement durable journal and deterministic recovery**

  - Implementation: Implemented durable journal publication/recovery with authenticated output, registry, installed-source, and staging roles; restartable rollback/cleanup cursors; serialized claims; parent-local mutations; and approved four-phase recovery semantics.

Write every phase update through temp+fsync+rename. Record paths relative to workspace root and resolve them through strict role-specific containment on read. Before registry publication, rollback is the only policy; after registry publication, completion is the only policy. Never inspect or delete unlisted siblings.

- [x] **Step 6: Move sync to journaled publication**

  - Implementation: Moved sync recovery ahead of preflight and desired-state preparation under the shared transaction claim; sync now publishes through the durable publisher while preserving generated output and attribution.

Materialize desired output/registry below a unique `stateRoot/staging` generation and call `publishAssetPackGeneration` with operation `sync`. Run `recoverAssetPackTransaction` before preparing new sync state. Remove the Phase 1 in-process-only publisher after regression tests pass.

- [x] **Step 7: Verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-transaction.test.ts asset-pack-sync.test.ts` PASS (121 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk pnpm check:boundaries` PASS; `rtk git diff --check afc2af7c89a10d968631310a100ef0ca2b2c2831..a6b4ec87fdcc844693a17df51c84ea5e14be2704` PASS; prohibited-`any` scan PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-transaction.test.ts asset-pack-sync.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 8: Commit product code**

  - Product/fix commits: `e9dea41eb6c6ada2ba71704bfb19b59169778e8c`, `2749644b3c937bcc54b04d87d37eba0a50d5ae0c`, `a41d2c1ad768f301463b6422449af5cc49f83acf`, `e1cf1a0ff92de2c2bdab6a0fef2aabdd59d5b4e5`, `a9d00ee85dece0da8f9820541edff3e6fb011dc4`, `19a0352c39870934cfc042785ffd012edc89df5c`, `b62539cc8dce1d35948e8a89b33e97c435194d7c`, `a6b4ec87fdcc844693a17df51c84ea5e14be2704`.
  - Review: Final fresh reviewer APPROVED with no Critical, Important, or Minor findings in `.superpowers/sdd/task-8-review-final-7.md`.

```sh
rtk git add packages/cli/src/asset-pack-transaction.ts packages/cli/src/asset-pack-sync.ts packages/cli/test/asset-pack-transaction.test.ts packages/cli/test/asset-pack-sync.test.ts
rtk git commit -m "feat(cli): recover asset lifecycle transactions"
```

Then update this task's plan record and commit it separately.

---

### Task 9: Install, no-op, upgrade, explicitly downgrade, and replace packs

**Files:**
- Create: `packages/cli/src/asset-pack-install.ts`
- Create: `packages/cli/test/asset-pack-install.test.ts`
- Modify: `packages/cli/src/asset-workspace.ts`

**Interfaces:**
- Consumes: verified inspection snapshot, Core version/lifecycle decisions, registry v2, desired state, archive extractor, and journaled publisher.
- Produces: `installAssetPack`, installed receipt, and installed registry entries for Tasks 10–13.

- [x] **Step 1: Write failing lifecycle-policy tests**

  - Implementation: Added first install, exact no-op, same-version conflict, upgrade, authorized/unauthorized downgrade, linked-ID conflict, and compiler replacement tests.

Cover first install, identical archive no-op, same version/different digest rejection, greater-version upgrade, lower-version rejection, authorized downgrade with exact self pack/range/all asset keys, incomplete downgrade coverage, wrong range, active linked same-ID conflict, and cross-package replacement accepted/rejected by the compiler.

```ts
expect(installOk(await installAssetPack(firstOptions)).action).toBe('installed');
expect(installOk(await installAssetPack(firstOptions)).action).toBe('unchanged');
expect(installOk(await installAssetPack(upgradeOptions)).action).toBe('upgraded');
expect(installOk(await installAssetPack(authorizedDowngradeOptions)).action).toBe('downgraded');
```

- [x] **Step 2: Write failing staging and receipt tests**

  - Implementation: Added verified-snapshot extraction, normalized receipt/payload digest, full archive-digest path, portable reserved-name rejection, archive immutability, and staging cleanup coverage.

Assert extraction only beneath a newly created `stateRoot/staging/install-*`, final path uses full archive digest, no symlink traversal, receipt exact keys/digests/workspace ID, installed manifest is normalized, source bytes equal verified archive bytes, registry points inside installed root, and archive input remains untouched.

```ts
export const ASSET_PACK_INSTALL_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-pack-install-receipt.v1' as const;

export interface AssetPackInstallReceipt {
  readonly schema: typeof ASSET_PACK_INSTALL_RECEIPT_SCHEMA;
  readonly workspaceId: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly contentDigest: string;
  readonly installedAt: string;
  readonly payloadDigests: Readonly<Record<string, string>>;
}
```

Inject `now` into install options and use ISO-8601 UTC only for receipt metadata; it does not enter deterministic compile/archive digests.

- [x] **Step 3: Write failing transaction tests at install boundaries**

  - Implementation: Added pre-source, post-source, and post-registry crash/recovery tests, including exact rollback to an originally absent registry and authenticated install-parent cleanup.

Crash before source publication, after source publication, and after registry publication. Assert recovery removes a new unreferenced installed directory on rollback, retains it on completion, and deletes the prior installed version only after completed upgrade/downgrade. Artist sources and other installed packs remain byte-identical.

- [x] **Step 4: Run the focused test and verify RED**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-install.test.ts` — RED before implementation as expected because install orchestration did not exist.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-install.test.ts
```

Expected: FAIL because install orchestration does not exist.

- [x] **Step 5: Implement inspect-first lifecycle policy**

  - Implementation: Implemented one-transaction inspect-first install/no-op/upgrade/downgrade orchestration using verified archive bytes, complete desired-state compilation, normalized receipts, durable publication, and exact absent-registry recovery.

Run transaction recovery, inspect the archive with the active runtime, require `valid: true`, read registry, then choose:

```ts
export type AssetPackInstallAction =
  | 'installed'
  | 'unchanged'
  | 'upgraded'
  | 'downgraded';

export interface AssetPackInstallSuccess {
  readonly ok: true;
  readonly action: AssetPackInstallAction;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly installedDirectory: string;
  readonly generatedFileCount: number;
}

export type AssetPackInstallResult =
  | AssetPackInstallSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };
```

The no-op path verifies current installed receipt/source and returns without writing. All other paths stage verified source, create an installed candidate, prepare complete desired state, then journal-publish output/source/registry with the old installed directory in cleanup paths when applicable.

- [x] **Step 6: Verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-install.test.ts asset-pack-transaction.test.ts asset-pack-state.test.ts` PASS (128 tests); `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-registry.test.ts asset-workspace.test.ts` PASS (37 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk pnpm check:boundaries` PASS; diff and prohibited-`any` checks PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-install.test.ts asset-pack-transaction.test.ts asset-pack-state.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit product code**

  - Product/fix commits: `4dd3def267dffbb866fd36c0e56416404200c58c`, `aa4ddb54fac919bbbe268643e1688c337b6185de`.
  - Documentation impact: No Task 9 public command surface changed; the plan's help/README/landing/architecture/engineering updates remain scheduled for the public CLI integration and final reassessment.
  - Review: Final fresh reviewer APPROVED with no Critical, Important, or Minor findings in `.superpowers/sdd/task-9-review-final.md`.

```sh
rtk git add packages/cli/src/asset-pack-install.ts packages/cli/src/asset-workspace.ts packages/cli/test/asset-pack-install.test.ts
rtk git commit -m "feat(cli): install and upgrade asset packs"
```

Then update this task's plan record and commit it separately.

---

### Task 10: List active packs and remove linked or installed state safely

**Files:**
- Create: `packages/cli/src/asset-pack-remove.ts`
- Create: `packages/cli/test/asset-pack-remove.test.ts`

**Interfaces:**
- Consumes: transaction recovery, registry v2, desired-state remove mutation, and journaled publisher.
- Produces: `listAssetPacks`, `removeAssetPack`, and result summaries for Task 12.

- [x] **Step 1: Write failing list tests**

  - Implementation: Added synchronous empty/linked/installed/mixed list projections, stable ordering, recovery actions, strict registry failures, and claimed snapshot concurrency coverage.

Cover empty, linked, installed, and mixed registries; stable pack-ID order; source-kind-specific path; version/display name/content/archive digest; pending transaction recovery action; strict registry failure; and no base-runtime preparation requirement.

```ts
export interface AssetPackListEntry {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly kind: 'linked' | 'installed';
  readonly sourcePath: string;
  readonly contentDigest: string;
  readonly archiveDigest?: string;
}

export type AssetPackListResult =
  | {
      readonly ok: true;
      readonly recovery: AssetPackRecoveryAction;
      readonly entries: readonly AssetPackListEntry[];
    }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };
```

- [x] **Step 2: Write failing linked-removal tests**

  - Implementation: Added mixed linked removal, complete retained-state recompilation/credits, artist-source immutability, repeated removal, and true conflict byte-for-byte no-mutation coverage.

Remove a linked pack from a mixed registry and assert its generated output disappears, remaining output/credits compile, artist source remains byte-identical, repeated removal returns `asset_pack_not_installed`, and conflicts in the remaining desired state prevent all mutation.

- [x] **Step 3: Write failing installed-removal tests**

  - Implementation: Added mixed installed removal, registry-publication/cleanup boundary checks, rollback preservation, near-name/same-parent sibling protection, final marker-only output, and base/cache/upstream sentinels.

Assert the target installed source persists through staging and registry publication, is deleted only during completed cleanup, rolls back intact before registry publication, other installed directories remain, removing the final pack leaves exactly the manager marker plus empty v2 registry/generated digests, and base/cache/upstream sentinels remain unchanged.

- [x] **Step 4: Run the focused test and verify RED**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-remove.test.ts` — RED before implementation as expected because list/remove services did not exist.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-remove.test.ts
```

Expected: FAIL because list/remove services do not exist.

- [x] **Step 5: Implement list and desired-state removal**

  - Implementation: Implemented exact synchronous `listAssetPacks` under a claimed recovery/registry snapshot and journaled linked/installed removal with authenticated cleanup deltas.

Both services recover a valid pending transaction first. List then reads only registry state. Remove requires runtime, validates the complete remaining desired state, materializes it, and calls journal publication with operation `remove`; cleanup includes only the removed installed entry's canonical manager-owned directory.

```ts
export interface AssetPackRemoveSuccess {
  readonly ok: true;
  readonly packId: string;
  readonly removedKind: 'linked' | 'installed';
  readonly remainingPackIds: readonly string[];
  readonly generatedFileCount: number;
}

export type AssetPackRemoveResult =
  | AssetPackRemoveSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };
```

- [x] **Step 6: Verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-remove.test.ts asset-pack-state.test.ts asset-pack-transaction.test.ts` PASS (120 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk pnpm check:boundaries` PASS; diff and prohibited-`any` checks PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-remove.test.ts asset-pack-state.test.ts asset-pack-transaction.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit product code**

  - Product/fix commits: `7384d437b6e495e3d56abd78915f7ac68189c7df`, `489c408650c2ba78d8a4207844d0d5e6c4c8b624`.
  - Documentation impact: No Task 10 public command surface changed; the plan's public CLI documentation updates remain scheduled for Task 11 and final reassessment.
  - Review: Final fresh reviewer APPROVED with no Critical, Important, or Minor findings in `.superpowers/sdd/task-10-review-final.md`.

```sh
rtk git add packages/cli/src/asset-pack-remove.ts packages/cli/test/asset-pack-remove.test.ts
rtk git commit -m "feat(cli): list and remove active asset packs"
```

Then update this task's plan record and commit it separately.

---

### Task 11: Audit lifecycle integrity and report narrow transaction recovery

**Files:**
- Create: `packages/cli/src/asset-pack-doctor.ts`
- Create: `packages/cli/test/asset-pack-doctor.test.ts`

**Interfaces:**
- Consumes: transaction recovery, registry/output auditors, linked/installed payload loaders, desired-state compilation, and runtime attribution data.
- Produces: `doctorAssetPacks` and stable health/recovery report for Task 12.

- [ ] **Step 1: Write failing healthy and recovery tests**

Assert an empty workspace, linked-only, installed-only, and mixed workspace are healthy. Seed every valid transaction phase and assert doctor reports `rolled-back` or `completed`, then audits the recovered state. Re-running reports `none` and makes no write.

- [ ] **Step 2: Write failing registry/source/output audit tests**

Cover marker/workspace mismatch, registry unknown field/digest tamper, linked source missing/content drift, installed directory escape/symlink/missing receipt/receipt drift/source drift, generated output missing/extra/digest drift, compile digest mismatch, ownership mismatch, replacement conflict, stale baseline, missing generated credit, and incomplete credit coverage.

- [ ] **Step 3: Write failing non-repair tests**

For every tampered or unknown state, snapshot workspace bytes before/after doctor and assert equality. Doctor must not recreate output, rewrite registry, adopt an unregistered installed directory, delete orphan staging/installed content, or change artist source. A malformed/unsafe journal is reported and left untouched.

- [ ] **Step 4: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-doctor.test.ts
```

Expected: FAIL because doctor does not exist.

- [ ] **Step 5: Implement deterministic checks and report**

```ts
export interface AssetPackDoctorCheck {
  readonly code: string;
  readonly status: 'pass' | 'warning' | 'error';
  readonly message: string;
  readonly path?: string;
  readonly packId?: string;
}

export interface AssetPackDoctorReport {
  readonly schema: 'lpc-toolkit.asset-pack-doctor.v1';
  readonly healthy: boolean;
  readonly recovery: AssetPackRecoveryAction;
  readonly checks: readonly AssetPackDoctorCheck[];
  readonly packs: readonly AssetPackListEntry[];
}
```

Sort checks by status severity, code, pack ID, then path. `healthy` is false for any error; warnings do not fail health unless the warning represents an unacknowledged pack diagnostic, which desired-state validation already emits as an error.

- [ ] **Step 6: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-doctor.test.ts asset-pack-registry.test.ts asset-pack-transaction.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit product code**

```sh
rtk git add packages/cli/src/asset-pack-doctor.ts packages/cli/test/asset-pack-doctor.test.ts
rtk git commit -m "feat(cli): diagnose asset lifecycle integrity"
```

Then update this task's plan record and commit it separately.

---

### Task 12: Expose Phase 2 commands, requirements, exit status, and presentation

**Files:**
- Modify: `packages/cli/src/asset-commands.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/test/command-spec.test.ts`
- Modify: `packages/cli/test/main-assets.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

**Interfaces:**
- Consumes: all Phase 2 services and reports.
- Produces: the approved six-command public surface and CLI envelopes used by Task 13 acceptance.

- [ ] **Step 1: Write failing command/help tests**

Add these exact leaves and examples:

```text
lpc-toolkit asset pack <pack-directory> [--workspace <directory>] [--json]
lpc-toolkit asset inspect <pack.lpc-assets.zip> [--json]
lpc-toolkit asset install <pack.lpc-assets.zip> [--workspace <directory>] [--json]
lpc-toolkit asset list [--workspace <directory>] [--json]
lpc-toolkit asset remove <pack-id> [--workspace <directory>] [--json]
lpc-toolkit asset doctor [--workspace <directory>] [--json]
```

Pack/inspect/install require exactly one path positional; remove requires exactly one pack ID; list/doctor accept none. No `--force`, `--ignore-warnings`, `--allow-downgrade`, `--repair`, archive-limit, or concurrency option exists.

- [ ] **Step 2: Write failing workspace/runtime requirement tests**

Implement and assert:

| Command | Workspace | Runtime assets |
| --- | --- | --- |
| `asset workspace init` | no | no |
| `asset inspect` | no | yes, managed-cache-only at current cwd |
| `asset list` | yes | no |
| `asset init/validate/preview/sync/pack/install/remove/doctor` | yes | yes, managed-cache-only at workspace root |

Help and invalid preflight never prepare workspace/runtime. List may run filesystem transaction recovery but never prepares base assets.

- [ ] **Step 3: Write failing JSON/exit tests**

Use existing envelopes and exact command names. `asset inspect` with `data.valid: false` and `asset doctor` with `data.healthy: false` return exit `1` while preserving structured report data, matching `asset validate`. Pack/install/remove fatal diagnostics use `ok: false`. List and install no-op use exit `0`.

- [ ] **Step 4: Write failing human-output tests**

Pack prints archive/content digests and path. Inspect groups archive/compatibility/pixel/credit diagnostics and acknowledgement JSON. Install prints action/source/output. List prints stable columns `PACK ID`, `VERSION`, `KIND`, `SOURCE`. Remove prints removed kind and remaining count. Doctor prints recovery action, grouped checks, and never suggests a broad force/repair command.

- [ ] **Step 5: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts main-json.test.ts main-human.test.ts
```

Expected: FAIL because Phase 2 leaves and routing do not exist.

- [ ] **Step 6: Refactor asset command context by declared requirements**

```ts
export interface AssetCommandRequirements {
  readonly workspace: boolean;
  readonly runtime: boolean;
}

export function assetCommandRequirements(
  parsed: ParsedArgs,
): AssetCommandRequirements | undefined;

interface AssetCommandContext {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
  readonly workspace?: AssetWorkspace;
  readonly runtime?: RuntimeAssets;
}
```

Main resolves only declared dependencies, then `runAssetCommand` asserts the service-specific requirements through typed helper functions. Inspection compatibility uses `CLI_VERSION`. Omit internal archive snapshots from response data.

- [ ] **Step 7: Implement human formatters and verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts main-json.test.ts main-human.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli build
```

Expected: PASS.

- [ ] **Step 8: Commit product code**

```sh
rtk git add packages/cli/src/asset-commands.ts packages/cli/src/command-spec.ts packages/cli/src/main.ts packages/cli/src/response.ts packages/cli/test/command-spec.test.ts packages/cli/test/main-assets.test.ts packages/cli/test/main-json.test.ts packages/cli/test/main-human.test.ts
rtk git commit -m "feat(cli): expose asset package lifecycle"
```

Then update this task's plan record and commit it separately.

---

### Task 13: Prove the two-workspace lifecycle and publish its contracts

**Files:**
- Create: `packages/cli/test/asset-lifecycle-e2e.test.ts`
- Modify: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `packages/web/test/landing-page.test.tsx`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ENGINEERING.md`
- Modify: this plan's CLI Documentation Impact matrix if reassessment changes it

**Interfaces:**
- Consumes: the complete Phase 1+2 public CLI.
- Produces: clean installed-package acceptance, updated public/engineering contracts, and final verification evidence.

- [ ] **Step 1: Write the clean two-workspace E2E before documentation**

Drive `runCli` through two fresh directories with injected compatible runtime/cache:

```text
workspace A: scaffold hair_messy climb + moon-braid -> add complete PNGs -> validate -> preview -> sync -> pack both
workspace B: init -> inspect both -> install both -> list -> render selection with base/custom credits -> install newer moon-braid -> verify stable selection identity -> remove moon-braid -> verify hair_messy extension and credits remain -> doctor healthy
```

Re-run the same-scope animation audit after install and removal to prove the intended extension appears/disappears through catalog behavior. Assert every write is below the two workspaces except the injected base cache and no write touches its sentinel.

- [ ] **Step 2: Extend packed-public-CLI smoke**

Using the npm tarball installation and an isolated consumer directory, run workspace init, create a minimal attributed pack fixture, validate, pack, initialize a second workspace, inspect, install, list, render/preview installed content with TXT/CSV credits, doctor, and remove. Reuse the prepared pinned cache; require no repository checkout or initialized `upstream/`.

- [ ] **Step 3: Run acceptance/package tests and verify behavior before docs**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-lifecycle-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
```

Expected before landing copy is updated: lifecycle E2E and package smoke PASS; landing test FAIL on the old Phase 2 deferral text.

- [ ] **Step 4: Update CLI and root public workflows**

Document every command/options/default path/report/exit code, normalized archive/checksum schema, exact limits, unsupported archive features, compatibility fields, install/no-op/upgrade/downgrade policy, linked conflict, registry v2 migration, installed ownership, journal recovery, doctor mutation exception, and attribution retention.

Root README must show author and consumer commands in order and state that Git/repository clone is optional. Remove only the Phase 2 deferral; retain the Phase 3 Web authoring deferral.

- [ ] **Step 5: Update landing, architecture, and engineering**

Landing shows `asset pack`, second-workspace `asset install`, and `asset doctor` without implying browser authoring. Architecture records archive trust boundaries, payload snapshot, registry v2, linked/installed source union, lifecycle policy, desired-state compiler, journal phases/recovery, installed cleanup, and credit flow. Engineering maps all focused security/lifecycle tests, package smoke, E2E, boundary gate, and complete verification.

- [ ] **Step 6: Reassess the mandatory CLI documentation matrix**

Expected final result:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: N/A — no npm publication, CLI versioning, or pinned base-asset release procedure changes
plugin: N/A — the audit skill stays read-only and asset-authoring skill design remains separate
```

- [ ] **Step 7: Run focused security, lifecycle, docs, and package checks**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts asset-pack-compile.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-registry.test.ts asset-pack-state.test.ts asset-pack-transaction.test.ts asset-pack-install.test.ts asset-pack-remove.test.ts asset-pack-doctor.test.ts asset-lifecycle-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: PASS.

- [ ] **Step 8: Run full repository verification**

```sh
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm verify
```

Expected: PASS. Fix implementation failures; do not weaken archive limits, attribution, architecture boundaries, or verification gates.

- [ ] **Step 9: Inspect final scope and manager-owned boundaries**

```sh
rtk git status --short
rtk git diff --check
rtk git diff --stat
rtk git diff -- packages/core packages/cli README.md packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx docs/ARCHITECTURE.md docs/ENGINEERING.md
```

Expected: only planned files and plan records; no `upstream/`, checked-in assets, cache, generated test workspace, archive fixture, lockfile, dependency, or unrelated change.

- [ ] **Step 10: Commit acceptance and documentation**

```sh
rtk git add packages/cli/test/asset-lifecycle-e2e.test.ts packages/cli/scripts/smoke-packed-cli.mjs packages/cli/README.md README.md packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx docs/ARCHITECTURE.md docs/ENGINEERING.md
rtk git commit -m "docs: publish asset package lifecycle"
```

Then update this task's plan record with the full verification evidence and commit it separately.

## Final Handoff Evidence

Before claiming Phase 2 complete, the implementation handoff must include:

- branch name, merge base, and full product/plan-record commit hashes;
- final CLI documentation matrix and exact PR declaration;
- exact PASS summaries for every Task 13 Step 8 command;
- deterministic archive digest evidence from two independently ordered inputs;
- archive security/bounds/checksum test evidence;
- clean two-workspace pack/inspect/install/render/upgrade/remove/doctor evidence;
- explicit downgrade authorization and linked-source-conflict evidence;
- journal crash recovery evidence at every phase, including idempotent second recovery;
- proof doctor mutates only valid interrupted manager journals and leaves tampered/unknown state untouched;
- proof installed preview/render retains complete base and pack TXT/CSV attribution;
- confirmation of no dependency/lockfile/`any`/`upstream/`/checked-in-assets/base-cache mutation;
- Phase 3 Web authoring and all unrelated deferred work restated as not implemented.
