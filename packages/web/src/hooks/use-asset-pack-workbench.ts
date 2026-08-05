import { useEffect, useRef, useState } from 'react';
import {
  assetWebCliHandoffStateDigestInput,
  type AssetWebCliHandoff,
} from '@lpc-toolkit/core';
import {
  inspectAssetPackArchiveBytes,
  type AssetPackFormatRuntime,
  type AssetPackSha256,
} from '@lpc-toolkit/asset-pack-format';
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
import {
  assertAssetPackDownloadMetadata,
  downloadAssetPackArchive,
  type AssetPackAssembledResponse,
  type AssetPackDownloadKind,
} from '../lib/asset-pack-download';
import { downloadBlob } from '../lib/download';
import { createBrowserAssetPackFormatRuntime } from '../adapter/asset-pack-format-runtime';
import {
  assetPackWebCliHandoffFilename,
  createAssetPackWebCliHandoffMetadata,
  createAssetPackWebCliHandoffSnapshot,
  serializeAssetPackWebCliHandoff,
} from '../lib/asset-pack-web-cli-handoff';

export interface AssetPackWorkbenchControllerOptions {
  readonly baseline: AssetPackWorkerBaseline;
  readonly workerFactory: AssetPackWorkerFactory;
  readonly onState?: (state: AssetPackWorkbenchState) => void;
  readonly downloadBlob?: (blob: Blob, filename: string) => void;
  readonly runtime?: AssetPackFormatRuntime;
  readonly confirmWebCliHandoff?: (message: string) => boolean;
  readonly handoffIdFactory?: () => string;
  readonly now?: () => string;
}

export interface AssetPackWebCliHandoffExportResult {
  readonly handoff: AssetWebCliHandoff;
  readonly archive: AssetPackAssembledResponse;
  readonly sidecarText: string;
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
  private readonly download: (blob: Blob, filename: string) => void;
  private readonly runtime: AssetPackFormatRuntime;
  private readonly confirmWebCliHandoff: (message: string) => boolean;
  private readonly handoffIdFactory: () => string;
  private readonly now: () => string;

  constructor(options: AssetPackWorkbenchControllerOptions) {
    this.baseline = options.baseline;
    this.workerFactory = options.workerFactory;
    this.onState = options.onState;
    this.download = options.downloadBlob ?? downloadBlob;
    this.runtime = options.runtime ?? createBrowserAssetPackFormatRuntime();
    this.confirmWebCliHandoff = options.confirmWebCliHandoff ?? ((message) =>
      typeof window !== 'undefined' ? window.confirm(message) : false);
    this.handoffIdFactory = options.handoffIdFactory ?? (() => {
      if (typeof globalThis.crypto?.randomUUID !== 'function') {
        throw new Error('Browser crypto.randomUUID is required for a Web-to-CLI handoff.');
      }
      return globalThis.crypto.randomUUID();
    });
    this.now = options.now ?? (() => new Date().toISOString());
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
    return resultPromise;
  }

  async downloadArchive(kind: AssetPackDownloadKind): Promise<AssetPackAssembledResponse> {
    const requestedRevision = this.currentState.revision;
    const result = await this.assemble(kind);
    if (result.type !== 'assembled') throw new Error('The Worker did not return an assembled archive.');
    if (result.revision !== requestedRevision || result.revision !== this.currentState.revision) {
      throw new Error('The Worker returned an archive for a stale revision.');
    }
    if (kind === 'formal') {
      const blockers = this.currentFormalBlockers();
      this.dispatch({ type: 'formal-blockers', blockers });
      if (blockers.length > 0) throw new AssetPackFormalAssemblyBlockedError(blockers);
      const candidate = this.currentState.workbench?.formalCandidate;
      if (!candidate || candidate.revision !== this.currentState.revision) {
        throw new Error('The current revision has no verified formal archive candidate.');
      }
      assertAssetPackDownloadMetadata(result, {
        revision: this.currentState.revision,
        kind,
        archiveDigest: candidate.archiveDigest,
      });
    } else {
      assertAssetPackDownloadMetadata(result, { revision: this.currentState.revision, kind });
    }
    downloadAssetPackArchive(result, this.download);
    this.dispatch({ type: 'downloaded', revision: result.revision });
    return result;
  }

  async exportForCli(
    kind: AssetPackDownloadKind,
  ): Promise<AssetPackWebCliHandoffExportResult | undefined> {
    const confirmed = this.confirmWebCliHandoff(
      `Export the current ${kind} archive and a local Web-to-CLI handoff sidecar for CLI review?\n\nThis creates two local files. It is not release approval.`,
    );
    if (!confirmed) return undefined;

    const requestedRevision = this.currentState.revision;
    const result = await this.assemble(kind);
    if (result.type !== 'assembled') throw new Error('The Worker did not return an assembled archive.');
    if (result.revision !== requestedRevision || result.revision !== this.currentState.revision) {
      throw new Error('The Worker returned an archive for a stale revision.');
    }
    if (kind === 'formal') {
      const blockers = this.currentFormalBlockers();
      this.dispatch({ type: 'formal-blockers', blockers });
      if (blockers.length > 0) throw new AssetPackFormalAssemblyBlockedError(blockers);
      const candidate = this.currentState.workbench?.formalCandidate;
      if (!candidate || candidate.revision !== this.currentState.revision) {
        throw new Error('The current revision has no verified formal archive candidate.');
      }
      assertAssetPackDownloadMetadata(result, {
        revision: this.currentState.revision,
        kind,
        archiveDigest: candidate.archiveDigest,
      });
    } else {
      assertAssetPackDownloadMetadata(result, { revision: this.currentState.revision, kind });
    }

    const inspected = await inspectAssetPackArchiveBytes({
      archiveBytes: new Uint8Array(result.archiveBytes),
      runtime: this.runtime,
    });
    if (inspected.kind !== 'verified') {
      throw new Error('The assembled archive could not be re-inspected as a verified asset pack.');
    }
    if (inspected.snapshot.archiveDigest !== result.archiveDigest) {
      throw new Error('The assembled archive digest changed before Web-to-CLI export.');
    }
    const workbench = this.currentState.workbench;
    if (!workbench?.releaseFingerprint) {
      throw new Error('The current revision has no release fingerprint for Web-to-CLI export.');
    }
    const metadata = await createAssetPackWebCliHandoffMetadata({
      snapshot: inspected.snapshot,
      archiveKind: kind,
      archiveFileName: result.filename,
      releaseFingerprint: workbench.releaseFingerprint,
      runtime: this.runtime,
    });
    const handoffBase = createAssetPackWebCliHandoffSnapshot({
      revision: requestedRevision,
      baselineReleaseTag: workbench.uploadMetadata.baselineReleaseTag,
      handoffId: this.handoffIdFactory(),
      createdAt: this.now(),
      stateDigest: 'sha256:'.concat('0'.repeat(64)) as AssetPackSha256,
      metadata,
    });
    const stateDigest = await this.runtime.sha256(
      this.runtime.encodeUtf8(assetWebCliHandoffStateDigestInput(handoffBase)),
    );
    const handoff = createAssetPackWebCliHandoffSnapshot({
      revision: requestedRevision,
      baselineReleaseTag: workbench.uploadMetadata.baselineReleaseTag,
      handoffId: handoffBase.handoffId,
      createdAt: handoffBase.createdAt,
      stateDigest,
      metadata,
    });
    if (this.currentState.revision !== requestedRevision) {
      throw new Error('The Workbench revision changed during Web-to-CLI export.');
    }

    const sidecarText = serializeAssetPackWebCliHandoff(handoff);
    const sidecarFilename = assetPackWebCliHandoffFilename({
      packId: metadata.packId,
      version: metadata.version,
      kind,
    });
    downloadAssetPackArchive(result, this.download);
    this.download(
      new Blob([this.runtime.encodeUtf8(sidecarText)], { type: 'application/json' }),
      sidecarFilename,
    );
    this.dispatch({ type: 'downloaded', revision: result.revision });
    return { handoff, archive: result, sidecarText };
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
  useEffect(() => {
    controller.setOnState(() => setStateVersion((version) => version + 1));
    return () => controller.dispose();
  }, [controller]);
  return {
    state: controller.state,
    upload: (file: File) => controller.upload(file),
    replaceManifest: (manifestText: string, origin: Extract<AssetPackAcceptedEditInput, { readonly kind: 'replace-manifest' }>['origin']) => controller.replaceManifest(manifestText, origin),
    replaceSource: (path: string, file: File) => controller.replaceSource(path, file),
    removeSource: (path: string) => controller.removeSource(path),
    assemble: (kind: 'draft' | 'formal') => controller.assemble(kind),
    download: (kind: AssetPackDownloadKind) => controller.downloadArchive(kind),
    exportForCli: (kind: AssetPackDownloadKind) => controller.exportForCli(kind),
    retry: () => controller.retry(),
    reset: () => controller.reset(),
    navigate: (panel: AssetPackWorkbenchPanel) => controller.navigate(panel),
  };
}
