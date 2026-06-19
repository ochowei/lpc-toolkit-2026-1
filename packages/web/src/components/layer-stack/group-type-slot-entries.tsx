import type { Catalog, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import type { LabelTranslator, Translator } from '../../i18n';
import type { AnimationFilter } from '../../slice/animation-filter';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import type { LicenseFilter } from '../../slice/license-filter';
import type { SliceAction, SliceState } from '../../slice/selection';
import type { ReplacementCardDisplayMode } from '../../lib/replacement-card-display-mode';
import { TypeItemPicker } from './type-item-picker';

interface Props {
  disabled: boolean;
  sectionOpen: boolean;
  onToggleSection: () => void;
  typeNames: readonly TypeName[];
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  t: Translator;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  expandedSlotType: TypeName | null;
  onToggleSlotType: (typeName: TypeName) => void;
  replacementCardDisplayMode: ReplacementCardDisplayMode;
  onReplacementCardDisplayModeChange: (mode: ReplacementCardDisplayMode) => void;
}

function selectedItemName(args: {
  catalog: Catalog;
  state: SliceState;
  typeName: TypeName;
}) {
  const selection = args.state.selections[args.typeName];
  if (!selection) return null;
  const item = (args.catalog.byTypeName.get(args.typeName) ?? []).find(
    (candidate) => candidate.name === selection.name,
  );
  return item?.name ?? selection.name;
}

function hasBodyCompatibleItem(args: {
  catalog: Catalog;
  state: SliceState;
  typeName: TypeName;
}) {
  return (args.catalog.byTypeName.get(args.typeName) ?? []).some((item) =>
    itemSupportsBodyType(item, args.state.bodyType),
  );
}

function slotToggleLabel(args: {
  readonly open: boolean;
  readonly count: number;
  readonly t: Translator;
}) {
  const slotLabel = args.t(
    args.count === 1 ? 'groupSlots.slotSingular' : 'groupSlots.slotPlural',
  );
  return args
    .t(args.open ? 'groupSlots.hide' : 'groupSlots.show')
    .replace('{n}', String(args.count))
    .replace('{slotLabel}', slotLabel);
}

/** Inline add/replace entries for every type slot in one upstream group. */
export function GroupTypeSlotEntries({
  disabled,
  sectionOpen,
  onToggleSection,
  typeNames,
  catalog,
  palettes,
  state,
  dispatch,
  tl,
  t,
  licenseFilter,
  animationFilter,
  expandedSlotType,
  onToggleSlotType,
  replacementCardDisplayMode,
  onReplacementCardDisplayModeChange,
}: Props) {
  if (typeNames.length === 0) return null;

  const compatibleTypeNames = typeNames.filter((typeName) =>
    hasBodyCompatibleItem({ catalog, state, typeName }),
  );
  const toggleLabel = slotToggleLabel({
    open: sectionOpen,
    count: compatibleTypeNames.length,
    t,
  });

  const isDisabled = disabled || compatibleTypeNames.length === 0;

  return (
    <div className="mt-1 space-y-1 pl-2 pr-1">
      <button
        type="button"
        disabled={isDisabled}
        aria-expanded={sectionOpen}
        onClick={onToggleSection}
        className={[
          'flex w-full items-center justify-between rounded-md bg-transparent border border-dashed border-border px-3 py-2 text-left text-xs font-semibold text-text-mute transition-colors',
          isDisabled
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-surface-2 hover:text-text hover:border-border cursor-pointer',
        ].join(' ')}
      >
        <span>{toggleLabel}</span>
        <span aria-hidden>{sectionOpen ? '▼' : '▶'}</span>
      </button>

      {sectionOpen && (
        <div className="flex flex-col gap-1.5 mt-1.5 pl-2">
          {typeNames.map((typeName) => {
            const currentName = selectedItemName({ catalog, state, typeName });
            const hasCompatible = hasBodyCompatibleItem({ catalog, state, typeName });
            const entryDisabled = disabled || !hasCompatible;
            const selected = expandedSlotType === typeName;
            const label = currentName
              ? `${tl.category(typeName)}: ${tl.itemName(currentName)} - Replace`
              : `+ ${tl.category(typeName)}`;

            return (
              <div key={typeName} className="w-full flex flex-col gap-1">
                <button
                  type="button"
                  disabled={entryDisabled}
                  title={!hasCompatible ? t('picker.incompatibleBodyType') : label}
                  aria-expanded={selected}
                  onClick={() => onToggleSlotType(typeName)}
                  className={[
                    'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold transition shadow-sm',
                    selected
                      ? 'border-accent bg-accent/10 text-text'
                      : 'border-border bg-surface-2 text-text-2',
                    entryDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-surface-3 cursor-pointer',
                  ].join(' ')}
                >
                  <span>{label}</span>
                  <span aria-hidden className="text-xs text-text-mute select-none">{selected ? '▼' : '▶'}</span>
                </button>
                {selected && (
                  <div className="rounded-md border border-border bg-app pt-2 mt-1">
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
