# Artist Asset Pack Authoring Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an artist with only the public CLI create a standalone workspace, scaffold new or audit-derived LPC asset packs, validate complete animation PNGs and attribution, render attributed previews, and synchronize linked packs into a manager-owned local overlay without cloning this repository.

**Architecture:** Core owns strict source parsing, normalization, geometry, warning acknowledgements, deterministic patch/credit/conflict decisions, and compile plans as pure values. The CLI owns workspace and filesystem safety, SHA-256, PNG inspection, audit scaffolding, temporary preview materialization, linked-pack registry state, rollback-safe publication, and command presentation. Existing composition continues to receive a catalog plus injected `AssetStore`; a CLI overlay store resolves only compiler-authorized generated paths before the unchanged base directory or ZIP store.

**Tech Stack:** TypeScript 5.7 strict mode, Node.js 22+, pnpm 9, Vitest 2, existing `@napi-rs/canvas`, existing Core/catalog/credits APIs, existing directory and ZIP `AssetStore` implementations. No new dependency.

**Design:** `docs/superpowers/specs/2026-07-21-artist-asset-pack-authoring-design.md`

## Global Constraints

- Implement only Phase 1: workspace, source schema, new/audit scaffolding, validation, preview, linked sync, generated overlay, and clean no-repository acceptance. Do not implement `asset pack`, archive inspection, installation, upgrade/downgrade, remove, doctor, archive security, or crash-journal recovery.
- Add no dependency and no `any` type. Parse strict JSON and semantic-version syntax with local pure helpers.
- Never initialize, read as a requirement, modify, or commit inside `upstream/`. Never write into checked-in `assets/` or the managed asset cache.
- Artist PNG sources remain below `<pack>/sprites/`. Read-only commands do not rewrite `asset-pack.json`.
- Accept only complete per-animation PNGs. Do not assemble frames, extract base pixels, repair blank frames, or create runtime-recolor PNG tasks.
- Preserve current selection identity: generated new-item definition basename and `ItemDefinition.name` are both `<pack-id>--<local-id>`; the artist label is `display_name`.
- Preserve attribution through validation, compilation, overlay loading, composition, preview PNG, preview TXT, preview CSV, and metadata. Existing-item contributions union baseline credits with pack credits; overrides replace only the contribution portion.
- Reject implicit last-write-wins in asset-pack compilation. Multiple disjoint patches may merge; semantic-field or destination conflicts require exact authorized replacement intent.
- Warnings block sync until the exact acknowledgement is persisted. The content digest excludes `acknowledgements` but includes normalized substantive manifest data and every referenced source digest.
- Workspace initialization must not prepare the asset cache. Every later command that requires catalog data or pixels resolves the workspace first and prepares runtime assets with the workspace root as `cwd`.
- `assets_custom/` is writable only when the CLI-created manager marker is present. Initialization refuses a non-empty unowned output directory; sync refuses every unowned or tampered output.
- Sync stages a complete desired overlay and registry, then publishes with rollback on any in-process failure. Crash recovery and a persistent transaction journal remain Phase 2.
- Keep `packages/core/` environment-agnostic: no Node, filesystem, DOM, React, concrete canvas, ZIP, or CLI imports.
- Preserve all existing catalog, character, render, selection, token, preset, Web, and animation-audit behavior.
- Prefix every repository command with `rtk`.
- After each task's product commit, update this checked-in plan: check completed steps, add a short implementation note, record the full product commit hash, and record each exact verification command with PASS/FAIL. Commit that record separately with `docs(plan): record ...`.

## Phase Boundary

Phase 1 exposes exactly these public commands:

```text
lpc-toolkit asset workspace init <directory> [--json]
lpc-toolkit asset init --new [options]
lpc-toolkit asset init --from-audit <report.json> [selection options]
lpc-toolkit asset validate <pack-directory> [--json]
lpc-toolkit asset preview <pack-directory> [options]
lpc-toolkit asset sync <pack-directory> [--json]
```

`asset pack` and all distribution/lifecycle commands are deliberately absent until the separate Phase 2 plan. Phase 1 acceptance therefore ends after attributed preview and linked sync.

## File Structure

### Core

- `packages/core/src/asset-pack-schema.ts` — source types, strict unknown-field parser, ID/version/path/credit rules, and stable schema diagnostics.
- `packages/core/src/asset-pack-model.ts` — normalized body inheritance, namespaced identity, semantic source-layer ordering, canonical content projection, and warning acknowledgement matching.
- `packages/core/src/asset-pack-validation.ts` — registered catalog/palette/geometry validation plus injected source-file and pixel inspection results.
- `packages/core/src/asset-pack-compile.ts` — deterministic new-item definitions, existing-item patch merge, consumer aggregation, credits union/override, conflicts, replacement authorization, and compile-plan output.
- `packages/core/src/asset-animation-audit.ts` — export the existing standard geometry helper for reuse instead of duplicating frame layout rules.
- `packages/core/src/index.ts` — publish Phase 1 source, normalized, validation, and compile interfaces.
- `packages/core/test/asset-pack-schema.test.ts` — strict parsing, IDs, versions, paths, credits, body inheritance, identity, and content projection.
- `packages/core/test/asset-pack-validation.test.ts` — catalog, geometry, frame, recolor, warning, and acknowledgement cases.
- `packages/core/test/asset-pack-compile.test.ts` — new definitions, patch merge, credits, ownership, replacement, conflicts, and ordering.

### CLI

- `packages/cli/src/asset-workspace.ts` — workspace discovery/configuration, initialization, manager marker, and owned directory layout.
- `packages/cli/src/asset-pack-files.ts` — safe pack reads, canonical JSON SHA-256, source-file digests, and regular-file containment.
- `packages/cli/src/asset-pack-scaffold.ts` — simple/advanced new-item manifests and bounded audit-report conversion.
- `packages/cli/src/asset-pack-validation.ts` — catalog/palette baseline creation, PNG decode/inspection, Core validation orchestration, and CLI reports.
- `packages/cli/src/asset-overlay-store.ts` — authorized overlay-first resolution over an existing directory/ZIP `AssetStore`.
- `packages/cli/src/asset-pack-sync.ts` — linked registry desired-state rebuild, staging, generated files/credits, ownership checks, and rollback-safe publication.
- `packages/cli/src/asset-pack-preview.ts` — transient desired-state overlay, default or supplied character selection, and existing attributed preview publication.
- `packages/cli/src/asset-commands.ts` — Phase 1 preflight, command execution, CLI response conversion, and human summaries.
- `packages/cli/src/args.ts` — recognize the three-token `asset workspace init` command and new boolean flags.
- `packages/cli/src/asset-store.ts` — expose source-to-logical-path conversion and accept the overlay store kind.
- `packages/cli/src/runtime-assets.ts` — construct runtime context from the resolved workspace and optionally wrap the base store with a compiled overlay.
- `packages/cli/src/command-spec.ts` — asset help tree, options, examples, and validation.
- `packages/cli/src/main.ts` — asset-independent workspace-init dispatch and workspace-aware runtime preparation.
- `packages/cli/src/response.ts` — deterministic human validation, scaffold, preview, and sync output.
- `packages/cli/test/asset-workspace.test.ts` — discovery, initialization, ownership, and unowned-output refusal.
- `packages/cli/test/asset-pack-files.test.ts` — containment, symlink, digest, and read-only behavior.
- `packages/cli/test/asset-pack-scaffold.test.ts` — new templates and audit finding conversion.
- `packages/cli/test/asset-pack-validation.test.ts` — decoded PNG and baseline integration.
- `packages/cli/test/asset-overlay-store.test.ts` — directory/ZIP-independent authorized resolution and fallback.
- `packages/cli/test/asset-pack-sync.test.ts` — registry merge, generated output, conflicts, re-sync, ownership, and rollback.
- `packages/cli/test/asset-pack-preview.test.ts` — temporary overlay and attributed default/custom character previews.
- `packages/cli/test/args.test.ts` — nested asset command parsing.
- `packages/cli/test/command-spec.test.ts` — complete asset help/options contract.
- `packages/cli/test/main-assets.test.ts` — cache-free workspace init and workspace-root runtime preparation.
- `packages/cli/test/main-json.test.ts` — standard JSON envelopes and diagnostics/acknowledgement shape.
- `packages/cli/test/main-human.test.ts` — scaffold, validation, preview, and sync human output.
- `packages/cli/scripts/smoke-packed-cli.mjs` — installed-package workspace-init smoke test outside a repository checkout.
- `packages/cli/README.md` — all Phase 1 commands, workspace/source layout, warning policy, ownership, stdout/stderr, and examples.

### Repository and Web documentation

- `README.md` — public-CLI-only artist quick path and link to detailed CLI authoring docs.
- `packages/web/src/components/landing-page.tsx` — concise no-repository artist workflow.
- `packages/web/test/landing-page.test.tsx` — landing authoring command/order assertions.
- `docs/ARCHITECTURE.md` — Core/CLI/Web ownership, pack-to-compile flow, overlay/registry boundaries, attribution path, and phase boundary.
- `docs/ENGINEERING.md` — focused authoring checks, fixtures, no-repo acceptance, boundary gate, and complete verification mapping.

## Stable Interfaces

Later tasks must use these public names and semantic shapes unless this plan is amended before implementation.

```ts
// packages/core/src/asset-pack-schema.ts
export const ASSET_PACK_SCHEMA = 'lpc-toolkit.asset-pack.v1' as const;

export type AssetPackDiagnosticCode =
  | 'asset_pack_schema_invalid'
  | 'asset_pack_id_invalid'
  | 'asset_source_missing'
  | 'asset_png_decode_failed'
  | 'asset_geometry_mismatch'
  | 'asset_required_frame_blank'
  | 'asset_credit_missing'
  | 'asset_license_invalid'
  | 'asset_base_definition_changed'
  | 'asset_base_credit_changed'
  | 'asset_destination_unaccepted'
  | 'asset_path_conflict'
  | 'asset_replacement_unauthorized'
  | 'asset_output_root_unowned'
  | 'asset_digest_mismatch'
  | 'asset_publish_failed'
  | 'asset_path_inferred'
  | 'asset_optional_frame_blank'
  | 'asset_partial_body_coverage'
  | 'asset_partial_animation_coverage';

export interface AssetPackCreditSource {
  readonly authors: readonly string[];
  readonly licenses: readonly License[];
  readonly urls: readonly string[];
  readonly notes: string;
}

export interface AssetPackAcknowledgement {
  readonly code: AssetPackDiagnosticCode;
  readonly subject: Readonly<Record<string, string | readonly string[]>>;
  readonly contentDigest: string;
  readonly reason: string;
}

export interface AssetPackReplacementSource {
  readonly packId: string;
  readonly versions: string;
  readonly assets: readonly string[];
}

export interface NewItemSpriteSource {
  readonly animation: AnimationName;
  readonly source: string;
  readonly bodyTypes?: readonly BodyType[];
  readonly variant?: string;
}

export interface NewItemLayerSource {
  readonly id: string;
  readonly zPos: number;
  readonly bodyTypes?: readonly BodyType[];
  readonly sprites: readonly NewItemSpriteSource[];
}

export interface NewItemAssetSource {
  readonly kind: 'new-item';
  readonly localId: string;
  readonly displayName: string;
  readonly typeName: TypeName;
  readonly bodyTypes: readonly BodyType[];
  readonly animations: readonly AnimationName[];
  readonly layers: readonly NewItemLayerSource[];
  readonly variants?: readonly string[];
  readonly recolor?: RawRecolors;
}

export interface ExtendItemDestinationSource {
  readonly path: string;
  readonly evidence: 'audit-exact' | 'audit-inferred' | 'artist-specified' | 'manual-review';
  readonly accepted: boolean;
}

export interface ExtendItemLayerSource {
  readonly layer: `layer_${number}`;
  readonly bodyTypes: readonly BodyType[];
  readonly source: string;
  readonly destination: ExtendItemDestinationSource;
  readonly variant?: string;
  readonly consumers?: readonly AnimationAuditConsumer[];
}

export interface ExtendItemAnimationSource {
  readonly animation: AnimationName;
  readonly layers: readonly ExtendItemLayerSource[];
}

export interface ExtendItemAssetSource {
  readonly kind: 'extend-item';
  readonly itemId: ItemId;
  readonly baseDefinitionDigest: string;
  readonly baseCreditDigest: string;
  readonly addAnimations: readonly ExtendItemAnimationSource[];
}

export type AssetPackAssetSource = NewItemAssetSource | ExtendItemAssetSource;

export interface AssetPackSource {
  readonly schema: typeof ASSET_PACK_SCHEMA;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly credits: AssetPackCreditSource;
  readonly creditOverrides?: Readonly<Record<string, AssetPackCreditSource>>;
  readonly replaces?: readonly AssetPackReplacementSource[];
  readonly acknowledgements?: readonly AssetPackAcknowledgement[];
  readonly assets: readonly AssetPackAssetSource[];
}

export interface AssetPackDiagnostic {
  readonly code: AssetPackDiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly packId?: string;
  readonly assetId?: string;
  readonly sourcePath?: string;
  readonly destinationPath?: string;
  readonly subject?: Readonly<Record<string, string | readonly string[]>>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type AssetPackParseResult =
  | { readonly ok: true; readonly source: AssetPackSource }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackDiagnostic[] };

export function parseAssetPackSource(input: unknown): AssetPackParseResult;

// packages/core/src/asset-pack-model.ts
export type AssetPackCreditRecord = Omit<CreditEntry, 'file'>;

export interface NormalizedAssetPack {
  readonly schema: typeof ASSET_PACK_SCHEMA;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly credits: AssetPackCreditRecord;
  readonly creditOverrides: ReadonlyMap<string, AssetPackCreditRecord>;
  readonly replacements: readonly NormalizedAssetPackReplacement[];
  readonly acknowledgements: readonly AssetPackAcknowledgement[];
  readonly assets: readonly NormalizedAssetPackAsset[];
}

export function assetPackItemId(packId: string, localId: string): ItemId;
export function normalizeAssetPack(source: AssetPackSource): NormalizedAssetPack;
export function assetPackContentProjection(pack: NormalizedAssetPack): unknown;
export function warningAcknowledged(
  diagnostic: AssetPackDiagnostic,
  contentDigest: string,
  acknowledgements: readonly AssetPackAcknowledgement[],
): boolean;

// packages/core/src/asset-pack-validation.ts
export interface AssetPackSourceInspection {
  readonly sourcePath: string;
  readonly digest?: string;
  readonly regularFile: boolean;
  readonly decoded?: {
    readonly width: number;
    readonly height: number;
    readonly nonTransparentCells: readonly string[];
    readonly paletteColors: readonly string[];
  };
  readonly error?: 'missing' | 'outside-pack' | 'not-regular' | 'decode-failed';
}

export interface ValidateAssetPackOptions {
  readonly pack: NormalizedAssetPack;
  readonly baseline: AssetPackBaseline;
  readonly palettes: PaletteMetadata;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: string;
}

export interface AssetPackValidationResult {
  readonly ok: boolean;
  readonly contentDigest: string;
  readonly diagnostics: readonly AssetPackDiagnostic[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
}

export function validateAssetPack(options: ValidateAssetPackOptions): AssetPackValidationResult;

// packages/core/src/asset-pack-compile.ts
export interface AssetPackBaseline {
  readonly catalog: Catalog;
  readonly definitionDigests: ReadonlyMap<ItemId, string>;
  readonly creditDigests: ReadonlyMap<ItemId, string>;
}

export interface AssetPackCompilePlan {
  readonly definitions: readonly CompiledAssetDefinition[];
  readonly sprites: readonly CompiledAssetSprite[];
  readonly credits: readonly CreditEntry[];
  readonly ownership: readonly CompiledAssetOwnership[];
  readonly diagnostics: readonly AssetPackDiagnostic[];
}

export function compileAssetPacks(options: {
  readonly baseline: AssetPackBaseline;
  readonly packs: readonly NormalizedAssetPack[];
}): AssetPackCompilePlan;

// packages/core/src/asset-animation-audit.ts
export function standardAnimationGeometry(animation: AnimationName): AnimationAuditGeometry;
```

The source union must represent the approved v1 fields exactly: `new-item` has `localId`, `displayName`, `typeName`, inherited `bodyTypes`, `animations`, `layers`, optional variants/recolor; `extend-item` has `itemId`, `baseDefinitionDigest`, `baseCreditDigest`, and `addAnimations`; every sprite has one animation, source path, narrowed body types/variant when present, and an extension destination with evidence plus acceptance.

```ts
// packages/cli/src/asset-workspace.ts
export const ASSET_WORKSPACE_SCHEMA = 'lpc-toolkit.asset-workspace.v1' as const;
export const ASSET_WORKSPACE_REGISTRY_SCHEMA = 'lpc-toolkit.asset-workspace-registry.v1' as const;
export const ASSET_OUTPUT_MARKER_SCHEMA = 'lpc-toolkit.asset-output.v1' as const;

export interface AssetWorkspace {
  readonly root: string;
  readonly configPath: string;
  readonly packsRoot: string;
  readonly outputRoot: string;
  readonly stateRoot: string;
  readonly registryPath: string;
}

export function findAssetWorkspace(start: string, explicit?: string): AssetWorkspace;
export function initializeAssetWorkspace(target: string): AssetWorkspace;
export function assertManagedAssetOutput(workspace: AssetWorkspace): void;

// packages/cli/src/asset-pack-files.ts
export interface LoadedAssetPack {
  readonly root: string;
  readonly manifestPath: string;
  readonly source: AssetPackSource;
  readonly normalized: NormalizedAssetPack;
  readonly sourceDigests: ReadonlyMap<string, string>;
  readonly contentDigest: string;
}

export function loadAssetPack(packDirectory: string): LoadedAssetPack;

// packages/cli/src/asset-overlay-store.ts
export function createOverlayAssetStore(options: {
  readonly base: AssetStore;
  readonly overlayRoot: string;
  readonly logicalPaths: readonly string[];
}): AssetStore;

// packages/cli/src/asset-pack-validation.ts
export async function validateAssetPackDirectory(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}): Promise<AssetPackValidationReport>;

// packages/cli/src/asset-pack-sync.ts
export async function syncLinkedAssetPack(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetPublicationFileOps;
}): Promise<AssetPackSyncResult>;

// packages/cli/src/asset-pack-preview.ts
export async function previewAssetPack(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly assetId?: string;
  readonly animation?: string;
  readonly bodyType?: string;
  readonly characterPath?: string;
}): Promise<AssetPackPreviewResult>;
```

Generated paths are deterministic:

```text
new definition: sheet_definitions/<type-name>/<pack-id>--<local-id>.json
new sprite base: spritesheets/packages/<pack-id>/<local-id>/<layer-id>/<body-key>/
extension definition: sheet_definitions/<baseline-type>/<baseline-item-id>.json
extension sprite: exact accepted destination from the manifest
generated credits: CREDITS.csv plus credits embedded in every generated definition
```

`body-key` is the effective body types sorted in `BODY_TYPES` registry order and joined with `-`. Internal `layer_N` assignment sorts source layers by `zPos`, then source declaration index. All pack iteration sorts by pack ID; asset iteration sorts by stable asset identity; generated files sort by logical path.

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: N/A — no npm publication or pinned base-asset publication procedure changes
plugin: N/A — the installed animation-audit skill remains read-only; authoring-skill design is deferred
```

The implementation pull request must declare:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering
```

Reassess the matrix in Task 12. If implementation changes another owned contract, update that surface and declaration instead of preserving an inaccurate `N/A`.

---

### Task 1: Add strict Core source parsing and normalization

**Files:**
- Create: `packages/core/src/asset-pack-schema.ts`
- Create: `packages/core/src/asset-pack-model.ts`
- Create: `packages/core/test/asset-pack-schema.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing strict-schema tests**

Cover the complete approved examples plus: unknown top-level/nested fields, unknown major schema, missing credits, unsupported license, URL-less credits without notes, invalid pack/local IDs, invalid semantic versions, absolute/backslash/dot/parent/source-outside-`sprites/` paths, duplicate local IDs, child body types broadening parents, and duplicate semantic layer IDs.

```ts
it('rejects misspelled v1 fields instead of ignoring them', () => {
  const result = parseAssetPackSource({ ...validPack, displayNmae: 'typo' });
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
  });
});

it('uses pack plus local id for both catalog and selection identity', () => {
  expect(assetPackItemId('acme.fantasy-hair', 'moon-braid'))
    .toBe('acme.fantasy-hair--moon-braid');
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts
```

Expected: FAIL because the new modules do not exist.

- [x] **Step 3: Implement strict parsing without a schema dependency**

Use small `isRecord`, `exactKeys`, string-array, optional-field, discriminated-union, and path validators. Accumulate deterministic diagnostics in JSON-path order; do not cast an unchecked record into the public source type.

```ts
export function parseAssetPackSource(input: unknown): AssetPackParseResult {
  const diagnostics: AssetPackDiagnostic[] = [];
  const source = parsePackRecord(input, '$', diagnostics);
  return source && diagnostics.length === 0
    ? { ok: true, source }
    : { ok: false, diagnostics };
}
```

- [x] **Step 4: Normalize identity, body inheritance, layers, and credits**

Expand every effective body-type list in registry order, reject broadening during parsing, translate complete credit sources into `AssetPackCreditRecord` values, retain source declaration index for layer tie-breaking, and make `assetPackContentProjection` recursively key-sorted while omitting only the top-level acknowledgement array.

- [x] **Step 5: Export interfaces and verify GREEN**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
```

Expected: PASS.

- [x] **Step 6: Commit product code**

```sh
rtk git add packages/core/src/asset-pack-schema.ts packages/core/src/asset-pack-model.ts packages/core/src/index.ts packages/core/test/asset-pack-schema.test.ts
rtk git commit -m "feat(core): define artist asset pack schema"
```

Then update this task's plan record and commit it separately.

Task 1 record:

- Implementation: Added strict v1 source parsing, deterministic path-ordered diagnostics, normalized identity/body/layer/credit models, and acknowledgement-free canonical content projection. Reviewer-required ordering regressions were fixed in follow-up product commits.
- Product commits: `04e65abd3b7c0e101cff807f4cd67cd39dae91b3`, `7e68f48f1b4ac55debd61b8eaed731ec233e53ce`, `af2ee58eb2c010470895bd9cfbce8589896c7b21`, `fcb75b52cd9b1ecdcf87ea03c1342455ae811938`.
- Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts` PASS (20/20 after final fix); `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS; `rtk pnpm check:boundaries` PASS; reviewer re-review APPROVED.

---

### Task 2: Add pure geometry, pixel-result, and acknowledgement validation

**Files:**
- Create: `packages/core/src/asset-pack-validation.ts`
- Create: `packages/core/test/asset-pack-validation.test.ts`
- Modify: `packages/core/src/asset-animation-audit.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing geometry and acknowledgement tests**

Test exact `walk` and `climb` cropped PNG dimensions from `ANIMATION_CONFIGS`, required versus optional transparent cells, registered type/animation/body/material/palette/variant checks, missing/decode errors, multi-layer mismatch, inferred-path warning, partial coverage warnings, and stale acknowledgements.

```ts
it('keeps an acknowledgement stable when only acknowledgements change', () => {
  const before = assetPackContentProjection(normalizeAssetPack(source));
  const after = assetPackContentProjection(normalizeAssetPack({
    ...source,
    acknowledgements: [acknowledgement],
  }));
  expect(after).toEqual(before);
});

it('invalidates an acknowledgement after a sprite digest changes', () => {
  const result = validateAssetPack({
    ...fixtureOptions,
    contentDigest: 'sha256:changed',
  });
  expect(result.ok).toBe(false);
  expect(result.acknowledgementRecords).toContainEqual(
    expect.objectContaining({ code: 'asset_path_inferred', contentDigest: 'sha256:changed' }),
  );
});
```

- [x] **Step 2: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts
```

Expected: FAIL because validation and exported geometry do not exist.

- [x] **Step 3: Export the existing standard geometry calculator**

Rename the private helper in `asset-animation-audit.ts` to exported `standardAnimationGeometry`; keep audit plan output byte-for-byte equivalent and add no second animation table.

- [x] **Step 4: Implement pure validation over injected inspections**

Compute expected width as `(largest referenced source column + 1) * frameSize` and height as `rows.length * frameSize`. Match cells by stable key `<row>:<column>`. Emit the approved error/warning codes and an acknowledgement template containing the exact code, structured subject, and content digest. The template leaves `reason` empty for the artist; schema validation rejects it until the artist supplies a non-empty explanation.

Warnings without a matching persisted non-empty-reason acknowledgement make `ok: false`; acknowledged warnings remain in `diagnostics` but no longer block. Errors always block.

- [x] **Step 5: Verify audit regression and GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts asset-animation-audit.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
```

Expected: PASS, including unchanged animation-audit tests.

- [x] **Step 6: Commit product code**

```sh
rtk git add packages/core/src/asset-pack-validation.ts packages/core/src/asset-animation-audit.ts packages/core/src/index.ts packages/core/test/asset-pack-validation.test.ts
rtk git commit -m "feat(core): validate artist asset pack sources"
```

Then update this task's plan record and commit it separately.

Task 2 record:

- Implementation: Added pure registered-geometry/pixel-result validation, warning acknowledgement templates and blocking, digest stability/invalidation behavior, and the exported shared animation geometry helper without duplicating the audit table.
- Product commit: `7cb1aacf5ca5a77184b618291597f51079951c3`.
- Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts` PASS (20/20 RED/GREEN cycle); `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-validation.test.ts asset-animation-audit.test.ts` PASS; `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS; `rtk pnpm check:boundaries` PASS; reviewer APPROVED.

---

### Task 3: Compile deterministic new items and physical consumers in Core

**Files:**
- Create: `packages/core/src/asset-pack-compile.ts`
- Create: `packages/core/test/asset-pack-compile.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing new-item compile tests**

Assert namespaced definition path/basename/name, `display_name`, type, animations, `layer_N` assignment, effective body groups, generated sprite destinations, recolor preservation, full-file credit override, shared-source consumer aggregation, and deterministic ordering independent of input pack order.

```ts
expect(plan.definitions[0]).toMatchObject({
  logicalPath: 'sheet_definitions/hair/acme.fantasy-hair--moon-braid.json',
  definition: {
    name: 'acme.fantasy-hair--moon-braid',
    display_name: 'Moon Braid',
    type_name: 'hair',
  },
});
expect(plan.sprites[0].destinationPath).toBe(
  'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/climb.png',
);
```

- [ ] **Step 2: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-compile.test.ts
```

Expected: FAIL because the compiler does not exist.

- [ ] **Step 3: Implement new-item compile planning**

Build immutable JSON definitions and copy operations only; Core must not read or write files. Sort packs/assets/layers/sprites, aggregate one physical source/destination with all consumers, and emit `asset_path_conflict` rather than choosing a winner.

```ts
export function compileAssetPacks(options: CompileAssetPacksOptions): AssetPackCompilePlan {
  const state = createCompileState(options.baseline);
  for (const pack of [...options.packs].sort(comparePackIdentity)) {
    for (const asset of [...pack.assets].sort(compareAssetIdentity)) {
      compileAsset(state, pack, asset);
    }
  }
  return finalizeCompileState(state);
}
```

- [ ] **Step 4: Verify GREEN and boundaries**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-compile.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 5: Commit product code**

```sh
rtk git add packages/core/src/asset-pack-compile.ts packages/core/src/index.ts packages/core/test/asset-pack-compile.test.ts
rtk git commit -m "feat(core): compile namespaced artist assets"
```

Then update this task's plan record and commit it separately.

---

### Task 4: Compile existing-item patches, inherited credits, and conflicts

**Files:**
- Modify: `packages/core/src/asset-pack-compile.ts`
- Modify: `packages/core/test/asset-pack-compile.test.ts`

- [ ] **Step 1: Add failing extension and conflict tests**

Cover baseline definition/credit digest success and drift, exact/inferred/manual-review destinations, added animation name, body/layer patch, deterministic union of baseline and contribution credits, a contribution override that cannot erase inherited credit, two disjoint patches, same semantic field conflict, same destination conflict, exact authorized cross-pack replacement, and unauthorized base replacement.

```ts
it('merges disjoint patches but rejects two owners of one destination', () => {
  const merged = compileAssetPacks({ baseline, packs: [childClimb, adultClimb] });
  expect(merged.diagnostics).not.toContainEqual(
    expect.objectContaining({ code: 'asset_path_conflict' }),
  );

  const conflicted = compileAssetPacks({ baseline, packs: [childClimb, otherChildClimb] });
  expect(conflicted.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'asset_path_conflict', severity: 'error' }),
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-compile.test.ts
```

Expected: FAIL on extension assertions.

- [ ] **Step 3: Implement deterministic patch merge and credit union**

Exclude manager-generated definitions from the supplied baseline. Verify both digests before applying a delta. Merge extensions by semantic target `(itemId, layer, bodyType, animation, variant)` and physical destination. Write one final definition at the baseline item ID and retain the baseline `name`/selection identity.

Credit union order is baseline record order followed by pack-ID order; arrays deduplicate exact strings while notes concatenate non-empty unique paragraphs. A file override substitutes only the pack contribution before union.

- [ ] **Step 4: Implement exact replacement checks**

Support only the source schema's comparator grammar (`<`, `<=`, `=`, `>=`, `>` joined by spaces) and exact pack/asset ownership. Reject malformed ranges in schema parsing and all replacement scope mismatches with `asset_replacement_unauthorized`.

- [ ] **Step 5: Verify full Core asset-pack suite**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts asset-pack-validation.test.ts asset-pack-compile.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 6: Commit product code**

```sh
rtk git add packages/core/src/asset-pack-compile.ts packages/core/test/asset-pack-compile.test.ts packages/core/src/asset-pack-schema.ts packages/core/test/asset-pack-schema.test.ts
rtk git commit -m "feat(core): merge attributed asset extensions"
```

Then update this task's plan record and commit it separately.

---

### Task 5: Create and safely discover standalone artist workspaces

**Files:**
- Create: `packages/cli/src/asset-workspace.ts`
- Create: `packages/cli/test/asset-workspace.test.ts`

- [ ] **Step 1: Write failing workspace tests**

Use fresh temporary directories to cover explicit initialization, upward discovery, `--workspace` resolution, idempotent re-open of an unchanged workspace, refusal when the target marker already contains an unknown schema, refusal of a non-empty unowned `assets_custom/`, creation of an empty owned output root, and no writes outside the requested target.

```ts
expect(initializeAssetWorkspace(target)).toMatchObject({
  root: target,
  packsRoot: path.join(target, 'artist-packs'),
  outputRoot: path.join(target, 'assets_custom'),
  stateRoot: path.join(target, '.lpc-toolkit', 'asset-packs'),
});
expect(JSON.parse(readFileSync(path.join(target, 'lpc-asset-workspace.json'), 'utf8')))
  .toMatchObject({ schema: 'lpc-toolkit.asset-workspace.v1' });
```

- [ ] **Step 2: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-workspace.test.ts
```

Expected: FAIL because `asset-workspace.ts` does not exist.

- [ ] **Step 3: Implement config, marker, and discovery**

Write this normalized config and no optional fields in v1:

```json
{
  "schema": "lpc-toolkit.asset-workspace.v1",
  "packsDirectory": "artist-packs",
  "outputDirectory": "assets_custom",
  "stateDirectory": ".lpc-toolkit/asset-packs"
}
```

Write an output marker named `.lpc-toolkit-managed.json` with schema and a generated workspace ID. Resolve relative configured paths inside the workspace only. Walk parents only for implicit discovery; an explicit path must resolve directly to a valid config and must not fall back.

- [ ] **Step 4: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-workspace.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit product code**

```sh
rtk git add packages/cli/src/asset-workspace.ts packages/cli/test/asset-workspace.test.ts
rtk git commit -m "feat(cli): initialize artist asset workspaces"
```

Then update this task's plan record and commit it separately.

---

### Task 6: Read pack sources safely and scaffold new or audit-derived packs

**Files:**
- Create: `packages/cli/src/asset-pack-files.ts`
- Create: `packages/cli/src/asset-pack-scaffold.ts`
- Create: `packages/cli/test/asset-pack-files.test.ts`
- Create: `packages/cli/test/asset-pack-scaffold.test.ts`

- [ ] **Step 1: Write failing safe-read and digest tests**

Cover manifest JSON errors, Core schema errors, missing source files, symlink escape, non-regular files, duplicate canonical source paths, stable SHA-256 despite source manifest property order, digest change after substantive manifest or PNG change, and digest stability after acknowledgement-only changes. Assert that validate-style loads do not change manifest bytes or mtime.

- [ ] **Step 2: Write failing scaffold tests**

Define exact CLI-independent request types and test:

```ts
export interface NewAssetPackScaffoldRequest {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly localId: string;
  readonly typeName: string;
  readonly bodyTypes: readonly string[];
  readonly animations: readonly string[];
  readonly credits: AssetPackCreditSource;
  readonly advanced: boolean;
  readonly outputDirectory: string;
}

export interface AuditAssetPackScaffoldRequest {
  readonly reportPath: string;
  readonly itemIds: readonly string[];
  readonly typeNames: readonly string[];
  readonly animations: readonly string[];
  readonly bodyTypes: readonly string[];
  readonly pack: Omit<NewAssetPackScaffoldRequest, 'localId' | 'typeName' | 'bodyTypes' | 'animations' | 'advanced'>;
}
```

Simple new scaffolds have one `foreground` layer and no recolor; advanced scaffolds include commented documentation only in a sibling `README.md`, while `asset-pack.json` remains valid strict JSON with explicit optional example fields removed until chosen.

For audit input, require a successful `catalog audit-animations` JSON envelope, exact command, complete `target`, `scope`, `unsupported`, `missingFiles`, `blankFrames`, and `errors` arrays. Require at least one `--item` or `--type`; optional animation/body filters narrow further. Fail if the selection matches no scaffoldable finding.

Assert:

- exact `missingFiles.path` becomes `audit-exact` with `accepted: true`;
- inferred `unsupported.requirements.expectedPath` becomes `audit-inferred` with `accepted: false` and preserves confidence/consumers;
- manual-review unsupported produces `finding_not_scaffoldable_v1` and no invented destination;
- every selected `blankFrames` finding produces `finding_not_scaffoldable_v1`;
- report `errors` remain report context and never become sprite tasks;
- runtime recolor names remain consumer metadata and never become source entries;
- a shared destination/source task retains all consumers;
- baseline definition and credit digests are copied from the active baseline values supplied to the scaffold function.

If any selected finding is `manual-review`, `blankFrames`, or otherwise non-scaffoldable, abort before publication and return all `finding_not_scaffoldable_v1` diagnostics; never publish a partial pack beside unresolved selected work.

- [ ] **Step 3: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-files.test.ts asset-pack-scaffold.test.ts
```

Expected: FAIL because both modules do not exist.

- [ ] **Step 4: Implement safe source reading and hashing**

Use `node:crypto` SHA-256 and the Core content projection. Resolve and canonicalize every source inside the pack root; accept only regular files. Hash sources in normalized source-path order, then hash one canonical value containing the content projection plus `{ sourcePath, digest }` pairs.

```ts
const contentDigest = sha256Json({
  manifest: assetPackContentProjection(normalized),
  sources: [...sourceDigests].map(([sourcePath, digest]) => ({ sourcePath, digest })),
});
```

- [ ] **Step 5: Implement atomic scaffold publication**

Build the complete new pack in a sibling temporary directory, then rename into a path that must not already exist. Create referenced sprite parent directories but no blank PNGs. Default output is `<workspace>/artist-packs/<pack-id>`; explicit `--out` remains inside the workspace `packsRoot` in Phase 1.

- [ ] **Step 6: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-files.test.ts asset-pack-scaffold.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit product code**

```sh
rtk git add packages/cli/src/asset-pack-files.ts packages/cli/src/asset-pack-scaffold.ts packages/cli/test/asset-pack-files.test.ts packages/cli/test/asset-pack-scaffold.test.ts
rtk git commit -m "feat(cli): scaffold artist asset pack sources"
```

Then update this task's plan record and commit it separately.

---

### Task 7: Inspect PNGs and validate packs against the active baseline

**Files:**
- Create: `packages/cli/src/asset-pack-validation.ts`
- Create: `packages/cli/test/asset-pack-validation.test.ts`
- Modify: `packages/cli/src/node-canvas-adapter.ts` only if a small existing decode helper must be exported

- [ ] **Step 1: Write failing PNG inspection tests**

Generate small canvases with the existing test canvas helper; do not check in large binary fixtures. Cover exact `climb` dimensions, a wrong dimension, one required transparent cell, optional transparent padding, corrupt bytes, missing files, recolor ramp presence/absence, and two layers with incompatible geometry.

- [ ] **Step 2: Write failing baseline integration tests**

Use a tiny attributed base fixture with catalog/palette records to assert normalized definition and credit digests, existing-item drift, registered references, missing acknowledgement, accepted acknowledgement, and JSON-safe diagnostic details. Also assert no write occurs below `runtime.context.assetsRoot` or the runtime store/cache.

- [ ] **Step 3: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-validation.test.ts
```

Expected: FAIL because CLI validation orchestration does not exist.

- [ ] **Step 4: Implement bounded pixel inspection**

Decode through the existing Node canvas adapter. Reject unexpected dimensions before allocating any additional full-sheet buffer. Scan only geometry cells; represent nontransparent cells by `<row>:<column>` and unique opaque RGB colors by lowercase hex. Inspect at fixed concurrency `4` with deterministic result ordering and no public concurrency flag.

- [ ] **Step 5: Implement baseline and Core orchestration**

Load catalog and palettes from the active base while excluding this workspace's manager-owned generated output from baseline digest input. Phase 1 does not adopt an unowned custom root. Canonicalize definitions and item credits with the same CLI SHA helper. Return:

```ts
export interface AssetPackValidationReport {
  readonly schema: 'lpc-toolkit.asset-pack-validation.v1';
  readonly packId?: string;
  readonly packDirectory: string;
  readonly contentDigest?: string;
  readonly valid: boolean;
  readonly diagnostics: readonly AssetPackDiagnostic[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
}
```

Core parse failures use the same report rather than throwing unstructured errors. Fatal filesystem/runtime failures become the existing failed CLI response envelope in Task 11.

- [ ] **Step 6: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 7: Commit product code**

```sh
rtk git add packages/cli/src/asset-pack-validation.ts packages/cli/test/asset-pack-validation.test.ts packages/cli/src/node-canvas-adapter.ts
rtk git commit -m "feat(cli): validate artist sprite sources"
```

Omit `node-canvas-adapter.ts` from `git add` if no change was needed. Then update this task's plan record and commit it separately.

---

### Task 8: Add compiler-authorized overlay loading over directory and ZIP stores

**Files:**
- Create: `packages/cli/src/asset-overlay-store.ts`
- Create: `packages/cli/test/asset-overlay-store.test.ts`
- Modify: `packages/cli/src/asset-store.ts`
- Modify: `packages/cli/src/runtime-assets.ts`
- Modify: `packages/cli/test/asset-store.test.ts`

- [ ] **Step 1: Write failing logical-path and overlay tests**

Add a source-to-logical-path contract to both current stores and test absolute directory sources, `lpc-asset:` ZIP sources, malformed sources, authorized overlay hit, unauthorized file ignored, base fallback, overlay missing despite authorized mapping, symlink escape, and overlay paths that cannot shadow base unless present in the compiler's authorized list.

```ts
const overlay = createOverlayAssetStore({
  base,
  overlayRoot,
  logicalPaths: ['spritesheets/packages/acme/hair/foreground/male/climb.png'],
});
expect(await overlay.load(`${base.baseUrl}/spritesheets/packages/acme/hair/foreground/male/climb.png`))
  .toEqual(path.join(overlayRoot, 'spritesheets/packages/acme/hair/foreground/male/climb.png'));
```

- [ ] **Step 2: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-store.test.ts asset-overlay-store.test.ts
```

Expected: FAIL because the store cannot expose logical sources or overlay resolution.

- [ ] **Step 3: Extend the internal AssetStore contract**

Add `kind: 'directory' | 'zip' | 'overlay'` and `logicalPath(sourcePath): string | undefined`. Preserve `baseUrl` exactly from the wrapped base store so Core composition continues to generate source URLs the same way. Overlay `has` and `load` consult only the explicit logical-path set, then delegate to base.

- [ ] **Step 4: Add runtime wrapping without changing base preparation**

Add a pure constructor that takes already prepared `RuntimeAssets`, a custom sheet-definition root, and overlay mapping; it returns a new runtime context/store without mutating the original. Do not make ordinary CLI commands discover artist workspaces.

- [ ] **Step 5: Verify GREEN and existing render paths**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-store.test.ts asset-overlay-store.test.ts preview.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit product code**

```sh
rtk git add packages/cli/src/asset-overlay-store.ts packages/cli/src/asset-store.ts packages/cli/src/runtime-assets.ts packages/cli/test/asset-overlay-store.test.ts packages/cli/test/asset-store.test.ts
rtk git commit -m "feat(cli): load compiled artist asset overlays"
```

Then update this task's plan record and commit it separately.

---

### Task 9: Synchronize all linked packs with ownership and rollback guarantees

**Files:**
- Create: `packages/cli/src/asset-pack-sync.ts`
- Create: `packages/cli/test/asset-pack-sync.test.ts`

- [ ] **Step 1: Write failing desired-state registry tests**

Define the Phase 1 registry record:

```ts
export interface LinkedAssetPackRegistryEntry {
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
```

Test first sync, second linked pack preserving the first, re-sync after source change, same pack ID changing its link target, removed source failure without deletion, deterministic registry/output, disjoint extension merge, true conflict, unacknowledged warning, unowned output refusal, marker mismatch, and no writes to base/cache/upstream sentinels.

- [ ] **Step 2: Write failing publication rollback tests**

Inject `AssetPublicationFileOps` and fail each publish rename/write point. Assert the previous `assets_custom/` bytes and `registry.json` bytes are restored exactly, staging/backup cleanup is confined to manager state, and artist source remains untouched.

- [ ] **Step 3: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-sync.test.ts
```

Expected: FAIL because linked sync does not exist.

- [ ] **Step 4: Implement complete desired-state compilation**

Read every current linked registry entry plus the requested pack, validate each source fresh, replace the same pack ID entry with the requested link, sort by pack ID, compile once against the active baseline, and stop before staging on any error or unacknowledged warning.

Materialize compiler output only below a newly created staging generation. Copy source PNG bytes to their planned logical destinations, write recursively key-sorted definitions, write deterministic `CREDITS.csv`, and include the workspace marker in the staged root.

- [ ] **Step 5: Implement rollback-safe publication**

Preflight all paths. Rename current output and registry to manager-state backups, rename staged output and staged registry into place, then remove backups. On any caught error, remove only newly published manager-owned paths and rename backups back. If rollback itself fails, return `asset_publish_failed` with both errors and retain all recovery paths; do not guess or delete further. Persistent crash recovery remains Phase 2.

- [ ] **Step 6: Verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-sync.test.ts asset-workspace.test.ts asset-pack-validation.test.ts asset-overlay-store.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 7: Commit product code**

```sh
rtk git add packages/cli/src/asset-pack-sync.ts packages/cli/test/asset-pack-sync.test.ts
rtk git commit -m "feat(cli): sync linked artist asset packs"
```

Then update this task's plan record and commit it separately.

---

### Task 10: Render attributed previews from a temporary desired-state overlay

**Files:**
- Create: `packages/cli/src/asset-pack-preview.ts`
- Create: `packages/cli/test/asset-pack-preview.test.ts`
- Modify: `packages/cli/src/preview.ts` only if a narrow output option must be shared

- [ ] **Step 1: Write failing default preview tests**

Use a valid small attributed pack plus baseline fixture. Assert preview validates fresh, compiles the current linked desired state with the target pack transiently replacing its registered version, selects the requested or first stable local asset, materializes the existing `farmer` preset against the compiled catalog, replaces that asset's type slot, uses requested/default body and animation, and writes PNG/TXT/CSV/metadata under `<pack>/previews/<asset-id>/`.

Assert metadata and both credit files contain the pack contribution; an existing-item extension also contains inherited base attribution.

- [ ] **Step 2: Write failing supplied-character and non-mutation tests**

Test `--character <selection.json>` keeps every supplied slot except the previewed asset's type, reports an incompatible body/animation, leaves active `assets_custom/` and registry byte-identical, and deletes the temporary validation overlay after success or failure.

- [ ] **Step 3: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-preview.test.ts
```

Expected: FAIL because asset-pack preview does not exist.

- [ ] **Step 4: Implement transient compile and selection construction**

Reuse sync's desired-state read/validate/compile helper but materialize under `.lpc-toolkit/asset-packs/validation/<content-digest>/` and never publish it. Wrap runtime with `createOverlayAssetStore`, load compiled catalog/palettes, call `materializePreset('farmer', { catalog, palettes })` when no character is supplied, then set the target item by internal namespaced or preserved baseline `name`.

- [ ] **Step 5: Reuse existing attributed preview publication**

Call `renderCharacterPreview`; do not write a second renderer or credits formatter. Add only the minimum option to `preview.ts` needed for an explicit authoring output path. Return its artifact list and warnings in `AssetPackPreviewResult`.

- [ ] **Step 6: Verify GREEN and preview regression**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-preview.test.ts preview.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit product code**

```sh
rtk git add packages/cli/src/asset-pack-preview.ts packages/cli/test/asset-pack-preview.test.ts packages/cli/src/preview.ts
rtk git commit -m "feat(cli): preview attributed artist assets"
```

Omit `preview.ts` from `git add` if unchanged. Then update this task's plan record and commit it separately.

---

### Task 11: Wire the Phase 1 CLI command tree and response envelopes

**Files:**
- Create: `packages/cli/src/asset-commands.ts`
- Modify: `packages/cli/src/args.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/test/args.test.ts`
- Modify: `packages/cli/test/command-spec.test.ts`
- Modify: `packages/cli/test/main-assets.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

- [ ] **Step 1: Write failing three-token parser and help tests**

Make only `asset workspace init` consume three command tokens; keep all existing two-token commands and positionals unchanged. Add `new` and `advanced` to boolean flags. Define root `asset`, group `asset workspace`, and all six leaf specs with exact options/examples.

Required scaffold options:

```text
--workspace <directory>
--out <directory>
--pack-id <id>
--version <semver>                 default: 0.1.0
--display-name <label>
--author <name>                    repeatable
--license <license>                repeatable
--url <url>                        repeatable
--notes <text>
```

`--new` additionally requires `--asset-id`, `--type`, at least one `--body-type`, and at least one `--animation`; `--advanced` is optional. `--from-audit <report>` requires at least one repeatable `--item` or `--type`; repeatable `--animation` and `--body-type` narrow selection. The two modes are mutually exclusive.

Preview options are `--workspace`, `--asset`, `--animation`, `--body-type`, and `--character`. Validate/sync accept `--workspace`. Every leaf accepts `--json` and `--help`.

- [ ] **Step 2: Write failing asset-preparation tests**

Assert root/group/leaf help and `asset workspace init` do not call `prepareRuntimeAssets`; successful workspace init also needs no cache. Assert init-from-audit/new, validate, preview, and sync discover the workspace before preparation and call prepare with `{ cwd: workspace.root, managedCacheOnly: true }`. Invalid command input must fail before preparing assets.

- [ ] **Step 3: Write failing JSON and human response tests**

JSON uses existing `CliResponse` envelopes and exactly these command names:

```text
asset workspace init
asset init
asset validate
asset preview
asset sync
```

Validation findings remain a completed command response with `data.valid: false`; `runCli` still exits `1` for `asset validate` when `valid` is false so shell automation fails correctly. Fatal input/runtime failures use `ok: false`. Human validation prints grouped Errors, Warnings, and exact acknowledgement JSON. Preview prints artifact paths and credit paths. Sync prints pack ID, content digest, generated-file count, and workspace output path. Machine JSON stays on stdout; progress and non-JSON human diagnostics use stderr consistently with existing main behavior.

- [ ] **Step 4: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-assets.test.ts main-json.test.ts main-human.test.ts
```

Expected: FAIL because the asset commands and parser depth do not exist.

- [ ] **Step 5: Implement parser and preflight without introducing a command-spec cycle**

Use a local depth rule in `args.ts`:

```ts
function acceptsAnotherCommandToken(command: readonly string[]): boolean {
  if (command.length < 2) return true;
  return command.length === 2 && command[0] === 'asset' && command[1] === 'workspace';
}
```

In `asset-commands.ts`, convert flag values into the request types from Tasks 6–10, validate mutually exclusive modes and required flags, and return structured `CliIssue` values rather than throwing for user input.

- [ ] **Step 6: Implement workspace-aware main dispatch**

Handle asset root/group help and workspace initialization before runtime preparation. For remaining valid asset leaves, resolve workspace, prepare base runtime at workspace root, then dispatch with both. Do not alter asset behavior of non-asset commands.

- [ ] **Step 7: Implement human formatters and verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-assets.test.ts main-json.test.ts main-human.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli build
```

Expected: PASS.

- [ ] **Step 8: Commit product code**

```sh
rtk git add packages/cli/src/asset-commands.ts packages/cli/src/args.ts packages/cli/src/command-spec.ts packages/cli/src/main.ts packages/cli/src/response.ts packages/cli/test/args.test.ts packages/cli/test/command-spec.test.ts packages/cli/test/main-assets.test.ts packages/cli/test/main-json.test.ts packages/cli/test/main-human.test.ts
rtk git commit -m "feat(cli): expose local artist asset workflow"
```

Then update this task's plan record and commit it separately.

---

### Task 12: Document, package-smoke, and verify the no-repository workflow

**Files:**
- Modify: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `packages/web/test/landing-page.test.tsx`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ENGINEERING.md`
- Modify: this plan's CLI Documentation Impact matrix if reassessment changes it

- [ ] **Step 1: Extend the packed-CLI smoke test before docs**

From the packed tarball installed into an isolated temporary consumer directory, run `asset workspace init`, assert the complete workspace layout/marker/config, assert no repository `.git` or `assets/` directory is required, and assert no cache/network preparation hook is reached. Keep the existing package smoke cases.

- [ ] **Step 2: Add a focused no-repository integration acceptance**

In CLI Vitest, simulate a clean artist directory with injected prepared runtime assets and execute through `runCli`:

```text
workspace init
-> scaffold one new hair item
-> scaffold hair_messy climb from a complete audit JSON report
-> place complete attributed climb PNG fixtures below each pack sprites/
-> validate both
-> preview default body
-> preview supplied character JSON
-> sync first pack
-> sync second pack without damaging first
-> render a selection through the compiled overlay with base and custom credits
```

Add this acceptance to `packages/cli/test/asset-authoring-e2e.test.ts`. Re-run the same-scope audit planner against the compiled catalog and assert the selected unsupported/missing requirement is absent. Assert all writes stay under the artist workspace and preview destinations.

- [ ] **Step 3: Run smoke/acceptance and verify RED if documentation strings are not yet present**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
```

Expected before completing this task: CLI acceptance/package checks pass after the smoke additions; landing test fails on the not-yet-documented artist workflow.

- [ ] **Step 4: Update help-adjacent public documentation**

In `packages/cli/README.md`, document every Phase 1 command and option, upward/explicit workspace resolution, exact source/output layout, PNG location, managed cache behavior, complete-PNG rule, audit finding behavior, acknowledgement workflow, ownership refusal, atomic in-process rollback, stdout/stderr/exit semantics, and Phase 2 exclusions.

In root README and landing page, show this concise public-CLI-only path in order:

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit asset workspace init ./my-lpc-art
cd ./my-lpc-art
lpc-toolkit asset init --new --pack-id acme.fantasy-hair --asset-id moon-braid --display-name "Moon Braid" --type hair --body-type male --body-type female --animation walk --animation climb --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/fantasy-hair
lpc-toolkit asset validate ./artist-packs/<pack-id>
lpc-toolkit asset preview ./artist-packs/<pack-id>
lpc-toolkit asset sync ./artist-packs/<pack-id>
```

State explicitly that PNGs belong under `artist-packs/<pack-id>/sprites/` and cloning this repository is unnecessary.

- [ ] **Step 5: Update architecture and engineering contracts**

Architecture must document schema ownership, baseline exclusion of manager output, pack-to-compile flow, registry/overlay ownership, overlay store injection, selection identity, attribution path, rollback boundary, and Phase 2/3 deferrals. Engineering must list the three focused Core tests, seven focused CLI modules, e2e/package smoke, landing test, `check:boundaries`, conditional package test, and `rtk pnpm verify` mapping.

- [ ] **Step 6: Reassess the mandatory CLI documentation matrix**

Record `update` or `N/A — reason` for all eight surfaces. Expected final result remains:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: N/A — no npm publication or pinned base-asset publication procedure changes
plugin: N/A — the current audit skill is read-only and authoring-skill design is deferred
```

- [ ] **Step 7: Run focused documentation, acceptance, and package checks**

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-e2e.test.ts
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

Expected: PASS. If a check fails, fix the implementation or explicitly amend this approved plan; do not weaken a gate.

- [ ] **Step 9: Inspect the final diff and ownership boundaries**

```sh
rtk git status --short
rtk git diff --check
rtk git diff --stat
rtk git diff -- packages/core packages/cli README.md packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx docs/ARCHITECTURE.md docs/ENGINEERING.md
```

Expected: only planned files, no `upstream/`, cache, generated artist workspace, or unrelated user changes; `git diff --check` emits no output.

- [ ] **Step 10: Commit product documentation and acceptance**

```sh
rtk git add packages/cli/scripts/smoke-packed-cli.mjs packages/cli/test/asset-authoring-e2e.test.ts packages/cli/README.md README.md packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx docs/ARCHITECTURE.md docs/ENGINEERING.md
rtk git commit -m "docs: publish artist asset authoring workflow"
```

Then update this task's plan record with the full verification evidence and commit it separately.

## Final Handoff Evidence

Before claiming Phase 1 complete, the implementation handoff must include:

- branch name and full product commit hashes;
- the final CLI documentation matrix and PR declaration;
- exact PASS output summaries for every Task 12 Step 8 command;
- an explicit statement that no dependency, `any`, `upstream/`, base asset, or managed-cache mutation was introduced;
- the packed-CLI no-repository workspace-init evidence;
- the end-to-end new-item plus `hair_messy` climb extension evidence;
- preview artifact paths and proof that both base and pack credits are present;
- linked sync/re-sync, conflict, unowned output, and rollback test evidence;
- deferred Phase 2/3 scope restated so distribution commands are not implied complete.
