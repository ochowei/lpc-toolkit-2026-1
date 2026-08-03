import {
  animationAuditGeometry,
  type AnimationAuditConsumer,
  type AnimationAuditGeometry,
} from './asset-animation-audit.js';
import { BODY_TYPES, type Direction } from './constants.js';
import type {
  AssetAuthoringPathConfidence,
  AssetAuthoringPlan,
} from './asset-authoring-schema.js';
import type {
  AnimationName,
  BodyType,
  ItemId,
  TypeName,
} from './types.js';

export const SPRITE_DRAWING_CONTRACT_SCHEMA = 'lpc-toolkit.sprite-drawing-contract.v1' as const;

export type SpriteDrawingCellPolicy =
  | 'required-drawn'
  | 'optional-transparent'
  | 'required-transparent'
  | 'unchanged';

export type SpriteDrawingWorkKind = 'new-item' | 'missing-file' | 'blank-frame-repair';

export interface SpriteDrawingSourceReference {
  /** A portable authoring/source path, never an absolute filesystem path. */
  readonly logicalPath: string;
  readonly digest?: string;
}

export interface SpriteDrawingReference {
  readonly id: string;
  readonly digest: string;
}

export interface SpriteDrawingBaselineCell {
  readonly sourceRow: number;
  readonly sourceColumn: number;
  readonly digest: string;
}

export interface SpriteDrawingBaselineReference extends SpriteDrawingReference {
  readonly cells: readonly SpriteDrawingBaselineCell[];
}

export interface SpriteDrawingLayerContext {
  readonly id: string;
  readonly zPos: number;
}

export interface SpriteDrawingCellPolicyInput {
  readonly sourceRow: number;
  readonly sourceColumn: number;
  readonly policy: SpriteDrawingCellPolicy;
  readonly baselineDigest?: string;
}

export interface SpriteDrawingTargetInput {
  /** The exact portable logical destination path for the candidate PNG. */
  readonly path: string;
  readonly source: SpriteDrawingSourceReference;
  readonly animation: AnimationName;
  readonly sourceAnimation?: AnimationName;
  readonly layer: SpriteDrawingLayerContext;
  readonly bodyTypes: readonly BodyType[];
  readonly variant?: string;
  readonly consumers: readonly AnimationAuditConsumer[];
  readonly work: SpriteDrawingWorkKind;
  readonly pathConfidence?: AssetAuthoringPathConfidence;
  readonly references?: readonly SpriteDrawingReference[];
  readonly baseline?: SpriteDrawingBaselineReference;
  readonly defaultCellPolicy?: SpriteDrawingCellPolicy;
  readonly policyOverrides?: readonly SpriteDrawingCellPolicyInput[];
}

export interface SpriteDrawingCell {
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly sourceColumn: number;
  readonly logicalFrameIndices: readonly number[];
  readonly policy: SpriteDrawingCellPolicy;
  readonly baselineDigest?: string;
}

export interface SpriteDrawingRow {
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly cells: readonly SpriteDrawingCell[];
}

export interface SpriteDrawingGeometry {
  readonly kind: AnimationAuditGeometry['kind'];
  readonly frameSize: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly rows: readonly SpriteDrawingRow[];
}

export interface SpriteDrawingTransparencyRules {
  readonly encoding: 'png';
  readonly colorModel: 'rgba';
  readonly background: 'transparent';
}

export interface SpriteDrawingTarget {
  readonly id: string;
  readonly path: string;
  readonly source: SpriteDrawingSourceReference;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly layer: SpriteDrawingLayerContext;
  readonly bodyTypes: readonly BodyType[];
  readonly variant?: string;
  readonly pathConfidence: AssetAuthoringPathConfidence;
  readonly consumers: readonly AnimationAuditConsumer[];
  readonly geometry: SpriteDrawingGeometry;
  readonly cells: readonly SpriteDrawingCell[];
  readonly references: readonly SpriteDrawingReference[];
  readonly baseline?: SpriteDrawingBaselineReference;
}

export interface SpriteDrawingContract {
  readonly schema: typeof SPRITE_DRAWING_CONTRACT_SCHEMA;
  readonly goal: AssetAuthoringPlan['goal'];
  readonly pack: {
    readonly id: string;
    readonly version: string;
  };
  readonly assetId?: ItemId;
  readonly typeName?: TypeName;
  readonly transparency: SpriteDrawingTransparencyRules;
  readonly targets: readonly SpriteDrawingTarget[];
}

export interface PlanSpriteDrawingContractOptions {
  readonly plan: AssetAuthoringPlan;
  readonly targets: readonly SpriteDrawingTargetInput[];
}

const TRANSPARENCY: SpriteDrawingTransparencyRules = {
  encoding: 'png',
  colorModel: 'rgba',
  background: 'transparent',
};

export function spriteDrawingTargetId(
  plan: AssetAuthoringPlan,
  target: SpriteDrawingTargetInput,
): string {
  const assetId = planAssetId(plan) ?? plan.pack.id;
  const sourceAnimation = target.sourceAnimation ?? target.animation;
  return [
    plan.pack.id,
    assetId,
    target.layer.id,
    canonicalBodyTypes(target.bodyTypes).join('-'),
    target.animation,
    sourceAnimation,
    target.variant ?? 'default',
  ].join('/');
}

export function planSpriteDrawingContract(
  options: PlanSpriteDrawingContractOptions,
): SpriteDrawingContract {
  const seenIds = new Set<string>();
  const targets = options.targets.map((input) => {
    const target = planTarget(options.plan, input);
    if (seenIds.has(target.id)) {
      throw new Error(`Duplicate sprite drawing target identity: ${target.id}`);
    }
    seenIds.add(target.id);
    return target;
  }).sort((left, right) => left.id.localeCompare(right.id));

  const assetId = planAssetId(options.plan);
  const typeName = planTypeName(options.plan);
  return {
    schema: SPRITE_DRAWING_CONTRACT_SCHEMA,
    goal: options.plan.goal,
    pack: {
      id: options.plan.pack.id,
      version: options.plan.pack.version,
    },
    ...(assetId ? { assetId } : {}),
    ...(typeName ? { typeName } : {}),
    transparency: TRANSPARENCY,
    targets,
  };
}

export function spriteDrawingContractProjection(
  contract: SpriteDrawingContract,
): unknown {
  return recursivelySortedProjection({
    schema: contract.schema,
    goal: contract.goal,
    pack: contract.pack,
    ...(contract.assetId ? { assetId: contract.assetId } : {}),
    ...(contract.typeName ? { typeName: contract.typeName } : {}),
    transparency: contract.transparency,
    targets: contract.targets.map((target) => ({
      id: target.id,
      path: target.path,
      source: target.source,
      animation: target.animation,
      sourceAnimation: target.sourceAnimation,
      layer: target.layer,
      bodyTypes: target.bodyTypes,
      ...(target.variant ? { variant: target.variant } : {}),
      pathConfidence: target.pathConfidence,
      consumers: target.consumers,
      geometry: target.geometry,
      cells: target.cells,
      references: target.references,
      ...(target.baseline ? { baseline: target.baseline } : {}),
    })),
  });
}

/** Returns canonical JSON input for a caller-owned cryptographic digest. */
export function spriteDrawingContractDigestInput(
  contract: SpriteDrawingContract,
): string {
  return JSON.stringify(spriteDrawingContractProjection(contract));
}

function planTarget(
  plan: AssetAuthoringPlan,
  input: SpriteDrawingTargetInput,
): SpriteDrawingTarget {
  validateTargetAgainstPlan(plan, input);
  const sourceAnimation = input.sourceAnimation ?? input.animation;
  const auditGeometry = animationAuditGeometry(sourceAnimation);
  const bodyTypes = canonicalBodyTypes(input.bodyTypes);
  const consumers = sortConsumers(input.consumers.map(normalizeConsumer));
  const baseline = input.baseline ? normalizeBaseline(input.baseline) : undefined;
  const references = referencesFor(plan, input, baseline);
  const geometry = drawingGeometry(auditGeometry, plan, input, baseline);
  const target = {
    id: spriteDrawingTargetId(plan, input),
    path: logicalPath(input.path, 'target path'),
    source: normalizeSource(input.source),
    animation: input.animation,
    sourceAnimation,
    layer: { id: input.layer.id, zPos: input.layer.zPos },
    bodyTypes,
    ...(input.variant ? { variant: input.variant } : {}),
    pathConfidence: input.pathConfidence
      ?? (plan.goal === 'extend-item' ? plan.remediation.pathConfidence : 'exact'),
    consumers,
    geometry,
    cells: geometry.rows.flatMap((row) => row.cells),
    references,
    ...(baseline ? { baseline } : {}),
  } satisfies SpriteDrawingTarget;
  return target;
}

function validateTargetAgainstPlan(
  plan: AssetAuthoringPlan,
  target: SpriteDrawingTargetInput,
): void {
  logicalPath(target.path, 'target path');
  logicalPath(target.source.logicalPath, 'source path');
  if (plan.goal === 'new-item' && target.work !== 'new-item') {
    throw new Error('New-item drawing targets must use new-item work.');
  }
  if (plan.goal === 'extend-item' && target.work === 'new-item') {
    throw new Error('Extension drawing targets cannot use new-item work.');
  }
  if (plan.goal === 'attach-pack') {
    throw new Error('Attach-pack plans cannot create sprite drawing targets.');
  }
  if (plan.goal !== 'extend-item') return;

  const finding = plan.remediation.selectedFinding;
  if (finding.category === 'unsupported') {
    throw new Error('Unsupported audit findings do not have a deterministic sprite drawing geometry.');
  }
  if (
    target.path !== finding.path
    || target.animation !== finding.animation
    || (target.sourceAnimation ?? target.animation) !== finding.sourceAnimation
  ) {
    throw new Error('Extension drawing target does not match the selected audit finding.');
  }
  if (target.work === 'blank-frame-repair' && finding.category !== 'blankFrames') {
    throw new Error('Blank-frame repair requires a blankFrames audit finding.');
  }
  if (target.work === 'missing-file' && finding.category !== 'missingFiles') {
    throw new Error('Missing-file work requires a missingFiles audit finding.');
  }
}

function drawingGeometry(
  auditGeometry: AnimationAuditGeometry,
  plan: AssetAuthoringPlan,
  target: SpriteDrawingTargetInput,
  baseline: SpriteDrawingBaselineReference | undefined,
): SpriteDrawingGeometry {
  const maxColumn = Math.max(
    ...auditGeometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  if (!Number.isInteger(maxColumn) || maxColumn < 0) {
    throw new Error('Registered animation geometry must contain at least one source cell.');
  }

  const policyByCell = new Map<string, SpriteDrawingCellPolicyInput>();
  const derivedPolicies = derivedPolicyInputs(plan, target);
  for (const policy of derivedPolicies) {
    const key = cellKey(policy.sourceRow, policy.sourceColumn);
    validateCellCoordinate(policy.sourceRow, policy.sourceColumn, auditGeometry.rows, maxColumn);
    policyByCell.set(key, policy);
  }
  const explicitPolicyKeys = new Set<string>();
  for (const policy of target.policyOverrides ?? []) {
    const key = cellKey(policy.sourceRow, policy.sourceColumn);
    validateCellCoordinate(policy.sourceRow, policy.sourceColumn, auditGeometry.rows, maxColumn);
    if (explicitPolicyKeys.has(key)) {
      throw new Error(`Duplicate drawing cell policy for ${key}.`);
    }
    explicitPolicyKeys.add(key);
    policyByCell.set(key, policy);
  }

  const baselineByCell = new Map<string, string>();
  for (const cell of baseline?.cells ?? []) {
    const key = cellKey(cell.sourceRow, cell.sourceColumn);
    validateCellCoordinate(cell.sourceRow, cell.sourceColumn, auditGeometry.rows, maxColumn);
    if (baselineByCell.has(key)) {
      throw new Error(`Duplicate baseline cell digest for ${key}.`);
    }
    baselineByCell.set(key, cell.digest);
  }

  const defaultPolicy = target.defaultCellPolicy
    ?? (target.work === 'blank-frame-repair' ? 'unchanged' : undefined);
  const rows = auditGeometry.rows.map((row) => {
    const registeredCells = new Map(
      row.cells.map((cell) => [cell.sourceColumn, cell.logicalFrameIndices] as const),
    );
    const cells = Array.from({ length: maxColumn + 1 }, (_, sourceColumn) => {
      const key = cellKey(row.sourceRow, sourceColumn);
      const override = policyByCell.get(key);
      const policy = override?.policy
        ?? defaultPolicy
        ?? (registeredCells.has(sourceColumn) ? 'required-drawn' : 'required-transparent');
      const baselineDigest = override?.baselineDigest ?? baselineByCell.get(key);
      if (policy === 'unchanged' && (!baseline || !baselineDigest)) {
        throw new Error(`Unchanged drawing cell ${key} requires a baseline digest.`);
      }
      return {
        sourceRow: row.sourceRow,
        ...(row.direction ? { direction: row.direction } : {}),
        sourceColumn,
        logicalFrameIndices: [...(registeredCells.get(sourceColumn) ?? [])],
        policy,
        ...(policy === 'unchanged' && baselineDigest ? { baselineDigest } : {}),
      } satisfies SpriteDrawingCell;
    });
    return {
      sourceRow: row.sourceRow,
      ...(row.direction ? { direction: row.direction } : {}),
      cells,
    } satisfies SpriteDrawingRow;
  });

  return {
    kind: auditGeometry.kind,
    frameSize: auditGeometry.frameSize,
    frameWidth: auditGeometry.frameSize,
    frameHeight: auditGeometry.frameSize,
    canvasWidth: (maxColumn + 1) * auditGeometry.frameSize,
    canvasHeight: auditGeometry.rows.length * auditGeometry.frameSize,
    rows,
  };
}

function derivedPolicyInputs(
  plan: AssetAuthoringPlan,
  target: SpriteDrawingTargetInput,
): readonly SpriteDrawingCellPolicyInput[] {
  if (
    plan.goal !== 'extend-item'
    || target.work !== 'blank-frame-repair'
    || plan.remediation.selectedFinding.category !== 'blankFrames'
  ) {
    return [];
  }
  const finding = plan.remediation.selectedFinding;
  if (finding.category !== 'blankFrames') return [];
  return finding.frames.map((frame) => ({
    sourceRow: finding.sourceRow,
    sourceColumn: frame.sourceColumn,
    policy: 'required-drawn' as const,
  }));
}

function validateCellCoordinate(
  sourceRow: number,
  sourceColumn: number,
  rows: readonly AnimationAuditGeometry['rows'][number][],
  maxColumn: number,
): void {
  if (
    !Number.isInteger(sourceRow)
    || !Number.isInteger(sourceColumn)
    || sourceRow < 0
    || sourceColumn < 0
    || sourceColumn > maxColumn
    || !rows.some((row) => row.sourceRow === sourceRow)
  ) {
    throw new Error(`Drawing cell ${cellKey(sourceRow, sourceColumn)} is outside registered geometry.`);
  }
}

function referencesFor(
  plan: AssetAuthoringPlan,
  target: SpriteDrawingTargetInput,
  baseline: SpriteDrawingBaselineReference | undefined,
): readonly SpriteDrawingReference[] {
  const references = new Map<string, SpriteDrawingReference>();
  const add = (reference: SpriteDrawingReference): void => {
    referenceId(reference.id, 'drawing reference id');
    if (reference.digest.length === 0) {
      throw new Error(`Drawing reference ${reference.id} requires a digest.`);
    }
    const existing = references.get(reference.id);
    if (existing && existing.digest !== reference.digest) {
      throw new Error(`Conflicting drawing reference digest for ${reference.id}.`);
    }
    references.set(reference.id, { id: reference.id, digest: reference.digest });
  };
  (target.references ?? []).forEach(add);
  if (plan.goal === 'extend-item') {
    add({ id: 'animation-audit-report', digest: plan.remediation.reportDigest });
  }
  if (baseline) add({ id: baseline.id, digest: baseline.digest });
  return [...references.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeBaseline(
  baseline: SpriteDrawingBaselineReference,
): SpriteDrawingBaselineReference {
  referenceId(baseline.id, 'baseline reference id');
  return {
    id: baseline.id,
    digest: baseline.digest,
    cells: [...baseline.cells]
      .map((cell) => ({ ...cell }))
      .sort((left, right) => left.sourceRow - right.sourceRow || left.sourceColumn - right.sourceColumn),
  };
}

function normalizeSource(source: SpriteDrawingSourceReference): SpriteDrawingSourceReference {
  return {
    logicalPath: logicalPath(source.logicalPath, 'source path'),
    ...(source.digest ? { digest: source.digest } : {}),
  };
}

function normalizeConsumer(consumer: AnimationAuditConsumer): AnimationAuditConsumer {
  return {
    itemId: consumer.itemId,
    typeName: consumer.typeName,
    layer: consumer.layer,
    bodyTypes: canonicalBodyTypes(consumer.bodyTypes),
    ...(consumer.variant ? { variant: consumer.variant } : {}),
    recolors: [...consumer.recolors].sort((left, right) => left.localeCompare(right)),
  };
}

function sortConsumers(
  consumers: readonly AnimationAuditConsumer[],
): readonly AnimationAuditConsumer[] {
  return [...consumers].sort((left, right) => compareValues([
    left.typeName,
    left.itemId,
    left.layer,
    left.bodyTypes.join('\u0000'),
    left.variant ?? '',
    left.recolors.join('\u0000'),
  ], [
    right.typeName,
    right.itemId,
    right.layer,
    right.bodyTypes.join('\u0000'),
    right.variant ?? '',
    right.recolors.join('\u0000'),
  ]));
}

function canonicalBodyTypes(bodyTypes: readonly BodyType[]): readonly BodyType[] {
  const requested = new Set(bodyTypes);
  return [
    ...BODY_TYPES.filter((bodyType) => requested.has(bodyType)),
    ...[...requested].filter((bodyType) => !BODY_TYPES.includes(bodyType as (typeof BODY_TYPES)[number]))
      .sort((left, right) => left.localeCompare(right)),
  ];
}

function planAssetId(plan: AssetAuthoringPlan): ItemId | undefined {
  if (plan.goal === 'new-item') return `${plan.pack.id}--${plan.asset.localId}`;
  if (plan.goal === 'extend-item') return plan.asset.itemId;
  return undefined;
}

function planTypeName(plan: AssetAuthoringPlan): TypeName | undefined {
  if (plan.goal === 'new-item' || plan.goal === 'extend-item') return plan.asset.typeName;
  return undefined;
}

function cellKey(sourceRow: number, sourceColumn: number): string {
  return `${sourceRow}:${sourceColumn}`;
}

function referenceId(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} must be non-empty.`);
  return value;
}

function logicalPath(value: string, label: string): string {
  if (
    value.length === 0
    || value.startsWith('/')
    || value.includes('\\')
    || value.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`${label} must be a non-empty portable logical path.`);
  }
  return value;
}

function compareValues(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const comparison = (left[index] ?? '').localeCompare(right[index] ?? '');
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function recursivelySortedProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => recursivelySortedProjection(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, recursivelySortedProjection(entry)] as const),
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
