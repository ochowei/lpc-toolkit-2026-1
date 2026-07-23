import {
  createAssetPackArchive,
  type AssetPackFormatRuntime,
} from '@lpc-toolkit/asset-pack-format';
import { createBrowserAssetPackFormatRuntime } from '../adapter/asset-pack-format-runtime';

const SOURCE_PATH = 'sprites/wind-braid/foreground/walk.png';

const manifest = {
  schema: 'lpc-toolkit.asset-pack.v1',
  id: 'acme.wind-braid',
  version: '1.0.0',
  displayName: 'ACME Wind Braid',
  credits: {
    authors: ['Alice'],
    licenses: ['CC-BY-SA 4.0'],
    urls: ['https://example.com/alice'],
    notes: 'Original wind braid.',
  },
  assets: [{
    kind: 'new-item',
    localId: 'wind-braid',
    displayName: 'Wind Braid',
    typeName: 'hair',
    bodyTypes: ['male', 'female'],
    animations: ['walk'],
    layers: [{
      id: 'foreground',
      zPos: 120,
      sprites: [{ animation: 'walk', source: SOURCE_PATH }],
    }],
  }],
} as const;

export interface BrowserAssetPackConformanceResult {
  readonly status: 'verified';
  readonly archiveDigest: string;
  readonly contentDigest: string;
  readonly sourceDigest: string;
  readonly diagnostics: readonly [];
}

export async function runBrowserAssetPackConformance(
  formatRuntime: AssetPackFormatRuntime = createBrowserAssetPackFormatRuntime(),
): Promise<BrowserAssetPackConformanceResult> {
  const result = await createAssetPackArchive({
    kind: 'formal',
    manifestDocument: manifest,
    sourceBytes: new Map([[SOURCE_PATH, new TextEncoder().encode('walk-pixels')]]),
    runtime: formatRuntime,
  });
  if (result.inspection.kind !== 'verified') {
    throw new Error('Browser asset-pack conformance archive was not verified.');
  }

  return {
    status: 'verified',
    archiveDigest: result.archiveDigest,
    contentDigest: result.inspection.snapshot.payload.contentDigest,
    sourceDigest: result.inspection.snapshot.payload.sourceDigests.get(SOURCE_PATH) ?? '',
    diagnostics: result.inspection.diagnostics,
  };
}
