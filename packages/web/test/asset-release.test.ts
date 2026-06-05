import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadReleaseConfig } from '../scripts/asset-release';

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
