import { useRef, useState } from 'react';
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator } from '../../i18n';
import { pickRandomOutfit } from '../../slice/random-outfit';
import {
  DEFAULT_RANDOM_SCOPE,
  randomProfileForStyle,
  type RandomScope,
} from '../../slice/random-profiles';
import { PresetMenuPopover } from './popovers/preset-menu-popover';
import { ResetMenuPopover } from './popovers/reset-menu-popover';

interface Props {
  disabled: boolean;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
  onReset: (scopes: { outfit: boolean; view: boolean; filters: boolean }) => void;
}

/** Toolbar for random outfits, curated presets, and reset actions. */
export function PresetBar({ disabled, catalog, palettes, state, dispatch, t, onApplied, onReset }: Props) {
  const [presetOpen, setPresetOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [randomScope, setRandomScope] = useState<RandomScope>(DEFAULT_RANDOM_SCOPE);
  const presetTriggerRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="border-b border-border bg-app px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            dispatch({
              type: 'apply_selections',
              selections: pickRandomOutfit({
                catalog,
                palettes,
                bodyType: state.bodyType,
                profile: randomProfileForStyle(null),
                scope: randomScope,
                currentSelections: state.selections,
              }),
            })
          }
          title={t('randomize.title')}
          className="rounded border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2"
        >
          🎲
        </button>
        <button
          ref={presetTriggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={presetOpen}
          onClick={() => setPresetOpen(!presetOpen)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2"
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
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-surface-3"
        >
          <span>↻ {t('reset.button')}</span>
          <span aria-hidden>▼</span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-dim">
        <span>{t('randomScope.title')}</span>
        {([
          ['appearance', t('randomScope.appearance')],
          ['clothing', t('randomScope.clothing')],
          ['equipment', t('randomScope.equipment')],
          ['colors', t('randomScope.colors')],
        ] as const).map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={randomScope[key]}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setRandomScope((current) => ({
                  ...current,
                  [key]: checked,
                }));
              }}
              className="h-3 w-3"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <PresetMenuPopover
        disabled={disabled}
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
        disabled={disabled}
        open={resetOpen}
        setOpen={setResetOpen}
        t={t}
        onReset={onReset}
        anchorRef={resetTriggerRef}
      />
    </div>
  );
}
