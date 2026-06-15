import { useEffect, useRef, useState, type RefObject } from 'react';
import type React from 'react';
import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  customAnimations,
  type ComposedAnimation,
  type Direction,
} from '@lpc-toolkit/core';
import { frameRect } from '../slice/frame-rect';

/** Fixed preview playback rate for all standard LPC animations. */
export const ANIMATION_FPS = 8;

/** Playback counters exposed to preview controls. */
export interface UseAnimationPlayerResult {
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly fps: number;
}

export interface AnimationTarget {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dir: Direction;
}

/** Clear the current preview pixels without resizing the display canvas. */
export function clearAnimationCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draws one direction of `animation` to `canvasRef` at integer `zoom`,
 * advancing through ANIMATION_CONFIGS[name].cycle at ANIMATION_FPS.
 * Pauses (holds frame 0) when `playing` is false or there is no animation.
 *
 * Returns the current frame index (0-based), the total frames in the
 * animation cycle, and the FPS. React re-renders at ANIMATION_FPS while
 * playing — keep heavy work out of consumers that read these values.
 */
export function useAnimationPlayer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  animation: ComposedAnimation | null,
  dir: Direction,
  playing: boolean,
  zoom: number,
): UseAnimationPlayerResult {
  return useMultiAnimationPlayer(
    [{ canvasRef, dir }],
    animation,
    playing,
    zoom,
  );
}

export function useMultiAnimationPlayer(
  targets: AnimationTarget[],
  animation: ComposedAnimation | null,
  playing: boolean,
  zoom: number,
): UseAnimationPlayerResult {
  const [currentFrame, setCurrentFrame] = useState(0);
  const frameRef = useRef(0);

  const customDef = animation ? customAnimations[animation.animation as keyof typeof customAnimations] : null;
  const config = animation ? ANIMATION_CONFIGS[animation.animation as keyof typeof ANIMATION_CONFIGS] : null;

  const totalFrames = customDef
    ? (animation?.frameCount ?? 0)
    : (config?.cycle.length ?? 0);

  // Sync / clamp frameRef if totalFrames changes
  if (frameRef.current >= totalFrames) {
    frameRef.current = 0;
  }

  const el0 = targets[0]?.canvasRef.current;
  const el1 = targets[1]?.canvasRef.current;
  const el2 = targets[2]?.canvasRef.current;
  const el3 = targets[3]?.canvasRef.current;
  const el4 = targets[4]?.canvasRef.current;
  const dir0 = targets[0]?.dir;
  const dir1 = targets[1]?.dir;
  const dir2 = targets[2]?.dir;
  const dir3 = targets[3]?.dir;
  const dir4 = targets[4]?.dir;

  useEffect(() => {
    const activeTargets = targets.filter(t => t.canvasRef.current !== null);
    if (activeTargets.length === 0) {
      setCurrentFrame(0);
      frameRef.current = 0;
      return;
    }

    if (!animation || (!config && !customDef)) {
      for (const target of activeTargets) {
        if (target.canvasRef.current) {
          clearAnimationCanvas(target.canvasRef.current);
        }
      }
      setCurrentFrame(0);
      frameRef.current = 0;
      return;
    }

    const size = customDef ? customDef.frameSize : 64;
    const targetDim = size * zoom;
    const ctxs: { ctx: CanvasRenderingContext2D; dir: Direction; canvas: HTMLCanvasElement }[] = [];

    for (const target of activeTargets) {
      const canvas = target.canvasRef.current;
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      if (canvas.width !== targetDim) canvas.width = targetDim;
      if (canvas.height !== targetDim) canvas.height = targetDim;
      ctx.imageSmoothingEnabled = false;
      ctxs.push({ ctx, dir: target.dir, canvas });
    }

    const src = animation.canvas as unknown as CanvasImageSource;
    let frame = frameRef.current;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = 1000 / ANIMATION_FPS;

    const draw = () => {
      for (const { ctx, dir, canvas } of ctxs) {
        let sx = 0;
        let sy = 0;
        if (customDef) {
          const col = frame % animation.frameCount;
          const rowIndex = animation.directions === 1 ? 0 : Math.max(0, DIRECTIONS.indexOf(dir));
          sx = col * size;
          sy = rowIndex * size;
        } else if (config) {
          const r = frameRect(config, animation.directions, dir, frame);
          sx = r.sx;
          sy = r.sy;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          src,
          sx, sy, size, size,
          0, 0, targetDim, targetDim,
        );
      }
    };

    draw();
    setCurrentFrame(frame);
    if (!playing) return;

    const loop = (t: number) => {
      acc += t - last;
      last = t;
      while (acc >= step) {
        acc -= step;
        frame = (frame + 1) % totalFrames;
        frameRef.current = frame;
        draw();
        setCurrentFrame(frame);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    animation,
    config,
    customDef,
    playing,
    zoom,
    totalFrames,
    el0,
    el1,
    el2,
    el3,
    el4,
    dir0,
    dir1,
    dir2,
    dir3,
    dir4,
  ]);

  return { currentFrame, totalFrames, fps: ANIMATION_FPS };
}


