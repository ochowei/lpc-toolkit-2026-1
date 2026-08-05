export const ASSET_PROVIDER_DESCRIPTOR_SCHEMA =
  'lpc-toolkit.asset-provider-descriptor.v1' as const;
export const ASSET_PROVIDER_DISCOVERY_SCHEMA =
  'lpc-toolkit.asset-provider-discovery.v1' as const;
export const ASSET_PROVIDER_INVOCATION_SCHEMA =
  'lpc-toolkit.asset-provider-invocation.v1' as const;
export const ASSET_PROVIDER_RESULT_SCHEMA =
  'lpc-toolkit.asset-provider-result.v1' as const;
export const ASSET_PROVIDER_REFUSAL_SCHEMA =
  'lpc-toolkit.asset-provider-refusal.v1' as const;
export const AGENT_INTEGRATION_MANIFEST_SCHEMA =
  'lpc-toolkit.agent-integration-manifest.v1' as const;

export const ASSET_PROVIDER_OPERATION = 'sprite-candidate.v1' as const;
export const ASSET_PROVIDER_CONTRACT_VERSION =
  'lpc-toolkit.sprite-drawing-contract.v1' as const;

export const ASSET_PROVIDER_CAPABILITIES = [
  'asset-authoring-provider-discovery.v1',
  'asset-authoring-provider-invocation.v1',
  'agent-integration-packaging.v1',
] as const;

export const ASSET_PROVIDER_REFUSAL_CODES = [
  'asset_provider_unavailable',
  'asset_provider_capability_unsupported',
  'asset_provider_contract_mismatch',
  'asset_provider_consent_required',
  'asset_provider_scope_violation',
  'asset_provider_network_denied',
  'asset_provider_secret_input',
  'asset_provider_result_invalid',
  'asset_provider_result_stale',
  'asset_provider_cancelled',
  'asset_provider_timeout',
  'agent_integration_capability_unsupported',
] as const;

export type AssetProviderRefusalCode = (typeof ASSET_PROVIDER_REFUSAL_CODES)[number];

export const ASSET_PROVIDER_LIMITS = {
  descriptorBytes: 64 * 1024,
  discoveryDescriptors: 32,
  identifierBytes: 256,
  capabilities: 32,
  contractVersions: 32,
  declaredHosts: 16,
  references: 8,
  targetIds: 64,
  timeoutSeconds: { min: 1, max: 600 },
  candidateBytes: 64 * 1024 * 1024,
  decodedCandidatePixels: 16 * 1024 * 1024,
} as const;

export type AssetProviderDiagnosticCode =
  | 'asset_provider_schema_invalid'
  | 'asset_provider_schema_unsupported'
  | 'asset_provider_private_data'
  | 'asset_provider_limit_exceeded'
  | 'asset_provider_digest_invalid'
  | 'asset_provider_semver_invalid'
  | 'asset_provider_capability_invalid'
  | 'asset_provider_binding_mismatch';

export interface AssetProviderDiagnostic {
  readonly code: AssetProviderDiagnosticCode;
  readonly message: string;
  readonly path: string;
}

export type AssetProviderParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] };

export type AssetProviderDescriptorParseResult =
  | { readonly ok: true; readonly descriptor: AssetProviderDescriptor }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] };

export interface AssetProviderSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

export type AssetProviderSemverComparatorOperator = '>=' | '>' | '<=' | '<' | '=';

export interface AssetProviderSemverComparator {
  readonly operator: AssetProviderSemverComparatorOperator;
  readonly version: AssetProviderSemver;
}

export type AssetProviderSemverRange = readonly AssetProviderSemverComparator[];

export interface AssetProviderDescriptorAdapter {
  readonly id: string;
  readonly version: string;
  readonly cliRange: string;
}

export interface AssetProviderDescriptorLimits {
  readonly maxCandidateBytes: number;
  readonly timeoutSeconds: number;
  readonly maxReferences: number;
}

export interface AssetProviderDescriptor {
  readonly schema: typeof ASSET_PROVIDER_DESCRIPTOR_SCHEMA;
  readonly id: string;
  readonly adapter: AssetProviderDescriptorAdapter;
  readonly capabilities: readonly string[];
  readonly contractVersions: readonly string[];
  readonly limits: AssetProviderDescriptorLimits;
  readonly network: {
    readonly required: boolean;
    readonly declaredHosts: readonly string[];
  };
  readonly credentials: {
    readonly required: boolean;
    readonly handledOutsideCli: boolean;
  };
}

export type AssetProviderAvailability = 'available' | 'unavailable';
export type AssetProviderDiscoveryStatus =
  | 'supported'
  | 'unsupported'
  | 'unavailable'
  | 'consent-required';

export interface AssetProviderDiscoveryEntryInput {
  readonly availability: AssetProviderAvailability;
  readonly descriptor: AssetProviderDescriptor;
  readonly descriptorDigest: string;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly cliVersion: string;
}

export interface AssetProviderDiscoveryRefusal {
  readonly code: AssetProviderRefusalCode;
  readonly message: string;
}

export interface AssetProviderDiscoveryEntry {
  readonly descriptorDigest: string;
  readonly id: string;
  readonly adapter: {
    readonly id: string;
    readonly version: string;
  };
  readonly status: AssetProviderDiscoveryStatus;
  readonly missingCapabilities: readonly string[];
  readonly refusal: AssetProviderDiscoveryRefusal | null;
}

export interface AssetProviderDiscovery {
  readonly schema: typeof ASSET_PROVIDER_DISCOVERY_SCHEMA;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly cliVersion: string;
  readonly entries: readonly AssetProviderDiscoveryEntry[];
}

export type AssetProviderDiscoveryParseResult =
  | { readonly ok: true; readonly discovery: AssetProviderDiscovery }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] };

export interface AssetProviderIdentity {
  readonly id: string;
  readonly adapter: {
    readonly id: string;
    readonly version: string;
  };
}

export interface AssetProviderConsent {
  readonly confirmed: boolean;
  readonly scopeDigest: string;
  readonly network: {
    readonly enabled: boolean;
    readonly hosts: readonly string[];
  };
  readonly referenceDigests: readonly string[];
}

export interface AssetProviderInvocationLimits {
  readonly maxCandidateBytes: number;
  readonly timeoutSeconds: number;
  readonly maxReferences: number;
}

export interface AssetProviderInvocationCandidate {
  readonly stagingId: string;
  readonly targetIds: readonly string[];
}

export interface AssetProviderInvocation {
  readonly schema: typeof ASSET_PROVIDER_INVOCATION_SCHEMA;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly operation: typeof ASSET_PROVIDER_OPERATION;
  readonly provider: AssetProviderIdentity;
  readonly targetIds: readonly string[];
  readonly inputDigests?: readonly string[];
  readonly consent: AssetProviderConsent;
  readonly limits: AssetProviderInvocationLimits;
  readonly candidate: AssetProviderInvocationCandidate;
}

export interface AssetProviderResultCandidate {
  readonly id: string;
  readonly digest: string;
  readonly byteLength: number;
}

export interface AssetProviderResult {
  readonly schema: typeof ASSET_PROVIDER_RESULT_SCHEMA;
  readonly invocationDigest: string;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly operation: typeof ASSET_PROVIDER_OPERATION;
  readonly provider: AssetProviderIdentity;
  readonly targetId: string;
  readonly consentScopeDigest: string;
  readonly inputDigests?: readonly string[];
  readonly referenceDigests?: readonly string[];
  readonly candidate: AssetProviderResultCandidate;
}

export type AssetProviderNextAction =
  | 'rematerialize-contract'
  | 'provide-external-candidate'
  | 'retry-within-scope'
  | 'resolve-precondition';

export interface AssetProviderRefusal {
  readonly schema: typeof ASSET_PROVIDER_REFUSAL_SCHEMA;
  readonly invocationDigest: string;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly operation: typeof ASSET_PROVIDER_OPERATION;
  readonly provider: AssetProviderIdentity;
  readonly targetIds: readonly string[];
  readonly consentScopeDigest: string;
  readonly referenceDigests: readonly string[];
  readonly code: AssetProviderRefusalCode;
  readonly nextAction: AssetProviderNextAction;
}

export type AssetProviderInvocationParseResult =
  | { readonly ok: true; readonly invocation: AssetProviderInvocation }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] };
export type AssetProviderResultParseResult =
  | { readonly ok: true; readonly result: AssetProviderResult }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] };
export type AssetProviderRefusalParseResult =
  | { readonly ok: true; readonly refusal: AssetProviderRefusal }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] };

export interface AgentIntegrationProviderAdapter {
  readonly id: string;
  readonly version: string;
}

export type AgentIntegrationSupportedGoal = 'new-item' | 'extend-item';

export interface AgentIntegrationManifest {
  readonly schema: typeof AGENT_INTEGRATION_MANIFEST_SCHEMA;
  readonly id: string;
  readonly version: string;
  readonly cliRange: string;
  readonly requiredCapabilities: readonly string[];
  readonly optionalCapabilities: readonly string[];
  readonly supportedGoals: readonly AgentIntegrationSupportedGoal[];
  readonly providerAdapters: readonly AgentIntegrationProviderAdapter[];
}

export type AgentIntegrationManifestParseResult =
  | { readonly ok: true; readonly manifest: AgentIntegrationManifest }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] };

export interface AgentIntegrationCompatibilityInput {
  readonly cliVersion: string;
  readonly capabilities: readonly string[];
}

export interface AgentIntegrationCompatibility {
  readonly cliRangeCompatible: boolean;
  readonly missingRequiredCapabilities: readonly string[];
  readonly missingOptionalCapabilities: readonly string[];
  readonly optionalFallback: boolean;
  readonly refusal: {
    readonly code: 'agent_integration_capability_unsupported';
    readonly message: string;
  } | null;
}

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const HOST_PATTERN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/u;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const RANGE_COMPARATOR_PATTERN = /^(>=|<=|>|<|=)(.+)$/u;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function diagnostic(
  code: AssetProviderDiagnosticCode,
  path: string,
  message: string,
): AssetProviderDiagnostic {
  return { code, message, path };
}

function invalid(path: string, message: string): AssetProviderDiagnostic {
  return diagnostic('asset_provider_schema_invalid', path, message);
}

function exactKeys(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  diagnostics: AssetProviderDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      diagnostics.push(invalid(`${path}.${key}`, `Unknown field at ${path}.${key}.`));
    }
  }
}

function requiredRecord(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
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
  diagnostics: AssetProviderDiagnostic[],
): string | undefined {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    diagnostics.push(invalid(path, `${path} must be a non-empty trimmed string.`));
    return undefined;
  }
  return value;
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
    || value.includes('\u0000')
    || [...value].some((character) => character.codePointAt(0) !== undefined && (character.codePointAt(0) ?? 0) < 0x20);
}

function parseIdentifier(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    diagnostics.push(invalid(path, `${path} must be a non-empty trimmed identifier.`));
    return undefined;
  }
  if (utf8ByteLength(value) > ASSET_PROVIDER_LIMITS.identifierBytes) {
    diagnostics.push(diagnostic(
      'asset_provider_limit_exceeded',
      path,
      `${path} exceeds ${ASSET_PROVIDER_LIMITS.identifierBytes} UTF-8 bytes.`,
    ));
  }
  if (identifierIsPrivate(value)) {
    diagnostics.push(diagnostic(
      'asset_provider_private_data',
      path,
      `${path} contains a path, URL, secret, or private value.`,
    ));
  } else if (!IDENTIFIER_PATTERN.test(value)) {
    diagnostics.push(invalid(path, `${path} contains unsupported identifier characters.`));
  }
  return value;
}

function parseHost(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): string | undefined {
  const host = parseIdentifier(value, path, diagnostics);
  if (host !== undefined && !HOST_PATTERN.test(host)) {
    diagnostics.push(invalid(path, `${path} must be a host name without a URL, port, or path.`));
  }
  return host;
}

function parseStringSet(
  value: unknown,
  path: string,
  limit: number,
  diagnostics: AssetProviderDiagnostic[],
  parser: (entry: unknown, entryPath: string, target: AssetProviderDiagnostic[]) => string | undefined = parseIdentifier,
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  if (value.length > limit) {
    diagnostics.push(diagnostic(
      'asset_provider_limit_exceeded',
      path,
      `${path} exceeds ${limit} entries.`,
    ));
  }
  const entries: string[] = [];
  value.forEach((entry, index) => {
    const parsed = parser(entry, `${path}[${index}]`, diagnostics);
    if (parsed !== undefined) entries.push(parsed);
  });
  if (new Set(entries).size !== entries.length) {
    diagnostics.push(invalid(path, `${path} must not contain duplicate values.`));
  }
  return entries.sort(compareUtf8);
}

function parseBoolean(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): boolean | undefined {
  const value = record[key];
  if (typeof value !== 'boolean') {
    diagnostics.push(invalid(path, `${path} must be a boolean.`));
    return undefined;
  }
  return value;
}

function parseBoundedInteger(
  record: JsonRecord,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
  diagnostics: AssetProviderDiagnostic[],
): number | undefined {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    diagnostics.push(invalid(path, `${path} must be an integer.`));
    return undefined;
  }
  if (value < minimum || value > maximum) {
    diagnostics.push(diagnostic(
      'asset_provider_limit_exceeded',
      path,
      `${path} must be between ${minimum} and ${maximum}.`,
    ));
  }
  return value;
}

function parseDigest(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    diagnostics.push(diagnostic(
      'asset_provider_digest_invalid',
      path,
      `${path} must be a sha256 digest.`,
    ));
    return undefined;
  }
  return value;
}

function parseDigestArray(
  value: unknown,
  path: string,
  limit: number,
  diagnostics: AssetProviderDiagnostic[],
  required: boolean,
): readonly string[] | undefined {
  if (value === undefined && !required) return undefined;
  const result = parseStringSet(value, path, limit, diagnostics, parseDigest);
  return result;
}

function parseProviderIdentity(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderIdentity | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['id', 'adapter'], diagnostics);
  const id = parseIdentifier(record.id, `${path}.id`, diagnostics);
  const adapterPath = `${path}.adapter`;
  const adapter = requiredRecord(record.adapter, adapterPath, diagnostics);
  let adapterId: string | undefined;
  let adapterVersion: string | undefined;
  if (adapter) {
    exactKeys(adapter, adapterPath, ['id', 'version'], diagnostics);
    adapterId = parseIdentifier(adapter.id, `${adapterPath}.id`, diagnostics);
    adapterVersion = requiredString(adapter, 'version', `${adapterPath}.version`, diagnostics);
    if (adapterVersion !== undefined && !parseSemver(adapterVersion)) {
      diagnostics.push(diagnostic(
        'asset_provider_semver_invalid',
        `${adapterPath}.version`,
        `${adapterPath}.version must be a semantic version.`,
      ));
    }
  }
  if (id === undefined || adapterId === undefined || adapterVersion === undefined) return undefined;
  return {
    id,
    adapter: {
      id: adapterId,
      version: adapterVersion,
    },
  };
}

function parseOperation(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): typeof ASSET_PROVIDER_OPERATION | undefined {
  const operation = typeof value === 'string' ? value : undefined;
  if (operation !== ASSET_PROVIDER_OPERATION) {
    diagnostics.push(invalid(path, `${path} must be ${ASSET_PROVIDER_OPERATION}.`));
    return undefined;
  }
  return ASSET_PROVIDER_OPERATION;
}

function parseTargetIds(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): readonly string[] | undefined {
  const targetIds = parseStringSet(
    value,
    path,
    ASSET_PROVIDER_LIMITS.targetIds,
    diagnostics,
  );
  if (targetIds !== undefined && targetIds.length === 0) {
    diagnostics.push(invalid(path, `${path} must contain at least one target id.`));
  }
  return targetIds;
}

function parseInvocationConsent(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderConsent | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['confirmed', 'scopeDigest', 'network', 'referenceDigests'], diagnostics);
  const confirmed = parseBoolean(record, 'confirmed', `${path}.confirmed`, diagnostics);
  const scopeDigest = parseDigest(record.scopeDigest, `${path}.scopeDigest`, diagnostics);
  const networkPath = `${path}.network`;
  const network = requiredRecord(record.network, networkPath, diagnostics);
  let enabled: boolean | undefined;
  let hosts: readonly string[] | undefined;
  if (network) {
    exactKeys(network, networkPath, ['enabled', 'hosts'], diagnostics);
    enabled = parseBoolean(network, 'enabled', `${networkPath}.enabled`, diagnostics);
    hosts = parseStringSet(
      network.hosts,
      `${networkPath}.hosts`,
      ASSET_PROVIDER_LIMITS.declaredHosts,
      diagnostics,
      parseHost,
    );
  }
  const referenceDigests = parseDigestArray(
    record.referenceDigests,
    `${path}.referenceDigests`,
    ASSET_PROVIDER_LIMITS.references,
    diagnostics,
    true,
  );
  if (
    confirmed === undefined
    || scopeDigest === undefined
    || enabled === undefined
    || hosts === undefined
    || referenceDigests === undefined
  ) return undefined;
  return {
    confirmed,
    scopeDigest,
    network: { enabled, hosts },
    referenceDigests,
  };
}

function parseInvocationLimits(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderInvocationLimits | undefined {
  return parseDescriptorLimits(value, path, diagnostics);
}

function parseInvocationCandidate(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderInvocationCandidate | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['stagingId', 'targetIds'], diagnostics);
  const stagingId = parseIdentifier(record.stagingId, `${path}.stagingId`, diagnostics);
  const targetIds = parseTargetIds(record.targetIds, `${path}.targetIds`, diagnostics);
  if (stagingId === undefined || targetIds === undefined) return undefined;
  return { stagingId, targetIds };
}

export function parseAssetProviderInvocation(
  value: unknown,
): AssetProviderInvocationParseResult {
  const diagnostics: AssetProviderDiagnostic[] = [];
  const record = requiredRecord(value, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', [
    'schema',
    'sessionId',
    'contractDigest',
    'operation',
    'provider',
    'targetIds',
    'inputDigests',
    'consent',
    'limits',
    'candidate',
  ], diagnostics);
  if (record.schema !== ASSET_PROVIDER_INVOCATION_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_provider_schema_unsupported',
      '$.schema',
      'Unsupported asset provider invocation schema.',
    ));
  }
  const sessionId = parseIdentifier(record.sessionId, '$.sessionId', diagnostics);
  const contractDigest = parseDigest(record.contractDigest, '$.contractDigest', diagnostics);
  const operation = parseOperation(record.operation, '$.operation', diagnostics);
  const provider = parseProviderIdentity(record.provider, '$.provider', diagnostics);
  const targetIds = parseTargetIds(record.targetIds, '$.targetIds', diagnostics);
  const inputDigests = parseDigestArray(
    record.inputDigests,
    '$.inputDigests',
    64,
    diagnostics,
    false,
  );
  const consent = parseInvocationConsent(record.consent, '$.consent', diagnostics);
  const limits = parseInvocationLimits(record.limits, '$.limits', diagnostics);
  const candidate = parseInvocationCandidate(record.candidate, '$.candidate', diagnostics);
  if (targetIds !== undefined && candidate !== undefined && !sameStrings(targetIds, candidate.targetIds)) {
    diagnostics.push(diagnostic(
      'asset_provider_binding_mismatch',
      '$.candidate.targetIds',
      '$.candidate.targetIds must match $.targetIds.',
    ));
  }
  if (
    diagnostics.length > 0
    || sessionId === undefined
    || contractDigest === undefined
    || operation === undefined
    || provider === undefined
    || targetIds === undefined
    || consent === undefined
    || limits === undefined
    || candidate === undefined
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    invocation: {
      schema: ASSET_PROVIDER_INVOCATION_SCHEMA,
      sessionId,
      contractDigest,
      operation,
      provider,
      targetIds,
      ...(inputDigests === undefined ? {} : { inputDigests }),
      consent,
      limits,
      candidate,
    },
  };
}

function parseResultCandidate(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderResultCandidate | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['id', 'digest', 'byteLength'], diagnostics);
  const id = parseIdentifier(record.id, `${path}.id`, diagnostics);
  const digest = parseDigest(record.digest, `${path}.digest`, diagnostics);
  const byteLength = parseBoundedInteger(
    record,
    'byteLength',
    `${path}.byteLength`,
    1,
    ASSET_PROVIDER_LIMITS.candidateBytes,
    diagnostics,
  );
  if (id === undefined || digest === undefined || byteLength === undefined) return undefined;
  return { id, digest, byteLength };
}

export function parseAssetProviderResult(
  value: unknown,
): AssetProviderResultParseResult {
  const diagnostics: AssetProviderDiagnostic[] = [];
  const record = requiredRecord(value, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', [
    'schema',
    'invocationDigest',
    'sessionId',
    'contractDigest',
    'operation',
    'provider',
    'targetId',
    'consentScopeDigest',
    'inputDigests',
    'referenceDigests',
    'candidate',
  ], diagnostics);
  if (record.schema !== ASSET_PROVIDER_RESULT_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_provider_schema_unsupported',
      '$.schema',
      'Unsupported asset provider result schema.',
    ));
  }
  const invocationDigest = parseDigest(record.invocationDigest, '$.invocationDigest', diagnostics);
  const sessionId = parseIdentifier(record.sessionId, '$.sessionId', diagnostics);
  const contractDigest = parseDigest(record.contractDigest, '$.contractDigest', diagnostics);
  const operation = parseOperation(record.operation, '$.operation', diagnostics);
  const provider = parseProviderIdentity(record.provider, '$.provider', diagnostics);
  const targetId = parseIdentifier(record.targetId, '$.targetId', diagnostics);
  const consentScopeDigest = parseDigest(
    record.consentScopeDigest,
    '$.consentScopeDigest',
    diagnostics,
  );
  const inputDigests = parseDigestArray(record.inputDigests, '$.inputDigests', 64, diagnostics, false);
  const referenceDigests = parseDigestArray(
    record.referenceDigests,
    '$.referenceDigests',
    ASSET_PROVIDER_LIMITS.references,
    diagnostics,
    false,
  );
  const candidate = parseResultCandidate(record.candidate, '$.candidate', diagnostics);
  if (
    diagnostics.length > 0
    || invocationDigest === undefined
    || sessionId === undefined
    || contractDigest === undefined
    || operation === undefined
    || provider === undefined
    || targetId === undefined
    || consentScopeDigest === undefined
    || candidate === undefined
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    result: {
      schema: ASSET_PROVIDER_RESULT_SCHEMA,
      invocationDigest,
      sessionId,
      contractDigest,
      operation,
      provider,
      targetId,
      consentScopeDigest,
      ...(inputDigests === undefined ? {} : { inputDigests }),
      ...(referenceDigests === undefined ? {} : { referenceDigests }),
      candidate,
    },
  };
}

function parseNextAction(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderNextAction | undefined {
  const actions: readonly AssetProviderNextAction[] = [
    'rematerialize-contract',
    'provide-external-candidate',
    'retry-within-scope',
    'resolve-precondition',
  ];
  if (typeof value !== 'string' || !actions.includes(value as AssetProviderNextAction)) {
    diagnostics.push(invalid(path, `${path} is not a supported safe next action.`));
    return undefined;
  }
  return value as AssetProviderNextAction;
}

export function parseAssetProviderRefusal(
  value: unknown,
): AssetProviderRefusalParseResult {
  const diagnostics: AssetProviderDiagnostic[] = [];
  const record = requiredRecord(value, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', [
    'schema',
    'invocationDigest',
    'sessionId',
    'contractDigest',
    'operation',
    'provider',
    'targetIds',
    'consentScopeDigest',
    'referenceDigests',
    'code',
    'nextAction',
  ], diagnostics);
  if (record.schema !== ASSET_PROVIDER_REFUSAL_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_provider_schema_unsupported',
      '$.schema',
      'Unsupported asset provider refusal schema.',
    ));
  }
  const invocationDigest = parseDigest(record.invocationDigest, '$.invocationDigest', diagnostics);
  const sessionId = parseIdentifier(record.sessionId, '$.sessionId', diagnostics);
  const contractDigest = parseDigest(record.contractDigest, '$.contractDigest', diagnostics);
  const operation = parseOperation(record.operation, '$.operation', diagnostics);
  const provider = parseProviderIdentity(record.provider, '$.provider', diagnostics);
  const targetIds = parseTargetIds(record.targetIds, '$.targetIds', diagnostics);
  const consentScopeDigest = parseDigest(
    record.consentScopeDigest,
    '$.consentScopeDigest',
    diagnostics,
  );
  const referenceDigests = parseDigestArray(
    record.referenceDigests,
    '$.referenceDigests',
    ASSET_PROVIDER_LIMITS.references,
    diagnostics,
    true,
  );
  const code = typeof record.code === 'string' && ASSET_PROVIDER_REFUSAL_CODES.includes(
    record.code as AssetProviderRefusalCode,
  )
    ? record.code as AssetProviderRefusalCode
    : undefined;
  if (code === undefined) diagnostics.push(invalid('$.code', '$.code is not a supported refusal code.'));
  const nextAction = parseNextAction(record.nextAction, '$.nextAction', diagnostics);
  if (
    diagnostics.length > 0
    || invocationDigest === undefined
    || sessionId === undefined
    || contractDigest === undefined
    || operation === undefined
    || provider === undefined
    || targetIds === undefined
    || consentScopeDigest === undefined
    || referenceDigests === undefined
    || code === undefined
    || nextAction === undefined
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    refusal: {
      schema: ASSET_PROVIDER_REFUSAL_SCHEMA,
      invocationDigest,
      sessionId,
      contractDigest,
      operation,
      provider,
      targetIds,
      consentScopeDigest,
      referenceDigests,
      code,
      nextAction,
    },
  };
}

function parseManifestGoal(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): string | undefined {
  const goal = parseIdentifier(value, path, diagnostics);
  if (goal !== undefined && goal !== 'new-item' && goal !== 'extend-item') {
    diagnostics.push(invalid(path, `${path} is not a supported authoring goal.`));
  }
  return goal;
}

function parseManifestProviderAdapters(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): readonly AgentIntegrationProviderAdapter[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  if (value.length > ASSET_PROVIDER_LIMITS.capabilities) {
    diagnostics.push(diagnostic(
      'asset_provider_limit_exceeded',
      path,
      `${path} exceeds ${ASSET_PROVIDER_LIMITS.capabilities} entries.`,
    ));
  }
  const adapters: AgentIntegrationProviderAdapter[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requiredRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, ['id', 'version'], diagnostics);
    const id = parseIdentifier(record.id, `${entryPath}.id`, diagnostics);
    const version = requiredString(record, 'version', `${entryPath}.version`, diagnostics);
    if (version !== undefined && !parseSemver(version)) {
      diagnostics.push(diagnostic(
        'asset_provider_semver_invalid',
        `${entryPath}.version`,
        `${entryPath}.version must be a semantic version.`,
      ));
    }
    if (id !== undefined && version !== undefined) adapters.push({ id, version });
  });
  if (new Set(adapters.map((adapter) => `${adapter.id}\u0000${adapter.version}`)).size !== adapters.length) {
    diagnostics.push(invalid(path, `${path} must not contain duplicate adapters.`));
  }
  return adapters.sort((left, right) => compareTuple(
    [left.id, left.version],
    [right.id, right.version],
  ));
}

export function parseAgentIntegrationManifest(
  value: unknown,
): AgentIntegrationManifestParseResult {
  const diagnostics: AssetProviderDiagnostic[] = [];
  const record = requiredRecord(value, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', [
    'schema',
    'id',
    'version',
    'cliRange',
    'requiredCapabilities',
    'optionalCapabilities',
    'supportedGoals',
    'providerAdapters',
  ], diagnostics);
  if (record.schema !== AGENT_INTEGRATION_MANIFEST_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_provider_schema_unsupported',
      '$.schema',
      'Unsupported Agent integration manifest schema.',
    ));
  }
  const id = parseIdentifier(record.id, '$.id', diagnostics);
  const version = requiredString(record, 'version', '$.version', diagnostics);
  if (version !== undefined && !parseSemver(version)) {
    diagnostics.push(diagnostic(
      'asset_provider_semver_invalid',
      '$.version',
      '$.version must be a semantic version.',
    ));
  }
  const cliRange = requiredString(record, 'cliRange', '$.cliRange', diagnostics);
  if (cliRange !== undefined && !parseSemverRange(cliRange)) {
    diagnostics.push(diagnostic(
      'asset_provider_semver_invalid',
      '$.cliRange',
      '$.cliRange must use the bounded comparator grammar.',
    ));
  }
  const requiredCapabilities = parseStringSet(
    record.requiredCapabilities,
    '$.requiredCapabilities',
    ASSET_PROVIDER_LIMITS.capabilities,
    diagnostics,
  );
  const optionalCapabilities = parseStringSet(
    record.optionalCapabilities,
    '$.optionalCapabilities',
    ASSET_PROVIDER_LIMITS.capabilities,
    diagnostics,
  );
  const supportedGoals = parseStringSet(
    record.supportedGoals,
    '$.supportedGoals',
    ASSET_PROVIDER_LIMITS.capabilities,
    diagnostics,
    parseManifestGoal,
  ) as readonly AgentIntegrationSupportedGoal[] | undefined;
  const providerAdapters = parseManifestProviderAdapters(
    record.providerAdapters,
    '$.providerAdapters',
    diagnostics,
  );
  if (requiredCapabilities !== undefined && optionalCapabilities !== undefined) {
    const overlap = requiredCapabilities.filter((capability) => optionalCapabilities.includes(capability));
    if (overlap.length > 0) {
      diagnostics.push(invalid(
        '$.optionalCapabilities',
        '$.requiredCapabilities and $.optionalCapabilities must not overlap.',
      ));
    }
  }
  if (
    diagnostics.length > 0
    || id === undefined
    || version === undefined
    || cliRange === undefined
    || requiredCapabilities === undefined
    || optionalCapabilities === undefined
    || supportedGoals === undefined
    || providerAdapters === undefined
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    manifest: {
      schema: AGENT_INTEGRATION_MANIFEST_SCHEMA,
      id,
      version,
      cliRange,
      requiredCapabilities,
      optionalCapabilities,
      supportedGoals,
      providerAdapters,
    },
  };
}

export function agentIntegrationManifestCompatibility(
  manifest: AgentIntegrationManifest,
  input: AgentIntegrationCompatibilityInput,
): AgentIntegrationCompatibility {
  const available = new Set(input.capabilities);
  const missingRequiredCapabilities = manifest.requiredCapabilities.filter(
    (capability) => !available.has(capability),
  );
  const missingOptionalCapabilities = manifest.optionalCapabilities.filter(
    (capability) => !available.has(capability),
  );
  const cliRangeCompatible = assetProviderCliRangeMatches(manifest.cliRange, input.cliVersion);
  const refusal = !cliRangeCompatible || missingRequiredCapabilities.length > 0
    ? {
      code: 'agent_integration_capability_unsupported' as const,
      message: !cliRangeCompatible
        ? 'The Agent integration does not support this CLI version.'
        : 'The CLI is missing a required Agent integration capability.',
    }
    : null;
  return {
    cliRangeCompatible,
    missingRequiredCapabilities,
    missingOptionalCapabilities,
    optionalFallback: missingOptionalCapabilities.length > 0,
    refusal,
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseDiscoveryStatus(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDiscoveryStatus | undefined {
  const statuses: readonly AssetProviderDiscoveryStatus[] = [
    'supported',
    'unsupported',
    'unavailable',
    'consent-required',
  ];
  if (typeof value !== 'string' || !statuses.includes(value as AssetProviderDiscoveryStatus)) {
    diagnostics.push(invalid(path, `${path} is not a supported discovery status.`));
    return undefined;
  }
  return value as AssetProviderDiscoveryStatus;
}

function parseDiscoveryRefusal(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDiscoveryRefusal | null | undefined {
  if (value === null) return null;
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['code', 'message'], diagnostics);
  const code = typeof record.code === 'string' && ASSET_PROVIDER_REFUSAL_CODES.includes(
    record.code as AssetProviderRefusalCode,
  )
    ? record.code as AssetProviderRefusalCode
    : undefined;
  if (code === undefined) diagnostics.push(invalid(`${path}.code`, `${path}.code is not a supported refusal code.`));
  const message = requiredString(record, 'message', `${path}.message`, diagnostics);
  if (
    message !== undefined
    && (identifierIsPrivate(message) || utf8ByteLength(message) > ASSET_PROVIDER_LIMITS.identifierBytes)
  ) {
    diagnostics.push(diagnostic(
      'asset_provider_private_data',
      `${path}.message`,
      `${path}.message must not contain private provider data.`,
    ));
  }
  if (code === undefined || message === undefined) return undefined;
  return { code, message };
}

function parseDiscoveryEntry(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDiscoveryEntry | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, [
    'descriptorDigest',
    'id',
    'adapter',
    'status',
    'missingCapabilities',
    'refusal',
  ], diagnostics);
  const descriptorDigest = parseDigest(record.descriptorDigest, `${path}.descriptorDigest`, diagnostics);
  const id = parseIdentifier(record.id, `${path}.id`, diagnostics);
  const adapterPath = `${path}.adapter`;
  const adapterRecord = requiredRecord(record.adapter, adapterPath, diagnostics);
  let adapterId: string | undefined;
  let adapterVersion: string | undefined;
  if (adapterRecord) {
    exactKeys(adapterRecord, adapterPath, ['id', 'version'], diagnostics);
    adapterId = parseIdentifier(adapterRecord.id, `${adapterPath}.id`, diagnostics);
    adapterVersion = requiredString(adapterRecord, 'version', `${adapterPath}.version`, diagnostics);
    if (adapterVersion !== undefined && !parseSemver(adapterVersion)) {
      diagnostics.push(diagnostic(
        'asset_provider_semver_invalid',
        `${adapterPath}.version`,
        `${adapterPath}.version must be a semantic version.`,
      ));
    }
  }
  const status = parseDiscoveryStatus(record.status, `${path}.status`, diagnostics);
  const missingCapabilities = parseStringSet(
    record.missingCapabilities,
    `${path}.missingCapabilities`,
    ASSET_PROVIDER_LIMITS.capabilities,
    diagnostics,
  );
  const refusal = parseDiscoveryRefusal(record.refusal, `${path}.refusal`, diagnostics);
  if (
    descriptorDigest === undefined
    || id === undefined
    || adapterId === undefined
    || adapterVersion === undefined
    || status === undefined
    || missingCapabilities === undefined
    || refusal === undefined
  ) return undefined;
  return {
    descriptorDigest,
    id,
    adapter: { id: adapterId, version: adapterVersion },
    status,
    missingCapabilities,
    refusal,
  };
}

export function parseAssetProviderDiscovery(
  value: unknown,
): AssetProviderDiscoveryParseResult {
  const diagnostics: AssetProviderDiagnostic[] = [];
  const record = requiredRecord(value, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', ['schema', 'sessionId', 'contractDigest', 'cliVersion', 'entries'], diagnostics);
  if (record.schema !== ASSET_PROVIDER_DISCOVERY_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_provider_schema_unsupported',
      '$.schema',
      'Unsupported asset provider discovery schema.',
    ));
  }
  const sessionId = parseIdentifier(record.sessionId, '$.sessionId', diagnostics);
  const contractDigest = parseDigest(record.contractDigest, '$.contractDigest', diagnostics);
  const cliVersion = requiredString(record, 'cliVersion', '$.cliVersion', diagnostics);
  if (cliVersion !== undefined && !parseSemver(cliVersion)) {
    diagnostics.push(diagnostic(
      'asset_provider_semver_invalid',
      '$.cliVersion',
      '$.cliVersion must be a semantic version.',
    ));
  }
  const entriesValue = record.entries;
  if (!Array.isArray(entriesValue)) {
    diagnostics.push(invalid('$.entries', '$.entries must be an array.'));
  } else if (entriesValue.length > ASSET_PROVIDER_LIMITS.discoveryDescriptors) {
    diagnostics.push(diagnostic(
      'asset_provider_limit_exceeded',
      '$.entries',
      `$.entries exceeds ${ASSET_PROVIDER_LIMITS.discoveryDescriptors} descriptors.`,
    ));
  }
  const entries: AssetProviderDiscoveryEntry[] = [];
  if (Array.isArray(entriesValue)) {
    entriesValue.forEach((entry, index) => {
      const parsed = parseDiscoveryEntry(entry, `$.entries[${index}]`, diagnostics);
      if (parsed !== undefined) entries.push(parsed);
    });
  }
  const identityKeys = entries.map((entry) => `${entry.id}\u0000${entry.adapter.id}\u0000${entry.adapter.version}`);
  if (new Set(identityKeys).size !== identityKeys.length) {
    diagnostics.push(invalid('$.entries', '$.entries must not contain duplicate provider adapters.'));
  }
  if (
    diagnostics.length > 0
    || sessionId === undefined
    || contractDigest === undefined
    || cliVersion === undefined
    || !Array.isArray(entriesValue)
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    discovery: assetProviderDiscoveryProjection({
      schema: ASSET_PROVIDER_DISCOVERY_SCHEMA,
      sessionId,
      contractDigest,
      cliVersion,
      entries,
    }),
  };
}

function parseSemver(value: string): AssetProviderSemver | undefined {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) return undefined;
  const prerelease = match[4] === undefined ? [] : match[4].split('.');
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

export function parseAssetProviderSemver(value: string): AssetProviderSemver | undefined {
  return parseSemver(value);
}

function parseSemverRange(value: string): AssetProviderSemverRange | undefined {
  if (value.trim() !== value || value.length === 0) return undefined;
  const comparators = value.split(/ +/u).map((part) => {
    const match = RANGE_COMPARATOR_PATTERN.exec(part);
    if (!match) return undefined;
    const operator = match[1];
    const versionText = match[2];
    if (operator === undefined || versionText === undefined) return undefined;
    const version = parseSemver(versionText);
    if (!version) return undefined;
    return {
      operator: operator as AssetProviderSemverComparatorOperator,
      version,
    };
  });
  return comparators.every((comparator): comparator is AssetProviderSemverComparator => comparator !== undefined)
    ? comparators
    : undefined;
}

export function parseAssetProviderCliRange(value: string): AssetProviderSemverRange | undefined {
  return parseSemverRange(value);
}

export function compareAssetProviderSemver(
  left: AssetProviderSemver,
  right: AssetProviderSemver,
): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return compareUtf8(leftPart, rightPart);
  }
  return 0;
}

function comparatorMatches(
  comparator: AssetProviderSemverComparator,
  version: AssetProviderSemver,
): boolean {
  const comparison = compareAssetProviderSemver(version, comparator.version);
  switch (comparator.operator) {
    case '>=':
      return comparison >= 0;
    case '>':
      return comparison > 0;
    case '<=':
      return comparison <= 0;
    case '<':
      return comparison < 0;
    case '=':
      return comparison === 0;
  }
}

export function assetProviderCliRangeMatches(
  range: string,
  version: string,
): boolean {
  const comparators = parseSemverRange(range);
  const parsedVersion = parseSemver(version);
  return comparators !== undefined
    && parsedVersion !== undefined
    && comparators.every((comparator) => comparatorMatches(comparator, parsedVersion));
}

function parseDescriptorAdapter(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDescriptorAdapter | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['id', 'version', 'cliRange'], diagnostics);
  const id = parseIdentifier(record.id, `${path}.id`, diagnostics);
  const version = requiredString(record, 'version', `${path}.version`, diagnostics);
  const cliRange = requiredString(record, 'cliRange', `${path}.cliRange`, diagnostics);
  if (version !== undefined && !parseSemver(version)) {
    diagnostics.push(diagnostic(
      'asset_provider_semver_invalid',
      `${path}.version`,
      `${path}.version must be a semantic version.`,
    ));
  }
  if (cliRange !== undefined && !parseSemverRange(cliRange)) {
    diagnostics.push(diagnostic(
      'asset_provider_semver_invalid',
      `${path}.cliRange`,
      `${path}.cliRange must use the bounded comparator grammar.`,
    ));
  }
  if (id === undefined || version === undefined || cliRange === undefined) return undefined;
  return { id, version, cliRange };
}

function parseDescriptorLimits(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDescriptorLimits | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['maxCandidateBytes', 'timeoutSeconds', 'maxReferences'], diagnostics);
  const maxCandidateBytes = parseBoundedInteger(
    record,
    'maxCandidateBytes',
    `${path}.maxCandidateBytes`,
    1,
    ASSET_PROVIDER_LIMITS.candidateBytes,
    diagnostics,
  );
  const timeoutSeconds = parseBoundedInteger(
    record,
    'timeoutSeconds',
    `${path}.timeoutSeconds`,
    ASSET_PROVIDER_LIMITS.timeoutSeconds.min,
    ASSET_PROVIDER_LIMITS.timeoutSeconds.max,
    diagnostics,
  );
  const maxReferences = parseBoundedInteger(
    record,
    'maxReferences',
    `${path}.maxReferences`,
    0,
    ASSET_PROVIDER_LIMITS.references,
    diagnostics,
  );
  if (maxCandidateBytes === undefined || timeoutSeconds === undefined || maxReferences === undefined) {
    return undefined;
  }
  return { maxCandidateBytes, timeoutSeconds, maxReferences };
}

function parseDescriptorNetwork(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDescriptor['network'] | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['required', 'declaredHosts'], diagnostics);
  const required = parseBoolean(record, 'required', `${path}.required`, diagnostics);
  const declaredHosts = parseStringSet(
    record.declaredHosts,
    `${path}.declaredHosts`,
    ASSET_PROVIDER_LIMITS.declaredHosts,
    diagnostics,
    parseHost,
  );
  if (required === undefined || declaredHosts === undefined) return undefined;
  return { required, declaredHosts };
}

function parseDescriptorCredentials(
  value: unknown,
  path: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDescriptor['credentials'] | undefined {
  const record = requiredRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['required', 'handledOutsideCli'], diagnostics);
  const required = parseBoolean(record, 'required', `${path}.required`, diagnostics);
  const handledOutsideCli = parseBoolean(
    record,
    'handledOutsideCli',
    `${path}.handledOutsideCli`,
    diagnostics,
  );
  if (required === undefined || handledOutsideCli === undefined) return undefined;
  if (required && !handledOutsideCli) {
    diagnostics.push(diagnostic(
      'asset_provider_private_data',
      `${path}.handledOutsideCli`,
      'Provider credentials must remain outside the CLI boundary.',
    ));
  }
  return { required, handledOutsideCli };
}

export function parseAssetProviderDescriptor(
  value: unknown,
): AssetProviderDescriptorParseResult {
  const diagnostics: AssetProviderDiagnostic[] = [];
  const record = requiredRecord(value, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', [
    'schema',
    'id',
    'adapter',
    'capabilities',
    'contractVersions',
    'limits',
    'network',
    'credentials',
  ], diagnostics);
  if (record.schema !== ASSET_PROVIDER_DESCRIPTOR_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_provider_schema_unsupported',
      '$.schema',
      'Unsupported asset provider descriptor schema.',
    ));
  }
  const id = parseIdentifier(record.id, '$.id', diagnostics);
  const adapter = parseDescriptorAdapter(record.adapter, '$.adapter', diagnostics);
  const capabilities = parseStringSet(
    record.capabilities,
    '$.capabilities',
    ASSET_PROVIDER_LIMITS.capabilities,
    diagnostics,
  );
  const contractVersions = parseStringSet(
    record.contractVersions,
    '$.contractVersions',
    ASSET_PROVIDER_LIMITS.contractVersions,
    diagnostics,
  );
  const limits = parseDescriptorLimits(record.limits, '$.limits', diagnostics);
  const network = parseDescriptorNetwork(record.network, '$.network', diagnostics);
  const credentials = parseDescriptorCredentials(record.credentials, '$.credentials', diagnostics);
  if (
    diagnostics.length > 0
    || id === undefined
    || adapter === undefined
    || capabilities === undefined
    || contractVersions === undefined
    || limits === undefined
    || network === undefined
    || credentials === undefined
  ) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    descriptor: {
      schema: ASSET_PROVIDER_DESCRIPTOR_SCHEMA,
      id,
      adapter,
      capabilities,
      contractVersions,
      limits,
      network,
      credentials,
    },
  };
}

export function parseAssetProviderDescriptorJson(
  value: string,
): AssetProviderDescriptorParseResult {
  if (utf8ByteLength(value) > ASSET_PROVIDER_LIMITS.descriptorBytes) {
    return {
      ok: false,
      diagnostics: [diagnostic(
        'asset_provider_limit_exceeded',
        '$',
        `Descriptor JSON exceeds ${ASSET_PROVIDER_LIMITS.descriptorBytes} UTF-8 bytes.`,
      )],
    };
  }
  try {
    return parseAssetProviderDescriptor(JSON.parse(value) as unknown);
  } catch {
    return {
      ok: false,
      diagnostics: [invalid('$', 'Descriptor JSON must be valid JSON.')],
    };
  }
}

export function assetProviderDescriptorProjection(
  descriptor: AssetProviderDescriptor,
): AssetProviderDescriptor {
  return {
    schema: ASSET_PROVIDER_DESCRIPTOR_SCHEMA,
    id: descriptor.id,
    adapter: {
      id: descriptor.adapter.id,
      version: descriptor.adapter.version,
      cliRange: descriptor.adapter.cliRange,
    },
    capabilities: [...descriptor.capabilities].sort(compareUtf8),
    contractVersions: [...descriptor.contractVersions].sort(compareUtf8),
    limits: {
      maxCandidateBytes: descriptor.limits.maxCandidateBytes,
      timeoutSeconds: descriptor.limits.timeoutSeconds,
      maxReferences: descriptor.limits.maxReferences,
    },
    network: {
      required: descriptor.network.required,
      declaredHosts: [...descriptor.network.declaredHosts].sort(compareUtf8),
    },
    credentials: {
      required: descriptor.credentials.required,
      handledOutsideCli: descriptor.credentials.handledOutsideCli,
    },
  };
}

export function assetProviderDescriptorDigestInput(
  descriptor: AssetProviderDescriptor,
): string {
  return JSON.stringify(assetProviderDescriptorProjection(descriptor));
}

function discoveryEntrySort(
  left: AssetProviderDiscoveryEntry,
  right: AssetProviderDiscoveryEntry,
): number {
  return compareTuple(
    [left.id, left.adapter.id, left.adapter.version],
    [right.id, right.adapter.id, right.adapter.version],
  );
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const comparison = compareUtf8(left[index] ?? '', right[index] ?? '');
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function assetProviderDiscoveryEntry(
  input: AssetProviderDiscoveryEntryInput,
): AssetProviderDiscoveryEntry {
  if (input.availability === 'unavailable') {
    return {
      descriptorDigest: input.descriptorDigest,
      id: input.descriptor.id,
      adapter: {
        id: input.descriptor.adapter.id,
        version: input.descriptor.adapter.version,
      },
      status: 'unavailable',
      missingCapabilities: [],
      refusal: {
        code: 'asset_provider_unavailable',
        message: 'The configured provider is unavailable.',
      },
    };
  }

  const missingCapabilities = [ASSET_PROVIDER_OPERATION].filter(
    (capability) => !input.descriptor.capabilities.includes(capability),
  );
  const missingContractVersion = !input.descriptor.contractVersions.includes(
    ASSET_PROVIDER_CONTRACT_VERSION,
  );
  if (missingCapabilities.length > 0) {
    return {
      descriptorDigest: input.descriptorDigest,
      id: input.descriptor.id,
      adapter: {
        id: input.descriptor.adapter.id,
        version: input.descriptor.adapter.version,
      },
      status: 'unsupported',
      missingCapabilities,
      refusal: {
        code: 'asset_provider_capability_unsupported',
        message: 'The provider does not declare sprite-candidate.v1.',
      },
    };
  }
  if (!assetProviderCliRangeMatches(input.descriptor.adapter.cliRange, input.cliVersion)) {
    return {
      descriptorDigest: input.descriptorDigest,
      id: input.descriptor.id,
      adapter: {
        id: input.descriptor.adapter.id,
        version: input.descriptor.adapter.version,
      },
      status: 'unsupported',
      missingCapabilities: [],
      refusal: {
        code: 'asset_provider_contract_mismatch',
        message: 'The provider adapter does not support this CLI version.',
      },
    };
  }
  if (missingContractVersion) {
    return {
      descriptorDigest: input.descriptorDigest,
      id: input.descriptor.id,
      adapter: {
        id: input.descriptor.adapter.id,
        version: input.descriptor.adapter.version,
      },
      status: 'unsupported',
      missingCapabilities: [],
      refusal: {
        code: 'asset_provider_contract_mismatch',
        message: 'The provider does not support the sprite drawing contract.',
      },
    };
  }
  if (input.descriptor.network.required) {
    return {
      descriptorDigest: input.descriptorDigest,
      id: input.descriptor.id,
      adapter: {
        id: input.descriptor.adapter.id,
        version: input.descriptor.adapter.version,
      },
      status: 'consent-required',
      missingCapabilities: [],
      refusal: {
        code: 'asset_provider_consent_required',
        message: 'The provider declares network access and requires consent.',
      },
    };
  }
  return {
    descriptorDigest: input.descriptorDigest,
    id: input.descriptor.id,
    adapter: {
      id: input.descriptor.adapter.id,
      version: input.descriptor.adapter.version,
    },
    status: 'supported',
    missingCapabilities: [],
    refusal: null,
  };
}

export function assetProviderDiscoveryProjection(
  discovery: AssetProviderDiscovery,
): AssetProviderDiscovery {
  return {
    schema: ASSET_PROVIDER_DISCOVERY_SCHEMA,
    sessionId: discovery.sessionId,
    contractDigest: discovery.contractDigest,
    cliVersion: discovery.cliVersion,
    entries: [...discovery.entries]
      .map((entry) => ({
        descriptorDigest: entry.descriptorDigest,
        id: entry.id,
        adapter: {
          id: entry.adapter.id,
          version: entry.adapter.version,
        },
        status: entry.status,
        missingCapabilities: [...entry.missingCapabilities].sort(compareUtf8),
        refusal: entry.refusal === null
          ? null
          : {
            code: entry.refusal.code,
            message: entry.refusal.message,
          },
      }))
      .sort(discoveryEntrySort),
  };
}

export function assetProviderDiscoveryDigestInput(
  discovery: AssetProviderDiscovery,
): string {
  return JSON.stringify(assetProviderDiscoveryProjection(discovery));
}

function providerProjection(provider: AssetProviderIdentity): AssetProviderIdentity {
  return {
    id: provider.id,
    adapter: {
      id: provider.adapter.id,
      version: provider.adapter.version,
    },
  };
}

export function assetProviderInvocationProjection(
  invocation: AssetProviderInvocation,
): AssetProviderInvocation {
  return {
    schema: ASSET_PROVIDER_INVOCATION_SCHEMA,
    sessionId: invocation.sessionId,
    contractDigest: invocation.contractDigest,
    operation: ASSET_PROVIDER_OPERATION,
    provider: providerProjection(invocation.provider),
    targetIds: [...invocation.targetIds].sort(compareUtf8),
    ...(invocation.inputDigests === undefined
      ? {}
      : { inputDigests: [...invocation.inputDigests].sort(compareUtf8) }),
    consent: {
      confirmed: invocation.consent.confirmed,
      scopeDigest: invocation.consent.scopeDigest,
      network: {
        enabled: invocation.consent.network.enabled,
        hosts: [...invocation.consent.network.hosts].sort(compareUtf8),
      },
      referenceDigests: [...invocation.consent.referenceDigests].sort(compareUtf8),
    },
    limits: {
      maxCandidateBytes: invocation.limits.maxCandidateBytes,
      timeoutSeconds: invocation.limits.timeoutSeconds,
      maxReferences: invocation.limits.maxReferences,
    },
    candidate: {
      stagingId: invocation.candidate.stagingId,
      targetIds: [...invocation.candidate.targetIds].sort(compareUtf8),
    },
  };
}

export function assetProviderInvocationDigestInput(
  invocation: AssetProviderInvocation,
): string {
  return JSON.stringify(assetProviderInvocationProjection(invocation));
}

export function assetProviderResultProjection(
  result: AssetProviderResult,
): AssetProviderResult {
  return {
    schema: ASSET_PROVIDER_RESULT_SCHEMA,
    invocationDigest: result.invocationDigest,
    sessionId: result.sessionId,
    contractDigest: result.contractDigest,
    operation: ASSET_PROVIDER_OPERATION,
    provider: providerProjection(result.provider),
    targetId: result.targetId,
    consentScopeDigest: result.consentScopeDigest,
    ...(result.inputDigests === undefined
      ? {}
      : { inputDigests: [...result.inputDigests].sort(compareUtf8) }),
    ...(result.referenceDigests === undefined
      ? {}
      : { referenceDigests: [...result.referenceDigests].sort(compareUtf8) }),
    candidate: {
      id: result.candidate.id,
      digest: result.candidate.digest,
      byteLength: result.candidate.byteLength,
    },
  };
}

export function assetProviderResultDigestInput(
  result: AssetProviderResult,
): string {
  return JSON.stringify(assetProviderResultProjection(result));
}

export function assetProviderRefusalProjection(
  refusal: AssetProviderRefusal,
): AssetProviderRefusal {
  return {
    schema: ASSET_PROVIDER_REFUSAL_SCHEMA,
    invocationDigest: refusal.invocationDigest,
    sessionId: refusal.sessionId,
    contractDigest: refusal.contractDigest,
    operation: ASSET_PROVIDER_OPERATION,
    provider: providerProjection(refusal.provider),
    targetIds: [...refusal.targetIds].sort(compareUtf8),
    consentScopeDigest: refusal.consentScopeDigest,
    referenceDigests: [...refusal.referenceDigests].sort(compareUtf8),
    code: refusal.code,
    nextAction: refusal.nextAction,
  };
}

export function assetProviderRefusalDigestInput(
  refusal: AssetProviderRefusal,
): string {
  return JSON.stringify(assetProviderRefusalProjection(refusal));
}

export function agentIntegrationManifestProjection(
  manifest: AgentIntegrationManifest,
): AgentIntegrationManifest {
  return {
    schema: AGENT_INTEGRATION_MANIFEST_SCHEMA,
    id: manifest.id,
    version: manifest.version,
    cliRange: manifest.cliRange,
    requiredCapabilities: [...manifest.requiredCapabilities].sort(compareUtf8),
    optionalCapabilities: [...manifest.optionalCapabilities].sort(compareUtf8),
    supportedGoals: [...manifest.supportedGoals].sort(compareUtf8),
    providerAdapters: [...manifest.providerAdapters]
      .map((adapter) => ({ id: adapter.id, version: adapter.version }))
      .sort((left, right) => compareTuple(
        [left.id, left.version],
        [right.id, right.version],
      )),
  };
}

export function agentIntegrationManifestDigestInput(
  manifest: AgentIntegrationManifest,
): string {
  return JSON.stringify(agentIntegrationManifestProjection(manifest));
}

function bindingMismatch(path: string, message: string): AssetProviderDiagnostic {
  return diagnostic('asset_provider_binding_mismatch', path, message);
}

function sameProvider(left: AssetProviderIdentity, right: AssetProviderIdentity): boolean {
  return left.id === right.id
    && left.adapter.id === right.adapter.id
    && left.adapter.version === right.adapter.version;
}

export function assetProviderResultBindingDiagnostics(
  invocation: AssetProviderInvocation,
  result: AssetProviderResult,
): readonly AssetProviderDiagnostic[] {
  const diagnostics: AssetProviderDiagnostic[] = [];
  if (result.sessionId !== invocation.sessionId) {
    diagnostics.push(bindingMismatch('$.sessionId', '$.sessionId does not match the invocation.'));
  }
  if (result.contractDigest !== invocation.contractDigest) {
    diagnostics.push(bindingMismatch('$.contractDigest', '$.contractDigest does not match the invocation.'));
  }
  if (result.operation !== invocation.operation) {
    diagnostics.push(bindingMismatch('$.operation', '$.operation does not match the invocation.'));
  }
  if (!sameProvider(result.provider, invocation.provider)) {
    diagnostics.push(bindingMismatch('$.provider', '$.provider does not match the invocation.'));
  }
  if (!invocation.targetIds.includes(result.targetId)) {
    diagnostics.push(bindingMismatch('$.targetId', '$.targetId is not in the invocation target scope.'));
  }
  if (result.consentScopeDigest !== invocation.consent.scopeDigest) {
    diagnostics.push(bindingMismatch(
      '$.consentScopeDigest',
      '$.consentScopeDigest does not match the invocation consent scope.',
    ));
  }
  if (!sameStrings(result.referenceDigests ?? [], invocation.consent.referenceDigests)) {
    diagnostics.push(bindingMismatch(
      '$.referenceDigests',
      '$.referenceDigests does not match the invocation consent scope.',
    ));
  }
  if (!sameStrings(result.inputDigests ?? [], invocation.inputDigests ?? [])) {
    diagnostics.push(bindingMismatch(
      '$.inputDigests',
      '$.inputDigests does not match the invocation inputs.',
    ));
  }
  if (result.candidate.id !== invocation.candidate.stagingId) {
    diagnostics.push(bindingMismatch(
      '$.candidate.id',
      '$.candidate.id does not match the invocation staging id.',
    ));
  }
  return diagnostics;
}

export function assetProviderRefusalBindingDiagnostics(
  invocation: AssetProviderInvocation,
  refusal: AssetProviderRefusal,
): readonly AssetProviderDiagnostic[] {
  const diagnostics: AssetProviderDiagnostic[] = [];
  if (refusal.sessionId !== invocation.sessionId) {
    diagnostics.push(bindingMismatch('$.sessionId', '$.sessionId does not match the invocation.'));
  }
  if (refusal.contractDigest !== invocation.contractDigest) {
    diagnostics.push(bindingMismatch('$.contractDigest', '$.contractDigest does not match the invocation.'));
  }
  if (refusal.operation !== invocation.operation) {
    diagnostics.push(bindingMismatch('$.operation', '$.operation does not match the invocation.'));
  }
  if (!sameProvider(refusal.provider, invocation.provider)) {
    diagnostics.push(bindingMismatch('$.provider', '$.provider does not match the invocation.'));
  }
  if (!sameStrings(refusal.targetIds, invocation.targetIds)) {
    diagnostics.push(bindingMismatch('$.targetIds', '$.targetIds does not match the invocation.'));
  }
  if (refusal.consentScopeDigest !== invocation.consent.scopeDigest) {
    diagnostics.push(bindingMismatch(
      '$.consentScopeDigest',
      '$.consentScopeDigest does not match the invocation consent scope.',
    ));
  }
  if (!sameStrings(refusal.referenceDigests, invocation.consent.referenceDigests)) {
    diagnostics.push(bindingMismatch(
      '$.referenceDigests',
      '$.referenceDigests does not match the invocation consent scope.',
    ));
  }
  return diagnostics;
}
