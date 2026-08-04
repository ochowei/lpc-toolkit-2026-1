import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ASSET_AUTHORING_RELEASE_ARTIFACT_IDS,
  normalizeAssetPack,
  parseAssetAuthoringPlan,
  parseAssetReleaseDeclaration,
  parseAssetPackSource,
  assetAuthoringReleaseGateProjection,
  assetReleaseDeclarationDigestInput,
  type AssetPackAcknowledgement,
  type AssetAuthoringPreviewAcceptanceReceipt,
  type AssetAuthoringReleaseArtifactDigest,
  type AssetAuthoringReleaseDeclarationReceipt,
  type AssetAuthoringReleaseGateId,
  type AssetAuthoringReleaseGateFreshness,
  type AssetAuthoringReleaseGateProjection,
  type AssetReleaseDeclaration,
  type NormalizedAssetPack,
  type AssetAuthoringPlan,
} from '@lpc-toolkit/core';
import {
  flagBoolean,
  flagString,
  type ParsedArgs,
} from './args.js';
import { scaffoldNewAssetPack } from './asset-pack-scaffold.js';
import {
  AssetAuthoringContractError,
  materializeAssetAuthoringContract,
} from './asset-authoring-contract.js';
import {
  AssetAuthoringImportError,
  importAssetAuthoringCandidate,
} from './asset-authoring-import.js';
import {
  AssetPackPreviewError,
  captureAssetPackPreviewArtifacts,
  previewAssetPack,
} from './asset-pack-preview.js';
import {
  validateAssetPackDirectory,
  type AssetPackValidationReport,
} from './asset-pack-validation.js';
import {
  atomicallyReplaceAssetPackSource,
  loadAssetPackFiles,
} from './asset-pack-files.js';
import { PreviewError } from './preview.js';
import { CLI_VERSION } from './package-info.js';
import {
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
  AssetAuthoringSessionError,
  type AssetAuthoringAcknowledgementReceipt,
  type AssetAuthoringManifestConflict,
  type AssetAuthoringProvenanceEvent,
  type AssetAuthoringSession,
  type AssetAuthoringSessionReceipts,
  type AssetAuthoringSessionUpdate,
  type AssetAuthoringPreviewReceipt,
  type AssetAuthoringSyncReceipt,
  type AssetAuthoringValidationReceipt,
} from './asset-authoring-session.js';
import {
  createDraftArchive,
  assetAuthoringReleaseArtifactRoot,
  captureSyncReceipt,
  syncReceiptStaleReason,
  AssetAuthoringReleaseLifecycleError,
} from './asset-authoring-release-lifecycle.js';
import type { AssetWorkspace } from './asset-workspace.js';
import type { RuntimeAssets } from './runtime-assets.js';
import { syncLinkedAssetPack } from './asset-pack-sync.js';
import {
  authoringResponseProjection,
  commandError,
  commandOk,
  type AuthoringArtifact,
  type AuthoringInputNeeded,
  type AuthoringNextAction,
  type AuthoringPreviewData,
  type AuthoringPreviewInput,
  type AuthoringResponseData,
  type AuthoringResponseProjectionInput,
  type CliIssue,
  type CliResponse,
} from './response.js';

const MANIFEST_FILE = 'asset-pack.json' as const;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface AuthoringCommandContext {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
  readonly workspace: AssetWorkspace;
  readonly runtime?: RuntimeAssets;
}

interface AuthoringCommandErrorOptions {
  readonly code: string;
  readonly path?: string;
}

class AuthoringCommandError extends Error {
  readonly code: string;
  readonly path: string | undefined;

  constructor(message: string, options: AuthoringCommandErrorOptions) {
    super(message);
    this.name = 'AuthoringCommandError';
    this.code = options.code;
    this.path = options.path;
  }
}

interface ResponseOptions {
  readonly diagnostics?: readonly CliIssue[];
  readonly artifacts?: readonly AuthoringArtifact[];
  readonly inputsNeeded?: readonly AuthoringInputNeeded[];
  readonly validation?: AssetPackValidationReport;
  readonly preview?: AuthoringPreviewData;
}

function issue(
  code: string,
  message: string,
  issuePath?: string,
  details?: CliIssue['details'],
): CliIssue {
  return {
    code,
    message,
    ...(issuePath === undefined ? {} : { path: issuePath }),
    ...(details === undefined ? {} : { details }),
  };
}

function sha256(value: Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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

function absolutePath(cwd: string, value: string): string {
  return path.resolve(cwd, value);
}

function readPlanFile(planPath: string):
  | { readonly ok: true; readonly plan: AssetAuthoringPlan }
  | { readonly ok: false; readonly response: CliResponse<null> } {
  let input: unknown;
  try {
    const stats = lstatSync(planPath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return {
        ok: false,
        response: commandError('asset authoring start', issue(
          'asset_authoring_plan_invalid',
          'Authoring plan must be a regular file.',
          planPath,
        )),
      };
    }
    input = JSON.parse(readFileSync(planPath, 'utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      response: commandError('asset authoring start', issue(
        'asset_authoring_plan_invalid',
        error instanceof Error ? error.message : 'Authoring plan could not be read.',
        planPath,
      )),
    };
  }

  const result = parseAssetAuthoringPlan(input);
  if (!result.ok) {
    return {
      ok: false,
      response: {
        ok: false,
        command: 'asset authoring start',
        data: null,
        warnings: [],
        errors: result.diagnostics.map((diagnostic) => {
          const detailPath = diagnostic.details?.path;
          return issue(
            'asset_authoring_plan_invalid',
            diagnostic.message,
            typeof detailPath === 'string' ? detailPath : undefined,
          );
        }),
      },
    };
  }
  return { ok: true, plan: result.plan };
}

function hasManifestCredits(plan: AssetAuthoringPlan): boolean {
  const credits = plan.draftCredits;
  return credits !== undefined
    && credits.authors.length > 0
    && credits.licenses.length > 0;
}

function packRootFor(workspace: AssetWorkspace, plan: AssetAuthoringPlan): string {
  const packRoot = path.resolve(workspace.packsRoot, plan.pack.id);
  if (!isInsideRoot(workspace.packsRoot, packRoot) || packRoot === path.resolve(workspace.packsRoot)) {
    throw new AuthoringCommandError(
      'Authoring plan pack identity escapes the workspace artist-packs root.',
      { code: 'asset_authoring_scope_invalid', path: packRoot },
    );
  }
  return packRoot;
}

function manifestPathFor(session: AssetAuthoringSession): string {
  const manifestPath = path.resolve(session.packRoot, MANIFEST_FILE);
  if (!isInsideRoot(session.packRoot, manifestPath)) {
    throw new AuthoringCommandError(
      'Authoring session manifest escapes its pack root.',
      { code: 'asset_authoring_scope_invalid', path: manifestPath },
    );
  }
  return manifestPath;
}

function readRegularFile(filePath: string): Buffer | undefined {
  try {
    const stats = lstatSync(filePath);
    if (stats.isSymbolicLink() || !stats.isFile()) return undefined;
    return readFileSync(filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function fileDigest(filePath: string): string | null {
  const bytes = readRegularFile(filePath);
  return bytes === undefined ? null : sha256(bytes);
}

function sessionSnapshotPath(
  workspace: AssetWorkspace,
  session: AssetAuthoringSession,
): string {
  return path.join(
    path.dirname(assetAuthoringSessionPath(workspace, session.sessionId)),
    'manifest.snapshot.json',
  );
}

function atomicWrite(filePath: string, bytes: Buffer): void {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function writeSessionManifestSnapshot(
  workspace: AssetWorkspace,
  session: AssetAuthoringSession,
  manifestBytes: Buffer,
): void {
  atomicWrite(sessionSnapshotPath(workspace, session), manifestBytes);
}

function appendProvenance(
  session: AssetAuthoringSession,
  event: Omit<AssetAuthoringProvenanceEvent, 'id'>,
): readonly AssetAuthoringProvenanceEvent[] {
  return [
    ...session.provenance,
    { id: randomUUID(), ...event },
  ];
}

function checkpointForResponse(
  session: AssetAuthoringSession,
): AuthoringResponseProjectionInput['checkpoint'] {
  return session.checkpoint === null
    ? null
    : {
      id: session.checkpoint.id,
      digest: session.checkpoint.digest,
    };
}

function sourceDigestSetsEqual(
  left: readonly { readonly path: string; readonly digest: string }[],
  right: readonly { readonly path: string; readonly digest: string }[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a.path.localeCompare(b.path));
  const sortedRight = [...right].sort((a, b) => a.path.localeCompare(b.path));
  return sortedLeft.every((entry, index) => {
    const other = sortedRight[index];
    return other !== undefined && entry.path === other.path && entry.digest === other.digest;
  });
}

function artifactSetsEqual(
  left: readonly AssetAuthoringReleaseArtifactDigest[],
  right: readonly AssetAuthoringReleaseArtifactDigest[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((artifact, index) => {
    const other = right[index];
    return other !== undefined
      && artifact.id === other.id
      && artifact.path === other.path
      && artifact.digest === other.digest;
  });
}

function previewArtifactFilesCurrent(
  session: AssetAuthoringSession,
  preview: AssetAuthoringPreviewReceipt | null,
): boolean {
  if (preview?.artifacts === null || preview === null || preview === undefined) return false;
  return preview.artifacts.every((artifact) => {
    if (!isInsideRoot(session.packRoot, artifact.path)) return false;
    const bytes = readRegularFile(artifact.path);
    return bytes !== undefined && sha256(bytes) === artifact.digest;
  });
}

function releaseGateFreshness(
  session: AssetAuthoringSession,
): AssetAuthoringReleaseGateProjection {
  const blocked = session.conflict !== null || session.checkpointFreshness === 'blocked';
  const validation = session.receipts.validation;
  const validationCurrent = !blocked
    && validation !== null
    && session.manifestDigest !== null
    && validation.manifestDigest === session.manifestDigest
    && session.checkpointFreshness === 'current'
    && (session.phase === 'validated' || session.phase === 'previewed')
    && session.reason !== 'validation-failed';
  const acknowledgement = session.receipts.acknowledgements;
  const acknowledgementCurrent = validationCurrent
    && (acknowledgement === null
      || (session.manifestDigest !== null
        && acknowledgement.manifestDigest === session.manifestDigest
        && sourceDigestSetsEqual(acknowledgement.sourceDigests, validation.sourceDigests)));
  const declaration = session.receipts.releaseDeclaration;
  const declarationCurrent = acknowledgementCurrent
    && declaration !== null
    && declaration.manifestDigest === session.manifestDigest
    && declaration.validationReceiptId === validation.id
    && sourceDigestSetsEqual(declaration.sourceDigests, validation.sourceDigests)
    && declaration.acknowledgements.recordDigests.length
      === (acknowledgement?.recordDigests.length ?? 0)
    && declaration.acknowledgements.recordDigests.every((digest, index) =>
      digest === acknowledgement?.recordDigests[index]);
  const preview = session.receipts.preview;
  const previewCurrent = validationCurrent
    && preview !== null
    && session.manifestDigest !== null
    && preview.manifestDigest === session.manifestDigest
    && preview.validationReceiptId === validation.id
    && sourceDigestSetsEqual(preview.sourceDigests, validation.sourceDigests);
  const previewArtifactsCurrent = previewCurrent
    && preview?.artifacts !== null
    && previewArtifactFilesCurrent(session, preview);
  const previewAcceptance = session.receipts.previewAcceptance;
  const previewAcceptanceCurrent = previewArtifactsCurrent
    && previewAcceptance !== null
    && declarationCurrent
    && preview !== null
    && previewAcceptance.declarationReceiptDigest === declaration?.declarationDigest
    && previewAcceptance.manifestDigest === preview.manifestDigest
    && sourceDigestSetsEqual(previewAcceptance.sourceDigests, preview.sourceDigests)
    && previewAcceptance.validationReceiptId === validation?.id
    && previewAcceptance.previewReceiptId === preview.id
    && previewAcceptance.previewInputDigest === preview.inputDigest
    && preview.artifacts !== null
    && artifactSetsEqual(previewAcceptance.artifacts, preview.artifacts);
  const freshness = (
    current: boolean,
    present: boolean,
  ): AssetAuthoringReleaseGateFreshness => {
    if (current) return 'current';
    if (blocked) return 'blocked';
    return present ? 'stale' : 'missing';
  };
  return assetAuthoringReleaseGateProjection({
    acknowledgements: freshness(
      acknowledgementCurrent,
      acknowledgement !== null || validationCurrent,
    ),
    validation: freshness(validationCurrent, validation !== null),
    releaseDeclaration: freshness(declarationCurrent, declaration !== null),
    preview: freshness(previewCurrent, preview !== null),
    previewArtifacts: freshness(
      previewArtifactsCurrent,
      preview !== null && preview.artifacts !== null,
    ),
    previewAcceptance: freshness(
      previewAcceptanceCurrent,
      previewAcceptance !== null,
    ),
  });
}

function manifestArtifact(session: AssetAuthoringSession): AuthoringArtifact | undefined {
  if (session.manifestDigest === null) return undefined;
  return {
    id: 'pack',
    path: session.packRoot,
    digest: session.manifestDigest,
  };
}

function nextAction(
  id: string,
  summary: string,
  command: string,
  safety: AuthoringNextAction['safety'],
  preconditionDigests: readonly string[] = [],
  requiredInputs: readonly string[] = [],
): AuthoringNextAction {
  return {
    id,
    summary,
    command,
    safety,
    requiredInputs,
    preconditionDigests,
    expectedCheckpoint: null,
  };
}

function nextActionsFor(session: AssetAuthoringSession): readonly AuthoringNextAction[] {
  if (session.reason === 'missing-draft-credits') return [];

  if (session.conflict !== null) {
    const expected = session.conflict.actualDigest;
    return [
      nextAction(
        'adopt-external-manifest',
        'Adopt the externally changed manifest after review.',
        `asset authoring reconcile-manifest --session ${session.sessionId} --use external --expected-external-digest <sha256>`,
        'requires-confirmation',
        [expected],
        ['expected-external-digest'],
      ),
      nextAction(
        'restore-session-manifest',
        'Restore the session-known manifest after review.',
        `asset authoring reconcile-manifest --session ${session.sessionId} --use session --expected-external-digest <sha256>`,
        'requires-confirmation',
        [expected],
        ['expected-external-digest'],
      ),
    ];
  }

  if (session.reason === 'draft-archive-stale') {
    return [nextAction(
      'recreate-draft-archive',
      'Create a new draft recovery archive after reviewing changed session evidence.',
      `asset authoring draft --session ${session.sessionId} --output <archive>`,
      'safe',
      session.receipts.draftArchive === null || session.receipts.draftArchive === undefined
        ? []
        : [session.receipts.draftArchive.archiveDigest],
    )];
  }

  if (
    session.reason === 'sync-confirmation-required'
    || session.reason === 'sync-receipt-stale'
  ) {
    return [nextAction(
      'confirm-sync',
      'Confirm publication into the manager-owned generated overlay and registry.',
      `asset authoring sync --session ${session.sessionId} --confirm`,
      'requires-confirmation',
      session.receipts.sync === null || session.receipts.sync === undefined
        ? []
        : [session.receipts.sync.compileDigest, session.receipts.sync.registryDigest],
      ['confirm'],
    )];
  }

  if (session.phase === 'planned' || session.phase === 'scaffolded') {
    return [nextAction(
      'create-contract',
      'Create the provider-neutral sprite drawing contract.',
      `asset authoring contract --session ${session.sessionId}`,
      'safe',
      session.manifestDigest === null ? [] : [session.manifestDigest],
    )];
  }

  if (session.reason === 'external-png-drift') {
    return [nextAction(
      'review-external-png',
      'Review the externally changed PNG evidence before continuing.',
      `asset authoring status --session ${session.sessionId}`,
      'safe',
      session.checkpoints.flatMap((checkpoint) =>
        checkpoint.checkpoint ? [checkpoint.checkpoint.digest] : []),
    )];
  }

  if (session.reason === 'acknowledgement-confirmation-required') {
    return [nextAction(
      'acknowledge-session',
      'Confirm the exact supplied acknowledgement before publishing it to the session pack.',
      `asset authoring acknowledge --session ${session.sessionId} --acknowledgement <record.json> --confirm`,
      'requires-confirmation',
      session.manifestDigest === null ? [] : [session.manifestDigest],
      ['acknowledgement', 'confirm'],
    )];
  }

  if (
    session.reason === 'release-declaration-confirmation-required'
    || session.reason === 'release-declaration-stale'
  ) {
    return [nextAction(
      'declare-release',
      'Confirm the explicit human release declaration before recording it for this session.',
      `asset authoring declare --session ${session.sessionId} --declaration <declaration.json> --confirm`,
      'requires-confirmation',
      session.manifestDigest === null ? [] : [session.manifestDigest],
      ['declaration', 'confirm'],
    )];
  }

  if (session.reason === 'preview-acceptance-confirmation-required') {
    const previewDigest = session.receipts.preview?.artifacts
      ?.find((artifact) => artifact.id === 'preview:preview')?.digest;
    return [nextAction(
      'accept-preview',
      'Confirm the exact current attributed preview before marking the session release-ready.',
      `asset authoring accept-preview --session ${session.sessionId} --preview-digest <sha256> --confirm`,
      'requires-confirmation',
      previewDigest === undefined ? [] : [previewDigest],
      ['preview-digest', 'confirm'],
    )];
  }

  if (session.reason === 'preview-acceptance-stale') {
    const previewDigest = session.receipts.preview?.artifacts
      ?.find((artifact) => artifact.id === 'preview:preview')?.digest;
    return [nextAction(
      'accept-preview',
      'Re-confirm the exact current attributed preview after release evidence changed.',
      `asset authoring accept-preview --session ${session.sessionId} --preview-digest <sha256> --confirm`,
      'requires-confirmation',
      previewDigest === undefined ? [] : [previewDigest],
      ['preview-digest', 'confirm'],
    )];
  }

  if (
    (session.reason === 'preview-current' || session.reason === 'release-declaration-current')
    && session.receipts.previewAcceptance !== null
    && releaseGateFreshness(session).gates.some((gate) =>
      gate.id === 'previewAcceptance' && gate.freshness !== 'current')
  ) {
    const previewDigest = session.receipts.preview?.artifacts
      ?.find((artifact) => artifact.id === 'preview:preview')?.digest;
    return [nextAction(
      'accept-preview',
      'Re-confirm the exact current attributed preview after release evidence changed.',
      `asset authoring accept-preview --session ${session.sessionId} --preview-digest <sha256> --confirm`,
      'requires-confirmation',
      previewDigest === undefined ? [] : [previewDigest],
      ['preview-digest', 'confirm'],
    )];
  }

  if (
    session.reason === 'validation-receipt-stale'
    || session.reason === 'validation-incomplete'
    || session.reason === 'validation-failed'
  ) {
    return [nextAction(
      'validate-session',
      'Re-run validation against the current session-owned pack sources.',
      `asset authoring validate --session ${session.sessionId}`,
      'safe',
      session.manifestDigest === null ? [] : [session.manifestDigest],
    )];
  }

  if (
    session.reason === 'preview-receipt-stale'
    || session.reason === 'preview-artifact-stale'
  ) {
    return [nextAction(
      'preview-session',
      'Re-render the attributed preview for the current validation receipt.',
      `asset authoring preview --session ${session.sessionId}`,
      'safe',
      session.manifestDigest === null ? [] : [session.manifestDigest],
    )];
  }

  const gates = releaseGateFreshness(session).gates;
  const gateFreshness = (id: AssetAuthoringReleaseGateId): AssetAuthoringReleaseGateFreshness =>
    gates.find((gate) => gate.id === id)?.freshness ?? 'missing';
  if (
    session.receipts.preview !== null
    && gateFreshness('validation') === 'current'
    && (gateFreshness('preview') !== 'current' || gateFreshness('previewArtifacts') !== 'current')
  ) {
    return [nextAction(
      'preview-session',
      'Re-render the attributed preview for the current validation receipt and artifact set.',
      `asset authoring preview --session ${session.sessionId}`,
      'safe',
      session.manifestDigest === null ? [] : [session.manifestDigest],
    )];
  }

  if (
    gateFreshness('validation') === 'current'
    && gateFreshness('releaseDeclaration') !== 'current'
  ) {
    return [nextAction(
      'declare-release',
      'Confirm the explicit human release declaration before recording it for this session.',
      `asset authoring declare --session ${session.sessionId} --declaration <declaration.json> --confirm`,
      'requires-confirmation',
      session.manifestDigest === null ? [] : [session.manifestDigest],
      ['declaration', 'confirm'],
    )];
  }

  if (
    session.receipts.preview !== null
    && gateFreshness('preview') === 'current'
    && gateFreshness('previewArtifacts') === 'current'
    && gateFreshness('previewAcceptance') !== 'current'
  ) {
    const previewDigest = session.receipts.preview.artifacts
      ?.find((artifact) => artifact.id === 'preview:preview')?.digest;
    return [nextAction(
      'accept-preview',
      'Confirm the exact current attributed preview before marking the session release-ready.',
      `asset authoring accept-preview --session ${session.sessionId} --preview-digest <sha256> --confirm`,
      'requires-confirmation',
      previewDigest === undefined ? [] : [previewDigest],
      ['preview-digest', 'confirm'],
    )];
  }

  if (session.phase === 'imported') {
    return [nextAction(
      'validate-session',
      'Validate the imported candidate against the current asset-pack sources.',
      `asset authoring validate --session ${session.sessionId}`,
      'safe',
      session.manifestDigest === null ? [] : [session.manifestDigest],
    )];
  }

  if (session.phase === 'validated' && session.receipts.validation !== null && session.receipts.preview === null) {
    return [nextAction(
      'preview-session',
      'Create an attributed preview from the current validation receipt.',
      `asset authoring preview --session ${session.sessionId}`,
      'safe',
      session.manifestDigest === null ? [] : [session.manifestDigest],
    )];
  }

  return [];
}

function responseFor(
  session: AssetAuthoringSession,
  options: ResponseOptions = {},
): AuthoringResponseData {
  const artifacts = options.artifacts
    ?? [manifestArtifact(session)].filter((artifact): artifact is AuthoringArtifact => artifact !== undefined);
  const input: AuthoringResponseProjectionInput = {
    sessionId: session.sessionId,
    goal: session.goal,
    state: session.state,
    reason: session.reason,
    phase: session.phase,
    checkpoint: checkpointForResponse(session),
    checkpointFreshness: session.checkpointFreshness,
    diagnostics: options.diagnostics ?? [],
    artifacts,
    inputsNeeded: options.inputsNeeded ?? [],
    nextActions: nextActionsFor(session),
    retrySafety: session.conflict !== null
      ? 'requires-confirmation'
      : session.state === 'failed'
        ? 'blocked'
        : 'safe',
    manifestDigest: session.manifestDigest,
    sourceDigests: session.checkpoints.flatMap((checkpoint) =>
      checkpoint.checkpoint ? [checkpoint.checkpoint.digest] : []),
    ...(options.validation === undefined ? {} : { validation: options.validation }),
    ...(options.preview === undefined ? {} : { preview: options.preview }),
    releaseGates: releaseGateFreshness(session),
    releaseDeclaration: session.receipts.releaseDeclaration,
    previewAcceptance: session.receipts.previewAcceptance,
    draftReceipt: session.receipts.draftArchive ?? null,
    syncReceipt: session.receipts.sync ?? null,
  };
  return authoringResponseProjection(input);
}

function missingCreditsResponse(session: AssetAuthoringSession): AuthoringResponseData {
  return responseFor(session, {
    inputsNeeded: [
      { id: 'author', summary: 'Provide the human attribution author.' },
      { id: 'license', summary: 'Provide the human attribution license.' },
    ],
  });
}

function commandFailure(
  command: string,
  error: AuthoringCommandError,
): CliResponse<null> {
  return commandError(command, issue(error.code, error.message, error.path));
}

function appendConflict(
  expectedDigest: string,
  actualDigest: string,
): AssetAuthoringManifestConflict {
  return {
    kind: 'manifest-drift',
    expectedDigest,
    actualDigest,
    detectedAt: new Date().toISOString(),
    resolution: 'unresolved',
  };
}

function updateForManifestConflict(
  session: AssetAuthoringSession,
  actualDigest: string,
): AssetAuthoringSessionUpdate {
  const expectedDigest = session.manifestDigest;
  if (expectedDigest === null) {
    throw new AuthoringCommandError(
      'Cannot record manifest drift before a session manifest revision exists.',
      { code: 'asset_authoring_manifest_unavailable' },
    );
  }
  return {
    state: 'needs-user-action',
    reason: 'manifest-conflict',
    phase: 'blocked',
    checkpointFreshness: 'blocked',
    conflict: appendConflict(expectedDigest, actualDigest),
    provenance: appendProvenance(session, {
      kind: 'manifest-conflict',
      occurredAt: new Date().toISOString(),
      summary: 'Manifest bytes changed outside the authoring session.',
      digest: actualDigest,
    }),
  };
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function sourcePathFor(session: AssetAuthoringSession, targetId: string): string | undefined {
  const candidate = path.resolve(session.packRoot, targetId);
  return isInsideRoot(session.packRoot, candidate) ? candidate : undefined;
}

function updateForExternalPng(
  session: AssetAuthoringSession,
): AssetAuthoringSessionUpdate | undefined {
  const changes: Array<{
    readonly targetId: string;
    readonly digest: string;
  }> = [];

  for (const targetId of session.plan.scope.paths) {
    if (!targetId.endsWith('.png')) continue;
    const sourcePath = sourcePathFor(session, targetId);
    if (sourcePath === undefined) continue;
    const bytes = readRegularFile(sourcePath);
    if (bytes === undefined || !isPng(bytes)) continue;
    const digest = sha256(bytes);
    const checkpoint = session.checkpoints.find((entry) => entry.targetId === targetId);
    if (checkpoint?.checkpoint?.digest === digest) continue;
    const alreadyRecorded = session.provenance.some((event) =>
      event.kind === 'external-png-observed'
      && event.digest === digest
      && event.summary.includes(targetId));
    if (!alreadyRecorded) changes.push({ targetId, digest });
  }

  if (changes.length === 0) return undefined;
  const changedByTarget = new Map(changes.map((change) => [change.targetId, change.digest]));
  let provenance = session.provenance;
  for (const change of changes) {
    provenance = [
      ...provenance,
      {
        id: randomUUID(),
        kind: 'external-png-observed',
        occurredAt: new Date().toISOString(),
        summary: `External PNG observed at ${change.targetId}.`,
        digest: change.digest,
      },
    ];
  }
  return {
    state: 'needs-user-action',
    reason: 'external-png-drift',
    phase: 'blocked',
    checkpointFreshness: 'stale',
    checkpoints: session.checkpoints.map((checkpoint) => {
      const digest = changedByTarget.get(checkpoint.targetId);
      if (digest === undefined) return checkpoint;
      return {
        ...checkpoint,
        freshness: 'stale',
        checkpoint: {
          id: `external-png:${checkpoint.targetId}`,
          phase: 'blocked',
          digest,
          freshness: 'stale',
        },
      };
    }),
    provenance,
  };
}

function resumeSession(
  workspace: AssetWorkspace,
  session: AssetAuthoringSession,
): AssetAuthoringSession {
  const store = createAssetAuthoringSessionStore(workspace);
  const manifestPath = manifestPathFor(session);
  const currentManifestDigest = fileDigest(manifestPath);
  if (
    session.manifestDigest !== null
    && currentManifestDigest !== session.manifestDigest
  ) {
    if (
      session.conflict?.resolution === 'unresolved'
      && session.conflict.actualDigest === (currentManifestDigest ?? sha256(Buffer.alloc(0)))
    ) {
      return session;
    }
    const actualDigest = currentManifestDigest ?? sha256(Buffer.alloc(0));
    return store.replace(session.sessionId, updateForManifestConflict(session, actualDigest));
  }

  if (session.conflict !== null) return session;
  const pngUpdate = updateForExternalPng(session);
  return pngUpdate === undefined
    ? session
    : store.replace(session.sessionId, pngUpdate);
}

function startSession(
  context: AuthoringCommandContext,
): CliResponse<AuthoringResponseData> | CliResponse<null> {
  const planArgument = flagString(context.parsed.flags, 'plan');
  if (planArgument === undefined) {
    return commandError('asset authoring start', issue(
      'missing_argument',
      '--plan is required.',
      '--plan',
    ));
  }
  const planPath = absolutePath(context.cwd, planArgument);
  const loaded = readPlanFile(planPath);
  if (!loaded.ok) return loaded.response;

  const plan = loaded.plan;
  const packRoot = packRootFor(context.workspace, plan);
  const store = createAssetAuthoringSessionStore(context.workspace);
  let session = store.create({ plan, packRoot });

  if (plan.goal === 'attach-pack') {
    const manifestBytes = readRegularFile(path.join(packRoot, MANIFEST_FILE));
    if (manifestBytes === undefined) {
      session = store.replace(session.sessionId, {
        state: 'failed',
        reason: 'pack-not-found',
        phase: 'blocked',
        checkpointFreshness: 'blocked',
      });
      return commandOk('asset authoring start', responseFor(session));
    }
    const manifestDigest = sha256(manifestBytes);
    writeSessionManifestSnapshot(context.workspace, session, manifestBytes);
    session = store.replace(session.sessionId, {
      state: 'needs-user-action',
      reason: 'pack-attached',
      phase: 'scaffolded',
      checkpointFreshness: 'current',
      checkpoint: {
        id: 'manifest',
        phase: 'scaffolded',
        digest: manifestDigest,
        freshness: 'current',
      },
      manifestDigest,
    });
    return commandOk('asset authoring start', responseFor(session));
  }

  if (!hasManifestCredits(plan)) {
    session = store.replace(session.sessionId, {
      state: 'needs-user-action',
      reason: 'missing-draft-credits',
      phase: 'planned',
      checkpointFreshness: 'missing',
    });
    return commandOk('asset authoring start', missingCreditsResponse(session));
  }

  if (plan.goal === 'extend-item') {
    session = store.replace(session.sessionId, {
      state: 'needs-user-action',
      reason: 'awaiting-contract',
      phase: 'planned',
      checkpointFreshness: 'missing',
    });
    return commandOk('asset authoring start', responseFor(session));
  }

  const scaffold = scaffoldNewAssetPack({
    packId: plan.pack.id,
    version: plan.pack.version,
    displayName: plan.pack.displayName,
    localId: plan.asset.localId,
    typeName: plan.asset.typeName,
    bodyTypes: plan.asset.bodyTypes,
    animations: plan.asset.animations,
    credits: plan.draftCredits!,
    advanced: false,
    outputDirectory: packRoot,
  });
  if (!scaffold.ok) {
    session = store.replace(session.sessionId, {
      state: 'failed',
      reason: 'scaffold-failed',
      phase: 'blocked',
      checkpointFreshness: 'blocked',
    });
    return commandOk(
      'asset authoring start',
      responseFor(session, {
        diagnostics: scaffold.diagnostics.map((diagnostic) => issue(
          diagnostic.code,
          diagnostic.message,
          diagnostic.path,
        )),
      }),
    );
  }

  const manifestBytes = readRegularFile(scaffold.manifestPath);
  if (manifestBytes === undefined) {
    throw new AuthoringCommandError(
      'The existing asset scaffold did not produce a manifest.',
      { code: 'asset_authoring_scaffold_invalid', path: scaffold.manifestPath },
    );
  }
  const manifestDigest = sha256(manifestBytes);
  writeSessionManifestSnapshot(context.workspace, session, manifestBytes);
  session = store.replace(session.sessionId, {
    state: 'needs-user-action',
    reason: 'scaffolded',
    phase: 'scaffolded',
    checkpointFreshness: 'current',
    checkpoint: {
      id: 'manifest',
      phase: 'scaffolded',
      digest: manifestDigest,
      freshness: 'current',
    },
    manifestDigest,
  });
  return commandOk('asset authoring start', responseFor(session));
}

async function statusSession(
  workspace: AssetWorkspace,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  const store = createAssetAuthoringSessionStore(workspace);
  const session = await refreshSyncReceiptState(
    workspace,
    store,
    store.status(sessionId),
  );
  return commandOk('asset authoring status', responseFor(
    session,
    session.reason === 'missing-draft-credits'
      ? { inputsNeeded: [
        { id: 'author', summary: 'Provide the human attribution author.' },
        { id: 'license', summary: 'Provide the human attribution license.' },
      ] }
      : {},
  ));
}

async function draftCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  const store = createAssetAuthoringSessionStore(context.workspace);
  const session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null || session.reason === 'external-png-drift') {
    return commandOk('asset authoring draft', responseFor(session));
  }

  const previous = session.receipts.draftArchive;
  const outputArgument = flagString(context.parsed.flags, 'output');
  const defaultOutputPath = path.join(
    assetAuthoringReleaseArtifactRoot(context.workspace, session.sessionId),
    `${session.plan.pack.id}-${session.plan.pack.version}.draft.lpc-assets.zip`,
  );
  const requestedOutputPath = outputArgument === undefined
    ? defaultOutputPath
    : path.resolve(context.cwd, outputArgument);
  if (previous !== null && previous !== undefined && previous.archivePath === requestedOutputPath) {
    const stale = await draftReceiptStale(previous, session);
    if (stale) {
      const next = store.replace(sessionId, {
        state: 'needs-user-action',
        reason: 'draft-archive-stale',
        phase: 'blocked',
        checkpointFreshness: 'stale',
        checkpoints: session.checkpoints.map((checkpoint) => ({
          ...checkpoint,
          freshness: 'stale',
        })),
        provenance: appendProvenance(session, {
          kind: 'checkpoint-invalidated',
          occurredAt: new Date().toISOString(),
          digest: previous.archiveDigest,
          summary: `Draft recovery evidence is stale: ${stale}.`,
        }),
      });
      return commandOk('asset authoring draft', responseFor(next));
    }
  }

  const result = await createDraftArchive({
    cwd: context.cwd,
    workspace: context.workspace,
    session,
    ...(outputArgument === undefined
      ? {}
      : { outputPath: outputArgument }),
  });
  const receipt = previous !== null
    && previous !== undefined
    && previous.archivePath === result.receipt.archivePath
    && previous.archiveDigest === result.receipt.archiveDigest
    && previous.manifestDigest === result.receipt.manifestDigest
    && previous.contentDigest === result.receipt.contentDigest
    && sourceDigestSetsEqual(previous.sourceDigests, result.receipt.sourceDigests)
    ? previous
    : result.receipt;
  const next = store.replace(sessionId, {
    state: 'completed',
    reason: 'draft-archive-current',
    phase: session.phase,
    checkpoint: {
      id: 'draftArchive',
      phase: session.phase,
      digest: receipt.archiveDigest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
    receipts: {
      ...session.receipts,
      draftArchive: receipt,
    },
    provenance: appendProvenance(session, {
      kind: 'draft-archive-recorded',
      occurredAt: receipt.recordedAt,
      digest: receipt.archiveDigest,
      summary: 'Deterministic draft recovery archive recorded for the current session source set.',
    }),
  });
  return commandOk(
    'asset authoring draft',
    responseFor(next, {
      artifacts: [{
        id: 'draft-archive',
        path: receipt.archivePath,
        digest: receipt.archiveDigest,
      }],
    }),
  );
}

async function draftReceiptStale(
  receipt: NonNullable<AssetAuthoringSession['receipts']['draftArchive']>,
  session: AssetAuthoringSession,
): Promise<string | undefined> {
  const archiveBytes = readRegularFile(receipt.archivePath);
  if (archiveBytes === undefined) return 'the recorded archive is missing or not regular';
  if (sha256(archiveBytes) !== receipt.archiveDigest) {
    return 'the recorded archive bytes changed externally';
  }

  const loaded = await loadAssetPackFiles(session.packRoot);
  if (!loaded.ok) return 'the session pack can no longer be captured';
  const currentSourceDigests = [...loaded.sourceDigests]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, digest]) => ({ path: sourcePath, digest }));
  if (
    sha256(loaded.manifestBytes) !== receipt.manifestDigest
    || loaded.contentDigest !== receipt.contentDigest
    || loaded.pack.id !== receipt.packId
    || loaded.pack.version !== receipt.version
    || !sourceDigestSetsEqual(currentSourceDigests, receipt.sourceDigests)
  ) {
    return 'the session manifest or source evidence changed externally';
  }
  return undefined;
}

function syncFailureIsStale(
  code: string,
): boolean {
  return code === 'asset_digest_mismatch'
    || code === 'asset_output_root_unowned'
    || code === 'asset_publish_failed'
    || code === 'asset_transaction_unsafe';
}

function markSyncReceiptStale(
  store: ReturnType<typeof createAssetAuthoringSessionStore>,
  session: AssetAuthoringSession,
  summary: string,
): AssetAuthoringSession {
  return store.replace(session.sessionId, {
    state: 'needs-user-action',
    reason: 'sync-receipt-stale',
    phase: 'blocked',
    checkpointFreshness: 'stale',
    checkpoints: session.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      freshness: 'stale',
    })),
    provenance: appendProvenance(session, {
      kind: 'checkpoint-invalidated',
      occurredAt: new Date().toISOString(),
      ...(session.receipts.sync?.registryDigest === undefined
        ? {}
        : { digest: session.receipts.sync.registryDigest }),
      summary,
    }),
  });
}

async function refreshSyncReceiptState(
  workspace: AssetWorkspace,
  store: ReturnType<typeof createAssetAuthoringSessionStore>,
  session: AssetAuthoringSession,
): Promise<AssetAuthoringSession> {
  const receipt = session.receipts.sync;
  if (receipt === null || receipt === undefined || session.reason === 'sync-receipt-stale') {
    return session;
  }
  const stale = await syncReceiptStaleReason({ workspace, session, receipt });
  return stale === undefined
    ? session
    : markSyncReceiptStale(store, session, `Sync receipt invalidated: ${stale}.`);
}

async function syncCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData | null>> {
  const store = createAssetAuthoringSessionStore(context.workspace);
  let session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null || session.reason === 'external-png-drift') {
    return commandOk('asset authoring sync', responseFor(session));
  }
  session = await refreshSyncReceiptState(context.workspace, store, session);

  if (!flagBoolean(context.parsed.flags, 'confirm')) {
    const prompted = session.reason === 'sync-confirmation-required'
      || session.reason === 'sync-receipt-stale'
      ? session
      : store.replace(sessionId, {
        state: 'needs-user-action',
        reason: 'sync-confirmation-required',
        phase: session.phase,
        checkpointFreshness: session.checkpointFreshness,
      });
    return commandOk('asset authoring sync', responseFor(prompted));
  }

  const result = await syncLinkedAssetPack({
    packDirectory: session.packRoot,
    workspace: context.workspace,
    runtime: context.runtime!,
  });
  if (!result.ok) {
    const diagnostic = result.diagnostics[0];
    if (session.receipts.sync !== null && session.receipts.sync !== undefined
      && diagnostic !== undefined && syncFailureIsStale(diagnostic.code)) {
      markSyncReceiptStale(
        store,
        session,
        `Sync receipt invalidated by manager evidence: ${diagnostic.message}`,
      );
      return commandError(
        'asset authoring sync',
        issue(diagnostic.code, diagnostic.message, diagnostic.path),
      );
    }
    return commandError(
      'asset authoring sync',
      issue(
        diagnostic?.code ?? 'asset_authoring_sync_failed',
        diagnostic?.message ?? 'Authoring sync failed.',
        diagnostic?.path,
      ),
    );
  }

  const receipt = captureSyncReceipt({
    workspace: context.workspace,
    session,
    synced: result,
  });
  const previous = session.receipts.sync;
  if (
    previous !== null
    && previous !== undefined
    && syncReceiptsEqual(previous, receipt)
    && session.reason === 'sync-current'
  ) {
    return commandOk('asset authoring sync', responseFor(session));
  }

  const next = store.replace(sessionId, {
    state: 'completed',
    reason: 'sync-current',
    phase: session.phase,
    checkpoint: {
      id: 'sync',
      phase: session.phase,
      digest: receipt.compileDigest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
    receipts: {
      ...session.receipts,
      sync: receipt,
    },
    provenance: appendProvenance(session, {
      kind: 'sync-receipt-recorded',
      occurredAt: receipt.recordedAt,
      digest: receipt.registryDigest,
      summary: 'Manager-owned linked asset-pack generation and registry receipt recorded.',
    }),
  });
  return commandOk('asset authoring sync', responseFor(next));
}

function syncReceiptsEqual(
  left: AssetAuthoringSyncReceipt,
  right: AssetAuthoringSyncReceipt,
): boolean {
  return left.id === right.id
    && left.packId === right.packId
    && left.version === right.version
    && left.manifestDigest === right.manifestDigest
    && left.contentDigest === right.contentDigest
    && sourceDigestSetsEqual(left.sourceDigests, right.sourceDigests)
    && left.workspaceId === right.workspaceId
    && left.outputRoot === right.outputRoot
    && left.registryDigest === right.registryDigest
    && left.compileDigest === right.compileDigest
    && JSON.stringify(left.generatedDigests) === JSON.stringify(right.generatedDigests);
}

async function resumeCommand(
  workspace: AssetWorkspace,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  const store = createAssetAuthoringSessionStore(workspace);
  const session = store.read(sessionId);
  const resumed = await refreshSyncReceiptState(
    workspace,
    store,
    resumeSession(workspace, session),
  );
  return commandOk('asset authoring resume', responseFor(
    resumed,
    resumed.reason === 'missing-draft-credits'
      ? { inputsNeeded: [
        { id: 'author', summary: 'Provide the human attribution author.' },
        { id: 'license', summary: 'Provide the human attribution license.' },
      ] }
      : {},
  ));
}

async function freshSessionValidation(options: {
  readonly session: AssetAuthoringSession;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}): Promise<AssetPackValidationReport> {
  const loaded = await loadAssetPackFiles(options.session.packRoot);
  if (loaded.ok) {
    return validateAssetPackDirectory({
      packDirectory: options.session.packRoot,
      workspace: options.workspace,
      runtime: options.runtime,
      snapshot: loaded,
    });
  }
  return validateAssetPackDirectory({
    packDirectory: options.session.packRoot,
    workspace: options.workspace,
    runtime: options.runtime,
  });
}

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeJson(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeJson(entry)] as const),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

function acknowledgementIdentity(record: AssetPackAcknowledgement): string {
  return [
    record.code,
    canonicalJson(record.subject),
    record.contentDigest,
  ].join('\u0000');
}

function acknowledgementRecordDigest(record: AssetPackAcknowledgement): string {
  return sha256(Buffer.from(canonicalJson(record), 'utf8'));
}

function sortAcknowledgements(
  records: readonly AssetPackAcknowledgement[],
): readonly AssetPackAcknowledgement[] {
  return [...records].sort((left, right) =>
    acknowledgementIdentity(left).localeCompare(acknowledgementIdentity(right)));
}

function sameAcknowledgement(
  left: AssetPackAcknowledgement,
  right: AssetPackAcknowledgement,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function parseManifestRecord(
  bytes: Buffer,
  manifestPath: string,
): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new AuthoringCommandError(
      'The session manifest is not valid JSON.',
      { code: 'asset_authoring_manifest_invalid', path: manifestPath },
    );
  }
  if (!isRecord(value)) {
    throw new AuthoringCommandError(
      'The session manifest must be a JSON object.',
      { code: 'asset_authoring_manifest_invalid', path: manifestPath },
    );
  }
  return value;
}

function readAcknowledgementInput(
  context: AuthoringCommandContext,
  session: AssetAuthoringSession,
  manifestBytes: Buffer,
  acknowledgementArgument: string,
): AssetPackAcknowledgement {
  const acknowledgementPath = absolutePath(context.cwd, acknowledgementArgument);
  if (!isInsideRoot(context.workspace.root, acknowledgementPath)) {
    throw new AuthoringCommandError(
      'The acknowledgement file must be inside the asset workspace.',
      { code: 'asset_authoring_path_invalid', path: acknowledgementPath },
    );
  }
  const bytes = readRegularFile(acknowledgementPath);
  if (bytes === undefined) {
    throw new AuthoringCommandError(
      'The acknowledgement file must be a regular file.',
      { code: 'asset_authoring_acknowledgement_invalid', path: acknowledgementPath },
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new AuthoringCommandError(
      'The acknowledgement file is not valid JSON.',
      { code: 'asset_authoring_acknowledgement_invalid', path: acknowledgementPath },
    );
  }
  if (!isRecord(input)) {
    throw new AuthoringCommandError(
      'The acknowledgement file must contain exactly one JSON record.',
      { code: 'asset_authoring_acknowledgement_invalid', path: acknowledgementPath },
    );
  }

  const manifest = parseManifestRecord(manifestBytes, manifestPathFor(session));
  const parsed = parseAssetPackSource({
    ...manifest,
    acknowledgements: [input],
  });
  if (!parsed.ok) {
    const diagnostic = parsed.diagnostics[0];
    const diagnosticPath = diagnostic?.details?.path;
    throw new AuthoringCommandError(
      diagnostic?.message ?? 'The acknowledgement record is not Core-valid.',
      {
        code: 'asset_authoring_acknowledgement_invalid',
        ...(typeof diagnosticPath === 'string' ? { path: diagnosticPath } : {}),
      },
    );
  }
  const normalized = normalizeAssetPack(parsed.source).acknowledgements;
  const record = normalized[0];
  if (normalized.length !== 1 || record === undefined) {
    throw new AuthoringCommandError(
      'The acknowledgement file must contain exactly one record.',
      { code: 'asset_authoring_acknowledgement_invalid', path: acknowledgementPath },
    );
  }
  return record;
}

function acknowledgementReceiptFor(
  report: AssetPackValidationReport,
  records: readonly AssetPackAcknowledgement[],
): AssetAuthoringAcknowledgementReceipt {
  if (report.contentDigest === undefined || report.manifestDigest === undefined
    || report.sourceDigests === undefined) {
    throw new AuthoringCommandError(
      'Acknowledgement evidence is incomplete because the current pack snapshot is not digest-bound.',
      { code: 'asset_authoring_evidence_incomplete' },
    );
  }
  return {
    id: report.contentDigest,
    manifestDigest: report.manifestDigest,
    sourceDigests: report.sourceDigests.map((entry) => ({
      path: entry.path,
      digest: entry.digest,
    })),
    recordDigests: [...records]
      .map((record) => acknowledgementRecordDigest(record))
      .sort((left, right) => left.localeCompare(right)),
  };
}

function sameAcknowledgementReceipt(
  left: AssetAuthoringAcknowledgementReceipt | null,
  right: AssetAuthoringAcknowledgementReceipt,
): boolean {
  return left !== null
    && left.id === right.id
    && left.manifestDigest === right.manifestDigest
    && left.recordDigests.length === right.recordDigests.length
    && left.recordDigests.every((digest, index) => digest === right.recordDigests[index])
    && left.sourceDigests.length === right.sourceDigests.length
    && left.sourceDigests.every((entry, index) => {
      const other = right.sourceDigests[index];
      return other !== undefined && entry.path === other.path && entry.digest === other.digest;
    });
}

function readReleaseDeclarationInput(
  context: AuthoringCommandContext,
  declarationArgument: string,
): { readonly result: ReturnType<typeof parseAssetReleaseDeclaration>; readonly path: string } {
  const declarationPath = absolutePath(context.cwd, declarationArgument);
  if (!isInsideRoot(context.workspace.root, declarationPath)) {
    throw new AuthoringCommandError(
      'The declaration file must be inside the asset workspace.',
      { code: 'asset_authoring_path_invalid', path: declarationPath },
    );
  }
  const bytes = readRegularFile(declarationPath);
  if (bytes === undefined) {
    throw new AuthoringCommandError(
      'The declaration file must be a regular file.',
      { code: 'asset_authoring_declaration_invalid', path: declarationPath },
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new AuthoringCommandError(
      'The declaration file is not valid JSON.',
      { code: 'asset_authoring_declaration_invalid', path: declarationPath },
    );
  }
  const parsed = parseAssetReleaseDeclaration(input);
  return { result: parsed, path: declarationPath };
}

function releaseCreditDigest(pack: NormalizedAssetPack): string {
  const creditOverrides = Object.fromEntries(
    [...pack.creditOverrides.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value]),
  );
  return sha256(Buffer.from(canonicalJson({
    credits: pack.credits,
    creditOverrides,
  }), 'utf8'));
}

function declarationReceiptFor(options: {
  readonly declaration: AssetReleaseDeclaration;
  readonly declarationDigest: string;
  readonly session: AssetAuthoringSession;
  readonly report: AssetPackValidationReport;
  readonly acknowledgementRecordDigests: readonly string[];
  readonly creditDigest: string;
}): AssetAuthoringReleaseDeclarationReceipt {
  if (options.report.contentDigest === undefined
    || options.report.manifestDigest === undefined
    || options.report.sourceDigests === undefined
    || options.session.receipts.validation === null) {
    throw new AuthoringCommandError(
      'Release declaration evidence is incomplete.',
      { code: 'asset_authoring_evidence_incomplete' },
    );
  }
  return {
    schema: 'lpc-toolkit.asset-authoring-release-receipt.v1',
    kind: 'declaration',
    sessionId: options.session.sessionId,
    cliVersion: CLI_VERSION,
    recordedAt: new Date().toISOString(),
    declarant: options.declaration.declarant,
    declarationDigest: options.declarationDigest,
    manifestDigest: options.report.manifestDigest,
    sourceDigests: options.report.sourceDigests,
    validationReceiptId: options.session.receipts.validation.id,
    validationReceiptRevision: options.session.receipts.validation.id,
    creditDigests: {
      authorAndSource: options.creditDigest,
      licenseAuthority: options.creditDigest,
    },
    acknowledgements: {
      contentDigest: options.report.contentDigest,
      recordDigests: options.acknowledgementRecordDigests,
    },
  };
}

function previewAcceptanceReceiptFor(options: {
  readonly session: AssetAuthoringSession;
  readonly declaration: AssetAuthoringReleaseDeclarationReceipt;
  readonly validation: AssetAuthoringValidationReceipt;
  readonly preview: AssetAuthoringPreviewReceipt;
  readonly artifacts: readonly AssetAuthoringReleaseArtifactDigest[];
}): AssetAuthoringPreviewAcceptanceReceipt {
  return {
    schema: 'lpc-toolkit.asset-authoring-release-receipt.v1',
    kind: 'preview-acceptance',
    sessionId: options.session.sessionId,
    cliVersion: CLI_VERSION,
    recordedAt: new Date().toISOString(),
    declarant: options.declaration.declarant,
    declarationReceiptDigest: options.declaration.declarationDigest,
    manifestDigest: options.preview.manifestDigest,
    sourceDigests: options.preview.sourceDigests,
    validationReceiptId: options.validation.id,
    validationReceiptRevision: options.validation.id,
    previewReceiptId: options.preview.id,
    previewInputDigest: options.preview.inputDigest,
    artifacts: options.artifacts,
  };
}

function redigestPreviewArtifacts(
  session: AssetAuthoringSession,
  preview: AssetAuthoringPreviewReceipt,
): readonly AssetAuthoringReleaseArtifactDigest[] {
  if (preview.artifacts === null) {
    throw new AuthoringCommandError(
      'The preview receipt predates exact artifact evidence; render a fresh preview first.',
      { code: 'asset_authoring_preview_artifacts_incomplete' },
    );
  }
  return preview.artifacts.map((artifact) => {
    if (!isInsideRoot(session.packRoot, artifact.path)) {
      throw new AuthoringCommandError(
        'The preview artifact path is outside the session-owned pack.',
        { code: 'asset_authoring_path_invalid', path: artifact.path },
      );
    }
    const bytes = readRegularFile(artifact.path);
    if (bytes === undefined) {
      throw new AuthoringCommandError(
        `The preview artifact is missing or not a regular file: ${artifact.path}.`,
        { code: 'asset_authoring_preview_artifact_stale', path: artifact.path },
      );
    }
    const digest = sha256(bytes);
    if (digest !== artifact.digest) {
      throw new AuthoringCommandError(
        `The preview artifact changed after rendering: ${artifact.path}.`,
        { code: 'asset_authoring_preview_artifact_stale', path: artifact.path },
      );
    }
    return { ...artifact };
  });
}

function previewArtifactDigest(
  artifacts: readonly AssetAuthoringReleaseArtifactDigest[],
): string {
  const preview = artifacts.find((artifact) => artifact.id === 'preview:preview');
  if (preview === undefined) {
    throw new AuthoringCommandError(
      'The preview receipt is missing the rendered PNG artifact.',
      { code: 'asset_authoring_preview_artifacts_incomplete' },
    );
  }
  return preview.digest;
}

function blockedReleaseSession(
  session: AssetAuthoringSession,
  reason: string,
  phase: AssetAuthoringSession['phase'] = 'blocked',
): AssetAuthoringSession {
  return {
    ...session,
    state: 'needs-user-action',
    reason,
    phase,
    checkpointFreshness: 'stale',
  };
}

function sameReleaseDeclarationBinding(
  declaration: AssetAuthoringReleaseDeclarationReceipt,
  validation: AssetAuthoringValidationReceipt,
  preview: AssetAuthoringPreviewReceipt | null,
  acknowledgement: AssetAuthoringAcknowledgementReceipt | null,
  manifestDigest: string,
): boolean {
  const acknowledgementDigests = acknowledgement?.recordDigests ?? [];
  return declaration.manifestDigest === manifestDigest
    && declaration.validationReceiptId === validation.id
    && sourceDigestSetsEqual(declaration.sourceDigests, validation.sourceDigests)
    && declaration.acknowledgements.recordDigests.length === acknowledgementDigests.length
    && declaration.acknowledgements.recordDigests.every((digest, index) =>
      digest === acknowledgementDigests[index])
    && (preview === null || declaration.manifestDigest === preview.manifestDigest);
}

function samePreviewAcceptanceBinding(
  left: AssetAuthoringPreviewAcceptanceReceipt,
  right: AssetAuthoringPreviewAcceptanceReceipt,
): boolean {
  return left.sessionId === right.sessionId
    && left.declarationReceiptDigest === right.declarationReceiptDigest
    && left.manifestDigest === right.manifestDigest
    && sourceDigestSetsEqual(left.sourceDigests, right.sourceDigests)
    && left.validationReceiptId === right.validationReceiptId
    && left.validationReceiptRevision === right.validationReceiptRevision
    && left.previewReceiptId === right.previewReceiptId
    && left.previewInputDigest === right.previewInputDigest
    && artifactSetsEqual(left.artifacts, right.artifacts);
}

function validationSessionUpdate(
  session: AssetAuthoringSession,
  report: AssetPackValidationReport,
): AssetAuthoringSessionUpdate {
  const sourceDigests = report.sourceDigests?.map((entry) => ({
    path: entry.path,
    digest: entry.digest,
  })) ?? null;
  const manifestDigest = report.manifestDigest;
  const exactEvidence = session.manifestDigest !== null
    && manifestDigest === session.manifestDigest
    && sourceDigests !== null;
  const validationRevision = report.contentDigest ?? manifestDigest;
  const receipt = exactEvidence && validationRevision !== undefined
    ? {
      id: validationRevision,
      manifestDigest,
      sourceDigests,
    }
    : null;
  const checkpoint = validationRevision === undefined
    ? null
    : {
      id: 'validation',
      phase: 'validated' as const,
      digest: validationRevision,
      freshness: exactEvidence ? 'current' as const : 'stale' as const,
    };
  const reason = report.valid
    ? exactEvidence ? 'validation-current' : 'validation-incomplete'
    : 'validation-failed';
  const receipts: AssetAuthoringSessionReceipts = {
    validation: receipt,
    preview: session.receipts.preview,
    acknowledgements: session.receipts.acknowledgements,
    releaseDeclaration: session.receipts.releaseDeclaration,
    previewAcceptance: session.receipts.previewAcceptance,
  };
  return {
    state: 'needs-user-action',
    reason,
    phase: 'validated',
    checkpoint,
    checkpointFreshness: exactEvidence ? 'current' : 'stale',
    receipts,
    provenance: appendProvenance(session, {
      kind: 'provider',
      occurredAt: new Date().toISOString(),
      ...(validationRevision === undefined ? {} : { digest: validationRevision }),
      summary: exactEvidence
        ? 'Fresh asset-pack validation recorded for the session source set.'
        : 'Asset-pack validation completed without a complete session evidence set.',
    }),
  };
}

async function validateCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  if (context.runtime === undefined) {
    throw new AuthoringCommandError(
      'The asset authoring validate command requires prepared runtime assets.',
      { code: 'asset_authoring_runtime_missing' },
    );
  }
  const store = createAssetAuthoringSessionStore(context.workspace);
  const session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null) {
    throw new AuthoringCommandError(
      'The authoring session has an unresolved manifest conflict; reconcile it before validation.',
      { code: 'asset_authoring_manifest_conflict' },
    );
  }
  const report = await freshSessionValidation({
    session,
    workspace: context.workspace,
    runtime: context.runtime,
  });
  const next = store.replace(sessionId, validationSessionUpdate(session, report));
  return commandOk(
    'asset authoring validate',
    responseFor(next, { validation: report }),
  );
}

async function acknowledgeCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  if (context.runtime === undefined) {
    throw new AuthoringCommandError(
      'The asset authoring acknowledge command requires prepared runtime assets.',
      { code: 'asset_authoring_runtime_missing' },
    );
  }
  const acknowledgementArgument = flagString(context.parsed.flags, 'acknowledgement');
  if (acknowledgementArgument === undefined) {
    throw new AuthoringCommandError(
      'Acknowledgement requires --acknowledgement.',
      { code: 'missing_argument', path: '--acknowledgement' },
    );
  }

  const store = createAssetAuthoringSessionStore(context.workspace);
  const session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null) {
    throw new AuthoringCommandError(
      'The authoring session has an unresolved manifest conflict; reconcile it before acknowledging a warning.',
      { code: 'asset_authoring_manifest_conflict' },
    );
  }

  const loaded = await loadAssetPackFiles(session.packRoot);
  if (!loaded.ok) {
    const diagnostic = loaded.diagnostics[0];
    throw new AuthoringCommandError(
      diagnostic?.message ?? 'The session asset pack could not be loaded.',
      { code: diagnostic?.code ?? 'asset_authoring_pack_invalid', path: session.packRoot },
    );
  }
  const manifestPath = manifestPathFor(session);
  const currentManifestDigest = sha256(loaded.manifestBytes);
  if (session.manifestDigest === null || session.manifestDigest !== currentManifestDigest) {
    throw new AuthoringCommandError(
      'The session manifest changed before acknowledgement evidence was collected.',
      { code: 'asset_authoring_digest_mismatch', path: manifestPath },
    );
  }

  const report = await freshSessionValidation({
    session,
    workspace: context.workspace,
    runtime: context.runtime,
  });
  if (report.manifestDigest !== currentManifestDigest || report.sourceDigests === undefined) {
    throw new AuthoringCommandError(
      'Fresh validation did not capture the current manifest and complete source digest set.',
      { code: 'asset_authoring_evidence_incomplete', path: manifestPath },
    );
  }
  const supplied = readAcknowledgementInput(
    context,
    session,
    loaded.manifestBytes,
    acknowledgementArgument,
  );
  const template = report.acknowledgementRecords.find((record) =>
    acknowledgementIdentity(record) === acknowledgementIdentity(supplied));
  if (template === undefined) {
    throw new AuthoringCommandError(
      'The supplied acknowledgement does not match one current warning template.',
      { code: 'asset_authoring_acknowledgement_out_of_scope' },
    );
  }
  if (report.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new AuthoringCommandError(
      'Technical validation errors must be resolved before warning acknowledgement is published.',
      { code: 'asset_authoring_validation_failed' },
    );
  }

  const existing = loaded.pack.acknowledgements.find((record) =>
    acknowledgementIdentity(record) === acknowledgementIdentity(supplied));
  if (existing !== undefined && !sameAcknowledgement(existing, supplied)) {
    throw new AuthoringCommandError(
      'A current acknowledgement with the same warning identity already has a different reason.',
      { code: 'asset_authoring_acknowledgement_conflict' },
    );
  }

  if (!flagBoolean(context.parsed.flags, 'confirm')) {
    const pendingSession: AssetAuthoringSession = {
      ...session,
      state: 'needs-user-action',
      reason: 'acknowledgement-confirmation-required',
      phase: 'validated',
    };
    return commandOk(
      'asset authoring acknowledge',
      responseFor(pendingSession, { validation: report }),
    );
  }

  const previousSnapshotBytes = readRegularFile(sessionSnapshotPath(context.workspace, session));
  let snapshotChanged = false;
  let published = false;
  let publishedManifestDigest: string | undefined;
  try {
    if (existing === undefined) {
      const manifest = parseManifestRecord(loaded.manifestBytes, manifestPath);
      const acknowledgements = sortAcknowledgements([
        ...loaded.pack.acknowledgements,
        supplied,
      ]);
      const nextManifestBytes = Buffer.from(
        `${JSON.stringify({ ...manifest, acknowledgements }, null, 2)}\n`,
        'utf8',
      );
      const latestManifestBytes = readRegularFile(manifestPath);
      if (latestManifestBytes === undefined || sha256(latestManifestBytes) !== currentManifestDigest) {
        throw new AuthoringCommandError(
          'The manifest changed while preparing the acknowledgement publication.',
          { code: 'asset_authoring_digest_mismatch', path: manifestPath },
        );
      }
      const replacement = atomicallyReplaceAssetPackSource({
        root: session.packRoot,
        sourcePath: MANIFEST_FILE,
        bytes: nextManifestBytes,
        maximumBytes: 16 * 1024 * 1024,
        expectedTargetDigest: currentManifestDigest as `sha256:${string}`,
      });
      published = true;
      publishedManifestDigest = replacement.digest;
    }

    const finalLoaded = await loadAssetPackFiles(session.packRoot);
    if (!finalLoaded.ok) {
      const diagnostic = finalLoaded.diagnostics[0];
      throw new AuthoringCommandError(
        diagnostic?.message ?? 'The published acknowledgement manifest could not be reloaded.',
        { code: diagnostic?.code ?? 'asset_authoring_pack_invalid', path: manifestPath },
      );
    }
    const finalReport = await freshSessionValidation({
      session,
      workspace: context.workspace,
      runtime: context.runtime,
    });
    const finalManifestDigest = sha256(finalLoaded.manifestBytes);
    if (
      !finalReport.valid
      || finalReport.manifestDigest !== finalManifestDigest
      || finalReport.sourceDigests === undefined
    ) {
      throw new AuthoringCommandError(
        'The acknowledged manifest did not pass fresh validation.',
        { code: 'asset_authoring_validation_failed', path: manifestPath },
      );
    }
    const finalRecord = finalLoaded.pack.acknowledgements.find((record) =>
      acknowledgementIdentity(record) === acknowledgementIdentity(supplied));
    if (finalRecord === undefined) {
      throw new AuthoringCommandError(
        'The exact acknowledgement was not present in the published manifest.',
        { code: 'asset_authoring_acknowledgement_publish_failed', path: manifestPath },
      );
    }
    const acknowledgementReceipt = acknowledgementReceiptFor(
      finalReport,
      finalLoaded.pack.acknowledgements,
    );
    if (existing !== undefined
      && sameAcknowledgementReceipt(session.receipts.acknowledgements, acknowledgementReceipt)) {
      return commandOk(
        'asset authoring acknowledge',
        responseFor(session, { validation: finalReport }),
      );
    }

    writeSessionManifestSnapshot(context.workspace, session, finalLoaded.manifestBytes);
    snapshotChanged = true;
    const validationReceipt = {
      id: finalReport.contentDigest ?? finalManifestDigest,
      manifestDigest: finalManifestDigest,
      sourceDigests: finalReport.sourceDigests,
    };
    const next = store.replace(sessionId, {
      state: 'needs-user-action',
      reason: 'acknowledgement-current',
      phase: 'validated',
      checkpoint: {
        id: 'acknowledgements',
        phase: 'validated',
        digest: acknowledgementReceipt.id,
        freshness: 'current',
      },
      checkpointFreshness: 'current',
      receipts: {
        validation: validationReceipt,
        preview: session.receipts.preview,
        acknowledgements: acknowledgementReceipt,
        releaseDeclaration: session.receipts.releaseDeclaration,
        previewAcceptance: session.receipts.previewAcceptance,
      },
      manifestDigest: finalManifestDigest,
      provenance: appendProvenance(session, {
        kind: 'human-declaration',
        occurredAt: new Date().toISOString(),
        digest: acknowledgementReceipt.id,
        summary: 'Exact human warning acknowledgement persisted for the current manifest and source set.',
      }),
    });
    return commandOk(
      'asset authoring acknowledge',
      responseFor(next, { validation: finalReport }),
    );
  } catch (error) {
    if (published && publishedManifestDigest !== undefined) {
      const currentManifestBytes = readRegularFile(manifestPath);
      if (currentManifestBytes !== undefined && sha256(currentManifestBytes) === publishedManifestDigest) {
        atomicallyReplaceAssetPackSource({
          root: session.packRoot,
          sourcePath: MANIFEST_FILE,
          bytes: loaded.manifestBytes,
          maximumBytes: 16 * 1024 * 1024,
          expectedTargetDigest: publishedManifestDigest as `sha256:${string}`,
        });
      }
    }
    if (snapshotChanged) {
      const snapshotPath = sessionSnapshotPath(context.workspace, session);
      if (previousSnapshotBytes === undefined) {
        rmSync(snapshotPath, { force: true });
      } else {
        atomicWrite(snapshotPath, previousSnapshotBytes);
      }
    }
    throw error;
  }
}

async function declareCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  if (context.runtime === undefined) {
    throw new AuthoringCommandError(
      'The asset authoring declare command requires prepared runtime assets.',
      { code: 'asset_authoring_runtime_missing' },
    );
  }
  const declarationArgument = flagString(context.parsed.flags, 'declaration');
  if (declarationArgument === undefined) {
    throw new AuthoringCommandError(
      'Declaration requires --declaration.',
      { code: 'missing_argument', path: '--declaration' },
    );
  }
  const store = createAssetAuthoringSessionStore(context.workspace);
  const session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null) {
    throw new AuthoringCommandError(
      'The authoring session has an unresolved manifest conflict; reconcile it before declaring release authority.',
      { code: 'asset_authoring_manifest_conflict' },
    );
  }

  const loaded = await loadAssetPackFiles(session.packRoot);
  if (!loaded.ok) {
    const diagnostic = loaded.diagnostics[0];
    throw new AuthoringCommandError(
      diagnostic?.message ?? 'The session asset pack could not be loaded.',
      { code: diagnostic?.code ?? 'asset_authoring_pack_invalid', path: session.packRoot },
    );
  }
  const manifestPath = manifestPathFor(session);
  const currentManifestDigest = sha256(loaded.manifestBytes);
  if (session.manifestDigest === null || session.manifestDigest !== currentManifestDigest) {
    throw new AuthoringCommandError(
      'The session manifest changed before release declaration evidence was collected.',
      { code: 'asset_authoring_digest_mismatch', path: manifestPath },
    );
  }

  const declarationInput = readReleaseDeclarationInput(context, declarationArgument);
  if (!declarationInput.result.ok) {
    const diagnostic = declarationInput.result.diagnostics[0];
    throw new AuthoringCommandError(
      diagnostic?.message ?? 'The release declaration is invalid.',
      { code: 'asset_authoring_declaration_invalid', path: declarationInput.path },
    );
  }
  const declaration = declarationInput.result.declaration;
  const report = await freshSessionValidation({
    session,
    workspace: context.workspace,
    runtime: context.runtime,
  });
  if (!report.valid || report.manifestDigest !== currentManifestDigest
    || report.sourceDigests === undefined || report.contentDigest === undefined) {
    const blockedSession: AssetAuthoringSession = {
      ...session,
      state: 'needs-user-action',
      reason: 'validation-receipt-stale',
      phase: 'blocked',
      checkpointFreshness: 'stale',
    };
    return commandOk(
      'asset authoring declare',
      responseFor(blockedSession, { validation: report }),
    );
  }
  const validationReceipt = session.receipts.validation;
  const expectedAcknowledgements = loaded.pack.acknowledgements.length > 0
    ? acknowledgementReceiptFor(report, loaded.pack.acknowledgements)
    : null;
  if (validationReceipt === null
    || validationReceipt.id !== report.contentDigest
    || validationReceipt.manifestDigest !== currentManifestDigest
    || !sourceDigestSetsEqual(validationReceipt.sourceDigests, report.sourceDigests)
    || (expectedAcknowledgements === null
      ? session.receipts.acknowledgements !== null
      : !sameAcknowledgementReceipt(session.receipts.acknowledgements, expectedAcknowledgements))) {
    const blockedSession: AssetAuthoringSession = {
      ...session,
      state: 'needs-user-action',
      reason: 'validation-receipt-stale',
      phase: 'blocked',
      checkpointFreshness: 'stale',
    };
    return commandOk(
      'asset authoring declare',
      responseFor(blockedSession, { validation: report }),
    );
  }
  if (declaration.expectedManifestDigest !== currentManifestDigest) {
    throw new AuthoringCommandError(
      'The declaration expectedManifestDigest does not match the current session manifest.',
      { code: 'asset_authoring_declaration_stale', path: `${declarationInput.path}:$.expectedManifestDigest` },
    );
  }
  const creditDigest = releaseCreditDigest(loaded.pack);
  if (declaration.authorAndSource.creditDigest !== creditDigest) {
    throw new AuthoringCommandError(
      'The declaration author/source credit digest does not match the current pack credits.',
      { code: 'asset_authoring_credit_digest_mismatch', path: `${declarationInput.path}:$.authorAndSource.creditDigest` },
    );
  }
  if (declaration.licenseAuthority.creditDigest !== creditDigest) {
    throw new AuthoringCommandError(
      'The declaration license authority credit digest does not match the current pack credits.',
      { code: 'asset_authoring_credit_digest_mismatch', path: `${declarationInput.path}:$.licenseAuthority.creditDigest` },
    );
  }
  if (declaration.acknowledgements.contentDigest !== report.contentDigest
    || declaration.acknowledgements.recordDigests.length
      !== (expectedAcknowledgements?.recordDigests.length ?? 0)
    || declaration.acknowledgements.recordDigests.some((digest, index) =>
      digest !== expectedAcknowledgements?.recordDigests[index])) {
    throw new AuthoringCommandError(
      'The declaration acknowledgement evidence does not match the current persisted warning records.',
      { code: 'asset_authoring_acknowledgement_digest_mismatch', path: `${declarationInput.path}:$.acknowledgements` },
    );
  }

  const declarationDigest = sha256(Buffer.from(
    assetReleaseDeclarationDigestInput(declaration),
    'utf8',
  ));
  const receipt = declarationReceiptFor({
    declaration,
    declarationDigest,
    session,
    report,
    acknowledgementRecordDigests: expectedAcknowledgements?.recordDigests ?? [],
    creditDigest,
  });
  if (!flagBoolean(context.parsed.flags, 'confirm')) {
    const pendingSession: AssetAuthoringSession = {
      ...session,
      state: 'needs-user-action',
      reason: 'release-declaration-confirmation-required',
    };
    return commandOk(
      'asset authoring declare',
      responseFor(pendingSession, {
        validation: report,
      }),
    );
  }

  const latestManifestBytes = readRegularFile(manifestPath);
  if (latestManifestBytes === undefined || sha256(latestManifestBytes) !== currentManifestDigest) {
    throw new AuthoringCommandError(
      'The manifest changed while preparing the release declaration receipt.',
      { code: 'asset_authoring_digest_mismatch', path: manifestPath },
    );
  }
  const existing = session.receipts.releaseDeclaration;
  if (existing !== null
    && existing.declarationDigest === receipt.declarationDigest
    && existing.manifestDigest === receipt.manifestDigest
    && existing.validationReceiptId === receipt.validationReceiptId
    && sourceDigestSetsEqual(existing.sourceDigests, receipt.sourceDigests)
    && existing.acknowledgements.contentDigest === receipt.acknowledgements.contentDigest
    && existing.acknowledgements.recordDigests.every((digest, index) =>
      digest === receipt.acknowledgements.recordDigests[index])) {
    return commandOk(
      'asset authoring declare',
      responseFor(session, { validation: report }),
    );
  }
  const next = store.replace(sessionId, {
    state: 'needs-user-action',
    reason: 'release-declaration-current',
    phase: session.phase,
    checkpoint: {
      id: 'releaseDeclaration',
      phase: session.phase,
      digest: receipt.declarationDigest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
    receipts: {
      validation: session.receipts.validation,
      preview: session.receipts.preview,
      acknowledgements: session.receipts.acknowledgements,
      releaseDeclaration: receipt,
      previewAcceptance: session.receipts.previewAcceptance,
    },
    provenance: appendProvenance(session, {
      kind: 'human-declaration',
      occurredAt: receipt.recordedAt,
      digest: receipt.declarationDigest,
      summary: 'Explicit human release declaration recorded for the current manifest and attribution evidence.',
    }),
  });
  return commandOk(
    'asset authoring declare',
    responseFor(next, {
      validation: report,
    }),
  );
}

async function acceptPreviewCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  if (context.runtime === undefined) {
    throw new AuthoringCommandError(
      'The asset authoring accept-preview command requires prepared runtime assets.',
      { code: 'asset_authoring_runtime_missing' },
    );
  }
  const suppliedPreviewDigest = requireDigest(
    flagString(context.parsed.flags, 'preview-digest'),
    'preview-digest',
  );
  const store = createAssetAuthoringSessionStore(context.workspace);
  const session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null) {
    throw new AuthoringCommandError(
      'The authoring session has an unresolved manifest conflict; reconcile it before accepting a preview.',
      { code: 'asset_authoring_manifest_conflict' },
    );
  }
  const declaration = session.receipts.releaseDeclaration;
  if (declaration === null) {
    return commandOk(
      'asset authoring accept-preview',
      responseFor(blockedReleaseSession(session, 'release-declaration-stale', 'previewed')),
    );
  }
  const preview = session.receipts.preview;
  if (preview === null || preview.artifacts === null) {
    return commandOk(
      'asset authoring accept-preview',
      responseFor(blockedReleaseSession(session, 'preview-receipt-stale', 'previewed')),
    );
  }

  const loaded = await loadAssetPackFiles(session.packRoot);
  if (!loaded.ok) {
    const diagnostic = loaded.diagnostics[0];
    throw new AuthoringCommandError(
      diagnostic?.message ?? 'The session asset pack could not be loaded.',
      { code: diagnostic?.code ?? 'asset_authoring_pack_invalid', path: session.packRoot },
    );
  }
  const currentManifestDigest = sha256(loaded.manifestBytes);
  if (session.manifestDigest === null || session.manifestDigest !== currentManifestDigest) {
    throw new AuthoringCommandError(
      'The session manifest changed before preview acceptance evidence was collected.',
      { code: 'asset_authoring_digest_mismatch', path: manifestPathFor(session) },
    );
  }

  const report = await freshSessionValidation({
    session,
    workspace: context.workspace,
    runtime: context.runtime,
  });
  const validation = session.receipts.validation;
  if (!report.valid || report.contentDigest === undefined || report.manifestDigest !== currentManifestDigest
    || report.sourceDigests === undefined || validation === null
    || validation.id !== report.contentDigest
    || validation.manifestDigest !== currentManifestDigest
    || !sourceDigestSetsEqual(validation.sourceDigests, report.sourceDigests)) {
    return commandOk(
      'asset authoring accept-preview',
      responseFor(blockedReleaseSession(session, 'validation-receipt-stale'), { validation: report }),
    );
  }
  if (!sameReleaseDeclarationBinding(
    declaration,
    validation,
    preview,
    session.receipts.acknowledgements,
    currentManifestDigest,
  )) {
    return commandOk(
      'asset authoring accept-preview',
      responseFor(blockedReleaseSession(session, 'release-declaration-stale'), { validation: report }),
    );
  }
  if (preview.manifestDigest !== currentManifestDigest
    || preview.validationReceiptId !== validation.id
    || preview.id !== preview.inputDigest
    || !sourceDigestSetsEqual(preview.sourceDigests, report.sourceDigests)) {
    return commandOk(
      'asset authoring accept-preview',
      responseFor(blockedReleaseSession(session, 'preview-receipt-stale'), { validation: report }),
    );
  }

  const artifacts = redigestPreviewArtifacts(session, preview);
  const expectedPreviewDigest = previewArtifactDigest(artifacts);
  if (suppliedPreviewDigest !== expectedPreviewDigest) {
    throw new AuthoringCommandError(
      'The supplied preview digest does not match the exact rendered PNG artifact.',
      { code: 'asset_authoring_preview_digest_mismatch', path: '--preview-digest' },
    );
  }
  const receipt = previewAcceptanceReceiptFor({
    session,
    declaration,
    validation,
    preview,
    artifacts,
  });
  if (!flagBoolean(context.parsed.flags, 'confirm')) {
    const pending = {
      ...session,
      state: 'needs-user-action' as const,
      reason: 'preview-acceptance-confirmation-required',
      phase: 'previewed' as const,
      checkpointFreshness: 'current' as const,
    };
    return commandOk(
      'asset authoring accept-preview',
      responseFor(pending, { validation: report }),
    );
  }

  const latestManifestBytes = readRegularFile(manifestPathFor(session));
  if (latestManifestBytes === undefined || sha256(latestManifestBytes) !== currentManifestDigest) {
    throw new AuthoringCommandError(
      'The manifest changed while preparing preview acceptance.',
      { code: 'asset_authoring_digest_mismatch', path: manifestPathFor(session) },
    );
  }
  const finalArtifacts = redigestPreviewArtifacts(session, preview);
  if (!artifactSetsEqual(artifacts, finalArtifacts)) {
    throw new AuthoringCommandError(
      'A preview artifact changed while preparing preview acceptance.',
      { code: 'asset_authoring_preview_artifact_stale' },
    );
  }
  const finalReport = await freshSessionValidation({
    session,
    workspace: context.workspace,
    runtime: context.runtime,
  });
  if (!finalReport.valid || finalReport.contentDigest !== report.contentDigest
    || finalReport.manifestDigest !== report.manifestDigest
    || finalReport.sourceDigests === undefined
    || !sourceDigestSetsEqual(finalReport.sourceDigests, report.sourceDigests)) {
    throw new AuthoringCommandError(
      'Validation evidence changed while preparing preview acceptance.',
      { code: 'asset_authoring_validation_receipt_stale' },
    );
  }
  const existing = session.receipts.previewAcceptance;
  if (existing !== null && samePreviewAcceptanceBinding(existing, receipt)) {
    return commandOk(
      'asset authoring accept-preview',
      responseFor(session, { validation: finalReport }),
    );
  }
  const next = store.replace(sessionId, {
    state: 'completed',
    reason: 'preview-acceptance-current',
    phase: 'previewed',
    checkpoint: {
      id: 'previewAcceptance',
      phase: 'previewed',
      digest: expectedPreviewDigest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
    receipts: {
      validation: session.receipts.validation,
      preview: session.receipts.preview,
      acknowledgements: session.receipts.acknowledgements,
      releaseDeclaration: session.receipts.releaseDeclaration,
      previewAcceptance: receipt,
    },
    provenance: appendProvenance(session, {
      kind: 'human-preview-acceptance',
      occurredAt: receipt.recordedAt,
      digest: expectedPreviewDigest,
      summary: 'Exact attributed preview artifact set accepted by the human declarant.',
    }),
  });
  return commandOk(
    'asset authoring accept-preview',
    responseFor(next, { validation: finalReport }),
  );
}

function previewInput(context: AuthoringCommandContext): AuthoringPreviewInput {
  const characterArgument = flagString(context.parsed.flags, 'character');
  const inputWithoutDigest = {
    assetId: flagString(context.parsed.flags, 'asset') ?? null,
    animation: flagString(context.parsed.flags, 'animation') ?? null,
    bodyType: flagString(context.parsed.flags, 'body-type') ?? null,
    characterPath: characterArgument === undefined
      ? null
      : absolutePath(context.cwd, characterArgument),
  };
  return {
    ...inputWithoutDigest,
    digest: sha256(Buffer.from(JSON.stringify(inputWithoutDigest), 'utf8')),
  };
}

function previewArtifacts(
  result: Awaited<ReturnType<typeof previewAssetPack>>,
): readonly AuthoringArtifact[] {
  return captureAssetPackPreviewArtifacts(result).map((artifact) => {
    return {
      id: `preview:${artifact.type}`,
      path: artifact.path,
      digest: artifact.digest,
    };
  });
}

function previewReceiptArtifacts(
  artifacts: readonly AuthoringArtifact[],
): readonly AssetAuthoringReleaseArtifactDigest[] {
  return ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.map((id) => {
    const artifact = artifacts.find((candidate) => candidate.id === id);
    if (artifact === undefined) {
      throw new AuthoringCommandError(
        `The preview is missing required artifact ${id}.`,
        { code: 'asset_authoring_preview_artifacts_incomplete' },
      );
    }
    return {
      id,
      path: artifact.path,
      digest: artifact.digest,
    };
  });
}

async function previewCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  if (context.runtime === undefined) {
    throw new AuthoringCommandError(
      'The asset authoring preview command requires prepared runtime assets.',
      { code: 'asset_authoring_runtime_missing' },
    );
  }
  const store = createAssetAuthoringSessionStore(context.workspace);
  const session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null) {
    throw new AuthoringCommandError(
      'The authoring session has an unresolved manifest conflict; reconcile it before previewing.',
      { code: 'asset_authoring_manifest_conflict' },
    );
  }
  const report = await freshSessionValidation({
    session,
    workspace: context.workspace,
    runtime: context.runtime,
  });
  const validated = store.replace(sessionId, validationSessionUpdate(session, report));
  if (!report.valid || validated.receipts.validation === null) {
    return commandOk(
      'asset authoring preview',
      responseFor(validated, { validation: report }),
    );
  }

  const input = previewInput(context);
  const result = await previewAssetPack({
    packDirectory: validated.packRoot,
    workspace: context.workspace,
    runtime: context.runtime,
    ...(input.assetId === null ? {} : { assetId: input.assetId }),
    ...(input.animation === null ? {} : { animation: input.animation }),
    ...(input.bodyType === null ? {} : { bodyType: input.bodyType }),
    ...(input.characterPath === null ? {} : { characterPath: input.characterPath }),
  });
  const artifacts = previewArtifacts(result);
  const sourceDigests = validated.receipts.validation.sourceDigests;
  const previewReceipt = {
    id: input.digest,
    manifestDigest: validated.receipts.validation.manifestDigest,
    sourceDigests,
    validationReceiptId: validated.receipts.validation.id,
    inputDigest: input.digest,
    artifacts: previewReceiptArtifacts(artifacts),
  };
  const next = store.replace(sessionId, {
    state: 'needs-user-action',
    reason: 'preview-current',
    phase: 'previewed',
    checkpoint: {
      id: 'preview',
      phase: 'previewed',
      digest: input.digest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
    receipts: {
      validation: validated.receipts.validation,
      preview: previewReceipt,
      acknowledgements: validated.receipts.acknowledgements,
      releaseDeclaration: validated.receipts.releaseDeclaration,
      previewAcceptance: validated.receipts.previewAcceptance,
    },
    provenance: appendProvenance(validated, {
      kind: 'provider',
      occurredAt: new Date().toISOString(),
      digest: input.digest,
      summary: 'Attributed preview rendered from the current validation receipt.',
    }),
  });
  const preview: AuthoringPreviewData = {
    input,
    validationRevision: validated.receipts.validation.id,
    artifacts,
    warnings: result.warnings,
    manifestDigest: validated.receipts.validation.manifestDigest,
    sourceDigests,
  };
  return commandOk(
    'asset authoring preview',
    responseFor(next, {
      validation: report,
      artifacts: [manifestArtifact(next), ...artifacts]
        .filter((artifact): artifact is AuthoringArtifact => artifact !== undefined),
      preview,
    }),
    result.warnings,
  );
}

function refreshContractSession(
  session: AssetAuthoringSession,
): AssetAuthoringSessionUpdate {
  return {
    state: 'needs-user-action',
    reason: 'planning-refreshed',
    phase: session.manifestDigest === null ? 'planned' : 'scaffolded',
    checkpoint: null,
    checkpointFreshness: 'stale',
    checkpoints: session.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      freshness: 'stale',
      checkpoint: null,
    })),
    receipts: {
      validation: session.receipts.validation,
      preview: session.receipts.preview,
      acknowledgements: session.receipts.acknowledgements,
      releaseDeclaration: session.receipts.releaseDeclaration,
      previewAcceptance: session.receipts.previewAcceptance,
    },
    provenance: appendProvenance(session, {
      kind: 'checkpoint-invalidated',
      occurredAt: new Date().toISOString(),
      summary: 'Contract planning was explicitly refreshed; prior checkpoints were invalidated.',
    }),
  };
}

async function contractCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  const runtime = context.runtime;
  if (runtime === undefined) {
    throw new AuthoringCommandError(
      'The asset authoring contract command requires prepared runtime assets.',
      { code: 'asset_authoring_runtime_missing' },
    );
  }
  const store = createAssetAuthoringSessionStore(context.workspace);
  let session = resumeSession(context.workspace, store.read(sessionId));
  if (session.conflict !== null) {
    throw new AuthoringCommandError(
      'The authoring session has an unresolved manifest conflict; reconcile it before publishing a contract.',
      { code: 'asset_authoring_manifest_conflict' },
    );
  }
  if (session.goal === 'attach-pack') {
    throw new AuthoringCommandError(
      'Attach-pack authoring sessions do not publish drawing contracts.',
      { code: 'asset_authoring_goal_unsupported' },
    );
  }

  const refresh = flagBoolean(context.parsed.flags, 'refresh');
  if (refresh) session = store.replace(session.sessionId, refreshContractSession(session));

  const result = await materializeAssetAuthoringContract({
    session,
    workspace: context.workspace,
    runtime,
    refresh,
  });
  session = store.replace(session.sessionId, {
    state: 'needs-user-action',
    reason: 'contract-ready',
    phase: 'contract-ready',
    checkpoint: {
      id: 'contract',
      phase: 'contract-ready',
      digest: result.contractDigest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
  });
  return commandOk(
    'asset authoring contract',
    responseFor(session, { artifacts: result.artifacts }),
  );
}

async function importCommand(
  context: AuthoringCommandContext,
  sessionId: string,
): Promise<CliResponse<AuthoringResponseData>> {
  const targetId = flagString(context.parsed.flags, 'target');
  const candidateArgument = flagString(context.parsed.flags, 'candidate');
  const contractDigest = requireDigest(
    flagString(context.parsed.flags, 'contract-digest'),
    'contract-digest',
  );
  if (targetId === undefined || candidateArgument === undefined) {
    throw new AuthoringCommandError(
      'Import requires --target and --candidate.',
      { code: 'missing_argument' },
    );
  }
  const store = createAssetAuthoringSessionStore(context.workspace);
  const session = store.read(sessionId);
  const expectedTargetDigest = flagString(context.parsed.flags, 'expected-target-digest');
  const result = await importAssetAuthoringCandidate({
    workspace: context.workspace,
    session,
    targetId,
    candidatePath: absolutePath(context.cwd, candidateArgument),
    contractDigest,
    replaceExisting: flagBoolean(context.parsed.flags, 'replace-existing'),
    ...(expectedTargetDigest === undefined
      ? {}
      : {
        expectedTargetDigest,
      }),
  });
  const checkpoints = session.checkpoints.map((checkpoint) => checkpoint.targetId === result.logicalTargetPath
    ? {
      ...checkpoint,
      freshness: 'current' as const,
      checkpoint: {
        id: `import:${targetId}`,
        phase: 'imported' as const,
        digest: result.targetDigest,
        freshness: 'current' as const,
      },
    }
    : checkpoint);
  const next = store.replace(sessionId, {
    state: 'needs-user-action',
    reason: 'candidate-imported',
    phase: 'imported',
    checkpoint: {
      id: 'import',
      phase: 'imported',
      digest: result.targetDigest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
    receipts: {
      validation: session.receipts.validation,
      preview: session.receipts.preview,
      acknowledgements: session.receipts.acknowledgements,
      releaseDeclaration: session.receipts.releaseDeclaration,
      previewAcceptance: session.receipts.previewAcceptance,
    },
    checkpoints,
    provenance: appendProvenance(session, {
      kind: 'provider',
      occurredAt: new Date().toISOString(),
      summary: `Candidate imported for contract target ${result.logicalTargetPath}.`,
      digest: result.targetDigest,
    }),
  });
  return commandOk(
    'asset authoring import',
    responseFor(next, {
      artifacts: [
        { id: 'contract', path: result.contractPath, digest: result.contractDigest },
        { id: 'metadata', path: result.metadataPath, digest: result.metadataDigest },
        { id: 'candidate', path: result.candidatePath, digest: result.candidateDigest },
        { id: `target:${targetId}`, path: result.targetPath, digest: result.targetDigest },
      ],
    }),
  );
}

function requireDigest(value: string | undefined, flag: string): string {
  if (value === undefined || !DIGEST_PATTERN.test(value)) {
    throw new AuthoringCommandError(
      `--${flag} must be a sha256 digest.`,
      { code: 'invalid_option', path: `--${flag}` },
    );
  }
  return value;
}

function reconcileManifest(
  workspace: AssetWorkspace,
  sessionId: string,
  use: string | undefined,
  expectedExternalDigest: string | undefined,
): CliResponse<AuthoringResponseData> {
  const expected = requireDigest(expectedExternalDigest, 'expected-external-digest');
  if (use !== 'external' && use !== 'session') {
    throw new AuthoringCommandError(
      '--use must be external or session.',
      { code: 'invalid_option', path: '--use' },
    );
  }
  const store = createAssetAuthoringSessionStore(workspace);
  const session = store.read(sessionId);
  if (session.conflict === null) {
    throw new AuthoringCommandError(
      'The authoring session has no unresolved manifest conflict.',
      { code: 'asset_authoring_manifest_conflict_missing' },
    );
  }
  const manifestPath = manifestPathFor(session);
  const manifestBytes = readRegularFile(manifestPath);
  const actual = manifestBytes === undefined ? sha256(Buffer.alloc(0)) : sha256(manifestBytes);
  if (actual !== expected || session.conflict.actualDigest !== expected) {
    throw new AuthoringCommandError(
      'The manifest digest no longer matches the expected external digest.',
      { code: 'asset_authoring_digest_mismatch', path: manifestPath },
    );
  }

  let manifestDigest = actual;
  if (use === 'session') {
    const snapshotBytes = readRegularFile(sessionSnapshotPath(workspace, session));
    if (snapshotBytes === undefined || sha256(snapshotBytes) !== session.conflict.expectedDigest) {
      throw new AuthoringCommandError(
        'The session-known manifest revision is unavailable or has been tampered with.',
        { code: 'asset_authoring_snapshot_invalid' },
      );
    }
    const currentBeforePublish = readRegularFile(manifestPath);
    const currentBeforeDigest = currentBeforePublish === undefined
      ? sha256(Buffer.alloc(0))
      : sha256(currentBeforePublish);
    if (currentBeforeDigest !== expected) {
      throw new AuthoringCommandError(
        'The manifest changed while preparing the session revision restore.',
        { code: 'asset_authoring_digest_mismatch', path: manifestPath },
      );
    }
    atomicWrite(manifestPath, snapshotBytes);
    manifestDigest = sha256(snapshotBytes);
  } else if (manifestBytes !== undefined) {
    const currentBytes = readRegularFile(manifestPath);
    if (currentBytes === undefined || sha256(currentBytes) !== expected) {
      throw new AuthoringCommandError(
        'The manifest changed while preparing the external revision adoption.',
        { code: 'asset_authoring_digest_mismatch', path: manifestPath },
      );
    }
    writeSessionManifestSnapshot(workspace, session, currentBytes);
  }

  const next = store.replace(session.sessionId, {
    state: 'needs-user-action',
    reason: use === 'external' ? 'manifest-adopted' : 'manifest-restored',
    phase: 'scaffolded',
    checkpointFreshness: 'current',
    checkpoint: {
      id: 'manifest',
      phase: 'scaffolded',
      digest: manifestDigest,
      freshness: 'current',
    },
    conflict: null,
    manifestDigest,
    provenance: appendProvenance(session, {
      kind: 'manifest-conflict',
      occurredAt: new Date().toISOString(),
      summary: use === 'external'
        ? 'External manifest revision adopted after digest confirmation.'
        : 'Session-known manifest revision restored after digest confirmation.',
      digest: manifestDigest,
    }),
  });
  return commandOk('asset authoring reconcile-manifest', responseFor(next));
}

export async function runAssetAuthoringCommand(
  context: AuthoringCommandContext,
): Promise<CliResponse<unknown>> {
  const command = context.parsed.command.join(' ');
  const authoringCommand = context.parsed.command[2];
  try {
    if (authoringCommand === 'start') return startSession(context);
    const sessionId = flagString(context.parsed.flags, 'session');
    if (sessionId === undefined) {
      return commandError(command, issue('missing_argument', '--session is required.', '--session'));
    }
    if (authoringCommand === 'contract') return await contractCommand(context, sessionId);
    if (authoringCommand === 'import') return await importCommand(context, sessionId);
    if (authoringCommand === 'validate') return await validateCommand(context, sessionId);
    if (authoringCommand === 'acknowledge') return await acknowledgeCommand(context, sessionId);
    if (authoringCommand === 'declare') return await declareCommand(context, sessionId);
    if (authoringCommand === 'accept-preview') return await acceptPreviewCommand(context, sessionId);
    if (authoringCommand === 'draft') return await draftCommand(context, sessionId);
    if (authoringCommand === 'sync') return await syncCommand(context, sessionId);
    if (authoringCommand === 'preview') return await previewCommand(context, sessionId);
    if (authoringCommand === 'status') return await statusSession(context.workspace, sessionId);
    if (authoringCommand === 'resume') return await resumeCommand(context.workspace, sessionId);
    if (authoringCommand === 'reconcile-manifest') {
      return reconcileManifest(
        context.workspace,
        sessionId,
        flagString(context.parsed.flags, 'use'),
        flagString(context.parsed.flags, 'expected-external-digest'),
      );
    }
    return commandError(command, issue(
      'asset_authoring_not_implemented',
      `Authoring command is deferred to a later task: ${command}.`,
    ));
  } catch (error) {
    if (error instanceof AuthoringCommandError) return commandFailure(command, error);
    if (error instanceof AssetAuthoringSessionError) {
      return commandError(command, issue(
        error.code,
        error.message,
        error.path,
      ));
    }
    if (error instanceof AssetAuthoringContractError) {
      return commandError(command, issue(
        error.code,
        error.message,
        error.path,
      ));
    }
    if (error instanceof AssetAuthoringImportError) {
      return commandError(command, issue(
        error.code,
        error.message,
        error.path,
      ));
    }
    if (error instanceof AssetAuthoringReleaseLifecycleError) {
      return commandError(command, issue(
        error.code,
        error.message,
        error.path,
      ));
    }
    if (error instanceof AssetPackPreviewError) {
      const diagnostic = error.diagnostics.find((entry) => entry.severity === 'error')
        ?? error.diagnostics[0];
      return commandError(command, issue(
        diagnostic?.code ?? error.code,
        diagnostic?.message ?? error.message,
        diagnostic?.path ?? error.path,
      ));
    }
    if (error instanceof PreviewError) {
      return commandError(command, issue(
        error.code,
        error.message,
        error.path,
        error.details,
      ));
    }
    return commandError(command, issue(
      'asset_authoring_failed',
      error instanceof Error ? error.message : 'Asset authoring command failed.',
    ));
  }
}
