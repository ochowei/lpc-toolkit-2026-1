import { BODY_TYPES, type BodyType, type Catalog } from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../../../slice/catalog-tree';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { SliceState, SliceAction } from '../../../slice/selection';
import type { LabelTranslator, Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  t: Translator;
  tl: LabelTranslator;
  onIncompatibilityWarning: (typeNames: string[]) => void;
}

export function BodyTypePopover({ open, setOpen, state, dispatch, catalog, t, tl, onIncompatibilityWarning }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant={open ? 'primary' : 'default'}
        onClick={() => setOpen(!open)}
      >
        👤 {tl.bodyType(state.bodyType)} ▾
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="rounded-md border border-border bg-surface p-2 shadow-lg"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('bodyType.title')}
          </div>
          <div className="flex flex-col gap-1">
            {BODY_TYPES.map((bt: BodyType) => (
              <button
                key={bt}
                type="button"
                onClick={() => {
                  // Determine incompatibilities for the new bodyType.
                  const incompatible: string[] = [];
                  for (const [tn, sel] of Object.entries(state.selections)) {
                    const def = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
                    if (def && !itemSupportsBodyType(def, bt)) {
                      incompatible.push(tl.category(tn));
                    }
                  }
                  dispatch({ type: 'set_body_type', bodyType: bt });
                  setOpen(false);
                  if (incompatible.length > 0) onIncompatibilityWarning(incompatible);
                }}
                className={`rounded px-2 py-1 text-left text-[12px] ${
                  bt === state.bodyType ? 'bg-accent/20 text-text' : 'hover:bg-surface-2 text-text-2'
                }`}
              >
                {tl.bodyType(bt)}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
