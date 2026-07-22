import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
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

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeWalkPng(filePath) {
  const canvas = createCanvas(9 * 64, 4 * 64);
  const context = canvas.getContext('2d');
  context.fillStyle = '#9955cc';
  context.fillRect(0, 0, canvas.width, canvas.height);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function parseViewerData(viewerHtml) {
  const marker = '<script id="viewer-data" type="application/json">';
  const markerIndex = viewerHtml.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'viewer is missing viewer-data marker');
  const payloadStart = markerIndex + marker.length;
  const payloadEnd = viewerHtml.indexOf('</script>', payloadStart);
  assert.notEqual(payloadEnd, -1, 'viewer-data script is missing its closing tag');
  assert.equal(
    viewerHtml.indexOf(marker, payloadStart),
    -1,
    'viewer must contain exactly one viewer-data payload',
  );
  return JSON.parse(viewerHtml.slice(payloadStart, payloadEnd));
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

  const workspaceRoot = path.join(emptyCwd, 'my-lpc-art');
  const workspaceCacheRoot = path.join(emptyCwd, '.workspace-cache');
  const workspaceInvocation = installedCliInvocation({
    platform: process.platform,
    nodePath: process.execPath,
    shimPath: installedBinPath,
    targetPath: installedBinTargetPath,
    args: ['asset', 'workspace', 'init', workspaceRoot, '--json'],
  });
  const workspaceResult = spawnSync(
    workspaceInvocation.command,
    workspaceInvocation.args,
    {
      cwd: emptyCwd,
      encoding: 'utf8',
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: workspaceCacheRoot },
    },
  );
  assert.equal(workspaceResult.status, 0, workspaceResult.stderr);
  assert.equal(
    workspaceResult.stderr,
    '',
    'asset workspace init must not prepare or download runtime assets',
  );
  assert.equal(
    existsSync(workspaceCacheRoot),
    false,
    'asset workspace init must not create the managed cache root',
  );
  assert.equal(existsSync(path.join(emptyCwd, '.git')), false);
  assert.equal(existsSync(path.join(emptyCwd, 'assets')), false);
  assert.equal(existsSync(path.join(workspaceRoot, '.git')), false);
  assert.equal(existsSync(path.join(workspaceRoot, 'assets')), false);

  const workspaceOutput = JSON.parse(workspaceResult.stdout);
  assert.equal(workspaceOutput.ok, true);
  assert.equal(workspaceOutput.command, 'asset workspace init');
  assert.equal(workspaceOutput.data?.root, workspaceRoot);
  assert.equal(
    workspaceOutput.data?.configPath,
    path.join(workspaceRoot, 'lpc-asset-workspace.json'),
  );
  assert.equal(workspaceOutput.data?.packsRoot, path.join(workspaceRoot, 'artist-packs'));
  assert.equal(workspaceOutput.data?.outputRoot, path.join(workspaceRoot, 'assets_custom'));
  assert.equal(
    workspaceOutput.data?.stateRoot,
    path.join(workspaceRoot, '.lpc-toolkit', 'asset-packs'),
  );
  assert.equal(
    workspaceOutput.data?.registryPath,
    path.join(workspaceRoot, '.lpc-toolkit', 'asset-packs', 'registry.json'),
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(workspaceRoot, 'lpc-asset-workspace.json'), 'utf8')),
    {
      schema: 'lpc-toolkit.asset-workspace.v1',
      packsDirectory: 'artist-packs',
      outputDirectory: 'assets_custom',
      stateDirectory: '.lpc-toolkit/asset-packs',
    },
  );
  assert.deepEqual(readdirSync(path.join(workspaceRoot, 'artist-packs')), []);
  const outputMarker = JSON.parse(
    readFileSync(
      path.join(workspaceRoot, 'assets_custom', '.lpc-toolkit-managed.json'),
      'utf8',
    ),
  );
  assert.equal(outputMarker.schema, 'lpc-toolkit.asset-output.v1');
  assert.equal(typeof outputMarker.workspaceId, 'string');
  assert.ok(outputMarker.workspaceId.length > 0);
  assert.deepEqual(
    readdirSync(path.join(workspaceRoot, 'assets_custom')),
    ['.lpc-toolkit-managed.json'],
  );
  assert.deepEqual(
    readdirSync(path.join(workspaceRoot, '.lpc-toolkit', 'asset-packs')).sort(),
    ['installed', 'staging', 'validation'],
  );

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
  const viewerData = parseViewerData(viewerHtml);
  const viewerSheetFileName = viewerData.sheet?.fileName;
  assert.equal(typeof viewerSheetFileName, 'string', 'viewer-data is missing sheet.fileName');
  assert.equal(
    viewerSheetFileName,
    sheetFileName,
    'viewer-data sheet filename must match the rendered sheet basename',
  );
  assert.equal(path.posix.isAbsolute(viewerSheetFileName), false);
  assert.equal(path.win32.isAbsolute(viewerSheetFileName), false);
  assert.equal(path.posix.basename(viewerSheetFileName), viewerSheetFileName);
  assert.equal(path.win32.basename(viewerSheetFileName), viewerSheetFileName);
  assert.equal(viewerSheetFileName.includes('/'), false, 'viewer sheet filename contains /');
  assert.equal(viewerSheetFileName.includes('\\'), false, 'viewer sheet filename contains \\');
  const presetArchive = await JSZip.loadAsync(readFileSync(zipArtifact.path));
  assert.ok(
    presetArchive.file(viewerFileName) !== null,
    `preset render ZIP is missing ${viewerFileName}`,
  );

  function runInstalled(args, cwd = emptyCwd) {
    const invocation = installedCliInvocation({
      platform: process.platform,
      nodePath: process.execPath,
      shimPath: installedBinPath,
      targetPath: installedBinTargetPath,
      args,
    });
    const result = spawnSync(invocation.command, invocation.args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheRoot },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }

  function runInstalledJson(args, cwd = emptyCwd) {
    return JSON.parse(runInstalled([...args, '--json'], cwd));
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

  const cacheSentinelPath = path.join(cacheRoot, 'packed-smoke-sentinel.txt');
  writeFileSync(cacheSentinelPath, 'prepared pinned cache must stay unchanged\n');

  const scaffoldOutput = runInstalledJson([
    'asset', 'init', '--new',
    '--pack-id', 'smoke.packed-hair',
    '--version', '1.0.0',
    '--asset-id', 'violet-hair',
    '--display-name', 'Packed Violet Hair',
    '--type', 'hair',
    '--body-type', 'male',
    '--animation', 'walk',
    '--author', 'Packed Smoke Artist',
    '--license', 'CC-BY-SA 4.0',
    '--url', 'https://example.test/packed-smoke',
  ], workspaceRoot);
  assert.equal(scaffoldOutput.ok, true);
  const packRoot = scaffoldOutput.data?.packRoot;
  const manifestPath = scaffoldOutput.data?.manifestPath;
  assert.equal(typeof packRoot, 'string', 'asset init is missing packRoot');
  assert.equal(typeof manifestPath, 'string', 'asset init is missing manifestPath');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const spriteSource = manifest.assets?.[0]?.layers?.[0]?.sprites?.[0]?.source;
  assert.equal(typeof spriteSource, 'string', 'scaffold is missing its sprite source');
  writeWalkPng(path.join(packRoot, ...spriteSource.split('/')));

  const validationOutput = runInstalledJson([
    'asset', 'validate', packRoot,
  ], workspaceRoot);
  assert.equal(validationOutput.data?.valid, true);
  const packOutput = runInstalledJson(['asset', 'pack', packRoot], workspaceRoot);
  assert.equal(packOutput.ok, true);
  const archivePath = packOutput.data?.archivePath;
  assert.equal(typeof archivePath, 'string', 'asset pack is missing archivePath');
  assert.ok(
    path.relative(
      realpathSync.native(workspaceRoot),
      realpathSync.native(archivePath),
    ).startsWith('artist-packs'),
    'packed archive must stay below the author workspace',
  );

  const installedWorkspaceRoot = path.join(emptyCwd, 'installed-lifecycle');
  const installedWorkspaceOutput = runInstalledJson([
    'asset', 'workspace', 'init', installedWorkspaceRoot,
  ]);
  assert.equal(installedWorkspaceOutput.data?.root, installedWorkspaceRoot);
  const inspectionOutput = runInstalledJson([
    'asset', 'inspect', archivePath,
  ], installedWorkspaceRoot);
  assert.deepEqual(
    {
      valid: inspectionOutput.data?.valid,
      packId: inspectionOutput.data?.packId,
      version: inspectionOutput.data?.version,
    },
    { valid: true, packId: 'smoke.packed-hair', version: '1.0.0' },
  );
  const installOutput = runInstalledJson([
    'asset', 'install', archivePath,
  ], installedWorkspaceRoot);
  assert.deepEqual(
    {
      action: installOutput.data?.action,
      packId: installOutput.data?.packId,
      version: installOutput.data?.version,
    },
    { action: 'installed', packId: 'smoke.packed-hair', version: '1.0.0' },
  );
  const listOutput = runInstalledJson(['asset', 'list'], installedWorkspaceRoot);
  assert.deepEqual(
    listOutput.data?.entries?.map(({ packId, version, kind }) => ({ packId, version, kind })),
    [{ packId: 'smoke.packed-hair', version: '1.0.0', kind: 'installed' }],
  );

  writeJson(
    path.join(
      installedWorkspaceRoot,
      'characters',
      'packed-asset.selection.json',
    ),
    {
      schema: 'lpc-toolkit.selection.v1',
      name: 'packed-asset',
      bodyType: 'male',
      items: { hair: { name: 'smoke.packed-hair--violet-hair' } },
    },
  );
  runInstalled([
    'character', 'preview', 'packed-asset', '--animation', 'walk',
  ], installedWorkspaceRoot);
  const installedPreviewRoot = path.join(
    installedWorkspaceRoot,
    'characters',
    'previews',
    'packed-asset',
  );
  const installedPreviewTxt = readFileSync(
    path.join(installedPreviewRoot, 'packed-asset.credits.txt'),
    'utf8',
  );
  const installedPreviewCsv = readFileSync(
    path.join(installedPreviewRoot, 'packed-asset.credits.csv'),
    'utf8',
  );
  assert.match(installedPreviewTxt, /Packed Smoke Artist/u);
  assert.match(installedPreviewCsv, /Packed Smoke Artist/u);

  const installedRenderRoot = path.join(installedWorkspaceRoot, 'rendered-packed-asset');
  runInstalled([
    'character', 'render', 'packed-asset',
    '--out', installedRenderRoot,
    '--animation', 'walk',
  ], installedWorkspaceRoot);
  assert.match(
    readFileSync(path.join(installedRenderRoot, 'packed-asset.credits.txt'), 'utf8'),
    /Packed Smoke Artist/u,
  );
  assert.match(
    readFileSync(path.join(installedRenderRoot, 'packed-asset.credits.csv'), 'utf8'),
    /Packed Smoke Artist/u,
  );

  const doctorOutput = runInstalledJson(['asset', 'doctor'], installedWorkspaceRoot);
  assert.equal(doctorOutput.data?.healthy, true);
  assert.deepEqual(
    doctorOutput.data?.packs?.map(({ packId, kind }) => ({ packId, kind })),
    [{ packId: 'smoke.packed-hair', kind: 'installed' }],
  );
  const removeOutput = runInstalledJson([
    'asset', 'remove', 'smoke.packed-hair',
  ], installedWorkspaceRoot);
  assert.deepEqual(
    {
      packId: removeOutput.data?.packId,
      removedKind: removeOutput.data?.removedKind,
      remainingCount: removeOutput.data?.remainingCount,
    },
    { packId: 'smoke.packed-hair', removedKind: 'installed', remainingCount: 0 },
  );
  assert.deepEqual(
    runInstalledJson(['asset', 'list'], installedWorkspaceRoot).data?.entries,
    [],
  );
  assert.equal(
    readFileSync(cacheSentinelPath, 'utf8'),
    'prepared pinned cache must stay unchanged\n',
  );
  assert.equal(existsSync(path.join(installedWorkspaceRoot, '.git')), false);
  assert.equal(existsSync(path.join(installedWorkspaceRoot, 'assets')), false);
  assert.equal(existsSync(path.join(emptyCwd, 'upstream')), false);

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
