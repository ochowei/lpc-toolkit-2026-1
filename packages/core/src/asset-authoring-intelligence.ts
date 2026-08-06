import type {
  AnimationName,
  Catalog,
  ItemDefinition,
  ItemId,
  TypeName,
} from './types.js';
import { recolorPixels } from './recolor.js';

export const ASSET_AUTHORING_INTELLIGENCE_REQUEST_SCHEMA =
  'lpc-toolkit.asset-authoring-intelligence-request.v1' as const;
export const ASSET_AUTHORING_INTELLIGENCE_ROUTE_SCHEMA =
  'lpc-toolkit.asset-authoring-intelligence-route.v1' as const;
export const ASSET_AUTHORING_INTELLIGENCE_OPERATION_PLAN_SCHEMA =
  'lpc-toolkit.asset-authoring-operation-plan.v1' as const;
export const ASSET_AUTHORING_INTELLIGENCE_CANDIDATE_OPERATION_SCHEMA =
  'lpc-toolkit.asset-authoring-candidate-operation.v1' as const;
export const ASSET_AUTHORING_INTELLIGENCE_CANDIDATE_SET_SCHEMA =
  'lpc-toolkit.asset-authoring-candidate-set.v1' as const;
export const ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-intelligence-receipt.v1' as const;
export const ASSET_AUTHORING_INTELLIGENCE_CATALOG_SNAPSHOT_SCHEMA =
  'lpc-toolkit.asset-authoring-intelligence-catalog-snapshot.v1' as const;
export const SPRITE_DRAWING_CONTRACT_V2_SCHEMA =
  'lpc-toolkit.sprite-drawing-contract.v2' as const;

export const ASSET_AUTHORING_INTELLIGENCE_CAPABILITIES = [
  'asset-authoring-intelligence-routing.v1',
  'asset-authoring-deterministic-operations.v1',
  'asset-authoring-custom-geometry.v1',
  'asset-authoring-multi-layer-candidates.v1',
] as const;

export const ASSET_AUTHORING_INTELLIGENCE_SCHEMA_VERSIONS = [
  ASSET_AUTHORING_INTELLIGENCE_REQUEST_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_ROUTE_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_OPERATION_PLAN_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_CANDIDATE_OPERATION_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_CANDIDATE_SET_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
  SPRITE_DRAWING_CONTRACT_V2_SCHEMA,
] as const;

export const ASSET_AUTHORING_INTELLIGENCE_LIMITS = {
  requestBytes: 4096,
  candidates: 32,
  inputDigests: 64,
  outputTargets: 64,
  layers: 32,
  layerEdges: 96,
  graphDepth: 32,
  paletteEntries: 64,
  canvasWidth: 4096,
  canvasHeight: 4096,
  cells: 4096,
} as const;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PORTABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const RECOVERABLE_PATH_PATTERN = /^[a-z][a-z0-9-]*$/u;

export type AuthoringIntelligenceRouteOutcome =
  | 'compose-existing'
  | 'extend-existing'
  | 'derive-variant'
  | 'derive-recolor'
  | 'custom-geometry'
  | 'multi-layer'
  | 'needs-user-action'
  | 'refused';

export type AuthoringIntelligenceOperationKind = Exclude<
  AuthoringIntelligenceRouteOutcome,
  'needs-user-action' | 'refused'
>;

export type AuthoringIntelligenceCandidateOperationKind =
  | 'derive-variant'
  | 'derive-recolor'
  | 'custom-geometry'
  | 'multi-layer';

export type AuthoringIntelligenceRefusalCode =
  | 'asset_authoring_intelligence_request_ambiguous'
  | 'asset_authoring_intelligence_catalog_stale'
  | 'asset_authoring_intelligence_capability_unsupported'
  | 'asset_authoring_intelligence_operation_invalid'
  | 'asset_authoring_intelligence_input_drift'
  | 'asset_authoring_intelligence_contract_stale'
  | 'asset_authoring_intelligence_geometry_unsupported'
  | 'asset_authoring_intelligence_layer_conflict'
  | 'asset_authoring_intelligence_attribution_incomplete'
  | 'asset_authoring_intelligence_consent_required'
  | 'asset_authoring_intelligence_candidate_stale'
  | 'asset_authoring_intelligence_resource_limit'
  | 'asset_authoring_intelligence_protected_path';

export type AuthoringIntelligenceRecoveryAction =
  | 'review-route'
  | 'refresh-catalog'
  | 'refresh-contract'
  | 'recompute-from-exact-inputs'
  | 'provide-explicit-geometry'
  | 'resolve-layer-scope'
  | 'confirm-attribution'
  | 're-import-candidate'
  | 'discard-staged-candidate'
  | 'resume-session';

export interface AuthoringIntelligenceSessionScope {
  readonly sessionId?: string;
  readonly packId?: string;
  readonly assetId?: ItemId;
  readonly targetIds?: readonly string[];
}

export interface AuthoringIntelligenceExplicitHints {
  readonly assetId?: ItemId;
  readonly typeName?: TypeName;
  readonly variant?: string;
  readonly paletteName?: string;
  readonly layerIds?: readonly string[];
  readonly geometryContract?: SpriteDrawingContractV2;
  readonly targetBodyTypes?: readonly string[];
  readonly targetAnimations?: readonly AnimationName[];
}

export interface AuthoringIntelligenceRequestInput {
  readonly requestText: string;
  readonly requestDigest: string;
  readonly catalogSnapshotDigest: string;
  readonly sessionScope?: AuthoringIntelligenceSessionScope;
  readonly explicitHints?: AuthoringIntelligenceExplicitHints;
}

export interface AuthoringIntelligenceRequest {
  readonly schema: typeof ASSET_AUTHORING_INTELLIGENCE_REQUEST_SCHEMA;
  /** The normalized request is retained only for routing; receipts project it out. */
  readonly requestText: string;
  readonly requestDigest: string;
  readonly catalogSnapshotDigest: string;
  readonly sessionScope: AuthoringIntelligenceSessionScope | null;
  readonly explicitHints: AuthoringIntelligenceExplicitHints | null;
}

export interface AuthoringIntelligenceCatalogCandidate {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
  readonly displayName: string;
  readonly animations: readonly AnimationName[];
  readonly variants: readonly string[];
  readonly recolorMaterials: readonly string[];
  readonly hasAttribution: boolean;
  readonly licenses: readonly string[];
}

export interface AuthoringIntelligenceCatalogSnapshotItem {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
  readonly displayName: string;
  readonly animations: readonly AnimationName[];
  readonly variants: readonly string[];
  readonly recolorMaterials: readonly string[];
  readonly hasAttribution: boolean;
  readonly licenses: readonly string[];
}

export interface AuthoringIntelligenceCatalogSnapshot {
  readonly schema: typeof ASSET_AUTHORING_INTELLIGENCE_CATALOG_SNAPSHOT_SCHEMA;
  readonly items: readonly AuthoringIntelligenceCatalogSnapshotItem[];
}

export interface AuthoringIntelligenceParseDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type AuthoringIntelligenceParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly AuthoringIntelligenceParseDiagnostic[] };

export interface AuthoringIntelligenceNormalizedIntent {
  readonly summary: string;
  readonly tokens: readonly string[];
  readonly operation: AuthoringIntelligenceRouteOutcome | null;
  readonly assetId: ItemId | null;
  readonly typeName: TypeName | null;
  readonly variant: string | null;
  readonly paletteName: string | null;
  readonly layerIds: readonly string[];
}

export interface AuthoringIntelligenceRefusal {
  readonly code: AuthoringIntelligenceRefusalCode;
  readonly message: string;
  readonly nextAction: AuthoringIntelligenceRecoveryAction;
}

export interface AuthoringIntelligenceRoute {
  readonly schema: typeof ASSET_AUTHORING_INTELLIGENCE_ROUTE_SCHEMA;
  readonly requestDigest: string;
  readonly catalogSnapshotDigest: string;
  readonly normalizedIntent: AuthoringIntelligenceNormalizedIntent;
  readonly candidates: readonly AuthoringIntelligenceCatalogCandidate[];
  readonly similarCandidates: readonly AuthoringIntelligenceCatalogCandidate[];
  readonly outcome: AuthoringIntelligenceRouteOutcome;
  readonly operationKind: AuthoringIntelligenceOperationKind | null;
  readonly requiredCapabilities: readonly string[];
  readonly missingCapabilities: readonly string[];
  readonly refusal: AuthoringIntelligenceRefusal | null;
  readonly nextActions: readonly AuthoringIntelligenceRecoveryAction[];
}

export interface AuthoringIntelligenceRouteInput {
  readonly request: AuthoringIntelligenceRequest;
  readonly catalog: Catalog | AuthoringIntelligenceCatalogSnapshot;
  readonly availableCapabilities?: readonly string[];
}

export type SpriteDrawingContractV2CellPolicy =
  | 'required-drawn'
  | 'optional-transparent'
  | 'required-transparent'
  | 'unchanged';

export interface SpriteDrawingContractV2Cell {
  readonly id: string;
  readonly row: number;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly policy: SpriteDrawingContractV2CellPolicy;
  readonly baselineDigest?: string;
}

export interface SpriteDrawingContractV2Target {
  readonly id: string;
  readonly path: string;
  readonly animation: AnimationName;
  readonly bodyTypes: readonly string[];
  readonly layerId: string;
  readonly cellIds: readonly string[];
  readonly inputDigests: readonly string[];
}

export interface SpriteDrawingContractV2Layer {
  readonly id: string;
  readonly zPos: number;
  readonly targetIds: readonly string[];
  readonly dependencies: readonly string[];
}

export interface SpriteDrawingContractV2 {
  readonly schema: typeof SPRITE_DRAWING_CONTRACT_V2_SCHEMA;
  readonly goal: 'new-item' | 'extend-item';
  readonly pack: {
    readonly id: string;
    readonly version: string;
  };
  readonly assetId: ItemId;
  readonly typeName: TypeName;
  readonly transparency: {
    readonly encoding: 'png';
    readonly colorModel: 'rgba';
    readonly background: 'transparent';
  };
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly frame: {
    readonly width: number;
    readonly height: number;
    readonly count: number;
  };
  readonly cells: readonly SpriteDrawingContractV2Cell[];
  readonly targets: readonly SpriteDrawingContractV2Target[];
  readonly layers: readonly SpriteDrawingContractV2Layer[];
}

export interface AuthoringIntelligenceOperationDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface AuthoringIntelligenceVariantParameters {
  readonly kind: 'derive-variant';
  readonly sourceAssetIdentity: ItemId;
  readonly variant: string;
}

export interface AuthoringIntelligenceRecolorParameters {
  readonly kind: 'derive-recolor';
  readonly material: string;
  readonly sourceRamp: readonly string[];
  readonly targetRamp: readonly string[];
}

export interface AuthoringIntelligenceCustomGeometryParameters {
  readonly kind: 'custom-geometry';
  readonly contract: SpriteDrawingContractV2;
}

export interface AuthoringIntelligenceLayerOperation {
  readonly id: string;
  readonly targetIdentity: string;
  readonly zPos: number;
  readonly contractDigest: string;
  readonly inputDigest: string;
  readonly dependencies: readonly string[];
}

export interface AuthoringIntelligenceMultiLayerParameters {
  readonly kind: 'multi-layer';
  readonly layers: readonly AuthoringIntelligenceLayerOperation[];
}

export type AuthoringIntelligenceOperationParameters =
  | AuthoringIntelligenceVariantParameters
  | AuthoringIntelligenceRecolorParameters
  | AuthoringIntelligenceCustomGeometryParameters
  | AuthoringIntelligenceMultiLayerParameters;

export interface AuthoringIntelligenceOperationPlan {
  readonly schema: typeof ASSET_AUTHORING_INTELLIGENCE_OPERATION_PLAN_SCHEMA;
  readonly operationId: string;
  readonly operationKind: AuthoringIntelligenceCandidateOperationKind;
  readonly inputAssetIdentities: readonly string[];
  readonly inputCandidateDigests: readonly string[];
  readonly contractDigests: readonly string[];
  readonly catalogSnapshotDigest: string;
  readonly normalizedParameters: AuthoringIntelligenceOperationParameters;
  readonly outputTargetIdentities: readonly string[];
  readonly operationDigest: string;
}

export interface AuthoringIntelligenceOperationPlanInput {
  readonly operationId: string;
  readonly operationKind: AuthoringIntelligenceCandidateOperationKind;
  readonly inputAssetIdentities: readonly string[];
  readonly inputCandidateDigests: readonly string[];
  readonly contractDigests: readonly string[];
  readonly catalogSnapshotDigest: string;
  readonly normalizedParameters: AuthoringIntelligenceOperationParameters;
  readonly outputTargetIdentities: readonly string[];
  readonly operationDigest: string;
}

export interface AuthoringIntelligenceDigestProjection {
  readonly schema: string;
  readonly value: string;
}

export function isAuthoringIntelligenceDigest(value: string): boolean {
  return DIGEST_PATTERN.test(value);
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

export function normalizeAuthoringIntelligenceRequestText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function authoringIntelligenceRequestDigestInput(requestText: string): string {
  return normalizeAuthoringIntelligenceRequestText(requestText);
}

export function createAuthoringIntelligenceRequest(
  input: AuthoringIntelligenceRequestInput,
): AuthoringIntelligenceRequest {
  const requestText = normalizeAuthoringIntelligenceRequestText(input.requestText);
  if (requestText.length === 0) throw new Error('Authoring-intelligence request text must not be empty.');
  if (utf8ByteLength(requestText) > ASSET_AUTHORING_INTELLIGENCE_LIMITS.requestBytes) {
    throw new Error('Authoring-intelligence request exceeds the bounded UTF-8 size.');
  }
  if (!isAuthoringIntelligenceDigest(input.requestDigest)) {
    throw new Error('Authoring-intelligence request digest must be a sha256 digest.');
  }
  if (!isAuthoringIntelligenceDigest(input.catalogSnapshotDigest)) {
    throw new Error('Authoring-intelligence catalog snapshot digest must be a sha256 digest.');
  }
  return {
    schema: ASSET_AUTHORING_INTELLIGENCE_REQUEST_SCHEMA,
    requestText,
    requestDigest: input.requestDigest,
    catalogSnapshotDigest: input.catalogSnapshotDigest,
    sessionScope: input.sessionScope ?? null,
    explicitHints: input.explicitHints ?? null,
  };
}

type CatalogScore = {
  readonly candidate: AuthoringIntelligenceCatalogCandidate;
  readonly score: number;
};

function itemIdFor(item: ItemDefinition): ItemId {
  return item.itemId ?? `${item.type_name}/${item.name.replaceAll(' ', '_')}`;
}

function recolorMaterialsFor(item: ItemDefinition): readonly string[] {
  const recolors = item.recolors;
  if (recolors === undefined) return [];
  if ('material' in recolors && typeof recolors.material === 'string') {
    return [recolors.material];
  }
  return Object.values(recolors)
    .filter((value): value is { readonly material: string } =>
      typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && 'material' in value
      && typeof value.material === 'string')
    .map((value) => value.material)
    .sort((left, right) => left.localeCompare(right));
}

function candidateFor(item: ItemDefinition): AuthoringIntelligenceCatalogCandidate {
  const itemId = itemIdFor(item);
  const licenses = new Set<string>();
  for (const credit of item.credits) {
    for (const license of credit.licenses) licenses.add(license);
  }
  return {
    itemId,
    typeName: item.type_name,
    name: item.name,
    displayName: item.display_name ?? item.name,
    animations: [...item.animations].sort((left, right) => left.localeCompare(right)),
    variants: [...(item.variants ?? [])].sort((left, right) => left.localeCompare(right)),
    recolorMaterials: recolorMaterialsFor(item),
    hasAttribution: item.credits.length > 0,
    licenses: [...licenses].sort((left, right) => left.localeCompare(right)),
  };
}

function searchableWords(value: string): readonly string[] {
  return normalizeAuthoringIntelligenceRequestText(value)
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

function scoreCandidate(
  candidate: AuthoringIntelligenceCatalogCandidate,
  normalizedText: string,
  requestTokens: readonly string[],
  hints: AuthoringIntelligenceExplicitHints | null,
): number {
  const itemId = candidate.itemId;
  if (hints?.assetId !== undefined && hints.assetId === itemId) return 1000;
  const idWords = searchableWords(itemId.replace('/', ' '));
  const nameWords = searchableWords(candidate.name);
  const displayWords = searchableWords(candidate.displayName);
  const typeWords = searchableWords(candidate.typeName);
  const fullId = itemId.replace('/', ' ').toLocaleLowerCase();
  if (normalizedText.includes(fullId)) return 900;
  const nameText = nameWords.join(' ');
  if (nameText.length > 0 && normalizedText.includes(nameText)) return 800;
  const searchable = new Set([...idWords, ...nameWords, ...displayWords]);
  const overlap = requestTokens.filter((token) => searchable.has(token)).length;
  const typeMatch = typeWords.some((word) => requestTokens.includes(word));
  return overlap === 0 ? 0 : overlap * 20 + (typeMatch ? 30 : 0);
}

function classifyOperation(
  normalizedText: string,
  hints: AuthoringIntelligenceExplicitHints | null,
): AuthoringIntelligenceRouteOutcome | null {
  if (hints?.layerIds !== undefined && hints.layerIds.length > 1) return 'multi-layer';
  if (hints?.variant !== undefined) return 'derive-variant';
  if (hints?.paletteName !== undefined) return 'derive-recolor';
  if (/(?:multi[ -]?layer|layered|outfit)/u.test(normalizedText)) return 'multi-layer';
  if (/(?:custom|geometry|canvas|frame\s*size)/u.test(normalizedText)) return 'custom-geometry';
  if (/(?:recolor|recolour|palette|colour|color)/u.test(normalizedText)) return 'derive-recolor';
  if (/(?:variant|alternate|alternative|long|short)/u.test(normalizedText)) return 'derive-variant';
  if (/(?:extend|repair|missing animation|add animation)/u.test(normalizedText)) return 'extend-existing';
  return 'compose-existing';
}

function requiredCapabilitiesFor(
  operation: AuthoringIntelligenceRouteOutcome,
): readonly string[] {
  switch (operation) {
    case 'derive-variant':
      return ['asset-authoring-deterministic-operations.v1'];
    case 'derive-recolor':
      return ['asset-authoring-deterministic-operations.v1'];
    case 'custom-geometry':
      return ['asset-authoring-deterministic-operations.v1', 'asset-authoring-custom-geometry.v1'];
    case 'multi-layer':
      return ['asset-authoring-deterministic-operations.v1', 'asset-authoring-multi-layer-candidates.v1'];
    case 'compose-existing':
    case 'extend-existing':
      return ['asset-authoring-intelligence-routing.v1'];
    case 'needs-user-action':
    case 'refused':
      return [];
  }
}

function refusalFor(
  code: AuthoringIntelligenceRefusalCode,
  nextAction: AuthoringIntelligenceRecoveryAction,
): AuthoringIntelligenceRefusal {
  const messages: Readonly<Record<AuthoringIntelligenceRefusalCode, string>> = {
    asset_authoring_intelligence_request_ambiguous: 'The request does not identify one safe catalog route.',
    asset_authoring_intelligence_catalog_stale: 'The catalog snapshot is stale for this authoring route.',
    asset_authoring_intelligence_capability_unsupported: 'The requested authoring capability is not available.',
    asset_authoring_intelligence_operation_invalid: 'The requested authoring operation is invalid.',
    asset_authoring_intelligence_input_drift: 'An operation input changed after the route was created.',
    asset_authoring_intelligence_contract_stale: 'The drawing contract is stale for this operation.',
    asset_authoring_intelligence_geometry_unsupported: 'Custom geometry requires an explicit supported geometry contract.',
    asset_authoring_intelligence_layer_conflict: 'The layer scope or ordering is unresolved.',
    asset_authoring_intelligence_attribution_incomplete: 'Attribution evidence is incomplete for this candidate.',
    asset_authoring_intelligence_consent_required: 'Explicit authoring-plan consent is required before staging.',
    asset_authoring_intelligence_candidate_stale: 'The staged candidate is stale or no longer matches its operation.',
    asset_authoring_intelligence_resource_limit: 'The operation exceeds a fixed authoring resource limit.',
    asset_authoring_intelligence_protected_path: 'The requested path is protected and cannot be staged.',
  };
  return { code, message: messages[code], nextAction };
}

function sortCandidates(scores: readonly CatalogScore[]): readonly CatalogScore[] {
  return [...scores].sort((left, right) =>
    right.score - left.score || left.candidate.itemId.localeCompare(right.candidate.itemId));
}

export function routeAuthoringIntelligence(
  input: AuthoringIntelligenceRouteInput,
): AuthoringIntelligenceRoute {
  const requestText = input.request.requestText.toLocaleLowerCase();
  const requestTokens = searchableWords(requestText);
  const hints = input.request.explicitHints;
  const catalogCandidates = 'schema' in input.catalog
    ? input.catalog.items
    : [...input.catalog.byItemId.values()].map(candidateFor);
  const scores = catalogCandidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(candidate, requestText, requestTokens, hints),
  }));
  const ranked = sortCandidates(scores);
  const exact = ranked.filter(({ score }) => score >= 70);
  const candidates = exact.slice(0, ASSET_AUTHORING_INTELLIGENCE_LIMITS.candidates)
    .map(({ candidate }) => candidate);
  const similarCandidates = ranked
    .filter(({ score }) => score > 0 && score < 70)
    .slice(0, ASSET_AUTHORING_INTELLIGENCE_LIMITS.candidates)
    .map(({ candidate }) => candidate);
  const classification = classifyOperation(requestText, hints);
  const assetId = hints?.assetId ?? (candidates.length === 1 ? candidates[0]?.itemId : undefined);
  const typeName = hints?.typeName ?? (candidates.length === 1 ? candidates[0]?.typeName : undefined);
  const normalizedIntent: AuthoringIntelligenceNormalizedIntent = {
    summary: classification === null ? 'unclassified request' : classification,
    tokens: [...new Set(requestTokens)].sort((left, right) => left.localeCompare(right)),
    operation: classification,
    assetId: assetId ?? null,
    typeName: typeName ?? null,
    variant: hints?.variant ?? null,
    paletteName: hints?.paletteName ?? null,
    layerIds: [...(hints?.layerIds ?? [])].sort((left, right) => left.localeCompare(right)),
  };

  let outcome: AuthoringIntelligenceRouteOutcome = classification ?? 'needs-user-action';
  let refusal: AuthoringIntelligenceRefusal | null = null;
  let nextActions: readonly AuthoringIntelligenceRecoveryAction[] = [];
  if (candidates.length !== 1) {
    outcome = 'needs-user-action';
    refusal = refusalFor(
      'asset_authoring_intelligence_request_ambiguous',
      candidates.length === 0 ? 'refresh-catalog' : 'review-route',
    );
    nextActions = [refusal.nextAction];
  } else if (classification === 'derive-variant') {
    const candidate = candidates[0]!;
    const variant = hints?.variant ?? candidate.variants.find((value) => requestText.includes(value.toLocaleLowerCase()));
    if (variant === undefined || !candidate.variants.includes(variant)) {
      outcome = 'needs-user-action';
      refusal = refusalFor('asset_authoring_intelligence_operation_invalid', 'review-route');
      nextActions = [refusal.nextAction];
    }
  } else if (classification === 'derive-recolor') {
    const candidate = candidates[0]!;
    if (candidate.recolorMaterials.length === 0 && hints?.paletteName === undefined) {
      outcome = 'needs-user-action';
      refusal = refusalFor('asset_authoring_intelligence_operation_invalid', 'review-route');
      nextActions = [refusal.nextAction];
    }
  } else if (classification === 'custom-geometry' && hints?.geometryContract === undefined) {
    outcome = 'needs-user-action';
    refusal = refusalFor('asset_authoring_intelligence_geometry_unsupported', 'provide-explicit-geometry');
    nextActions = [refusal.nextAction];
  } else if (classification === 'multi-layer' && (hints?.layerIds?.length ?? 0) < 2) {
    outcome = 'needs-user-action';
    refusal = refusalFor('asset_authoring_intelligence_layer_conflict', 'resolve-layer-scope');
    nextActions = [refusal.nextAction];
  }

  const requiredCapabilities = requiredCapabilitiesFor(outcome);
  const availableCapabilities = input.availableCapabilities === undefined
    ? new Set<string>(requiredCapabilities)
    : new Set(input.availableCapabilities);
  const missingCapabilities = requiredCapabilities
    .filter((capability) => !availableCapabilities.has(capability))
    .sort((left, right) => left.localeCompare(right));
  if (missingCapabilities.length > 0) {
    outcome = 'needs-user-action';
    refusal = refusalFor('asset_authoring_intelligence_capability_unsupported', 'review-route');
    nextActions = [refusal.nextAction];
  }
  return {
    schema: ASSET_AUTHORING_INTELLIGENCE_ROUTE_SCHEMA,
    requestDigest: input.request.requestDigest,
    catalogSnapshotDigest: input.request.catalogSnapshotDigest,
    normalizedIntent,
    candidates,
    similarCandidates,
    outcome,
    operationKind: outcome === 'needs-user-action' || outcome === 'refused' ? null : outcome,
    requiredCapabilities,
    missingCapabilities,
    refusal,
    nextActions,
  };
}

export function authoringIntelligenceRouteProjection(
  route: AuthoringIntelligenceRoute,
): unknown {
  return {
    schema: route.schema,
    requestDigest: route.requestDigest,
    catalogSnapshotDigest: route.catalogSnapshotDigest,
    normalizedIntent: route.normalizedIntent,
    candidates: route.candidates,
    similarCandidates: route.similarCandidates,
    outcome: route.outcome,
    operationKind: route.operationKind,
    requiredCapabilities: route.requiredCapabilities,
    missingCapabilities: route.missingCapabilities,
    refusal: route.refusal,
    nextActions: route.nextActions,
  };
}

function parseRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function parseStringArray(
  value: unknown,
  path: string,
  diagnostics: AuthoringIntelligenceParseDiagnostic[],
  allowEmpty = false,
): readonly string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every((entry): entry is string => typeof entry === 'string' && entry.length > 0)) {
    diagnostics.push({ code: 'asset_authoring_intelligence_operation_invalid', message: `${path} must be a${allowEmpty ? '' : ' non-empty'} string array.`, path });
    return undefined;
  }
  return [...new Set(value)].sort((left, right) => left.localeCompare(right));
}

export function parseAuthoringIntelligenceCatalogSnapshot(
  input: unknown,
): AuthoringIntelligenceParseResult<AuthoringIntelligenceCatalogSnapshot> {
  const diagnostics: AuthoringIntelligenceParseDiagnostic[] = [];
  const record = parseRecord(input);
  if (record === null) {
    return {
      ok: false,
      diagnostics: [{ code: 'asset_authoring_intelligence_operation_invalid', message: 'Catalog snapshot must be an object.', path: '$' }],
    };
  }
  if (record.schema !== ASSET_AUTHORING_INTELLIGENCE_CATALOG_SNAPSHOT_SCHEMA) {
    diagnostics.push({ code: 'asset_authoring_intelligence_operation_invalid', message: 'Unsupported catalog snapshot schema.', path: '$.schema' });
  }
  if (!Array.isArray(record.items)) {
    diagnostics.push({ code: 'asset_authoring_intelligence_operation_invalid', message: 'Catalog snapshot items must be an array.', path: '$.items' });
  }
  const items: AuthoringIntelligenceCatalogSnapshotItem[] = [];
  if (Array.isArray(record.items)) {
    if (record.items.length > ASSET_AUTHORING_INTELLIGENCE_LIMITS.candidates) {
      diagnostics.push({ code: 'asset_authoring_intelligence_resource_limit', message: 'Catalog snapshot item count exceeds the D5 limit.', path: '$.items' });
    }
    record.items.forEach((entry, index) => {
      const itemPath = `$.items[${String(index)}]`;
      const item = parseRecord(entry);
      if (item === null) {
        diagnostics.push({ code: 'asset_authoring_intelligence_operation_invalid', message: 'Catalog snapshot item must be an object.', path: itemPath });
        return;
      }
      const readString = (key: string): string | undefined => {
        const value = item[key];
        if (typeof value !== 'string' || value.length === 0) {
          diagnostics.push({ code: 'asset_authoring_intelligence_operation_invalid', message: `${itemPath}.${key} must be a non-empty string.`, path: `${itemPath}.${key}` });
          return undefined;
        }
        return value;
      };
      const itemId = readString('itemId');
      const typeName = readString('typeName');
      const name = readString('name');
      const displayName = readString('displayName');
      const animations = parseStringArray(item.animations, `${itemPath}.animations`, diagnostics);
      const variants = item.variants === undefined ? [] : parseStringArray(item.variants, `${itemPath}.variants`, diagnostics, true);
      const recolorMaterials = item.recolorMaterials === undefined ? [] : parseStringArray(item.recolorMaterials, `${itemPath}.recolorMaterials`, diagnostics, true);
      const licenses = item.licenses === undefined ? [] : parseStringArray(item.licenses, `${itemPath}.licenses`, diagnostics, true);
      if (typeof item.hasAttribution !== 'boolean') {
        diagnostics.push({ code: 'asset_authoring_intelligence_attribution_incomplete', message: `${itemPath}.hasAttribution must be boolean.`, path: `${itemPath}.hasAttribution` });
      }
      if (itemId && typeName && name && displayName && animations && variants && recolorMaterials && licenses && typeof item.hasAttribution === 'boolean') {
        items.push({
          itemId,
          typeName,
          name,
          displayName,
          animations,
          variants,
          recolorMaterials,
          hasAttribution: item.hasAttribution,
          licenses,
        });
      }
    });
  }
  const itemIds = items.map((item) => item.itemId);
  if (hasDuplicate(itemIds)) diagnostics.push({ code: 'asset_authoring_intelligence_operation_invalid', message: 'Catalog snapshot item IDs must be unique.', path: '$.items' });
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      schema: ASSET_AUTHORING_INTELLIGENCE_CATALOG_SNAPSHOT_SCHEMA,
      items: items.sort((left, right) => left.itemId.localeCompare(right.itemId)),
    },
  };
}

export function isPortableAuthoringIntelligenceId(value: string): boolean {
  return PORTABLE_ID_PATTERN.test(value)
    && !value.split('/').some((segment) => segment === '..');
}

export function isAuthoringIntelligenceRecoveryAction(value: string): value is AuthoringIntelligenceRecoveryAction {
  return RECOVERABLE_PATH_PATTERN.test(value)
    && [
      'review-route',
      'refresh-catalog',
      'refresh-contract',
      'recompute-from-exact-inputs',
      'provide-explicit-geometry',
      'resolve-layer-scope',
      'confirm-attribution',
      're-import-candidate',
      'discard-staged-candidate',
      'resume-session',
    ].includes(value as AuthoringIntelligenceRecoveryAction);
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalProjection(value: unknown): CanonicalValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical projections require finite numbers.');
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalProjection(entry));
  }
  if (typeof value === 'object') {
    const result: { [key: string]: CanonicalValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      result[key] = canonicalProjection(entry);
    }
    return Object.fromEntries(
      Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  throw new Error('Canonical projections do not support functions or symbols.');
}

function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(canonicalProjection(value));
  if (encoded === undefined) throw new Error('Unable to encode canonical projection.');
  return encoded;
}

function isHexColor(value: string): boolean {
  return /^#?[0-9a-f]{6}$/iu.test(value);
}

function isStableOrder(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]!.localeCompare(value) <= 0);
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function addDiagnostic(
  diagnostics: AuthoringIntelligenceOperationDiagnostic[],
  code: string,
  message: string,
  path?: string,
): void {
  diagnostics.push({
    code,
    message,
    ...(path === undefined ? {} : { path }),
  });
}

function integerWithin(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function cellsOverlap(
  left: SpriteDrawingContractV2Cell,
  right: SpriteDrawingContractV2Cell,
): boolean {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height;
}

function validateLayerGraph(
  layers: readonly { readonly id: string; readonly dependencies: readonly string[] }[],
  diagnostics: AuthoringIntelligenceOperationDiagnostic[],
): void {
  const layerIds = layers.map((layer) => layer.id);
  const layerIdSet = new Set(layerIds);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (depth > ASSET_AUTHORING_INTELLIGENCE_LIMITS.graphDepth) {
      addDiagnostic(
        diagnostics,
        'asset_authoring_intelligence_resource_limit',
        'Layer dependency depth exceeds the fixed D5 limit.',
        'layers',
      );
      return;
    }
    if (visiting.has(id)) {
      addDiagnostic(
        diagnostics,
        'asset_authoring_intelligence_layer_conflict',
        `Layer dependency cycle includes ${id}.`,
        'layers',
      );
      return;
    }
    if (visited.has(id)) return;
    const layer = layers.find((candidate) => candidate.id === id);
    if (layer === undefined) return;
    visiting.add(id);
    for (const dependency of layer.dependencies) walk(dependency, depth + 1);
    visiting.delete(id);
    visited.add(id);
  };
  for (const layer of layers) {
    for (const dependency of layer.dependencies) {
      if (!layerIdSet.has(dependency)) {
        addDiagnostic(
          diagnostics,
          'asset_authoring_intelligence_layer_conflict',
          `Layer dependency ${dependency} is not declared.`,
          'layers',
        );
      }
    }
    walk(layer.id, 0);
  }
}

export function validateSpriteDrawingContractV2(
  contract: SpriteDrawingContractV2,
): readonly AuthoringIntelligenceOperationDiagnostic[] {
  const diagnostics: AuthoringIntelligenceOperationDiagnostic[] = [];
  if (contract.schema !== SPRITE_DRAWING_CONTRACT_V2_SCHEMA) {
    addDiagnostic(
      diagnostics,
      'asset_authoring_intelligence_geometry_unsupported',
      'Only the reviewed sprite-drawing-contract.v2 schema is accepted.',
      'schema',
    );
  }
  if (contract.goal !== 'new-item' && contract.goal !== 'extend-item') {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'The v2 contract goal is unsupported.', 'goal');
  }
  if (!isPortableAuthoringIntelligenceId(contract.pack.id) || contract.pack.version.length === 0) {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'The v2 pack identity is invalid.', 'pack');
  }
  if (!isPortableAuthoringIntelligenceId(contract.assetId) || !isPortableAuthoringIntelligenceId(contract.typeName)) {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'The v2 asset identity is invalid.', 'assetId');
  }
  if (
    contract.transparency.encoding !== 'png'
    || contract.transparency.colorModel !== 'rgba'
    || contract.transparency.background !== 'transparent'
  ) {
    addDiagnostic(
      diagnostics,
      'asset_authoring_intelligence_geometry_unsupported',
      'D5 custom geometry requires transparent RGBA PNG output.',
      'transparency',
    );
  }
  if (!integerWithin(contract.canvas.width, 1, ASSET_AUTHORING_INTELLIGENCE_LIMITS.canvasWidth)) {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', 'Canvas width exceeds the D5 limit.', 'canvas.width');
  }
  if (!integerWithin(contract.canvas.height, 1, ASSET_AUTHORING_INTELLIGENCE_LIMITS.canvasHeight)) {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', 'Canvas height exceeds the D5 limit.', 'canvas.height');
  }
  if (
    !integerWithin(contract.frame.width, 1, contract.canvas.width)
    || !integerWithin(contract.frame.height, 1, contract.canvas.height)
    || !integerWithin(contract.frame.count, 1, ASSET_AUTHORING_INTELLIGENCE_LIMITS.cells)
  ) {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_geometry_unsupported', 'Frame geometry is outside the explicit canvas bounds.', 'frame');
  }
  if (contract.cells.length > ASSET_AUTHORING_INTELLIGENCE_LIMITS.cells) {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', 'Cell count exceeds the D5 limit.', 'cells');
  }
  const cellIds = contract.cells.map((cell) => cell.id);
  if (hasDuplicate(cellIds)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Cell IDs must be unique.', 'cells');
  const validPolicies: readonly SpriteDrawingContractV2CellPolicy[] = [
    'required-drawn',
    'optional-transparent',
    'required-transparent',
    'unchanged',
  ];
  for (const cell of contract.cells) {
    if (!isPortableAuthoringIntelligenceId(cell.id)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Cell ID is not portable.', 'cells');
    if (!integerWithin(cell.row, 0, ASSET_AUTHORING_INTELLIGENCE_LIMITS.cells) || !integerWithin(cell.frame, 0, contract.frame.count - 1)) {
      addDiagnostic(diagnostics, 'asset_authoring_intelligence_geometry_unsupported', 'Cell row or frame is outside the explicit frame mapping.', `cells.${cell.id}`);
    }
    if (
      !integerWithin(cell.width, 1, contract.canvas.width)
      || !integerWithin(cell.height, 1, contract.canvas.height)
      || !integerWithin(cell.x, 0, contract.canvas.width - cell.width)
      || !integerWithin(cell.y, 0, contract.canvas.height - cell.height)
    ) {
      addDiagnostic(diagnostics, 'asset_authoring_intelligence_geometry_unsupported', 'Cell rectangle is outside the explicit canvas.', `cells.${cell.id}`);
    }
    if (!validPolicies.includes(cell.policy)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_geometry_unsupported', 'Cell transparency policy is unsupported.', `cells.${cell.id}.policy`);
    if (cell.baselineDigest !== undefined && !isAuthoringIntelligenceDigest(cell.baselineDigest)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Cell baseline digest is invalid.', `cells.${cell.id}.baselineDigest`);
  }
  for (let leftIndex = 0; leftIndex < contract.cells.length; leftIndex += 1) {
    const left = contract.cells[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < contract.cells.length; rightIndex += 1) {
      const right = contract.cells[rightIndex]!;
      if (cellsOverlap(left, right)) {
        addDiagnostic(diagnostics, 'asset_authoring_intelligence_geometry_unsupported', 'Cell rectangles must not overlap.', 'cells');
        leftIndex = contract.cells.length;
        break;
      }
    }
  }
  const targetIds = contract.targets.map((target) => target.id);
  const layerIds = contract.layers.map((layer) => layer.id);
  if (hasDuplicate(targetIds)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Target IDs must be unique.', 'targets');
  if (hasDuplicate(layerIds)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'Layer IDs must be unique.', 'layers');
  const cellIdSet = new Set(cellIds);
  const layerIdSet = new Set(layerIds);
  for (const target of contract.targets) {
    if (!isPortableAuthoringIntelligenceId(target.id)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Target ID is not portable.', 'targets');
    if (!isPortableAuthoringIntelligenceId(target.path)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_protected_path', 'Target path must be a portable relative path.', `targets.${target.id}.path`);
    if (!layerIdSet.has(target.layerId)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'Target layer is not declared.', `targets.${target.id}.layerId`);
    if (target.bodyTypes.length === 0) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Target body scope must not be empty.', `targets.${target.id}.bodyTypes`);
    for (const cellId of target.cellIds) {
      if (!cellIdSet.has(cellId)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_geometry_unsupported', 'Target references an undeclared cell.', `targets.${target.id}.cellIds`);
    }
    for (const digest of target.inputDigests) {
      if (!isAuthoringIntelligenceDigest(digest)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Target input digest is invalid.', `targets.${target.id}.inputDigests`);
    }
  }
  if (contract.layers.reduce((count, layer) => count + layer.dependencies.length, 0) > ASSET_AUTHORING_INTELLIGENCE_LIMITS.layerEdges) {
    addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', 'Layer edge count exceeds the D5 limit.', 'layers');
  }
  validateLayerGraph(contract.layers, diagnostics);
  const targetOwnership = new Set<string>();
  for (const layer of contract.layers) {
    if (!isPortableAuthoringIntelligenceId(layer.id)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'Layer ID is not portable.', 'layers');
    if (!Number.isInteger(layer.zPos)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'Layer z-position must be an integer.', `layers.${layer.id}.zPos`);
    for (const targetId of layer.targetIds) {
      if (!targetIds.includes(targetId)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'Layer references an undeclared target.', `layers.${layer.id}.targetIds`);
      if (targetOwnership.has(targetId)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'A target may belong to only one layer.', `layers.${layer.id}.targetIds`);
      targetOwnership.add(targetId);
    }
  }
  return diagnostics;
}

export function spriteDrawingContractV2DigestInput(
  contract: SpriteDrawingContractV2,
): string {
  return canonicalJson(contract);
}

function compareLayerOperation(
  left: AuthoringIntelligenceLayerOperation,
  right: AuthoringIntelligenceLayerOperation,
): number {
  return left.zPos - right.zPos || left.id.localeCompare(right.id);
}

function normalizedOperationParameters(
  parameters: AuthoringIntelligenceOperationParameters,
): AuthoringIntelligenceOperationParameters {
  if (parameters.kind !== 'multi-layer') return parameters;
  return {
    ...parameters,
    layers: [...parameters.layers].sort(compareLayerOperation),
  };
}

export function validateAuthoringIntelligenceOperationPlan(
  plan: AuthoringIntelligenceOperationPlan,
): readonly AuthoringIntelligenceOperationDiagnostic[] {
  const diagnostics: AuthoringIntelligenceOperationDiagnostic[] = [];
  if (plan.schema !== ASSET_AUTHORING_INTELLIGENCE_OPERATION_PLAN_SCHEMA) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Unsupported operation-plan schema.', 'schema');
  if (!isPortableAuthoringIntelligenceId(plan.operationId)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Operation ID is not portable.', 'operationId');
  if (!isAuthoringIntelligenceDigest(plan.operationDigest)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Operation digest is invalid.', 'operationDigest');
  if (!isAuthoringIntelligenceDigest(plan.catalogSnapshotDigest)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_catalog_stale', 'Catalog snapshot digest is invalid.', 'catalogSnapshotDigest');
  for (const [label, values] of [
    ['inputCandidateDigests', plan.inputCandidateDigests],
    ['contractDigests', plan.contractDigests],
    ['outputTargetIdentities', plan.outputTargetIdentities],
  ] as const) {
    if (values.length > ASSET_AUTHORING_INTELLIGENCE_LIMITS.outputTargets) addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', `${label} exceeds the D5 limit.`, label);
    if (hasDuplicate(values)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', `${label} must not contain duplicates.`, label);
    if (!isStableOrder(values)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', `${label} must use stable lexical ordering.`, label);
  }
  if (plan.inputAssetIdentities.some((value) => !isPortableAuthoringIntelligenceId(value))) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Input asset identity is not portable.', 'inputAssetIdentities');
  if (plan.inputCandidateDigests.some((value) => !isAuthoringIntelligenceDigest(value))) addDiagnostic(diagnostics, 'asset_authoring_intelligence_input_drift', 'Input candidate digest is invalid.', 'inputCandidateDigests');
  if (plan.contractDigests.some((value) => !isAuthoringIntelligenceDigest(value))) addDiagnostic(diagnostics, 'asset_authoring_intelligence_contract_stale', 'Contract digest is invalid.', 'contractDigests');
  if (plan.outputTargetIdentities.some((value) => !isPortableAuthoringIntelligenceId(value))) addDiagnostic(diagnostics, 'asset_authoring_intelligence_protected_path', 'Output target identity is not portable.', 'outputTargetIdentities');
  if (plan.operationKind !== plan.normalizedParameters.kind) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Operation kind and parameters must agree.', 'normalizedParameters.kind');
  if (plan.normalizedParameters.kind === 'derive-variant') {
    if (!isPortableAuthoringIntelligenceId(plan.normalizedParameters.sourceAssetIdentity) || plan.normalizedParameters.variant.trim().length === 0) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Variant parameters are incomplete.', 'normalizedParameters');
  }
  if (plan.normalizedParameters.kind === 'derive-recolor') {
    const parameters = plan.normalizedParameters;
    if (!isPortableAuthoringIntelligenceId(parameters.material) || parameters.sourceRamp.length === 0 || parameters.sourceRamp.length !== parameters.targetRamp.length) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Recolor ramps must be non-empty and have equal lengths.', 'normalizedParameters');
    if (parameters.sourceRamp.length > ASSET_AUTHORING_INTELLIGENCE_LIMITS.paletteEntries) addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', 'Recolor ramp exceeds the D5 limit.', 'normalizedParameters');
    if (parameters.sourceRamp.some((value) => !isHexColor(value)) || parameters.targetRamp.some((value) => !isHexColor(value))) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Recolor ramps must use six-digit hex colors.', 'normalizedParameters');
  }
  if (plan.normalizedParameters.kind === 'custom-geometry') {
    diagnostics.push(...validateSpriteDrawingContractV2(plan.normalizedParameters.contract));
  }
  if (plan.normalizedParameters.kind === 'multi-layer') {
    const layers = plan.normalizedParameters.layers;
    if (layers.length < 2) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'A multi-layer operation requires at least two layers.', 'normalizedParameters.layers');
    if (layers.length > ASSET_AUTHORING_INTELLIGENCE_LIMITS.layers) addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', 'Layer count exceeds the D5 limit.', 'normalizedParameters.layers');
    const layerIds = layers.map((layer) => layer.id);
    if (hasDuplicate(layerIds)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'Layer operation IDs must be unique.', 'normalizedParameters.layers');
    if (layers.some((layer) => !isPortableAuthoringIntelligenceId(layer.id) || !isPortableAuthoringIntelligenceId(layer.targetIdentity))) addDiagnostic(diagnostics, 'asset_authoring_intelligence_layer_conflict', 'Layer operation identities must be portable.', 'normalizedParameters.layers');
    if (layers.some((layer) => !isAuthoringIntelligenceDigest(layer.contractDigest) || !isAuthoringIntelligenceDigest(layer.inputDigest))) addDiagnostic(diagnostics, 'asset_authoring_intelligence_input_drift', 'Layer input and contract digests are required.', 'normalizedParameters.layers');
    if (!layers.every((layer, index) => index === 0 || compareLayerOperation(layers[index - 1]!, layer) <= 0)) addDiagnostic(diagnostics, 'asset_authoring_intelligence_operation_invalid', 'Layer operations must use deterministic z-order and ID ordering.', 'normalizedParameters.layers');
    if (layers.reduce((count, layer) => count + layer.dependencies.length, 0) > ASSET_AUTHORING_INTELLIGENCE_LIMITS.layerEdges) addDiagnostic(diagnostics, 'asset_authoring_intelligence_resource_limit', 'Layer operation edge count exceeds the D5 limit.', 'normalizedParameters.layers');
    validateLayerGraph(layers, diagnostics);
  }
  return diagnostics;
}

export function createAuthoringIntelligenceOperationPlan(
  input: AuthoringIntelligenceOperationPlanInput,
): AuthoringIntelligenceOperationPlan {
  const plan: AuthoringIntelligenceOperationPlan = {
    schema: ASSET_AUTHORING_INTELLIGENCE_OPERATION_PLAN_SCHEMA,
    operationId: input.operationId,
    operationKind: input.operationKind,
    inputAssetIdentities: [...input.inputAssetIdentities].sort((left, right) => left.localeCompare(right)),
    inputCandidateDigests: [...input.inputCandidateDigests].sort((left, right) => left.localeCompare(right)),
    contractDigests: [...input.contractDigests].sort((left, right) => left.localeCompare(right)),
    catalogSnapshotDigest: input.catalogSnapshotDigest,
    normalizedParameters: normalizedOperationParameters(input.normalizedParameters),
    outputTargetIdentities: [...input.outputTargetIdentities].sort((left, right) => left.localeCompare(right)),
    operationDigest: input.operationDigest,
  };
  const diagnostics = validateAuthoringIntelligenceOperationPlan(plan);
  if (diagnostics.length > 0) throw new Error(diagnostics[0]!.message);
  return plan;
}

export function authoringIntelligenceOperationDigestInput(
  plan: AuthoringIntelligenceOperationPlan,
): string {
  return canonicalJson({ ...plan, operationDigest: undefined });
}

export function authoringIntelligenceOperationProjection(
  plan: AuthoringIntelligenceOperationPlan,
): unknown {
  return canonicalProjection(plan);
}

export function materializeAuthoringIntelligenceRecolor(
  pixels: Uint8ClampedArray,
  parameters: AuthoringIntelligenceRecolorParameters,
): Uint8ClampedArray {
  const diagnostics = validateAuthoringIntelligenceOperationPlan({
    schema: ASSET_AUTHORING_INTELLIGENCE_OPERATION_PLAN_SCHEMA,
    operationId: 'd5-recolor-materialization',
    operationKind: 'derive-recolor',
    inputAssetIdentities: ['d5/input'],
    inputCandidateDigests: ['sha256:0000000000000000000000000000000000000000000000000000000000000000'],
    contractDigests: ['sha256:0000000000000000000000000000000000000000000000000000000000000000'],
    catalogSnapshotDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    normalizedParameters: parameters,
    outputTargetIdentities: ['d5/output'],
    operationDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });
  if (diagnostics.length > 0) throw new Error(diagnostics[0]!.message);
  return recolorPixels(pixels, {
    material: parameters.material,
    source: parameters.sourceRamp,
    target: parameters.targetRamp,
  });
}
