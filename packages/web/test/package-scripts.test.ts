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
  it('generates sprite assets before production builds', () => {
    expect(packageJson.scripts?.prebuild).toBe(
      'pnpm --filter @lpc-toolkit/core build && tsx scripts/copy-spritesheets.ts',
    );
  });
});
