import type { Catalog } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator } from '../../i18n';
import { PRESETS, type Preset } from '../../presets';
import { computePresetSelection } from '../../presets-apply';

interface Props {
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

export function PresetChips({ catalog, state, dispatch, t, onApplied }: Props) {
  return (
    <div className="border-b border-border bg-app px-3 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
        {t('preset.title')}
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset: Preset) => {
          const preview = computePresetSelection(preset, state.selections, state.bodyType, catalog);
          const willSkip = preview.skipped.length;
          const label = t(preset.labelKey);
          return (
            <button
              key={preset.id}
              type="button"
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
              }}
              className={`inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] hover:bg-surface-3 ${
                willSkip ? 'opacity-70' : ''
              }`}
            >
              <span>{preset.emoji}</span>
              <span>{label}</span>
              {willSkip > 0 && <span className="text-danger">⚠</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
