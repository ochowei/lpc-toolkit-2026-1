import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadReleaseConfig } from './asset-release';
import {
  parseUpstreamFixtureProvenance,
  verifyUpstreamFixtureIntegrity,
} from './upstream-test-fixtures';

const GITLINK_PATTERN = /^160000 commit ([0-9a-f]{40})\tupstream\n?$/;
const FIXTURE_ROOT = 'packages/core/test/fixtures/upstream-pixels';

export interface VerifyUpstreamPinOptions {
  readonly repoRoot: string;
  readonly gitlinkSha?: string;
}

export interface UpstreamPinVerification {
  readonly sourceSha: string;
  readonly fixtureFileCount: number;
}

function requireSha(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${fieldName} must match /^[0-9a-f]{40}$/`);
  }

  return value;
}

function requireObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must contain an object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredTextFile(repoRoot: string, relativePath: string): string {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }

  return readFileSync(filePath, 'utf8');
}

function readAssetManifestSourceSha(repoRoot: string): string {
  const manifestJson = readRequiredTextFile(repoRoot, 'assets/asset-manifest.json');
  const manifest = requireObject(
    JSON.parse(manifestJson) as unknown,
    'asset manifest',
  );

  return requireSha(manifest.sourceSha, 'asset manifest sourceSha');
}

function readFixtureProvenance(repoRoot: string) {
  return parseUpstreamFixtureProvenance(
    readRequiredTextFile(repoRoot, `${FIXTURE_ROOT}/provenance.json`),
  );
}

export function parseUpstreamGitlink(output: string): string {
  const match = output.match(GITLINK_PATTERN);
  if (!match) {
    throw new Error(`Unable to read upstream gitlink from git ls-tree output: ${JSON.stringify(output)}`);
  }

  const sha = match[1];
  if (!sha) {
    throw new Error(`Unable to read upstream gitlink from git ls-tree output: ${JSON.stringify(output)}`);
  }

  return sha;
}

export function readUpstreamGitlink(repoRoot: string): string {
  let output: string;

  try {
    output = execFileSync('git', ['ls-tree', 'HEAD', 'upstream'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Unable to read upstream gitlink via git ls-tree HEAD upstream${detail}`);
  }

  return parseUpstreamGitlink(output);
}

export function verifyUpstreamPin(
  options: VerifyUpstreamPinOptions,
): UpstreamPinVerification {
  const repoRoot = path.resolve(options.repoRoot);

  readRequiredTextFile(repoRoot, 'asset-release.json');
  const releaseConfig = loadReleaseConfig(repoRoot);
  const releaseSha = requireSha(
    releaseConfig.sourceSha,
    'asset-release.json sourceSha',
  );
  const gitlinkSha = requireSha(
    options.gitlinkSha ?? readUpstreamGitlink(repoRoot),
    'gitlink',
  );
  const manifestSha = readAssetManifestSourceSha(repoRoot);
  const provenance = readFixtureProvenance(repoRoot);

  if (provenance.sourceRepository !== releaseConfig.sourceRepository) {
    throw new Error(
      `fixture provenance sourceRepository mismatch: asset-release.json ${releaseConfig.sourceRepository}, fixture provenance ${provenance.sourceRepository}`,
    );
  }

  const pins = [
    ['gitlink', gitlinkSha],
    ['asset-release.json', releaseSha],
    ['asset manifest', manifestSha],
    ['fixture provenance', provenance.sourceSha],
  ] as const;

  if (pins.some(([, value]) => value !== releaseSha)) {
    throw new Error(
      `Upstream source SHA mismatch:\n${pins
        .map(([label, value]) => `- ${label}: ${value}`)
        .join('\n')}`,
    );
  }

  const fixtureRoot = path.join(repoRoot, FIXTURE_ROOT);
  verifyUpstreamFixtureIntegrity(fixtureRoot, provenance);

  return {
    sourceSha: releaseSha,
    fixtureFileCount: provenance.files.length,
  };
}
