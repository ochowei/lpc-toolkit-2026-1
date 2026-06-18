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
      className={`mb-1 rounded-md border ${
        expanded ? 'border-border bg-app' : 'border-transparent'
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
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
          <div className="truncate text-sm font-semibold text-text">
            {item ? tl.itemName(item.name) : selection.name}
          </div>
          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-text-mute">
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
        <span className="text-xs text-text-mute">{expanded ? '▾' : '▸'}</span>
      </button>

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
