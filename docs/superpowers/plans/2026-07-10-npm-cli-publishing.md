# npm CLI Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@lpc-toolkit/cli` as a Node 22+ global CLI that lazily downloads a pinned LPC asset release, retains compressed category ZIPs, works offline from a verified cache, and later publishes through npm Trusted Publishing.

**Architecture:** Keep release loading, filesystem cache management, ZIP-backed image resolution, and npm packaging in `packages/cli`; core remains environment-agnostic. A runtime-assets orchestrator chooses a complete working-directory asset tree or a tag-specific managed cache, then supplies one `AssetStore` interface to validation and the Node canvas adapter.

**Tech Stack:** TypeScript strict mode, Node 22+, pnpm workspaces, Vitest, JSZip (MIT), `@napi-rs/canvas` (MIT), GitHub Actions, npm Trusted Publishing/OIDC.

## Global Constraints

- Keep the npm package name exactly `@lpc-toolkit/cli` and the installed binary exactly `lpc-toolkit`.
- Set the first public package version to `0.1.0` and `engines.node` to `>=22`.
- Use pnpm for repository dependency, build, typecheck, and test commands; prefix terminal commands with `rtk`.
- Do not add dependencies. Existing runtime dependencies remain `@napi-rs/canvas` and `jszip`, both MIT-licensed and GPL-compatible.
- Do not modify `upstream/`, add an `lpc` binary alias, or publish core/presets as separate npm packages.
- Keep `packages/core/` environment-agnostic: no Node filesystem, network, concrete canvas, ZIP, or CLI imports.
- Preserve attribution: a prepared cache requires verified `CREDITS.csv`, and every render/export keeps credit and effective-license artifacts.
- Pin assets through the bundled `asset-release.json`; never follow an unpinned latest release or accept a checksum mismatch.
- Support Node 22+ on GitHub-hosted Linux, macOS, and Windows runners.
- After each task's implementation commit, update this plan's completed checkboxes and add an implementation record containing the exact implementation commit hash and verification results in a separate `docs(plan): record task N completion` commit.

---

## File Structure

### New CLI runtime files

- `packages/cli/src/package-info.ts`: read the installed package version without hard-coding render metadata.
- `packages/cli/src/asset-release.ts`: validate the bundled release pin and resolve platform cache paths.
- `packages/cli/src/asset-cache.ts`: download, verify, safely extract, index, validate, and atomically publish compressed caches.
- `packages/cli/src/asset-store.ts`: define `AssetStore` and implement directory-backed and ZIP-backed image sources.
- `packages/cli/src/runtime-assets.ts`: choose local or managed assets and construct the runtime context/store pair.

### New tests and fixtures

- `packages/cli/test/package-info.test.ts`: package version metadata.
- `packages/cli/test/asset-release.test.ts`: release-pin parsing and cache-path selection.
- `packages/cli/test/asset-cache.test.ts`: integrity, extraction, cache hits, cleanup, and concurrency.
- `packages/cli/test/asset-store.test.ts`: directory/ZIP lookup and buffer image loading.
- `packages/cli/test/runtime-assets.test.ts`: local precedence and managed-cache fallback.
- `packages/cli/test/main-assets.test.ts`: lazy preparation, progress/error streams, and no-download commands.
- `packages/cli/test/helpers/asset-release-fixture.ts`: deterministic manifest, ZIP, PNG, and tar-entry test data.

### New packaging and release files

- `packages/cli/scripts/copy-release-config.mjs`: copy the repository release pin into `dist`.
- `packages/cli/scripts/smoke-packed-cli.mjs`: install the packed tarball into an isolated prefix on every OS.
- `packages/cli/scripts/smoke-real-assets.mjs`: perform the Ubuntu pinned-release render and attribution check.
- `packages/cli/scripts/verify-release-tag.mjs`: require `v<package-version>` before publication.
- `packages/cli/README.md`: npm-facing installation, cache, attribution, and usage documentation.
- `.github/workflows/publish.yml`: tagged OIDC publication after the manually bootstrapped `0.1.0` release.

### Existing files modified

- `packages/cli/package.json`: public metadata, version, Node engine, scripts, README allowlist.
- `packages/cli/scripts/vendor-workspace-deps.mjs`: retain current core/presets vendoring unchanged.
- `packages/cli/src/context.ts`: accept a selected base asset root and store base URL.
- `packages/cli/src/node-canvas-adapter.ts`: resolve images through an optional `AssetStore`.
- `packages/cli/src/catalog-commands.ts`: consume prepared runtime assets.
- `packages/cli/src/selection-commands.ts`: validate paths through `AssetStore.has`.
- `packages/cli/src/preset-commands.ts`: consume prepared runtime assets for materialization.
- `packages/cli/src/render.ts`: consume prepared runtime assets, ZIP-backed adapter, and real package version.
- `packages/cli/src/main.ts`: prepare assets only for asset-dependent commands and format preparation failures.
- `packages/cli/src/response.ts`: format typed asset failures through current human/JSON responses.
- Existing CLI tests: pass prepared runtime fixtures where command signatures change.
- `.github/workflows/ci.yml`: add CLI change detection and a three-OS packed-install matrix.
- `README.md`: replace local-only installation guidance with public npm installation and maintainer release notes.

---

### Task 1: Make Package Metadata Public and Self-Contained

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/test/package-metadata.test.ts`
- Create: `packages/cli/src/package-info.ts`
- Create: `packages/cli/test/package-info.test.ts`
- Create: `packages/cli/scripts/copy-release-config.mjs`
- Create: `packages/cli/README.md`
- Modify: `packages/cli/src/render.ts`

**Interfaces:**
- Produces: `readCliPackageVersion(moduleUrl?: string): string` and `CLI_VERSION: string` from `packages/cli/src/package-info.ts`.
- Produces: built `dist/asset-release.json`, consumed by Task 2.
- Preserves: `dist/vendor/@lpc-toolkit/{core,presets}` vendoring and the `lpc-toolkit` bin.

- [x] **Step 1: Extend the package metadata test first**

Add these fields to `CliPackageJson` in `packages/cli/test/package-metadata.test.ts`:

```ts
readonly name?: string;
readonly version?: string;
readonly private?: boolean;
readonly description?: string;
readonly engines?: Readonly<Record<string, string>>;
readonly license?: string;
readonly publishConfig?: Readonly<Record<string, string>>;
readonly repository?: Readonly<{ readonly type: string; readonly url: string }>;
readonly homepage?: string;
readonly bugs?: Readonly<{ readonly url: string }>;
```

Add the following test cases:

```ts
it('declares public npm release metadata', () => {
  const packageJson = readCliPackageJson();

  expect(packageJson).toMatchObject({
    name: '@lpc-toolkit/cli',
    version: '0.1.0',
    description: expect.stringContaining('LPC'),
    engines: { node: '>=22' },
    license: 'GPL-3.0-or-later',
    publishConfig: { access: 'public' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/ochowei/lpc-toolkit-2026-1.git',
    },
    homepage: 'https://github.com/ochowei/lpc-toolkit-2026-1#readme',
    bugs: { url: 'https://github.com/ochowei/lpc-toolkit-2026-1/issues' },
  });
  expect(packageJson.private).not.toBe(true);
});

it('packs the npm readme and copied release pin', () => {
  const packageJson = readCliPackageJson();

  expect(packageJson.files).toEqual(['dist', 'README.md']);
  expect(packageJson.scripts?.build).toContain('node scripts/copy-release-config.mjs');
});
```

- [x] **Step 2: Run the metadata test and confirm the intended failure**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
```

Expected: FAIL because the package is still private, version `0.0.0`, lacks public metadata, and packs only `dist`.

- [x] **Step 3: Add the package-version test**

Create `packages/cli/test/package-info.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCliPackageVersion } from '../src/package-info.js';

describe('readCliPackageVersion', () => {
  it('reads the package adjacent to source or built runtime directories', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-package-info-'));
    writeFileSync(path.join(root, 'package.json'), '{"version":"0.1.0"}\n');
    const moduleUrl = pathToFileURL(path.join(root, 'dist/package-info.js')).href;

    expect(readCliPackageVersion(moduleUrl)).toBe('0.1.0');
  });

  it('rejects missing version metadata', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-package-info-'));
    writeFileSync(path.join(root, 'package.json'), '{}\n');
    const moduleUrl = pathToFileURL(path.join(root, 'src/package-info.ts')).href;

    expect(() => readCliPackageVersion(moduleUrl)).toThrow(/version/);
  });
});
```

- [x] **Step 4: Run the package-version test and confirm the intended failure**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-info.test.ts
```

Expected: FAIL because `packages/cli/src/package-info.ts` does not exist.

- [x] **Step 5: Implement public metadata, version loading, and release-pin copying**

Create `packages/cli/src/package-info.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function readCliPackageVersion(moduleUrl: string = import.meta.url): string {
  const packageUrl = new URL('../package.json', moduleUrl);
  const parsed = JSON.parse(readFileSync(fileURLToPath(packageUrl), 'utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('CLI package metadata must be an object.');
  }
  const version = (parsed as Readonly<Record<string, unknown>>).version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('CLI package metadata is missing version.');
  }
  return version;
}

export const CLI_VERSION = readCliPackageVersion();
```

Create `packages/cli/scripts/copy-release-config.mjs`:

```js
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
copyFileSync(
  path.join(repoRoot, 'asset-release.json'),
  path.join(packageRoot, 'dist/asset-release.json'),
);
```

Update `packages/cli/package.json` to this public shape while retaining the existing dependencies and devDependencies:

```json
{
  "name": "@lpc-toolkit/cli",
  "version": "0.1.0",
  "description": "Node 22+ CLI for cataloging, validating, and rendering attributed LPC character sprites.",
  "license": "GPL-3.0-or-later",
  "type": "module",
  "bin": { "lpc-toolkit": "./dist/index.js" },
  "files": ["dist", "README.md"],
  "engines": { "node": ">=22" },
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ochowei/lpc-toolkit-2026-1.git"
  },
  "homepage": "https://github.com/ochowei/lpc-toolkit-2026-1#readme",
  "bugs": { "url": "https://github.com/ochowei/lpc-toolkit-2026-1/issues" },
  "keywords": ["lpc", "spritesheet", "pixel-art", "cli", "character-generator"]
}
```

Append `&& node scripts/copy-release-config.mjs` to `scripts.build` after `vendor-workspace-deps.mjs`. Replace `cliVersion: '0.0.0'` in `packages/cli/src/render.ts` with an import of `CLI_VERSION` and `cliVersion: CLI_VERSION`.

Create `packages/cli/README.md` with these exact user-facing facts: Node 22+, `npm install -g @lpc-toolkit/cli`, the `lpc-toolkit` binary, the first asset-dependent command downloads about 205 MB of compressed assets, cache reuse is offline, rendered output always includes attribution, and the package is GPL-3.0-or-later.

- [x] **Step 6: Run focused tests and build**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts package-info.test.ts render.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/cli build
rtk ls -l packages/cli/dist/asset-release.json
```

Expected: all Vitest cases PASS, typecheck/build exit 0, and the copied release pin exists.

- [x] **Step 7: Commit Task 1**

```bash
rtk git add packages/cli/package.json packages/cli/README.md packages/cli/scripts/copy-release-config.mjs packages/cli/src/package-info.ts packages/cli/src/render.ts packages/cli/test/package-info.test.ts packages/cli/test/package-metadata.test.ts
rtk git commit -m "feat(cli): prepare public npm package"
```

After committing, record the exact hash and Step 6 results under Task 1, mark its checkboxes complete, and commit that record separately as required by Global Constraints.

**Implementation record:** Public npm metadata, package-local GPL license, runtime package-version loading, npm README, and release-pin copying were implemented while preserving the `lpc-toolkit` binary and vendored core/presets output.

- Implementation commit: `5fca9d6c7fa7aa3a1b53e28c7c4a48161701c7ea`
- Verification: focused tests 14/14 PASS; build PASS; `packages/cli/dist/asset-release.json` exists; `rtk proxy pnpm --filter @lpc-toolkit/cli typecheck` PASS.
- Tooling note: direct `rtk pnpm --filter @lpc-toolkit/cli typecheck` reported no TypeScript errors but returned exit 1 because this RTK version does not support filtered pnpm-to-tsc optimization; raw-proxy mode preserved the same pnpm command and returned exit 0.

---

### Task 2: Validate the Bundled Release and Resolve Cache Paths

**Files:**
- Create: `packages/cli/src/asset-release.ts`
- Create: `packages/cli/test/asset-release.test.ts`

**Interfaces:**
- Produces: `AssetReleaseConfig`, `parseAssetReleaseConfig`, `loadAssetReleaseConfig`, `bundledAssetReleasePath`, `resolveAssetCacheRoot`, and `releaseCachePath`.
- Consumes: the copied `dist/asset-release.json` from Task 1.
- Used by: Task 3 cache preparation and Task 5 runtime orchestration.

- [x] **Step 1: Write release parsing and cache-path tests**

Create `packages/cli/test/asset-release.test.ts` with cases equivalent to:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bundledAssetReleasePath,
  loadAssetReleaseConfig,
  parseAssetReleaseConfig,
  releaseCachePath,
  resolveAssetCacheRoot,
} from '../src/asset-release.js';

const valid = {
  tag: 'assets-v1',
  sourceRepository: 'owner/repo',
  sourceSha: 'a'.repeat(40),
  manifestUrl: 'https://example.test/manifest.json',
  manifestSha256: 'b'.repeat(64),
  tarballUrl: 'https://example.test/assets.tar.gz',
  tarballSha256: 'c'.repeat(64),
};

describe('asset release configuration', () => {
  it('parses every pinned field', () => {
    expect(parseAssetReleaseConfig(valid)).toEqual(valid);
  });

  it('rejects invalid hashes and non-HTTPS URLs', () => {
    expect(() => parseAssetReleaseConfig({ ...valid, manifestSha256: 'bad' })).toThrow(/manifestSha256/);
    expect(() => parseAssetReleaseConfig({ ...valid, tarballUrl: 'http://example.test/assets' })).toThrow(/tarballUrl/);
  });

  it('loads a config file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-release-'));
    const file = path.join(root, 'asset-release.json');
    writeFileSync(file, JSON.stringify(valid));
    expect(loadAssetReleaseConfig(file)).toEqual(valid);
  });

  it('resolves the config beside built modules', () => {
    const moduleUrl = pathToFileURL('/package/dist/asset-release.js').href;
    expect(bundledAssetReleasePath(moduleUrl)).toBe(path.resolve('/package/dist/asset-release.json'));
  });
});

describe('asset cache paths', () => {
  it('honors LPC_TOOLKIT_CACHE_DIR', () => {
    expect(resolveAssetCacheRoot({
      env: { LPC_TOOLKIT_CACHE_DIR: '/custom/cache' },
      platform: 'linux',
      homeDir: '/home/user',
    })).toBe('/custom/cache');
  });

  it('uses the macOS cache convention', () => {
    expect(resolveAssetCacheRoot({
      env: {}, platform: 'darwin', homeDir: '/Users/me',
    })).toBe('/Users/me/Library/Caches/lpc-toolkit');
  });

  it('uses the Windows cache convention independent of the test host', () => {
    expect(resolveAssetCacheRoot({
      env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
      platform: 'win32',
      homeDir: 'C:\\Users\\me',
    })).toBe('C:\\Users\\me\\AppData\\Local\\lpc-toolkit\\Cache');
  });

  it('uses the XDG cache convention', () => {
    expect(resolveAssetCacheRoot({
      env: { XDG_CACHE_HOME: '/var/cache/me' },
      platform: 'linux',
      homeDir: '/home/me',
    })).toBe('/var/cache/me/lpc-toolkit');
  });

  it('creates one directory name per safe release tag', () => {
    expect(releaseCachePath('/cache', 'assets-v1')).toBe(path.join('/cache', 'assets-v1'));
    expect(() => releaseCachePath('/cache', '../escape')).toThrow(/tag/);
  });
});
```

- [x] **Step 2: Run the tests and confirm the intended failure**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- asset-release.test.ts
```

Expected: FAIL because `packages/cli/src/asset-release.ts` does not exist.

- [x] **Step 3: Implement the release and path API**

Create `packages/cli/src/asset-release.ts` with this public surface:

```ts
export interface AssetReleaseConfig {
  readonly tag: string;
  readonly sourceRepository: string;
  readonly sourceSha: string;
  readonly manifestUrl: string;
  readonly manifestSha256: string;
  readonly tarballUrl: string;
  readonly tarballSha256: string;
}

export interface CacheRootOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
}

export function parseAssetReleaseConfig(value: unknown): AssetReleaseConfig;
export function loadAssetReleaseConfig(filePath: string): AssetReleaseConfig;
export function bundledAssetReleasePath(moduleUrl?: string): string;
export function resolveAssetCacheRoot(options?: Partial<CacheRootOptions>): string;
export function releaseCachePath(cacheRoot: string, tag: string): string;
```

Implement `parseAssetReleaseConfig` with one `requireString` helper, `/^[0-9a-f]{40}$/` for `sourceSha`, `/^[0-9a-f]{64}$/` for both SHA-256 fields, `new URL` plus `protocol === 'https:'` for URLs, and `/^[a-zA-Z0-9._-]+$/` for the tag. Use `fileURLToPath(new URL('./asset-release.json', moduleUrl))` for the bundled path. Use `path.win32` when the injected platform is `win32` and `path.posix` otherwise so platform-path tests behave consistently on every CI host.

- [x] **Step 4: Run focused verification**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- asset-release.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS and exit 0.

- [x] **Step 5: Commit Task 2**

```bash
rtk git add packages/cli/src/asset-release.ts packages/cli/test/asset-release.test.ts
rtk git commit -m "feat(cli): define pinned asset cache paths"
```

After committing, record the exact hash and Step 4 results under Task 2, mark its checkboxes complete, and commit that record separately.

**Implementation record:** Strict bundled release parsing and cross-platform cache path resolution were implemented with safe release-tag validation and host-independent injected platform semantics.

- Implementation commit: `2e95e3721e11b46877fec15a902e1e02e584b8f4`
- Verification: focused release tests 9/9 PASS; equivalent package-scoped CLI typecheck PASS.
- Tooling note: direct `rtk pnpm --filter @lpc-toolkit/cli typecheck` reported no TypeScript errors but returned exit 1 because this RTK version does not support filtered pnpm-to-tsc optimization; `rtk pnpm -C packages/cli typecheck` ran the equivalent CLI package typecheck and returned exit 0.
- Review-fix commit: `95a500d4c7a10d5994c3f982880a11d087bf1a2f`
- Review-fix verification: focused release tests 13/13 PASS; equivalent package-scoped CLI typecheck PASS with exit 0.

---

### Task 3: Build the Verified Compressed Asset Cache

**Files:**
- Create: `packages/cli/src/asset-cache.ts`
- Create: `packages/cli/test/asset-cache.test.ts`
- Create: `packages/cli/test/helpers/asset-release-fixture.ts`

**Interfaces:**
- Consumes: `AssetReleaseConfig` and `releaseCachePath` from Task 2.
- Produces: `AssetCacheLayout`, `AssetCacheProgress`, `AssetCacheError`, `ensureAssetCache`, `validateAssetCache`, and `assetCacheErrorIssue`.
- Produces cache files: verified `asset-manifest.json`, `CREDITS.csv`, `zips/*.zip`, expanded definitions, derived `sprite-index.json`, and `metadata-index.json` containing hashes for every expanded definition.
- Used by: Task 4 ZIP store and Task 5 runtime orchestration.

- [x] **Step 1: Create deterministic release fixture helpers**

Create `packages/cli/test/helpers/asset-release-fixture.ts` exporting:

```ts
export interface AssetReleaseFixture {
  readonly config: AssetReleaseConfig;
  readonly manifestBuffer: Buffer;
  readonly tarEntries: Readonly<Record<string, Buffer>>;
  readonly download: (url: string) => Promise<Buffer>;
  readonly readTarEntry: (entryName: string) => Promise<Buffer>;
}

export async function createAssetReleaseFixture(): Promise<AssetReleaseFixture>;
```

The fixture must use JSZip to create `zips/body.zip` containing
`bodies/male/walk.png`, `zips/sheet_definitions.zip` containing
`body/body.json`, and `zips/palette_definitions.zip` containing one palette
JSON file. It must include `CREDITS.csv`, compute every SHA-256 using
`node:crypto`, emit the production manifest list shape (`path`, `sizeBytes`,
`sha256`), and map the config URLs to the manifest and a deterministic tarball
buffer. The injected `readTarEntry` returns buffers from `tarEntries`, allowing
unit tests to avoid the system `tar` executable.

- [x] **Step 2: Write cache lifecycle tests**

Create `packages/cli/test/asset-cache.test.ts` covering these exact outcomes:

- preparing compressed ZIPs, metadata, credits, manifest, and sprite index
- returning `cache-hit` without calling the injected downloader when every retained hash matches
- rejecting a manifest whose `sourceSha` differs from the release pin
- rejecting a tarball checksum mismatch before reading entries
- rejecting an entry checksum mismatch and removing staging output
- rejecting an archive entry that escapes the staging directory
- replacing a corrupt cache only after a valid staged cache is complete
- accepting a valid winner when two preparations race for the same release
- mapping typed cache failures to CLI issue codes and paths

The first test must assert:

```ts
expect(result.status).toBe('prepared');
expect(existsSync(path.join(result.layout.zipsRoot, 'body.zip'))).toBe(true);
expect(existsSync(result.layout.sheetDefinitionsRoot)).toBe(true);
expect(existsSync(result.layout.paletteDefinitionsRoot)).toBe(true);
expect(readFileSync(result.layout.creditsPath, 'utf8')).toContain('Author');
expect(JSON.parse(readFileSync(result.layout.spriteIndexPath, 'utf8'))).toContain(
  'spritesheets/body/bodies/male/walk.png',
);
expect(existsSync(result.layout.metadataIndexPath)).toBe(true);
expect(existsSync(path.join(cacheRoot, 'assets.tar.gz'))).toBe(false);
```

- [x] **Step 3: Run the cache tests and confirm the intended failure**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- asset-cache.test.ts
```

Expected: FAIL because the cache manager does not exist.

- [x] **Step 4: Implement typed cache contracts and integrity helpers**

Start `packages/cli/src/asset-cache.ts` with these exact contracts:

```ts
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

export async function ensureAssetCache(
  options: EnsureAssetCacheOptions,
): Promise<{ readonly status: AssetCacheStatus; readonly layout: AssetCacheLayout }>;

export function validateAssetCache(
  layout: AssetCacheLayout,
  config: AssetReleaseConfig,
): boolean;
```

Use `createHash('sha256')`, strict manifest object checks, `ensureInsideDirectory`, and `AssetCacheError` for all expected failures. `assetCacheErrorIssue(error)` must return `{ code, message, path? }` for `AssetCacheError` and `{ code: 'asset_cache_failed', message }` otherwise.

- [x] **Step 5: Implement staged preparation and safe extraction**

Implement `ensureAssetCache` in this order:

```ts
const finalLayout = createAssetCacheLayout(options.cacheRoot, options.config.tag);
if (validateAssetCache(finalLayout, options.config)) {
  return { status: 'cache-hit', layout: finalLayout };
}

const stagingRoot = mkdtempSync(path.join(options.cacheRoot, `.${options.config.tag}-`));
const stagingLayout = createLayout(stagingRoot);
try {
  const manifestBuffer = await downloadAndVerifyManifest(options);
  const manifest = parseAssetManifest(manifestBuffer, options.config);
  const tarball = await downloadAndVerifyTarball(options);
  const readEntry = options.readTarEntry ?? createSafeTarReader(tarball, stagingRoot);
  await materializeVerifiedEntries(stagingLayout, manifest, readEntry);
  await expandMetadataZips(stagingLayout);
  await writeSpriteIndex(stagingLayout);
  writeMetadataIndex(stagingLayout);
  writeFileSync(stagingLayout.manifestPath, manifestBuffer);
  if (!validateAssetCache(stagingLayout, options.config)) {
    throw new AssetCacheError('asset_integrity_failed', 'Prepared asset cache failed validation.');
  }
  return publishStagedCache(stagingLayout, finalLayout, options.config);
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
```

`createSafeTarReader` must write the tarball only inside a temporary directory,
run `tar -tzf` first, validate every listed entry with
`ensureInsideDirectory`, then run `tar -xzf ... -C <extractDir>`. Convert
`ENOENT` into an `asset_cache_failed` error that explicitly says the supported
platform requires the `tar` executable. Remove the temporary tarball in a
`finally` block.

`materializeVerifiedEntries` must retain every manifest `zips/*.zip`, verify
each buffer's size and SHA-256 before writing, require and verify `CREDITS.csv`,
and reject absent metadata ZIPs. `expandMetadataZips` validates every JSZip
entry path before writing definitions. `writeSpriteIndex` excludes directories
and the two metadata ZIPs, derives each category from the ZIP filename, writes
sorted logical paths, and produces no uncompressed PNG files.

`writeMetadataIndex` walks only the expanded sheet and palette definition
directories, records sorted relative paths, sizes, and SHA-256 digests, and
writes `metadata-index.json`. `validateAssetCache` verifies those small files
against the index in addition to checking every retained release file, so a
mutated definition cannot be accepted as a cache hit.

When publishing, if the final directory already exists, validate it. Keep the
valid winner and discard staging; remove and replace only an invalid final
directory. Use `renameSync` only after staging validation.

- [x] **Step 6: Run focused cache verification**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- asset-cache.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS and exit 0.

- [x] **Step 7: Commit Task 3**

```bash
rtk git add packages/cli/src/asset-cache.ts packages/cli/test/asset-cache.test.ts packages/cli/test/helpers/asset-release-fixture.ts
rtk git commit -m "feat(cli): cache verified compressed assets"
```

After committing, record the exact hash and Step 6 results under Task 3, mark its checkboxes complete, and commit that record separately.

**Implementation record:**

- Implementation: `040967ddcb4da3e87a7bca5a38be3191df5a2913` (`feat(cli): cache verified compressed assets`)
- Verification: focused asset-cache tests PASS (13/13); full CLI tests PASS (84/84); CLI typecheck PASS via `rtk pnpm --filter @lpc-toolkit/cli run typecheck`.
- RTK note: the shorthand `rtk pnpm --filter @lpc-toolkit/cli typecheck` reported no TypeScript errors but returned exit 1 because RTK does not support that filtered shorthand; the explicit `run` form exited 0.
- Implementation note: added deterministic release fixtures, verified retained ZIP/credits/manifest caching, safe metadata expansion, definition and recomputed sprite-index validation, typed issue mapping, staged cleanup, and atomic quarantine publication for concurrent corrupt-cache replacement.
- Internal review: fixed tar link/hardlink/special-entry extraction safety, sprite-index mutation acceptance, raw staging-directory errors, stale-check winner deletion, and abandoned persistent-lock/stale-reclamation designs. Final focused re-review: APPROVED with no unresolved Critical or Important findings.
- Formal review fix: `33e3c8195d8b78eda1f5dc9a522a32a31bd95272` (`fix(cli): anchor cache validation to release manifest`).
- Formal review verification: focused asset-cache tests PASS (19/19); full CLI tests PASS (90/90); CLI typecheck PASS via `rtk pnpm --filter @lpc-toolkit/cli run typecheck`.
- Formal review note: cache ZIP inventory and sprite paths are anchored to the verified manifest; expanded definition paths, sizes, and hashes are synchronously derived from the verified metadata ZIPs with STORE/DEFLATE support; dot components, normalized manifest destinations, coherent metadata tampering, extra ZIPs, and non-file ZIP entries are rejected. Focused re-review: APPROVED with no unresolved Critical or Important findings.

---

### Task 4: Add Directory and ZIP Asset Stores

**Files:**
- Create: `packages/cli/src/asset-store.ts`
- Create: `packages/cli/test/asset-store.test.ts`
- Modify: `packages/cli/src/node-canvas-adapter.ts`
- Modify: `packages/cli/test/render.test.ts`

**Interfaces:**
- Consumes: `AssetCacheLayout` and `sprite-index.json` from Task 3.
- Produces: `AssetStore`, `createDirectoryAssetStore`, `createZipAssetStore`, and `createNodeCanvasAdapter({ assetStore })`.
- `AssetStore.has` remains synchronous so existing core path resolution and CLI validation do not change contracts.

- [x] **Step 1: Write asset-store tests first**

Create `packages/cli/test/asset-store.test.ts` covering:

- directory store resolution of logical paths to existing files
- directory store return of absolute file paths for canvas loading
- synchronous ZIP-store existence checks from `sprite-index.json`
- one PNG entry loaded as a buffer with one cached parsed category ZIP
- rejection of invalid schemes, traversal, absent categories, and missing entries
- decoding a PNG buffer returned by an asset store through the Node adapter

Use a 64×64 PNG from `@napi-rs/canvas`, JSZip, and a temporary
`body.zip`. The central ZIP assertions must be:

```ts
const store = createZipAssetStore(layout);
expect(store.has('spritesheets/body/bodies/male/walk.png')).toBe(true);
const source = await store.load('lpc-zip:/spritesheets/body/bodies/male/walk.png');
expect(Buffer.isBuffer(source)).toBe(true);
const adapter = createNodeCanvasAdapter({ assetStore: store });
const image = await adapter.loadImage('lpc-zip:/spritesheets/body/bodies/male/walk.png');
expect({ width: image.width, height: image.height }).toEqual({ width: 64, height: 64 });
```

- [x] **Step 2: Run the test and confirm the intended failure**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- asset-store.test.ts
```

Expected: FAIL because `asset-store.ts` and the adapter option do not exist.

- [x] **Step 3: Implement the common asset-store contract**

Create `packages/cli/src/asset-store.ts` with:

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { AssetCacheLayout } from './asset-cache.js';

export type AssetImageSource = string | Buffer;

export interface AssetStore {
  readonly kind: 'directory' | 'zip';
  readonly baseUrl: string;
  readonly description: string;
  has(logicalPath: string): boolean;
  load(sourcePath: string): Promise<AssetImageSource>;
}

export function createDirectoryAssetStore(assetsRoot: string): AssetStore;
export function createZipAssetStore(layout: AssetCacheLayout): AssetStore;
```

The directory implementation sets `baseUrl` to the absolute asset root,
requires logical paths to remain inside that root for `has`, and returns the
absolute `sourcePath` it receives from core for `load` after confirming it is
inside the root.

The ZIP implementation sets `baseUrl` to `lpc-zip:`, reads
`sprite-index.json` into a `Set<string>`, and normalizes the core-composed URL
`lpc-zip:/spritesheets/<category>/<entry>` back to the logical path. Split the
category and entry, load `<zipsRoot>/<category>.zip` through one cached
`Promise<JSZip>` per category, and return `await file.async('nodebuffer')`.
Reject path traversal before reading a ZIP.

- [x] **Step 4: Update the Node canvas adapter**

Change `packages/cli/src/node-canvas-adapter.ts` to:

```ts
export interface NodeCanvasAdapterOptions {
  readonly assetStore?: AssetStore;
}

export function createNodeCanvasAdapter(
  options: NodeCanvasAdapterOptions = {},
): CanvasAdapter {
  return {
    createCanvas(width, height) {
      return createCanvas(width, height);
    },
    async loadImage(sourcePath) {
      const source = options.assetStore
        ? await options.assetStore.load(sourcePath)
        : sourcePath;
      return napiLoadImage(source);
    },
  };
}
```

Keep `writeCanvasPng` unchanged. Existing directory-based render tests must
still pass without specifying an asset store.

- [x] **Step 5: Run focused verification**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- asset-store.test.ts render.test.ts validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS and exit 0.

- [x] **Step 6: Commit Task 4**

```bash
rtk git add packages/cli/src/asset-store.ts packages/cli/src/node-canvas-adapter.ts packages/cli/test/asset-store.test.ts packages/cli/test/render.test.ts
rtk git commit -m "feat(cli): render sprites from cached zips"
```

After committing, record the exact hash and Step 5 results under Task 4, mark its checkboxes complete, and commit that record separately.

**Implementation record:**

- Implementation: `9814c0a6fe2381b48cc4a01eeda8876b49ef8ec4` (`feat(cli): render sprites from cached zips`)
- Verification: focused asset-store, render, and validation tests PASS (11/11); package-directory CLI typecheck PASS via `rtk pnpm typecheck` from `packages/cli`.
- RTK note: the shorthand `rtk pnpm --filter @lpc-toolkit/cli typecheck` reported no TypeScript errors but returned exit 1 because RTK does not support that filtered shorthand; running `rtk pnpm typecheck` from `packages/cli` exited 0.
- Implementation note: added directory and index-backed ZIP asset stores with traversal and scheme rejection, synchronous existence checks, cached per-category ZIP parsing, buffer-backed Node canvas loading, and preserved default directory rendering.
- Formal review fix: `0681ec13af40801554cd060cea7afa1edf8b5745` (`fix(cli): confine directory asset paths`).
- Formal review verification: focused asset-store, render, and validation tests PASS (13/13, with one Windows-only regression skipped on the non-Windows host); full CLI tests PASS (96/96, with the same platform skip); CLI typecheck PASS via both `rtk pnpm --filter @lpc-toolkit/cli run typecheck` and `rtk pnpm typecheck` from `packages/cli`.
- Formal review note: Windows drive-letter paths are distinguished from URI schemes, directory candidates are confined by canonical real-path comparison so escaping symlinks are rejected, and only regular files qualify as image assets.

---

### Task 5: Orchestrate Runtime Assets Across CLI Commands

**Files:**
- Create: `packages/cli/src/runtime-assets.ts`
- Create: `packages/cli/test/runtime-assets.test.ts`
- Create: `packages/cli/test/main-assets.test.ts`
- Modify: `packages/cli/src/context.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/src/catalog-commands.ts`
- Modify: `packages/cli/src/selection-commands.ts`
- Modify: `packages/cli/src/preset-commands.ts`
- Modify: `packages/cli/src/render.ts`
- Modify: affected CLI command tests

**Interfaces:**
- Consumes: Task 2 release config/path API, Task 3 cache manager, Task 4 stores.
- Produces: `RuntimeAssets`, `PrepareRuntimeAssetsOptions`, `prepareRuntimeAssets`, and `commandNeedsAssets`.
- Updates: command functions consume one prepared runtime instead of independently assuming `<cwd>/assets`.

- [x] **Step 1: Write runtime selection tests**

Create `packages/cli/test/runtime-assets.test.ts` with these cases:

- prefer a complete current-directory asset tree and never call `ensureAssetCache`
- fall back to the pinned managed cache outside the repository
- keep current-directory `assets_custom` as an overlay with a managed base cache
- honor `LPC_TOOLKIT_CACHE_DIR`
- propagate typed cache failures without creating a runtime

A complete local tree must include `sheet_definitions/`,
`palette_definitions/`, `spritesheets/`, and `CREDITS.csv`. Inject
`ensureCache` in tests. The local-precedence test must assert:

```ts
const ensureCache = vi.fn();
const runtime = await prepareRuntimeAssets({ cwd, ensureCache });
expect(runtime.source).toBe('working-directory');
expect(runtime.store.kind).toBe('directory');
expect(ensureCache).not.toHaveBeenCalled();
```

The managed-cache test must return a fixture `AssetCacheLayout` from the mock
and assert `runtime.source === 'managed-cache'`, `runtime.releaseTag` equals the
fixture pin, `runtime.store.kind === 'zip'`, and one call contains the resolved
cache root.

- [x] **Step 2: Write command laziness and stream tests**

Create `packages/cli/test/main-assets.test.ts` with:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/args.js';
import { AssetCacheError } from '../src/asset-cache.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { commandNeedsAssets, runCli } from '../src/main.js';
import type {
  PrepareRuntimeAssetsOptions,
  RuntimeAssets,
} from '../src/runtime-assets.js';

function makeRuntimeAssets(): RuntimeAssets {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-assets-'));
  const assetsRoot = path.join(cwd, 'assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };
}

function captureIo(cwd: string): {
  readonly io: {
    readonly cwd: string;
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
  };
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

describe('asset preparation dispatch', () => {
  const runtime = makeRuntimeAssets();

  it.each([
    [['token', 'encode', '--selection', 'selection.json']],
    [['token', 'decode', '--token', 'v1.example']],
    [['preset', 'list']],
  ])('classifies %j as asset-independent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(false);
  });

  it.each([
    [['catalog', 'types']],
    [['selection', 'validate', '--selection', 'selection.json']],
    [['preset', 'materialize', 'villager']],
    [['render', '--selection', 'selection.json', '--out', 'out']],
  ])('classifies %j as asset-dependent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(true);
  });

  it('prepares assets exactly once before catalog dispatch', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);
    const code = await runCli(['catalog', 'types'], capture.io, {
      prepareRuntimeAssets: prepare,
    });

    expect(code).toBe(0);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('does not prepare assets for help', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['--help'], capture.io, { prepareRuntimeAssets: prepare })).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('keeps JSON stdout parseable while progress goes to stderr', async () => {
    const prepare = vi.fn(async (options: PrepareRuntimeAssetsOptions) => {
      options.onProgress?.({
        phase: 'manifest-download',
        releaseTag: 'assets-v1',
        message: 'Downloading manifest.',
      });
      return runtime;
    });
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['catalog', 'types', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(0);
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({ ok: true });
    expect(capture.stderr.join('')).toContain('manifest-download');
  });

  it('formats typed cache failures as JSON', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions): Promise<RuntimeAssets> => {
      throw new AssetCacheError('asset_integrity_failed', 'Checksum mismatch.', '/cache/assets-v1');
    });
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['catalog', 'types', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(JSON.parse(capture.stdout.join('')).errors[0]).toMatchObject({
      code: 'asset_integrity_failed',
      path: '/cache/assets-v1',
    });
  });

  it('formats the same cache failure for humans', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions): Promise<RuntimeAssets> => {
      throw new AssetCacheError('asset_download_failed', 'Network unavailable.');
    });
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['catalog', 'types'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(capture.stdout).toEqual([]);
    expect(capture.stderr.join('')).toContain('asset_download_failed');
  });
});
```

- [x] **Step 3: Run both new tests and confirm the intended failures**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- runtime-assets.test.ts main-assets.test.ts
```

Expected: FAIL because runtime orchestration and injectable CLI dependencies do not exist.

- [x] **Step 4: Implement runtime-assets selection**

Create `packages/cli/src/runtime-assets.ts`:

```ts
export interface RuntimeAssets {
  readonly context: RuntimeContext;
  readonly store: AssetStore;
  readonly source: 'working-directory' | 'managed-cache';
  readonly releaseTag?: string;
}

export interface PrepareRuntimeAssetsOptions {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly configPath?: string;
  readonly ensureCache?: typeof ensureAssetCache;
  readonly onProgress?: (progress: AssetCacheProgress) => void;
}

export async function prepareRuntimeAssets(
  options: PrepareRuntimeAssetsOptions,
): Promise<RuntimeAssets>;
```

Resolve `<cwd>/assets` first and use `createDirectoryAssetStore` only when all
four required local paths exist. Otherwise load the bundled pin, resolve the
cache root, call `ensureAssetCache`, create a ZIP store, and call
`createRuntimeContext` with the cache's extracted definitions root and the
store's `baseUrl`. Always keep `<cwd>/assets_custom` as `customAssetsRoot`.

Update `RuntimeContextOptions` so `assetsRoot`, `customAssetsRoot`, and
`spritesheetsBaseUrl` are explicit selected-runtime inputs while preserving
the existing default behavior for direct unit callers.

- [x] **Step 5: Make command asset requirements explicit in `main.ts`**

Add:

```ts
export function commandNeedsAssets(parsed: ParsedArgs): boolean {
  if (parsed.command[0] === 'catalog') return true;
  if (parsed.command[0] === 'selection') return true;
  if (parsed.command[0] === 'render') return true;
  if (parsed.command[0] === 'preset') return parsed.command[1] !== 'list';
  return false;
}

export interface CliDependencies {
  readonly prepareRuntimeAssets: typeof prepareRuntimeAssets;
}

const DEFAULT_DEPENDENCIES: CliDependencies = { prepareRuntimeAssets };
```

Extend `runCli` with `dependencies: CliDependencies = DEFAULT_DEPENDENCIES`.
After parsing arguments, prepare one runtime only when
`commandNeedsAssets(parsed)` is true. Send progress to `io.stderr` with one
line per phase. Catch preparation errors before command dispatch and pass
`assetCacheErrorIssue(error)` to `commandError` and the existing
`writeResponse` function.

- [x] **Step 6: Pass one runtime through commands and rendering**

Change the relevant signatures to:

```ts
export function runCatalogCommand(parsed: ParsedArgs, runtime: RuntimeAssets): CliResponse<unknown>;
export function runSelectionCommand(parsed: ParsedArgs, runtime: RuntimeAssets): CliResponse<unknown>;
export function runPresetCommand(
  parsed: ParsedArgs,
  cwd: string,
  runtime?: RuntimeAssets,
): CliResponse<unknown>;

export interface RenderSelectionOptions {
  readonly runtime: RuntimeAssets;
  // retain every existing render option
}
```

Use `runtime.context` for catalog and palette roots. Replace each
`existsSync(path.join(context.spritesheetsBaseUrl, spritePath))` validation
callback with `runtime.store.has(spritePath)`. Create the canvas adapter with
`createNodeCanvasAdapter({ assetStore: runtime.store })`, and pass
`runtime.store.baseUrl` to core composition. Keep preset list independent of a
runtime. Update render metadata `source` to report the runtime source,
description, release tag, base definition root, and custom overlay root without
claiming that cached ZIP sprites are an expanded directory.

- [x] **Step 7: Run focused command and render tests**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- runtime-assets.test.ts main-assets.test.ts catalog-commands.test.ts selection.test.ts preset-commands.test.ts render.test.ts main-json.test.ts main-human.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm check:boundaries
```

Expected: all tests PASS, typecheck exits 0, and boundary check passes.

- [x] **Step 8: Commit Task 5**

```bash
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): prepare assets on demand"
```

Before committing, confirm `rtk git diff --name-only` lists only Task 5 files.
After committing, record the exact hash and Step 7 results under Task 5, mark
its checkboxes complete, and commit that record separately.

**Implementation record:**

- Implementation: `0146fb99b2325333f27fc4b60579c54a666d1a0b` (`feat(cli): prepare assets on demand`)
- Verification: focused runtime, command, render, and output tests 46/46 PASS; full CLI tests 113 PASS / 1 Windows-only platform skip on the non-Windows host; package-directory CLI typecheck PASS via `rtk pnpm typecheck` from `packages/cli`; architecture boundary check PASS.
- Implementation note: selected complete current-directory assets before the managed cache, preserved the current-directory custom overlay, prepared one runtime only for asset-dependent commands, routed cache progress/errors without contaminating JSON stdout, and passed one store/context through validation, preset materialization, composition, rendering, attribution, and metadata.
- Context note: the existing `RuntimeContextOptions` already exposed explicit `assetsRoot`, `customAssetsRoot`, and `spritesheetsBaseUrl` inputs with direct-caller defaults, so `context.ts` required no Task 5 change.
- Formal review fix: `c3495a29ed7fca9fe9150be4ba58ffd6e59f8b9e` (`fix(cli): verify managed zip rendering`).
- Formal review verification: focused Task 5, render, and asset-store tests PASS (59 passed, with one Windows-only platform regression skipped on the non-Windows host); full CLI tests PASS (121 passed, with the same platform skip); package-directory CLI typecheck PASS; architecture boundary check PASS.
- Formal review note: render metadata now reports the actual `sheetDefinitionsRoot`; a deterministic managed-cache fixture exercises real category-ZIP loading through core composition and verifies visible pixel output, attribution artifacts, effective license, `lpc-zip:` metadata, release tag, and definition root; nested catalog/render/preset-render help short-circuits before asset preparation while retaining help output semantics.

---

### Task 6: Verify Packed Installs on Linux, macOS, and Windows

**Files:**
- Create: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/cli/test/package-metadata.test.ts`

**Interfaces:**
- Consumes: the production tarball from Tasks 1–5.
- Produces: `pnpm --filter @lpc-toolkit/cli test:package`, a cross-platform install smoke command.
- Does not download production LPC assets.

- [x] **Step 1: Add package-script metadata expectations**

Extend the existing package metadata test:

```ts
it('defines the cross-platform packed install smoke command', () => {
  const packageJson = readCliPackageJson();
  expect(packageJson.scripts?.['test:package']).toBe('node scripts/smoke-packed-cli.mjs');
});
```

- [x] **Step 2: Run the metadata test and confirm the intended failure**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
```

Expected: FAIL because `test:package` is not defined.

- [x] **Step 3: Implement the isolated packed-install smoke script**

Create `packages/cli/scripts/smoke-packed-cli.mjs`. It must:

1. create a temporary pack directory and install prefix with `mkdtempSync`
2. run `pnpm pack --pack-destination <packDir>` with `cwd` set to the CLI package
3. find exactly one `lpc-toolkit-cli-0.1.0.tgz`
4. run `npm install --prefix <prefix> <tarball>`
5. resolve `<prefix>/node_modules/.bin/lpc-toolkit` on Unix or the `.cmd` file on Windows
6. run the installed binary with `--help`
7. require exit code 0 and output containing `lpc-toolkit catalog types`
8. inspect the tarball listing through `npm pack --json` or `tar -tzf` and require `package/dist/asset-release.json`, vendored core/presets, `package/README.md`, `package/LICENSE`, and `package/package.json`
9. reject entries under `package/src/`, `package/test/`, or TypeScript config files
10. delete both temporary directories in a `finally` block

Use `execFileSync` with argument arrays and `process.execPath`/platform-aware bin
paths; do not construct shell command strings.

Add to `packages/cli/package.json`:

```json
"test:package": "node scripts/smoke-packed-cli.mjs"
```

- [x] **Step 4: Run the package smoke locally**

```bash
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: the tarball is installed into a temporary prefix, help exits 0, package contents pass, and the script exits 0.

- [x] **Step 5: Add the CLI CI matrix**

Extend the `changes` job with a `cli` output and filter covering:

```yaml
outputs:
  web: ${{ steps.filter.outputs.web }}
  cli: ${{ steps.filter.outputs.cli }}

cli:
  - 'packages/cli/**'
  - 'packages/core/**'
  - 'packages/presets/**'
  - 'asset-release.json'
  - 'pnpm-lock.yaml'
  - '.github/workflows/ci.yml'
```

Add this job:

```yaml
cli-package:
  name: CLI package (${{ matrix.os }})
  needs: [unit, changes]
  if: needs.changes.outputs.cli == 'true' || github.event_name == 'push'
  strategy:
    fail-fast: false
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
  runs-on: ${{ matrix.os }}
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @lpc-toolkit/cli typecheck
    - run: pnpm --filter @lpc-toolkit/cli test
    - run: pnpm --filter @lpc-toolkit/cli build
    - run: pnpm --filter @lpc-toolkit/cli test:package
```

- [x] **Step 6: Run workflow and boundary verification**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm check:boundaries
```

Expected: PASS. Also inspect `.github/workflows/ci.yml` to confirm no `npm install`
or `pnpm install` command runs inside `upstream/` for the new CLI job.

- [x] **Step 7: Commit Task 6**

```bash
rtk git add .github/workflows/ci.yml packages/cli/package.json packages/cli/scripts/smoke-packed-cli.mjs packages/cli/test/package-metadata.test.ts
rtk git commit -m "ci(cli): test packed installs across platforms"
```

After committing, record the exact hash and Step 6 results under Task 6, mark its checkboxes complete, and commit that record separately.

**Implementation record:**

- Implementation: `659c1db22cf11b88c6cfb62619a199585214fdbb` (`ci(cli): test packed installs across platforms`).
- Verification: package metadata tests 10/10 PASS; full CLI tests 124 PASS / 1 Windows-only platform skip on the non-Windows host; CLI typecheck PASS via RTK's documented raw proxy because the filtered TypeScript optimizer returned a false nonzero status; architecture boundaries PASS; CLI build PASS; isolated packed install PASS.
- Package verification: the tarball contained the bundled asset release pin, vendored core and presets, README, GPL license, and package metadata; it excluded `src/`, `test/`, and TypeScript configuration files; installed help exited 0 and contained `lpc-toolkit catalog types` without downloading production LPC assets.
- Workflow verification: the CLI change filter and Ubuntu/macOS/Windows matrix are present; the new CLI job installs only at the repository root and does not install inside `upstream/`; YAML parsing and diff checks PASS.
- Platform note: the packed-install smoke passed locally on macOS; actual Linux, macOS, and Windows executions are provided by the added CI matrix.

---

### Task 7: Add the Real Asset Smoke Test and Trusted Publish Workflow

**Files:**
- Create: `packages/cli/scripts/smoke-real-assets.mjs`
- Create: `packages/cli/scripts/verify-release-tag.mjs`
- Create: `.github/workflows/publish.yml`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/test/package-metadata.test.ts`

**Interfaces:**
- Produces: `test:assets:real` and `verify:release-tag` package scripts.
- Consumes: public GitHub asset URLs pinned in bundled `asset-release.json`.
- Publication gate: the `v0.1.0` tag is manually published; later matching tags use OIDC.

- [x] **Step 1: Guard release scripts in package metadata tests**

Add:

```ts
it('defines release verification and real-asset smoke scripts', () => {
  const packageJson = readCliPackageJson();
  expect(packageJson.scripts).toMatchObject({
    'test:assets:real': 'node scripts/smoke-real-assets.mjs',
    'verify:release-tag': 'node scripts/verify-release-tag.mjs',
  });
});
```

- [x] **Step 2: Run the metadata test and confirm the intended failure**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
```

Expected: FAIL because both scripts are absent.

- [x] **Step 3: Implement release-tag verification**

Create `packages/cli/scripts/verify-release-tag.mjs`:

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
const expected = `v${packageJson.version}`;
if (tag !== expected) {
  console.error(`Release tag mismatch: expected ${expected}, received ${tag ?? 'unset'}.`);
  process.exitCode = 1;
} else {
  console.log(`Release tag verified: ${tag}`);
}
```

Add its package script and verify locally:

```bash
rtk env GITHUB_REF_NAME=v0.1.0 pnpm --filter @lpc-toolkit/cli verify:release-tag
rtk env GITHUB_REF_NAME=v9.9.9 pnpm --filter @lpc-toolkit/cli verify:release-tag
```

Expected: the first exits 0; the second exits 1 with `Release tag mismatch`.

- [x] **Step 4: Implement the real pinned-asset smoke script**

Create `packages/cli/scripts/smoke-real-assets.mjs`. It must build isolated
temporary `cwd`, cache, and output directories; spawn
`dist/index.js preset render villager --out <outDir> --json` with
`LPC_TOOLKIT_CACHE_DIR` pointing at the temporary cache; require exit 0 and
valid JSON; require at least one `.sheet.png`, `.credits.txt`, `.credits.csv`,
and `.metadata.json`; require credits content and nonempty effective license;
run the same render a second time against the same cache; require the second
run to succeed and its stderr to contain no `manifest-download` or
`tarball-download` progress phase; and delete all temporary directories in
`finally`. Unit tests from Task 3 remain the proof that a cache hit never calls
the injected downloader, while this smoke verifies the production process
selects that cache-hit path.

Add:

```json
"test:assets:real": "node scripts/smoke-real-assets.mjs",
"verify:release-tag": "node scripts/verify-release-tag.mjs"
```

- [x] **Step 5: Run the real smoke once with network permission**

```bash
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:assets:real
```

Expected: first run downloads/verifies the pinned release and renders with
credits; second run reports no download progress phases and succeeds from the
same cache. This command transfers about 205 MB and may require sandbox network
approval.

- [x] **Step 6: Create the publish workflow**

Create `.github/workflows/publish.yml`:

```yaml
name: Publish CLI

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write

jobs:
  verify-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.14.0
          registry-url: https://registry.npmjs.org
      - run: npm install --global npm@11.5.1
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @lpc-toolkit/cli verify:release-tag
      - run: pnpm check:boundaries
      - run: pnpm --filter @lpc-toolkit/cli typecheck
      - run: pnpm --filter @lpc-toolkit/cli test
      - run: pnpm --filter @lpc-toolkit/cli build
      - run: pnpm --filter @lpc-toolkit/cli test:package
      - run: pnpm --filter @lpc-toolkit/cli test:assets:real
      - name: Publish through npm OIDC
        if: github.ref_name != 'v0.1.0'
        run: npm publish --access public
        working-directory: packages/cli
```

The `v0.1.0` condition preserves the approved bootstrap: CI verifies that tag,
but the owner performs its first publication with 2FA. After the package exists,
configure npm Trusted Publisher for `ochowei/lpc-toolkit-2026-1`, filename
`publish.yml`, allowed action `npm publish`. Later tags publish through OIDC and
receive provenance.

- [x] **Step 7: Run release workflow checks locally**

```bash
rtk env GITHUB_REF_NAME=v0.1.0 pnpm --filter @lpc-toolkit/cli verify:release-tag
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts asset-cache.test.ts main-assets.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm check:boundaries
```

Expected: PASS and exit 0. Review the workflow to confirm `id-token: write`,
exact repository package directory, npm 11.5.1+, Node 22.14.0+, and the first
release skip condition.

- [x] **Step 8: Commit Task 7**

```bash
rtk git add .github/workflows/publish.yml packages/cli/package.json packages/cli/scripts/smoke-real-assets.mjs packages/cli/scripts/verify-release-tag.mjs packages/cli/src/asset-cache.ts packages/cli/test/package-metadata.test.ts
rtk git commit -m "ci(cli): add trusted npm release workflow"
```

After committing, record the exact hash and Steps 5/7 results under Task 7,
mark its checkboxes complete, and commit that record separately.

**Implementation record:**

- Implementation: `d8a1d57f24d3fee48216d9e28988e577607799cb` (`ci(cli): add trusted npm release workflow`).
- Verification: CLI build PASS; focused package metadata, asset-cache, and main-assets tests 49/49 PASS; explicit CLI typecheck PASS; architecture boundaries PASS.
- Tag verification: matching `v0.1.0` exited 0; mismatching `v9.9.9` produced the expected release-tag mismatch and exited 1.
- Real asset smoke: PASS against the exact bundled pin and checksums; the attributed render reported 8 credit entries with effective license `GPL 3.0`; the second production render reused the same cache with no manifest or tarball download phases.
- Archive regression: the real release tarball's safe `lpc-runtime-zips/` wrapper exposed the cache reader's root-level path assumption; a RED/GREEN regression test now covers single-root-directory archives, and the reader preserves direct-root lookup before resolving manifest-relative paths under the validated wrapper.
- Workflow verification: the tag workflow has `id-token: write`, Node 22.14.0, npm 11.5.1, the exact `packages/cli` publish working directory, and deliberately skips OIDC publication for `v0.1.0` while running all release checks.
- Bootstrap note: the owner must still manually publish `v0.1.0` with 2FA and configure npm Trusted Publisher afterward; that external setup was intentionally not performed in Task 7.

---

### Task 8: Document Installation, Cache Behavior, and Bootstrap Release

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `README.md`

**Interfaces:**
- Documents the exact public contract produced by Tasks 1–7.
- Does not change runtime behavior.

- [ ] **Step 1: Write a failing documentation assertion**

Extend `packages/cli/test/package-metadata.test.ts` with a helper that reads
`packages/cli/README.md`, then assert:

```ts
expect(readme).toContain('npm install -g @lpc-toolkit/cli');
expect(readme).toContain('Node.js 22');
expect(readme).toContain('LPC_TOOLKIT_CACHE_DIR');
expect(readme).toContain('CREDITS.csv');
expect(readme).toContain('GPL-3.0-or-later');
```

- [ ] **Step 2: Run the documentation assertion and confirm the intended failure**

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
```

Expected: FAIL until the README contains every required section.

- [ ] **Step 3: Complete user and maintainer documentation**

Update `packages/cli/README.md` with:

- prerequisites: Node.js 22+
- global install and `npx @lpc-toolkit/cli --help` examples
- command examples for catalog, selection, token, presets, and rendering
- first-use download size and progress-on-stderr behavior
- macOS, Windows, Linux, and `LPC_TOOLKIT_CACHE_DIR` cache locations
- the compressed-cache layout and offline behavior
- working-directory `assets/` precedence and `assets_custom/` overlay
- checksum, missing `tar`, network, and cache-write troubleshooting
- attribution artifacts and GPL-3.0-or-later obligations

Update the root `README.md` public CLI section to use:

```bash
npm install -g @lpc-toolkit/cli
lpc-toolkit --help
```

Keep local tarball-development instructions in a clearly labeled maintainer
subsection. Add the first-release sequence (`v0.1.0`, 2FA
`npm publish --access public`, clean registry install, then npm Trusted
Publisher configuration) and later tag release behavior. Do not claim
`@lpc-toolkit/core` or `@lpc-toolkit/presets` are published.

- [ ] **Step 4: Run full final verification**

```bash
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm check:boundaries
rtk pnpm typecheck
rtk pnpm test
rtk git diff --check
```

Expected: every command exits 0. The full `pnpm test` may download the already
pinned web assets if its local cache is absent; do not bypass that verification.

- [ ] **Step 5: Commit Task 8**

```bash
rtk git add README.md packages/cli/README.md packages/cli/test/package-metadata.test.ts
rtk git commit -m "docs(cli): document npm installation and releases"
```

After committing, record the exact hash and Step 4 results under Task 8, mark
its checkboxes complete, and commit that record separately.

---

## Manual Bootstrap Gate After Implementation

Do not publish automatically as part of ordinary implementation verification.
After all eight tasks pass and the user explicitly authorizes the external
release actions:

1. merge the implementation
2. create and push tag `v0.1.0`
3. verify the Publish CLI workflow passes and skips only its publish step
4. from `packages/cli`, run `npm publish --access public` with the npm owner
   account and 2FA
5. install `@lpc-toolkit/cli@0.1.0` from the public registry in a clean prefix
6. configure npm Trusted Publisher with repository
   `ochowei/lpc-toolkit-2026-1`, workflow `publish.yml`, allowed action
   `npm publish`
7. restrict traditional token publishing after one later OIDC release succeeds

These are external mutations and require explicit authorization at execution
time. The implementation tasks prepare and verify them but do not silently
perform them.
