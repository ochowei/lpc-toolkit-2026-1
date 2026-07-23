import { useAssetPackWorkbench } from '../../hooks/use-asset-pack-workbench';
import type { BrowserAssetPackBaseline } from '../../lib/asset-pack-baseline';
import type { AssetPackWorkerFactory } from '../../lib/asset-pack-worker-client';
import type { AssetPackWorkbenchPanel, AssetPackWorkbenchState } from '../../slice/asset-pack-workbench';
import { WorkbenchEditor } from './workbench-editor';
import { WorkbenchNav } from './workbench-nav';
import { WorkbenchPreview } from './workbench-preview';

export interface AssetPackWorkbenchShellProps {
  readonly state: AssetPackWorkbenchState;
  readonly onUpload: (file: File) => void;
  readonly onReset: () => void;
  readonly onBack: () => void;
  readonly onNavigate: (panel: AssetPackWorkbenchPanel) => void;
}

export function AssetPackWorkbenchShell({
  state,
  onUpload,
  onReset,
  onBack,
  onNavigate,
}: AssetPackWorkbenchShellProps) {
  return (
    <div className="min-h-screen bg-app text-text">
      <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <WorkbenchNav activePanel={state.activePanel} onNavigate={onNavigate} />
        <WorkbenchPreview state={state} onUpload={onUpload} onReset={onReset} onBack={onBack} />
        <WorkbenchEditor state={state} />
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
}: {
  readonly baseline: BrowserAssetPackBaseline;
  readonly onNavigateBack: () => void;
  readonly workerFactory?: AssetPackWorkerFactory;
}) {
  const workbench = useAssetPackWorkbench({ baseline, workerFactory });

  return (
    <AssetPackWorkbenchShell
      state={workbench.state}
      onUpload={(file) => void workbench.upload(file)}
      onReset={workbench.reset}
      onBack={onNavigateBack}
      onNavigate={workbench.navigate}
    />
  );
}
