import type { Catalog, ItemDefinition, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import { getRecolorSwatches } from '@lpc-toolkit/core';
import { pickActionForItem, type SliceState, type SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
import { ColorPicker } from '../color-picker';
import { ItemThumbnail } from './item-thumbnail';
import type { AssetSource } from '../../adapter/asset-source';

interface Props {
  typeName: TypeName;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  t: Translator;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  assetSource: AssetSource;
  expanded: boolean;
  onToggle: () => void;
}

export function LayerRow({ typeName, catalog, palettes, state, dispatch, tl, t, licenseFilter, animationFilter, assetSource, expanded, onToggle }: Props) {
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
            assetSource={assetSource}
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
                <span>{selection.variant}</span>
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
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'clear', typeName });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              dispatch({ type: 'clear', typeName });
            }
          }}
          className="rounded p-1 text-text-mute hover:bg-surface-3 hover:text-danger"
          aria-label={`Clear ${typeName}`}
        >
          ✕
        </span>
        <span className="text-[10px] text-text-mute">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && item && (() => {
        const items = catalog.byTypeName.get(typeName) ?? [];
        return (
          <div className="px-2 pb-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">
              Swap {typeName}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1">
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
                    disabled={!supports}
                    title={
                      !supports ? 'incompatible body type' :
                      exceeds ? exceedsTitle :
                      it.name
                    }
                    onClick={() => dispatch(pickActionForItem(typeName, it))}
                    className={[
                      'relative flex flex-col items-center gap-1 rounded-md border p-1 text-[10px]',
                      isSelected ? 'border-accent bg-accent/10 text-text' : 'border-border bg-surface-2 text-text-2',
                      !supports ? 'opacity-30 cursor-not-allowed' : '',
                      exceeds && supports ? 'opacity-60' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <ItemThumbnail
                      typeName={typeName}
                      name={it.name}
                      size={24}
                      bodyType={state.bodyType}
                      catalog={catalog}
                      palettes={palettes}
                      assetSource={assetSource}
                    />
                    <span className="max-w-full truncate">{it.name}</span>
                    {exceeds && supports && (
                      <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-[8px] text-white" aria-label={exceedsTitle}>!</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
              <ColorPicker
                item={item}
                selection={selection}
                palettes={palettes}
                colorLabel="Style"
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
