import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function releaseCreditDigest(manifest) {
  return sha256(Buffer.from(JSON.stringify(canonicalize({
    credits: manifest.credits,
    creditOverrides: manifest.creditOverrides ?? {},
  }))));
}

function digestFile(filePath) {
  return sha256(readFileSync(filePath));
}

function writeAuthoringCandidate(filePath, target, colorOffset = 0) {
  const canvas = createCanvas(target.geometry.canvasWidth, target.geometry.canvasHeight);
  const context = canvas.getContext('2d');
  for (const cell of target.cells) {
    if (cell.policy !== 'required-drawn') continue;
    context.fillStyle = `rgb(${48 + cell.sourceRow * 17 + colorOffset}, ${90 + cell.sourceColumn * 13}, 160)`;
    context.fillRect(
      cell.sourceColumn * target.geometry.frameWidth + 8,
      cell.sourceRow * target.geometry.frameHeight + 8,
      target.geometry.frameWidth - 16,
      target.geometry.frameHeight - 16,
    );
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = canvas.toBuffer('image/png');
  writeFileSync(filePath, bytes);
  return bytes;
}

async function writeDraftArchive(formalArchivePath, draftArchivePath) {
  const archive = await JSZip.loadAsync(readFileSync(formalArchivePath));
  const files = new Map();
  for (const entry of Object.values(archive.files)) {
    const normalizedEntryName = entry.name.replace(/\/\.$/u, '/');
    if (
      entry.dir
      || entry.name.endsWith('/')
      || entry.name.endsWith('/.')
      || normalizedEntryName.endsWith('/')
      || entry.name === 'checksums.json'
    ) continue;
    files.set(entry.name, Buffer.from(await entry.async('nodebuffer')));
  }
  const manifest = JSON.parse(files.get('asset-pack.json').toString('utf8'));
  files.set('asset-pack.json', Buffer.from(JSON.stringify({ ...manifest, status: 'draft' })));
  const checksums = {
    schema: 'lpc-toolkit.asset-pack-checksums.v1',
    files: [...files].sort(([left], [right]) => left.localeCompare(right)).map(([entryPath, bytes]) => ({
      path: entryPath,
      size: bytes.byteLength,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    })),
  };
  const output = new JSZip();
  for (const [entryPath, bytes] of files) output.file(entryPath, bytes, { createFolders: false });
  output.file('checksums.json', JSON.stringify(checksums));
  writeFileSync(draftArchivePath, await output.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
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
    'package/dist/vendor/@lpc-toolkit/asset-pack-format/dist/index.js',
    'package/dist/vendor/@lpc-toolkit/asset-pack-format/package.json',
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
    assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
    return result.stdout;
  }

  function runInstalledJson(args, cwd = emptyCwd) {
    return JSON.parse(runInstalled([...args, '--json'], cwd));
  }

  function runInstalledResult(args, cwd = emptyCwd) {
    const invocation = installedCliInvocation({
      platform: process.platform,
      nodePath: process.execPath,
      shimPath: installedBinPath,
      targetPath: installedBinTargetPath,
      args: [...args, '--json'],
    });
    return spawnSync(invocation.command, invocation.args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheRoot },
    });
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

  const generatedOutputRoot = path.join(workspaceRoot, 'assets_custom');
  const generatedOutputMarkerPath = path.join(generatedOutputRoot, '.lpc-toolkit-managed.json');
  const generatedOutputBefore = readdirSync(generatedOutputRoot).sort();
  const generatedOutputMarkerBefore = readFileSync(generatedOutputMarkerPath, 'utf8');
  const canonicalWorkspaceRoot = realpathSync.native(workspaceRoot);
  const unownedOutputPath = path.join(workspaceRoot, 'artist-notes', 'unowned.txt');
  mkdirSync(path.dirname(unownedOutputPath), { recursive: true });
  writeFileSync(unownedOutputPath, 'user-owned output must remain untouched\n');

  const capabilitiesOutput = runInstalledJson(['capabilities']);
  assert.equal(capabilitiesOutput.ok, true);
  assert.equal(capabilitiesOutput.command, 'capabilities');
  assert.ok(capabilitiesOutput.data?.capabilities.includes('asset-authoring-session.v1'));
  assert.ok(capabilitiesOutput.data?.capabilities.includes('asset-authoring-consumer-install.v1'));
  assert.ok(capabilitiesOutput.data?.capabilities.includes('sprite-drawing-contract.v1'));
  assert.ok(capabilitiesOutput.data?.schemaVersions.includes('lpc-toolkit.asset-authoring-plan.v1'));
  assert.ok(capabilitiesOutput.data?.schemaVersions.includes('lpc-toolkit.asset-authoring-install-receipt.v1'));

  const authoringPlanPath = path.join(emptyCwd, 'packed-authoring-plan.json');
  writeJson(authoringPlanPath, {
    schema: 'lpc-toolkit.asset-authoring-plan.v1',
    goal: 'new-item',
    pack: {
      id: 'smoke.packed-authoring',
      version: '1.0.0',
      displayName: 'Packed Authoring Smoke',
    },
    asset: {
      kind: 'new-item',
      localId: 'moon-braid',
      displayName: 'Moon Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      layers: [{ id: 'foreground', zPos: 120, bodyTypes: ['male', 'female'] }],
    },
    scope: {
      packId: 'smoke.packed-authoring',
      assetId: 'moon-braid',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      paths: ['sprites/moon-braid/foreground/walk.png'],
    },
    draftCredits: {
      authors: ['Packed Authoring Artist'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/packed-authoring'],
      notes: 'Packed authoring smoke attribution.',
    },
  });

  const authoringStart = runInstalledJson([
    'asset', 'authoring', 'start', '--plan', authoringPlanPath,
  ], workspaceRoot);
  assert.equal(authoringStart.ok, true);
  const authoringStartData = authoringStart.data;
  assert.equal(authoringStartData?.phase, 'scaffolded');
  assert.equal(authoringStartData?.reason, 'scaffolded');
  assert.equal(Array.isArray(authoringStartData?.nextActions), true);
  assert.deepEqual(authoringStartData?.nextActions.map(({ id }) => id), ['create-contract']);
  assert.equal(typeof authoringStartData?.sessionId, 'string');
  const authoringSessionId = authoringStartData.sessionId;
  const authoringPackRoot = realpathSync.native(path.join(
    workspaceRoot,
    'artist-packs',
    'smoke.packed-authoring',
  ));
  const authoringManifestPath = path.join(authoringPackRoot, 'asset-pack.json');
  assert.equal(authoringStartData?.manifestDigest, digestFile(authoringManifestPath));
  const startPackArtifact = authoringStartData?.artifacts.find(({ id }) => id === 'pack');
  assert.equal(startPackArtifact?.path, authoringPackRoot);
  assert.equal(startPackArtifact?.digest, digestFile(authoringManifestPath));
  assert.deepEqual(
    authoringStartData?.nextActions[0]?.preconditionDigests,
    [authoringStartData.manifestDigest],
  );

  const authoringContractOutput = runInstalledJson([
    'asset', 'authoring', 'contract', '--session', authoringSessionId,
  ], workspaceRoot);
  assert.equal(authoringContractOutput.ok, true);
  const authoringContractData = authoringContractOutput.data;
  assert.equal(authoringContractData?.phase, 'contract-ready');
  assert.equal(Array.isArray(authoringContractData?.nextActions), true);
  assert.deepEqual(authoringContractData?.nextActions, []);
  const authoringContractArtifact = authoringContractData?.artifacts.find(({ id }) => id === 'contract');
  assert.ok(authoringContractArtifact);
  assert.equal(digestFile(authoringContractArtifact.path), authoringContractArtifact.digest);
  assert.equal(authoringContractData.checkpoint?.digest, authoringContractArtifact.digest);
  const authoringContract = JSON.parse(
    readFileSync(authoringContractArtifact.path, 'utf8'),
  );
  assert.equal(authoringContract.targets.length, 1);
  const authoringTarget = authoringContract.targets[0];
  assert.ok(authoringTarget);
  assert.deepEqual(authoringTarget.bodyTypes, ['male', 'female']);
  const authoringContractDigest = authoringContractArtifact.digest;
  const authoringCandidatePath = path.join(
    canonicalWorkspaceRoot,
    'authoring-candidates',
    'walk.png',
  );
  writeAuthoringCandidate(authoringCandidatePath, authoringTarget);
  const authoringCandidateDigest = digestFile(authoringCandidatePath);

  const authoringImportOutput = runInstalledJson([
    'asset', 'authoring', 'import',
    '--session', authoringSessionId,
    '--target', authoringTarget.id,
    '--candidate', authoringCandidatePath,
    '--contract-digest', authoringContractDigest,
  ], workspaceRoot);
  assert.equal(authoringImportOutput.ok, true);
  const authoringImportData = authoringImportOutput.data;
  assert.equal(authoringImportData?.phase, 'imported');
  assert.equal(authoringImportData?.reason, 'candidate-imported');
  assert.equal(Array.isArray(authoringImportData?.nextActions), true);
  assert.deepEqual(authoringImportData?.nextActions.map(({ id }) => id), ['validate-session']);
  const importedCandidateArtifact = authoringImportData?.artifacts.find(({ id }) => id === 'candidate');
  const importedTargetArtifact = authoringImportData?.artifacts.find(({ id }) => id === `target:${authoringTarget.id}`);
  assert.equal(importedCandidateArtifact?.digest, authoringCandidateDigest);
  assert.ok(importedTargetArtifact);
  const authoringTargetPath = path.join(authoringPackRoot, ...authoringTarget.path.split('/'));
  assert.equal(importedTargetArtifact.digest, digestFile(authoringTargetPath));
  assert.equal(authoringImportData.checkpoint?.digest, importedTargetArtifact.digest);

  let authoringValidationOutput = runInstalledJson([
    'asset', 'authoring', 'validate', '--session', authoringSessionId,
  ], workspaceRoot);
  assert.equal(authoringValidationOutput.ok, true);
  let authoringValidationData = authoringValidationOutput.data;
  assert.equal(Array.isArray(authoringValidationData?.nextActions), true);
  assert.ok(authoringValidationData?.validation);
  assert.equal(authoringValidationData.validation.sourceDigests?.[0]?.digest, digestFile(authoringTargetPath));
  assert.equal(authoringValidationData.validation.manifestDigest, digestFile(authoringManifestPath));
  if (!authoringValidationData.validation.valid) {
    assert.ok(authoringValidationData.validation.acknowledgementRecords.length > 0);
    const manifest = JSON.parse(readFileSync(authoringManifestPath, 'utf8'));
    writeJson(authoringManifestPath, {
      ...manifest,
      acknowledgements: authoringValidationData.validation.acknowledgementRecords.map((record) => ({
        ...record,
        reason: 'Reviewed the packed public session validation evidence.',
      })),
    });
    const externalManifestDigest = digestFile(authoringManifestPath);
    const manifestConflict = runInstalledJson([
      'asset', 'authoring', 'resume', '--session', authoringSessionId,
    ], workspaceRoot);
    assert.equal(manifestConflict.ok, true);
    assert.equal(manifestConflict.data?.reason, 'manifest-conflict');
    assert.deepEqual(
      manifestConflict.data?.nextActions.map(({ id }) => id),
      ['adopt-external-manifest', 'restore-session-manifest'],
    );
    const manifestReconciled = runInstalledJson([
      'asset', 'authoring', 'reconcile-manifest',
      '--session', authoringSessionId,
      '--use', 'external',
      '--expected-external-digest', externalManifestDigest,
    ], workspaceRoot);
    assert.equal(manifestReconciled.ok, true);
    assert.equal(manifestReconciled.data?.reason, 'manifest-adopted');
    assert.deepEqual(manifestReconciled.data?.nextActions.map(({ id }) => id), ['create-contract']);
    authoringValidationOutput = runInstalledJson([
      'asset', 'authoring', 'validate', '--session', authoringSessionId,
    ], workspaceRoot);
    authoringValidationData = authoringValidationOutput.data;
  }
  assert.equal(authoringValidationData?.validation?.valid, true);
  assert.equal(authoringValidationData?.phase, 'validated');
  assert.deepEqual(authoringValidationData?.nextActions.map(({ id }) => id), ['preview-session']);
  assert.match(authoringValidationData?.checkpoint?.digest ?? '', /^sha256:[0-9a-f]{64}$/u);

  const authoringPreviewOutput = runInstalledJson([
    'asset', 'authoring', 'preview',
    '--session', authoringSessionId,
    '--body-type', 'male',
    '--animation', 'walk',
  ], workspaceRoot);
  assert.equal(authoringPreviewOutput.ok, true);
  const authoringPreviewData = authoringPreviewOutput.data;
  assert.equal(authoringPreviewData?.phase, 'previewed');
  assert.equal(authoringPreviewData?.reason, 'preview-current');
  assert.deepEqual(authoringPreviewData?.nextActions.map(({ id }) => id), ['declare-release']);
  assert.equal(authoringPreviewData?.preview?.input.bodyType, 'male');
  assert.equal(authoringPreviewData?.preview?.input.animation, 'walk');
  assert.equal(authoringPreviewData?.preview?.manifestDigest, authoringValidationData?.validation?.manifestDigest);
  assert.deepEqual(
    authoringPreviewData?.preview?.sourceDigests,
    authoringValidationData?.validation?.sourceDigests,
  );
  assert.equal(authoringPreviewData?.preview?.artifacts.length, 4);
  for (const artifact of authoringPreviewData.preview.artifacts) {
    assert.equal(digestFile(artifact.path), artifact.digest);
    assert.ok(artifact.path.startsWith(`${authoringPackRoot}${path.sep}`));
  }
  assert.match(
    readFileSync(
      authoringPreviewData.preview.artifacts.find(({ id }) => id === 'preview:credits_txt').path,
      'utf8',
    ),
    /Packed Authoring Artist/u,
  );

  const interruptedAuthoring = runInstalledJson([
    'asset', 'authoring', 'status', '--session', authoringSessionId,
  ], workspaceRoot);
  assert.equal(interruptedAuthoring.ok, true);
  assert.deepEqual(
    {
      phase: interruptedAuthoring.data?.phase,
      reason: interruptedAuthoring.data?.reason,
      checkpointFreshness: interruptedAuthoring.data?.checkpointFreshness,
      nextActions: interruptedAuthoring.data?.nextActions.map(({ id }) => id),
    },
    {
      phase: 'previewed',
      reason: 'preview-current',
      checkpointFreshness: 'current',
      nextActions: ['declare-release'],
    },
  );
  const resumedAuthoring = runInstalledJson([
    'asset', 'authoring', 'resume', '--session', authoringSessionId,
  ], workspaceRoot);
  assert.equal(resumedAuthoring.ok, true);
  assert.equal(resumedAuthoring.data?.reason, 'preview-current');
  assert.deepEqual(resumedAuthoring.data?.nextActions.map(({ id }) => id), ['declare-release']);

  const externalBytes = writeAuthoringCandidate(
    path.join(canonicalWorkspaceRoot, 'external-authoring.png'),
    authoringTarget,
    7,
  );
  writeFileSync(authoringTargetPath, externalBytes);
  const externalTargetDigest = sha256(externalBytes);
  const driftOutput = runInstalledJson([
    'asset', 'authoring', 'resume', '--session', authoringSessionId,
  ], workspaceRoot);
  assert.equal(driftOutput.ok, true);
  assert.equal(driftOutput.data?.phase, 'blocked');
  assert.equal(driftOutput.data?.reason, 'external-png-drift');
  assert.equal(driftOutput.data?.checkpointFreshness, 'stale');
  assert.deepEqual(driftOutput.data?.nextActions.map(({ id }) => id), ['review-external-png']);
  assert.deepEqual(driftOutput.data?.nextActions.map(({ safety }) => safety), ['safe']);
  assert.ok(driftOutput.data?.sourceDigests.includes(externalTargetDigest));

  const correctionPath = path.join(canonicalWorkspaceRoot, 'authoring-candidates', 'walk-correction.png');
  writeAuthoringCandidate(correctionPath, authoringTarget, 13);
  const correctionOutput = runInstalledJson([
    'asset', 'authoring', 'import',
    '--session', authoringSessionId,
    '--target', authoringTarget.id,
    '--candidate', correctionPath,
    '--contract-digest', authoringContractDigest,
    '--replace-existing',
    '--expected-target-digest', externalTargetDigest,
  ], workspaceRoot);
  assert.equal(correctionOutput.ok, true);
  assert.equal(correctionOutput.data?.phase, 'imported');
  assert.equal(correctionOutput.data?.reason, 'candidate-imported');
  assert.deepEqual(correctionOutput.data?.nextActions.map(({ id }) => id), ['validate-session']);
  const correctionTargetArtifact = correctionOutput.data?.artifacts.find(({ id }) => id === `target:${authoringTarget.id}`);
  assert.ok(correctionTargetArtifact);
  assert.equal(correctionTargetArtifact.digest, digestFile(authoringTargetPath));
  assert.equal(correctionOutput.data.checkpoint?.digest, correctionTargetArtifact.digest);

  let currentValidationOutput = runInstalledJson([
    'asset', 'authoring', 'validate', '--session', authoringSessionId,
  ], workspaceRoot);
  assert.equal(currentValidationOutput.ok, true);
  let currentValidationData = currentValidationOutput.data;
  if (!currentValidationData?.validation?.valid) {
    assert.ok(currentValidationData?.validation?.acknowledgementRecords.length > 0);
    const acknowledgementPath = path.join(
      canonicalWorkspaceRoot,
      'packed-release-acknowledgement.json',
    );
    writeJson(acknowledgementPath, {
      ...currentValidationData.validation.acknowledgementRecords[0],
      reason: 'Reviewed the corrected packed session validation evidence.',
    });
    currentValidationOutput = runInstalledJson([
      'asset', 'authoring', 'acknowledge',
      '--session', authoringSessionId,
      '--acknowledgement', acknowledgementPath,
      '--confirm',
    ], workspaceRoot);
    assert.equal(currentValidationOutput.ok, true);
    currentValidationData = currentValidationOutput.data;
  }
  assert.equal(currentValidationData?.validation?.valid, true, JSON.stringify(currentValidationData));
  assert.equal(currentValidationData?.phase, 'validated');
  assert.deepEqual(currentValidationData?.nextActions.map(({ id }) => id), ['preview-session']);
  assert.equal(
    currentValidationData?.validation?.sourceDigests?.[0]?.digest,
    digestFile(authoringTargetPath),
  );

  const currentPreviewOutput = runInstalledJson([
    'asset', 'authoring', 'preview',
    '--session', authoringSessionId,
    '--body-type', 'female',
    '--animation', 'walk',
  ], workspaceRoot);
  assert.equal(currentPreviewOutput.ok, true);
  const currentPreviewData = currentPreviewOutput.data;
  assert.equal(currentPreviewData?.phase, 'previewed');
  assert.equal(currentPreviewData?.reason, 'preview-current');
  assert.equal(currentPreviewData?.preview?.input.bodyType, 'female');
  assert.equal(currentPreviewData?.preview?.input.animation, 'walk');
  assert.equal(currentPreviewData?.preview?.artifacts.length, 4);
  for (const artifact of currentPreviewData.preview.artifacts) {
    assert.equal(digestFile(artifact.path), artifact.digest);
  }

  const currentManifest = JSON.parse(readFileSync(authoringManifestPath, 'utf8'));
  const authoringSessionPath = path.join(
    workspaceRoot,
    '.lpc-toolkit',
    'asset-packs',
    'authoring-sessions',
    authoringSessionId,
    'session.json',
  );
  const authoringSession = JSON.parse(readFileSync(authoringSessionPath, 'utf8'));
  const declarationPath = path.join(canonicalWorkspaceRoot, 'packed-release-declaration.json');
  writeJson(declarationPath, {
    schema: 'lpc-toolkit.asset-release-declaration.v1',
    expectedManifestDigest: digestFile(authoringManifestPath),
    declarant: {
      displayName: 'Packed Release Declarant',
      kind: 'person',
      role: 'authorized-release-declarant',
    },
    authorAndSource: {
      confirmed: true,
      creditDigest: releaseCreditDigest(currentManifest),
    },
    licenseAuthority: {
      confirmed: true,
      creditDigest: releaseCreditDigest(currentManifest),
    },
    acknowledgements: {
      confirmed: true,
      contentDigest: currentValidationData.validation.contentDigest,
      recordDigests: authoringSession.receipts.acknowledgements?.recordDigests ?? [],
    },
  });
  const declarationPending = runInstalledJson([
    'asset', 'authoring', 'declare',
    '--session', authoringSessionId,
    '--declaration', declarationPath,
  ], workspaceRoot);
  assert.equal(declarationPending.data?.reason, 'release-declaration-confirmation-required');
  const declarationOutput = runInstalledJson([
    'asset', 'authoring', 'declare',
    '--session', authoringSessionId,
    '--declaration', declarationPath,
    '--confirm',
  ], workspaceRoot);
  assert.equal(declarationOutput.data?.reason, 'release-declaration-current');

  const currentPreviewDigest = currentPreviewData.preview.artifacts
    .find(({ id }) => id === 'preview:preview')?.digest;
  assert.equal(typeof currentPreviewDigest, 'string');
  const acceptancePending = runInstalledJson([
    'asset', 'authoring', 'accept-preview',
    '--session', authoringSessionId,
    '--preview-digest', currentPreviewDigest,
  ], workspaceRoot);
  assert.equal(acceptancePending.data?.reason, 'preview-acceptance-confirmation-required');
  const acceptanceOutput = runInstalledJson([
    'asset', 'authoring', 'accept-preview',
    '--session', authoringSessionId,
    '--preview-digest', currentPreviewDigest,
    '--confirm',
  ], workspaceRoot);
  assert.equal(acceptanceOutput.data?.reason, 'preview-acceptance-current');
  assert.equal(acceptanceOutput.data?.releaseGates?.releaseReady, true);

  const formalPending = runInstalledJson([
    'asset', 'authoring', 'pack', '--session', authoringSessionId,
  ], workspaceRoot);
  assert.equal(formalPending.data?.reason, 'formal-pack-confirmation-required');
  assert.equal(formalPending.data?.formalArchiveReceipt, null);
  const formalOutput = runInstalledJson([
    'asset', 'authoring', 'pack', '--session', authoringSessionId, '--confirm',
  ], workspaceRoot);
  assert.equal(formalOutput.data?.reason, 'formal-archive-current');
  const formalReceipt = formalOutput.data?.formalArchiveReceipt;
  assert.ok(formalReceipt);
  assert.equal(path.dirname(formalReceipt.archivePath), path.join(
    canonicalWorkspaceRoot,
    '.lpc-toolkit',
    'asset-packs',
    'authoring-sessions',
    authoringSessionId,
    'release-artifacts',
  ));
  assert.equal(
    existsSync(path.join(path.dirname(authoringPackRoot), 'smoke.packed-authoring-1.0.0.lpc-assets.zip')),
    false,
  );
  const formalZip = await JSZip.loadAsync(readFileSync(formalReceipt.archivePath));
  const formalManifest = JSON.parse(
    await formalZip.file('asset-pack.json').async('string'),
  );
  assert.equal(formalManifest.status, undefined);

  const authoringInspectionOutput = runInstalledJson([
    'asset', 'authoring', 'inspect',
    '--session', authoringSessionId,
    '--archive', formalReceipt.archivePath,
  ], workspaceRoot);
  assert.equal(authoringInspectionOutput.data?.reason, 'archive-inspection-current');
  assert.equal(
    authoringInspectionOutput.data?.inspectionReceipt?.archiveDigest,
    formalReceipt.archiveDigest,
  );
  const repeatedFormalOutput = runInstalledJson([
    'asset', 'authoring', 'pack', '--session', authoringSessionId, '--confirm',
  ], workspaceRoot);
  assert.equal(repeatedFormalOutput.data?.formalArchiveReceipt?.archiveDigest, formalReceipt.archiveDigest);
  assert.equal(
    repeatedFormalOutput.data?.inspectionReceipt?.archiveDigest,
    formalReceipt.archiveDigest,
  );
  const repeatedInspectionOutput = runInstalledJson([
    'asset', 'authoring', 'inspect',
    '--session', authoringSessionId,
    '--archive', formalReceipt.archivePath,
  ], workspaceRoot);
  assert.equal(
    repeatedInspectionOutput.data?.inspectionReceipt?.archiveDigest,
    formalReceipt.archiveDigest,
  );

  const authoringConsumerWorkspaceRoot = path.join(emptyCwd, 'authoring-consumer');
  const authoringConsumerInit = runInstalledJson([
    'asset', 'workspace', 'init', authoringConsumerWorkspaceRoot,
  ]);
  assert.equal(authoringConsumerInit.data?.root, authoringConsumerWorkspaceRoot);
  const canonicalAuthoringConsumerWorkspaceRoot = realpathSync.native(authoringConsumerWorkspaceRoot);
  const authoringSessionFile = path.join(
    canonicalWorkspaceRoot,
    '.lpc-toolkit',
    'asset-packs',
    'authoring-sessions',
    authoringSessionId,
    'session.json',
  );
  const authoringSessionBeforeInstall = readFileSync(authoringSessionFile);
  const formalArchiveBeforeInstall = readFileSync(formalReceipt.archivePath);
  assert.deepEqual(
    readdirSync(path.join(authoringConsumerWorkspaceRoot, 'assets_custom')),
    ['.lpc-toolkit-managed.json'],
  );
  const authoringInstallPending = runInstalledJson([
    'asset', 'authoring', 'install',
    '--session', authoringSessionId,
    '--archive', formalReceipt.archivePath,
    '--consumer-workspace', authoringConsumerWorkspaceRoot,
  ], workspaceRoot);
  assert.equal(authoringInstallPending.data?.reason, 'installation-confirmation-required');
  assert.equal(authoringInstallPending.data?.installationReceipt, null);
  assert.deepEqual(
    authoringInstallPending.data?.nextActions.map(({ id, safety }) => ({ id, safety })),
    [{ id: 'install-consumer-archive', safety: 'requires-confirmation' }],
  );
  assert.deepEqual(readFileSync(authoringSessionFile), authoringSessionBeforeInstall);
  assert.deepEqual(readFileSync(formalReceipt.archivePath), formalArchiveBeforeInstall);
  assert.deepEqual(
    readdirSync(path.join(authoringConsumerWorkspaceRoot, 'assets_custom')),
    ['.lpc-toolkit-managed.json'],
  );

  const authoringInstallOutput = runInstalledJson([
    'asset', 'authoring', 'install',
    '--session', authoringSessionId,
    '--archive', formalReceipt.archivePath,
    '--consumer-workspace', authoringConsumerWorkspaceRoot,
    '--confirm',
  ], workspaceRoot);
  assert.equal(authoringInstallOutput.data?.reason, 'installation-current');
  const authoringInstallationReceipt = authoringInstallOutput.data?.installationReceipt;
  assert.ok(authoringInstallationReceipt);
  assert.equal(
    authoringInstallationReceipt.schema,
    'lpc-toolkit.asset-authoring-install-receipt.v1',
  );
  assert.equal(authoringInstallationReceipt.archiveDigest, formalReceipt.archiveDigest);
  assert.equal(authoringInstallationReceipt.workspaceRoot, canonicalAuthoringConsumerWorkspaceRoot);
  assert.equal(
    authoringInstallationReceipt.generatedDigests['CREDITS.csv'],
    authoringInstallationReceipt.creditsDigest,
  );
  assert.deepEqual(readFileSync(formalReceipt.archivePath), formalArchiveBeforeInstall);
  const authoringSessionAfterInstall = readFileSync(authoringSessionFile);
  const repeatedAuthoringInstall = runInstalledJson([
    'asset', 'authoring', 'install',
    '--session', authoringSessionId,
    '--archive', formalReceipt.archivePath,
    '--consumer-workspace', authoringConsumerWorkspaceRoot,
    '--confirm',
  ], workspaceRoot);
  assert.deepEqual(
    repeatedAuthoringInstall.data?.installationReceipt,
    authoringInstallationReceipt,
  );
  assert.deepEqual(readFileSync(authoringSessionFile), authoringSessionAfterInstall);

  writeJson(
    path.join(authoringConsumerWorkspaceRoot, 'characters', 'packed-authoring.selection.json'),
    {
      schema: 'lpc-toolkit.selection.v1',
      name: 'packed-authoring',
      bodyType: 'male',
      items: { hair: { name: 'smoke.packed-authoring--moon-braid' } },
    },
  );
  runInstalled([
    'character', 'preview', 'packed-authoring', '--animation', 'walk',
  ], authoringConsumerWorkspaceRoot);
  const authoringConsumerPreviewRoot = path.join(
    authoringConsumerWorkspaceRoot,
    'characters',
    'previews',
    'packed-authoring',
  );
  assert.match(
    readFileSync(path.join(authoringConsumerPreviewRoot, 'packed-authoring.credits.txt'), 'utf8'),
    /Packed Authoring Artist/u,
  );
  assert.match(
    readFileSync(path.join(authoringConsumerPreviewRoot, 'packed-authoring.credits.csv'), 'utf8'),
    /Packed Authoring Artist/u,
  );
  const authoringConsumerList = runInstalledJson(['asset', 'list'], authoringConsumerWorkspaceRoot);
  assert.deepEqual(
    authoringConsumerList.data?.entries?.map(({ packId, version, kind }) => ({ packId, version, kind })),
    [{ packId: 'smoke.packed-authoring', version: '1.0.0', kind: 'installed' }],
  );
  const authoringConsumerDoctor = runInstalledJson(['asset', 'doctor'], authoringConsumerWorkspaceRoot);
  assert.equal(authoringConsumerDoctor.data?.healthy, true);

  assert.equal(
    readFileSync(cacheSentinelPath, 'utf8'),
    'prepared pinned cache must stay unchanged\n',
  );
  assert.deepEqual(readdirSync(generatedOutputRoot).sort(), generatedOutputBefore);
  assert.equal(readFileSync(generatedOutputMarkerPath, 'utf8'), generatedOutputMarkerBefore);
  assert.equal(
    readFileSync(unownedOutputPath, 'utf8'),
    'user-owned output must remain untouched\n',
  );
  assert.equal(existsSync(path.join(emptyCwd, 'assets')), false);
  assert.equal(existsSync(path.join(emptyCwd, 'upstream')), false);

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

  const draftArchivePath = path.join(emptyCwd, 'smoke.packed-hair-1.0.0.draft.lpc-assets.zip');
  await writeDraftArchive(archivePath, draftArchivePath);

  const installedWorkspaceRoot = path.join(emptyCwd, 'installed-lifecycle');
  const installedWorkspaceOutput = runInstalledJson([
    'asset', 'workspace', 'init', installedWorkspaceRoot,
  ]);
  assert.equal(installedWorkspaceOutput.data?.root, installedWorkspaceRoot);
  const draftInspection = runInstalledResult(['asset', 'inspect', draftArchivePath], installedWorkspaceRoot);
  assert.equal(draftInspection.status, 1, draftInspection.stderr);
  const draftInspectionOutput = JSON.parse(draftInspection.stdout);
  assert.equal(draftInspectionOutput.data?.status, 'draft', draftInspection.stdout);
  assert.equal(draftInspectionOutput.data?.valid, false);
  const workspaceConfigBeforeDraftInstall = readFileSync(
    path.join(installedWorkspaceRoot, 'lpc-asset-workspace.json'),
    'utf8',
  );
  const draftInstall = runInstalledResult(['asset', 'install', draftArchivePath], installedWorkspaceRoot);
  assert.equal(draftInstall.status, 1, draftInstall.stderr);
  assert.match(draftInstall.stdout, /asset_pack_draft/u);
  assert.equal(
    readFileSync(path.join(installedWorkspaceRoot, 'lpc-asset-workspace.json'), 'utf8'),
    workspaceConfigBeforeDraftInstall,
  );
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
