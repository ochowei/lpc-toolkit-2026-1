/** Verifies web package lifecycle scripts that prepare deployable assets. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(path.join(here, '../package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

describe('package scripts', () => {
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
