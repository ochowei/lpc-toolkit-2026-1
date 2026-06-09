import { useMemo } from 'react';
import type {
  ItemDefinition,
  PaletteMetadata,
  Selection,
} from '@lpc-toolkit/core';
import { getColorOptions } from '../slice/color-options';

/**
 * Color swatches / variant chips for one selected item. Renders nothing
 * for an item with no colors. `recolors` items show real color squares;
 * `variants` items show named chips (variant folders carry no color value).
 * The row wraps and scrolls so a many-color material (e.g. skin tone) does
 * not overrun the panel.
 */
export function ColorPicker({
  item,
  selection,
  palettes,
  colorLabel,
  onSelect,
  disabled = false,
}: {
  item: ItemDefinition;
  selection: Selection | undefined;
  palettes: PaletteMetadata;
  colorLabel: string;
  onSelect: (change: { variant: string } | { recolor: string }) => void;
  disabled?: boolean;
}) {
  const colors = useMemo(
    () => getColorOptions(item, palettes),
    [item, palettes],
  );
  if (colors.mode === 'none') return null;

  return (
    <div className="text-xs">
      <span className="text-text-mute uppercase">{colorLabel}</span>
      <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
        {colors.mode === 'recolors'
          ? colors.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={opt.value === selection?.recolor}
                className={`h-5 w-5 rounded border border-border disabled:cursor-not-allowed disabled:opacity-50 ${
                  opt.value === selection?.recolor ? 'ring-2 ring-accent' : ''
                }`}
                style={{ backgroundColor: opt.swatch }}
                onClick={() => onSelect({ recolor: opt.value })}
              />
            ))
          : colors.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                aria-pressed={opt.value === selection?.variant}
                className={`rounded border border-border px-1.5 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
                  opt.value === selection?.variant
                    ? 'bg-accent text-accent-ink'
                    : 'bg-surface-2 text-text'
                }`}
                onClick={() => onSelect({ variant: opt.value })}
              >
                {opt.label}
              </button>
            ))}
      </div>
    </div>
  );
}
