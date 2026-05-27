import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { Catalog, LicenseGroup, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator, LabelTranslator } from '../../i18n';
import { type LicenseFilter } from '../../slice/license-filter';
import type { AssetSource } from '../../adapter/asset-source';
import { LayerRow } from './layer-row';
import { AddLayer } from './add-layer';
import { PresetChips } from './preset-chips';
import { StatusToast } from './status-toast';
import { SettingsCollapsible } from './settings-collapsible';
import { SidebarSearch } from './sidebar-search';

interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  shownTypeNames: string[];
  licenseFilter: LicenseFilter;
  toggleLicenseGroup: (group: LicenseGroup) => void;
  licenseIncompatibleCount: number;
  removeLicenseIncompatibleSelections: () => void;
  assetSource: AssetSource;
  setAssetSource: (v: AssetSource) => void;
  t: Translator;
  tl: LabelTranslator;
  onPresetApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
  status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
  searchInputRef: RefObject<HTMLInputElement>;
  expanded: TypeName | null;
  setExpanded: (v: TypeName | null) => void;
}

export function StackPanel({
  catalog,
  palettes,
  state,
  dispatch,
  shownTypeNames,
  licenseFilter,
  toggleLicenseGroup,
  licenseIncompatibleCount,
  removeLicenseIncompatibleSelections,
  assetSource,
  setAssetSource,
  t,
  tl,
  onPresetApplied,
  status,
  searchInputRef,
  expanded,
  setExpanded,
}: Props) {
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
  }, [expanded, active, setExpanded]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarSearch
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        assetSource={assetSource}
        shownTypeNames={shownTypeNames}
        licenseFilter={licenseFilter}
        t={t}
        tl={tl}
        onPicked={(tn) => setExpanded(tn)}
        inputRef={searchInputRef}
      />
      <PresetChips
        catalog={catalog}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onPresetApplied}
      />

      <StatusToast status={status} />

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
              t={t}
              licenseFilter={licenseFilter}
              assetSource={assetSource}
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
          bodyType={state.bodyType}
          t={t}
          tl={tl}
          adding={adding}
          setAdding={setAdding}
          onAdded={(tn) => setExpanded(tn)}
        />
      </div>

      <SettingsCollapsible
        t={t}
        licenseFilter={licenseFilter}
        toggleLicenseGroup={toggleLicenseGroup}
        licenseIncompatibleCount={licenseIncompatibleCount}
        removeLicenseIncompatibleSelections={removeLicenseIncompatibleSelections}
        assetSource={assetSource}
        setAssetSource={setAssetSource}
      />

    </div>
  );
}
