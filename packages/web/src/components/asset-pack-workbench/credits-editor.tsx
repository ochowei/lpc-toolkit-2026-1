import { useRef, useState } from 'react';
import type { AssetPackCreditsProjection } from '../../lib/asset-pack-manifest-editor';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId } from './diagnostic-list';

export interface CreditsEditorProps {
  readonly credits: AssetPackCreditsProjection;
  readonly onSubmit: (credits: AssetPackCreditsProjection) => void;
  readonly onNavigateOverrides: () => void;
  readonly diagnostics?: readonly AssetPackWorkbenchDiagnostic[] | undefined;
}

interface EditableRow { readonly id: string; readonly value: string }

export function CreditsEditor({ credits, onSubmit, onNavigateOverrides, diagnostics = [] }: CreditsEditorProps) {
  const sequence = useRef(credits.authors.length + credits.licenses.length + credits.urls.length);
  const [authors, setAuthors] = useState(() => rows('author', credits.authors, sequence));
  const [licenses, setLicenses] = useState(() => rows('license', credits.licenses, sequence));
  const [urls, setUrls] = useState(() => rows('url', credits.urls, sequence));
  const [notes, setNotes] = useState(credits.notes);
  const update = (kind: 'author' | 'license' | 'url', id: string, value: string) => {
    const setter = kind === 'author' ? setAuthors : kind === 'license' ? setLicenses : setUrls;
    setter((current) => current.map((row) => row.id === id ? { ...row, value } : row));
  };
  const add = (kind: 'author' | 'license' | 'url') => {
    const row = { id: `${kind}-${sequence.current}`, value: '' };
    sequence.current += 1;
    const setter = kind === 'author' ? setAuthors : kind === 'license' ? setLicenses : setUrls;
    setter((current) => [...current, row]);
  };
  const remove = (kind: 'author' | 'license' | 'url', id: string) => {
    const setter = kind === 'author' ? setAuthors : kind === 'license' ? setLicenses : setUrls;
    setter((current) => current.filter((row) => row.id !== id));
  };

  const target = diagnostics.find((diagnostic) => diagnostic.scope === 'credit');
  return <section aria-labelledby="asset-pack-credits-heading">
    <h3 id={target ? diagnosticTargetId(target) : 'asset-pack-credits-heading'} className="text-lg font-semibold text-text">Credits</h3>
    <p className="mt-1 text-sm text-text-2">Preserve the artist, license, and source attribution in the pack.</p>
    <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ authors: values(authors), licenses: values(licenses) as AssetPackCreditsProjection['licenses'], urls: values(urls), notes }); }}>
      <EditableList label="Authors" kind="author" rows={authors} onChange={update} onAdd={add} onRemove={remove} />
      <EditableList label="Licenses" kind="license" rows={licenses} onChange={update} onAdd={add} onRemove={remove} />
      <EditableList label="URLs" kind="url" rows={urls} onChange={update} onAdd={add} onRemove={remove} />
      <label className="block text-sm text-text">Notes<textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} className="mt-1 min-h-20 w-full rounded border border-border bg-surface-2 px-2 py-1" /></label>
      <div className="flex flex-wrap gap-2"><button type="submit" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-white">Save credits</button><button type="button" className="rounded border border-border px-3 py-2 text-sm text-text" onClick={onNavigateOverrides}>Credit overrides</button></div>
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
