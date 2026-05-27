import { useMemo, useReducer, useState } from 'react';
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
import type { AssetSource } from './adapter/asset-source';
import { defaultAssetSourceFromUrl } from './lib/asset-source-from-url';
import { LayerStackHarness } from './components/layer-stack/harness';
import {
  bootstrapStateFromHash,
  readWindowHash,
} from './lib/url-hash-sync';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [assetSource, setAssetSource] = useState<AssetSource>(
    () => defaultAssetSourceFromUrl(window.location.search, import.meta.env.DEV),
  );

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

  const handleReset = (scopes: { outfit: boolean; view: boolean }) => {
    dispatch({ type: 'reset', scopes, init: init.defaults });
  };

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
