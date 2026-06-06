import type { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import type { Plugin, ViteDevServer } from 'vite';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import viteConfig from '../vite.config';

const readFileMock = vi.hoisted(() => vi.fn<(path: string) => Promise<Buffer>>());

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}));

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

class BufferedResponse extends PassThrough {
  readonly headers = new Map<string, string | number | readonly string[]>();

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }
}

function getLocalSpritesheetsMiddleware(): Middleware {
  const plugins = (viteConfig.plugins ?? []).flat(4).filter(Boolean) as Plugin[];
  const plugin = plugins.find(
    (candidate) => candidate.name === 'local-spritesheets-plugin',
  );
  if (!plugin || typeof plugin.configureServer !== 'function') {
    throw new Error('local-spritesheets-plugin configureServer hook is missing');
  }

  let middleware: Middleware | undefined;
  const server = {
    middlewares: {
      use(handler: Middleware) {
        middleware = handler;
      },
    },
  } as unknown as ViteDevServer;

  plugin.configureServer(server);
  if (!middleware) {
    throw new Error('local-spritesheets-plugin middleware was not registered');
  }
  return middleware;
}

async function invokeMiddleware(
  middleware: Middleware,
  url: string,
): Promise<{ body: Buffer; response: BufferedResponse }> {
  const response = new BufferedResponse();
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));

  const body = new Promise<Buffer>((resolve, reject) => {
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
    middleware(
      { url } as IncomingMessage,
      response as unknown as ServerResponse,
      (error) => {
        reject(
          error instanceof Error
            ? error
            : new Error(`middleware called next: ${String(error)}`),
        );
      },
    );
  });

  return { body: await body, response };
}

describe('local-spritesheets-plugin', () => {
  it('serves complete PNG responses from the release ZIP under parallel load', async () => {
    const middleware = getLocalSpritesheetsMiddleware();
    const expected = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const zip = new JSZip();
    zip.file('bodies/male/walk.png', expected);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    readFileMock.mockImplementation(async (filePath) => {
      if (filePath.endsWith('/assets/spritesheets/body/bodies/male/walk.png')) {
        throw new Error('ENOENT: loose spritesheet is absent');
      }
      if (filePath.endsWith('/packages/web/public/zips/body.zip')) {
        return zipBuffer;
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    const responses = await Promise.all(
      Array.from({ length: 128 }, () =>
        invokeMiddleware(
          middleware,
          '/spritesheets/body/bodies/male/walk.png',
        ),
      ),
    );

    for (const { body, response } of responses) {
      expect(body).toEqual(expected);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(Number(response.headers.get('content-length'))).toBe(
        expected.length,
      );
    }

    expect(
      readFileMock.mock.calls.filter(([filePath]) =>
        filePath.endsWith('/packages/web/public/zips/body.zip'),
      ),
    ).toHaveLength(1);
  });
});
