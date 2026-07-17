import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  installedCliInvocation,
  isExpectedWebTermination,
} from './installed-cli-command.mjs';
import { packedTarballName } from './package-archive-name.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
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

function waitForWebUrl(web, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    const timeout = setTimeout(() => reject(new Error('timed out waiting for web server URL')), timeoutMs);
    web.stderr.on('data', (chunk) => {
      errorOutput += chunk;
    });
    web.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/u);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    web.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`web server exited before listening (${code}, ${signal}): ${errorOutput.trim()}`));
    });
    web.once('error', reject);
  });
}

const pnpmCliPath = resolveNodeTool('corepack', 'dist', 'pnpm.js');
const npmCliPath = resolveNodeTool('npm', 'bin', 'npm-cli.js');
let packDir;
let installPrefix;
let emptyCwd;
let cacheRoot;
let presetRenderDir;

try {
  packDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-pack-'));
  installPrefix = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-install-'));
  emptyCwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-empty-cwd-'));

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
  const installedBinTargetPath = path.resolve(installedPackageRoot, installedBinTarget);
  assert.ok(
    existsSync(installedBinTargetPath),
    `installed bin target is missing at ${installedBinTargetPath}`,
  );
  const helpInvocation = installedCliInvocation({
    platform: process.platform,
    nodePath: process.execPath,
    shimPath: installedBinPath,
    targetPath: installedBinTargetPath,
    args: ['--help'],
  });
  const helpOutput = execFileSync(helpInvocation.command, helpInvocation.args, {
    encoding: 'utf8',
  });
  assert.match(helpOutput, /lpc-toolkit catalog types/u);

  const decodeInvocation = installedCliInvocation({
    platform: process.platform,
    nodePath: process.execPath,
    shimPath: installedBinPath,
    targetPath: installedBinTargetPath,
    args: [
      'token',
      'decode',
      '--token',
      'sex=male&hair=Braid',
      '--json',
    ],
  });
  const decodeResult = spawnSync(
    decodeInvocation.command,
    decodeInvocation.args,
    { cwd: emptyCwd, encoding: 'utf8' },
  );
  assert.equal(decodeResult.status, 0, decodeResult.stderr);
  assert.equal(decodeResult.stderr, '', 'token decode must not download runtime assets');
  const decodeOutput = JSON.parse(decodeResult.stdout);
  assert.equal(decodeOutput.data?.selection?.items?.hair?.name, 'Braid');

  cacheRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-cache-'));
  const webInvocation = installedCliInvocation({
    platform: process.platform,
    nodePath: process.execPath,
    shimPath: installedBinPath,
    targetPath: installedBinTargetPath,
    args: ['web', '--host', '127.0.0.1', '--port', '0', '--no-open'],
  });
  const web = spawn(
    webInvocation.command,
    webInvocation.args,
    {
      cwd: emptyCwd,
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const webUrl = await waitForWebUrl(web, 300_000);
  const indexResponse = await fetch(`${webUrl}/`);
  assert.equal(indexResponse.status, 200);
  assert.match(await indexResponse.text(), /<div id="root"><\/div>/u);
  const zipResponse = await fetch(`${webUrl}/zips/body.zip`);
  assert.equal(zipResponse.status, 200);
  assert.ok((await zipResponse.arrayBuffer()).byteLength > 0, 'cached body ZIP must not be empty');
  web.kill('SIGTERM');
  const webResult = await new Promise((resolve) => web.once('exit', (code, signal) => resolve({ code, signal })));
  assert.ok(
    isExpectedWebTermination(webResult),
    `unexpected web server termination: ${JSON.stringify(webResult)}`,
  );

  presetRenderDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-render-'));
  const presetRenderInvocation = installedCliInvocation({
    platform: process.platform,
    nodePath: process.execPath,
    shimPath: installedBinPath,
    targetPath: installedBinTargetPath,
    args: [
      'preset', 'render', 'farmer', '--out', presetRenderDir, '--bundle', 'zip', '--json',
    ],
  });
  const presetRenderResult = spawnSync(
    presetRenderInvocation.command,
    presetRenderInvocation.args,
    {
      cwd: emptyCwd,
      encoding: 'utf8',
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheRoot },
    },
  );
  assert.equal(presetRenderResult.status, 0, presetRenderResult.stderr);
  const presetRenderOutput = JSON.parse(presetRenderResult.stdout);
  const presetArtifacts = presetRenderOutput.data?.artifacts;
  assert.ok(Array.isArray(presetArtifacts), 'preset render JSON is missing artifacts');
  const viewerArtifact = presetArtifacts.find(({ type }) => type === 'viewer');
  const sheetArtifact = presetArtifacts.find(({ type }) => type === 'sheet');
  const zipArtifact = presetArtifacts.find(({ type }) => type === 'zip');
  assert.equal(typeof viewerArtifact?.path, 'string', 'preset render is missing viewer artifact');
  assert.equal(typeof sheetArtifact?.path, 'string', 'preset render is missing sheet artifact');
  assert.equal(typeof zipArtifact?.path, 'string', 'preset render is missing ZIP artifact');
  const viewerFileName = path.basename(viewerArtifact.path);
  const sheetFileName = path.basename(sheetArtifact.path);
  const viewerHtml = readFileSync(viewerArtifact.path, 'utf8');
  assert.match(viewerHtml, /id="viewer-data"/u);
  assert.ok(
    viewerHtml.includes(sheetFileName),
    `viewer is missing relative sheet filename ${sheetFileName}`,
  );
  const presetArchive = await JSZip.loadAsync(readFileSync(zipArtifact.path));
  assert.ok(
    presetArchive.file(viewerFileName) !== null,
    `preset render ZIP is missing ${viewerFileName}`,
  );

  function runInstalled(args) {
    const invocation = installedCliInvocation({
      platform: process.platform,
      nodePath: process.execPath,
      shimPath: installedBinPath,
      targetPath: installedBinTargetPath,
      args,
    });
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: emptyCwd,
      encoding: 'utf8',
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }

  runInstalled(['character', 'create', 'packed-hero', '--preset', 'farmer']);
  const searchOutput = runInstalled([
    'character', 'search', 'packed-hero', '--type', 'hair', '--query', 'braid',
  ]);
  assert.match(searchOutput, /hair\/Braid \[hair_braid\]/u);
  const setOutput = runInstalled([
    'character', 'set', 'packed-hero', '--type', 'hair', '--item', 'hair_braid',
    '--recolor', 'lpcr.brown',
  ]);
  assert.match(setOutput, /Updated packed-hero: hair = Braid/u);

  runInstalled(['character', 'preview', 'packed-hero']);
  const previewDir = path.join(emptyCwd, 'characters', 'previews', 'packed-hero');
  for (const fileName of [
    'packed-hero.preview.png',
    'packed-hero.metadata.json',
    'packed-hero.credits.txt',
    'packed-hero.credits.csv',
  ]) {
    assert.ok(existsSync(path.join(previewDir, fileName)), `preview is missing ${fileName}`);
  }

  const renderDir = path.join(emptyCwd, 'rendered-packed-hero');
  runInstalled([
    'character', 'render', 'packed-hero', '--out', renderDir,
    '--animation', 'walk', '--bundle', 'zip',
  ]);
  for (const fileName of [
    'packed-hero.sheet.png',
    'packed-hero.metadata.json',
    'packed-hero.credits.txt',
    'packed-hero.credits.csv',
  ]) {
    assert.ok(existsSync(path.join(renderDir, fileName)), `render is missing ${fileName}`);
  }

  console.log('Packed CLI install smoke test passed.');
} finally {
  try {
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
    if (presetRenderDir !== undefined) {
      rmSync(presetRenderDir, { recursive: true, force: true });
    }
  }
}
