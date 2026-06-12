import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  LICENSE_GROUP_ORDER,
  type Catalog,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { pickActionForItem, type SliceState, type SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';
import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
import { filterAndRankPaletteItems, type PaletteResult } from './palette-search';
import { ItemThumbnail } from './item-thumbnail';
import {
  nextActiveIndex,
  pickIndexForEnter,
} from './sidebar-search-keyboard';

const RESULT_LIMIT = 60;

interface Props {
  disabled: boolean;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  shownTypeNames: TypeName[];
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  t: Translator;
  tl: LabelTranslator;
  onPicked: (typeName: TypeName) => void;
  inputRef: RefObject<HTMLInputElement>;
}

/** Search box and keyboard-driven dropdown for adding/replacing catalog items. */
export function SidebarSearch({
  disabled,
  catalog,
  palettes,
  state,
  dispatch,
  shownTypeNames,
  licenseFilter,
  animationFilter,
  t,
  tl,
  onPicked,
  inputRef,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(
    () =>
      filterAndRankPaletteItems({
        catalog,
        bodyType: state.bodyType,
        query: deferredQuery,
        shownTypeNames,
      }),
    [catalog, state.bodyType, deferredQuery, shownTypeNames],
  );
  const shown = results.slice(0, RESULT_LIMIT);

  // Use `query` (not `deferredQuery`) so the dropdown opens/closes in lockstep
  // with what the user typed. Filtering results stays deferred via the useMemo
  // on `deferredQuery`, which keeps typing responsive on large catalogs.
  const showDropdown = query.trim().length > 0 && isFocused;

  useEffect(() => {
    if (!showDropdown) return;
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, showDropdown]);

  useEffect(() => {
    if (!isFocused) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target || !containerRef.current) return;
      if (!containerRef.current.contains(target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isFocused]);

  useEffect(() => {
    if (!disabled) return;
    setIsFocused(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, [disabled, inputRef]);

  function onPick(result: PaletteResult) {
    if (disabled || !result.supports) return;
    dispatch(pickActionForItem(result.typeName, result.item));
    const customAnim = result.item.layer_1?.custom_animation ||
                       result.item.layer_2?.custom_animation ||
                       result.item.layer_3?.custom_animation ||
                       result.item.layer_4?.custom_animation;
    if (customAnim) {
      dispatch({ type: 'set_anim', anim: customAnim });
    }
    onPicked(result.typeName);
    setQuery('');
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showDropdown) {
        setQuery('');
        setActiveIndex(-1);
      } else {
        inputRef.current?.blur();
      }
      return;
    }
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((curr) => nextActiveIndex(curr, 'ArrowDown', shown.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((curr) => nextActiveIndex(curr, 'ArrowUp', shown.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = pickIndexForEnter(activeIndex, shown.length);
      if (idx === null) return;
      const pick = shown[idx];
      if (pick) onPick(pick);
    }
  }

  return (
    <div ref={containerRef} className="relative px-2 pt-2 pb-1">
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5">
        <span className="text-text-mute">🔍</span>
        <input
          ref={inputRef}
          type="search"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsFocused(true)}
          onKeyDown={onKeyDown}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
          className="flex-1 bg-transparent text-[12px] text-text outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {licenseFilter.size < LICENSE_GROUP_ORDER.length && (
          <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
            {t('palette.licenseGroupsBadge').replace('{n}', String(licenseFilter.size))}
          </span>
        )}
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
          ⌘K
        </span>
      </div>

      {/* Simplified pattern: native <button> rows for results, no
          role=listbox/option ARIA yet. Keyboard nav via the input's
          onKeyDown handler. Revisit if a11y feedback warrants. */}
      {showDropdown && (
        <div
          className="absolute left-2 right-2 top-full z-30 mt-1 max-h-[50vh] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          <div className="max-h-[calc(50vh-28px)] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-text-mute">
                {t('palette.no_match')}
              </div>
            ) : (
              shown.map((r, i) => {
                const licenseExceeded = !itemMatchesLicenseFilter(r.item, licenseFilter);
                const animExceeded = !itemMatchesAnimationFilter(r.item, animationFilter);
                const exceeded = licenseExceeded || animExceeded;
                const selected = state.selections[r.typeName]?.name === r.item.name;
                const itemLicense = r.item.credits[0]?.licenses[0];
                const isActive = i === activeIndex;
                const exceededTitle =
                  licenseExceeded && animExceeded
                    ? t('layer.bothIncompatibleTooltip')
                    : licenseExceeded
                      ? t('layer.licenseIncompatibleTooltip')
                      : t('layer.animationIncompatibleTooltip');
                return (
                  <button
                    key={`${r.typeName}:${r.item.name}`}
                    ref={isActive ? activeRowRef : undefined}
                    type="button"
                    disabled={disabled || !r.supports}
                    title={
                      !r.supports
                        ? t('palette.incompatible')
                        : exceeded
                          ? exceededTitle
                          : r.item.name
                    }
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => onPick(r)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                      i > 0 ? 'border-t border-border' : '',
                      disabled
                        ? 'cursor-not-allowed opacity-50'
                        : !r.supports
                          ? 'cursor-not-allowed opacity-35'
                        : exceeded
                          ? 'opacity-65 hover:bg-surface-2'
                          : 'hover:bg-surface-2',
                      isActive && r.supports ? 'bg-surface-2' : '',
                    ].join(' ')}
                  >
                    <ItemThumbnail
                      typeName={r.typeName}
                      name={r.item.name}
                      size={20}
                      bodyType={state.bodyType}
                      catalog={catalog}
                      palettes={palettes}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-[12px] font-semibold">
                        {tl.itemName(r.item.name)}
                        {!r.supports && (
                          <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase tracking-wide text-amber-500">
                            {t('palette.incompatible')}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10px] uppercase tracking-wide text-text-mute">
                        {tl.category(r.typeName)}
                        {itemLicense && <> · {itemLicense}</>}
                      </div>
                    </div>
                    {exceeded && <span className="text-danger">⚠</span>}
                    {selected && <span className="text-accent">✓</span>}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-1 text-[10px] text-text-dim">
            <span>
              {shown.length} of {results.length}
            </span>
            <span>
              <span className="font-mono">esc</span> close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
