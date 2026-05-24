import { useEffect, useMemo, useState } from 'react';
import type { Catalog, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator, LabelTranslator } from '../../i18n';
import { type LicenseFilter } from '../../slice/license-filter';
import { LayerRow } from './layer-row';
import { AddLayer } from './add-layer';

interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  shownTypeNames: string[];
  licenseFilter: LicenseFilter;
  t: Translator;
  tl: LabelTranslator;
}

export function StackPanel({
  catalog,
  palettes,
  state,
  dispatch,
  shownTypeNames,
  licenseFilter,
  t,
  tl,
}: Props) {
  const [expanded, setExpanded] = useState<TypeName | null>(null);
  const [adding, setAdding] = useState(false);

  const active = useMemo(
    () => shownTypeNames.filter((tn) => state.selections[tn] != null),
    [shownTypeNames, state.selections],
  );
  const inactive = useMemo(
    () => shownTypeNames.filter((tn) => state.selections[tn] == null),
    [shownTypeNames, state.selections],
  );

  // Spec edge case: body-type change can leave `expanded` pointing at a
  // type that no longer has a selection. Reset to null when that happens.
  useEffect(() => {
    if (expanded && !active.includes(expanded)) setExpanded(null);
  }, [expanded, active]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Task 11: <PresetChips /> */}
      <div className="border-b border-border bg-app px-3 py-2 text-[10px] uppercase tracking-wide text-text-mute">
        Presets (placeholder)
      </div>

      {/* Task 12: <StatusToast /> */}

      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text">
          {t('layers.title')}
        </span>
        <span className="font-mono text-[10px] text-text-mute">
          {active.length} {t('layers.on')} · {inactive.length} {t('layers.off')}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {/* Task 8/9: active rows */}
        {active.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-text-mute">No layers yet.</div>
        ) : (
          active.map((tn) => (
            <LayerRow
              key={tn}
              typeName={tn}
              catalog={catalog}
              palettes={palettes}
              state={state}
              dispatch={dispatch}
              tl={tl}
              licenseFilter={licenseFilter}
              expanded={expanded === tn}
              onToggle={() => setExpanded(expanded === tn ? null : tn)}
            />
          ))
        )}

        {/* Task 10: AddLayer */}
        <AddLayer
          catalog={catalog}
          dispatch={dispatch}
          inactive={inactive}
          t={t}
          tl={tl}
          adding={adding}
          setAdding={setAdding}
          onAdded={(tn) => setExpanded(tn)}
        />
      </div>

      {/* Task 17: <SettingsCollapsible /> */}
      <div className="border-t border-border bg-app px-3 py-2 text-[10px] uppercase tracking-wide text-text-mute">
        {t('filters.title')} (placeholder)
      </div>

    </div>
  );
}
