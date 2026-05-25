import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Catalog,
  PaletteMetadata,
  TypeName,
} from '@lpc-toolkit/core';
import { pickActionForItem, type SliceState, type SliceAction } from '../../slice/selection';
import type { AssetSource } from '../../adapter/asset-source';
import type { LabelTranslator, Translator } from '../../i18n';
import {
  itemMatchesLicenseFilter,
  licenseExceedsFilter,
  type LicenseFilter,
} from '../../slice/license-filter';
import { filterAndRankPaletteItems } from './palette-search';
import { ItemThumbnail } from './item-thumbnail';

const RESULT_LIMIT = 60;

interface Props {
  open: boolean;
  onClose: () => void;
  onPicked: (typeName: TypeName) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  palettes: PaletteMetadata;
  assetSource: AssetSource;
  shownTypeNames: TypeName[];
  licenseFilter: LicenseFilter;
  t: Translator;
  tl: LabelTranslator;
}

export function AdvancedPalette({
  open, onClose, onPicked, state, dispatch, catalog, palettes,
  assetSource, shownTypeNames, licenseFilter, t, tl,
}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when opening; clear query when closing so a stale
  // search from the previous session doesn't surprise the user on reopen.
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(
    () => filterAndRankPaletteItems({
      catalog, bodyType: state.bodyType, query, shownTypeNames,
    }),
    [catalog, state.bodyType, query, shownTypeNames],
  );
  const shown = results.slice(0, RESULT_LIMIT);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-50 flex justify-center bg-black/55 pt-16 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[520px] w-[640px] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-text-mute">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="flex-1 bg-transparent text-sm text-text outline-none"
          />
          {licenseFilter && (
            <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
              ≤ {licenseFilter}
            </span>
          )}
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
            ESC
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-text-mute">
              {t('palette.no_match')}
            </div>
          ) : (
            shown.map(({ typeName, item, supports }, i) => {
              const matchesFilter = itemMatchesLicenseFilter(item, licenseFilter);
              const exceeded = !matchesFilter;
              const active = state.selections[typeName]?.name === item.name;
              const itemLicense = item.credits[0]?.licenses[0];
              const isExceededByLicense =
                exceeded && itemLicense && licenseExceedsFilter(itemLicense, licenseFilter);
              return (
                <button
                  key={`${typeName}:${item.name}`}
                  type="button"
                  disabled={!supports}
                  title={!supports ? t('palette.incompatible') : item.name}
                  onClick={() => {
                    if (!supports) return;
                    dispatch(pickActionForItem(typeName, item));
                    onPicked(typeName);
                  }}
                  className={[
                    'flex w-full items-center gap-3 px-3 py-2 text-left',
                    i > 0 ? 'border-t border-border' : '',
                    !supports
                      ? 'cursor-not-allowed opacity-35'
                      : exceeded
                        ? 'opacity-65 hover:bg-surface-2'
                        : 'hover:bg-surface-2',
                  ].join(' ')}
                >
                  <ItemThumbnail
                    typeName={typeName}
                    name={item.name}
                    size={24}
                    bodyType={state.bodyType}
                    catalog={catalog}
                    palettes={palettes}
                    assetSource={assetSource}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      {tl.itemName(item.name)}
                      {!supports && (
                        <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase tracking-wide text-amber-500">
                          {t('palette.incompatible')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-text-mute">
                      {tl.category(typeName)}
                      {itemLicense && <> · {itemLicense}</>}
                    </div>
                  </div>
                  {isExceededByLicense && <span className="text-danger">⚠</span>}
                  {active && <span className="text-accent">✓</span>}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-text-dim">
          <span><span className="font-mono">esc</span> close</span>
          <span className="ml-auto">{shown.length} of {results.length}</span>
        </div>
      </div>
    </div>
  );
}
