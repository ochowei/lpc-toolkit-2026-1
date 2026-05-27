import { useRef, useState } from 'react';
import type { Catalog } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator } from '../../i18n';
import { pickRandomOutfit } from '../../slice/random-outfit';
import { PresetMenuPopover } from './popovers/preset-menu-popover';

interface Props {
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

export function PresetBar({ catalog, state, dispatch, t, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="border-b border-border bg-app px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'apply_selections',
              selections: pickRandomOutfit({ catalog, bodyType: state.bodyType }),
            })
          }
          title={t('randomize.title')}
          className="rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
          🎲
        </button>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
          <span>{t('preset.title')}</span>
          <span aria-hidden>▼</span>
        </button>
      </div>
      <PresetMenuPopover
        open={open}
        setOpen={setOpen}
        anchorRef={triggerRef}
        catalog={catalog}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onApplied}
      />
    </div>
  );
}
