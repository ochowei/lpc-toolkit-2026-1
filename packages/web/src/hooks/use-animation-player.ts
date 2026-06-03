import { useEffect, useState, type RefObject } from 'react';
import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
  type ComposedAnimation,
  type Direction,
} from '@lpc-toolkit/core';

/** Fixed preview playback rate for all standard LPC animations. */
export const ANIMATION_FPS = 8;

/** Playback counters exposed to preview controls. */
export interface UseAnimationPlayerResult {
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly fps: number;
}

export interface FrameRect {
  readonly sx: number;
  readonly sy: number;
  readonly size: number;
}

/**
 * Calculates the bounding rectangle of a specific frame in a standard or custom animation.
 */
export function animationFrameRect(
  animation: ComposedAnimation | { animation: string; width: number; height: number; frameCount: number; directions: number },
  dir: Direction,
  frameIndex: number,
): FrameRect {
  const config = ANIMATION_CONFIGS[animation.animation];
  if (config) {
    const col = config.cycle[frameIndex % config.cycle.length] ?? 0;
    const rowIndex = animation.directions === 1 ? 0 : Math.max(0, DIRECTIONS.indexOf(dir));
    return {
      sx: col * FRAME_SIZE,
      sy: rowIndex * FRAME_SIZE,
      size: FRAME_SIZE,
    };
  }

  const size = animation.height / animation.directions;
  const col = frameIndex % animation.frameCount;
  const rowIndex = animation.directions === 1 ? 0 : Math.max(0, DIRECTIONS.indexOf(dir));
  return {
    sx: col * size,
    sy: rowIndex * size,
    size,
  };
}

/**
 * Draws one direction of `animation` to `canvasRef` at integer `zoom`,
 * advancing through standard cycle or custom frames count at ANIMATION_FPS.
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
  const [currentFrame, setCurrentFrame] = useState(0);
  const config = animation ? ANIMATION_CONFIGS[animation.animation] : null;
  const totalFrames = animation
    ? (config?.cycle.length ?? animation.frameCount)
    : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !animation || totalFrames === 0) {
      setCurrentFrame(0);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 64;
    canvas.width = size * zoom;
    canvas.height = size * zoom;
    ctx.imageSmoothingEnabled = false;

    const src = animation.canvas as unknown as CanvasImageSource;
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = 1000 / ANIMATION_FPS;

    const draw = () => {
      const r = animationFrameRect(animation, dir, frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        src,
        r.sx, r.sy, r.size, r.size,
        0, 0, size * zoom, size * zoom,
      );
    };

    draw();
    setCurrentFrame(0);
    if (!playing) return;

    const loop = (t: number) => {
      acc += t - last;
      last = t;
      while (acc >= step) {
        acc -= step;
        frame = (frame + 1) % totalFrames;
        draw();
        setCurrentFrame(frame);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, animation, totalFrames, dir, playing, zoom]);

  return { currentFrame, totalFrames, fps: ANIMATION_FPS };
}

