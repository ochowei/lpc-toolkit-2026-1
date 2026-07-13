import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
const BODY_CREDIT_ROW_SUFFIX =
  `,"body","Author","GPL 3.0","https://example.com/body"`;
const WHEELCHAIR_CREDIT_ROW_SUFFIX =
  `,"wheelchair","Author","CC-BY 3.0","https://example.com/wheelchair"`;
const FIXTURE_CREDIT_SOURCE_PATH_ALIASES: Readonly<Record<string, string>> = {
  'body/bodies/male/backslash.png': 'body/bodies/male/1h_backslash.png',
  'body/bodies/male/combat_idle.png': 'body/bodies/male/combat.png',
  'body/bodies/male/halfslash.png': 'body/bodies/male/1h_halfslash.png',
  'body/wheelchair/adult/background/black.png':
    'body/wheelchair/adult/background/wheelchair.png',
  'body/wheelchair/adult/foreground/black.png':
    'body/wheelchair/adult/foreground/wheelchair.png',
};

function write(root: string, relativePath: string, data: string | Buffer): void {
  const fullPath = path.join(root, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, data);
}

function fixtureCreditPath(relativePath: string): string {
  return relativePath.replace(/^spritesheets\//, '');
}

function sourceCreditPath(relativePath: string): string {
  const creditPath = fixtureCreditPath(relativePath);
  return FIXTURE_CREDIT_SOURCE_PATH_ALIASES[creditPath] ?? creditPath;
}

function creditRow(pathValue: string): string {
  const suffix = pathValue.startsWith('body/wheelchair/adult/')
    ? WHEELCHAIR_CREDIT_ROW_SUFFIX
    : BODY_CREDIT_ROW_SUFFIX;
  return `"${pathValue}"${suffix}`;
}

function creditFilenames(credits: string): string[] {
  return credits
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^"([^"]+)"/);
      const filename = match?.[1];
      return filename ? [filename] : [];
    });
}

function creditFields(line: string): readonly [string, string, string, string, string] {
  const fields = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  if (fields.length !== 5) {
    throw new Error(`Malformed credit row: ${line}`);
  }

  const [filePath, notes, authors, licenses, urls] = fields;
  if (
    filePath === undefined ||
    notes === undefined ||
    authors === undefined ||
    licenses === undefined ||
    urls === undefined
  ) {
    throw new Error(`Malformed credit row: ${line}`);
  }

  return [
    filePath,
    notes,
    authors,
    licenses,
    urls,
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

function makeSource(): string {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-source-'));
  return populateSource(sourceRoot);
}

function populateSource(sourceRoot: string): string {
  for (const relativePath of FIXTURE_SPRITE_PATHS) {
    write(sourceRoot, relativePath, Buffer.from(`fixture:${relativePath}`));
  }
  write(
    sourceRoot,
    'CREDITS.csv',
    [
      'file,notes,authors,licenses,urls',
      ...FIXTURE_SPRITE_PATHS.map((relativePath) =>
        creditRow(sourceCreditPath(relativePath)),
      ),
      '"unrelated/item.png","skip","Other","GPL 3.0","https://example.com/skip"',
      '',
    ].join('\n'),
  );
  return sourceRoot;
}

function materialize(): {
  fixtureRoot: string;
  provenance: ReturnType<typeof materializeUpstreamTestFixtures>;
  sourceRoot: string;
} {
  const sourceRoot = makeSource();
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'lpc-core-fixtures-'));
  const provenance = materializeUpstreamTestFixtures({
    sourceRoot,
    fixtureRoot,
    sourceRepository: SOURCE_REPOSITORY,
    sourceSha: SOURCE_SHA,
  });
  return { fixtureRoot, provenance, sourceRoot };
}

describe('upstream real-pixel fixtures', () => {
  it('materializes the exact allowlist with minimal credits and hashes', () => {
    const { fixtureRoot, provenance, sourceRoot } = materialize();

    expect(provenance.sourceRepository).toBe(SOURCE_REPOSITORY);
    expect(provenance.sourceSha).toBe(SOURCE_SHA);
    expect(provenance.files.map(({ path: filePath }) => filePath)).toEqual(
      FIXTURE_SPRITE_PATHS,
    );
    expect(provenance.files.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
    expect(
      provenance.files.every((file) => {
        const creditRowSha256 = Reflect.get(file, 'creditRowSha256');
        return (
          typeof creditRowSha256 === 'string' &&
          /^[0-9a-f]{64}$/.test(creditRowSha256)
        );
      }),
    ).toBe(true);
    const sourceRows = creditRows(
      readFileSync(path.join(sourceRoot, 'CREDITS.csv'), 'utf8'),
    );
    const credits = readFileSync(path.join(fixtureRoot, 'CREDITS.csv'), 'utf8');
    expect([...creditFilenames(credits)].sort()).toEqual(
      [...FIXTURE_SPRITE_PATHS.map(fixtureCreditPath)].sort(),
    );
    const fixtureRows = creditRows(credits);
    for (const file of provenance.files) {
      const fixturePath = fixtureCreditPath(file.path);
      const fixtureRow = fixtureRows.get(fixturePath);
      const sourceRow = sourceRows.get(sourceCreditPath(file.path));
      expect(fixtureRow).toBeDefined();
      expect(sourceRow).toBeDefined();
      expect(creditFields(fixtureRow!)).toEqual([
        fixturePath,
        ...creditFields(sourceRow!).slice(1),
      ]);
      expect(Reflect.get(file, 'creditRowSha256')).toBe(sha256(fixtureRow!));
    }
    expect(credits).not.toContain('unrelated/item.png');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).not.toThrow();
  });

  it('rejects malformed provenance', () => {
    expect(() => parseUpstreamFixtureProvenance('{}')).toThrow(/sourceRepository/);
  });

  it('rejects a fixture root that overlaps the source root as an ancestor', () => {
    const overlapRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-overlap-'));
    const sourceRoot = populateSource(path.join(overlapRoot, 'source'));

    expect(() =>
      materializeUpstreamTestFixtures({
        sourceRoot,
        fixtureRoot: overlapRoot,
        sourceRepository: SOURCE_REPOSITORY,
        sourceSha: SOURCE_SHA,
      }),
    ).toThrow(/must not overlap sourceRoot/);
    expect(existsSync(sourceRoot)).toBe(true);
  });

  it('rejects a fixture root symlink alias before deleting source files', () => {
    const overlapRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-symlink-overlap-'));
    const sourceRoot = populateSource(path.join(overlapRoot, 'source'));
    const aliasRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-symlink-alias-'));
    const fixtureAliasRoot = path.join(aliasRoot, 'fixture-link');
    const preservedFixturePath = path.join(sourceRoot, FIXTURE_SPRITE_PATHS[0]);

    symlinkSync(overlapRoot, fixtureAliasRoot, 'dir');

    expect(() =>
      materializeUpstreamTestFixtures({
        sourceRoot,
        fixtureRoot: path.join(fixtureAliasRoot, 'source'),
        sourceRepository: SOURCE_REPOSITORY,
        sourceSha: SOURCE_SHA,
      }),
    ).toThrow(/must not overlap sourceRoot/);
    expect(existsSync(preservedFixturePath)).toBe(true);
  });

  it('rejects duplicate provenance file paths during parsing', () => {
    const { provenance } = materialize();

    expect(() =>
      parseUpstreamFixtureProvenance(
        JSON.stringify({
          ...provenance,
          files: [...provenance.files, provenance.files[0]],
        }),
      ),
    ).toThrow(/Duplicate provenance file path/);
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

  it('rejects fixture credits without exact provenance path matches', () => {
    const { fixtureRoot, provenance } = materialize();
    const creditsPath = path.join(fixtureRoot, 'CREDITS.csv');
    writeFileSync(
      creditsPath,
      readFileSync(creditsPath, 'utf8').replace(
        '"body/bodies/male/combat_idle.png"',
        '"body/bodies/male/combat.png"',
      ),
    );
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(
      /Missing credited fixture row: body\/bodies\/male\/combat_idle\.png/,
    );
  });

  it('rejects fixture credits with altered non-path payloads', () => {
    const { fixtureRoot, provenance } = materialize();
    const creditsPath = path.join(fixtureRoot, 'CREDITS.csv');
    writeFileSync(
      creditsPath,
      readFileSync(creditsPath, 'utf8').replace(
        creditRow('body/bodies/male/combat_idle.png'),
        '"body/bodies/male/combat_idle.png","","","",""',
      ),
    );

    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(
      /CREDITS\.csv row mismatch for body\/bodies\/male\/combat_idle\.png/,
    );
  });
});
