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
        if (type !== 'message') return;
        if (typeof listener === 'function') listeners.add(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type !== 'message') return;
        if (typeof listener === 'function') listeners.delete(listener as (event: MessageEvent<AssetPackWorkerResponse>) => void);
      },
      terminate: worker.terminate,
    };
  });
  return { factory, workers };
}

const baseline = {} as AssetPackWorkbenchControllerOptions['baseline'];
const editing = (requestId: number, revision: number): AssetPackWorkerResponse => ({
  type: 'session', requestId, revision, outcome: 'editing', workbench: {
    revision, manifestText: '{}', uploadMetadata: { originalArchiveDigest: `sha256:${'0'.repeat(64)}`, baselineReleaseTag: 'test' }, sourceSummaries: [], diagnostics: [], acknowledgementRecords: [], draftSerializable: true,
  },
});

describe('useAssetPackWorkbench orchestration', () => {
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
