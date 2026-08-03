import type {
  AnimationAuditConsumer,
  AnimationAuditFrameCell,
  AnimationAuditGeometry,
} from './asset-animation-audit.js';
import { ANIMATIONS, BODY_TYPES, DIRECTIONS, type Direction } from './constants.js';
import type { AssetPackCreditSource } from './asset-pack-schema.js';
import type { AnimationName, BodyType, ItemId, License, TypeName } from './types.js';

export const ASSET_AUTHORING_PLAN_SCHEMA = 'lpc-toolkit.asset-authoring-plan.v1' as const;

export type AssetAuthoringPlanGoal = 'new-item' | 'extend-item' | 'attach-pack';

export type AssetAuthoringPathConfidence = 'exact' | 'inferred' | 'manual-review';

export type AssetAuthoringDiagnosticCode =
  | 'asset_authoring_schema_invalid'
  | 'asset_authoring_unknown_field'
  | 'asset_authoring_goal_invalid'
  | 'asset_authoring_required_intent_missing'
  | 'asset_authoring_value_invalid'
  | 'asset_authoring_digest_invalid'
  | 'asset_authoring_audit_evidence_invalid';

export interface AssetAuthoringDiagnostic {
  readonly code: AssetAuthoringDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetAuthoringPackIntent {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
}

export interface AssetAuthoringLayerIntent {
  readonly id: string;
  readonly zPos: number;
  readonly bodyTypes?: readonly BodyType[];
}

export interface AssetAuthoringWorkScope {
  readonly packId: string;
  readonly assetId?: string;
  readonly bodyTypes: readonly BodyType[];
  readonly animations: readonly AnimationName[];
  readonly paths: readonly string[];
}

export interface AssetAuthoringConsent {
  readonly approved: boolean;
  readonly scope: AssetAuthoringWorkScope;
}

export interface AssetAuthoringProviderMetadata {
  readonly id: string;
  readonly tool?: string;
  readonly model?: string;
}

export interface NewItemAuthoringIntent {
  readonly kind: 'new-item';
  readonly localId: string;
  readonly displayName: string;
  readonly typeName: TypeName;
  readonly bodyTypes: readonly BodyType[];
  readonly animations: readonly AnimationName[];
  readonly layers: readonly AssetAuthoringLayerIntent[];
}

export interface ExtendItemAuthoringIntent {
  readonly kind: 'extend-item';
  readonly itemId: ItemId;
  readonly typeName: TypeName;
}

export interface AttachPackAuthoringIntent {
  readonly kind: 'attach-pack';
}

export type AssetAuthoringIntent =
  | NewItemAuthoringIntent
  | ExtendItemAuthoringIntent
  | AttachPackAuthoringIntent;

export interface AssetAuthoringUnsupportedRequirement extends AnimationAuditConsumer {
  readonly expectedPath?: string;
  readonly pathConfidence: Exclude<AssetAuthoringPathConfidence, 'exact'>;
  readonly manualReviewReason?: string;
}

export interface AssetAuthoringUnsupportedFinding {
  readonly category: 'unsupported';
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly animation: AnimationName;
  readonly nativeAnimations: readonly AnimationName[];
  readonly compatibleAnimations: readonly AnimationName[];
  readonly requirements: readonly AssetAuthoringUnsupportedRequirement[];
}

export interface AssetAuthoringMissingFileFinding {
  readonly category: 'missingFiles';
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface AssetAuthoringBlankFramesFinding {
  readonly category: 'blankFrames';
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly frames: readonly AnimationAuditFrameCell[];
  readonly consumers: readonly AnimationAuditConsumer[];
}

export type AssetAuthoringSelectedFinding =
  | AssetAuthoringUnsupportedFinding
  | AssetAuthoringMissingFileFinding
  | AssetAuthoringBlankFramesFinding;

export interface AssetAuthoringSourceCell {
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly sourceColumn: number;
  readonly logicalFrameIndices: readonly number[];
}

export interface AssetAuthoringRemediationEvidence {
  readonly reportDigest: string;
  readonly selectedFinding: AssetAuthoringSelectedFinding;
  readonly consumer: AnimationAuditConsumer;
  readonly pathConfidence: AssetAuthoringPathConfidence;
  readonly geometry: AnimationAuditGeometry;
  readonly sourceCells: readonly AssetAuthoringSourceCell[];
}

interface AssetAuthoringPlanMetadata {
  readonly schema: typeof ASSET_AUTHORING_PLAN_SCHEMA;
  readonly pack: AssetAuthoringPackIntent;
  readonly scope: AssetAuthoringWorkScope;
  readonly consent?: AssetAuthoringConsent;
  readonly provider?: AssetAuthoringProviderMetadata;
  readonly draftCredits?: AssetPackCreditSource;
}

export interface NewItemAssetAuthoringPlan extends AssetAuthoringPlanMetadata {
  readonly goal: 'new-item';
  readonly asset: NewItemAuthoringIntent;
}

export interface ExtendItemAssetAuthoringPlan extends AssetAuthoringPlanMetadata {
  readonly goal: 'extend-item';
  readonly asset: ExtendItemAuthoringIntent;
  readonly remediation: AssetAuthoringRemediationEvidence;
}

export interface AttachPackAssetAuthoringPlan extends AssetAuthoringPlanMetadata {
  readonly goal: 'attach-pack';
  readonly asset: AttachPackAuthoringIntent;
}

export type AssetAuthoringPlan =
  | NewItemAssetAuthoringPlan
  | ExtendItemAssetAuthoringPlan
  | AttachPackAssetAuthoringPlan;

export type AssetAuthoringPlanParseResult =
  | { readonly ok: true; readonly plan: AssetAuthoringPlan }
  | { readonly ok: false; readonly diagnostics: readonly AssetAuthoringDiagnostic[] };

type UnknownRecord = Readonly<Record<string, unknown>>;

const ANIMATION_NAMES = new Set<string>(ANIMATIONS.map(({ value }) => value));
const BODY_TYPE_NAMES = new Set<string>(BODY_TYPES);
const DIRECTION_NAMES = new Set<string>(DIRECTIONS);
const LICENSE_NAMES = new Set<License>([
  'CC0',
  'CC-BY',
  'CC-BY 3.0',
  'CC-BY 3.0+',
  'CC-BY 4.0',
  'CC-BY-SA 3.0',
  'CC-BY-SA 4.0',
  'OGA-BY 3.0',
  'OGA-BY 3.0+',
  'OGA-BY 4.0',
  'GPL 2.0',
  'GPL 3.0',
]);
const ANIMATION_ORDER = new Map(ANIMATIONS.map(({ value }, index) => [value, index]));
const BODY_TYPE_ORDER = new Map(BODY_TYPES.map((value, index) => [value, index]));
const PACK_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LAYER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LAYER_NAME_PATTERN = /^layer_[1-9][0-9]*$/u;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

const PLAN_KEYS = [
  'schema',
  'goal',
  'pack',
  'asset',
  'scope',
  'consent',
  'provider',
  'draftCredits',
  'remediation',
] as const;

const SCOPE_KEYS = ['packId', 'assetId', 'bodyTypes', 'animations', 'paths'] as const;
const CONSUMER_KEYS = ['itemId', 'typeName', 'layer', 'bodyTypes', 'variant', 'recolors'] as const;

export function parseAssetAuthoringPlan(input: unknown): AssetAuthoringPlanParseResult {
  const diagnostics: AssetAuthoringDiagnostic[] = [];
  const plan = parsePlanRecord(input, '$', diagnostics);
  return plan && diagnostics.length === 0
    ? { ok: true, plan }
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

function parsePlanRecord(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringPlan | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;

  exactKeys(record, path, PLAN_KEYS, diagnostics);

  const schema = readRequiredString(record, 'schema', `${path}.schema`, diagnostics);
  if (schema !== undefined && schema !== ASSET_AUTHORING_PLAN_SCHEMA) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_schema_invalid',
      message: `Unsupported asset-authoring schema at ${path}.schema.`,
      path: `${path}.schema`,
      value: schema,
    });
  }

  const goal = readRequiredString(record, 'goal', `${path}.goal`, diagnostics);
  if (
    goal !== undefined
    && goal !== 'new-item'
    && goal !== 'extend-item'
    && goal !== 'attach-pack'
  ) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_goal_invalid',
      message: `Unsupported asset-authoring plan goal at ${path}.goal.`,
      path: `${path}.goal`,
      value: goal,
    });
  }

  const pack = parsePackIntent(record.pack, `${path}.pack`, diagnostics);
  const scope = parseWorkScope(record.scope, `${path}.scope`, diagnostics);
  const consent = parseConsent(record.consent, `${path}.consent`, diagnostics);
  const provider = parseProvider(record.provider, `${path}.provider`, diagnostics);
  const draftCredits = parseDraftCredits(
    record.draftCredits,
    `${path}.draftCredits`,
    diagnostics,
  );

  const asset = parseIntent(record.asset, `${path}.asset`, diagnostics);
  if (goal && asset && asset.kind !== goal) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_schema_invalid',
      message: `Plan goal and asset intent must agree at ${path}.asset.kind.`,
      path: `${path}.asset.kind`,
      value: asset.kind,
    });
  }

  const remediation = parseRemediation(
    record.remediation,
    `${path}.remediation`,
    diagnostics,
  );

  if (goal === 'extend-item' && record.remediation === undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_required_intent_missing',
      message: `An extend-item plan requires remediation evidence at ${path}.remediation.`,
      path: `${path}.remediation`,
    });
  }

  if (pack && scope) {
    validateScopeRelationships(pack, scope, consent, goal, asset, diagnostics, path);
  }

  if (goal !== 'extend-item' && record.remediation !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_schema_invalid',
      message: `Remediation evidence is only valid for an extend-item plan at ${path}.remediation.`,
      path: `${path}.remediation`,
    });
  }

  if (goal === 'extend-item' && remediation && asset?.kind === 'extend-item') {
    validateRemediationRelationships(asset, scope, remediation, diagnostics, path);
  }

  if (!schema || !pack || !scope || !asset || !goal) return undefined;
  if (schema !== ASSET_AUTHORING_PLAN_SCHEMA) return undefined;
  if (goal !== 'new-item' && goal !== 'extend-item' && goal !== 'attach-pack') return undefined;

  const metadata = {
    schema: ASSET_AUTHORING_PLAN_SCHEMA,
    pack,
    scope,
    ...(consent ? { consent } : {}),
    ...(provider ? { provider } : {}),
    ...(draftCredits ? { draftCredits } : {}),
  };

  if (goal === 'new-item' && asset.kind === 'new-item') {
    if (record.remediation !== undefined) return undefined;
    return { ...metadata, goal, asset };
  }

  if (goal === 'extend-item' && asset.kind === 'extend-item' && remediation) {
    return { ...metadata, goal, asset, remediation };
  }

  if (goal === 'attach-pack' && asset.kind === 'attach-pack') {
    if (scope.assetId !== undefined || record.remediation !== undefined) return undefined;
    return { ...metadata, goal, asset };
  }

  return undefined;
}

function parsePackIntent(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringPackIntent | undefined {
  const record = requiredRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['id', 'version', 'displayName'], diagnostics);

  const id = readRequiredString(record, 'id', `${path}.id`, diagnostics);
  const version = readRequiredString(record, 'version', `${path}.version`, diagnostics);
  const displayName = readRequiredString(record, 'displayName', `${path}.displayName`, diagnostics);

  if (id !== undefined && !PACK_ID_PATTERN.test(id)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Invalid pack id at ${path}.id.`,
      path: `${path}.id`,
      value: id,
    });
  }
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Invalid semantic version at ${path}.version.`,
      path: `${path}.version`,
      value: version,
    });
  }

  if (!id || !version || !displayName) return undefined;
  return { id, version, displayName };
}

function parseIntent(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringIntent | undefined {
  const record = requiredRecord(input, path, diagnostics);
  if (!record) return undefined;
  const kind = readRequiredString(record, 'kind', `${path}.kind`, diagnostics);
  if (kind === 'new-item') return parseNewItemIntent(record, path, diagnostics);
  if (kind === 'extend-item') return parseExtendItemIntent(record, path, diagnostics);
  if (kind === 'attach-pack') return parseAttachPackIntent(record, path, diagnostics);
  if (kind !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_goal_invalid',
      message: `Unsupported asset intent kind at ${path}.kind.`,
      path: `${path}.kind`,
      value: kind,
    });
  }
  return undefined;
}

function parseNewItemIntent(
  record: UnknownRecord,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): NewItemAuthoringIntent | undefined {
  exactKeys(record, path, [
    'kind',
    'localId',
    'displayName',
    'typeName',
    'bodyTypes',
    'animations',
    'layers',
  ], diagnostics);

  const localId = readRequiredString(record, 'localId', `${path}.localId`, diagnostics);
  const displayName = readRequiredString(record, 'displayName', `${path}.displayName`, diagnostics);
  const typeName = readRequiredString(record, 'typeName', `${path}.typeName`, diagnostics);
  const bodyTypes = parseKnownStringArray(
    record.bodyTypes,
    `${path}.bodyTypes`,
    diagnostics,
    BODY_TYPE_NAMES,
    BODY_TYPE_ORDER,
    false,
  );
  const animations = parseKnownStringArray(
    record.animations,
    `${path}.animations`,
    diagnostics,
    ANIMATION_NAMES,
    ANIMATION_ORDER,
    false,
  );
  const layers = parseLayerList(record.layers, `${path}.layers`, diagnostics);

  if (localId !== undefined && !LOCAL_ID_PATTERN.test(localId)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Invalid local asset id at ${path}.localId.`,
      path: `${path}.localId`,
      value: localId,
    });
  }

  if (!localId || !displayName || !typeName || !bodyTypes || !animations || !layers) return undefined;
  return {
    kind: 'new-item',
    localId,
    displayName,
    typeName,
    bodyTypes,
    animations,
    layers,
  };
}

function parseExtendItemIntent(
  record: UnknownRecord,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): ExtendItemAuthoringIntent | undefined {
  exactKeys(record, path, ['kind', 'itemId', 'typeName'], diagnostics);
  const itemId = readRequiredIdentifier(record, 'itemId', `${path}.itemId`, diagnostics);
  const typeName = readRequiredIdentifier(record, 'typeName', `${path}.typeName`, diagnostics);
  if (!itemId || !typeName) return undefined;
  return { kind: 'extend-item', itemId, typeName };
}

function parseAttachPackIntent(
  record: UnknownRecord,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AttachPackAuthoringIntent | undefined {
  exactKeys(record, path, ['kind'], diagnostics);
  return { kind: 'attach-pack' };
}

function parseLayerList(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly AssetAuthoringLayerIntent[] | undefined {
  if (!Array.isArray(input)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_required_intent_missing',
      message: `Expected a layer array at ${path}.`,
      path,
      value: input,
    });
    return undefined;
  }
  if (input.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_required_intent_missing',
      message: `Layer intent at ${path} must not be empty.`,
      path,
    });
    return undefined;
  }

  const layers: AssetAuthoringLayerIntent[] = [];
  const seenIds = new Set<string>();
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, ['id', 'zPos', 'bodyTypes'], diagnostics);
    const id = readRequiredString(record, 'id', `${entryPath}.id`, diagnostics);
    const zPos = readInteger(record.zPos, `${entryPath}.zPos`, diagnostics);
    const bodyTypes = parseOptionalKnownStringArray(
      record.bodyTypes,
      `${entryPath}.bodyTypes`,
      diagnostics,
      BODY_TYPE_NAMES,
      BODY_TYPE_ORDER,
    );
    if (id !== undefined && !LAYER_ID_PATTERN.test(id)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Invalid layer id at ${entryPath}.id.`,
        path: `${entryPath}.id`,
        value: id,
      });
    }
    if (id && seenIds.has(id)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Duplicate layer id at ${entryPath}.id.`,
        path: `${entryPath}.id`,
        value: id,
      });
    } else if (id) {
      seenIds.add(id);
    }
    if (!id || zPos === undefined || (record.bodyTypes !== undefined && !bodyTypes)) return;
    layers.push({
      id,
      zPos,
      ...(bodyTypes ? { bodyTypes } : {}),
    });
  });

  return layers.sort((left, right) => left.zPos - right.zPos || left.id.localeCompare(right.id));
}

function parseWorkScope(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringWorkScope | undefined {
  const record = requiredRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, SCOPE_KEYS, diagnostics);

  const packId = readRequiredString(record, 'packId', `${path}.packId`, diagnostics);
  const assetId = readOptionalIdentifier(record, 'assetId', `${path}.assetId`, diagnostics);
  const bodyTypes = parseKnownStringArray(
    record.bodyTypes,
    `${path}.bodyTypes`,
    diagnostics,
    BODY_TYPE_NAMES,
    BODY_TYPE_ORDER,
    true,
  );
  const animations = parseKnownStringArray(
    record.animations,
    `${path}.animations`,
    diagnostics,
    ANIMATION_NAMES,
    ANIMATION_ORDER,
    true,
  );
  const paths = parsePathList(record.paths, `${path}.paths`, diagnostics);

  if (packId !== undefined && !PACK_ID_PATTERN.test(packId)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Invalid scope pack id at ${path}.packId.`,
      path: `${path}.packId`,
      value: packId,
    });
  }
  if (!packId || !bodyTypes || !animations || !paths) return undefined;
  return {
    packId,
    ...(assetId ? { assetId } : {}),
    bodyTypes,
    animations,
    paths,
  };
}

function parseConsent(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringConsent | undefined {
  if (input === undefined) return undefined;
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['approved', 'scope'], diagnostics);
  const approved = readBoolean(record.approved, `${path}.approved`, diagnostics);
  const scope = parseWorkScope(record.scope, `${path}.scope`, diagnostics);
  if (approved === undefined || !scope) return undefined;
  return { approved, scope };
}

function parseProvider(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringProviderMetadata | undefined {
  if (input === undefined) return undefined;
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['id', 'tool', 'model'], diagnostics);
  const id = readRequiredString(record, 'id', `${path}.id`, diagnostics);
  const tool = readOptionalString(record.tool, `${path}.tool`, diagnostics);
  const model = readOptionalString(record.model, `${path}.model`, diagnostics);
  if (!id) return undefined;
  return {
    id,
    ...(tool ? { tool } : {}),
    ...(model ? { model } : {}),
  };
}

function parseDraftCredits(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetPackCreditSource | undefined {
  if (input === undefined) return undefined;
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['authors', 'licenses', 'urls', 'notes'], diagnostics);
  const authors = parseStringList(record.authors, `${path}.authors`, diagnostics, true);
  const licenses = parseLicenseList(record.licenses, `${path}.licenses`, diagnostics);
  const urls = parseStringList(record.urls, `${path}.urls`, diagnostics, true);
  const notes = readRequiredString(record, 'notes', `${path}.notes`, diagnostics);
  if (!authors || !licenses || !urls || notes === undefined) return undefined;
  return { authors, licenses, urls, notes };
}

function parseRemediation(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringRemediationEvidence | undefined {
  if (input === undefined) return undefined;
  const record = requiredRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, [
    'reportDigest',
    'selectedFinding',
    'consumer',
    'pathConfidence',
    'geometry',
    'sourceCells',
  ], diagnostics);

  const reportDigest = readRequiredString(record, 'reportDigest', `${path}.reportDigest`, diagnostics);
  if (reportDigest !== undefined && !SHA256_PATTERN.test(reportDigest)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_digest_invalid',
      message: `Invalid audit report digest at ${path}.reportDigest.`,
      path: `${path}.reportDigest`,
      value: reportDigest,
    });
  }
  const selectedFinding = parseSelectedFinding(
    record.selectedFinding,
    `${path}.selectedFinding`,
    diagnostics,
  );
  const consumer = parseConsumer(record.consumer, `${path}.consumer`, diagnostics);
  const pathConfidence = parsePathConfidence(
    record.pathConfidence,
    `${path}.pathConfidence`,
    diagnostics,
  );
  const geometry = parseGeometry(record.geometry, `${path}.geometry`, diagnostics);
  const sourceCells = parseSourceCells(record.sourceCells, `${path}.sourceCells`, diagnostics);

  if (!reportDigest || !selectedFinding || !consumer || !pathConfidence || !geometry || !sourceCells) {
    return undefined;
  }
  return {
    reportDigest,
    selectedFinding,
    consumer,
    pathConfidence,
    geometry,
    sourceCells,
  };
}

function parseSelectedFinding(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringSelectedFinding | undefined {
  const record = requiredRecord(input, path, diagnostics);
  if (!record) return undefined;
  const category = readRequiredString(record, 'category', `${path}.category`, diagnostics);

  if (category === 'unsupported') {
    exactKeys(record, path, [
      'category',
      'itemId',
      'typeName',
      'animation',
      'nativeAnimations',
      'compatibleAnimations',
      'requirements',
    ], diagnostics);
    const itemId = readRequiredIdentifier(record, 'itemId', `${path}.itemId`, diagnostics);
    const typeName = readRequiredIdentifier(record, 'typeName', `${path}.typeName`, diagnostics);
    const animation = readRequiredIdentifier(record, 'animation', `${path}.animation`, diagnostics);
    const nativeAnimations = parseStringList(
      record.nativeAnimations,
      `${path}.nativeAnimations`,
      diagnostics,
      true,
    );
    const compatibleAnimations = parseStringList(
      record.compatibleAnimations,
      `${path}.compatibleAnimations`,
      diagnostics,
      true,
    );
    const requirements = parseRequirementList(record.requirements, `${path}.requirements`, diagnostics);
    if (!itemId || !typeName || !animation || !nativeAnimations || !compatibleAnimations || !requirements) {
      return undefined;
    }
    return {
      category,
      itemId,
      typeName,
      animation,
      nativeAnimations,
      compatibleAnimations,
      requirements,
    };
  }

  if (category === 'missingFiles') {
    exactKeys(record, path, [
      'category',
      'path',
      'animation',
      'sourceAnimation',
      'consumers',
    ], diagnostics);
    const finding = parseFindingPathAndConsumers(record, path, diagnostics);
    if (!finding) return undefined;
    return { category, ...finding };
  }

  if (category === 'blankFrames') {
    exactKeys(record, path, [
      'category',
      'path',
      'animation',
      'sourceAnimation',
      'sourceRow',
      'direction',
      'frames',
      'consumers',
    ], diagnostics);
    const finding = parseFindingPathAndConsumers(record, path, diagnostics);
    const sourceRow = readNonNegativeInteger(record.sourceRow, `${path}.sourceRow`, diagnostics);
    const direction = parseOptionalDirection(record.direction, `${path}.direction`, diagnostics);
    const frames = parseFrameCells(record.frames, `${path}.frames`, diagnostics);
    if (!finding || sourceRow === undefined || (record.direction !== undefined && !direction) || !frames) {
      return undefined;
    }
    return {
      category,
      ...finding,
      sourceRow,
      ...(direction ? { direction } : {}),
      frames,
    };
  }

  if (category !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Unsupported audit finding category at ${path}.category.`,
      path: `${path}.category`,
      value: category,
    });
  }
  return undefined;
}

function parseFindingPathAndConsumers(
  record: UnknownRecord,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): {
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly consumers: readonly AnimationAuditConsumer[];
} | undefined {
  const findingPath = readSafePath(record.path, `${path}.path`, diagnostics);
  const animation = readRequiredIdentifier(record, 'animation', `${path}.animation`, diagnostics);
  const sourceAnimation = readRequiredIdentifier(
    record,
    'sourceAnimation',
    `${path}.sourceAnimation`,
    diagnostics,
  );
  const consumers = parseConsumerList(record.consumers, `${path}.consumers`, diagnostics);
  if (!findingPath || !animation || !sourceAnimation || !consumers) return undefined;
  return { path: findingPath, animation, sourceAnimation, consumers };
}

function parseRequirementList(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly AssetAuthoringUnsupportedRequirement[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Unsupported finding requirements at ${path} must be a non-empty array.`,
      path,
      value: input,
    });
    return undefined;
  }
  const requirements: AssetAuthoringUnsupportedRequirement[] = [];
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, [
      ...CONSUMER_KEYS,
      'expectedPath',
      'pathConfidence',
      'manualReviewReason',
    ], diagnostics);
    const consumer = parseConsumer(record, entryPath, diagnostics);
    const pathConfidence = parseUnsupportedPathConfidence(
      record.pathConfidence,
      `${entryPath}.pathConfidence`,
      diagnostics,
    );
    const expectedPath = record.expectedPath === undefined
      ? undefined
      : readSafePath(record.expectedPath, `${entryPath}.expectedPath`, diagnostics);
    const manualReviewReason = record.manualReviewReason === undefined
      ? undefined
      : readRequiredString(record, 'manualReviewReason', `${entryPath}.manualReviewReason`, diagnostics);

    if (pathConfidence === 'inferred') {
      if (expectedPath === undefined) {
        addDiagnostic(diagnostics, {
          code: 'asset_authoring_audit_evidence_invalid',
          message: `An inferred audit path requires expectedPath at ${entryPath}.expectedPath.`,
          path: `${entryPath}.expectedPath`,
        });
      }
      if (manualReviewReason !== undefined) {
        addDiagnostic(diagnostics, {
          code: 'asset_authoring_audit_evidence_invalid',
          message: `An inferred audit path cannot include manualReviewReason at ${entryPath}.manualReviewReason.`,
          path: `${entryPath}.manualReviewReason`,
        });
      }
    }
    if (pathConfidence === 'manual-review') {
      if (expectedPath !== undefined) {
        addDiagnostic(diagnostics, {
          code: 'asset_authoring_audit_evidence_invalid',
          message: `A manual-review audit path cannot include expectedPath at ${entryPath}.expectedPath.`,
          path: `${entryPath}.expectedPath`,
        });
      }
      if (manualReviewReason === undefined) {
        addDiagnostic(diagnostics, {
          code: 'asset_authoring_audit_evidence_invalid',
          message: `A manual-review audit path requires manualReviewReason at ${entryPath}.manualReviewReason.`,
          path: `${entryPath}.manualReviewReason`,
        });
      }
    }

    if (!consumer || !pathConfidence) return;
    requirements.push({
      ...consumer,
      pathConfidence,
      ...(expectedPath ? { expectedPath } : {}),
      ...(manualReviewReason ? { manualReviewReason } : {}),
    });
  });
  return requirements.sort(compareConsumersAndRequirements);
}

function parseConsumerList(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly AnimationAuditConsumer[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Audit consumers at ${path} must be a non-empty array.`,
      path,
      value: input,
    });
    return undefined;
  }
  const consumers: AnimationAuditConsumer[] = [];
  input.forEach((entry, index) => {
    const consumer = parseConsumer(entry, `${path}[${index}]`, diagnostics);
    if (consumer) consumers.push(consumer);
  });
  return consumers.sort(compareConsumers);
}

function parseConsumer(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AnimationAuditConsumer | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, CONSUMER_KEYS, diagnostics);
  const itemId = readRequiredIdentifier(record, 'itemId', `${path}.itemId`, diagnostics);
  const typeName = readRequiredIdentifier(record, 'typeName', `${path}.typeName`, diagnostics);
  const layer = readRequiredString(record, 'layer', `${path}.layer`, diagnostics);
  const bodyTypes = parseKnownStringArray(
    record.bodyTypes,
    `${path}.bodyTypes`,
    diagnostics,
    BODY_TYPE_NAMES,
    BODY_TYPE_ORDER,
    false,
  );
  const variant = readOptionalIdentifier(record, 'variant', `${path}.variant`, diagnostics);
  const recolors = parseStringList(record.recolors, `${path}.recolors`, diagnostics, true);

  if (layer !== undefined && !LAYER_NAME_PATTERN.test(layer)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Audit consumer layer must match layer_<number> at ${path}.layer.`,
      path: `${path}.layer`,
      value: layer,
    });
  }
  if (!itemId || !typeName || !layer || !bodyTypes || !recolors) return undefined;
  return {
    itemId,
    typeName,
    layer: layer as `layer_${number}`,
    bodyTypes,
    ...(variant ? { variant } : {}),
    recolors,
  };
}

function parseGeometry(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AnimationAuditGeometry | undefined {
  const record = requiredRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['kind', 'frameSize', 'rows'], diagnostics);
  const kind = readRequiredString(record, 'kind', `${path}.kind`, diagnostics);
  const frameSize = readPositiveInteger(record.frameSize, `${path}.frameSize`, diagnostics);
  const rowsInput = record.rows;
  if (!Array.isArray(rowsInput) || rowsInput.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Geometry rows at ${path}.rows must be a non-empty array.`,
      path: `${path}.rows`,
      value: rowsInput,
    });
  }
  const rows: AnimationAuditGeometry['rows'][number][] = [];
  if (Array.isArray(rowsInput)) {
    const seenRows = new Set<number>();
    rowsInput.forEach((entry, index) => {
      const entryPath = `${path}.rows[${index}]`;
      const row = asRecord(entry, entryPath, diagnostics);
      if (!row) return;
      exactKeys(row, entryPath, ['sourceRow', 'direction', 'cells'], diagnostics);
      const sourceRow = readNonNegativeInteger(row.sourceRow, `${entryPath}.sourceRow`, diagnostics);
      const direction = parseOptionalDirection(row.direction, `${entryPath}.direction`, diagnostics);
      const cells = parseFrameCells(row.cells, `${entryPath}.cells`, diagnostics);
      if (sourceRow !== undefined && seenRows.has(sourceRow)) {
        addDiagnostic(diagnostics, {
          code: 'asset_authoring_audit_evidence_invalid',
          message: `Geometry source rows must be unique at ${entryPath}.sourceRow.`,
          path: `${entryPath}.sourceRow`,
          value: sourceRow,
        });
      } else if (sourceRow !== undefined) {
        seenRows.add(sourceRow);
      }
      if (sourceRow === undefined || !cells || (row.direction !== undefined && !direction)) return;
      rows.push({
        sourceRow,
        ...(direction ? { direction } : {}),
        cells,
      });
    });
  }
  if (kind !== 'standard' && kind !== 'custom' && kind !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Geometry kind at ${path}.kind must be standard or custom.`,
      path: `${path}.kind`,
      value: kind,
    });
  }
  if (kind !== 'standard' && kind !== 'custom') return undefined;
  if (frameSize === undefined || rows.length === 0) return undefined;
  return {
    kind,
    frameSize,
    rows: rows.sort((left, right) => left.sourceRow - right.sourceRow),
  };
}

function parseFrameCells(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly AnimationAuditFrameCell[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Frame cells at ${path} must be a non-empty array.`,
      path,
      value: input,
    });
    return undefined;
  }
  const cells: AnimationAuditFrameCell[] = [];
  const seenColumns = new Set<number>();
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, ['sourceColumn', 'logicalFrameIndices'], diagnostics);
    const sourceColumn = readNonNegativeInteger(
      record.sourceColumn,
      `${entryPath}.sourceColumn`,
      diagnostics,
    );
    const logicalFrameIndices = parseNonNegativeIntegerList(
      record.logicalFrameIndices,
      `${entryPath}.logicalFrameIndices`,
      diagnostics,
    );
    if (sourceColumn !== undefined && seenColumns.has(sourceColumn)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_audit_evidence_invalid',
        message: `Frame source columns must be unique at ${entryPath}.sourceColumn.`,
        path: `${entryPath}.sourceColumn`,
        value: sourceColumn,
      });
    } else if (sourceColumn !== undefined) {
      seenColumns.add(sourceColumn);
    }
    if (sourceColumn === undefined || !logicalFrameIndices) return;
    cells.push({ sourceColumn, logicalFrameIndices });
  });
  return cells.sort((left, right) => left.sourceColumn - right.sourceColumn);
}

function parseSourceCells(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly AssetAuthoringSourceCell[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Source-cell context at ${path} must be a non-empty array.`,
      path,
      value: input,
    });
    return undefined;
  }
  const cells: AssetAuthoringSourceCell[] = [];
  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, [
      'sourceRow',
      'direction',
      'sourceColumn',
      'logicalFrameIndices',
    ], diagnostics);
    const sourceRow = readNonNegativeInteger(record.sourceRow, `${entryPath}.sourceRow`, diagnostics);
    const direction = parseOptionalDirection(record.direction, `${entryPath}.direction`, diagnostics);
    const sourceColumn = readNonNegativeInteger(
      record.sourceColumn,
      `${entryPath}.sourceColumn`,
      diagnostics,
    );
    const logicalFrameIndices = parseNonNegativeIntegerList(
      record.logicalFrameIndices,
      `${entryPath}.logicalFrameIndices`,
      diagnostics,
    );
    if (
      sourceRow === undefined
      || sourceColumn === undefined
      || !logicalFrameIndices
      || (record.direction !== undefined && !direction)
    ) return;
    cells.push({
      sourceRow,
      ...(direction ? { direction } : {}),
      sourceColumn,
      logicalFrameIndices,
    });
  });
  return cells.sort(compareSourceCells);
}

function parsePathConfidence(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): AssetAuthoringPathConfidence | undefined {
  const value = readRequiredString(input, path, diagnostics);
  if (value === 'exact' || value === 'inferred' || value === 'manual-review') return value;
  if (value !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Invalid path confidence at ${path}.`,
      path,
      value,
    });
  }
  return undefined;
}

function parseUnsupportedPathConfidence(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): Exclude<AssetAuthoringPathConfidence, 'exact'> | undefined {
  const value = parsePathConfidence(input, path, diagnostics);
  if (value === 'inferred' || value === 'manual-review') return value;
  if (value === 'exact') {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Unsupported findings cannot use exact path confidence at ${path}.`,
      path,
      value,
    });
  }
  return undefined;
}

function parseOptionalDirection(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): Direction | undefined {
  if (input === undefined) return undefined;
  const value = readRequiredString(input, path, diagnostics);
  if (value && DIRECTION_NAMES.has(value)) return value as Direction;
  if (value) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Invalid direction at ${path}.`,
      path,
      value,
    });
  }
  return undefined;
}

function validateScopeRelationships(
  pack: AssetAuthoringPackIntent,
  scope: AssetAuthoringWorkScope,
  consent: AssetAuthoringConsent | undefined,
  goal: string | undefined,
  asset: AssetAuthoringIntent | undefined,
  diagnostics: AssetAuthoringDiagnostic[],
  path: string,
): void {
  if (scope.packId !== pack.id) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Scope pack id must match pack identity at ${path}.scope.packId.`,
      path: `${path}.scope.packId`,
      value: scope.packId,
    });
  }

  if (goal === 'new-item' && asset?.kind === 'new-item') {
    validateBoundedScope(
      scope,
      asset.localId,
      asset.bodyTypes,
      asset.animations,
      diagnostics,
      path,
    );
  }
  if (goal === 'extend-item' && asset?.kind === 'extend-item') {
    validateBoundedScope(scope, asset.itemId, undefined, undefined, diagnostics, path);
  }
  if (goal === 'attach-pack' && scope.assetId !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `An attach-pack plan cannot broaden to an asset at ${path}.scope.assetId.`,
      path: `${path}.scope.assetId`,
      value: scope.assetId,
    });
  }

  if (consent) {
    if (consent.scope.packId !== pack.id) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Consent scope pack id must match pack identity at ${path}.consent.scope.packId.`,
        path: `${path}.consent.scope.packId`,
        value: consent.scope.packId,
      });
    }
    if (scope.assetId && consent.scope.assetId !== scope.assetId) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Consent scope asset id must match the bounded asset at ${path}.consent.scope.assetId.`,
        path: `${path}.consent.scope.assetId`,
        value: consent.scope.assetId,
      });
    }
    if (!isSubset(consent.scope.bodyTypes, scope.bodyTypes)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Consent body types must remain within the plan scope at ${path}.consent.scope.bodyTypes.`,
        path: `${path}.consent.scope.bodyTypes`,
      });
    }
    if (!isSubset(consent.scope.animations, scope.animations)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Consent animations must remain within the plan scope at ${path}.consent.scope.animations.`,
        path: `${path}.consent.scope.animations`,
      });
    }
    if (!isSubset(consent.scope.paths, scope.paths)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Consent paths must remain within the plan scope at ${path}.consent.scope.paths.`,
        path: `${path}.consent.scope.paths`,
      });
    }
  }
}

function validateBoundedScope(
  scope: AssetAuthoringWorkScope,
  assetId: string,
  assetBodyTypes: readonly BodyType[] | undefined,
  assetAnimations: readonly AnimationName[] | undefined,
  diagnostics: AssetAuthoringDiagnostic[],
  path: string,
): void {
  if (scope.assetId !== assetId) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Scope asset id must match the selected asset at ${path}.scope.assetId.`,
      path: `${path}.scope.assetId`,
      value: scope.assetId,
    });
  }
  if (scope.bodyTypes.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_required_intent_missing',
      message: `Bounded authoring scope requires body types at ${path}.scope.bodyTypes.`,
      path: `${path}.scope.bodyTypes`,
    });
  }
  if (scope.animations.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_required_intent_missing',
      message: `Bounded authoring scope requires animations at ${path}.scope.animations.`,
      path: `${path}.scope.animations`,
    });
  }
  if (assetBodyTypes && !isSubset(scope.bodyTypes, assetBodyTypes)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Scope body types must remain within the asset intent at ${path}.scope.bodyTypes.`,
      path: `${path}.scope.bodyTypes`,
    });
  }
  if (assetAnimations && !isSubset(scope.animations, assetAnimations)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Scope animations must remain within the asset intent at ${path}.scope.animations.`,
      path: `${path}.scope.animations`,
    });
  }
}

function validateRemediationRelationships(
  asset: ExtendItemAuthoringIntent,
  scope: AssetAuthoringWorkScope | undefined,
  remediation: AssetAuthoringRemediationEvidence,
  diagnostics: AssetAuthoringDiagnostic[],
  path: string,
): void {
  if (!scope) return;
  if (remediation.consumer.itemId !== asset.itemId) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Selected audit consumer must match the extension item at ${path}.remediation.consumer.itemId.`,
      path: `${path}.remediation.consumer.itemId`,
      value: remediation.consumer.itemId,
    });
  }
  if (remediation.consumer.typeName !== asset.typeName) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Selected audit consumer must match the extension type at ${path}.remediation.consumer.typeName.`,
      path: `${path}.remediation.consumer.typeName`,
      value: remediation.consumer.typeName,
    });
  }
  const finding = remediation.selectedFinding;
  if (finding.category === 'unsupported') {
    if (finding.itemId !== asset.itemId || finding.typeName !== asset.typeName) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_audit_evidence_invalid',
        message: `Selected unsupported finding must match the extension asset at ${path}.remediation.selectedFinding.`,
        path: `${path}.remediation.selectedFinding`,
      });
    }
    const requirement = finding.requirements.find((candidate) => sameConsumer(candidate, remediation.consumer));
    if (!requirement) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_audit_evidence_invalid',
        message: `Selected consumer must be one of the unsupported finding requirements at ${path}.remediation.consumer.`,
        path: `${path}.remediation.consumer`,
      });
    } else if (requirement.pathConfidence !== remediation.pathConfidence) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_audit_evidence_invalid',
        message: `Path confidence must retain the selected unsupported requirement at ${path}.remediation.pathConfidence.`,
        path: `${path}.remediation.pathConfidence`,
      });
    }
    if (!scope.animations.includes(finding.animation)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Remediation animation must remain within the bounded scope at ${path}.scope.animations.`,
        path: `${path}.scope.animations`,
      });
    }
    return;
  }

  if (!finding.consumers.some((candidate) => sameConsumer(candidate, remediation.consumer))) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Selected consumer must be one of the audit finding consumers at ${path}.remediation.consumer.`,
      path: `${path}.remediation.consumer`,
    });
  }
  if (remediation.pathConfidence !== 'exact') {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Existing-file audit findings require exact path confidence at ${path}.remediation.pathConfidence.`,
      path: `${path}.remediation.pathConfidence`,
      value: remediation.pathConfidence,
    });
  }
  if (!scope.paths.includes(finding.path)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Audit finding path must remain within the bounded scope at ${path}.scope.paths.`,
      path: `${path}.scope.paths`,
      value: finding.path,
    });
  }
  if (finding.category === 'blankFrames') {
    finding.frames.forEach((frame) => {
      const found = remediation.sourceCells.some((cell) =>
        cell.sourceRow === finding.sourceRow
        && cell.sourceColumn === frame.sourceColumn
        && sameNumbers(cell.logicalFrameIndices, frame.logicalFrameIndices));
      if (!found) {
        addDiagnostic(diagnostics, {
          code: 'asset_authoring_audit_evidence_invalid',
          message: `Blank-frame source cells must be retained in remediation evidence at ${path}.remediation.sourceCells.`,
          path: `${path}.remediation.sourceCells`,
        });
      }
    });
  }
}

function parseKnownStringArray(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
  allowed: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
  allowEmpty: boolean,
): readonly string[] | undefined {
  const values = parseStringList(input, path, diagnostics, allowEmpty);
  if (!values) return undefined;
  const valid: string[] = [];
  values.forEach((value) => {
    if (!allowed.has(value)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Unsupported value at ${path}.`,
        path,
        value,
      });
      return;
    }
    valid.push(value);
  });
  return valid.sort((left, right) => compareOrderedValues(left, right, order));
}

function parseOptionalKnownStringArray(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
  allowed: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
): readonly string[] | undefined {
  if (input === undefined) return undefined;
  return parseKnownStringArray(input, path, diagnostics, allowed, order, false);
}

function parseStringList(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
  allowEmpty: boolean,
): readonly string[] | undefined {
  if (!Array.isArray(input) || (!allowEmpty && input.length === 0)) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_required_intent_missing',
      message: `Expected ${allowEmpty ? 'an' : 'a non-empty'} string array at ${path}.`,
      path,
      value: input,
    });
    return undefined;
  }
  const values: string[] = [];
  input.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_schema_invalid',
        message: `Expected a non-empty string at ${path}[${index}].`,
        path: `${path}[${index}]`,
        value: entry,
      });
      return;
    }
    values.push(entry);
  });
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function parseLicenseList(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly License[] | undefined {
  const values = parseStringList(input, path, diagnostics, true);
  if (!values) return undefined;
  const licenses: License[] = [];
  values.forEach((value) => {
    if (!LICENSE_NAMES.has(value as License)) {
      addDiagnostic(diagnostics, {
        code: 'asset_authoring_value_invalid',
        message: `Unsupported license at ${path}.`,
        path,
        value,
      });
      return;
    }
    licenses.push(value as License);
  });
  return licenses;
}

function parsePathList(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly string[] | undefined {
  const values = parseStringList(input, path, diagnostics, false);
  if (!values) return undefined;
  const safePaths: string[] = [];
  values.forEach((value) => {
    if (isSafeRelativePath(value)) {
      safePaths.push(value);
      return;
    }
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Unsafe logical path at ${path}.`,
      path,
      value,
    });
  });
  return safePaths;
}

function parseNonNegativeIntegerList(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): readonly number[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_audit_evidence_invalid',
      message: `Expected a non-empty integer array at ${path}.`,
      path,
      value: input,
    });
    return undefined;
  }
  const values: number[] = [];
  input.forEach((entry, index) => {
    const value = readNonNegativeInteger(entry, `${path}[${index}]`, diagnostics);
    if (value !== undefined) values.push(value);
  });
  return [...new Set(values)].sort((left, right) => left - right);
}

function readRequiredIdentifier(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): string | undefined {
  return readIdentifier(record[key], path, diagnostics, true);
}

function readOptionalIdentifier(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): string | undefined {
  if (record[key] === undefined) return undefined;
  return readIdentifier(record[key], path, diagnostics, false);
}

function readIdentifier(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
  required: boolean,
): string | undefined {
  if (typeof input === 'string' && input.length > 0 && !/\s/u.test(input)) return input;
  addDiagnostic(diagnostics, {
    code: required ? 'asset_authoring_required_intent_missing' : 'asset_authoring_schema_invalid',
    message: `Expected a non-empty identifier at ${path}.`,
    path,
    value: input,
  });
  return undefined;
}

function readRequiredString(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): string | undefined;
function readRequiredString(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): string | undefined;
function readRequiredString(
  recordOrInput: UnknownRecord | unknown,
  keyOrPath: string,
  pathOrDiagnostics: string | AssetAuthoringDiagnostic[],
  maybeDiagnostics?: AssetAuthoringDiagnostic[],
): string | undefined {
  const isRecordCall = isRecord(recordOrInput) && maybeDiagnostics !== undefined;
  const input = isRecordCall
    ? recordOrInput[keyOrPath]
    : recordOrInput;
  const path = isRecordCall ? pathOrDiagnostics as string : keyOrPath;
  const diagnostics = isRecordCall ? maybeDiagnostics : pathOrDiagnostics as AssetAuthoringDiagnostic[];
  if (typeof input === 'string' && input.length > 0) return input;
  addDiagnostic(diagnostics, {
    code: 'asset_authoring_required_intent_missing',
    message: `Expected a non-empty string at ${path}.`,
    path,
    value: input,
  });
  return undefined;
}

function readOptionalString(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input === 'string' && input.length > 0) return input;
  addDiagnostic(diagnostics, {
    code: 'asset_authoring_schema_invalid',
    message: `Expected a non-empty string at ${path}.`,
    path,
    value: input,
  });
  return undefined;
}

function readBoolean(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): boolean | undefined {
  if (typeof input === 'boolean') return input;
  addDiagnostic(diagnostics, {
    code: 'asset_authoring_schema_invalid',
    message: `Expected a boolean at ${path}.`,
    path,
    value: input,
  });
  return undefined;
}

function readInteger(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): number | undefined {
  if (typeof input === 'number' && Number.isInteger(input)) return input;
  addDiagnostic(diagnostics, {
    code: 'asset_authoring_schema_invalid',
    message: `Expected an integer at ${path}.`,
    path,
    value: input,
  });
  return undefined;
}

function readPositiveInteger(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): number | undefined {
  const value = readInteger(input, path, diagnostics);
  if (value !== undefined && value > 0) return value;
  if (value !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Expected a positive integer at ${path}.`,
      path,
      value,
    });
  }
  return undefined;
}

function readNonNegativeInteger(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): number | undefined {
  const value = readInteger(input, path, diagnostics);
  if (value !== undefined && value >= 0) return value;
  if (value !== undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_value_invalid',
      message: `Expected a non-negative integer at ${path}.`,
      path,
      value,
    });
  }
  return undefined;
}

function requiredRecord(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): UnknownRecord | undefined {
  if (input === undefined) {
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_required_intent_missing',
      message: `Missing required object at ${path}.`,
      path,
    });
    return undefined;
  }
  return asRecord(input, path, diagnostics);
}

function asRecord(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): UnknownRecord | undefined {
  if (isRecord(input)) return input;
  addDiagnostic(diagnostics, {
    code: 'asset_authoring_schema_invalid',
    message: `Expected an object at ${path}.`,
    path,
    value: input,
  });
  return undefined;
}

function readSafePath(
  input: unknown,
  path: string,
  diagnostics: AssetAuthoringDiagnostic[],
): string | undefined {
  const value = readRequiredString(input, path, diagnostics);
  if (!value) return undefined;
  if (isSafeRelativePath(value)) return value;
  addDiagnostic(diagnostics, {
    code: 'asset_authoring_value_invalid',
    message: `Unsafe logical path at ${path}.`,
    path,
    value,
  });
  return undefined;
}

function exactKeys(
  record: UnknownRecord,
  path: string,
  allowedKeys: readonly string[],
  diagnostics: AssetAuthoringDiagnostic[],
): void {
  const allowed = new Set(allowedKeys);
  Object.keys(record).sort((left, right) => left.localeCompare(right)).forEach((key) => {
    if (allowed.has(key)) return;
    addDiagnostic(diagnostics, {
      code: 'asset_authoring_unknown_field',
      message: `Unknown field at ${path}.${key}.`,
      path: `${path}.${key}`,
    });
  });
}

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.startsWith('/') || /^[A-Za-z]:/u.test(value) || value.includes('\\')) {
    return false;
  }
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function compareOrderedValues(
  left: string,
  right: string,
  order: ReadonlyMap<string, number>,
): number {
  const leftOrder = order.get(left);
  const rightOrder = order.get(right);
  if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder !== undefined) return -1;
  if (rightOrder !== undefined) return 1;
  return left.localeCompare(right);
}

function compareConsumers(left: AnimationAuditConsumer, right: AnimationAuditConsumer): number {
  return compareConsumerFields(left).localeCompare(compareConsumerFields(right));
}

function compareConsumersAndRequirements(
  left: AssetAuthoringUnsupportedRequirement,
  right: AssetAuthoringUnsupportedRequirement,
): number {
  return `${compareConsumerFields(left)}\u0000${left.pathConfidence}\u0000${left.expectedPath ?? ''}`
    .localeCompare(`${compareConsumerFields(right)}\u0000${right.pathConfidence}\u0000${right.expectedPath ?? ''}`);
}

function compareConsumerFields(consumer: AnimationAuditConsumer): string {
  return [
    consumer.itemId,
    consumer.typeName,
    consumer.layer,
    consumer.bodyTypes.join('\u0000'),
    consumer.variant ?? '',
    consumer.recolors.join('\u0000'),
  ].join('\u0000');
}

function compareSourceCells(left: AssetAuthoringSourceCell, right: AssetAuthoringSourceCell): number {
  return left.sourceRow - right.sourceRow
    || left.sourceColumn - right.sourceColumn
    || (left.direction ?? '').localeCompare(right.direction ?? '')
    || compareNumbers(left.logicalFrameIndices, right.logicalFrameIndices);
}

function compareNumbers(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameConsumer(left: AnimationAuditConsumer, right: AnimationAuditConsumer): boolean {
  return compareConsumerFields(left) === compareConsumerFields(right);
}

function isSubset(candidate: readonly string[], parent: readonly string[]): boolean {
  const parentSet = new Set(parent);
  return candidate.every((value) => parentSet.has(value));
}

function sortDiagnostics(
  diagnostics: readonly AssetAuthoringDiagnostic[],
): AssetAuthoringDiagnostic[] {
  return diagnostics
    .map((diagnostic, index) => ({
      diagnostic,
      index,
      path: diagnostic.details?.path,
    }))
    .sort((left, right) => {
      const leftPath = typeof left.path === 'string' ? left.path : '\uffff';
      const rightPath = typeof right.path === 'string' ? right.path : '\uffff';
      return leftPath.localeCompare(rightPath) || left.index - right.index;
    })
    .map(({ diagnostic }) => diagnostic);
}

function addDiagnostic(
  diagnostics: AssetAuthoringDiagnostic[],
  value: {
    readonly code: AssetAuthoringDiagnosticCode;
    readonly message: string;
    readonly path?: string;
    readonly value?: unknown;
  },
): void {
  diagnostics.push({
    code: value.code,
    severity: 'error',
    message: value.message,
    ...(value.path
      ? { details: { path: value.path, ...(value.value !== undefined ? { value: value.value } : {}) } }
      : {}),
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
