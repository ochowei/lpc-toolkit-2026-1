import { createHash } from 'node:crypto';

export const ASSET_DISTRIBUTION_PACKAGE_INSPECTION_SCHEMA =
  'lpc-toolkit.asset-distribution-package-inspection.v1' as const;
export const ASSET_DISTRIBUTION_PACKAGE_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-distribution-package-receipt.v1' as const;
export const ASSET_DISTRIBUTION_PACKAGE_VERIFICATION_SCHEMA =
  'lpc-toolkit.asset-distribution-package-verification.v1' as const;

export type AssetDistributionPackageTransport = 'fake-npm' | 'fake-marketplace';
export type AssetDistributionPackagePublicationStatus =
  | 'published'
  | 'metadata-drift'
  | 'integrity-drift'
  | 'version-conflict'
  | 'unavailable';

export interface AssetDistributionPackageDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetDistributionPackageTarballEntry {
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly bytes?: Uint8Array;
}

export interface AssetDistributionPackageEntrypointProbe {
  readonly path: string;
  readonly help: string;
  readonly version: string;
}

export interface AssetDistributionPackageReleaseEvidence {
  readonly commit: string;
  readonly tag?: string;
  readonly ciEvidenceDigest: string;
  readonly assetReleaseEvidenceDigest?: string;
}

export interface AssetDistributionPackageInspectionInput {
  readonly expected: {
    readonly packageName: string;
    readonly version: string;
  };
  readonly tarballBytes: Uint8Array;
  readonly entries: readonly AssetDistributionPackageTarballEntry[];
  readonly entrypoint: AssetDistributionPackageEntrypointProbe;
  readonly releaseEvidence: AssetDistributionPackageReleaseEvidence;
}

export interface AssetDistributionPackageInspection {
  readonly schema: typeof ASSET_DISTRIBUTION_PACKAGE_INSPECTION_SCHEMA;
  readonly inspectionDigest: string;
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly license: 'GPL-3.0-or-later';
    readonly binPath: './dist/index.js';
    readonly manifestDigest: string;
  };
  readonly tarball: {
    readonly byteLength: number;
    readonly sha256: string;
    readonly integrity: string;
  };
  readonly entrypoint: {
    readonly path: string;
    readonly digest: string;
    readonly helpDigest: string;
    readonly version: string;
  };
  readonly releaseEvidence: AssetDistributionPackageReleaseEvidence;
  readonly lpcArchive:
    | { readonly state: 'not-bound' }
    | { readonly state: 'bound'; readonly releaseEvidenceDigest: string };
}

export type AssetDistributionPackageInspectionResult =
  | { readonly ok: true; readonly inspection: AssetDistributionPackageInspection }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionPackageDiagnostic[] };

export interface AssetDistributionPackageReceipt {
  readonly schema: typeof ASSET_DISTRIBUTION_PACKAGE_RECEIPT_SCHEMA;
  readonly transport: {
    readonly kind: AssetDistributionPackageTransport;
    readonly sourceId: string;
    readonly credentialsUsed: false;
  };
  readonly packageName: string;
  readonly version: string;
  readonly tarballSha256: string;
  readonly integrity: string;
  readonly status: AssetDistributionPackagePublicationStatus;
  readonly publicationId?: string;
  readonly packageInspectionDigest: string;
  readonly assetReleaseEvidenceDigest?: string;
}

export interface AssetDistributionPackagePublisher {
  readonly transport: AssetDistributionPackageTransport;
  publish(input: {
    readonly inspection: AssetDistributionPackageInspection;
  }): Promise<unknown>;
}

export interface AssetDistributionPackageReceiptAdapter {
  readonly transport: AssetDistributionPackageTransport;
  fetch(input: {
    readonly packageName: string;
    readonly version: string;
  }): Promise<unknown>;
}

export interface AssetDistributionPackageVerification {
  readonly schema: typeof ASSET_DISTRIBUTION_PACKAGE_VERIFICATION_SCHEMA;
  readonly state: 'verified';
  readonly receiptDigest: string;
  readonly packageTransport: {
    readonly kind: AssetDistributionPackageTransport;
    readonly sourceId: string;
    readonly credentialsUsed: false;
    readonly publicationId?: string;
  };
  readonly lpcArchive:
    | { readonly state: 'not-bound' }
    | { readonly state: 'bound'; readonly releaseEvidenceDigest: string };
  readonly nextAction: 'safe-to-consume-after-local-verification';
}

export type AssetDistributionPackageVerificationResult =
  | { readonly ok: true; readonly verification: AssetDistributionPackageVerification }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionPackageDiagnostic[] };

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const SAFE_SOURCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const MAX_ENTRY_PATH_LENGTH = 512;
const MAX_SOURCE_ID_LENGTH = 128;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AssetDistributionPackageDiagnostic {
  return { code, message, ...(details === undefined ? {} : { details }) };
}

function failure(
  diagnostic: AssetDistributionPackageDiagnostic,
): { readonly ok: false; readonly diagnostics: readonly AssetDistributionPackageDiagnostic[] } {
  return { ok: false, diagnostics: [diagnostic] };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, canonicalize(value[key])] as const),
  );
}

function canonicalJson(value: unknown): string {
  const result = JSON.stringify(canonicalize(value));
  if (result === undefined) throw new Error('Cannot canonicalize an undefined package evidence value.');
  return result;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sha512Integrity(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

function stringField(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function exactKeys(
  record: JsonRecord,
  keys: readonly string[],
  label: string,
): AssetDistributionPackageDiagnostic | undefined {
  const expected = new Set(keys);
  const unknown = Object.keys(record).find((key) => !expected.has(key));
  if (unknown !== undefined) {
    return invalid(
      'asset_distribution_package_unknown_field',
      `${label} contains an unknown field.`,
      { field: unknown },
    );
  }
  return undefined;
}

function safeEntryPath(entryPath: string): boolean {
  if (
    entryPath.length === 0
    || entryPath.length > MAX_ENTRY_PATH_LENGTH
    || !entryPath.startsWith('package/')
    || entryPath.includes('\\')
    || entryPath.includes('//')
    || entryPath.startsWith('/')
  ) return false;
  const pathWithoutDirectoryMarker = entryPath.endsWith('/')
    ? entryPath.slice(0, -1)
    : entryPath;
  const segments = pathWithoutDirectoryMarker.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function hasAccidentalPayload(entryPath: string): boolean {
  return entryPath.endsWith('.lpc-assets.zip')
    || entryPath.endsWith('/.npmrc')
    || entryPath.endsWith('/.env')
    || entryPath.includes('/upstream/');
}

function validateEntries(
  entries: readonly AssetDistributionPackageTarballEntry[],
): AssetDistributionPackageDiagnostic | undefined {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!safeEntryPath(entry.path)) {
      return invalid(
        'asset_distribution_package_entry_unsafe',
        'Package tarball entries must be package-relative safe paths.',
      );
    }
    if (seen.has(entry.path)) {
      return invalid(
        'asset_distribution_package_entry_duplicate',
        'Package tarball entries must have unique paths.',
      );
    }
    seen.add(entry.path);
    if (hasAccidentalPayload(entry.path)) {
      return invalid(
        'asset_distribution_package_asset_payload',
        'The CLI package must not contain an LPC asset archive, credential file, or upstream payload.',
      );
    }
    if (entry.kind === 'file' && !(entry.bytes instanceof Uint8Array)) {
      return invalid(
        'asset_distribution_package_entry_invalid',
        'Package file entries must provide exact bytes.',
      );
    }
    if (entry.kind === 'directory' && entry.bytes !== undefined) {
      return invalid(
        'asset_distribution_package_entry_invalid',
        'Package directory entries must not provide file bytes.',
      );
    }
  }
  return undefined;
}

function fileEntry(
  entries: readonly AssetDistributionPackageTarballEntry[],
  entryPath: string,
): Uint8Array | undefined {
  const entry = entries.find((candidate) => candidate.path === entryPath);
  return entry?.kind === 'file' ? entry.bytes : undefined;
}

function parseManifest(
  bytes: Uint8Array,
):
  | { readonly ok: true; readonly name: string; readonly version: string; readonly manifestDigest: string }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionPackageDiagnostic[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return failure(invalid(
      'asset_distribution_package_manifest_invalid',
      'The packed package.json is not valid UTF-8 JSON.',
    ));
  }
  if (!isRecord(parsed)) {
    return failure(invalid(
      'asset_distribution_package_manifest_invalid',
      'The packed package.json must be a JSON object.',
    ));
  }
  const keysFailure = exactKeys(parsed, [
    'name',
    'version',
    'license',
    'type',
    'bin',
    'files',
    'private',
    'description',
    'repository',
    'homepage',
    'bugs',
    'keywords',
    'engines',
    'publishConfig',
    'dependencies',
    'devDependencies',
    'scripts',
  ], '$.package');
  if (keysFailure) return failure(keysFailure);
  if (!stringField(parsed.name) || !PACKAGE_NAME_PATTERN.test(parsed.name)) {
    return failure(invalid(
      'asset_distribution_package_manifest_invalid',
      'The packed package name is not a normalized scoped package name.',
    ));
  }
  if (!stringField(parsed.version) || !VERSION_PATTERN.test(parsed.version)) {
    return failure(invalid(
      'asset_distribution_package_manifest_invalid',
      'The packed package version is not semantic version text.',
    ));
  }
  if (parsed.license !== 'GPL-3.0-or-later') {
    return failure(invalid(
      'asset_distribution_package_license_invalid',
      'The packed CLI package must retain the GPL-3.0-or-later license.',
    ));
  }
  if (parsed.type !== 'module') {
    return failure(invalid(
      'asset_distribution_package_module_invalid',
      'The packed CLI package must retain its ESM module contract.',
    ));
  }
  if (parsed.private === true) {
    return failure(invalid(
      'asset_distribution_package_private',
      'A private package cannot satisfy the public package release contract.',
    ));
  }
  if (!isRecord(parsed.bin) || Object.keys(parsed.bin).length !== 1 || parsed.bin['lpc-toolkit'] !== './dist/index.js') {
    return failure(invalid(
      'asset_distribution_package_bin_invalid',
      'The packed package must expose exactly the lpc-toolkit ./dist/index.js bin.',
    ));
  }
  return {
    ok: true,
    name: parsed.name,
    version: parsed.version,
    manifestDigest: sha256(bytes),
  };
}

function validateReleaseEvidence(
  evidence: AssetDistributionPackageReleaseEvidence,
): AssetDistributionPackageDiagnostic | undefined {
  if (!COMMIT_PATTERN.test(evidence.commit)) {
    return invalid(
      'asset_distribution_package_release_evidence_invalid',
      'Release evidence must include a full lowercase commit hash.',
    );
  }
  if (evidence.tag !== undefined && !TAG_PATTERN.test(evidence.tag)) {
    return invalid(
      'asset_distribution_package_release_evidence_invalid',
      'Release evidence tag must be a normalized v-prefixed release tag.',
    );
  }
  if (!DIGEST_PATTERN.test(evidence.ciEvidenceDigest)) {
    return invalid(
      'asset_distribution_package_release_evidence_invalid',
      'Release evidence CI digest must be a sha256 digest.',
    );
  }
  if (
    evidence.assetReleaseEvidenceDigest !== undefined
    && !DIGEST_PATTERN.test(evidence.assetReleaseEvidenceDigest)
  ) {
    return invalid(
      'asset_distribution_package_release_evidence_invalid',
      'Optional D4 asset-release evidence binding must be a sha256 digest.',
    );
  }
  return undefined;
}

export function inspectAssetDistributionPackage(
  input: AssetDistributionPackageInspectionInput,
): AssetDistributionPackageInspectionResult {
  if (
    !(input.tarballBytes instanceof Uint8Array)
    || input.tarballBytes.byteLength === 0
  ) {
    return failure(invalid(
      'asset_distribution_package_tarball_missing',
      'Local package inspection requires non-empty exact tarball bytes.',
    ));
  }
  const entriesFailure = validateEntries(input.entries);
  if (entriesFailure) return failure(entriesFailure);
  const manifestBytes = fileEntry(input.entries, 'package/package.json');
  if (!manifestBytes) {
    return failure(invalid(
      'asset_distribution_package_manifest_missing',
      'The local package tarball is missing package/package.json.',
    ));
  }
  const parsedManifest = parseManifest(manifestBytes);
  if (!parsedManifest.ok) return parsedManifest;
  if (
    parsedManifest.name !== input.expected.packageName
    || parsedManifest.version !== input.expected.version
  ) {
    return failure(invalid(
      'asset_distribution_package_metadata_drift',
      'Packed package name or version differs from the expected local release metadata.',
    ));
  }
  const entrypointPath = 'package/dist/index.js';
  const entrypointBytes = fileEntry(input.entries, entrypointPath);
  if (!entrypointBytes) {
    return failure(invalid(
      'asset_distribution_package_entrypoint_missing',
      'The packed package is missing its declared CLI entrypoint.',
    ));
  }
  if (input.entrypoint.path !== entrypointPath) {
    return failure(invalid(
      'asset_distribution_package_entrypoint_mismatch',
      'Entrypoint probe did not execute the package-declared CLI entrypoint.',
    ));
  }
  if (!input.entrypoint.help.includes('lpc-toolkit')) {
    return failure(invalid(
      'asset_distribution_package_help_invalid',
      'The packed CLI help probe did not identify lpc-toolkit.',
    ));
  }
  if (input.entrypoint.version.trim() !== parsedManifest.version) {
    return failure(invalid(
      'asset_distribution_package_version_drift',
      'The packed CLI version output differs from package.json.',
    ));
  }
  const evidenceFailure = validateReleaseEvidence(input.releaseEvidence);
  if (evidenceFailure) return failure(evidenceFailure);
  const lpcArchive = input.releaseEvidence.assetReleaseEvidenceDigest === undefined
    ? { state: 'not-bound' as const }
    : {
      state: 'bound' as const,
      releaseEvidenceDigest: input.releaseEvidence.assetReleaseEvidenceDigest,
    };
  const packageMetadata = {
    name: parsedManifest.name,
    version: parsedManifest.version,
    license: 'GPL-3.0-or-later' as const,
    binPath: './dist/index.js' as const,
    manifestDigest: parsedManifest.manifestDigest,
  };
  const tarball = {
    byteLength: input.tarballBytes.byteLength,
    sha256: sha256(input.tarballBytes),
    integrity: sha512Integrity(input.tarballBytes),
  };
  const entrypoint = {
    path: entrypointPath,
    digest: sha256(entrypointBytes),
    helpDigest: sha256(new TextEncoder().encode(input.entrypoint.help)),
    version: input.entrypoint.version.trim(),
  };
  const inspectionProjection = {
    schema: ASSET_DISTRIBUTION_PACKAGE_INSPECTION_SCHEMA,
    package: packageMetadata,
    tarball,
    entrypoint,
    releaseEvidence: input.releaseEvidence,
    lpcArchive,
  };
  return {
    ok: true,
    inspection: {
      ...inspectionProjection,
      inspectionDigest: sha256(new TextEncoder().encode(canonicalJson(inspectionProjection))),
    },
  };
}

function parseReceipt(
  value: unknown,
):
  | { readonly ok: true; readonly receipt: AssetDistributionPackageReceipt }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionPackageDiagnostic[] } {
  if (!isRecord(value)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package publication receipt must be a JSON object.',
    ));
  }
  const keysFailure = exactKeys(value, [
    'schema',
    'transport',
    'packageName',
    'version',
    'tarballSha256',
    'integrity',
    'status',
    'publicationId',
    'packageInspectionDigest',
    'assetReleaseEvidenceDigest',
  ], '$.receipt');
  if (keysFailure) return failure(keysFailure);
  if (value.schema !== ASSET_DISTRIBUTION_PACKAGE_RECEIPT_SCHEMA) {
    return failure(invalid(
      'asset_distribution_package_receipt_schema',
      'Unsupported package publication receipt schema.',
    ));
  }
  if (!isRecord(value.transport)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package publication receipt transport must be an object.',
    ));
  }
  const transportKeysFailure = exactKeys(
    value.transport,
    ['kind', 'sourceId', 'credentialsUsed'],
    '$.receipt.transport',
  );
  if (transportKeysFailure) return failure(transportKeysFailure);
  if (value.transport.kind !== 'fake-npm' && value.transport.kind !== 'fake-marketplace') {
    return failure(invalid(
      'asset_distribution_package_transport_invalid',
      'Package publication receipts must identify a fake npm or fake marketplace transport.',
    ));
  }
  if (
    !stringField(value.transport.sourceId)
    || value.transport.sourceId.length > MAX_SOURCE_ID_LENGTH
    || !SAFE_SOURCE_ID_PATTERN.test(value.transport.sourceId)
  ) {
    return failure(invalid(
      'asset_distribution_package_transport_invalid',
      'Package receipt sourceId must be a bounded fixture identifier.',
    ));
  }
  if (value.transport.credentialsUsed !== false) {
    return failure(invalid(
      'asset_distribution_package_auth_forbidden',
      'Local package receipt verification must not use or claim credentials.',
    ));
  }
  if (!stringField(value.packageName) || !PACKAGE_NAME_PATTERN.test(value.packageName)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt name is not normalized.',
    ));
  }
  if (!stringField(value.version) || !VERSION_PATTERN.test(value.version)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt version is not semantic version text.',
    ));
  }
  if (!stringField(value.tarballSha256) || !DIGEST_PATTERN.test(value.tarballSha256)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt tarballSha256 must be a sha256 digest.',
    ));
  }
  if (!stringField(value.integrity) || !INTEGRITY_PATTERN.test(value.integrity)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt integrity must be a sha512 integrity value.',
    ));
  }
  const statuses: readonly AssetDistributionPackagePublicationStatus[] = [
    'published',
    'metadata-drift',
    'integrity-drift',
    'version-conflict',
    'unavailable',
  ];
  if (!statuses.includes(value.status as AssetDistributionPackagePublicationStatus)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt status is unsupported.',
    ));
  }
  const status = value.status as AssetDistributionPackagePublicationStatus;
  if (value.publicationId !== undefined && !stringField(value.publicationId)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt publicationId must be bounded text when present.',
    ));
  }
  if (!stringField(value.packageInspectionDigest) || !DIGEST_PATTERN.test(value.packageInspectionDigest)) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt packageInspectionDigest must be a sha256 digest.',
    ));
  }
  if (
    value.assetReleaseEvidenceDigest !== undefined
    && (!stringField(value.assetReleaseEvidenceDigest) || !DIGEST_PATTERN.test(value.assetReleaseEvidenceDigest))
  ) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'Package receipt asset-release binding must be a sha256 digest when present.',
    ));
  }
  if (status === 'published' && value.publicationId === undefined) {
    return failure(invalid(
      'asset_distribution_package_receipt_invalid',
      'A published fake receipt must include a bounded publicationId.',
    ));
  }
  const receipt: AssetDistributionPackageReceipt = {
    schema: ASSET_DISTRIBUTION_PACKAGE_RECEIPT_SCHEMA,
    transport: {
      kind: value.transport.kind,
      sourceId: value.transport.sourceId,
      credentialsUsed: false,
    },
    packageName: value.packageName,
    version: value.version,
    tarballSha256: value.tarballSha256,
    integrity: value.integrity,
    status,
    ...(value.publicationId === undefined ? {} : { publicationId: value.publicationId }),
    packageInspectionDigest: value.packageInspectionDigest,
    ...(value.assetReleaseEvidenceDigest === undefined
      ? {}
      : { assetReleaseEvidenceDigest: value.assetReleaseEvidenceDigest }),
  };
  return { ok: true, receipt };
}

function receiptStatusDiagnostic(
  status: Exclude<AssetDistributionPackagePublicationStatus, 'published'>,
): AssetDistributionPackageDiagnostic {
  const codes: Readonly<Record<typeof status, string>> = {
    'metadata-drift': 'asset_distribution_package_metadata_drift',
    'integrity-drift': 'asset_distribution_package_integrity_drift',
    'version-conflict': 'asset_distribution_package_version_conflict',
    unavailable: 'asset_distribution_package_unavailable',
  };
  return invalid(
    codes[status],
    `Fake package publication receipt reports ${status}; no local publication trust is granted.`,
  );
}

export function verifyAssetDistributionPackageReceipt(input: {
  readonly inspection: AssetDistributionPackageInspection;
  readonly receipt: unknown;
  readonly expectedTransport?: AssetDistributionPackageTransport;
}): AssetDistributionPackageVerificationResult {
  const parsed = parseReceipt(input.receipt);
  if (!parsed.ok) return parsed;
  const receipt = parsed.receipt;
  if (
    input.expectedTransport !== undefined
    && receipt.transport.kind !== input.expectedTransport
  ) {
    return failure(invalid(
      'asset_distribution_package_transport_mismatch',
      'Package receipt transport does not match the explicitly selected fake adapter.',
    ));
  }
  if (receipt.status !== 'published') return failure(receiptStatusDiagnostic(receipt.status));
  if (
    receipt.packageName !== input.inspection.package.name
    || receipt.version !== input.inspection.package.version
  ) {
    return failure(invalid(
      'asset_distribution_package_metadata_drift',
      'Package receipt name or version differs from the locally inspected tarball.',
    ));
  }
  if (
    receipt.tarballSha256 !== input.inspection.tarball.sha256
    || receipt.integrity !== input.inspection.tarball.integrity
  ) {
    return failure(invalid(
      'asset_distribution_package_integrity_drift',
      'Package receipt integrity differs from the locally inspected tarball.',
    ));
  }
  if (receipt.packageInspectionDigest !== input.inspection.inspectionDigest) {
    return failure(invalid(
      'asset_distribution_package_record_mismatch',
      'Package receipt does not bind the exact local package inspection.',
    ));
  }
  const expectedAssetBinding = input.inspection.lpcArchive.state === 'bound'
    ? input.inspection.lpcArchive.releaseEvidenceDigest
    : undefined;
  if (receipt.assetReleaseEvidenceDigest !== expectedAssetBinding) {
    return failure(invalid(
      'asset_distribution_package_asset_binding_mismatch',
      'Package receipt does not preserve the optional exact D4 asset-release binding.',
    ));
  }
  const receiptDigest = sha256(new TextEncoder().encode(canonicalJson(receipt)));
  return {
    ok: true,
    verification: {
      schema: ASSET_DISTRIBUTION_PACKAGE_VERIFICATION_SCHEMA,
      state: 'verified',
      receiptDigest,
      packageTransport: {
        kind: receipt.transport.kind,
        sourceId: receipt.transport.sourceId,
        credentialsUsed: false,
        ...(receipt.publicationId === undefined ? {} : { publicationId: receipt.publicationId }),
      },
      lpcArchive: input.inspection.lpcArchive,
      nextAction: 'safe-to-consume-after-local-verification',
    },
  };
}
