import { useMemo, useReducer, useState } from 'react';
import { loadCatalogFromUpstream } from './catalog/load-catalog';
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

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [assetSource, setAssetSource] = useState<AssetSource>('auto');

  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const { state, shownTypeNames } = pickInitialSelections(catalog);
    return { catalog, state, shownTypeNames };
  }, []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const tl = useMemo(() => createLabelTranslator(locale), [locale]);

  const [state, dispatch] = useReducer(sliceReducer, init.state);

  const handleReset = (scopes: { outfit: boolean; view: boolean }) => {
    dispatch({ type: 'reset', scopes, init: init.state });
  };

  document.documentElement.className = `lpc ${theme}`;

  return (
    <SliceHarness
      catalog={init.catalog}
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
