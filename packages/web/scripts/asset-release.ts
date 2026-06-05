import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

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

export type PrepareStatus = 'cache-hit' | 'refreshed';

export type AssetDownload = (url: string) => Promise<Buffer>;

export type ReadTarEntry = (pathName: string) => Promise<Buffer>;

export interface PrepareOptions {
  readonly repoRoot: string;
  readonly config: ReleaseConfig;
  readonly manifest?: AssetManifest;
  readonly tarball?: Buffer;
  readonly download: AssetDownload;
  readonly readTarEntry?: ReadTarEntry;
  readonly extractTarball: (
    tarball: Buffer,
    targetDir: string,
  ) => Promise<void> | void;
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

export function expectedMaterializedFiles(
  manifest: AssetManifest,
): readonly string[] {
  const runtimeZips = Object.keys(manifest.files)
    .filter(
      (pathName) =>
        pathName.startsWith('zips/') &&
        pathName.endsWith('.zip') &&
        pathName !== 'zips/sheet_definitions.zip' &&
        pathName !== 'zips/palette_definitions.zip',
    )
    .sort();

  return ['CREDITS.csv', ...runtimeZips];
}

function materializedPath(repoRoot: string, pathName: string): string {
  if (pathName === 'CREDITS.csv') {
    return path.join(repoRoot, 'assets/CREDITS.csv');
  }

  if (pathName.startsWith('zips/')) {
    return ensureInsideDirectory(
      path.join(repoRoot, 'packages/web/public/zips'),
      pathName.slice('zips/'.length),
    );
  }

  return path.join(repoRoot, pathName);
}

function cacheIsValid(repoRoot: string, manifest: AssetManifest): boolean {
  if (
    !existsSync(path.join(repoRoot, 'assets/sheet_definitions')) ||
    !existsSync(path.join(repoRoot, 'assets/palette_definitions'))
  ) {
    return false;
  }

  for (const pathName of expectedMaterializedFiles(manifest)) {
    const file = manifest.files[pathName];
    const targetPath = materializedPath(repoRoot, pathName);

    if (!file || !existsSync(targetPath) || hashFile(targetPath) !== file.sha256) {
      return false;
    }
  }

  return true;
}

function ensureInsideDirectory(targetDir: string, entryName: string): string {
  const resolvedTargetDir = path.resolve(targetDir);
  const resolvedEntryPath = path.resolve(resolvedTargetDir, entryName);

  if (
    resolvedEntryPath !== resolvedTargetDir &&
    !resolvedEntryPath.startsWith(`${resolvedTargetDir}${path.sep}`)
  ) {
    throw new Error(`metadata zip entry escapes target directory: ${entryName}`);
  }

  return resolvedEntryPath;
}

async function expandMetadataZip(buffer: Buffer, targetDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);

  for (const entry of entries) {
    ensureInsideDirectory(targetDir, entry.name);
  }

  rmSync(targetDir, { force: true, recursive: true });
  mkdirSync(targetDir, { recursive: true });

  for (const entry of entries) {
    if (entry.dir) {
      continue;
    }

    const targetPath = ensureInsideDirectory(targetDir, entry.name);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, Buffer.from(await entry.async('nodebuffer')));
  }
}

function writeVerifiedFile(
  repoRoot: string,
  manifest: AssetManifest,
  pathName: string,
  buffer: Buffer,
): void {
  verifyManifestFile(manifest, pathName, buffer);

  const targetPath = materializedPath(repoRoot, pathName);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, buffer);
}

function verifyManifestFile(
  manifest: AssetManifest,
  pathName: string,
  buffer: Buffer,
): void {
  const file = manifest.files[pathName];

  if (!file) {
    throw new Error(`asset manifest missing entry: ${pathName}`);
  }

  verifyHash(pathName, buffer, file.sha256);
}

export async function prepareAssetSnapshot(
  options: PrepareOptions,
): Promise<{ readonly status: PrepareStatus }> {
  let manifest = options.manifest;

  if (manifest && manifest.sourceSha !== options.config.sourceSha) {
    throw new Error(
      `asset manifest sourceSha mismatch: expected ${options.config.sourceSha}, actual ${manifest.sourceSha}`,
    );
  }

  if (manifest && cacheIsValid(options.repoRoot, manifest)) {
    return { status: 'cache-hit' };
  }

  if (!manifest) {
    const manifestBuffer = await options.download(options.config.manifestUrl);
    verifyHash('manifest', manifestBuffer, options.config.manifestSha256);
    manifest = parseAssetManifest(manifestBuffer.toString('utf8'), options.config);
  }

  if (cacheIsValid(options.repoRoot, manifest)) {
    return { status: 'cache-hit' };
  }

  let tarball = options.tarball;

  if (!tarball) {
    tarball = await options.download(options.config.tarballUrl);
  }
  verifyHash('tarball', tarball, options.config.tarballSha256);

  let tempExtractDir: string | undefined;
  let readTarEntry = options.readTarEntry;

  if (!readTarEntry) {
    tempExtractDir = mkdtempSync(path.join(tmpdir(), 'lpc-asset-release-'));
    await options.extractTarball(tarball, tempExtractDir);
    const extractedDir = tempExtractDir;
    readTarEntry = async (pathName) => {
      const targetPath = ensureInsideDirectory(extractedDir, pathName);
      return readFileSync(targetPath);
    };
  }

  try {
    writeVerifiedFile(
      options.repoRoot,
      manifest,
      'CREDITS.csv',
      await readTarEntry('CREDITS.csv'),
    );

    const sheetDefinitions = await readTarEntry('zips/sheet_definitions.zip');
    verifyManifestFile(
      manifest,
      'zips/sheet_definitions.zip',
      sheetDefinitions,
    );
    await expandMetadataZip(
      sheetDefinitions,
      path.join(options.repoRoot, 'assets/sheet_definitions'),
    );

    const paletteDefinitions = await readTarEntry('zips/palette_definitions.zip');
    verifyManifestFile(
      manifest,
      'zips/palette_definitions.zip',
      paletteDefinitions,
    );
    await expandMetadataZip(
      paletteDefinitions,
      path.join(options.repoRoot, 'assets/palette_definitions'),
    );

    for (const pathName of expectedMaterializedFiles(manifest)) {
      if (pathName === 'CREDITS.csv') {
        continue;
      }

      writeVerifiedFile(
        options.repoRoot,
        manifest,
        pathName,
        await readTarEntry(pathName),
      );
    }
  } finally {
    if (tempExtractDir) {
      rmSync(tempExtractDir, { force: true, recursive: true });
    }
  }

  return { status: 'refreshed' };
}
