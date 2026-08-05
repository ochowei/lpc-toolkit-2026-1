export const ASSET_DISTRIBUTION_RELEASE_SCHEMA =
  'lpc-toolkit.asset-distribution-release.v1' as const;

export const ASSET_DISTRIBUTION_SIGNATURE_ALGORITHM = 'ed25519' as const;

export type AssetDistributionSignatureAlgorithm =
  typeof ASSET_DISTRIBUTION_SIGNATURE_ALGORITHM;

export type AssetDistributionDiagnosticCode =
  | 'asset_distribution_invalid'
  | 'asset_distribution_unsupported'
  | 'asset_distribution_limit_exceeded'
  | 'asset_distribution_private_data';

export interface AssetDistributionDiagnostic {
  readonly code: AssetDistributionDiagnosticCode;
  readonly message: string;
  readonly path: string;
}

export interface AssetDistributionDigestBinding {
  readonly path: string;
  readonly digest: string;
}

export interface AssetDistributionReleaseIdentity {
  readonly namespace: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveKind: 'formal';
  readonly archiveDigest: string;
  readonly byteLength: number;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly AssetDistributionDigestBinding[];
  readonly creditsDigest: string;
  readonly licenseEvidenceDigest: string;
  readonly provenanceDigest?: string;
  readonly requiredCapabilities: readonly string[];
}

export interface AssetDistributionReleaseAuthorization {
  readonly namespacePolicyId: string;
  readonly releaseEvidenceDigest: string;
}

export interface AssetDistributionReleaseSignature {
  readonly keyId: string;
  readonly algorithm: AssetDistributionSignatureAlgorithm;
  readonly payloadDigest: string;
  readonly value: string;
}

export interface AssetDistributionRelease {
  readonly schema: typeof ASSET_DISTRIBUTION_RELEASE_SCHEMA;
  readonly release: AssetDistributionReleaseIdentity;
  readonly authorization: AssetDistributionReleaseAuthorization;
  readonly signature: AssetDistributionReleaseSignature;
}

export interface AssetDistributionSignedProjection {
  readonly release: AssetDistributionReleaseIdentity;
  readonly authorization: AssetDistributionReleaseAuthorization;
}

export type AssetDistributionReleaseParseResult =
  | { readonly ok: true; readonly release: AssetDistributionRelease }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionDiagnostic[] };

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const PACK_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]{8,4096}$/u;
const MAX_BYTE_LENGTH = 512 * 1024 * 1024;
const MAX_CAPABILITIES = 32;
const MAX_IDENTIFIER_BYTES = 256;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnostic(
  code: AssetDistributionDiagnosticCode,
  path: string,
  message: string,
): AssetDistributionDiagnostic {
  return { code, path, message };
}

function invalid(path: string, message: string): AssetDistributionDiagnostic {
  return diagnostic('asset_distribution_invalid', path, message);
}

function exactKeys(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  diagnostics: AssetDistributionDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      diagnostics.push(invalid(`${path}.${key}`, `Unknown field at ${path}.${key}.`));
    }
  }
}

function utf8Bytes(value: string): readonly number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
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

function privateIdentifier(value: string): boolean {
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

function requiredRecord(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): JsonRecord | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, `${path} must be an object.`));
    return undefined;
  }
  return value;
}

function requiredString(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    diagnostics.push(invalid(path, `${path} must be a non-empty trimmed string.`));
    return undefined;
  }
  if (value.length > MAX_IDENTIFIER_BYTES) {
    diagnostics.push(diagnostic(
      'asset_distribution_limit_exceeded',
      path,
      `${path} exceeds ${MAX_IDENTIFIER_BYTES} characters.`,
    ));
  }
  if (privateIdentifier(value)) {
    diagnostics.push(diagnostic(
      'asset_distribution_private_data',
      path,
      `${path} must not contain a private path, URL, or secret.`,
    ));
  }
  return value;
}

function requiredDigest(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    diagnostics.push(invalid(path, `${path} must be a sha256 digest.`));
    return undefined;
  }
  return value;
}

function parseSourceDigests(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): readonly AssetDistributionDigestBinding[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  const entries: AssetDistributionDigestBinding[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requiredRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, ['path', 'digest'], diagnostics);
    const sourcePath = requiredString(record.path, `${entryPath}.path`, diagnostics);
    const digest = requiredDigest(record.digest, `${entryPath}.digest`, diagnostics);
    if (sourcePath !== undefined) {
      const segments = sourcePath.split('/');
      if (
        !sourcePath.startsWith('sprites/')
        || sourcePath.includes('\\')
        || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
      ) {
        diagnostics.push(diagnostic(
          'asset_distribution_private_data',
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
  if (!paths.every((pathValue, index) => {
    const previous = paths[index - 1];
    return previous === undefined || compareUtf8(previous, pathValue) < 0;
  })) {
    diagnostics.push(invalid(path, `${path} must be sorted by path.`));
  }
  return entries;
}

function parseCapabilities(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  if (value.length > MAX_CAPABILITIES) {
    diagnostics.push(diagnostic(
      'asset_distribution_limit_exceeded',
      path,
      `${path} exceeds ${MAX_CAPABILITIES} capabilities.`,
    ));
  }
  const capabilities: string[] = [];
  value.forEach((entry, index) => {
    const capability = requiredString(entry, `${path}[${index}]`, diagnostics);
    if (capability !== undefined) capabilities.push(capability);
  });
  if (new Set(capabilities).size !== capabilities.length) {
    diagnostics.push(invalid(path, `${path} must not contain duplicate capabilities.`));
  }
  if (!capabilities.every((capability, index) => {
    const previous = capabilities[index - 1];
    return previous === undefined || compareUtf8(previous, capability) < 0;
  })) {
    diagnostics.push(invalid(path, `${path} must be sorted.`));
  }
  return capabilities;
}

function parseReleaseIdentity(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): AssetDistributionReleaseIdentity | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, [
    'namespace',
    'packId',
    'version',
    'archiveKind',
    'archiveDigest',
    'byteLength',
    'manifestDigest',
    'contentDigest',
    'sourceDigests',
    'creditsDigest',
    'licenseEvidenceDigest',
    'provenanceDigest',
    'requiredCapabilities',
  ], diagnostics);
  const namespace = requiredString(record.namespace, `${path}.namespace`, diagnostics);
  if (namespace !== undefined && !NAMESPACE_PATTERN.test(namespace)) {
    diagnostics.push(invalid(`${path}.namespace`, `${path}.namespace is not normalized.`));
  }
  const packId = requiredString(record.packId, `${path}.packId`, diagnostics);
  if (packId !== undefined && !PACK_ID_PATTERN.test(packId)) {
    diagnostics.push(invalid(`${path}.packId`, `${path}.packId is not normalized.`));
  }
  const version = requiredString(record.version, `${path}.version`, diagnostics);
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    diagnostics.push(invalid(`${path}.version`, `${path}.version must be semantic version.`));
  }
  if (record.archiveKind !== 'formal') {
    diagnostics.push(invalid(`${path}.archiveKind`, `${path}.archiveKind must be formal.`));
  }
  const archiveDigest = requiredDigest(record.archiveDigest, `${path}.archiveDigest`, diagnostics);
  const byteLength = record.byteLength;
  if (
    typeof byteLength !== 'number'
    || !Number.isSafeInteger(byteLength)
    || byteLength <= 0
    || byteLength > MAX_BYTE_LENGTH
  ) {
    diagnostics.push(invalid(
      `${path}.byteLength`,
      `${path}.byteLength must be a positive safe integer no greater than ${MAX_BYTE_LENGTH}.`,
    ));
  }
  const manifestDigest = requiredDigest(record.manifestDigest, `${path}.manifestDigest`, diagnostics);
  const contentDigest = requiredDigest(record.contentDigest, `${path}.contentDigest`, diagnostics);
  const sourceDigests = parseSourceDigests(record.sourceDigests, `${path}.sourceDigests`, diagnostics);
  const creditsDigest = requiredDigest(record.creditsDigest, `${path}.creditsDigest`, diagnostics);
  const licenseEvidenceDigest = requiredDigest(
    record.licenseEvidenceDigest,
    `${path}.licenseEvidenceDigest`,
    diagnostics,
  );
  const provenanceDigest = record.provenanceDigest === undefined
    ? undefined
    : requiredDigest(record.provenanceDigest, `${path}.provenanceDigest`, diagnostics);
  const requiredCapabilities = parseCapabilities(
    record.requiredCapabilities,
    `${path}.requiredCapabilities`,
    diagnostics,
  );
  if (
    namespace === undefined
    || !NAMESPACE_PATTERN.test(namespace)
    || packId === undefined
    || !PACK_ID_PATTERN.test(packId)
    || version === undefined
    || !SEMVER_PATTERN.test(version)
    || archiveDigest === undefined
    || typeof byteLength !== 'number'
    || !Number.isSafeInteger(byteLength)
    || byteLength <= 0
    || byteLength > MAX_BYTE_LENGTH
    || manifestDigest === undefined
    || contentDigest === undefined
    || sourceDigests === undefined
    || creditsDigest === undefined
    || licenseEvidenceDigest === undefined
    || requiredCapabilities === undefined
  ) return undefined;
  return {
    namespace,
    packId,
    version,
    archiveKind: 'formal',
    archiveDigest,
    byteLength,
    manifestDigest,
    contentDigest,
    sourceDigests,
    creditsDigest,
    licenseEvidenceDigest,
    ...(provenanceDigest === undefined ? {} : { provenanceDigest }),
    requiredCapabilities,
  };
}

function parseAuthorization(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): AssetDistributionReleaseAuthorization | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['namespacePolicyId', 'releaseEvidenceDigest'], diagnostics);
  const namespacePolicyId = requiredString(
    record.namespacePolicyId,
    `${path}.namespacePolicyId`,
    diagnostics,
  );
  const releaseEvidenceDigest = requiredDigest(
    record.releaseEvidenceDigest,
    `${path}.releaseEvidenceDigest`,
    diagnostics,
  );
  if (namespacePolicyId === undefined || releaseEvidenceDigest === undefined) return undefined;
  return { namespacePolicyId, releaseEvidenceDigest };
}

function parseSignature(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): AssetDistributionReleaseSignature | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['keyId', 'algorithm', 'payloadDigest', 'value'], diagnostics);
  const keyId = requiredDigest(record.keyId, `${path}.keyId`, diagnostics);
  if (record.algorithm !== ASSET_DISTRIBUTION_SIGNATURE_ALGORITHM) {
    diagnostics.push(diagnostic(
      'asset_distribution_unsupported',
      `${path}.algorithm`,
      `${path}.algorithm is not supported.`,
    ));
  }
  const payloadDigest = requiredDigest(record.payloadDigest, `${path}.payloadDigest`, diagnostics);
  const valueString = requiredString(record.value, `${path}.value`, diagnostics);
  if (valueString !== undefined && !BASE64URL_PATTERN.test(valueString)) {
    diagnostics.push(invalid(`${path}.value`, `${path}.value must be base64url signature bytes.`));
  }
  if (
    keyId === undefined
    || payloadDigest === undefined
    || valueString === undefined
    || !BASE64URL_PATTERN.test(valueString)
  ) return undefined;
  return {
    keyId,
    algorithm: ASSET_DISTRIBUTION_SIGNATURE_ALGORITHM,
    payloadDigest,
    value: valueString,
  };
}

export function parseAssetDistributionRelease(
  input: unknown,
): AssetDistributionReleaseParseResult {
  const diagnostics: AssetDistributionDiagnostic[] = [];
  const record = requiredRecord(input, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', ['schema', 'release', 'authorization', 'signature'], diagnostics);
  if (record.schema !== ASSET_DISTRIBUTION_RELEASE_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_distribution_unsupported',
      '$.schema',
      'Unsupported asset distribution release schema.',
    ));
  }
  const release = parseReleaseIdentity(record.release, '$.release', diagnostics);
  const authorization = parseAuthorization(record.authorization, '$.authorization', diagnostics);
  const signature = parseSignature(record.signature, '$.signature', diagnostics);
  if (
    diagnostics.length > 0
    || release === undefined
    || authorization === undefined
    || signature === undefined
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    release: {
      schema: ASSET_DISTRIBUTION_RELEASE_SCHEMA,
      release,
      authorization,
      signature,
    },
  };
}

export function assetDistributionSignedProjection(
  input: AssetDistributionRelease,
): AssetDistributionSignedProjection {
  return {
    release: {
      ...input.release,
      sourceDigests: input.release.sourceDigests.map((entry) => ({ ...entry })),
      requiredCapabilities: [...input.release.requiredCapabilities],
    },
    authorization: { ...input.authorization },
  };
}

export function assetDistributionSignedProjectionDigestInput(
  input: AssetDistributionRelease | AssetDistributionSignedProjection,
): string {
  const projection = 'signature' in input
    ? assetDistributionSignedProjection(input)
    : input;
  return JSON.stringify(canonicalize(projection));
}
