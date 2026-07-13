import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface FixtureProvenance {
  readonly sourceSha: string;
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly creditsSource: string;
  }[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'fixtures/upstream-pixels');

function creditFilenames(credits: string): string[] {
  return credits
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^"([^"]+)"/);
      return match ? [match[1]] : [];
    });
}

describe('real-pixel fixture bundle', () => {
  it('is checked in outside upstream with attributed files', () => {
    expect(fixtureRoot).not.toContain(`${path.sep}upstream${path.sep}`);
    const provenance = JSON.parse(
      readFileSync(path.join(fixtureRoot, 'provenance.json'), 'utf8'),
    ) as FixtureProvenance;
    expect(provenance.sourceSha).toMatch(/^[0-9a-f]{40}$/);
    expect(provenance.files).toHaveLength(17);
    for (const file of provenance.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.creditsSource).toBe('CREDITS.csv');
      expect(existsSync(path.join(fixtureRoot, file.path))).toBe(true);
    }
    const credits = readFileSync(path.join(fixtureRoot, 'CREDITS.csv'), 'utf8');
    expect(credits.trim()).not.toBe('');
    expect([...creditFilenames(credits)].sort()).toEqual(
      [...provenance.files.map((file) => file.path.replace(/^spritesheets\//, ''))].sort(),
    );
  });
});
