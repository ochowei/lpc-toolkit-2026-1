import { createHash } from 'node:crypto';
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
    readonly creditRowSha256: string;
  }[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'fixtures/upstream-pixels');
const BODY_CREDIT_PAYLOAD = [
  "see details at https://opengameart.org/content/lpc-character-bases; 'Thick' Male Revised Run/Climb by JaidynReiman (based on ElizaWy's LPC Revised)",
  'bluecarrot16,JaidynReiman,Benjamin K. Smith (BenCreating),Evert,Eliza Wyatt (ElizaWy),TheraHedwig,MuffinElZangano,Durrani,Johannes Sjölund (wulax),Stephen Challener (Redshrike)',
  'OGA-BY 3.0,CC-BY-SA 3.0,GPL 3.0',
  'https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles,https://opengameart.org/content/lpc-medieval-fantasy-character-sprites,https://opengameart.org/content/lpc-male-jumping-animation-by-durrani,https://opengameart.org/content/lpc-runcycle-and-diagonal-walkcycle,https://opengameart.org/content/lpc-revised-character-basics,https://opengameart.org/content/lpc-be-seated,https://opengameart.org/content/lpc-runcycle-for-male-muscular-and-pregnant-character-bases-with-modular-heads,https://opengameart.org/content/lpc-jump-expanded,https://opengameart.org/content/lpc-character-bases',
] as const;
const WHEELCHAIR_CREDIT_PAYLOAD = [
  '',
  'Eliza Wyatt',
  'CC-BY 3.0,OGA-BY 3.0',
  'https://opengameart.org/content/lpc-revised-elders',
] as const;

function creditFilenames(credits: string): string[] {
  return credits
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^"([^"]+)"/);
      return match ? [match[1]] : [];
    });
}

function creditFields(line: string): readonly [string, string, string, string, string] {
  const fields = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  if (fields.length !== 5) {
    throw new Error(`Malformed credit row: ${line}`);
  }

  return [
    fields[0],
    fields[1],
    fields[2],
    fields[3],
    fields[4],
  ];
}

function creditRows(credits: string): ReadonlyMap<string, string> {
  const rows = new Map<string, string>();

  for (const line of credits.split(/\r?\n/).slice(1)) {
    if (line.length === 0) {
      continue;
    }

    rows.set(creditFields(line)[0], line);
  }

  return rows;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
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
    const rows = creditRows(credits);
    expect(credits.trim()).not.toBe('');
    expect([...creditFilenames(credits)].sort()).toEqual(
      [...provenance.files.map((file) => file.path.replace(/^spritesheets\//, ''))].sort(),
    );
    for (const file of provenance.files) {
      const creditPath = file.path.replace(/^spritesheets\//, '');
      const creditRow = rows.get(creditPath);
      expect(creditRow).toBeDefined();
      expect(file.creditRowSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.creditRowSha256).toBe(sha256(creditRow!));
      expect(creditFields(creditRow!).slice(1)).toEqual(
        creditPath.startsWith('body/wheelchair/adult/')
          ? WHEELCHAIR_CREDIT_PAYLOAD
          : BODY_CREDIT_PAYLOAD,
      );
    }
  });
});
