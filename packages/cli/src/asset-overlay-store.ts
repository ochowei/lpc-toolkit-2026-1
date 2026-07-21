import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  createDirectoryAssetStore,
  type AssetImageSource,
  type AssetStore,
} from './asset-store.js';

export interface OverlayAssetStoreOptions {
  readonly base: AssetStore;
  readonly overlayRoot: string;
  readonly logicalPaths: readonly string[];
}

export function createOverlayAssetStore(
  options: OverlayAssetStoreOptions,
): AssetStore {
  const overlayRoot = path.resolve(options.overlayRoot);
  const authorizedLogicalPaths = new Set(options.logicalPaths);
  const overlayDirectory = createDirectoryAssetStore(overlayRoot);

  const overlayPathFor = (logicalPath: string): string =>
    path.join(overlayRoot, logicalPath);

  const existingAuthorizedOverlayPathFor = (
    logicalPath: string,
  ): string | undefined => {
    if (!authorizedLogicalPaths.has(logicalPath)) return undefined;
    const overlayPath = overlayPathFor(logicalPath);
    return existsSync(overlayPath) ? overlayPath : undefined;
  };

  const validAuthorizedOverlayPathFor = (
    logicalPath: string,
  ): string | undefined => {
    const overlayPath = existingAuthorizedOverlayPathFor(logicalPath);
    if (overlayPath === undefined || !overlayDirectory.has(logicalPath)) {
      return undefined;
    }
    return overlayPath;
  };

  return {
    kind: 'overlay',
    baseUrl: options.base.baseUrl,
    description: `Overlay assets at ${overlayRoot} over ${options.base.description}`,
    logicalPath(sourcePath) {
      const overlayLogicalPath = overlayDirectory.logicalPath(sourcePath);
      if (
        overlayLogicalPath !== undefined &&
        authorizedLogicalPaths.has(overlayLogicalPath)
      ) {
        return overlayLogicalPath;
      }
      return options.base.logicalPath(sourcePath);
    },
    has(logicalPath) {
      if (validAuthorizedOverlayPathFor(logicalPath) !== undefined) {
        return true;
      }
      if (existingAuthorizedOverlayPathFor(logicalPath) !== undefined) return false;
      return options.base.has(logicalPath);
    },
    async load(sourcePath): Promise<AssetImageSource> {
      const logicalPath = options.base.logicalPath(sourcePath);
      if (logicalPath !== undefined) {
        const overlayPath = existingAuthorizedOverlayPathFor(logicalPath);
        if (overlayPath !== undefined) return overlayDirectory.load(overlayPath);
      }
      return options.base.load(sourcePath);
    },
  };
}
