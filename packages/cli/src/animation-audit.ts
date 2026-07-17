import type {
  AnimationAuditConsumer,
  AnimationAuditGeometry,
  AnimationName,
  AssetAnimationAuditPlan,
  BodyType,
  CanvasAdapter,
  Catalog,
  PlannedAnimationAsset,
  TypeName,
  UnsupportedAnimationFinding,
} from '@lpc-toolkit/core';
import {
  ANIMATIONS,
  BODY_TYPES,
  planAssetAnimationAudit,
} from '@lpc-toolkit/core';
import { flagString, flagStrings, type ParsedArgs } from './args.js';
import { AssetStoreError, type AssetStore } from './asset-store.js';
import { editDistance } from './catalog-discovery.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { createNodeCanvasAdapter } from './node-canvas-adapter.js';
import { commandError, commandOk, type CliIssue, type CliResponse } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';

type Direction = NonNullable<AnimationAuditGeometry['rows'][number]['direction']>;

export interface MissingAnimationFileFinding {
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface BlankAnimationFrame {
  readonly sourceColumn: number;
  readonly logicalFrameIndices: readonly number[];
}

export interface BlankAnimationFramesFinding {
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly frames: readonly BlankAnimationFrame[];
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface AnimationAuditInspectionError {
  readonly kind:
    | 'asset_read_failed'
    | 'image_decode_failed'
    | 'path_resolution_requires_selection';
  readonly message: string;
  readonly path?: string;
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface AssetAnimationAuditReport {
  readonly targets: readonly AnimationName[];
  readonly scope: { readonly typeName?: TypeName; readonly bodyType?: BodyType };
  readonly summary: {
    readonly itemsScanned: number;
    readonly incompleteItems: number;
    readonly unsupported: number;
    readonly missingFiles: number;
    readonly blankFrames: number;
    readonly errors: number;
  };
  readonly unsupported: readonly UnsupportedAnimationFinding[];
  readonly missingFiles: readonly MissingAnimationFileFinding[];
  readonly blankFrames: readonly BlankAnimationFramesFinding[];
  readonly errors: readonly AnimationAuditInspectionError[];
}

export interface InspectAssetAnimationPlanOptions {
  readonly store: AssetStore;
  readonly adapter: CanvasAdapter;
  readonly scope?: { readonly typeName?: TypeName; readonly bodyType?: BodyType };
  readonly concurrency?: number;
}

interface IndexedAsset {
  readonly index: number;
  readonly asset: PlannedAnimationAsset;
}

interface InspectionGroup {
  readonly path: string;
  readonly assets: readonly IndexedAsset[];
}

interface AssetInspectionResult {
  readonly missingFiles: readonly MissingAnimationFileFinding[];
  readonly blankFrames: readonly BlankAnimationFramesFinding[];
}

interface GroupInspectionResult {
  readonly results: readonly { readonly index: number; readonly result: AssetInspectionResult }[];
  readonly error?: AnimationAuditInspectionError;
}

const FILESYSTEM_ERROR_CODE = /^E(?!RR_)[A-Z0-9_]+$/u;

export interface AnimationAuditInput {
  readonly targets: readonly string[];
  readonly typeName?: string;
  readonly bodyType?: string;
}

function domainIssue(
  code: string,
  domainName: string,
  value: string,
  candidates: readonly string[],
): CliIssue {
  const sorted = [...new Set(candidates)].sort((left, right) => left.localeCompare(right));
  const suggestions = sorted
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .sort((left, right) => left.distance - right.distance
      || left.candidate.localeCompare(right.candidate))
    .slice(0, 5)
    .map(({ candidate }) => candidate);
  return {
    code,
    message: `Unknown ${domainName}: ${value}`,
    path: value,
    details: { available: sorted.slice(0, 10), suggestions },
  };
}

export function auditInputIssue(
  catalog: Catalog,
  input: AnimationAuditInput,
): CliIssue | undefined {
  const standardAnimations = ANIMATIONS.map(({ value }) => value);
  const invalidAnimation = input.targets.find((target) => !standardAnimations.includes(target));
  if (invalidAnimation) {
    return domainIssue('unknown_animation', 'animation', invalidAnimation, standardAnimations);
  }
  if (input.typeName !== undefined && !catalog.typeNames.includes(input.typeName)) {
    return domainIssue('unknown_type_name', 'type name', input.typeName, catalog.typeNames);
  }
  if (input.bodyType !== undefined && !(BODY_TYPES as readonly string[]).includes(input.bodyType)) {
    return domainIssue('body_type_invalid', 'body type', input.bodyType, BODY_TYPES);
  }
  return undefined;
}

export async function runAnimationAuditCommand(
  parsed: ParsedArgs,
  runtime: RuntimeAssets,
): Promise<CliResponse<AssetAnimationAuditReport>> {
  try {
    const targets = flagStrings(parsed.flags, 'animation');
    const typeName = flagString(parsed.flags, 'type');
    const bodyType = flagString(parsed.flags, 'body-type');
    const loaded = loadCatalogFromRoots(
      runtime.context.sheetDefinitionsRoot,
      runtime.context.customSheetDefinitionsRoot,
    );
    const palettes = loadPalettesFromRoot(runtime.context.paletteDefinitionsRoot);
    const warnings = [...loaded.warnings, ...palettes.warnings];
    const issue = auditInputIssue(loaded.catalog, {
      targets,
      ...(typeName !== undefined ? { typeName } : {}),
      ...(bodyType !== undefined ? { bodyType } : {}),
    });
    if (issue) return {
      ...commandError('catalog audit-animations', issue, warnings),
      data: null,
    };

    const plan = planAssetAnimationAudit({
      catalog: loaded.catalog,
      palettes: palettes.palettes,
      targets,
      ...(typeName !== undefined ? { typeName } : {}),
      ...(bodyType !== undefined ? { bodyType } : {}),
    });
    const report = await inspectAssetAnimationPlan(plan, {
      store: runtime.store,
      adapter: createNodeCanvasAdapter({ assetStore: runtime.store }),
      scope: {
        ...(typeName !== undefined ? { typeName } : {}),
        ...(bodyType !== undefined ? { bodyType } : {}),
      },
    });
    return commandOk('catalog audit-animations', report, warnings);
  } catch (error) {
    return {
      ...commandError('catalog audit-animations', {
        code: 'animation_audit_failed',
        message: error instanceof Error ? error.message : 'Animation audit failed.',
      }),
      data: null,
    };
  }
}

function storeSource(store: AssetStore, logicalPath: string): string {
  return `${store.baseUrl.replace(/\/$/u, '')}/${logicalPath}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function filesystemErrorCode(error: unknown): string | undefined {
  const code = error instanceof AssetStoreError
    ? error.systemCode
    : (
      error && typeof error === 'object' && 'code' in error
        ? (error as { readonly code?: unknown }).code
        : undefined
    );
  return typeof code === 'string' && FILESYSTEM_ERROR_CODE.test(code) ? code : undefined;
}

function groupAssets(assets: readonly PlannedAnimationAsset[]): readonly InspectionGroup[] {
  const byPath = new Map<string, IndexedAsset[]>();
  assets.forEach((asset, index) => {
    const group = byPath.get(asset.path) ?? [];
    group.push({ index, asset });
    byPath.set(asset.path, group);
  });
  return [...byPath.entries()].map(([path, groupedAssets]) => ({ path, assets: groupedAssets }));
}

function blankFramesFor(
  asset: PlannedAnimationAsset,
  adapter: CanvasAdapter,
  image: Awaited<ReturnType<CanvasAdapter['loadImage']>>,
): readonly BlankAnimationFramesFinding[] {
  const canvas = adapter.createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const findings: BlankAnimationFramesFinding[] = [];

  for (const row of asset.geometry.rows) {
    const frames: BlankAnimationFrame[] = [];
    for (const cell of row.cells) {
      const x = cell.sourceColumn * asset.geometry.frameSize;
      const y = row.sourceRow * asset.geometry.frameSize;
      const isOutsideImage = (
        x < 0 ||
        y < 0 ||
        x + asset.geometry.frameSize > image.width ||
        y + asset.geometry.frameSize > image.height
      );
      const isBlank = isOutsideImage || [...context.getImageData(
        x,
        y,
        asset.geometry.frameSize,
        asset.geometry.frameSize,
      ).data].every((_value, index, pixels) => index % 4 !== 3 || pixels[index] === 0);
      if (isBlank) {
        frames.push({
          sourceColumn: cell.sourceColumn,
          logicalFrameIndices: cell.logicalFrameIndices,
        });
      }
    }
    if (frames.length > 0) {
      findings.push({
        path: asset.path,
        animation: asset.animation,
        sourceAnimation: asset.sourceAnimation,
        sourceRow: row.sourceRow,
        ...(row.direction ? { direction: row.direction } : {}),
        frames,
        consumers: asset.consumers,
      });
    }
  }
  return findings;
}

function missingFinding(asset: PlannedAnimationAsset): MissingAnimationFileFinding {
  return {
    path: asset.path,
    animation: asset.animation,
    sourceAnimation: asset.sourceAnimation,
    consumers: asset.consumers,
  };
}

function groupConsumers(group: InspectionGroup): readonly AnimationAuditConsumer[] {
  return group.assets.flatMap(({ asset }) => asset.consumers);
}

function missingResult(group: InspectionGroup): GroupInspectionResult {
  return {
    results: group.assets.map(({ index, asset }) => ({
      index,
      result: { missingFiles: [missingFinding(asset)], blankFrames: [] },
    })),
  };
}

function inspectionFailure(
  group: InspectionGroup,
  error: unknown,
): GroupInspectionResult {
  const systemCode = filesystemErrorCode(error);
  if (systemCode === 'ENOENT') return missingResult(group);
  return {
    results: [],
    error: {
      kind: error instanceof AssetStoreError || systemCode
        ? 'asset_read_failed'
        : 'image_decode_failed',
      message: errorMessage(error),
      path: group.path,
      consumers: groupConsumers(group),
    },
  };
}

async function inspectGroup(
  group: InspectionGroup,
  options: InspectAssetAnimationPlanOptions,
): Promise<GroupInspectionResult> {
  try {
    if (!options.store.has(group.path)) return missingResult(group);
  } catch (error) {
    return inspectionFailure(group, error);
  }

  try {
    const image = await options.adapter.loadImage(storeSource(options.store, group.path));
    return {
      results: group.assets.map(({ index, asset }) => ({
        index,
        result: { missingFiles: [], blankFrames: blankFramesFor(asset, options.adapter, image) },
      })),
    };
  } catch (error) {
    return inspectionFailure(group, error);
  }
}

async function inspectGroups(
  groups: readonly InspectionGroup[],
  options: InspectAssetAnimationPlanOptions,
): Promise<readonly GroupInspectionResult[]> {
  const results: GroupInspectionResult[] = new Array(groups.length);
  const requestedConcurrency = options.concurrency ?? 4;
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.floor(requestedConcurrency))
    : 4;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < groups.length) {
      const groupIndex = nextIndex;
      nextIndex += 1;
      const group = groups[groupIndex];
      if (group) results[groupIndex] = await inspectGroup(group, options);
    }
  }

  const workerCount = Math.min(concurrency, groups.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function mergeConsumers(
  left: readonly AnimationAuditConsumer[],
  right: readonly AnimationAuditConsumer[],
): readonly AnimationAuditConsumer[] {
  const consumers = new Map<string, AnimationAuditConsumer>();
  for (const consumer of [...left, ...right]) {
    const key = JSON.stringify(consumer);
    consumers.set(key, consumer);
  }
  return [...consumers.values()];
}

function mergeMissingFindings(
  findings: readonly MissingAnimationFileFinding[],
): readonly MissingAnimationFileFinding[] {
  const merged = new Map<string, MissingAnimationFileFinding>();
  for (const finding of findings) {
    const key = [finding.path, finding.animation, finding.sourceAnimation].join('\u0000');
    const existing = merged.get(key);
    merged.set(key, existing
      ? { ...existing, consumers: mergeConsumers(existing.consumers, finding.consumers) }
      : finding);
  }
  return [...merged.values()];
}

function mergeBlankFindings(
  findings: readonly BlankAnimationFramesFinding[],
): readonly BlankAnimationFramesFinding[] {
  const merged = new Map<string, BlankAnimationFramesFinding>();
  for (const finding of findings) {
    const key = [
      finding.path,
      finding.animation,
      finding.sourceAnimation,
      finding.sourceRow,
      finding.direction ?? '',
    ].join('\u0000');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, finding);
      continue;
    }
    const frames = new Map<number, BlankAnimationFrame>();
    for (const frame of [...existing.frames, ...finding.frames]) {
      const prior = frames.get(frame.sourceColumn);
      frames.set(frame.sourceColumn, prior
        ? {
          sourceColumn: frame.sourceColumn,
          logicalFrameIndices: [...new Set([
            ...prior.logicalFrameIndices,
            ...frame.logicalFrameIndices,
          ])],
        }
        : frame);
    }
    merged.set(key, {
      ...existing,
      frames: [...frames.values()],
      consumers: mergeConsumers(existing.consumers, finding.consumers),
    });
  }
  return [...merged.values()];
}

function plannedErrors(plan: AssetAnimationAuditPlan): readonly AnimationAuditInspectionError[] {
  return plan.errors.map((error) => ({
    kind: error.kind,
    message: error.message,
    consumers: [error.consumer],
  }));
}

function incompleteItemIds(
  unsupported: readonly UnsupportedAnimationFinding[],
  missingFiles: readonly MissingAnimationFileFinding[],
  blankFrames: readonly BlankAnimationFramesFinding[],
): ReadonlySet<string> {
  return new Set([
    ...unsupported.map(({ itemId }) => itemId),
    ...missingFiles.flatMap(({ consumers }) => consumers.map(({ itemId }) => itemId)),
    ...blankFrames.flatMap(({ consumers }) => consumers.map(({ itemId }) => itemId)),
  ]);
}

export async function inspectAssetAnimationPlan(
  plan: AssetAnimationAuditPlan,
  options: InspectAssetAnimationPlanOptions,
): Promise<AssetAnimationAuditReport> {
  const resultsByAssetIndex: AssetInspectionResult[] = new Array(plan.assets.length);
  const errors = [...plannedErrors(plan)];
  const groups = groupAssets(plan.assets);
  const groupResults = await inspectGroups(groups, options);

  for (const groupResult of groupResults) {
    if (groupResult.error) errors.push(groupResult.error);
    for (const { index, result } of groupResult.results) resultsByAssetIndex[index] = result;
  }

  const inspected = resultsByAssetIndex.flatMap((result) => result
    ? [result]
    : []);
  const missingFiles = mergeMissingFindings(inspected.flatMap((result) => result.missingFiles));
  const blankFrames = mergeBlankFindings(inspected.flatMap((result) => result.blankFrames));
  const incompleteItems = incompleteItemIds(plan.unsupported, missingFiles, blankFrames);

  return {
    targets: plan.targets,
    scope: options.scope ?? {},
    summary: {
      itemsScanned: plan.itemsScanned,
      incompleteItems: incompleteItems.size,
      unsupported: plan.unsupported.length,
      missingFiles: missingFiles.length,
      blankFrames: blankFrames.length,
      errors: errors.length,
    },
    unsupported: plan.unsupported,
    missingFiles,
    blankFrames,
    errors,
  };
}
