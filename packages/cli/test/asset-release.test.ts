import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bundledAssetReleasePath,
  loadAssetReleaseConfig,
  parseAssetReleaseConfig,
  releaseCachePath,
  resolveAssetCacheRoot,
} from '../src/asset-release.js';

const valid = {
  tag: 'assets-v1',
  sourceRepository: 'owner/repo',
  sourceSha: 'a'.repeat(40),
  manifestUrl: 'https://example.test/manifest.json',
  manifestSha256: 'b'.repeat(64),
  tarballUrl: 'https://example.test/assets.tar.gz',
  tarballSha256: 'c'.repeat(64),
};

describe('asset release configuration', () => {
  it('parses every pinned field', () => {
    expect(parseAssetReleaseConfig(valid)).toEqual(valid);
  });

  it('rejects invalid hashes and non-HTTPS URLs', () => {
    expect(() =>
      parseAssetReleaseConfig({ ...valid, manifestSha256: 'bad' }),
    ).toThrow(/manifestSha256/);
    expect(() =>
      parseAssetReleaseConfig({
        ...valid,
        tarballUrl: 'http://example.test/assets',
      }),
    ).toThrow(/tarballUrl/);
  });

  it.each(['.', '..'])('rejects unsafe dot-segment tag %s', (tag) => {
    expect(() => parseAssetReleaseConfig({ ...valid, tag })).toThrow(/tag/);
  });

  it('loads a config file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-release-'));
    const file = path.join(root, 'asset-release.json');
    writeFileSync(file, JSON.stringify(valid));
    expect(loadAssetReleaseConfig(file)).toEqual(valid);
  });

  it('resolves the config beside built modules', () => {
    const moduleUrl = pathToFileURL('/package/dist/asset-release.js').href;
    expect(bundledAssetReleasePath(moduleUrl)).toBe(
      path.resolve('/package/dist/asset-release.json'),
    );
  });
});

describe('asset cache paths', () => {
  it('honors LPC_TOOLKIT_CACHE_DIR', () => {
    expect(
      resolveAssetCacheRoot({
        env: { LPC_TOOLKIT_CACHE_DIR: '/custom/cache' },
        platform: 'linux',
        homeDir: '/home/user',
      }),
    ).toBe('/custom/cache');
  });

  it('uses the macOS cache convention', () => {
    expect(
      resolveAssetCacheRoot({
        env: {},
        platform: 'darwin',
        homeDir: '/Users/me',
      }),
    ).toBe('/Users/me/Library/Caches/lpc-toolkit');
  });

  it('uses the Windows cache convention independent of the test host', () => {
    expect(
      resolveAssetCacheRoot({
        env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
        platform: 'win32',
        homeDir: 'C:\\Users\\me',
      }),
    ).toBe('C:\\Users\\me\\AppData\\Local\\lpc-toolkit\\Cache');
  });

  it('uses the XDG cache convention', () => {
    expect(
      resolveAssetCacheRoot({
        env: { XDG_CACHE_HOME: '/var/cache/me' },
        platform: 'linux',
        homeDir: '/home/me',
      }),
    ).toBe('/var/cache/me/lpc-toolkit');
  });

  it('creates one directory name per safe release tag', () => {
    expect(releaseCachePath('/cache', 'assets-v1')).toBe(
      path.join('/cache', 'assets-v1'),
    );
    expect(() => releaseCachePath('/cache', '../escape')).toThrow(/tag/);
  });

  it.each(['.', '..'])('rejects unsafe cache dot-segment tag %s', (tag) => {
    expect(() => releaseCachePath('/cache', tag)).toThrow(/tag/);
  });
});
