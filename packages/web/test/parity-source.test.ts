import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { requireIsolatedParityDir } from '../scripts/parity-source';

describe('isolated upstream parity source', () => {
  const repoRoot = path.resolve('/workspace/lpc-toolkit');

  it('requires LPC_UPSTREAM_PARITY_DIR', () => {
    expect(() => requireIsolatedParityDir(repoRoot, undefined)).toThrow(
      /LPC_UPSTREAM_PARITY_DIR is required/,
    );
  });

  it('requires an absolute path', () => {
    expect(() => requireIsolatedParityDir(repoRoot, '../parity')).toThrow(
      /must be an absolute path/,
    );
  });

  it.each([
    path.join(repoRoot, 'upstream'),
    path.join(repoRoot, 'upstream', 'nested'),
  ])('rejects the tracked submodule tree: %s', (candidate) => {
    expect(() => requireIsolatedParityDir(repoRoot, candidate)).toThrow(
      /must be outside the tracked upstream\/ submodule/,
    );
  });

  it('accepts and normalizes an isolated absolute checkout', () => {
    const candidate = path.resolve('/runner-temp/lpc-toolkit-upstream-parity');
    expect(requireIsolatedParityDir(repoRoot, candidate)).toBe(candidate);
  });
});
