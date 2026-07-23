import { useState } from 'react';
import type { AssetPackOverviewProjection } from '../../lib/asset-pack-manifest-editor';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId } from './diagnostic-list';

export interface OverviewEditorProps {
  readonly projection: AssetPackOverviewProjection;
  readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[];
  readonly onSubmit: (projection: AssetPackOverviewProjection) => void;
}

export function OverviewEditor({ projection, diagnostics, onSubmit }: OverviewEditorProps) {
  const [id, setId] = useState(projection.id);
  const [displayName, setDisplayName] = useState(projection.displayName);
  const [version, setVersion] = useState(projection.version);
  const [minimumCliVersion, setMinimumCliVersion] = useState(projection.compatibility?.minimumCliVersion ?? '');
  const [requiredCapabilities, setRequiredCapabilities] = useState(projection.compatibility?.requiredCapabilities?.join(', ') ?? '');
  const relevantDiagnostics = diagnostics.filter((diagnostic) => diagnostic.scope === 'manifest' || diagnostic.scope === 'release');
  const targetFor = (path: string): string | undefined => {
    const diagnostic = relevantDiagnostics.find((entry) => entry.path === path);
    return diagnostic ? diagnosticTargetId(diagnostic) : undefined;
  };

  return (
    <section aria-labelledby="asset-pack-overview-heading">
      <h3 id={relevantDiagnostics[0] ? diagnosticTargetId(relevantDiagnostics[0]) : 'asset-pack-overview-heading'} className="text-lg font-semibold text-text">Overview</h3>
      <p className="mt-1 text-sm text-text-2">Correct the pack identity and runtime compatibility metadata.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const capabilities = requiredCapabilities.split(',').map((value) => value.trim()).filter(Boolean);
          onSubmit({
            id: id.trim(),
            displayName: displayName.trim(),
            version: version.trim(),
            ...(minimumCliVersion.trim() || capabilities.length > 0
              ? { compatibility: { ...(minimumCliVersion.trim() ? { minimumCliVersion: minimumCliVersion.trim() } : {}), ...(capabilities.length > 0 ? { requiredCapabilities: capabilities } : {}) } }
              : {}),
          });
        }}
      >
        <label className="block text-sm text-text">Pack ID<input id={targetFor('id')} name="id" value={id} onChange={(event) => setId(event.currentTarget.value)} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Display name<input id={targetFor('displayName')} name="displayName" value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Version<input id={targetFor('version')} name="version" value={version} onChange={(event) => setVersion(event.currentTarget.value)} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Minimum CLI version<input id={targetFor('compatibility.minimumCliVersion')} name="minimumCliVersion" value={minimumCliVersion} onChange={(event) => setMinimumCliVersion(event.currentTarget.value)} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Required capabilities<textarea id={targetFor('compatibility.requiredCapabilities')} name="requiredCapabilities" value={requiredCapabilities} onChange={(event) => setRequiredCapabilities(event.currentTarget.value)} className="mt-1 min-h-16 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <button type="submit" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white">Save overview</button>
      </form>
      {relevantDiagnostics.length > 0 && <div className="mt-4 space-y-2" aria-label="Overview diagnostics">{relevantDiagnostics.map((diagnostic) => <p key={`${diagnostic.code}:${diagnostic.path ?? ''}`} className="rounded border border-border p-2 text-sm text-text-2"><span className="font-semibold">{diagnostic.code}</span>: {diagnostic.message}</p>)}</div>}
    </section>
  );
}
