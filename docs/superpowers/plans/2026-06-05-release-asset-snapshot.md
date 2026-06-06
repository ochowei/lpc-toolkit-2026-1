# Release Asset Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tracked LPC runtime assets with a verified, pinned GitHub release snapshot that materializes ignored local assets for builds, tests, and parity checks.

**Architecture:** Keep `packages/core` environment-agnostic and put all filesystem, network, ZIP, and tar extraction logic in `packages/web/scripts`. The checked-in `asset-release.json` pins the release, while `prepare-assets.ts` verifies existing generated files before downloading, and `verify-upstream-parity.ts` checks the read-only `upstream/` submodule only for parity runs.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `jszip` dependency, Node built-ins (`node:fs`, `node:crypto`, `node:child_process`, `node:os`, `node:path`).

---

## File Structure

- Create `asset-release.json`: checked-in release pin with tag, URLs, hashes, source repo, and source SHA.
- Create `packages/web/scripts/asset-release.ts`: testable helper library for config loading, SHA-256 verification, manifest validation, cache checks, tar extraction, ZIP expansion, and upstream parity validation. This file is script-only and may use Node APIs.
- Create `packages/web/scripts/prepare-assets.ts`: CLI entrypoint that calls the helper with repo-root paths and exits nonzero on verification failure.
- Create `packages/web/scripts/verify-upstream-parity.ts`: CLI entrypoint that validates `asset-release.json`, materialized `asset-manifest.json`, and `git -C upstream rev-parse HEAD`.
- Create `packages/web/test/asset-release.test.ts`: focused Vitest coverage for validation, cache hit, download trigger, hash failures, metadata extraction, CREDITS failure, and parity mismatch.
- Modify `packages/web/package.json`: wire `prepare-assets` into lifecycle scripts and remove build/test reliance on `copy-spritesheets.ts` and `zip-assets.ts`.
- Modify `packages/web/test/package-scripts.test.ts`: lock the new lifecycle scripts.
- Modify `packages/web/test/integration.test.ts`: update real-asset checks to read generated release metadata and ZIP assets instead of `public/spritesheets`.
- Modify `.gitignore`: ignore generated `assets/` in addition to existing generated public asset directories.
- Git index cleanup only: run `git rm --cached -r assets packages/web/public/zips packages/web/public/spritesheets` if tracked files exist. Do not delete local files and do not touch `upstream/`.

## Assumptions

- No new dependency is needed. `jszip` is already present in `@lpc-toolkit/web` and is MIT licensed.
- The release URLs can use the GitHub release download form:
  `https://github.com/ochowei/Universal-LPC-Spritesheet-Character-Generator/releases/download/assets-v2026.06.05-initial/asset-manifest.json`
  and
  `https://github.com/ochowei/Universal-LPC-Spritesheet-Character-Generator/releases/download/assets-v2026.06.05-initial/assets-v2026.06.05-initial.tar.gz`.
- `tar` is available in local development and CI. The script verifies hashes before and after extraction, so `tar` is used only as an extractor, not as a trust boundary.

---

### Task 1: Add Pinned Release Config

**Files:**
- Create: `asset-release.json`
- Test: `packages/web/test/asset-release.test.ts`

- [ ] **Step 1: Write the failing config-load test**

Add this initial test file:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadReleaseConfig } from '../scripts/asset-release';

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'lpc-assets-'));
}

function testRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

describe('asset release config', () => {
  it('loads the pinned release config with the approved source SHA', () => {
    const root = tempDir();
    writeFileSync(
      path.join(root, 'asset-release.json'),
      JSON.stringify({
        tag: 'assets-v2026.06.05-initial',
        sourceRepository: 'ochowei/Universal-LPC-Spritesheet-Character-Generator',
        sourceSha: '212abfd21493e9957bd556250ac538fa40fe1fc9',
        manifestUrl: 'https://example.invalid/asset-manifest.json',
        manifestSha256: '1cce0f4a5fd9b7ac72ae732f04bda39cf9096518ad067ad6009757fe83b9e72c',
        tarballUrl: 'https://example.invalid/assets.tar.gz',
        tarballSha256: 'dd603191c7185323013153b9b35f8d9b4987637d15d7e3195b9d320d9fbac6e7',
      }),
    );

    expect(loadReleaseConfig(root).sourceSha).toBe(
      '212abfd21493e9957bd556250ac538fa40fe1fc9',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: FAIL because `../scripts/asset-release` does not exist.

- [ ] **Step 3: Add the pinned config**

Create `asset-release.json`:

```json
{
  "tag": "assets-v2026.06.05-initial",
  "sourceRepository": "ochowei/Universal-LPC-Spritesheet-Character-Generator",
  "sourceSha": "212abfd21493e9957bd556250ac538fa40fe1fc9",
  "manifestUrl": "https://github.com/ochowei/Universal-LPC-Spritesheet-Character-Generator/releases/download/assets-v2026.06.05-initial/asset-manifest.json",
  "manifestSha256": "1cce0f4a5fd9b7ac72ae732f04bda39cf9096518ad067ad6009757fe83b9e72c",
  "tarballUrl": "https://github.com/ochowei/Universal-LPC-Spritesheet-Character-Generator/releases/download/assets-v2026.06.05-initial/assets-v2026.06.05-initial.tar.gz",
  "tarballSha256": "dd603191c7185323013153b9b35f8d9b4987637d15d7e3195b9d320d9fbac6e7"
}
```

- [ ] **Step 4: Add minimal config loader**

Create `packages/web/scripts/asset-release.ts`:

```ts
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

function requireString(record: Record<string, unknown>, key: keyof ReleaseConfig): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`asset-release.json is missing required string field: ${key}`);
  }
  return value;
}

export function loadReleaseConfig(repoRoot: string): ReleaseConfig {
  const parsed = JSON.parse(
    readFileSync(path.join(repoRoot, 'asset-release.json'), 'utf8'),
  ) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('asset-release.json must contain an object');
  }
  const record = parsed as Record<string, unknown>;
  return {
    tag: requireString(record, 'tag'),
    sourceRepository: requireString(record, 'sourceRepository'),
    sourceSha: requireString(record, 'sourceSha'),
    manifestUrl: requireString(record, 'manifestUrl'),
    manifestSha256: requireString(record, 'manifestSha256'),
    tarballUrl: requireString(record, 'tarballUrl'),
    tarballSha256: requireString(record, 'tarballSha256'),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: PASS for the config-load test.

- [ ] **Step 6: Commit**

```bash
git add asset-release.json packages/web/scripts/asset-release.ts packages/web/test/asset-release.test.ts
git commit -m "feat: pin LPC asset release"
```

---

### Task 2: Implement Manifest Validation and Hash Helpers

**Files:**
- Modify: `packages/web/scripts/asset-release.ts`
- Modify: `packages/web/test/asset-release.test.ts`

- [ ] **Step 1: Add failing tests for hashes and manifest source**

Append these tests:

```ts
import { mkdirSync, readFileSync } from 'node:fs';
import {
  hashBuffer,
  hashFile,
  parseAssetManifest,
  verifyHash,
} from '../scripts/asset-release';

describe('asset hash verification', () => {
  it('computes SHA-256 for buffers and files', () => {
    const root = tempDir();
    const file = path.join(root, 'sample.txt');
    writeFileSync(file, 'hello');

    expect(hashBuffer(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(hashFile(file)).toBe(hashBuffer(readFileSync(file)));
  });

  it('reports expected and actual hashes on mismatch', () => {
    expect(() => verifyHash('manifest', Buffer.from('x'), 'bad')).toThrow(
      /manifest SHA-256 mismatch: expected bad, actual/,
    );
  });
});

describe('asset manifest validation', () => {
  it('requires the manifest sourceSha to match the pinned release', () => {
    const config = loadReleaseConfig(testRepoRoot());
    const manifest = {
      sourceSha: config.sourceSha,
      files: {
        'CREDITS.csv': {
          size: 7,
          sha256: hashBuffer(Buffer.from('credits')),
        },
      },
    };

    expect(parseAssetManifest(JSON.stringify(manifest), config).sourceSha).toBe(
      config.sourceSha,
    );
  });

  it('fails when manifest sourceSha differs from asset-release.json', () => {
    const config = loadReleaseConfig(testRepoRoot());
    expect(() =>
      parseAssetManifest(
        JSON.stringify({ sourceSha: 'different', files: {} }),
        config,
      ),
    ).toThrow(/asset manifest sourceSha mismatch/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: FAIL because hash and manifest functions are missing.

- [ ] **Step 3: Add strict manifest and hash helpers**

Extend `packages/web/scripts/asset-release.ts` with:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface AssetManifestFile {
  readonly size: number;
  readonly sha256: string;
}

export interface AssetManifest {
  readonly sourceSha: string;
  readonly files: Readonly<Record<string, AssetManifestFile>>;
}

export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hashFile(filePath: string): string {
  return hashBuffer(readFileSync(filePath));
}

export function verifyHash(label: string, buffer: Buffer, expected: string): void {
  const actual = hashBuffer(buffer);
  if (actual !== expected) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, actual ${actual}`);
  }
}

function parseManifestFile(pathName: string, value: unknown): AssetManifestFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`asset manifest entry must be an object: ${pathName}`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.size !== 'number' || !Number.isSafeInteger(record.size)) {
    throw new Error(`asset manifest entry has invalid size: ${pathName}`);
  }
  if (typeof record.sha256 !== 'string' || record.sha256.length !== 64) {
    throw new Error(`asset manifest entry has invalid sha256: ${pathName}`);
  }
  return { size: record.size, sha256: record.sha256 };
}

export function parseAssetManifest(json: string, config: ReleaseConfig): AssetManifest {
  const parsed = JSON.parse(json) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('asset manifest must contain an object');
  }
  const record = parsed as Record<string, unknown>;
  if (record.sourceSha !== config.sourceSha) {
    throw new Error(
      `asset manifest sourceSha mismatch: expected ${config.sourceSha}, actual ${String(record.sourceSha)}`,
    );
  }
  if (typeof record.files !== 'object' || record.files === null || Array.isArray(record.files)) {
    throw new Error('asset manifest must contain a files object');
  }
  const files = Object.fromEntries(
    Object.entries(record.files as Record<string, unknown>).map(([pathName, value]) => [
      pathName,
      parseManifestFile(pathName, value),
    ]),
  );
  if (!files['CREDITS.csv']) {
    throw new Error('CREDITS.csv is required for GPL and CC attribution compliance');
  }
  return { sourceSha: config.sourceSha, files };
}
```

Merge imports instead of duplicating `readFileSync`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/scripts/asset-release.ts packages/web/test/asset-release.test.ts
git commit -m "feat: validate asset release manifest"
```

---

### Task 3: Implement Cache Verification and Materialization

**Files:**
- Modify: `packages/web/scripts/asset-release.ts`
- Modify: `packages/web/test/asset-release.test.ts`

- [ ] **Step 1: Add failing cache-hit and missing-file tests**

Append:

```ts
import JSZip from 'jszip';
import { existsSync } from 'node:fs';
import {
  expectedMaterializedFiles,
  prepareAssetSnapshot,
  type AssetDownload,
} from '../scripts/asset-release';

async function metadataZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function tinySnapshot(sourceSha: string): Promise<{
  manifestJson: string;
  tarball: Buffer;
}> {
  const sheetZip = await metadataZip({ 'body/body.json': '{"name":"Body"}' });
  const paletteZip = await metadataZip({ 'body/body.json': '{"colors":[]}' });
  const runtimeZip = await metadataZip({ 'male/walk.png': 'png' });
  const credits = Buffer.from('file,authors,licenses\nbody,A,CC0\n');
  const files = {
    'CREDITS.csv': { size: credits.length, sha256: hashBuffer(credits) },
    'zips/body.zip': { size: runtimeZip.length, sha256: hashBuffer(runtimeZip) },
    'zips/sheet_definitions.zip': {
      size: sheetZip.length,
      sha256: hashBuffer(sheetZip),
    },
    'zips/palette_definitions.zip': {
      size: paletteZip.length,
      sha256: hashBuffer(paletteZip),
    },
  };
  const tarZip = new JSZip();
  tarZip.file('CREDITS.csv', credits);
  tarZip.file('zips/body.zip', runtimeZip);
  tarZip.file('zips/sheet_definitions.zip', sheetZip);
  tarZip.file('zips/palette_definitions.zip', paletteZip);
  const tarball = await tarZip.generateAsync({ type: 'nodebuffer' });
  return { manifestJson: JSON.stringify({ sourceSha, files }), tarball };
}

describe('asset snapshot preparation', () => {
  it('returns cache-hit without downloading when materialized files match', async () => {
    const root = tempDir();
    const config = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(config.sourceSha);
    const manifest = parseAssetManifest(snapshot.manifestJson, config);
    const download: AssetDownload = async () => {
      throw new Error('download should not be called');
    };
    const readTarEntry = async (entryPath: string): Promise<Buffer> => {
      const zip = await JSZip.loadAsync(snapshot.tarball);
      const file = zip.file(entryPath);
      if (!file) throw new Error(`missing test tar entry ${entryPath}`);
      return file.async('nodebuffer');
    };

    await prepareAssetSnapshot({
      repoRoot: root,
      config,
      manifest,
      tarball: snapshot.tarball,
      download,
      extractTarball: async () => undefined,
      readTarEntry,
    });

    const result = await prepareAssetSnapshot({
      repoRoot: root,
      config,
      manifest,
      tarball: snapshot.tarball,
      download,
      extractTarball: async () => undefined,
    });

    expect(result).toEqual({ status: 'cache-hit' });
  });

  it('downloads and materializes missing files', async () => {
    const root = tempDir();
    const config = loadReleaseConfig(testRepoRoot());
    const snapshot = await tinySnapshot(config.sourceSha);
    const manifest = parseAssetManifest(snapshot.manifestJson, config);
    const downloads: string[] = [];

    await prepareAssetSnapshot({
      repoRoot: root,
      config,
      manifest: undefined,
      tarball: undefined,
      download: async (url) => {
        downloads.push(url);
        return url === config.manifestUrl
          ? Buffer.from(snapshot.manifestJson)
          : snapshot.tarball;
      },
      extractTarball: async () => undefined,
      readTarEntry: async (entryPath) => {
        const zip = await JSZip.loadAsync(snapshot.tarball);
        const file = zip.file(entryPath);
        if (!file) throw new Error(`missing test tar entry ${entryPath}`);
        return file.async('nodebuffer');
      },
    });

    expect(downloads).toEqual([config.manifestUrl, config.tarballUrl]);
    expect(existsSync(path.join(root, 'assets/CREDITS.csv'))).toBe(true);
    expect(existsSync(path.join(root, 'assets/sheet_definitions/body/body.json'))).toBe(true);
    expect(existsSync(path.join(root, 'assets/palette_definitions/body/body.json'))).toBe(true);
    expect(existsSync(path.join(root, 'packages/web/public/zips/body.zip'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: FAIL because preparation functions are missing.

- [ ] **Step 3: Implement materialization helpers**

Add exports to `packages/web/scripts/asset-release.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

export type PrepareStatus = 'cache-hit' | 'refreshed';
export type AssetDownload = (url: string) => Promise<Buffer>;
export type ReadTarEntry = (entryPath: string) => Promise<Buffer>;

export interface PrepareOptions {
  readonly repoRoot: string;
  readonly config: ReleaseConfig;
  readonly manifest?: AssetManifest;
  readonly tarball?: Buffer;
  readonly download: AssetDownload;
  readonly extractTarball: (tarball: Buffer, targetDir: string) => Promise<void>;
  readonly readTarEntry?: ReadTarEntry;
}

export function expectedMaterializedFiles(manifest: AssetManifest): readonly string[] {
  return Object.keys(manifest.files).filter(
    (entry) =>
      entry === 'CREDITS.csv' ||
      (entry.startsWith('zips/') &&
        entry.endsWith('.zip') &&
        !entry.endsWith('/sheet_definitions.zip') &&
        !entry.endsWith('/palette_definitions.zip')),
  );
}

function materializedPath(repoRoot: string, manifestPath: string): string {
  if (manifestPath === 'CREDITS.csv') return path.join(repoRoot, 'assets/CREDITS.csv');
  if (manifestPath.startsWith('zips/')) {
    return path.join(repoRoot, 'packages/web/public', manifestPath);
  }
  return path.join(repoRoot, manifestPath);
}

function verifyMaterializedFile(repoRoot: string, manifest: AssetManifest, manifestPath: string): boolean {
  const expected = manifest.files[manifestPath];
  if (!expected) return false;
  const filePath = materializedPath(repoRoot, manifestPath);
  return existsSync(filePath) && hashFile(filePath) === expected.sha256;
}

function cacheIsValid(repoRoot: string, manifest: AssetManifest): boolean {
  return expectedMaterializedFiles(manifest).every((entry) =>
    verifyMaterializedFile(repoRoot, manifest, entry),
  );
}

async function expandMetadataZip(buffer: Buffer, targetDir: string): Promise<void> {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  const zip = await JSZip.loadAsync(buffer);
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const outPath = path.join(targetDir, name);
    if (!outPath.startsWith(targetDir + path.sep)) {
      throw new Error(`metadata ZIP extraction escaped target directory: ${name}`);
    }
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, await file.async('nodebuffer'));
  }
}

function writeVerifiedFile(repoRoot: string, manifest: AssetManifest, manifestPath: string, buffer: Buffer): void {
  const expected = manifest.files[manifestPath];
  if (!expected) throw new Error(`asset manifest missing required path: ${manifestPath}`);
  verifyHash(`extracted file ${manifestPath}`, buffer, expected.sha256);
  const outPath = materializedPath(repoRoot, manifestPath);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
}

export async function prepareAssetSnapshot(options: PrepareOptions): Promise<{ readonly status: PrepareStatus }> {
  let manifest = options.manifest;
  let tarball = options.tarball;
  if (manifest && cacheIsValid(options.repoRoot, manifest)) {
    return { status: 'cache-hit' };
  }
  if (!manifest) {
    const manifestBuffer = await options.download(options.config.manifestUrl);
    verifyHash('manifest', manifestBuffer, options.config.manifestSha256);
    manifest = parseAssetManifest(manifestBuffer.toString('utf8'), options.config);
  }
  if (cacheIsValid(options.repoRoot, manifest)) return { status: 'cache-hit' };
  if (!tarball) {
    tarball = await options.download(options.config.tarballUrl);
    verifyHash('tarball', tarball, options.config.tarballSha256);
  }

  if (!options.readTarEntry) {
    const extractDir = path.join(options.repoRoot, '.asset-release-tmp');
    rmSync(extractDir, { recursive: true, force: true });
    mkdirSync(extractDir, { recursive: true });
    await options.extractTarball(tarball, extractDir);
    options.readTarEntry = async (entryPath) => readFileSync(path.join(extractDir, entryPath));
  }

  writeVerifiedFile(options.repoRoot, manifest, 'CREDITS.csv', await options.readTarEntry('CREDITS.csv'));
  const sheetZip = await options.readTarEntry('zips/sheet_definitions.zip');
  verifyHash('extracted file zips/sheet_definitions.zip', sheetZip, manifest.files['zips/sheet_definitions.zip']?.sha256 ?? '');
  await expandMetadataZip(sheetZip, path.join(options.repoRoot, 'assets/sheet_definitions'));
  const paletteZip = await options.readTarEntry('zips/palette_definitions.zip');
  verifyHash('extracted file zips/palette_definitions.zip', paletteZip, manifest.files['zips/palette_definitions.zip']?.sha256 ?? '');
  await expandMetadataZip(paletteZip, path.join(options.repoRoot, 'assets/palette_definitions'));

  for (const entry of expectedMaterializedFiles(manifest)) {
    if (entry === 'CREDITS.csv') continue;
    writeVerifiedFile(options.repoRoot, manifest, entry, await options.readTarEntry(entry));
  }

  return { status: 'refreshed' };
}
```

While implementing, keep `PrepareOptions.readTarEntry` mutable by copying it to a local `let readTarEntry = options.readTarEntry;` instead of assigning to the readonly option property.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/scripts/asset-release.ts packages/web/test/asset-release.test.ts
git commit -m "feat: materialize verified asset snapshot"
```

---

### Task 4: Add Real Prepare and Parity CLI Scripts

**Files:**
- Create: `packages/web/scripts/prepare-assets.ts`
- Create: `packages/web/scripts/verify-upstream-parity.ts`
- Modify: `packages/web/scripts/asset-release.ts`
- Modify: `packages/web/test/asset-release.test.ts`

- [ ] **Step 1: Add failing parity tests**

Append:

```ts
import { verifyUpstreamParity } from '../scripts/asset-release';

describe('upstream parity verification', () => {
  it('passes when config, manifest, and upstream HEAD match', () => {
    const config = loadReleaseConfig(testRepoRoot());
    const manifest = parseAssetManifest(
      JSON.stringify({ sourceSha: config.sourceSha, files: { 'CREDITS.csv': { size: 0, sha256: hashBuffer(Buffer.from('')) } } }),
      config,
    );

    expect(
      verifyUpstreamParity({
        config,
        manifest,
        upstreamHead: config.sourceSha,
      }),
    ).toBeUndefined();
  });

  it('fails when upstream HEAD differs from the release source SHA', () => {
    const config = loadReleaseConfig(testRepoRoot());
    const manifest = parseAssetManifest(
      JSON.stringify({ sourceSha: config.sourceSha, files: { 'CREDITS.csv': { size: 0, sha256: hashBuffer(Buffer.from('')) } } }),
      config,
    );

    expect(() =>
      verifyUpstreamParity({
        config,
        manifest,
        upstreamHead: '0000000000000000000000000000000000000000',
      }),
    ).toThrow(/Parity baseline mismatch/);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: FAIL because `verifyUpstreamParity` is missing.

- [ ] **Step 3: Add real download, tar extraction, manifest loading, and parity helper**

Extend `packages/web/scripts/asset-release.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

export async function downloadBuffer(url: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Failed to download ${url}. Rerun prepare-assets. ${String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to download ${url}. HTTP ${response.status}. Rerun prepare-assets.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function extractTarGz(tarball: Buffer, targetDir: string): Promise<void> {
  mkdirSync(targetDir, { recursive: true });
  const tarPath = path.join(mkdtempSync(path.join(tmpdir(), 'lpc-tar-')), 'assets.tar.gz');
  writeFileSync(tarPath, tarball);
  execFileSync('tar', ['-xzf', tarPath, '-C', targetDir], { stdio: 'pipe' });
}

export function loadMaterializedManifest(repoRoot: string, config: ReleaseConfig): AssetManifest {
  const manifestPath = path.join(repoRoot, 'assets/asset-manifest.json');
  return parseAssetManifest(readFileSync(manifestPath, 'utf8'), config);
}

export interface UpstreamParityOptions {
  readonly config: ReleaseConfig;
  readonly manifest: AssetManifest;
  readonly upstreamHead: string;
}

export function verifyUpstreamParity(options: UpstreamParityOptions): void {
  if (options.manifest.sourceSha !== options.config.sourceSha) {
    throw new Error(
      `Parity baseline mismatch: asset-release.json expects ${options.config.sourceSha}, manifest has ${options.manifest.sourceSha}`,
    );
  }
  if (options.upstreamHead !== options.config.sourceSha) {
    throw new Error(
      `Parity baseline mismatch: expected release sourceSha ${options.config.sourceSha}, actual upstream HEAD ${options.upstreamHead}`,
    );
  }
}
```

Also write the verified manifest JSON to `assets/asset-manifest.json` during `prepareAssetSnapshot`, and include it in cache validation.

- [ ] **Step 4: Create `prepare-assets.ts`**

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadBuffer,
  extractTarGz,
  loadReleaseConfig,
  prepareAssetSnapshot,
} from './asset-release';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const config = loadReleaseConfig(repoRoot);

const result = await prepareAssetSnapshot({
  repoRoot,
  config,
  download: downloadBuffer,
  extractTarball: extractTarGz,
});

console.log(`[prepare-assets] ${result.status}`);
```

- [ ] **Step 5: Create `verify-upstream-parity.ts`**

```ts
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadMaterializedManifest,
  loadReleaseConfig,
  verifyUpstreamParity,
} from './asset-release';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const config = loadReleaseConfig(repoRoot);
const manifest = loadMaterializedManifest(repoRoot, config);

let upstreamHead: string;
try {
  upstreamHead = execFileSync('git', ['-C', path.join(repoRoot, 'upstream'), 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (error) {
  throw new Error(
    `Unable to read upstream HEAD. Ensure upstream/ is checked out at ${config.sourceSha}. ${String(error)}`,
  );
}

verifyUpstreamParity({ config, manifest, upstreamHead });
console.log(`[verify-upstream-parity] upstream HEAD matches ${config.sourceSha}`);
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @lpc-toolkit/web test -- asset-release.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/scripts/asset-release.ts packages/web/scripts/prepare-assets.ts packages/web/scripts/verify-upstream-parity.ts packages/web/test/asset-release.test.ts
git commit -m "feat: add asset preparation scripts"
```

---

### Task 5: Wire Package Scripts and Real-Asset Tests

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/test/package-scripts.test.ts`
- Modify: `packages/web/test/integration.test.ts`

- [ ] **Step 1: Update package script tests first**

Replace `packages/web/test/package-scripts.test.ts` assertions with:

```ts
describe('package scripts', () => {
  it('prepares release assets before production builds', () => {
    expect(packageJson.scripts?.prebuild).toBe(
      'pnpm prepare-assets && pnpm --filter @lpc-toolkit/core build',
    );
  });

  it('prepares release assets before tests that read generated assets', () => {
    expect(packageJson.scripts?.pretest).toBe('pnpm prepare-assets');
    expect(packageJson.scripts?.['pretest:e2e']).toBe('pnpm prepare-assets');
    expect(packageJson.scripts?.['pretest:e2e:parity']).toBe(
      'pnpm prepare-assets && pnpm verify-upstream-parity',
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @lpc-toolkit/web test -- package-scripts.test.ts`

Expected: FAIL because package scripts still use copy and zip scripts.

- [ ] **Step 3: Update package scripts**

In `packages/web/package.json`, set:

```json
{
  "scripts": {
    "dev": "vite",
    "prepare-assets": "tsx scripts/prepare-assets.ts",
    "verify-upstream-parity": "tsx scripts/verify-upstream-parity.ts",
    "zip-assets": "tsx scripts/zip-assets.ts",
    "prebuild": "pnpm prepare-assets && pnpm --filter @lpc-toolkit/core build",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "copy-sprites": "tsx scripts/copy-spritesheets.ts",
    "gen-i18n": "tsx scripts/gen-i18n-data.ts",
    "pretest": "pnpm prepare-assets",
    "test": "vitest run",
    "pretest:e2e": "pnpm prepare-assets",
    "test:e2e": "playwright test",
    "pretest:e2e:parity": "pnpm prepare-assets && pnpm verify-upstream-parity",
    "test:e2e:parity": "playwright test -c playwright.parity.config.ts",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

Keep `copy-sprites` and `zip-assets` as reference scripts for now.

- [ ] **Step 4: Update integration test to require ZIP assets**

Change `publicSprites` to:

```ts
const publicZips = path.join(here, '../public/zips');
```

Change `haveSprites` to:

```ts
const haveZips = existsSync(publicZips);
```

Change the real-asset describe guard to `describe.runIf(haveUpstream && haveZips)`.

Change the missing-assets failure message to:

```ts
if (!haveUpstream) throw new Error('assets/ not found. Run pnpm --filter @lpc-toolkit/web prepare-assets.');
if (!haveZips) throw new Error('public/zips missing. Run pnpm --filter @lpc-toolkit/web prepare-assets.');
```

Leave the Node adapter using `public/spritesheets` only if this test still intentionally exercises the local source. If the test should exercise the new production path, replace it with a ZIP-aware test that asserts `packages/web/public/zips/body.zip` exists and keep composition coverage in Playwright/browser tests where Blob URLs are available.

- [ ] **Step 5: Run package script test**

Run: `pnpm --filter @lpc-toolkit/web test -- package-scripts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/package.json packages/web/test/package-scripts.test.ts packages/web/test/integration.test.ts
git commit -m "feat: prepare release assets before web workflows"
```

---

### Task 6: Ignore and Untrack Generated Assets

**Files:**
- Modify: `.gitignore`
- Git index removal: `assets/`, `packages/web/public/zips/`, `packages/web/public/spritesheets/`

- [ ] **Step 1: Update `.gitignore`**

Add this section above the existing web slice comments:

```gitignore
# Release asset snapshot outputs (regenerated by prepare-assets)
assets/
```

Keep existing ignores:

```gitignore
packages/web/public/spritesheets/
packages/web/public/zips/
```

- [ ] **Step 2: Verify tracked generated paths before removal**

Run:

```bash
git ls-files assets packages/web/public/zips packages/web/public/spritesheets | wc -l
```

Expected before cleanup in the current repo: a large positive count, around `146268`.

- [ ] **Step 3: Remove generated assets from the Git index only**

Run:

```bash
git rm --cached -r assets packages/web/public/zips packages/web/public/spritesheets
```

Expected: many `rm` entries staged, but local files remain on disk because `--cached` is used.

- [ ] **Step 4: Verify `upstream/` was not touched**

Run:

```bash
git status --short upstream
```

Expected: no output.

- [ ] **Step 5: Verify generated files are no longer tracked**

Run:

```bash
git ls-files assets packages/web/public/zips packages/web/public/spritesheets | wc -l
```

Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore
git commit -m "chore: stop tracking generated release assets"
```

---

### Task 7: Full Verification

**Files:**
- No implementation files unless verification reveals a bug.

- [ ] **Step 1: Run asset preparation from the release snapshot**

Run:

```bash
pnpm --filter @lpc-toolkit/web prepare-assets
```

Expected: first run prints `[prepare-assets] refreshed` if generated outputs were missing or stale. A second run should print `[prepare-assets] cache-hit`.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run core tests**

Run:

```bash
pnpm --filter @lpc-toolkit/core test
```

Expected: PASS without requiring `upstream/` beyond any tests that already use materialized `assets/`.

- [ ] **Step 4: Run web tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [ ] **Step 5: Run production build**

Run:

```bash
pnpm --filter @lpc-toolkit/web build
```

Expected: PASS, with Vite reading `assets/sheet_definitions/**/*.json` and serving runtime ZIPs from `packages/web/public/zips/`.

- [ ] **Step 6: Run parity only if upstream is checked out at the release SHA**

Run:

```bash
git -C upstream rev-parse HEAD
```

Expected for parity: `212abfd21493e9957bd556250ac538fa40fe1fc9`.

If it matches, run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected: PASS. If it does not match, do not update `upstream/`; report the mismatch.

- [ ] **Step 7: Verify Git cleanliness for generated paths**

Run:

```bash
git status --short
git ls-files assets packages/web/public/zips packages/web/public/spritesheets
```

Expected: `git status --short` may still show unrelated untracked `.antigravitycli/`, `RTK.md`, and `cache/`, but it must not show generated `assets/` or `packages/web/public/zips/` files. `git ls-files ...` must produce no output.

- [ ] **Step 8: Final commit if verification fixes were needed**

If any verification-only fix was required, commit just that fix:

```bash
git add <fixed-files>
git commit -m "fix: complete asset snapshot verification"
```

---

## Self-Review

- Spec coverage: The plan covers pinned config, repeated safe preparation, manifest/tarball hash checks, metadata ZIP expansion, CREDITS materialization, ZIP runtime asset output, parity source SHA validation, package lifecycle integration, generated asset ignores, index-only asset removal, and verification commands.
- Placeholder scan: No task uses TBD/TODO or asks for generic tests without concrete test code or commands.
- Type consistency: `ReleaseConfig`, `AssetManifest`, `prepareAssetSnapshot`, and `verifyUpstreamParity` names are introduced before later tasks use them.
