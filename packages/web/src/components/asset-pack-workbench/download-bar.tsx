import type { AssetPackDownloadKind } from '../../lib/asset-pack-download';
import type { AssetPackWorkbenchState } from '../../slice/asset-pack-workbench';
import { Button } from '../ui/button';

const progressLabels: Readonly<Record<NonNullable<AssetPackWorkbenchState['progress']>['stage'], string>> = {
  'reading-archive': 'Reading archive',
  'inspecting-archive': 'Inspecting archive',
  'verifying-checksums': 'Verifying checksums',
  'inspecting-sources': 'Inspecting source files',
  'compiling-preview': 'Compiling preview',
  'assembling-archive': 'Assembling archive',
};

function downloadStatusText(state: AssetPackWorkbenchState): string {
  return state.progress
    ? progressLabels[state.progress.stage]
    : state.phase === 'empty'
      ? 'Waiting for an asset pack.'
      : state.phase === 'failed'
        ? state.error ?? 'Worker could not finish the current request.'
        : 'The Worker is ready for the next action.';
}

export interface AssetPackDownloadBarProps {
  readonly state: AssetPackWorkbenchState;
  readonly onDownload: (kind: AssetPackDownloadKind) => void;
  readonly onExportForCli?: (kind: AssetPackDownloadKind) => void;
  readonly confirmDraft?: (message: string) => boolean;
  readonly downloadError?: string;
}

export function draftDiagnosticConfirmationMessage(
  diagnostics: AssetPackWorkbenchState['diagnostics'],
): string {
  const details = diagnostics.length === 0
    ? 'No remaining diagnostics.'
    : diagnostics.map(({ severity, message }) => `- [${severity}] ${message}`).join('\n');
  return `Download the current draft archive?\n\nRemaining diagnostics:\n${details}`;
}

export function AssetPackDownloadBar({ state, onDownload, onExportForCli, confirmDraft, downloadError }: AssetPackDownloadBarProps) {
  const workbench = state.workbench;
  const diagnostics = state.diagnostics
    .filter(({ severity }) => severity === 'error' || severity === 'warning');
  const assembling = state.phase === 'assembling';
  const draftEnabled = Boolean(workbench?.draftSerializable) && !assembling;
  const formalEnabled = state.ready
    && workbench?.formalCandidate?.revision === state.revision
    && workbench.formalCandidate.archiveDigest !== undefined
    && !assembling;
  const confirm = confirmDraft ?? ((message: string) => typeof window === 'undefined' ? true : window.confirm(message));

  const downloadDraft = () => {
    if (!draftEnabled || !confirm(draftDiagnosticConfirmationMessage(diagnostics))) return;
    onDownload('draft');
  };

  return (
    <section aria-labelledby="asset-pack-download-heading" className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="asset-pack-download-heading" className="text-lg font-semibold text-text">Download archive</h2>
        <span role="status" aria-live="polite" className="text-xs text-text-mute">{downloadStatusText(state)}</span>
      </div>
      {downloadError && <p role="alert" className="mt-3 text-sm text-red-300">Download failed: {downloadError} Try again.</p>}
      {diagnostics.length > 0 && <div className="mt-3 text-sm text-text-2">
        <p>Remaining diagnostics before draft confirmation:</p>
        <ul aria-label="Remaining diagnostics" className="mt-1 list-disc pl-5">
          {diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${String(index)}`}>[{diagnostic.severity}] {diagnostic.message}</li>)}
        </ul>
      </div>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" variant="primary" disabled={!draftEnabled} onClick={downloadDraft}>Download draft archive</Button>
        <Button type="button" disabled={!formalEnabled} onClick={() => onDownload('formal')}>Download formal archive</Button>
      </div>
      {onExportForCli ? <div className="mt-4 rounded-lg border border-border-strong p-3">
        <p className="text-sm font-medium text-text">Export for CLI</p>
        <p className="mt-1 text-sm text-text-2">Creates a local handoff sidecar for the CLI. This is not release approval.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button type="button" disabled={!draftEnabled} onClick={() => onExportForCli('draft')}>Export draft for CLI</Button>
          <Button type="button" disabled={!formalEnabled} onClick={() => onExportForCli('formal')}>Export formal for CLI</Button>
        </div>
      </div> : null}
    </section>
  );
}
