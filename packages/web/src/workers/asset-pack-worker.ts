import type {
  AssetPackFormatRuntime,
  AssetPackPngDecoder,
} from '@lpc-toolkit/asset-pack-format';
import type {
  AssetPackWorkerBaseline,
  AssetPackWorkerRequest,
  AssetPackWorkerResponse,
} from '../lib/asset-pack-worker-protocol';
import {
  openAssetPackWorkerSession,
  type AssetPackWorkerSession,
} from './asset-pack-worker-session';

export interface AssetPackWorkerHandlerOptions {
  readonly baseline: AssetPackWorkerBaseline;
  readonly runtime?: AssetPackFormatRuntime;
  readonly decoder?: AssetPackPngDecoder;
  readonly postMessage: (response: AssetPackWorkerResponse, transfer?: Transferable[]) => void;
}

export interface AssetPackWorkerMessageEvent {
  readonly data: AssetPackWorkerRequest;
}

export type AssetPackWorkerHandler = ((event: AssetPackWorkerMessageEvent) => Promise<void>) & {
  readonly handleMessage: (event: AssetPackWorkerMessageEvent) => Promise<void>;
};

export function createAssetPackWorkerHandler(options: AssetPackWorkerHandlerOptions): AssetPackWorkerHandler {
  let session: AssetPackWorkerSession | undefined;

  const handleMessage = async (event: AssetPackWorkerMessageEvent): Promise<void> => {
    const request = event.data;
    if (request.type === 'open') {
      const opened = await openAssetPackWorkerSession({
        file: request.file,
        baseline: request.baseline,
        ...(options.runtime ? { runtime: options.runtime } : {}),
        ...(options.decoder ? { decoder: options.decoder } : {}),
        requestId: request.requestId,
      });
      session = opened.session;
      opened.responses.forEach((response) => options.postMessage(response));
      return;
    }

    if (!session) {
      options.postMessage({
        type: 'failed',
        requestId: request.requestId,
        revision: request.revision,
        diagnostic: {
          code: 'asset_worker_session_missing',
          severity: 'error',
          message: 'No safe asset-pack session is open.',
          scope: 'archive',
        },
      });
      return;
    }

    const responses = request.type === 'replace-manifest'
      ? await session.replaceManifest(request)
      : request.type === 'replace-source'
        ? await session.replaceSource(request)
        : request.type === 'remove-source'
          ? await session.removeSource(request)
          : await session.assemble(request);
    responses.forEach((response) => {
      if (response.type === 'assembled') {
        options.postMessage(response, [response.archiveBytes]);
      } else {
        options.postMessage(response);
      }
    });
  };

  return Object.assign(handleMessage, { handleMessage }) as AssetPackWorkerHandler;
}

const workerScope = typeof self === 'undefined' ? undefined : self;
if (workerScope) {
  const scope = workerScope as unknown as {
    onmessage: ((event: MessageEvent<AssetPackWorkerRequest>) => void) | null;
    postMessage: (response: AssetPackWorkerResponse, transfer?: Transferable[]) => void;
  };
  let handler: AssetPackWorkerHandler | undefined;
  scope.onmessage = async (event) => {
    if (!handler && event.data.type === 'open') {
      handler = createAssetPackWorkerHandler({
        baseline: event.data.baseline,
        postMessage: (response, transfer) => scope.postMessage(response, transfer),
      });
    }
    if (handler) {
      await handler(event);
      return;
    }
    scope.postMessage({
      type: 'failed',
      requestId: event.data.requestId,
      revision: event.data.revision,
      diagnostic: {
        code: 'asset_worker_session_missing',
        severity: 'error',
        message: 'The Worker must receive an open request before edits.',
        scope: 'archive',
      },
    });
  };
}
