import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ASSET_PROVIDER_CONTRACT_VERSION,
  ASSET_PROVIDER_LIMITS,
  ASSET_PROVIDER_OPERATION,
  assetProviderCliRangeMatches,
  assetProviderDescriptorDigestInput,
  assetProviderDiscoveryEntry,
  assetProviderDiscoveryProjection,
  assetProviderInvocationDigestInput,
  parseAssetProviderDescriptor,
  parseAssetProviderDiscovery,
  type AssetProviderDescriptor,
  type AssetProviderDiagnostic,
  type AssetProviderInvocation,
  type AssetProviderRefusal,
  type SpriteDrawingContract,
} from '@lpc-toolkit/core';
import {
  AssetAuthoringImportError,
  readAssetAuthoringContractEvidence,
} from './asset-authoring-import.js';
import {
  assetAuthoringSessionPath,
  AssetAuthoringSessionError,
  createAssetAuthoringSessionStore,
  type AssetAuthoringSession,
} from './asset-authoring-session.js';
import { flagBoolean, flagString, flagStrings, type ParsedArgs } from './args.js';
import { CLI_VERSION } from './package-info.js';
import {
  commandError,
  commandOk,
  type AuthoringActionSafety,
  type AuthoringNextAction,
  type CliResponse,
} from './response.js';
import type { AssetWorkspace } from './asset-workspace.js';

export const ASSET_PROVIDER_PREFLIGHT_SCHEMA =
  'lpc-toolkit.asset-provider-preflight.v1' as const;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DISCOVERY_INPUT_MAX_BYTES =
  ASSET_PROVIDER_LIMITS.descriptorBytes * ASSET_PROVIDER_LIMITS.discoveryDescriptors;
const PROVIDER_COMMAND = 'asset authoring provider' as const;

type JsonRecord = Readonly<Record<string, unknown>>;
type ProviderPreflightStatus = 'supported' | 'unsupported' | 'consent-required';
type AssetProviderRefusalCode = AssetProviderRefusal['code'];
type ProviderHandoffStatus = 'created' | 'reused' | 'consent-required' | 'unsupported';

const ASSET_PROVIDER_HANDOFF_SCHEMA =
  'lpc-toolkit.asset-provider-handoff.v1' as const;

interface ProviderConsent {
  readonly targetIds: readonly string[];
  readonly contractDigest: string;
  readonly referenceDigests: readonly string[];
  readonly network: {
    readonly enabled: boolean;
    readonly hosts: readonly string[];
  };
  readonly limits: AssetProviderDescriptor['limits'];
  readonly confirmed: boolean;
}

export interface AssetProviderHandoffData {
  readonly schema: typeof ASSET_PROVIDER_HANDOFF_SCHEMA;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly provider: AssetProviderPreflightData['provider'];
  readonly status: ProviderHandoffStatus;
  readonly invocation: AssetProviderInvocation | null;
  readonly invocationDigest: string | null;
  readonly refusal: {
    readonly code: AssetProviderRefusalCode;
    readonly message: string;
  } | null;
  readonly safety: AuthoringActionSafety;
  readonly nextActions: readonly AuthoringNextAction[];
}

export interface AssetProviderPreflightData {
  readonly schema: typeof ASSET_PROVIDER_PREFLIGHT_SCHEMA;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly descriptorDigest: string;
  readonly provider: {
    readonly id: string;
    readonly adapter: {
      readonly id: string;
      readonly version: string;
    };
  };
  readonly status: ProviderPreflightStatus;
  readonly targetIds: readonly string[];
  readonly referenceDigests: readonly string[];
  readonly checks: {
    readonly cliRange: boolean;
    readonly capability: boolean;
    readonly contractVersion: boolean;
    readonly candidateBytes: boolean;
    readonly references: boolean;
    readonly targetScope: boolean;
    readonly referenceScope: boolean;
    readonly credentials: boolean;
    readonly protectedRoot: boolean;
    readonly network: boolean;
  };
  readonly limits: AssetProviderDescriptor['limits'];
  readonly network: AssetProviderDescriptor['network'];
  readonly refusal: {
    readonly code: AssetProviderRefusalCode;
    readonly message: string;
  } | null;
}

interface DiscoveryInput {
  readonly availability: 'available' | 'unavailable';
  readonly descriptor: AssetProviderDescriptor;
}

interface ParsedProviderFile<T> {
  readonly ok: true;
  readonly value: T;
}

interface FailedProviderFile {
  readonly ok: false;
  readonly response: CliResponse<null>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function isDigest(value: string | undefined): value is `sha256:${string}` {
  return value !== undefined && DIGEST_PATTERN.test(value);
}

function issueResponse(
  command: string,
  code: string,
  message: string,
  issuePath?: string,
): CliResponse<null> {
  return commandError(command, {
    code,
    message,
    ...(issuePath === undefined ? {} : { path: issuePath }),
  });
}

function diagnosticResponse(
  command: string,
  diagnostics: readonly AssetProviderDiagnostic[],
): CliResponse<null> {
  return {
    ok: false,
    command,
    data: null,
    warnings: [],
    errors: diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path,
    })),
  };
}

function readJsonFile(
  cwd: string,
  fileArgument: string,
  flag: string,
  maximumBytes: number,
): ParsedProviderFile<unknown> | FailedProviderFile {
  const filePath = path.resolve(cwd, fileArgument);
  let source: string;
  try {
    const stats = lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      return {
        ok: false,
        response: issueResponse(
          PROVIDER_COMMAND,
          'asset_provider_input_symlink',
          `The provider input supplied with ${flag} must be a regular file.`,
          flag,
        ),
      };
    }
    if (!stats.isFile()) {
      return {
        ok: false,
        response: issueResponse(
          PROVIDER_COMMAND,
          'asset_provider_input_not_regular',
          `The provider input supplied with ${flag} must be a regular file.`,
          flag,
        ),
      };
    }
    source = readFileSync(filePath, 'utf8');
  } catch {
    return {
      ok: false,
      response: issueResponse(
        PROVIDER_COMMAND,
        'asset_provider_input_read_failed',
        `Unable to read the provider input supplied with ${flag}.`,
        flag,
      ),
    };
  }
  if (Buffer.byteLength(source, 'utf8') > maximumBytes) {
    return {
      ok: false,
      response: issueResponse(
        PROVIDER_COMMAND,
        'asset_provider_limit_exceeded',
        `The provider input supplied with ${flag} exceeds its bounded size.`,
        flag,
      ),
    };
  }
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return {
      ok: false,
      response: issueResponse(
        PROVIDER_COMMAND,
        'asset_provider_schema_invalid',
        `The provider input supplied with ${flag} is not valid JSON.`,
        flag,
      ),
    };
  }
}

function prefixedDiagnostic(
  diagnostic: AssetProviderDiagnostic,
  prefix: string,
): AssetProviderDiagnostic {
  const suffix = diagnostic.path === '$' ? '' : diagnostic.path.slice(1);
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    path: `${prefix}${suffix}`,
  };
}

function parseDescriptorValue(
  value: unknown,
  inputPath: string,
): { readonly descriptor?: AssetProviderDescriptor; readonly diagnostics: readonly AssetProviderDiagnostic[] } {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    return {
      diagnostics: [{
        code: 'asset_provider_schema_invalid',
        message: `${inputPath} must be a JSON object.`,
        path: inputPath,
      }],
    };
  }
  if (Buffer.byteLength(encoded, 'utf8') > ASSET_PROVIDER_LIMITS.descriptorBytes) {
    return {
      diagnostics: [{
        code: 'asset_provider_limit_exceeded',
        message: `${inputPath} exceeds the descriptor byte limit.`,
        path: inputPath,
      }],
    };
  }
  const parsed = parseAssetProviderDescriptor(value);
  if (parsed.ok) return { descriptor: parsed.descriptor, diagnostics: [] };
  return {
    diagnostics: parsed.diagnostics.map((diagnostic) => prefixedDiagnostic(diagnostic, inputPath)),
  };
}

const PROVIDER_HOST_PATTERN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/u;

function consentInvalid(
  pathValue: string,
  message: string,
  code: AssetProviderDiagnostic['code'] = 'asset_provider_schema_invalid',
): AssetProviderDiagnostic {
  return { code, message, path: pathValue };
}

function exactConsentKeys(
  record: JsonRecord,
  keys: readonly string[],
  pathValue: string,
  diagnostics: AssetProviderDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      diagnostics.push(consentInvalid(
        pathValue,
        `${pathValue} contains unknown fields: ${key}.`,
      ));
    }
  }
}

function consentStringSet(
  value: unknown,
  pathValue: string,
  limit: number,
  predicate: (value: string) => boolean,
  diagnostics: AssetProviderDiagnostic[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(consentInvalid(pathValue, `${pathValue} must be an array.`));
    return undefined;
  }
  if (value.length > limit) {
    diagnostics.push(consentInvalid(
      pathValue,
      `${pathValue} exceeds ${String(limit)} entries.`,
      'asset_provider_limit_exceeded',
    ));
  }
  const entries: string[] = [];
  value.forEach((entry, index) => {
    const entryPath = `${pathValue}[${String(index)}]`;
    if (typeof entry !== 'string' || entry.length === 0 || entry.trim() !== entry) {
      diagnostics.push(consentInvalid(entryPath, `${entryPath} must be a non-empty trimmed string.`));
      return;
    }
    if (!predicate(entry)) {
      diagnostics.push(consentInvalid(entryPath, `${entryPath} is outside the bounded consent grammar.`));
      return;
    }
    entries.push(entry);
  });
  if (new Set(entries).size !== entries.length) {
    diagnostics.push(consentInvalid(pathValue, `${pathValue} must not contain duplicate values.`));
  }
  return entries.sort((left, right) => left.localeCompare(right));
}

function isLogicalTargetId(value: string): boolean {
  return Buffer.byteLength(value, 'utf8') <= ASSET_PROVIDER_LIMITS.identifierBytes
    && !value.startsWith('/')
    && !value.startsWith('~')
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.includes('\\')
    && !value.includes('://')
    && !value.includes('\u0000')
    && ![...value].some((character) => (character.codePointAt(0) ?? 0) < 0x20)
    && !value.split('/').some((segment) => segment === '..');
}

function parseConsentLimits(
  value: unknown,
  pathValue: string,
  diagnostics: AssetProviderDiagnostic[],
): AssetProviderDescriptor['limits'] | undefined {
  if (!isRecord(value)) {
    diagnostics.push(consentInvalid(pathValue, `${pathValue} must be an object.`));
    return undefined;
  }
  exactConsentKeys(value, ['maxCandidateBytes', 'timeoutSeconds', 'maxReferences'], pathValue, diagnostics);
  const maxCandidateBytes = value.maxCandidateBytes;
  const timeoutSeconds = value.timeoutSeconds;
  const maxReferences = value.maxReferences;
  if (
    typeof maxCandidateBytes !== 'number'
    || !Number.isSafeInteger(maxCandidateBytes)
    || maxCandidateBytes < 1
    || maxCandidateBytes > ASSET_PROVIDER_LIMITS.candidateBytes
  ) {
    diagnostics.push(consentInvalid(
      `${pathValue}.maxCandidateBytes`,
      `${pathValue}.maxCandidateBytes must be an integer within the candidate byte limit.`,
    ));
  }
  if (
    typeof timeoutSeconds !== 'number'
    || !Number.isSafeInteger(timeoutSeconds)
    || timeoutSeconds < ASSET_PROVIDER_LIMITS.timeoutSeconds.min
    || timeoutSeconds > ASSET_PROVIDER_LIMITS.timeoutSeconds.max
  ) {
    diagnostics.push(consentInvalid(
      `${pathValue}.timeoutSeconds`,
      `${pathValue}.timeoutSeconds must be an integer within the timeout limit.`,
    ));
  }
  if (
    typeof maxReferences !== 'number'
    || !Number.isSafeInteger(maxReferences)
    || maxReferences < 0
    || maxReferences > ASSET_PROVIDER_LIMITS.references
  ) {
    diagnostics.push(consentInvalid(
      `${pathValue}.maxReferences`,
      `${pathValue}.maxReferences must be an integer within the reference limit.`,
    ));
  }
  if (
    typeof maxCandidateBytes !== 'number'
    || !Number.isSafeInteger(maxCandidateBytes)
    || typeof timeoutSeconds !== 'number'
    || !Number.isSafeInteger(timeoutSeconds)
    || typeof maxReferences !== 'number'
    || !Number.isSafeInteger(maxReferences)
  ) return undefined;
  return { maxCandidateBytes, timeoutSeconds, maxReferences };
}

function parseConsentValue(
  value: unknown,
): { readonly ok: true; readonly consent: ProviderConsent }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] } {
  const diagnostics: AssetProviderDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [consentInvalid('$', 'Provider consent must be a JSON object.')],
    };
  }
  exactConsentKeys(
    value,
    ['targetIds', 'contractDigest', 'referenceDigests', 'network', 'limits', 'confirmed'],
    '$',
    diagnostics,
  );
  const targetIds = consentStringSet(
    value.targetIds,
    '$.targetIds',
    ASSET_PROVIDER_LIMITS.targetIds,
    isLogicalTargetId,
    diagnostics,
  );
  if (targetIds !== undefined && targetIds.length === 0) {
    diagnostics.push(consentInvalid('$.targetIds', '$.targetIds must contain at least one target id.'));
  }
  const contractDigestValue = value.contractDigest;
  const contractDigest = typeof contractDigestValue === 'string' && isDigest(contractDigestValue)
    ? contractDigestValue
    : undefined;
  if (contractDigest === undefined) {
    diagnostics.push(consentInvalid('$.contractDigest', '$.contractDigest must be a sha256 digest.'));
  }
  const referenceDigests = consentStringSet(
    value.referenceDigests,
    '$.referenceDigests',
    ASSET_PROVIDER_LIMITS.references,
    (entry) => isDigest(entry),
    diagnostics,
  );
  const networkValue = value.network;
  let network: ProviderConsent['network'] | undefined;
  if (!isRecord(networkValue)) {
    diagnostics.push(consentInvalid('$.network', '$.network must be an object.'));
  } else {
    exactConsentKeys(networkValue, ['enabled', 'hosts'], '$.network', diagnostics);
    const enabled = networkValue.enabled;
    if (typeof enabled !== 'boolean') {
      diagnostics.push(consentInvalid('$.network.enabled', '$.network.enabled must be a boolean.'));
    }
    const hosts = consentStringSet(
      networkValue.hosts,
      '$.network.hosts',
      ASSET_PROVIDER_LIMITS.declaredHosts,
      (entry) => PROVIDER_HOST_PATTERN.test(entry),
      diagnostics,
    );
    if (typeof enabled === 'boolean' && hosts !== undefined) network = { enabled, hosts };
  }
  const limits = parseConsentLimits(value.limits, '$.limits', diagnostics);
  const confirmed = value.confirmed;
  if (typeof confirmed !== 'boolean') {
    diagnostics.push(consentInvalid('$.confirmed', '$.confirmed must be a boolean.'));
  }
  if (
    diagnostics.length > 0
    || targetIds === undefined
    || contractDigest === undefined
    || referenceDigests === undefined
    || network === undefined
    || limits === undefined
    || typeof confirmed !== 'boolean'
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    consent: {
      targetIds,
      contractDigest,
      referenceDigests,
      network,
      limits,
      confirmed,
    },
  };
}

function parseDiscoveryInputs(value: unknown):
  | { readonly ok: true; readonly inputs: readonly DiscoveryInput[] }
  | { readonly ok: false; readonly diagnostics: readonly AssetProviderDiagnostic[] } {
  const diagnostics: AssetProviderDiagnostic[] = [];
  if (!Array.isArray(value)) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_provider_schema_invalid',
        message: 'Provider discovery input must be a JSON array.',
        path: '$',
      }],
    };
  }
  if (value.length > ASSET_PROVIDER_LIMITS.discoveryDescriptors) {
    diagnostics.push({
      code: 'asset_provider_limit_exceeded',
      message: `Provider discovery input exceeds ${ASSET_PROVIDER_LIMITS.discoveryDescriptors} descriptors.`,
      path: '$',
    });
  }

  const inputs: DiscoveryInput[] = [];
  for (const [index, entryValue] of value.entries()) {
    const entryPath = `$.entries[${String(index)}]`;
    if (!isRecord(entryValue)) {
      diagnostics.push({
        code: 'asset_provider_schema_invalid',
        message: `${entryPath} must be an object.`,
        path: entryPath,
      });
      continue;
    }
    const keys = Object.keys(entryValue);
    if (keys.some((key) => key !== 'availability' && key !== 'descriptor')) {
      diagnostics.push({
        code: 'asset_provider_schema_invalid',
        message: `${entryPath} contains unknown fields.`,
        path: entryPath,
      });
    }
    const availability = entryValue.availability;
    if (availability !== 'available' && availability !== 'unavailable') {
      diagnostics.push({
        code: 'asset_provider_schema_invalid',
        message: `${entryPath}.availability must be available or unavailable.`,
        path: `${entryPath}.availability`,
      });
    }
    const parsedDescriptor = parseDescriptorValue(
      entryValue.descriptor,
      `${entryPath}.descriptor`,
    );
    diagnostics.push(...parsedDescriptor.diagnostics);
    if (
      (availability === 'available' || availability === 'unavailable')
      && parsedDescriptor.descriptor !== undefined
    ) {
      inputs.push({ availability, descriptor: parsedDescriptor.descriptor });
    }
  }

  const identities = inputs.map((input) => [
    input.descriptor.id,
    input.descriptor.adapter.id,
    input.descriptor.adapter.version,
  ].join('\u0000'));
  if (new Set(identities).size !== identities.length) {
    diagnostics.push({
      code: 'asset_provider_schema_invalid',
      message: 'Provider discovery input must not contain duplicate provider adapters.',
      path: '$.entries',
    });
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, inputs };
}

function descriptorFromFile(
  cwd: string,
  fileArgument: string | undefined,
  flag: string,
): { readonly ok: true; readonly descriptor: AssetProviderDescriptor } | FailedProviderFile {
  if (fileArgument === undefined) {
    return {
      ok: false,
      response: issueResponse(PROVIDER_COMMAND, 'missing_argument', `${flag} is required.`, flag),
    };
  }
  const source = readJsonFile(cwd, fileArgument, flag, ASSET_PROVIDER_LIMITS.descriptorBytes);
  if (!source.ok) return source;
  const parsed = parseDescriptorValue(source.value, '$');
  return parsed.descriptor === undefined
    ? {
      ok: false,
      response: diagnosticResponse(PROVIDER_COMMAND, parsed.diagnostics),
    }
    : { ok: true, descriptor: parsed.descriptor };
}

function providerIdentity(descriptor: AssetProviderDescriptor): AssetProviderPreflightData['provider'] {
  return {
    id: descriptor.id,
    adapter: {
      id: descriptor.adapter.id,
      version: descriptor.adapter.version,
    },
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function networkScopeMatches(
  descriptor: AssetProviderDescriptor,
  consent: ProviderConsent | undefined,
): boolean {
  const requiresNetwork = descriptor.network.required || descriptor.network.declaredHosts.length > 0;
  if (!requiresNetwork) {
    return consent === undefined
      || (!consent.network.enabled && consent.network.hosts.length === 0);
  }
  return consent !== undefined
    && consent.network.enabled
    && sameStrings(consent.network.hosts, descriptor.network.declaredHosts);
}

function limitsWithinDescriptor(
  limits: AssetProviderDescriptor['limits'],
  descriptorLimits: AssetProviderDescriptor['limits'],
): boolean {
  return limits.maxCandidateBytes <= descriptorLimits.maxCandidateBytes
    && limits.timeoutSeconds <= descriptorLimits.timeoutSeconds
    && limits.maxReferences <= descriptorLimits.maxReferences;
}

function consentScopeDigest(consent: ProviderConsent): string {
  return sha256(JSON.stringify({
    contractDigest: consent.contractDigest,
    targetIds: [...consent.targetIds].sort(),
    referenceDigests: [...consent.referenceDigests].sort(),
    network: {
      enabled: consent.network.enabled,
      hosts: [...consent.network.hosts].sort(),
    },
    limits: {
      maxCandidateBytes: consent.limits.maxCandidateBytes,
      timeoutSeconds: consent.limits.timeoutSeconds,
      maxReferences: consent.limits.maxReferences,
    },
  }));
}

function invocationDigest(invocation: AssetProviderInvocation): string {
  return sha256(assetProviderInvocationDigestInput(invocation));
}

function handoffAction(
  sessionId: string,
  contractDigest: string,
): AuthoringNextAction {
  return {
    id: 'confirm-provider-handoff',
    summary: 'Confirm the exact provider, contract, target, reference, network, and limit scope.',
    command: `asset authoring provider handoff --session ${sessionId} --descriptor <descriptor.json> --consent <consent.json> --confirm`,
    safety: 'requires-confirmation',
    requiredInputs: ['confirm'],
    preconditionDigests: [contractDigest],
    expectedCheckpoint: null,
  };
}

function refusalAction(
  sessionId: string,
  contractDigest: string,
  refusalCode: AssetProviderRefusalCode,
): AuthoringNextAction {
  const requiresConfirmation = refusalCode === 'asset_provider_scope_violation'
    || refusalCode === 'asset_provider_network_denied';
  return {
    id: 'resolve-provider-precondition',
    summary: 'Resolve the provider precondition and submit a new bounded consent scope.',
    command: `asset authoring provider handoff --session ${sessionId} --descriptor <descriptor.json> --consent <consent.json>${requiresConfirmation ? ' --confirm' : ''}`,
    safety: requiresConfirmation ? 'requires-confirmation' : 'safe',
    requiredInputs: requiresConfirmation ? ['consent', 'confirm'] : ['consent'],
    preconditionDigests: [contractDigest],
    expectedCheckpoint: null,
  };
}

function handoffData(options: {
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly provider: AssetProviderPreflightData['provider'];
  readonly status: ProviderHandoffStatus;
  readonly invocation?: AssetProviderInvocation | null;
  readonly refusal?: AssetProviderHandoffData['refusal'];
  readonly safety: AuthoringActionSafety;
  readonly nextActions: readonly AuthoringNextAction[];
}): AssetProviderHandoffData {
  const invocationValue = options.invocation === undefined ? null : options.invocation;
  return {
    schema: ASSET_PROVIDER_HANDOFF_SCHEMA,
    sessionId: options.sessionId,
    contractDigest: options.contractDigest,
    provider: options.provider,
    status: options.status,
    invocation: invocationValue,
    invocationDigest: invocationValue === null ? null : invocationDigest(invocationValue),
    refusal: options.refusal === undefined ? null : options.refusal,
    safety: options.safety,
    nextActions: options.nextActions,
  };
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

function hasUnsafePathComponent(root: string, candidate: string): boolean {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  if (!isInsideRoot(absoluteRoot, absoluteCandidate)) return true;
  const relative = path.relative(absoluteRoot, absoluteCandidate);
  const components = relative === '' ? [] : relative.split(path.sep);
  let current = absoluteRoot;
  for (const candidateComponent of [absoluteRoot, ...components]) {
    current = candidateComponent === absoluteRoot
      ? absoluteRoot
      : path.join(current, candidateComponent);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function candidateStagingRoot(workspace: AssetWorkspace, sessionId: string): string {
  const sessionDirectory = path.dirname(assetAuthoringSessionPath(workspace, sessionId));
  return path.join(sessionDirectory, 'provider-candidates');
}

function safeContractError(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof AssetAuthoringImportError) {
    switch (error.code) {
      case 'asset_authoring_contract_missing':
        return { code: 'asset_provider_contract_missing', message: 'The current drawing contract is missing.' };
      case 'asset_authoring_contract_stale':
      case 'asset_authoring_planning_stale':
        return { code: 'asset_provider_contract_stale', message: 'The drawing contract is stale for this session.' };
      case 'asset_authoring_artifact_metadata_invalid':
        return { code: 'asset_provider_contract_invalid', message: 'The drawing contract artifact metadata is invalid.' };
      default:
        return { code: 'asset_provider_contract_invalid', message: 'The current drawing contract is invalid.' };
    }
  }
  if (error instanceof AssetAuthoringSessionError) {
    return {
      code: error.code,
      message: 'The authoring session could not be read safely.',
    };
  }
  return {
    code: 'asset_provider_contract_invalid',
    message: 'The current drawing contract could not be read safely.',
  };
}

function refusal(
  code: AssetProviderRefusalCode,
  message: string,
): NonNullable<AssetProviderPreflightData['refusal']> {
  return { code, message };
}

function preflightData(options: {
  readonly descriptor: AssetProviderDescriptor;
  readonly session: AssetAuthoringSession;
  readonly contractDigest: string;
  readonly contract: SpriteDrawingContract;
  readonly cwd: string;
  readonly workspace: AssetWorkspace;
  readonly requestedTargets: readonly string[];
  readonly requestedReferences: readonly string[];
  readonly candidateRootArgument: string | undefined;
  readonly networkConsent?: ProviderConsent;
  readonly approvedLimits?: AssetProviderDescriptor['limits'];
}): AssetProviderPreflightData {
  const { descriptor, session, contract, contractDigest, workspace } = options;
  const limits = options.approvedLimits ?? descriptor.limits;
  const descriptorDigest = sha256(assetProviderDescriptorDigestInput(descriptor));
  const contractTargetIds = contract.targets.map((target) => target.id);
  const targetIds = options.requestedTargets.length > 0
    ? [...new Set(options.requestedTargets)].sort()
    : [...contractTargetIds].sort();
  const contractReferenceDigests = [...new Set(
    contract.targets.flatMap((target) => target.references.map((reference) => reference.digest)),
  )].sort();
  const referenceDigests = options.requestedReferences.length > 0
    ? [...new Set(options.requestedReferences)].sort()
    : contractReferenceDigests;
  const cliRange = assetProviderCliRangeMatches(descriptor.adapter.cliRange, CLI_VERSION);
  const capability = descriptor.capabilities.includes(ASSET_PROVIDER_OPERATION);
  const contractVersion = descriptor.contractVersions.includes(ASSET_PROVIDER_CONTRACT_VERSION)
    && contract.schema === ASSET_PROVIDER_CONTRACT_VERSION;
  const targetScope = targetIds.every((targetId) => contractTargetIds.includes(targetId));
  const referenceScope = referenceDigests.every((digest) => contractReferenceDigests.includes(digest));
  const references = referenceDigests.length <= limits.maxReferences;
  const requiredCandidateBytes = Math.max(
    1,
    ...contract.targets
      .filter((target) => targetIds.includes(target.id))
      .map((target) => target.geometry.canvasWidth * target.geometry.canvasHeight * 4),
  );
  const candidateBytes = limits.maxCandidateBytes >= requiredCandidateBytes;
  const allowedCandidateRoot = candidateStagingRoot(workspace, session.sessionId);
  const requestedCandidateRoot = options.candidateRootArgument === undefined
    ? allowedCandidateRoot
    : path.resolve(options.cwd, options.candidateRootArgument);
  const protectedRoot = isInsideRoot(allowedCandidateRoot, requestedCandidateRoot)
    && !hasUnsafePathComponent(allowedCandidateRoot, requestedCandidateRoot);
  const credentials = !descriptor.credentials.required || descriptor.credentials.handledOutsideCli;
  const network = networkScopeMatches(descriptor, options.networkConsent);
  const discovery = assetProviderDiscoveryEntry({
    availability: 'available',
    descriptor,
    descriptorDigest,
    sessionId: session.sessionId,
    contractDigest,
    cliVersion: CLI_VERSION,
  });

  let status: ProviderPreflightStatus = discovery.status === 'consent-required'
    ? 'consent-required'
    : discovery.status === 'supported' ? 'supported' : 'unsupported';
  let refusalValue: AssetProviderPreflightData['refusal'] = discovery.refusal;
  if (network && refusalValue?.code === 'asset_provider_consent_required') {
    status = 'supported';
    refusalValue = null;
  }
  if (refusalValue === null && !candidateBytes) {
    status = 'unsupported';
    refusalValue = refusal(
      'asset_provider_scope_violation',
      'The provider candidate byte limit is smaller than the current contract geometry.',
    );
  }
  if (refusalValue === null && !references) {
    status = 'unsupported';
    refusalValue = refusal(
      'asset_provider_scope_violation',
      'The provider reference limit is smaller than the requested reference scope.',
    );
  }
  if (refusalValue === null && (!targetScope || !referenceScope)) {
    status = 'unsupported';
    refusalValue = refusal(
      'asset_provider_scope_violation',
      'The requested provider scope is outside the current drawing contract.',
    );
  }
  if (refusalValue === null && !protectedRoot) {
    status = 'unsupported';
    refusalValue = refusal(
      'asset_provider_scope_violation',
      'Provider candidate staging must remain below the session-owned staging root.',
    );
  }
  if (refusalValue === null && !credentials) {
    status = 'unsupported';
    refusalValue = refusal(
      'asset_provider_secret_input',
      'Provider credentials must be handled outside the CLI boundary.',
    );
  }
  if (refusalValue === null && !network) {
    status = 'consent-required';
    refusalValue = refusal(
      'asset_provider_consent_required',
      'The provider declares network access and requires explicit consent.',
    );
  }
  return {
    schema: ASSET_PROVIDER_PREFLIGHT_SCHEMA,
    sessionId: session.sessionId,
    contractDigest,
    descriptorDigest,
    provider: providerIdentity(descriptor),
    status,
    targetIds,
    referenceDigests,
    checks: {
      cliRange,
      capability,
      contractVersion,
      candidateBytes,
      references,
      targetScope,
      referenceScope,
      credentials,
      protectedRoot,
      network,
    },
    limits,
    network: {
      required: descriptor.network.required,
      declaredHosts: [...descriptor.network.declaredHosts],
    },
    refusal: refusalValue,
  };
}

function runDiscovery(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  const sessionId = flagString(parsed.flags, 'session');
  const contractDigest = flagString(parsed.flags, 'contract-digest');
  const descriptorsPath = flagString(parsed.flags, 'descriptors');
  if (sessionId === undefined || contractDigest === undefined || descriptorsPath === undefined) {
    return issueResponse(
      'asset authoring provider discover',
      'missing_argument',
      'Discovery requires --session, --contract-digest, and --descriptors.',
    );
  }
  if (!isDigest(contractDigest)) {
    return issueResponse(
      'asset authoring provider discover',
      'invalid_option',
      '--contract-digest must be a sha256 digest.',
      '--contract-digest',
    );
  }
  const source = readJsonFile(cwd, descriptorsPath, '--descriptors', DISCOVERY_INPUT_MAX_BYTES);
  if (!source.ok) return { ...source.response, command: 'asset authoring provider discover' };
  const inputs = parseDiscoveryInputs(source.value);
  if (!inputs.ok) return diagnosticResponse('asset authoring provider discover', inputs.diagnostics);
  const discovery = assetProviderDiscoveryProjection({
    schema: 'lpc-toolkit.asset-provider-discovery.v1',
    sessionId,
    contractDigest,
    cliVersion: CLI_VERSION,
    entries: inputs.inputs.map((input) => {
      const descriptorDigest = sha256(assetProviderDescriptorDigestInput(input.descriptor));
      return assetProviderDiscoveryEntry({
        availability: input.availability,
        descriptor: input.descriptor,
        descriptorDigest,
        sessionId,
        contractDigest,
        cliVersion: CLI_VERSION,
      });
    }),
  });
  const validated = parseAssetProviderDiscovery(discovery);
  if (!validated.ok) return diagnosticResponse('asset authoring provider discover', validated.diagnostics);
  return commandOk('asset authoring provider discover', validated.discovery);
}

function runPreflight(
  parsed: ParsedArgs,
  cwd: string,
  workspace: AssetWorkspace | undefined,
): CliResponse<AssetProviderPreflightData | null> {
  const command = 'asset authoring provider preflight';
  const sessionId = flagString(parsed.flags, 'session');
  const contractDigest = flagString(parsed.flags, 'contract-digest');
  const descriptorPath = flagString(parsed.flags, 'descriptor');
  if (sessionId === undefined || contractDigest === undefined || descriptorPath === undefined) {
    return issueResponse(
      command,
      'missing_argument',
      'Preflight requires --session, --contract-digest, and --descriptor.',
    );
  }
  if (!isDigest(contractDigest)) {
    return issueResponse(command, 'invalid_option', '--contract-digest must be a sha256 digest.', '--contract-digest');
  }
  if (workspace === undefined) {
    return issueResponse(command, 'asset_workspace_not_found', 'An asset workspace is required for provider preflight.', '--workspace');
  }
  const descriptor = descriptorFromFile(cwd, descriptorPath, '--descriptor');
  if (!descriptor.ok) return { ...descriptor.response, command };

  let session: AssetAuthoringSession;
  try {
    session = createAssetAuthoringSessionStore(workspace).read(sessionId);
  } catch (error) {
    const safe = safeContractError(error);
    return issueResponse(command, safe.code, safe.message, '--session');
  }
  if (
    session.checkpointFreshness !== 'current'
    || !['contract-ready', 'awaiting-candidate', 'imported', 'validated', 'previewed'].includes(session.phase)
  ) {
    return issueResponse(
      command,
      'asset_provider_contract_stale',
      'The authoring session does not have a current drawing contract.',
      '--session',
    );
  }

  let evidence: ReturnType<typeof readAssetAuthoringContractEvidence>;
  try {
    evidence = readAssetAuthoringContractEvidence({
      workspace,
      session,
      contractDigest,
    });
  } catch (error) {
    const safe = safeContractError(error);
    return issueResponse(command, safe.code, safe.message, '--contract-digest');
  }

  const data = preflightData({
    descriptor: descriptor.descriptor,
    session,
    contractDigest: evidence.contractDigest,
    contract: evidence.contract,
    cwd,
    workspace,
    requestedTargets: flagStrings(parsed.flags, 'target'),
    requestedReferences: flagStrings(parsed.flags, 'reference'),
    candidateRootArgument: flagString(parsed.flags, 'candidate-root'),
  });
  return commandOk(command, data);
}

function runHandoff(
  parsed: ParsedArgs,
  cwd: string,
  workspace: AssetWorkspace | undefined,
): CliResponse<AssetProviderHandoffData | null> {
  const command = 'asset authoring provider handoff';
  const sessionId = flagString(parsed.flags, 'session');
  const descriptorPath = flagString(parsed.flags, 'descriptor');
  const consentPath = flagString(parsed.flags, 'consent');
  if (sessionId === undefined || descriptorPath === undefined || consentPath === undefined) {
    return issueResponse(
      command,
      'missing_argument',
      'Handoff requires --session, --descriptor, and --consent.',
    );
  }
  if (workspace === undefined) {
    return issueResponse(command, 'asset_workspace_not_found', 'An asset workspace is required for provider handoff.', '--workspace');
  }

  const descriptor = descriptorFromFile(cwd, descriptorPath, '--descriptor');
  if (!descriptor.ok) return { ...descriptor.response, command };
  const consentSource = readJsonFile(cwd, consentPath, '--consent', ASSET_PROVIDER_LIMITS.descriptorBytes);
  if (!consentSource.ok) return { ...consentSource.response, command };
  const parsedConsent = parseConsentValue(consentSource.value);
  if (!parsedConsent.ok) return diagnosticResponse(command, parsedConsent.diagnostics);
  const consent = parsedConsent.consent;

  let session: AssetAuthoringSession;
  try {
    session = createAssetAuthoringSessionStore(workspace).read(sessionId);
  } catch (error) {
    const safe = safeContractError(error);
    return issueResponse(command, safe.code, safe.message, '--session');
  }
  if (
    session.checkpointFreshness !== 'current'
    || !['contract-ready', 'awaiting-candidate', 'imported', 'validated', 'previewed'].includes(session.phase)
  ) {
    return issueResponse(
      command,
      'asset_provider_contract_stale',
      'The authoring session does not have a current drawing contract.',
      '--session',
    );
  }

  let evidence: ReturnType<typeof readAssetAuthoringContractEvidence>;
  try {
    evidence = readAssetAuthoringContractEvidence({
      workspace,
      session,
      contractDigest: consent.contractDigest,
    });
  } catch (error) {
    if (error instanceof AssetAuthoringImportError && error.code === 'asset_authoring_contract_stale') {
      return issueResponse(
        command,
        'asset_provider_contract_mismatch',
        'The consent contract digest is not the current session contract.',
        '--consent',
      );
    }
    const safe = safeContractError(error);
    return issueResponse(command, safe.code, safe.message, '--consent');
  }

  const preflight = preflightData({
    descriptor: descriptor.descriptor,
    session,
    contractDigest: evidence.contractDigest,
    contract: evidence.contract,
    cwd,
    workspace,
    requestedTargets: consent.targetIds,
    requestedReferences: consent.referenceDigests,
    candidateRootArgument: undefined,
    networkConsent: consent,
    approvedLimits: consent.limits,
  });
  const provider = preflight.provider;
  const scopeRefusal = (
    code: AssetProviderRefusalCode,
    message: string,
  ): CliResponse<AssetProviderHandoffData> => commandOk(command, handoffData({
    sessionId,
    contractDigest: evidence.contractDigest,
    provider,
    status: 'unsupported',
    refusal: refusal(code, message),
    safety: 'blocked',
    nextActions: [refusalAction(sessionId, evidence.contractDigest, code)],
  }));

  if (!limitsWithinDescriptor(consent.limits, descriptor.descriptor.limits)) {
    return scopeRefusal(
      'asset_provider_scope_violation',
      'The consent resource limits exceed the provider descriptor limits.',
    );
  }
  if (!networkScopeMatches(descriptor.descriptor, consent)) {
    return scopeRefusal(
      'asset_provider_network_denied',
      'The consent network scope must exactly match the provider declared hosts and policy.',
    );
  }
  if (preflight.status !== 'supported' || preflight.refusal !== null) {
    const preflightRefusal = preflight.refusal ?? refusal(
      'asset_provider_contract_mismatch',
      'Provider preflight did not produce a supported handoff.',
    );
    return commandOk(command, handoffData({
      sessionId,
      contractDigest: evidence.contractDigest,
      provider,
      status: preflight.status === 'consent-required' ? 'consent-required' : 'unsupported',
      refusal: preflightRefusal,
      safety: preflight.status === 'consent-required' ? 'requires-confirmation' : 'blocked',
      nextActions: [
        preflight.status === 'consent-required'
          ? handoffAction(sessionId, evidence.contractDigest)
          : refusalAction(sessionId, evidence.contractDigest, preflightRefusal.code),
      ],
    }));
  }

  const invocation: AssetProviderInvocation = {
    schema: 'lpc-toolkit.asset-provider-invocation.v1',
    sessionId: session.sessionId,
    contractDigest: evidence.contractDigest,
    operation: ASSET_PROVIDER_OPERATION,
    provider,
    targetIds: [...consent.targetIds],
    consent: {
      confirmed: true,
      scopeDigest: consentScopeDigest(consent),
      network: {
        enabled: consent.network.enabled,
        hosts: [...consent.network.hosts],
      },
      referenceDigests: [...consent.referenceDigests],
    },
    limits: { ...consent.limits },
    candidate: {
      stagingId: `${descriptor.descriptor.id}/${session.sessionId}`,
      targetIds: [...consent.targetIds],
    },
  };
  const nextDigest = invocationDigest(invocation);
  const previousInvocation = session.receipts.providerInvocation ?? null;
  if (
    previousInvocation !== null
    && invocationDigest(previousInvocation) === nextDigest
    && consent.confirmed
  ) {
    return commandOk(command, handoffData({
      sessionId,
      contractDigest: evidence.contractDigest,
      provider,
      status: 'reused',
      invocation: previousInvocation,
      safety: 'safe',
      nextActions: [],
    }));
  }
  if (!consent.confirmed || !flagBoolean(parsed.flags, 'confirm')) {
    return commandOk(command, handoffData({
      sessionId,
      contractDigest: evidence.contractDigest,
      provider,
      status: 'consent-required',
      safety: 'requires-confirmation',
      nextActions: [handoffAction(sessionId, evidence.contractDigest)],
    }));
  }

  const store = createAssetAuthoringSessionStore(workspace);
  const next = store.replace(sessionId, {
    state: 'needs-user-action',
    reason: 'provider-invocation-current',
    phase: 'awaiting-candidate',
    checkpointFreshness: 'current',
    receipts: {
      ...session.receipts,
      providerInvocation: invocation,
      providerResult: null,
    },
    provenance: [
      ...session.provenance,
      {
        id: randomUUID(),
        kind: 'provider',
        occurredAt: new Date().toISOString(),
        digest: nextDigest,
        summary: 'Consent-scoped provider invocation handoff recorded without executing a provider.',
      },
    ],
  });
  return commandOk(command, handoffData({
    sessionId: next.sessionId,
    contractDigest: evidence.contractDigest,
    provider,
    status: 'created',
    invocation: next.receipts.providerInvocation ?? invocation,
    safety: 'safe',
    nextActions: [],
  }));
}

export function runAssetProviderCommand(options: {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
  readonly workspace?: AssetWorkspace;
}): CliResponse<unknown> {
  const providerCommand = options.parsed.command[3];
  if (providerCommand === 'discover') return runDiscovery(options.parsed, options.cwd);
  if (providerCommand === 'preflight') {
    return runPreflight(options.parsed, options.cwd, options.workspace);
  }
  if (providerCommand === 'handoff') {
    return runHandoff(options.parsed, options.cwd, options.workspace);
  }
  return issueResponse(
    `${PROVIDER_COMMAND} ${providerCommand ?? ''}`.trim(),
    'unknown_command',
    `Unknown asset provider command: ${options.parsed.command.join(' ')}`,
  );
}
