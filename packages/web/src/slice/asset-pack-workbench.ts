import type { AssetPackWorkerProgressStage, AssetPackWorkerResponse, AssetPackWorkbenchRevision } from '../lib/asset-pack-worker-protocol';
import { assetPackFormalBlockers, type AssetPackFormalBlocker } from './asset-pack-release';

export type AssetPackWorkbenchPhase = 'empty' | 'opening' | 'unsafe' | 'editing' | 'validating' | 'assembling' | 'failed';
export type AssetPackWorkbenchPanel = 'overview' | 'manifest' | 'sources' | 'warnings' | 'credits';

export type AssetPackAcceptedEdit =
  | { readonly kind: 'replace-manifest'; readonly revision: number; readonly manifestText: string; readonly origin: 'overview-form' | 'credits-form' | 'advanced-json' | 'raw-repair' | 'acknowledgement' }
  | { readonly kind: 'replace-source'; readonly revision: number; readonly path: string; readonly file: File }
  | { readonly kind: 'remove-source'; readonly revision: number; readonly path: string };

export type AssetPackAcceptedEditInput =
  | { readonly kind: 'replace-manifest'; readonly manifestText: string; readonly origin: 'overview-form' | 'credits-form' | 'advanced-json' | 'raw-repair' | 'acknowledgement' }
  | { readonly kind: 'replace-source'; readonly path: string; readonly file: File }
  | { readonly kind: 'remove-source'; readonly path: string };

interface AssetPackPendingEdit {
  readonly revision: number;
  readonly edit: AssetPackAcceptedEditInput;
}

const missingCandidateBlocker: AssetPackFormalBlocker = {
  code: 'missing-candidate',
  message: 'The current revision has no verified formal archive candidate.',
};
const workerFailedBlocker: AssetPackFormalBlocker = {
  code: 'worker-failed',
  message: 'The asset-pack Worker session failed; retry before formal download.',
};

export interface AssetPackWorkbenchState {
  readonly phase: AssetPackWorkbenchPhase;
  readonly activePanel: AssetPackWorkbenchPanel;
  readonly revision: number;
  readonly originalFile?: File;
  readonly originalUploadMetadata?: AssetPackWorkbenchRevision['uploadMetadata'];
  readonly originalReleaseFingerprint?: string;
  readonly acceptedEdits: readonly AssetPackAcceptedEdit[];
  readonly pendingEdits: readonly AssetPackPendingEdit[];
  readonly workbench?: AssetPackWorkbenchRevision;
  readonly diagnostics: readonly AssetPackWorkbenchRevision['diagnostics'][number][];
  readonly progress?: { readonly requestId: number; readonly revision: number; readonly stage: AssetPackWorkerProgressStage };
  readonly pendingRequestId?: number;
  readonly latestDownloadedRevision?: number;
  readonly formalBlockers: readonly AssetPackFormalBlocker[];
  readonly ready: boolean;
  readonly error?: string;
}

export type AssetPackWorkbenchAction =
  | { readonly type: 'upload-accepted'; readonly file: File }
  | { readonly type: 'worker-response'; readonly response: AssetPackWorkerResponse }
  | { readonly type: 'worker-unsafe'; readonly diagnostics: AssetPackWorkbenchState['diagnostics'] }
  | { readonly type: 'request-started'; readonly requestId: number; readonly revision: number }
  | { readonly type: 'edit-requested'; readonly revision: number; readonly edit: AssetPackAcceptedEditInput }
  | { readonly type: 'replay-requested'; readonly revision: number }
  | { readonly type: 'edit-accepted'; readonly edit: AssetPackAcceptedEditInput }
  | { readonly type: 'edit-rejected'; readonly revision: number }
  | { readonly type: 'progress'; readonly requestId: number; readonly revision: number; readonly stage: AssetPackWorkerProgressStage }
  | { readonly type: 'worker-failed'; readonly message: string; readonly diagnostic?: AssetPackWorkbenchState['diagnostics'][number] }
  | { readonly type: 'retry' }
  | { readonly type: 'navigate'; readonly panel: AssetPackWorkbenchPanel }
  | { readonly type: 'downloaded'; readonly revision: number }
  | { readonly type: 'formal-blockers'; readonly blockers: readonly AssetPackFormalBlocker[] }
  | { readonly type: 'reset' };

export function createAssetPackWorkbenchState(): AssetPackWorkbenchState {
  return withReady({
    phase: 'empty', activePanel: 'overview', revision: 0, acceptedEdits: [], pendingEdits: [],
    diagnostics: [], formalBlockers: [missingCandidateBlocker],
  });
}

export function assetPackWorkbenchReducer(
  state: AssetPackWorkbenchState,
  action: AssetPackWorkbenchAction,
): AssetPackWorkbenchState {
  switch (action.type) {
    case 'upload-accepted':
      return withReady({
        ...createAssetPackWorkbenchState(), phase: 'opening', originalFile: action.file,
        formalBlockers: [missingCandidateBlocker],
      });
    case 'worker-unsafe':
      return withReady({
        ...createAssetPackWorkbenchState(), phase: 'unsafe', diagnostics: action.diagnostics,
        formalBlockers: [{ code: 'unsafe-archive', message: 'The uploaded archive is unsafe and cannot be formalized.' }],
      });
    case 'request-started':
      return { ...state, pendingRequestId: action.requestId };
    case 'worker-response':
      return reduceWorkerResponse(state, action.response);
    case 'edit-requested': {
      const { progress: _progress, error: _error, pendingRequestId: _pendingRequestId, ...withoutTransient } = state;
      const blockers = currentRevisionBlockers(state, action.revision);
      return withReady({
        ...withoutTransient,
        phase: 'validating',
        revision: action.revision,
        pendingEdits: [...state.pendingEdits, { revision: action.revision, edit: action.edit }],
        formalBlockers: blockers,
      });
    }
    case 'replay-requested': {
      const { progress: _progress, error: _error, pendingRequestId: _pendingRequestId, ...withoutTransient } = state;
      return withReady({ ...withoutTransient, phase: 'validating', revision: action.revision });
    }
    case 'edit-accepted': {
      const revision = state.revision + 1;
      const edit = { ...action.edit, revision } as AssetPackAcceptedEdit;
      const { progress: _progress, error: _error, ...withoutTransient } = state;
      return withReady({
        ...withoutTransient, phase: 'validating', revision, acceptedEdits: [...state.acceptedEdits, edit],
      });
    }
    case 'edit-rejected':
      return withReady({
        ...state,
        pendingEdits: state.pendingEdits.filter((pending) => pending.revision !== action.revision),
      });
    case 'progress':
      if (!matchesCurrentRequest(state, action.requestId, action.revision)) return state;
      return { ...state, phase: action.stage === 'assembling-archive' ? 'assembling' : 'validating', progress: action };
    case 'worker-failed': {
      const { progress: _progress, pendingEdits: _pendingEdits, ...withoutProgress } = state;
      const diagnostics = action.diagnostic ? [...state.diagnostics, action.diagnostic] : state.diagnostics;
      const computedBlockers = action.diagnostic
        ? currentRevisionBlockers({ ...state, diagnostics }, state.revision, action.diagnostic)
        : state.formalBlockers;
      const blockers = computedBlockers.length > 0 ? computedBlockers : [workerFailedBlocker];
      return withReady({ ...withoutProgress, phase: 'failed', pendingEdits: [], diagnostics, formalBlockers: blockers, error: action.message });
    }
    case 'retry': {
      const { pendingRequestId: _pendingRequestId, error: _error, progress: _progress, ...withoutTransient } = state;
      return withReady({
        ...withoutTransient,
        phase: 'opening',
        revision: 0,
        pendingEdits: [],
        formalBlockers: state.formalBlockers.length > 0 ? state.formalBlockers : [missingCandidateBlocker],
      });
    }
    case 'navigate':
      return { ...state, activePanel: action.panel };
    case 'downloaded':
      if (action.revision !== state.revision) return state;
      return withReady({
        ...withoutAssemblyTransient(state),
        phase: 'editing',
        latestDownloadedRevision: action.revision,
      });
    case 'formal-blockers':
      return withReady({ ...state, formalBlockers: [...action.blockers] });
    case 'reset':
      return createAssetPackWorkbenchState();
    default:
      return state;
  }
}

function reduceWorkerResponse(state: AssetPackWorkbenchState, response: AssetPackWorkerResponse): AssetPackWorkbenchState {
  if (response.type === 'progress') {
    return assetPackWorkbenchReducer(state, { type: 'progress', requestId: response.requestId, revision: response.revision, stage: response.stage });
  }
  const openingReplay = state.phase === 'opening' && response.type === 'session' && response.revision === 0;
  if (response.type === 'session' && response.outcome === 'editing' && response.revision < state.revision) {
    return recordAcceptedStaleEdit(state, response.revision);
  }
  if (!openingReplay && state.pendingRequestId !== undefined && response.requestId !== state.pendingRequestId) return state;
  if (!openingReplay && response.revision !== state.revision) return state;
  if (response.type === 'session' && response.outcome === 'unsafe') {
    return assetPackWorkbenchReducer(state, { type: 'worker-unsafe', diagnostics: response.diagnostics });
  }
  if (response.type === 'failed') {
    return assetPackWorkbenchReducer(state, { type: 'worker-failed', message: response.diagnostic.message, diagnostic: response.diagnostic });
  }
  if (response.type === 'assembled') {
    return withReady({ ...withoutAssemblyTransient(state), phase: 'editing' });
  }
  const current = response.workbench;
  const workbench = openingReplay ? { ...current, revision: state.revision } : current;
  const originalReleaseFingerprint = state.originalReleaseFingerprint ?? current.releaseFingerprint;
  const originalUploadMetadata = state.originalUploadMetadata ?? current.uploadMetadata;
  const pending = state.pendingEdits.find((candidate) => candidate.revision === response.revision);
  const acceptedEdits = pending
    ? [...state.acceptedEdits, { ...pending.edit, revision: response.revision } as AssetPackAcceptedEdit]
    : state.acceptedEdits;
  const blockers = assetPackFormalBlockers({
    workbench,
    ...(originalReleaseFingerprint ? { originalReleaseFingerprint } : {}),
    originalUploadMetadata,
  });
  const { pendingRequestId: _pendingRequestId, progress: _progress, error: _error, ...withoutTransient } = state;
  return withReady({
    ...withoutTransient,
    phase: 'editing',
    revision: openingReplay ? state.revision : current.revision,
    ...(originalReleaseFingerprint ? { originalReleaseFingerprint } : {}),
    originalUploadMetadata,
    pendingEdits: state.pendingEdits.filter((candidate) => candidate.revision !== response.revision),
    acceptedEdits,
    workbench,
    diagnostics: current.diagnostics,
    formalBlockers: blockers,
  });
}

function recordAcceptedStaleEdit(
  state: AssetPackWorkbenchState,
  revision: number,
): AssetPackWorkbenchState {
  const pending = state.pendingEdits.find((candidate) => candidate.revision === revision);
  if (!pending || state.acceptedEdits.some((candidate) => candidate.revision === revision)) return state;
  const acceptedEdit = { ...pending.edit, revision } as AssetPackAcceptedEdit;
  return withReady({
    ...state,
    acceptedEdits: [...state.acceptedEdits, acceptedEdit].sort((left, right) => left.revision - right.revision),
    pendingEdits: state.pendingEdits.filter((candidate) => candidate.revision !== revision),
  });
}

function withoutAssemblyTransient(
  state: AssetPackWorkbenchState,
): Omit<AssetPackWorkbenchState, 'ready'> {
  const { pendingRequestId: _pendingRequestId, progress: _progress, error: _error, ...withoutTransient } = state;
  return withoutTransient;
}

function currentRevisionBlockers(
  state: AssetPackWorkbenchState,
  revision: number,
  diagnostic?: AssetPackWorkbenchState['diagnostics'][number],
): readonly AssetPackFormalBlocker[] {
  if (!state.workbench) return state.formalBlockers;
  const workbench = {
    ...state.workbench,
    revision,
    ...(diagnostic ? { diagnostics: [...state.workbench.diagnostics, diagnostic] } : {}),
  };
  return assetPackFormalBlockers({
    workbench,
    ...(state.originalReleaseFingerprint ? { originalReleaseFingerprint: state.originalReleaseFingerprint } : {}),
    ...(state.originalUploadMetadata ? { originalUploadMetadata: state.originalUploadMetadata } : {}),
  });
}

function matchesCurrentRequest(state: AssetPackWorkbenchState, requestId: number, revision: number): boolean {
  return (state.pendingRequestId === undefined || state.pendingRequestId === requestId) && revision === state.revision;
}

function withReady(state: Omit<AssetPackWorkbenchState, 'ready'>): AssetPackWorkbenchState {
  return { ...state, ready: state.formalBlockers.length === 0 };
}
