import { ASSET_AUTHORING_RELEASE_ARTIFACT_IDS } from './asset-release-schema.js';

export const ASSET_RELEASE_PROVENANCE_SCHEMA =
  'lpc-toolkit.asset-release-provenance.v1' as const;

export type AssetReleaseProvenanceDiagnosticCode =
  | 'asset_release_provenance_invalid'
  | 'asset_release_provenance_unsupported'
  | 'asset_release_provenance_stale'
  | 'asset_release_provenance_digest_mismatch'
  | 'asset_release_provenance_private_data'
  | 'asset_release_provenance_limit_exceeded';

export interface AssetReleaseProvenanceDiagnostic {
  readonly code: AssetReleaseProvenanceDiagnosticCode;
  readonly message: string;
  readonly path: string;
}

export interface AssetReleaseProvenanceDigestBinding {
  readonly path: string;
  readonly digest: string;
}

export interface AssetReleaseProvenanceArtifactDigest {
  readonly id: string;
  readonly digest: string;
}

export interface AssetReleaseProvenanceReleaseBindings {
  readonly archiveDigest: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly AssetReleaseProvenanceDigestBinding[];
  readonly releaseDeclarationReceiptDigest: string;
  readonly previewAcceptanceReceiptDigest: string;
  readonly previewArtifacts: readonly AssetReleaseProvenanceArtifactDigest[];
}

export interface AssetReleaseProvenancePackIdentity {
  readonly id: string;
  readonly version: string;
}

export type AssetReleaseProvenanceRecord =
  | AssetReleaseProvenanceProviderOutput
  | AssetReleaseProvenanceExternalInput
  | AssetReleaseProvenanceSourceTransformation;

export interface AssetReleaseProvenanceProviderIdentifier {
  readonly id: string;
  readonly tool: string;
  readonly model?: string;
}

export interface AssetReleaseProvenanceProviderOutput {
  readonly kind: 'provider-output';
  readonly targetId: string;
  readonly contractDigest: string;
  readonly provider: AssetReleaseProvenanceProviderIdentifier;
  readonly inputDigests?: readonly string[];
  readonly referenceDigests?: readonly string[];
  readonly promptDigest?: string;
  readonly resultDigest: string;
}

export interface AssetReleaseProvenanceExternalInput {
  readonly kind: 'external-input';
  readonly targetId: string;
  readonly contractDigest?: string;
  readonly referenceDigests?: readonly string[];
  readonly resultDigest: string;
}

export type AssetReleaseProvenanceOperation =
  | 'candidate-import'
  | 'crop'
  | 'resize'
  | 'recolor'
  | 'variant'
  | 'custom-geometry'
  | 'multi-layer'
  | 'format-conversion'
  | 'manual-edit';

export interface AssetReleaseProvenanceSourceTransformation {
  readonly kind: 'source-transformation';
  readonly targetId: string;
  readonly contractDigest?: string;
  readonly inputDigests: readonly string[];
  readonly referenceDigests?: readonly string[];
  readonly operation: AssetReleaseProvenanceOperation;
  readonly resultDigest: string;
}

export interface AssetReleaseProvenanceProjection {
  readonly pack: AssetReleaseProvenancePackIdentity;
  readonly releaseBindings: AssetReleaseProvenanceReleaseBindings;
  readonly records: readonly AssetReleaseProvenanceRecord[];
}

export interface AssetReleaseProvenanceReceipt {
  readonly schema: typeof ASSET_RELEASE_PROVENANCE_SCHEMA;
  readonly projection: AssetReleaseProvenanceProjection;
  readonly projectionDigest: string;
}

export type AssetReleaseProvenanceParseResult =
  | { readonly ok: true; readonly receipt: AssetReleaseProvenanceReceipt }
  | { readonly ok: false; readonly diagnostics: readonly AssetReleaseProvenanceDiagnostic[] };

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const MAX_RECORDS = 128;
const MAX_DIGESTS_PER_RECORD = 64;
const MAX_IDENTIFIER_BYTES = 256;
const PROVENANCE_OPERATIONS: readonly AssetReleaseProvenanceOperation[] = [
  'candidate-import',
  'crop',
  'resize',
  'recolor',
  'variant',
  'custom-geometry',
  'multi-layer',
  'format-conversion',
  'manual-edit',
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnostic(
  code: AssetReleaseProvenanceDiagnosticCode,
  path: string,
  message: string,
): AssetReleaseProvenanceDiagnostic {
  return { code, message, path };
}

function invalid(path: string, message: string): AssetReleaseProvenanceDiagnostic {
  return diagnostic('asset_release_provenance_invalid', path, message);
}

function exactKeys(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      diagnostics.push(invalid(`${path}.${key}`, `Unknown field at ${path}.${key}.`));
    }
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function utf8Bytes(value: string): readonly number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(
        0xc0 | (codePoint >> 6),
        0x80 | (codePoint & 0x3f),
      );
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = utf8Bytes(left);
  const rightBytes = utf8Bytes(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const leftByte = leftBytes[index];
    const rightByte = rightBytes[index];
    if (leftByte === undefined || rightByte === undefined) continue;
    if (leftByte !== rightByte) return leftByte - rightByte;
  }
  return leftBytes.length - rightBytes.length;
}

function isSorted(
  values: readonly string[],
): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return previous === undefined || compareUtf8(previous, value) < 0;
  });
}

function requiredRecord(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): JsonRecord | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, `${path} must be an object.`));
    return undefined;
  }
  return value;
}

function requiredString(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): string | undefined {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    diagnostics.push(invalid(path, `${path} must be a non-empty string.`));
    return undefined;
  }
  return value;
}

function requiredDigest(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    diagnostics.push(invalid(path, `${path} must be a sha256 digest.`));
    return undefined;
  }
  return value;
}

function optionalDigest(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): string | undefined {
  if (record[key] === undefined) return undefined;
  return requiredDigest(record[key], path, diagnostics);
}

function identifierIsPrivate(value: string): boolean {
  return value.startsWith('/')
    || value.startsWith('~')
    || /^[A-Za-z]:[\\/]/u.test(value)
    || value.includes('\\')
    || value.includes('://')
    || value.includes('?')
    || value.includes('#')
    || /(?:bearer|api[_-]?key|password|cookie|secret)\s*[:=]/iu.test(value)
    || value.includes('\u0000');
}

function requiredIdentifier(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): string | undefined {
  const value = requiredString(record, key, path, diagnostics);
  if (value === undefined) return undefined;
  if (utf8ByteLength(value) > MAX_IDENTIFIER_BYTES) {
    diagnostics.push(diagnostic(
      'asset_release_provenance_limit_exceeded',
      path,
      `${path} exceeds ${MAX_IDENTIFIER_BYTES} UTF-8 bytes.`,
    ));
  }
  if (identifierIsPrivate(value)) {
    diagnostics.push(diagnostic(
      'asset_release_provenance_private_data',
      path,
      `${path} contains a path, URL, secret, or private value.`,
    ));
  }
  return value;
}

function parseDigestArray(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
  required: boolean,
): readonly string[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  if (value.length > MAX_DIGESTS_PER_RECORD) {
    diagnostics.push(diagnostic(
      'asset_release_provenance_limit_exceeded',
      path,
      `${path} exceeds ${MAX_DIGESTS_PER_RECORD} digests.`,
    ));
  }
  const digests: string[] = [];
  value.forEach((entry, index) => {
    const digest = requiredDigest(entry, `${path}[${index}]`, diagnostics);
    if (digest !== undefined) digests.push(digest);
  });
  if (new Set(digests).size !== digests.length) {
    diagnostics.push(invalid(path, `${path} must not contain duplicate digests.`));
  }
  if (required && digests.length === 0) {
    diagnostics.push(invalid(path, `${path} must contain at least one digest.`));
  }
  if (!isSorted(digests)) {
    diagnostics.push(invalid(path, `${path} must be sorted by digest.`));
  }
  return digests;
}

function parseSourceDigests(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): readonly AssetReleaseProvenanceDigestBinding[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  const entries: AssetReleaseProvenanceDigestBinding[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requiredRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, ['path', 'digest'], diagnostics);
    const sourcePath = requiredString(record, 'path', `${entryPath}.path`, diagnostics);
    const digest = requiredDigest(record.digest, `${entryPath}.digest`, diagnostics);
    if (sourcePath !== undefined) {
      const segments = sourcePath.split('/');
      if (
        !sourcePath.startsWith('sprites/')
        || sourcePath.includes('\\')
        || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
        || identifierIsPrivate(sourcePath)
      ) {
        diagnostics.push(diagnostic(
          'asset_release_provenance_private_data',
          `${entryPath}.path`,
          `${entryPath}.path must be a normalized pack-relative sprite path.`,
        ));
      }
    }
    if (sourcePath !== undefined && digest !== undefined) {
      entries.push({ path: sourcePath, digest });
    }
  });
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    diagnostics.push(invalid(path, `${path} must not contain duplicate paths.`));
  }
  if (!isSorted(paths)) {
    diagnostics.push(invalid(path, `${path} must be sorted by path.`));
  }
  return entries;
}

function parsePreviewArtifacts(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): readonly AssetReleaseProvenanceArtifactDigest[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  if (value.length !== ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length) {
    diagnostics.push(invalid(
      path,
      `${path} must contain every release preview artifact exactly once.`,
    ));
  }
  const artifacts: AssetReleaseProvenanceArtifactDigest[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requiredRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, ['id', 'digest'], diagnostics);
    const id = requiredString(record, 'id', `${entryPath}.id`, diagnostics);
    const digest = requiredDigest(record.digest, `${entryPath}.digest`, diagnostics);
    if (id !== undefined && !ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.includes(id as typeof ASSET_AUTHORING_RELEASE_ARTIFACT_IDS[number])) {
      diagnostics.push(invalid(`${entryPath}.id`, `${entryPath}.id is not a release preview artifact.`));
    }
    if (id !== undefined && digest !== undefined) artifacts.push({ id, digest });
  });
  const ids = artifacts.map((artifact) => artifact.id);
  if (new Set(ids).size !== ids.length) {
    diagnostics.push(invalid(path, `${path} must not contain duplicate artifact ids.`));
  }
  if (
    new Set(ids).size !== ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length
    || !ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.every((artifactId) => ids.includes(artifactId))
  ) {
    diagnostics.push(invalid(path, `${path} must contain the canonical release artifact ids.`));
  }
  if (!isSorted(ids)) {
    diagnostics.push(invalid(path, `${path} must be sorted by artifact id.`));
  }
  return artifacts;
}

function parseProvider(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): AssetReleaseProvenanceProviderIdentifier | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['id', 'tool', 'model'], diagnostics);
  const id = requiredIdentifier(record, 'id', `${path}.id`, diagnostics);
  const tool = requiredIdentifier(record, 'tool', `${path}.tool`, diagnostics);
  const model = record.model === undefined
    ? undefined
    : requiredIdentifier(record, 'model', `${path}.model`, diagnostics);
  if (id === undefined || tool === undefined) return undefined;
  return {
    id,
    tool,
    ...(model === undefined ? {} : { model }),
  };
}

function parseRecord(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): AssetReleaseProvenanceRecord | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  const kind = requiredString(record, 'kind', `${path}.kind`, diagnostics);
  if (kind === 'provider-output') {
    exactKeys(record, path, [
      'kind',
      'targetId',
      'contractDigest',
      'provider',
      'inputDigests',
      'referenceDigests',
      'promptDigest',
      'resultDigest',
    ], diagnostics);
    const targetId = requiredIdentifier(record, 'targetId', `${path}.targetId`, diagnostics);
    const contractDigest = requiredDigest(record.contractDigest, `${path}.contractDigest`, diagnostics);
    const provider = parseProvider(record.provider, `${path}.provider`, diagnostics);
    const inputDigests = parseDigestArray(record.inputDigests, `${path}.inputDigests`, diagnostics, false);
    const referenceDigests = parseDigestArray(record.referenceDigests, `${path}.referenceDigests`, diagnostics, false);
    const promptDigest = optionalDigest(record, 'promptDigest', `${path}.promptDigest`, diagnostics);
    const resultDigest = requiredDigest(record.resultDigest, `${path}.resultDigest`, diagnostics);
    if (
      targetId === undefined
      || contractDigest === undefined
      || provider === undefined
      || resultDigest === undefined
    ) return undefined;
    return {
      kind,
      targetId,
      contractDigest,
      provider,
      ...(inputDigests === undefined ? {} : { inputDigests }),
      ...(referenceDigests === undefined ? {} : { referenceDigests }),
      ...(promptDigest === undefined ? {} : { promptDigest }),
      resultDigest,
    };
  }
  if (kind === 'external-input') {
    exactKeys(record, path, [
      'kind',
      'targetId',
      'contractDigest',
      'referenceDigests',
      'resultDigest',
    ], diagnostics);
    const targetId = requiredIdentifier(record, 'targetId', `${path}.targetId`, diagnostics);
    const contractDigest = optionalDigest(record, 'contractDigest', `${path}.contractDigest`, diagnostics);
    const referenceDigests = parseDigestArray(record.referenceDigests, `${path}.referenceDigests`, diagnostics, false);
    const resultDigest = requiredDigest(record.resultDigest, `${path}.resultDigest`, diagnostics);
    if (targetId === undefined || resultDigest === undefined) return undefined;
    return {
      kind,
      targetId,
      ...(contractDigest === undefined ? {} : { contractDigest }),
      ...(referenceDigests === undefined ? {} : { referenceDigests }),
      resultDigest,
    };
  }
  if (kind === 'source-transformation') {
    exactKeys(record, path, [
      'kind',
      'targetId',
      'contractDigest',
      'inputDigests',
      'referenceDigests',
      'operation',
      'resultDigest',
    ], diagnostics);
    const targetId = requiredIdentifier(record, 'targetId', `${path}.targetId`, diagnostics);
    const contractDigest = optionalDigest(record, 'contractDigest', `${path}.contractDigest`, diagnostics);
    const inputDigests = parseDigestArray(record.inputDigests, `${path}.inputDigests`, diagnostics, true);
    const referenceDigests = parseDigestArray(record.referenceDigests, `${path}.referenceDigests`, diagnostics, false);
    const operation = requiredString(record, 'operation', `${path}.operation`, diagnostics);
    if (operation !== undefined) {
      if (!PROVENANCE_OPERATIONS.includes(operation as AssetReleaseProvenanceOperation)) {
        diagnostics.push(invalid(`${path}.operation`, `${path}.operation is not supported.`));
      } else if (utf8ByteLength(operation) > MAX_IDENTIFIER_BYTES) {
        diagnostics.push(diagnostic(
          'asset_release_provenance_limit_exceeded',
          `${path}.operation`,
          `${path}.operation exceeds ${MAX_IDENTIFIER_BYTES} UTF-8 bytes.`,
        ));
      }
    }
    const resultDigest = requiredDigest(record.resultDigest, `${path}.resultDigest`, diagnostics);
    if (
      targetId === undefined
      || inputDigests === undefined
      || operation === undefined
      || !PROVENANCE_OPERATIONS.includes(operation as AssetReleaseProvenanceOperation)
      || resultDigest === undefined
    ) return undefined;
    return {
      kind,
      targetId,
      ...(contractDigest === undefined ? {} : { contractDigest }),
      inputDigests,
      ...(referenceDigests === undefined ? {} : { referenceDigests }),
      operation: operation as AssetReleaseProvenanceOperation,
      resultDigest,
    };
  }
  diagnostics.push(invalid(`${path}.kind`, `${path}.kind is not supported.`));
  return undefined;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compareUtf8)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalRecordText(record: AssetReleaseProvenanceRecord): string {
  return JSON.stringify(canonicalize(record));
}

function parseProjection(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseProvenanceDiagnostic[],
): AssetReleaseProvenanceProjection | undefined {
  const projection = requiredRecord(value, path, diagnostics);
  if (!projection) return undefined;
  exactKeys(projection, path, ['pack', 'releaseBindings', 'records'], diagnostics);

  const packPath = `${path}.pack`;
  const pack = requiredRecord(projection.pack, packPath, diagnostics);
  let packIdentity: AssetReleaseProvenancePackIdentity | undefined;
  if (pack) {
    exactKeys(pack, packPath, ['id', 'version'], diagnostics);
    const id = requiredIdentifier(pack, 'id', `${packPath}.id`, diagnostics);
    const version = requiredString(pack, 'version', `${packPath}.version`, diagnostics);
    if (version !== undefined && !SEMVER_PATTERN.test(version)) {
      diagnostics.push(invalid(`${packPath}.version`, `${packPath}.version must be a semantic version.`));
    }
    if (id !== undefined && version !== undefined && SEMVER_PATTERN.test(version)) {
      packIdentity = { id, version };
    }
  }

  const bindingsPath = `${path}.releaseBindings`;
  const bindings = requiredRecord(projection.releaseBindings, bindingsPath, diagnostics);
  let releaseBindings: AssetReleaseProvenanceReleaseBindings | undefined;
  if (bindings) {
    exactKeys(bindings, bindingsPath, [
      'archiveDigest',
      'manifestDigest',
      'contentDigest',
      'sourceDigests',
      'releaseDeclarationReceiptDigest',
      'previewAcceptanceReceiptDigest',
      'previewArtifacts',
    ], diagnostics);
    const archiveDigest = requiredDigest(bindings.archiveDigest, `${bindingsPath}.archiveDigest`, diagnostics);
    const manifestDigest = requiredDigest(bindings.manifestDigest, `${bindingsPath}.manifestDigest`, diagnostics);
    const contentDigest = requiredDigest(bindings.contentDigest, `${bindingsPath}.contentDigest`, diagnostics);
    const sourceDigests = parseSourceDigests(bindings.sourceDigests, `${bindingsPath}.sourceDigests`, diagnostics);
    const releaseDeclarationReceiptDigest = requiredDigest(
      bindings.releaseDeclarationReceiptDigest,
      `${bindingsPath}.releaseDeclarationReceiptDigest`,
      diagnostics,
    );
    const previewAcceptanceReceiptDigest = requiredDigest(
      bindings.previewAcceptanceReceiptDigest,
      `${bindingsPath}.previewAcceptanceReceiptDigest`,
      diagnostics,
    );
    const previewArtifacts = parsePreviewArtifacts(
      bindings.previewArtifacts,
      `${bindingsPath}.previewArtifacts`,
      diagnostics,
    );
    if (
      archiveDigest !== undefined
      && manifestDigest !== undefined
      && contentDigest !== undefined
      && sourceDigests !== undefined
      && releaseDeclarationReceiptDigest !== undefined
      && previewAcceptanceReceiptDigest !== undefined
      && previewArtifacts !== undefined
    ) {
      releaseBindings = {
        archiveDigest,
        manifestDigest,
        contentDigest,
        sourceDigests,
        releaseDeclarationReceiptDigest,
        previewAcceptanceReceiptDigest,
        previewArtifacts,
      };
    }
  }

  const recordsPath = `${path}.records`;
  if (!Array.isArray(projection.records)) {
    diagnostics.push(invalid(recordsPath, `${recordsPath} must be an array.`));
  }
  const rawRecords = Array.isArray(projection.records) ? projection.records : [];
  if (rawRecords.length > MAX_RECORDS) {
    diagnostics.push(diagnostic(
      'asset_release_provenance_limit_exceeded',
      recordsPath,
      `${recordsPath} exceeds ${MAX_RECORDS} records.`,
    ));
  }
  const records: AssetReleaseProvenanceRecord[] = [];
  rawRecords.forEach((record, index) => {
    const parsed = parseRecord(record, `${recordsPath}[${index}]`, diagnostics);
    if (parsed !== undefined) records.push(parsed);
  });
  const recordTexts = records.map(canonicalRecordText);
  if (new Set(recordTexts).size !== recordTexts.length) {
    diagnostics.push(invalid(recordsPath, `${recordsPath} must not contain duplicate records.`));
  }
  if (!isSorted(recordTexts)) {
    diagnostics.push(invalid(recordsPath, `${recordsPath} must be sorted canonically.`));
  }

  if (packIdentity === undefined || releaseBindings === undefined) return undefined;
  return {
    pack: packIdentity,
    releaseBindings,
    records,
  };
}

function recordInputDigests(record: AssetReleaseProvenanceRecord): readonly string[] {
  return 'inputDigests' in record && record.inputDigests !== undefined
    ? record.inputDigests
    : [];
}

function recordsAreReleaseBound(
  records: readonly AssetReleaseProvenanceRecord[],
  sourceDigests: readonly AssetReleaseProvenanceDigestBinding[],
): boolean {
  const sourceSet = new Set(sourceDigests.map((entry) => entry.digest));
  const byResult = new Map<string, AssetReleaseProvenanceRecord[]>();
  records.forEach((record) => {
    const existing = byResult.get(record.resultDigest) ?? [];
    existing.push(record);
    byResult.set(record.resultDigest, existing);
  });
  const resolves = (digest: string, seen: ReadonlySet<string>): boolean => {
    if (sourceSet.has(digest)) return true;
    if (seen.has(digest)) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(digest);
    return (byResult.get(digest) ?? []).some((record) =>
      recordInputDigests(record).some((inputDigest) => resolves(inputDigest, nextSeen)));
  };
  return records.every((record) => resolves(record.resultDigest, new Set()));
}

export function parseAssetReleaseProvenance(
  input: unknown,
): AssetReleaseProvenanceParseResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      diagnostics: [invalid('$', 'Release provenance receipt must be an object.')],
    };
  }
  const diagnostics: AssetReleaseProvenanceDiagnostic[] = [];
  exactKeys(input, '$', ['schema', 'projection', 'projectionDigest'], diagnostics);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  if (input.schema !== ASSET_RELEASE_PROVENANCE_SCHEMA) {
    return {
      ok: false,
      diagnostics: [diagnostic(
        'asset_release_provenance_unsupported',
        '$.schema',
        'Unsupported release provenance schema.',
      )],
    };
  }
  const projectionDigest = requiredDigest(input.projectionDigest, '$.projectionDigest', diagnostics);
  const projection = parseProjection(input.projection, '$.projection', diagnostics);
  if (projection !== undefined && !recordsAreReleaseBound(projection.records, projection.releaseBindings.sourceDigests)) {
    diagnostics.push(invalid(
      '$.projection.records',
      '$.projection.records contains a result that is not bound to release source evidence.',
    ));
  }
  if (projectionDigest === undefined || projection === undefined || diagnostics.length > 0) {
    return {
      ok: false,
      diagnostics,
    };
  }
  return {
    ok: true,
    receipt: input as unknown as AssetReleaseProvenanceReceipt,
  };
}

export function assetReleaseProvenanceProjection(
  projection: AssetReleaseProvenanceProjection,
): AssetReleaseProvenanceProjection {
  const sourceDigests = [...projection.releaseBindings.sourceDigests]
    .map(({ path, digest }) => ({ path, digest }))
    .sort((left, right) => compareUtf8(left.path, right.path));
  const previewArtifacts = [...projection.releaseBindings.previewArtifacts]
    .map(({ id, digest }) => ({ id, digest }))
    .sort((left, right) => compareUtf8(left.id, right.id));
  const records = [...projection.records]
    .map((record) => canonicalize(record) as AssetReleaseProvenanceRecord)
    .sort((left, right) => compareUtf8(canonicalRecordText(left), canonicalRecordText(right)));
  return canonicalize({
    pack: projection.pack,
    releaseBindings: {
      ...projection.releaseBindings,
      sourceDigests,
      previewArtifacts,
    },
    records,
  }) as AssetReleaseProvenanceProjection;
}

/** Returns canonical JSON input for a caller-owned cryptographic digest. */
export function assetReleaseProvenanceProjectionDigestInput(
  projection: AssetReleaseProvenanceProjection,
): string {
  return JSON.stringify(assetReleaseProvenanceProjection(projection));
}
