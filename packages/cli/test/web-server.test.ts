import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { get } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserCommand,
  startWebServer,
  validateWebOptions,
} from '../src/web-server.js';

const runningServers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

function createRoots(): { readonly webRoot: string; readonly assetsRoot: string; readonly outside: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-web-server-'));
  const webRoot = path.join(root, 'web');
  const assetsRoot = path.join(root, 'cache');
  const outside = path.join(root, 'outside');
  mkdirSync(path.join(webRoot, 'assets'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'zips'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(webRoot, 'index.html'), '<div id="root">app</div>');
  writeFileSync(path.join(webRoot, 'assets', 'app.js'), 'console.log("app")');
  writeFileSync(path.join(webRoot, 'assets', 'app.css'), 'body{}');
  writeFileSync(path.join(assetsRoot, 'zips', 'body.zip'), 'zip-data');
  writeFileSync(path.join(outside, 'secret'), 'secret-data');
  return { webRoot, assetsRoot, outside };
}

async function startFixture(open = false) {
  const roots = createRoots();
  const server = await startWebServer(
    { ...roots, host: '127.0.0.1', port: 0, open },
    { openBrowser: vi.fn(async () => undefined) },
  );
  runningServers.push(server);
  return { ...roots, server };
}

async function requestRaw(url: string, pathname: string): Promise<{ readonly status: number; readonly body: string }> {
  return new Promise((resolve, reject) => {
    const request = get(url, { path: pathname }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.once('error', reject);
  });
}

describe('validateWebOptions', () => {
  it('uses documented defaults and accepts port zero', () => {
    expect(validateWebOptions({})).toEqual({ host: '127.0.0.1', port: 4173, open: true });
    expect(validateWebOptions({ port: '0', noOpen: true })).toEqual({ host: '127.0.0.1', port: 0, open: false });
  });

  it.each(['-1', '65536', '4173.5', 'not-a-port'])('rejects invalid port %s', (port) => {
    expect(() => validateWebOptions({ port })).toThrow('port');
  });
});

describe('startWebServer', () => {
  it('serves the SPA bundle and the allowlisted ZIP files', async () => {
    const { server } = await startFixture();
    expect(await fetch(new URL('/', server.url)).then((response) => response.text())).toContain('<div id="root">');
    expect(await fetch(new URL('/zips/body.zip', server.url)).then((response) => response.text())).toBe('zip-data');
  });

  it('sets MIME and nosniff headers, falls back only navigation routes, and returns 404 for unknown files', async () => {
    const { server } = await startFixture();
    const script = await fetch(new URL('/assets/app.js', server.url));
    expect(script.headers.get('content-type')).toContain('text/javascript');
    expect(script.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await fetch(new URL('/character/editor', server.url)).then((response) => response.text())).toContain('app');
    expect((await fetch(new URL('/unknown.txt', server.url))).status).toBe(404);
  });

  it.each(['/../secret', '/%2e%2e/secret', '/zips/../secret', '/zips/body%2fextra.zip', '/zips/body%5cextra.zip', '/zips/body%00.zip'])('rejects unsafe paths', async (pathname) => {
    const { server } = await startFixture();
    const response = await requestRaw(server.url, pathname);
    expect(response.status).toBe(404);
    expect(response.body).not.toContain('secret-data');
  });

  it('blocks symlink escapes from both allowlisted roots', async () => {
    const { server, webRoot, assetsRoot, outside } = await startFixture();
    symlinkSync(path.join(outside, 'secret'), path.join(webRoot, 'escape.js'));
    symlinkSync(path.join(outside, 'secret'), path.join(assetsRoot, 'zips', 'escape.zip'));
    expect((await fetch(new URL('/escape.js', server.url))).status).toBe(404);
    expect((await fetch(new URL('/zips/escape.zip', server.url))).status).toBe(404);
  });

  it('rejects an assetsRoot zips-directory symlink that escapes the assets root', async () => {
    const roots = createRoots();
    const externalZips = path.join(roots.outside, 'zips');
    mkdirSync(externalZips);
    writeFileSync(path.join(externalZips, 'body.zip'), 'external-zip-data');
    rmSync(path.join(roots.assetsRoot, 'zips'), { recursive: true });
    symlinkSync(externalZips, path.join(roots.assetsRoot, 'zips'), 'dir');
    await expect(startWebServer(
      { ...roots, host: '127.0.0.1', port: 0, open: false },
    )).rejects.toThrow('zips');
  });

  it('opens only after listening and warns without failing when opening fails', async () => {
    const roots = createRoots();
    const openBrowser = vi.fn(async () => { throw new Error('desktop unavailable'); });
    const onWarning = vi.fn();
    const server = await startWebServer({ ...roots, host: '127.0.0.1', port: 0, open: true }, { openBrowser, onWarning });
    runningServers.push(server);
    expect(openBrowser).toHaveBeenCalledWith(server.url);
    expect(onWarning).toHaveBeenCalled();
    expect((await fetch(new URL('/', server.url))).status).toBe(200);
  });

  it('does not invoke the opener when disabled and closes idempotently', async () => {
    const roots = createRoots();
    const openBrowser = vi.fn(async () => undefined);
    const server = await startWebServer({ ...roots, host: '127.0.0.1', port: 0, open: false }, { openBrowser });
    expect(openBrowser).not.toHaveBeenCalled();
    await server.close();
    await server.close();
    await expect(server.closed).resolves.toBeUndefined();
  });

  it('warns and remains healthy when the default browser spawn emits an error', async () => {
    const roots = createRoots();
    const child = new EventEmitter();
    const unref = vi.fn();
    const onWarning = vi.fn();
    const spawnBrowser = vi.fn(() => {
      queueMicrotask(() => child.emit('error', new Error('spawn failed')));
      return {
        once: child.once.bind(child),
        unref,
      };
    });
    const server = await startWebServer(
      { ...roots, host: '127.0.0.1', port: 0, open: true },
      { onWarning, spawnBrowser },
    );
    runningServers.push(server);
    expect(spawnBrowser).toHaveBeenCalled();
    expect(unref).toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('spawn failed'));
    expect((await fetch(new URL('/', server.url))).status).toBe(200);
  });

  it('rejects when the requested port is already in use', async () => {
    const first = await startFixture();
    const port = Number(new URL(first.server.url).port);
    const roots = createRoots();
    await expect(startWebServer(
      { ...roots, host: '127.0.0.1', port, open: false },
      { openBrowser: vi.fn(async () => undefined) },
    )).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});

describe('browserCommand', () => {
  it.each([
    ['darwin', { command: 'open', args: ['http://localhost'] }],
    ['win32', { command: 'cmd', args: ['/c', 'start', '', 'http://localhost'] }],
    ['linux', { command: 'xdg-open', args: ['http://localhost'] }],
  ] as const)('returns the browser command for %s', (platform, expected) => {
    expect(browserCommand(platform, 'http://localhost')).toEqual(expected);
  });
});
