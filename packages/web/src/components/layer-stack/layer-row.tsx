import type { Catalog, ItemDefinition, TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { LabelTranslator } from '../../i18n';

interface Props {
  typeName: TypeName;
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  expanded: boolean;
  onToggle: () => void;
}

export function LayerRow({ typeName, catalog, state, dispatch, tl, expanded, onToggle }: Props) {
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
        <div className="h-7 w-7 shrink-0 rounded bg-surface-2" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-text">
            {item ? tl.itemName(item.name) : selection.name}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-text-mute">
            {tl.category(typeName)}
            {selection.variant ? ` · ${selection.variant}` : ''}
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

      {expanded && (
        <div className="px-2 pb-2">
          {/* Swap grid + ColorPicker — Task 9 */}
          <div className="text-[10px] text-text-mute">Expanded content lands in Task 9.</div>
        </div>
      )}
    </div>
  );
}
