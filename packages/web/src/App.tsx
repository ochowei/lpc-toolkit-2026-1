import { useMemo, useReducer, useState } from 'react';
import { loadCatalogFromUpstream } from './catalog/load-catalog';
import {
  pickInitialSelections,
  sliceReducer,
} from './slice/selection';
import { SliceHarness } from './components/slice-harness';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const { state, shownTypeNames } = pickInitialSelections(catalog);
    return { catalog, state, shownTypeNames };
  }, []);

  const [state, dispatch] = useReducer(sliceReducer, init.state);

  document.documentElement.className = `lpc ${theme}`;

  return (
    <SliceHarness
      catalog={init.catalog}
      shownTypeNames={init.shownTypeNames}
      state={state}
      dispatch={dispatch}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    />
  );
}
