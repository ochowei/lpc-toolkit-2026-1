import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  createBrowserCanvasAdapter,
  resolveSpriteUrl,
} from '../src/adapter/browser-canvas-adapter';
import { clearZipCacheForTests } from '../src/adapter/zip-loader';

beforeEach(() => {
  clearZipCacheForTests();
});

async function waitForQueuedFetches(
  releaseControllers: ReadonlyArray<() => void>,
): Promise<void> {
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (releaseControllers.length > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
}

describe('resolveSpriteUrl', () => {
  it('resolves a core sprite path through the category ZIP archive', async () => {
    const zip = new JSZip();
    zip.file('male/walk.png', 'fake-png-content');
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const fetchMock = vi.fn().mockResolvedValue(new Response(zipBuffer));
    const originalURL = globalThis.URL;
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
    }

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', MockURL);

    try {
      await expect(
        resolveSpriteUrl('spritesheets/body/male/walk.png', 'http://x/app/'),
      ).resolves.toBe('blob:mock-url');
      expect(fetchMock).toHaveBeenCalledWith('http://x/app/zips/body.zip');
      expect(createObjectURLMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('createBrowserCanvasAdapter', () => {
  it('loads from ZIP by default', async () => {
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
      const image = await createBrowserCanvasAdapter().loadImage(
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

    const zip = new JSZip();
    for (let i = 0; i < totalRequests; i++) {
      zip.file(`img-${i}.png`, 'fake-png-content');
    }
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const blob = new Blob(['image']);
    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/' } satisfies Pick<
      Document,
      'baseURI'
    >;

    const fetchMock = vi.fn<(url: string) => Promise<Response>>().mockImplementation(
      async (url: string) => {
        if (url === 'http://x/zips/body.zip') {
          return new Response(zipBuffer);
        }
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

    const originalURL = globalThis.URL;
    let objectUrlCounter = 0;
    const createObjectURLMock = vi.fn(
      () => `blob:mock-url-${objectUrlCounter++}`,
    );
    const revokeObjectURLMock = vi.fn();
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
      static override revokeObjectURL = revokeObjectURLMock;
    }
    vi.stubGlobal('URL', MockURL);

    try {
      const adapter = createBrowserCanvasAdapter();
      const pending = Array.from({ length: totalRequests }, (_, i) =>
        adapter.loadImage(`spritesheets/body/img-${i}.png`),
      );
      await waitForQueuedFetches(releaseControllers);

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

      expect(fetchMock).toHaveBeenCalledTimes(totalRequests + 1);
      expect(peakActive).toBeLessThanOrEqual(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shares the concurrency limit across adapter instances', async () => {
    let active = 0;
    let peakActive = 0;
    const totalRequests = 20;
    const releaseControllers: Array<() => void> = [];

    const zip = new JSZip();
    for (let i = 0; i < totalRequests; i++) {
      zip.file(`img-${i}.png`, 'fake-png-content');
    }
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const blob = new Blob(['image']);
    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/' } satisfies Pick<
      Document,
      'baseURI'
    >;

    const fetchMock = vi.fn<(url: string) => Promise<Response>>().mockImplementation(
      async (url: string) => {
        if (url === 'http://x/zips/body.zip') {
          return new Response(zipBuffer);
        }
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

    const originalURL = globalThis.URL;
    let objectUrlCounter = 0;
    const createObjectURLMock = vi.fn(
      () => `blob:mock-url-${objectUrlCounter++}`,
    );
    const revokeObjectURLMock = vi.fn();
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
      static override revokeObjectURL = revokeObjectURLMock;
    }
    vi.stubGlobal('URL', MockURL);

    try {
      const adapters = Array.from({ length: totalRequests }, () =>
        createBrowserCanvasAdapter(),
      );
      const pending = adapters.map((adapter, i) =>
        adapter.loadImage(`spritesheets/body/img-${i}.png`),
      );
      await waitForQueuedFetches(releaseControllers);

      expect(peakActive).toBeLessThanOrEqual(6);
      expect(peakActive).toBeGreaterThan(0);
      expect(releaseControllers.length).toBeLessThanOrEqual(6);

      while (releaseControllers.length > 0) {
        const next = releaseControllers.shift();
        if (next) next();
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
      await Promise.all(pending);

      expect(fetchMock).toHaveBeenCalledTimes(totalRequests + 1);
      expect(peakActive).toBeLessThanOrEqual(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
