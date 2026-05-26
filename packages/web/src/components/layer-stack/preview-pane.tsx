import { useEffect, useRef } from 'react';
import { ANIMATION_CONFIGS, type Direction } from '@lpc-toolkit/core';
import { useComposedCharacter } from '../../hooks/use-composed-character';
import { useAnimationPlayer } from '../../hooks/use-animation-player';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  type SliceAction,
  type SliceState,
} from '../../slice/selection';
import type { AssetSource } from '../../adapter/asset-source';
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import { Button } from '../ui/button';
import { pickRandomOutfit } from '../../slice/random-outfit';
import type { Translator } from '../../i18n';

const DIR_LABEL: Record<Direction, string> = { up: '↑', left: '←', down: '↓', right: '→' };
const DIR_SHORT: Record<Direction, 'N' | 'S' | 'E' | 'W'> = {
  up: 'N', down: 'S', left: 'W', right: 'E',
};

interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  assetSource: AssetSource;
  reloadCounter: number;
  t: Translator;
  onComposeStatus: (status: { progress: number; loading: boolean }) => void;
}

export function PreviewPane({ catalog, palettes, state, dispatch, assetSource, reloadCounter, t, onComposeStatus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(state.zoom);
  useEffect(() => {
    zoomRef.current = state.zoom;
  }, [state.zoom]);

  const result = useComposedCharacter(catalog, palettes, state, assetSource, reloadCounter);
  useEffect(() => {
    onComposeStatus({
      progress: result.progress,
      loading: result.status === 'loading',
    });
  }, [result.progress, result.status, onComposeStatus]);
  const { currentFrame, totalFrames, fps } = useAnimationPlayer(
    canvasRef, result.animation, state.dir, state.playing, state.zoom,
  );

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      dispatch({ type: 'set_zoom', zoom: zoomRef.current + delta });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dispatch]);

  return (
    <div ref={previewRef} className="relative flex h-full min-h-0 flex-col">
      <div className="relative flex-1 overflow-hidden">
        <div className="flex h-full items-center justify-center">
          <canvas ref={canvasRef} className="image-render-pixel max-h-full max-w-full" />
        </div>
        <div className="absolute top-3 left-3 z-10 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-text-2 backdrop-blur-md">
          {state.anim} · {DIR_SHORT[state.dir]} · {state.zoom}× · f{String(currentFrame + 1).padStart(2, '0')}
        </div>
        <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded bg-black/40 p-0.5 backdrop-blur-md">
          <button
            type="button"
            disabled={state.zoom <= MIN_ZOOM}
            aria-label={t('controls.zoomOut')}
            onClick={() =>
              dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })
            }
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-2 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            −
          </button>
          {[1, 2, 4, 8].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => dispatch({ type: 'set_zoom', zoom: z })}
              className={[
                'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                state.zoom === z
                  ? 'bg-accent text-accent-ink'
                  : 'text-text-2 hover:bg-white/10',
              ].join(' ')}
            >
              {z}×
            </button>
          ))}
          <button
            type="button"
            disabled={state.zoom >= MAX_ZOOM}
            aria-label={t('controls.zoomIn')}
            onClick={() =>
              dispatch({ type: 'set_zoom', zoom: state.zoom + 1 })
            }
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-2 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-surface px-3 py-2 text-xs">
        <div className="grid grid-cols-2 gap-0.5">
          <Button size="sm" variant={state.dir === 'up' ? 'primary' : 'ghost'}
            className="col-span-2 w-6 px-0"
            onClick={() => dispatch({ type: 'set_dir', dir: 'up' })}>{DIR_LABEL.up}</Button>
          <Button size="sm" variant={state.dir === 'left' ? 'primary' : 'ghost'}
            className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'left' })}>{DIR_LABEL.left}</Button>
          <Button size="sm" variant={state.dir === 'right' ? 'primary' : 'ghost'}
            className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'right' })}>{DIR_LABEL.right}</Button>
          <Button size="sm" variant={state.dir === 'down' ? 'primary' : 'ghost'}
            className="col-span-2 w-6 px-0"
            onClick={() => dispatch({ type: 'set_dir', dir: 'down' })}>{DIR_LABEL.down}</Button>
        </div>

        <select className="rounded-md border border-border bg-surface-2 px-2 py-1"
          value={state.anim}
          onChange={(e) => dispatch({ type: 'set_anim', anim: e.target.value as typeof state.anim })}>
          {Object.keys(ANIMATION_CONFIGS).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'toggle_play' })}>
          {state.playing ? '⏸' : '▶'}
        </Button>

        <span className="ml-auto font-mono text-[10px] text-text-mute">
          f{String(currentFrame + 1).padStart(2, '0')}/
          {String(totalFrames).padStart(2, '0')} · {fps}fps
        </span>
        <button
          type="button"
          onClick={() => dispatch({
            type: 'apply_selections',
            selections: pickRandomOutfit({ catalog, bodyType: state.bodyType }),
          })}
          title={t('randomize.title')}
          className="rounded px-2 py-1 text-text-mute hover:bg-surface-2"
        >
          🎲
        </button>
      </div>
    </div>
  );
}
