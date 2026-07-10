import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import {
  releaseCachePath,
  type AssetReleaseConfig,
} from './asset-release.js';

export interface AssetCacheLayout {
  readonly releaseRoot: string;
  readonly zipsRoot: string;
  readonly sheetDefinitionsRoot: string;
  readonly paletteDefinitionsRoot: string;
  readonly creditsPath: string;
  readonly manifestPath: string;
  readonly spriteIndexPath: string;
  readonly metadataIndexPath: string;
}

export type AssetCacheStatus = 'cache-hit' | 'prepared';
export type AssetCacheProgressPhase =
  | 'manifest-download'
  | 'tarball-download'
  | 'verify'
  | 'extract'
  | 'ready';

export interface AssetCacheProgress {
  readonly phase: AssetCacheProgressPhase;
  readonly releaseTag: string;
  readonly message: string;
}

export type AssetCacheErrorCode =
  | 'asset_download_failed'
  | 'asset_integrity_failed'
  | 'asset_archive_unsafe'
  | 'asset_attribution_missing'
  | 'asset_cache_failed';

export class AssetCacheError extends Error {
  constructor(
    readonly code: AssetCacheErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'AssetCacheError';
  }
}

export interface EnsureAssetCacheOptions {
  readonly config: AssetReleaseConfig;
  readonly cacheRoot: string;
  readonly download?: (url: string) => Promise<Buffer>;
  readonly readTarEntry?: (entryName: string) => Promise<Buffer>;
  readonly onProgress?: (progress: AssetCacheProgress) => void;
}

interface AssetManifestEntry {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface AssetManifest {
  readonly sourceSha: string;
  readonly files: readonly AssetManifestEntry[];
}

interface MetadataIndexEntry {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface MetadataIndex {
  readonly files: readonly MetadataIndexEntry[];
}

export interface AssetCacheIssue {
  readonly code: AssetCacheErrorCode;
  readonly message: string;
  readonly path?: string;
}

function createLayout(releaseRoot: string): AssetCacheLayout {
  return {
    releaseRoot,
    zipsRoot: path.join(releaseRoot, 'zips'),
    sheetDefinitionsRoot: path.join(releaseRoot, 'sheet_definitions'),
    paletteDefinitionsRoot: path.join(releaseRoot, 'palette_definitions'),
    creditsPath: path.join(releaseRoot, 'CREDITS.csv'),
    manifestPath: path.join(releaseRoot, 'asset-manifest.json'),
    spriteIndexPath: path.join(releaseRoot, 'sprite-index.json'),
    metadataIndexPath: path.join(releaseRoot, 'metadata-index.json'),
  };
}

function createAssetCacheLayout(
  cacheRoot: string,
  releaseTag: string,
): AssetCacheLayout {
  return createLayout(releaseCachePath(cacheRoot, releaseTag));
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function ensureInsideDirectory(root: string, pathName: string): string {
  const components = pathName.split('/');
  if (
    pathName.length === 0 ||
    pathName.includes('\0') ||
    pathName.includes('\\') ||
    components.includes('.') ||
    components.includes('..') ||
    path.posix.isAbsolute(pathName) ||
    path.win32.isAbsolute(pathName)
  ) {
    throw new AssetCacheError(
      'asset_archive_unsafe',
      `Unsafe archive entry: ${pathName}`,
      pathName,
    );
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, pathName);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AssetCacheError(
      'asset_archive_unsafe',
      `Archive entry escapes the cache directory: ${pathName}`,
      pathName,
    );
  }
  return resolved;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function parseAssetManifest(
  manifestBuffer: Buffer,
  config: AssetReleaseConfig,
): AssetManifest {
  let value: unknown;
  try {
    value = JSON.parse(manifestBuffer.toString('utf8')) as unknown;
  } catch {
    throw new AssetCacheError(
      'asset_integrity_failed',
      'Asset manifest is not valid JSON.',
    );
  }
  const record = requireObject(value, 'Asset manifest');
  if (record.sourceSha !== config.sourceSha) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Asset manifest sourceSha mismatch: expected ${config.sourceSha}, actual ${String(record.sourceSha)}.`,
    );
  }
  if (!Array.isArray(record.files)) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      'Asset manifest files must be an array.',
    );
  }

  const seenDestinations = new Set<string>();
  const files = record.files.map((entry, index): AssetManifestEntry => {
    const file = requireObject(entry, `Asset manifest file ${index}`);
    if (typeof file.path !== 'string' || file.path.length === 0) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Asset manifest file ${index} has an invalid path.`,
      );
    }
    const normalizedDestination = path.resolve('asset-root', file.path);
    if (seenDestinations.has(normalizedDestination)) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Asset manifest contains duplicate destination: ${file.path}.`,
        file.path,
      );
    }
    seenDestinations.add(normalizedDestination);
    ensureInsideDirectory('asset-root', file.path);
    if (
      typeof file.sizeBytes !== 'number' ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 0
    ) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Asset manifest entry has invalid size: ${file.path}.`,
        file.path,
      );
    }
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Asset manifest entry has invalid SHA-256: ${file.path}.`,
        file.path,
      );
    }
    return {
      path: file.path,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    };
  });

  return { sourceSha: config.sourceSha, files };
}

function verifyBuffer(
  buffer: Buffer,
  expectedSize: number,
  expectedSha256: string,
  pathName: string,
): void {
  if (buffer.byteLength !== expectedSize || hashBuffer(buffer) !== expectedSha256) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Asset integrity check failed: ${pathName}.`,
      pathName,
    );
  }
}

function progress(
  options: EnsureAssetCacheOptions,
  phase: AssetCacheProgressPhase,
  message: string,
): void {
  options.onProgress?.({ phase, releaseTag: options.config.tag, message });
}

async function defaultDownload(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadAsset(
  options: EnsureAssetCacheOptions,
  url: string,
): Promise<Buffer> {
  try {
    return await (options.download ?? defaultDownload)(url);
  } catch (error) {
    throw new AssetCacheError(
      'asset_download_failed',
      `Failed to download ${url}: ${errorMessage(error)}`,
      url,
    );
  }
}

async function downloadAndVerifyManifest(
  options: EnsureAssetCacheOptions,
): Promise<Buffer> {
  progress(options, 'manifest-download', 'Downloading asset manifest.');
  const buffer = await downloadAsset(options, options.config.manifestUrl);
  progress(options, 'verify', 'Verifying asset manifest.');
  if (hashBuffer(buffer) !== options.config.manifestSha256) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      'Asset manifest SHA-256 mismatch.',
      options.config.manifestUrl,
    );
  }
  return buffer;
}

async function downloadAndVerifyTarball(
  options: EnsureAssetCacheOptions,
): Promise<Buffer> {
  progress(options, 'tarball-download', 'Downloading asset tarball.');
  const buffer = await downloadAsset(options, options.config.tarballUrl);
  progress(options, 'verify', 'Verifying asset tarball.');
  if (hashBuffer(buffer) !== options.config.tarballSha256) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      'Asset tarball SHA-256 mismatch.',
      options.config.tarballUrl,
    );
  }
  return buffer;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingExecutable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}

function createSafeTarReader(
  tarball: Buffer,
  stagingRoot: string,
): (entryName: string) => Promise<Buffer> {
  const extractRoot = path.join(stagingRoot, '.tar-extract');
  mkdirSync(extractRoot);
  const tarballPath = path.join(extractRoot, 'assets.tar.gz');
  writeFileSync(tarballPath, tarball);
  try {
    const listing = execFileSync('tar', ['-tzf', tarballPath], {
      encoding: 'utf8',
    });
    for (const entryName of listing.split(/\r?\n/u).filter(Boolean)) {
      ensureInsideDirectory(extractRoot, entryName);
    }
    const verboseListing = execFileSync('tar', ['-tvzf', tarballPath], {
      encoding: 'utf8',
    });
    for (const line of verboseListing.split(/\r?\n/u).filter(Boolean)) {
      const entryType = line[0];
      if (entryType !== '-' && entryType !== 'd') {
        throw new AssetCacheError(
          'asset_archive_unsafe',
          `Asset archive contains an unsupported link or special entry: ${line}`,
        );
      }
    }
    execFileSync('tar', ['-xzf', tarballPath, '-C', extractRoot], {
      stdio: 'pipe',
    });
  } catch (error) {
    if (error instanceof AssetCacheError) {
      throw error;
    }
    if (isMissingExecutable(error)) {
      throw new AssetCacheError(
        'asset_cache_failed',
        'This supported platform requires the tar executable to prepare assets.',
      );
    }
    throw new AssetCacheError(
      'asset_cache_failed',
      `Failed to extract asset tarball: ${errorMessage(error)}`,
    );
  } finally {
    rmSync(tarballPath, { force: true });
  }

  return async (entryName) => readFileSync(ensureInsideDirectory(extractRoot, entryName));
}

function retainedEntries(manifest: AssetManifest): readonly AssetManifestEntry[] {
  return manifest.files.filter(
    (entry) => entry.path === 'CREDITS.csv' ||
      (entry.path.startsWith('zips/') && entry.path.endsWith('.zip')),
  );
}

async function materializeVerifiedEntries(
  layout: AssetCacheLayout,
  manifest: AssetManifest,
  readEntry: (entryName: string) => Promise<Buffer>,
): Promise<void> {
  const entries = retainedEntries(manifest);
  const creditsEntry = entries.find((entry) => entry.path === 'CREDITS.csv');
  if (creditsEntry === undefined) {
    throw new AssetCacheError(
      'asset_attribution_missing',
      'Asset release is missing required CREDITS.csv.',
      'CREDITS.csv',
    );
  }
  for (const required of [
    'zips/sheet_definitions.zip',
    'zips/palette_definitions.zip',
  ]) {
    if (!entries.some((entry) => entry.path === required)) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Asset release is missing required metadata ZIP: ${required}.`,
        required,
      );
    }
  }

  for (const entry of entries) {
    let buffer: Buffer;
    try {
      buffer = await readEntry(entry.path);
    } catch (error) {
      if (error instanceof AssetCacheError) {
        throw error;
      }
      throw new AssetCacheError(
        'asset_cache_failed',
        `Failed to read archive entry ${entry.path}: ${errorMessage(error)}`,
        entry.path,
      );
    }
    verifyBuffer(buffer, entry.sizeBytes, entry.sha256, entry.path);
    const destination = ensureInsideDirectory(layout.releaseRoot, entry.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, buffer);
  }
}

async function expandZip(
  zipPath: string,
  destinationRoot: string,
): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(readFileSync(zipPath));
  } catch (error) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Invalid metadata ZIP ${zipPath}: ${errorMessage(error)}`,
      zipPath,
    );
  }
  mkdirSync(destinationRoot, { recursive: true });
  for (const entry of Object.values(zip.files)) {
    const originalName = entry.unsafeOriginalName ?? entry.name;
    const destination = ensureInsideDirectory(destinationRoot, originalName);
    if (entry.dir) {
      mkdirSync(destination, { recursive: true });
      continue;
    }
    const contents = await entry.async('nodebuffer');
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
}

async function expandMetadataZips(layout: AssetCacheLayout): Promise<void> {
  await expandZip(
    path.join(layout.zipsRoot, 'sheet_definitions.zip'),
    layout.sheetDefinitionsRoot,
  );
  await expandZip(
    path.join(layout.zipsRoot, 'palette_definitions.zip'),
    layout.paletteDefinitionsRoot,
  );
}

interface ZipCentralEntry {
  readonly name: string;
  readonly flags: number;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

function zipCentralEntries(buffer: Buffer, zipPath: string): readonly ZipCentralEntry[] {
  const minimumEocdSize = 22;
  const searchStart = Math.max(0, buffer.byteLength - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.byteLength - minimumEocdSize; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Invalid ZIP central directory: ${zipPath}.`,
      zipPath,
    );
  }
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `ZIP64 sprite archives are not supported: ${zipPath}.`,
      zipPath,
    );
  }

  const entries: ZipCentralEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > buffer.byteLength || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Invalid ZIP entry directory: ${zipPath}.`,
        zipPath,
      );
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > buffer.byteLength) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Invalid ZIP entry length: ${zipPath}.`,
        zipPath,
      );
    }
    const encoding = (flags & 0x0800) === 0 ? 'latin1' : 'utf8';
    entries.push({
      name: buffer.toString(encoding, nameStart, nameStart + nameLength),
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nextOffset;
  }
  return entries;
}

function readZipEntry(
  buffer: Buffer,
  entry: ZipCentralEntry,
  zipPath: string,
): Buffer {
  if ((entry.flags & 0x0001) !== 0) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Encrypted ZIP entries are not supported: ${zipPath}.`,
      zipPath,
    );
  }
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.byteLength || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Invalid ZIP local entry header: ${zipPath}.`,
      zipPath,
    );
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.byteLength) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Invalid ZIP compressed entry length: ${zipPath}.`,
      zipPath,
    );
  }
  const compressed = buffer.subarray(dataStart, dataEnd);
  let contents: Buffer;
  if (entry.compressionMethod === 0) {
    contents = Buffer.from(compressed);
  } else if (entry.compressionMethod === 8) {
    contents = inflateRawSync(compressed);
  } else {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `Unsupported ZIP compression method ${String(entry.compressionMethod)}: ${zipPath}.`,
      zipPath,
    );
  }
  if (contents.byteLength !== entry.uncompressedSize) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      `ZIP entry size mismatch: ${zipPath}.`,
      zipPath,
    );
  }
  return contents;
}

function manifestZipNames(manifest: AssetManifest): readonly string[] {
  return retainedEntries(manifest)
    .filter((entry) => /^zips\/[^/]+\.zip$/u.test(entry.path))
    .map((entry) => entry.path.slice('zips/'.length))
    .sort();
}

function cacheZipNames(layout: AssetCacheLayout): readonly string[] {
  const names: string[] = [];
  for (const entry of readdirSync(layout.zipsRoot, { withFileTypes: true })) {
    if (!entry.name.endsWith('.zip')) {
      continue;
    }
    if (!entry.isFile()) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Asset cache ZIP entry is not a regular file: ${entry.name}.`,
        `zips/${entry.name}`,
      );
    }
    names.push(entry.name);
  }
  return names.sort();
}

function expectedSpriteIndex(
  layout: AssetCacheLayout,
  manifest: AssetManifest,
): readonly string[] {
  const logicalPaths: string[] = [];
  for (const zipName of manifestZipNames(manifest)) {
    if (
      zipName === 'sheet_definitions.zip' ||
      zipName === 'palette_definitions.zip'
    ) {
      continue;
    }
    const category = zipName.slice(0, -'.zip'.length);
    const zipPath = path.join(layout.zipsRoot, zipName);
    for (const entry of zipCentralEntries(readFileSync(zipPath), zipPath)) {
      const entryName = entry.name;
      ensureInsideDirectory(layout.releaseRoot, entryName);
      if (!entryName.endsWith('/')) {
        logicalPaths.push(`spritesheets/${category}/${entryName}`);
      }
    }
  }
  logicalPaths.sort();
  return logicalPaths;
}

function writeSpriteIndex(layout: AssetCacheLayout, manifest: AssetManifest): void {
  writeFileSync(
    layout.spriteIndexPath,
    JSON.stringify(expectedSpriteIndex(layout, manifest), null, 2),
  );
}

function walkFiles(root: string): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };
  visit(root);
  return files.sort();
}

function metadataEntries(layout: AssetCacheLayout): readonly MetadataIndexEntry[] {
  const files = [
    ...walkFiles(layout.sheetDefinitionsRoot),
    ...walkFiles(layout.paletteDefinitionsRoot),
  ];
  return files
    .map((filePath) => {
      const buffer = readFileSync(filePath);
      return {
        path: path.relative(layout.releaseRoot, filePath).split(path.sep).join('/'),
        sizeBytes: buffer.byteLength,
        sha256: hashBuffer(buffer),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function expectedMetadataEntries(
  layout: AssetCacheLayout,
): readonly MetadataIndexEntry[] {
  const entries: MetadataIndexEntry[] = [];
  const seenDestinations = new Set<string>();
  for (const archive of [
    {
      zipName: 'sheet_definitions.zip',
      destinationName: 'sheet_definitions',
    },
    {
      zipName: 'palette_definitions.zip',
      destinationName: 'palette_definitions',
    },
  ]) {
    const zipPath = path.join(layout.zipsRoot, archive.zipName);
    const zipBuffer = readFileSync(zipPath);
    const destinationRoot = path.join(layout.releaseRoot, archive.destinationName);
    for (const entry of zipCentralEntries(zipBuffer, zipPath)) {
      if (entry.name.endsWith('/')) {
        continue;
      }
      const destination = ensureInsideDirectory(destinationRoot, entry.name);
      if (seenDestinations.has(destination)) {
        throw new AssetCacheError(
          'asset_integrity_failed',
          `Metadata ZIP contains duplicate destination: ${entry.name}.`,
          entry.name,
        );
      }
      seenDestinations.add(destination);
      const contents = readZipEntry(zipBuffer, entry, zipPath);
      entries.push({
        path: path.relative(layout.releaseRoot, destination).split(path.sep).join('/'),
        sizeBytes: contents.byteLength,
        sha256: hashBuffer(contents),
      });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function writeMetadataIndex(layout: AssetCacheLayout): void {
  const index: MetadataIndex = { files: expectedMetadataEntries(layout) };
  writeFileSync(layout.metadataIndexPath, JSON.stringify(index, null, 2));
}

function parseMetadataIndex(buffer: Buffer): MetadataIndex {
  const value = JSON.parse(buffer.toString('utf8')) as unknown;
  const record = requireObject(value, 'Metadata index');
  if (!Array.isArray(record.files)) {
    throw new AssetCacheError(
      'asset_integrity_failed',
      'Metadata index files must be an array.',
    );
  }
  const files = record.files.map((value, index): MetadataIndexEntry => {
    const entry = requireObject(value, `Metadata index file ${index}`);
    if (
      typeof entry.path !== 'string' ||
      typeof entry.sizeBytes !== 'number' ||
      !Number.isSafeInteger(entry.sizeBytes) ||
      entry.sizeBytes < 0 ||
      typeof entry.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        `Metadata index file ${index} is invalid.`,
      );
    }
    ensureInsideDirectory('asset-root', entry.path);
    return {
      path: entry.path,
      sizeBytes: entry.sizeBytes,
      sha256: entry.sha256,
    };
  });
  return { files };
}

function validFile(
  filePath: string,
  expectedSize: number,
  expectedSha256: string,
): boolean {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  const buffer = readFileSync(filePath);
  return buffer.byteLength === expectedSize && hashBuffer(buffer) === expectedSha256;
}

export function validateAssetCache(
  layout: AssetCacheLayout,
  config: AssetReleaseConfig,
): boolean {
  try {
    if (!validFile(layout.manifestPath, statSync(layout.manifestPath).size, config.manifestSha256)) {
      return false;
    }
    const manifest = parseAssetManifest(readFileSync(layout.manifestPath), config);
    const retained = retainedEntries(manifest);
    for (const entry of retained) {
      const filePath = ensureInsideDirectory(layout.releaseRoot, entry.path);
      if (!validFile(filePath, entry.sizeBytes, entry.sha256)) {
        return false;
      }
    }
    if (JSON.stringify(cacheZipNames(layout)) !== JSON.stringify(manifestZipNames(manifest))) {
      return false;
    }
    if (
      !manifest.files.some((entry) => entry.path === 'CREDITS.csv') ||
      !manifest.files.some((entry) => entry.path === 'zips/sheet_definitions.zip') ||
      !manifest.files.some((entry) => entry.path === 'zips/palette_definitions.zip') ||
      !existsSync(layout.spriteIndexPath) ||
      !statSync(layout.spriteIndexPath).isFile()
    ) {
      return false;
    }
    const spriteIndex = JSON.parse(readFileSync(layout.spriteIndexPath, 'utf8')) as unknown;
    if (!Array.isArray(spriteIndex) || !spriteIndex.every((entry) => typeof entry === 'string')) {
      return false;
    }
    if (JSON.stringify(spriteIndex) !== JSON.stringify(expectedSpriteIndex(layout, manifest))) {
      return false;
    }
    const metadataIndex = parseMetadataIndex(readFileSync(layout.metadataIndexPath));
    const expectedEntries = expectedMetadataEntries(layout);
    const actualEntries = metadataEntries(layout);
    if (
      JSON.stringify(metadataIndex.files) !== JSON.stringify(expectedEntries) ||
      JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)
    ) {
      return false;
    }
    return expectedEntries.every((entry) =>
      validFile(
        ensureInsideDirectory(layout.releaseRoot, entry.path),
        entry.sizeBytes,
        entry.sha256,
      ),
    );
  } catch {
    return false;
  }
}

function publishStagedCache(
  stagingLayout: AssetCacheLayout,
  finalLayout: AssetCacheLayout,
  config: AssetReleaseConfig,
): { readonly status: AssetCacheStatus; readonly layout: AssetCacheLayout } {
  let validCandidate: string | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (validCandidate !== undefined) {
      try {
        renameSync(validCandidate, finalLayout.releaseRoot);
        return { status: 'cache-hit', layout: finalLayout };
      } catch (error) {
        if (validateAssetCache(finalLayout, config)) {
          rmSync(validCandidate, { recursive: true, force: true });
          return { status: 'cache-hit', layout: finalLayout };
        }
        if (errorCode(error) !== 'EEXIST' && errorCode(error) !== 'ENOTEMPTY') {
          throw new AssetCacheError(
            'asset_cache_failed',
            `Failed to restore a valid asset cache: ${errorMessage(error)}`,
            finalLayout.releaseRoot,
          );
        }
      }
    }

    if (existsSync(finalLayout.releaseRoot)) {
      if (validateAssetCache(finalLayout, config)) {
        if (validCandidate !== undefined) {
          rmSync(validCandidate, { recursive: true, force: true });
        }
        return { status: 'cache-hit', layout: finalLayout };
      }
      const quarantineRoot = `${finalLayout.releaseRoot}.quarantine-${process.pid}-${randomUUID()}`;
      try {
        renameSync(finalLayout.releaseRoot, quarantineRoot);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') {
          continue;
        }
        throw new AssetCacheError(
          'asset_cache_failed',
          `Failed to quarantine an invalid asset cache: ${errorMessage(error)}`,
          finalLayout.releaseRoot,
        );
      }
      if (validateAssetCache(createLayout(quarantineRoot), config)) {
        if (validCandidate === undefined) {
          validCandidate = quarantineRoot;
        } else {
          rmSync(quarantineRoot, { recursive: true, force: true });
        }
      } else {
        rmSync(quarantineRoot, { recursive: true, force: true });
      }
      continue;
    }

    if (validCandidate !== undefined) {
      continue;
    }
    try {
      renameSync(stagingLayout.releaseRoot, finalLayout.releaseRoot);
      return { status: 'prepared', layout: finalLayout };
    } catch (error) {
      if (
        errorCode(error) === 'EEXIST' ||
        errorCode(error) === 'ENOTEMPTY' ||
        errorCode(error) === 'ENOENT'
      ) {
        continue;
      }
      throw new AssetCacheError(
        'asset_cache_failed',
        `Failed to publish asset cache: ${errorMessage(error)}`,
        finalLayout.releaseRoot,
      );
    }
  }
  throw new AssetCacheError(
    'asset_cache_failed',
    'Asset cache publication did not converge.',
    finalLayout.releaseRoot,
  );
}

export async function ensureAssetCache(
  options: EnsureAssetCacheOptions,
): Promise<{ readonly status: AssetCacheStatus; readonly layout: AssetCacheLayout }> {
  const finalLayout = createAssetCacheLayout(options.cacheRoot, options.config.tag);
  if (validateAssetCache(finalLayout, options.config)) {
    return { status: 'cache-hit', layout: finalLayout };
  }

  let stagingRoot: string;
  try {
    mkdirSync(options.cacheRoot, { recursive: true });
    stagingRoot = mkdtempSync(path.join(options.cacheRoot, `.${options.config.tag}-`));
  } catch (error) {
    throw new AssetCacheError(
      'asset_cache_failed',
      `Failed to create asset cache staging directory: ${errorMessage(error)}`,
      options.cacheRoot,
    );
  }
  const stagingLayout = createLayout(stagingRoot);
  try {
    const manifestBuffer = await downloadAndVerifyManifest(options);
    const manifest = parseAssetManifest(manifestBuffer, options.config);
    const tarball = await downloadAndVerifyTarball(options);
    progress(options, 'extract', 'Extracting verified asset entries.');
    const readEntry = options.readTarEntry ?? createSafeTarReader(tarball, stagingRoot);
    await materializeVerifiedEntries(stagingLayout, manifest, readEntry);
    rmSync(path.join(stagingRoot, '.tar-extract'), {
      recursive: true,
      force: true,
    });
    await expandMetadataZips(stagingLayout);
    writeSpriteIndex(stagingLayout, manifest);
    writeMetadataIndex(stagingLayout);
    writeFileSync(stagingLayout.manifestPath, manifestBuffer);
    if (!validateAssetCache(stagingLayout, options.config)) {
      throw new AssetCacheError(
        'asset_integrity_failed',
        'Prepared asset cache failed validation.',
      );
    }
    const result = publishStagedCache(stagingLayout, finalLayout, options.config);
    progress(options, 'ready', 'Asset cache is ready.');
    return result;
  } catch (error) {
    if (error instanceof AssetCacheError) {
      throw error;
    }
    throw new AssetCacheError(
      'asset_cache_failed',
      `Failed to prepare asset cache: ${errorMessage(error)}`,
    );
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

export function assetCacheErrorIssue(error: unknown): AssetCacheIssue {
  if (error instanceof AssetCacheError) {
    return error.path === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, path: error.path };
  }
  return { code: 'asset_cache_failed', message: errorMessage(error) };
}
