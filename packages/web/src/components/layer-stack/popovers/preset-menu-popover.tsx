import type { RefObject } from 'react';
import type { Catalog } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../../slice/selection';
import type { Translator } from '../../../i18n';
import { PRESETS, type Preset } from '../../../presets';
import { computePresetSelection } from '../../../presets-apply';
import { cn } from '../../../lib/cn';
import { usePopover } from './use-popover';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  anchorRef: RefObject<HTMLButtonElement>;
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

/** Popover menu that applies curated presets and reports skipped incompatible items. */
export function PresetMenuPopover({
  open,
  setOpen,
  anchorRef,
  catalog,
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
      className="w-44 rounded-md border border-border bg-surface p-1 shadow-lg"
      role="menu"
      aria-label={t('preset.title')}
    >
      {PRESETS.map((preset: Preset) => {
        const preview = computePresetSelection(preset, state.selections, state.bodyType, catalog);
        const willSkip = preview.skipped.length;
        const label = t(preset.labelKey);
        return (
          <button
            key={preset.id}
            type="button"
            role="menuitem"
            title={willSkip ? `${label} — ${t('preset.skipPreview').replace('{n}', String(willSkip))}` : label}
            onClick={() => {
              dispatch({
                type: 'apply_selections',
                selections: { bodyType: state.bodyType, items: preview.selections },
              });
              onApplied(
                label,
                willSkip,
                preview.skipped.map((s) => s.typeName),
              );
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-surface-2',
              willSkip && 'opacity-80',
            )}
          >
            <span>{preset.emoji}</span>
            <span className="flex-1">{label}</span>
            {willSkip > 0 && <span className="text-danger">⚠</span>}
          </button>
        );
      })}
    </div>
  );
}
