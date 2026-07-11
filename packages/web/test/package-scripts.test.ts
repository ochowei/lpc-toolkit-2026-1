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
const publishWorkflow = readFileSync(
  path.join(here, '../../../.github/workflows/publish.yml'),
  'utf8',
);
const changesJob = ciWorkflow.slice(
  ciWorkflow.indexOf('  changes:'),
  ciWorkflow.indexOf('  unit:'),
);
const e2eJobStart = ciWorkflow.indexOf('  e2e:');
const parityJobStart = ciWorkflow.indexOf('  e2e-parity:');
const e2eJob = ciWorkflow.slice(
  e2eJobStart,
  parityJobStart === -1 ? undefined : parityJobStart,
);
const parityJob =
  parityJobStart === -1 ? '' : ciWorkflow.slice(parityJobStart);
const generalPlaywrightConfig = readFileSync(
  path.join(here, '../playwright.config.ts'),
  'utf8',
);
const parityPlaywrightConfig = readFileSync(
  path.join(here, '../playwright.parity.config.ts'),
  'utf8',
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

  it('exposes the architecture boundary check at the workspace root', () => {
    expect(rootPackageJson.scripts?.['check:boundaries']).toBe(
      'node scripts/check-boundaries.mjs',
    );
  });

  it('runs architecture boundaries in CI after install and before validation', () => {
    const unitJobStart = ciWorkflow.indexOf('  unit:');
    const cliJobStart = ciWorkflow.indexOf('  cli-package:');

    expect(unitJobStart).toBeGreaterThanOrEqual(0);
    expect(cliJobStart).toBeGreaterThan(unitJobStart);

    const unitJob = ciWorkflow.slice(unitJobStart, cliJobStart);
    expect(unitJob).toContain(
      [
        '      - run: pnpm install --frozen-lockfile',
        '      - run: pnpm check:boundaries',
        '      - run: pnpm typecheck',
        '      - run: pnpm test',
      ].join('\n'),
    );
    expect(unitJob).toContain('- run: pnpm check:boundaries');
    expect(unitJob.indexOf('pnpm install --frozen-lockfile')).toBeLessThan(
      unitJob.indexOf('pnpm check:boundaries'),
    );
    expect(unitJob.indexOf('pnpm check:boundaries')).toBeLessThan(
      unitJob.indexOf('pnpm typecheck'),
    );
    expect(publishWorkflow).toContain('- run: pnpm check:boundaries');
  });

  it('prepares release assets before production builds', () => {
    expect(packageJson.scripts?.prebuild).toBe(
      'pnpm prepare-assets && pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/presets build',
    );
  });

  it('prepares release assets before tests that read generated assets', () => {
    expect(packageJson.scripts?.pretest).toBe('pnpm prepare-assets');
    expect(packageJson.scripts?.['pretest:e2e']).toBe('pnpm prepare-assets');
    expect(packageJson.scripts?.['pretest:e2e:parity']).toBe(
      'pnpm prepare-assets && pnpm verify-upstream-parity',
    );
  });

  it('separates ordinary and parity Playwright servers', () => {
    expect(generalPlaywrightConfig).toContain(
      'testIgnore: /random-upstream-parity\\.spec\\.ts/',
    );
    expect(generalPlaywrightConfig).not.toContain('../../upstream');
    expect(generalPlaywrightConfig).not.toContain('5174');
    expect(generalPlaywrightConfig.match(/command:/g)).toHaveLength(1);

    expect(parityPlaywrightConfig).toContain(
      'requireIsolatedParityDir(repoRoot)',
    );
    expect(parityPlaywrightConfig).toContain('LPC_UPSTREAM_PARITY_DIR');
    expect(parityPlaywrightConfig).not.toContain('../../upstream');
    expect(parityPlaywrightConfig.match(/command:/g)).toHaveLength(2);
  });

  it('runs upstream parity only from an isolated CI checkout', () => {
    expect(e2eJob).not.toContain('submodules: recursive');
    expect(e2eJob).not.toContain('working-directory: upstream');
    expect(e2eJob).not.toContain('npm ci');
    expect(e2eJob).not.toContain('test:e2e:parity');

    expect(parityJob).toContain(
      [
        '- name: Configure isolated upstream parity path',
        '        run: echo "LPC_UPSTREAM_PARITY_DIR=$RUNNER_TEMP/lpc-toolkit-upstream-parity" >> "$GITHUB_ENV"',
      ].join('\n'),
    );
    expect(parityJob).not.toContain('${{ runner.temp }}');
    expect(parityJob).toContain(
      "require('./asset-release.json').sourceRepository",
    );
    expect(parityJob).toContain("require('./asset-release.json').sourceSha");
    expect(parityJob).toContain(
      'npm ci --prefix "$LPC_UPSTREAM_PARITY_DIR"',
    );
    expect(parityJob).toContain(
      'pnpm --filter @lpc-toolkit/web test:e2e:parity',
    );
    expect(ciWorkflow).not.toContain('working-directory: upstream');
    expect(ciWorkflow).not.toContain('../../upstream');
  });
});
