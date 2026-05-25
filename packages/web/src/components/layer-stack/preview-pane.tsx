import { useEffect, useRef } from 'react';
import { ANIMATION_CONFIGS, type Direction } from '@lpc-toolkit/core';
import { useComposedCharacter } from '../../hooks/use-composed-character';
import { useAnimationPlayer } from '../../hooks/use-animation-player';
import { MIN_ZOOM, MAX_ZOOM, type SliceAction, type SliceState } from '../../slice/selection';
import type { AssetSource } from '../../adapter/asset-source';
import type { Catalog, PaletteMetadata } from '@lpc-toolkit/core';
import { Button } from '../ui/button';

const DIR_LABEL: Record<Direction, string> = { up: '↑', left: '←', down: '↓', right: '→' };

interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  assetSource: AssetSource;
}

export function PreviewPane({ catalog, palettes, state, dispatch, assetSource }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(state.zoom);
  useEffect(() => {
    zoomRef.current = state.zoom;
  }, [state.zoom]);

  const result = useComposedCharacter(catalog, palettes, state, assetSource);
  useAnimationPlayer(canvasRef, result.animation, state.dir, state.playing, state.zoom);

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
        <div className="absolute top-3 right-3 flex gap-1">
          <Button size="sm" variant="default"
            disabled={state.zoom <= MIN_ZOOM}
            onClick={() => dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })}
            aria-label="zoom out">−</Button>
          <span className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-text-mute">
            {state.zoom * 100}%
          </span>
          <Button size="sm" variant="default"
            disabled={state.zoom >= MAX_ZOOM}
            onClick={() => dispatch({ type: 'set_zoom', zoom: state.zoom + 1 })}
            aria-label="zoom in">+</Button>
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

        {result.status === 'loading' && (
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-text-mute">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Loading {Math.round(result.progress * 100)}%
          </span>
        )}
        {result.status !== 'loading' && (
          <span className="ml-auto font-mono text-[10px] text-text-mute">zoom {state.zoom}×</span>
        )}
      </div>
    </div>
  );
}
