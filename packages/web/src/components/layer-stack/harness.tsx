import { useEffect, useState } from 'react';
import type { Catalog, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Locale, Translator, LabelTranslator } from '../../i18n';
import type { AssetSource } from '../../adapter/asset-source';
import type { LicenseFilter } from '../../slice/license-filter';
import { TopBar } from './top-bar';
import { PreviewPane } from './preview-pane';
import { StackPanel } from './stack-panel';
import { BodyTypePopover } from './popovers/body-type-popover';
import { TokenPopover } from './popovers/token-popover';
import { ResetMenuPopover } from './popovers/reset-menu-popover';
import { AttributionPopover } from './popovers/attribution-popover';
import { PaletteTrigger } from './palette-trigger';
import { AdvancedPalette } from './advanced-palette';
import { cacheClear } from '../../hooks/thumbnail-cache';
import { Button } from '../ui/button';

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
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(null);
  const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'reset' | 'attribution'>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [expanded, setExpanded] = useState<TypeName | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

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

  // Global ⌘K / Ctrl+K toggles the advanced palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
              setLicenseFilter(null);
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
        <PaletteTrigger onOpen={() => setPaletteOpen(true)} t={t} />
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
            setLicenseFilter={setLicenseFilter}
            assetSource={props.assetSource}
            setAssetSource={props.onAssetSourceChange}
            t={props.t}
            tl={props.tl}
            onPresetApplied={handlePresetApplied}
            status={status}
            expanded={expanded}
            setExpanded={setExpanded}
            onOpenPalette={() => setPaletteOpen(true)}
          />
        </aside>
        <main className="min-h-0 overflow-hidden bg-app">
          <PreviewPane
            catalog={props.catalog}
            palettes={props.palettes}
            state={props.state}
            dispatch={props.dispatch}
            assetSource={props.assetSource}
            reloadCounter={reloadCounter}
          />
        </main>
        <AdvancedPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onPicked={(tn) => {
            setPaletteOpen(false);
            setExpanded(tn);
          }}
          state={props.state}
          dispatch={props.dispatch}
          catalog={props.catalog}
          palettes={props.palettes}
          assetSource={props.assetSource}
          shownTypeNames={props.shownTypeNames}
          licenseFilter={licenseFilter}
          t={t}
          tl={props.tl}
        />
      </div>
    </div>
  );
}
