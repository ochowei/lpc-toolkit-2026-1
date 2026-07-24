import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { loadCatalogFromUpstream } from './catalog/load-catalog';
import { loadPalettesFromUpstream } from './catalog/load-palettes';
import {
  loadBrowserAssetPackBaseline,
  type BrowserAssetPackBaseline,
} from './lib/asset-pack-baseline';
import {
  pickInitialSelections,
  sliceReducer,
} from './slice/selection';
import {
  DEFAULT_LOCALE,
  createLabelTranslator,
  createTranslator,
  type Locale,
} from './i18n';
import { LayerStackHarness } from './components/layer-stack/harness';
import { runBrowserAssetPackConformance } from './lib/asset-pack-browser-conformance';
import { LandingPage } from './components/landing-page';
import { NotFoundPage } from './components/not-found-page';
import { AssetPackWorkbenchHarness } from './components/asset-pack-workbench/harness';
import { Button } from './components/ui/button';
import {
  bootstrapStateFromHash,
  readWindowHash,
} from './lib/url-hash-sync';
import {
  pathForRoute,
  routeFromPathname,
  type AppPath,
  type NavigableAppRoute,
} from './lib/app-route';
import type { NavigationBlocker } from './hooks/use-unsaved-work-guard';

interface LpcAssetPackConformanceProbe {
  readonly status: 'verified' | 'error';
  readonly archiveDigest?: string;
  readonly contentDigest?: string;
  readonly sourceDigest?: string;
  readonly diagnostics?: readonly unknown[];
  readonly message?: string;
}

declare global {
  interface Window {
    __LPC_ASSET_PACK_CONFORMANCE__?: LpcAssetPackConformanceProbe;
  }
}

export interface AppNavigationOwnerOptions {
  readonly initialPathname: string;
  readonly initialHistoryIndex?: number;
  readonly pushState: (path: string, historyIndex: number) => void;
  readonly setPathname: (path: string) => void;
  readonly restorePopState?: (delta: number) => void;
  readonly replaceState?: (path: string, historyIndex: number) => void;
  readonly blocker?: NavigationBlocker;
}

export interface AppNavigationOwner {
  readonly pathname: string;
  readonly navigate: (path: AppPath) => boolean;
  readonly handlePopState: (path: string, nextHistoryIndex?: number) => boolean;
}

export function createAppNavigationOwner(options: AppNavigationOwnerOptions): AppNavigationOwner {
  let pathname = options.initialPathname;
  let historyIndex = options.initialHistoryIndex ?? 0;
  let restoringPopState = false;
  const canLeave = () => options.blocker?.() ?? true;
  const navigate = (path: AppPath): boolean => {
    if (pathname === path) return true;
    if (!canLeave()) return false;
    historyIndex += 1;
    options.pushState(path, historyIndex);
    pathname = path;
    options.setPathname(path);
    return true;
  };
  const handlePopState = (path: string, nextHistoryIndex?: number): boolean => {
    if (restoringPopState && path === pathname && nextHistoryIndex === historyIndex) {
      restoringPopState = false;
      return true;
    }
    if (pathname === path) return true;
    if (!canLeave()) {
      const delta = nextHistoryIndex === undefined ? 0 : nextHistoryIndex - historyIndex;
      if (delta !== 0 && options.restorePopState) {
        restoringPopState = true;
        options.restorePopState(-delta);
      } else {
        options.replaceState?.(pathname, historyIndex);
      }
      options.setPathname(pathname);
      return false;
    }
    if (nextHistoryIndex !== undefined) historyIndex = nextHistoryIndex;
    pathname = path;
    options.setPathname(path);
    return true;
  };
  return {
    get pathname() { return pathname; },
    navigate,
    handlePopState,
  };
}

const appHistoryIndexKey = '__lpcToolkitHistoryIndex';

function readAppHistoryIndex(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const index = (value as { readonly [appHistoryIndexKey]?: unknown })[appHistoryIndexKey];
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : undefined;
}

function appHistoryState(historyIndex: number): { readonly [appHistoryIndexKey]: number } {
  return { [appHistoryIndexKey]: historyIndex };
}

function useAppPathname(): [string, (path: AppPath) => void, (blocker: NavigationBlocker) => () => void] {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const blockerRef = useRef<NavigationBlocker>();
  const ownerRef = useRef<AppNavigationOwner>();
  if (!ownerRef.current) {
    const initialHistoryIndex = readAppHistoryIndex(window.history.state) ?? 0;
    if (readAppHistoryIndex(window.history.state) === undefined && typeof window.history.replaceState === 'function') {
      window.history.replaceState(appHistoryState(initialHistoryIndex), '');
    }
    ownerRef.current = createAppNavigationOwner({
      initialPathname: pathname,
      initialHistoryIndex,
      pushState: (path, historyIndex) => window.history.pushState(appHistoryState(historyIndex), '', path),
      setPathname,
      restorePopState: (delta) => window.history.go(delta),
      replaceState: (path, historyIndex) => window.history.replaceState(appHistoryState(historyIndex), '', path),
      blocker: () => blockerRef.current?.() ?? true,
    });
  }
  const owner = ownerRef.current;

  useEffect(() => {
    const handlePopState = () => owner.handlePopState(window.location.pathname, readAppHistoryIndex(window.history.state));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [owner]);

  const navigate = useCallback((path: AppPath) => {
    owner.navigate(path);
  }, [owner]);

  const registerBlocker = useCallback((blocker: NavigationBlocker) => {
    blockerRef.current = blocker;
    return () => {
      if (blockerRef.current === blocker) blockerRef.current = undefined;
    };
  }, []);

  return [pathname, navigate, registerBlocker];
}

function ComposerApp({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const palettes = loadPalettesFromUpstream();
    const defaults = pickInitialSelections(catalog);
    const boot = bootstrapStateFromHash({
      rawHash: readWindowHash(),
      catalog,
      palettes,
      defaults: defaults.state,
    });
    return {
      catalog,
      palettes,
      state: boot.state,
      defaults: defaults.state,
      warnings: boot.warnings,
      shownTypeNames: defaults.shownTypeNames,
    };
  }, []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const tl = useMemo(() => createLabelTranslator(locale), [locale]);

  const [state, dispatch] = useReducer(sliceReducer, init.state);

  document.documentElement.className = `lpc ${theme}`;

  return (
    <LayerStackHarness
      catalog={init.catalog}
      palettes={init.palettes}
      shownTypeNames={init.shownTypeNames}
      initialHashWarnings={init.warnings}
      defaults={init.defaults}
      state={state}
      dispatch={dispatch}
      theme={theme}
      locale={locale}
      t={t}
      tl={tl}
      onNavigateHome={onNavigateHome}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      onToggleLocale={() =>
        setLocale((current) => (current === 'en' ? 'zh-TW' : 'en'))
      }
    />
  );
}

function AssetPackApp({
  onNavigateHome,
  registerNavigationBlocker,
  confirmNavigation,
}: {
  readonly onNavigateHome: () => void;
  readonly registerNavigationBlocker: (blocker: NavigationBlocker) => () => void;
  readonly confirmNavigation: (message: string) => boolean;
}) {
  const baselinePromise = useMemo(() => loadBrowserAssetPackBaseline(), []);
  const [baseline, setBaseline] = useState<BrowserAssetPackBaseline>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void baselinePromise.then(
      (loaded) => {
        if (active) setBaseline(loaded);
      },
      (reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [baselinePromise]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app px-5 text-text">
        <section className="w-full max-w-lg rounded-md border border-border bg-surface p-6">
          <h1 className="text-2xl font-semibold">Asset Pack Workbench</h1>
          <p className="mt-3 text-sm text-text-2">Unable to load the browser baseline: {error}</p>
          <Button variant="default" className="mt-6" onClick={onNavigateHome}>
            Back
          </Button>
        </section>
      </main>
    );
  }

  if (!baseline) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app px-5 text-text">
        <section className="w-full max-w-lg rounded-md border border-border bg-surface p-6">
          <h1 className="text-2xl font-semibold">Asset Pack Workbench</h1>
          <p className="mt-3 text-sm text-text-2">Loading the pinned browser baseline…</p>
        </section>
      </main>
    );
  }

  return <AssetPackWorkbenchHarness
    baseline={baseline}
    onNavigateBack={onNavigateHome}
    registerNavigationBlocker={registerNavigationBlocker}
    confirmNavigation={confirmNavigation}
  />;
}

/** Root application shell that routes between landing, composer, and 404 pages. */
export interface AppProps {
  readonly confirmNavigation?: (message: string) => boolean;
}

export default function App({ confirmNavigation }: AppProps = {}) {
  const defaultConfirmNavigation = useCallback((message: string) => window.confirm(message), []);
  const activeConfirmNavigation = confirmNavigation ?? defaultConfirmNavigation;
  const [pathname, navigate, registerNavigationBlocker] = useAppPathname();
  const route = routeFromPathname(pathname);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('assetPackConformance') !== '1') {
      delete window.__LPC_ASSET_PACK_CONFORMANCE__;
      return;
    }

    void runBrowserAssetPackConformance()
      .then((result) => {
        window.__LPC_ASSET_PACK_CONFORMANCE__ = result;
      })
      .catch((error: unknown) => {
        window.__LPC_ASSET_PACK_CONFORMANCE__ = {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
      });
  }, []);

  document.documentElement.className = 'lpc dark';

  const navigateToRoute = (routeName: NavigableAppRoute) => {
    navigate(pathForRoute(routeName));
  };

  if (route === 'compose') {
    return <ComposerApp onNavigateHome={() => navigateToRoute('landing')} />;
  }

  if (route === 'asset-packs') {
    return <AssetPackApp
      onNavigateHome={() => navigateToRoute('landing')}
      registerNavigationBlocker={registerNavigationBlocker}
      confirmNavigation={activeConfirmNavigation}
    />;
  }

  if (route === 'not-found') {
    return <NotFoundPage onNavigate={navigate} />;
  }

  return <LandingPage onNavigate={navigateToRoute} />;
}
