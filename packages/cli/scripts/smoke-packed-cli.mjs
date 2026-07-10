import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const pnpmCliPath = resolveNodeTool('corepack', 'dist', 'pnpm.js');
const npmCliPath = resolveNodeTool('npm', 'bin', 'npm-cli.js');
let packDir;
let installPrefix;

try {
  packDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-pack-'));
  installPrefix = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-install-'));

  runNodeTool(pnpmCliPath, ['pack', '--pack-destination', packDir], {
    cwd: packageRoot,
    stdio: 'inherit',
  });

  const tarballNames = readdirSync(packDir).filter(
    (entry) => entry === 'lpc-toolkit-cli-0.1.0.tgz',
  );
  assert.equal(tarballNames.length, 1, 'expected exactly one lpc-toolkit-cli-0.1.0.tgz');
  const tarballPath = path.join(packDir, tarballNames[0]);

  const listing = execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' });
  const entries = listing.split(/\r?\n/u).filter(Boolean);
  const requiredEntries = [
    'package/dist/asset-release.json',
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
    entries.every((entry) => !entry.startsWith('package/test/')),
    'packed tarball must not include package/test/',
  );
  assert.ok(
    entries.every((entry) => !/(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/iu.test(entry)),
    'packed tarball must not include TypeScript config files',
  );

  runNodeTool(npmCliPath, ['install', '--prefix', installPrefix, tarballPath], {
    stdio: 'inherit',
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

  console.log('Packed CLI install smoke test passed.');
} finally {
  if (packDir !== undefined) {
    rmSync(packDir, { recursive: true, force: true });
  }
  if (installPrefix !== undefined) {
    rmSync(installPrefix, { recursive: true, force: true });
  }
}
