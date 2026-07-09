import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface CliPackageJson {
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
  it('exposes only the lpc-toolkit command', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.bin).toEqual({
      'lpc-toolkit': './dist/index.js',
    });
    expect(packageJson.bin).not.toHaveProperty('lpc');
  });

  it('packs only runtime artifacts and required metadata', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.files).toEqual(['dist']);
    expect(packageJson.files).not.toContain('src');
    expect(packageJson.files).not.toContain('test');
    expect(packageJson.files).not.toContain('tsconfig.json');
    expect(packageJson.files).not.toContain('tsconfig.build.json');
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
});
