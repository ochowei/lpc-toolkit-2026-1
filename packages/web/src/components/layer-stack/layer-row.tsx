import type { Catalog, ItemDefinition, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import { getRecolorSwatches } from '@lpc-toolkit/core';
import { pickActionForItem, type SliceState, type SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
import { ColorPicker } from '../color-picker';
import { ItemThumbnail } from './item-thumbnail';
import {
  REPLACEMENT_CARD_DISPLAY_MODES,
  type ReplacementCardDisplayMode,
} from '../../lib/replacement-card-display-mode';
import type { TranslationKey } from '../../i18n';

const DISPLAY_MODE_ICONS: Record<ReplacementCardDisplayMode, string> = {
  stacked: '▤',
  overlay: '▣',
  hidden: '□',
};

const DISPLAY_MODE_LABEL_KEYS:
  Record<ReplacementCardDisplayMode, TranslationKey> = {
    stacked: 'replacementCards.stacked',
    overlay: 'replacementCards.overlay',
    hidden: 'replacementCards.hidden',
  };

interface Props {
  disabled: boolean;
  typeName: TypeName;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  t: Translator;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  expanded: boolean;
  onToggle: () => void;
  replacementCardDisplayMode?: ReplacementCardDisplayMode;
  onReplacementCardDisplayModeChange?: (
    mode: ReplacementCardDisplayMode,
  ) => void;
}

/** Active layer row with thumbnail, color controls, and compatible replacement items. */
export function LayerRow({
  disabled,
  typeName,
  catalog,
  palettes,
  state,
  dispatch,
  tl,
  t,
  licenseFilter,
  animationFilter,
  expanded,
  onToggle,
  replacementCardDisplayMode = 'overlay',
  onReplacementCardDisplayModeChange = () => {},
}: Props) {
  const selection = state.selections[typeName];
  if (!selection) return null;

  const item: ItemDefinition | undefined = (catalog.byTypeName.get(typeName) ?? []).find(
    (d) => d.name === selection.name,
  );

  return (
    <div
      className={`mb-1 rounded-md border ${
        expanded ? 'border-border bg-app' : 'border-transparent'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
      >
        {item ? (
          <ItemThumbnail
            typeName={typeName}
            name={item.name}
            size={28}
            bodyType={state.bodyType}
            catalog={catalog}
            palettes={palettes}
            {...(selection.variant !== undefined ? { variant: selection.variant } : {})}
            {...(selection.recolor !== undefined ? { recolor: selection.recolor } : {})}
          />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded bg-surface-2" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-text">
            {item ? tl.itemName(item.name) : selection.name}
          </div>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-mute">
            <span>{tl.category(typeName)}</span>
            {selection.variant && (
              <>
                <span>·</span>
                <span>{tl.variant(selection.variant)}</span>
              </>
            )}
            {selection.recolor && item && (() => {
              const swatches =
                getRecolorSwatches(item, palettes).find(
                  (s) => s.recolor === selection.recolor,
                )?.colors ?? [];
              if (swatches.length === 0) return null;
              return (
                <>
                  <span>·</span>
                  <span className="inline-flex gap-px">
                    {swatches.map((c, i) => (
                      <span
                        key={i}
                        className="h-1 w-1 rounded-sm"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                </>
              );
            })()}
          </div>
        </div>
        <span
          role="button"
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            dispatch({ type: 'clear', typeName });
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              dispatch({ type: 'clear', typeName });
            }
          }}
          className={[
            'rounded p-1 text-text-mute',
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'hover:bg-surface-3 hover:text-danger',
          ].join(' ')}
          aria-label={`Clear ${typeName}`}
        >
          ✕
        </span>
        <span className="text-[10px] text-text-mute">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && item && (() => {
        const items = catalog.byTypeName.get(typeName) ?? [];
        const fullHeightThumbnail = replacementCardDisplayMode !== 'stacked';
        const thumbnailSize = fullHeightThumbnail ? 56 : 40;
        return (
          <div className="px-2 pb-2">
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <div className="mr-auto text-[10px] uppercase tracking-wide text-text-mute">
                {t('layer.swap').replace('{name}', tl.category(typeName))}
              </div>
              <div
                className="flex flex-wrap items-center gap-0.5"
                role="group"
                aria-label={t('replacementCards.displayMode')}
              >
                {REPLACEMENT_CARD_DISPLAY_MODES.map((mode) => {
                  const selected = replacementCardDisplayMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onReplacementCardDisplayModeChange(mode)}
                      className={[
                        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
                        'text-[9px] focus-visible:outline-none focus-visible:ring-1',
                        'focus-visible:ring-accent',
                        selected
                          ? 'border-accent bg-accent/15 text-text'
                          : 'border-border bg-surface-2 text-text-mute hover:bg-surface-3',
                      ].join(' ')}
                    >
                      <span aria-hidden>{DISPLAY_MODE_ICONS[mode]}</span>
                      <span>{t(DISPLAY_MODE_LABEL_KEYS[mode])}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1">
              {items.map((it) => {
                const supports = itemSupportsBodyType(it, state.bodyType);
                const licenseExceeds = !itemMatchesLicenseFilter(it, licenseFilter);
                const animExceeds = !itemMatchesAnimationFilter(it, animationFilter);
                const exceeds = licenseExceeds || animExceeds;
                const isSelected = it.name === item.name;
                const exceedsTitle =
                  licenseExceeds && animExceeds
                    ? t('layer.bothIncompatibleTooltip')
                    : licenseExceeds
                      ? t('layer.licenseIncompatibleTooltip')
                      : t('layer.animationIncompatibleTooltip');
                return (
                  <button
                    key={it.name}
                    type="button"
                    disabled={disabled || !supports}
                    title={
                      !supports ? t('picker.incompatibleBodyType') :
                      exceeds ? exceedsTitle :
                      tl.itemName(it.name)
                    }
                    onClick={() => {
                      dispatch(pickActionForItem(typeName, it));
                      const customAnim = it.layer_1?.custom_animation ||
                                         it.layer_2?.custom_animation ||
                                         it.layer_3?.custom_animation ||
                                         it.layer_4?.custom_animation;
                      if (customAnim) {
                        dispatch({ type: 'set_anim', anim: customAnim });
                      }
                    }}
                    aria-label={tl.itemName(it.name)}
                    data-label-layout={replacementCardDisplayMode}
                    className={[
                      'relative flex h-16 items-center justify-center overflow-hidden',
                      'rounded-md border p-1 text-[10px]',
                      replacementCardDisplayMode === 'stacked' ? 'flex-col gap-1' : '',
                      isSelected
                        ? 'border-accent bg-accent/10 text-text'
                        : 'border-border bg-surface-2 text-text-2',
                      disabled || !supports ? 'cursor-not-allowed opacity-30' : '',
                      !disabled && exceeds && supports ? 'opacity-60' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <ItemThumbnail
                      typeName={typeName}
                      name={it.name}
                      size={thumbnailSize}
                      bodyType={state.bodyType}
                      catalog={catalog}
                      palettes={palettes}
                    />
                    {replacementCardDisplayMode !== 'hidden' && (
                      <span
                        data-visible-item-label="true"
                        className={[
                          'max-w-full truncate',
                          replacementCardDisplayMode === 'overlay'
                            ? 'absolute inset-x-1 bottom-1 rounded-sm bg-black/65 px-1 py-0.5 text-white'
                            : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {tl.itemName(it.name)}
                      </span>
                    )}
                    {exceeds && supports && (
                      <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-[8px] text-white" aria-label={exceedsTitle}>!</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
              <ColorPicker
                disabled={disabled}
                item={item}
                selection={selection}
                palettes={palettes}
                colorLabel={t('picker.color')}
                styleLabel={t('picker.style')}
                tl={tl}
                onSelect={(change) => {
                  if ('variant' in change) {
                    dispatch({ type: 'pick', typeName, name: item.name, variant: change.variant });
                  } else {
                    dispatch({ type: 'pick', typeName, name: item.name, recolor: change.recolor });
                  }
                }}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
