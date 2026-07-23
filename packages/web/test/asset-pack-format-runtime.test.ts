import { deflateRawSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createBrowserAssetPackFormatRuntime } from '../src/adapter/asset-pack-format-runtime';

describe('browser asset-pack format runtime', () => {
  it('hashes bytes and performs strict UTF-8 round trips', async () => {
    const runtime = createBrowserAssetPackFormatRuntime({ crypto: globalThis.crypto });
    await expect(runtime.sha256(new TextEncoder().encode('hello'))).resolves.toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(runtime.decodeUtf8Fatal(runtime.encodeUtf8('héllo'))).toBe('héllo');
    expect(() => runtime.decodeUtf8Fatal(Uint8Array.from([0xc3, 0x28]))).toThrow();
  });

  it('inflates raw DEFLATE exactly and cancels a reader before retaining an over-bound chunk', async () => {
    const compressed = new Uint8Array(deflateRawSync(Buffer.from('hello')));
    const runtime = createBrowserAssetPackFormatRuntime({
      crypto: globalThis.crypto,
      createDecompressionStream: (format) => new DecompressionStream(format),
    });
    await expect(runtime.inflateRawBounded({ compressed, declaredSize: 5, maximumSize: 5 })).resolves.toEqual(
      new TextEncoder().encode('hello'),
    );
    await expect(runtime.inflateRawBounded({ compressed, declaredSize: 4, maximumSize: 5 })).rejects.toThrow(
      /declared|length/i,
    );

    const cancel = vi.fn(async () => undefined);
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: Uint8Array.from([1, 2, 3]) })
        .mockResolvedValueOnce({ done: false, value: Uint8Array.from([4, 5]) }),
      cancel,
      releaseLock: vi.fn(),
    };
    const stream = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;
    const bounded = createBrowserAssetPackFormatRuntime({
      crypto: globalThis.crypto,
      createDecompressionStream: () => ({
        readable: stream,
        writable: { getWriter: () => ({ write: vi.fn(), close: vi.fn() }) },
      } as unknown as DecompressionStream),
    });
    await expect(bounded.inflateRawBounded({ compressed, declaredSize: 5, maximumSize: 4 })).rejects.toThrow(
      /bounded output/i,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('reports missing crypto and decompression capabilities with typed diagnostics', async () => {
    const cryptoMissing = createBrowserAssetPackFormatRuntime({ crypto: null });
    await expect(cryptoMissing.sha256(new Uint8Array([1]))).rejects.toMatchObject({
      code: 'asset_browser_capability_missing',
    });

    const decompressionMissing = createBrowserAssetPackFormatRuntime({
      crypto: globalThis.crypto,
      createDecompressionStream: () => {
        throw new Error('missing');
      },
    });
    await expect(decompressionMissing.inflateRawBounded({
      compressed: new Uint8Array([1]),
      declaredSize: 0,
      maximumSize: 0,
    })).rejects.toMatchObject({ code: 'asset_browser_capability_missing' });
  });
});
