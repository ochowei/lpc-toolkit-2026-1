import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  serializeHash,
  type AnimationName,
  type Catalog,
  type HashWarning,
  type LicenseGroup,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { e2eProbeFromUrl } from '../../lib/e2e-probe-from-url';
import {
  isCompositionChangingAction,
  isCompositionLocked,
} from '../../lib/composition-lock';
import type {
  FullSheetUiState,
  FullSheetUiActions,
  FullSheetZoom,
} from './preview-pane';
import { useUrlHashSync } from '../../lib/url-hash-sync';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Locale, Translator, LabelTranslator } from '../../i18n';
import {
  ALL_LICENSE_GROUPS,
  incompatibleTypeNamesFor,
  type LicenseFilter,
} from '../../slice/license-filter';
import {
  incompatibleAnimationTypeNamesFor,
  type AnimationFilter,
} from '../../slice/animation-filter';
import { TopBar } from './top-bar';
import { PreviewPane } from './preview-pane';
import { StackPanel } from './stack-panel';
import { BodyTypePopover } from './popovers/body-type-popover';
import { TokenPopover } from './popovers/token-popover';
import { AttributionPopover } from './popovers/attribution-popover';
import { DownloadPopover } from './popovers/download-popover';
import { MoreMenuPopover } from './popovers/more-menu-popover';
import { summarizeAttribution } from './popovers/attribution-summary';
import { StatusToast } from './status-toast';
import { cacheClear } from '../../hooks/thumbnail-cache';
import {
  useComposedCharacter,
  type ComposedResult,
} from '../../hooks/use-composed-character';
import {
  readMediaQuery,
  useMediaQuery,
} from '../../hooks/use-media-query';
import { Button } from '../ui/button';
import { useSingleItemComposer } from '../../hooks/use-single-item-composer';
import { toSelections } from '../../slice/selection';
import { buildUpstreamUrl } from '../../lib/upstream-url';
import type { ZipExportKind } from '../../lib/zip-export';
import {
  loadCustomOverlayImage,
  parseCustomOverlayZPos,
  type CustomOverlay,
} from '../../lib/custom-overlay';
import {
  MobileBottomNav,
  type MobileView,
} from './mobile-bottom-nav';
import { SidebarSplitter } from './sidebar-splitter';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_SPLITTER_WIDTH,
  clampSidebarWidth,
  getRenderedSidebarMax,
  loadSidebarWidth,
  saveSidebarWidth,
} from '../../lib/sidebar-width';
import {
  loadReplacementCardDisplayMode,
  saveReplacementCardDisplayMode,
  type ReplacementCardDisplayMode,
} from '../../lib/replacement-card-display-mode';

interface LpcE2eProbe {
  readonly hash: string;
  readonly bodyType: string;
  readonly status: ComposedResult['status'];
  readonly creditsCount: number;
  readonly layers: readonly {
    readonly path: string;
    readonly zPos: number;
    readonly typeName: string;
  }[];
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly dataUrl: string;
  } | null;
}

declare global {
  interface Window {
    __LPC_E2E__?: LpcE2eProbe;
  }
}

/** Top-level web UI dependencies and state passed from App into the layer stack. */
export interface LayerStackHarnessProps {
  catalog: Catalog;
  palettes: PaletteMetadata;
  shownTypeNames: TypeName[];
  initialHashWarnings: readonly HashWarning[];
  defaults: SliceState;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  locale: Locale;
  t: Translator;
  tl: LabelTranslator;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}

function browserLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Coordinates layer state, composition hooks, popovers, filters, and responsive layout. */
export function LayerStackHarness(props: LayerStackHarnessProps) {
  const { t, theme, locale, onToggleTheme, onToggleLocale } = props;
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(ALL_LICENSE_GROUPS);
  const [animationFilter, setAnimationFilter] = useState<AnimationFilter>(
    () => new Set<AnimationName>(),
  );
  const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'attribution' | 'download' | 'more'>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const moreMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState<TypeName | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [fullSheetGrid, setFullSheetGrid] = useState(false);
  const [fullSheetMask, setFullSheetMask] = useState(false);
  const [fullSheetZoom, setFullSheetZoom] = useState<FullSheetZoom>('fit');
  const [splitterRatio, setSplitterRatio] = useState(0.5);
  const [customOverlay, setCustomOverlay] = useState<CustomOverlay | null>(null);
  const [customOverlayZPos, setCustomOverlayZPos] = useState(0);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [mobileView, setMobileView] = useState<MobileView>('preview');
  const [
    replacementCardDisplayMode,
    setReplacementCardDisplayMode,
  ] = useState<ReplacementCardDisplayMode>(() =>
    loadReplacementCardDisplayMode(browserLocalStorage()),
  );

  const changeReplacementCardDisplayMode = useCallback(
    (mode: ReplacementCardDisplayMode) => {
      setReplacementCardDisplayMode(mode);
      saveReplacementCardDisplayMode(browserLocalStorage(), mode);
    },
    [],
  );

  const [preferredSidebarWidth, setPreferredSidebarWidth] = useState(() => {
    if (
      typeof window === 'undefined' ||
      !readMediaQuery('(min-width: 768px)', window.matchMedia)
    ) {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    return loadSidebarWidth(browserLocalStorage());
  });
  const preferredSidebarWidthRef = useRef(preferredSidebarWidth);
  preferredSidebarWidthRef.current = preferredSidebarWidth;
  const [dragSidebarWidth, setDragSidebarWidth] = useState<number | null>(null);
  const dragSidebarWidthRef = useRef<number | null>(null);
  const sidebarHydratedRef = useRef(
    typeof window !== 'undefined' &&
      readMediaQuery('(min-width: 768px)', window.matchMedia),
  );
  const [viewportWidth, setViewportWidth] = useState(() => {
    return typeof window === 'undefined' ? 1280 : window.innerWidth;
  });
  const renderedSidebarMax = getRenderedSidebarMax(viewportWidth);
  const renderedSidebarWidth = clampSidebarWidth(
    dragSidebarWidth ?? preferredSidebarWidth,
    renderedSidebarMax,
  );

  const [zipRunning, setZipRunning] = useState<null | {
    kind: ZipExportKind;
    progress: number;
  }>(null);

  useEffect(() => {
    if (!isDesktop) {
      dragSidebarWidthRef.current = null;
      setDragSidebarWidth(null);
      return;
    }

    if (!sidebarHydratedRef.current) {
      sidebarHydratedRef.current = true;
      setPreferredSidebarWidth(loadSidebarWidth(browserLocalStorage()));
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;

    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);
    return () => {
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, [isDesktop]);

  const changeSidebarWidth = useCallback((nextWidth: number) => {
    dragSidebarWidthRef.current = nextWidth;
    setDragSidebarWidth(nextWidth);
  }, []);

  const commitSidebarWidth = useCallback(() => {
    const committedWidth =
      dragSidebarWidthRef.current ?? preferredSidebarWidthRef.current;
    dragSidebarWidthRef.current = null;
    setDragSidebarWidth(null);
    setPreferredSidebarWidth(committedWidth);
    saveSidebarWidth(browserLocalStorage(), committedWidth);
  }, []);

  const cancelSidebarWidth = useCallback(() => {
    dragSidebarWidthRef.current = null;
    setDragSidebarWidth(null);
  }, []);

  const resetSidebarWidth = useCallback(() => {
    dragSidebarWidthRef.current = null;
    setDragSidebarWidth(null);
    setPreferredSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    saveSidebarWidth(browserLocalStorage(), DEFAULT_SIDEBAR_WIDTH);
  }, []);

  const toggleLicenseGroup = useCallback((group: LicenseGroup) => {
    setLicenseFilter((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const toggleAnimation = useCallback((anim: AnimationName) => {
    setAnimationFilter((prev) => {
      const next = new Set(prev);
      if (next.has(anim)) next.delete(anim);
      else next.add(anim);
      return next;
    });
  }, []);

  const licenseIncompatibleTypeNames = useMemo(
    () => incompatibleTypeNamesFor(props.state, props.catalog, licenseFilter),
    [props.state, props.catalog, licenseFilter],
  );
  const licenseIncompatibleCount = licenseIncompatibleTypeNames.length;

  const animationIncompatibleTypeNames = useMemo(
    () => incompatibleAnimationTypeNamesFor(props.state, props.catalog, animationFilter),
    [props.state, props.catalog, animationFilter],
  );
  const animationIncompatibleCount = animationIncompatibleTypeNames.length;

  const attributionSummary = useMemo(
    () => summarizeAttribution(props.catalog, props.state, licenseFilter, animationFilter),
    [props.catalog, props.state.selections, licenseFilter, animationFilter],
  );

  const { composeSingleItem, composeSingleItemLayer } =
    useSingleItemComposer(props.catalog, props.palettes);

  const composeResult = useComposedCharacter(
    props.catalog,
    props.palettes,
    props.state,
    reloadCounter,
    customOverlay,
  );
  const isComposing = isCompositionLocked(composeResult.status);
  const isComposingRef = useRef(isComposing);
  isComposingRef.current = isComposing;

  const removeLicenseIncompatibleSelections = useCallback(() => {
    if (isComposing) return;
    if (licenseIncompatibleTypeNames.length === 0) return;
    for (const tn of licenseIncompatibleTypeNames) {
      props.dispatch({ type: 'clear', typeName: tn });
    }
    setStatus({
      kind: 'info',
      text: t('licenseFilter.removed').replace('{n}', String(licenseIncompatibleTypeNames.length)),
    });
  }, [isComposing, licenseIncompatibleTypeNames, props.dispatch, t]);

  const removeAnimationIncompatibleSelections = useCallback(() => {
    if (isComposing) return;
    if (animationIncompatibleTypeNames.length === 0) return;
    for (const tn of animationIncompatibleTypeNames) {
      props.dispatch({ type: 'clear', typeName: tn });
    }
    setStatus({
      kind: 'info',
      text: t('animationFilter.removed').replace('{n}', String(animationIncompatibleTypeNames.length)),
    });
  }, [animationIncompatibleTypeNames, isComposing, props.dispatch, t]);

  const clearCustomOverlay = useCallback(() => {
    if (isComposing) return;
    setCustomOverlay((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    setCustomOverlayZPos(0);
    setStatus({ kind: 'info', text: t('advancedTools.cleared') });
  }, [isComposing, t]);

  const handleCustomOverlayZPosChange = useCallback((raw: string) => {
    if (isComposing) return;
    const zPos = parseCustomOverlayZPos(raw);
    setCustomOverlayZPos(zPos);
    setCustomOverlay((prev) => (prev ? { ...prev, zPos } : prev));
  }, [isComposing]);

  const handleCustomOverlayUpload = useCallback(
    async (file: File) => {
      if (isComposing) return;
      try {
        const loaded = await loadCustomOverlayImage({
          file,
          zPos: customOverlayZPos,
        });
        if (isComposingRef.current) {
          if (!('ok' in loaded)) URL.revokeObjectURL(loaded.objectUrl);
          return;
        }
        if ('ok' in loaded) {
          setStatus({
            kind: 'error',
            text: t('advancedTools.invalidSize')
              .replace('{width}', String(loaded.width))
              .replace('{height}', String(loaded.height)),
          });
          return;
        }
        setCustomOverlay((prev) => {
          if (prev) URL.revokeObjectURL(prev.objectUrl);
          return loaded;
        });
        setStatus({
          kind: 'info',
          text: t('advancedTools.loaded').replace('{name}', loaded.fileName),
        });
      } catch (error) {
        console.error('Custom overlay upload failed:', error);
        setStatus({ kind: 'error', text: t('download.failed') });
      }
    },
    [customOverlayZPos, isComposing, t],
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

  const guardedDispatch = useCallback(
    (action: SliceAction): boolean => {
      if (isComposing && isCompositionChangingAction(action)) return false;
      props.dispatch(action);
      return true;
    },
    [isComposing, props.dispatch],
  );
  const loadingProgress =
    composeResult.status === 'loading' ? composeResult.progress : null;
  const e2eProbeEnabled =
    typeof window !== 'undefined' && e2eProbeFromUrl(window.location.search);
  const emptyDownloadCreditsProbeEnabled =
    e2eProbeEnabled &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('emptyDownloadCredits') ===
      '1';
  const downloadResult = useMemo<ComposedResult>(() => {
    if (
      !emptyDownloadCreditsProbeEnabled ||
      composeResult.status !== 'ready' ||
      !composeResult.sheet
    ) {
      return composeResult;
    }

    // E2E-only: exercise the real download controls without mutating composition.
    return {
      ...composeResult,
      sheet: {
        ...composeResult.sheet,
        credits: { entries: [], resolvedPaths: [], licenses: [] },
      },
    };
  }, [composeResult, emptyDownloadCreditsProbeEnabled]);
  const canonicalHash = useMemo(
    () => serializeHash(toSelections(props.state)),
    [props.state.bodyType, props.state.selections],
  );

  const upstreamHref = useMemo(
    () => buildUpstreamUrl(canonicalHash),
    [canonicalHash],
  );

  useEffect(() => {
    if (!e2eProbeEnabled) {
      delete window.__LPC_E2E__;
      return;
    }

    const sheet = composeResult.sheet;
    window.__LPC_E2E__ = {
      hash: canonicalHash,
      bodyType: props.state.bodyType,
      status: composeResult.status,
      creditsCount: sheet?.credits.entries.length ?? 0,
      layers:
        sheet?.layers.map((layer) => ({
          path: layer.path,
          zPos: layer.zPos,
          typeName: layer.typeName,
        })) ?? [],
      canvas:
        sheet && composeResult.status === 'ready'
          ? {
              width: sheet.width,
              height: sheet.height,
              dataUrl: (sheet.canvas as unknown as HTMLCanvasElement).toDataURL(),
            }
          : null,
    };
  }, [
    canonicalHash,
    composeResult.status,
    composeResult.sheet,
    e2eProbeEnabled,
    props.state.bodyType,
  ]);

  const handleForceReload = () => {
    if (isComposing) return;
    cacheClear();
    setReloadCounter((c) => c + 1);
    setStatus({ kind: 'info', text: t('reload.done') });
  };

  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(id);
  }, [status]);

  useEffect(() => {
    return () => {
      setCustomOverlay((prev) => {
        if (prev) URL.revokeObjectURL(prev.objectUrl);
        return null;
      });
    };
  }, []);

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
    defaults: props.defaults,
    dispatch: guardedDispatch,
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

  const handleReset = ({ outfit, view, filters }: { outfit: boolean; view: boolean; filters: boolean }) => {
    const allowedOutfit = outfit && !isComposing;
    if (allowedOutfit) {
      clearCustomOverlay();
    }
    if (allowedOutfit || view) {
      guardedDispatch({
        type: 'reset',
        scopes: { outfit: allowedOutfit, view },
        init: props.defaults,
      });
    }
    if (filters) {
      setLicenseFilter(ALL_LICENSE_GROUPS);
      setAnimationFilter(new Set<AnimationName>());
    }
    setStatus({ kind: 'info', text: 'Reset ✓' });
  };

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

  const stackPanel = (
    <StackPanel
      disabled={isComposing}
      catalog={props.catalog}
      palettes={props.palettes}
      state={props.state}
      dispatch={guardedDispatch}
      shownTypeNames={props.shownTypeNames}
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
      onCustomOverlayUpload={handleCustomOverlayUpload}
      onCustomOverlayZPosChange={handleCustomOverlayZPosChange}
      onClearCustomOverlay={clearCustomOverlay}
      t={props.t}
      tl={props.tl}
      onPresetApplied={handlePresetApplied}
      onReset={handleReset}
      status={isDesktop ? status : null}
      expanded={expanded}
      setExpanded={setExpanded}
      searchInputRef={searchInputRef}
      replacementCardDisplayMode={replacementCardDisplayMode}
      onReplacementCardDisplayModeChange={changeReplacementCardDisplayMode}
    />
  );

  const previewPane = (
    <PreviewPane
      state={props.state}
      dispatch={guardedDispatch}
      t={t}
      result={composeResult}
      fullSheet={fullSheet}
      fullSheetActions={fullSheetActions}
    />
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app text-text">
      <TopBar
        t={t}
        loadingProgress={loadingProgress}
        upstreamHref={upstreamHref}
        rightSlot={
          <MoreMenuPopover
            open={popover === 'more'}
            setOpen={(v) => setPopover(v ? 'more' : null)}
            t={props.t}
            locale={locale}
            theme={theme}
            attributionCount={attributionSummary.sourceCount}
            attributionIncompatible={attributionSummary.incompatibleAny}
            onSelect={(target) => setPopover(target)}
            onToggleLocale={onToggleLocale}
            onToggleTheme={onToggleTheme}
            anchorRefOut={moreMenuAnchorRef}
          />
        }
      >
        <BodyTypePopover
          open={popover === 'bodyType'}
          setOpen={(v) => setPopover(v ? 'bodyType' : null)}
          state={props.state}
          dispatch={guardedDispatch}
          disabled={isComposing}
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
          dispatch={guardedDispatch}
          disabled={isComposing}
          catalog={props.catalog}
          t={props.t}
          onStatus={(text) => setStatus({ kind: 'info', text })}
          anchorRef={moreMenuAnchorRef}
        />
        <AttributionPopover
          open={popover === 'attribution'}
          setOpen={(v) => setPopover(v ? 'attribution' : null)}
          catalog={props.catalog}
          credits={
            composeResult.status === 'ready' && composeResult.sheet
              ? composeResult.sheet.credits
              : null
          }
          state={props.state}
          licenseFilter={licenseFilter}
          animationFilter={animationFilter}
          t={props.t}
          tl={props.tl}
          anchorRef={moreMenuAnchorRef}
        />
        <DownloadPopover
          open={popover === 'download'}
          setOpen={(v) => setPopover(v ? 'download' : null)}
          result={downloadResult}
          anim={props.state.anim}
          selections={toSelections(props.state)}
          catalog={props.catalog}
          composeSingleItem={composeSingleItem}
          composeSingleItemLayer={composeSingleItemLayer}
          customOverlay={customOverlay}
          zipRunning={zipRunning}
          setZipRunning={setZipRunning}
          t={props.t}
          tl={props.tl}
          onStatus={(s) => setStatus(s)}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleForceReload}
          disabled={isComposing}
          title={t('reload.title')}
          aria-label={t('reload.title')}
        >
          ↻
        </Button>
      </TopBar>
      {isDesktop ? (
        <div
          className="relative grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `${renderedSidebarWidth}px ${SIDEBAR_SPLITTER_WIDTH}px minmax(0, 1fr)`,
          }}
        >
          <aside className="min-h-0 overflow-hidden bg-surface">
            {stackPanel}
          </aside>
          <SidebarSplitter
            value={renderedSidebarWidth}
            min={MIN_SIDEBAR_WIDTH}
            max={renderedSidebarMax}
            onChange={changeSidebarWidth}
            onCommit={commitSidebarWidth}
            onCancel={cancelSidebarWidth}
            onReset={resetSidebarWidth}
          />
          <main className="min-h-0 overflow-hidden bg-app">
            {previewPane}
          </main>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-hidden bg-app">
            {mobileView === 'preview' ? previewPane : stackPanel}
          </main>
          <StatusToast status={status} />
          <MobileBottomNav value={mobileView} onChange={setMobileView} t={props.t} />
        </div>
      )}
    </div>
  );
}
