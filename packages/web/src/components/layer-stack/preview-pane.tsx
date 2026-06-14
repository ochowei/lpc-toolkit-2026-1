import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ANIMATION_CONFIGS, type Direction } from '@lpc-toolkit/core';
import type { ComposedResult } from '../../hooks/use-composed-character';
import { useMultiAnimationPlayer } from '../../hooks/use-animation-player';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  type SliceAction,
  type SliceState,
} from '../../slice/selection';
import { Button } from '../ui/button';
import type { Translator } from '../../i18n';
import { formatCompositionProgress } from '../../lib/composition-lock';
import {
  FullSpritesheetPreview,
  type FullSheetZoom,
} from './full-spritesheet-preview';
export type { FullSheetZoom } from './full-spritesheet-preview';
import { PreviewPaneSplitter } from './preview-pane-splitter';

const DIR_LABEL: Record<Direction, string> = { up: '↑', left: '←', down: '↓', right: '→' };
const DIR_SHORT: Record<Direction, 'N' | 'S' | 'E' | 'W'> = {
  up: 'N', down: 'S', left: 'W', right: 'E',
};

/** UI state owned by the harness for the optional full-sheet preview pane. */
export interface FullSheetUiState {
  open: boolean;
  grid: boolean;
  mask: boolean;
  zoom: FullSheetZoom;
  splitterRatio: number;
}

/** Setters for the full-sheet preview state passed down from the harness. */
export interface FullSheetUiActions {
  setOpen: (v: boolean) => void;
  setGrid: (v: boolean) => void;
  setMask: (v: boolean) => void;
  setZoom: (v: FullSheetZoom) => void;
  setSplitterRatio: (v: number) => void;
}

interface Props {
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  result: ComposedResult;
  fullSheet: FullSheetUiState;
  fullSheetActions: FullSheetUiActions;
}

/** Right-side preview area for animated single-frame playback and full-sheet inspection. */
export function PreviewPane({
  state,
  dispatch,
  t,
  result,
  fullSheet,
  fullSheetActions,
}: Props) {
  const canvasRefSingle = useRef<HTMLCanvasElement | null>(null);
  const canvasRefUp = useRef<HTMLCanvasElement | null>(null);
  const canvasRefDown = useRef<HTMLCanvasElement | null>(null);
  const canvasRefLeft = useRef<HTMLCanvasElement | null>(null);
  const canvasRefRight = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(state.zoom);
  useEffect(() => {
    zoomRef.current = state.zoom;
  }, [state.zoom]);

  const targets = useMemo(() => {
    if (state.layout === 'single') {
      return [{ canvasRef: canvasRefSingle, dir: state.dir }];
    }
    return [
      { canvasRef: canvasRefUp, dir: 'up' as const },
      { canvasRef: canvasRefDown, dir: 'down' as const },
      { canvasRef: canvasRefLeft, dir: 'left' as const },
      { canvasRef: canvasRefRight, dir: 'right' as const },
    ];
  }, [state.layout, state.dir]);

  const { currentFrame, totalFrames, fps } = useMultiAnimationPlayer(
    targets,
    result.animation,
    state.playing,
    state.zoom,
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
  const [splitMetrics, setSplitMetrics] = useState<
    { top: number; height: number } | null
  >(null);
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
      setSplitMetrics(null);
    };
  }, [fullSheet.open]);

  const isComposing = result.status === 'loading';
  const progressPercent = formatCompositionProgress(result.progress);

  return (
    <div ref={previewRef} className="relative flex h-full min-h-0 flex-col">
      {/* Action bar — now at the TOP, above the single preview. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-2 text-xs sm:gap-3 sm:px-3">
        {state.layout === 'single' && (
          <div className="flex gap-0.5">
            <Button size="sm" variant={state.dir === 'up' ? 'primary' : 'ghost'}
              className="w-6 px-0"
              onClick={() => dispatch({ type: 'set_dir', dir: 'up' })}>{DIR_LABEL.up}</Button>
            <Button size="sm" variant={state.dir === 'down' ? 'primary' : 'ghost'}
              className="w-6 px-0"
              onClick={() => dispatch({ type: 'set_dir', dir: 'down' })}>{DIR_LABEL.down}</Button>
            <Button size="sm" variant={state.dir === 'left' ? 'primary' : 'ghost'}
              className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'left' })}>{DIR_LABEL.left}</Button>
            <Button size="sm" variant={state.dir === 'right' ? 'primary' : 'ghost'}
              className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'right' })}>{DIR_LABEL.right}</Button>
          </div>
        )}

        <div className={`flex gap-0.5 ${state.layout === 'single' ? 'border-l border-border pl-2 sm:pl-3' : ''}`}>
          {(['single', 'grid', 'row'] as const).map((l) => (
            <Button
              key={l}
              size="sm"
              variant={state.layout === l ? 'primary' : 'ghost'}
              className="px-2"
              onClick={() => dispatch({ type: 'set_layout', layout: l })}
            >
              {t(`layout.${l}`)}
            </Button>
          ))}
        </div>

        <select className="rounded-md border border-border bg-surface-2 px-2 py-1"
          value={state.anim}
          onChange={(e) => dispatch({ type: 'set_anim', anim: e.target.value as typeof state.anim })}>
          {Object.keys(ANIMATION_CONFIGS).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
          {result.sheet?.customAnimations && Array.from(result.sheet.customAnimations.keys()).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <Button
          size="sm"
          variant="ghost"
          aria-label={state.playing ? t('controls.pause') : t('controls.play')}
          onClick={() => dispatch({ type: 'toggle_play' })}
        >
          {state.playing ? '⏸' : '▶'}
        </Button>

        <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-text-mute">
          f{String(currentFrame + 1).padStart(2, '0')}/
          {String(totalFrames).padStart(2, '0')} · {fps}fps
        </span>
        <Button
          size="sm"
          variant={fullSheet.open ? 'primary' : 'default'}
          className="shrink-0"
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
          <div className={state.layout === 'single' ? 'flex h-full items-center justify-center' : 'hidden'}>
            <canvas ref={canvasRefSingle} className="image-render-pixel max-h-full max-w-full" />
          </div>
          <div className={
            state.layout === 'grid'
              ? 'grid grid-cols-2 gap-4 p-4 h-full w-full justify-items-center items-center overflow-auto'
              : state.layout === 'row'
              ? 'flex flex-row gap-4 p-4 h-full w-full justify-center items-center overflow-x-auto overflow-y-hidden'
              : 'hidden'
          }>
            {([
              { ref: canvasRefUp, dir: 'up' as const },
              { ref: canvasRefDown, dir: 'down' as const },
              { ref: canvasRefLeft, dir: 'left' as const },
              { ref: canvasRefRight, dir: 'right' as const },
            ]).map(({ ref, dir }) => (
              <div
                key={dir}
                className={[
                  'relative border border-border/20 rounded bg-black/10 p-2 flex items-center justify-center min-h-0 min-w-0',
                  state.layout === 'row' ? 'flex-1 h-full' : '',
                ].join(' ')}
              >
                <canvas ref={ref} className="image-render-pixel max-h-full max-w-full" />
                <div className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-text-2">
                  {t(`direction.${dir}`)} ({DIR_SHORT[dir]})
                </div>
              </div>
            ))}
          </div>
          {isComposing && (
            <div
              role="status"
              aria-live="polite"
              data-testid="composition-loading-overlay"
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-app/45 backdrop-blur-[1px]"
            >
              <div className="flex min-w-36 flex-col items-center gap-2 rounded-md border border-border bg-surface/95 px-4 py-3 shadow-lg">
                <span
                  aria-hidden="true"
                  className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent"
                />
                <span className="text-xs font-medium text-text">
                  {t('composition.loading')}
                </span>
                <span className="font-mono text-[11px] text-text-mute">
                  {progressPercent}%
                </span>
              </div>
            </div>
          )}
          <div className="absolute top-3 left-3 z-10 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-text-2 backdrop-blur-md">
            {state.anim} · {state.layout === 'single' ? `${DIR_SHORT[state.dir]} · ` : ''}{state.zoom}× · f{String(currentFrame + 1).padStart(2, '0')}
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

        {fullSheet.open && splitMetrics && (
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
