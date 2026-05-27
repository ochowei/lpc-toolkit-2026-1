import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  composeSelections,
  makeResolvePalette,
  type Catalog,
  type HashWarning,
  type LicenseGroup,
  type PaletteMetadata,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
import type {
  FullSheetUiState,
  FullSheetUiActions,
  FullSheetZoom,
} from './preview-pane';
import { useUrlHashSync } from '../../lib/url-hash-sync';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Locale, Translator, LabelTranslator } from '../../i18n';
import type { AssetSource } from '../../adapter/asset-source';
import {
  ALL_LICENSE_GROUPS,
  incompatibleTypeNamesFor,
  type LicenseFilter,
} from '../../slice/license-filter';
import { TopBar } from './top-bar';
import { PreviewPane } from './preview-pane';
import { StackPanel } from './stack-panel';
import { BodyTypePopover } from './popovers/body-type-popover';
import { TokenPopover } from './popovers/token-popover';
import { ResetMenuPopover } from './popovers/reset-menu-popover';
import { AttributionPopover } from './popovers/attribution-popover';
import { DownloadPopover } from './popovers/download-popover';
import { cacheClear } from '../../hooks/thumbnail-cache';
import { useComposedCharacter } from '../../hooks/use-composed-character';
import { Button } from '../ui/button';
import { createBrowserCanvasAdapter } from '../../adapter/browser-canvas-adapter';
import { toSelections } from '../../slice/selection';
import type { ZipExportKind } from '../../lib/zip-export';

export interface LayerStackHarnessProps {
  catalog: Catalog;
  palettes: PaletteMetadata;
  shownTypeNames: string[];
  initialHashWarnings: readonly HashWarning[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  locale: Locale;
  assetSource: AssetSource;
  t: Translator;
  tl: LabelTranslator;
  onAssetSourceChange: (source: AssetSource) => void;
  onReset: (scopes: { outfit: boolean; view: boolean }) => void;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}

export function LayerStackHarness(props: LayerStackHarnessProps) {
  const { t, theme, locale, onToggleTheme, onToggleLocale } = props;
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(ALL_LICENSE_GROUPS);
  const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'reset' | 'attribution' | 'download'>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<TypeName | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [fullSheetGrid, setFullSheetGrid] = useState(false);
  const [fullSheetMask, setFullSheetMask] = useState(false);
  const [fullSheetZoom, setFullSheetZoom] = useState<FullSheetZoom>('fit');
  const [splitterRatio, setSplitterRatio] = useState(0.5);

  const [zipRunning, setZipRunning] = useState<null | {
    kind: ZipExportKind;
    progress: number;
  }>(null);

  const toggleLicenseGroup = useCallback((group: LicenseGroup) => {
    setLicenseFilter((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const licenseIncompatibleTypeNames = useMemo(
    () => incompatibleTypeNamesFor(props.state, props.catalog, licenseFilter),
    [props.state, props.catalog, licenseFilter],
  );
  const licenseIncompatibleCount = licenseIncompatibleTypeNames.length;

  const removeLicenseIncompatibleSelections = useCallback(() => {
    if (licenseIncompatibleTypeNames.length === 0) return;
    for (const tn of licenseIncompatibleTypeNames) {
      props.dispatch({ type: 'clear', typeName: tn });
    }
    setStatus({
      kind: 'info',
      text: t('licenseFilter.removed').replace('{n}', String(licenseIncompatibleTypeNames.length)),
    });
  }, [licenseIncompatibleTypeNames, props.dispatch, t]);

  const composeSingleItem = useCallback(
    async (singleSelections: Selections) => {
      const adapter = createBrowserCanvasAdapter(props.assetSource);
      return composeSelections(singleSelections, {
        catalog: props.catalog,
        adapter,
        spritesheetsBaseUrl: '',
        resolvePalette: makeResolvePalette(
          props.catalog,
          props.palettes,
          singleSelections,
        ),
      });
    },
    [props.catalog, props.palettes, props.assetSource],
  );

  const fullSheet: FullSheetUiState = {
    open: fullSheetOpen,
    grid: fullSheetGrid,
    mask: fullSheetMask,
    zoom: fullSheetZoom,
    splitterRatio,
  };
  const fullSheetActions: FullSheetUiActions = {
    setOpen: setFullSheetOpen,
    setGrid: setFullSheetGrid,
    setMask: setFullSheetMask,
    setZoom: setFullSheetZoom,
    setSplitterRatio,
  };

  const composeResult = useComposedCharacter(
    props.catalog,
    props.palettes,
    props.state,
    props.assetSource,
    reloadCounter,
  );
  const loadingProgress =
    composeResult.status === 'loading' ? composeResult.progress : null;

  const handleForceReload = () => {
    cacheClear();
    setReloadCounter((c) => c + 1);
    setStatus({ kind: 'info', text: t('reload.done') });
  };

  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(id);
  }, [status]);

  // Global ⌘K / Ctrl+K focuses the sidebar search input (selects existing text if any).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useUrlHashSync({
    state: props.state,
    dispatch: props.dispatch,
    catalog: props.catalog,
    palettes: props.palettes,
    t,
    onStatus: (text) => setStatus({ kind: 'info', text }),
  });

  useEffect(() => {
    if (props.initialHashWarnings.length === 0) return;
    setStatus({
      kind: 'warn',
      text: t('hashSync.skipped').replace(
        '{n}',
        String(props.initialHashWarnings.length),
      ),
    });
    // Run once on mount only:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePresetApplied = (name: string, skippedCount: number, skippedTypes: string[]) => {
    if (skippedCount === 0) {
      setStatus({ kind: 'info', text: `${props.t('preset.applied')} ${name}` });
    } else {
      const names = skippedTypes.map((tn) => props.tl.category(tn)).join(', ');
      const msg = props
        .t('preset.applied.skipped')
        .replace('{name}', name)
        .replace('{names}', names);
      setStatus({ kind: 'warn', text: msg });
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app text-text">
      <TopBar
        t={t}
        theme={theme}
        locale={locale}
        loadingProgress={loadingProgress}
        onToggleTheme={onToggleTheme}
        onToggleLocale={onToggleLocale}
      >
        <BodyTypePopover
          open={popover === 'bodyType'}
          setOpen={(v) => setPopover(v ? 'bodyType' : null)}
          state={props.state}
          dispatch={props.dispatch}
          catalog={props.catalog}
          t={props.t}
          tl={props.tl}
          onIncompatibilityWarning={(names) => {
            setStatus({
              kind: 'warn',
              text: `Incompatible: ${names.join(', ')}.`,
            });
          }}
        />
        <TokenPopover
          open={popover === 'token'}
          setOpen={(v) => setPopover(v ? 'token' : null)}
          state={props.state}
          dispatch={props.dispatch}
          catalog={props.catalog}
          t={props.t}
          onStatus={(text) => setStatus({ kind: 'info', text })}
        />
        <ResetMenuPopover
          open={popover === 'reset'}
          setOpen={(v) => setPopover(v ? 'reset' : null)}
          t={props.t}
          onReset={({ outfit, view, filters }) => {
            if (outfit || view) {
              props.onReset({ outfit, view });
            }
            if (filters) {
              setLicenseFilter(ALL_LICENSE_GROUPS);
            }
            setStatus({ kind: 'info', text: 'Reset ✓' });
          }}
        />
        <AttributionPopover
          open={popover === 'attribution'}
          setOpen={(v) => setPopover(v ? 'attribution' : null)}
          catalog={props.catalog}
          state={props.state}
          licenseFilter={licenseFilter}
          t={props.t}
          tl={props.tl}
        />
        <DownloadPopover
          open={popover === 'download'}
          setOpen={(v) => setPopover(v ? 'download' : null)}
          result={composeResult}
          anim={props.state.anim}
          selections={toSelections(props.state)}
          catalog={props.catalog}
          assetSource={props.assetSource}
          composeSingleItem={composeSingleItem}
          zipRunning={zipRunning}
          setZipRunning={setZipRunning}
          t={props.t}
          onStatus={(s) => setStatus(s)}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleForceReload}
          title={t('reload.title')}
          aria-label={t('reload.title')}
        >
          ↻
        </Button>
      </TopBar>
      <div className="relative grid min-h-0 flex-1 grid-cols-[340px_1fr]">
        <aside className="min-h-0 overflow-hidden border-r border-border bg-surface">
          <StackPanel
            catalog={props.catalog}
            palettes={props.palettes}
            state={props.state}
            dispatch={props.dispatch}
            shownTypeNames={props.shownTypeNames}
            licenseFilter={licenseFilter}
            toggleLicenseGroup={toggleLicenseGroup}
            licenseIncompatibleCount={licenseIncompatibleCount}
            removeLicenseIncompatibleSelections={removeLicenseIncompatibleSelections}
            assetSource={props.assetSource}
            setAssetSource={props.onAssetSourceChange}
            t={props.t}
            tl={props.tl}
            onPresetApplied={handlePresetApplied}
            status={status}
            expanded={expanded}
            setExpanded={setExpanded}
            searchInputRef={searchInputRef}
          />
        </aside>
        <main className="min-h-0 overflow-hidden bg-app">
          <PreviewPane
            catalog={props.catalog}
            state={props.state}
            dispatch={props.dispatch}
            t={t}
            result={composeResult}
            fullSheet={fullSheet}
            fullSheetActions={fullSheetActions}
          />
        </main>

      </div>
    </div>
  );
}
