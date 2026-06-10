import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { clearAnimationCanvas } from '../src/hooks/use-animation-player';

describe('clearAnimationCanvas', () => {
  it('clears stale pixels without changing the current canvas dimensions', () => {
    const canvas = createCanvas(8, 6);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    clearAnimationCanvas(canvas as unknown as HTMLCanvasElement);

    expect([canvas.width, canvas.height]).toEqual([8, 6]);
    expect(ctx.getImageData(4, 3, 1, 1).data[3]).toBe(0);
  });
});
