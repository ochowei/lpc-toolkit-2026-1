import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import type { AssetReleaseConfig } from '../../src/asset-release.js';

export interface AssetReleaseFixture {
  readonly config: AssetReleaseConfig;
  readonly manifestBuffer: Buffer;
  readonly tarEntries: Readonly<Record<string, Buffer>>;
  readonly download: (url: string) => Promise<Buffer>;
  readonly readTarEntry: (entryName: string) => Promise<Buffer>;
}

const fixtureDate = new Date('2000-01-01T00:00:00.000Z');

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function zipBuffer(files: Readonly<Record<string, Buffer>>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [pathName, contents] of Object.entries(files)) {
    zip.file(pathName, contents, { createFolders: false, date: fixtureDate });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

export async function createAssetReleaseFixture(): Promise<AssetReleaseFixture> {
  const credits = Buffer.from('Asset,Author,License\nbody,Fixture Author,CC-BY-SA-3.0\n');
  const bodyZip = await zipBuffer({
    'bodies/male/walk.png': Buffer.from('fixture-png'),
  });
  const sheetDefinitionsZip = await zipBuffer({
    'body/body.json': Buffer.from('{"type":"body"}\n'),
  });
  const paletteDefinitionsZip = await zipBuffer({
    'body/body.json': Buffer.from('{"colors":["#ffffff"]}\n'),
  });
  const tarball = Buffer.from('deterministic fixture tarball');
  const tarEntries: Readonly<Record<string, Buffer>> = {
    'CREDITS.csv': credits,
    'zips/body.zip': bodyZip,
    'zips/sheet_definitions.zip': sheetDefinitionsZip,
    'zips/palette_definitions.zip': paletteDefinitionsZip,
  };
  const sourceSha = '1'.repeat(40);
  const files = Object.entries(tarEntries).map(([pathName, contents]) => ({
    path: pathName,
    sizeBytes: contents.byteLength,
    sha256: sha256(contents),
  }));
  const manifestBuffer = Buffer.from(JSON.stringify({ sourceSha, files }));
  const config: AssetReleaseConfig = {
    tag: 'assets-fixture-v1',
    sourceRepository: 'fixture/assets',
    sourceSha,
    manifestUrl: 'https://example.test/asset-manifest.json',
    manifestSha256: sha256(manifestBuffer),
    tarballUrl: 'https://example.test/assets.tar.gz',
    tarballSha256: sha256(tarball),
  };

  return {
    config,
    manifestBuffer,
    tarEntries,
    download: async (url) => {
      if (url === config.manifestUrl) {
        return manifestBuffer;
      }
      if (url === config.tarballUrl) {
        return tarball;
      }
      throw new Error(`Unexpected fixture URL: ${url}`);
    },
    readTarEntry: async (entryName) => {
      const entry = tarEntries[entryName];
      if (entry === undefined) {
        throw new Error(`Missing fixture tar entry: ${entryName}`);
      }
      return entry;
    },
  };
}
