import { useState } from 'react';
import type { AssetPackAdvancedProjection } from '../../lib/asset-pack-manifest-editor';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId } from './diagnostic-list';

export type ManifestJsonEditorMode = 'advanced' | 'raw-repair';

export interface ManifestJsonEditorProps {
  readonly mode: ManifestJsonEditorMode;
  readonly projection?: AssetPackAdvancedProjection;
  readonly manifestText: string;
  readonly diagnostics?: readonly AssetPackWorkbenchDiagnostic[] | undefined;
  readonly onSubmit: (manifestText: string, origin: 'advanced-json' | 'raw-repair') => void;
}

export function formatAdvancedProjection(projection: AssetPackAdvancedProjection): string {
  return `${JSON.stringify(projection, null, 2)}\n`;
}

export function rawRepairCanSubmit(currentText: string, nextText: string): boolean {
  const current = parseObject(currentText);
  const next = parseObject(nextText);
  if (!current || !next) return false;
  return canonical(current.acknowledgements) === canonical(next.acknowledgements);
}

export function ManifestJsonEditor({ mode, projection, manifestText, diagnostics = [], onSubmit }: ManifestJsonEditorProps) {
  const initialText = mode === 'advanced' && projection ? formatAdvancedProjection(projection) : manifestText;
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | undefined>();
  const title = mode === 'advanced' ? 'Advanced manifest fields' : 'Raw manifest repair';

  return (
    <section aria-labelledby="asset-pack-manifest-json-heading">
      <h3 id={diagnostics[0] ? diagnosticTargetId(diagnostics[0]) : 'asset-pack-manifest-json-heading'} className="text-lg font-semibold text-text">{title}</h3>
      <p className="mt-1 text-sm text-text-2">{mode === 'advanced' ? 'Edit only assets, replacements, and credit overrides.' : 'Repair the complete manifest while preserving acknowledgement governance.'}</p>
      <form className="mt-4 space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseObject(text);
        if (!parsed) {
          setError('Manifest must be a JSON object.');
          return;
        }
        if (mode === 'advanced' && (!isAdvancedProjection(parsed) || Object.keys(parsed).some((key) => !['assets', 'creditOverrides', 'replaces'].includes(key)))) {
          setError('Advanced JSON may contain only assets, replacements, and credit overrides.');
          return;
        }
        if (mode === 'raw-repair' && !rawRepairCanSubmit(manifestText, text)) {
          setError('Raw repair cannot change the acknowledgement array. Use Confirm on an individual warning.');
          return;
        }
        setError(undefined);
        onSubmit(`${text.endsWith('\n') ? text : `${text}\n`}`, mode === 'advanced' ? 'advanced-json' : 'raw-repair');
      }}>
        <label className="block text-sm text-text">Manifest JSON<textarea id={diagnostics.find((diagnostic) => diagnostic.path === 'asset-pack.json') ? diagnosticTargetId(diagnostics.find((diagnostic) => diagnostic.path === 'asset-pack.json')!) : undefined} aria-label={title} value={text} onChange={(event) => setText(event.currentTarget.value)} className="mt-1 min-h-64 w-full rounded border border-border bg-surface-2 px-2 py-1 font-mono text-xs" spellCheck={false} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white">Apply {mode === 'advanced' ? 'advanced fields' : 'repair'}</button>
      </form>
    </section>
  );
}

function parseObject(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
  } catch {
    return undefined;
  }
}

function isAdvancedProjection(value: Readonly<Record<string, unknown>>): boolean {
  return Array.isArray(value.assets);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) return `{${Object.entries(value as Readonly<Record<string, unknown>>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
