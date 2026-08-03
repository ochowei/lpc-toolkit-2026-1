import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { parseAssetAuthoringPlan, type AssetAuthoringPlan } from '@lpc-toolkit/core';
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
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
  AssetAuthoringSessionError,
  type AssetAuthoringManifestConflict,
  type AssetAuthoringProvenanceEvent,
  type AssetAuthoringSession,
  type AssetAuthoringSessionUpdate,
} from './asset-authoring-session.js';
import type { AssetWorkspace } from './asset-workspace.js';
import type { RuntimeAssets } from './runtime-assets.js';
import {
  authoringResponseProjection,
  commandError,
  commandOk,
  type AuthoringArtifact,
  type AuthoringInputNeeded,
  type AuthoringNextAction,
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
}

function issue(
  code: string,
  message: string,
  issuePath?: string,
): CliIssue {
  return {
    code,
    message,
    ...(issuePath === undefined ? {} : { path: issuePath }),
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

function statusSession(
  workspace: AssetWorkspace,
  sessionId: string,
): CliResponse<AuthoringResponseData> {
  const session = createAssetAuthoringSessionStore(workspace).status(sessionId);
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

function resumeCommand(
  workspace: AssetWorkspace,
  sessionId: string,
): CliResponse<AuthoringResponseData> {
  const session = createAssetAuthoringSessionStore(workspace).read(sessionId);
  const resumed = resumeSession(workspace, session);
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
      validation: null,
      preview: null,
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
    if (authoringCommand === 'status') return statusSession(context.workspace, sessionId);
    if (authoringCommand === 'resume') return resumeCommand(context.workspace, sessionId);
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
    return commandError(command, issue(
      'asset_authoring_failed',
      error instanceof Error ? error.message : 'Asset authoring command failed.',
    ));
  }
}
