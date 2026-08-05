import { describe, expect, it, vi } from 'vitest';
import { createAssetPackArchive } from '@lpc-toolkit/asset-pack-format';
import { createBrowserAssetPackFormatRuntime } from '../src/adapter/asset-pack-format-runtime';
import type { AssetPackWorkerResponse } from '../src/lib/asset-pack-worker-protocol';
import {
  AssetPackDownloadMetadataError,
  assetPackDownloadFilename,
  downloadAssetPackArchive,
} from '../src/lib/asset-pack-download';
import {
  AssetPackWorkbenchController,
  type AssetPackWorkbenchControllerOptions,
} from '../src/hooks/use-asset-pack-workbench';

function workerFactory() {
  const workers: Array<{
    messages: unknown[];
    emit: (response: AssetPackWorkerResponse) => void;
    terminate: ReturnType<typeof vi.fn>;
  }> = [];
  const factory = vi.fn(() => {
    const listeners = new Set<(event: MessageEvent<AssetPackWorkerResponse>) => void>();
    const worker = {
      messages: [] as unknown[],
      emit(response: AssetPackWorkerResponse) {
        listeners.forEach((listener) => listener({ data: response } as MessageEvent<AssetPackWorkerResponse>));
      },
      terminate: vi.fn(),
    };
    workers.push(worker);
    return {
      postMessage: (message: unknown) => worker.messages.push(message),
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof listener === 'function') listeners.add(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof listener === 'function') listeners.delete(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
      },
      terminate: worker.terminate,
    };
  });
  return { factory, workers };
}

const baseline = {} as AssetPackWorkbenchControllerOptions['baseline'];
const digest = (value: string) => `sha256:${value.repeat(64 / value.length)}` as `sha256:${string}`;
const uploadMetadata = { originalArchiveDigest: digest('a'), uploadedVersion: '1.2.4', uploadedStatus: 'formal' as const, baselineReleaseTag: 'test' };

function readyEditing(requestId: number, revision: number): AssetPackWorkerResponse {
  return {
    type: 'session', requestId, revision, outcome: 'editing', workbench: {
      revision,
      manifestText: JSON.stringify({ id: 'acme.hair', version: '1.2.4' }),
      uploadMetadata,
      sourceSummaries: [],
      diagnostics: [],
      acknowledgementRecords: [],
      releaseFingerprint: digest('c'),
      formalCandidate: {
        revision,
        archiveDigest: digest('a'),
        filename: 'acme.hair-1.2.4.lpc-assets.zip',
        version: '1.2.4',
        byteIdenticalToUploadedFormal: true,
        uploadMetadata,
      },
      draftSerializable: true,
    },
  };
}

describe('asset-pack downloads', () => {
  it('uses the exact draft and formal filenames', () => {
    expect(assetPackDownloadFilename({ packId: 'acme.hair', version: '1.2.4', kind: 'draft' }))
      .toBe('acme.hair-1.2.4.draft.lpc-assets.zip');
    expect(assetPackDownloadFilename({ packId: 'acme.hair', version: '1.2.4', kind: 'formal' }))
      .toBe('acme.hair-1.2.4.lpc-assets.zip');
  });

  it('hands the Worker bytes to downloadBlob without rebuilding the archive', () => {
    const download = vi.fn();
    const response = {
      type: 'assembled',
      requestId: 2,
      revision: 8,
      kind: 'draft',
      archiveBytes: new Uint8Array([1, 2, 3]).buffer,
      archiveDigest: digest('b'),
      filename: 'acme.hair-1.2.4.draft.lpc-assets.zip',
      uploadMetadata,
    } satisfies Extract<AssetPackWorkerResponse, { readonly type: 'assembled' }>;

    downloadAssetPackArchive(response, download);

    expect(download).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith(expect.any(Blob), response.filename);
    expect(download.mock.calls[0]![0].type).toBe('application/zip');
  });

  it('does not download or mark a revision when a newer edit wins the race', async () => {
    const workers = workerFactory();
    const download = vi.fn();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory, downloadBlob: download });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(readyEditing(1, 0));
    await opened;

    const assembly = controller.downloadArchive('draft');
    const assemblyRequest = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    const edit = controller.replaceManifest('{"id":"acme.hair","version":"1.2.5"}', 'advanced-json');
    const editRequest = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    workers.workers[0]!.emit(readyEditing(editRequest.requestId, 1));
    await edit;
    workers.workers[0]!.emit({
      type: 'assembled',
      requestId: assemblyRequest.requestId,
      revision: 0,
      kind: 'draft',
      archiveBytes: new ArrayBuffer(3),
      archiveDigest: digest('b'),
      filename: 'acme.hair-1.2.4.draft.lpc-assets.zip',
      uploadMetadata,
    });

    await expect(assembly).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
    expect(controller.state.latestDownloadedRevision).toBeUndefined();
    controller.dispose();
  });

  it('marks the exact current revision only after the download handoff succeeds', async () => {
    const workers = workerFactory();
    const download = vi.fn();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory, downloadBlob: download });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(readyEditing(1, 0));
    await opened;

    const assembly = controller.downloadArchive('formal');
    const request = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    workers.workers[0]!.emit({
      type: 'assembled',
      requestId: request.requestId,
      revision: 0,
      kind: 'formal',
      archiveBytes: new ArrayBuffer(3),
      archiveDigest: digest('a'),
      filename: 'acme.hair-1.2.4.draft.lpc-assets.zip',
      uploadMetadata,
    });
    await assembly;
    expect(controller.state.latestDownloadedRevision).toBe(0);

    download.mockImplementationOnce(() => { throw new Error('blocked'); });
    const retry = controller.downloadArchive('formal');
    const retryRequest = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    workers.workers[0]!.emit({
      type: 'assembled',
      requestId: retryRequest.requestId,
      revision: 0,
      kind: 'formal',
      archiveBytes: new ArrayBuffer(3),
      archiveDigest: digest('a'),
      filename: 'acme.hair-1.2.4.lpc-assets.zip',
      uploadMetadata,
    });
    await expect(retry).rejects.toThrow('blocked');
    expect(controller.state.latestDownloadedRevision).toBe(0);
    controller.dispose();
  });

  it('rejects formal bytes whose Worker metadata does not match the current candidate', async () => {
    const workers = workerFactory();
    const controller = new AssetPackWorkbenchController({ baseline, workerFactory: workers.factory, downloadBlob: vi.fn() });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(readyEditing(1, 0));
    await opened;

    const assembly = controller.downloadArchive('formal');
    const request = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    workers.workers[0]!.emit({
      type: 'assembled', requestId: request.requestId, revision: 0, kind: 'formal', archiveBytes: new ArrayBuffer(1),
      archiveDigest: digest('b'), filename: 'acme.hair-1.2.4.lpc-assets.zip', uploadMetadata,
    });

    await expect(assembly).rejects.toBeInstanceOf(AssetPackDownloadMetadataError);
    controller.dispose();
  });

  it('exports one verified archive and one handoff sidecar for the same revision', async () => {
    const workers = workerFactory();
    const download = vi.fn();
    const runtime = createBrowserAssetPackFormatRuntime({ crypto: globalThis.crypto });
    const created = await createAssetPackArchive({
      kind: 'draft',
      manifestDocument: {
        schema: 'lpc-toolkit.asset-pack.v1',
        id: 'acme.hair',
        version: '1.2.4',
        displayName: 'ACME Hair',
        credits: { authors: ['Alice'], licenses: ['CC-BY-SA 4.0'], urls: [], notes: 'Fixture.' },
        assets: [],
      },
      sourceBytes: new Map(),
      runtime,
    });
    const controller = new AssetPackWorkbenchController({
      baseline,
      workerFactory: workers.factory,
      downloadBlob: download,
      runtime,
      confirmWebCliHandoff: vi.fn(() => true),
      handoffIdFactory: () => '550e8400-e29b-41d4-a716-446655440000',
      now: () => '2026-08-06T14:00:00.000Z',
    });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(readyEditing(1, 0));
    await opened;

    const exporting = controller.exportForCli('draft');
    const request = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    workers.workers[0]!.emit({
      type: 'assembled',
      requestId: request.requestId,
      revision: 0,
      kind: 'draft',
      archiveBytes: created.archiveBytes.slice().buffer,
      archiveDigest: created.archiveDigest,
      filename: 'acme.hair-1.2.4.draft.lpc-assets.zip',
      uploadMetadata,
    });

    const result = await exporting;
    if (!result) throw new Error('Expected the confirmed handoff export to complete.');
    expect(result.handoff.handoffId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls[0]?.[1]).toBe('acme.hair-1.2.4.draft.lpc-assets.zip');
    expect(download.mock.calls[1]?.[1]).toBe('acme.hair-1.2.4.draft.web-cli-handoff.json');
    const sidecar = download.mock.calls[1]?.[0];
    expect(sidecar).toBeInstanceOf(Blob);
    if (!(sidecar instanceof Blob)) throw new Error('Expected the handoff sidecar Blob.');
    expect(JSON.parse(await sidecar.text())).toMatchObject({
      schema: 'lpc-toolkit.web-cli-handoff.v1',
      web: { workbenchRevision: 0, baselineReleaseTag: 'test' },
      pack: { id: 'acme.hair', version: '1.2.4', archiveKind: 'draft' },
      payload: { archiveDigest: created.archiveDigest, byteLength: created.archiveBytes.byteLength },
      attribution: { required: true },
      privacy: { absolutePaths: false, browserState: false },
    });
    expect(controller.state.latestDownloadedRevision).toBe(0);
    controller.dispose();
  });

  it('does not export either file when the Web revision changes during sidecar verification', async () => {
    const workers = workerFactory();
    const download = vi.fn();
    const baseRuntime = createBrowserAssetPackFormatRuntime({ crypto: globalThis.crypto });
    const created = await createAssetPackArchive({
      kind: 'draft',
      manifestDocument: {
        schema: 'lpc-toolkit.asset-pack.v1',
        id: 'acme.hair',
        version: '1.2.4',
        displayName: 'ACME Hair',
        credits: { authors: ['Alice'], licenses: ['CC-BY-SA 4.0'], urls: [], notes: 'Fixture.' },
        assets: [],
      },
      sourceBytes: new Map(),
      runtime: baseRuntime,
    });
    let controller!: AssetPackWorkbenchController;
    let editStarted = false;
    const runtime = {
      ...baseRuntime,
      sha256: async (bytes: Uint8Array) => {
        const digest = await baseRuntime.sha256(bytes);
        if (!editStarted) {
          editStarted = true;
          const edit = controller.replaceManifest('{"id":"acme.hair","version":"1.2.5"}', 'advanced-json');
          const editRequest = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
          workers.workers[0]!.emit(readyEditing(editRequest.requestId, 1));
          await edit;
        }
        return digest;
      },
    };
    controller = new AssetPackWorkbenchController({
      baseline,
      workerFactory: workers.factory,
      downloadBlob: download,
      runtime,
      confirmWebCliHandoff: () => true,
      handoffIdFactory: () => '550e8400-e29b-41d4-a716-446655440000',
      now: () => '2026-08-06T14:00:00.000Z',
    });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(readyEditing(1, 0));
    await opened;

    const exporting = controller.exportForCli('draft');
    const request = workers.workers[0]!.messages.at(-1) as { readonly requestId: number };
    workers.workers[0]!.emit({
      type: 'assembled',
      requestId: request.requestId,
      revision: 0,
      kind: 'draft',
      archiveBytes: created.archiveBytes.slice().buffer,
      archiveDigest: created.archiveDigest,
      filename: 'acme.hair-1.2.4.draft.lpc-assets.zip',
      uploadMetadata,
    });

    await expect(exporting).rejects.toThrow('revision changed');
    expect(download).not.toHaveBeenCalled();
    expect(controller.state.latestDownloadedRevision).toBeUndefined();
    controller.dispose();
  });

  it('requires the explicit Web confirmation before assembling a handoff', async () => {
    const workers = workerFactory();
    const confirm = vi.fn(() => false);
    const controller = new AssetPackWorkbenchController({
      baseline,
      workerFactory: workers.factory,
      confirmWebCliHandoff: confirm,
      downloadBlob: vi.fn(),
    });
    const opened = controller.upload(new File(['zip'], 'original.zip'));
    workers.workers[0]!.emit(readyEditing(1, 0));
    await opened;
    const messageCount = workers.workers[0]!.messages.length;

    await expect(controller.exportForCli('draft')).resolves.toBeUndefined();
    expect(confirm).toHaveBeenCalledOnce();
    expect(workers.workers[0]!.messages).toHaveLength(messageCount);
    controller.dispose();
  });
});
