import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import type { AssetPackWorkbenchPanel } from '../../slice/asset-pack-workbench';
import type { ReactNode } from 'react';

const scopePanels: Readonly<Record<AssetPackWorkbenchDiagnostic['scope'], AssetPackWorkbenchPanel>> = {
  archive: 'overview', manifest: 'manifest', source: 'sources', warning: 'warnings', credit: 'credits', release: 'overview',
};

export function assetPackDiagnosticPanel(diagnostic: AssetPackWorkbenchDiagnostic): AssetPackWorkbenchPanel {
  return scopePanels[diagnostic.scope];
}

export function diagnosticTargetId(diagnostic: AssetPackWorkbenchDiagnostic): string {
  return `asset-pack-target-${safeHash(diagnosticIdentity(diagnostic))}`;
}

export function diagnosticPanelTargetId(diagnostic: AssetPackWorkbenchDiagnostic): string {
  return `${diagnosticTargetId(diagnostic)}-panel`;
}

export function DiagnosticTarget({ diagnostic, children }: { readonly diagnostic: AssetPackWorkbenchDiagnostic; readonly children?: ReactNode }) {
  return <div id={diagnosticPanelTargetId(diagnostic)} tabIndex={-1} aria-label={`Corrective target for ${diagnostic.code}`}>{children}</div>;
}

export function DiagnosticList({ diagnostics, error, onSelect }: { readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[]; readonly error?: string | undefined; readonly onSelect: (diagnostic: AssetPackWorkbenchDiagnostic) => void }) {
  if (diagnostics.length === 0) return <section aria-label="Diagnostics" className="mt-6">{error && <p role="alert" className="rounded border border-red-700 p-2 text-sm text-red-700">{error}</p>}<p className="mt-4 text-sm text-text-2">No diagnostics for this revision.</p></section>;
  return <section aria-labelledby="asset-pack-diagnostics-heading" className="mt-6"><h3 id="asset-pack-diagnostics-heading" className="text-lg font-semibold text-text">Diagnostics</h3>{error && <p role="alert" className="mt-2 rounded border border-red-700 p-2 text-sm text-red-700">{error}</p>}<div className="mt-3 space-y-2">{diagnostics.map((diagnostic) => <article id={diagnosticTargetId(diagnostic)} key={`${diagnosticTargetId(diagnostic)}:${diagnostic.message}`} tabIndex={-1} className="rounded border border-border bg-surface-2 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-text-mute">{diagnostic.severity} · {diagnostic.scope}</p><h4 className="mt-1 font-mono text-sm text-text">{diagnostic.code}</h4><p className="mt-1 text-sm text-text-2">{diagnostic.message}</p>{diagnostic.path && <p className="mt-1 break-all font-mono text-xs text-text-mute">{diagnostic.path}</p>}<button type="button" className="mt-2 text-xs font-semibold text-accent" onClick={() => onSelect(diagnostic)}>Go to {scopeLabel(assetPackDiagnosticPanel(diagnostic))}</button></article>)}</div></section>;
}

function scopeLabel(panel: AssetPackWorkbenchPanel): string {
  return panel.charAt(0).toUpperCase() + panel.slice(1);
}

function safeHash(value: string): string {
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

function diagnosticIdentity(diagnostic: AssetPackWorkbenchDiagnostic): string {
  return canonical({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    scope: diagnostic.scope,
    path: diagnostic.path,
    subject: diagnostic.subject,
    details: diagnostic.details,
  });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) return `{${Object.entries(value as Readonly<Record<string, unknown>>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
