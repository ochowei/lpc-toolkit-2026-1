import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('CLI release workflows', () => {
  it('keeps routine CLI package validation on Ubuntu only', () => {
    const ci = readRepoFile('.github/workflows/ci.yml');
    const cliJob = ci.slice(ci.indexOf('  cli-package:'), ci.indexOf('  e2e:'));

    expect(cliJob).toContain('name: CLI package (ubuntu-latest)');
    expect(cliJob).toContain('runs-on: ubuntu-latest');
    expect(cliJob).not.toContain('matrix:');
    expect(cliJob).not.toContain('macos-latest');
    expect(cliJob).not.toContain('windows-latest');
  });

  it('defines tagged and manually dispatched macOS and Windows RC checks', () => {
    const rc = readRepoFile('.github/workflows/cli-release-candidate.yml');

    expect(rc).toContain("tags: ['v*.*.*-rc.*']");
    expect(rc).toContain('workflow_dispatch:');
    expect(rc).toContain('fail-fast: false');
    expect(rc).toContain('os: [macos-latest, windows-latest]');
    expect(rc).toContain("if: github.event_name == 'push'");
    expect(rc).toContain('pnpm --filter @lpc-toolkit/cli verify:rc-tag');
    for (const command of [
      'pnpm install --frozen-lockfile',
      'pnpm --filter @lpc-toolkit/cli typecheck',
      'pnpm --filter @lpc-toolkit/cli test',
      'pnpm --filter @lpc-toolkit/cli build',
      'pnpm --filter @lpc-toolkit/cli test:package',
    ]) {
      expect(rc).toContain(command);
    }
    expect(rc).toContain('contents: read');
    expect(rc).not.toContain('id-token: write');
    expect(rc).not.toContain('npm publish');
  });

  it('keeps prerelease tags out of stable publishing and verifies early', () => {
    const publish = readRepoFile('.github/workflows/publish.yml');
    const verifyIndex = publish.indexOf(
      'pnpm --filter @lpc-toolkit/cli verify:release-tag',
    );
    const installIndex = publish.indexOf('pnpm install --frozen-lockfile');

    expect(publish).toContain("- 'v*'");
    expect(publish).toContain("- '!v*-*'");
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeLessThan(installIndex);
    expect(publish).toContain("if: github.ref_name != 'v0.1.0'");
  });

  it('documents tagged RC gates and advisory manual checks', () => {
    const releaseGuide = readRepoFile('docs/RELEASING.md');

    expect(releaseGuide).toContain('v<version>-rc.<number>');
    expect(releaseGuide).toContain('macos-latest');
    expect(releaseGuide).toContain('windows-latest');
    expect(releaseGuide).toContain('advisory');
    expect(releaseGuide).toContain('never publishes npm');
  });
});
