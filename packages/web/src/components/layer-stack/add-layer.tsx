import type { BodyType, Catalog, TypeName } from '@lpc-toolkit/core';
import { pickActionForItem, type SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { CATEGORY_GROUPS } from '../../slice/category-groups';

interface Props {
  disabled: boolean;
  catalog: Catalog;
  dispatch: (a: SliceAction) => void;
  inactive: TypeName[];
  bodyType: BodyType;
  t: Translator;
  tl: LabelTranslator;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onAdded: (tn: TypeName) => void;
}

/** Inline picker for adding currently inactive catalog type slots. */
export function AddLayer({
  disabled,
  catalog, dispatch, inactive, bodyType, t, tl,
  adding, setAdding, onAdded,
}: Props) {
  if (!adding) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAdding(true)}
        className="mt-2 mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <span>＋</span>
        <span>{t('add.button')}</span>
        <span className="ml-auto font-mono text-[10px]">
          {inactive.length} {t('add.available')}
        </span>
      </button>
    );
  }

  // Build per-group inactive type lists (intersection of group typeNames and inactive)
  const inactiveSet = new Set(inactive);
  const sections = CATEGORY_GROUPS
    .map((g) => ({
      group: g,
      types: g.typeNames.filter((tn) => inactiveSet.has(tn)),
    }))
    .filter((s) => s.types.length > 0);

  return (
    <div className="mt-2 mb-2 rounded-md border border-border bg-app p-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-mute">
          {t('add.button')}
        </span>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="ml-auto rounded px-2 py-1 text-[11px] text-text-mute hover:bg-surface-2"
        >
          {t('common.close')}
        </button>
      </div>

      {sections.map(({ group, types }) => (
        <div key={group.id} className="mb-2 last:mb-0">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t(group.labelKey)}
          </div>
          <div className="flex flex-wrap gap-1">
            {types.map((tn) => {
              const items = catalog.byTypeName.get(tn) ?? [];
              const firstCompatible = items.find((it) => itemSupportsBodyType(it, bodyType));
              const itemDisabled = disabled || !firstCompatible;
              return (
                <button
                  key={tn}
                  type="button"
                  disabled={itemDisabled}
                  title={!firstCompatible ? t('palette.incompatible') : tl.category(tn)}
                  onClick={() => {
                    if (!firstCompatible) return;
                    dispatch(pickActionForItem(tn, firstCompatible));
                    setAdding(false);
                    onAdded(tn);
                  }}
                  className={[
                    'rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px]',
                    itemDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-surface-3 cursor-pointer',
                  ].join(' ')}
                >
                  + {tl.category(tn)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {sections.length === 0 && (
        <div className="px-2 py-2 text-[11px] text-text-mute">
          All categories already added.
        </div>
      )}
    </div>
  );
}
