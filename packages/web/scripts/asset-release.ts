import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

function errorDetail(error: unknown): string {
  return error instanceof Error ? `: ${error.message}` : '';
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

function parseManifestFileListEntry(value: unknown): readonly [
  string,
  AssetManifestFile,
] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('asset manifest file list entry must be an object');
  }

  const record = value as Record<string, unknown>;
  if (typeof record.path !== 'string' || record.path.length === 0) {
    throw new Error('asset manifest file list entry has invalid path');
  }

  return [
    record.path,
    parseManifestFile(record.path, {
      size: record.sizeBytes,
      sha256: record.sha256,
    }),
  ];
}

function parseManifestFiles(value: unknown): Record<string, AssetManifestFile> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map(parseManifestFileListEntry));
  }

  if (typeof value !== 'object' || value === null) {
    throw new Error('asset manifest must contain a files object or array');
  }

  return Object.fromEntries(
    Object.entries(value).map(([pathName, entry]) => [
      pathName,
      parseManifestFile(pathName, entry),
    ]),
  );
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

export async function downloadBuffer(url: string): Promise<Buffer> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Failed to download ${url}${errorDetail(error)}. Rerun prepare-assets to retry.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: HTTP ${response.status} ${response.statusText}. Rerun prepare-assets to retry.`,
    );
  }

  try {
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(
      `Failed to download ${url}${errorDetail(error)}. Rerun prepare-assets to retry.`,
    );
  }
}

function validateTarEntries(tarPath: string, targetDir: string): void {
  let listing: string;
  try {
    listing = execFileSync('tar', ['-tzf', tarPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`Failed to list asset tarball${errorDetail(error)}`);
  }

  for (const entry of listing.split('\n')) {
    if (entry.length > 0) {
      ensureInsideDirectory(targetDir, entry);
    }
  }
}

export function extractTarGz(tarball: Buffer, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(tmpdir(), 'lpc-asset-tarball-'));
  const tarPath = path.join(tempDir, 'assets.tar.gz');

  try {
    writeFileSync(tarPath, tarball);
    validateTarEntries(tarPath, targetDir);
    try {
      execFileSync('tar', ['-xzf', tarPath, '-C', targetDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error(
        `Failed to extract asset tarball into ${targetDir}${errorDetail(error)}`,
      );
    }
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
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

  const files = parseManifestFiles(record.files);

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

export function loadMaterializedManifest(
  repoRoot: string,
  config: ReleaseConfig,
): AssetManifest {
  return parseAssetManifest(
    readFileSync(path.join(repoRoot, 'assets/asset-manifest.json'), 'utf8'),
    config,
  );
}

export function verifyUpstreamParity({
  config,
  manifest,
  upstreamHead,
}: {
  readonly config: ReleaseConfig;
  readonly manifest: AssetManifest;
  readonly upstreamHead: string;
}): void {
  if (manifest.sourceSha !== config.sourceSha) {
    throw new Error(
      `Parity baseline mismatch: manifest sourceSha ${manifest.sourceSha} does not match config sourceSha ${config.sourceSha}`,
    );
  }

  if (upstreamHead !== config.sourceSha) {
    throw new Error(
      `Parity baseline mismatch: upstream HEAD ${upstreamHead} does not match config sourceSha ${config.sourceSha}`,
    );
  }
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
  if (pathName === 'asset-manifest.json') {
    return path.join(repoRoot, 'assets/asset-manifest.json');
  }

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

function manifestsMatch(
  left: AssetManifest,
  right: AssetManifest,
): boolean {
  const leftEntries = Object.entries(left.files).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const rightEntries = Object.entries(right.files).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (
    left.sourceSha !== right.sourceSha ||
    leftEntries.length !== rightEntries.length
  ) {
    return false;
  }

  return leftEntries.every(([pathName, file], index) => {
    const rightEntry = rightEntries[index];

    return (
      rightEntry !== undefined &&
      pathName === rightEntry[0] &&
      file.size === rightEntry[1].size &&
      file.sha256 === rightEntry[1].sha256
    );
  });
}

function cacheIsValid(
  repoRoot: string,
  config: ReleaseConfig,
  manifest: AssetManifest,
): boolean {
  if (
    !existsSync(path.join(repoRoot, 'assets/asset-manifest.json')) ||
    !existsSync(path.join(repoRoot, 'assets/sheet_definitions')) ||
    !existsSync(path.join(repoRoot, 'assets/palette_definitions'))
  ) {
    return false;
  }

  try {
    if (!manifestsMatch(loadMaterializedManifest(repoRoot, config), manifest)) {
      return false;
    }
  } catch {
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

function writeMaterializedManifest(
  repoRoot: string,
  manifestJson: string,
): void {
  const targetPath = materializedPath(repoRoot, 'asset-manifest.json');
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, manifestJson);
}

function readExtractedTarEntry(extractDir: string, pathName: string): Buffer {
  const candidates = [
    pathName,
    ...readdirSync(extractDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(entry.name, pathName)),
  ];

  for (const candidate of candidates) {
    const targetPath = ensureInsideDirectory(extractDir, candidate);
    if (existsSync(targetPath)) {
      return readFileSync(targetPath);
    }
  }

  throw new Error(`asset tarball missing required entry: ${pathName}`);
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
  let manifestJson = manifest ? JSON.stringify(manifest) : undefined;

  if (manifest && manifest.sourceSha !== options.config.sourceSha) {
    throw new Error(
      `asset manifest sourceSha mismatch: expected ${options.config.sourceSha}, actual ${manifest.sourceSha}`,
    );
  }

  if (manifest && cacheIsValid(options.repoRoot, options.config, manifest)) {
    return { status: 'cache-hit' };
  }

  if (!manifest) {
    const manifestBuffer = await options.download(options.config.manifestUrl);
    verifyHash('manifest', manifestBuffer, options.config.manifestSha256);
    manifestJson = manifestBuffer.toString('utf8');
    manifest = parseAssetManifest(manifestJson, options.config);
  }

  if (cacheIsValid(options.repoRoot, options.config, manifest)) {
    return { status: 'cache-hit' };
  }

  if (!manifestJson) {
    throw new Error('asset manifest JSON was not available for materialization');
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
    readTarEntry = async (pathName) =>
      readExtractedTarEntry(extractedDir, pathName);
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

    writeMaterializedManifest(options.repoRoot, manifestJson);
  } finally {
    if (tempExtractDir) {
      rmSync(tempExtractDir, { force: true, recursive: true });
    }
  }

  return { status: 'refreshed' };
}
