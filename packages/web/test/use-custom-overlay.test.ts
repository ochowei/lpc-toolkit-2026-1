import { describe, expect, it, vi } from 'vitest';
import type { ImageLike } from '@lpc-toolkit/core';
import type { CustomOverlay } from '../src/lib/custom-overlay';
import {
  CustomOverlayLifetime,
  isCurrentOverlayRequest,
} from '../src/hooks/use-custom-overlay';

function makeOverlay(objectUrl: string, zPos = 0): CustomOverlay {
  return {
    fileName: `${objectUrl}.png`,
    objectUrl,
    image: {} as ImageLike,
    width: 832,
    height: 3456,
    zPos,
  };
}

describe('CustomOverlayLifetime', () => {
  it('revokes a replaced overlay and preserves the replacement', () => {
    const revoke = vi.fn();
    const lifetime = new CustomOverlayLifetime(revoke);
    const first = makeOverlay('blob:first');
    const second = makeOverlay('blob:second');

    lifetime.replace(first);

    expect(lifetime.replace(second)).toBe(second);
    expect(revoke).toHaveBeenCalledWith(first.objectUrl);
    expect(revoke).not.toHaveBeenCalledWith(second.objectUrl);
  });

  it('updates z-position without revoking the owned overlay', () => {
    const revoke = vi.fn();
    const lifetime = new CustomOverlayLifetime(revoke);
    const overlay = makeOverlay('blob:overlay');
    lifetime.replace(overlay);

    expect(lifetime.updateZPos(42)).toMatchObject({ zPos: 42 });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('clears the owned overlay and revokes it once', () => {
    const revoke = vi.fn();
    const lifetime = new CustomOverlayLifetime(revoke);
    const overlay = makeOverlay('blob:overlay');
    lifetime.replace(overlay);

    expect(lifetime.clear()).toBeNull();
    expect(lifetime.clear()).toBeNull();
    expect(revoke.mock.calls.filter(([url]) => url === overlay.objectUrl)).toHaveLength(1);
  });

  it('disposes idempotently', () => {
    const revoke = vi.fn();
    const lifetime = new CustomOverlayLifetime(revoke);
    const overlay = makeOverlay('blob:overlay');
    lifetime.replace(overlay);

    lifetime.dispose();
    lifetime.dispose();

    expect(revoke.mock.calls.filter(([url]) => url === overlay.objectUrl)).toHaveLength(1);
  });

  it('never revokes a discarded URL more than once', () => {
    const revoke = vi.fn();
    const lifetime = new CustomOverlayLifetime(revoke);
    const overlay = makeOverlay('blob:discarded');

    lifetime.discard(overlay);
    lifetime.discard(overlay);

    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('isCurrentOverlayRequest', () => {
  it('rejects stale and locked requests and accepts the latest unlocked request', () => {
    expect(isCurrentOverlayRequest(1, 2, false)).toBe(false);
    expect(isCurrentOverlayRequest(2, 2, true)).toBe(false);
    expect(isCurrentOverlayRequest(2, 2, false)).toBe(true);
  });
});
