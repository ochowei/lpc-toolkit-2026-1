import { useMemo, useReducer, useState } from 'react';
import type { HashWarning } from '@lpc-toolkit/core';
import { loadCatalogFromUpstream } from './catalog/load-catalog';
import { loadPalettesFromUpstream } from './catalog/load-palettes';
import {
  pickInitialSelections,
  sliceReducer,
} from './slice/selection';
import { SliceHarness } from './components/slice-harness';
import {
  DEFAULT_LOCALE,
  createLabelTranslator,
  createTranslator,
  type Locale,
} from './i18n';
import type { AssetSource } from './adapter/asset-source';
import { shouldUseV1 } from './lib/should-use-v1';
import { LayerStackHarness } from './components/layer-stack/harness';
import {
  bootstrapStateFromHash,
  readWindowHash,
} from './lib/url-hash-sync';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [assetSource, setAssetSource] = useState<AssetSource>('auto');

  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const palettes = loadPalettesFromUpstream();
    const defaults = pickInitialSelections(catalog);
    const useV1 = shouldUseV1(window.location.search);
    const boot = useV1
      ? { state: defaults.state, warnings: [] as readonly HashWarning[] }
      : bootstrapStateFromHash({
          rawHash: readWindowHash(),
          catalog,
          palettes,
          defaults: defaults.state,
        });
    return {
      catalog,
      palettes,
      state: boot.state,
      warnings: boot.warnings,
      shownTypeNames: defaults.shownTypeNames,
    };
  }, []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const tl = useMemo(() => createLabelTranslator(locale), [locale]);

  const [state, dispatch] = useReducer(sliceReducer, init.state);

  const handleReset = (scopes: { outfit: boolean; view: boolean }) => {
    dispatch({ type: 'reset', scopes, init: init.state });
  };

  document.documentElement.className = `lpc ${theme}`;

  if (shouldUseV1(window.location.search)) {
    return (
      <SliceHarness
        catalog={init.catalog}
        palettes={init.palettes}
        shownTypeNames={init.shownTypeNames}
        state={state}
        dispatch={dispatch}
        theme={theme}
        locale={locale}
        assetSource={assetSource}
        t={t}
        tl={tl}
        onAssetSourceChange={setAssetSource}
        onReset={handleReset}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onToggleLocale={() =>
          setLocale((current) => (current === 'en' ? 'zh-TW' : 'en'))
        }
      />
    );
  }

  return (
    <LayerStackHarness
      catalog={init.catalog}
      palettes={init.palettes}
      shownTypeNames={init.shownTypeNames}
      initialHashWarnings={init.warnings}
      state={state}
      dispatch={dispatch}
      theme={theme}
      locale={locale}
      assetSource={assetSource}
      t={t}
      tl={tl}
      onAssetSourceChange={setAssetSource}
      onReset={handleReset}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      onToggleLocale={() =>
        setLocale((current) => (current === 'en' ? 'zh-TW' : 'en'))
      }
    />
  );
}
