export const ASSET_PACK_CONFLICT_SCHEMA =
  'lpc-toolkit.asset-pack-conflict.v1' as const;
export const ASSET_PACK_CONFLICT_SELECTION_SCHEMA =
  'lpc-toolkit.asset-pack-conflict-selection.v1' as const;
export const ASSET_PACK_CONFLICT_POLICY_SCHEMA =
  'lpc-toolkit.asset-pack-conflict-policy.v1' as const;
export const ASSET_PACK_RESOLUTION_SCHEMA =
  'lpc-toolkit.asset-pack-resolution.v1' as const;
export const ASSET_PACK_CONFLICT_AUDIT_SCHEMA =
  'lpc-toolkit.asset-pack-conflict-audit.v1' as const;

export const ASSET_PACK_CONFLICT_LIMITS = {
  contenders: 32,
  targets: 64,
  digestReferences: 96,
  semanticPatches: 128,
  diagnostics: 32,
  diagnosticBytes: 512,
  logicalIdentifierBytes: 256,
} as const;

export type AssetPackConflictTargetKind =
  | 'generated-destination'
  | 'definition'
  | 'credit'
  | 'replacement'
  | 'compatibility';

export type AssetPackConflictOriginKind =
  | 'pack-source'
  | 'installed-archive'
  | 'd5-candidate'
  | 'explicit-user-edit';

export type AssetPackConflictResolutionKind =
  | 'retain-current'
  | 'select-contender'
  | 'merge-disjoint'
  | 'decline';

export type AssetPackConflictStatus =
  | 'current'
  | 'equivalent'
  | 'selection-required'
  | 'resolved'
  | 'declined'
  | 'stale'
  | 'blocked'
  | 'tampered'
  | 'recoverable';

export type AssetPackConflictNextAction =
  | 'none'
  | 'reinspect-conflict'
  | 'refresh-conflict'
  | 'select-all-targets'
  | 'remove-incompatible-contender'
  | 'review-attribution'
  | 'discard-resolution'
  | 'confirm-resolution';

export type AssetPackConflictDiagnosticCode =
  | 'conflict_identity_changed'
  | 'conflict_baseline_stale'
  | 'conflict_selection_incomplete'
  | 'conflict_incompatible_pack'
  | 'conflict_attribution_incomplete'
  | 'conflict_resolution_tampered'
  | 'conflict_requires_confirmation'
  | 'conflict_merge_overlap'
  | 'conflict_invalid_selection'
  | 'conflict_schema_invalid';

export interface AssetPackConflictTarget {
  readonly kind: AssetPackConflictTargetKind;
  readonly key: string;
}

export interface AssetPackConflictCompatibility {
  readonly minimumCliVersion?: string;
  readonly requiredCapabilities: readonly string[];
}

export interface AssetPackConflictPackSnapshot {
  readonly packId: string;
  readonly version: string;
  readonly contentDigest: string;
  readonly sourceDigestSet: readonly string[];
  readonly manifestDigest: string;
  readonly archiveDigest?: string;
  readonly registryEntryDigest?: string;
  readonly trustReceiptDigest?: string;
  readonly compatibility: AssetPackConflictCompatibility;
  readonly generatedOwnership: readonly string[];
  readonly creditDigests: readonly string[];
  readonly licenseDigests: readonly string[];
  readonly acknowledgementDigests: readonly string[];
  readonly provenanceReferenceDigests: readonly string[];
}

export interface AssetPackConflictBaseline {
  readonly resultDigest: string;
  readonly snapshotDigest: string;
  readonly sourceReferenceDigests: readonly string[];
  readonly creditReferenceDigests: readonly string[];
  readonly licenseReferenceDigests: readonly string[];
  readonly provenanceReferenceDigests: readonly string[];
}

export interface AssetPackConflictSemanticPatch {
  readonly path: string;
  readonly baseDigest: string;
  readonly resultDigest: string;
}

export interface AssetPackConflictContenderCompatibility {
  readonly status: 'compatible' | 'incompatible';
  readonly digest: string;
  readonly diagnostics: readonly string[];
}

export interface AssetPackConflictTrustEvidence {
  readonly status: 'verified' | 'unverified' | 'blocked';
  readonly receiptDigests: readonly string[];
}

export interface AssetPackConflictContender {
  readonly contenderId: string;
  readonly pack: AssetPackConflictPackSnapshot;
  readonly target: AssetPackConflictTarget;
  readonly resultDigest: string;
  readonly baseSnapshotDigest: string;
  readonly sourceReferenceDigests: readonly string[];
  readonly creditReferenceDigests: readonly string[];
  readonly licenseReferenceDigests: readonly string[];
  readonly provenanceReferenceDigests: readonly string[];
  readonly compatibility: AssetPackConflictContenderCompatibility;
  readonly trust: AssetPackConflictTrustEvidence;
  readonly origin: AssetPackConflictOriginKind;
  readonly semanticPatches: readonly AssetPackConflictSemanticPatch[];
  readonly d5EvidenceDigests: readonly string[];
}

export interface AssetPackConflictCompatibilityReport {
  readonly status: 'compatible' | 'incompatible';
  readonly digest: string;
  readonly requiredCapabilities: readonly string[];
  readonly diagnostics: readonly string[];
}

export interface AssetPackConflictAttribution {
  readonly complete: boolean;
  readonly sourceReferenceDigests: readonly string[];
  readonly creditReferenceDigests: readonly string[];
  readonly licenseReferenceDigests: readonly string[];
  readonly acknowledgementDigests: readonly string[];
  readonly provenanceReferenceDigests: readonly string[];
}

export interface AssetPackConflictPolicy {
  readonly schema: typeof ASSET_PACK_CONFLICT_POLICY_SCHEMA;
  readonly allowedResolutions: readonly AssetPackConflictResolutionKind[];
  readonly explicitSelectionRequired: true;
  readonly digest: string;
}

export interface AssetPackConflictDiagnostic {
  readonly code: AssetPackConflictDiagnosticCode;
  readonly message: string;
  readonly targetKey?: string;
}

export interface AssetPackConflict {
  readonly schema: typeof ASSET_PACK_CONFLICT_SCHEMA;
  readonly conflictId: string;
  readonly workspaceBaselineDigest: string;
  readonly target: AssetPackConflictTarget;
  readonly baseline: AssetPackConflictBaseline;
  readonly contenders: readonly AssetPackConflictContender[];
  readonly compatibility: AssetPackConflictCompatibilityReport;
  readonly attribution: AssetPackConflictAttribution;
  readonly policy: AssetPackConflictPolicy;
  readonly status: AssetPackConflictStatus;
  readonly diagnostics: readonly AssetPackConflictDiagnostic[];
}

export interface AssetPackConflictSelectionTarget {
  readonly targetKey: string;
  readonly resolution: AssetPackConflictResolutionKind;
  readonly contenderIds: readonly string[];
  readonly reviewEvidenceDigests: readonly string[];
  readonly resultDigest?: string;
}

export interface AssetPackConflictSelection {
  readonly schema: typeof ASSET_PACK_CONFLICT_SELECTION_SCHEMA;
  readonly conflictId: string;
  readonly baselineDigest: string;
  readonly targets: readonly AssetPackConflictSelectionTarget[];
  readonly review: {
    readonly label: string;
    readonly reason: string;
  };
}

export interface AssetPackConflictResolutionTarget {
  readonly targetKey: string;
  readonly resolution: AssetPackConflictResolutionKind;
  readonly contenderIds: readonly string[];
  readonly resultDigest: string;
  readonly evidenceDigests: readonly string[];
}

export interface AssetPackConflictResolution {
  readonly schema: typeof ASSET_PACK_RESOLUTION_SCHEMA;
  readonly conflictId: string;
  readonly baselineDigest: string;
  readonly selectionDigest: string;
  readonly status: 'resolved' | 'declined';
  readonly targets: readonly AssetPackConflictResolutionTarget[];
  readonly evidenceDigests: readonly string[];
}

export interface AssetPackConflictEvaluation {
  readonly status: AssetPackConflictStatus;
  readonly eligibleContenderIds: readonly string[];
  readonly equivalentContenderIds: readonly string[];
  readonly nextAction: AssetPackConflictNextAction;
  readonly diagnostics: readonly AssetPackConflictDiagnostic[];
}

export type AssetPackConflictParseResult =
  | { readonly ok: true; readonly conflict: AssetPackConflict }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackConflictParseDiagnostic[] };

export interface AssetPackConflictParseDiagnostic {
  readonly code: 'conflict_schema_invalid' | 'conflict_digest_invalid';
  readonly path: string;
  readonly message: string;
}

export type AssetPackConflictSelectionParseResult =
  | { readonly ok: true; readonly selection: AssetPackConflictSelection }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackConflictParseDiagnostic[] };

export type AssetPackConflictResolutionResult =
  | {
    readonly ok: true;
    readonly resolution: AssetPackConflictResolution;
    readonly projection: unknown;
  }
  | {
    readonly ok: false;
    readonly code: AssetPackConflictDiagnosticCode;
    readonly message: string;
    readonly nextAction: AssetPackConflictNextAction;
  };

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const PORTABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const LOGICAL_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u;
const LOGICAL_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@-]*$/u;
const TARGET_KINDS: readonly AssetPackConflictTargetKind[] = [
  'generated-destination',
  'definition',
  'credit',
  'replacement',
  'compatibility',
];
const ORIGINS: readonly AssetPackConflictOriginKind[] = [
  'pack-source',
  'installed-archive',
  'd5-candidate',
  'explicit-user-edit',
];
const RESOLUTIONS: readonly AssetPackConflictResolutionKind[] = [
  'retain-current',
  'select-contender',
  'merge-disjoint',
  'decline',
];
const STATUSES: readonly AssetPackConflictStatus[] = [
  'current',
  'equivalent',
  'selection-required',
  'resolved',
  'declined',
  'stale',
  'blocked',
  'tampered',
  'recoverable',
];

type UnknownRecord = Readonly<Record<string, unknown>>;

export function parseAssetPackConflict(input: unknown): AssetPackConflictParseResult {
  const diagnostics: AssetPackConflictParseDiagnostic[] = [];
  const conflict = parseConflict(input, '$', diagnostics);
  return conflict !== undefined && diagnostics.length === 0
    ? { ok: true, conflict }
    : { ok: false, diagnostics };
}

export function parseAssetPackConflictSelection(
  input: unknown,
): AssetPackConflictSelectionParseResult {
  const diagnostics: AssetPackConflictParseDiagnostic[] = [];
  const selection = parseSelection(input, '$', diagnostics);
  return selection !== undefined && diagnostics.length === 0
    ? { ok: true, selection }
    : { ok: false, diagnostics };
}

export function assetPackConflictDigestInput(conflict: AssetPackConflict): string {
  return JSON.stringify(canonicalize({
    schema: conflict.schema,
    workspaceBaselineDigest: conflict.workspaceBaselineDigest,
    targetKey: conflict.target.key,
    contenders: [...conflict.contenders]
      .sort((left, right) => compareUtf8(left.contenderId, right.contenderId))
      .map((contender) => canonicalize(contender)),
    compatibilityDigest: conflict.compatibility.digest,
    policyDigest: conflict.policy.digest,
  }));
}

export function assetPackConflictSelectionDigestInput(
  selection: AssetPackConflictSelection,
): string {
  return JSON.stringify(canonicalize({
    schema: selection.schema,
    conflictId: selection.conflictId,
    baselineDigest: selection.baselineDigest,
    targets: [...selection.targets]
      .sort((left, right) => compareUtf8(left.targetKey, right.targetKey))
      .map((target) => ({
        targetKey: target.targetKey,
        resolution: target.resolution,
        contenderIds: [...target.contenderIds].sort(compareUtf8),
        reviewEvidenceDigests: [...target.reviewEvidenceDigests].sort(compareUtf8),
        ...(target.resultDigest === undefined ? {} : { resultDigest: target.resultDigest }),
      })),
    review: selection.review,
  }));
}

export function assetPackConflictResolutionProjection(
  resolution: AssetPackConflictResolution,
): unknown {
  return canonicalize({
    schema: resolution.schema,
    conflictId: resolution.conflictId,
    baselineDigest: resolution.baselineDigest,
    selectionDigest: resolution.selectionDigest,
    status: resolution.status,
    targets: [...resolution.targets]
      .sort((left, right) => compareUtf8(left.targetKey, right.targetKey)),
    evidenceDigests: [...resolution.evidenceDigests].sort(compareUtf8),
  });
}

export function assetPackConflictResolutionDigestInput(
  resolution: AssetPackConflictResolution,
): string {
  return JSON.stringify(assetPackConflictResolutionProjection(resolution));
}

export function evaluateAssetPackConflict(
  conflict: AssetPackConflict,
): AssetPackConflictEvaluation {
  if (!conflict.attribution.complete) {
    return {
      status: 'blocked',
      eligibleContenderIds: [],
      equivalentContenderIds: [],
      nextAction: 'review-attribution',
      diagnostics: [{
        code: 'conflict_attribution_incomplete',
        message: 'Attribution, credit, license, and provenance evidence is incomplete.',
        targetKey: conflict.target.key,
      }],
    };
  }

  const compatible = conflict.contenders.filter((contender) =>
    contender.compatibility.status === 'compatible'
    && contender.trust.status === 'verified'
    && contender.sourceReferenceDigests.length > 0
    && contender.creditReferenceDigests.length > 0
    && contender.licenseReferenceDigests.length > 0
    && contender.provenanceReferenceDigests.length > 0);
  const eligibleContenderIds = compatible
    .map((contender) => contender.contenderId)
    .sort(compareUtf8);
  const ineligible = conflict.contenders.filter((contender) =>
    !eligibleContenderIds.includes(contender.contenderId));
  if (eligibleContenderIds.length === 0) {
    return {
      status: 'blocked',
      eligibleContenderIds,
      equivalentContenderIds: [],
      nextAction: 'remove-incompatible-contender',
      diagnostics: [{
        code: 'conflict_incompatible_pack',
        message: 'No contender has compatible, verified, and complete evidence.',
        targetKey: conflict.target.key,
      }],
    };
  }

  const resultDigests = new Set(compatible.map((contender) => contender.resultDigest));
  const equivalentContenderIds = resultDigests.size === 1
    ? eligibleContenderIds
    : [];
  if (resultDigests.size === 1 && compatible[0]?.resultDigest === conflict.baseline.resultDigest) {
    return {
      status: 'current',
      eligibleContenderIds,
      equivalentContenderIds,
      nextAction: 'none',
      diagnostics: diagnosticsForIneligible(ineligible, conflict.target.key),
    };
  }
  if (resultDigests.size === 1) {
    return {
      status: 'equivalent',
      eligibleContenderIds,
      equivalentContenderIds,
      nextAction: 'select-all-targets',
      diagnostics: diagnosticsForIneligible(ineligible, conflict.target.key),
    };
  }
  return {
    status: 'selection-required',
    eligibleContenderIds,
    equivalentContenderIds,
    nextAction: 'select-all-targets',
    diagnostics: diagnosticsForIneligible(ineligible, conflict.target.key),
  };
}

export function resolveAssetPackConflict(
  conflict: AssetPackConflict,
  selection: AssetPackConflictSelection,
  options: { readonly confirmed: boolean },
): AssetPackConflictResolutionResult {
  if (selection.conflictId !== conflict.conflictId) {
    return refusal(
      'conflict_identity_changed',
      'The selection is bound to a different conflict identity.',
      'reinspect-conflict',
    );
  }
  if (selection.baselineDigest !== conflict.workspaceBaselineDigest) {
    return refusal(
      'conflict_baseline_stale',
      'The selection baseline does not match the current workspace baseline.',
      'refresh-conflict',
    );
  }
  if (!options.confirmed) {
    return refusal(
      'conflict_requires_confirmation',
      'Explicit confirmation is required before staging a resolution.',
      'confirm-resolution',
    );
  }

  const evaluation = evaluateAssetPackConflict(conflict);
  if (evaluation.status === 'blocked') {
    const diagnostic = evaluation.diagnostics[0];
    return refusal(
      diagnostic?.code ?? 'conflict_incompatible_pack',
      diagnostic?.message ?? 'The conflict is blocked by compatibility or evidence.',
      evaluation.nextAction,
    );
  }

  if (selection.targets.length !== 1 || selection.targets[0]?.targetKey !== conflict.target.key) {
    return refusal(
      'conflict_selection_incomplete',
      'The selection must name exactly the current conflict target.',
      'select-all-targets',
    );
  }
  const selected = selection.targets[0]!;
  if (!RESOLUTIONS.includes(selected.resolution)) {
    return refusal(
      'conflict_invalid_selection',
      'The selection contains an unsupported resolution.',
      'select-all-targets',
    );
  }
  if (!conflict.policy.allowedResolutions.includes(selected.resolution)) {
    return refusal(
      'conflict_invalid_selection',
      'The selected resolution is not allowed by the conflict policy.',
      'select-all-targets',
    );
  }
  if (selected.reviewEvidenceDigests.length === 0 || selection.review.reason.trim().length === 0) {
    return refusal(
      'conflict_attribution_incomplete',
      'A bounded review evidence digest and review reason are required.',
      'review-attribution',
    );
  }

  const byId = new Map(conflict.contenders.map((contender) => [contender.contenderId, contender]));
  const selectedIds = [...new Set(selected.contenderIds)].sort(compareUtf8);
  if (selectedIds.length !== selected.contenderIds.length) {
    return refusal(
      'conflict_invalid_selection',
      'A contender may be selected only once.',
      'select-all-targets',
    );
  }
  const selectedContenders: AssetPackConflictContender[] = [];
  for (const contenderId of selectedIds) {
    const contender = byId.get(contenderId);
    if (contender === undefined) {
      return refusal(
        'conflict_selection_incomplete',
        `The selected contender is not present in the conflict: ${contenderId}.`,
        'select-all-targets',
      );
    }
    if (!evaluation.eligibleContenderIds.includes(contenderId)) {
      return refusal(
        'conflict_incompatible_pack',
        `The selected contender is not eligible: ${contenderId}.`,
        'remove-incompatible-contender',
      );
    }
    selectedContenders.push(contender);
  }

  if (selected.resolution === 'select-contender' && selectedContenders.length !== 1) {
    return refusal(
      'conflict_invalid_selection',
      'select-contender requires exactly one eligible contender.',
      'select-all-targets',
    );
  }
  if (selected.resolution === 'merge-disjoint') {
    const mergeRefusal = validateDisjointMerge(conflict, selectedContenders);
    if (mergeRefusal !== undefined) return mergeRefusal;
    if (selected.resultDigest === undefined) {
      return refusal(
        'conflict_invalid_selection',
        'merge-disjoint requires a digest-bound result projection.',
        'select-all-targets',
      );
    }
  }
  if (selected.resolution !== 'retain-current' && selected.resolution !== 'decline' && selectedContenders.length === 0) {
    return refusal(
      'conflict_selection_incomplete',
      'A contender selection is required for this resolution.',
      'select-all-targets',
    );
  }

  const evidenceDigests = collectEvidenceDigests(selected, selectedContenders);
  const resultDigest = selected.resolution === 'retain-current' || selected.resolution === 'decline'
    ? conflict.baseline.resultDigest
    : selected.resolution === 'merge-disjoint'
      ? selected.resultDigest!
      : selectedContenders[0]!.resultDigest;
  const resolution: AssetPackConflictResolution = {
    schema: ASSET_PACK_RESOLUTION_SCHEMA,
    conflictId: conflict.conflictId,
    baselineDigest: conflict.workspaceBaselineDigest,
    selectionDigest: assetPackConflictSelectionDigestInput(selection),
    status: selected.resolution === 'decline' ? 'declined' : 'resolved',
    targets: [{
      targetKey: conflict.target.key,
      resolution: selected.resolution,
      contenderIds: selectedIds,
      resultDigest,
      evidenceDigests,
    }],
    evidenceDigests,
  };
  return {
    ok: true,
    resolution,
    projection: assetPackConflictResolutionProjection(resolution),
  };
}

function validateDisjointMerge(
  conflict: AssetPackConflict,
  contenders: readonly AssetPackConflictContender[],
): Extract<AssetPackConflictResolutionResult, { readonly ok: false }> | undefined {
  const paths = new Set<string>();
  for (const contender of contenders) {
    if (contender.baseSnapshotDigest !== conflict.baseline.snapshotDigest) {
      return refusal(
        'conflict_baseline_stale',
        'Every merge patch must bind to the current baseline snapshot.',
        'refresh-conflict',
      );
    }
    for (const patch of contender.semanticPatches) {
      if (paths.has(patch.path)) {
        return refusal(
          'conflict_merge_overlap',
          `Disjoint merge patches overlap at ${patch.path}.`,
          'select-all-targets',
        );
      }
      paths.add(patch.path);
    }
  }
  return undefined;
}

function collectEvidenceDigests(
  selection: AssetPackConflictSelectionTarget,
  contenders: readonly AssetPackConflictContender[],
): readonly string[] {
  const values = [
    ...selection.reviewEvidenceDigests,
    ...contenders.flatMap((contender) => [
      ...contender.sourceReferenceDigests,
      ...contender.creditReferenceDigests,
      ...contender.licenseReferenceDigests,
      ...contender.provenanceReferenceDigests,
      ...contender.trust.receiptDigests,
      ...contender.d5EvidenceDigests,
    ]),
  ];
  return [...new Set(values)].sort(compareUtf8);
}

function diagnosticsForIneligible(
  contenders: readonly AssetPackConflictContender[],
  targetKey: string,
): readonly AssetPackConflictDiagnostic[] {
  return contenders.length === 0
    ? []
    : [{
      code: 'conflict_incompatible_pack',
      message: 'One or more contenders are ineligible and cannot be selected.',
      targetKey,
    }];
}

function refusal(
  code: AssetPackConflictDiagnosticCode,
  message: string,
  nextAction: AssetPackConflictNextAction,
): Extract<AssetPackConflictResolutionResult, { readonly ok: false }> {
  return { ok: false, code, message, nextAction };
}

function parseConflict(
  input: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflict | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, [
    'schema',
    'conflictId',
    'workspaceBaselineDigest',
    'target',
    'baseline',
    'contenders',
    'compatibility',
    'attribution',
    'policy',
    'status',
    'diagnostics',
  ], diagnostics);
  const schema = requiredString(record.schema, `${path}.schema`, diagnostics);
  const conflictId = requiredDigest(record.conflictId, `${path}.conflictId`, diagnostics);
  const workspaceBaselineDigest = requiredDigest(
    record.workspaceBaselineDigest,
    `${path}.workspaceBaselineDigest`,
    diagnostics,
  );
  const target = parseTarget(record.target, `${path}.target`, diagnostics);
  const baseline = parseBaseline(record.baseline, `${path}.baseline`, diagnostics);
  const contenders = parseContenders(record.contenders, `${path}.contenders`, diagnostics);
  const compatibility = parseCompatibilityReport(
    record.compatibility,
    `${path}.compatibility`,
    diagnostics,
  );
  const attribution = parseAttribution(record.attribution, `${path}.attribution`, diagnostics);
  const policy = parsePolicy(record.policy, `${path}.policy`, diagnostics);
  const status = parseEnum(record.status, STATUSES, `${path}.status`, diagnostics);
  const conflictDiagnostics = parseDiagnostics(record.diagnostics, `${path}.diagnostics`, diagnostics);
  if (
    schema !== ASSET_PACK_CONFLICT_SCHEMA
    || conflictId === undefined
    || workspaceBaselineDigest === undefined
    || target === undefined
    || baseline === undefined
    || contenders === undefined
    || compatibility === undefined
    || attribution === undefined
    || policy === undefined
    || status === undefined
    || conflictDiagnostics === undefined
  ) return undefined;
  return {
    schema: ASSET_PACK_CONFLICT_SCHEMA,
    conflictId,
    workspaceBaselineDigest,
    target,
    baseline,
    contenders,
    compatibility,
    attribution,
    policy,
    status,
    diagnostics: conflictDiagnostics,
  };
}

function parseSelection(
  input: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictSelection | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['schema', 'conflictId', 'baselineDigest', 'targets', 'review'], diagnostics);
  const schema = requiredString(record.schema, `${path}.schema`, diagnostics);
  const conflictId = requiredDigest(record.conflictId, `${path}.conflictId`, diagnostics);
  const baselineDigest = requiredDigest(record.baselineDigest, `${path}.baselineDigest`, diagnostics);
  const targets = parseSelectionTargets(record.targets, `${path}.targets`, diagnostics);
  const reviewRecord = asRecord(record.review, `${path}.review`, diagnostics);
  let review: AssetPackConflictSelection['review'] | undefined;
  if (reviewRecord) {
    exactKeys(reviewRecord, `${path}.review`, ['label', 'reason'], diagnostics);
    const label = requiredText(reviewRecord.label, `${path}.review.label`, diagnostics);
    const reason = requiredText(reviewRecord.reason, `${path}.review.reason`, diagnostics);
    if (label !== undefined && reason !== undefined) review = { label, reason };
  }
  if (
    schema !== ASSET_PACK_CONFLICT_SELECTION_SCHEMA
    || conflictId === undefined
    || baselineDigest === undefined
    || targets === undefined
    || review === undefined
  ) return undefined;
  return { schema: ASSET_PACK_CONFLICT_SELECTION_SCHEMA, conflictId, baselineDigest, targets, review };
}

function parseSelectionTargets(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): readonly AssetPackConflictSelectionTarget[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > ASSET_PACK_CONFLICT_LIMITS.targets) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be a bounded non-empty array.`));
    return undefined;
  }
  const targets: AssetPackConflictSelectionTarget[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${index}]`;
  const record = asRecord(entry, entryPath, diagnostics);
    if (!record) continue;
    exactKeys(record, entryPath, ['targetKey', 'resolution', 'contenderIds', 'reviewEvidenceDigests'], diagnostics, ['resultDigest']);
    const targetKey = requiredLogicalKey(record.targetKey, `${entryPath}.targetKey`, diagnostics);
    const resolution = parseEnum(record.resolution, RESOLUTIONS, `${entryPath}.resolution`, diagnostics);
    const contenderIds = sortedUniqueIds(record.contenderIds, `${entryPath}.contenderIds`, diagnostics);
    const reviewEvidenceDigests = sortedDigests(record.reviewEvidenceDigests, `${entryPath}.reviewEvidenceDigests`, diagnostics, false);
    const resultDigest = record.resultDigest === undefined
      ? undefined
      : requiredDigest(record.resultDigest, `${entryPath}.resultDigest`, diagnostics);
    if (targetKey !== undefined && resolution !== undefined && contenderIds !== undefined && reviewEvidenceDigests !== undefined) {
      targets.push({
        targetKey,
        resolution,
        contenderIds,
        reviewEvidenceDigests,
        ...(resultDigest === undefined ? {} : { resultDigest }),
      });
    }
  }
  return targets;
}

function parseTarget(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictTarget | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['kind', 'key'], diagnostics);
  const kind = parseEnum(record.kind, TARGET_KINDS, `${path}.kind`, diagnostics);
  const key = requiredLogicalKey(record.key, `${path}.key`, diagnostics);
  return kind !== undefined && key !== undefined ? { kind, key } : undefined;
}

function parseBaseline(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictBaseline | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, [
    'resultDigest',
    'snapshotDigest',
    'sourceReferenceDigests',
    'creditReferenceDigests',
    'licenseReferenceDigests',
    'provenanceReferenceDigests',
  ], diagnostics);
  const resultDigest = requiredDigest(record.resultDigest, `${path}.resultDigest`, diagnostics);
  const snapshotDigest = requiredDigest(record.snapshotDigest, `${path}.snapshotDigest`, diagnostics);
  const sourceReferenceDigests = sortedDigests(record.sourceReferenceDigests, `${path}.sourceReferenceDigests`, diagnostics, false);
  const creditReferenceDigests = sortedDigests(record.creditReferenceDigests, `${path}.creditReferenceDigests`, diagnostics, false);
  const licenseReferenceDigests = sortedDigests(record.licenseReferenceDigests, `${path}.licenseReferenceDigests`, diagnostics, false);
  const provenanceReferenceDigests = sortedDigests(record.provenanceReferenceDigests, `${path}.provenanceReferenceDigests`, diagnostics, false);
  return resultDigest !== undefined && snapshotDigest !== undefined && sourceReferenceDigests !== undefined && creditReferenceDigests !== undefined && licenseReferenceDigests !== undefined && provenanceReferenceDigests !== undefined
    ? { resultDigest, snapshotDigest, sourceReferenceDigests, creditReferenceDigests, licenseReferenceDigests, provenanceReferenceDigests }
    : undefined;
}

function parseContenders(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): readonly AssetPackConflictContender[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > ASSET_PACK_CONFLICT_LIMITS.contenders) {
    diagnostics.push(schemaDiagnostic(path, `${path} must contain 1-${ASSET_PACK_CONFLICT_LIMITS.contenders} contenders.`));
    return undefined;
  }
  const contenders: AssetPackConflictContender[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) continue;
    exactKeys(record, entryPath, [
      'contenderId',
      'pack',
      'target',
      'resultDigest',
      'baseSnapshotDigest',
      'sourceReferenceDigests',
      'creditReferenceDigests',
      'licenseReferenceDigests',
      'provenanceReferenceDigests',
      'compatibility',
      'trust',
      'origin',
      'semanticPatches',
      'd5EvidenceDigests',
    ], diagnostics);
    const contenderId = requiredPortableId(record.contenderId, `${entryPath}.contenderId`, diagnostics);
    const pack = parsePackSnapshot(record.pack, `${entryPath}.pack`, diagnostics);
    const target = parseTarget(record.target, `${entryPath}.target`, diagnostics);
    const resultDigest = requiredDigest(record.resultDigest, `${entryPath}.resultDigest`, diagnostics);
    const baseSnapshotDigest = requiredDigest(record.baseSnapshotDigest, `${entryPath}.baseSnapshotDigest`, diagnostics);
    const sourceReferenceDigests = sortedDigests(record.sourceReferenceDigests, `${entryPath}.sourceReferenceDigests`, diagnostics, true);
    const creditReferenceDigests = sortedDigests(record.creditReferenceDigests, `${entryPath}.creditReferenceDigests`, diagnostics, true);
    const licenseReferenceDigests = sortedDigests(record.licenseReferenceDigests, `${entryPath}.licenseReferenceDigests`, diagnostics, true);
    const provenanceReferenceDigests = sortedDigests(record.provenanceReferenceDigests, `${entryPath}.provenanceReferenceDigests`, diagnostics, true);
    const compatibility = parseContenderCompatibility(record.compatibility, `${entryPath}.compatibility`, diagnostics);
    const trust = parseTrust(record.trust, `${entryPath}.trust`, diagnostics);
    const origin = parseEnum(record.origin, ORIGINS, `${entryPath}.origin`, diagnostics);
    const semanticPatches = parseSemanticPatches(record.semanticPatches, `${entryPath}.semanticPatches`, diagnostics);
    const d5EvidenceDigests = sortedDigests(record.d5EvidenceDigests, `${entryPath}.d5EvidenceDigests`, diagnostics, false);
    if (contenderId !== undefined && pack !== undefined && target !== undefined && resultDigest !== undefined && baseSnapshotDigest !== undefined && sourceReferenceDigests !== undefined && creditReferenceDigests !== undefined && licenseReferenceDigests !== undefined && provenanceReferenceDigests !== undefined && compatibility !== undefined && trust !== undefined && origin !== undefined && semanticPatches !== undefined && d5EvidenceDigests !== undefined) {
      contenders.push({ contenderId, pack, target, resultDigest, baseSnapshotDigest, sourceReferenceDigests, creditReferenceDigests, licenseReferenceDigests, provenanceReferenceDigests, compatibility, trust, origin, semanticPatches, d5EvidenceDigests });
    }
  }
  if (new Set(contenders.map((contender) => contender.contenderId)).size !== contenders.length) {
    diagnostics.push(schemaDiagnostic(path, `${path} must not contain duplicate contender IDs.`));
  }
  return contenders;
}

function parsePackSnapshot(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictPackSnapshot | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, [
    'packId',
    'version',
    'contentDigest',
    'sourceDigestSet',
    'manifestDigest',
    'compatibility',
    'generatedOwnership',
    'creditDigests',
    'licenseDigests',
    'acknowledgementDigests',
    'provenanceReferenceDigests',
  ], diagnostics, ['archiveDigest', 'registryEntryDigest', 'trustReceiptDigest']);
  const packId = requiredPortableId(record.packId, `${path}.packId`, diagnostics);
  const version = requiredSemver(record.version, `${path}.version`, diagnostics);
  const contentDigest = requiredDigest(record.contentDigest, `${path}.contentDigest`, diagnostics);
  const sourceDigestSet = sortedDigests(record.sourceDigestSet, `${path}.sourceDigestSet`, diagnostics, true);
  const manifestDigest = requiredDigest(record.manifestDigest, `${path}.manifestDigest`, diagnostics);
  const archiveDigest = optionalDigest(record.archiveDigest, `${path}.archiveDigest`, diagnostics);
  const registryEntryDigest = optionalDigest(record.registryEntryDigest, `${path}.registryEntryDigest`, diagnostics);
  const trustReceiptDigest = optionalDigest(record.trustReceiptDigest, `${path}.trustReceiptDigest`, diagnostics);
  const compatibility = parsePackCompatibility(record.compatibility, `${path}.compatibility`, diagnostics);
  const generatedOwnership = sortedLogicalPaths(record.generatedOwnership, `${path}.generatedOwnership`, diagnostics, false);
  const creditDigests = sortedDigests(record.creditDigests, `${path}.creditDigests`, diagnostics, true);
  const licenseDigests = sortedDigests(record.licenseDigests, `${path}.licenseDigests`, diagnostics, true);
  const acknowledgementDigests = sortedDigests(record.acknowledgementDigests, `${path}.acknowledgementDigests`, diagnostics, false);
  const provenanceReferenceDigests = sortedDigests(record.provenanceReferenceDigests, `${path}.provenanceReferenceDigests`, diagnostics, false);
  if (packId === undefined || version === undefined || contentDigest === undefined || sourceDigestSet === undefined || manifestDigest === undefined || compatibility === undefined || generatedOwnership === undefined || creditDigests === undefined || licenseDigests === undefined || acknowledgementDigests === undefined || provenanceReferenceDigests === undefined) return undefined;
  return {
    packId,
    version,
    contentDigest,
    sourceDigestSet,
    manifestDigest,
    ...(archiveDigest === undefined ? {} : { archiveDigest }),
    ...(registryEntryDigest === undefined ? {} : { registryEntryDigest }),
    ...(trustReceiptDigest === undefined ? {} : { trustReceiptDigest }),
    compatibility,
    generatedOwnership,
    creditDigests,
    licenseDigests,
    acknowledgementDigests,
    provenanceReferenceDigests,
  };
}

function parsePackCompatibility(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictCompatibility | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['requiredCapabilities'], diagnostics, ['minimumCliVersion']);
  const minimumCliVersion = record.minimumCliVersion === undefined
    ? undefined
    : requiredSemver(record.minimumCliVersion, `${path}.minimumCliVersion`, diagnostics);
  const requiredCapabilities = sortedStrings(record.requiredCapabilities, `${path}.requiredCapabilities`, diagnostics, false);
  return requiredCapabilities === undefined
    ? undefined
    : {
      ...(minimumCliVersion === undefined ? {} : { minimumCliVersion }),
      requiredCapabilities,
    };
}

function parseContenderCompatibility(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictContenderCompatibility | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['status', 'digest', 'diagnostics'], diagnostics);
  const status = parseEnum(record.status, ['compatible', 'incompatible'] as const, `${path}.status`, diagnostics);
  const digest = requiredDigest(record.digest, `${path}.digest`, diagnostics);
  const diagnosticCodes = sortedStrings(record.diagnostics, `${path}.diagnostics`, diagnostics, false);
  return status !== undefined && digest !== undefined && diagnosticCodes !== undefined
    ? { status, digest, diagnostics: diagnosticCodes }
    : undefined;
}

function parseTrust(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictTrustEvidence | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['status', 'receiptDigests'], diagnostics);
  const status = parseEnum(record.status, ['verified', 'unverified', 'blocked'] as const, `${path}.status`, diagnostics);
  const receiptDigests = sortedDigests(record.receiptDigests, `${path}.receiptDigests`, diagnostics, false);
  return status !== undefined && receiptDigests !== undefined ? { status, receiptDigests } : undefined;
}

function parseSemanticPatches(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): readonly AssetPackConflictSemanticPatch[] | undefined {
  if (!Array.isArray(value) || value.length > ASSET_PACK_CONFLICT_LIMITS.semanticPatches) {
    diagnostics.push(schemaDiagnostic(path, `${path} exceeds the semantic patch limit.`));
    return undefined;
  }
  const patches: AssetPackConflictSemanticPatch[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) continue;
    exactKeys(record, entryPath, ['path', 'baseDigest', 'resultDigest'], diagnostics);
    const patchPath = requiredLogicalPath(record.path, `${entryPath}.path`, diagnostics);
    const baseDigest = requiredDigest(record.baseDigest, `${entryPath}.baseDigest`, diagnostics);
    const resultDigest = requiredDigest(record.resultDigest, `${entryPath}.resultDigest`, diagnostics);
    if (patchPath !== undefined && baseDigest !== undefined && resultDigest !== undefined) patches.push({ path: patchPath, baseDigest, resultDigest });
  }
  const sorted = [...patches].sort((left, right) => compareUtf8(left.path, right.path));
  if (JSON.stringify(patches) !== JSON.stringify(sorted)) diagnostics.push(schemaDiagnostic(path, `${path} must be sorted by path.`));
  if (new Set(patches.map((patch) => patch.path)).size !== patches.length) diagnostics.push(schemaDiagnostic(path, `${path} must not contain duplicate paths.`));
  return patches;
}

function parseCompatibilityReport(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictCompatibilityReport | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['status', 'digest', 'requiredCapabilities', 'diagnostics'], diagnostics);
  const status = parseEnum(record.status, ['compatible', 'incompatible'] as const, `${path}.status`, diagnostics);
  const digest = requiredDigest(record.digest, `${path}.digest`, diagnostics);
  const requiredCapabilities = sortedStrings(record.requiredCapabilities, `${path}.requiredCapabilities`, diagnostics, false);
  const diagnosticCodes = sortedStrings(record.diagnostics, `${path}.diagnostics`, diagnostics, false);
  return status !== undefined && digest !== undefined && requiredCapabilities !== undefined && diagnosticCodes !== undefined
    ? { status, digest, requiredCapabilities, diagnostics: diagnosticCodes }
    : undefined;
}

function parseAttribution(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictAttribution | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['complete', 'sourceReferenceDigests', 'creditReferenceDigests', 'licenseReferenceDigests', 'acknowledgementDigests', 'provenanceReferenceDigests'], diagnostics);
  const complete = requiredBoolean(record.complete, `${path}.complete`, diagnostics);
  const sourceReferenceDigests = sortedDigests(record.sourceReferenceDigests, `${path}.sourceReferenceDigests`, diagnostics, false);
  const creditReferenceDigests = sortedDigests(record.creditReferenceDigests, `${path}.creditReferenceDigests`, diagnostics, false);
  const licenseReferenceDigests = sortedDigests(record.licenseReferenceDigests, `${path}.licenseReferenceDigests`, diagnostics, false);
  const acknowledgementDigests = sortedDigests(record.acknowledgementDigests, `${path}.acknowledgementDigests`, diagnostics, false);
  const provenanceReferenceDigests = sortedDigests(record.provenanceReferenceDigests, `${path}.provenanceReferenceDigests`, diagnostics, false);
  return complete !== undefined && sourceReferenceDigests !== undefined && creditReferenceDigests !== undefined && licenseReferenceDigests !== undefined && acknowledgementDigests !== undefined && provenanceReferenceDigests !== undefined
    ? { complete, sourceReferenceDigests, creditReferenceDigests, licenseReferenceDigests, acknowledgementDigests, provenanceReferenceDigests }
    : undefined;
}

function parsePolicy(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): AssetPackConflictPolicy | undefined {
  const record = asRecord(value, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['schema', 'allowedResolutions', 'explicitSelectionRequired', 'digest'], diagnostics);
  const schema = requiredString(record.schema, `${path}.schema`, diagnostics);
  const allowedResolutions = parseResolutionArray(record.allowedResolutions, `${path}.allowedResolutions`, diagnostics);
  const explicitSelectionRequired = requiredBoolean(record.explicitSelectionRequired, `${path}.explicitSelectionRequired`, diagnostics);
  const digest = requiredDigest(record.digest, `${path}.digest`, diagnostics);
  return schema === ASSET_PACK_CONFLICT_POLICY_SCHEMA && allowedResolutions !== undefined && explicitSelectionRequired === true && digest !== undefined
    ? { schema: ASSET_PACK_CONFLICT_POLICY_SCHEMA, allowedResolutions, explicitSelectionRequired: true, digest }
    : undefined;
}

function parseResolutionArray(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): readonly AssetPackConflictResolutionKind[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > RESOLUTIONS.length) {
    diagnostics.push(schemaDiagnostic(path, `${path} must contain one or more supported resolutions.`));
    return undefined;
  }
  const resolutions: AssetPackConflictResolutionKind[] = [];
  for (const [index, valueEntry] of value.entries()) {
    const parsed = parseEnum(valueEntry, RESOLUTIONS, `${path}[${index}]`, diagnostics);
    if (parsed !== undefined) resolutions.push(parsed);
  }
  if (new Set(resolutions).size !== resolutions.length) diagnostics.push(schemaDiagnostic(path, `${path} must not contain duplicate resolutions.`));
  return resolutions;
}

function parseDiagnostics(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): readonly AssetPackConflictDiagnostic[] | undefined {
  if (!Array.isArray(value) || value.length > ASSET_PACK_CONFLICT_LIMITS.diagnostics) {
    diagnostics.push(schemaDiagnostic(path, `${path} exceeds the diagnostic limit.`));
    return undefined;
  }
  const result: AssetPackConflictDiagnostic[] = [];
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) continue;
    exactKeys(record, entryPath, ['code', 'message'], diagnostics, ['targetKey']);
    const code = parseEnum(record.code, [
      'conflict_identity_changed',
      'conflict_baseline_stale',
      'conflict_selection_incomplete',
      'conflict_incompatible_pack',
      'conflict_attribution_incomplete',
      'conflict_resolution_tampered',
      'conflict_requires_confirmation',
      'conflict_merge_overlap',
      'conflict_invalid_selection',
      'conflict_schema_invalid',
    ] as const, `${entryPath}.code`, diagnostics);
    const message = boundedText(record.message, `${entryPath}.message`, diagnostics);
    const targetKey = record.targetKey === undefined
      ? undefined
      : requiredLogicalKey(record.targetKey, `${entryPath}.targetKey`, diagnostics);
    if (code !== undefined && message !== undefined) result.push({ code, message, ...(targetKey === undefined ? {} : { targetKey }) });
  }
  return result;
}

function sortedDigests(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
  required: boolean,
): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > ASSET_PACK_CONFLICT_LIMITS.digestReferences || (required && value.length === 0)) {
    diagnostics.push(schemaDiagnostic(path, `${path} must contain ${required ? 'at least one and ' : ''}bounded digests.`));
    return undefined;
  }
  const entries: string[] = [];
  for (const [index, entry] of value.entries()) {
    const parsed = requiredDigest(entry, `${path}[${index}]`, diagnostics);
    if (parsed !== undefined) entries.push(parsed);
  }
  const sorted = [...entries].sort(compareUtf8);
  if (JSON.stringify(entries) !== JSON.stringify(sorted)) diagnostics.push(schemaDiagnostic(path, `${path} must be sorted.`));
  if (new Set(entries).size !== entries.length) diagnostics.push(schemaDiagnostic(path, `${path} must not contain duplicates.`));
  return entries;
}

function sortedStrings(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
  required: boolean,
): readonly string[] | undefined {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > ASSET_PACK_CONFLICT_LIMITS.digestReferences || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    diagnostics.push(schemaDiagnostic(path, `${path} must contain bounded strings.`));
    return undefined;
  }
  const entries = [...value] as string[];
  const sorted = [...entries].sort(compareUtf8);
  if (JSON.stringify(entries) !== JSON.stringify(sorted)) diagnostics.push(schemaDiagnostic(path, `${path} must be sorted.`));
  if (new Set(entries).size !== entries.length) diagnostics.push(schemaDiagnostic(path, `${path} must not contain duplicates.`));
  return entries;
}

function sortedUniqueIds(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > ASSET_PACK_CONFLICT_LIMITS.contenders) {
    diagnostics.push(schemaDiagnostic(path, `${path} exceeds the contender limit.`));
    return undefined;
  }
  const values: string[] = [];
  for (const [index, entry] of value.entries()) {
    const parsed = requiredPortableId(entry, `${path}[${index}]`, diagnostics);
    if (parsed !== undefined) values.push(parsed);
  }
  const sorted = [...values].sort(compareUtf8);
  if (JSON.stringify(values) !== JSON.stringify(sorted)) diagnostics.push(schemaDiagnostic(path, `${path} must be sorted.`));
  if (new Set(values).size !== values.length) diagnostics.push(schemaDiagnostic(path, `${path} must not contain duplicate IDs.`));
  return values;
}

function sortedLogicalPaths(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
  required: boolean,
): readonly string[] | undefined {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > ASSET_PACK_CONFLICT_LIMITS.digestReferences) {
    diagnostics.push(schemaDiagnostic(path, `${path} must contain bounded logical paths.`));
    return undefined;
  }
  const values: string[] = [];
  for (const [index, entry] of value.entries()) {
    const parsed = requiredLogicalPath(entry, `${path}[${index}]`, diagnostics);
    if (parsed !== undefined) values.push(parsed);
  }
  const sorted = [...values].sort(compareUtf8);
  if (JSON.stringify(values) !== JSON.stringify(sorted)) diagnostics.push(schemaDiagnostic(path, `${path} must be sorted.`));
  if (new Set(values).size !== values.length) diagnostics.push(schemaDiagnostic(path, `${path} must not contain duplicates.`));
  return values;
}

function requiredDigest(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    diagnostics.push({ code: 'conflict_digest_invalid', path, message: `${path} must be a sha256 digest.` });
    return undefined;
  }
  return value;
}

function optionalDigest(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  return value === undefined ? undefined : requiredDigest(value, path, diagnostics);
}

function requiredSemver(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be a semantic version.`));
    return undefined;
  }
  return value;
}

function requiredPortableId(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > ASSET_PACK_CONFLICT_LIMITS.logicalIdentifierBytes || !PORTABLE_ID_PATTERN.test(value)) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be a bounded portable identifier.`));
    return undefined;
  }
  return value;
}

function requiredLogicalKey(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > ASSET_PACK_CONFLICT_LIMITS.logicalIdentifierBytes || !LOGICAL_KEY_PATTERN.test(value) || value.includes('..') || value.includes('//') || value.startsWith('/')) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be a bounded portable logical key.`));
    return undefined;
  }
  return value;
}

function requiredLogicalPath(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > ASSET_PACK_CONFLICT_LIMITS.logicalIdentifierBytes || !LOGICAL_PATH_PATTERN.test(value) || value.includes('..') || value.includes('//') || value.startsWith('/')) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be a bounded portable logical path.`));
    return undefined;
  }
  return value;
}

function requiredText(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > ASSET_PACK_CONFLICT_LIMITS.diagnosticBytes) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be bounded non-empty text.`));
    return undefined;
  }
  return value;
}

function boundedText(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  return requiredText(value, path, diagnostics);
}

function requiredString(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): string | undefined {
  if (typeof value !== 'string') {
    diagnostics.push(schemaDiagnostic(path, `${path} must be a string.`));
    return undefined;
  }
  return value;
}

function requiredBoolean(value: unknown, path: string, diagnostics: AssetPackConflictParseDiagnostic[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    diagnostics.push(schemaDiagnostic(path, `${path} must be a boolean.`));
    return undefined;
  }
  return value;
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): T | undefined {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be one of ${allowed.join(', ')}.`));
    return undefined;
  }
  return value as T;
}

function asRecord(
  value: unknown,
  path: string,
  diagnostics: AssetPackConflictParseDiagnostic[],
): UnknownRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    diagnostics.push(schemaDiagnostic(path, `${path} must be an object.`));
    return undefined;
  }
  return value as UnknownRecord;
}

function exactKeys(
  record: UnknownRecord,
  path: string,
  required: readonly string[],
  diagnostics: AssetPackConflictParseDiagnostic[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) diagnostics.push(schemaDiagnostic(`${path}.${key}`, `${path} contains an unknown field.`));
  }
  for (const key of required) {
    if (!(key in record)) diagnostics.push(schemaDiagnostic(`${path}.${key}`, `${path}.${key} is required.`));
  }
}

function schemaDiagnostic(path: string, message: string): AssetPackConflictParseDiagnostic {
  return { code: 'conflict_schema_invalid', path, message };
}

function compareUtf8(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.keys(record)
      .sort(compareUtf8)
      .map((key) => [key, canonicalize(record[key])]),
  );
}
