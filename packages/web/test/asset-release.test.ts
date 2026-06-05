import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  hashBuffer,
  hashFile,
  loadReleaseConfig,
  parseAssetManifest,
  verifyHash,
} from '../scripts/asset-release';

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'lpc-assets-'));
}

function testRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
          'https://github.com/ochowei/Universal-LPC-Spritesheet-Character-Generator/releases/download/assets-v2026.06.05-initial/assets-v2026.06.05-initial.tar.gz',
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
