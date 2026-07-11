import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import JSZip from 'jszip';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packedTarballName } from './package-archive-name.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const assetsRoot = path.join(repoRoot, 'assets');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const expectedTarballName = packedTarballName(packageJson);
const isWindows = process.platform === 'win32';

function resolveNodeTool(...segments) {
  const nodeBinDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeBinDir, 'node_modules', ...segments),
    path.resolve(nodeBinDir, '../lib/node_modules', ...segments),
  ];
  const toolPath = candidates.find((candidate) => existsSync(candidate));
  if (toolPath === undefined) {
    throw new Error(`could not resolve Node tool: ${segments.join('/')}`);
  }

  return toolPath;
}

function runNodeTool(toolPath, args, options = {}) {
  return execFileSync(process.execPath, [toolPath, ...args], options);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function createManagedCacheFixture(cacheRoot, releaseConfig, sourceAssetsRoot) {
  const releaseRoot = path.join(cacheRoot, releaseConfig.tag);
  const zipsRoot = path.join(releaseRoot, 'zips');
  const manifest = readFileSync(path.join(sourceAssetsRoot, 'asset-manifest.json'));
  const manifestData = JSON.parse(manifest.toString('utf8'));
  assert.equal(sha256(manifest), releaseConfig.manifestSha256, 'fixture manifest must match bundled pin');
  assert.equal(manifestData.sourceSha, releaseConfig.sourceSha, 'fixture manifest must match bundled source');
  mkdirSync(zipsRoot, { recursive: true });
  writeFileSync(path.join(releaseRoot, 'asset-manifest.json'), manifest);
  cpSync(path.join(sourceAssetsRoot, 'CREDITS.csv'), path.join(releaseRoot, 'CREDITS.csv'));
  const zipsSource = path.join(repoRoot, 'packages/web/public/zips');
  for (const name of readdirSync(zipsSource)) {
    if (name.endsWith('.zip')) cpSync(path.join(zipsSource, name), path.join(zipsRoot, name));
  }
  for (const name of ['sheet_definitions', 'palette_definitions']) {
    cpSync(path.join(sourceAssetsRoot, name), path.join(releaseRoot, name), { recursive: true });
  }
  const spriteIndex = [];
  for (const zipName of readdirSync(zipsRoot).filter((name) => name.endsWith('.zip')).sort()) {
    if (zipName === 'sheet_definitions.zip' || zipName === 'palette_definitions.zip') continue;
    const entries = execFileSync('unzip', ['-Z1', path.join(zipsRoot, zipName)], { encoding: 'utf8' })
      .split(/\r?\n/u).filter((entry) => entry.length > 0 && !entry.endsWith('/'));
    for (const entry of entries) spriteIndex.push(`spritesheets/${zipName.slice(0, -4)}/${entry}`);
  }
  spriteIndex.sort();
  writeFileSync(path.join(releaseRoot, 'sprite-index.json'), JSON.stringify(spriteIndex, null, 2));
  const metadataFiles = [];
  for (const zipName of ['sheet_definitions.zip', 'palette_definitions.zip']) {
    const category = zipName.slice(0, -4);
    const zip = await JSZip.loadAsync(readFileSync(path.join(zipsRoot, zipName)));
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const contents = await entry.async('nodebuffer');
      metadataFiles.push({ path: `${category}/${entry.name}`, sizeBytes: contents.byteLength, sha256: sha256(contents) });
    }
  }
  metadataFiles.sort((left, right) => left.path.localeCompare(right.path));
  writeFileSync(path.join(releaseRoot, 'metadata-index.json'), JSON.stringify({ files: metadataFiles }, null, 2));
  return releaseRoot;
}

function waitForWebUrl(web, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('timed out waiting for web server URL')), timeoutMs);
    web.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/u);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    web.once('exit', (code, signal) => { clearTimeout(timeout); reject(new Error(`web server exited before listening (${code}, ${signal})`)); });
    web.once('error', reject);
  });
}

const pnpmCliPath = resolveNodeTool('corepack', 'dist', 'pnpm.js');
const npmCliPath = resolveNodeTool('npm', 'bin', 'npm-cli.js');
let packDir;
let installPrefix;
let emptyCwd;
let assetsBackupRoot;
let cacheRoot;

try {
  packDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-pack-'));
  installPrefix = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-install-'));
  emptyCwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-empty-cwd-'));

  if (existsSync(assetsRoot)) {
    const backupRoot = mkdtempSync(path.join(repoRoot, '.lpc-toolkit-assets-backup-'));
    try {
      renameSync(assetsRoot, path.join(backupRoot, 'assets'));
      assetsBackupRoot = backupRoot;
    } catch (error) {
      rmSync(backupRoot, { recursive: true, force: true });
      throw error;
    }
  }

  rmSync(path.join(packageRoot, 'dist'), { recursive: true, force: true });

  runNodeTool(pnpmCliPath, ['pack', '--pack-destination', packDir], {
    cwd: packageRoot,
    stdio: 'inherit',
  });

  const tarballNames = readdirSync(packDir).filter((entry) => entry === expectedTarballName);
  assert.equal(tarballNames.length, 1, `expected exactly one ${expectedTarballName}`);
  const tarballPath = path.join(packDir, tarballNames[0]);

  const listing = execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' });
  const entries = listing.split(/\r?\n/u).filter(Boolean);
  const requiredEntries = [
    'package/dist/web/index.html',
    'package/dist/asset-release.json',
    'package/dist/token-decode-metadata.json',
    'package/dist/vendor/@lpc-toolkit/core/dist/index.js',
    'package/dist/vendor/@lpc-toolkit/core/package.json',
    'package/dist/vendor/@lpc-toolkit/presets/dist/index.js',
    'package/dist/vendor/@lpc-toolkit/presets/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/package.json',
  ];

  for (const entry of requiredEntries) {
    assert.ok(entries.includes(entry), `packed tarball is missing ${entry}`);
  }

  assert.ok(
    entries.every((entry) => !entry.startsWith('package/src/')),
    'packed tarball must not include package/src/',
  );
  assert.ok(
    entries.every((entry) => !entry.startsWith('package/dist/web/zips/')),
    'packed tarball must not duplicate cached ZIP assets',
  );
  assert.ok(
    entries.every((entry) => !entry.startsWith('package/dist/web/spritesheets/')),
    'packed tarball must not include expanded spritesheets',
  );
  assert.ok(
    entries.every((entry) => !entry.startsWith('package/test/')),
    'packed tarball must not include package/test/',
  );
  assert.ok(
    entries.every((entry) => !/(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/iu.test(entry)),
    'packed tarball must not include TypeScript config files',
  );

  runNodeTool(npmCliPath, ['install', '--prefix', installPrefix, tarballPath], {
    stdio: 'inherit',
    env: { ...process.env, npm_config_cache: path.join(installPrefix, '.npm-cache') },
  });

  const installedBinPath = path.join(
    installPrefix,
    'node_modules',
    '.bin',
    isWindows ? 'lpc-toolkit.cmd' : 'lpc-toolkit',
  );
  assert.ok(existsSync(installedBinPath), `installed binary is missing at ${installedBinPath}`);

  const installedPackageRoot = path.join(
    installPrefix,
    'node_modules',
    '@lpc-toolkit',
    'cli',
  );
  const installedPackageJson = JSON.parse(
    readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8'),
  );
  const installedBinTarget = installedPackageJson.bin?.['lpc-toolkit'];
  assert.equal(typeof installedBinTarget, 'string', 'installed package is missing its bin target');
  const helpOutput = runNodeTool(path.resolve(installedPackageRoot, installedBinTarget), ['--help'], {
    encoding: 'utf8',
  });
  assert.match(helpOutput, /lpc-toolkit catalog types/u);

  const decodeResult = spawnSync(
    process.execPath,
    [
      path.resolve(installedPackageRoot, installedBinTarget),
      'token',
      'decode',
      '--token',
      'sex=male&hair=Braid',
      '--json',
    ],
    { cwd: emptyCwd, encoding: 'utf8' },
  );
  assert.equal(decodeResult.status, 0, decodeResult.stderr);
  assert.equal(decodeResult.stderr, '', 'token decode must not download runtime assets');
  const decodeOutput = JSON.parse(decodeResult.stdout);
  assert.equal(decodeOutput.data?.selection?.items?.hair?.name, 'Braid');

  cacheRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-cache-'));
  const releaseConfig = JSON.parse(readFileSync(path.join(installedPackageRoot, 'dist', 'asset-release.json'), 'utf8'));
  const fixtureRoot = await createManagedCacheFixture(
    cacheRoot,
    releaseConfig,
    path.join(assetsBackupRoot, 'assets'),
  );
  const web = spawn(
    process.execPath,
    [path.resolve(installedPackageRoot, installedBinTarget), 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'],
    {
      cwd: emptyCwd,
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const webUrl = await waitForWebUrl(web, 10_000);
  const indexResponse = await fetch(`${webUrl}/`);
  assert.equal(indexResponse.status, 200);
  assert.match(await indexResponse.text(), /<div id="root"><\/div>/u);
  const zipResponse = await fetch(`${webUrl}/zips/body.zip`);
  assert.equal(zipResponse.status, 200);
  assert.deepEqual(
    Buffer.from(await zipResponse.arrayBuffer()),
    readFileSync(path.join(fixtureRoot, 'zips', 'body.zip')),
  );
  web.kill('SIGTERM');
  const webResult = await new Promise((resolve) => web.once('exit', (code, signal) => resolve({ code, signal })));
  assert.deepEqual(webResult, { code: 143, signal: null });

  console.log('Packed CLI install smoke test passed.');
} finally {
  try {
    if (assetsBackupRoot !== undefined) {
      assert.ok(!existsSync(assetsRoot), 'cannot restore assets over an existing path');
      renameSync(path.join(assetsBackupRoot, 'assets'), assetsRoot);
      rmSync(assetsBackupRoot, { recursive: true, force: true });
    }
  } finally {
    if (packDir !== undefined) {
      rmSync(packDir, { recursive: true, force: true });
    }
    if (installPrefix !== undefined) {
      rmSync(installPrefix, { recursive: true, force: true });
    }
    if (emptyCwd !== undefined) {
      rmSync(emptyCwd, { recursive: true, force: true });
    }
    if (cacheRoot !== undefined) {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  }
}
