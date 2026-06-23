import { getRecolorSwatches, type Catalog, type ItemDefinition, type PaletteMetadata, type TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';
import { type LicenseFilter } from '../../slice/license-filter';
import { type AnimationFilter } from '../../slice/animation-filter';
import type { ReplacementCardDisplayMode } from '../../lib/replacement-card-display-mode';
import { ItemThumbnail } from './item-thumbnail';
import { TypeItemPicker } from './type-item-picker';

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
      className="mb-2 rounded-lg border border-border border-l-4 border-l-accent bg-surface-2 p-2.5 pl-2 transition hover:bg-surface-3 shadow-sm flex flex-col gap-1"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left bg-transparent p-0 cursor-pointer min-w-0"
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
            <div className="h-7 w-7 shrink-0 rounded bg-surface-3 border border-border" aria-hidden />
          )}
          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <div className="truncate text-sm font-semibold text-text">
              {item ? tl.catalogItemName(item) : selection.name}
            </div>
            <div className="flex items-center gap-1 text-xs text-text-mute">
              <span className="uppercase tracking-wide font-medium">{tl.category(typeName)}</span>
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
          <span className="text-xs text-text-mute ml-auto select-none" aria-hidden="true">
            {expanded ? '▼' : '▶'}
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            dispatch({ type: 'clear', typeName });
          }}
          className={[
            'rounded p-1 text-text-mute transition-colors shrink-0',
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'hover:bg-black/10 dark:hover:bg-white/10 hover:text-danger cursor-pointer',
          ].join(' ')}
          aria-label={`Clear ${typeName}`}
        >
          ✕
        </button>
      </div>

      {expanded && (
        <TypeItemPicker
          disabled={disabled}
          typeName={typeName}
          catalog={catalog}
          palettes={palettes}
          state={state}
          dispatch={dispatch}
          tl={tl}
          t={t}
          licenseFilter={licenseFilter}
          animationFilter={animationFilter}
          replacementCardDisplayMode={replacementCardDisplayMode}
          onReplacementCardDisplayModeChange={onReplacementCardDisplayModeChange}
        />
      )}
    </div>
  );
}
