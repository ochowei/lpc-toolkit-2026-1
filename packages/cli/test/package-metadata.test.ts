import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

function readCliPackageJson(): CliPackageJson {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(testDir, '../package.json');
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as CliPackageJson;
}

describe('CLI package metadata', () => {
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

    expect(packageJson.files).toEqual(['dist', 'README.md']);
    expect(packageJson.files).not.toContain('src');
    expect(packageJson.files).not.toContain('test');
    expect(packageJson.files).not.toContain('tsconfig.json');
    expect(packageJson.files).not.toContain('tsconfig.build.json');
  });

  it('packs the npm readme and copied release pin', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.files).toEqual(['dist', 'README.md']);
    expect(packageJson.scripts?.build).toContain('node scripts/copy-release-config.mjs');
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
    expect(packageJson.devDependencies).toMatchObject({
      '@lpc-toolkit/core': 'workspace:*',
      '@lpc-toolkit/presets': 'workspace:*',
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

  it('defines the cross-platform packed install smoke command', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.scripts?.['test:package']).toBe('node scripts/smoke-packed-cli.mjs');
  });

  it('defines release verification and real-asset smoke scripts', () => {
    const packageJson = readCliPackageJson();
    expect(packageJson.scripts).toMatchObject({
      'test:assets:real': 'node scripts/smoke-real-assets.mjs',
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
});
