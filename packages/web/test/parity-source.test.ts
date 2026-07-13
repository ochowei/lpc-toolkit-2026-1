import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  it('rejects a symlink alias to the tracked submodule tree', () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'lpc-parity-source-'));
    try {
      const tempRepoRoot = path.join(sandboxRoot, 'repo');
      const trackedUpstream = path.join(tempRepoRoot, 'upstream');
      const aliasPath = path.join(sandboxRoot, 'upstream-alias');

      mkdirSync(trackedUpstream, { recursive: true });
      symlinkSync(trackedUpstream, aliasPath, 'dir');

      expect(() => requireIsolatedParityDir(tempRepoRoot, aliasPath)).toThrow(
        /must be outside the tracked upstream\/ submodule/,
      );
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });
});
