import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserCanvasAdapter,
  resolveSpriteUrl,
} from '../src/adapter/browser-canvas-adapter';

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
        'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/spritesheets/a.png',
      );
      expect(createImageBitmapMock).toHaveBeenCalledWith(blob);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
