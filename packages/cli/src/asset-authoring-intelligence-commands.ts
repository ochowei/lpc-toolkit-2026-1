import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ImageData as NapiImageData, createCanvas } from '@napi-rs/canvas';
import { ASSET_PACK_ARCHIVE_LIMITS } from '@lpc-toolkit/asset-pack-format';
import {
  ASSET_AUTHORING_INTELLIGENCE_CAPABILITIES,
  ASSET_AUTHORING_INTELLIGENCE_CONSENT_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_LIMITS,
  ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_ROUTE_SCHEMA,
  assetProviderRefusalDigestInput,
  assetProviderResultDigestInput,
  authoringIntelligenceOperationDigestInput,
  authoringIntelligenceRequestDigestInput,
  authoringIntelligenceRouteProjection,
  createAuthoringIntelligenceRequest,
  materializeAuthoringIntelligenceRecolor,
  parseAuthoringIntelligenceCatalogSnapshot,
  parseAuthoringIntelligenceOperationPlan,
  routeAuthoringIntelligence,
  spriteDrawingContractV2DigestInput,
  type AssetReleaseProvenanceSourceTransformation,
  type AuthoringIntelligenceOperationPlan,
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
import { assetProviderCandidateStagingPath } from './asset-provider-commands.js';
import { flagBoolean, flagString, flagStrings, type ParsedArgs } from './args.js';
import {
  commandError,
  commandOk,
  type CliResponse,
} from './response.js';
import type { AssetWorkspace } from './asset-workspace.js';
import { nodeAssetPackPngDecoder } from './asset-pack-node-runtime.js';

const INTELLIGENCE_COMMAND = 'asset authoring intelligence' as const;
const MAX_CATALOG_BYTES = 512 * 1024;
const MAX_OPERATION_BYTES = 512 * 1024;
const MAX_CONSENT_BYTES = 128 * 1024;
const MAX_CANDIDATE_BYTES = ASSET_PACK_ARCHIVE_LIMITS.entryBytes;
const D5_CONSENT_SCHEMA = ASSET_AUTHORING_INTELLIGENCE_CONSENT_SCHEMA;
const D5_STAGE_PATH_ROOT = 'session-owned-candidate-staging' as const;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type JsonRecord = Readonly<Record<string, unknown>>;

interface AuthoringIntelligenceConsent {
  readonly schema: typeof D5_CONSENT_SCHEMA;
  readonly approved: true;
  readonly sessionId: string;
  readonly operationDigest: string;
  readonly scopeDigest: string;
  readonly targetIds: readonly string[];
  readonly inputCandidateDigests: readonly string[];
  readonly pathRoot: typeof D5_STAGE_PATH_ROOT;
  readonly resourceLimits: {
    readonly candidates: number;
    readonly inputBytes: number;
    readonly outputBytes: number;
  };
  readonly network: {
    readonly enabled: false;
    readonly hosts: readonly [];
  };
}

interface D5CandidateReceipt {
  readonly targetId: string;
  readonly digest: string;
  readonly byteLength: number;
  readonly relativePath: string;
}

interface D5StageReceipt {
  readonly schema: typeof ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA;
  readonly status: 'staged' | 'reused';
  readonly sessionId: string;
  readonly operationDigest: string;
  readonly catalogSnapshotDigest: string;
  readonly contractDigests: readonly string[];
  readonly inputCandidateDigests: readonly string[];
  readonly outputTargetIdentities: readonly string[];
  readonly candidates: readonly D5CandidateReceipt[];
  readonly consentScopeDigest: string;
  readonly rawRequestRetained: false;
  readonly providerEvidence: 'none' | 'candidate-result' | 'refusal';
  readonly providerEvidenceDigest: string | null;
  readonly attributionStatus: 'deferred-to-import-validation';
  readonly sourceAssetIdentities: readonly string[];
  readonly provenanceRecords: readonly AssetReleaseProvenanceSourceTransformation[];
}

interface CandidateInput {
  readonly bytes: Buffer;
  readonly digest: string;
}

interface StageOutput {
  readonly targetId: string;
  readonly bytes: Buffer;
  readonly digest: string;
  readonly absolutePath: string;
  readonly relativePath: string;
}

interface CandidateGeometry {
  readonly width: number;
  readonly height: number;
}

interface StableJsonObject {
  readonly [key: string]: StableJsonValue;
}

type StableJsonValue = null | boolean | number | string | readonly StableJsonValue[] | StableJsonObject;

interface ReadJsonSuccess {
  readonly ok: true;
  readonly value: unknown;
  readonly digest: string;
}

interface ReadJsonFailure {
  readonly ok: false;
  readonly response: CliResponse<null>;
}

type ReadJsonResult = ReadJsonSuccess | ReadJsonFailure;

function digestValue(value: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function readBoundedJson(
  cwd: string,
  fileArgument: string,
  flag: string,
  maximumBytes: number,
): ReadJsonResult {
  const filePath = path.resolve(cwd, fileArgument);
  let stats;
  try {
    stats = lstatSync(filePath);
  } catch {
    return {
      ok: false,
      response: commandError(INTELLIGENCE_COMMAND, {
        code: 'asset_authoring_intelligence_input_missing',
        message: `The file supplied with ${flag} could not be read.`,
        path: flag,
      }),
    };
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    return {
      ok: false,
      response: commandError(INTELLIGENCE_COMMAND, {
        code: 'asset_authoring_intelligence_input_not_regular',
        message: `The file supplied with ${flag} must be a regular file.`,
        path: flag,
      }),
    };
  }
  if (stats.size > maximumBytes) {
    return {
      ok: false,
      response: commandError(INTELLIGENCE_COMMAND, {
        code: 'asset_authoring_intelligence_resource_limit',
        message: `The file supplied with ${flag} exceeds the bounded input size.`,
        path: flag,
      }),
    };
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch {
    return {
      ok: false,
      response: commandError(INTELLIGENCE_COMMAND, {
        code: 'asset_authoring_intelligence_input_missing',
        message: `The file supplied with ${flag} could not be read.`,
        path: flag,
      }),
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    return {
      ok: false,
      response: commandError(INTELLIGENCE_COMMAND, {
        code: 'asset_authoring_intelligence_input_invalid',
        message: `The file supplied with ${flag} must contain valid JSON.`,
        path: flag,
      }),
    };
  }
  return { ok: true, value, digest: digestValue(bytes) };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredStringValue(
  record: JsonRecord,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0
    ? value
    : undefined;
}

function stringArrayValue(
  value: unknown,
  allowEmpty: boolean,
): readonly string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return undefined;
  if (!value.every((entry): entry is string => typeof entry === 'string' && entry.length > 0)) return undefined;
  const normalized = [...new Set(value)].sort((left, right) => left.localeCompare(right));
  return normalized.length === value.length ? normalized : undefined;
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function digestArrayValue(value: unknown): readonly string[] | undefined {
  const values = stringArrayValue(value, false);
  return values !== undefined && values.every((entry) => DIGEST_PATTERN.test(entry))
    ? values
    : undefined;
}

function stableJson(value: unknown): StableJsonValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map((entry) => stableJson(entry));
  if (typeof value === 'object') {
    const result: Record<string, StableJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) result[key] = stableJson(entry);
    }
    return Object.fromEntries(
      Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  throw new Error('D5 consent scope contains an unsupported value.');
}

function stableJsonText(value: unknown): string {
  const text = JSON.stringify(stableJson(value));
  if (text === undefined) throw new Error('D5 consent scope could not be encoded.');
  return text;
}

function consentScopeDigest(consent: Pick<AuthoringIntelligenceConsent, 'sessionId' | 'operationDigest' | 'targetIds' | 'inputCandidateDigests' | 'pathRoot' | 'resourceLimits' | 'network'>): string {
  return digestValue(stableJsonText({
    schema: D5_CONSENT_SCHEMA,
    sessionId: consent.sessionId,
    operationDigest: consent.operationDigest,
    targetIds: consent.targetIds,
    inputCandidateDigests: consent.inputCandidateDigests,
    pathRoot: consent.pathRoot,
    resourceLimits: consent.resourceLimits,
    network: consent.network,
  }));
}

function parseConsent(value: unknown): AuthoringIntelligenceConsent | undefined {
  if (!isRecord(value) || value.schema !== D5_CONSENT_SCHEMA || value.approved !== true) return undefined;
  const sessionId = requiredStringValue(value, 'sessionId');
  const operationDigest = requiredStringValue(value, 'operationDigest');
  const scopeDigest = requiredStringValue(value, 'scopeDigest');
  const targetIds = stringArrayValue(value.targetIds, false);
  const inputCandidateDigests = digestArrayValue(value.inputCandidateDigests);
  const resourceLimits = isRecord(value.resourceLimits) ? value.resourceLimits : undefined;
  const candidates = resourceLimits === undefined ? undefined : integerValue(resourceLimits.candidates);
  const inputBytes = resourceLimits === undefined ? undefined : integerValue(resourceLimits.inputBytes);
  const outputBytes = resourceLimits === undefined ? undefined : integerValue(resourceLimits.outputBytes);
  const network = isRecord(value.network) ? value.network : undefined;
  const hosts = network === undefined ? undefined : stringArrayValue(network.hosts, true);
  if (
    sessionId === undefined
    || operationDigest === undefined
    || scopeDigest === undefined
    || !DIGEST_PATTERN.test(operationDigest)
    || !DIGEST_PATTERN.test(scopeDigest)
    || targetIds === undefined
    || inputCandidateDigests === undefined
    || value.pathRoot !== D5_STAGE_PATH_ROOT
    || candidates === undefined
    || inputBytes === undefined
    || outputBytes === undefined
    || candidates !== ASSET_AUTHORING_INTELLIGENCE_LIMITS.candidates
    || inputBytes !== MAX_CANDIDATE_BYTES
    || outputBytes !== MAX_CANDIDATE_BYTES
    || network === undefined
    || network.enabled !== false
    || hosts === undefined
    || hosts.length !== 0
  ) return undefined;
  const consent: AuthoringIntelligenceConsent = {
    schema: D5_CONSENT_SCHEMA,
    approved: true,
    sessionId,
    operationDigest,
    scopeDigest,
    targetIds,
    inputCandidateDigests,
    pathRoot: D5_STAGE_PATH_ROOT,
    resourceLimits: { candidates, inputBytes, outputBytes },
    network: { enabled: false, hosts: [] },
  };
  return consentScopeDigest(consent) === consent.scopeDigest ? consent : undefined;
}

function readBoundedCandidate(
  cwd: string,
  fileArgument: string,
): { readonly ok: true; readonly value: CandidateInput } | ReadJsonFailure {
  const filePath = path.resolve(cwd, fileArgument);
  let stats;
  try {
    stats = lstatSync(filePath);
  } catch {
    return {
      ok: false,
      response: commandError(`${INTELLIGENCE_COMMAND} stage`, {
        code: 'asset_authoring_intelligence_input_missing',
        message: 'A candidate file could not be read.',
        path: '--candidate',
      }),
    };
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    return {
      ok: false,
      response: commandError(`${INTELLIGENCE_COMMAND} stage`, {
        code: 'asset_authoring_intelligence_input_not_regular',
        message: 'Candidate inputs must be regular files.',
        path: '--candidate',
      }),
    };
  }
  if (stats.size > MAX_CANDIDATE_BYTES) {
    return {
      ok: false,
      response: commandError(`${INTELLIGENCE_COMMAND} stage`, {
        code: 'asset_authoring_intelligence_resource_limit',
        message: 'Candidate input exceeds the bounded candidate size.',
        path: '--candidate',
      }),
    };
  }
  try {
    const bytes = readFileSync(filePath);
    return { ok: true, value: { bytes, digest: digestValue(bytes) } };
  } catch {
    return {
      ok: false,
      response: commandError(`${INTELLIGENCE_COMMAND} stage`, {
        code: 'asset_authoring_intelligence_input_missing',
        message: 'A candidate file could not be read.',
        path: '--candidate',
      }),
    };
  }
}

function requiredFlag(
  parsed: ParsedArgs,
  name: string,
): string | CliResponse<null> {
  const value = flagString(parsed.flags, name);
  return value === undefined
    ? commandError(INTELLIGENCE_COMMAND, {
      code: 'missing_argument',
      message: `--${name} is required.`,
      path: `--${name}`,
    })
    : value;
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

function ensureOwnedDirectory(root: string, directory: string): void {
  const absoluteRoot = path.resolve(root);
  const absoluteDirectory = path.resolve(directory);
  if (!isInsideRoot(absoluteRoot, absoluteDirectory) || absoluteDirectory === absoluteRoot) {
    throw new Error('D5 staging path escapes its session root.');
  }
  const relative = path.relative(absoluteRoot, absoluteDirectory);
  let current = absoluteRoot;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('D5 staging path is not a safe directory.');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') throw error;
      mkdirSync(current, { recursive: false, mode: 0o700 });
    }
  }
}

function logicalWorkspacePath(baseDirectory: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(baseDirectory), path.resolve(absolutePath));
  if (relative.length === 0 || path.isAbsolute(relative)) throw new Error('D5 output path cannot be represented as a logical relative path.');
  return `./${relative.split(path.sep).join('/')}`;
}

type ExistingFileState = 'missing' | 'same' | 'different';

function existingFileState(filePath: string, bytes: Buffer): ExistingFileState {
  try {
    const stats = lstatSync(filePath);
    if (stats.isSymbolicLink() || !stats.isFile()) return 'different';
    return readFileSync(filePath).equals(bytes) ? 'same' : 'different';
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 'missing';
    return 'different';
  }
}

function writeNewFile(filePath: string, bytes: Buffer): void {
  writeFileSync(filePath, bytes, { flag: 'wx', mode: 0o600 });
}

function refusalResponse(
  plan: AuthoringIntelligenceOperationPlan,
  sessionId: string,
  code: string,
  message: string,
  nextAction: string,
): CliResponse<unknown> {
  return commandOk(`${INTELLIGENCE_COMMAND} stage`, {
    schema: ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
    status: 'needs-user-action',
    sessionId,
    operationDigest: plan.operationDigest,
    catalogSnapshotDigest: plan.catalogSnapshotDigest,
    contractDigests: plan.contractDigests,
    inputCandidateDigests: plan.inputCandidateDigests,
    outputTargetIdentities: plan.outputTargetIdentities,
    candidates: [],
    consentScopeDigest: null,
    rawRequestRetained: false,
    providerEvidence: 'none',
    providerEvidenceDigest: null,
    refusal: { code, message, nextAction },
    nextActions: [nextAction],
    importRequired: true,
    sourceMutation: false,
  });
}

function contractFailureResponse(
  plan: AuthoringIntelligenceOperationPlan,
  sessionId: string,
  error: unknown,
): CliResponse<unknown> {
  const code = error instanceof AssetAuthoringImportError
    ? error.code
    : 'asset_authoring_intelligence_contract_stale';
  return refusalResponse(
    plan,
    sessionId,
    code.startsWith('asset_authoring_intelligence_') ? code : 'asset_authoring_intelligence_contract_stale',
    'The current session contract is unavailable or no longer matches the operation.',
    'refresh-contract',
  );
}

function provenanceOperation(
  operationKind: AuthoringIntelligenceOperationPlan['operationKind'],
): AssetReleaseProvenanceSourceTransformation['operation'] {
  switch (operationKind) {
    case 'derive-variant': return 'variant';
    case 'derive-recolor': return 'recolor';
    case 'custom-geometry': return 'custom-geometry';
    case 'multi-layer': return 'multi-layer';
  }
}

function provenanceRecordsFor(
  plan: AuthoringIntelligenceOperationPlan,
  outputs: readonly StageOutput[],
  providerEvidenceDigest: string | null,
): readonly AssetReleaseProvenanceSourceTransformation[] {
  return outputs.map((output, index) => {
    const contractDigest = plan.normalizedParameters.kind === 'multi-layer'
      ? plan.normalizedParameters.layers.find((layer) => layer.targetIdentity === output.targetId)?.contractDigest
      : plan.normalizedParameters.kind === 'custom-geometry'
        ? digestValue(spriteDrawingContractV2DigestInput(plan.normalizedParameters.contract))
        : plan.contractDigests[Math.min(index, plan.contractDigests.length - 1)];
    const layerInputDigest = plan.normalizedParameters.kind === 'multi-layer'
      ? plan.normalizedParameters.layers.find((layer) => layer.targetIdentity === output.targetId)?.inputDigest
      : undefined;
    const referenceDigests = [
      plan.operationDigest,
      ...(providerEvidenceDigest === null ? [] : [providerEvidenceDigest]),
    ].sort((left, right) => left.localeCompare(right));
    return {
      kind: 'source-transformation' as const,
      targetId: output.targetId,
      ...(contractDigest === undefined ? {} : { contractDigest }),
      inputDigests: [layerInputDigest ?? plan.inputCandidateDigests[Math.min(index, plan.inputCandidateDigests.length - 1)]!],
      referenceDigests,
      operation: provenanceOperation(plan.operationKind),
      resultDigest: output.digest,
    };
  });
}

async function materializeStageOutputs(
  plan: AuthoringIntelligenceOperationPlan,
  inputs: readonly CandidateInput[],
  targetGeometry: ReadonlyMap<string, CandidateGeometry>,
): Promise<readonly { readonly targetId: string; readonly bytes: Buffer }[]> {
  const inputCount = inputs.length;
  const outputCount = plan.outputTargetIdentities.length;
  if (
    inputCount !== plan.inputCandidateDigests.length
    || inputCount === 0
    || outputCount === 0
    || ((plan.operationKind === 'derive-variant' || plan.operationKind === 'derive-recolor') && (inputCount !== 1 || outputCount !== 1))
    || ((plan.operationKind === 'custom-geometry' || plan.operationKind === 'multi-layer') && inputCount !== outputCount)
  ) throw new Error('Candidate input and output counts do not match the operation contract.');

  const decodedInputs = await Promise.all(inputs.map(async (input, index) => {
    const decoded = await nodeAssetPackPngDecoder.decode(input.bytes);
    const targetId = plan.outputTargetIdentities[Math.min(index, outputCount - 1)]!;
    const geometry = targetGeometry.get(targetId);
    if (
      geometry === undefined
      || decoded.width !== geometry.width
      || decoded.height !== geometry.height
      || decoded.width > ASSET_AUTHORING_INTELLIGENCE_LIMITS.canvasWidth
      || decoded.height > ASSET_AUTHORING_INTELLIGENCE_LIMITS.canvasHeight
    ) throw new Error('Candidate PNG dimensions do not match the explicit operation target geometry.');
    return decoded;
  }));

  if (plan.operationKind === 'derive-recolor') {
    const decoded = decodedInputs[0]!;
    if (plan.normalizedParameters.kind !== 'derive-recolor') throw new Error('Recolor operation parameters are invalid.');
    const pixels = materializeAuthoringIntelligenceRecolor(decoded.pixels, plan.normalizedParameters);
    const canvas = createCanvas(decoded.width, decoded.height);
    canvas.getContext('2d').putImageData(new NapiImageData(pixels, decoded.width, decoded.height), 0, 0);
    const bytes = await canvas.encode('png');
    return [{ targetId: plan.outputTargetIdentities[0]!, bytes }];
  }
  if (plan.operationKind === 'multi-layer') {
    if (plan.normalizedParameters.kind !== 'multi-layer') throw new Error('Multi-layer operation parameters are invalid.');
    const inputsByDigest = new Map(inputs.map((input, index) => [plan.inputCandidateDigests[index]!, input]));
    const layersByTarget = new Map(plan.normalizedParameters.layers.map((layer) => [layer.targetIdentity, layer]));
    return plan.outputTargetIdentities.map((targetId) => {
      const layer = layersByTarget.get(targetId);
      const input = layer === undefined ? undefined : inputsByDigest.get(layer.inputDigest);
      if (layer === undefined || input === undefined) throw new Error('Multi-layer operation input binding is invalid.');
      return { targetId, bytes: Buffer.from(input.bytes) };
    });
  }
  return plan.outputTargetIdentities.map((targetId, index) => ({
    targetId,
    bytes: Buffer.from(inputs[index]!.bytes),
  }));
}

async function runStage(
  parsed: ParsedArgs,
  cwd: string,
  workspace: AssetWorkspace,
): Promise<CliResponse<unknown>> {
  const sessionIdValue = requiredFlag(parsed, 'session');
  if (typeof sessionIdValue !== 'string') return sessionIdValue;
  const operationArgument = requiredFlag(parsed, 'operation');
  if (typeof operationArgument !== 'string') return operationArgument;
  const consentArgument = requiredFlag(parsed, 'consent');
  if (typeof consentArgument !== 'string') return consentArgument;
  const candidateArguments = flagStrings(parsed.flags, 'candidate');
  const operationInput = readBoundedJson(cwd, operationArgument, '--operation', MAX_OPERATION_BYTES);
  if (!operationInput.ok) return operationInput.response;
  const parsedOperation = parseAuthoringIntelligenceOperationPlan(operationInput.value);
  if (!parsedOperation.ok) {
    const first = parsedOperation.diagnostics[0];
    return commandError(`${INTELLIGENCE_COMMAND} stage`, {
      code: first?.code ?? 'asset_authoring_intelligence_operation_invalid',
      message: first?.message ?? 'Operation plan is invalid.',
      path: '--operation',
    });
  }
  const plan = parsedOperation.value;
  const expectedOperationDigest = digestValue(authoringIntelligenceOperationDigestInput(plan));
  if (expectedOperationDigest !== plan.operationDigest) {
    return refusalResponse(
      plan,
      sessionIdValue,
      'asset_authoring_intelligence_operation_invalid',
      'The operation digest does not match its canonical inputs.',
      'recompute-from-exact-inputs',
    );
  }
  let session: AssetAuthoringSession;
  try {
    session = createAssetAuthoringSessionStore(workspace).read(sessionIdValue);
  } catch (error) {
    if (error instanceof AssetAuthoringSessionError) {
      return commandError(`${INTELLIGENCE_COMMAND} stage`, {
        code: error.code,
        message: error.message,
        path: '--session',
      });
    }
    return commandError(`${INTELLIGENCE_COMMAND} stage`, {
      code: 'asset_authoring_intelligence_contract_stale',
      message: 'The authoring session could not be read.',
      path: '--session',
    });
  }
  if (
    session.conflict !== null
    || session.checkpointFreshness !== 'current'
    || session.checkpoint === null
    || (session.phase !== 'contract-ready' && session.phase !== 'awaiting-candidate')
    || !plan.contractDigests.includes(session.checkpoint.digest)
  ) {
    return refusalResponse(
      plan,
      session.sessionId,
      'asset_authoring_intelligence_contract_stale',
      'The authoring session does not have a current contract bound to this operation.',
      'refresh-contract',
    );
  }

  let contractTargetIds: ReadonlySet<string> | undefined;
  const targetGeometry = new Map<string, CandidateGeometry>();
  let currentContract: Awaited<ReturnType<typeof readAssetAuthoringContractEvidence>>;
  try {
    currentContract = readAssetAuthoringContractEvidence({
      workspace,
      session,
      contractDigest: session.checkpoint.digest,
    });
    contractTargetIds = new Set(currentContract.contract.targets.map((target) => target.id));
    for (const target of currentContract.contract.targets) {
      targetGeometry.set(target.id, {
        width: target.geometry.canvasWidth,
        height: target.geometry.canvasHeight,
      });
    }
  } catch (error) {
    return contractFailureResponse(plan, session.sessionId, error);
  }
  if (plan.operationKind === 'custom-geometry') {
    if (plan.normalizedParameters.kind !== 'custom-geometry') {
      return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_geometry_unsupported', 'Custom geometry requires an explicit v2 contract.', 'provide-explicit-geometry');
    }
    const geometryDigest = digestValue(spriteDrawingContractV2DigestInput(plan.normalizedParameters.contract));
    if (!plan.contractDigests.includes(geometryDigest)) {
      return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_contract_stale', 'The custom geometry contract digest does not match its canonical contract.', 'refresh-contract');
    }
    for (const target of plan.normalizedParameters.contract.targets) {
      const currentTarget = currentContract.contract.targets.find((candidate) => candidate.id === target.id);
      if (
        currentTarget === undefined
        || currentTarget.path !== target.path
        || currentTarget.geometry.canvasWidth !== plan.normalizedParameters.contract.canvas.width
        || currentTarget.geometry.canvasHeight !== plan.normalizedParameters.contract.canvas.height
      ) {
        return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_geometry_unsupported', 'Custom geometry is not compatible with the current compiler target.', 'provide-explicit-geometry');
      }
    }
  }
  if (plan.outputTargetIdentities.some((targetId) => !contractTargetIds?.has(targetId))) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_layer_conflict', 'The operation output targets are outside the current contract scope.', 'resolve-layer-scope');
  }

  const consentInput = readBoundedJson(cwd, consentArgument, '--consent', MAX_CONSENT_BYTES);
  if (!consentInput.ok) return consentInput.response;
  const consent = parseConsent(consentInput.value);
  if (
    consent === undefined
    || consent.sessionId !== session.sessionId
    || consent.operationDigest !== plan.operationDigest
    || JSON.stringify(consent.targetIds) !== JSON.stringify(plan.outputTargetIdentities)
    || JSON.stringify(consent.inputCandidateDigests) !== JSON.stringify(plan.inputCandidateDigests)
  ) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_consent_required', 'The consent scope does not exactly cover this session, operation, inputs, and targets.', 'resume-session');
  }
  if (!flagBoolean(parsed.flags, 'confirm')) {
    return commandOk(`${INTELLIGENCE_COMMAND} stage`, {
      schema: ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
      status: 'needs-user-action',
      sessionId: session.sessionId,
      operationDigest: plan.operationDigest,
      catalogSnapshotDigest: plan.catalogSnapshotDigest,
      contractDigests: plan.contractDigests,
      inputCandidateDigests: plan.inputCandidateDigests,
      outputTargetIdentities: plan.outputTargetIdentities,
      candidates: [],
      consentScopeDigest: consent.scopeDigest,
      rawRequestRetained: false,
      providerEvidence: 'none',
      providerEvidenceDigest: null,
      refusal: {
        code: 'asset_authoring_intelligence_consent_required',
        message: 'Explicit --confirm is required before D5 staging mutates the session-owned candidate root.',
        nextAction: 'resume-session',
      },
      nextActions: ['resume-session'],
      importRequired: true,
      sourceMutation: false,
    });
  }

  if (candidateArguments.length !== plan.inputCandidateDigests.length) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_operation_invalid', 'The number of candidate inputs does not match the operation plan.', 'recompute-from-exact-inputs');
  }
  if (candidateArguments.length > ASSET_AUTHORING_INTELLIGENCE_LIMITS.candidates) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_resource_limit', 'Candidate count exceeds the fixed D5 limit.', 'recompute-from-exact-inputs');
  }
  const inputs: CandidateInput[] = [];
  for (const candidateArgument of candidateArguments) {
    const candidate = readBoundedCandidate(cwd, candidateArgument);
    if (!candidate.ok) return candidate.response;
    inputs.push(candidate.value);
  }
  if (inputs.reduce((total, input) => total + input.bytes.byteLength, 0) > MAX_CANDIDATE_BYTES) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_resource_limit', 'Total candidate input bytes exceed the fixed D5 limit.', 'recompute-from-exact-inputs');
  }
  if (inputs.some((input, index) => input.digest !== plan.inputCandidateDigests[index])) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_input_drift', 'A candidate input does not match the operation digest-bound input set.', 'recompute-from-exact-inputs');
  }
  let materialized: readonly { readonly targetId: string; readonly bytes: Buffer }[];
  try {
    materialized = await materializeStageOutputs(plan, inputs, targetGeometry);
  } catch (error) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_candidate_stale', error instanceof Error ? error.message : 'Candidate materialization failed.', 're-import-candidate');
  }
  if (materialized.reduce((total, output) => total + output.bytes.byteLength, 0) > MAX_CANDIDATE_BYTES) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_resource_limit', 'Total staged output bytes exceed the fixed D5 limit.', 'recompute-from-exact-inputs');
  }
  const sessionDirectory = path.dirname(assetAuthoringSessionPath(workspace, session.sessionId));
  const candidateRoot = path.join(sessionDirectory, 'provider-candidates');
  const operationDirectory = path.join(candidateRoot, plan.operationDigest.slice('sha256:'.length));
  const receiptRoot = path.join(sessionDirectory, 'intelligence-receipts');
  const receiptPath = path.join(receiptRoot, `${plan.operationDigest.slice('sha256:'.length)}.json`);
  try {
    ensureOwnedDirectory(sessionDirectory, candidateRoot);
    ensureOwnedDirectory(candidateRoot, operationDirectory);
    ensureOwnedDirectory(sessionDirectory, receiptRoot);
  } catch (error) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_protected_path', error instanceof Error ? error.message : 'D5 staging root is not safe.', 'discard-staged-candidate');
  }
  const outputs: StageOutput[] = materialized.map((entry) => {
    const digest = digestValue(entry.bytes);
    const absolutePath = assetProviderCandidateStagingPath(workspace, session.sessionId, plan.operationDigest, digest);
    return {
      targetId: entry.targetId,
      bytes: entry.bytes,
      digest,
      absolutePath,
      relativePath: logicalWorkspacePath(cwd, absolutePath),
    };
  });
  if (outputs.some((output) => !isInsideRoot(operationDirectory, output.absolutePath))) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_protected_path', 'A D5 output path escapes the operation staging root.', 'discard-staged-candidate');
  }
  const existingStates = outputs.map((output) => existingFileState(output.absolutePath, output.bytes));
  if (existingStates.some((state) => state === 'different')) {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_candidate_stale', 'An existing staged candidate has different bytes for this operation digest.', 'discard-staged-candidate');
  }
  const candidates: readonly D5CandidateReceipt[] = outputs.map((output) => ({
    targetId: output.targetId,
    digest: output.digest,
    byteLength: output.bytes.byteLength,
    relativePath: output.relativePath,
  }));
  const providerResult = session.receipts.providerResult;
  const providerEvidence = providerResult === null || providerResult === undefined
    ? { status: 'none' as const, digest: null }
    : providerResult.schema === 'lpc-toolkit.asset-provider-result.v1'
      ? plan.inputCandidateDigests.includes(providerResult.candidate.digest)
        ? { status: 'candidate-result' as const, digest: digestValue(assetProviderResultDigestInput(providerResult)) }
        : { status: 'none' as const, digest: null }
      : { status: 'refusal' as const, digest: digestValue(assetProviderRefusalDigestInput(providerResult)) };
  const baseReceipt: D5StageReceipt = {
    schema: ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
    status: 'staged',
    sessionId: session.sessionId,
    operationDigest: plan.operationDigest,
    catalogSnapshotDigest: plan.catalogSnapshotDigest,
    contractDigests: plan.contractDigests,
    inputCandidateDigests: plan.inputCandidateDigests,
    outputTargetIdentities: plan.outputTargetIdentities,
    candidates,
    consentScopeDigest: consent.scopeDigest,
    rawRequestRetained: false,
    providerEvidence: providerEvidence.status,
    providerEvidenceDigest: providerEvidence.digest,
    attributionStatus: 'deferred-to-import-validation',
    sourceAssetIdentities: plan.inputAssetIdentities,
    provenanceRecords: provenanceRecordsFor(plan, outputs, providerEvidence.digest),
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(baseReceipt, null, 2)}\n`);
  const receiptState = existingFileState(receiptPath, receiptBytes);
  if (receiptState === 'different') {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_candidate_stale', 'An existing D5 receipt has different evidence for this operation digest.', 'discard-staged-candidate');
  }
  try {
    outputs.forEach((output, index) => {
      if (existingStates[index] === 'missing') writeNewFile(output.absolutePath, output.bytes);
    });
    if (receiptState === 'missing') writeNewFile(receiptPath, receiptBytes);
  } catch {
    return refusalResponse(plan, session.sessionId, 'asset_authoring_intelligence_candidate_stale', 'D5 staging encountered an existing or changed operation output.', 'discard-staged-candidate');
  }
  return commandOk(`${INTELLIGENCE_COMMAND} stage`, {
    ...baseReceipt,
    status: existingStates.every((state) => state === 'same') ? 'reused' : 'staged',
    refusal: null,
    nextActions: ['re-import-candidate'],
    importRequired: true,
    sourceMutation: false,
  });
}

function runRoute(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  const request = requiredFlag(parsed, 'request');
  if (typeof request !== 'string') return request;
  const catalogArgument = requiredFlag(parsed, 'catalog');
  if (typeof catalogArgument !== 'string') return catalogArgument;
  const catalogInput = readBoundedJson(cwd, catalogArgument, '--catalog', MAX_CATALOG_BYTES);
  if (!catalogInput.ok) return catalogInput.response;
  const snapshot = parseAuthoringIntelligenceCatalogSnapshot(catalogInput.value);
  if (!snapshot.ok) {
    const first = snapshot.diagnostics[0];
    return commandError(INTELLIGENCE_COMMAND, {
      code: first?.code ?? 'asset_authoring_intelligence_input_invalid',
      message: first?.message ?? 'Catalog snapshot is invalid.',
      path: '--catalog',
    });
  }

  const assetId = flagString(parsed.flags, 'asset-id');
  const variant = flagString(parsed.flags, 'variant');
  const paletteName = flagString(parsed.flags, 'palette');
  const layerIds = flagStrings(parsed.flags, 'layer');
  const sessionId = flagString(parsed.flags, 'session');
  const requestDigest = digestValue(authoringIntelligenceRequestDigestInput(request));
  let requestValue;
  try {
    requestValue = createAuthoringIntelligenceRequest({
      requestText: request,
      requestDigest,
      catalogSnapshotDigest: catalogInput.digest,
      ...(sessionId === undefined ? {} : { sessionScope: { sessionId } }),
      ...(
        assetId === undefined
        && variant === undefined
        && paletteName === undefined
        && layerIds.length === 0
          ? {}
          : {
            explicitHints: {
              ...(assetId === undefined ? {} : { assetId }),
              ...(variant === undefined ? {} : { variant }),
              ...(paletteName === undefined ? {} : { paletteName }),
              ...(layerIds.length === 0 ? {} : { layerIds }),
            },
          }
      ),
    });
  } catch (error) {
    return commandError(INTELLIGENCE_COMMAND, {
      code: 'asset_authoring_intelligence_input_invalid',
      message: error instanceof Error ? error.message : 'Authoring-intelligence request is invalid.',
      path: '--request',
    });
  }
  const route = routeAuthoringIntelligence({
    request: requestValue,
    catalog: snapshot.value,
    availableCapabilities: ASSET_AUTHORING_INTELLIGENCE_CAPABILITIES,
  });
  return commandOk(`${INTELLIGENCE_COMMAND} route`, {
    schema: ASSET_AUTHORING_INTELLIGENCE_ROUTE_SCHEMA,
    route: authoringIntelligenceRouteProjection(route),
    privacy: { rawRequestRetained: false },
  });
}

function verifyStageReceipt(
  value: unknown,
  workspace: AssetWorkspace,
  sessionId: string,
  operationDigest: string,
  operationDirectory: string,
): { readonly ok: true; readonly candidateCount: number } | { readonly ok: false; readonly message: string } {
  if (!isRecord(value)) return { ok: false, message: 'The exact D5 receipt must be an object.' };
  if (
    value.schema !== ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA
    || value.sessionId !== sessionId
    || value.operationDigest !== operationDigest
    || value.rawRequestRetained !== false
  ) return { ok: false, message: 'The exact D5 receipt is not bound to this session, operation, and privacy policy.' };
  if (!Array.isArray(value.candidates) || value.candidates.length === 0 || value.candidates.length > ASSET_AUTHORING_INTELLIGENCE_LIMITS.candidates) {
    return { ok: false, message: 'The exact D5 receipt has an invalid candidate set.' };
  }
  for (const candidateValue of value.candidates) {
    if (!isRecord(candidateValue)) return { ok: false, message: 'The exact D5 receipt contains an invalid candidate record.' };
    const candidateDigest = candidateValue.digest;
    const byteLength = candidateValue.byteLength;
    const relativePath = candidateValue.relativePath;
    if (
      typeof candidateDigest !== 'string'
      || !DIGEST_PATTERN.test(candidateDigest)
      || typeof byteLength !== 'number'
      || !Number.isSafeInteger(byteLength)
      || byteLength < 0
      || byteLength > MAX_CANDIDATE_BYTES
      || typeof relativePath !== 'string'
      || path.isAbsolute(relativePath)
      || relativePath.split('/').some((component) => component === '..' || component.length === 0)
    ) return { ok: false, message: 'The exact D5 receipt contains private or invalid candidate evidence.' };
    const candidatePath = assetProviderCandidateStagingPath(workspace, sessionId, operationDigest, candidateDigest);
    if (!isInsideRoot(operationDirectory, candidatePath)) return { ok: false, message: 'The exact D5 receipt candidate escapes its operation root.' };
    let candidateBytes: Buffer;
    try {
      const stats = lstatSync(candidatePath);
      if (stats.isSymbolicLink() || !stats.isFile()) return { ok: false, message: 'A staged D5 candidate is not a regular file.' };
      candidateBytes = readFileSync(candidatePath);
    } catch {
      return { ok: false, message: 'A staged D5 candidate is missing.' };
    }
    if (
      candidateBytes.byteLength !== byteLength
      || digestValue(candidateBytes) !== candidateDigest
    ) return { ok: false, message: 'A staged D5 candidate no longer matches its receipt digest.' };
  }
  return { ok: true, candidateCount: value.candidates.length };
}

function runRecover(
  parsed: ParsedArgs,
  workspace: AssetWorkspace,
): CliResponse<unknown> {
  const sessionValue = requiredFlag(parsed, 'session');
  if (typeof sessionValue !== 'string') return sessionValue;
  const operationDigest = requiredFlag(parsed, 'operation-digest');
  if (typeof operationDigest !== 'string') return operationDigest;
  const action = requiredFlag(parsed, 'action');
  if (typeof action !== 'string') return action;
  if (!DIGEST_PATTERN.test(operationDigest)) {
    return commandError(`${INTELLIGENCE_COMMAND} recover`, {
      code: 'invalid_option',
      message: '--operation-digest must be a sha256 digest.',
      path: '--operation-digest',
    });
  }
  if (action !== 'resume' && action !== 'discard') {
    return commandError(`${INTELLIGENCE_COMMAND} recover`, {
      code: 'invalid_option',
      message: '--action must be resume or discard.',
      path: '--action',
    });
  }
  let session: AssetAuthoringSession;
  try {
    session = createAssetAuthoringSessionStore(workspace).read(sessionValue);
  } catch (error) {
    if (error instanceof AssetAuthoringSessionError) {
      return commandError(`${INTELLIGENCE_COMMAND} recover`, {
        code: error.code,
        message: error.message,
        path: '--session',
      });
    }
    return commandError(`${INTELLIGENCE_COMMAND} recover`, {
      code: 'asset_authoring_intelligence_candidate_stale',
      message: 'The D5 session could not be read for recovery.',
      path: '--session',
    });
  }
  const sessionDirectory = path.dirname(assetAuthoringSessionPath(workspace, session.sessionId));
  const operationDirectory = path.join(
    sessionDirectory,
    'provider-candidates',
    operationDigest.slice('sha256:'.length),
  );
  const receiptPath = path.join(
    sessionDirectory,
    'intelligence-receipts',
    `${operationDigest.slice('sha256:'.length)}.json`,
  );
  const pathState = (filePath: string, expected: 'file' | 'directory'): 'missing' | 'present' | 'unsafe' => {
    try {
      const stats = lstatSync(filePath);
      if (stats.isSymbolicLink()) return 'unsafe';
      if (expected === 'file' && !stats.isFile()) return 'unsafe';
      if (expected === 'directory' && !stats.isDirectory()) return 'unsafe';
      return 'present';
    } catch (error) {
      return error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'unsafe';
    }
  };
  const operationState = pathState(operationDirectory, 'directory');
  const receiptState = pathState(receiptPath, 'file');
  if (operationState === 'unsafe' || receiptState === 'unsafe') {
    return commandError(`${INTELLIGENCE_COMMAND} recover`, {
      code: 'asset_authoring_intelligence_protected_path',
      message: 'The exact D5 recovery paths are not safe regular session-owned entries.',
      path: '--operation-digest',
    });
  }
  if (action === 'resume') {
    if (operationState === 'missing' || receiptState === 'missing') {
      return commandOk(`${INTELLIGENCE_COMMAND} recover`, {
        schema: ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
        status: 'needs-user-action',
        sessionId: session.sessionId,
        operationDigest,
        action: 'resume',
        receiptPresent: receiptState === 'present',
        stagedOperationPresent: operationState === 'present',
        refusal: {
          code: 'asset_authoring_intelligence_candidate_stale',
          message: 'The exact D5 staged operation is incomplete and cannot be resumed.',
          nextAction: 'recompute-from-exact-inputs',
        },
        nextActions: ['recompute-from-exact-inputs'],
        sourceMutation: false,
      });
    }
    let receiptValue: unknown;
    let receiptBytes: Buffer;
    try {
      receiptBytes = readFileSync(receiptPath);
      receiptValue = JSON.parse(receiptBytes.toString('utf8')) as unknown;
    } catch {
      return commandError(`${INTELLIGENCE_COMMAND} recover`, {
        code: 'asset_authoring_intelligence_candidate_stale',
        message: 'The exact D5 receipt is invalid and cannot be resumed.',
        path: '--operation-digest',
      });
    }
    const verifiedReceipt = verifyStageReceipt(
      receiptValue,
      workspace,
      session.sessionId,
      operationDigest,
      operationDirectory,
    );
    if (!verifiedReceipt.ok) {
      return commandError(`${INTELLIGENCE_COMMAND} recover`, {
        code: 'asset_authoring_intelligence_candidate_stale',
        message: verifiedReceipt.message,
        path: '--operation-digest',
      });
    }
    return commandOk(`${INTELLIGENCE_COMMAND} recover`, {
      schema: ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
      status: 'staged',
      sessionId: session.sessionId,
      operationDigest,
      action: 'resume',
      receiptDigest: digestValue(receiptBytes),
      candidateCount: verifiedReceipt.candidateCount,
      nextActions: ['re-import-candidate'],
      sourceMutation: false,
    });
  }
  if (!flagBoolean(parsed.flags, 'confirm')) {
    return commandOk(`${INTELLIGENCE_COMMAND} recover`, {
      schema: ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
      status: 'needs-user-action',
      sessionId: session.sessionId,
      operationDigest,
      action: 'discard',
      refusal: {
        code: 'asset_authoring_intelligence_consent_required',
        message: 'Explicit --confirm is required before discarding this exact D5 staging operation.',
        nextAction: 'resume-session',
      },
      nextActions: ['resume-session'],
      sourceMutation: false,
    });
  }
  try {
    if (operationState === 'present') rmSync(operationDirectory, { recursive: true, force: false });
    if (receiptState === 'present') rmSync(receiptPath, { force: false });
  } catch {
    return commandError(`${INTELLIGENCE_COMMAND} recover`, {
      code: 'asset_authoring_intelligence_candidate_stale',
      message: 'The exact D5 staging operation could not be discarded safely.',
      path: '--operation-digest',
    });
  }
  return commandOk(`${INTELLIGENCE_COMMAND} recover`, {
    schema: ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
    status: 'discarded',
    sessionId: session.sessionId,
    operationDigest,
    action: 'discard',
    nextActions: ['resume-session'],
    sourceMutation: false,
  });
}

export async function runAssetAuthoringIntelligenceCommand(
  options: {
    readonly parsed: ParsedArgs;
    readonly cwd: string;
    readonly workspace?: AssetWorkspace;
  },
): Promise<CliResponse<unknown>> {
  const { parsed, cwd } = options;
  if (parsed.command[3] === 'route') return runRoute(parsed, cwd);
  if (parsed.command[3] === 'stage') {
    if (options.workspace === undefined) {
      return commandError(`${INTELLIGENCE_COMMAND} stage`, {
        code: 'asset_workspace_not_found',
        message: 'An asset workspace is required for D5 staging.',
        path: '--workspace',
      });
    }
    return runStage(parsed, cwd, options.workspace);
  }
  if (parsed.command[3] === 'recover') {
    if (options.workspace === undefined) {
      return commandError(`${INTELLIGENCE_COMMAND} recover`, {
        code: 'asset_workspace_not_found',
        message: 'An asset workspace is required for D5 recovery.',
        path: '--workspace',
      });
    }
    return runRecover(parsed, options.workspace);
  }
  return commandError(INTELLIGENCE_COMMAND, {
    code: 'unsupported_command',
    message: `The D5 intelligence command is not implemented: ${parsed.command.join(' ')}.`,
  });
}
