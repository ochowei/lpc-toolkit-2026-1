import { useState } from 'react';
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Locale, Translator, LabelTranslator } from '../../i18n';
import type { AssetSource } from '../../adapter/asset-source';
import type { LicenseFilter } from '../../slice/license-filter';
import { TopBar } from './top-bar';
import { PreviewPane } from './preview-pane';
import { StackPanel } from './stack-panel';

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

export function LayerStackHarness(props: LayerStackHarnessProps) {
  const { t, theme, locale, onToggleTheme, onToggleLocale } = props;
  const [licenseFilter] = useState<LicenseFilter>(null); // setLicenseFilter wires in Task 17

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app text-text">
      <TopBar
        t={t}
        theme={theme}
        locale={locale}
        onToggleTheme={onToggleTheme}
        onToggleLocale={onToggleLocale}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">
        <aside className="border-r border-border bg-surface">
          <StackPanel
            catalog={props.catalog}
            palettes={props.palettes}
            state={props.state}
            dispatch={props.dispatch}
            shownTypeNames={props.shownTypeNames}
            licenseFilter={licenseFilter}
            t={props.t}
            tl={props.tl}
          />
        </aside>
        <main className="bg-app">
          <PreviewPane
            catalog={props.catalog}
            palettes={props.palettes}
            state={props.state}
            dispatch={props.dispatch}
            assetSource={props.assetSource}
          />
        </main>
      </div>
    </div>
  );
}
