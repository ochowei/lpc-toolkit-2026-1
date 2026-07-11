import { describe, expect, it, vi } from 'vitest';
import type { ImageLike } from '@lpc-toolkit/core';
import type { Translator } from '../src/i18n';
import type { CustomOverlay } from '../src/lib/custom-overlay';
import {
  CustomOverlayController,
  CustomOverlayLifetime,
  isCurrentOverlayRequest,
} from '../src/hooks/use-custom-overlay';

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

describe('CustomOverlayController', () => {
  function setup() {
    const lockedRef = { current: false };
    const revoke = vi.fn();
    const lifetime = new CustomOverlayLifetime(revoke);
    const overlays: Array<CustomOverlay | null> = [];
    const zPositions: number[] = [];
    const statuses: Array<{ kind: 'info' | 'warn' | 'error'; text: string }> = [];
    const loads: Array<Deferred<CustomOverlay | { ok: false; width: number; height: number }>> = [];
    const load = vi.fn(() => {
      const next = deferred<CustomOverlay | { ok: false; width: number; height: number }>();
      loads.push(next);
      return next.promise;
    });
    const t = ((key: string) => ({
      'advancedTools.invalidSize': 'invalid {width}x{height}',
      'advancedTools.loaded': 'loaded {name}',
      'advancedTools.cleared': 'cleared',
      'download.failed': 'failed',
    })[key] ?? key) as Translator;
    const controller = new CustomOverlayController({
      lockedRef,
      lifetime,
      load,
      t,
      onOverlay: (overlay) => overlays.push(overlay),
      onZPos: (zPos) => zPositions.push(zPos),
      onStatus: (status) => statuses.push(status),
    });
    return {
      controller,
      lifetime,
      lockedRef,
      revoke,
      overlays,
      zPositions,
      statuses,
      loads,
      load,
    };
  }

  it('discards an overlapping stale upload without committing or statusing it', async () => {
    const state = setup();
    const firstUpload = state.controller.upload({ name: 'first.png' } as File);
    const secondUpload = state.controller.upload({ name: 'second.png' } as File);
    const stale = makeOverlay('blob:stale');
    const current = makeOverlay('blob:current');

    state.loads[0]!.resolve(stale);
    await firstUpload;
    expect(state.revoke).toHaveBeenCalledWith(stale.objectUrl);
    expect(
      state.revoke.mock.calls.filter(([url]) => url === stale.objectUrl),
    ).toHaveLength(1);
    expect(state.overlays).toEqual([]);
    expect(state.statuses).toEqual([]);

    state.loads[1]!.resolve(current);
    await secondUpload;
    expect(state.overlays).toEqual([current]);
    expect(state.statuses).toEqual([{ kind: 'info', text: 'loaded blob:current.png' }]);
  });

  it('clear invalidates and later discards a pending upload', async () => {
    const state = setup();
    const upload = state.controller.upload({ name: 'pending.png' } as File);

    state.controller.clear();
    const pending = makeOverlay('blob:pending');
    state.loads[0]!.resolve(pending);
    await upload;

    expect(state.overlays).toEqual([null]);
    expect(state.zPositions).toEqual([0]);
    expect(state.statuses).toEqual([{ kind: 'info', text: 'cleared' }]);
    expect(state.revoke).toHaveBeenCalledWith(pending.objectUrl);
  });

  it('dispose invalidates and disposes a later upload result', async () => {
    const state = setup();
    const upload = state.controller.upload({ name: 'pending.png' } as File);

    state.controller.dispose();
    const pending = makeOverlay('blob:after-dispose');
    state.loads[0]!.resolve(pending);
    await upload;

    expect(state.overlays).toEqual([]);
    expect(state.statuses).toEqual([]);
    expect(state.revoke).toHaveBeenCalledWith(pending.objectUrl);
  });

  it('discards a result when the lock flips while loading', async () => {
    const state = setup();
    const upload = state.controller.upload({ name: 'pending.png' } as File);
    state.lockedRef.current = true;
    const pending = makeOverlay('blob:locked');
    state.loads[0]!.resolve(pending);
    await upload;

    expect(state.overlays).toEqual([]);
    expect(state.statuses).toEqual([]);
    expect(state.revoke).toHaveBeenCalledWith(pending.objectUrl);
  });

  it('synchronizes parsed z-position with state, lifetime, and future uploads', async () => {
    const state = setup();
    const owned = makeOverlay('blob:owned');
    state.lifetime.replace(owned);

    state.controller.changeZPos('42');
    const upload = state.controller.upload({ name: 'next.png' } as File);

    expect(state.zPositions).toEqual([42]);
    expect(state.overlays.at(-1)).toMatchObject({ objectUrl: owned.objectUrl, zPos: 42 });
    expect(state.load).toHaveBeenCalledWith(expect.objectContaining({ zPos: 42 }));
    state.loads[0]!.resolve({ ok: false, width: 1, height: 2 });
    await upload;
  });

  it('reports success, invalid dimensions, and current upload errors', async () => {
    const state = setup();
    const successUpload = state.controller.upload({ name: 'good.png' } as File);
    const success = makeOverlay('blob:good');
    state.loads[0]!.resolve(success);
    await successUpload;

    const invalidUpload = state.controller.upload({ name: 'bad.png' } as File);
    state.loads[1]!.resolve({ ok: false, width: 10, height: 20 });
    await invalidUpload;

    const error = new Error('decode failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const errorUpload = state.controller.upload({ name: 'error.png' } as File);
    state.loads[2]!.reject(error);
    await errorUpload;

    expect(state.statuses).toEqual([
      { kind: 'info', text: 'loaded blob:good.png' },
      { kind: 'error', text: 'invalid 10x20' },
      { kind: 'error', text: 'failed' },
    ]);
    expect(errorSpy).toHaveBeenCalledWith('Custom overlay upload failed:', error);
    errorSpy.mockRestore();
  });
});
