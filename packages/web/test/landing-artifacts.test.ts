import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function landingArtifact(name: string): string {
  return fileURLToPath(new URL(`../src/landing-artifacts/${name}`, import.meta.url));
}

describe('landing preview artifacts', () => {
  it('keeps the generated preview with both matching credit formats', () => {
    const preview = readFileSync(landingArtifact('hero.preview.png'));
    const creditsTxt = readFileSync(
      landingArtifact('hero.credits.txt'),
      'utf8',
    );
    const creditsCsv = readFileSync(
      landingArtifact('hero.credits.csv'),
      'utf8',
    );

    expect(preview.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(creditsTxt).toContain('\t- Licenses:');
    expect(creditsTxt).toContain('\t- Authors:');
    expect(creditsCsv).toMatch(
      /^filename,notes,authors,licenses,urls\n"/u,
    );
  });
});
