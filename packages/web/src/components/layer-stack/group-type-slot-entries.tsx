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
  typeNames: readonly TypeName[];
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  t: Translator;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  expanded: TypeName | null;
  setExpanded: (v: TypeName | null) => void;
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

/** Inline add/replace entries for every type slot in one upstream group. */
export function GroupTypeSlotEntries({
  disabled,
  typeNames,
  catalog,
  palettes,
  state,
  dispatch,
  tl,
  t,
  licenseFilter,
  animationFilter,
  expanded,
  setExpanded,
  replacementCardDisplayMode,
  onReplacementCardDisplayModeChange,
}: Props) {
  if (typeNames.length === 0) return null;

  return (
    <div className="mt-1 space-y-1 px-1">
      <div className="flex flex-wrap gap-1">
        {typeNames.map((typeName) => {
          const currentName = selectedItemName({ catalog, state, typeName });
          const hasCompatible = hasBodyCompatibleItem({ catalog, state, typeName });
          const entryDisabled = disabled || !hasCompatible;
          const selected = expanded === typeName;
          const label = currentName
            ? `${tl.category(typeName)}: ${tl.itemName(currentName)} - Replace`
            : `+ ${tl.category(typeName)}`;

          return (
            <button
              key={typeName}
              type="button"
              disabled={entryDisabled}
              title={!hasCompatible ? t('picker.incompatibleBodyType') : label}
              aria-expanded={selected}
              onClick={() => setExpanded(selected ? null : typeName)}
              className={[
                'rounded-full border px-2.5 py-1 text-[11px]',
                selected
                  ? 'border-accent bg-accent/15 text-text'
                  : 'border-border bg-surface-2 text-text-2',
                entryDisabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-surface-3 cursor-pointer',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {expanded && typeNames.includes(expanded) && (
        <div className="rounded-md border border-border bg-app pt-2">
          <TypeItemPicker
            disabled={disabled}
            typeName={expanded}
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
}
