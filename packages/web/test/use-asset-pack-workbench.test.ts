import { describe, expect, it, vi } from 'vitest';
import type { AssetPackWorkerResponse } from '../src/lib/asset-pack-worker-protocol';
import {
  AssetPackWorkbenchController,
  type AssetPackWorkbenchControllerOptions,
} from '../src/hooks/use-asset-pack-workbench';

function workerFactory() {
  const workers: Array<{
    messages: unknown[];
    emit: (response: AssetPackWorkerResponse) => void;
    emitError: (error: Event) => void;
    terminate: ReturnType<typeof vi.fn>;
  }> = [];
  const factory = vi.fn(() => {
    const listeners = new Set<(event: MessageEvent<AssetPackWorkerResponse>) => void>();
    const errorListeners = new Set<(event: Event) => void>();
    const worker = {
      messages: [] as unknown[],
      emit(response: AssetPackWorkerResponse) {
        listeners.forEach((listener) => listener({ data: response } as MessageEvent<AssetPackWorkerResponse>));
      },
      emitError(error: Event) {
        errorListeners.forEach((listener) => listener(error));
      },
      terminate: vi.fn(),
    };
    workers.push(worker);
    return {
      postMessage: (message: unknown) => worker.messages.push(message),
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener !== 'function') return;
        if (type === 'message') listeners.add(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
        if (type === 'error') errorListeners.add(listener as (event: Event) => void);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener !== 'function') return;
        if (type === 'message') listeners.delete(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
        if (type === 'error') errorListeners.delete(listener as (event: Event) => void);
      },
      terminate: worker.terminate,
    };
  });
  return { factory, workers };
}

const baseline = {} as AssetPackWorkbenchControllerOptions['baseline'];
const uploadMetadata = { originalArchiveDigest: `sha256:${'0'.repeat(64)}`, baselineReleaseTag: 'test' } as const;
const editing = (requestId: number, revision: number): AssetPackWorkerResponse => ({
  type: 'session', requestId, revision, outcome: 'editing', workbench: {
    revision, manifestText: '{}', uploadMetadata: { originalArchiveDigest: `sha256:${'0'.repeat(64)}`, baselineReleaseTag: 'test' }, sourceSummaries: [], diagnostics: [], acknowledgementRecords: [], draftSerializable: true,
  },
});

const editingWithError = (requestId: number): AssetPackWorkerResponse => ({
  type: 'session', requestId, revision: 0, outcome: 'editing', workbench: {
    revision: 0,
    manifestText: '{}',
    uploadMetadata: { originalArchiveDigest: `sha256:${'0'.repeat(64)}`, baselineReleaseTag: 'test' },
    sourceSummaries: [],
    diagnostics: [{ code: 'asset_pack_invalid', severity: 'error', message: 'invalid', scope: 'manifest' }],
    acknowledgementRecords: [],
    releaseFingerprint: `sha256:${'a'.repeat(64)}`,
    draftSerializable: true,
  },
});

const readyEditing = (requestId: number): AssetPackWorkerResponse => ({
  type: 'session',
  requestId,
  revision: 0,
  outcome: 'editing',
  workbench: {
    revision: 0,
    manifestText: JSON.stringify({
      schema: 'lpc-toolkit.asset-pack.v1',
      id: 'acme.demo',
      displayName: 'Demo',
      version: '1.2.3',
      credits: { authors: ['A'], licenses: ['CC0'], urls: [], notes: '' },
      assets: [],
    }),
    uploadMetadata: {
      originalArchiveDigest: `sha256:${'a'.repeat(64)}`,
      uploadedVersion: '1.2.3',
      uploadedStatus: 'formal',
      baselineReleaseTag: 'test',
    },
    sourceSummaries: [],
    diagnostics: [],
    acknowledgementRecords: [],
    contentDigest: `sha256:${'c'.repeat(64)}`,
    releaseFingerprint: `sha256:${'r'.repeat(64)}`,
    formalCandidate: {
      revision: 0,
      archiveDigest: `sha256:${'a'.repeat(64)}`,
      filename: 'acme.demo-1.2.3.lpc-assets.zip',
      version: '1.2.3',
      byteIdenticalToUploadedFormal: true,
      uploadMetadata: {
        originalArchiveDigest: `sha256:${'a'.repeat(64)}`,
        uploadedVersion: '1.2.3',
        uploadedStatus: 'formal',
        baselineReleaseTag: 'test',
      },
    },
    draftSerializable: true,
  },
});

describe('useAssetPackWorkbench orchestration', () => {
  it('keeps opening non-ready and refuses formal assembly before the first Worker revision', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const upload = controller.upload(new File(['zip'], 'original.zip'));

    expect(controller.state.phase).toBe('opening');
    expect(controller.state.formalBlockers.map(({ code }) => code)).toEqual(['missing-candidate']);
    expect(controller.state.ready).toBe(false);
    await expect(controller.assemble('formal')).rejects.toMatchObject({
      name: 'AssetPackFormalAssemblyBlockedError',
      blockers: [{ code: 'missing-candidate' }],
    });
    expect(workers.workers[0]!.messages).toHaveLength(1);
    controller.dispose();
    await expect(upload).rejects.toThrow('disposed');
  });

  it('preserves the unsafe blocker when formal assembly is attempted', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const upload = controller.upload(new File(['zip'], 'unsafe.zip'));
    workers.workers[0]!.emit({
      type: 'session',
      requestId: 1,
      revision: 0,
      outcome: 'unsafe',
      diagnostics: [{ code: 'unsafe_zip', severity: 'error', message: 'unsafe', scope: 'archive' }],
    });
    await upload;

    const messageCount = workers.workers[0]!.messages.length;
    await expect(controller.assemble('formal')).rejects.toMatchObject({
      name: 'AssetPackFormalAssemblyBlockedError',
      blockers: [{ code: 'unsafe-archive' }],
    });
    expect(controller.state.formalBlockers.map(({ code }) => code)).toEqual(['unsafe-archive']);
    expect(controller.state.ready).toBe(false);
    expect(workers.workers[0]!.messages).toHaveLength(messageCount);
    controller.dispose();
  });

  it('blocks formal assembly after an undiagnosed Worker crash from a ready session', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const opened = controller.upload(new File(['zip'], 'ready.zip'));
    workers.workers[0]!.emit(readyEditing(1));
    await opened;

    expect(controller.state.phase).toBe('editing');
    expect(controller.state.ready).toBe(true);
    expect(controller.state.formalBlockers).toEqual([]);

    workers.workers[0]!.emitError(new Event('error'));

    expect(controller.state.phase).toBe('failed');
    expect(controller.state.formalBlockers.length).toBeGreaterThan(0);
    expect(controller.state.ready).toBe(false);
    await expect(controller.assemble('formal')).rejects.toMatchObject({
      name: 'AssetPackFormalAssemblyBlockedError',
    });
    expect(controller.state.formalBlockers.length).toBeGreaterThan(0);
  });

  it('computes authoritative formal blockers and refuses formal assembly while not ready', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(editingWithError(1));
    await opened;

    expect(controller.state.formalBlockers.map(({ code }) => code)).toEqual([
      'validation-error', 'missing-candidate', 'invalid-version',
    ]);
    expect(controller.state.originalReleaseFingerprint).toBe(`sha256:${'a'.repeat(64)}`);
    expect(controller.state.originalUploadMetadata).toEqual({
      originalArchiveDigest: `sha256:${'0'.repeat(64)}`,
      baselineReleaseTag: 'test',
    });
    expect(controller.state.ready).toBe(false);
    const messageCount = workers.workers[0]!.messages.length;
    const assembly = controller.assemble('formal');
    await Promise.resolve();
    expect(workers.workers[0]!.messages).toHaveLength(messageCount);
    controller.dispose();
    await expect(assembly).rejects.toMatchObject({ name: 'AssetPackFormalAssemblyBlockedError' });
  });

  it('leaves a rejected edit out of retry replay while preserving the failure state', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(editing(1, 0));
    await opened;

    const edit = controller.replaceManifest('{"acknowledgements":[]}', 'advanced-json');
    workers.workers[0]!.emit({
      type: 'failed',
      requestId: 2,
      revision: 1,
      diagnostic: { code: 'asset_acknowledgement_edit_forbidden', severity: 'error', message: 'rejected', scope: 'warning' },
    });
    await edit;
    expect(controller.state.acceptedEdits).toEqual([]);

    const retry = controller.retry();
    workers.workers[1]!.emit(editing(1, 0));
    await retry;
    expect(workers.workers[1]!.messages).toEqual([
      expect.objectContaining({ type: 'open', revision: 0 }),
    ]);
  });

  it('returns from assembling to editing and records the latest downloaded revision', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(editing(1, 0));
    await opened;

    const assembly = controller.assemble('draft');
    const request = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    workers.workers[0]!.emit({
      type: 'assembled',
      requestId: request.requestId,
      revision: 0,
      kind: 'draft',
      archiveBytes: new ArrayBuffer(0),
      archiveDigest: `sha256:${'1'.repeat(64)}`,
      filename: 'asset-pack.draft.lpc-assets.zip',
      uploadMetadata,
    });
    await assembly;
    expect(controller.state.phase).toBe('editing');
    expect(controller.state.pendingRequestId).toBeUndefined();
    expect(controller.state.progress).toBeUndefined();
    expect(controller.state.latestDownloadedRevision).toBe(0);
  });

  it('replaces a crashed Worker, replays the original File and exact accepted edits, and ignores old replies', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const original = new File(['zip'], 'original.zip');
    const opened = controller.upload(original);
    workers.workers[0]!.emit(editing(1, 0));
    await opened;
    const manifest = controller.replaceManifest('{"version":"2.0.0"}', 'advanced-json');
    workers.workers[0]!.emit(editing(2, 1));
    await manifest;
    const source = controller.replaceSource('sprites/a.png', new File(['a'], 'a.png'));
    workers.workers[0]!.emit(editing(3, 2));
    await source;

    controller.workerFailed(new Error('crashed'));
    const retry = controller.retry();
    expect(workers.workers[0]!.terminate).toHaveBeenCalledTimes(1);
    expect(workers.factory).toHaveBeenCalledTimes(2);
    expect(workers.workers[1]!.messages).toEqual([expect.objectContaining({ type: 'open', revision: 0, file: original })]);
    workers.workers[0]!.emit(editing(99, 2));
    workers.workers[1]!.emit(editing(1, 0));
    await Promise.resolve();
    expect(workers.workers[1]!.messages).toEqual([
      expect.objectContaining({ type: 'open', revision: 0, file: original }),
      expect.objectContaining({ type: 'replace-manifest', revision: 1, manifestText: '{"version":"2.0.0"}' }),
    ]);
    workers.workers[1]!.emit(editing(2, 1));
    await Promise.resolve();
    expect(workers.workers[1]!.messages).toEqual([
      expect.objectContaining({ type: 'open', revision: 0, file: original }),
      expect.objectContaining({ type: 'replace-manifest', revision: 1, manifestText: '{"version":"2.0.0"}' }),
      expect.objectContaining({ type: 'replace-source', revision: 2, path: 'sprites/a.png' }),
    ]);
    workers.workers[1]!.emit(editing(3, 2));
    await retry;
    expect(controller.state.revision).toBe(2);
    expect(controller.state.originalFile).toBe(original);
    controller.dispose();
    expect(workers.workers[1]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('retains every accepted concurrent edit for contiguous retry replay after stale replies', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const original = new File(['zip'], 'original.zip');
    const opened = controller.upload(original);
    workers.workers[0]!.emit(editing(1, 0));
    await opened;

    const manifest = controller.replaceManifest('{"version":"2.0.0"}', 'advanced-json');
    const source = controller.replaceSource('sprites/a.png', new File(['a'], 'a.png'));
    const remove = controller.removeSource('sprites/b.png');
    const requests = workers.workers[0]!.messages.slice(1) as Array<{ readonly requestId: number; readonly revision: number; readonly type: string }>;
    expect(requests.map(({ type, revision }) => [type, revision])).toEqual([
      ['replace-manifest', 1],
      ['replace-source', 2],
      ['remove-source', 3],
    ]);

    workers.workers[0]!.emit(editing(requests[2]!.requestId, 3));
    workers.workers[0]!.emit(editing(requests[1]!.requestId, 2));
    workers.workers[0]!.emit(editing(requests[0]!.requestId, 1));
    await Promise.allSettled([manifest, source, remove]);

    expect(controller.state.acceptedEdits.map(({ revision }) => revision)).toEqual([1, 2, 3]);
    controller.workerFailed(new Error('crashed'));
    const retry = controller.retry();
    expect(workers.factory).toHaveBeenCalledTimes(2);
    workers.workers[1]!.emit(editing(1, 0));
    for (const expectedRevision of [1, 2, 3]) {
      await Promise.resolve();
      const message = workers.workers[1]!.messages.at(-1) as { readonly requestId: number; readonly revision: number; readonly type: string };
      expect(message).toMatchObject({ type: expectedRevision === 1 ? 'replace-manifest' : expectedRevision === 2 ? 'replace-source' : 'remove-source', revision: expectedRevision });
      workers.workers[1]!.emit(editing(message.requestId, expectedRevision));
    }
    await retry;

    expect(controller.state.revision).toBe(3);
    expect(controller.state.workbench?.revision).toBe(3);
    expect(controller.state.acceptedEdits.map(({ revision }) => revision)).toEqual([1, 2, 3]);
    expect((workers.workers[1]!.messages.slice(1) as Array<{ readonly revision: number }>).map(({ revision }) => revision)).toEqual([1, 2, 3]);
    controller.dispose();
  });

  it('resets and replaces clients on a new upload while retaining no decoded byte maps', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory });
    const first = controller.upload(new File(['first'], 'first.zip'));
    workers.workers[0]!.emit(editing(1, 0));
    await first;
    const second = controller.upload(new File(['second'], 'second.zip'));
    workers.workers[1]!.emit(editing(1, 0));
    await second;
    expect(workers.workers[0]!.terminate).toHaveBeenCalledTimes(1);
    expect(controller.state.originalFile?.name).toBe('second.zip');
    expect('sourceBytes' in controller).toBe(false);
  });
});
