import type {
  AssetDistributionDiagnostic,
  AssetDistributionRelease,
  AssetDistributionSignatureAlgorithm,
} from './asset-distribution-schema.js';
import { assetDistributionSignedProjectionDigestInput } from './asset-distribution-schema.js';

export const ASSET_DISTRIBUTION_TRUST_POLICY_SCHEMA =
  'lpc-toolkit.asset-distribution-trust-policy.v1' as const;

export type AssetDistributionTrustKeyStatus =
  | 'active'
  | 'revoked'
  | 'compromised';

export interface AssetDistributionTrustKey {
  readonly keyId: string;
  readonly fingerprint: string;
  readonly namespace: string;
  readonly status: AssetDistributionTrustKeyStatus;
  readonly validFrom: string;
  readonly validUntil?: string;
  readonly grandfatheredArchiveDigests?: readonly string[];
}

export interface AssetDistributionTrustPolicy {
  readonly schema: typeof ASSET_DISTRIBUTION_TRUST_POLICY_SCHEMA;
  readonly policyId: string;
  readonly allowedAlgorithms: readonly AssetDistributionSignatureAlgorithm[];
  readonly keys: readonly AssetDistributionTrustKey[];
}

export type AssetDistributionTrustPolicyParseResult =
  | { readonly ok: true; readonly policy: AssetDistributionTrustPolicy }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionDiagnostic[] };

export type AssetDistributionTrustStatus =
  | 'trusted'
  | 'signature-invalid'
  | 'algorithm-unsupported'
  | 'key-untrusted'
  | 'key-revoked'
  | 'key-expired'
  | 'namespace-unauthorized'
  | 'policy-mismatch';

export type AssetDistributionTrustDecision =
  | {
    readonly status: 'trusted';
    readonly policyId: string;
    readonly namespace: string;
    readonly keyId: string;
  }
  | {
    readonly status: Exclude<AssetDistributionTrustStatus, 'trusted'>;
    readonly code:
      | 'asset_distribution_signature_invalid'
      | 'asset_distribution_algorithm_unsupported'
      | 'asset_distribution_key_untrusted'
      | 'asset_distribution_key_revoked'
      | 'asset_distribution_key_expired'
      | 'asset_distribution_namespace_unauthorized'
      | 'asset_distribution_policy_mismatch';
    readonly policyId: string;
    readonly namespace: string;
    readonly keyId: string;
  };

export interface AssetDistributionTrustEvaluationInput {
  readonly release: AssetDistributionRelease;
  readonly policy: AssetDistributionTrustPolicy;
  readonly signatureValid: boolean;
  readonly publicKeyFingerprint: string;
  readonly observedAt: string;
}

export interface AssetDistributionSignatureSigningInput {
  readonly canonicalPayload: string;
  readonly keyId: string;
  readonly payloadDigest: string;
}

export interface AssetDistributionSignatureSigner {
  readonly algorithm: AssetDistributionSignatureAlgorithm;
  sign(input: AssetDistributionSignatureSigningInput): string;
}

export interface AssetDistributionSignatureVerificationInput {
  readonly canonicalPayload: string;
  readonly keyId: string;
  readonly payloadDigest: string;
  readonly signatureValue: string;
  readonly publicKeyFingerprint: string;
}

export interface AssetDistributionSignatureVerifier {
  readonly algorithm: AssetDistributionSignatureAlgorithm;
  verify(input: AssetDistributionSignatureVerificationInput): boolean;
}

export type AssetDistributionSignatureSigningResult =
  | {
    readonly ok: true;
    readonly canonicalPayload: string;
    readonly signatureValue: string;
  }
  | {
    readonly ok: false;
    readonly canonicalPayload: string;
    readonly code: 'asset_distribution_algorithm_unsupported';
  };

export interface AssetDistributionSignatureVerificationResult {
  readonly canonicalPayload: string;
  readonly signatureValid: boolean;
}

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const POLICY_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_KEYS = 128;
const MAX_GRANDFATHERED_ARCHIVE_DIGESTS = 256;
const MAX_IDENTIFIER_BYTES = 256;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
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

function invalid(path: string, message: string): AssetDistributionDiagnostic {
  return { code: 'asset_distribution_invalid', path, message };
}

function unsupported(path: string, message: string): AssetDistributionDiagnostic {
  return { code: 'asset_distribution_unsupported', path, message };
}

function exactKeys(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  diagnostics: AssetDistributionDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) diagnostics.push(invalid(`${path}.${key}`, `Unknown field at ${path}.${key}.`));
  }
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
    diagnostics.push({
      code: 'asset_distribution_limit_exceeded',
      path,
      message: `${path} exceeds ${MAX_IDENTIFIER_BYTES} characters.`,
    });
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

function compareKeyId(left: AssetDistributionTrustKey, right: AssetDistributionTrustKey): number {
  return compareUtf8(left.keyId, right.keyId);
}

function parseTrustKey(
  value: unknown,
  path: string,
  diagnostics: AssetDistributionDiagnostic[],
): AssetDistributionTrustKey | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, `${path} must be an object.`));
    return undefined;
  }
  exactKeys(value, path, [
    'keyId',
    'fingerprint',
    'namespace',
    'status',
    'validFrom',
    'validUntil',
    'grandfatheredArchiveDigests',
  ], diagnostics);
  const keyId = requiredDigest(value.keyId, `${path}.keyId`, diagnostics);
  const fingerprint = requiredDigest(value.fingerprint, `${path}.fingerprint`, diagnostics);
  const namespace = requiredString(value.namespace, `${path}.namespace`, diagnostics);
  if (namespace !== undefined && !NAMESPACE_PATTERN.test(namespace)) {
    diagnostics.push(invalid(`${path}.namespace`, `${path}.namespace is not normalized.`));
  }
  const validFrom = requiredString(value.validFrom, `${path}.validFrom`, diagnostics);
  if (validFrom !== undefined && !ISO_DATE_PATTERN.test(validFrom)) {
    diagnostics.push(invalid(`${path}.validFrom`, `${path}.validFrom must be UTC ISO-8601.`));
  }
  const validUntil = value.validUntil === undefined
    ? undefined
    : requiredString(value.validUntil, `${path}.validUntil`, diagnostics);
  if (validUntil !== undefined && !ISO_DATE_PATTERN.test(validUntil)) {
    diagnostics.push(invalid(`${path}.validUntil`, `${path}.validUntil must be UTC ISO-8601.`));
  }
  if (
    validFrom !== undefined
    && ISO_DATE_PATTERN.test(validFrom)
    && validUntil !== undefined
    && ISO_DATE_PATTERN.test(validUntil)
    && validUntil <= validFrom
  ) {
    diagnostics.push(invalid(`${path}.validUntil`, `${path}.validUntil must be after validFrom.`));
  }
  const rawGrandfatheredArchiveDigests = value.grandfatheredArchiveDigests;
  const grandfatheredArchiveDigests: string[] = [];
  if (rawGrandfatheredArchiveDigests !== undefined && !Array.isArray(rawGrandfatheredArchiveDigests)) {
    diagnostics.push(invalid(
      `${path}.grandfatheredArchiveDigests`,
      `${path}.grandfatheredArchiveDigests must be an array.`,
    ));
  }
  if (Array.isArray(rawGrandfatheredArchiveDigests)) {
    if (rawGrandfatheredArchiveDigests.length > MAX_GRANDFATHERED_ARCHIVE_DIGESTS) {
      diagnostics.push({
        code: 'asset_distribution_limit_exceeded',
        path: `${path}.grandfatheredArchiveDigests`,
        message: `${path}.grandfatheredArchiveDigests exceeds ${MAX_GRANDFATHERED_ARCHIVE_DIGESTS} digests.`,
      });
    }
    rawGrandfatheredArchiveDigests.forEach((digest, index) => {
      const parsedDigest = requiredDigest(
        digest,
        `${path}.grandfatheredArchiveDigests[${index}]`,
        diagnostics,
      );
      if (parsedDigest !== undefined) grandfatheredArchiveDigests.push(parsedDigest);
    });
    if (new Set(grandfatheredArchiveDigests).size !== grandfatheredArchiveDigests.length) {
      diagnostics.push(invalid(
        `${path}.grandfatheredArchiveDigests`,
        `${path}.grandfatheredArchiveDigests must not contain duplicates.`,
      ));
    }
    if (!grandfatheredArchiveDigests.every((digest, index) => {
      const previous = grandfatheredArchiveDigests[index - 1];
      return previous === undefined || compareUtf8(previous, digest) < 0;
    })) {
      diagnostics.push(invalid(
        `${path}.grandfatheredArchiveDigests`,
        `${path}.grandfatheredArchiveDigests must be sorted.`,
      ));
    }
  }
  if (value.status !== 'active' && value.status !== 'revoked' && value.status !== 'compromised') {
    diagnostics.push(unsupported(`${path}.status`, `${path}.status is not supported.`));
  }
  if (
    keyId === undefined
    || fingerprint === undefined
    || namespace === undefined
    || !NAMESPACE_PATTERN.test(namespace)
    || validFrom === undefined
    || !ISO_DATE_PATTERN.test(validFrom)
    || (validUntil !== undefined && !ISO_DATE_PATTERN.test(validUntil))
    || (validUntil !== undefined && validUntil <= validFrom)
    || (rawGrandfatheredArchiveDigests !== undefined && !Array.isArray(rawGrandfatheredArchiveDigests))
    || (Array.isArray(rawGrandfatheredArchiveDigests)
      && grandfatheredArchiveDigests.length !== rawGrandfatheredArchiveDigests.length)
    || (value.status !== 'active' && value.status !== 'revoked' && value.status !== 'compromised')
  ) return undefined;
  return {
    keyId,
    fingerprint,
    namespace,
    status: value.status,
    validFrom,
    ...(validUntil === undefined ? {} : { validUntil }),
    ...(rawGrandfatheredArchiveDigests === undefined ? {} : { grandfatheredArchiveDigests }),
  };
}

export function parseAssetDistributionTrustPolicy(
  input: unknown,
): AssetDistributionTrustPolicyParseResult {
  const diagnostics: AssetDistributionDiagnostic[] = [];
  if (!isRecord(input)) {
    return { ok: false, diagnostics: [invalid('$', '$ must be an object.')] };
  }
  exactKeys(input, '$', ['schema', 'policyId', 'allowedAlgorithms', 'keys'], diagnostics);
  if (input.schema !== ASSET_DISTRIBUTION_TRUST_POLICY_SCHEMA) {
    diagnostics.push(unsupported('$.schema', 'Unsupported asset distribution trust policy schema.'));
  }
  const policyId = requiredString(input.policyId, '$.policyId', diagnostics);
  if (policyId !== undefined && !POLICY_ID_PATTERN.test(policyId)) {
    diagnostics.push(invalid('$.policyId', '$.policyId is not normalized.'));
  }
  const rawAlgorithms = input.allowedAlgorithms;
  if (!Array.isArray(rawAlgorithms) || rawAlgorithms.length === 0) {
    diagnostics.push(invalid('$.allowedAlgorithms', '$.allowedAlgorithms must be non-empty array.'));
  }
  const allowedAlgorithms: AssetDistributionSignatureAlgorithm[] = [];
  if (Array.isArray(rawAlgorithms)) {
    rawAlgorithms.forEach((algorithm, index) => {
      if (algorithm !== 'ed25519') {
        diagnostics.push(unsupported(
          `$.allowedAlgorithms[${index}]`,
          `$.allowedAlgorithms[${index}] is not supported.`,
        ));
      } else {
        allowedAlgorithms.push(algorithm);
      }
    });
  }
  if (new Set(allowedAlgorithms).size !== allowedAlgorithms.length) {
    diagnostics.push(invalid('$.allowedAlgorithms', '$.allowedAlgorithms must not contain duplicates.'));
  }
  const rawKeys = input.keys;
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
    diagnostics.push(invalid('$.keys', '$.keys must be non-empty array.'));
  }
  if (Array.isArray(rawKeys) && rawKeys.length > MAX_KEYS) {
    diagnostics.push({
      code: 'asset_distribution_limit_exceeded',
      path: '$.keys',
      message: `$.keys exceeds ${MAX_KEYS} keys.`,
    });
  }
  const keys: AssetDistributionTrustKey[] = [];
  if (Array.isArray(rawKeys)) {
    rawKeys.forEach((key, index) => {
      const parsed = parseTrustKey(key, `$.keys[${index}]`, diagnostics);
      if (parsed !== undefined) keys.push(parsed);
    });
  }
  if (new Set(keys.map((key) => key.keyId)).size !== keys.length) {
    diagnostics.push(invalid('$.keys', '$.keys must not contain duplicate key IDs.'));
  }
  if (!keys.every((key, index) => {
    const previous = keys[index - 1];
    return previous === undefined || compareKeyId(previous, key) < 0;
  })) {
    diagnostics.push(invalid('$.keys', '$.keys must be sorted by key ID.'));
  }
  if (
    diagnostics.length > 0
    || policyId === undefined
    || !POLICY_ID_PATTERN.test(policyId)
    || !Array.isArray(rawAlgorithms)
    || rawAlgorithms.length === 0
    || allowedAlgorithms.length !== rawAlgorithms.length
    || !Array.isArray(rawKeys)
    || rawKeys.length === 0
    || keys.length !== rawKeys.length
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    policy: {
      schema: ASSET_DISTRIBUTION_TRUST_POLICY_SCHEMA,
      policyId,
      allowedAlgorithms,
      keys,
    },
  };
}

export function assetDistributionTrustPolicyDigestInput(
  policy: AssetDistributionTrustPolicy,
): string {
  return JSON.stringify(canonicalize({
    allowedAlgorithms: [...policy.allowedAlgorithms],
    keys: policy.keys.map((key) => ({ ...key })),
    policyId: policy.policyId,
    schema: policy.schema,
  }));
}

export function signAssetDistributionRelease(
  release: AssetDistributionRelease,
  signer: AssetDistributionSignatureSigner,
): AssetDistributionSignatureSigningResult {
  const canonicalPayload = assetDistributionSignedProjectionDigestInput(release);
  if (signer.algorithm !== release.signature.algorithm) {
    return {
      ok: false,
      canonicalPayload,
      code: 'asset_distribution_algorithm_unsupported',
    };
  }
  return {
    ok: true,
    canonicalPayload,
    signatureValue: signer.sign({
      canonicalPayload,
      keyId: release.signature.keyId,
      payloadDigest: release.signature.payloadDigest,
    }),
  };
}

export function verifyAssetDistributionSignature(input: {
  readonly release: AssetDistributionRelease;
  readonly publicKeyFingerprint: string;
  readonly verifier: AssetDistributionSignatureVerifier;
}): AssetDistributionSignatureVerificationResult {
  const canonicalPayload = assetDistributionSignedProjectionDigestInput(input.release);
  if (input.verifier.algorithm !== input.release.signature.algorithm) {
    return { canonicalPayload, signatureValid: false };
  }
  return {
    canonicalPayload,
    signatureValid: input.verifier.verify({
      canonicalPayload,
      keyId: input.release.signature.keyId,
      payloadDigest: input.release.signature.payloadDigest,
      signatureValue: input.release.signature.value,
      publicKeyFingerprint: input.publicKeyFingerprint,
    }),
  };
}

export function evaluateAssetDistributionTrust(
  input: AssetDistributionTrustEvaluationInput,
): AssetDistributionTrustDecision {
  const { release, policy, signatureValid, observedAt } = input;
  const namespace = release.release.namespace;
  const keyId = release.signature.keyId;
  const base = { policyId: policy.policyId, namespace, keyId };
  if (release.authorization.namespacePolicyId !== policy.policyId) {
    return {
      ...base,
      status: 'policy-mismatch',
      code: 'asset_distribution_policy_mismatch',
    };
  }
  if (!policy.allowedAlgorithms.includes(release.signature.algorithm)) {
    return {
      ...base,
      status: 'algorithm-unsupported',
      code: 'asset_distribution_algorithm_unsupported',
    };
  }
  if (!signatureValid) {
    return {
      ...base,
      status: 'signature-invalid',
      code: 'asset_distribution_signature_invalid',
    };
  }
  const key = policy.keys.find((candidate) => candidate.keyId === keyId);
  if (key === undefined) {
    return {
      ...base,
      status: 'key-untrusted',
      code: 'asset_distribution_key_untrusted',
    };
  }
  if (key.namespace !== namespace) {
    return {
      ...base,
      status: 'namespace-unauthorized',
      code: 'asset_distribution_namespace_unauthorized',
    };
  }
  if (key.fingerprint !== input.publicKeyFingerprint) {
    return {
      ...base,
      status: 'key-untrusted',
      code: 'asset_distribution_key_untrusted',
    };
  }
  const isGrandfathered = key.grandfatheredArchiveDigests?.includes(release.release.archiveDigest) ?? false;
  if (key.status !== 'active' && !isGrandfathered) {
    return {
      ...base,
      status: 'key-revoked',
      code: 'asset_distribution_key_revoked',
    };
  }
  if (observedAt < key.validFrom || (key.validUntil !== undefined && observedAt >= key.validUntil)) {
    return {
      ...base,
      status: 'key-expired',
      code: 'asset_distribution_key_expired',
    };
  }
  return { ...base, status: 'trusted' };
}
