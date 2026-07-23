import { useEffect, useRef, useState } from 'react';
import type { AssetPackWorkerBaseline, AssetPackWorkerResponse } from '../lib/asset-pack-worker-protocol';
import {
  createAssetPackWorkerClient,
  type AssetPackWorkerClient,
  type AssetPackWorkerFactory,
  type AssetPackWorkerTerminalResponse,
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
import { assetPackFormalBlockers, type AssetPackFormalBlocker } from '../slice/asset-pack-release';

export interface AssetPackWorkbenchControllerOptions {
  readonly baseline: AssetPackWorkerBaseline;
  readonly workerFactory: AssetPackWorkerFactory;
  readonly onState?: (state: AssetPackWorkbenchState) => void;
}

export class AssetPackFormalAssemblyBlockedError extends Error {
  override readonly name = 'AssetPackFormalAssemblyBlockedError';

  constructor(readonly blockers: readonly AssetPackFormalBlocker[]) {
    super('Formal asset-pack assembly is blocked by the current release gate.');
  }
}

export class AssetPackWorkbenchController {
  private currentClient: AssetPackWorkerClient | undefined;
  private currentState: AssetPackWorkbenchState = createAssetPackWorkbenchState();
  private readonly baseline: AssetPackWorkerBaseline;
  private readonly workerFactory: AssetPackWorkerFactory;
  private onState: ((state: AssetPackWorkbenchState) => void) | undefined;

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
    const client = this.requireClient();
    const revision = this.currentState.revision + 1;
    this.dispatch({ type: 'edit-requested', revision, edit: { kind: 'replace-manifest', manifestText, origin } });
    return this.awaitEdit(client.replaceManifest(manifestText, origin), client, revision);
  }

  async replaceSource(path: string, file: File): Promise<void> {
    const client = this.requireClient();
    const revision = this.currentState.revision + 1;
    this.dispatch({ type: 'edit-requested', revision, edit: { kind: 'replace-source', path, file } });
    return this.awaitEdit(client.replaceSource(path, file), client, revision);
  }

  async removeSource(path: string): Promise<void> {
    const client = this.requireClient();
    const revision = this.currentState.revision + 1;
    this.dispatch({ type: 'edit-requested', revision, edit: { kind: 'remove-source', path } });
    return this.awaitEdit(client.removeSource(path), client, revision);
  }

  async assemble(kind: 'draft' | 'formal'): Promise<AssetPackWorkerResponse> {
    if (kind === 'formal') {
      const blockers = this.currentFormalBlockers();
      this.dispatch({ type: 'formal-blockers', blockers });
      if (blockers.length > 0) throw new AssetPackFormalAssemblyBlockedError(blockers);
    }
    const client = this.requireClient();
    const resultPromise = client.assemble(kind);
    this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision: this.currentState.revision });
    this.dispatch({ type: 'progress', requestId: client.latestRequestId, revision: this.currentState.revision, stage: 'assembling-archive' });
    const result = await resultPromise;
    if (result.type === 'assembled') this.dispatch({ type: 'downloaded', revision: result.revision });
    return result;
  }

  navigate(panel: AssetPackWorkbenchPanel): void {
    this.dispatch({ type: 'navigate', panel });
  }

  reset(): void {
    this.disposeClient();
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
      this.dispatch({ type: 'replay-requested', revision: edit.revision });
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

  private async awaitEdit(
    result: Promise<AssetPackWorkerTerminalResponse>,
    client: AssetPackWorkerClient,
    revision: number,
  ): Promise<void> {
    this.dispatch({ type: 'request-started', requestId: client.latestRequestId, revision });
    try {
      await result;
    } catch (error) {
      this.dispatch({ type: 'edit-rejected', revision });
      throw error;
    }
  }

  private createClient(): AssetPackWorkerClient {
    const client = createAssetPackWorkerClient({
      port: this.workerFactory(),
      onResponse: (response) => this.handleResponse(response),
      onStaleAcceptedResponse: (response) => this.handleResponse(response),
      onError: (error) => this.workerFailed(error),
    });
    this.currentClient = client;
    return client;
  }

  private handleResponse(response: AssetPackWorkerResponse): void {
    this.dispatch({ type: 'worker-response', response });
  }

  private currentFormalBlockers(): readonly AssetPackFormalBlocker[] {
    if (this.currentState.phase === 'opening') {
      return this.currentState.formalBlockers.length > 0
        ? this.currentState.formalBlockers
        : [{ code: 'missing-candidate', message: 'The current revision has no verified formal archive candidate.' }];
    }
    if (this.currentState.phase === 'failed') return this.currentState.formalBlockers;
    const workbench = this.currentState.workbench;
    if (!workbench) {
      return this.currentState.formalBlockers.length > 0
        ? this.currentState.formalBlockers
        : [{ code: 'missing-candidate', message: 'The current revision has no verified formal archive candidate.' }];
    }
    const currentRevisionWorkbench = workbench.revision === this.currentState.revision
      ? workbench
      : { ...workbench, revision: this.currentState.revision };
    return assetPackFormalBlockers({
      workbench: currentRevisionWorkbench,
      ...(this.currentState.originalReleaseFingerprint
        ? { originalReleaseFingerprint: this.currentState.originalReleaseFingerprint }
        : {}),
      ...(this.currentState.originalUploadMetadata
        ? { originalUploadMetadata: this.currentState.originalUploadMetadata }
        : {}),
    });
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
