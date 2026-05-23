import type { Selection, TypeName } from '@lpc-toolkit/core';
import { orderedSelectionEntries, type SliceAction } from '../slice/selection';
import type { Translator, LabelTranslator } from '../i18n';

export function SelectedItemsPanel({
  selections,
  dispatch,
  t,
  tl,
}: {
  selections: Readonly<Record<TypeName, Selection>>;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  tl: LabelTranslator;
}) {
  const entries = orderedSelectionEntries(selections);
  return (
    <section className="border-b border-border pb-3">
      <h2 className="text-xs font-bold uppercase">{t('selected.title')}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-text-mute">{t('selected.empty')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {entries.map(([typeName, sel]) => (
            <li
              key={typeName}
              className="flex items-center gap-2 text-xs"
            >
              <span className="flex-1">
                <span className="text-text-mute">
                  {tl.category(typeName)}:{' '}
                </span>
                <span>{tl.itemName(sel.name)}</span>
              </span>
              <button
                type="button"
                aria-label={`${t('selected.remove')} ${tl.itemName(sel.name)}`}
                className="rounded px-1 text-text-dim hover:text-danger"
                onClick={() => dispatch({ type: 'clear', typeName })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
