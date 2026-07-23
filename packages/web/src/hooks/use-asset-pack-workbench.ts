import { useEffect, useRef, useState } from 'react';
import type { AssetPackWorkerBaseline, AssetPackWorkerResponse } from '../lib/asset-pack-worker-protocol';
import {
  createAssetPackWorkerClient,
  type AssetPackWorkerClient,
  type AssetPackWorkerFactory,
} from '../lib/asset-pack-worker-client';
import {
  assetPackWorkbenchReducer,
  createAssetPackWorkbenchState,
  type AssetPackAcceptedEdit,
  type AssetPackAcceptedEditInput,
  type AssetPackWorkbenchAction,
  type AssetPackWorkbenchPanel,
  type AssetPackWorkbenchState,
} from '../slice/asset-pack-workbench';

export interface AssetPackWorkbenchControllerOptions {
  readonly baseline: AssetPackWorkerBaseline;
  readonly workerFactory: AssetPackWorkerFactory;
  readonly onState?: (state: AssetPackWorkbenchState) => void;
}

export class AssetPackWorkbenchController {
  private currentClient: AssetPackWorkerClient | undefined;
  private currentState: AssetPackWorkbenchState = createAssetPackWorkbenchState();
  private readonly baseline: AssetPackWorkerBaseline;
  private readonly workerFactory: AssetPackWorkerFactory;
  private onState: ((state: AssetPackWorkbenchState) => void) | undefined;
  private originalReleaseFingerprint: string | undefined;

  constructor(options: AssetPackWorkbenchControllerOptions) {
    this.baseline = options.baseline;
    this.workerFactory = options.workerFactory;
    this.onState = options.onState;
  }

  get state(): AssetPackWorkbenchState {
    return this.currentState;
  }

  setOnState(onState: (state: AssetPackWorkbenchState) => void): void {
    this.onState = onState;
  }

  async upload(file: File): Promise<void> {
    this.disposeClient();
    this.originalReleaseFingerprint = undefined;
    this.dispatch({ type: 'upload-accepted', file });
    const client = this.createClient();
    const result = client.open(file, this.baseline);
    this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision: 0 });
    await result;
  }

  async replaceManifest(
    manifestText: string,
    origin: Extract<AssetPackAcceptedEditInput, { readonly kind: 'replace-manifest' }>['origin'],
  ): Promise<void> {
    this.dispatch({ type: 'edit-accepted', edit: { kind: 'replace-manifest', manifestText, origin } });
    const client = this.requireClient();
    const result = client.replaceManifest(manifestText, origin);
    this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision: client.currentRevision });
    await result;
  }

  async replaceSource(path: string, file: File): Promise<void> {
    this.dispatch({ type: 'edit-accepted', edit: { kind: 'replace-source', path, file } });
    const client = this.requireClient();
    const result = client.replaceSource(path, file);
    this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision: client.currentRevision });
    await result;
  }

  async removeSource(path: string): Promise<void> {
    this.dispatch({ type: 'edit-accepted', edit: { kind: 'remove-source', path } });
    const client = this.requireClient();
    const result = client.removeSource(path);
    this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision: client.currentRevision });
    await result;
  }

  async assemble(kind: 'draft' | 'formal'): Promise<AssetPackWorkerResponse> {
    const client = this.requireClient();
    this.dispatch({ type: 'progress', requestId: client.latestRequestId, revision: this.currentState.revision, stage: 'assembling-archive' });
    const result = await client.assemble(kind);
    if (result.type === 'assembled') this.dispatch({ type: 'downloaded', revision: result.revision });
    return result;
  }

  navigate(panel: AssetPackWorkbenchPanel): void {
    this.dispatch({ type: 'navigate', panel });
  }

  reset(): void {
    this.disposeClient();
    this.originalReleaseFingerprint = undefined;
    this.dispatch({ type: 'reset' });
  }

  workerFailed(error: Error): void {
    this.disposeClient();
    this.dispatch({ type: 'worker-failed', message: error.message });
  }

  async retry(): Promise<void> {
    const originalFile = this.currentState.originalFile;
    if (!originalFile) return;
    const edits = this.currentState.acceptedEdits;
    this.disposeClient();
    this.dispatch({ type: 'retry' });
    const client = this.createClient();
    const open = client.open(originalFile, this.baseline);
    this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision: 0 });
    await open;
    for (const edit of edits) {
      const result = this.replayEdit(client, edit);
      this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision: client.currentRevision });
      await result;
    }
  }

  dispose(): void {
    this.disposeClient();
    this.onState = undefined;
  }

  private replayEdit(client: AssetPackWorkerClient, edit: AssetPackAcceptedEdit): Promise<unknown> {
    if (edit.kind === 'replace-manifest') return client.replaceManifest(edit.manifestText, edit.origin);
    if (edit.kind === 'replace-source') return client.replaceSource(edit.path, edit.file);
    return client.removeSource(edit.path);
  }

  private createClient(): AssetPackWorkerClient {
    const client = createAssetPackWorkerClient({
      port: this.workerFactory(),
      onResponse: (response) => this.handleResponse(response),
      onError: (error) => this.workerFailed(error),
    });
    this.currentClient = client;
    return client;
  }

  private handleResponse(response: AssetPackWorkerResponse): void {
    if (response.type === 'session' && response.outcome === 'editing' && response.revision === 0 && !this.originalReleaseFingerprint && response.workbench.releaseFingerprint !== undefined) {
      this.originalReleaseFingerprint = response.workbench.releaseFingerprint;
    }
    this.dispatch({ type: 'worker-response', response });
  }

  private requireClient(): AssetPackWorkerClient {
    if (!this.currentClient) throw new Error('No asset-pack Worker session is open.');
    return this.currentClient;
  }

  private disposeClient(): void {
    this.currentClient?.dispose();
    this.currentClient = undefined;
  }

  private dispatch(action: AssetPackWorkbenchAction): void {
    this.currentState = assetPackWorkbenchReducer(this.currentState, action);
    this.onState?.(this.currentState);
  }
}

export function useAssetPackWorkbench(options: AssetPackWorkbenchControllerOptions) {
  const [, setStateVersion] = useState(0);
  const controllerRef = useRef<AssetPackWorkbenchController>();
  if (!controllerRef.current) {
    controllerRef.current = new AssetPackWorkbenchController(options);
  }
  const controller = controllerRef.current;
  controller.setOnState(() => setStateVersion((version) => version + 1));
  useEffect(() => () => controller.dispose(), [controller]);
  return {
    state: controller.state,
    upload: (file: File) => controller.upload(file),
    replaceManifest: (manifestText: string, origin: Extract<AssetPackAcceptedEditInput, { readonly kind: 'replace-manifest' }>['origin']) => controller.replaceManifest(manifestText, origin),
    replaceSource: (path: string, file: File) => controller.replaceSource(path, file),
    removeSource: (path: string) => controller.removeSource(path),
    assemble: (kind: 'draft' | 'formal') => controller.assemble(kind),
    retry: () => controller.retry(),
    reset: () => controller.reset(),
    navigate: (panel: AssetPackWorkbenchPanel) => controller.navigate(panel),
  };
}
