import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AssetDownload,
  type ReleaseConfig,
  downloadBuffer,
  expectedMaterializedFiles,
  hashBuffer,
  hashFile,
  loadMaterializedManifest,
  loadReleaseConfig,
  parseAssetManifest,
  prepareAssetSnapshot,
  verifyHash,
  verifyUpstreamParity,
} from '../scripts/asset-release';

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'lpc-assets-'));
}

function testRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function metadataZip(files: Readonly<Record<string, string>>): Promise<Buffer> {
  const zip = new JSZip();

  for (const [pathName, contents] of Object.entries(files)) {
    zip.file(pathName, contents);
  }

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

async function tinySnapshot(sourceSha: string) {
  const credits = Buffer.from('name,credit\nbody,artist\n');
  const sheetDefinitions = await metadataZip({
    'body/body.json': '{"id":"body"}',
  });
  const paletteDefinitions = await metadataZip({
    'body/body.json': '{"palette":"body"}',
  });
  const bodyZip = Buffer.from('body zip');

  const files = {
    'CREDITS.csv': {
      size: credits.byteLength,
      sha256: hashBuffer(credits),
    },
    'zips/sheet_definitions.zip': {
      size: sheetDefinitions.byteLength,
      sha256: hashBuffer(sheetDefinitions),
    },
    'zips/palette_definitions.zip': {
      size: paletteDefinitions.byteLength,
      sha256: hashBuffer(paletteDefinitions),
    },
    'zips/body.zip': {
      size: bodyZip.byteLength,
      sha256: hashBuffer(bodyZip),
    },
  };

  const manifestJson = Buffer.from(
    JSON.stringify({
      sourceSha,
      files,
    }),
  );

  const tarballZip = new JSZip();
  tarballZip.file('CREDITS.csv', credits);
  tarballZip.file('zips/sheet_definitions.zip', sheetDefinitions);
  tarballZip.file('zips/palette_definitions.zip', paletteDefinitions);
  tarballZip.file('zips/body.zip', bodyZip);
  const tarball = Buffer.from(
    await tarballZip.generateAsync({ type: 'nodebuffer' }),
  );

  return {
    manifestJson,
    manifest: JSON.parse(manifestJson.toString('utf8')) as {
      readonly sourceSha: string;
      readonly files: typeof files;
    },
    tarball,
  };
}

function configForSnapshot(
  config: ReleaseConfig,
  snapshot: Awaited<ReturnType<typeof tinySnapshot>>,
): ReleaseConfig {
  return {
    ...config,
    manifestSha256: hashBuffer(snapshot.manifestJson),
    tarballSha256: hashBuffer(snapshot.tarball),
  };
}

async function readZipTarEntry(
  tarball: Buffer,
  pathName: string,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(tarball);
  const entry = zip.file(pathName);

  if (!entry) {
    throw new Error(`missing tar entry: ${pathName}`);
  }

  return Buffer.from(await entry.async('nodebuffer'));
}

describe('asset release config', () => {
  it('loads the pinned release config with the approved source SHA', () => {
    const repoRoot = tempDir();
    writeFileSync(
      path.join(repoRoot, 'asset-release.json'),
      JSON.stringify({
        tag: 'assets-v2026.06.05-initial',
        sourceRepository:
          'ochowei/Universal-LPC-Spritesheet-Character-Generator',
        sourceSha: '212abfd21493e9957bd556250ac538fa40fe1fc9',
        manifestUrl:
          'https://github.com/ochowei/Universal-LPC-Spritesheet-Character-Generator/releases/download/assets-v2026.06.05-initial/asset-manifest.json',
        manifestSha256:
          '1cce0f4a5fd9b7ac72ae732f04bda39cf9096518ad067ad6009757fe83b9e72c',
        tarballUrl:
          'https://github.com/ochowei/Universal-LPC-Spritesheet-Character-Generator/releases/download/assets-v2026.06.05-initial/lpc-runtime-zips.tar.gz',
        tarballSha256:
          'dd603191c7185323013153b9b35f8d9b4987637d15d7e3195b9d320d9fbac6e7',
      }),
    );

    expect(loadReleaseConfig(repoRoot).sourceSha).toBe(
      '212abfd21493e9957bd556250ac538fa40fe1fc9',
    );
    expect(loadReleaseConfig(testRepoRoot()).sourceSha).toBe(
      '212abfd21493e9957bd556250ac538fa40fe1fc9',
    );
  });
});

describe('asset release hashing', () => {
  it('hashes buffers with SHA-256', () => {
    expect(hashBuffer(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('hashes files with SHA-256', () => {
    const file = path.join(tempDir(), 'example.txt');
    writeFileSync(file, 'hello');

    expect(hashFile(file)).toBe(hashBuffer(readFileSync(file)));
  });

  it('reports expected and actual hashes on mismatch', () => {
    expect(() => verifyHash('manifest', Buffer.from('x'), 'bad')).toThrow(
      /manifest SHA-256 mismatch: expected bad, actual/,
    );
  });
});

describe('asset downloads', () => {
  it('reports the URL when reading a response body fails', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        ({
          ok: true,
          arrayBuffer: async () => {
            throw new Error('body failed');
          },
        }) as unknown as Response,
    );

    await expect(downloadBuffer('https://example.invalid/assets.tar.gz')).rejects.toThrow(
      /Failed to download https:\/\/example\.invalid\/assets\.tar\.gz: body failed\. Rerun prepare-assets/,
    );
  });
});

describe('asset manifest validation', () => {
  it('accepts a manifest matching the configured source SHA with credits', () => {
    const config = loadReleaseConfig(testRepoRoot());
    const manifest = {
      sourceSha: config.sourceSha,
      files: {
        'CREDITS.csv': {
          size: 7,
          sha256: hashBuffer(Buffer.from('credits')),
        },
      },
    };

    expect(parseAssetManifest(JSON.stringify(manifest), config).sourceSha).toBe(
      config.sourceSha,
    );
  });

  it('accepts the release manifest file list shape', () => {
    const config = loadReleaseConfig(testRepoRoot());
    const manifest = parseAssetManifest(
      JSON.stringify({
        sourceSha: config.sourceSha,
        files: [
          {
            path: 'CREDITS.csv',
            sizeBytes: 7,
            sha256: hashBuffer(Buffer.from('credits')),
          },
        ],
      }),
      config,
    );

    expect(manifest.files['CREDITS.csv']).toEqual({
      size: 7,
      sha256: hashBuffer(Buffer.from('credits')),
    });
  });

  it('rejects a manifest with a different source SHA', () => {
    const config = loadReleaseConfig(testRepoRoot());

    expect(() =>
      parseAssetManifest(
        JSON.stringify({
          sourceSha: 'different',
          files: {
            'CREDITS.csv': {
              size: 7,
              sha256: hashBuffer(Buffer.from('credits')),
            },
          },
        }),
        config,
      ),
    ).toThrow(/asset manifest sourceSha mismatch/);
  });

  it('rejects invalid SHA-256 manifest entries', () => {
    const config = loadReleaseConfig(testRepoRoot());

    expect(() =>
      parseAssetManifest(
        JSON.stringify({
          sourceSha: config.sourceSha,
          files: {
            'CREDITS.csv': {
              size: 7,
              sha256: 'z'.repeat(64),
            },
          },
        }),
        config,
      ),
    ).toThrow(/asset manifest entry has invalid sha256: CREDITS.csv/);
  });
});

describe('upstream parity validation', () => {
  it('passes when config, parsed manifest, and upstreamHead all match config.sourceSha', () => {
    const config = loadReleaseConfig(testRepoRoot());
    const manifest = parseAssetManifest(
      JSON.stringify({
        sourceSha: config.sourceSha,
        files: {
          'CREDITS.csv': {
            size: 7,
            sha256: hashBuffer(Buffer.from('credits')),
          },
        },
      }),
      config,
    );

    expect(() =>
      verifyUpstreamParity({
        config,
        manifest,
        upstreamHead: config.sourceSha,
      }),
    ).not.toThrow();
  });

  it('fails with a parity baseline mismatch when upstreamHead differs', () => {
    const config = loadReleaseConfig(testRepoRoot());
    const manifest = parseAssetManifest(
      JSON.stringify({
        sourceSha: config.sourceSha,
        files: {
          'CREDITS.csv': {
            size: 7,
            sha256: hashBuffer(Buffer.from('credits')),
          },
        },
      }),
      config,
    );

    expect(() =>
      verifyUpstreamParity({
        config,
        manifest,
        upstreamHead: 'different',
      }),
    ).toThrow(/Parity baseline mismatch/);
  });
});

describe('asset snapshot materialization', () => {
  it('returns cache-hit without downloading when materialized files match the manifest', async () => {
    const repoRoot = tempDir();
    const baseConfig = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(baseConfig.sourceSha);
    const config = configForSnapshot(baseConfig, snapshot);
    const manifest = parseAssetManifest(
      snapshot.manifestJson.toString('utf8'),
      config,
    );

    await prepareAssetSnapshot({
      repoRoot,
      config,
      manifest,
      tarball: snapshot.tarball,
      download: async () => {
        throw new Error('download should not be called');
      },
      extractTarball: async () => undefined,
      readTarEntry: (pathName) => readZipTarEntry(snapshot.tarball, pathName),
    });
    expect(loadMaterializedManifest(repoRoot, config)).toEqual(manifest);

    const status = await prepareAssetSnapshot({
      repoRoot,
      config,
      manifest,
      download: async () => {
        throw new Error('download should not be called');
      },
      extractTarball: async () => undefined,
    });

    expect(status).toEqual({ status: 'cache-hit' });
  });

  it('does not return cache-hit when the materialized manifest is missing', async () => {
    const repoRoot = tempDir();
    const baseConfig = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(baseConfig.sourceSha);
    const config = configForSnapshot(baseConfig, snapshot);
    const manifest = parseAssetManifest(
      snapshot.manifestJson.toString('utf8'),
      config,
    );

    await prepareAssetSnapshot({
      repoRoot,
      config,
      manifest,
      tarball: snapshot.tarball,
      download: async () => {
        throw new Error('download should not be called');
      },
      extractTarball: async () => undefined,
      readTarEntry: (pathName) => readZipTarEntry(snapshot.tarball, pathName),
    });
    rmSync(path.join(repoRoot, 'assets/asset-manifest.json'), {
      force: true,
    });

    const status = await prepareAssetSnapshot({
      repoRoot,
      config,
      manifest,
      tarball: snapshot.tarball,
      download: async () => {
        throw new Error('download should not be called');
      },
      extractTarball: async () => undefined,
      readTarEntry: (pathName) => readZipTarEntry(snapshot.tarball, pathName),
    });

    expect(status).toEqual({ status: 'refreshed' });
    expect(loadMaterializedManifest(repoRoot, config)).toEqual(manifest);
  });

  it('does not return cache-hit when expanded metadata is missing', async () => {
    const repoRoot = tempDir();
    const baseConfig = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(baseConfig.sourceSha);
    const config = configForSnapshot(baseConfig, snapshot);
    const manifest = parseAssetManifest(
      snapshot.manifestJson.toString('utf8'),
      config,
    );

    await prepareAssetSnapshot({
      repoRoot,
      config,
      manifest,
      tarball: snapshot.tarball,
      download: async () => {
        throw new Error('download should not be called');
      },
      extractTarball: async () => undefined,
      readTarEntry: (pathName) => readZipTarEntry(snapshot.tarball, pathName),
    });
    rmSync(path.join(repoRoot, 'assets/sheet_definitions'), {
      force: true,
      recursive: true,
    });

    const status = await prepareAssetSnapshot({
      repoRoot,
      config,
      manifest,
      tarball: snapshot.tarball,
      download: async () => {
        throw new Error('download should not be called');
      },
      extractTarball: async () => undefined,
      readTarEntry: (pathName) => readZipTarEntry(snapshot.tarball, pathName),
    });

    expect(status).toEqual({ status: 'refreshed' });
    expect(
      existsSync(
        path.join(repoRoot, 'assets/sheet_definitions/body/body.json'),
      ),
    ).toBe(true);
  });

  it('downloads and materializes missing snapshot files', async () => {
    const repoRoot = tempDir();
    const baseConfig = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(baseConfig.sourceSha);
    const config = configForSnapshot(baseConfig, snapshot);
    const downloads: string[] = [];
    const download: AssetDownload = async (url) => {
      downloads.push(url);

      if (url === config.manifestUrl) {
        return snapshot.manifestJson;
      }

      if (url === config.tarballUrl) {
        return snapshot.tarball;
      }

      throw new Error(`unexpected download: ${url}`);
    };

    const status = await prepareAssetSnapshot({
      repoRoot,
      config,
      download,
      extractTarball: async () => undefined,
      readTarEntry: (pathName) => readZipTarEntry(snapshot.tarball, pathName),
    });

    expect(status).toEqual({ status: 'refreshed' });
    expect(downloads).toEqual([config.manifestUrl, config.tarballUrl]);
    expect(readFileSync(path.join(repoRoot, 'assets/asset-manifest.json'))).toEqual(
      snapshot.manifestJson,
    );
    expect(loadMaterializedManifest(repoRoot, config)).toEqual(
      parseAssetManifest(snapshot.manifestJson.toString('utf8'), config),
    );
    expect(existsSync(path.join(repoRoot, 'assets/CREDITS.csv'))).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, 'assets/sheet_definitions/body/body.json'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, 'assets/palette_definitions/body/body.json'),
      ),
    ).toBe(true);
    expect(
      existsSync(path.join(repoRoot, 'packages/web/public/zips/body.zip')),
    ).toBe(true);
  });

  it('reads extracted tar entries from a single top-level release directory', async () => {
    const repoRoot = tempDir();
    const baseConfig = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(baseConfig.sourceSha);
    const config = configForSnapshot(baseConfig, snapshot);

    const status = await prepareAssetSnapshot({
      repoRoot,
      config,
      manifest: parseAssetManifest(snapshot.manifestJson.toString('utf8'), config),
      tarball: snapshot.tarball,
      download: async () => {
        throw new Error('download should not be called');
      },
      extractTarball: async (_tarball, targetDir) => {
        const prefix = path.join(targetDir, 'lpc-runtime-zips');
        mkdirSync(path.join(prefix, 'zips'), { recursive: true });
        writeFileSync(
          path.join(prefix, 'CREDITS.csv'),
          await readZipTarEntry(snapshot.tarball, 'CREDITS.csv'),
        );
        writeFileSync(
          path.join(prefix, 'zips/sheet_definitions.zip'),
          await readZipTarEntry(snapshot.tarball, 'zips/sheet_definitions.zip'),
        );
        writeFileSync(
          path.join(prefix, 'zips/palette_definitions.zip'),
          await readZipTarEntry(snapshot.tarball, 'zips/palette_definitions.zip'),
        );
        writeFileSync(
          path.join(prefix, 'zips/body.zip'),
          await readZipTarEntry(snapshot.tarball, 'zips/body.zip'),
        );
      },
    });

    expect(status).toEqual({ status: 'refreshed' });
    expect(existsSync(path.join(repoRoot, 'assets/CREDITS.csv'))).toBe(true);
    expect(
      existsSync(path.join(repoRoot, 'packages/web/public/zips/body.zip')),
    ).toBe(true);
  });

  it('lists runtime zips and credits as expected materialized files', async () => {
    const config = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(config.sourceSha);
    const manifest = parseAssetManifest(
      snapshot.manifestJson.toString('utf8'),
      config,
    );

    expect(expectedMaterializedFiles(manifest)).toEqual([
      'CREDITS.csv',
      'zips/body.zip',
    ]);
  });

  it('rejects runtime zip paths that escape the output directory', async () => {
    const repoRoot = tempDir();
    const baseConfig = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(baseConfig.sourceSha);
    const escaped = Buffer.from('escaped');
    const manifest = parseAssetManifest(
      JSON.stringify({
        sourceSha: baseConfig.sourceSha,
        files: {
          ...snapshot.manifest.files,
          'zips/../../escape.zip': {
            size: escaped.byteLength,
            sha256: hashBuffer(escaped),
          },
        },
      }),
      baseConfig,
    );
    const config = configForSnapshot(baseConfig, snapshot);

    await expect(
      prepareAssetSnapshot({
        repoRoot,
        config,
        manifest,
        tarball: snapshot.tarball,
        download: async () => {
          throw new Error('download should not be called');
        },
        extractTarball: async () => undefined,
        readTarEntry: async (pathName) =>
          pathName === 'zips/../../escape.zip'
            ? escaped
            : readZipTarEntry(snapshot.tarball, pathName),
      }),
    ).rejects.toThrow(/escapes target directory/);
    expect(existsSync(path.join(repoRoot, 'escape.zip'))).toBe(false);
  });

  it('verifies caller-provided manifests and tarballs before cache or extraction', async () => {
    const repoRoot = tempDir();
    const baseConfig = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(baseConfig.sourceSha);
    const config = configForSnapshot(baseConfig, snapshot);
    const manifest = parseAssetManifest(
      snapshot.manifestJson.toString('utf8'),
      config,
    );

    await expect(
      prepareAssetSnapshot({
        repoRoot,
        config: { ...config, sourceSha: 'different' },
        manifest,
        tarball: snapshot.tarball,
        download: async () => {
          throw new Error('download should not be called');
        },
        extractTarball: async () => undefined,
        readTarEntry: (pathName) => readZipTarEntry(snapshot.tarball, pathName),
      }),
    ).rejects.toThrow(/asset manifest sourceSha mismatch/);

    let extracted = false;
    await expect(
      prepareAssetSnapshot({
        repoRoot,
        config: { ...config, tarballSha256: hashBuffer(Buffer.from('wrong')) },
        manifest,
        tarball: snapshot.tarball,
        download: async () => {
          throw new Error('download should not be called');
        },
        extractTarball: async () => {
          extracted = true;
        },
      }),
    ).rejects.toThrow(/tarball SHA-256 mismatch/);
    expect(extracted).toBe(false);
  });
});
