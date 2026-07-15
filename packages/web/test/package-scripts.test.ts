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
const expectedVerifyScript = [
  'pnpm --filter @lpc-toolkit/web prepare-assets',
  'pnpm verify:upstream-pin',
  'pnpm check:boundaries',
  'pnpm verify:cli-docs-policy',
  'pnpm verify:plugin',
  'pnpm typecheck',
  'pnpm -r test',
].join(' && ');
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
const unitJobStart = ciWorkflow.indexOf('  unit:');
const cliJobStart = ciWorkflow.indexOf('  cli-package:');
const unitJob =
  unitJobStart === -1 || cliJobStart === -1
    ? ''
    : ciWorkflow.slice(unitJobStart, cliJobStart);
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
    expect(rootPackageJson.scripts?.['verify:upstream-pin']).toBe(
      'pnpm --filter @lpc-toolkit/web verify-upstream-pin',
    );
    expect(rootPackageJson.scripts?.pretest).toBe(
      'pnpm --filter @lpc-toolkit/web prepare-assets && pnpm verify:upstream-pin',
    );
  });

  it('exposes the architecture boundary check at the workspace root', () => {
    expect(rootPackageJson.scripts?.['check:boundaries']).toBe(
      'node scripts/check-boundaries.mjs',
    );
  });

  it('shares the main verification gate between local development and CI', () => {
    expect(rootPackageJson.scripts?.verify).toBe(expectedVerifyScript);
    expect(unitJob).toContain('- run: pnpm verify');
    expect(unitJob).not.toContain('- run: pnpm check:boundaries');
    expect(unitJob).not.toContain('- run: pnpm typecheck');
    expect(unitJob).not.toContain('- run: pnpm test');
  });

  it('runs architecture boundaries in CI after install and before validation', () => {
    expect(unitJobStart).toBeGreaterThanOrEqual(0);
    expect(cliJobStart).toBeGreaterThan(unitJobStart);

    expect(unitJob).not.toContain('submodules: recursive');
    expect(expectedVerifyScript.indexOf('prepare-assets')).toBeLessThan(
      expectedVerifyScript.indexOf('verify:upstream-pin'),
    );
    expect(expectedVerifyScript.indexOf('verify:upstream-pin')).toBeLessThan(
      expectedVerifyScript.indexOf('check:boundaries'),
    );
    expect(expectedVerifyScript.indexOf('check:boundaries')).toBeLessThan(
      expectedVerifyScript.indexOf('verify:cli-docs-policy'),
    );
    expect(expectedVerifyScript.indexOf('verify:cli-docs-policy')).toBeLessThan(
      expectedVerifyScript.indexOf('typecheck'),
    );
    expect(expectedVerifyScript.indexOf('typecheck')).toBeLessThan(
      expectedVerifyScript.indexOf('-r test'),
    );
    expect(publishWorkflow).not.toContain('submodules: recursive');
    expect(publishWorkflow).toContain(
      '- run: pnpm --filter @lpc-toolkit/web prepare-assets',
    );
    expect(publishWorkflow).toContain('- run: pnpm verify:upstream-pin');
    expect(publishWorkflow).toContain('- run: pnpm check:boundaries');
  });

  it('prepares release assets before production builds', () => {
    expect(packageJson.scripts?.prebuild).toContain(
      'pnpm prepare-assets && pnpm verify-upstream-pin',
    );
  });

  it('prepares release assets before tests that read generated assets', () => {
    expect(packageJson.scripts?.pretest).toBe(
      'pnpm prepare-assets && pnpm verify-upstream-pin',
    );
    expect(packageJson.scripts?.['pretest:e2e']).toBe(
      'pnpm prepare-assets && pnpm verify-upstream-pin',
    );
    expect(packageJson.scripts?.['pretest:e2e:parity']).toBe(
      'pnpm prepare-assets && pnpm verify-upstream-pin && pnpm verify-upstream-parity',
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
