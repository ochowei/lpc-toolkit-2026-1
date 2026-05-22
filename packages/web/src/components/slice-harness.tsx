import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  ANIMATION_CONFIGS,
  BODY_TYPES,
  computeEffectiveLicense,
  decodeSelectionToken,
  encodeSelectionToken,
  LICENSE_CONFIG,
  type Catalog,
  type Direction,
  type ItemDefinition,
  type License,
} from '@lpc-toolkit/core';
import {
  toSelections,
  type SliceState,
  type SliceAction,
} from '../slice/selection';
import {
  itemMatchesLicenseFilter,
  licenseExceedsFilter,
  type LicenseFilter,
} from '../slice/license-filter';
import {
  buildCatalogTree,
  itemSupportsBodyType,
  type CatalogTreeItem,
  type CatalogTreeNode,
} from '../slice/catalog-tree';
import { useComposedCharacter } from '../hooks/use-composed-character';
import { useAnimationPlayer } from '../hooks/use-animation-player';
import { Button } from './ui/button';
import type { Locale, TranslationKey, Translator } from '../i18n';
import type { AssetSource } from '../adapter/asset-source';

const DIRS: Direction[] = ['up', 'left', 'down', 'right'];
const DIR_LABELS: Record<Direction, TranslationKey> = {
  up: 'direction.up',
  left: 'direction.left',
  down: 'direction.down',
  right: 'direction.right',
};
const ASSET_SOURCE_LABELS: Record<AssetSource, TranslationKey> = {
  auto: 'assetSource.auto',
  local: 'assetSource.local',
  upstream: 'assetSource.upstream',
};
const ZOOM = 4;
const LICENSE_OPTIONS: readonly License[] = LICENSE_CONFIG.flatMap(
  (group) => group.versions,
);
const RESET_SCOPE_DEFAULTS = { outfit: true, view: false, filters: false };

export function SliceHarness({
  catalog,
  shownTypeNames,
  state,
  dispatch,
  theme,
  locale,
  assetSource,
  t,
  onAssetSourceChange,
  onReset,
  onToggleTheme,
  onToggleLocale,
}: {
  catalog: Catalog;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  locale: Locale;
  assetSource: AssetSource;
  t: Translator;
  onAssetSourceChange: (source: AssetSource) => void;
  onReset: (scopes: { outfit: boolean; view: boolean }) => void;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const catalogTree = useMemo(() => buildCatalogTree(catalog), [catalog]);
  const itemByTypeAndName = useMemo(() => {
    const map = new Map<string, ItemDefinition>();
    for (const [typeName, items] of catalog.byTypeName.entries()) {
      for (const item of items) {
        map.set(`${typeName}:${item.name}`, item);
      }
    }
    return map;
  }, [catalog]);
  const deferredAssetSearch = useDeferredValue(assetSearch);
  const result = useComposedCharacter(catalog, state, assetSource);
  useAnimationPlayer(
    canvasRef,
    result.animation,
    state.dir,
    state.playing,
    ZOOM,
  );

  const animNames = useMemo(
    () =>
      (result.sheet?.animations ?? []).filter(
        (a) => a in ANIMATION_CONFIGS,
      ),
    [result.sheet],
  );

  const failed = result.status === 'error';
  const currentToken = useMemo(
    () => encodeSelectionToken(toSelections(state)),
    [state],
  );
  const effectiveLicense = useMemo(
    () =>
      result.sheet && result.sheet.credits.licenses.length > 0
        ? computeEffectiveLicense(result.sheet.credits)
        : null,
    [result.sheet],
  );
  const effectiveLicenseExceedsFilter =
    effectiveLicense !== null &&
    licenseExceedsFilter(effectiveLicense, licenseFilter);

  async function copyToken(): Promise<void> {
    try {
      await navigator.clipboard.writeText(currentToken);
      setTokenError(null);
      setTokenStatus(t('token.copied'));
    } catch {
      setTokenStatus(null);
      setTokenError(t('token.copyFailed'));
    }
  }

  function applyToken(): void {
    try {
      const decoded = decodeSelectionToken(tokenInput, catalog);
      if (decoded.warnings.length > 0) {
        setTokenStatus(null);
        setTokenError(t('token.unresolved'));
        return;
      }
      dispatch({ type: 'apply_selections', selections: decoded.selections });
      setTokenInput('');
      setTokenError(null);
      setTokenStatus(t('token.applied'));
    } catch {
      setTokenStatus(null);
      setTokenError(t('token.invalid'));
    }
  }

  function pickTreeItem(item: CatalogTreeItem): void {
    const def = itemByTypeAndName.get(`${item.typeName}:${item.name}`);
    dispatch({
      type: 'pick',
      typeName: item.typeName,
      name: item.name,
      ...(def?.variants?.[0] ? { variant: def.variants[0] } : {}),
    });
  }

  function treeItemMatches(item: CatalogTreeItem, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (q === '') return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.typeName.toLowerCase().includes(q)
    );
  }

  function nodeHasMatches(node: CatalogTreeNode, query: string): boolean {
    return (
      node.items.some((item) => treeItemMatches(item, query)) ||
      Object.values(node.children).some((child) => nodeHasMatches(child, query))
    );
  }

  function renderTreeNode(node: CatalogTreeNode, depth = 0): React.ReactNode {
    const query = deferredAssetSearch.trim();
    if (query && !nodeHasMatches(node, query)) return null;

    const entries = Object.values(node.children);
    const visibleItems = node.items.filter((item) =>
      treeItemMatches(item, query),
    );
    const showHeader = node.name !== 'root';

    return (
      <div key={node.name} className={depth > 0 ? 'ml-3' : undefined}>
        {showHeader && (
          <details className="group" open={query !== '' || depth < 1}>
            <summary className="cursor-pointer py-1 text-xs font-semibold text-text-mute hover:text-text">
              {node.name}
            </summary>
            <div className="space-y-1">
              {entries.map((child) => renderTreeNode(child, depth + 1))}
              {visibleItems.map((item) => {
                const def = itemByTypeAndName.get(
                  `${item.typeName}:${item.name}`,
                );
                const compatible = def
                  ? itemSupportsBodyType(def, state.bodyType)
                  : false;
                const selected =
                  state.selections[item.typeName]?.name === item.name;
                return (
                  <button
                    key={`${item.typeName}:${item.name}`}
                    type="button"
                    disabled={!compatible}
                    title={
                      !compatible
                        ? t('picker.incompatibleBodyType')
                        : item.typeName
                    }
                    className={`block w-full rounded px-2 py-1 text-left text-xs ${
                      selected
                        ? 'bg-accent text-accent-contrast'
                        : compatible
                          ? 'text-text hover:bg-surface-2'
                          : 'text-text-dim opacity-60'
                    }`}
                    onClick={() => pickTreeItem(item)}
                  >
                    <span>{item.name}</span>
                    <span className="ml-1 text-[10px] text-text-dim">
                      {item.typeName}
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        )}
        {!showHeader && (
          <div className="space-y-1">
            {entries.map((child) => renderTreeNode(child, depth + 1))}
            {visibleItems.map((item) => (
              <button
                key={`${item.typeName}:${item.name}`}
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-2"
                onClick={() => pickTreeItem(item)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-app text-text">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-bold">
          LPC<span className="text-text-mute">·Toolkit</span>
        </span>
        <span className="text-text-dim text-xs">{t('app.subtitle')}</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onToggleLocale}>
          {locale === 'en'
            ? t('language.toChinese')
            : t('language.toEnglish')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggleTheme}>
          {theme === 'dark' ? t('theme.light') : t('theme.dark')}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_300px]">
        {/* Left: pickers */}
        <aside className="scroll border-r border-border p-3 space-y-3">
          <ResetMenu
            t={t}
            onReset={onReset}
            onResetLicenseFilter={() => setLicenseFilter(null)}
            onResetSearch={() => setAssetSearch('')}
          />
          <section className="space-y-1 border-b border-border pb-3 text-xs">
            <div className="text-text-mute uppercase">
              {t('assetSource.title')}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(['auto', 'local', 'upstream'] as const).map((source) => (
                <Button
                  key={source}
                  size="sm"
                  variant={assetSource === source ? 'primary' : 'ghost'}
                  aria-pressed={assetSource === source}
                  onClick={() => onAssetSourceChange(source)}
                >
                  {t(ASSET_SOURCE_LABELS[source])}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-text-dim">
              {assetSource === 'auto'
                ? t('assetSource.autoHelp')
                : assetSource === 'local'
                  ? t('assetSource.localHelp')
                  : t('assetSource.upstreamHelp')}
            </p>
          </section>

          <label className="block text-xs">
            <span className="text-text-mute uppercase">
              {t('picker.licenseFilter')}
            </span>
            <select
              className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
              value={licenseFilter ?? ''}
              onChange={(e) =>
                setLicenseFilter(
                  e.target.value === '' ? null : (e.target.value as License),
                )
              }
            >
              <option value="">{t('picker.allLicenses')}</option>
              {LICENSE_OPTIONS.map((license) => (
                <option key={license} value={license}>
                  {license}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs">
            <span className="text-text-mute uppercase">
              {t('picker.bodyType')}
            </span>
            <select
              className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
              value={state.bodyType}
              onChange={(e) =>
                dispatch({ type: 'set_body_type', bodyType: e.target.value })
              }
            >
              {BODY_TYPES.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </label>

          <section className="space-y-3 border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase">
              {t('picker.common')}
            </h2>
            {shownTypeNames.map((tn) => {
              const items = catalog.byTypeName.get(tn) ?? [];
              const selectedName = state.selections[tn]?.name ?? '';
              const filteredItems = items.filter((it) =>
                itemMatchesLicenseFilter(it, licenseFilter),
              );
              const selectedItem = selectedName
                ? items.find((it) => it.name === selectedName)
                : undefined;
              const shownItems =
                selectedItem &&
                !filteredItems.some((it) => it.name === selectedItem.name)
                  ? [...filteredItems, selectedItem]
                  : filteredItems;
              return (
                <label key={tn} className="block text-xs">
                  <span className="text-text-mute uppercase">{tn}</span>
                  <select
                    className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
                    value={selectedName}
                    onChange={(e) => {
                      const name = e.target.value;
                      if (!name) {
                        dispatch({ type: 'clear', typeName: tn });
                        return;
                      }
                      const item = items.find((it) => it.name === name);
                      dispatch({
                        type: 'pick',
                        typeName: tn,
                        name,
                        ...(item?.variants?.[0]
                          ? { variant: item.variants[0] }
                          : {}),
                      });
                    }}
                  >
                    <option value="">— {t('picker.none')} —</option>
                    {shownItems.map((it) => (
                      <option key={it.name} value={it.name}>
                        {it.name}
                        {licenseFilter &&
                        selectedName === it.name &&
                        !itemMatchesLicenseFilter(it, licenseFilter)
                          ? ` (${t('picker.current')})`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase">
              {t('picker.advanced')}
            </h2>
            <input
              className="w-full rounded border border-border bg-surface-2 p-1 text-xs"
              value={assetSearch}
              placeholder={t('picker.searchAssets')}
              onChange={(e) => setAssetSearch(e.target.value)}
            />
            <div className="space-y-1">{renderTreeNode(catalogTree)}</div>
          </section>
        </aside>

        {/* Center: preview */}
        <main className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <select
              className="bg-surface-2 border border-border rounded p-1 text-xs"
              value={state.anim}
              onChange={(e) =>
                dispatch({ type: 'set_anim', anim: e.target.value })
              }
            >
              {animNames.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              {DIRS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={state.dir === d ? 'primary' : 'ghost'}
                  onClick={() => dispatch({ type: 'set_dir', dir: d })}
                >
                  {t(DIR_LABELS[d])}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => dispatch({ type: 'toggle_play' })}
            >
              {state.playing ? t('controls.pause') : t('controls.play')}
            </Button>
            <div className="flex-1" />
            <span className="text-text-dim text-xs">
              {result.status === 'loading'
                ? `${t('status.loading')} ${Math.round(result.progress * 100)}%`
                : result.status}
            </span>
          </div>
          <div className="checker flex flex-1 items-center justify-center">
            {failed ? (
              <div className="text-danger text-sm">{result.error}</div>
            ) : (
              <canvas ref={canvasRef} />
            )}
          </div>
        </main>

        {/* Right: token + attribution */}
        <aside className="scroll border-l border-border p-3">
          <section className="border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase">
              {t('token.title')}
            </h2>
            <label className="mt-2 block text-xs">
              <span className="text-text-mute uppercase">
                {t('token.current')}
              </span>
              <textarea
                className="mt-1 h-20 w-full resize-none rounded border border-border bg-surface-2 p-2 font-mono text-[11px]"
                readOnly
                value={currentToken}
              />
            </label>
            <Button size="sm" variant="ghost" onClick={copyToken}>
              {t('token.copy')}
            </Button>
            <label className="mt-3 block text-xs">
              <span className="text-text-mute uppercase">
                {t('token.input')}
              </span>
              <textarea
                className="mt-1 h-20 w-full resize-none rounded border border-border bg-surface-2 p-2 font-mono text-[11px]"
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  setTokenError(null);
                  setTokenStatus(null);
                }}
              />
            </label>
            <Button
              size="sm"
              disabled={tokenInput.trim() === ''}
              onClick={applyToken}
            >
              {t('token.apply')}
            </Button>
            {(tokenStatus || tokenError) && (
              <div
                className={`mt-2 text-xs ${
                  tokenError ? 'text-danger' : 'text-text-mute'
                }`}
              >
                {tokenError ?? tokenStatus}
              </div>
            )}
          </section>

          <h2 className="text-xs font-bold uppercase">
            {t('attribution.title')}
            <span className="text-text-mute">
              {' '}
              — {t('attribution.required')}
            </span>
          </h2>
          {effectiveLicense && (
            <div className="mt-2 rounded border border-border p-2 text-xs">
              <span className="text-text-mute">
                {t('attribution.effectiveLicense')}{' '}
              </span>
              <span className="font-bold">{effectiveLicense}</span>
              {effectiveLicenseExceedsFilter && licenseFilter && (
                <div className="mt-2 text-danger">
                  {t('attribution.licenseExceeded')} {effectiveLicense} &gt;{' '}
                  {licenseFilter}
                </div>
              )}
            </div>
          )}
          <ul className="mt-2 space-y-2">
            {(result.sheet?.credits.entries ?? []).map((c) => (
              <li
                key={c.file}
                className="border-b border-border pb-2 text-xs"
              >
                <div className="font-semibold">{c.file}</div>
                <div className="text-text-mute">
                  {t('attribution.by')}{' '}
                  {c.authors.join(', ') || t('attribution.unknown')}
                </div>
                <div className="text-text-dim">
                  {c.licenses.join(', ')}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-xs text-text-mute">
            <a
              className="underline decoration-border underline-offset-2 hover:text-text"
              href="https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/"
              target="_blank"
              rel="noreferrer"
            >
              {t('source.project')}
            </a>
          </p>
        </aside>
      </div>
    </div>
  );
}

function ResetMenu({
  t,
  onReset,
  onResetLicenseFilter,
  onResetSearch,
}: {
  t: Translator;
  onReset: (scopes: { outfit: boolean; view: boolean }) => void;
  onResetLicenseFilter: () => void;
  onResetSearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState(RESET_SCOPE_DEFAULTS);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
    setScopes(RESET_SCOPE_DEFAULTS);
  };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setScopes(RESET_SCOPE_DEFAULTS);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setScopes(RESET_SCOPE_DEFAULTS);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const anySelected = scopes.outfit || scopes.view || scopes.filters;

  const applyReset = () => {
    if (scopes.filters) {
      onResetLicenseFilter();
      onResetSearch();
    }
    if (scopes.outfit || scopes.view) {
      onReset({ outfit: scopes.outfit, view: scopes.view });
    }
    close();
  };

  const toggle = (key: 'outfit' | 'view' | 'filters') =>
    setScopes((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t('reset.button')}
      </Button>
      {open && (
        <div className="absolute left-0 z-10 mt-1 w-56 rounded-md border border-border bg-surface-2 p-2 shadow-lg">
          <div className="px-1 pb-1 text-[11px] uppercase text-text-mute">
            {t('reset.menuTitle')}
          </div>
          <div role="menu" aria-label={t('reset.menuTitle')}>
            {(
              [
                ['outfit', 'reset.scope.outfit'],
                ['view', 'reset.scope.view'],
                ['filters', 'reset.scope.filters'],
              ] as const
            ).map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={scopes[key]}
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface-3"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded border border-border text-center leading-3"
                >
                  {scopes[key] ? '✓' : ''}
                </span>
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={close}>
              {t('reset.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!anySelected}
              onClick={applyReset}
            >
              {t('reset.confirm')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
