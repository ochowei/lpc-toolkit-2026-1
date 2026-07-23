import type { AssetPackSha256 } from '@lpc-toolkit/asset-pack-format';
import type { AssetPackWorkerResponse } from './asset-pack-worker-protocol';
import { downloadBlob } from './download';

export type AssetPackDownloadKind = 'draft' | 'formal';

export interface AssetPackDownloadFilenameInput {
  readonly packId: string;
  readonly version: string;
  readonly kind: AssetPackDownloadKind;
}

export type AssetPackAssembledResponse = Extract<AssetPackWorkerResponse, { readonly type: 'assembled' }>;

export class AssetPackDownloadMetadataError extends Error {
  override readonly name = 'AssetPackDownloadMetadataError';
}

export function assetPackDownloadFilename({ packId, version, kind }: AssetPackDownloadFilenameInput): string {
  return `${packId}-${version}${kind === 'draft' ? '.draft' : ''}.lpc-assets.zip`;
}

export function assertAssetPackDownloadMetadata(
  response: AssetPackAssembledResponse,
  expected: {
    readonly revision: number;
    readonly kind: AssetPackDownloadKind;
    readonly archiveDigest?: AssetPackSha256;
  },
): void {
  if (response.revision !== expected.revision || response.kind !== expected.kind) {
    throw new AssetPackDownloadMetadataError('The Worker returned an archive for a different revision or kind.');
  }
  if (expected.archiveDigest !== undefined && response.archiveDigest !== expected.archiveDigest) {
    throw new AssetPackDownloadMetadataError('The Worker returned an archive with an unexpected digest.');
  }
}

export function downloadAssetPackArchive(
  response: AssetPackAssembledResponse,
  download: (blob: Blob, filename: string) => void = downloadBlob,
): void {
  download(new Blob([response.archiveBytes], { type: 'application/zip' }), response.filename);
}
