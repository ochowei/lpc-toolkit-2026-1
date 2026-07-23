import type { AssetPackWorkbenchState } from '../../slice/asset-pack-workbench';
import { AssetPackUploadPanel } from './upload-panel';

const progressLabels: Readonly<Record<NonNullable<AssetPackWorkbenchState['progress']>['stage'], string>> = {
  'reading-archive': 'Reading archive',
  'inspecting-archive': 'Inspecting archive',
  'verifying-checksums': 'Verifying checksums',
  'inspecting-sources': 'Inspecting source files',
  'compiling-preview': 'Compiling preview',
  'assembling-archive': 'Assembling archive',
};

export function workerProgressText(state: AssetPackWorkbenchState): string {
  return state.progress
    ? progressLabels[state.progress.stage]
    : state.phase === 'empty'
      ? 'Waiting for an asset pack.'
      : state.phase === 'failed'
        ? state.error ?? 'Worker could not finish the current request.'
        : 'The Worker is ready for the next action.';
}

function statusIcon(state: AssetPackWorkbenchState): string {
  if (state.phase === 'failed' || state.phase === 'unsafe') return '⚠';
  if (state.phase === 'editing') return '✓';
  return '◌';
}

export function WorkbenchPreview({
  state,
  onUpload,
  onReset,
  onBack,
}: {
  readonly state: AssetPackWorkbenchState;
  readonly onUpload: (file: File) => void;
  readonly onReset: () => void;
  readonly onBack: () => void;
}) {
  const sourceCount = state.workbench?.sourceSummaries.length ?? 0;
  const diagnosticCount = state.workbench?.diagnostics.length ?? state.diagnostics.length;

  return (
    <main aria-label="Asset pack preview" className="min-w-0 bg-app p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">LPC Toolkit</p>
            <h1 className="mt-2 text-3xl font-semibold text-text">Asset Pack Workbench</h1>
            <p className="mt-2 text-sm text-text-2">Repair a pack locally, preserve its attribution, and assemble a new archive when it is ready.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm text-text-2">
            <span aria-hidden="true">{statusIcon(state)}</span>
            <span>{sourceCount} sources · {diagnosticCount} diagnostics</span>
          </div>
        </div>
        <div className="mt-6">
          <AssetPackUploadPanel
            currentFile={state.originalFile}
            phase={state.phase}
            progressText={workerProgressText(state)}
            onUpload={onUpload}
            onReset={onReset}
            onBack={onBack}
          />
        </div>
      </div>
    </main>
  );
}
