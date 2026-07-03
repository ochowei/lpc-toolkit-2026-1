import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, '../../../scripts/check-boundaries.mjs');

function writeFixtureFile(root: string, filePath: string, source: string): void {
  const fullPath = path.join(root, filePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, source);
}

function runBoundaryCheck(root: string): { ok: true; stdout: string } | { ok: false; output: string } {
  try {
    return {
      ok: true,
      stdout: execFileSync('node', [scriptPath, root], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return {
      ok: false,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

function makeRepoFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'lpc-boundary-check-'));
  writeFixtureFile(
    root,
    'packages/core/src/index.ts',
    "export interface CanvasAdapter {}\n",
  );
  writeFixtureFile(
    root,
    'packages/web/src/adapter/browser-canvas-adapter.ts',
    "import type { CanvasAdapter } from '@lpc-toolkit/core';\nexport const adapter = {} as CanvasAdapter;\n",
  );
  return root;
}

describe('architecture boundary check', () => {
  it('passes for allowed core and web imports', () => {
    const root = makeRepoFixture();

    const result = runBoundaryCheck(root);

    expect(result).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('rejects browser runtime globals in core source', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/browser-leak.ts',
      "export const canvas = document.createElement('canvas');\n",
    );

    const result = runBoundaryCheck(root);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.output).toContain('packages/core/src/browser-leak.ts');
      expect(result.output).toContain('forbidden core runtime global');
      expect(result.output).toContain('document');
    }
  });

  it('rejects concrete runtime imports in core source', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/node-leak.ts',
      "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
    );

    const result = runBoundaryCheck(root);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.output).toContain('packages/core/src/node-leak.ts');
      expect(result.output).toContain('forbidden core import');
      expect(result.output).toContain('node:fs');
    }
  });

  it('rejects web imports that reach into core source internals', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/internal-core-import.ts',
      "import { composeSelections } from '../../core/src/compose';\nexport const compose = composeSelections;\n",
    );

    const result = runBoundaryCheck(root);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.output).toContain('packages/web/src/internal-core-import.ts');
      expect(result.output).toContain('web must import core through @lpc-toolkit/core');
      expect(result.output).toContain('../../core/src/compose');
    }
  });
});
