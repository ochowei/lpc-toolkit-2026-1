/** Verifies web package lifecycle scripts that prepare deployable assets. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(path.join(here, '../package.json'), 'utf8'),
) as { scripts?: Record<string, string> };
const rootPackageJson = JSON.parse(
  readFileSync(path.join(here, '../../../package.json'), 'utf8'),
) as { scripts?: Record<string, string> };
const ciWorkflow = readFileSync(
  path.join(here, '../../../.github/workflows/ci.yml'),
  'utf8',
);
const changesJob = ciWorkflow.slice(
  ciWorkflow.indexOf('  changes:'),
  ciWorkflow.indexOf('  unit:'),
);

describe('package scripts', () => {
  it('detects pull request changes with local git instead of the files API', () => {
    expect(changesJob).toContain(
      '- uses: actions/checkout@v4\n        with:\n          fetch-depth: 0',
    );
    expect(changesJob).toContain(
      "- uses: dorny/paths-filter@v3\n        id: filter\n        with:\n          token: ''",
    );
  });

  it('prepares release assets before root workspace tests', () => {
    expect(rootPackageJson.scripts?.pretest).toBe(
      'pnpm --filter @lpc-toolkit/web prepare-assets',
    );
  });

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
