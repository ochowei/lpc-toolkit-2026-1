import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { loadCatalogFromUpstream } from './catalog/load-catalog';
import { loadPalettesFromUpstream } from './catalog/load-palettes';
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

function useAppPathname(): [string, (path: AppPath) => void] {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: AppPath) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setPathname(window.location.pathname);
  }, []);

  return [pathname, navigate];
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

/** Root application shell that routes between landing, composer, and 404 pages. */
export default function App() {
  const [pathname, navigate] = useAppPathname();
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

  if (route === 'not-found') {
    return <NotFoundPage onNavigate={navigate} />;
  }

  return <LandingPage onNavigate={navigateToRoute} />;
}
