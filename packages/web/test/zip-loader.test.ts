import { describe, expect, it, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { loadFileFromZip, clearZipCacheForTests } from '../src/adapter/zip-loader';

describe('zip-loader', () => {
  beforeEach(() => {
    clearZipCacheForTests();
    vi.unstubAllGlobals();
  });

  it('should fetch a zip file, parse it, and extract a blob URL', async () => {
    const zip = new JSZip();
    zip.file('male/walk.png', 'fake-png-content');
    const content = await zip.generateAsync({ type: 'arraybuffer' });

    const fetchMock = vi.fn().mockResolvedValue(new Response(content));
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');

    vi.stubGlobal('fetch', fetchMock);

    const originalURL = globalThis.URL;
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
    }
    vi.stubGlobal('URL', MockURL);

    const url = await loadFileFromZip('spritesheets/body/male/walk.png', 'http://localhost/');

    expect(url).toBe('blob:mock-url');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost/zips/body.zip');
    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it('should cache downloaded zip files', async () => {
    const zip = new JSZip();
    zip.file('male/walk.png', 'fake-png-content');
    const content = await zip.generateAsync({ type: 'arraybuffer' });

    const fetchMock = vi.fn().mockResolvedValue(new Response(content));
    vi.stubGlobal('fetch', fetchMock);

    const originalURL = globalThis.URL;
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
    }
    vi.stubGlobal('URL', MockURL);

    await loadFileFromZip('spritesheets/body/male/walk.png', 'http://localhost/');
    await loadFileFromZip('spritesheets/body/male/walk.png', 'http://localhost/');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a ZIP download after a failed attempt', async () => {
    const zip = new JSZip();
    zip.file('male/walk.png', 'fake-png-content');
    const content = await zip.generateAsync({ type: 'arraybuffer' });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(content));
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');

    vi.stubGlobal('fetch', fetchMock);

    const originalURL = globalThis.URL;
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
    }
    vi.stubGlobal('URL', MockURL);

    await expect(
      loadFileFromZip('spritesheets/body/male/walk.png', 'http://localhost/'),
    ).rejects.toThrow('HTTP 503');

    await expect(
      loadFileFromZip('spritesheets/body/male/walk.png', 'http://localhost/'),
    ).resolves.toBe('blob:mock-url');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
