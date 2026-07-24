import { describe, expect, it } from 'vitest';
import type { AssetPackWorkerResponse } from '../src/lib/asset-pack-worker-protocol';
import { assetPackWorkbenchReducer, createAssetPackWorkbenchState } from '../src/slice/asset-pack-workbench';

const file = new File(['original'], 'original.zip');
const revision = {
  revision: 0,
  manifestText: '{}',
  uploadMetadata: { originalArchiveDigest: `sha256:${'0'.repeat(64)}` as `sha256:${string}`, baselineReleaseTag: 'test' },
  sourceSummaries: [],
  diagnostics: [],
  acknowledgementRecords: [],
  draftSerializable: true,
};
const response = (requestId: number, currentRevision: number): AssetPackWorkerResponse => ({
  type: 'session', requestId, revision: currentRevision, outcome: 'editing', workbench: { ...revision, revision: currentRevision },
});

describe('asset-pack workbench reducer', () => {
  it('resets upload state, tracks panels, accepted revisions, progress, and latest downloads', () => {
    let state = createAssetPackWorkbenchState();
    state = assetPackWorkbenchReducer(state, { type: 'upload-accepted', file });
    expect(state.phase).toBe('opening');
    expect(state.formalBlockers.map(({ code }) => code)).toEqual(['missing-candidate']);
    expect(state.ready).toBe(false);
    state = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(1, 0) });
    expect(state.phase).toBe('editing');
    state = assetPackWorkbenchReducer(state, { type: 'navigate', panel: 'credits' });
    state = assetPackWorkbenchReducer(state, { type: 'edit-accepted', edit: { kind: 'remove-source', path: 'sprites/a.png' } });
    expect(state.activePanel).toBe('credits');
    expect(state.revision).toBe(1);
    expect(state.acceptedEdits).toHaveLength(1);
    state = assetPackWorkbenchReducer(state, { type: 'progress', requestId: 2, revision: 1, stage: 'inspecting-sources' });
    expect(state.progress).toMatchObject({ stage: 'inspecting-sources', revision: 1 });
    state = assetPackWorkbenchReducer(state, { type: 'downloaded', revision: 1 });
    expect(state.latestDownloadedRevision).toBe(1);
  });

  it('commits an edit to the replay log only after the matching Worker revision is accepted', () => {
    let state = createAssetPackWorkbenchState();
    state = assetPackWorkbenchReducer(state, { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(1, 0) });
    state = assetPackWorkbenchReducer(state, {
      type: 'edit-requested',
      revision: 1,
      edit: { kind: 'replace-manifest', manifestText: '{"version":"2.0.0"}', origin: 'advanced-json' },
    });
    expect(state.acceptedEdits).toEqual([]);
    expect(state.revision).toBe(1);

    state = assetPackWorkbenchReducer(state, {
      type: 'worker-response',
      response: response(2, 1),
    });
    expect(state.acceptedEdits).toEqual([{
      kind: 'replace-manifest',
      manifestText: '{"version":"2.0.0"}',
      origin: 'advanced-json',
      revision: 1,
    }]);
  });

  it('removes a rejected current-revision edit without making it replayable', () => {
    let state = createAssetPackWorkbenchState();
    state = assetPackWorkbenchReducer(state, { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(1, 0) });
    state = assetPackWorkbenchReducer(state, {
      type: 'edit-requested',
      revision: 1,
      edit: { kind: 'remove-source', path: 'sprites/a.png' },
    });
    state = assetPackWorkbenchReducer(state, {
      type: 'worker-response',
      response: {
        type: 'failed',
        requestId: 2,
        revision: 1,
        diagnostic: { code: 'asset_acknowledgement_edit_forbidden', severity: 'error', message: 'rejected', scope: 'warning' },
      },
    });
    expect(state.acceptedEdits).toEqual([]);
    expect(state.phase).toBe('failed');
  });

  it('recomputes formal blockers when a new revision is requested and when Worker governance rejects it', () => {
    let state = createAssetPackWorkbenchState();
    state = assetPackWorkbenchReducer(state, { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(1, 0) });
    state = assetPackWorkbenchReducer(state, {
      type: 'edit-requested',
      revision: 1,
      edit: { kind: 'remove-source', path: 'sprites/a.png' },
    });
    expect(state.formalBlockers.some(({ code }) => code === 'missing-candidate')).toBe(true);
    expect(state.ready).toBe(false);

    state = assetPackWorkbenchReducer(state, {
      type: 'worker-response',
      response: {
        type: 'failed',
        requestId: 2,
        revision: 1,
        diagnostic: { code: 'asset_acknowledgement_edit_forbidden', severity: 'error', message: 'rejected', scope: 'warning' },
      },
    });
    expect(state.formalBlockers.some(({ code }) => code === 'validation-error')).toBe(true);
    expect(state.ready).toBe(false);
  });

  it('clears assembly transient state before recording the matching downloaded revision', () => {
    let state = createAssetPackWorkbenchState();
    state = assetPackWorkbenchReducer(state, { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(1, 0) });
    state = assetPackWorkbenchReducer(state, { type: 'request-started', requestId: 2, revision: 0 });
    state = assetPackWorkbenchReducer(state, { type: 'progress', requestId: 2, revision: 0, stage: 'assembling-archive' });
    const assembled = assetPackWorkbenchReducer(state, {
      type: 'worker-response',
      response: {
        type: 'assembled',
        requestId: 2,
        revision: 0,
        kind: 'draft',
        archiveBytes: new ArrayBuffer(0),
        archiveDigest: `sha256:${'1'.repeat(64)}`,
        filename: 'asset-pack.draft.lpc-assets.zip',
        uploadMetadata: revision.uploadMetadata,
      },
    });
    expect(assembled.phase).toBe('editing');
    expect(assembled.pendingRequestId).toBeUndefined();
    expect(assembled.progress).toBeUndefined();
    const downloaded = assetPackWorkbenchReducer(assembled, { type: 'downloaded', revision: 0 });
    expect(downloaded.latestDownloadedRevision).toBe(0);
  });

  it('rejects reverse stale responses by request ID and revision', () => {
    let state = createAssetPackWorkbenchState();
    state = assetPackWorkbenchReducer(state, { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(1, 0) });
    state = assetPackWorkbenchReducer(state, { type: 'edit-accepted', edit: { kind: 'replace-manifest', manifestText: '{}', origin: 'overview-form' } });
    state = assetPackWorkbenchReducer(state, { type: 'request-started', requestId: 2, revision: 1 });
    state = assetPackWorkbenchReducer(state, { type: 'edit-accepted', edit: { kind: 'remove-source', path: 'sprites/a.png' } });
    state = assetPackWorkbenchReducer(state, { type: 'request-started', requestId: 3, revision: 2 });
    const newest = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(3, 2) });
    const stale = assetPackWorkbenchReducer(newest, { type: 'worker-response', response: response(2, 1) });
    expect(stale).toBe(newest);
    expect(stale.revision).toBe(2);
  });

  it('keeps the original File and immutable edit log across worker failure and retry, but reset clears recovery', () => {
    let state = createAssetPackWorkbenchState();
    state = assetPackWorkbenchReducer(state, { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'worker-response', response: response(1, 0) });
    state = assetPackWorkbenchReducer(state, { type: 'edit-accepted', edit: { kind: 'replace-manifest', manifestText: '{"version":"2.0.0"}', origin: 'advanced-json' } });
    state = assetPackWorkbenchReducer(state, { type: 'worker-failed', message: 'crashed' });
    expect(state.phase).toBe('failed');
    expect(state.originalFile).toBe(file);
    expect(state.acceptedEdits[0]).toMatchObject({ revision: 1 });
    const retry = assetPackWorkbenchReducer(state, { type: 'retry' });
    expect(retry.phase).toBe('opening');
    expect(retry.originalFile).toBe(file);
    expect(retry.acceptedEdits).toEqual(state.acceptedEdits);
    const reset = assetPackWorkbenchReducer(retry, { type: 'reset' });
    expect(reset).toEqual(createAssetPackWorkbenchState());
  });

  it('keeps retry opening blocked when the prior state had no formal blockers', () => {
    let state = assetPackWorkbenchReducer(createAssetPackWorkbenchState(), { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'formal-blockers', blockers: [] });
    const retry = assetPackWorkbenchReducer(state, { type: 'retry' });
    expect(retry.phase).toBe('opening');
    expect(retry.formalBlockers.map(({ code }) => code)).toEqual(['missing-candidate']);
    expect(retry.ready).toBe(false);
  });

  it('marks unsafe uploads without retaining editable recovery data', () => {
    let state = assetPackWorkbenchReducer(createAssetPackWorkbenchState(), { type: 'upload-accepted', file });
    state = assetPackWorkbenchReducer(state, { type: 'worker-unsafe', diagnostics: [] });
    expect(state.phase).toBe('unsafe');
    expect(state.originalFile).toBeUndefined();
    expect(state.acceptedEdits).toEqual([]);
  });

  it('exposes ready exactly when formal blockers are empty', () => {
    let state = createAssetPackWorkbenchState();
    expect(state.formalBlockers.map(({ code }) => code)).toEqual(['missing-candidate']);
    expect(state.ready).toBe(false);
    state = assetPackWorkbenchReducer(state, { type: 'formal-blockers', blockers: [{ code: 'missing-candidate', message: 'missing' }] });
    expect(state.ready).toBe(false);
    state = assetPackWorkbenchReducer(state, { type: 'downloaded', revision: 0 });
    expect(state.ready).toBe(false);
  });
});
