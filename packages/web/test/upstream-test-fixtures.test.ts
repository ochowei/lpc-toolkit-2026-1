import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_SPRITE_PATHS,
  materializeUpstreamTestFixtures,
  parseUpstreamFixtureProvenance,
  verifyUpstreamFixtureIntegrity,
} from '../scripts/upstream-test-fixtures';

const SOURCE_SHA = '212abfd21493e9957bd556250ac538fa40fe1fc9';
const SOURCE_REPOSITORY =
  'ochowei/Universal-LPC-Spritesheet-Character-Generator';

function write(root: string, relativePath: string, data: string | Buffer): void {
  const fullPath = path.join(root, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, data);
}

function makeSource(): string {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-source-'));
  for (const relativePath of FIXTURE_SPRITE_PATHS) {
    write(sourceRoot, relativePath, Buffer.from(`fixture:${relativePath}`));
  }
  write(
    sourceRoot,
    'CREDITS.csv',
    [
      'file,notes,authors,licenses,urls',
      '"body/bodies/male/walk.png","body","Author","GPL 3.0","https://example.com/body"',
      '"body/wheelchair/adult/background/wheelchair.png","wheelchair","Author","CC-BY 3.0","https://example.com/wheelchair"',
      '"unrelated/item.png","skip","Other","GPL 3.0","https://example.com/skip"',
      '',
    ].join('\n'),
  );
  return sourceRoot;
}

function materialize(): { fixtureRoot: string; provenance: ReturnType<typeof materializeUpstreamTestFixtures> } {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'lpc-core-fixtures-'));
  const provenance = materializeUpstreamTestFixtures({
    sourceRoot: makeSource(),
    fixtureRoot,
    sourceRepository: SOURCE_REPOSITORY,
    sourceSha: SOURCE_SHA,
  });
  return { fixtureRoot, provenance };
}

describe('upstream real-pixel fixtures', () => {
  it('materializes the exact allowlist with minimal credits and hashes', () => {
    const { fixtureRoot, provenance } = materialize();

    expect(provenance.sourceRepository).toBe(SOURCE_REPOSITORY);
    expect(provenance.sourceSha).toBe(SOURCE_SHA);
    expect(provenance.files.map(({ path: filePath }) => filePath)).toEqual(
      FIXTURE_SPRITE_PATHS,
    );
    expect(provenance.files.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
    const credits = readFileSync(path.join(fixtureRoot, 'CREDITS.csv'), 'utf8');
    expect(credits).toContain('body/bodies/male/walk.png');
    expect(credits).toContain('body/wheelchair/adult/background/wheelchair.png');
    expect(credits).not.toContain('unrelated/item.png');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).not.toThrow();
  });

  it('rejects malformed provenance', () => {
    expect(() => parseUpstreamFixtureProvenance('{}')).toThrow(/sourceRepository/);
  });

  it('rejects a missing fixture file', () => {
    const { fixtureRoot, provenance } = materialize();
    rmSync(path.join(fixtureRoot, FIXTURE_SPRITE_PATHS[0]));
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/Missing fixture file/);
  });

  it('rejects an unexpected fixture file', () => {
    const { fixtureRoot, provenance } = materialize();
    write(fixtureRoot, 'spritesheets/unexpected.png', 'unexpected');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/Unexpected fixture file/);
  });

  it('rejects a fixture hash mismatch', () => {
    const { fixtureRoot, provenance } = materialize();
    writeFileSync(path.join(fixtureRoot, FIXTURE_SPRITE_PATHS[0]), 'changed');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/SHA-256 mismatch/);
  });

  it('rejects empty fixture credits', () => {
    const { fixtureRoot, provenance } = materialize();
    writeFileSync(path.join(fixtureRoot, 'CREDITS.csv'), '');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/CREDITS.csv must be non-empty/);
  });
});
