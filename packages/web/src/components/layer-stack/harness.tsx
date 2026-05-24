import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Locale, Translator, LabelTranslator } from '../../i18n';
import type { AssetSource } from '../../adapter/asset-source';

export interface LayerStackHarnessProps {
  catalog: Catalog;
  palettes: PaletteMetadata;
  shownTypeNames: string[];
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

export function LayerStackHarness(_props: LayerStackHarnessProps) {
  return (
    <div className="lpc dark p-6 text-text">
      <h1 className="text-lg font-semibold">Layer Stack v2 (placeholder)</h1>
      <p className="text-text-mute text-sm">Wired in. Implementation lands in later tasks.</p>
    </div>
  );
}
