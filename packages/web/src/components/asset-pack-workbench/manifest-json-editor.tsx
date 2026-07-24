import { useEffect, useRef, useState } from 'react';
import type { AssetPackAdvancedProjection } from '../../lib/asset-pack-manifest-editor';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId, DiagnosticTarget } from './diagnostic-list';

export type ManifestJsonEditorMode = 'advanced' | 'raw-repair';

export interface ManifestJsonEditorProps {
  readonly mode: ManifestJsonEditorMode;
  readonly projection?: AssetPackAdvancedProjection | undefined;
  readonly manifestText: string;
  readonly diagnostics?: readonly AssetPackWorkbenchDiagnostic[] | undefined;
  readonly revision?: number | undefined;
  readonly onSubmit: (manifestText: string, origin: 'advanced-json' | 'raw-repair') => void;
}

export function formatAdvancedProjection(projection: AssetPackAdvancedProjection): string {
  return `${JSON.stringify(projection, null, 2)}\n`;
}

export function rawRepairCanSubmit(currentText: string, nextText: string): boolean {
  const current = parseObject(currentText);
  const next = parseObject(nextText);
  if (!next) return false;
  if (!current) return !Object.prototype.hasOwnProperty.call(next, 'acknowledgements');
  const currentHasAcknowledgements = Object.prototype.hasOwnProperty.call(current, 'acknowledgements');
  const nextHasAcknowledgements = Object.prototype.hasOwnProperty.call(next, 'acknowledgements');
  return currentHasAcknowledgements === nextHasAcknowledgements
    && (!currentHasAcknowledgements || canonical(current.acknowledgements) === canonical(next.acknowledgements));
}

export function synchronizeManifestDraft(text: string, nextText: string, dirty: boolean): { readonly text: string; readonly conflict: boolean } {
  return dirty ? { text, conflict: true } : { text: nextText, conflict: false };
}

export function ManifestJsonEditor({ mode, projection, manifestText, diagnostics = [], revision = 0, onSubmit }: ManifestJsonEditorProps) {
  const initialText = mode === 'advanced' && projection ? formatAdvancedProjection(projection) : manifestText;
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState(false);
  const dirty = useRef(false);
  const previousMode = useRef(mode);
  const previousInitialText = useRef(initialText);
  const title = mode === 'advanced' ? 'Advanced manifest fields' : 'Raw manifest repair';

  useEffect(() => {
    if (previousMode.current !== mode) {
      previousMode.current = mode;
      previousInitialText.current = initialText;
      dirty.current = false;
      setConflict(false);
      setError(undefined);
      setText(initialText);
      return;
    }
    if (previousInitialText.current === initialText) return;
    previousInitialText.current = initialText;
    const next = synchronizeManifestDraft(text, initialText, dirty.current);
    if (next.conflict) setConflict(true);
    else setText(next.text);
  }, [initialText, mode, revision, text]);

  return (
    <section aria-labelledby="asset-pack-manifest-json-heading">
      <h3 id="asset-pack-manifest-json-heading" className="text-lg font-semibold text-text">{title}</h3>
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
        if (conflict) {
          setError('The Worker approved a newer revision. Reload the current manifest before applying this draft.');
          return;
        }
        if (mode === 'raw-repair' && !rawRepairCanSubmit(manifestText, text)) {
          setError('Raw repair cannot change the acknowledgement array. Use Confirm on an individual warning.');
          return;
        }
        setError(undefined);
        dirty.current = false;
        onSubmit(`${text.endsWith('\n') ? text : `${text}\n`}`, mode === 'advanced' ? 'advanced-json' : 'raw-repair');
      }}>
        {diagnostics.map((diagnostic) => <DiagnosticTarget key={diagnosticTargetId(diagnostic)} diagnostic={diagnostic}><span className="sr-only">{diagnostic.message}</span></DiagnosticTarget>)}
        <label className="block text-sm text-text">Manifest JSON<textarea aria-label={title} value={text} onChange={(event) => { dirty.current = true; setText(event.currentTarget.value); }} className="mt-1 min-h-64 w-full rounded border border-border bg-surface-2 px-2 py-1 font-mono text-xs" spellCheck={false} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {conflict && <button type="button" className="rounded border border-border px-3 py-2 text-xs text-text" onClick={() => { dirty.current = false; setConflict(false); setError(undefined); setText(initialText); }}>Reload current revision</button>}
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
