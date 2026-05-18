import { useMemo, useRef } from 'react';
import {
  ANIMATION_CONFIGS,
  computeEffectiveLicense,
  type Catalog,
  type Direction,
} from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../slice/selection';
import { useComposedCharacter } from '../hooks/use-composed-character';
import { useAnimationPlayer } from '../hooks/use-animation-player';
import { Button } from './ui/button';

const DIRS: Direction[] = ['up', 'left', 'down', 'right'];
const ZOOM = 4;

export function SliceHarness({
  catalog,
  shownTypeNames,
  state,
  dispatch,
  theme,
  onToggleTheme,
}: {
  catalog: Catalog;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  return (
    <div className="flex h-screen flex-col bg-app text-text">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-bold">
          LPC<span className="text-text-mute">·Toolkit</span>
        </span>
        <span className="text-text-dim text-xs">foundation slice</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_300px]">
        {/* Left: pickers */}
        <aside className="scroll border-r border-border p-3 space-y-3">
          <label className="block text-xs">
            <span className="text-text-mute uppercase">Body type</span>
            <select
              className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
              value={state.bodyType}
              onChange={(e) =>
                dispatch({ type: 'set_body_type', bodyType: e.target.value })
              }
            >
              <option value={state.bodyType}>{state.bodyType}</option>
            </select>
          </label>

          {shownTypeNames.map((tn) => {
            const items = catalog.byTypeName.get(tn) ?? [];
            return (
              <label key={tn} className="block text-xs">
                <span className="text-text-mute uppercase">{tn}</span>
                <select
                  className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
                  value={state.selections[tn] ?? ''}
                  onChange={(e) =>
                    e.target.value
                      ? dispatch({
                          type: 'pick',
                          typeName: tn,
                          name: e.target.value,
                        })
                      : dispatch({ type: 'clear', typeName: tn })
                  }
                >
                  <option value="">— none —</option>
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
                  {d}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => dispatch({ type: 'toggle_play' })}
            >
              {state.playing ? 'Pause' : 'Play'}
            </Button>
            <div className="flex-1" />
            <span className="text-text-dim text-xs">
              {result.status === 'loading'
                ? `loading ${Math.round(result.progress * 100)}%`
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

        {/* Right: attribution */}
        <aside className="scroll border-l border-border p-3">
          <h2 className="text-xs font-bold uppercase">
            Attribution
            <span className="text-text-mute"> — required</span>
          </h2>
          {result.sheet && result.sheet.credits.licenses.length > 0 && (
            <div className="mt-2 rounded border border-border p-2 text-xs">
              <span className="text-text-mute">Effective license: </span>
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
                  by {c.authors.join(', ') || 'unknown'}
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
