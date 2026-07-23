import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import type { AssetPackWorkbenchPanel } from '../../slice/asset-pack-workbench';

const scopePanels: Readonly<Record<AssetPackWorkbenchDiagnostic['scope'], AssetPackWorkbenchPanel>> = {
  archive: 'overview', manifest: 'manifest', source: 'sources', warning: 'warnings', credit: 'credits', release: 'overview',
};

export function assetPackDiagnosticPanel(diagnostic: AssetPackWorkbenchDiagnostic): AssetPackWorkbenchPanel {
  return scopePanels[diagnostic.scope];
}

export function diagnosticTargetId(diagnostic: AssetPackWorkbenchDiagnostic): string {
  return `asset-pack-target-${safeHash(`${diagnostic.scope}\u0000${diagnostic.code}\u0000${diagnostic.path ?? ''}`)}`;
}

export function DiagnosticList({ diagnostics, onSelect }: { readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[]; readonly onSelect: (diagnostic: AssetPackWorkbenchDiagnostic) => void }) {
  if (diagnostics.length === 0) return <p className="mt-4 text-sm text-text-2">No diagnostics for this revision.</p>;
  return <section aria-labelledby="asset-pack-diagnostics-heading" className="mt-6"><h3 id="asset-pack-diagnostics-heading" className="text-lg font-semibold text-text">Diagnostics</h3><div className="mt-3 space-y-2">{diagnostics.map((diagnostic) => <article key={`${diagnosticTargetId(diagnostic)}:${diagnostic.message}`} className="rounded border border-border bg-surface-2 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-text-mute">{diagnostic.severity} · {diagnostic.scope}</p><h4 className="mt-1 font-mono text-sm text-text">{diagnostic.code}</h4><p className="mt-1 text-sm text-text-2">{diagnostic.message}</p>{diagnostic.path && <p className="mt-1 break-all font-mono text-xs text-text-mute">{diagnostic.path}</p>}<button type="button" className="mt-2 text-xs font-semibold text-accent" onClick={() => onSelect(diagnostic)}>Go to {scopeLabel(assetPackDiagnosticPanel(diagnostic))}</button></article>)}</div></section>;
}

function scopeLabel(panel: AssetPackWorkbenchPanel): string {
  return panel.charAt(0).toUpperCase() + panel.slice(1);
}

function safeHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
