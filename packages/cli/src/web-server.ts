import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface WebServerOptions {
  readonly host: string;
  readonly port: number;
  readonly open: boolean;
}

export interface StartWebServerOptions extends WebServerOptions {
  readonly webRoot: string;
  readonly assetsRoot: string;
}

export interface RunningWebServer {
  readonly url: string;
  close(): Promise<void>;
  readonly closed: Promise<void>;
}

export interface WebServerDependencies {
  readonly openBrowser?: (url: string) => Promise<void>;
  readonly onWarning?: (message: string) => void;
  readonly createServer?: typeof createServer;
  readonly realpath?: (pathName: string) => string;
  readonly stat?: (pathName: string) => { isFile(): boolean };
  readonly streamFile?: typeof createReadStream;
  readonly spawnBrowser?: BrowserSpawner;
}

export interface BrowserChild {
  once(event: 'error' | 'spawn', listener: (error?: Error) => void): unknown;
  unref(): void;
}

export type BrowserSpawner = (
  command: string,
  args: readonly string[],
  options: { readonly detached: boolean; readonly stdio: 'ignore' },
) => BrowserChild;

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
};

export function validateWebOptions(input: {
  readonly host?: string;
  readonly port?: string;
  readonly noOpen?: boolean;
}): WebServerOptions {
  const host = input.host ?? '127.0.0.1';
  const port = input.port === undefined ? 4173 : Number(input.port);
  if (host.length === 0) throw new Error('--host must not be empty.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('--port must be an integer from 0 through 65535.');
  }
  return { host, port, open: input.noOpen !== true };
}

export function browserCommand(platform: NodeJS.Platform, url: string): {
  readonly command: string;
  readonly args: readonly string[];
} {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeRequestPath(requestUrl: string): string | undefined {
  const queryIndex = requestUrl.search(/[?#]/);
  const pathname = queryIndex === -1 ? requestUrl : requestUrl.slice(0, queryIndex);
  if (!pathname.startsWith('/')) return undefined;
  if (pathname.includes('%2f') || pathname.includes('%2F') || pathname.includes('%5c') || pathname.includes('%5C')) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const components = decoded.split('/');
  if (decoded.includes('\0') || decoded.includes('\\') || components.includes('.') || components.includes('..')) return undefined;
  return decoded;
}

function resolveRegularFile(
  canonicalRoot: string,
  relativePath: string,
  dependencies: WebServerDependencies,
): string | undefined {
  const candidate = path.resolve(canonicalRoot, relativePath);
  if (!isInsideRoot(canonicalRoot, candidate)) return undefined;
  try {
    const canonicalCandidate = (dependencies.realpath ?? realpathSync.native)(candidate);
    if (!isInsideRoot(canonicalRoot, canonicalCandidate) || !(dependencies.stat ?? statSync)(canonicalCandidate).isFile()) return undefined;
    return canonicalCandidate;
  } catch {
    return undefined;
  }
}

function defaultOpenBrowser(url: string, spawnBrowser?: BrowserSpawner): Promise<void> {
  const { command, args } = browserCommand(process.platform, url);
  const start = spawnBrowser ?? ((spawnCommand, spawnArgs, spawnOptions) =>
    spawn(spawnCommand, spawnArgs, spawnOptions));
  return new Promise((resolve, reject) => {
    let child: BrowserChild;
    try {
      child = start(command, args, { detached: true, stdio: 'ignore' });
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', (error) => reject(error ?? new Error('Browser process failed to start.')));
    child.once('spawn', () => resolve());
    child.unref();
  });
}

export async function startWebServer(
  options: StartWebServerOptions,
  dependencies: WebServerDependencies = {},
): Promise<RunningWebServer> {
  const realpath = dependencies.realpath ?? realpathSync.native;
  const canonicalWebRoot = realpath(path.resolve(options.webRoot));
  const canonicalAssetsRoot = realpath(path.resolve(options.assetsRoot));
  const canonicalZipsRoot = realpath(path.join(canonicalAssetsRoot, 'zips'));
  if (!isInsideRoot(canonicalAssetsRoot, canonicalZipsRoot)) {
    throw new Error('assetsRoot/zips must resolve inside assetsRoot.');
  }
  const makeServer = dependencies.createServer ?? createServer;
  const streamFile = dependencies.streamFile ?? createReadStream;
  const server = makeServer((request, response) => {
    const requestPath = safeRequestPath(request.url ?? '/');
    if (requestPath === undefined) {
      response.writeHead(404).end();
      return;
    }
    const isZip = requestPath.startsWith('/zips/');
    const zipName = isZip ? requestPath.slice('/zips/'.length) : undefined;
    const filePath = isZip
      ? (zipName !== undefined && zipName.length > 0 && !zipName.includes('/') && zipName.endsWith('.zip')
        ? resolveRegularFile(canonicalZipsRoot, zipName, dependencies)
        : undefined)
      : requestPath === '/'
        ? resolveRegularFile(canonicalWebRoot, 'index.html', dependencies)
        : resolveRegularFile(canonicalWebRoot, requestPath.slice(1), dependencies);
    const spaPath = !isZip && requestPath !== '/' && !path.posix.basename(requestPath).includes('.');
    const selectedPath = filePath ?? (spaPath ? resolveRegularFile(canonicalWebRoot, 'index.html', dependencies) : undefined);
    if (selectedPath === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(selectedPath).toLowerCase()] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    streamFile(selectedPath).on('error', () => response.destroy()).pipe(response);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(options.port, options.host);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Web server did not provide an internet address.');
  const host = address.address.includes(':') ? `[${address.address}]` : address.address;
  const url = `http://${host}:${address.port}`;
  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  server.once('close', resolveClosed);
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closing === undefined) {
      server.closeIdleConnections();
      closing = new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
    }
    return closing;
  };
  if (options.open) {
    try {
      await (dependencies.openBrowser ?? ((browserUrl) => defaultOpenBrowser(browserUrl, dependencies.spawnBrowser)))(url);
    } catch (error) {
      dependencies.onWarning?.(`Could not open browser: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { url, close, closed };
}
