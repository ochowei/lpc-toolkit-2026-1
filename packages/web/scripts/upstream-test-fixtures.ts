import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const FIXTURE_SPRITE_PATHS = [
  'spritesheets/body/bodies/male/backslash.png',
  'spritesheets/body/bodies/male/climb.png',
  'spritesheets/body/bodies/male/combat_idle.png',
  'spritesheets/body/bodies/male/emote.png',
  'spritesheets/body/bodies/male/halfslash.png',
  'spritesheets/body/bodies/male/hurt.png',
  'spritesheets/body/bodies/male/idle.png',
  'spritesheets/body/bodies/male/jump.png',
  'spritesheets/body/bodies/male/run.png',
  'spritesheets/body/bodies/male/shoot.png',
  'spritesheets/body/bodies/male/sit.png',
  'spritesheets/body/bodies/male/slash.png',
  'spritesheets/body/bodies/male/spellcast.png',
  'spritesheets/body/bodies/male/thrust.png',
  'spritesheets/body/bodies/male/walk.png',
  'spritesheets/body/wheelchair/adult/background/black.png',
  'spritesheets/body/wheelchair/adult/foreground/black.png',
] as const;

export interface UpstreamFixtureFile {
  readonly path: string;
  readonly sha256: string;
  readonly creditsSource: 'CREDITS.csv';
}

export interface UpstreamFixtureProvenance {
  readonly sourceRepository: string;
  readonly sourceSha: string;
  readonly files: readonly UpstreamFixtureFile[];
}

export interface MaterializeUpstreamTestFixturesOptions {
  readonly sourceRoot: string;
  readonly fixtureRoot: string;
  readonly sourceRepository: string;
  readonly sourceSha: string;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value;
}

function requireSha(value: unknown, fieldName: string): string {
  const sha = requireNonEmptyString(value, fieldName);
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`${fieldName} must match /^[0-9a-f]{40}$/`);
  }

  return sha;
}

function resolveInside(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);

  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Path escapes root ${resolvedRoot}: ${relativePath}`);
  }

  return resolvedPath;
}

function pathContains(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashFile(filePath: string): string {
  return hashBuffer(readFileSync(filePath));
}

function parseFixtureFile(
  value: unknown,
  index: number,
): UpstreamFixtureFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`files[${index}] must be an object`);
  }

  const record = value as Record<string, unknown>;
  const filePath = requireNonEmptyString(record.path, `files[${index}].path`);
  const sha256 = requireNonEmptyString(record.sha256, `files[${index}].sha256`);

  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`files[${index}].sha256 must match /^[0-9a-f]{64}$/`);
  }

  if (record.creditsSource !== 'CREDITS.csv') {
    throw new Error(
      `files[${index}].creditsSource must be "CREDITS.csv" for ${filePath}`,
    );
  }

  return {
    path: filePath,
    sha256,
    creditsSource: 'CREDITS.csv',
  };
}

function readMinimalCredits(sourceRoot: string): string {
  const creditsPath = resolveInside(sourceRoot, 'CREDITS.csv');
  const credits = readFileSync(creditsPath, 'utf8');
  const lines = credits.split(/\r?\n/);
  const header = lines[0] ?? '';
  const bodyLines = lines.filter((line) =>
    line.startsWith('"body/bodies/male/'),
  );
  const wheelchairLines = lines.filter((line) =>
    line.startsWith('"body/wheelchair/adult/'),
  );

  if (bodyLines.length === 0) {
    throw new Error('CREDITS.csv missing required body fixture rows');
  }

  if (wheelchairLines.length === 0) {
    throw new Error('CREDITS.csv missing required wheelchair fixture rows');
  }

  return [header, ...bodyLines, ...wheelchairLines, ''].join('\n');
}

function listFilesRecursively(root: string, prefix = ''): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = prefix.length > 0 ? path.join(prefix, entry.name) : entry.name;
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(fullPath, relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function verifyProvenanceAllowlist(provenance: UpstreamFixtureProvenance): void {
  const expectedPaths = new Set<string>(FIXTURE_SPRITE_PATHS);
  const actualPaths = new Set<string>();

  for (const file of provenance.files) {
    if (!expectedPaths.has(file.path)) {
      throw new Error(`Unexpected provenance file path: ${file.path}`);
    }

    if (actualPaths.has(file.path)) {
      throw new Error(`Duplicate provenance file path: ${file.path}`);
    }

    actualPaths.add(file.path);
  }

  for (const expectedPath of FIXTURE_SPRITE_PATHS) {
    if (!actualPaths.has(expectedPath)) {
      throw new Error(`Missing provenance file path: ${expectedPath}`);
    }
  }
}

export function materializeUpstreamTestFixtures(
  options: MaterializeUpstreamTestFixturesOptions,
): UpstreamFixtureProvenance {
  const sourceRepository = requireNonEmptyString(
    options.sourceRepository,
    'sourceRepository',
  );
  const sourceSha = requireSha(options.sourceSha, 'sourceSha');
  const sourceRoot = path.resolve(options.sourceRoot);
  const fixtureRoot = path.resolve(options.fixtureRoot);

  if (pathContains(sourceRoot, fixtureRoot) || pathContains(fixtureRoot, sourceRoot)) {
    throw new Error(
      `fixtureRoot must not overlap sourceRoot: ${fixtureRoot} vs ${sourceRoot}`,
    );
  }

  rmSync(fixtureRoot, { force: true, recursive: true });
  mkdirSync(fixtureRoot, { recursive: true });

  const files = FIXTURE_SPRITE_PATHS.map((relativePath) => {
    const sourcePath = resolveInside(sourceRoot, relativePath);
    if (!statSync(sourcePath).isFile()) {
      throw new Error(`Source fixture file is not a file: ${relativePath}`);
    }

    const targetPath = resolveInside(fixtureRoot, relativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);

    return {
      path: relativePath,
      sha256: hashFile(targetPath),
      creditsSource: 'CREDITS.csv' as const,
    };
  });

  writeFileSync(
    resolveInside(fixtureRoot, 'CREDITS.csv'),
    readMinimalCredits(sourceRoot),
  );

  const provenance: UpstreamFixtureProvenance = {
    sourceRepository,
    sourceSha,
    files,
  };

  writeFileSync(
    resolveInside(fixtureRoot, 'provenance.json'),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );

  return provenance;
}

export function parseUpstreamFixtureProvenance(
  json: string,
): UpstreamFixtureProvenance {
  const data = JSON.parse(json) as unknown;

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('provenance must contain an object');
  }

  const record = data as Record<string, unknown>;
  const provenance: UpstreamFixtureProvenance = {
    sourceRepository: requireNonEmptyString(
      record.sourceRepository,
      'sourceRepository',
    ),
    sourceSha: requireSha(record.sourceSha, 'sourceSha'),
    files: Array.isArray(record.files)
      ? record.files.map(parseFixtureFile)
      : (() => {
          throw new Error('files must be an array');
        })(),
  };

  verifyProvenanceAllowlist(provenance);
  return provenance;
}

export function verifyUpstreamFixtureIntegrity(
  fixtureRoot: string,
  provenance: UpstreamFixtureProvenance,
): void {
  verifyProvenanceAllowlist(provenance);

  const resolvedFixtureRoot = path.resolve(fixtureRoot);
  const creditsPath = resolveInside(resolvedFixtureRoot, 'CREDITS.csv');
  const credits = existsSync(creditsPath) ? readFileSync(creditsPath, 'utf8') : '';
  if (credits.length === 0) {
    throw new Error('CREDITS.csv must be non-empty');
  }

  const actualPaths = listFilesRecursively(
    resolveInside(resolvedFixtureRoot, 'spritesheets'),
    'spritesheets',
  );
  const expectedPaths = provenance.files.map((file) => file.path);

  for (const expectedPath of expectedPaths) {
    if (!actualPaths.includes(expectedPath)) {
      throw new Error(`Missing fixture file: ${expectedPath}`);
    }
  }

  const expectedSet = new Set(expectedPaths);
  for (const actualPath of actualPaths) {
    if (!expectedSet.has(actualPath)) {
      throw new Error(`Unexpected fixture file: ${actualPath}`);
    }
  }

  for (const file of provenance.files) {
    const actualPath = resolveInside(resolvedFixtureRoot, file.path);
    const actualSha = hashFile(actualPath);
    if (actualSha !== file.sha256) {
      throw new Error(
        `SHA-256 mismatch for ${file.path}: expected ${file.sha256}, actual ${actualSha}`,
      );
    }
  }
}
