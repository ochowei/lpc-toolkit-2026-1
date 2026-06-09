import { useRef, useState } from 'react';
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator } from '../../i18n';
import { pickRandomOutfit } from '../../slice/random-outfit';
import { PresetMenuPopover } from './popovers/preset-menu-popover';
import { ResetMenuPopover } from './popovers/reset-menu-popover';

interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
  onReset: (scopes: { outfit: boolean; view: boolean; filters: boolean }) => void;
}

/** Toolbar for random outfits, curated presets, and reset actions. */
export function PresetBar({ catalog, palettes, state, dispatch, t, onApplied, onReset }: Props) {
  const [presetOpen, setPresetOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const presetTriggerRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="border-b border-border bg-app px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'apply_selections',
              selections: pickRandomOutfit({
                catalog,
                palettes,
                bodyType: state.bodyType,
              }),
            })
          }
          title={t('randomize.title')}
          className="rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
          🎲
        </button>
        <button
          ref={presetTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={presetOpen}
          onClick={() => setPresetOpen(!presetOpen)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
          <span>{t('preset.title')}</span>
          <span aria-hidden>▼</span>
        </button>
        <button
          ref={resetTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={resetOpen}
          onClick={() => setResetOpen(!resetOpen)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
          <span>↻ {t('reset.button')}</span>
          <span aria-hidden>▼</span>
        </button>
      </div>
      <PresetMenuPopover
        open={presetOpen}
        setOpen={setPresetOpen}
        anchorRef={presetTriggerRef}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onApplied}
      />
      <ResetMenuPopover
        open={resetOpen}
        setOpen={setResetOpen}
        t={t}
        onReset={onReset}
        anchorRef={resetTriggerRef}
      />
    </div>
  );
}
