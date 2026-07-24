import type {
  AssetPackWorkerBaseline,
  AssetPackWorkerRequest,
  AssetPackWorkerResponse,
  AssetPackWorkerProgressStage,
} from './asset-pack-worker-protocol';

export interface AssetPackWorkerPort {
  readonly postMessage: (message: AssetPackWorkerRequest, transfer?: Transferable[]) => void;
  readonly addEventListener: Worker['addEventListener'];
  readonly removeEventListener: Worker['removeEventListener'];
  readonly terminate: () => void;
}

export type AssetPackWorkerFactory = () => AssetPackWorkerPort;

export type AssetPackWorkerTerminalResponse = Extract<
  AssetPackWorkerResponse,
  { readonly type: 'session' | 'assembled' | 'failed' }
>;

export type AssetPackWorkerAcceptedSessionResponse = Extract<
  AssetPackWorkerResponse,
  { readonly type: 'session'; readonly outcome: 'editing' }
>;

export class AssetPackWorkerStaleResponseError extends Error {
  override readonly name = 'AssetPackWorkerStaleResponseError';

  constructor(readonly requestId: number, readonly revision: number) {
    super(`The asset-pack Worker response for request ${String(requestId)} revision ${String(revision)} is stale.`);
  }
}

export class AssetPackWorkerDisposedError extends Error {
  override readonly name = 'AssetPackWorkerDisposedError';

  constructor() {
    super('The asset-pack Worker client has been disposed.');
  }
}

export interface AssetPackWorkerClient {
  readonly currentRevision: number;
  readonly latestRequestId: number;
  readonly open: (file: File, baseline: AssetPackWorkerBaseline) => Promise<AssetPackWorkerTerminalResponse>;
  readonly replaceManifest: (
    manifestText: string,
    origin: Extract<AssetPackWorkerRequest, { readonly type: 'replace-manifest' }>['origin'],
  ) => Promise<AssetPackWorkerTerminalResponse>;
  readonly replaceSource: (path: string, file: File) => Promise<AssetPackWorkerTerminalResponse>;
  readonly removeSource: (path: string) => Promise<AssetPackWorkerTerminalResponse>;
  readonly assemble: (kind: 'draft' | 'formal') => Promise<AssetPackWorkerTerminalResponse>;
  readonly dispose: () => void;
}

export interface CreateAssetPackWorkerClientOptions {
  readonly port: AssetPackWorkerPort;
  readonly onResponse?: (response: AssetPackWorkerResponse) => void;
  readonly onStaleAcceptedResponse?: (response: AssetPackWorkerAcceptedSessionResponse) => void;
  readonly onError?: (error: Error) => void;
}

interface PendingRequest {
  readonly requestId: number;
  readonly revision: number;
  readonly resolve: (response: AssetPackWorkerTerminalResponse) => void;
  readonly reject: (error: unknown) => void;
}

type AssetPackWorkerRequestWithoutId<T extends AssetPackWorkerRequest = AssetPackWorkerRequest> =
  T extends AssetPackWorkerRequest ? Omit<T, 'requestId'> : never;

export function createAssetPackWorkerClient(
  options: CreateAssetPackWorkerClientOptions,
): AssetPackWorkerClient {
  let disposed = false;
  let nextRequestId = 1;
  let currentRevision = 0;
  let latestRequestId = 0;
  const latestByRevision = new Map<number, number>();
  const pending = new Map<number, PendingRequest>();

  const onMessage: EventListener = (event) => {
    const response = (event as MessageEvent<AssetPackWorkerResponse>).data;
    if (!isWorkerResponse(response)) return;
    const expectedRequestId = latestByRevision.get(response.revision);
    const isOpenResponse = pending.get(response.requestId)?.revision === 0
      && response.revision === 0;
    if (expectedRequestId !== response.requestId || (response.revision !== currentRevision && !isOpenResponse)) {
      const stale = pending.get(response.requestId);
      if (stale && response.type === 'session' && response.outcome === 'editing') {
        options.onStaleAcceptedResponse?.(response);
      }
      if (stale) {
        pending.delete(response.requestId);
        stale.reject(new AssetPackWorkerStaleResponseError(response.requestId, response.revision));
      }
      return;
    }

    options.onResponse?.(response);
    if (response.type === 'progress') return;
    const request = pending.get(response.requestId);
    if (!request) return;
    pending.delete(response.requestId);
    request.resolve(response);
  };

  const onError: EventListener = (event) => {
    const errorEvent = event as Event & { readonly error?: unknown };
    const error = errorEvent.error instanceof Error
      ? errorEvent.error
      : new Error('The asset-pack Worker failed.');
    options.onError?.(error);
    rejectPending(error);
  };

  options.port.addEventListener('message', onMessage);
  options.port.addEventListener('error', onError);

  const send = (
    requestWithoutId: AssetPackWorkerRequestWithoutId,
  ): Promise<AssetPackWorkerTerminalResponse> => {
    if (disposed) return Promise.reject(new AssetPackWorkerDisposedError());
    const requestId = nextRequestId;
    nextRequestId += 1;
    const request = { ...requestWithoutId, requestId } as AssetPackWorkerRequest;
    latestRequestId = requestId;
    latestByRevision.set(request.revision, requestId);
    return new Promise<AssetPackWorkerTerminalResponse>((resolve, reject) => {
      pending.set(requestId, { requestId, revision: request.revision, resolve, reject });
      options.port.postMessage(request);
    });
  };

  const client: AssetPackWorkerClient = {
    get currentRevision() {
      return currentRevision;
    },
    get latestRequestId() {
      return latestRequestId;
    },
    open: (file, baseline) => send({ type: 'open', revision: 0, file, baseline }),
    replaceManifest: (manifestText, origin) => {
      currentRevision += 1;
      return send({ type: 'replace-manifest', revision: currentRevision, manifestText, origin });
    },
    replaceSource: (path, file) => {
      currentRevision += 1;
      return send({ type: 'replace-source', revision: currentRevision, path, file });
    },
    removeSource: (path) => {
      currentRevision += 1;
      return send({ type: 'remove-source', revision: currentRevision, path });
    },
    assemble: (kind) => send({ type: 'assemble', revision: currentRevision, kind }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      options.port.removeEventListener('message', onMessage);
      options.port.removeEventListener('error', onError);
      rejectPending(new AssetPackWorkerDisposedError());
      options.port.terminate();
    },
  };

  return client;

  function rejectPending(error: Error): void {
    pending.forEach((request) => request.reject(error));
    pending.clear();
  }
}

function isWorkerResponse(value: unknown): value is AssetPackWorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { readonly type?: unknown; readonly requestId?: unknown; readonly revision?: unknown };
  return typeof candidate.type === 'string'
    && typeof candidate.requestId === 'number'
    && typeof candidate.revision === 'number';
}

export type AssetPackWorkerProgress = {
  readonly requestId: number;
  readonly revision: number;
  readonly stage: AssetPackWorkerProgressStage;
};
