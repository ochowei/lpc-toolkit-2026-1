import { useEffect, useState, type RefObject } from 'react';
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
  const [currentFrame, setCurrentFrame] = useState(0);

  const customDef = animation ? customAnimations[animation.animation as keyof typeof customAnimations] : null;
  const config = animation ? ANIMATION_CONFIGS[animation.animation as keyof typeof ANIMATION_CONFIGS] : null;

  const totalFrames = customDef
    ? (animation?.frameCount ?? 0)
    : (config?.cycle.length ?? 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setCurrentFrame(0);
      return;
    }
    if (!animation || (!config && !customDef)) {
      clearAnimationCanvas(canvas);
      setCurrentFrame(0);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = customDef ? customDef.frameSize : 64;
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
  }, [canvasRef, animation, config, customDef, dir, playing, zoom, totalFrames]);

  return { currentFrame, totalFrames, fps: ANIMATION_FPS };
}
