import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AssetReleaseConfig {
  readonly tag: string;
  readonly sourceRepository: string;
  readonly sourceSha: string;
  readonly manifestUrl: string;
  readonly manifestSha256: string;
  readonly tarballUrl: string;
  readonly tarballSha256: string;
}

export interface CacheRootOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
}

function requireString(
  value: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string' || fieldValue.length === 0) {
    throw new Error(`Asset release ${field} must be a non-empty string.`);
  }
  return fieldValue;
}

export function parseAssetReleaseConfig(value: unknown): AssetReleaseConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Asset release configuration must be an object.');
  }

  const fields = value as Readonly<Record<string, unknown>>;
  const tag = requireString(fields, 'tag');
  const sourceRepository = requireString(fields, 'sourceRepository');
  const sourceSha = requireString(fields, 'sourceSha');
  const manifestUrl = requireString(fields, 'manifestUrl');
  const manifestSha256 = requireString(fields, 'manifestSha256');
  const tarballUrl = requireString(fields, 'tarballUrl');
  const tarballSha256 = requireString(fields, 'tarballSha256');

  if (!/^[a-zA-Z0-9._-]+$/.test(tag)) {
    throw new Error('Asset release tag is invalid.');
  }
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error('Asset release sourceSha is invalid.');
  }
  if (!/^[0-9a-f]{64}$/.test(manifestSha256)) {
    throw new Error('Asset release manifestSha256 is invalid.');
  }
  if (!/^[0-9a-f]{64}$/.test(tarballSha256)) {
    throw new Error('Asset release tarballSha256 is invalid.');
  }

  try {
    if (new URL(manifestUrl).protocol !== 'https:') {
      throw new Error('not HTTPS');
    }
  } catch {
    throw new Error('Asset release manifestUrl must be an HTTPS URL.');
  }
  try {
    if (new URL(tarballUrl).protocol !== 'https:') {
      throw new Error('not HTTPS');
    }
  } catch {
    throw new Error('Asset release tarballUrl must be an HTTPS URL.');
  }

  return {
    tag,
    sourceRepository,
    sourceSha,
    manifestUrl,
    manifestSha256,
    tarballUrl,
    tarballSha256,
  };
}

export function loadAssetReleaseConfig(filePath: string): AssetReleaseConfig {
  return parseAssetReleaseConfig(JSON.parse(readFileSync(filePath, 'utf8')) as unknown);
}

export function bundledAssetReleasePath(moduleUrl: string = import.meta.url): string {
  return fileURLToPath(new URL('./asset-release.json', moduleUrl));
}

export function resolveAssetCacheRoot(options: Partial<CacheRootOptions> = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? homedir();
  const pathApi = platform === 'win32' ? path.win32 : path.posix;

  if (env.LPC_TOOLKIT_CACHE_DIR !== undefined) {
    return env.LPC_TOOLKIT_CACHE_DIR;
  }
  if (platform === 'darwin') {
    return pathApi.join(homeDir, 'Library', 'Caches', 'lpc-toolkit');
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA ?? pathApi.join(homeDir, 'AppData', 'Local');
    return pathApi.join(localAppData, 'lpc-toolkit', 'Cache');
  }

  return pathApi.join(env.XDG_CACHE_HOME ?? pathApi.join(homeDir, '.cache'), 'lpc-toolkit');
}

export function releaseCachePath(cacheRoot: string, tag: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(tag)) {
    throw new Error('Asset release tag is invalid.');
  }
  return path.join(cacheRoot, tag);
}
