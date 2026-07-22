import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import {
  normalizeAssetPack,
  parseAssetPackSource,
  type AssetPackSourceInspection,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import {
  parseAssetPackPayload,
  type AssetPackFileDiagnostic,
  type AssetPackPayloadSuccess,
} from './asset-pack-payload.js';

const MANIFEST_FILE = 'asset-pack.json';

export type { AssetPackFileDiagnostic } from './asset-pack-payload.js';

export interface AssetPackFilesSuccess extends AssetPackPayloadSuccess {
  readonly root: string;
  readonly manifestPath: string;
  readonly manifestMtimeMs: number;
}

export interface AssetPackFilesFailure {
  readonly ok: false;
  readonly diagnostics: readonly AssetPackFileDiagnostic[];
}

export type AssetPackFilesResult = AssetPackFilesSuccess | AssetPackFilesFailure;

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative))
  );
}

function canonicalRoot(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    return root;
  }
}

function uniqueSourcePaths(pack: NormalizedAssetPack): readonly string[] {
  const seen = new Set<string>();
  const sourcePaths: string[] = [];

  pack.assets.forEach((asset) => {
    if (asset.kind === 'new-item') {
      asset.layers.forEach((layer) => {
        layer.sprites.forEach((sprite) => {
          if (!seen.has(sprite.source)) {
            seen.add(sprite.source);
            sourcePaths.push(sprite.source);
          }
        });
      });
      return;
    }

    asset.addAnimations.forEach((animation) => {
      animation.layers.forEach((layer) => {
        if (!seen.has(layer.source)) {
          seen.add(layer.source);
          sourcePaths.push(layer.source);
        }
      });
    });
  });

  return sourcePaths.sort((left, right) => left.localeCompare(right));
}

function sourceDiagnostic(
  code: AssetPackFileDiagnostic['code'],
  root: string,
  sourcePath: string,
  details?: Readonly<Record<string, unknown>>,
): AssetPackFileDiagnostic {
  return {
    code,
    message: `Invalid asset-pack source: ${sourcePath}`,
    path: path.join(root, sourcePath),
    sourcePath,
    ...(details ? { details } : {}),
  };
}

function inspectSourceEntryPath(
  root: string,
  sourcePath: string,
): {
  readonly ok: true;
  readonly canonicalPath: string;
} | {
  readonly ok: false;
  readonly diagnostic: AssetPackFileDiagnostic;
  readonly inspection: AssetPackSourceInspection;
} {
  const resolvedRoot = canonicalRoot(root);
  const resolvedPath = path.resolve(root, sourcePath);
  if (!isInsideRoot(root, resolvedPath)) {
    return {
      ok: false,
      diagnostic: sourceDiagnostic('asset_source_outside_pack', root, sourcePath),
      inspection: {
        sourcePath,
        regularFile: false,
        error: 'outside-pack',
      },
    };
  }

  const relativePath = path.relative(root, resolvedPath);
  const segments = relativePath.split(path.sep).filter((segment) => segment.length > 0);
  let currentPath = root;
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);

    let currentStats: ReturnType<typeof lstatSync>;
    try {
      currentStats = lstatSync(currentPath);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { readonly code?: unknown }).code
        : undefined;
      if (code === 'ENOENT') {
        return {
          ok: false,
          diagnostic: sourceDiagnostic('asset_source_missing', root, sourcePath),
          inspection: {
            sourcePath,
            regularFile: false,
            error: 'missing',
          },
        };
      }
      throw error;
    }

    if (currentStats.isSymbolicLink()) {
      return {
        ok: false,
        diagnostic: sourceDiagnostic('asset_source_symlink', root, sourcePath),
        inspection: {
          sourcePath,
          regularFile: false,
          error: 'not-regular',
        },
      };
    }

    const canonicalPath = realpathSync.native(currentPath);
    if (!isInsideRoot(resolvedRoot, canonicalPath)) {
      return {
        ok: false,
        diagnostic: sourceDiagnostic('asset_source_outside_pack', root, sourcePath),
        inspection: {
          sourcePath,
          regularFile: false,
          error: 'outside-pack',
        },
      };
    }
  }

  return {
    ok: true,
    canonicalPath: realpathSync.native(resolvedPath),
  };
}

function inspectSources(
  root: string,
  pack: NormalizedAssetPack,
): {
  readonly diagnostics: readonly AssetPackFileDiagnostic[];
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
} {
  const diagnostics: AssetPackFileDiagnostic[] = [];
  const sourceBytes = new Map<string, Buffer>();
  const canonicalOwners = new Map<string, string>();

  uniqueSourcePaths(pack).forEach((sourcePath) => {
    const inspectedPath = inspectSourceEntryPath(root, sourcePath);
    if (!inspectedPath.ok) {
      diagnostics.push(inspectedPath.diagnostic);
      return;
    }
    const canonicalPath = inspectedPath.canonicalPath;

    const canonicalStats = lstatSync(canonicalPath);
    if (!canonicalStats.isFile()) {
      diagnostics.push(sourceDiagnostic('asset_source_not_regular', root, sourcePath));
      return;
    }

    const existingOwner = canonicalOwners.get(canonicalPath);
    if (existingOwner !== undefined) {
      diagnostics.push(sourceDiagnostic(
        'asset_source_duplicate_canonical_path',
        root,
        sourcePath,
        { duplicateOf: existingOwner },
      ));
      return;
    }
    canonicalOwners.set(canonicalPath, sourcePath);

    const bytes = readFileSync(canonicalPath);
    sourceBytes.set(sourcePath, bytes);
  });

  return { diagnostics, sourceBytes };
}

export function loadAssetPackFiles(root: string): AssetPackFilesResult {
  const absoluteRoot = path.resolve(root);
  const manifestPath = path.join(absoluteRoot, MANIFEST_FILE);
  const inspectedManifest = inspectSourceEntryPath(absoluteRoot, MANIFEST_FILE);
  if (!inspectedManifest.ok) {
    return { ok: false, diagnostics: [inspectedManifest.diagnostic] };
  }
  const manifestStats = lstatSync(inspectedManifest.canonicalPath);
  if (!manifestStats.isFile()) {
    return {
      ok: false,
      diagnostics: [sourceDiagnostic(
        'asset_source_not_regular',
        absoluteRoot,
        MANIFEST_FILE,
      )],
    };
  }
  const manifestBytes = readFileSync(inspectedManifest.canonicalPath);
  const manifestMtimeMs = manifestStats.mtimeMs;

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestBytes.toString('utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_manifest_json_invalid',
        message: error instanceof Error ? error.message : 'Invalid asset-pack JSON.',
        path: manifestPath,
      }],
    };
  }

  const parsed = parseAssetPackSource(manifestJson);
  if (!parsed.ok) {
    return { ok: false, diagnostics: parsed.diagnostics };
  }

  const pack = normalizeAssetPack(parsed.source);
  const inspected = inspectSources(absoluteRoot, pack);
  if (inspected.diagnostics.length > 0) {
    return { ok: false, diagnostics: inspected.diagnostics };
  }

  const payload = parseAssetPackPayload({ manifestBytes, sourceBytes: inspected.sourceBytes });
  if (!payload.ok) return payload;

  return {
    root: absoluteRoot,
    manifestPath,
    manifestMtimeMs,
    ...payload,
  };
}
