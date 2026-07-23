import type { CreditsManifest, License } from '@lpc-toolkit/core';

export interface AttributionPanelProps {
  readonly credits: CreditsManifest | null;
  readonly effectiveLicense: License | null;
  readonly releaseTag: string;
  readonly error?: string | null;
}

export function AttributionPanel({
  credits,
  effectiveLicense,
  releaseTag,
  error,
}: AttributionPanelProps) {
  return (
    <section aria-label="Asset pack attribution" className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Attribution</h2>
        <span className="text-xs text-text-mute">Official base: {releaseTag}</span>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      {credits && !error ? (
        <div className="mt-3 space-y-4 text-sm text-text-2">
          <p>Effective license: <span className="font-medium text-text">{effectiveLicense ?? 'Unavailable'}</span></p>
          <ul className="space-y-3">
            {credits.entries.map((entry) => (
              <li key={entry.file} className="rounded-lg border border-border p-3">
                <p className="font-medium text-text">{entry.authors.join(', ') || 'Unknown author'}</p>
                <p>License: {entry.licenses.join(', ') || 'Unavailable'}</p>
                <p>Path: {entry.file}</p>
                {entry.notes ? <p>Notes: {entry.notes}</p> : null}
                {entry.urls.length > 0 ? (
                  <ul aria-label="Credit URLs">
                    {entry.urls.map((url) => <li key={url}><a className="underline" href={url}>{url}</a></li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {credits.resolvedPaths.length > 0 ? (
            <p>Resolved paths: {credits.resolvedPaths.join(', ')}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
