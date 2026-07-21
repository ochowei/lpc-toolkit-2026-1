import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import {
  assetPackContentProjection,
  normalizeAssetPack,
  parseAssetPackSource,
  type AssetPackSourceInspection,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';

const MANIFEST_FILE = 'asset-pack.json';

export interface AssetPackFileDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly sourcePath?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackFilesSuccess {
  readonly ok: true;
  readonly root: string;
  readonly manifestPath: string;
  readonly manifestBytes: Buffer;
  readonly manifestMtimeMs: number;
  readonly pack: NormalizedAssetPack;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly sourceDigests: ReadonlyMap<string, string>;
  readonly contentDigest: string;
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

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
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

function inspectSources(
  root: string,
  pack: NormalizedAssetPack,
): {
  readonly diagnostics: readonly AssetPackFileDiagnostic[];
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly sourceDigests: ReadonlyMap<string, string>;
} {
  const diagnostics: AssetPackFileDiagnostic[] = [];
  const inspections: AssetPackSourceInspection[] = [];
  const sourceDigests = new Map<string, string>();
  const canonicalOwners = new Map<string, string>();

  uniqueSourcePaths(pack).forEach((sourcePath) => {
    const resolvedPath = path.resolve(root, sourcePath);
    const resolvedRoot = canonicalRoot(root);
    if (!isInsideRoot(root, resolvedPath)) {
      diagnostics.push(sourceDiagnostic(
        'asset_source_outside_pack',
        root,
        sourcePath,
      ));
      inspections.push({
        sourcePath,
        regularFile: false,
        error: 'outside-pack',
      });
      return;
    }

    try {
      lstatSync(resolvedPath);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { readonly code?: unknown }).code
        : undefined;
      if (code === 'ENOENT') {
        diagnostics.push(sourceDiagnostic('asset_source_missing', root, sourcePath));
        inspections.push({
          sourcePath,
          regularFile: false,
          error: 'missing',
        });
        return;
      }
      throw error;
    }

    const resolvedStats = lstatSync(resolvedPath);
    if (resolvedStats.isSymbolicLink()) {
      diagnostics.push(sourceDiagnostic('asset_source_symlink', root, sourcePath));
      inspections.push({
        sourcePath,
        regularFile: false,
        error: 'not-regular',
      });
      return;
    }

    let canonicalPath: string;
    try {
      canonicalPath = realpathSync.native(resolvedPath);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { readonly code?: unknown }).code
        : undefined;
      if (code === 'ENOENT') {
        diagnostics.push(sourceDiagnostic('asset_source_missing', root, sourcePath));
        inspections.push({
          sourcePath,
          regularFile: false,
          error: 'missing',
        });
        return;
      }
      throw error;
    }

    if (!isInsideRoot(resolvedRoot, canonicalPath)) {
      diagnostics.push(sourceDiagnostic('asset_source_outside_pack', root, sourcePath));
      inspections.push({
        sourcePath,
        regularFile: false,
        error: 'outside-pack',
      });
      return;
    }

    const canonicalStats = lstatSync(canonicalPath);
    if (!canonicalStats.isFile()) {
      diagnostics.push(sourceDiagnostic('asset_source_not_regular', root, sourcePath));
      inspections.push({
        sourcePath,
        regularFile: false,
        error: 'not-regular',
      });
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

    const digest = `sha256:${sha256Buffer(readFileSync(canonicalPath))}`;
    sourceDigests.set(sourcePath, digest);
    inspections.push({
      sourcePath,
      digest,
      regularFile: true,
    });
  });

  return { diagnostics, inspections, sourceDigests };
}

export function loadAssetPackFiles(root: string): AssetPackFilesResult {
  const absoluteRoot = path.resolve(root);
  const manifestPath = path.join(absoluteRoot, MANIFEST_FILE);
  const manifestBytes = readFileSync(manifestPath);
  const manifestMtimeMs = lstatSync(manifestPath).mtimeMs;

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

  const contentDigest = sha256Json({
    manifest: assetPackContentProjection(pack),
    sources: [...inspected.sourceDigests.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourcePath, digest]) => ({ sourcePath, digest })),
  });

  return {
    ok: true,
    root: absoluteRoot,
    manifestPath,
    manifestBytes,
    manifestMtimeMs,
    pack,
    inspections: inspected.inspections,
    sourceDigests: inspected.sourceDigests,
    contentDigest,
  };
}
