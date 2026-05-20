import { useMemo, useRef, useState } from 'react';
import {
  ANIMATION_CONFIGS,
  BODY_TYPES,
  computeEffectiveLicense,
  decodeSelectionToken,
  encodeSelectionToken,
  type Catalog,
  type Direction,
} from '@lpc-toolkit/core';
import {
  toSelections,
  type SliceState,
  type SliceAction,
} from '../slice/selection';
import { useComposedCharacter } from '../hooks/use-composed-character';
import { useAnimationPlayer } from '../hooks/use-animation-player';
import { Button } from './ui/button';
import type { Locale, TranslationKey, Translator } from '../i18n';

const DIRS: Direction[] = ['up', 'left', 'down', 'right'];
const DIR_LABELS: Record<Direction, TranslationKey> = {
  up: 'direction.up',
  left: 'direction.left',
  down: 'direction.down',
  right: 'direction.right',
};
const ZOOM = 4;

export function SliceHarness({
  catalog,
  shownTypeNames,
  state,
  dispatch,
  theme,
  locale,
  t,
  onToggleTheme,
  onToggleLocale,
}: {
  catalog: Catalog;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  locale: Locale;
  t: Translator;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const result = useComposedCharacter(catalog, state);
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

          {shownTypeNames.map((tn) => {
            const items = catalog.byTypeName.get(tn) ?? [];
            return (
              <label key={tn} className="block text-xs">
                <span className="text-text-mute uppercase">{tn}</span>
                <select
                  className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
                  value={state.selections[tn]?.name ?? ''}
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
                  {items.map((it) => (
                    <option key={it.name} value={it.name}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
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
          {result.sheet && result.sheet.credits.licenses.length > 0 && (
            <div className="mt-2 rounded border border-border p-2 text-xs">
              <span className="text-text-mute">
                {t('attribution.effectiveLicense')}{' '}
              </span>
              <span className="font-bold">
                {computeEffectiveLicense(result.sheet.credits)}
              </span>
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
        </aside>
      </div>
    </div>
  );
}
