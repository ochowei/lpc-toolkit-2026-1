import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { AssetCacheLayout } from './asset-cache.js';

export type AssetImageSource = string | Buffer;

export interface AssetStore {
  readonly kind: 'directory' | 'zip';
  readonly baseUrl: string;
  readonly description: string;
  has(logicalPath: string): boolean;
  load(sourcePath: string): Promise<AssetImageSource>;
}

const urlSchemePattern = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function hasUrlScheme(sourcePath: string): boolean {
  return urlSchemePattern.test(sourcePath) && !path.win32.isAbsolute(sourcePath);
}

function isSafeLogicalPath(logicalPath: string): boolean {
  const components = logicalPath.split('/');
  return (
    logicalPath.length > 0 &&
    !logicalPath.includes('\0') &&
    !logicalPath.includes('\\') &&
    !urlSchemePattern.test(logicalPath) &&
    !path.posix.isAbsolute(logicalPath) &&
    !path.win32.isAbsolute(logicalPath) &&
    !components.includes('') &&
    !components.includes('.') &&
    !components.includes('..')
  );
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function isRegularFileInsideRoot(root: string, candidate: string): boolean {
  try {
    const canonicalCandidate = realpathSync.native(candidate);
    return (
      isInsideRoot(root, canonicalCandidate) && statSync(canonicalCandidate).isFile()
    );
  } catch {
    return false;
  }
}

export function createDirectoryAssetStore(assetsRoot: string): AssetStore {
  const resolvedRoot = path.resolve(assetsRoot);
  const canonicalRoot = realpathSync.native(resolvedRoot);

  return {
    kind: 'directory',
    baseUrl: resolvedRoot,
    description: `Directory assets at ${resolvedRoot}`,
    has(logicalPath) {
      if (!isSafeLogicalPath(logicalPath)) return false;
      const candidate = path.resolve(resolvedRoot, logicalPath);
      return (
        isInsideRoot(resolvedRoot, candidate) &&
        isRegularFileInsideRoot(canonicalRoot, candidate)
      );
    },
    async load(sourcePath) {
      if (
        sourcePath.includes('\0') ||
        hasUrlScheme(sourcePath) ||
        !path.isAbsolute(sourcePath)
      ) {
        throw new Error(`Invalid directory asset path: ${sourcePath}`);
      }
      const candidate = path.resolve(sourcePath);
      if (
        !isInsideRoot(resolvedRoot, candidate) ||
        !isRegularFileInsideRoot(canonicalRoot, candidate)
      ) {
        throw new Error(
          `Directory asset is outside the asset root, missing, or not a regular file: ${sourcePath}`,
        );
      }
      return candidate;
    },
  };
}

function readSpriteIndex(spriteIndexPath: string): Set<string> {
  const value = JSON.parse(readFileSync(spriteIndexPath, 'utf8')) as unknown;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`Sprite index must be an array of paths: ${spriteIndexPath}`);
  }
  return new Set(value);
}

function zipLogicalPath(sourcePath: string): string {
  const prefix = 'lpc-zip:/';
  if (!sourcePath.startsWith(prefix)) {
    throw new Error(`Invalid ZIP asset scheme: ${sourcePath}`);
  }
  const logicalPath = sourcePath.slice(prefix.length);
  if (!isSafeLogicalPath(logicalPath)) {
    throw new Error(`Invalid ZIP asset path: ${sourcePath}`);
  }
  return logicalPath;
}

function splitZipLogicalPath(logicalPath: string): {
  readonly category: string;
  readonly entryPath: string;
} {
  const [root, category, ...entryComponents] = logicalPath.split('/');
  if (root !== 'spritesheets' || category === undefined || entryComponents.length === 0) {
    throw new Error(`Invalid indexed sprite path: ${logicalPath}`);
  }
  return { category, entryPath: entryComponents.join('/') };
}

export function createZipAssetStore(layout: AssetCacheLayout): AssetStore {
  const spriteIndex = readSpriteIndex(layout.spriteIndexPath);
  const zipCache = new Map<string, Promise<JSZip>>();

  const loadCategory = (category: string): Promise<JSZip> => {
    const cached = zipCache.get(category);
    if (cached !== undefined) return cached;
    const loaded = JSZip.loadAsync(
      readFileSync(path.join(layout.zipsRoot, `${category}.zip`)),
    );
    zipCache.set(category, loaded);
    return loaded;
  };

  return {
    kind: 'zip',
    baseUrl: 'lpc-zip:',
    description: `Cached ZIP assets at ${layout.zipsRoot}`,
    has(logicalPath) {
      return isSafeLogicalPath(logicalPath) && spriteIndex.has(logicalPath);
    },
    async load(sourcePath) {
      const logicalPath = zipLogicalPath(sourcePath);
      if (!spriteIndex.has(logicalPath)) {
        throw new Error(`ZIP asset is not present in the sprite index: ${logicalPath}`);
      }
      const { category, entryPath } = splitZipLogicalPath(logicalPath);
      const zip = await loadCategory(category);
      const file = zip.file(entryPath);
      if (file === null || file.dir) {
        throw new Error(`ZIP asset entry is missing: ${logicalPath}`);
      }
      return file.async('nodebuffer');
    },
  };
}
