import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_SPRITE_PATHS,
  materializeUpstreamTestFixtures,
  type UpstreamFixtureProvenance,
} from '../scripts/upstream-test-fixtures';
import {
  parseUpstreamGitlink,
  verifyUpstreamPin,
} from '../scripts/upstream-pin';

const SHA = '212abfd21493e9957bd556250ac538fa40fe1fc9';
const OTHER_SHA = '0'.repeat(40);
const SOURCE_REPOSITORY =
  'ochowei/Universal-LPC-Spritesheet-Character-Generator';
const OTHER_REPOSITORY = 'example/forked-lpc';
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
const FIXTURE_ROOT = 'packages/core/test/fixtures/upstream-pixels';

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

function makeSource(): string {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-pin-source-'));

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

function writeReleaseFiles(
  repoRoot: string,
  options?: {
    manifestSourceSha?: string;
    sourceRepository?: string;
  },
): void {
  const sourceRepository = options?.sourceRepository ?? SOURCE_REPOSITORY;
  const manifestSourceSha = options?.manifestSourceSha ?? SHA;

  write(
    repoRoot,
    'asset-release.json',
    `${JSON.stringify(
      {
        tag: 'assets-v2026.06.05-initial',
        sourceRepository,
        sourceSha: SHA,
        manifestUrl: 'https://example.com/asset-manifest.json',
        manifestSha256:
          '1cce0f4a5fd9b7ac72ae732f04bda39cf9096518ad067ad6009757fe83b9e72c',
        tarballUrl: 'https://example.com/lpc-runtime-zips.tar.gz',
        tarballSha256:
          'dd603191c7185323013153b9b35f8d9b4987637d15d7e3195b9d320d9fbac6e7',
      },
      null,
      2,
    )}\n`,
  );
  write(
    repoRoot,
    'assets/asset-manifest.json',
    `${JSON.stringify(
      {
        format: 'lpc-runtime-zips',
        sourceRepository,
        sourceRef: 'assets-release',
        sourceSha: manifestSourceSha,
        generatedAt: '2026-06-05T07:02:14.823Z',
        files: [],
      },
      null,
      2,
    )}\n`,
  );
}

function writeFixtureTree(
  repoRoot: string,
  options?: {
    provenanceSourceSha?: string;
    provenanceSourceRepository?: string;
  },
): UpstreamFixtureProvenance {
  const sourceRoot = makeSource();
  const fixtureRoot = path.join(repoRoot, FIXTURE_ROOT);
  const provenance = materializeUpstreamTestFixtures({
    sourceRoot,
    fixtureRoot,
    sourceRepository:
      options?.provenanceSourceRepository ?? SOURCE_REPOSITORY,
    sourceSha: options?.provenanceSourceSha ?? SHA,
  });

  return provenance;
}

function makeRepo(
  options?: {
    manifestSourceSha?: string;
    provenanceSourceSha?: string;
    releaseSourceRepository?: string;
    provenanceSourceRepository?: string;
  },
): { repoRoot: string; provenance: UpstreamFixtureProvenance } {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-pin-repo-'));
  const releaseOptions: {
    manifestSourceSha?: string;
    sourceRepository?: string;
  } = {};
  if (options?.manifestSourceSha !== undefined) {
    releaseOptions.manifestSourceSha = options.manifestSourceSha;
  }
  if (options?.releaseSourceRepository !== undefined) {
    releaseOptions.sourceRepository = options.releaseSourceRepository;
  }

  writeReleaseFiles(repoRoot, releaseOptions);

  const fixtureOptions: {
    provenanceSourceSha?: string;
    provenanceSourceRepository?: string;
  } = {};
  if (options?.provenanceSourceSha !== undefined) {
    fixtureOptions.provenanceSourceSha = options.provenanceSourceSha;
  }
  if (options?.provenanceSourceRepository !== undefined) {
    fixtureOptions.provenanceSourceRepository =
      options.provenanceSourceRepository;
  }

  const provenance = writeFixtureTree(repoRoot, fixtureOptions);

  return { repoRoot, provenance };
}

function expectPinMismatch(errorFactory: () => void): void {
  expect(errorFactory).toThrowError(/Upstream source SHA mismatch:/);
  expect(errorFactory).toThrowError(/- gitlink: /);
  expect(errorFactory).toThrowError(/- asset-release\.json: /);
  expect(errorFactory).toThrowError(/- asset manifest: /);
  expect(errorFactory).toThrowError(/- fixture provenance: /);
}

describe('upstream pin verification', () => {
  it('parses exact upstream gitlink output', () => {
    expect(parseUpstreamGitlink(`160000 commit ${SHA}\tupstream\n`)).toBe(SHA);
    expect(() => parseUpstreamGitlink('')).toThrow(
      /Unable to read upstream gitlink/,
    );
    expect(() =>
      parseUpstreamGitlink(`160000 commit ${SHA.toUpperCase()}\tupstream\n`),
    ).toThrow(/Unable to read upstream gitlink/);
  });

  it('verifies matching release, manifest, fixture provenance, and gitlink pins', () => {
    const { repoRoot } = makeRepo();

    expect(verifyUpstreamPin({ repoRoot, gitlinkSha: SHA })).toEqual({
      sourceSha: SHA,
      fixtureFileCount: FIXTURE_SPRITE_PATHS.length,
    });
  });

  it('reports all four labeled pins when the gitlink differs', () => {
    const { repoRoot } = makeRepo();

    expectPinMismatch(() =>
      verifyUpstreamPin({ repoRoot, gitlinkSha: OTHER_SHA }),
    );
    expect(() =>
      verifyUpstreamPin({ repoRoot, gitlinkSha: OTHER_SHA }),
    ).toThrow(/gitlink: 0000000000000000000000000000000000000000/);
  });

  it('reports all four labeled pins when the asset manifest sourceSha differs', () => {
    const { repoRoot } = makeRepo({ manifestSourceSha: OTHER_SHA });

    expectPinMismatch(() =>
      verifyUpstreamPin({ repoRoot, gitlinkSha: SHA }),
    );
  });

  it('reports all four labeled pins when the fixture provenance sourceSha differs', () => {
    const { repoRoot } = makeRepo({ provenanceSourceSha: OTHER_SHA });

    expectPinMismatch(() =>
      verifyUpstreamPin({ repoRoot, gitlinkSha: SHA }),
    );
  });

  it('rejects a fixture provenance repository mismatch', () => {
    const { repoRoot } = makeRepo({
      provenanceSourceRepository: OTHER_REPOSITORY,
    });

    expect(() => verifyUpstreamPin({ repoRoot, gitlinkSha: SHA })).toThrow(
      new RegExp(
        `fixture provenance sourceRepository mismatch: asset-release\\.json ${SOURCE_REPOSITORY}, fixture provenance ${OTHER_REPOSITORY}`,
      ),
    );
  });

  it('names the missing asset manifest file exactly', () => {
    const { repoRoot } = makeRepo();
    rmSync(path.join(repoRoot, 'assets/asset-manifest.json'));

    expect(() => verifyUpstreamPin({ repoRoot, gitlinkSha: SHA })).toThrow(
      /Missing required file: .*assets\/asset-manifest\.json/,
    );
  });

  it('rejects malformed gitlink SHAs before pin comparison', () => {
    const { repoRoot } = makeRepo();

    expect(() =>
      verifyUpstreamPin({ repoRoot, gitlinkSha: 'not-a-sha' }),
    ).toThrow(/gitlink must match/);
  });

  it('fails fixture verification after pin matching if the copied fixtures are mutated', () => {
    const { repoRoot, provenance } = makeRepo();
    const fixturePath = path.join(repoRoot, FIXTURE_ROOT, provenance.files[0]!.path);
    writeFileSync(fixturePath, 'mutated-fixture');

    expect(() => verifyUpstreamPin({ repoRoot, gitlinkSha: SHA })).toThrow(
      /SHA-256 mismatch/,
    );
  });

  it('reads the checked-in fixture provenance file', () => {
    const { repoRoot, provenance } = makeRepo();

    const parsed = JSON.parse(
      readFileSync(path.join(repoRoot, FIXTURE_ROOT, 'provenance.json'), 'utf8'),
    ) as { readonly sourceSha: string; readonly files: readonly unknown[] };

    expect(parsed.sourceSha).toBe(provenance.sourceSha);
    expect(parsed.files).toHaveLength(FIXTURE_SPRITE_PATHS.length);
  });
});
