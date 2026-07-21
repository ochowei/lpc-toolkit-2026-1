import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ANIMATIONS,
  ASSET_PACK_SCHEMA,
  BODY_TYPES,
  DIRECTIONS,
  type AssetPackCreditSource,
  type AnimationAuditConsumer,
} from '@lpc-toolkit/core';
import type { AssetAnimationAuditReport } from './animation-audit.js';
import type { CliResponse } from './response.js';

export interface NewAssetPackScaffoldRequest {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly localId: string;
  readonly typeName: string;
  readonly bodyTypes: readonly string[];
  readonly animations: readonly string[];
  readonly credits: AssetPackCreditSource;
  readonly advanced: boolean;
  readonly outputDirectory: string;
}

export interface AuditAssetPackScaffoldRequest {
  readonly reportPath: string;
  readonly itemIds: readonly string[];
  readonly typeNames: readonly string[];
  readonly animations: readonly string[];
  readonly bodyTypes: readonly string[];
  readonly pack: Omit<
    NewAssetPackScaffoldRequest,
    'localId' | 'typeName' | 'bodyTypes' | 'animations' | 'advanced'
  >;
}

export interface AssetPackScaffoldBaselineDigests {
  readonly definitionDigests: ReadonlyMap<string, string>;
  readonly creditDigests: ReadonlyMap<string, string>;
}

export interface AssetPackScaffoldDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly findingType?: string;
  readonly itemId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackScaffoldSuccess {
  readonly ok: true;
  readonly packRoot: string;
  readonly manifestPath: string;
}

export interface AssetPackScaffoldFailure {
  readonly ok: false;
  readonly diagnostics: readonly AssetPackScaffoldDiagnostic[];
}

export type AssetPackScaffoldResult =
  | AssetPackScaffoldSuccess
  | AssetPackScaffoldFailure;

type AuditEnvelope = CliResponse<AssetAnimationAuditReport>;

interface AuditEnvelopeSuccess {
  readonly ok: true;
  readonly envelope: AuditEnvelope & { readonly data: AssetAnimationAuditReport };
}

interface ExtendLayerDraft {
  readonly layer: `layer_${number}`;
  readonly bodyTypes: readonly string[];
  readonly source: string;
  readonly destination: {
    readonly path: string;
    readonly evidence: 'audit-exact' | 'audit-inferred';
    readonly accepted: boolean;
  };
  readonly variant?: string;
  readonly consumers: readonly AnimationAuditConsumer[];
}

interface ExtendAnimationDraft {
  readonly animation: string;
  readonly layers: readonly ExtendLayerDraft[];
}

interface ExtendAssetDraft {
  readonly itemId: string;
  readonly typeName: string;
  readonly addAnimations: readonly ExtendAnimationDraft[];
}

type JsonRecord = Readonly<Record<string, unknown>>;
type AssetIdentity = Readonly<{
  itemId: string;
  typeName: string;
}>;

const ANIMATION_NAMES: ReadonlySet<string> = new Set(ANIMATIONS.map(({ value }) => value));
const BODY_TYPE_NAMES: ReadonlySet<string> = new Set<string>(BODY_TYPES);
const DIRECTION_NAMES: ReadonlySet<string> = new Set<string>(DIRECTIONS);
const INSPECTION_ERROR_KINDS = new Set([
  'asset_read_failed',
  'image_decode_failed',
  'path_resolution_requires_selection',
]);
const PATH_CONFIDENCE_VALUES = new Set(['inferred', 'manual-review']);
const LAYER_NAME = /^layer_[1-9][0-9]*$/u;

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function titleCaseFromSlug(value: string): string {
  return value
    .split(/[-_.]+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function publishPack(
  packRoot: string,
  build: (stagingRoot: string) => void,
): AssetPackScaffoldResult {
  if (existsSync(packRoot)) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_output_exists_v1',
        message: 'Asset-pack scaffold destination already exists.',
        path: packRoot,
      }],
    };
  }

  const parent = path.dirname(packRoot);
  const stagingRoot = path.join(parent, `.${path.basename(packRoot)}.tmp-${randomUUID()}`);
  mkdirSync(parent, { recursive: true });
  mkdirSync(stagingRoot, { recursive: true });

  try {
    build(stagingRoot);
    if (existsSync(packRoot)) {
      return {
        ok: false,
        diagnostics: [{
          code: 'asset_pack_output_exists_v1',
          message: 'Asset-pack scaffold destination already exists.',
          path: packRoot,
        }],
      };
    }
    renameSync(stagingRoot, packRoot);
    return {
      ok: true,
      packRoot,
      manifestPath: path.join(packRoot, 'asset-pack.json'),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_publish_failed',
        message: error instanceof Error ? error.message : 'Could not publish asset-pack scaffold.',
        path: packRoot,
      }],
    };
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function scaffoldSourceDirectories(
  root: string,
  sourcePaths: readonly string[],
): void {
  sourcePaths.forEach((sourcePath) => {
    mkdirSync(path.join(root, path.dirname(sourcePath)), { recursive: true });
  });
}

function invalidReportField(
  pathValue: string,
  message: string,
): AssetPackScaffoldDiagnostic {
  return {
    code: 'audit_report_invalid_v1',
    message,
    path: pathValue,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be a non-empty string.`));
    return undefined;
  }
  return value;
}

function readOptionalString(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): string | undefined {
  if (value === undefined) return undefined;
  return readString(value, pathValue, diagnostics);
}

function readNonNegativeInteger(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be a non-negative integer.`));
    return undefined;
  }
  return value;
}

function readAnimationName(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): string | undefined {
  const animation = readString(value, pathValue, diagnostics);
  if (animation === undefined) return undefined;
  if (!ANIMATION_NAMES.has(animation)) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be a valid animation name.`));
    return undefined;
  }
  return animation;
}

function readBodyTypeArray(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be a non-empty body type array.`));
    return undefined;
  }
  const bodyTypes: string[] = [];
  value.forEach((entry, index) => {
    const itemPath = `${pathValue}[${index}]`;
    const bodyType = readString(entry, itemPath, diagnostics);
    if (bodyType === undefined) return;
    if (!BODY_TYPE_NAMES.has(bodyType)) {
      diagnostics.push(invalidReportField(itemPath, `Audit report field ${itemPath} must be a valid body type.`));
      return;
    }
    bodyTypes.push(bodyType);
  });
  return bodyTypes;
}

function readStringArray(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
  options?: {
    readonly allowEmpty?: boolean;
    readonly allowedValues?: ReadonlySet<string>;
  },
): readonly string[] | undefined {
  if (!Array.isArray(value) || (!(options?.allowEmpty ?? true) && value.length === 0)) {
    diagnostics.push(invalidReportField(
      pathValue,
      `Audit report field ${pathValue} must be ${options?.allowEmpty ?? true ? 'an array' : 'a non-empty array'} of strings.`,
    ));
    return undefined;
  }
  const strings: string[] = [];
  value.forEach((entry, index) => {
    const itemPath = `${pathValue}[${index}]`;
    const stringValue = readString(entry, itemPath, diagnostics);
    if (stringValue === undefined) return;
    if (options?.allowedValues && !options.allowedValues.has(stringValue)) {
      diagnostics.push(invalidReportField(itemPath, `Audit report field ${itemPath} has an unsupported value.`));
      return;
    }
    strings.push(stringValue);
  });
  return strings;
}

function validateConsumer(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): value is AnimationAuditConsumer {
  if (!isRecord(value)) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be an object.`));
    return false;
  }

  let valid = true;
  valid = readString(value.itemId, `${pathValue}.itemId`, diagnostics) !== undefined && valid;
  valid = readString(value.typeName, `${pathValue}.typeName`, diagnostics) !== undefined && valid;

  const layer = readString(value.layer, `${pathValue}.layer`, diagnostics);
  if (layer === undefined || !LAYER_NAME.test(layer)) {
    if (layer !== undefined) {
      diagnostics.push(invalidReportField(`${pathValue}.layer`, `Audit report field ${pathValue}.layer must match layer_<number>.`));
    }
    valid = false;
  }

  valid = readBodyTypeArray(value.bodyTypes, `${pathValue}.bodyTypes`, diagnostics) !== undefined && valid;
  valid = readStringArray(value.recolors, `${pathValue}.recolors`, diagnostics, { allowEmpty: true }) !== undefined && valid;
  valid = readOptionalString(value.variant, `${pathValue}.variant`, diagnostics) !== undefined || value.variant === undefined
    ? valid
    : false;
  return valid;
}

function validateUnsupportedRequirement(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
  findingIdentity?: AssetIdentity,
): boolean {
  if (!validateConsumer(value, pathValue, diagnostics) || !isRecord(value)) return false;

  let valid = true;
  const requirementItemId = readString(value.itemId, `${pathValue}.itemId`, diagnostics);
  const requirementTypeName = readString(value.typeName, `${pathValue}.typeName`, diagnostics);
  if (findingIdentity && requirementItemId !== undefined && requirementItemId !== findingIdentity.itemId) {
    diagnostics.push(invalidReportField(
      `${pathValue}.itemId`,
      `Audit report field ${pathValue}.itemId must match the unsupported finding itemId.`,
    ));
    valid = false;
  }
  if (findingIdentity && requirementTypeName !== undefined && requirementTypeName !== findingIdentity.typeName) {
    diagnostics.push(invalidReportField(
      `${pathValue}.typeName`,
      `Audit report field ${pathValue}.typeName must match the unsupported finding typeName.`,
    ));
    valid = false;
  }

  const pathConfidence = readString(value.pathConfidence, `${pathValue}.pathConfidence`, diagnostics);
  if (pathConfidence === undefined || !PATH_CONFIDENCE_VALUES.has(pathConfidence)) {
    if (pathConfidence !== undefined) {
      diagnostics.push(invalidReportField(
        `${pathValue}.pathConfidence`,
        `Audit report field ${pathValue}.pathConfidence must be "inferred" or "manual-review".`,
      ));
    }
    return false;
  }

  const expectedPath = readOptionalString(value.expectedPath, `${pathValue}.expectedPath`, diagnostics);
  const manualReviewReason = readOptionalString(
    value.manualReviewReason,
    `${pathValue}.manualReviewReason`,
    diagnostics,
  );

  if (pathConfidence === 'inferred') {
    if (expectedPath === undefined) {
      diagnostics.push(invalidReportField(
        `${pathValue}.expectedPath`,
        `Audit report field ${pathValue}.expectedPath is required when pathConfidence is inferred.`,
      ));
      return false;
    }
    if (manualReviewReason !== undefined) {
      diagnostics.push(invalidReportField(
        `${pathValue}.manualReviewReason`,
        `Audit report field ${pathValue}.manualReviewReason must be omitted when pathConfidence is inferred.`,
      ));
      return false;
    }
    return valid;
  }

  if (expectedPath !== undefined) {
    diagnostics.push(invalidReportField(
      `${pathValue}.expectedPath`,
      `Audit report field ${pathValue}.expectedPath must be omitted when pathConfidence is manual-review.`,
    ));
    return false;
  }
  if (manualReviewReason === undefined) {
    diagnostics.push(invalidReportField(
      `${pathValue}.manualReviewReason`,
      `Audit report field ${pathValue}.manualReviewReason is required when pathConfidence is manual-review.`,
    ));
    return false;
  }
  return valid;
}

function validateUnsupportedFinding(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): boolean {
  if (!isRecord(value)) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be an object.`));
    return false;
  }

  let valid = true;
  const findingItemId = readString(value.itemId, `${pathValue}.itemId`, diagnostics);
  const findingTypeName = readString(value.typeName, `${pathValue}.typeName`, diagnostics);
  valid = findingItemId !== undefined && valid;
  valid = findingTypeName !== undefined && valid;
  valid = readAnimationName(value.animation, `${pathValue}.animation`, diagnostics) !== undefined && valid;
  valid = readStringArray(
    value.nativeAnimations,
    `${pathValue}.nativeAnimations`,
    diagnostics,
    { allowEmpty: true, allowedValues: ANIMATION_NAMES },
  ) !== undefined && valid;
  valid = readStringArray(
    value.compatibleAnimations,
    `${pathValue}.compatibleAnimations`,
    diagnostics,
    { allowEmpty: true, allowedValues: ANIMATION_NAMES },
  ) !== undefined && valid;

  if (!Array.isArray(value.requirements) || value.requirements.length === 0) {
    diagnostics.push(invalidReportField(
      `${pathValue}.requirements`,
      `Audit report field ${pathValue}.requirements must be a non-empty array.`,
    ));
    return false;
  }
  value.requirements.forEach((requirement, index) => {
    valid = validateUnsupportedRequirement(
      requirement,
      `${pathValue}.requirements[${index}]`,
      diagnostics,
      findingItemId && findingTypeName
        ? { itemId: findingItemId, typeName: findingTypeName }
        : undefined,
    ) && valid;
  });
  return valid;
}

function validateMissingFileFinding(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): boolean {
  if (!isRecord(value)) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be an object.`));
    return false;
  }

  let valid = true;
  valid = readString(value.path, `${pathValue}.path`, diagnostics) !== undefined && valid;
  valid = readAnimationName(value.animation, `${pathValue}.animation`, diagnostics) !== undefined && valid;
  valid = readAnimationName(value.sourceAnimation, `${pathValue}.sourceAnimation`, diagnostics) !== undefined && valid;

  if (!Array.isArray(value.consumers) || value.consumers.length === 0) {
    diagnostics.push(invalidReportField(
      `${pathValue}.consumers`,
      `Audit report field ${pathValue}.consumers must be a non-empty array.`,
    ));
    return false;
  }
  value.consumers.forEach((consumer, index) => {
    valid = validateConsumer(consumer, `${pathValue}.consumers[${index}]`, diagnostics) && valid;
  });
  return valid;
}

function validateBlankFrame(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): boolean {
  if (!isRecord(value)) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be an object.`));
    return false;
  }

  let valid = true;
  valid = readNonNegativeInteger(value.sourceColumn, `${pathValue}.sourceColumn`, diagnostics) !== undefined && valid;
  const logicalFrameIndices = value.logicalFrameIndices;
  if (!Array.isArray(logicalFrameIndices) || logicalFrameIndices.length === 0) {
    diagnostics.push(invalidReportField(
      `${pathValue}.logicalFrameIndices`,
      `Audit report field ${pathValue}.logicalFrameIndices must be a non-empty array.`,
    ));
    return false;
  }
  logicalFrameIndices.forEach((frameIndex, index) => {
    valid = readNonNegativeInteger(
      frameIndex,
      `${pathValue}.logicalFrameIndices[${index}]`,
      diagnostics,
    ) !== undefined && valid;
  });
  return valid;
}

function validateBlankFramesFinding(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): boolean {
  if (!isRecord(value)) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be an object.`));
    return false;
  }

  let valid = true;
  valid = readString(value.path, `${pathValue}.path`, diagnostics) !== undefined && valid;
  valid = readAnimationName(value.animation, `${pathValue}.animation`, diagnostics) !== undefined && valid;
  valid = readAnimationName(value.sourceAnimation, `${pathValue}.sourceAnimation`, diagnostics) !== undefined && valid;
  valid = readNonNegativeInteger(value.sourceRow, `${pathValue}.sourceRow`, diagnostics) !== undefined && valid;

  if (value.direction !== undefined) {
    const direction = readString(value.direction, `${pathValue}.direction`, diagnostics);
    if (direction === undefined || !DIRECTION_NAMES.has(direction)) {
      if (direction !== undefined) {
        diagnostics.push(invalidReportField(`${pathValue}.direction`, `Audit report field ${pathValue}.direction must be a valid direction.`));
      }
      valid = false;
    }
  }

  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    diagnostics.push(invalidReportField(
      `${pathValue}.frames`,
      `Audit report field ${pathValue}.frames must be a non-empty array.`,
    ));
    return false;
  }
  value.frames.forEach((frame, index) => {
    valid = validateBlankFrame(frame, `${pathValue}.frames[${index}]`, diagnostics) && valid;
  });

  if (!Array.isArray(value.consumers) || value.consumers.length === 0) {
    diagnostics.push(invalidReportField(
      `${pathValue}.consumers`,
      `Audit report field ${pathValue}.consumers must be a non-empty array.`,
    ));
    return false;
  }
  value.consumers.forEach((consumer, index) => {
    valid = validateConsumer(consumer, `${pathValue}.consumers[${index}]`, diagnostics) && valid;
  });
  return valid;
}

function validateInspectionError(
  value: unknown,
  pathValue: string,
  diagnostics: AssetPackScaffoldDiagnostic[],
): boolean {
  if (!isRecord(value)) {
    diagnostics.push(invalidReportField(pathValue, `Audit report field ${pathValue} must be an object.`));
    return false;
  }

  let valid = true;
  const kind = readString(value.kind, `${pathValue}.kind`, diagnostics);
  if (kind === undefined || !INSPECTION_ERROR_KINDS.has(kind)) {
    if (kind !== undefined) {
      diagnostics.push(invalidReportField(`${pathValue}.kind`, `Audit report field ${pathValue}.kind has an unsupported value.`));
    }
    valid = false;
  }
  valid = readString(value.message, `${pathValue}.message`, diagnostics) !== undefined && valid;
  valid = readOptionalString(value.path, `${pathValue}.path`, diagnostics) !== undefined || value.path === undefined
    ? valid
    : false;

  if (!Array.isArray(value.consumers) || value.consumers.length === 0) {
    diagnostics.push(invalidReportField(
      `${pathValue}.consumers`,
      `Audit report field ${pathValue}.consumers must be a non-empty array.`,
    ));
    return false;
  }
  value.consumers.forEach((consumer, index) => {
    valid = validateConsumer(consumer, `${pathValue}.consumers[${index}]`, diagnostics) && valid;
  });
  return valid;
}

function validateAuditReportData(
  value: unknown,
  diagnostics: AssetPackScaffoldDiagnostic[],
): value is AssetAnimationAuditReport {
  if (!isRecord(value)) {
    diagnostics.push(invalidReportField('$.data', 'Audit report data must be an object.'));
    return false;
  }

  let valid = true;
  valid = readStringArray(value.targets, '$.data.targets', diagnostics, {
    allowEmpty: false,
    allowedValues: ANIMATION_NAMES,
  }) !== undefined && valid;

  if (!isRecord(value.scope)) {
    diagnostics.push(invalidReportField('$.data.scope', 'Audit report field $.data.scope must be an object.'));
    valid = false;
  } else {
    valid = readOptionalString(value.scope.typeName, '$.data.scope.typeName', diagnostics) !== undefined || value.scope.typeName === undefined
      ? valid
      : false;
    const bodyType = readOptionalString(value.scope.bodyType, '$.data.scope.bodyType', diagnostics);
    if (bodyType !== undefined && !BODY_TYPE_NAMES.has(bodyType)) {
      diagnostics.push(invalidReportField('$.data.scope.bodyType', 'Audit report field $.data.scope.bodyType must be a valid body type.'));
      valid = false;
    } else if (bodyType === undefined && value.scope.bodyType !== undefined) {
      valid = false;
    }
  }

  if (!isRecord(value.summary)) {
    diagnostics.push(invalidReportField('$.data.summary', 'Audit report field $.data.summary must be an object.'));
    valid = false;
  } else {
    const summary = value.summary;
    const summaryPath = '$.data.summary';
    valid = readNonNegativeInteger(summary.itemsScanned, `${summaryPath}.itemsScanned`, diagnostics) !== undefined && valid;
    valid = readNonNegativeInteger(summary.incompleteItems, `${summaryPath}.incompleteItems`, diagnostics) !== undefined && valid;
    valid = readNonNegativeInteger(summary.unsupported, `${summaryPath}.unsupported`, diagnostics) !== undefined && valid;
    valid = readNonNegativeInteger(summary.missingFiles, `${summaryPath}.missingFiles`, diagnostics) !== undefined && valid;
    valid = readNonNegativeInteger(summary.blankFrames, `${summaryPath}.blankFrames`, diagnostics) !== undefined && valid;
    valid = readNonNegativeInteger(summary.errors, `${summaryPath}.errors`, diagnostics) !== undefined && valid;
  }

  if (!Array.isArray(value.unsupported)) {
    diagnostics.push(invalidReportField('$.data.unsupported', 'Audit report field $.data.unsupported must be an array.'));
    valid = false;
  } else {
    value.unsupported.forEach((finding, index) => {
      valid = validateUnsupportedFinding(finding, `$.data.unsupported[${index}]`, diagnostics) && valid;
    });
  }

  if (!Array.isArray(value.missingFiles)) {
    diagnostics.push(invalidReportField('$.data.missingFiles', 'Audit report field $.data.missingFiles must be an array.'));
    valid = false;
  } else {
    value.missingFiles.forEach((finding, index) => {
      valid = validateMissingFileFinding(finding, `$.data.missingFiles[${index}]`, diagnostics) && valid;
    });
  }

  if (!Array.isArray(value.blankFrames)) {
    diagnostics.push(invalidReportField('$.data.blankFrames', 'Audit report field $.data.blankFrames must be an array.'));
    valid = false;
  } else {
    value.blankFrames.forEach((finding, index) => {
      valid = validateBlankFramesFinding(finding, `$.data.blankFrames[${index}]`, diagnostics) && valid;
    });
  }

  if (!Array.isArray(value.errors)) {
    diagnostics.push(invalidReportField('$.data.errors', 'Audit report field $.data.errors must be an array.'));
    valid = false;
  } else {
    value.errors.forEach((error, index) => {
      valid = validateInspectionError(error, `$.data.errors[${index}]`, diagnostics) && valid;
    });
  }

  if (
    isRecord(value.summary)
    && Array.isArray(value.unsupported)
    && Array.isArray(value.missingFiles)
    && Array.isArray(value.blankFrames)
    && Array.isArray(value.errors)
  ) {
    const summary = value.summary;
    const counts = [
      ['unsupported', value.unsupported.length],
      ['missingFiles', value.missingFiles.length],
      ['blankFrames', value.blankFrames.length],
      ['errors', value.errors.length],
    ] as const;
    counts.forEach(([field, expected]) => {
      const actual = summary[field];
      if (typeof actual === 'number' && actual !== expected) {
        diagnostics.push(invalidReportField(
          `$.data.summary.${field}`,
          `Audit report field $.data.summary.${field} must match the ${field} array length.`,
        ));
        valid = false;
      }
    });
  }

  return valid;
}

export function scaffoldNewAssetPack(
  request: NewAssetPackScaffoldRequest,
): AssetPackScaffoldResult {
  const packRoot = path.resolve(request.outputDirectory);
  return publishPack(packRoot, (stagingRoot) => {
    const manifest = {
      schema: ASSET_PACK_SCHEMA,
      id: request.packId,
      version: request.version,
      displayName: request.displayName,
      credits: request.credits,
      assets: [{
        kind: 'new-item' as const,
        localId: request.localId,
        displayName: titleCaseFromSlug(request.localId),
        typeName: request.typeName,
        bodyTypes: [...request.bodyTypes],
        animations: [...request.animations],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: request.animations.map((animation) => ({
            animation,
            source: `sprites/${request.localId}/foreground/${animation}.png`,
          })),
        }],
      }],
    };
    writeJson(path.join(stagingRoot, 'asset-pack.json'), manifest);
    scaffoldSourceDirectories(
      stagingRoot,
      request.animations.map((animation) => `sprites/${request.localId}/foreground/${animation}.png`),
    );
    if (request.advanced) {
      writeFileSync(
        path.join(stagingRoot, 'README.md'),
        [
          '# Asset pack scaffold',
          '',
          'Optional next steps:',
          '- add variants when the item needs them',
          '- add recolor only after choosing a real palette contract',
          '- add credit overrides only for source-specific attribution changes',
          '',
        ].join('\n'),
      );
    }
  });
}

function readAuditEnvelope(reportPath: string): AuditEnvelopeSuccess | AssetPackScaffoldFailure {
  let envelope: unknown;
  try {
    envelope = JSON.parse(readFileSync(reportPath, 'utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: error instanceof Error ? error.message : 'Invalid audit report JSON.',
        path: reportPath,
      }],
    };
  }

  if (!isRecord(envelope) || !('ok' in envelope) || !('command' in envelope) || !('data' in envelope)) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Audit report must be a successful catalog audit-animations envelope.',
        path: reportPath,
      }],
    };
  }

  if (envelope.ok !== true || envelope.command !== 'catalog audit-animations') {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Audit report must be a successful catalog audit-animations envelope.',
        path: reportPath,
      }],
    };
  }

  if (!Array.isArray(envelope.errors) || envelope.errors.length > 0) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Audit report must be a successful catalog audit-animations envelope.',
        path: reportPath,
      }],
    };
  }

  const diagnostics: AssetPackScaffoldDiagnostic[] = [];
  if (!validateAuditReportData(envelope.data, diagnostics)) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    envelope: envelope as unknown as AuditEnvelope & { readonly data: AssetAnimationAuditReport },
  };
}

function matchesSelection(
  request: AuditAssetPackScaffoldRequest,
  consumer: AnimationAuditConsumer,
  animation: string,
): boolean {
  const itemSelected = request.itemIds.length === 0 || request.itemIds.includes(consumer.itemId);
  const typeSelected = request.typeNames.length === 0 || request.typeNames.includes(consumer.typeName);
  const identitySelected = request.itemIds.length > 0 || request.typeNames.length > 0
    ? itemSelected && typeSelected
    : false;
  const animationSelected = request.animations.length === 0 || request.animations.includes(animation);
  const bodySelected = request.bodyTypes.length === 0
    || consumer.bodyTypes.some((bodyType) => request.bodyTypes.includes(bodyType));
  return identitySelected && animationSelected && bodySelected;
}

function combineConsumers(
  consumers: readonly AnimationAuditConsumer[],
): readonly AnimationAuditConsumer[] {
  return [...consumers].sort((left, right) =>
    [
      left.itemId,
      left.typeName,
      left.layer,
      left.bodyTypes.join('\u0000'),
      left.variant ?? '',
      left.recolors.join('\u0000'),
    ].join('\u0000').localeCompare([
      right.itemId,
      right.typeName,
      right.layer,
      right.bodyTypes.join('\u0000'),
      right.variant ?? '',
      right.recolors.join('\u0000'),
    ].join('\u0000')));
}

function sourcePathFor(
  itemId: string,
  animation: string,
  layer: string,
  variant?: string,
): string {
  const suffix = variant ? `-${slug(variant)}` : '';
  return `sprites/${slug(itemId)}/${slug(animation)}/${slug(layer)}${suffix}.png`;
}

function draftKey(
  itemId: string,
  animation: string,
  layer: string,
  variant: string | undefined,
  destinationPath: string,
  evidence: 'audit-exact' | 'audit-inferred',
): string {
  return [itemId, animation, layer, variant ?? '', destinationPath, evidence].join('\u0000');
}

function buildDrafts(
  request: AuditAssetPackScaffoldRequest,
  report: AssetAnimationAuditReport,
): {
  readonly drafts: readonly ExtendAssetDraft[];
  readonly diagnostics: readonly AssetPackScaffoldDiagnostic[];
} {
  const diagnostics: AssetPackScaffoldDiagnostic[] = [];
  const byItem = new Map<string, Map<string, ExtendLayerDraft>>();

  report.unsupported.forEach((finding) => {
    finding.requirements.forEach((requirement) => {
      if (requirement.itemId !== finding.itemId || requirement.typeName !== finding.typeName) {
        diagnostics.push({
          code: 'audit_report_invalid_v1',
          message: 'Unsupported finding requirements must match the parent finding identity before scaffolding.',
          findingType: 'unsupported',
          itemId: finding.itemId,
          details: {
            animation: finding.animation,
            findingItemId: finding.itemId,
            findingTypeName: finding.typeName,
            requirementItemId: requirement.itemId,
            requirementTypeName: requirement.typeName,
            layer: requirement.layer,
          },
        });
        return;
      }
      if (!matchesSelection(request, requirement, finding.animation)) return;
      if (requirement.pathConfidence === 'manual-review' || !requirement.expectedPath) {
        diagnostics.push({
          code: 'finding_not_scaffoldable_v1',
          message: requirement.manualReviewReason ?? 'Selected finding requires manual review.',
          findingType: 'unsupported',
          itemId: finding.itemId,
          details: {
            animation: finding.animation,
            layer: requirement.layer,
          },
        });
        return;
      }
      const itemDrafts = byItem.get(finding.itemId) ?? new Map<string, ExtendLayerDraft>();
      byItem.set(finding.itemId, itemDrafts);
      const key = draftKey(
        finding.itemId,
        finding.animation,
        requirement.layer,
        requirement.variant,
        requirement.expectedPath,
        'audit-inferred',
      );
      const existing = itemDrafts.get(key);
      const consumers = existing ? [...existing.consumers, requirement] : [requirement];
      const bodyTypes = sortedUnique([
        ...(existing?.bodyTypes ?? []),
        ...requirement.bodyTypes,
      ]);
      itemDrafts.set(key, {
        layer: requirement.layer,
        bodyTypes,
        source: sourcePathFor(
          finding.itemId,
          finding.animation,
          requirement.layer,
          requirement.variant,
        ),
        destination: {
          path: requirement.expectedPath,
          evidence: 'audit-inferred',
          accepted: false,
        },
        ...(requirement.variant ? { variant: requirement.variant } : {}),
        consumers: combineConsumers(consumers),
      });
    });
  });

  report.missingFiles.forEach((finding) => {
    finding.consumers.forEach((consumer) => {
      if (!matchesSelection(request, consumer, finding.animation)) return;
      const itemDrafts = byItem.get(consumer.itemId) ?? new Map<string, ExtendLayerDraft>();
      byItem.set(consumer.itemId, itemDrafts);
      const key = draftKey(
        consumer.itemId,
        finding.animation,
        consumer.layer,
        consumer.variant,
        finding.path,
        'audit-exact',
      );
      const existing = itemDrafts.get(key);
      const consumers = existing ? [...existing.consumers, consumer] : [consumer];
      const bodyTypes = sortedUnique([
        ...(existing?.bodyTypes ?? []),
        ...consumer.bodyTypes,
      ]);
      itemDrafts.set(key, {
        layer: consumer.layer,
        bodyTypes,
        source: sourcePathFor(
          consumer.itemId,
          finding.animation,
          consumer.layer,
          consumer.variant,
        ),
        destination: {
          path: finding.path,
          evidence: 'audit-exact',
          accepted: true,
        },
        ...(consumer.variant ? { variant: consumer.variant } : {}),
        consumers: combineConsumers(consumers),
      });
    });
  });

  report.blankFrames.forEach((finding) => {
    finding.consumers.forEach((consumer) => {
      if (!matchesSelection(request, consumer, finding.animation)) return;
      diagnostics.push({
        code: 'finding_not_scaffoldable_v1',
        message: 'Selected blank-frame findings must be resolved before scaffolding.',
        findingType: 'blankFrames',
        itemId: consumer.itemId,
        details: {
          animation: finding.animation,
          path: finding.path,
          layer: consumer.layer,
        },
      });
    });
  });

  const drafts = [...byItem.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, layers]) => {
      const firstLayer = layers.values().next().value;
      const typeName = firstLayer?.consumers[0]?.typeName;
      const byAnimation = new Map<string, ExtendLayerDraft[]>();
      [...layers.values()].forEach((layer) => {
        const animation = layer.source.split('/')[2] ?? '';
        const group = byAnimation.get(animation) ?? [];
        group.push(layer);
        byAnimation.set(animation, group);
      });
      return {
        itemId,
        typeName: typeof typeName === 'string' ? typeName : '',
        addAnimations: [...byAnimation.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([animation, layerDrafts]) => ({
            animation,
            layers: layerDrafts.sort((left, right) =>
              left.layer.localeCompare(right.layer)
              || (left.variant ?? '').localeCompare(right.variant ?? '')
              || left.destination.path.localeCompare(right.destination.path)),
          })),
      } satisfies ExtendAssetDraft;
    });

  return { drafts, diagnostics };
}

function missingDigest(
  itemId: string,
  kind: 'definition' | 'credit',
): AssetPackScaffoldDiagnostic {
  return {
    code: 'audit_report_invalid_v1',
    message: `Missing active baseline ${kind} digest for ${itemId}.`,
    itemId,
  };
}

export function scaffoldAuditAssetPack(
  request: AuditAssetPackScaffoldRequest,
  baseline: AssetPackScaffoldBaselineDigests,
): AssetPackScaffoldResult {
  if (request.itemIds.length === 0 && request.typeNames.length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Audit scaffold requires at least one --item or --type selector.',
        path: request.reportPath,
      }],
    };
  }

  const envelope = readAuditEnvelope(request.reportPath);
  if (envelope.ok === false) return envelope;

  const report = envelope.envelope.data;
  const built = buildDrafts(request, report);
  if (built.diagnostics.length > 0) {
    return { ok: false, diagnostics: built.diagnostics };
  }
  if (built.drafts.length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Selected findings did not match any scaffoldable work.',
        path: request.reportPath,
      }],
    };
  }

  const digestDiagnostics = built.drafts.flatMap((draft) => {
    const issues: AssetPackScaffoldDiagnostic[] = [];
    if (!baseline.definitionDigests.has(draft.itemId)) {
      issues.push(missingDigest(draft.itemId, 'definition'));
    }
    if (!baseline.creditDigests.has(draft.itemId)) {
      issues.push(missingDigest(draft.itemId, 'credit'));
    }
    return issues;
  });
  if (digestDiagnostics.length > 0) {
    return { ok: false, diagnostics: digestDiagnostics };
  }

  const packRoot = path.resolve(request.pack.outputDirectory);
  return publishPack(packRoot, (stagingRoot) => {
    const assets = built.drafts.map((draft) => ({
      kind: 'extend-item' as const,
      itemId: draft.itemId,
      baseDefinitionDigest: baseline.definitionDigests.get(draft.itemId)!,
      baseCreditDigest: baseline.creditDigests.get(draft.itemId)!,
      addAnimations: draft.addAnimations.map((animation) => ({
        animation: animation.animation,
        layers: animation.layers.map((layer) => ({
          layer: layer.layer,
          bodyTypes: [...layer.bodyTypes],
          source: layer.source,
          destination: layer.destination,
          ...(layer.variant ? { variant: layer.variant } : {}),
          consumers: layer.consumers.map((consumer) => ({
            itemId: consumer.itemId,
            typeName: consumer.typeName,
            layer: consumer.layer,
            bodyTypes: [...consumer.bodyTypes],
            ...(consumer.variant ? { variant: consumer.variant } : {}),
            recolors: [...consumer.recolors],
          })),
        })),
      })),
    }));

    writeJson(path.join(stagingRoot, 'asset-pack.json'), {
      schema: ASSET_PACK_SCHEMA,
      id: request.pack.packId,
      version: request.pack.version,
      displayName: request.pack.displayName,
      credits: request.pack.credits,
      assets,
    });

    scaffoldSourceDirectories(
      stagingRoot,
      assets.flatMap((asset) => asset.addAnimations.flatMap((animation) =>
        animation.layers.map((layer) => layer.source))),
    );
  });
}
