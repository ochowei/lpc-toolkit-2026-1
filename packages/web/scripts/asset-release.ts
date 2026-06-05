import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ReleaseConfig {
  readonly tag: string;
  readonly sourceRepository: string;
  readonly sourceSha: string;
  readonly manifestUrl: string;
  readonly manifestSha256: string;
  readonly tarballUrl: string;
  readonly tarballSha256: string;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`asset-release.json field "${fieldName}" must be a string`);
  }

  return value;
}

export function loadReleaseConfig(repoRoot: string): ReleaseConfig {
  const configPath = path.join(repoRoot, 'asset-release.json');
  const data = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('asset-release.json must contain an object');
  }

  const record = data as Record<string, unknown>;

  return {
    tag: requireString(record.tag, 'tag'),
    sourceRepository: requireString(
      record.sourceRepository,
      'sourceRepository',
    ),
    sourceSha: requireString(record.sourceSha, 'sourceSha'),
    manifestUrl: requireString(record.manifestUrl, 'manifestUrl'),
    manifestSha256: requireString(record.manifestSha256, 'manifestSha256'),
    tarballUrl: requireString(record.tarballUrl, 'tarballUrl'),
    tarballSha256: requireString(record.tarballSha256, 'tarballSha256'),
  };
}
