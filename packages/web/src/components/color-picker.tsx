import { useMemo } from 'react';
import type {
  ItemDefinition,
  PaletteMetadata,
  Selection,
  TypeName,
} from '@lpc-toolkit/core';
import {
  getColorChannelOptions,
  getColorOptions,
} from '../slice/color-options';
import type { LabelTranslator } from '../i18n';

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
  bodyRecolor,
  colorLabel,
  styleLabel,
  linkedColorLabel,
  assetDefaultColorLabel,
  onSelect,
  onSetChannel = () => {},
  onClearChannel = () => {},
  tl,
  disabled = false,
}: {
  item: ItemDefinition;
  selection: Selection | undefined;
  palettes: PaletteMetadata;
  bodyRecolor?: string;
  colorLabel: string;
  styleLabel: string;
  linkedColorLabel: string;
  assetDefaultColorLabel: string;
  onSelect: (change: { variant: string } | { recolor: string }) => void;
  onSetChannel?: (channelId: TypeName, recolor: string) => void;
  onClearChannel?: (channelId: TypeName) => void;
  tl: LabelTranslator;
  disabled?: boolean;
}) {
  const context = bodyRecolor === undefined ? {} : { bodyRecolor };
  const channels = useMemo(
    () => getColorChannelOptions(item, palettes, context),
    [bodyRecolor, item, palettes],
  );
  const fallback = useMemo(
    () => getColorOptions(
      item,
      palettes,
      context,
    ),
    [bodyRecolor, item, palettes],
  );
  if (channels.length === 0 && fallback.mode === 'none') return null;

  if (channels.length === 0 && fallback.mode === 'variants') {
    return (
      <div className="min-w-0 text-xs">
        <span className="text-text-mute uppercase">{styleLabel}</span>
        <div className="mt-1 flex max-h-28 min-w-0 flex-wrap gap-1 overflow-y-auto">
          {fallback.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              aria-pressed={opt.value === selection?.variant}
              className={`rounded border border-border px-1.5 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                opt.value === selection?.variant
                  ? 'bg-accent text-accent-ink'
                  : 'bg-surface-2 text-text'
              }`}
              onClick={() => onSelect({ variant: opt.value })}
            >
              {tl.variant(opt.value)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2 text-xs">
      {channels.map((channel) => {
        const heading = channel.primary
          ? colorLabel
          : tl.channel(channel.id, channel.label);
        if (channel.mode === 'linked-recolor') {
          return (
            <div
              key={channel.id}
              data-channel-id={channel.id}
              tabIndex={-1}
              aria-label={heading}
              className="min-w-0 rounded-sm focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-2"
            >
              <span className="text-text-mute uppercase">{heading}</span>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-text-2" role="status">
                {channel.swatch && (
                  <span
                    className="h-5 w-5 shrink-0 rounded border border-border"
                    style={{ backgroundColor: channel.swatch }}
                    aria-hidden
                  />
                )}
                <span>{linkedColorLabel}</span>
                <span aria-hidden>·</span>
                <span>
                  {channel.recolor
                    ? tl.color(channel.recolor)
                    : assetDefaultColorLabel}
                </span>
              </div>
            </div>
          );
        }
        const selected = channel.primary
          ? selection?.recolor
          : selection?.channelRecolors?.[channel.id];
        const localizedCounts = new Map<string, number>();
        for (const option of channel.options) {
          const localized = tl.color(option.value);
          localizedCounts.set(
            localized,
            (localizedCounts.get(localized) ?? 0) + 1,
          );
        }
        return (
          <div
            key={channel.id}
            data-channel-id={channel.id}
            tabIndex={-1}
            aria-label={heading}
            className="min-w-0 rounded-sm focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-2"
          >
            <span className="text-text-mute uppercase">{heading}</span>
            <div className="mt-1 flex max-h-28 min-w-0 flex-wrap gap-1 overflow-y-auto">
              {!channel.primary && (
                <button
                  type="button"
                  disabled={disabled}
                  title={assetDefaultColorLabel}
                  aria-label={`${heading}: ${assetDefaultColorLabel}`}
                  aria-pressed={selected === undefined}
                  className={`rounded border border-border px-1.5 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected === undefined
                      ? 'bg-accent text-accent-ink ring-2 ring-accent'
                      : 'bg-surface-2 text-text'
                  }`}
                  onClick={() => onClearChannel(channel.id)}
                >
                  {assetDefaultColorLabel}
                </button>
              )}
              {channel.options.map((opt) => {
                const localized = tl.color(opt.value);
                const accessibleColor = (localizedCounts.get(localized) ?? 0) > 1
                  ? `${localized} (${opt.value})`
                  : localized;
                return (
               <button
                key={opt.value}
                type="button"
                disabled={disabled}
                title={tl.color(opt.value)}
                aria-label={channel.primary
                  ? accessibleColor
                  : `${heading}: ${accessibleColor}`}
                aria-pressed={opt.value === selected}
                className={`h-5 w-5 rounded border border-border disabled:cursor-not-allowed disabled:opacity-50 ${
                  opt.value === selected ? 'ring-2 ring-accent' : ''
                }`}
                style={{ backgroundColor: opt.swatch }}
                onClick={() => channel.primary
                  ? onSelect({ recolor: opt.value })
                  : onSetChannel(channel.id, opt.value)}
               />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
