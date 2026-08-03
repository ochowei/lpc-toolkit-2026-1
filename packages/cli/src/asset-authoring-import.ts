import { ASSET_PACK_ARCHIVE_LIMITS, inspectAssetPackSourceBytes } from '@lpc-toolkit/asset-pack-format';
import {
  ASSET_PACK_SCHEMA,
  normalizeAssetPack,
  parseAssetPackSource,
  type SpriteDrawingCell,
  type SpriteDrawingContract,
  type SpriteDrawingTarget,
} from '@lpc-toolkit/core';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  AssetPackAtomicReplacementError,
  AssetPackCaptureError,
  atomicallyReplaceAssetPackSource,
  readBoundedAssetPackFile,
  readOptionalBoundedAssetPackFile,
  type AssetPackBoundedFileSnapshot,
} from './asset-pack-files.js';
import { nodeAssetPackPngDecoder } from './asset-pack-node-runtime.js';
import {
  assetAuthoringContractMetadataPath,
} from './asset-authoring-contract.js';
import type { AssetAuthoringSession } from './asset-authoring-session.js';
import type { AssetWorkspace } from './asset-workspace.js';

const CONTRACT_SCHEMA = 'lpc-toolkit.sprite-drawing-contract.v1' as const;
const ARTIFACT_METADATA_SCHEMA =
  'lpc-toolkit.asset-authoring-artifact-metadata.v1' as const;
const CONTRACT_FILE = 'contract.json' as const;
const MAX_CANDIDATE_BYTES = ASSET_PACK_ARCHIVE_LIMITS.entryBytes;
const MAX_DECODED_PIXELS = 16 * 1_024 * 1_024;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const CELL_POLICIES = new Set([
  'required-drawn',
  'optional-transparent',
  'required-transparent',
  'unchanged',
]);
const ARTIFACT_KINDS = new Set([
  'contract',
  'template',
  'guide',
  'working-copy',
  'reference-overlay',
]);

type Sha256Digest = `sha256:${string}`;
type JsonRecord = Readonly<Record<string, unknown>>;

export class AssetAuthoringImportError extends Error {
  readonly code: string;
  readonly path: string | undefined;

  constructor(message: string, options: { readonly code: string; readonly path?: string }) {
    super(message);
    this.name = 'AssetAuthoringImportError';
    this.code = options.code;
    this.path = options.path;
  }
}

export interface AssetAuthoringImportResult {
  readonly contractPath: string;
  readonly contractDigest: Sha256Digest;
  readonly metadataPath: string;
  readonly metadataDigest: Sha256Digest;
  readonly candidatePath: string;
  readonly candidateDigest: Sha256Digest;
  readonly logicalTargetPath: string;
  readonly targetPath: string;
  readonly targetDigest: Sha256Digest;
}

interface ArtifactMetadataSummary {
  readonly restrictedPaths: ReadonlySet<string>;
  readonly restrictedDigests: ReadonlySet<Sha256Digest>;
  readonly digest: Sha256Digest;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(
  code: string,
  message: string,
  targetPath?: string,
): never {
  throw new AssetAuthoringImportError(message, {
    code,
    ...(targetPath === undefined ? {} : { path: targetPath }),
  });
}

function sha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function stringValue(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail('asset_authoring_contract_invalid', `${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function digestValue(record: JsonRecord, key: string, label: string): Sha256Digest {
  const value = record[key];
  if (!isDigest(value)) {
    fail('asset_authoring_contract_invalid', `${label}.${key} must be a sha256 digest.`);
  }
  return value;
}

function integerValue(record: JsonRecord, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail('asset_authoring_contract_invalid', `${label}.${key} must be a safe integer.`);
  }
  return value;
}

function positiveIntegerValue(record: JsonRecord, key: string, label: string): number {
  const value = integerValue(record, key, label);
  if (value <= 0) fail('asset_authoring_contract_invalid', `${label}.${key} must be positive.`);
  return value;
}

function arrayValue(record: JsonRecord, key: string, label: string): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) fail('asset_authoring_contract_invalid', `${label}.${key} must be an array.`);
  return value;
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

function assertLogicalPath(value: string, label: string): void {
  if (
    value.length === 0
    || value.includes('\\')
    || value.includes('\u0000')
    || value.startsWith('/')
    || value.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    fail('asset_authoring_contract_invalid', `${label} must be a portable contained logical path.`, value);
  }
}

function jsonObject(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) fail('asset_authoring_contract_invalid', `${label} must be an object.`);
  return value;
}

function validateCellShape(
  value: unknown,
  label: string,
  expectedRow: number,
): SpriteDrawingCell {
  const record = jsonObject(value, label);
  const sourceRow = integerValue(record, 'sourceRow', label);
  const sourceColumn = integerValue(record, 'sourceColumn', label);
  if (sourceRow !== expectedRow || sourceRow < 0 || sourceColumn < 0) {
    fail('asset_authoring_contract_invalid', `${label} has an invalid cell coordinate.`);
  }
  const logicalFrameIndices = arrayValue(record, 'logicalFrameIndices', label);
  if (!logicalFrameIndices.every((entry) => typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 0)) {
    fail('asset_authoring_contract_invalid', `${label}.logicalFrameIndices must contain non-negative integers.`);
  }
  const policy = stringValue(record, 'policy', label);
  if (!CELL_POLICIES.has(policy)) {
    fail('asset_authoring_contract_invalid', `${label}.policy is unsupported.`);
  }
  const baselineDigest = record.baselineDigest;
  if (policy === 'unchanged' && !isDigest(baselineDigest)) {
    fail('asset_authoring_contract_invalid', `${label}.baselineDigest is required for unchanged cells.`);
  }
  if (baselineDigest !== undefined && !isDigest(baselineDigest)) {
    fail('asset_authoring_contract_invalid', `${label}.baselineDigest must be a sha256 digest.`);
  }
  return {
    sourceRow,
    sourceColumn,
    logicalFrameIndices: logicalFrameIndices as readonly number[],
    policy: policy as SpriteDrawingCell['policy'],
    ...(baselineDigest === undefined ? {} : { baselineDigest }),
  };
}

function validateContract(
  value: unknown,
  session: AssetAuthoringSession,
): SpriteDrawingContract {
  const record = jsonObject(value, 'contract');
  if (record.schema !== CONTRACT_SCHEMA) {
    fail('asset_authoring_contract_invalid', 'Contract schema is unsupported.');
  }
  if (record.goal !== session.goal) {
    fail('asset_authoring_contract_stale', 'Contract goal does not match the authoring session.');
  }
  const pack = jsonObject(record.pack, 'contract.pack');
  if (
    pack.id !== session.plan.pack.id
    || pack.version !== session.plan.pack.version
  ) {
    fail('asset_authoring_contract_stale', 'Contract pack identity does not match the authoring session.');
  }
  const transparency = jsonObject(record.transparency, 'contract.transparency');
  if (
    transparency.encoding !== 'png'
    || transparency.colorModel !== 'rgba'
    || transparency.background !== 'transparent'
  ) {
    fail('asset_authoring_transparency_policy', 'Contract does not require transparent RGBA PNG output.');
  }
  const targetsValue = arrayValue(record, 'targets', 'contract');
  if (targetsValue.length === 0) fail('asset_authoring_contract_invalid', 'Contract must contain a target.');
  const targetIds = new Set<string>();
  const targets = targetsValue.map((valueEntry, targetIndex) => {
    const label = `contract.targets[${targetIndex}]`;
    const target = jsonObject(valueEntry, label);
    const id = stringValue(target, 'id', label);
    if (targetIds.has(id)) fail('asset_authoring_contract_invalid', `Duplicate contract target id: ${id}.`);
    targetIds.add(id);
    const targetPath = stringValue(target, 'path', label);
    assertLogicalPath(targetPath, `${label}.path`);
    if (!session.plan.scope.paths.includes(targetPath)) {
      fail('asset_authoring_target_invalid', `Contract target is outside the session scope: ${targetPath}.`, targetPath);
    }
    const source = jsonObject(target.source, `${label}.source`);
    if (source.logicalPath !== targetPath) {
      fail('asset_authoring_contract_invalid', `${label}.source.logicalPath must match its target path.`);
    }
    stringValue(target, 'sourceAnimation', label);
    const geometry = jsonObject(target.geometry, `${label}.geometry`);
    const frameWidth = positiveIntegerValue(geometry, 'frameWidth', `${label}.geometry`);
    const frameHeight = positiveIntegerValue(geometry, 'frameHeight', `${label}.geometry`);
    const canvasWidth = positiveIntegerValue(geometry, 'canvasWidth', `${label}.geometry`);
    const canvasHeight = positiveIntegerValue(geometry, 'canvasHeight', `${label}.geometry`);
    const rowsValue = arrayValue(geometry, 'rows', `${label}.geometry`);
    if (rowsValue.length === 0) fail('asset_authoring_contract_invalid', `${label}.geometry.rows must not be empty.`);
    const rows = rowsValue.map((rowValue, rowIndex) => {
      const row = jsonObject(rowValue, `${label}.geometry.rows[${rowIndex}]`);
      const sourceRow = integerValue(row, 'sourceRow', `${label}.geometry.rows[${rowIndex}]`);
      if (sourceRow !== rowIndex) {
        fail('asset_authoring_contract_invalid', `${label}.geometry rows must use stable sourceRow order.`);
      }
      const cellsValue = arrayValue(row, 'cells', `${label}.geometry.rows[${rowIndex}]`);
      return cellsValue.map((cellValue, cellIndex) => validateCellShape(
        cellValue,
        `${label}.geometry.rows[${rowIndex}].cells[${cellIndex}]`,
        sourceRow,
      ));
    });
    const maxColumn = Math.max(...rows.flatMap((row) => row.map((cell) => cell.sourceColumn)));
    if (
      canvasWidth !== (maxColumn + 1) * frameWidth
      || canvasHeight !== rows.length * frameHeight
      || canvasWidth * canvasHeight > MAX_DECODED_PIXELS
    ) {
      fail('asset_authoring_contract_invalid', `${label}.geometry dimensions do not contain its cells.`);
    }
    const cellsValue = arrayValue(target, 'cells', label);
    const cells = cellsValue.map((cellValue, cellIndex) => {
      const cell = validateCellShape(cellValue, `${label}.cells[${cellIndex}]`, integerValue(
        jsonObject(cellValue, `${label}.cells[${cellIndex}]`),
        'sourceRow',
        `${label}.cells[${cellIndex}]`,
      ));
      if (
        cell.sourceColumn > maxColumn
        || (cell.sourceColumn + 1) * frameWidth > canvasWidth
      ) {
        fail('asset_authoring_contract_invalid', `${label}.cells[${cellIndex}] is outside its geometry.`);
      }
      return cell;
    });
    const geometryKeys = new Map(rows.flatMap((row) => row.map((cell) => [
      `${cell.sourceRow}:${cell.sourceColumn}`,
      cell.policy,
    ] as const)));
    if (
      cells.length !== geometryKeys.size
      || cells.some((cell) => geometryKeys.get(`${cell.sourceRow}:${cell.sourceColumn}`) !== cell.policy)
    ) {
      fail('asset_authoring_contract_invalid', `${label}.cells does not match its geometry rows.`);
    }
    return target as unknown as SpriteDrawingTarget;
  });
  if (targets.length !== targetIds.size) fail('asset_authoring_contract_invalid', 'Contract targets are invalid.');
  return { ...record, targets } as unknown as SpriteDrawingContract;
}

function captureFailure(
  error: unknown,
  prefix: 'candidate' | 'target' | 'contract',
): never {
  if (error instanceof AssetAuthoringImportError) throw error;
  if (error instanceof AssetPackCaptureError) {
    const codeByPrefix: Readonly<Record<string, string>> = {
      asset_source_missing: prefix === 'target'
        ? 'asset_authoring_pack_or_target_missing'
        : `${prefix === 'candidate' ? 'asset_authoring_candidate' : 'asset_authoring_contract'}_missing`,
      asset_source_outside_pack: `${prefix === 'candidate' ? 'asset_authoring_candidate' : prefix === 'target' ? 'asset_authoring_target' : 'asset_authoring_contract'}_outside_root`,
      asset_source_symlink: `${prefix === 'candidate' ? 'asset_authoring_candidate' : prefix === 'target' ? 'asset_authoring_target' : 'asset_authoring_contract'}_symlink`,
      asset_source_not_regular: `${prefix === 'candidate' ? 'asset_authoring_candidate' : prefix === 'target' ? 'asset_authoring_target' : 'asset_authoring_contract'}_not_regular`,
      asset_source_too_large: `${prefix === 'candidate' ? 'asset_authoring_candidate' : prefix === 'target' ? 'asset_authoring_target' : 'asset_authoring_contract'}_too_large`,
      asset_digest_mismatch: `${prefix === 'candidate' ? 'asset_authoring_candidate' : prefix === 'target' ? 'asset_authoring_target' : 'asset_authoring_contract'}_changed`,
    };
    throw new AssetAuthoringImportError(
      `${prefix} file could not be captured safely: ${error.message}`,
      { code: codeByPrefix[error.diagnosticCode] ?? 'asset_authoring_capture_failed', path: error.targetPath },
    );
  }
  throw error;
}

function readContractFile(
  workspace: AssetWorkspace,
  session: AssetAuthoringSession,
  expectedDigest: Sha256Digest,
): {
  readonly contractPath: string;
  readonly metadataPath: string;
  readonly contract: SpriteDrawingContract;
  readonly contractBytes: Buffer;
} {
  const metadataPath = assetAuthoringContractMetadataPath(workspace, session.sessionId);
  const contractPath = path.join(path.dirname(metadataPath), CONTRACT_FILE);
  let contractSnapshot: AssetPackBoundedFileSnapshot;
  try {
    contractSnapshot = readBoundedAssetPackFile({
      root: workspace.root,
      filePath: contractPath,
      label: 'Authoring contract',
      maximumBytes: MAX_CANDIDATE_BYTES,
    });
  } catch (error) {
    captureFailure(error, 'contract');
  }
  const contractDigest = sha256(contractSnapshot.bytes);
  if (contractDigest !== expectedDigest) {
    fail('asset_authoring_contract_stale', 'The contract bytes do not match --contract-digest.', contractPath);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contractSnapshot.bytes.toString('utf8')) as unknown;
  } catch (error) {
    fail(
      'asset_authoring_contract_invalid',
      error instanceof Error ? error.message : 'Authoring contract JSON is invalid.',
      contractPath,
    );
  }
  return {
    contractPath,
    metadataPath,
    contract: validateContract(parsed, session),
    contractBytes: contractSnapshot.bytes,
  };
}

function readMetadata(
  workspace: AssetWorkspace,
  session: AssetAuthoringSession,
  metadataPath: string,
  expectedDigest: Sha256Digest,
  contractPath: string,
): ArtifactMetadataSummary {
  let metadataSnapshot: AssetPackBoundedFileSnapshot;
  try {
    metadataSnapshot = readBoundedAssetPackFile({
      root: workspace.root,
      filePath: metadataPath,
      label: 'Authoring artifact metadata',
      maximumBytes: MAX_CANDIDATE_BYTES,
    });
  } catch (error) {
    captureFailure(error, 'contract');
  }
  let value: unknown;
  try {
    value = JSON.parse(metadataSnapshot.bytes.toString('utf8')) as unknown;
  } catch (error) {
    fail(
      'asset_authoring_artifact_metadata_invalid',
      error instanceof Error ? error.message : 'Authoring artifact metadata JSON is invalid.',
      metadataPath,
    );
  }
  const document = jsonObject(value, 'artifact metadata');
  if (document.schema !== ARTIFACT_METADATA_SCHEMA) {
    fail('asset_authoring_artifact_metadata_invalid', 'Authoring artifact metadata schema is unsupported.', metadataPath);
  }
  if (document.sessionId !== session.sessionId || document.contractDigest !== expectedDigest) {
    fail('asset_authoring_contract_stale', 'Authoring artifact metadata is not bound to this session and contract.', metadataPath);
  }
  const entriesValue = arrayValue(document, 'artifacts', 'artifact metadata');
  const restrictedPaths = new Set<string>();
  const restrictedDigests = new Set<Sha256Digest>();
  const sessionDirectory = path.dirname(path.dirname(metadataPath));
  let foundContract = false;
  entriesValue.forEach((entryValue, index) => {
    const label = `artifact metadata.artifacts[${index}]`;
    const entry = jsonObject(entryValue, label);
    const id = stringValue(entry, 'id', label);
    const kind = stringValue(entry, 'kind', label);
    if (!ARTIFACT_KINDS.has(kind)) fail('asset_authoring_artifact_metadata_invalid', `${label}.kind is unsupported.`, metadataPath);
    const artifactPath = stringValue(entry, 'path', label);
    const artifactDigest = digestValue(entry, 'digest', label);
    if (
      !path.isAbsolute(artifactPath)
      || !isInsideRoot(sessionDirectory, artifactPath)
      || !isInsideRoot(workspace.root, artifactPath)
    ) {
      fail('asset_authoring_artifact_metadata_invalid', `${label}.path escapes the session artifact root.`, artifactPath);
    }
    if (entry.importable !== false || entry.sessionId !== session.sessionId || entry.contractDigest !== expectedDigest) {
      fail('asset_authoring_artifact_metadata_invalid', `${label} is not bound to this session and contract.`, artifactPath);
    }
    let artifactSnapshot: AssetPackBoundedFileSnapshot;
    try {
      artifactSnapshot = readBoundedAssetPackFile({
        root: workspace.root,
        filePath: artifactPath,
        label: `Authoring artifact ${id}`,
        maximumBytes: MAX_CANDIDATE_BYTES,
      });
    } catch (error) {
      captureFailure(error, 'contract');
    }
    if (sha256(artifactSnapshot.bytes) !== artifactDigest) {
      fail('asset_authoring_artifact_metadata_invalid', `${label} digest does not match its bytes.`, artifactPath);
    }
    if (kind === 'contract') {
      if (artifactPath !== contractPath || artifactDigest !== expectedDigest) {
        fail('asset_authoring_contract_stale', 'The contract metadata does not match the bound contract.', artifactPath);
      }
      foundContract = true;
    } else {
      restrictedPaths.add(path.resolve(artifactPath));
      restrictedDigests.add(artifactDigest);
    }
  });
  if (!foundContract) fail('asset_authoring_artifact_metadata_invalid', 'Contract artifact metadata is missing.', metadataPath);
  return {
    restrictedPaths,
    restrictedDigests,
    digest: sha256(metadataSnapshot.bytes),
  };
}

function syntheticPreflightPack(target: SpriteDrawingTarget): ReturnType<typeof normalizeAssetPack> {
  const parsed = parseAssetPackSource({
    schema: ASSET_PACK_SCHEMA,
    id: 'lpc-toolkit.authoring-candidate',
    version: '1.0.0',
    displayName: 'Authoring candidate preflight',
    credits: {
      authors: ['LPC Toolkit'],
      licenses: ['GPL 3.0'],
      urls: [],
      notes: 'Internal PNG preflight.',
    },
    assets: [{
      kind: 'new-item',
      localId: 'candidate',
      displayName: 'Candidate',
      typeName: 'hair',
      bodyTypes: ['male'],
      animations: [target.sourceAnimation],
      layers: [{
        id: 'candidate',
        zPos: 0,
        sprites: [{ animation: target.sourceAnimation, source: 'sprites/candidate.png' }],
      }],
    }],
  });
  if (!parsed.ok) {
    fail(
      'asset_authoring_contract_invalid',
      `Contract target animation cannot be preflighted: ${parsed.diagnostics.map((diagnostic) => diagnostic.message).join(' ')}`,
    );
  }
  return normalizeAssetPack(parsed.source);
}

async function decodeCandidate(
  target: SpriteDrawingTarget,
  bytes: Buffer,
  candidatePath: string,
): Promise<Awaited<ReturnType<typeof nodeAssetPackPngDecoder.decode>>> {
  if (target.geometry.canvasWidth * target.geometry.canvasHeight > MAX_DECODED_PIXELS) {
    fail('asset_authoring_candidate_resource_limit', 'Contract geometry exceeds the decoded PNG resource limit.', candidatePath);
  }
  validatePngChunkCrcs(bytes, candidatePath);
  const pack = syntheticPreflightPack(target);
  const sourceBytes = new Map<string, Uint8Array>([['sprites/candidate.png', bytes]]);
  const sourceDigests = new Map<string, Sha256Digest>([['sprites/candidate.png', sha256(bytes)]]);
  const inspections = await inspectAssetPackSourceBytes({
    pack,
    sourceBytes,
    sourceDigests,
    decoder: nodeAssetPackPngDecoder,
  });
  const inspection = inspections[0];
  if (inspection === undefined || inspection.error !== undefined || inspection.decoded === undefined) {
    fail('asset_authoring_candidate_png_invalid', 'Candidate PNG failed the existing PNG preflight.', candidatePath);
  }
  if (
    inspection.decoded.width !== target.geometry.canvasWidth
    || inspection.decoded.height !== target.geometry.canvasHeight
  ) {
    fail('asset_authoring_candidate_geometry_mismatch', 'Candidate PNG dimensions do not match the contract geometry.', candidatePath);
  }
  try {
    const decoded = await nodeAssetPackPngDecoder.decode(bytes);
    if (
      decoded.width !== target.geometry.canvasWidth
      || decoded.height !== target.geometry.canvasHeight
      || decoded.pixels.byteLength !== decoded.width * decoded.height * 4
    ) {
      fail('asset_authoring_candidate_decode_failed', 'Candidate PNG decode dimensions or RGBA pixels are invalid.', candidatePath);
    }
    return decoded;
  } catch (error) {
    fail(
      'asset_authoring_candidate_decode_failed',
      error instanceof Error ? error.message : 'Candidate PNG could not be decoded.',
      candidatePath,
    );
  }
}

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb8_8320);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function validatePngChunkCrcs(bytes: Uint8Array, candidatePath: string): void {
  if (bytes.byteLength < 8) {
    fail('asset_authoring_candidate_png_invalid', 'Candidate PNG is truncated.', candidatePath);
  }
  let offset = 8;
  let foundEnd = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) {
      fail('asset_authoring_candidate_png_invalid', 'Candidate PNG has a truncated chunk.', candidatePath);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = view.getUint32(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.byteLength) {
      fail('asset_authoring_candidate_png_invalid', 'Candidate PNG chunk exceeds its byte bound.', candidatePath);
    }
    const expected = view.getUint32(offset + 8 + length);
    const actual = pngCrc32(bytes.subarray(offset + 4, offset + 8 + length));
    if (expected !== actual) {
      fail('asset_authoring_candidate_png_invalid', 'Candidate PNG contains a corrupt chunk CRC.', candidatePath);
    }
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    offset = chunkEnd;
    if (type === 'IEND') {
      foundEnd = true;
      break;
    }
  }
  if (!foundEnd || offset !== bytes.byteLength) {
    fail('asset_authoring_candidate_png_invalid', 'Candidate PNG must end at a valid IEND chunk.', candidatePath);
  }
}

function cellBytes(
  decoded: Awaited<ReturnType<typeof nodeAssetPackPngDecoder.decode>>,
  target: SpriteDrawingTarget,
  rowIndex: number,
  cell: SpriteDrawingCell,
): Buffer {
  const width = target.geometry.frameWidth;
  const height = target.geometry.frameHeight;
  const bytes = Buffer.alloc(width * height * 4);
  let offset = 0;
  for (let row = 0; row < height; row += 1) {
    const start = ((rowIndex * height + row) * decoded.width + cell.sourceColumn * width) * 4;
    const end = start + width * 4;
    bytes.set(decoded.pixels.subarray(start, end), offset);
    offset += width * 4;
  }
  return bytes;
}

function verifyCellPolicies(
  decoded: Awaited<ReturnType<typeof nodeAssetPackPngDecoder.decode>>,
  target: SpriteDrawingTarget,
  candidatePath: string,
): void {
  target.geometry.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell) => {
      const bytes = cellBytes(decoded, target, rowIndex, cell);
      let visible = false;
      for (let offset = 3; offset < bytes.length; offset += 4) {
        if (bytes[offset] !== 0) {
          visible = true;
          break;
        }
      }
      if (cell.policy === 'required-drawn' && !visible) {
        fail(
          'asset_authoring_cell_blank',
          `Required-drawn cell ${String(cell.sourceRow)}:${String(cell.sourceColumn)} is blank.`,
          candidatePath,
        );
      }
      if (cell.policy === 'required-transparent' && visible) {
        fail(
          'asset_authoring_cell_forbidden',
          `Required-transparent cell ${String(cell.sourceRow)}:${String(cell.sourceColumn)} contains pixels.`,
          candidatePath,
        );
      }
      if (cell.policy === 'unchanged' && sha256(bytes) !== cell.baselineDigest) {
        fail(
          'asset_authoring_unchanged_cell_changed',
          `Unchanged cell ${String(cell.sourceRow)}:${String(cell.sourceColumn)} differs from its baseline.`,
          candidatePath,
        );
      }
    });
  });
}

function readCandidate(
  workspace: AssetWorkspace,
  candidatePath: string,
): AssetPackBoundedFileSnapshot {
  try {
    return readBoundedAssetPackFile({
      root: workspace.root,
      filePath: candidatePath,
      label: 'Authoring candidate',
      maximumBytes: MAX_CANDIDATE_BYTES,
    });
  } catch (error) {
    captureFailure(error, 'candidate');
  }
}

function readCurrentTarget(
  session: AssetAuthoringSession,
  targetPath: string,
): AssetPackBoundedFileSnapshot | undefined {
  try {
    return readOptionalBoundedAssetPackFile({
      root: session.packRoot,
      filePath: targetPath,
      label: 'Asset-pack target',
      maximumBytes: MAX_CANDIDATE_BYTES,
    });
  } catch (error) {
    captureFailure(error, 'target');
  }
}

export async function importAssetAuthoringCandidate(options: {
  readonly workspace: AssetWorkspace;
  readonly session: AssetAuthoringSession;
  readonly targetId: string;
  readonly candidatePath: string;
  readonly contractDigest: string;
  readonly replaceExisting: boolean;
  readonly expectedTargetDigest?: string;
}): Promise<AssetAuthoringImportResult> {
  if (!isDigest(options.contractDigest)) {
    fail('invalid_option', '--contract-digest must be a sha256 digest.', '--contract-digest');
  }
  if (options.replaceExisting && !isDigest(options.expectedTargetDigest)) {
    fail('invalid_option', '--expected-target-digest is required with --replace-existing.', '--expected-target-digest');
  }
  if (!options.replaceExisting && options.expectedTargetDigest !== undefined) {
    fail('invalid_option', '--expected-target-digest requires --replace-existing.', '--expected-target-digest');
  }
  if (options.session.conflict !== null) {
    fail('asset_authoring_manifest_conflict', 'Resolve the session manifest conflict before importing a candidate.');
  }
  if (
    options.session.checkpointFreshness !== 'current'
    || (options.session.phase !== 'contract-ready' && options.session.phase !== 'imported')
  ) {
    fail('asset_authoring_contract_stale', 'The authoring session does not have a current drawing contract.');
  }
  const expectedContractDigest = options.contractDigest as Sha256Digest;
  if (
    options.session.phase === 'contract-ready'
    && (
      options.session.checkpoint?.id !== 'contract'
      || options.session.checkpoint.digest !== expectedContractDigest
      || options.session.checkpoint.phase !== 'contract-ready'
      || options.session.checkpoint.freshness !== 'current'
    )
  ) {
    fail('asset_authoring_contract_stale', 'The requested contract is not the session current contract.');
  }

  const contractFiles = readContractFile(options.workspace, options.session, expectedContractDigest);
  const metadata = readMetadata(
    options.workspace,
    options.session,
    contractFiles.metadataPath,
    expectedContractDigest,
    contractFiles.contractPath,
  );
  const target = contractFiles.contract.targets.find((entry) => entry.id === options.targetId);
  if (target === undefined) {
    fail('asset_authoring_target_invalid', `Unknown contract target id: ${options.targetId}.`, options.targetId);
  }
  const destinationPath = path.resolve(options.session.packRoot, target.path);
  if (
    !isInsideRoot(options.session.packRoot, destinationPath)
    || destinationPath === path.resolve(options.session.packRoot)
  ) {
    fail('asset_authoring_target_invalid', 'Contract target escapes its artist-pack root.', destinationPath);
  }

  const candidatePath = path.resolve(options.candidatePath);
  const contractArtifactsRoot = path.dirname(contractFiles.metadataPath);
  if (!isInsideRoot(options.workspace.root, candidatePath)) {
    fail('asset_authoring_candidate_outside_workspace', 'Candidate must remain inside the workspace.', candidatePath);
  }
  if (isInsideRoot(contractArtifactsRoot, candidatePath)) {
    fail('asset_authoring_candidate_artifact_confusion', 'Contract artifacts are not candidate staging files.', candidatePath);
  }
  if (candidatePath === destinationPath) {
    fail('asset_authoring_candidate_target_conflict', 'Candidate staging path must not be the contract destination.', candidatePath);
  }
  const candidateSnapshot = readCandidate(options.workspace, candidatePath);
  const candidateDigest = sha256(candidateSnapshot.bytes);
  if (
    metadata.restrictedPaths.has(candidatePath)
    || metadata.restrictedDigests.has(candidateDigest)
  ) {
    fail('asset_authoring_candidate_artifact_confusion', 'Candidate bytes or path match a non-importable contract artifact.', candidatePath);
  }

  const manifestPath = path.join(options.session.packRoot, 'asset-pack.json');
  let manifestSnapshot: AssetPackBoundedFileSnapshot;
  try {
    manifestSnapshot = readBoundedAssetPackFile({
      root: options.workspace.root,
      filePath: manifestPath,
      label: 'Authoring asset-pack manifest',
      maximumBytes: MAX_CANDIDATE_BYTES,
    });
  } catch (error) {
    captureFailure(error, 'target');
  }
  if (
    options.session.manifestDigest === null
    || sha256(manifestSnapshot.bytes) !== options.session.manifestDigest
  ) {
    fail('asset_authoring_manifest_stale', 'The asset-pack manifest no longer matches the session revision.', manifestPath);
  }

  const decoded = await decodeCandidate(target, candidateSnapshot.bytes, candidatePath);
  verifyCellPolicies(decoded, target, candidatePath);

  const currentTarget = readCurrentTarget(options.session, destinationPath);
  const currentDigest = currentTarget === undefined ? null : sha256(currentTarget.bytes);
  const targetCheckpoint = options.session.checkpoints.find((entry) => entry.targetId === target.path);
  const priorImportDigest = targetCheckpoint?.checkpoint?.id === `import:${target.id}`
    && targetCheckpoint.checkpoint.phase === 'imported'
    && targetCheckpoint.checkpoint.freshness === 'current'
    && targetCheckpoint.freshness === 'current'
    ? targetCheckpoint.checkpoint.digest
    : undefined;
  if (currentDigest !== null) {
    const sessionOwnedCorrection = priorImportDigest === currentDigest;
    if (!sessionOwnedCorrection) {
      if (!options.replaceExisting) {
        fail('asset_authoring_replacement_required', 'Replacing an existing target requires --replace-existing and its exact digest.', destinationPath);
      }
      if (options.expectedTargetDigest !== currentDigest) {
        fail('asset_authoring_target_digest_mismatch', 'The existing target does not match --expected-target-digest.', destinationPath);
      }
    } else if (
      options.replaceExisting
      && options.expectedTargetDigest !== undefined
      && options.expectedTargetDigest !== currentDigest
    ) {
      fail('asset_authoring_target_digest_mismatch', 'The session-owned target does not match --expected-target-digest.', destinationPath);
    }
  } else if (options.replaceExisting || options.expectedTargetDigest !== undefined) {
    fail('asset_authoring_target_digest_mismatch', 'Replacement authorization was supplied for a missing target.', destinationPath);
  }

  let candidateAfterValidation: AssetPackBoundedFileSnapshot;
  try {
    candidateAfterValidation = readBoundedAssetPackFile({
      root: options.workspace.root,
      filePath: candidatePath,
      label: 'Authoring candidate',
      maximumBytes: MAX_CANDIDATE_BYTES,
    });
  } catch (error) {
    captureFailure(error, 'candidate');
  }
  if (
    candidateAfterValidation.identity !== candidateSnapshot.identity
    || !candidateAfterValidation.bytes.equals(candidateSnapshot.bytes)
  ) {
    fail('asset_authoring_candidate_changed', 'Candidate bytes changed during inspection.', candidatePath);
  }

  let publication: { readonly targetPath: string; readonly digest: Sha256Digest };
  try {
    publication = atomicallyReplaceAssetPackSource({
      root: options.session.packRoot,
      sourcePath: target.path,
      bytes: candidateSnapshot.bytes,
      maximumBytes: MAX_CANDIDATE_BYTES,
      expectedTargetDigest: currentDigest,
    });
  } catch (error) {
    if (error instanceof AssetPackAtomicReplacementError) {
      fail(
        error.code === 'asset_digest_mismatch'
          ? 'asset_authoring_target_changed'
          : error.code === 'asset_source_symlink'
            ? 'asset_authoring_target_symlink'
            : 'asset_authoring_atomic_publish_failed',
        error.message,
        error.targetPath,
      );
    }
    throw error;
  }
  return {
    contractPath: contractFiles.contractPath,
    contractDigest: expectedContractDigest,
    metadataPath: contractFiles.metadataPath,
    metadataDigest: metadata.digest,
    candidatePath,
    candidateDigest,
    logicalTargetPath: target.path,
    targetPath: publication.targetPath,
    targetDigest: publication.digest,
  };
}
