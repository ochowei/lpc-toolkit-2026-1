import { createHash } from 'node:crypto';
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
  parseAssetProviderDescriptor,
  parseAssetProviderDiscovery,
  type AssetProviderDescriptor,
  type AssetProviderDiagnostic,
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
import { flagString, flagStrings, type ParsedArgs } from './args.js';
import { CLI_VERSION } from './package-info.js';
import { commandError, commandOk, type CliResponse } from './response.js';
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
}): AssetProviderPreflightData {
  const { descriptor, session, contract, contractDigest, workspace } = options;
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
  const references = referenceDigests.length <= descriptor.limits.maxReferences;
  const requiredCandidateBytes = Math.max(
    1,
    ...contract.targets
      .filter((target) => targetIds.includes(target.id))
      .map((target) => target.geometry.canvasWidth * target.geometry.canvasHeight * 4),
  );
  const candidateBytes = descriptor.limits.maxCandidateBytes >= requiredCandidateBytes;
  const allowedCandidateRoot = candidateStagingRoot(workspace, session.sessionId);
  const requestedCandidateRoot = options.candidateRootArgument === undefined
    ? allowedCandidateRoot
    : path.resolve(options.cwd, options.candidateRootArgument);
  const protectedRoot = isInsideRoot(allowedCandidateRoot, requestedCandidateRoot)
    && !hasUnsafePathComponent(allowedCandidateRoot, requestedCandidateRoot);
  const credentials = !descriptor.credentials.required || descriptor.credentials.handledOutsideCli;
  const network = !descriptor.network.required && descriptor.network.declaredHosts.length === 0;
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
    limits: {
      maxCandidateBytes: descriptor.limits.maxCandidateBytes,
      timeoutSeconds: descriptor.limits.timeoutSeconds,
      maxReferences: descriptor.limits.maxReferences,
    },
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
  return issueResponse(
    `${PROVIDER_COMMAND} ${providerCommand ?? ''}`.trim(),
    'unknown_command',
    `Unknown asset provider command: ${options.parsed.command.join(' ')}`,
  );
}
