import { useEffect, type RefObject } from 'react';
import {
  ANIMATION_CONFIGS,
  type ComposedAnimation,
  type Direction,
} from '@lpc-toolkit/core';
import { frameRect } from '../slice/frame-rect';

const FPS = 8;

/**
 * Draws one direction of `animation` to `canvasRef` at integer `zoom`,
 * advancing through ANIMATION_CONFIGS[name].cycle at a fixed FPS. Pauses
 * (holds frame 0) when `playing` is false or there is no animation.
 */
export function useAnimationPlayer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  animation: ComposedAnimation | null,
  dir: Direction,
  playing: boolean,
  zoom: number,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !animation) return;
    const config = ANIMATION_CONFIGS[animation.animation];
    if (!config) return;

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
    const step = 1000 / FPS;

    const draw = () => {
      const r = frameRect(config, animation.directions, dir, frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        src,
        r.sx, r.sy, r.size, r.size,
        0, 0, size * zoom, size * zoom,
      );
    };

    draw();
    if (!playing) return;

    const loop = (t: number) => {
      acc += t - last;
      last = t;
      while (acc >= step) {
        acc -= step;
        frame = (frame + 1) % config.cycle.length;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, animation, dir, playing, zoom]);
}
