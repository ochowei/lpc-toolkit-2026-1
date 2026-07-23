import {
  assetPackContentProjection,
  assetPackSourceFromNormalized,
  compileAssetPacks,
  normalizeAssetPack,
  parseAssetPackSource,
  validateAssetPack,
  type AssetPackAcknowledgement,
  type AssetPackBaseline,
  type AssetPackDiagnostic,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import {
  ASSET_PACK_ARCHIVE_LIMITS,
  canonicalizeJsonValue,
  checkAssetPackCompatibility,
  createAssetPackArchive,
  inspectAssetPackArchiveBytes,
  inspectAssetPackSourceBytes,
  type AssetPackArchiveDiagnostic,
  type AssetPackFormatRuntime,
  type AssetPackPngDecoder,
  type AssetPackSha256,
} from '@lpc-toolkit/asset-pack-format';
import { createBrowserAssetPackFormatRuntime } from '../adapter/asset-pack-format-runtime';
import { browserAssetPackPngDecoderDefault } from '../adapter/asset-pack-png-decoder';
import type {
  AssetPackSourceSummary,
  AssetPackWorkerBaseline,
  AssetPackWorkerRequest,
  AssetPackWorkerResponse,
  AssetPackWorkbenchDiagnostic,
  AssetPackWorkbenchRevision,
} from '../lib/asset-pack-worker-protocol';

type ManifestRequest = Omit<Extract<AssetPackWorkerRequest, { readonly type: 'replace-manifest' }>, 'type'>;
type SourceRequest = Omit<Extract<AssetPackWorkerRequest, { readonly type: 'replace-source' }>, 'type'>;
type RemoveRequest = Omit<Extract<AssetPackWorkerRequest, { readonly type: 'remove-source' }>, 'type'>;
type AssembleRequest = Omit<Extract<AssetPackWorkerRequest, { readonly type: 'assemble' }>, 'type'>;

export interface AssetPackWorkerSession {
  readonly replaceManifest: (request: ManifestRequest) => Promise<readonly AssetPackWorkerResponse[]>;
  readonly replaceSource: (request: SourceRequest) => Promise<readonly AssetPackWorkerResponse[]>;
  readonly removeSource: (request: RemoveRequest) => Promise<readonly AssetPackWorkerResponse[]>;
  readonly assemble: (request: AssembleRequest) => Promise<readonly AssetPackWorkerResponse[]>;
}

export interface OpenAssetPackWorkerSessionOptions {
  readonly file: File;
  readonly baseline: AssetPackWorkerBaseline;
  readonly runtime?: AssetPackFormatRuntime;
  readonly decoder?: AssetPackPngDecoder;
  readonly requestId: number;
}

export interface OpenAssetPackWorkerSessionResult {
  readonly session?: AssetPackWorkerSession;
  readonly responses: readonly AssetPackWorkerResponse[];
}

interface SessionState {
  manifestText: string;
  sourceBytes: Map<string, Uint8Array>;
  revision: number;
  archiveDiagnostics: readonly AssetPackWorkbenchDiagnostic[];
  uploadedArchiveDigest: AssetPackSha256;
  uploadedFormal: boolean;
  uploadedVersion?: string;
  formalCandidateBytes?: Uint8Array;
  workbench: AssetPackWorkbenchRevision;
}

interface Evaluation {
  readonly workbench: AssetPackWorkbenchRevision;
  readonly manifestDocument?: Readonly<Record<string, unknown>>;
  readonly pack?: NormalizedAssetPack;
  readonly formalCandidateBytes?: Uint8Array;
}

const DIAGNOSTIC_SEVERITY_ORDER: Readonly<Record<AssetPackWorkbenchDiagnostic['severity'], number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

export async function openAssetPackWorkerSession(
  options: OpenAssetPackWorkerSessionOptions,
): Promise<OpenAssetPackWorkerSessionResult> {
  const runtime = options.runtime ?? createBrowserAssetPackFormatRuntime();
  const decoder = options.decoder ?? browserAssetPackPngDecoderDefault;
  if (options.file.size > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
    return {
      responses: [unsafeResponse(options.requestId, [{
        code: 'asset_archive_limit_exceeded',
        severity: 'error',
        message: `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
        scope: 'archive',
      }])],
    };
  }

  const archiveBytes = new Uint8Array(await options.file.arrayBuffer());
  const inspected = await inspectAssetPackArchiveBytes({ archiveBytes, runtime });
  if (inspected.kind === 'unsafe') {
    return {
      responses: [unsafeResponse(options.requestId, inspected.diagnostics.map(archiveDiagnostic))],
    };
  }

  const snapshot = inspected.snapshot;
  const manifestText = snapshot.manifestBytes
    ? decodeManifestText(snapshot.manifestBytes)
    : '{}';
  const state: SessionState = {
    manifestText,
    sourceBytes: copyBytes(snapshot.sourceBytes),
    revision: 0,
    archiveDiagnostics: inspected.diagnostics.map(archiveDiagnostic),
    uploadedArchiveDigest: snapshot.archiveDigest,
    uploadedFormal: inspected.kind === 'verified' && inspected.snapshot.payload.pack.status === undefined,
    ...(inspected.kind === 'verified' ? { uploadedVersion: inspected.snapshot.payload.pack.version } : {}),
    workbench: emptyWorkbench(manifestText),
  };
  const session = createSession(state, options.baseline, runtime, decoder);
  state.workbench = (await session.evaluate(0)).workbench;
  return {
    session,
    responses: [editingResponse(options.requestId, state.workbench)],
  };
}

export function createAssetPackWorkerSession(options: {
  readonly baseline: AssetPackWorkerBaseline;
  readonly manifestText: string;
  readonly sourceBytes?: ReadonlyMap<string, Uint8Array>;
  readonly archiveDigest?: AssetPackSha256;
  readonly uploadedFormal?: boolean;
  readonly uploadedVersion?: string;
  readonly runtime?: AssetPackFormatRuntime;
  readonly decoder?: AssetPackPngDecoder;
}): AssetPackWorkerSession & {
  readonly evaluate: (revision: number) => Promise<Evaluation>;
} {
  const runtime = options.runtime ?? createBrowserAssetPackFormatRuntime();
  const decoder = options.decoder ?? browserAssetPackPngDecoderDefault;
  const state: SessionState = {
    manifestText: options.manifestText,
    sourceBytes: copyBytes(options.sourceBytes ?? new Map()),
    revision: 0,
    archiveDiagnostics: [],
    uploadedArchiveDigest: options.archiveDigest ?? 'sha256:'.concat('0'.repeat(64)) as AssetPackSha256,
    uploadedFormal: options.uploadedFormal ?? false,
    ...(options.uploadedVersion ? { uploadedVersion: options.uploadedVersion } : {}),
    workbench: emptyWorkbench(options.manifestText),
  };
  return createSession(state, options.baseline, runtime, decoder);
}

function createSession(
  state: SessionState,
  baseline: AssetPackWorkerBaseline,
  runtime: AssetPackFormatRuntime,
  decoder: AssetPackPngDecoder,
): AssetPackWorkerSession & { readonly evaluate: (revision: number) => Promise<Evaluation> } {
  const evaluate = async (revision: number): Promise<Evaluation> => {
    const evaluation = await evaluateState(state, revision, baseline, runtime, decoder);
    state.workbench = evaluation.workbench;
    if (evaluation.formalCandidateBytes) state.formalCandidateBytes = evaluation.formalCandidateBytes;
    else delete state.formalCandidateBytes;
    return evaluation;
  };

  const editGuard = (requestId: number, revision: number): readonly AssetPackWorkerResponse[] | undefined => {
    if (revision === state.revision + 1) return undefined;
    return [failedResponse(requestId, revision, {
      code: 'asset_worker_stale_revision',
      severity: 'error',
      message: `Stale asset-pack Worker revision ${String(revision)}; current revision is ${String(state.revision)}.`,
      scope: 'release',
      details: { currentRevision: state.revision, requestedRevision: revision },
    })];
  };

  const replaceManifest = async (request: ManifestRequest): Promise<readonly AssetPackWorkerResponse[]> => {
    const rejected = editGuard(request.requestId, request.revision);
    if (rejected) return rejected;
    const governanceError = await validateManifestGovernance(request, state, baseline, runtime, decoder);
    if (governanceError) return [failedResponse(request.requestId, request.revision, governanceError)];
    state.manifestText = request.manifestText;
    state.revision = request.revision;
    state.archiveDiagnostics = [];
    const evaluation = await evaluate(request.revision);
    return [editingResponse(request.requestId, evaluation.workbench)];
  };

  const replaceSource = async (request: SourceRequest): Promise<readonly AssetPackWorkerResponse[]> => {
    const rejected = editGuard(request.requestId, request.revision);
    if (rejected) return rejected;
    const bytes = new Uint8Array(await request.file.arrayBuffer());
    if (bytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.entryBytes) {
      return [failedResponse(request.requestId, request.revision, {
        code: 'asset_archive_limit_exceeded',
        severity: 'error',
        message: `Source exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.entryBytes)}-byte entry limit.`,
        scope: 'source',
        path: request.path,
      })];
    }
    state.sourceBytes.set(request.path, new Uint8Array(bytes));
    state.revision = request.revision;
    state.archiveDiagnostics = [];
    const evaluation = await evaluate(request.revision);
    return [editingResponse(request.requestId, evaluation.workbench)];
  };

  const removeSource = async (request: RemoveRequest): Promise<readonly AssetPackWorkerResponse[]> => {
    const rejected = editGuard(request.requestId, request.revision);
    if (rejected) return rejected;
    state.sourceBytes.delete(request.path);
    state.revision = request.revision;
    state.archiveDiagnostics = [];
    const evaluation = await evaluate(request.revision);
    return [editingResponse(request.requestId, evaluation.workbench)];
  };

  const assemble = async (request: AssembleRequest): Promise<readonly AssetPackWorkerResponse[]> => {
    if (request.kind === 'formal') {
      if (request.revision !== state.revision
        || !state.formalCandidateBytes
        || state.workbench.formalCandidate?.revision !== request.revision) {
        return [failedResponse(request.requestId, request.revision, {
          code: 'candidate-not-verified',
          severity: 'error',
          message: 'The current revision has no verified formal archive candidate.',
          scope: 'release',
        })];
      }
      const candidateBytes = new Uint8Array(state.formalCandidateBytes);
      return [assembledResponse(request, candidateBytes, state.workbench.formalCandidate.archiveDigest)];
    }
    if (request.revision !== state.revision) {
      return [failedResponse(request.requestId, request.revision, {
        code: 'asset_worker_stale_revision',
        severity: 'error',
        message: `Cannot assemble stale revision ${String(request.revision)}.`,
        scope: 'release',
      })];
    }

    const document = parseJsonObject(state.manifestText);
    if (!document) {
      return [failedResponse(request.requestId, request.revision, {
        code: 'asset_pack_manifest_json_invalid',
        severity: 'error',
        message: 'Draft archives require one JSON object manifest.',
        scope: 'manifest',
      })];
    }
    if (!state.workbench.draftSerializable) {
      return [failedResponse(request.requestId, request.revision, {
        code: 'asset_draft_not_serializable',
        severity: 'error',
        message: 'The current draft is not safely serializable.',
        scope: 'release',
      })];
    }
    try {
      const created = await createAssetPackArchive({
        kind: 'draft',
        manifestDocument: document,
        sourceBytes: state.sourceBytes,
        runtime,
      });
      return [assembledResponse(request, created.archiveBytes, created.archiveDigest)];
    } catch (error) {
      return [failedResponse(request.requestId, request.revision, {
        code: 'asset_draft_assembly_failed',
        severity: 'error',
        message: error instanceof Error ? error.message : 'Draft archive assembly failed.',
        scope: 'release',
      })];
    }
  };

  return { replaceManifest, replaceSource, removeSource, assemble, evaluate };
}

async function evaluateState(
  state: SessionState,
  revision: number,
  baseline: AssetPackWorkerBaseline,
  runtime: AssetPackFormatRuntime,
  decoder: AssetPackPngDecoder,
): Promise<Evaluation> {
  const baseDiagnostics = [...state.archiveDiagnostics];
  const document = parseJsonObject(state.manifestText);
  if (!document) {
    const diagnostics = sortDiagnostics([
      ...baseDiagnostics,
      manifestJsonDiagnostic(state.manifestText),
    ]);
    return {
      workbench: {
        revision,
        manifestText: state.manifestText,
        sourceSummaries: summarizeRawSources(state.sourceBytes),
        diagnostics,
        acknowledgementRecords: [],
        draftSerializable: false,
      },
    };
  }

  const parsed = parseAssetPackSource(document);
  if (!parsed.ok) {
    const diagnostics = sortDiagnostics([
      ...baseDiagnostics,
      ...parsed.diagnostics.map(coreDiagnostic),
    ]);
    return {
      workbench: {
        revision,
        manifestText: state.manifestText,
        sourceSummaries: summarizeRawSources(state.sourceBytes),
        diagnostics,
        acknowledgementRecords: [],
        draftSerializable: isSerializableSources(state.sourceBytes),
      },
    };
  }

  const pack = normalizeAssetPack(parsed.source);
  const sourceUses = collectSourceUses(pack);
  const sourceDigests = await digestSources(state.sourceBytes, runtime);
  const inspections = await inspectAssetPackSourceBytes({
    pack,
    sourceBytes: state.sourceBytes,
    sourceDigests,
    decoder,
  });
  const contentDigest = await digestContent(pack, sourceDigests, runtime);
  const validationBaseline: AssetPackBaseline = {
    catalog: baseline.catalog,
    definitionDigests: baseline.definitionDigests,
    creditDigests: baseline.creditDigests,
  };
  const validation = validateAssetPack({
    pack,
    baseline: validationBaseline,
    palettes: baseline.palettes,
    inspections,
    contentDigest,
  });
  const compatibility = checkAssetPackCompatibility(pack, baseline.cliVersion);
  const compilePlan = compileAssetPacks({ baseline: validationBaseline, packs: [pack] });
  const diagnostics = sortDiagnostics([
    ...baseDiagnostics,
    ...validation.diagnostics.map(coreDiagnostic),
    ...compatibility.map(compatibilityDiagnostic),
    ...compilePlan.diagnostics.map(coreDiagnostic),
  ]);
  const sourceSummaries = summarizeSources(sourceUses, state.sourceBytes, sourceDigests, inspections);
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const currentAcknowledgements = mergeAcknowledgementCandidates(validation.acknowledgementRecords, pack.acknowledgements);
  const draftSerializable = isSerializableSources(state.sourceBytes);
  const preview = hasErrors ? undefined : {
    revision,
    packId: pack.id,
    compilePlan,
    sources: compilePlan.sprites
      .map((sprite) => {
        const bytes = state.sourceBytes.get(sprite.sourcePath);
        return bytes ? {
          destinationPath: sprite.destinationPath,
          sourcePath: sprite.sourcePath,
          bytes: new Uint8Array(bytes),
        } : undefined;
      })
      .filter((source): source is NonNullable<typeof source> => source !== undefined),
  };
  const releaseFingerprint = await digestRelease(pack, sourceDigests, runtime);
  let formalCandidateBytes: Uint8Array | undefined;
  let formalCandidate: AssetPackWorkbenchRevision['formalCandidate'];
  const hasUnacknowledgedWarnings = validation.diagnostics.some((diagnostic) =>
    diagnostic.severity === 'warning'
    && !validation.acknowledgementRecords.some((candidate) =>
      candidate.code === diagnostic.code
      && JSON.stringify(candidate.subject) === JSON.stringify(diagnostic.subject)
      && pack.acknowledgements.some((acknowledgement) =>
        acknowledgement.code === candidate.code
        && acknowledgement.contentDigest === candidate.contentDigest
        && acknowledgement.reason.trim().length > 0
        && JSON.stringify(acknowledgement.subject) === JSON.stringify(candidate.subject),
      ),
    ),
  );
  if (!hasErrors && !hasUnacknowledgedWarnings && pack.status === undefined && draftSerializable) {
    try {
      const assembled = await createAssetPackArchive({
        kind: 'formal',
        manifestDocument: document,
        sourceBytes: state.sourceBytes,
        runtime,
      });
      if (assembled.inspection.kind === 'verified') {
        formalCandidateBytes = new Uint8Array(assembled.archiveBytes);
        formalCandidate = {
          revision,
          archiveDigest: assembled.archiveDigest,
          version: pack.version,
          byteIdenticalToUploadedFormal: state.uploadedFormal
            && assembled.archiveDigest === state.uploadedArchiveDigest,
        };
      }
    } catch {
      // Assembly diagnostics are represented by the missing candidate. Formal
      // requests remain gated by candidate-not-verified.
    }
  }

  return {
    pack,
    manifestDocument: document,
    ...(formalCandidateBytes ? { formalCandidateBytes } : {}),
    workbench: {
      revision,
      manifestText: state.manifestText,
      sourceSummaries,
      diagnostics,
      acknowledgementRecords: currentAcknowledgements,
      contentDigest,
      releaseFingerprint,
      ...(preview ? { preview } : {}),
      ...(formalCandidate ? { formalCandidate } : {}),
      draftSerializable,
    },
  };
}

async function validateManifestGovernance(
  request: ManifestRequest,
  state: SessionState,
  baseline: AssetPackWorkerBaseline,
  runtime: AssetPackFormatRuntime,
  decoder: AssetPackPngDecoder,
): Promise<AssetPackWorkbenchDiagnostic | undefined> {
  const proposed = parseJsonObject(request.manifestText);
  const current = parseJsonObject(state.manifestText);
  if (!proposed || !current) return undefined;
  const proposedAcknowledgements = proposed.acknowledgements;
  const currentAcknowledgements = current.acknowledgements;
  if (request.origin !== 'acknowledgement') {
    if (JSON.stringify(canonicalizeJsonValue(proposedAcknowledgements ?? []))
      !== JSON.stringify(canonicalizeJsonValue(currentAcknowledgements ?? []))) {
      return acknowledgementForbidden();
    }
    return undefined;
  }

  const temporary = createAssetPackWorkerSession({
    baseline,
    manifestText: request.manifestText,
    sourceBytes: state.sourceBytes,
    runtime,
    decoder,
  });
  const evaluation = await temporary.evaluate(state.revision);
  if (!evaluation.pack || !evaluation.workbench.contentDigest) return acknowledgementForbidden();
  const candidates = evaluation.workbench.acknowledgementRecords;
  if (!Array.isArray(proposedAcknowledgements)) return acknowledgementForbidden();
  for (const acknowledgement of evaluation.pack.acknowledgements) {
    const candidate = candidates.find((entry) =>
      entry.code === acknowledgement.code
      && entry.contentDigest === acknowledgement.contentDigest
      && JSON.stringify(entry.subject) === JSON.stringify(acknowledgement.subject),
    );
    if (!candidate || acknowledgement.reason.trim().length === 0) return acknowledgementForbidden();
  }
  return undefined;
}

function collectSourceUses(pack: NormalizedAssetPack): ReadonlyMap<string, number> {
  const uses = new Map<string, number>();
  for (const asset of pack.assets) {
    if (asset.kind === 'new-item') {
      for (const layer of asset.layers) {
        for (const sprite of layer.sprites) uses.set(sprite.source, (uses.get(sprite.source) ?? 0) + 1);
      }
    } else {
      for (const animation of asset.addAnimations) {
        for (const layer of animation.layers) uses.set(layer.source, (uses.get(layer.source) ?? 0) + 1);
      }
    }
  }
  return uses;
}

async function digestSources(
  sourceBytes: ReadonlyMap<string, Uint8Array>,
  runtime: AssetPackFormatRuntime,
): Promise<ReadonlyMap<string, AssetPackSha256>> {
  const digests = new Map<string, AssetPackSha256>();
  for (const path of [...sourceBytes.keys()].sort()) {
    digests.set(path, await runtime.sha256(sourceBytes.get(path)!));
  }
  return digests;
}

async function digestContent(
  pack: NormalizedAssetPack,
  sourceDigests: ReadonlyMap<string, AssetPackSha256>,
  runtime: AssetPackFormatRuntime,
): Promise<AssetPackSha256> {
  return runtime.sha256(runtime.encodeUtf8(JSON.stringify({
    manifest: assetPackContentProjection(pack),
    sources: [...sourceDigests].map(([sourcePath, digest]) => ({ sourcePath, digest })),
  })));
}

async function digestRelease(
  pack: NormalizedAssetPack,
  sourceDigests: ReadonlyMap<string, AssetPackSha256>,
  runtime: AssetPackFormatRuntime,
): Promise<AssetPackSha256> {
  const source = assetPackSourceFromNormalized(pack);
  const { version: _version, status: _status, ...releaseManifest } = source;
  return runtime.sha256(runtime.encodeUtf8(JSON.stringify(canonicalizeJsonValue({
    manifest: releaseManifest,
    sources: [...sourceDigests].map(([sourcePath, digest]) => ({ sourcePath, digest })),
  }))));
}

function summarizeSources(
  uses: ReadonlyMap<string, number>,
  sourceBytes: ReadonlyMap<string, Uint8Array>,
  sourceDigests: ReadonlyMap<string, AssetPackSha256>,
  inspections: readonly { readonly sourcePath: string; readonly regularFile: boolean; readonly decoded?: { readonly width: number; readonly height: number }; readonly error?: string }[],
): readonly AssetPackSourceSummary[] {
  const paths = new Set<string>([...uses.keys(), ...sourceBytes.keys()]);
  const inspectionMap = new Map(inspections.map((inspection) => [inspection.sourcePath, inspection]));
  return [...paths].sort().map((path) => {
    const inspection = inspectionMap.get(path);
    const bytes = sourceBytes.get(path);
    const decoded = inspection?.decoded;
    const referenced = uses.has(path);
    const state = !referenced
      ? 'unreferenced'
      : !bytes
        ? 'missing'
        : inspection?.error || !inspection?.regularFile
          ? 'invalid'
          : 'ready';
    return {
      path,
      referenced,
      consumerCount: uses.get(path) ?? 0,
      ...(bytes ? { byteLength: bytes.byteLength } : {}),
      ...(sourceDigests.has(path) ? { digest: sourceDigests.get(path)! } : {}),
      ...(decoded ? { width: decoded.width, height: decoded.height } : {}),
      state,
    } satisfies AssetPackSourceSummary;
  });
}

function summarizeRawSources(sourceBytes: ReadonlyMap<string, Uint8Array>): readonly AssetPackSourceSummary[] {
  return [...sourceBytes].sort(([left], [right]) => left.localeCompare(right)).map(([path, bytes]) => ({
    path,
    referenced: false,
    consumerCount: 0,
    byteLength: bytes.byteLength,
    state: 'unreferenced',
  }));
}

function mergeAcknowledgementCandidates(
  candidates: readonly AssetPackAcknowledgement[],
  current: readonly AssetPackAcknowledgement[],
): readonly AssetPackAcknowledgement[] {
  return candidates.map((candidate) => {
    const existing = current.find((acknowledgement) =>
      acknowledgement.code === candidate.code
      && acknowledgement.contentDigest === candidate.contentDigest
      && JSON.stringify(acknowledgement.subject) === JSON.stringify(candidate.subject),
    );
    return existing ? { ...candidate, reason: existing.reason } : candidate;
  });
}

function isSerializableSources(sourceBytes: ReadonlyMap<string, Uint8Array>): boolean {
  let total = 0;
  for (const [path, bytes] of sourceBytes) {
    if (!path.startsWith('sprites/') || bytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.entryBytes) return false;
    total += bytes.byteLength;
    if (total > ASSET_PACK_ARCHIVE_LIMITS.totalBytes) return false;
  }
  return true;
}

function parseJsonObject(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>>
      : undefined;
  } catch {
    return undefined;
  }
}

function decodeManifestText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return '';
  }
}

function copyBytes(source: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
  return new Map([...source].map(([path, bytes]) => [path, new Uint8Array(bytes)] as const));
}

function emptyWorkbench(manifestText: string): AssetPackWorkbenchRevision {
  return {
    revision: 0,
    manifestText,
    sourceSummaries: [],
    diagnostics: [],
    acknowledgementRecords: [],
    draftSerializable: false,
  };
}

function coreDiagnostic(diagnostic: AssetPackDiagnostic): AssetPackWorkbenchDiagnostic {
  const scope = diagnostic.severity === 'warning'
    ? 'warning'
    : diagnostic.code.includes('credit') || diagnostic.code.includes('license')
      ? 'credit'
      : diagnostic.code.includes('source') || diagnostic.code.includes('png') || diagnostic.code.includes('geometry')
        ? 'source'
        : 'manifest';
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    scope,
    ...(diagnostic.details?.path && typeof diagnostic.details.path === 'string' ? { path: diagnostic.details.path } : {}),
    ...(diagnostic.subject ? { subject: diagnostic.subject } : {}),
    details: {
      ...(diagnostic.packId ? { packId: diagnostic.packId } : {}),
      ...(diagnostic.assetId ? { assetId: diagnostic.assetId } : {}),
      ...(diagnostic.sourcePath ? { sourcePath: diagnostic.sourcePath } : {}),
      ...(diagnostic.destinationPath ? { destinationPath: diagnostic.destinationPath } : {}),
      ...(diagnostic.details ?? {}),
    },
  };
}

function compatibilityDiagnostic(diagnostic: { readonly code: string; readonly severity: 'error' | 'warning'; readonly message: string; readonly details?: Readonly<Record<string, unknown>> }): AssetPackWorkbenchDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    scope: 'release',
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}

function archiveDiagnostic(diagnostic: AssetPackArchiveDiagnostic): AssetPackWorkbenchDiagnostic {
  return {
    code: diagnostic.code,
    severity: 'error',
    message: diagnostic.message,
    scope: 'archive',
    ...(diagnostic.path ? { path: diagnostic.path } : {}),
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}

function manifestJsonDiagnostic(text: string): AssetPackWorkbenchDiagnostic {
  let message = 'Asset-pack manifest is not valid JSON.';
  try {
    JSON.parse(text);
  } catch (error) {
    message = error instanceof Error ? error.message : message;
  }
  return { code: 'asset_pack_manifest_json_invalid', severity: 'error', message, scope: 'manifest', path: 'asset-pack.json' };
}

function sortDiagnostics(diagnostics: readonly AssetPackWorkbenchDiagnostic[]): readonly AssetPackWorkbenchDiagnostic[] {
  return [...diagnostics].sort((left, right) =>
    DIAGNOSTIC_SEVERITY_ORDER[left.severity] - DIAGNOSTIC_SEVERITY_ORDER[right.severity]
    || left.code.localeCompare(right.code)
    || (left.path ?? '').localeCompare(right.path ?? '')
    || JSON.stringify(left.subject ?? {}).localeCompare(JSON.stringify(right.subject ?? {}))
    || left.message.localeCompare(right.message),
  );
}

function acknowledgementForbidden(): AssetPackWorkbenchDiagnostic {
  return {
    code: 'asset_acknowledgement_edit_forbidden',
    severity: 'error',
    message: 'Acknowledgements may only be changed through governed warning acknowledgement edits.',
    scope: 'warning',
  };
}

function unsafeResponse(requestId: number, diagnostics: readonly AssetPackWorkbenchDiagnostic[]): AssetPackWorkerResponse {
  return { type: 'session', requestId, revision: 0, outcome: 'unsafe', diagnostics: sortDiagnostics(diagnostics) };
}

function editingResponse(requestId: number, workbench: AssetPackWorkbenchRevision): AssetPackWorkerResponse {
  return { type: 'session', requestId, revision: workbench.revision, outcome: 'editing', workbench };
}

function failedResponse(requestId: number, revision: number, diagnostic: AssetPackWorkbenchDiagnostic): AssetPackWorkerResponse {
  return { type: 'failed', requestId, revision, diagnostic };
}

function assembledResponse(request: AssembleRequest, bytes: Uint8Array, digest: AssetPackSha256): AssetPackWorkerResponse {
  const copy = new Uint8Array(bytes);
  return {
    type: 'assembled',
    requestId: request.requestId,
    revision: request.revision,
    kind: request.kind,
    archiveBytes: copy.buffer,
    archiveDigest: digest,
  };
}
