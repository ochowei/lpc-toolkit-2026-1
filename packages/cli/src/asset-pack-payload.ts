import {
  parseAssetPackPayload as parseAssetPackPayloadFormat,
  type AssetPackPayloadDiagnostic,
} from '@lpc-toolkit/asset-pack-format';
import type { AssetPackSourceInspection, NormalizedAssetPack } from '@lpc-toolkit/core';
import { nodeAssetPackFormatRuntime } from './asset-pack-node-runtime.js';

export type AssetPackFileDiagnostic = AssetPackPayloadDiagnostic;

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

export async function parseAssetPackPayload(input: {
  readonly manifestBytes: Uint8Array;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
}): Promise<AssetPackPayloadResult> {
  const result = await parseAssetPackPayloadFormat({
    manifestBytes: input.manifestBytes,
    sourceBytes: input.sourceBytes,
    runtime: nodeAssetPackFormatRuntime,
  });

  if (!result.ok) return result;

  return {
    ok: true,
    manifestBytes: Buffer.from(result.manifestBytes),
    pack: result.pack,
    sourceBytes: new Map(
      [...result.sourceBytes].map(
        ([path, bytes]) => [path, Buffer.from(bytes)] as const,
      ),
    ),
    sourceDigests: result.sourceDigests,
    inspections: result.inspections,
    contentDigest: result.contentDigest,
  };
}
