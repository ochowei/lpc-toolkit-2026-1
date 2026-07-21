import { createHash } from 'node:crypto';
import {
  assetPackContentProjection,
  assetPackSourceFromNormalized,
  normalizeAssetPack,
  parseAssetPackSource,
  type AssetPackSourceInspection,
  type AssetPackSource,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';

export interface AssetPackFileDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly sourcePath?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackPayloadSuccess {
  readonly ok: true;
  readonly manifestBytes: Buffer;
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
  readonly sourceDigests: ReadonlyMap<string, string>;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: string;
}

export type AssetPackPayloadResult =
  | AssetPackPayloadSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackFileDiagnostic[] };

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function uniqueSourcePaths(source: AssetPackSource): readonly string[] {
  const sourcePaths = new Set<string>();

  source.assets.forEach((asset) => {
    if (asset.kind === 'new-item') {
      asset.layers.forEach((layer) => {
        layer.sprites.forEach((sprite) => sourcePaths.add(sprite.source));
      });
      return;
    }

    asset.addAnimations.forEach((animation) => {
      animation.layers.forEach((layer) => sourcePaths.add(layer.source));
    });
  });

  return [...sourcePaths].sort((left, right) => left.localeCompare(right));
}

export function parseAssetPackPayload(input: {
  readonly manifestBytes: Buffer;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
}): AssetPackPayloadResult {
  const manifestBytes = Buffer.from(input.manifestBytes);
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestBytes.toString('utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_manifest_json_invalid',
        message: error instanceof Error ? error.message : 'Invalid asset-pack JSON.',
      }],
    };
  }

  const parsed = parseAssetPackSource(manifestJson);
  if (!parsed.ok) return parsed;

  const pack = normalizeAssetPack(parsed.source);
  const sourcePaths = uniqueSourcePaths(assetPackSourceFromNormalized(pack));
  const expectedPaths = new Set(sourcePaths);
  const diagnostics: AssetPackFileDiagnostic[] = [];

  sourcePaths.forEach((sourcePath) => {
    if (!input.sourceBytes.has(sourcePath)) {
      diagnostics.push({
        code: 'asset_source_missing',
        message: `Missing asset-pack source: ${sourcePath}`,
        sourcePath,
      });
    }
  });
  [...input.sourceBytes.keys()]
    .filter((sourcePath) => !expectedPaths.has(sourcePath))
    .sort((left, right) => left.localeCompare(right))
    .forEach((sourcePath) => {
      diagnostics.push({
        code: 'asset_source_unexpected',
        message: `Unexpected asset-pack source: ${sourcePath}`,
        sourcePath,
      });
    });
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const sourceBytes = new Map<string, Buffer>();
  const sourceDigests = new Map<string, string>();
  const inspections: AssetPackSourceInspection[] = [];
  sourcePaths.forEach((sourcePath) => {
    const bytes = input.sourceBytes.get(sourcePath);
    if (!bytes) throw new Error(`Missing checked asset-pack source: ${sourcePath}`);
    const copiedBytes = Buffer.from(bytes);
    const digest = `sha256:${sha256Buffer(copiedBytes)}`;
    sourceBytes.set(sourcePath, copiedBytes);
    sourceDigests.set(sourcePath, digest);
    inspections.push({ sourcePath, digest, regularFile: true });
  });

  return {
    ok: true,
    manifestBytes,
    pack,
    sourceBytes,
    sourceDigests,
    inspections,
    contentDigest: sha256Json({
      manifest: assetPackContentProjection(pack),
      sources: [...sourceDigests].map(([sourcePath, digest]) => ({ sourcePath, digest })),
    }),
  };
}
