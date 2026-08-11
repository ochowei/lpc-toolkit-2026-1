import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

interface CliPackageJson {
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
  readonly bin?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly files?: readonly string[];
  readonly devDependencies?: Record<string, string>;
  readonly scripts?: Record<string, string>;
}

interface TokenDecodeSnapshot {
  readonly schemaVersion?: unknown;
  readonly items?: Readonly<Record<string, {
    readonly name?: unknown;
    readonly recolors?: Readonly<Record<string, {
      readonly type_name?: unknown;
    }>>;
  }>>;
  readonly materials?: unknown;
}

function readCliPackageJson(): CliPackageJson {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(testDir, '../package.json');
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as CliPackageJson;
}

function readCliReadme(): string {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(testDir, '../README.md'), 'utf8');
}

describe('CLI package metadata', () => {
  it('declares public npm release metadata', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.version).toBe('0.2.0');
    expect(packageJson).toMatchObject({
      name: '@lpc-toolkit/cli',
      version: expect.stringMatching(
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u,
      ),
      description: expect.stringContaining('LPC'),
      engines: { node: '>=22' },
      license: 'GPL-3.0-or-later',
      publishConfig: { access: 'public' },
      repository: {
        type: 'git',
        url: 'https://github.com/ochowei/lpc-toolkit-2026-1',
      },
      homepage: 'https://github.com/ochowei/lpc-toolkit-2026-1#readme',
      bugs: { url: 'https://github.com/ochowei/lpc-toolkit-2026-1/issues' },
    });
    expect(packageJson.private).not.toBe(true);
  });

  it('exposes only the lpc-toolkit command', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.bin).toEqual({
      'lpc-toolkit': './dist/index.js',
    });
    expect(packageJson.bin).not.toHaveProperty('lpc');
  });

  it('packs only runtime artifacts and required metadata', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.files).toEqual(['dist', 'examples', 'README.md']);
    expect(packageJson.files).not.toContain('src');
    expect(packageJson.files).not.toContain('test');
    expect(packageJson.files).not.toContain('tsconfig.json');
    expect(packageJson.files).not.toContain('tsconfig.build.json');
  });

  it('packs the npm readme and copied release pin', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.files).toEqual(['dist', 'examples', 'README.md']);
    expect(packageJson.scripts?.build).toContain('node scripts/copy-release-config.mjs');
  });

  it('builds token decode metadata from a tracked package snapshot', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJson = readCliPackageJson();
    const snapshotSource = readFileSync(
      path.resolve(testDir, '../token-decode-metadata.snapshot.json'),
      'utf8',
    );
    const snapshot = JSON.parse(snapshotSource) as TokenDecodeSnapshot;

    expect(packageJson.scripts?.build).toContain(
      'node scripts/copy-token-decode-metadata.mjs',
    );
    expect(packageJson.scripts?.build).not.toContain(
      'node scripts/generate-token-decode-metadata.mjs',
    );
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.materials).toEqual(expect.any(Object));
    expect(
      Object.values(snapshot.items ?? {}).some((item) => item.name === 'Braid'),
    ).toBe(true);
    expect(
      snapshot.items?.['hair/braids/hair_long_tied.json']
        ?.recolors?.color_2?.type_name,
    ).toBe('hair_tie');
    expect(snapshotSource).not.toContain('"source"');
    expect(snapshotSource).not.toMatch(/#[0-9A-F]{6}/iu);
  });

  it('includes a package-local copy of the GPL license', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const packageLicense = readFileSync(path.resolve(testDir, '../LICENSE'), 'utf8');
    const rootLicense = readFileSync(path.resolve(testDir, '../../../LICENSE'), 'utf8');

    expect(packageLicense).toBe(rootLicense);
  });

  it('vendors workspace runtime dependencies for local tarball installs', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.dependencies).not.toHaveProperty('@lpc-toolkit/core');
    expect(packageJson.dependencies).not.toHaveProperty('@lpc-toolkit/presets');
    expect(packageJson.dependencies).not.toHaveProperty('@lpc-toolkit/asset-pack-format');
    expect(packageJson.devDependencies).toMatchObject({
      '@lpc-toolkit/core': 'workspace:*',
      '@lpc-toolkit/presets': 'workspace:*',
      '@lpc-toolkit/asset-pack-format': 'workspace:*',
    });
  });

  it('cleans dist before building package output', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.scripts?.build).toContain('node -e');
    expect(packageJson.scripts?.build).toContain('rmSync');
    expect(packageJson.scripts?.build).toContain('dist');
    expect(packageJson.scripts?.build).toContain('tsc -p tsconfig.build.json');
    expect(packageJson.scripts?.build).toContain('node scripts/vendor-workspace-deps.mjs');
  });

  it('builds package output during the npm prepack lifecycle', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.scripts?.prepack).toBe('pnpm run build');
  });

  it('defines the cross-platform packed install smoke command', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.scripts?.['test:package']).toBe('node scripts/smoke-packed-cli.mjs');
  });

  it('defines release verification and real-asset smoke scripts', () => {
    const packageJson = readCliPackageJson();
    expect(packageJson.scripts).toMatchObject({
      'test:assets:real': 'node scripts/smoke-real-assets.mjs',
      'verify:rc-tag': 'node scripts/verify-rc-tag.mjs',
      'verify:release-tag': 'node scripts/verify-release-tag.mjs',
    });
  });

  it('keeps the packed install smoke command free of shell reparsing', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const smokeScript = readFileSync(
      path.resolve(testDir, '../scripts/smoke-packed-cli.mjs'),
      'utf8',
    );

    expect(smokeScript).toContain('process.execPath');
    expect(smokeScript).not.toContain('ComSpec');
    expect(smokeScript).not.toContain("'/c'");
    expect(smokeScript).not.toContain('execFileSync(installedBinPath');
    expect(smokeScript).toContain("args: ['--help']");
  });

  it('smokes the installed character authoring workflow', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const smoke = readFileSync(
      path.resolve(testDir, '../scripts/smoke-packed-cli.mjs'),
      'utf8',
    );

    expect(smoke).toContain("'character', 'create', 'packed-hero'");
    expect(smoke).toContain("'character', 'preview', 'packed-hero'");
    expect(smoke).toContain("'character', 'render', 'packed-hero'");
    expect(smoke).toContain('packed-hero.credits.txt');
    expect(smoke).toContain('packed-hero.credits.csv');
  });

  it('runs the installed CLI through Node on Windows and the shim elsewhere', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const helperUrl = pathToFileURL(
      path.resolve(testDir, '../scripts/installed-cli-command.mjs'),
    ).href;
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { installedCliInvocation } from ${JSON.stringify(helperUrl)};
const common = { nodePath: '/node', shimPath: '/shim.cmd', targetPath: '/package/dist/index.js', args: ['token', 'decode'] };
process.stdout.write(JSON.stringify([
  installedCliInvocation({ ...common, platform: 'win32' }),
  installedCliInvocation({ ...common, platform: 'darwin' }),
]));`,
      ],
      { encoding: 'utf8' },
    );

    expect(JSON.parse(output) as unknown).toEqual([
      {
        command: '/node',
        args: ['/package/dist/index.js', 'token', 'decode'],
      },
      { command: '/shim.cmd', args: ['token', 'decode'] },
    ]);
  });

  it('accepts Unix and Windows packed web-server termination results', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const helperUrl = pathToFileURL(
      path.resolve(testDir, '../scripts/installed-cli-command.mjs'),
    ).href;
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { isExpectedWebTermination } from ${JSON.stringify(helperUrl)};
process.stdout.write(JSON.stringify([
  isExpectedWebTermination({ code: 143, signal: null }),
  isExpectedWebTermination({ code: null, signal: 'SIGTERM' }),
  isExpectedWebTermination({ code: 0, signal: null }),
  isExpectedWebTermination({ code: null, signal: 'SIGKILL' }),
]));`,
      ],
      { encoding: 'utf8' },
    );

    expect(JSON.parse(output) as unknown).toEqual([true, true, false, false]);
  });

  it('derives a later release tarball name without current-version coupling', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const helperUrl = pathToFileURL(
      path.resolve(testDir, '../scripts/package-archive-name.mjs'),
    ).href;
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { packedTarballName } from ${JSON.stringify(helperUrl)}; process.stdout.write(packedTarballName({ name: '@lpc-toolkit/cli', version: '0.2.0' }));`,
      ],
      { encoding: 'utf8' },
    );
    const smokeScript = readFileSync(
      path.resolve(testDir, '../scripts/smoke-packed-cli.mjs'),
      'utf8',
    );

    expect(output).toBe('lpc-toolkit-cli-0.2.0.tgz');
    expect(smokeScript).toContain('packedTarballName');
    expect(smokeScript).not.toContain('lpc-toolkit-cli-0.1.0.tgz');
  });

  it('creates packed install temporary directories inside the cleanup guard', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const smokeScript = readFileSync(
      path.resolve(testDir, '../scripts/smoke-packed-cli.mjs'),
      'utf8',
    );

    expect(smokeScript.indexOf('try {')).toBeLessThan(smokeScript.indexOf('mkdtempSync('));
    expect(smokeScript).toContain('finally {');
  });

  it('documents the public installation and asset-cache contract', () => {
    const readme = readCliReadme();

    expect(readme).toContain('npm install -g @lpc-toolkit/cli');
    expect(readme).toContain('Node.js 22');
    expect(readme).toContain('LPC_TOOLKIT_CACHE_DIR');
    expect(readme).toContain('CREDITS.csv');
    expect(readme).toContain('GPL-3.0-or-later');
    expect(readme).toContain('lpc-toolkit catalog item hair_braid');
    expect(readme).toContain('hair=Braid');
    expect(readme).not.toContain('lpc-toolkit catalog item braids');
    expect(readme).not.toContain('hair=Braids');
    expect(readme).toMatch(
      /`--help`, `--version`, `token decode`, `preset list`, `character list`,\s+and\s+`character create` without `--preset` do not prepare the managed cache\./u,
    );
    expect(readme).not.toContain('`--help`, token encoding');
  });

  it('documents the optional Codex plugin installation', () => {
    const readme = readCliReadme();
    const cliInstall = "npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'";
    const marketplaceAdd = 'codex plugin marketplace add ochowei/lpc-toolkit-2026-1';
    const pluginAdd = 'codex plugin add lpc-toolkit@lpc-toolkit';

    expect(readme).toContain('Install or upgrade the CLI');
    expect(readme).toContain(cliInstall);
    expect(readme).not.toContain('lpc-toolkit-cli-0.1.4-beta-1.tgz');
    expect(readme).toContain('--limit 20');
    expect(readme).toContain('--offset 20');
    expect(readme).toContain('--all');
    expect(readme.indexOf(cliInstall)).toBeLessThan(readme.indexOf(marketplaceAdd));
    expect(readme.indexOf(marketplaceAdd)).toBeLessThan(readme.indexOf(pluginAdd));
    expect(readme).toContain('codex plugin marketplace add ochowei/lpc-toolkit-2026-1');
    expect(readme).toContain('codex plugin add lpc-toolkit@lpc-toolkit');
    expect(readme).toContain('requires an installed compatible `lpc-toolkit` CLI');
    expect(readme).not.toContain('automatically installs the CLI');
  });
});
