import type { AssetPackWorkerProgressStage, AssetPackWorkerResponse, AssetPackWorkbenchRevision } from '../lib/asset-pack-worker-protocol';
import type { AssetPackFormalBlocker } from './asset-pack-release';

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

export interface AssetPackWorkbenchState {
  readonly phase: AssetPackWorkbenchPhase;
  readonly activePanel: AssetPackWorkbenchPanel;
  readonly revision: number;
  readonly originalFile?: File;
  readonly acceptedEdits: readonly AssetPackAcceptedEdit[];
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
  | { readonly type: 'edit-accepted'; readonly edit: AssetPackAcceptedEditInput }
  | { readonly type: 'progress'; readonly requestId: number; readonly revision: number; readonly stage: AssetPackWorkerProgressStage }
  | { readonly type: 'worker-failed'; readonly message: string }
  | { readonly type: 'retry' }
  | { readonly type: 'navigate'; readonly panel: AssetPackWorkbenchPanel }
  | { readonly type: 'downloaded'; readonly revision: number }
  | { readonly type: 'formal-blockers'; readonly blockers: readonly AssetPackFormalBlocker[] }
  | { readonly type: 'reset' };

export function createAssetPackWorkbenchState(): AssetPackWorkbenchState {
  return withReady({
    phase: 'empty', activePanel: 'overview', revision: 0, acceptedEdits: [],
    diagnostics: [], formalBlockers: [],
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
      });
    case 'worker-unsafe':
      return withReady({
        ...createAssetPackWorkbenchState(), phase: 'unsafe', diagnostics: action.diagnostics,
      });
    case 'request-started':
      return { ...state, pendingRequestId: action.requestId };
    case 'worker-response':
      return reduceWorkerResponse(state, action.response);
    case 'edit-accepted': {
      const revision = state.revision + 1;
      const edit = { ...action.edit, revision } as AssetPackAcceptedEdit;
      const { progress: _progress, error: _error, ...withoutTransient } = state;
      return withReady({
        ...withoutTransient, phase: 'validating', revision, acceptedEdits: [...state.acceptedEdits, edit],
      });
    }
    case 'progress':
      if (!matchesCurrentRequest(state, action.requestId, action.revision)) return state;
      return { ...state, phase: action.stage === 'assembling-archive' ? 'assembling' : 'validating', progress: action };
    case 'worker-failed': {
      const { progress: _progress, ...withoutProgress } = state;
      return { ...withoutProgress, phase: 'failed', error: action.message };
    }
    case 'retry': {
      const { pendingRequestId: _pendingRequestId, error: _error, progress: _progress, ...withoutTransient } = state;
      return { ...withoutTransient, phase: 'opening' };
    }
    case 'navigate':
      return { ...state, activePanel: action.panel };
    case 'downloaded':
      return action.revision === state.revision ? { ...state, latestDownloadedRevision: action.revision } : state;
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
  if (!openingReplay && state.pendingRequestId !== undefined && response.requestId !== state.pendingRequestId) return state;
  if (!openingReplay && response.revision !== state.revision) return state;
  if (response.type === 'session' && response.outcome === 'unsafe') {
    return assetPackWorkbenchReducer(state, { type: 'worker-unsafe', diagnostics: response.diagnostics });
  }
  if (response.type === 'failed') {
    return assetPackWorkbenchReducer(state, { type: 'worker-failed', message: response.diagnostic.message });
  }
  if (response.type === 'assembled') return state;
  const current = response.workbench;
  const { pendingRequestId: _pendingRequestId, progress: _progress, error: _error, ...withoutTransient } = state;
  return withReady({
    ...withoutTransient,
    phase: 'editing',
    revision: openingReplay ? state.revision : current.revision,
    workbench: openingReplay ? { ...current, revision: state.revision } : current,
    diagnostics: current.diagnostics,
  });
}

function matchesCurrentRequest(state: AssetPackWorkbenchState, requestId: number, revision: number): boolean {
  return (state.pendingRequestId === undefined || state.pendingRequestId === requestId) && revision === state.revision;
}

function withReady(state: Omit<AssetPackWorkbenchState, 'ready'>): AssetPackWorkbenchState {
  return { ...state, ready: state.formalBlockers.length === 0 };
}
