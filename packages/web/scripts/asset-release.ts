import { createHash } from 'node:crypto';
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

export interface AssetManifestFile {
  readonly size: number;
  readonly sha256: string;
}

export interface AssetManifest {
  readonly sourceSha: string;
  readonly files: Readonly<Record<string, AssetManifestFile>>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`asset-release.json field "${fieldName}" must be a string`);
  }

  return value;
}

function parseManifestFile(
  pathName: string,
  value: unknown,
): AssetManifestFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`asset manifest entry must be an object: ${pathName}`);
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.size !== 'number' ||
    !Number.isSafeInteger(record.size) ||
    record.size < 0
  ) {
    throw new Error(`asset manifest entry has invalid size: ${pathName}`);
  }

  if (
    typeof record.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(record.sha256)
  ) {
    throw new Error(`asset manifest entry has invalid sha256: ${pathName}`);
  }

  return {
    size: record.size,
    sha256: record.sha256,
  };
}

export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hashFile(filePath: string): string {
  return hashBuffer(readFileSync(filePath));
}

export function verifyHash(
  label: string,
  buffer: Buffer,
  expected: string,
): void {
  const actual = hashBuffer(buffer);

  if (actual !== expected) {
    throw new Error(
      `${label} SHA-256 mismatch: expected ${expected}, actual ${actual}`,
    );
  }
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

export function parseAssetManifest(
  json: string,
  config: ReleaseConfig,
): AssetManifest {
  const data = JSON.parse(json) as unknown;

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('asset manifest must contain an object');
  }

  const record = data as Record<string, unknown>;

  if (record.sourceSha !== config.sourceSha) {
    throw new Error(
      `asset manifest sourceSha mismatch: expected ${config.sourceSha}, actual ${String(
        record.sourceSha,
      )}`,
    );
  }

  if (
    typeof record.files !== 'object' ||
    record.files === null ||
    Array.isArray(record.files)
  ) {
    throw new Error('asset manifest must contain a files object');
  }

  const files: Record<string, AssetManifestFile> = {};

  for (const [pathName, value] of Object.entries(record.files)) {
    files[pathName] = parseManifestFile(pathName, value);
  }

  if (!files['CREDITS.csv']) {
    throw new Error(
      'asset manifest must include CREDITS.csv for attribution compliance',
    );
  }

  return {
    sourceSha: config.sourceSha,
    files,
  };
}
