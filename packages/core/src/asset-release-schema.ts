export const ASSET_RELEASE_DECLARATION_SCHEMA =
  'lpc-toolkit.asset-release-declaration.v1' as const;

export const ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-release-receipt.v1' as const;

export const ASSET_AUTHORING_RELEASE_ARTIFACT_IDS = [
  'preview:preview',
  'preview:metadata',
  'preview:credits_txt',
  'preview:credits_csv',
] as const;

export type AssetAuthoringReleaseArtifactId =
  typeof ASSET_AUTHORING_RELEASE_ARTIFACT_IDS[number];

export type AssetReleaseDeclarantKind = 'person' | 'organization';

export interface AssetReleaseDeclarant {
  readonly displayName: string;
  readonly kind: AssetReleaseDeclarantKind;
  readonly role: 'authorized-release-declarant';
}

export interface AssetReleaseDeclaration {
  readonly schema: typeof ASSET_RELEASE_DECLARATION_SCHEMA;
  readonly expectedManifestDigest: string;
  readonly declarant: AssetReleaseDeclarant;
  readonly authorAndSource: {
    readonly confirmed: true;
    readonly creditDigest: string;
  };
  readonly licenseAuthority: {
    readonly confirmed: true;
    readonly creditDigest: string;
  };
  readonly acknowledgements: {
    readonly confirmed: true;
    readonly contentDigest: string;
    readonly recordDigests: readonly string[];
  };
}

export interface AssetReleaseSourceDigest {
  /** A logical or session-owned source path paired with its exact bytes. */
  readonly path: string;
  readonly digest: string;
}

export interface AssetReleaseAcknowledgementEvidence {
  readonly contentDigest: string;
  readonly recordDigests: readonly string[];
}

export interface AssetAuthoringReleaseArtifactDigest {
  readonly id: AssetAuthoringReleaseArtifactId;
  /** The session-owned path of the exact artifact bytes. */
  readonly path: string;
  readonly digest: string;
}

export interface AssetAuthoringReleaseDeclarationReceipt {
  readonly schema: typeof ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA;
  readonly kind: 'declaration';
  readonly sessionId: string;
  readonly cliVersion: string;
  readonly recordedAt: string;
  readonly declarant: AssetReleaseDeclarant;
  readonly declarationDigest: string;
  readonly manifestDigest: string;
  readonly sourceDigests: readonly AssetReleaseSourceDigest[];
  readonly validationReceiptId: string;
  readonly validationReceiptRevision: string;
  readonly creditDigests: {
    readonly authorAndSource: string;
    readonly licenseAuthority: string;
  };
  readonly acknowledgements: AssetReleaseAcknowledgementEvidence;
}

export interface AssetAuthoringPreviewAcceptanceReceipt {
  readonly schema: typeof ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA;
  readonly kind: 'preview-acceptance';
  readonly sessionId: string;
  readonly cliVersion: string;
  readonly recordedAt: string;
  readonly declarant: AssetReleaseDeclarant;
  readonly declarationReceiptDigest: string;
  readonly manifestDigest: string;
  readonly sourceDigests: readonly AssetReleaseSourceDigest[];
  readonly validationReceiptId: string;
  readonly validationReceiptRevision: string;
  readonly previewReceiptId: string;
  readonly previewInputDigest: string;
  readonly artifacts: readonly AssetAuthoringReleaseArtifactDigest[];
}

export type AssetAuthoringReleaseReceipt =
  | AssetAuthoringReleaseDeclarationReceipt
  | AssetAuthoringPreviewAcceptanceReceipt;

export interface AssetReleaseDiagnostic {
  readonly code:
    | 'asset_release_schema_invalid'
    | 'asset_authoring_release_receipt_invalid';
  readonly message: string;
  readonly path: string;
}

export type AssetReleaseDeclarationParseResult =
  | { readonly ok: true; readonly declaration: AssetReleaseDeclaration }
  | { readonly ok: false; readonly diagnostics: readonly AssetReleaseDiagnostic[] };

export type AssetAuthoringReleaseReceiptParseResult =
  | { readonly ok: true; readonly receipt: AssetAuthoringReleaseReceipt }
  | { readonly ok: false; readonly diagnostics: readonly AssetReleaseDiagnostic[] };

export type AssetAuthoringReleaseGateFreshness =
  | 'missing'
  | 'current'
  | 'stale'
  | 'blocked';

export type AssetAuthoringReleaseGateId =
  | 'acknowledgements'
  | 'validation'
  | 'releaseDeclaration'
  | 'preview'
  | 'previewArtifacts';

export interface AssetAuthoringReleaseGateProjectionInput {
  readonly acknowledgements: AssetAuthoringReleaseGateFreshness;
  readonly validation: AssetAuthoringReleaseGateFreshness;
  readonly releaseDeclaration: AssetAuthoringReleaseGateFreshness;
  readonly preview: AssetAuthoringReleaseGateFreshness;
  readonly previewArtifacts: AssetAuthoringReleaseGateFreshness;
}

export interface AssetAuthoringReleaseGate {
  readonly id: AssetAuthoringReleaseGateId;
  readonly freshness: AssetAuthoringReleaseGateFreshness;
}

export interface AssetAuthoringReleaseGateProjection {
  readonly releaseReady: boolean;
  readonly gates: readonly AssetAuthoringReleaseGate[];
}

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DECLARATION_KEYS = [
  'schema',
  'expectedManifestDigest',
  'declarant',
  'authorAndSource',
  'licenseAuthority',
  'acknowledgements',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnostic(
  path: string,
  message: string,
): AssetReleaseDiagnostic {
  return { code: 'asset_release_schema_invalid', message, path };
}

function exactKeys(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  diagnostics: AssetReleaseDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      diagnostics.push(diagnostic(`${path}.${key}`, `Unknown field at ${path}.${key}.`));
    }
  }
}

function requiredString(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): string | undefined {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(diagnostic(path, `${path} must be a non-empty string.`));
    return undefined;
  }
  return value;
}

function requiredDigest(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): string | undefined {
  const value = requiredString(record, key, path, diagnostics);
  if (value !== undefined && !DIGEST_PATTERN.test(value)) {
    diagnostics.push(diagnostic(path, `${path} must be a sha256 digest.`));
    return undefined;
  }
  return value;
}

function requiredRecord(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): JsonRecord | undefined {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(path, `${path} must be an object.`));
    return undefined;
  }
  return value;
}

function confirmedDigestBlock(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): { readonly confirmed: true; readonly creditDigest: string } | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['confirmed', 'creditDigest'], diagnostics);
  if (record.confirmed !== true) {
    diagnostics.push(diagnostic(`${path}.confirmed`, `${path}.confirmed must be true.`));
  }
  const creditDigest = requiredDigest(record, 'creditDigest', `${path}.creditDigest`, diagnostics);
  if (record.confirmed !== true || creditDigest === undefined) return undefined;
  return { confirmed: true, creditDigest };
}

function parseAcknowledgements(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): AssetReleaseDeclaration['acknowledgements'] | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['confirmed', 'contentDigest', 'recordDigests'], diagnostics);
  if (record.confirmed !== true) {
    diagnostics.push(diagnostic(`${path}.confirmed`, `${path}.confirmed must be true.`));
  }
  const contentDigest = requiredDigest(record, 'contentDigest', `${path}.contentDigest`, diagnostics);
  const rawRecordDigests = record.recordDigests;
  if (!Array.isArray(rawRecordDigests)) {
    diagnostics.push(diagnostic(`${path}.recordDigests`, `${path}.recordDigests must be an array.`));
  }
  const recordDigests = Array.isArray(rawRecordDigests)
    ? rawRecordDigests.flatMap((entry, index) => {
      if (typeof entry !== 'string' || !DIGEST_PATTERN.test(entry)) {
        diagnostics.push(diagnostic(
          `${path}.recordDigests[${index}]`,
          `${path}.recordDigests[${index}] must be a sha256 digest.`,
        ));
        return [];
      }
      return [entry];
    })
    : [];
  if (new Set(recordDigests).size !== recordDigests.length) {
    diagnostics.push(diagnostic(`${path}.recordDigests`, `${path}.recordDigests must not contain duplicates.`));
  }
  if (record.confirmed !== true || contentDigest === undefined) {
    return undefined;
  }
  return {
    confirmed: true,
    contentDigest,
    recordDigests: [...recordDigests].sort(),
  };
}

function parseDeclarant(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): AssetReleaseDeclarant | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['displayName', 'kind', 'role'], diagnostics);
  const displayName = requiredString(record, 'displayName', `${path}.displayName`, diagnostics);
  const kind = record.kind;
  if (kind !== 'person' && kind !== 'organization') {
    diagnostics.push(diagnostic(`${path}.kind`, `${path}.kind must be person or organization.`));
  }
  if (record.role !== 'authorized-release-declarant') {
    diagnostics.push(diagnostic(
      `${path}.role`,
      `${path}.role must be authorized-release-declarant.`,
    ));
  }
  if (displayName === undefined || (kind !== 'person' && kind !== 'organization') || record.role !== 'authorized-release-declarant') {
    return undefined;
  }
  return {
    displayName,
    kind,
    role: 'authorized-release-declarant',
  };
}

export function parseAssetReleaseDeclaration(
  input: unknown,
): AssetReleaseDeclarationParseResult {
  const diagnostics: AssetReleaseDiagnostic[] = [];
  const record = requiredRecord(input, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', DECLARATION_KEYS, diagnostics);
  if (record.schema !== ASSET_RELEASE_DECLARATION_SCHEMA) {
    diagnostics.push(diagnostic('$.schema', `Unsupported release declaration schema at $.schema.`));
  }
  const expectedManifestDigest = requiredDigest(
    record,
    'expectedManifestDigest',
    '$.expectedManifestDigest',
    diagnostics,
  );
  const declarant = parseDeclarant(record.declarant, '$.declarant', diagnostics);
  const authorAndSource = confirmedDigestBlock(
    record.authorAndSource,
    '$.authorAndSource',
    diagnostics,
  );
  const licenseAuthority = confirmedDigestBlock(
    record.licenseAuthority,
    '$.licenseAuthority',
    diagnostics,
  );
  const acknowledgements = parseAcknowledgements(
    record.acknowledgements,
    '$.acknowledgements',
    diagnostics,
  );
  if (diagnostics.length > 0 || expectedManifestDigest === undefined || declarant === undefined
    || authorAndSource === undefined || licenseAuthority === undefined || acknowledgements === undefined) {
    return {
      ok: false,
      diagnostics: [...diagnostics].sort((left, right) => left.path.localeCompare(right.path)),
    };
  }
  return {
    ok: true,
    declaration: assetReleaseDeclarationProjection({
      schema: ASSET_RELEASE_DECLARATION_SCHEMA,
      expectedManifestDigest,
      declarant,
      authorAndSource,
      licenseAuthority,
      acknowledgements,
    }),
  };
}

const RECEIPT_COMMON_KEYS = [
  'schema',
  'kind',
  'sessionId',
  'cliVersion',
  'recordedAt',
  'declarant',
] as const;

const DECLARATION_RECEIPT_KEYS = [
  ...RECEIPT_COMMON_KEYS,
  'declarationDigest',
  'manifestDigest',
  'sourceDigests',
  'validationReceiptId',
  'validationReceiptRevision',
  'creditDigests',
  'acknowledgements',
] as const;

const PREVIEW_ACCEPTANCE_RECEIPT_KEYS = [
  ...RECEIPT_COMMON_KEYS,
  'declarationReceiptDigest',
  'manifestDigest',
  'sourceDigests',
  'validationReceiptId',
  'validationReceiptRevision',
  'previewReceiptId',
  'previewInputDigest',
  'artifacts',
] as const;

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ARTIFACT_ID_SET = new Set<string>(ASSET_AUTHORING_RELEASE_ARTIFACT_IDS);

function receiptDiagnostic(
  path: string,
  message: string,
): AssetReleaseDiagnostic {
  return {
    code: 'asset_authoring_release_receipt_invalid',
    message,
    path,
  };
}

function receiptExactKeys(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  diagnostics: AssetReleaseDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      diagnostics.push(receiptDiagnostic(`${path}.${key}`, `Unknown field at ${path}.${key}.`));
    }
  }
}

function receiptRecord(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): JsonRecord | undefined {
  if (!isRecord(value)) {
    diagnostics.push(receiptDiagnostic(path, `${path} must be an object.`));
    return undefined;
  }
  return value;
}

function receiptString(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): string | undefined {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(receiptDiagnostic(path, `${path} must be a non-empty string.`));
    return undefined;
  }
  return value;
}

function receiptDigest(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): string | undefined {
  const value = receiptString(record, key, path, diagnostics);
  if (value !== undefined && !DIGEST_PATTERN.test(value)) {
    diagnostics.push(receiptDiagnostic(path, `${path} must be a sha256 digest.`));
    return undefined;
  }
  return value;
}

function receiptDeclarant(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): AssetReleaseDeclarant | undefined {
  const record = receiptRecord(value, path, diagnostics);
  if (!record) return undefined;
  receiptExactKeys(record, path, ['displayName', 'kind', 'role'], diagnostics);
  const displayName = receiptString(record, 'displayName', `${path}.displayName`, diagnostics);
  const kind = record.kind;
  if (kind !== 'person' && kind !== 'organization') {
    diagnostics.push(receiptDiagnostic(`${path}.kind`, `${path}.kind must be person or organization.`));
  }
  if (record.role !== 'authorized-release-declarant') {
    diagnostics.push(receiptDiagnostic(
      `${path}.role`,
      `${path}.role must be authorized-release-declarant.`,
    ));
  }
  if (displayName === undefined || (kind !== 'person' && kind !== 'organization')
    || record.role !== 'authorized-release-declarant') {
    return undefined;
  }
  return { displayName, kind, role: 'authorized-release-declarant' };
}

function receiptSourceDigests(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): readonly AssetReleaseSourceDigest[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(receiptDiagnostic(path, `${path} must be a non-empty array.`));
    return undefined;
  }
  const sourceDigests: AssetReleaseSourceDigest[] = [];
  const seenPaths = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = receiptRecord(entry, entryPath, diagnostics);
    if (!record) return;
    receiptExactKeys(record, entryPath, ['path', 'digest'], diagnostics);
    const sourcePath = receiptString(record, 'path', `${entryPath}.path`, diagnostics);
    const digest = receiptDigest(record, 'digest', `${entryPath}.digest`, diagnostics);
    if (sourcePath !== undefined) {
      if (seenPaths.has(sourcePath)) {
        diagnostics.push(receiptDiagnostic(
          `${entryPath}.path`,
          `${entryPath}.path must be unique within sourceDigests.`,
        ));
      }
      seenPaths.add(sourcePath);
    }
    if (sourcePath !== undefined && digest !== undefined) {
      sourceDigests.push({ path: sourcePath, digest });
    }
  });
  return [...sourceDigests].sort((left, right) => left.path.localeCompare(right.path));
}

function receiptAcknowledgements(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): AssetReleaseAcknowledgementEvidence | undefined {
  const record = receiptRecord(value, path, diagnostics);
  if (!record) return undefined;
  receiptExactKeys(record, path, ['contentDigest', 'recordDigests'], diagnostics);
  const contentDigest = receiptDigest(record, 'contentDigest', `${path}.contentDigest`, diagnostics);
  const rawRecordDigests = record.recordDigests;
  if (!Array.isArray(rawRecordDigests)) {
    diagnostics.push(receiptDiagnostic(
      `${path}.recordDigests`,
      `${path}.recordDigests must be an array.`,
    ));
  }
  const recordDigests = Array.isArray(rawRecordDigests)
    ? rawRecordDigests.flatMap((entry, index) => {
      if (typeof entry !== 'string' || !DIGEST_PATTERN.test(entry)) {
        diagnostics.push(receiptDiagnostic(
          `${path}.recordDigests[${index}]`,
          `${path}.recordDigests[${index}] must be a sha256 digest.`,
        ));
        return [];
      }
      return [entry];
    })
    : [];
  if (new Set(recordDigests).size !== recordDigests.length) {
    diagnostics.push(receiptDiagnostic(
      `${path}.recordDigests`,
      `${path}.recordDigests must not contain duplicates.`,
    ));
  }
  if (contentDigest === undefined) return undefined;
  return {
    contentDigest,
    recordDigests: [...recordDigests].sort(),
  };
}

function receiptCreditDigests(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): AssetAuthoringReleaseDeclarationReceipt['creditDigests'] | undefined {
  const record = receiptRecord(value, path, diagnostics);
  if (!record) return undefined;
  receiptExactKeys(record, path, ['authorAndSource', 'licenseAuthority'], diagnostics);
  const authorAndSource = receiptDigest(
    record,
    'authorAndSource',
    `${path}.authorAndSource`,
    diagnostics,
  );
  const licenseAuthority = receiptDigest(
    record,
    'licenseAuthority',
    `${path}.licenseAuthority`,
    diagnostics,
  );
  if (authorAndSource === undefined || licenseAuthority === undefined) return undefined;
  return { authorAndSource, licenseAuthority };
}

function receiptArtifacts(
  value: unknown,
  path: string,
  diagnostics: AssetReleaseDiagnostic[],
): readonly AssetAuthoringReleaseArtifactDigest[] | undefined {
  if (!Array.isArray(value) || value.length !== ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length) {
    diagnostics.push(receiptDiagnostic(
      path,
      `${path} must contain exactly ${ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length} artifacts.`,
    ));
  }
  if (!Array.isArray(value)) return undefined;

  const artifacts: AssetAuthoringReleaseArtifactDigest[] = [];
  const seenIds = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = receiptRecord(entry, entryPath, diagnostics);
    if (!record) return;
    receiptExactKeys(record, entryPath, ['id', 'path', 'digest'], diagnostics);
    const id = record.id;
    if (typeof id !== 'string' || !ARTIFACT_ID_SET.has(id)) {
      diagnostics.push(receiptDiagnostic(
        `${entryPath}.id`,
        `${entryPath}.id must identify a supported preview artifact.`,
      ));
    }
    const artifactPath = receiptString(record, 'path', `${entryPath}.path`, diagnostics);
    const digest = receiptDigest(record, 'digest', `${entryPath}.digest`, diagnostics);
    if (typeof id === 'string' && ARTIFACT_ID_SET.has(id)) {
      if (seenIds.has(id)) {
        diagnostics.push(receiptDiagnostic(
          `${entryPath}.id`,
          `${entryPath}.id must be unique within artifacts.`,
        ));
      }
      seenIds.add(id);
    }
    if (typeof id === 'string' && ARTIFACT_ID_SET.has(id)
      && artifactPath !== undefined && digest !== undefined) {
      artifacts.push({
        id: id as AssetAuthoringReleaseArtifactId,
        path: artifactPath,
        digest,
      });
    }
  });
  for (const id of ASSET_AUTHORING_RELEASE_ARTIFACT_IDS) {
    if (!seenIds.has(id)) {
      diagnostics.push(receiptDiagnostic(`${path}`, `${path} is missing ${id}.`));
    }
  }
  return [...artifacts].sort((left, right) => artifactOrder(left.id) - artifactOrder(right.id));
}

function artifactOrder(id: AssetAuthoringReleaseArtifactId): number {
  return ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.indexOf(id);
}

function receiptCommon(
  record: JsonRecord,
  diagnostics: AssetReleaseDiagnostic[],
): {
  readonly sessionId: string;
  readonly cliVersion: string;
  readonly recordedAt: string;
  readonly declarant: AssetReleaseDeclarant;
} | undefined {
  const sessionId = receiptString(record, 'sessionId', '$.sessionId', diagnostics);
  if (sessionId !== undefined && !SESSION_ID_PATTERN.test(sessionId)) {
    diagnostics.push(receiptDiagnostic('$.sessionId', '$.sessionId must be a v4 UUID.'));
  }
  const cliVersion = receiptString(record, 'cliVersion', '$.cliVersion', diagnostics);
  const recordedAt = receiptString(record, 'recordedAt', '$.recordedAt', diagnostics);
  if (recordedAt !== undefined && Number.isNaN(Date.parse(recordedAt))) {
    diagnostics.push(receiptDiagnostic('$.recordedAt', '$.recordedAt must be an ISO timestamp.'));
  }
  const declarant = receiptDeclarant(record.declarant, '$.declarant', diagnostics);
  if (sessionId === undefined || !SESSION_ID_PATTERN.test(sessionId)
    || cliVersion === undefined || recordedAt === undefined
    || Number.isNaN(Date.parse(recordedAt)) || declarant === undefined) {
    return undefined;
  }
  return { sessionId, cliVersion, recordedAt, declarant };
}

function receiptFailure(
  diagnostics: readonly AssetReleaseDiagnostic[],
): AssetAuthoringReleaseReceiptParseResult {
  return {
    ok: false,
    diagnostics: [...diagnostics].sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function parseDeclarationReceipt(
  record: JsonRecord,
  diagnostics: AssetReleaseDiagnostic[],
): AssetAuthoringReleaseReceiptParseResult {
  receiptExactKeys(record, '$', DECLARATION_RECEIPT_KEYS, diagnostics);
  const common = receiptCommon(record, diagnostics);
  const declarationDigest = receiptDigest(
    record,
    'declarationDigest',
    '$.declarationDigest',
    diagnostics,
  );
  const manifestDigest = receiptDigest(record, 'manifestDigest', '$.manifestDigest', diagnostics);
  const sourceDigests = receiptSourceDigests(record.sourceDigests, '$.sourceDigests', diagnostics);
  const validationReceiptId = receiptString(
    record,
    'validationReceiptId',
    '$.validationReceiptId',
    diagnostics,
  );
  const validationReceiptRevision = receiptString(
    record,
    'validationReceiptRevision',
    '$.validationReceiptRevision',
    diagnostics,
  );
  const creditDigests = receiptCreditDigests(record.creditDigests, '$.creditDigests', diagnostics);
  const acknowledgements = receiptAcknowledgements(
    record.acknowledgements,
    '$.acknowledgements',
    diagnostics,
  );
  if (diagnostics.length > 0 || common === undefined || declarationDigest === undefined
    || manifestDigest === undefined || sourceDigests === undefined
    || validationReceiptId === undefined || validationReceiptRevision === undefined
    || creditDigests === undefined || acknowledgements === undefined) {
    return receiptFailure(diagnostics);
  }
  return {
    ok: true,
    receipt: assetAuthoringReleaseReceiptProjection({
      schema: ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA,
      kind: 'declaration',
      ...common,
      declarationDigest,
      manifestDigest,
      sourceDigests,
      validationReceiptId,
      validationReceiptRevision,
      creditDigests,
      acknowledgements,
    }),
  };
}

function parsePreviewAcceptanceReceipt(
  record: JsonRecord,
  diagnostics: AssetReleaseDiagnostic[],
): AssetAuthoringReleaseReceiptParseResult {
  receiptExactKeys(record, '$', PREVIEW_ACCEPTANCE_RECEIPT_KEYS, diagnostics);
  const common = receiptCommon(record, diagnostics);
  const declarationReceiptDigest = receiptDigest(
    record,
    'declarationReceiptDigest',
    '$.declarationReceiptDigest',
    diagnostics,
  );
  const manifestDigest = receiptDigest(record, 'manifestDigest', '$.manifestDigest', diagnostics);
  const sourceDigests = receiptSourceDigests(record.sourceDigests, '$.sourceDigests', diagnostics);
  const validationReceiptId = receiptString(
    record,
    'validationReceiptId',
    '$.validationReceiptId',
    diagnostics,
  );
  const validationReceiptRevision = receiptString(
    record,
    'validationReceiptRevision',
    '$.validationReceiptRevision',
    diagnostics,
  );
  const previewReceiptId = receiptString(
    record,
    'previewReceiptId',
    '$.previewReceiptId',
    diagnostics,
  );
  const previewInputDigest = receiptDigest(
    record,
    'previewInputDigest',
    '$.previewInputDigest',
    diagnostics,
  );
  const artifacts = receiptArtifacts(record.artifacts, '$.artifacts', diagnostics);
  if (diagnostics.length > 0 || common === undefined || declarationReceiptDigest === undefined
    || manifestDigest === undefined || sourceDigests === undefined
    || validationReceiptId === undefined || validationReceiptRevision === undefined
    || previewReceiptId === undefined || previewInputDigest === undefined
    || artifacts === undefined) {
    return receiptFailure(diagnostics);
  }
  return {
    ok: true,
    receipt: assetAuthoringReleaseReceiptProjection({
      schema: ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA,
      kind: 'preview-acceptance',
      ...common,
      declarationReceiptDigest,
      manifestDigest,
      sourceDigests,
      validationReceiptId,
      validationReceiptRevision,
      previewReceiptId,
      previewInputDigest,
      artifacts,
    }),
  };
}

export function parseAssetAuthoringReleaseReceipt(
  input: unknown,
): AssetAuthoringReleaseReceiptParseResult {
  const diagnostics: AssetReleaseDiagnostic[] = [];
  const record = receiptRecord(input, '$', diagnostics);
  if (!record) return receiptFailure(diagnostics);
  if (record.schema !== ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA) {
    diagnostics.push(receiptDiagnostic('$.schema', `Unsupported release receipt schema at $.schema.`));
  }
  if (record.kind === 'declaration') {
    return parseDeclarationReceipt(record, diagnostics);
  }
  if (record.kind === 'preview-acceptance') {
    return parsePreviewAcceptanceReceipt(record, diagnostics);
  }
  diagnostics.push(receiptDiagnostic(
    '$.kind',
    '$.kind must be declaration or preview-acceptance.',
  ));
  return receiptFailure(diagnostics);
}

function normalizeSourceDigests(
  sourceDigests: readonly AssetReleaseSourceDigest[],
): readonly AssetReleaseSourceDigest[] {
  return [...sourceDigests]
    .map(({ path, digest }) => ({ path, digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeAcknowledgements(
  acknowledgements: AssetReleaseAcknowledgementEvidence,
): AssetReleaseAcknowledgementEvidence {
  return {
    contentDigest: acknowledgements.contentDigest,
    recordDigests: [...acknowledgements.recordDigests].sort(),
  };
}

function normalizeArtifacts(
  artifacts: readonly AssetAuthoringReleaseArtifactDigest[],
): readonly AssetAuthoringReleaseArtifactDigest[] {
  return [...artifacts]
    .map(({ id, path, digest }) => ({ id, path, digest }))
    .sort((left, right) => artifactOrder(left.id) - artifactOrder(right.id));
}

export function assetAuthoringReleaseReceiptProjection(
  receipt: AssetAuthoringReleaseReceipt,
): AssetAuthoringReleaseReceipt {
  const projection = receipt.kind === 'declaration'
    ? {
      schema: receipt.schema,
      kind: receipt.kind,
      sessionId: receipt.sessionId,
      cliVersion: receipt.cliVersion,
      recordedAt: receipt.recordedAt,
      declarant: receipt.declarant,
      declarationDigest: receipt.declarationDigest,
      manifestDigest: receipt.manifestDigest,
      sourceDigests: normalizeSourceDigests(receipt.sourceDigests),
      validationReceiptId: receipt.validationReceiptId,
      validationReceiptRevision: receipt.validationReceiptRevision,
      creditDigests: receipt.creditDigests,
      acknowledgements: normalizeAcknowledgements(receipt.acknowledgements),
    }
    : {
      schema: receipt.schema,
      kind: receipt.kind,
      sessionId: receipt.sessionId,
      cliVersion: receipt.cliVersion,
      recordedAt: receipt.recordedAt,
      declarant: receipt.declarant,
      declarationReceiptDigest: receipt.declarationReceiptDigest,
      manifestDigest: receipt.manifestDigest,
      sourceDigests: normalizeSourceDigests(receipt.sourceDigests),
      validationReceiptId: receipt.validationReceiptId,
      validationReceiptRevision: receipt.validationReceiptRevision,
      previewReceiptId: receipt.previewReceiptId,
      previewInputDigest: receipt.previewInputDigest,
      artifacts: normalizeArtifacts(receipt.artifacts),
    };
  return canonicalize(projection) as AssetAuthoringReleaseReceipt;
}

/** Returns canonical JSON input for a caller-owned cryptographic digest. */
export function assetAuthoringReleaseReceiptDigestInput(
  receipt: AssetAuthoringReleaseReceipt,
): string {
  return JSON.stringify(assetAuthoringReleaseReceiptProjection(receipt));
}

export function assetAuthoringReleaseGateProjection(
  input: AssetAuthoringReleaseGateProjectionInput,
): AssetAuthoringReleaseGateProjection {
  const gates: readonly AssetAuthoringReleaseGate[] = [
    { id: 'acknowledgements', freshness: input.acknowledgements },
    { id: 'validation', freshness: input.validation },
    { id: 'releaseDeclaration', freshness: input.releaseDeclaration },
    { id: 'preview', freshness: input.preview },
    { id: 'previewArtifacts', freshness: input.previewArtifacts },
  ];
  return {
    releaseReady: gates.every((gate) => gate.freshness === 'current'),
    gates,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function assetReleaseDeclarationProjection(
  declaration: AssetReleaseDeclaration,
): AssetReleaseDeclaration {
  return canonicalize(declaration) as AssetReleaseDeclaration;
}

/** Returns canonical JSON input for a caller-owned cryptographic digest. */
export function assetReleaseDeclarationDigestInput(
  declaration: AssetReleaseDeclaration,
): string {
  return JSON.stringify(assetReleaseDeclarationProjection(declaration));
}
