import { describe, expect, it, vi } from 'vitest';
import type {
  AssetPackWorkerBaseline,
  AssetPackWorkerResponse,
} from '../src/lib/asset-pack-worker-protocol';
import {
  createAssetPackWorkerClient,
  type AssetPackWorkerPort,
} from '../src/lib/asset-pack-worker-client';

function fakePort() {
  const messages: unknown[] = [];
  const listeners = new Set<(event: MessageEvent<AssetPackWorkerResponse>) => void>();
  const port = {
    postMessage: vi.fn((message: unknown) => messages.push(message)),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'message') return;
      if (typeof listener === 'function') {
        listeners.add(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'message') return;
      if (typeof listener === 'function') {
        listeners.delete(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
      }
    }),
    terminate: vi.fn(),
  } as unknown as AssetPackWorkerPort;
  return {
    port,
    messages,
    emit(response: AssetPackWorkerResponse) {
      listeners.forEach((listener) => listener({ data: response } as MessageEvent<AssetPackWorkerResponse>));
    },
  };
}

const baseline = {} as AssetPackWorkerBaseline;
const session = (requestId: number, revision: number): AssetPackWorkerResponse => ({
  type: 'session',
  requestId,
  revision,
  outcome: 'editing',
  workbench: {
    revision,
    manifestText: '{}',
    uploadMetadata: {
      originalArchiveDigest: `sha256:${'0'.repeat(64)}`,
      baselineReleaseTag: 'test',
    },
    sourceSummaries: [],
    diagnostics: [],
    acknowledgementRecords: [],
    draftSerializable: true,
  },
});

describe('asset-pack Worker client', () => {
  it('serializes open and revisioned edit requests while rejecting stale replies', async () => {
    const worker = fakePort();
    const received: AssetPackWorkerResponse[] = [];
    const client = createAssetPackWorkerClient({ port: worker.port, onResponse: (response) => received.push(response) });
    const file = new File(['zip'], 'pack.lpc-assets.zip');

    const opened = client.open(file, baseline);
    expect(worker.messages[0]).toMatchObject({ type: 'open', requestId: 1, revision: 0, file, baseline });
    worker.emit(session(1, 0));
    await opened;

    const first = client.replaceManifest('{}', 'overview-form');
    const second = client.replaceSource('sprites/a.png', new File(['png'], 'a.png'));
    expect(worker.messages.slice(1)).toEqual([
      expect.objectContaining({ type: 'replace-manifest', requestId: 2, revision: 1 }),
      expect.objectContaining({ type: 'replace-source', requestId: 3, revision: 2 }),
    ]);

    worker.emit(session(2, 1));
    worker.emit(session(3, 2));
    await expect(first).rejects.toMatchObject({ name: 'AssetPackWorkerStaleResponseError' });
    await second;
    expect(received.map((response) => [response.requestId, response.revision])).toEqual([
      [1, 0],
      [3, 2],
    ]);
  });

  it('exposes every worker operation and disposes its message listener and port', async () => {
    const worker = fakePort();
    const client = createAssetPackWorkerClient({ port: worker.port });
    const file = new File(['zip'], 'pack.lpc-assets.zip');
    const open = client.open(file, baseline);
    worker.emit(session(1, 0));
    await open;

    const manifest = client.replaceManifest('{"version":"1.0.0"}', 'advanced-json');
    worker.emit(session(2, 1));
    await manifest;
    const remove = client.removeSource('sprites/a.png');
    worker.emit(session(3, 2));
    await remove;
    const assemble = client.assemble('draft');
    worker.emit({
      type: 'assembled',
      requestId: 4,
      revision: 2,
      kind: 'draft',
      archiveBytes: new ArrayBuffer(0),
      archiveDigest: `sha256:${'1'.repeat(64)}`,
      filename: 'pack.draft.lpc-assets.zip',
      uploadMetadata: { originalArchiveDigest: `sha256:${'0'.repeat(64)}`, baselineReleaseTag: 'test' },
    });
    await expect(assemble).resolves.toMatchObject({ type: 'assembled', revision: 2 });
    client.dispose();
    expect(worker.port.removeEventListener).toHaveBeenCalled();
    expect(worker.port.terminate).toHaveBeenCalledTimes(1);
  });
});
