import { describe, expect, it } from 'vitest';
import { animationFrameRect } from '../src/hooks/use-animation-player';

describe('animationFrameRect', () => {
  it('maps custom animation frames using the extracted animation geometry', () => {
    expect(
      animationFrameRect(
        {
          animation: 'slash_oversize',
          width: 6 * 192,
          height: 4 * 192,
          frameCount: 6,
          directions: 4,
        },
        'down',
        1,
      ),
    ).toEqual({ sx: 192, sy: 2 * 192, size: 192 });
  });
});
