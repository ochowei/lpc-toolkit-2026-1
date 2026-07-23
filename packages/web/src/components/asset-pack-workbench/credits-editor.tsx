import { useEffect, useRef, useState } from 'react';
import type { AssetPackCreditsProjection } from '../../lib/asset-pack-manifest-editor';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId, DiagnosticTarget } from './diagnostic-list';

export interface CreditsEditorProps {
  readonly credits: AssetPackCreditsProjection;
  readonly onSubmit: (credits: AssetPackCreditsProjection) => void;
  readonly onNavigateOverrides: () => void;
  readonly diagnostics?: readonly AssetPackWorkbenchDiagnostic[] | undefined;
  readonly revision?: number | undefined;
}

export interface CreditsDraftState {
  readonly credits: AssetPackCreditsProjection;
  readonly dirty: boolean;
}

export function synchronizeCreditsDraft(current: CreditsDraftState, nextCredits: AssetPackCreditsProjection): { readonly credits: AssetPackCreditsProjection; readonly conflict: boolean } {
  return current.dirty ? { credits: current.credits, conflict: true } : { credits: nextCredits, conflict: false };
}

interface EditableRow { readonly id: string; readonly value: string }

export function CreditsEditor({ credits, onSubmit, onNavigateOverrides, diagnostics = [], revision = 0 }: CreditsEditorProps) {
  const sequence = useRef(credits.authors.length + credits.licenses.length + credits.urls.length);
  const [authors, setAuthors] = useState(() => rows('author', credits.authors, sequence));
  const [licenses, setLicenses] = useState(() => rows('license', credits.licenses, sequence));
  const [urls, setUrls] = useState(() => rows('url', credits.urls, sequence));
  const [notes, setNotes] = useState(credits.notes);
  const dirty = useRef(false);
  const previousCreditsKey = useRef(JSON.stringify(credits));
  const [conflict, setConflict] = useState(false);
  const creditsKey = JSON.stringify(credits);
  useEffect(() => {
    if (previousCreditsKey.current === creditsKey) return;
    previousCreditsKey.current = creditsKey;
    const current: CreditsDraftState = { credits: { authors: values(authors), licenses: values(licenses) as AssetPackCreditsProjection['licenses'], urls: values(urls), notes }, dirty: dirty.current };
    const next = synchronizeCreditsDraft(current, credits);
    if (next.conflict) setConflict(true);
    else {
      sequence.current += 1;
      setAuthors(rows('author', next.credits.authors, sequence));
      setLicenses(rows('license', next.credits.licenses, sequence));
      setUrls(rows('url', next.credits.urls, sequence));
      setNotes(next.credits.notes);
    }
  // Serialized credits and revision props are the immutable Worker-approved inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditsKey, revision]);
  const update = (kind: 'author' | 'license' | 'url', id: string, value: string) => {
    dirty.current = true;
    const setter = kind === 'author' ? setAuthors : kind === 'license' ? setLicenses : setUrls;
    setter((current) => current.map((row) => row.id === id ? { ...row, value } : row));
  };
  const add = (kind: 'author' | 'license' | 'url') => {
    dirty.current = true;
    const row = { id: `${kind}-${sequence.current}`, value: '' };
    sequence.current += 1;
    const setter = kind === 'author' ? setAuthors : kind === 'license' ? setLicenses : setUrls;
    setter((current) => [...current, row]);
  };
  const remove = (kind: 'author' | 'license' | 'url', id: string) => {
    dirty.current = true;
    const setter = kind === 'author' ? setAuthors : kind === 'license' ? setLicenses : setUrls;
    setter((current) => current.filter((row) => row.id !== id));
  };

  return <section aria-labelledby="asset-pack-credits-heading">
    <h3 id="asset-pack-credits-heading" className="text-lg font-semibold text-text">Credits</h3>
    {diagnostics.map((diagnostic) => <DiagnosticTarget key={diagnosticTargetId(diagnostic)} diagnostic={diagnostic}><span className="sr-only">{diagnostic.message}</span></DiagnosticTarget>)}
    <p className="mt-1 text-sm text-text-2">Preserve the artist, license, and source attribution in the pack.</p>
    <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); if (conflict) return; dirty.current = false; onSubmit({ authors: values(authors), licenses: values(licenses) as AssetPackCreditsProjection['licenses'], urls: values(urls), notes }); }}>
      <EditableList label="Authors" kind="author" rows={authors} onChange={update} onAdd={add} onRemove={remove} />
      <EditableList label="Licenses" kind="license" rows={licenses} onChange={update} onAdd={add} onRemove={remove} />
      <EditableList label="URLs" kind="url" rows={urls} onChange={update} onAdd={add} onRemove={remove} />
      <label className="block text-sm text-text">Notes<textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} className="mt-1 min-h-20 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
      {conflict && <div className="rounded border border-red-700 p-2 text-sm text-red-700" role="alert">The Worker approved newer credits. Reload the current revision before saving.</div>}
      <div className="flex flex-wrap gap-2">{conflict && <button type="button" className="rounded border border-border px-3 py-2 text-sm text-text" onClick={() => { dirty.current = false; setConflict(false); setAuthors(rows('author', credits.authors, sequence)); setLicenses(rows('license', credits.licenses, sequence)); setUrls(rows('url', credits.urls, sequence)); setNotes(credits.notes); }}>Reload current revision</button>}<button type="submit" disabled={conflict} className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save credits</button><button type="button" className="rounded border border-border px-3 py-2 text-sm text-text" onClick={onNavigateOverrides}>Credit overrides</button></div>
    </form>
  </section>;
}

function EditableList({ label, kind, rows, onChange, onAdd, onRemove }: { readonly label: string; readonly kind: 'author' | 'license' | 'url'; readonly rows: readonly EditableRow[]; readonly onChange: (kind: 'author' | 'license' | 'url', id: string, value: string) => void; readonly onAdd: (kind: 'author' | 'license' | 'url') => void; readonly onRemove: (kind: 'author' | 'license' | 'url', id: string) => void }) {
  return <fieldset><legend className="text-sm font-semibold text-text">{label}</legend><div className="mt-2 space-y-2">{rows.map((row) => <div key={row.id} className="flex gap-2"><input aria-label={label.slice(0, -1)} value={row.value} onChange={(event) => onChange(kind, row.id, event.currentTarget.value)} className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm" /><button type="button" aria-label={`Remove ${label.slice(0, -1)}`} onClick={() => onRemove(kind, row.id)} className="rounded border border-border px-2 text-xs text-text">Remove</button></div>)}</div><button type="button" onClick={() => onAdd(kind)} className="mt-2 text-xs text-accent">Add {label.slice(0, -1).toLowerCase()}</button></fieldset>;
}

function rows(prefix: string, valuesToMap: readonly string[], sequence: { current: number }): EditableRow[] {
  return valuesToMap.map((value) => { const row = { id: `${prefix}-${sequence.current}`, value }; sequence.current += 1; return row; });
}

function values(rowsToMap: readonly EditableRow[]): string[] {
  return rowsToMap.map((row) => row.value);
}
