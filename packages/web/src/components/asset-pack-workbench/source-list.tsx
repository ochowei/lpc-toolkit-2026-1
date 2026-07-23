import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AssetPackSourceSummary } from '../../lib/asset-pack-worker-protocol';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId } from './diagnostic-list';

export interface SourceListProps {
  readonly summaries: readonly AssetPackSourceSummary[];
  readonly diagnostics?: readonly AssetPackWorkbenchDiagnostic[] | undefined;
  readonly onReplace: (path: string, file: File) => void;
  readonly onRemove: (path: string) => void;
}

export function SourceList({ summaries, diagnostics = [], onReplace, onRemove }: SourceListProps) {
  const [confirmingPath, setConfirmingPath] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const selectReplacement = (path: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.type !== 'image/png') {
      setError('Only PNG files can replace a source.');
      return;
    }
    setError(undefined);
    onReplace(path, file);
  };

  return (
    <section aria-labelledby="asset-pack-sources-heading">
      <h3 id="asset-pack-sources-heading" className="text-lg font-semibold text-text">Sources</h3>
      <p className="mt-1 text-sm text-text-2">The Worker verifies PNG signatures, dimensions, and content digests.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 space-y-3">{summaries.map((summary) => {
        const canRemove = !summary.referenced && summary.consumerCount === 0;
        const diagnostic = diagnostics.find((entry) => entry.path === summary.path);
        return <article id={diagnostic ? diagnosticTargetId(diagnostic) : undefined} key={summary.path} className="rounded border border-border bg-surface-2 p-3">
          <h4 className="break-all font-mono text-sm text-text">{summary.path}</h4>
          <p className="mt-1 text-xs text-text-2">{summary.consumerCount} consumers · {summary.width !== undefined && summary.height !== undefined ? `${String(summary.width)} × ${String(summary.height)}` : 'dimensions pending'} · {summary.digest ?? 'digest pending'}</p>
          <p className="mt-1 text-xs text-text-mute">State: {summary.state}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded border border-border px-2 py-1 text-xs text-text">Replace<input type="file" accept="image/png" className="sr-only" onChange={(event) => selectReplacement(summary.path, event)} /></label>
            {summary.state === 'missing' && <span className="text-xs text-text-2">Upload a PNG</span>}
            {canRemove && (confirmingPath === summary.path
              ? <button type="button" className="rounded border border-red-700 px-2 py-1 text-xs text-red-700" onClick={() => { onRemove(summary.path); setConfirmingPath(undefined); }}>Confirm removal</button>
              : <button type="button" className="rounded border border-border px-2 py-1 text-xs text-text" onClick={() => setConfirmingPath(summary.path)}>Remove</button>)}
          </div>
        </article>;
      })}</div>
    </section>
  );
}
