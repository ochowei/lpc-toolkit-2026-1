import { useEffect, useRef, useState } from 'react';
import type { AssetPackOverviewProjection } from '../../lib/asset-pack-manifest-editor';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId, DiagnosticTarget } from './diagnostic-list';

export interface OverviewEditorProps {
  readonly projection: AssetPackOverviewProjection;
  readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[];
  readonly revision?: number | undefined;
  readonly onSubmit: (projection: AssetPackOverviewProjection) => void;
}

export interface OverviewDraft {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly minimumCliVersion: string;
  readonly requiredCapabilities: string;
}

export function synchronizeOverviewDraft(current: OverviewDraft, projection: AssetPackOverviewProjection, dirtyFields: ReadonlySet<keyof OverviewDraft>): OverviewDraft {
  const next: OverviewDraft = {
    id: projection.id,
    displayName: projection.displayName,
    version: projection.version,
    minimumCliVersion: projection.compatibility?.minimumCliVersion ?? '',
    requiredCapabilities: projection.compatibility?.requiredCapabilities?.join(', ') ?? '',
  };
  return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, dirtyFields.has(key as keyof OverviewDraft) ? current[key as keyof OverviewDraft] : value])) as OverviewDraft;
}

export function OverviewEditor({ projection, diagnostics, revision = 0, onSubmit }: OverviewEditorProps) {
  const [id, setId] = useState(projection.id);
  const [displayName, setDisplayName] = useState(projection.displayName);
  const [version, setVersion] = useState(projection.version);
  const [minimumCliVersion, setMinimumCliVersion] = useState(projection.compatibility?.minimumCliVersion ?? '');
  const [requiredCapabilities, setRequiredCapabilities] = useState(projection.compatibility?.requiredCapabilities?.join(', ') ?? '');
  const dirtyFields = useRef<Set<keyof OverviewDraft>>(new Set());
  const projectionKey = JSON.stringify(projection);
  useEffect(() => {
    const current = { id, displayName, version, minimumCliVersion, requiredCapabilities };
    const next = synchronizeOverviewDraft(current, projection, dirtyFields.current);
    if (!dirtyFields.current.has('id')) setId(next.id);
    if (!dirtyFields.current.has('displayName')) setDisplayName(next.displayName);
    if (!dirtyFields.current.has('version')) setVersion(next.version);
    if (!dirtyFields.current.has('minimumCliVersion')) setMinimumCliVersion(next.minimumCliVersion);
    if (!dirtyFields.current.has('requiredCapabilities')) setRequiredCapabilities(next.requiredCapabilities);
  // The serialized projection and revision are the immutable Worker-approved inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectionKey, revision]);
  const relevantDiagnostics = diagnostics.filter((diagnostic) => diagnostic.scope === 'archive' || diagnostic.scope === 'release' || diagnostic.scope === 'manifest');

  return (
    <section aria-labelledby="asset-pack-overview-heading">
      <h3 id="asset-pack-overview-heading" className="text-lg font-semibold text-text">Overview</h3>
      <p className="mt-1 text-sm text-text-2">Correct the pack identity and runtime compatibility metadata.</p>
      <form
        className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const capabilities = requiredCapabilities.split(',').map((value) => value.trim()).filter(Boolean);
            dirtyFields.current.clear();
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
        <label className="block text-sm text-text">Pack ID<input name="id" value={id} onChange={(event) => { dirtyFields.current.add('id'); setId(event.currentTarget.value); }} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Display name<input name="displayName" value={displayName} onChange={(event) => { dirtyFields.current.add('displayName'); setDisplayName(event.currentTarget.value); }} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Version<input name="version" value={version} onChange={(event) => { dirtyFields.current.add('version'); setVersion(event.currentTarget.value); }} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Minimum CLI version<input name="minimumCliVersion" value={minimumCliVersion} onChange={(event) => { dirtyFields.current.add('minimumCliVersion'); setMinimumCliVersion(event.currentTarget.value); }} className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <label className="block text-sm text-text">Required capabilities<textarea name="requiredCapabilities" value={requiredCapabilities} onChange={(event) => { dirtyFields.current.add('requiredCapabilities'); setRequiredCapabilities(event.currentTarget.value); }} className="mt-1 min-h-16 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
        <button type="submit" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white">Save overview</button>
      </form>
      {relevantDiagnostics.length > 0 && <div className="mt-4 space-y-2" aria-label="Overview diagnostics">{relevantDiagnostics.map((diagnostic) => { const content = <p className="rounded border border-border p-2 text-sm text-text-2"><span className="font-semibold">{diagnostic.code}</span>: {diagnostic.message}</p>; return diagnostic.scope === 'manifest' ? <div key={diagnosticTargetId(diagnostic)}>{content}</div> : <DiagnosticTarget key={diagnosticTargetId(diagnostic)} diagnostic={diagnostic}>{content}</DiagnosticTarget>; })}</div>}
    </section>
  );
}
