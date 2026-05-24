import { useState } from 'react';
import type { Catalog, TypeName } from '@lpc-toolkit/core';
import type { SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';

interface Props {
  catalog: Catalog;
  dispatch: (a: SliceAction) => void;
  inactive: TypeName[];
  t: Translator;
  tl: LabelTranslator;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onAdded: (tn: TypeName) => void;
}

export function AddLayer({ catalog, dispatch, inactive, t, tl, adding, setAdding, onAdded }: Props) {
  const [query, setQuery] = useState('');

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
      >
        <span>＋</span>
        <span>{t('add.button')}</span>
        <span className="ml-auto font-mono text-[10px]">
          {inactive.length} {t('add.available')}
        </span>
      </button>
    );
  }

  const filtered = inactive.filter((tn) => {
    if (!query) return true;
    const label = tl.category(tn).toLowerCase();
    return label.includes(query.toLowerCase());
  });

  return (
    <div className="mt-2 mb-2 rounded-md border border-border bg-app p-2">
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-[11px]"
        />
        <button
          type="button"
          onClick={() => { setAdding(false); setQuery(''); }}
          className="rounded px-2 py-1 text-[11px] text-text-mute hover:bg-surface-2"
        >
          {t('common.close')}
        </button>
      </div>
      <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto">
        {filtered.map((tn) => {
          const first = catalog.byTypeName.get(tn)?.[0];
          return (
            <button
              key={tn}
              type="button"
              disabled={!first}
              onClick={() => {
                if (!first) return;
                dispatch({ type: 'pick', typeName: tn, name: first.name });
                setAdding(false);
                setQuery('');
                onAdded(tn);
              }}
              className="flex items-center justify-between rounded border border-border bg-surface-2 px-2 py-1 text-left text-[11px] hover:bg-surface-3"
            >
              <span>{tl.category(tn)}</span>
              <span className="text-text-mute">{first?.name ?? '—'}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-text-mute">No matches.</div>
        )}
      </div>
    </div>
  );
}
