import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

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
  it('returns complete PNG responses with explicit lengths under parallel load', async () => {
    const middleware = getLocalSpritesheetsMiddleware();
    const assetPath = fileURLToPath(
      new URL('../../../assets/spritesheets/body/bodies/male/walk.png', import.meta.url),
    );
    const expected = await readFile(assetPath);

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
  });
});
