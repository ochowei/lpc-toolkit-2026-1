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
          className="flex-1 bg-transparent text-sm text-text outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {licenseFilter.size < LICENSE_GROUP_ORDER.length && (
          <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-xs text-accent">
            {t('palette.licenseGroupsBadge').replace('{n}', String(licenseFilter.size))}
          </span>
        )}
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-text-dim">
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
              <div className="px-3 py-6 text-center text-sm text-text-mute">
                {t('palette.no_match')}
              </div>
            ) : (
              shown.map((r, i) => (
                <SidebarSearchResultRow
                  key={`${r.typeName}:${r.item.name}`}
                  result={r}
                  index={i}
                  activeIndex={activeIndex}
                  disabled={disabled}
                  licenseFilter={licenseFilter}
                  animationFilter={animationFilter}
                  state={state}
                  catalog={catalog}
                  palettes={palettes}
                  t={t}
                  tl={tl}
                  onPick={onPick}
                  setActiveIndex={setActiveIndex}
                  activeRowRef={activeRowRef}
                />
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-1 text-xs text-text-dim">
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

export interface SidebarSearchResultRowProps {
  readonly result: PaletteResult;
  readonly index: number;
  readonly activeIndex: number;
  readonly disabled: boolean;
  readonly licenseFilter: LicenseFilter;
  readonly animationFilter: AnimationFilter;
  readonly state: SliceState;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly t: Translator;
  readonly tl: LabelTranslator;
  readonly onPick: (result: PaletteResult) => void;
  readonly setActiveIndex: (index: number) => void;
  readonly activeRowRef: RefObject<HTMLButtonElement>;
}

export function SidebarSearchResultRow({
  result,
  index,
  activeIndex,
  disabled,
  licenseFilter,
  animationFilter,
  state,
  catalog,
  palettes,
  t,
  tl,
  onPick,
  setActiveIndex,
  activeRowRef,
}: SidebarSearchResultRowProps) {
  const licenseExceeded = !itemMatchesLicenseFilter(result.item, licenseFilter);
  const animExceeded = !itemMatchesAnimationFilter(result.item, animationFilter);
  const exceeded = licenseExceeded || animExceeded;
  const selected = state.selections[result.typeName]?.name === result.item.name;
  const itemLicense = result.item.credits[0]?.licenses[0];
  const isActive = index === activeIndex;
  const exceededTitle =
    licenseExceeded && animExceeded
      ? t('layer.bothIncompatibleTooltip')
      : licenseExceeded
        ? t('layer.licenseIncompatibleTooltip')
        : t('layer.animationIncompatibleTooltip');

  const showIncompatibleTooltip = !result.supports && !disabled;

  const button = (
    <button
      ref={isActive ? activeRowRef : undefined}
      type="button"
      disabled={disabled || !result.supports}
      title={
        !result.supports
          ? t('palette.incompatible')
          : exceeded
            ? exceededTitle
            : result.item.name
      }
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => onPick(result)}
      className={[
        'flex w-full items-center gap-2 px-3 py-1.5 text-left',
        index > 0 ? 'border-t border-border' : '',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : !result.supports
            ? 'cursor-not-allowed opacity-35'
          : exceeded
            ? 'opacity-65 hover:bg-surface-2'
            : 'hover:bg-surface-2',
        isActive && result.supports ? 'bg-surface-2' : '',
      ].join(' ')}
    >
      <ItemThumbnail
        typeName={result.typeName}
        name={result.item.name}
        size={20}
        bodyType={state.bodyType}
        catalog={catalog}
        palettes={palettes}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-sm font-semibold">
          {tl.catalogItemName(result.item)}
          {!result.supports && (
            <span className="rounded bg-amber-500/15 px-1 text-xs uppercase tracking-wide text-amber-500">
              {t('palette.incompatible')}
            </span>
          )}
        </div>
        <div className="truncate text-xs uppercase tracking-wide text-text-mute">
          {tl.category(result.typeName)}
          {itemLicense && <> · {itemLicense}</>}
        </div>
      </div>
      {exceeded && <span className="text-danger">⚠</span>}
      {selected && <span className="text-accent">✓</span>}
    </button>
  );

  if (showIncompatibleTooltip) {
    return (
      <span className="group relative block w-full" tabIndex={0}>
        {button}
        <span
          role="tooltip"
          className="pointer-events-none absolute left-3 top-full z-40 mt-1 max-w-56 rounded bg-surface-3 border border-border-strong px-2 py-1 text-xs text-text shadow-md opacity-0 group-hover:opacity-100 group-hover:delay-150 group-focus:opacity-100 transition-opacity duration-150"
        >
          {t('picker.incompatibleBodyTypeDetail')
            .replace('{bodyType}', tl.bodyType(state.bodyType))}
        </span>
      </span>
    );
  }

  return button;
}
