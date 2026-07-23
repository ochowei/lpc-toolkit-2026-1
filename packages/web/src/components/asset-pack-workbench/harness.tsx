import { useAssetPackWorkbench } from '../../hooks/use-asset-pack-workbench';
import type { BrowserAssetPackBaseline } from '../../lib/asset-pack-baseline';
import type { AssetPackWorkerFactory } from '../../lib/asset-pack-worker-client';
import type { AssetPackWorkbenchPanel, AssetPackWorkbenchState } from '../../slice/asset-pack-workbench';
import { WorkbenchEditor } from './workbench-editor';
import { WorkbenchNav } from './workbench-nav';
import { WorkbenchPreview } from './workbench-preview';
import type { AssetPackDownloadKind } from '../../lib/asset-pack-download';
import { useUnsavedWorkGuard, type NavigationBlocker } from '../../hooks/use-unsaved-work-guard';

export interface AssetPackWorkbenchShellProps {
  readonly baseline?: BrowserAssetPackBaseline;
  readonly state: AssetPackWorkbenchState;
  readonly onUpload: (file: File) => void;
  readonly onReset: () => void;
  readonly onBack: () => void;
  readonly onNavigate: (panel: AssetPackWorkbenchPanel) => void;
  readonly onReplaceManifest?: (manifestText: string, origin: 'overview-form' | 'credits-form' | 'advanced-json' | 'raw-repair' | 'acknowledgement') => void;
  readonly onReplaceSource?: (path: string, file: File) => void;
  readonly onRemoveSource?: (path: string) => void;
  readonly onDownload?: (kind: AssetPackDownloadKind) => void;
}

export function AssetPackWorkbenchShell({
  baseline,
  state,
  onUpload,
  onReset,
  onBack,
  onNavigate,
  onReplaceManifest,
  onReplaceSource,
  onRemoveSource,
  onDownload,
}: AssetPackWorkbenchShellProps) {
  return (
    <div className="min-h-screen bg-app text-text">
      <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <WorkbenchNav activePanel={state.activePanel} onNavigate={onNavigate} />
        <WorkbenchPreview {...(baseline ? { baseline } : {})} state={state} onUpload={onUpload} onReset={onReset} onBack={onBack} onDownload={onDownload ?? (() => undefined)} />
        <WorkbenchEditor state={state} onReplaceManifest={onReplaceManifest} onReplaceSource={onReplaceSource} onRemoveSource={onRemoveSource} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

const defaultWorkerFactory: AssetPackWorkerFactory = () => {
  const worker = new Worker(new URL('../../workers/asset-pack-worker.ts', import.meta.url), { type: 'module' });
  return {
    postMessage: (message, transfer) => worker.postMessage(message, transfer ?? []),
    addEventListener: worker.addEventListener.bind(worker),
    removeEventListener: worker.removeEventListener.bind(worker),
    terminate: () => worker.terminate(),
  };
};

export function AssetPackWorkbenchHarness({
  baseline,
  onNavigateBack,
  workerFactory = defaultWorkerFactory,
  registerNavigationBlocker,
  confirmNavigation,
}: {
  readonly baseline: BrowserAssetPackBaseline;
  readonly onNavigateBack: () => void;
  readonly workerFactory?: AssetPackWorkerFactory;
  readonly registerNavigationBlocker?: (blocker: NavigationBlocker) => () => void;
  readonly confirmNavigation?: (message: string) => boolean;
}) {
  const workbench = useAssetPackWorkbench({ baseline, workerFactory });
  useUnsavedWorkGuard({
    currentRevision: workbench.state.revision,
    ...(workbench.state.latestDownloadedRevision !== undefined ? { latestDownloadedRevision: workbench.state.latestDownloadedRevision } : {}),
    ...(registerNavigationBlocker ? { registerBlocker: registerNavigationBlocker } : {}),
    ...(confirmNavigation ? { confirmNavigation } : {}),
  });

  return (
    <AssetPackWorkbenchShell
      baseline={baseline}
      state={workbench.state}
      onUpload={(file) => void workbench.upload(file)}
      onReset={workbench.reset}
      onBack={onNavigateBack}
      onNavigate={workbench.navigate}
      onReplaceManifest={(manifestText, origin) => void workbench.replaceManifest(manifestText, origin)}
      onReplaceSource={(path, file) => void workbench.replaceSource(path, file)}
      onRemoveSource={(path) => void workbench.removeSource(path)}
      onDownload={(kind) => void workbench.download(kind)}
    />
  );
}
