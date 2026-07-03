import type { RefObject } from 'react';
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../../slice/selection';
import type { Translator } from '../../../i18n';
import { PRESETS, type Preset } from '../../../presets';
import { computePresetSelection } from '../../../presets-apply';
import { cn } from '../../../lib/cn';
import { pickRandomOutfit } from '../../../slice/random-outfit';
import { randomProfileForStyle } from '../../../slice/random-profiles';
import { usePopover } from './use-popover';

interface Props {
  disabled: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  anchorRef: RefObject<HTMLButtonElement>;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

interface PresetMenuActionArgs {
  readonly preset: Preset;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly state: SliceState;
  readonly dispatch: (a: SliceAction) => void;
  readonly setOpen: (v: boolean) => void;
}

interface ApplyPresetMenuRowArgs extends PresetMenuActionArgs {
  readonly t: Translator;
  readonly onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

interface RandomizePresetMenuRowArgs extends PresetMenuActionArgs {
  readonly rng?: () => number;
}

interface PresetMenuRowsProps {
  readonly disabled: boolean;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly state: SliceState;
  readonly dispatch: (a: SliceAction) => void;
  readonly t: Translator;
  readonly onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
  readonly setOpen: (v: boolean) => void;
}

export function applyPresetMenuRow({
  preset,
  catalog,
  palettes,
  state,
  dispatch,
  setOpen,
  t,
  onApplied,
}: ApplyPresetMenuRowArgs): void {
  const preview = computePresetSelection(
    preset,
    state.selections,
    state.bodyType,
    catalog,
    palettes,
  );
  const label = t(preset.labelKey);

  dispatch({
    type: 'apply_selections',
    selections: { bodyType: preview.bodyType, items: preview.selections },
  });
  onApplied(
    label,
    preview.skipped.length,
    preview.skipped.map((skipped) => skipped.typeName),
  );
  setOpen(false);
}

export function randomizePresetMenuRow({
  preset,
  catalog,
  palettes,
  state,
  dispatch,
  setOpen,
  rng,
}: RandomizePresetMenuRowArgs): void {
  dispatch({
    type: 'apply_selections',
    selections: pickRandomOutfit({
      catalog,
      palettes,
      bodyType: state.bodyType,
      profile: randomProfileForStyle(preset.id),
      rng,
    }),
  });
  setOpen(false);
}

export function PresetMenuRows({
  disabled,
  catalog,
  palettes,
  state,
  dispatch,
  t,
  onApplied,
  setOpen,
}: PresetMenuRowsProps) {
  return (
    <>
      {PRESETS.map((preset: Preset) => {
        const preview = computePresetSelection(
          preset,
          state.selections,
          state.bodyType,
          catalog,
          palettes,
        );
        const willSkip = preview.skipped.length;
        const label = t(preset.labelKey);
        return (
          <div
            key={preset.id}
            role="none"
            className={cn(
              'grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded px-2 py-1.5 text-[12px]',
              willSkip && 'opacity-80',
              disabled && 'opacity-50',
            )}
          >
            <span
              title={willSkip ? `${label} — ${t('preset.skipPreview').replace('{n}', String(willSkip))}` : label}
              className="flex min-w-0 items-center gap-2"
            >
              <span>{preset.emoji}</span>
              <span className="truncate">{label}</span>
              {willSkip > 0 && <span className="text-danger">⚠</span>}
            </span>
            <button
              type="button"
              disabled={disabled}
              role="menuitem"
              onClick={() =>
                applyPresetMenuRow({
                  preset,
                  catalog,
                  palettes,
                  state,
                  dispatch,
                  setOpen,
                  t,
                  onApplied,
                })
              }
              className={cn(
                'rounded px-2 py-1 text-[11px] hover:bg-surface-2',
                disabled && 'cursor-not-allowed hover:bg-transparent',
              )}
            >
              {t('token.apply')}
            </button>
            <button
              type="button"
              disabled={disabled}
              role="menuitem"
              onClick={() =>
                randomizePresetMenuRow({
                  preset,
                  catalog,
                  palettes,
                  state,
                  dispatch,
                  setOpen,
                })
              }
              className={cn(
                'rounded px-2 py-1 text-[11px] hover:bg-surface-2',
                disabled && 'cursor-not-allowed hover:bg-transparent',
              )}
            >
              {t('preset.random')}
            </button>
          </div>
        );
      })}
    </>
  );
}

/** Popover menu that applies curated presets and reports skipped incompatible items. */
export function PresetMenuPopover({
  disabled,
  open,
  setOpen,
  anchorRef,
  catalog,
  palettes,
  state,
  dispatch,
  t,
  onApplied,
}: Props) {
  const { panelRef, pos } = usePopover(open, () => setOpen(false), anchorRef);

  if (!open || !pos) return null;

  return (
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
      className="w-64 rounded-md border border-border bg-surface p-1 shadow-lg"
      role="menu"
      aria-label={t('preset.title')}
    >
      <PresetMenuRows
        disabled={disabled}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onApplied}
        setOpen={setOpen}
      />
    </div>
  );
}
