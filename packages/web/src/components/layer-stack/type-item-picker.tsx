import type { Catalog, ItemDefinition, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import { pickActionForItem, type SliceAction, type SliceState } from '../../slice/selection';
import type { LabelTranslator, Translator, TranslationKey } from '../../i18n';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
import { ColorPicker } from '../color-picker';
import { ItemThumbnail } from './item-thumbnail';
import {
  REPLACEMENT_CARD_DISPLAY_MODES,
  type ReplacementCardDisplayMode,
} from '../../lib/replacement-card-display-mode';

const DISPLAY_MODE_ICONS: Record<ReplacementCardDisplayMode, string> = {
  stacked: '\u25A4',
  overlay: '\u25A3',
  hidden: '\u25A1',
};

const DISPLAY_MODE_LABEL_KEYS: Record<ReplacementCardDisplayMode, TranslationKey> = {
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
  replacementCardDisplayMode: ReplacementCardDisplayMode;
  onReplacementCardDisplayModeChange: (mode: ReplacementCardDisplayMode) => void;
}

function customAnimationFor(item: ItemDefinition) {
  return item.layer_1?.custom_animation ||
    item.layer_2?.custom_animation ||
    item.layer_3?.custom_animation ||
    item.layer_4?.custom_animation;
}

/** Shared add/replace picker for all catalog items belonging to one type slot. */
export function TypeItemPicker({
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
  replacementCardDisplayMode,
  onReplacementCardDisplayModeChange,
}: Props) {
  const items = catalog.byTypeName.get(typeName) ?? [];
  const selection = state.selections[typeName];
  const selectedItem = selection
    ? items.find((d) => d.name === selection.name)
    : undefined;
  const fullHeightThumbnail = replacementCardDisplayMode !== 'stacked';
  const thumbnailSize = fullHeightThumbnail ? 56 : 40;

  return (
    <div className="px-2 pb-2">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <div className="mr-auto text-xs uppercase tracking-wide text-text-mute">
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
                  'text-xs focus-visible:outline-none focus-visible:ring-1',
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
          const isSelected = selection?.name === it.name;
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
                tl.catalogItemName(it)
              }
              onClick={() => {
                dispatch(pickActionForItem(typeName, it, {
                  palettes,
                  ...(selection ? { previous: selection } : {}),
                }));
                const customAnim = customAnimationFor(it);
                if (customAnim) {
                  dispatch({ type: 'set_anim', anim: customAnim });
                }
              }}
              aria-label={tl.catalogItemName(it)}
              data-label-layout={replacementCardDisplayMode}
              className={[
                'relative flex h-16 items-center justify-center overflow-hidden',
                'rounded-md border p-1 text-xs',
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
                  {tl.catalogItemName(it)}
                </span>
              )}
              {exceeds && supports && (
                <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-xs text-white" aria-label={exceedsTitle}>!</span>
              )}
            </button>
          );
        })}
      </div>

      {selectedItem && selection && (
        <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
          <ColorPicker
            disabled={disabled}
            item={selectedItem}
            selection={selection}
            palettes={palettes}
            {...(state.selections.body?.recolor !== undefined
              ? { bodyRecolor: state.selections.body.recolor }
              : {})}
            colorLabel={t('picker.color')}
            styleLabel={t('picker.style')}
            linkedColorLabel={t('picker.followsBody')}
            assetDefaultColorLabel={t('picker.assetDefault')}
            tl={tl}
            onSelect={(change) => {
              if ('variant' in change) {
                dispatch({
                  type: 'pick',
                  typeName,
                  name: selectedItem.name,
                  variant: change.variant,
                  ...(selection.recolor ? { recolor: selection.recolor } : {}),
                  ...(selection.channelRecolors
                    ? { channelRecolors: selection.channelRecolors }
                    : {}),
                });
              } else {
                dispatch({
                  type: 'pick',
                  typeName,
                  name: selectedItem.name,
                  recolor: change.recolor,
                  ...(selection.variant ? { variant: selection.variant } : {}),
                  ...(selection.channelRecolors
                    ? { channelRecolors: selection.channelRecolors }
                    : {}),
                });
              }
            }}
            onSetChannel={(channelId, recolor) => {
              dispatch({
                type: 'set_channel_recolor',
                typeName,
                channelId,
                recolor,
              });
            }}
            onClearChannel={(channelId) => {
              dispatch({
                type: 'clear_channel_recolor',
                typeName,
                channelId,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
