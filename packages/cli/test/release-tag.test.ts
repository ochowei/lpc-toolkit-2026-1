import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const verifierPath = path.resolve(testDir, '../scripts/verify-rc-tag.mjs');
const packageJson = JSON.parse(
  readFileSync(path.resolve(testDir, '../package.json'), 'utf8'),
) as { readonly version?: unknown };
if (typeof packageJson.version !== 'string') {
  throw new Error('CLI package version must be a string.');
}
const packageVersion = packageJson.version;
const matchingTag = `v${packageVersion}-rc.1`;
const mismatchedBase = packageVersion === '0.0.0' ? '0.0.1' : '0.0.0';

function runVerifier(tag: string | undefined) {
  const env = { ...process.env };
  if (tag === undefined) {
    delete env.GITHUB_REF_NAME;
  } else {
    env.GITHUB_REF_NAME = tag;
  }

  return spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
    env,
  });
}

describe('verify RC tag', () => {
  it('accepts a matching release-candidate tag', () => {
    const result = runVerifier(matchingTag);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `RC tag verified: ${matchingTag} targets ${packageVersion}.`,
    );
    expect(result.stderr).toBe('');
  });

  it.each([
    ['stable tag', `v${packageVersion}`],
    ['leading zero', `v${packageVersion}-rc.01`],
    ['missing tag', undefined],
  ])('rejects a malformed %s', (_label, tag) => {
    const result = runVerifier(tag);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'RC tag must match vX.Y.Z-rc.N without leading zeroes;',
    );
  });

  it('rejects an RC tag whose base differs from the package version', () => {
    const result = runVerifier(`v${mismatchedBase}-rc.1`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `RC tag base mismatch: expected ${packageVersion}, received ${mismatchedBase}.`,
    );
  });
});
