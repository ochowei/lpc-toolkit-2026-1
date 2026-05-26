import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ANIMATION_CONFIGS, type Direction } from '@lpc-toolkit/core';
import type { ComposedResult } from '../../hooks/use-composed-character';
import { useAnimationPlayer } from '../../hooks/use-animation-player';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  type SliceAction,
  type SliceState,
} from '../../slice/selection';
import type { Catalog } from '@lpc-toolkit/core';
import { Button } from '../ui/button';
import { pickRandomOutfit } from '../../slice/random-outfit';
import type { Translator } from '../../i18n';
import {
  FullSpritesheetPreview,
  type FullSheetZoom,
} from './full-spritesheet-preview';
import { PreviewPaneSplitter } from './preview-pane-splitter';

const DIR_LABEL: Record<Direction, string> = { up: '↑', left: '←', down: '↓', right: '→' };
const DIR_SHORT: Record<Direction, 'N' | 'S' | 'E' | 'W'> = {
  up: 'N', down: 'S', left: 'W', right: 'E',
};

export interface FullSheetUiState {
  open: boolean;
  grid: boolean;
  mask: boolean;
  zoom: FullSheetZoom;
  splitterRatio: number;
}

export interface FullSheetUiActions {
  setOpen: (v: boolean) => void;
  setGrid: (v: boolean) => void;
  setMask: (v: boolean) => void;
  setZoom: (v: FullSheetZoom) => void;
  setSplitterRatio: (v: number) => void;
}

interface Props {
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  result: ComposedResult;
  fullSheet: FullSheetUiState;
  fullSheetActions: FullSheetUiActions;
}

export function PreviewPane({
  catalog,
  state,
  dispatch,
  t,
  result,
  fullSheet,
  fullSheetActions,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(state.zoom);
  useEffect(() => {
    zoomRef.current = state.zoom;
  }, [state.zoom]);

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

  // Splitter needs absolute viewport y + height of the *split container*
  // (the region under the action bar). Measure on layout and on resize.
  const [splitMetrics, setSplitMetrics] = useState({ top: 0, height: 0 });
  useLayoutEffect(() => {
    if (!fullSheet.open) return;
    const el = splitContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSplitMetrics({ top: rect.top, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fullSheet.open]);

  return (
    <div ref={previewRef} className="relative flex h-full min-h-0 flex-col">
      {/* Action bar — now at the TOP, above the single preview. */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2 text-xs">
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

        <Button
          size="sm"
          variant={fullSheet.open ? 'primary' : 'default'}
          onClick={() => fullSheetActions.setOpen(!fullSheet.open)}
          title={t('fullSheet.toggle')}
        >
          {fullSheet.open ? '▲' : '▼'} {t('fullSheet.toggle')}
        </Button>
      </div>

      {/* Split container — single preview + (optional) splitter + Full Sheet. */}
      <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col">
        {/* Single preview canvas (with existing overlays). */}
        <div
          className="relative overflow-hidden"
          style={{
            flex: fullSheet.open ? `${fullSheet.splitterRatio} 1 0` : '1 1 0',
            minHeight: 0,
          }}
        >
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

        {fullSheet.open && (
          <>
            <PreviewPaneSplitter
              containerTop={splitMetrics.top}
              containerHeight={splitMetrics.height}
              onChange={fullSheetActions.setSplitterRatio}
            />
            <div
              style={{ flex: `${1 - fullSheet.splitterRatio} 1 0`, minHeight: 0 }}
              className="flex min-h-0 flex-col"
            >
              <FullSpritesheetPreview
                sheet={result.sheet}
                status={result.status}
                grid={fullSheet.grid}
                mask={fullSheet.mask}
                zoom={fullSheet.zoom}
                onGrid={fullSheetActions.setGrid}
                onMask={fullSheetActions.setMask}
                onZoom={fullSheetActions.setZoom}
                onClose={() => fullSheetActions.setOpen(false)}
                t={t}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
