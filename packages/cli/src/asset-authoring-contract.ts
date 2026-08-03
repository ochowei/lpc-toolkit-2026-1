import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { ImageData as NapiImageData } from '@napi-rs/canvas';
import {
  planSpriteDrawingContract,
  spriteDrawingContractDigestInput,
  spriteDrawingTargetId,
  type AssetAuthoringPlan,
  type AnimationAuditGeometry,
  type Catalog,
  type CreditEntry,
  type ItemDefinition,
  type SpriteDrawingContract,
  type SpriteDrawingGeometry,
  type SpriteDrawingTargetInput,
} from '@lpc-toolkit/core';
import { nodeAssetPackPngDecoder } from './asset-pack-node-runtime.js';
import { loadActiveAssetPackBaseline } from './asset-pack-validation.js';
import {
  assetAuthoringSessionPath,
  type AssetAuthoringSession,
} from './asset-authoring-session.js';
import type { AssetWorkspace } from './asset-workspace.js';
import type { AuthoringArtifact } from './response.js';
import { createNodeCanvasAdapter, writeCanvasPng } from './node-canvas-adapter.js';
import type { RuntimeAssets } from './runtime-assets.js';

export const ASSET_AUTHORING_ARTIFACT_METADATA_SCHEMA =
  'lpc-toolkit.asset-authoring-artifact-metadata.v1' as const;

const CONTRACT_DIRECTORY = 'contract-artifacts' as const;
const CONTRACT_FILE = 'contract.json' as const;
const METADATA_FILE = 'metadata.json' as const;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export interface AssetAuthoringContractErrorOptions {
  readonly code: string;
  readonly path?: string;
}

export class AssetAuthoringContractError extends Error {
  readonly code: string;
  readonly path: string | undefined;

  constructor(message: string, options: AssetAuthoringContractErrorOptions) {
    super(message);
    this.name = 'AssetAuthoringContractError';
    this.code = options.code;
    this.path = options.path;
  }
}

export interface AssetAuthoringContractResult {
  readonly contract: SpriteDrawingContract;
  readonly contractDigest: string;
  readonly artifacts: readonly AuthoringArtifact[];
}

interface AttributionMetadata {
  readonly authors: readonly string[];
  readonly licenses: readonly string[];
  readonly urls: readonly string[];
  readonly notes: string;
}

interface UnchangedCellMetadata {
  readonly sourceRow: number;
  readonly sourceColumn: number;
  readonly digest: string;
}

interface SourceMetadata {
  readonly logicalPath: string;
  readonly digest: string;
}

interface ArtifactMetadataEntry {
  readonly id: string;
  readonly kind: 'contract' | 'template' | 'guide' | 'working-copy' | 'reference-overlay';
  readonly path: string;
  readonly digest: string;
  readonly importable: false;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly targetId?: string;
  readonly targetPath?: string;
  readonly source?: SourceMetadata;
  readonly attribution?: AttributionMetadata;
  readonly unchangedCells?: readonly UnchangedCellMetadata[];
}

interface ArtifactMetadataDocument {
  readonly schema: typeof ASSET_AUTHORING_ARTIFACT_METADATA_SCHEMA;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly artifacts: readonly ArtifactMetadataEntry[];
}

interface DecodedSource {
  readonly bytes: Buffer;
  readonly digest: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

interface TargetContext {
  readonly targetId: string;
  readonly input: SpriteDrawingTargetInput;
  readonly attribution: AttributionMetadata;
  readonly source?: DecodedSource;
  readonly unchangedCells: readonly UnchangedCellMetadata[];
}

interface BaselineItemMatch {
  readonly item: ItemDefinition;
  readonly itemId: string;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === ''
    || (
      relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

function storeSource(store: RuntimeAssets['store'], logicalPath: string): string {
  return `${store.baseUrl.replace(/\/$/u, '')}/${logicalPath}`;
}

function contractDirectory(workspace: AssetWorkspace, sessionId: string): string {
  const sessionDirectory = path.dirname(assetAuthoringSessionPath(workspace, sessionId));
  const directory = path.resolve(sessionDirectory, CONTRACT_DIRECTORY);
  if (!isInsideRoot(sessionDirectory, directory)) {
    throw new AssetAuthoringContractError(
      'Contract artifact directory escapes its session directory.',
      { code: 'asset_authoring_scope_invalid', path: directory },
    );
  }
  return directory;
}

export function assetAuthoringContractMetadataPath(
  workspace: AssetWorkspace,
  sessionId: string,
): string {
  return path.join(contractDirectory(workspace, sessionId), METADATA_FILE);
}

function safeTargetStem(targetId: string): string {
  return targetId.replace(/[^A-Za-z0-9._-]/gu, '__');
}

function artifactPath(
  root: string,
  directory: string,
  fileName: string,
): string {
  const target = path.resolve(root, directory, fileName);
  if (!isInsideRoot(root, target)) {
    throw new AssetAuthoringContractError(
      'Contract artifact path escapes its session-owned directory.',
      { code: 'asset_authoring_scope_invalid', path: target },
    );
  }
  return target;
}

function writeBytes(filePath: string, bytes: Buffer): AuthoringArtifact {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, bytes);
  return {
    id: '',
    path: path.resolve(filePath),
    digest: sha256(bytes),
  };
}

function withArtifactId(
  artifact: AuthoringArtifact,
  id: string,
): AuthoringArtifact {
  return { ...artifact, id };
}

function attributionFromCredits(credits: readonly CreditEntry[]): AttributionMetadata {
  const authors = new Set<string>();
  const licenses = new Set<string>();
  const urls = new Set<string>();
  const notes: string[] = [];
  credits.forEach((credit) => {
    credit.authors.forEach((author) => authors.add(author));
    credit.licenses.forEach((license) => licenses.add(license));
    credit.urls.forEach((url) => urls.add(url));
    if (credit.notes.length > 0 && !notes.includes(credit.notes)) notes.push(credit.notes);
  });
  return {
    authors: [...authors].sort((left, right) => left.localeCompare(right)),
    licenses: [...licenses].sort((left, right) => left.localeCompare(right)),
    urls: [...urls].sort((left, right) => left.localeCompare(right)),
    notes: notes.sort((left, right) => left.localeCompare(right)).join('\n'),
  };
}

function sourceDefinitionPath(logicalPath: string): string | undefined {
  const prefix = 'spritesheets/';
  if (!logicalPath.startsWith(prefix)) return undefined;
  const relative = logicalPath.slice(prefix.length);
  const lastSlash = relative.lastIndexOf('/');
  if (lastSlash < 0) return undefined;
  return `${relative.slice(0, lastSlash)}.json`;
}

function findBaselineItem(
  catalog: Catalog,
  itemId: string,
  typeName: string,
  sourcePath: string,
): BaselineItemMatch {
  const direct = catalog.byItemId.get(itemId);
  if (direct !== undefined) return { item: direct, itemId: direct.itemId ?? itemId };

  const definitionPath = sourceDefinitionPath(sourcePath);
  const candidates = catalog.byTypeName.get(typeName) ?? [];
  const byDefinition = candidates.find((item) => item.sourcePath === definitionPath);
  if (byDefinition !== undefined) {
    return { item: byDefinition, itemId: byDefinition.itemId ?? itemId };
  }

  throw new AssetAuthoringContractError(
    `The active catalog does not contain the baseline item ${itemId}.`,
    { code: 'asset_authoring_baseline_missing', path: itemId },
  );
}

async function loadSource(
  runtime: RuntimeAssets,
  logicalPath: string,
  required: boolean,
): Promise<DecodedSource | undefined> {
  if (!runtime.store.has(logicalPath)) {
    if (!required) return undefined;
    throw new AssetAuthoringContractError(
      `The active asset source is missing: ${logicalPath}.`,
      { code: 'asset_authoring_source_missing', path: logicalPath },
    );
  }
  const source = await runtime.store.load(storeSource(runtime.store, logicalPath));
  const bytes = typeof source === 'string' ? readFileSync(source) : Buffer.from(source);
  const decoded = await nodeAssetPackPngDecoder.decode(bytes);
  return {
    bytes,
    digest: sha256(bytes),
    width: decoded.width,
    height: decoded.height,
    pixels: decoded.pixels,
  };
}

function geometryMaxColumn(geometry: AnimationAuditGeometry): number {
  return Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
}

function cellDigest(
  source: DecodedSource,
  rowIndex: number,
  sourceColumn: number,
  frameSize: number,
): string {
  const x = sourceColumn * frameSize;
  const y = rowIndex * frameSize;
  if (
    x < 0
    || y < 0
    || x + frameSize > source.width
    || y + frameSize > source.height
  ) {
    throw new AssetAuthoringContractError(
      'The active source PNG dimensions do not contain the planned Core geometry.',
      { code: 'asset_authoring_source_geometry_mismatch' },
    );
  }
  const bytes = Buffer.alloc(frameSize * frameSize * 4);
  let offset = 0;
  for (let row = 0; row < frameSize; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    const end = start + frameSize * 4;
    bytes.set(source.pixels.subarray(start, end), offset);
    offset += frameSize * 4;
  }
  return sha256(bytes);
}

function baselineCells(
  source: DecodedSource,
  geometry: AnimationAuditGeometry,
): readonly UnchangedCellMetadata[] {
  const frameSize = geometry.frameSize;
  const maxColumn = geometryMaxColumn(geometry);
  return geometry.rows.flatMap((row, rowIndex) =>
    Array.from({ length: maxColumn + 1 }, (_, sourceColumn) => ({
      sourceRow: row.sourceRow,
      sourceColumn,
      digest: cellDigest(source, rowIndex, sourceColumn, frameSize),
    })),
  );
}

function layerZPos(item: ItemDefinition, layer: `layer_${number}`): number {
  const rawLayer = item[layer];
  if (rawLayer === undefined || typeof rawLayer.zPos !== 'number') {
    throw new AssetAuthoringContractError(
      `The baseline item has no usable ${layer} layer.`,
      { code: 'asset_authoring_baseline_layer_missing', path: layer },
    );
  }
  return rawLayer.zPos;
}

function newItemTargets(plan: Extract<AssetAuthoringPlan, { readonly goal: 'new-item' }>): readonly TargetContext[] {
  const layers = [...plan.asset.layers].sort((left, right) =>
    left.zPos - right.zPos || left.id.localeCompare(right.id));
  const animations = [...plan.asset.animations];
  const targetContexts = plan.scope.paths.map((targetPath, index) => {
    const fileName = path.posix.basename(targetPath).replace(/\.png$/u, '');
    const animation = animations.find((candidate) => candidate === fileName)
      ?? animations[index % animations.length];
    const layer = layers.find((candidate) => targetPath.split('/').includes(candidate.id))
      ?? layers[index % layers.length];
    if (animation === undefined || layer === undefined) {
      throw new AssetAuthoringContractError(
        'New-item scope does not contain enough Core-validated animation or layer intent.',
        { code: 'asset_authoring_scope_invalid', path: targetPath },
      );
    }
    const bodyTypes = plan.asset.bodyTypes.filter((bodyType) => targetPath.split('/').includes(bodyType));
    const input: SpriteDrawingTargetInput = {
      path: targetPath,
      source: { logicalPath: targetPath },
      animation,
      layer: { id: layer.id, zPos: layer.zPos },
      bodyTypes: bodyTypes.length > 0 ? bodyTypes : (layer.bodyTypes ?? plan.asset.bodyTypes),
      consumers: [],
      work: 'new-item',
    };
    return {
      targetId: spriteDrawingTargetId(plan, input),
      input,
      attribution: attributionFromCredits([{
        file: targetPath,
        notes: plan.draftCredits?.notes ?? 'Authoring plan draft attribution.',
        authors: plan.draftCredits?.authors ?? [],
        licenses: plan.draftCredits?.licenses ?? [],
        urls: plan.draftCredits?.urls ?? [],
      }]),
      unchangedCells: [],
    } satisfies TargetContext;
  });
  return targetContexts;
}

async function extendItemTargets(
  plan: Extract<AssetAuthoringPlan, { readonly goal: 'extend-item' }>,
  runtime: RuntimeAssets,
  workspace: AssetWorkspace,
): Promise<readonly TargetContext[]> {
  const baseline = loadActiveAssetPackBaseline({ runtime, workspace });
  const finding = plan.remediation.selectedFinding;
  if (finding.category === 'unsupported') {
    throw new AssetAuthoringContractError(
      'Unsupported audit findings cannot produce a deterministic drawing contract.',
      { code: 'asset_authoring_finding_unsupported' },
    );
  }
  const firstConsumer = finding.consumers[0] ?? plan.remediation.consumer;
  const match = findBaselineItem(
    baseline.catalog,
    plan.asset.itemId,
    plan.asset.typeName,
    finding.path,
  );
  const layer = firstConsumer.layer;
  const source = await loadSource(runtime, finding.path, finding.category === 'blankFrames');
  const sourceCells = finding.category === 'blankFrames'
    ? baselineCells(source!, plan.remediation.geometry)
    : [];
  const baseInput: SpriteDrawingTargetInput = {
    path: finding.path,
    source: {
      logicalPath: finding.path,
      ...(source === undefined ? {} : { digest: source.digest }),
    },
    animation: finding.animation,
    sourceAnimation: finding.sourceAnimation,
    layer: { id: layer, zPos: layerZPos(match.item, layer) },
    bodyTypes: firstConsumer.bodyTypes,
    consumers: finding.consumers,
    work: finding.category === 'blankFrames' ? 'blank-frame-repair' : 'missing-file',
    pathConfidence: plan.remediation.pathConfidence,
    ...(finding.category === 'blankFrames'
      ? { defaultCellPolicy: 'unchanged' as const }
      : {}),
  };
  const targetId = spriteDrawingTargetId(plan, baseInput);
  const input: SpriteDrawingTargetInput = finding.category === 'blankFrames'
    ? {
      ...baseInput,
      baseline: {
        id: `baseline:${targetId}`,
        digest: source!.digest,
        cells: sourceCells,
      },
    }
    : baseInput;
  return [{
    targetId,
    input,
    attribution: attributionFromCredits(match.item.credits),
    ...(source === undefined ? {} : { source }),
    unchangedCells: sourceCells,
  }];
}

async function buildTargetContexts(
  session: AssetAuthoringSession,
  runtime: RuntimeAssets,
  workspace: AssetWorkspace,
): Promise<readonly TargetContext[]> {
  if (session.plan.goal === 'new-item') return newItemTargets(session.plan);
  if (session.plan.goal === 'extend-item') {
    return extendItemTargets(session.plan, runtime, workspace);
  }
  throw new AssetAuthoringContractError(
    'Attach-pack authoring sessions do not publish drawing contracts.',
    { code: 'asset_authoring_goal_unsupported' },
  );
}

function pixelPng(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  filePath: string,
): Promise<Buffer> {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const adapter = createNodeCanvasAdapter();
  const canvas = adapter.createCanvas(width, height);
  canvas.getContext('2d').putImageData(new NapiImageData(pixels, width, height), 0, 0);
  return writeCanvasPng(canvas, filePath).then(() => readFileSync(filePath));
}

async function writeTransparentPng(
  width: number,
  height: number,
  filePath: string,
): Promise<Buffer> {
  return pixelPng(new Uint8ClampedArray(width * height * 4), width, height, filePath);
}

function guidePixels(geometry: SpriteDrawingGeometry): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(geometry.canvasWidth * geometry.canvasHeight * 4);
  const setPixel = (x: number, y: number, color: readonly [number, number, number, number]): void => {
    if (x < 0 || y < 0 || x >= geometry.canvasWidth || y >= geometry.canvasHeight) return;
    const offset = (y * geometry.canvasWidth + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  };
  geometry.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell) => {
      const x = cell.sourceColumn * geometry.frameWidth;
      const y = rowIndex * geometry.frameHeight;
      const color: readonly [number, number, number, number] = cell.policy === 'required-drawn'
        ? [75, 220, 135, 210]
        : [80, 150, 240, 175];
      for (let offset = 0; offset < geometry.frameWidth; offset += 1) {
        setPixel(x + offset, y, color);
        setPixel(x + offset, y + geometry.frameHeight - 1, color);
      }
      for (let offset = 0; offset < geometry.frameHeight; offset += 1) {
        setPixel(x, y + offset, color);
        setPixel(x + geometry.frameWidth - 1, y + offset, color);
      }
    });
  });
  return pixels;
}

function referencePixels(source: DecodedSource): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(source.pixels);
  for (let offset = 3; offset < pixels.length; offset += 4) {
    pixels[offset] = Math.min(pixels[offset] ?? 0, 128);
  }
  return pixels;
}

function unchangedCellsForTarget(
  target: SpriteDrawingContract['targets'][number],
  context: TargetContext,
): readonly UnchangedCellMetadata[] {
  const byKey = new Map(context.unchangedCells.map((cell) => [
    `${cell.sourceRow}:${cell.sourceColumn}`,
    cell,
  ]));
  return target.cells
    .filter((cell) => cell.policy === 'unchanged')
    .map((cell) => byKey.get(`${cell.sourceRow}:${cell.sourceColumn}`))
    .filter((cell): cell is UnchangedCellMetadata => cell !== undefined);
}

function metadataEntry(
  artifact: AuthoringArtifact,
  kind: ArtifactMetadataEntry['kind'],
  session: AssetAuthoringSession,
  contractDigest: string,
  target?: SpriteDrawingContract['targets'][number],
  options: {
    readonly source?: SourceMetadata;
    readonly attribution?: AttributionMetadata;
    readonly unchangedCells?: readonly UnchangedCellMetadata[];
  } = {},
): ArtifactMetadataEntry {
  return {
    id: artifact.id,
    kind,
    path: artifact.path,
    digest: artifact.digest,
    importable: false,
    sessionId: session.sessionId,
    contractDigest,
    ...(target === undefined ? {} : { targetId: target.id, targetPath: target.path }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.attribution === undefined ? {} : { attribution: options.attribution }),
    ...(options.unchangedCells === undefined ? {} : { unchangedCells: options.unchangedCells }),
  };
}

function previousContractDigest(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new AssetAuthoringContractError(
      error instanceof Error ? error.message : 'Contract metadata could not be read.',
      { code: 'asset_authoring_artifact_metadata_invalid', path: filePath },
    );
  }
  if (!isRecord(value) || typeof value.contractDigest !== 'string' || !DIGEST_PATTERN.test(value.contractDigest)) {
    throw new AssetAuthoringContractError(
      'Contract metadata has an invalid contract digest.',
      { code: 'asset_authoring_artifact_metadata_invalid', path: filePath },
    );
  }
  return value.contractDigest;
}

function assertSourceMatchesGeometry(
  source: DecodedSource,
  geometry: SpriteDrawingGeometry,
  targetPath: string,
): void {
  if (source.width !== geometry.canvasWidth || source.height !== geometry.canvasHeight) {
    throw new AssetAuthoringContractError(
      `Source PNG dimensions do not match the Core contract geometry for ${targetPath}.`,
      { code: 'asset_authoring_source_geometry_mismatch', path: targetPath },
    );
  }
}

export async function materializeAssetAuthoringContract(options: {
  readonly session: AssetAuthoringSession;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly refresh: boolean;
}): Promise<AssetAuthoringContractResult> {
  const contexts = await buildTargetContexts(options.session, options.runtime, options.workspace);
  const contract = planSpriteDrawingContract({
    plan: options.session.plan,
    targets: contexts.map((context) => context.input),
  });
  const contractBytes = Buffer.from(spriteDrawingContractDigestInput(contract), 'utf8');
  const contractDigest = sha256(contractBytes);
  const root = contractDirectory(options.workspace, options.session.sessionId);
  const metadataPath = path.join(root, METADATA_FILE);
  const previousDigest = options.refresh ? undefined : previousContractDigest(metadataPath);
  if (!options.refresh && previousDigest !== undefined && previousDigest !== contractDigest) {
    throw new AssetAuthoringContractError(
      'Planning input changed since the existing contract was published; rerun with --refresh.',
      { code: 'asset_authoring_planning_stale', path: metadataPath },
    );
  }
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const artifacts: AuthoringArtifact[] = [];
  const metadata: ArtifactMetadataEntry[] = [];
  const contractArtifact = withArtifactId(
    writeBytes(path.join(root, CONTRACT_FILE), contractBytes),
    'contract',
  );
  artifacts.push(contractArtifact);
  metadata.push(metadataEntry(contractArtifact, 'contract', options.session, contractDigest));

  const contextsById = new Map(contexts.map((context) => [context.targetId, context]));
  for (const target of contract.targets) {
    const context = contextsById.get(target.id);
    if (context === undefined) {
      throw new AssetAuthoringContractError(
        `Core returned an unknown drawing target ${target.id}.`,
        { code: 'asset_authoring_contract_invalid' },
      );
    }
    if (context.source !== undefined) assertSourceMatchesGeometry(context.source, target.geometry, target.path);
    const stem = safeTargetStem(target.id);
    const templatePath = artifactPath(root, 'templates', `${stem}.png`);
    const templateBytes = await writeTransparentPng(
      target.geometry.canvasWidth,
      target.geometry.canvasHeight,
      templatePath,
    );
    const templateDecoded = await nodeAssetPackPngDecoder.decode(templateBytes);
    if (
      templateDecoded.width !== target.geometry.canvasWidth
      || templateDecoded.height !== target.geometry.canvasHeight
      || [...templateDecoded.pixels].some((value, index) => index % 4 === 3 && value !== 0)
    ) {
      throw new AssetAuthoringContractError(
        `Template PNG failed transparent preflight for ${target.path}.`,
        { code: 'asset_authoring_template_invalid', path: templatePath },
      );
    }
    const template = withArtifactId(
      { id: '', path: templatePath, digest: sha256(templateBytes) },
      `template:${target.id}`,
    );
    artifacts.push(template);
    metadata.push(metadataEntry(template, 'template', options.session, contractDigest, target, {
      attribution: context.attribution,
    }));

    const guidePath = artifactPath(root, 'guides', `${stem}.png`);
    const guideBytes = await pixelPng(
      guidePixels(target.geometry),
      target.geometry.canvasWidth,
      target.geometry.canvasHeight,
      guidePath,
    );
    const guide = withArtifactId(
      { id: '', path: guidePath, digest: sha256(guideBytes) },
      `guide:${target.id}`,
    );
    artifacts.push(guide);
    metadata.push(metadataEntry(guide, 'guide', options.session, contractDigest, target, {
      attribution: context.attribution,
    }));

    if (context.source !== undefined && target.cells.some((cell) => cell.policy === 'unchanged')) {
      const sourceMetadata: SourceMetadata = {
        logicalPath: target.source.logicalPath,
        digest: context.source.digest,
      };
      const unchanged = unchangedCellsForTarget(target, context);
      const workingPath = artifactPath(root, 'working-copies', `${stem}.png`);
      const working = withArtifactId(
        writeBytes(workingPath, context.source.bytes),
        `working-copy:${target.id}`,
      );
      if (working.digest !== context.source.digest) {
        throw new AssetAuthoringContractError(
          'The attributed working copy digest does not match its source.',
          { code: 'asset_authoring_working_copy_invalid', path: workingPath },
        );
      }
      artifacts.push(working);
      metadata.push(metadataEntry(working, 'working-copy', options.session, contractDigest, target, {
        source: sourceMetadata,
        attribution: context.attribution,
        unchangedCells: unchanged,
      }));

      const referencePath = artifactPath(root, 'references', `${stem}.png`);
      const referenceBytes = await pixelPng(
        referencePixels(context.source),
        context.source.width,
        context.source.height,
        referencePath,
      );
      const reference = withArtifactId(
        { id: '', path: referencePath, digest: sha256(referenceBytes) },
        `reference:${target.id}`,
      );
      artifacts.push(reference);
      metadata.push(metadataEntry(reference, 'reference-overlay', options.session, contractDigest, target, {
        source: sourceMetadata,
        attribution: context.attribution,
        unchangedCells: unchanged,
      }));
    }
  }

  const metadataDocument: ArtifactMetadataDocument = {
    schema: ASSET_AUTHORING_ARTIFACT_METADATA_SCHEMA,
    sessionId: options.session.sessionId,
    contractDigest,
    artifacts: metadata,
  };
  const metadataBytes = Buffer.from(`${JSON.stringify(metadataDocument, null, 2)}\n`, 'utf8');
  const metadataArtifact = withArtifactId(
    writeBytes(metadataPath, metadataBytes),
    'metadata',
  );
  artifacts.push(metadataArtifact);

  return {
    contract,
    contractDigest,
    artifacts,
  };
}
