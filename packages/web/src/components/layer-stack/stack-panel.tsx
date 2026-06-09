import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { AnimationName, Catalog, LicenseGroup, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator, LabelTranslator } from '../../i18n';
import { type LicenseFilter } from '../../slice/license-filter';
import { type AnimationFilter } from '../../slice/animation-filter';
import type { CustomOverlay } from '../../lib/custom-overlay';
import { LayerRow } from './layer-row';
import { AddLayer } from './add-layer';
import { PresetBar } from './preset-bar';
import { StatusToast } from './status-toast';
import { SettingsCollapsible } from './settings-collapsible';
import { SidebarSearch } from './sidebar-search';

interface Props {
  disabled: boolean;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  shownTypeNames: string[];
  licenseFilter: LicenseFilter;
  toggleLicenseGroup: (group: LicenseGroup) => void;
  licenseIncompatibleCount: number;
  removeLicenseIncompatibleSelections: () => void;
  animationFilter: AnimationFilter;
  toggleAnimation: (anim: AnimationName) => void;
  animationIncompatibleCount: number;
  removeAnimationIncompatibleSelections: () => void;
  customOverlay: CustomOverlay | null;
  customOverlayZPos: number;
  onCustomOverlayUpload: (file: File) => void;
  onCustomOverlayZPosChange: (raw: string) => void;
  onClearCustomOverlay: () => void;
  t: Translator;
  tl: LabelTranslator;
  onPresetApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
  onReset: (scopes: { outfit: boolean; view: boolean; filters: boolean }) => void;
  status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
  searchInputRef: RefObject<HTMLInputElement>;
  expanded: TypeName | null;
  setExpanded: (v: TypeName | null) => void;
}

/** Left-side layer management panel: search, filters, active stack, and settings. */
export function StackPanel({
  disabled,
  catalog,
  palettes,
  state,
  dispatch,
  shownTypeNames,
  licenseFilter,
  toggleLicenseGroup,
  licenseIncompatibleCount,
  removeLicenseIncompatibleSelections,
  animationFilter,
  toggleAnimation,
  animationIncompatibleCount,
  removeAnimationIncompatibleSelections,
  customOverlay,
  customOverlayZPos,
  onCustomOverlayUpload,
  onCustomOverlayZPosChange,
  onClearCustomOverlay,
  t,
  tl,
  onPresetApplied,
  onReset,
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
        disabled={disabled}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        shownTypeNames={shownTypeNames}
        licenseFilter={licenseFilter}
        animationFilter={animationFilter}
        t={t}
        tl={tl}
        onPicked={(tn) => setExpanded(tn)}
        inputRef={searchInputRef}
      />
      <PresetBar
        disabled={disabled}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onPresetApplied}
        onReset={onReset}
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
              disabled={disabled}
              typeName={tn}
              catalog={catalog}
              palettes={palettes}
              state={state}
              dispatch={dispatch}
              tl={tl}
              t={t}
              licenseFilter={licenseFilter}
              animationFilter={animationFilter}
              expanded={expanded === tn}
              onToggle={() => setExpanded(expanded === tn ? null : tn)}
            />
          ))
        )}

        {/* Task 10: AddLayer */}
        <AddLayer
          disabled={disabled}
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
        animationFilter={animationFilter}
        toggleAnimation={toggleAnimation}
        animationIncompatibleCount={animationIncompatibleCount}
        removeAnimationIncompatibleSelections={removeAnimationIncompatibleSelections}
        customOverlay={customOverlay}
        customOverlayZPos={customOverlayZPos}
        onCustomOverlayUpload={onCustomOverlayUpload}
        onCustomOverlayZPosChange={onCustomOverlayZPosChange}
        onClearCustomOverlay={onClearCustomOverlay}
      />

    </div>
  );
}
