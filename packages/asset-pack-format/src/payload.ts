import {
  assetPackContentProjection,
  assetPackSourceFromNormalized,
  normalizeAssetPack,
  parseAssetPackSource,
  type AssetPackSource,
  type AssetPackSourceInspection,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import { canonicalizeJsonValue } from './canonical-json.js';
import type { AssetPackFormatRuntime, AssetPackSha256 } from './runtime.js';

export interface AssetPackPayloadDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly sourcePath?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackPayloadSuccess {
  readonly ok: true;
  readonly manifestBytes: Uint8Array;
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly sourceDigests: ReadonlyMap<string, AssetPackSha256>;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: AssetPackSha256;
}

export type AssetPackPayloadResult =
  | AssetPackPayloadSuccess
  | {
      readonly ok: false;
      readonly diagnostics: readonly AssetPackPayloadDiagnostic[];
    };

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

export async function parseAssetPackPayload(options: {
  readonly manifestBytes: Uint8Array;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly runtime: AssetPackFormatRuntime;
}): Promise<AssetPackPayloadResult> {
  const { runtime } = options;
  const manifestBytes = new Uint8Array(options.manifestBytes);

  let manifestText: string;
  try {
    manifestText = runtime.decodeUtf8Fatal(manifestBytes);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_manifest_json_invalid',
        message: error instanceof Error ? error.message : 'Invalid UTF-8 in asset-pack manifest.',
      }],
    };
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestText) as unknown;
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
  const diagnostics: AssetPackPayloadDiagnostic[] = [];

  sourcePaths.forEach((sourcePath) => {
    if (!options.sourceBytes.has(sourcePath)) {
      diagnostics.push({
        code: 'asset_source_missing',
        message: `Missing asset-pack source: ${sourcePath}`,
        sourcePath,
      });
    }
  });

  [...options.sourceBytes.keys()]
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

  const sourceBytes = new Map<string, Uint8Array>();
  const sourceDigests = new Map<string, AssetPackSha256>();
  const inspections: AssetPackSourceInspection[] = [];

  for (const sourcePath of sourcePaths) {
    const bytes = options.sourceBytes.get(sourcePath);
    if (!bytes) throw new Error(`Missing checked asset-pack source: ${sourcePath}`);
    const copiedBytes = new Uint8Array(bytes);
    const digest = await runtime.sha256(copiedBytes);
    sourceBytes.set(sourcePath, copiedBytes);
    sourceDigests.set(sourcePath, digest);
    inspections.push({ sourcePath, digest, regularFile: true });
  }

  const contentProjection = {
    manifest: assetPackContentProjection(pack),
    sources: [...sourceDigests].map(([sourcePath, digest]) => ({ sourcePath, digest })),
  };

  const canonicalBytes = runtime.encodeUtf8(
    JSON.stringify(canonicalizeJsonValue(contentProjection)),
  );
  const contentDigest = await runtime.sha256(canonicalBytes);

  return {
    ok: true,
    manifestBytes,
    pack,
    sourceBytes,
    sourceDigests,
    inspections,
    contentDigest,
  };
}
