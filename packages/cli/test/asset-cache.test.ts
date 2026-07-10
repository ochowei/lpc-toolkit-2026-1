import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  AssetCacheError,
  assetCacheErrorIssue,
  ensureAssetCache,
  validateAssetCache,
} from '../src/asset-cache.js';
import type { AssetReleaseConfig } from '../src/asset-release.js';
import {
  createAssetReleaseFixture,
  type AssetReleaseFixture,
} from './helpers/asset-release-fixture.js';

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function cacheRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'lpc-asset-cache-'));
}

function manifestWith(
  fixture: AssetReleaseFixture,
  update: (manifest: {
    sourceSha: string;
    files: Array<{ path: string; sizeBytes: number; sha256: string }>;
  }) => void,
): { readonly buffer: Buffer; readonly config: AssetReleaseConfig } {
  const manifest = JSON.parse(fixture.manifestBuffer.toString('utf8')) as {
    sourceSha: string;
    files: Array<{ path: string; sizeBytes: number; sha256: string }>;
  };
  update(manifest);
  const buffer = Buffer.from(JSON.stringify(manifest));
  return {
    buffer,
    config: { ...fixture.config, manifestSha256: sha256(buffer) },
  };
}

function downloadWithManifest(
  fixture: AssetReleaseFixture,
  manifestBuffer: Buffer,
): (url: string) => Promise<Buffer> {
  return async (url) =>
    url === fixture.config.manifestUrl
      ? manifestBuffer
      : fixture.download(url);
}

interface RaceWorkerResult {
  readonly status: string;
  readonly manifestSha256: string;
  readonly tarballSha256: string;
}

async function runRaceWorker(
  cacheRootPath: string,
  workerId: string,
): Promise<RaceWorkerResult> {
  const cacheModule = pathToFileURL(
    path.resolve('src/asset-cache.ts'),
  ).href;
  const fixtureModule = pathToFileURL(
    path.resolve('test/helpers/asset-release-fixture.ts'),
  ).href;
  const tsxLoader = pathToFileURL(
    path.resolve('node_modules/tsx/dist/loader.mjs'),
  ).href;
  const script = `
    import { existsSync, writeFileSync } from 'node:fs';
    import path from 'node:path';
    import { ensureAssetCache } from ${JSON.stringify(cacheModule)};
    import { createAssetReleaseFixture } from ${JSON.stringify(fixtureModule)};
    const root = process.env.CACHE_ROOT;
    const id = process.env.WORKER_ID;
    if (!root || !id) throw new Error('Missing worker environment.');
    const fixture = await createAssetReleaseFixture();
    const readTarEntry = async (entryName) => {
      if (entryName === 'zips/palette_definitions.zip') {
        writeFileSync(path.join(root, 'ready-' + id), 'ready');
        const other = id === 'a' ? 'b' : 'a';
        const deadline = Date.now() + 5000;
        while (!existsSync(path.join(root, 'ready-' + other))) {
          if (Date.now() > deadline) throw new Error('Race barrier timed out.');
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
      return fixture.readTarEntry(entryName);
    };
    const result = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: root,
      download: fixture.download,
      readTarEntry,
    });
    process.stdout.write(JSON.stringify({
      status: result.status,
      manifestSha256: fixture.config.manifestSha256,
      tarballSha256: fixture.config.tarballSha256,
    }));
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', tsxLoader, '--input-type=module', '--eval', script],
      {
        cwd: process.cwd(),
        env: { ...process.env, CACHE_ROOT: cacheRootPath, WORKER_ID: workerId },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(JSON.parse(stdout) as RaceWorkerResult);
      } else {
        reject(new Error(`Race worker exited ${String(code)}: ${stderr}`));
      }
    });
  });
}

describe('verified compressed asset cache', () => {
  it('prepares compressed ZIPs, metadata, credits, manifest, and sprite index', async () => {
    const fixture = await createAssetReleaseFixture();
    const root = cacheRoot();

    const result = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: root,
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });

    expect(result.status).toBe('prepared');
    expect(existsSync(path.join(result.layout.zipsRoot, 'body.zip'))).toBe(true);
    expect(existsSync(result.layout.sheetDefinitionsRoot)).toBe(true);
    expect(existsSync(result.layout.paletteDefinitionsRoot)).toBe(true);
    expect(readFileSync(result.layout.creditsPath, 'utf8')).toContain('Author');
    expect(JSON.parse(readFileSync(result.layout.spriteIndexPath, 'utf8'))).toContain(
      'spritesheets/body/bodies/male/walk.png',
    );
    expect(existsSync(result.layout.metadataIndexPath)).toBe(true);
    expect(existsSync(path.join(root, 'assets.tar.gz'))).toBe(false);
    expect(validateAssetCache(result.layout, fixture.config)).toBe(true);
  });

  it('returns cache-hit without downloading when every retained hash matches', async () => {
    const fixture = await createAssetReleaseFixture();
    const root = cacheRoot();
    await ensureAssetCache({
      config: fixture.config,
      cacheRoot: root,
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });
    const download = vi.fn(async () => Buffer.from('must not download'));

    const result = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: root,
      download,
      readTarEntry: fixture.readTarEntry,
    });

    expect(result.status).toBe('cache-hit');
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects a mutated sprite index instead of accepting a cache hit', async () => {
    const fixture = await createAssetReleaseFixture();
    const root = cacheRoot();
    const prepared = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: root,
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });
    writeFileSync(prepared.layout.spriteIndexPath, JSON.stringify(['wrong.png']));

    expect(validateAssetCache(prepared.layout, fixture.config)).toBe(false);
  });

  it('rejects an unmanifested category ZIP even when the sprite index matches it', async () => {
    const fixture = await createAssetReleaseFixture();
    const prepared = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: cacheRoot(),
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });
    writeFileSync(
      path.join(prepared.layout.zipsRoot, 'extra.zip'),
      readFileSync(path.join(prepared.layout.zipsRoot, 'body.zip')),
    );
    const spriteIndex = JSON.parse(
      readFileSync(prepared.layout.spriteIndexPath, 'utf8'),
    ) as string[];
    spriteIndex.push('spritesheets/extra/bodies/male/walk.png');
    spriteIndex.sort();
    writeFileSync(prepared.layout.spriteIndexPath, JSON.stringify(spriteIndex));

    expect(validateAssetCache(prepared.layout, fixture.config)).toBe(false);
  });

  it('rejects an unmanifested non-file ZIP inventory entry', async () => {
    const fixture = await createAssetReleaseFixture();
    const prepared = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: cacheRoot(),
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });
    mkdirSync(path.join(prepared.layout.zipsRoot, 'extra.zip'));

    expect(validateAssetCache(prepared.layout, fixture.config)).toBe(false);
  });

  it('rejects coherently modified definitions and metadata index', async () => {
    const fixture = await createAssetReleaseFixture();
    const prepared = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: cacheRoot(),
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });
    const definitionPath = path.join(
      prepared.layout.sheetDefinitionsRoot,
      'body/body.json',
    );
    const changedDefinition = Buffer.from('{"type":"tampered"}\n');
    writeFileSync(definitionPath, changedDefinition);
    const metadataIndex = JSON.parse(
      readFileSync(prepared.layout.metadataIndexPath, 'utf8'),
    ) as {
      files: Array<{ path: string; sizeBytes: number; sha256: string }>;
    };
    const indexedDefinition = metadataIndex.files.find(
      (entry) => entry.path === 'sheet_definitions/body/body.json',
    );
    if (indexedDefinition === undefined) {
      throw new Error('Fixture sheet definition is not indexed.');
    }
    indexedDefinition.sizeBytes = changedDefinition.byteLength;
    indexedDefinition.sha256 = sha256(changedDefinition);
    writeFileSync(
      prepared.layout.metadataIndexPath,
      JSON.stringify(metadataIndex),
    );

    expect(validateAssetCache(prepared.layout, fixture.config)).toBe(false);
  });

  it('rejects a manifest whose source SHA differs from the release pin', async () => {
    const fixture = await createAssetReleaseFixture();
    const changed = manifestWith(fixture, (manifest) => {
      manifest.sourceSha = '2'.repeat(40);
    });

    await expect(
      ensureAssetCache({
        config: changed.config,
        cacheRoot: cacheRoot(),
        download: downloadWithManifest(fixture, changed.buffer),
        readTarEntry: fixture.readTarEntry,
      }),
    ).rejects.toMatchObject({ code: 'asset_integrity_failed' });
  });

  it('rejects a tarball checksum mismatch before reading entries', async () => {
    const fixture = await createAssetReleaseFixture();
    const readTarEntry = vi.fn(fixture.readTarEntry);

    await expect(
      ensureAssetCache({
        config: { ...fixture.config, tarballSha256: 'f'.repeat(64) },
        cacheRoot: cacheRoot(),
        download: fixture.download,
        readTarEntry,
      }),
    ).rejects.toMatchObject({ code: 'asset_integrity_failed' });
    expect(readTarEntry).not.toHaveBeenCalled();
  });

  it('rejects an entry checksum mismatch and removes staging output', async () => {
    const fixture = await createAssetReleaseFixture();
    const root = cacheRoot();
    const readTarEntry = async (entryName: string): Promise<Buffer> =>
      entryName === 'zips/body.zip'
        ? Buffer.from('corrupt zip')
        : fixture.readTarEntry(entryName);

    await expect(
      ensureAssetCache({
        config: fixture.config,
        cacheRoot: root,
        download: fixture.download,
        readTarEntry,
      }),
    ).rejects.toMatchObject({ code: 'asset_integrity_failed' });
    expect(readdirSync(root)).toEqual([]);
  });

  it('rejects an archive entry that escapes the staging directory', async () => {
    const fixture = await createAssetReleaseFixture();
    const changed = manifestWith(fixture, (manifest) => {
      const body = manifest.files.find((entry) => entry.path === 'zips/body.zip');
      if (body === undefined) {
        throw new Error('Fixture body entry is missing.');
      }
      body.path = 'zips/../../escape.zip';
    });

    await expect(
      ensureAssetCache({
        config: changed.config,
        cacheRoot: cacheRoot(),
        download: downloadWithManifest(fixture, changed.buffer),
        readTarEntry: fixture.readTarEntry,
      }),
    ).rejects.toMatchObject({ code: 'asset_archive_unsafe' });
  });

  it.each(['zips/./body.zip', 'zips/category/../body.zip'])(
    'rejects archive dot components that resolve inside staging: %s',
    async (unsafePath) => {
      const fixture = await createAssetReleaseFixture();
      const changed = manifestWith(fixture, (manifest) => {
        const body = manifest.files.find((entry) => entry.path === 'zips/body.zip');
        if (body === undefined) {
          throw new Error('Fixture body entry is missing.');
        }
        body.path = unsafePath;
      });

      await expect(
        ensureAssetCache({
          config: changed.config,
          cacheRoot: cacheRoot(),
          download: downloadWithManifest(fixture, changed.buffer),
          readTarEntry: async (entryName) =>
            entryName === unsafePath
              ? fixture.readTarEntry('zips/body.zip')
              : fixture.readTarEntry(entryName),
        }),
      ).rejects.toMatchObject({ code: 'asset_archive_unsafe', path: unsafePath });
    },
  );

  it('rejects manifest paths with the same normalized destination', async () => {
    const fixture = await createAssetReleaseFixture();
    const duplicatePath = 'zips//body.zip';
    const changed = manifestWith(fixture, (manifest) => {
      const body = manifest.files.find((entry) => entry.path === 'zips/body.zip');
      if (body === undefined) {
        throw new Error('Fixture body entry is missing.');
      }
      manifest.files.push({ ...body, path: duplicatePath });
    });

    await expect(
      ensureAssetCache({
        config: changed.config,
        cacheRoot: cacheRoot(),
        download: downloadWithManifest(fixture, changed.buffer),
        readTarEntry: async (entryName) =>
          entryName === duplicatePath
            ? fixture.readTarEntry('zips/body.zip')
            : fixture.readTarEntry(entryName),
      }),
    ).rejects.toMatchObject({ code: 'asset_integrity_failed' });
  });

  it.skipIf(process.platform === 'win32')(
    'rejects link entries before default tar extraction',
    async () => {
      const fixture = await createAssetReleaseFixture();
      const archiveRoot = cacheRoot();
      const sourceRoot = path.join(archiveRoot, 'source');
      mkdirSync(sourceRoot);
      for (const [entryName, contents] of Object.entries(fixture.tarEntries)) {
        const filePath = path.join(sourceRoot, entryName);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, contents);
      }
      symlinkSync('../outside-target', path.join(sourceRoot, 'escape-link'));
      const archivePath = path.join(archiveRoot, 'malicious.tar.gz');
      execFileSync('tar', ['-czf', archivePath, '-C', sourceRoot, '.']);
      const tarball = readFileSync(archivePath);
      const config = { ...fixture.config, tarballSha256: sha256(tarball) };

      await expect(
        ensureAssetCache({
          config,
          cacheRoot: path.join(archiveRoot, 'cache'),
          download: async (url) =>
            url === config.tarballUrl ? tarball : fixture.download(url),
        }),
      ).rejects.toMatchObject({ code: 'asset_archive_unsafe' });
    },
  );

  it('replaces a corrupt cache only after a valid staged cache is complete', async () => {
    const fixture = await createAssetReleaseFixture();
    const root = cacheRoot();
    const prepared = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: root,
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });
    const bodyPath = path.join(prepared.layout.zipsRoot, 'body.zip');
    writeFileSync(bodyPath, 'corrupt final');

    await expect(
      ensureAssetCache({
        config: fixture.config,
        cacheRoot: root,
        download: fixture.download,
        readTarEntry: async (entryName) => {
          if (entryName === 'zips/palette_definitions.zip') {
            throw new Error('fixture extraction failure');
          }
          return fixture.readTarEntry(entryName);
        },
      }),
    ).rejects.toMatchObject({ code: 'asset_cache_failed' });
    expect(readFileSync(bodyPath, 'utf8')).toBe('corrupt final');

    const replacement = await ensureAssetCache({
      config: fixture.config,
      cacheRoot: root,
      download: fixture.download,
      readTarEntry: fixture.readTarEntry,
    });
    expect(replacement.status).toBe('prepared');
    expect(validateAssetCache(replacement.layout, fixture.config)).toBe(true);
  });

  it('accepts a valid winner when two preparations race for one release', async () => {
    const fixture = await createAssetReleaseFixture();
    const root = cacheRoot();
    const delayedRead = async (entryName: string): Promise<Buffer> => {
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
      return fixture.readTarEntry(entryName);
    };

    const results = await Promise.all([
      ensureAssetCache({
        config: fixture.config,
        cacheRoot: root,
        download: fixture.download,
        readTarEntry: delayedRead,
      }),
      ensureAssetCache({
        config: fixture.config,
        cacheRoot: root,
        download: fixture.download,
        readTarEntry: delayedRead,
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'cache-hit',
      'prepared',
    ]);
    expect(validateAssetCache(results[0].layout, fixture.config)).toBe(true);
  });

  it(
    'does not delete a valid winner when two processes replace a corrupt cache',
    async () => {
      const fixture = await createAssetReleaseFixture();
      const root = cacheRoot();
      const prepared = await ensureAssetCache({
        config: fixture.config,
        cacheRoot: root,
        download: fixture.download,
        readTarEntry: fixture.readTarEntry,
      });
      writeFileSync(
        path.join(prepared.layout.zipsRoot, 'body.zip'),
        Buffer.alloc(32 * 1024 * 1024, 1),
      );

      const workers = await Promise.all([
        runRaceWorker(root, 'a'),
        runRaceWorker(root, 'b'),
      ]);

      expect(workers.map((worker) => worker.manifestSha256)).toEqual([
        fixture.config.manifestSha256,
        fixture.config.manifestSha256,
      ]);
      expect(workers.map((worker) => worker.tarballSha256)).toEqual([
        fixture.config.tarballSha256,
        fixture.config.tarballSha256,
      ]);
      expect(workers.map((worker) => worker.status).sort()).toEqual([
        'cache-hit',
        'prepared',
      ]);
      expect(validateAssetCache(prepared.layout, fixture.config)).toBe(true);
    },
    15_000,
  );

  it('wraps cache directory creation failures in a typed cache error', async () => {
    const fixture = await createAssetReleaseFixture();
    const root = cacheRoot();
    const filePath = path.join(root, 'not-a-directory');
    writeFileSync(filePath, 'file');

    await expect(
      ensureAssetCache({
        config: fixture.config,
        cacheRoot: filePath,
        download: fixture.download,
        readTarEntry: fixture.readTarEntry,
      }),
    ).rejects.toMatchObject({ code: 'asset_cache_failed', path: filePath });
  });

  it('maps typed cache failures to CLI issue codes and paths', () => {
    expect(
      assetCacheErrorIssue(
        new AssetCacheError(
          'asset_archive_unsafe',
          'Unsafe archive entry.',
          'zips/../../escape.zip',
        ),
      ),
    ).toEqual({
      code: 'asset_archive_unsafe',
      message: 'Unsafe archive entry.',
      path: 'zips/../../escape.zip',
    });
    expect(assetCacheErrorIssue(new Error('unexpected'))).toEqual({
      code: 'asset_cache_failed',
      message: 'unexpected',
    });
  });
});
