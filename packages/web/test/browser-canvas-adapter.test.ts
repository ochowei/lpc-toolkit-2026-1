import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  createBrowserCanvasAdapter,
  resolveSpriteUrl,
} from '../src/adapter/browser-canvas-adapter';
import { resolveUpstreamSpriteUrl } from '../src/adapter/asset-source';

describe('resolveSpriteUrl', () => {
  it('resolves a core sprite path against the document base', () => {
    expect(
      resolveSpriteUrl('spritesheets/body/bodies/male/walk.png', 'http://x/'),
    ).toBe('http://x/spritesheets/body/bodies/male/walk.png');
  });

  it('resolves under a sub-path base', () => {
    expect(
      resolveSpriteUrl('spritesheets/a.png', 'http://x/app/'),
    ).toBe('http://x/app/spritesheets/a.png');
  });
});

describe('createBrowserCanvasAdapter', () => {
  it('tries the local sprite URL before the upstream URL in auto mode', async () => {
    const blob = new Blob(['image']);
    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/app/' } satisfies Pick<
      Document,
      'baseURI'
    >;
    const fetchMock = vi.fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(blob));
    const createImageBitmapMock = vi
      .fn<(image: Blob) => Promise<ImageBitmap>>()
      .mockResolvedValue(bitmap as ImageBitmap);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    vi.stubGlobal('document', documentStub);

    try {
      const image = await createBrowserCanvasAdapter('auto').loadImage(
        'spritesheets/a.png',
      );

      expect(image).toBe(bitmap);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://x/app/spritesheets/a.png',
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        resolveUpstreamSpriteUrl('spritesheets/a.png'),
      );
      expect(createImageBitmapMock).toHaveBeenCalledWith(blob);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('loads from ZIP in zip mode', async () => {
    const zip = new JSZip();
    zip.file('male/walk.png', 'fake-png-content');
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/app/' } satisfies Pick<
      Document,
      'baseURI'
    >;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(zipBuffer))
      .mockResolvedValueOnce(new Response(new Blob(['fake-png-content'])));

    const createImageBitmapMock = vi
      .fn()
      .mockResolvedValue(bitmap as ImageBitmap);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    vi.stubGlobal('document', documentStub);

    const originalURL = globalThis.URL;
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
      static override revokeObjectURL = revokeObjectURLMock;
    }
    vi.stubGlobal('URL', MockURL);

    try {
      const image = await createBrowserCanvasAdapter('zip').loadImage(
        'spritesheets/body/male/walk.png',
      );

      expect(image).toBe(bitmap);
      expect(fetchMock).toHaveBeenCalledWith('http://x/app/zips/body.zip');
      expect(fetchMock).toHaveBeenCalledWith('blob:mock-url');
      expect(createImageBitmapMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('limits concurrent fetches to 6 in-flight calls', async () => {
    let active = 0;
    let peakActive = 0;
    const totalRequests = 20;
    const releaseControllers: Array<() => void> = [];

    const blob = new Blob(['image']);
    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/' } satisfies Pick<
      Document,
      'baseURI'
    >;

    const fetchMock = vi.fn<(url: string) => Promise<Response>>().mockImplementation(
      async () => {
        active++;
        if (active > peakActive) peakActive = active;
        await new Promise<void>((resolve) => releaseControllers.push(resolve));
        active--;
        return new Response(blob);
      },
    );
    const createImageBitmapMock = vi
      .fn<(image: Blob) => Promise<ImageBitmap>>()
      .mockResolvedValue(bitmap as ImageBitmap);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    vi.stubGlobal('document', documentStub);

    try {
      const adapter = createBrowserCanvasAdapter('local');
      const pending = Array.from({ length: totalRequests }, (_, i) =>
        adapter.loadImage(`spritesheets/img-${i}.png`),
      );
      // Give microtasks a chance to schedule.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      expect(peakActive).toBeLessThanOrEqual(6);
      expect(peakActive).toBeGreaterThan(0);
      expect(releaseControllers.length).toBeLessThanOrEqual(6);

      // Drain: release all queued fetches one by one.
      while (releaseControllers.length > 0) {
        const next = releaseControllers.shift();
        if (next) next();
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
      await Promise.all(pending);

      expect(fetchMock).toHaveBeenCalledTimes(totalRequests);
      expect(peakActive).toBeLessThanOrEqual(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the concurrency limit when auto mode falls back through 404s', async () => {
    let active = 0;
    let peakActive = 0;
    const totalRequests = 20;
    // Parks every upstream fetch until we explicitly release it.
    const upstreamReleasers: Array<() => void> = [];

    const blob = new Blob(['image']);
    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/' } satisfies Pick<
      Document,
      'baseURI'
    >;

    const fetchMock = vi
      .fn<(url: string) => Promise<Response>>()
      .mockImplementation(async (url: string) => {
        active++;
        if (active > peakActive) peakActive = active;
        try {
          if (url.startsWith('http://x/')) {
            // local: synchronous 404 — forces loadImage to re-acquire for upstream URL
            return new Response(null, { status: 404 });
          }
          // upstream: park until released
          await new Promise<void>((resolve) => upstreamReleasers.push(resolve));
          return new Response(blob);
        } finally {
          active--;
        }
      });
    const createImageBitmapMock = vi
      .fn<(image: Blob) => Promise<ImageBitmap>>()
      .mockResolvedValue(bitmap as ImageBitmap);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    vi.stubGlobal('document', documentStub);

    try {
      const adapter = createBrowserCanvasAdapter('auto');
      const pending = Array.from({ length: totalRequests }, (_, i) =>
        adapter.loadImage(`spritesheets/img-${i}.png`),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 30));

      expect(peakActive).toBeLessThanOrEqual(6);
      expect(peakActive).toBeGreaterThan(0);

      while (upstreamReleasers.length > 0) {
        const next = upstreamReleasers.shift();
        if (next) next();
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
      await Promise.all(pending);

      expect(peakActive).toBeLessThanOrEqual(6);
      // Each loadImage hit local (404) then upstream (200) → 2 fetches each.
      expect(fetchMock).toHaveBeenCalledTimes(totalRequests * 2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shares the concurrency limit across adapter instances', async () => {
    let active = 0;
    let peakActive = 0;
    const totalRequests = 20;
    const releaseControllers: Array<() => void> = [];

    const blob = new Blob(['image']);
    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/' } satisfies Pick<
      Document,
      'baseURI'
    >;

    const fetchMock = vi.fn<(url: string) => Promise<Response>>().mockImplementation(
      async () => {
        active++;
        if (active > peakActive) peakActive = active;
        await new Promise<void>((resolve) => releaseControllers.push(resolve));
        active--;
        return new Response(blob);
      },
    );
    const createImageBitmapMock = vi
      .fn<(image: Blob) => Promise<ImageBitmap>>()
      .mockResolvedValue(bitmap as ImageBitmap);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    vi.stubGlobal('document', documentStub);

    try {
      const adapters = Array.from({ length: totalRequests }, () =>
        createBrowserCanvasAdapter('local'),
      );
      const pending = adapters.map((adapter, i) =>
        adapter.loadImage(`spritesheets/img-${i}.png`),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      expect(peakActive).toBeLessThanOrEqual(6);
      expect(peakActive).toBeGreaterThan(0);
      expect(releaseControllers.length).toBeLessThanOrEqual(6);

      while (releaseControllers.length > 0) {
        const next = releaseControllers.shift();
        if (next) next();
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
      await Promise.all(pending);

      expect(fetchMock).toHaveBeenCalledTimes(totalRequests);
      expect(peakActive).toBeLessThanOrEqual(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
