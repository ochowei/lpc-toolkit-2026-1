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
    "import type { CoreType } from './types';\nexport interface CanvasAdapter extends CoreType {}\n",
  );
  writeFixtureFile(root, 'packages/core/src/types.ts', 'export interface CoreType {}\n');
  writeFixtureFile(root, 'packages/presets/src/index.ts', 'export const preset = {};\n');
  writeFixtureFile(root, 'packages/cli/src/index.ts', 'export const cli = {};\n');
  writeFixtureFile(
    root,
    'packages/web/src/adapter/browser-canvas-adapter.ts',
    "import type { CanvasAdapter } from '@lpc-toolkit/core';\nexport const adapter = {} as CanvasAdapter;\n",
  );
  return root;
}

function expectBoundaryFailure(
  root: string,
  message: string,
  expected: string,
  expectedPath = 'packages/core/src/leak.ts',
): void {
  const result = runBoundaryCheck(root);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.output).toContain(expectedPath);
    expect(result.output).toContain(message);
    expect(result.output).toContain(expected);
  }
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

  it('allows forbidden-looking words in core comments and strings', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/legal-words.ts',
      "// document and react are words here\nexport const note = 'node:fs document react';\n",
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows unrelated package names containing forbidden package text', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/legal-packages.ts',
      "import '@lpc-toolkit/web-tools';\nimport '@lpc-toolkit/presets-extra';\nimport '@lpc-toolkit/cli-utils';\n",
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows presets to import the public core entry, local modules, and non-filesystem Node builtins', () => {
    const root = makeRepoFixture();
    writeFixtureFile(root, 'packages/presets/src/local.ts', 'export interface LocalPreset {}\n');
    writeFixtureFile(
      root,
      'packages/presets/src/legal-imports.ts',
      "import type { CanvasAdapter } from '@lpc-toolkit/core';\nimport type { LocalPreset } from './local';\nimport { posix } from 'node:path';\nexport type Preset = CanvasAdapter & LocalPreset;\nexport const separator = posix.sep;\n",
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows forbidden-looking words in presets comments and strings', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/presets/src/legal-words.ts',
      "// window.localStorage, react, node:fs, and @lpc-toolkit/web are words here\nexport const note = 'window react node:fs @napi-rs/canvas';\n",
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('ignores complete import syntax in comments, strings, and template text', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/import-examples.ts',
      `// import React from 'react';
export const example = "import '@lpc-toolkit/cli'";
`,
    );
    writeFixtureFile(
      root,
      'packages/presets/src/import-examples.ts',
      `// import '@lpc-toolkit/web';
/* import React from 'react'; */
export const example = "import '@lpc-toolkit/cli'";
export const template = \`export { download } from '@lpc-toolkit/web';\`;
`,
    );
    writeFixtureFile(
      root,
      'packages/web/src/import-examples.ts',
      `/* import value from '../../core/src/index'; */
export const template = \`import('@lpc-toolkit/core/internal')\`;
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it.each([
    ['web package', "import '@lpc-toolkit/web';", '@lpc-toolkit/web'],
    ['web source', "import '../../web/src/lib/download';", '../../web/src/lib/download'],
    ['CLI package', "import '@lpc-toolkit/cli';", '@lpc-toolkit/cli'],
    ['CLI source', "import '../../cli/src/index';", '../../cli/src/index'],
    ['React', "import React from 'react';", 'react'],
    ['Node filesystem', "import { readFileSync } from 'node:fs';", 'node:fs'],
    ['Node filesystem promises', "import { readFile } from 'node:fs/promises';", 'node:fs/promises'],
    ['bare Node filesystem', "import { readFileSync } from 'fs';", 'fs'],
    ['bare Node filesystem promises', "import { readFile } from 'fs/promises';", 'fs/promises'],
    ['concrete canvas', "import { createCanvas } from '@napi-rs/canvas';", '@napi-rs/canvas'],
    ['dynamic web import', "export const load = import('@lpc-toolkit/web');", '@lpc-toolkit/web'],
    [
      'dynamic web import in a template expression',
      "export const load = `${import('@lpc-toolkit/web')}`;",
      '@lpc-toolkit/web',
    ],
    ['web export-from', "export { download } from '@lpc-toolkit/web';", '@lpc-toolkit/web'],
    [
      'multiline named web import',
      "import {\n  download,\n} from '@lpc-toolkit/web';",
      '@lpc-toolkit/web',
    ],
  ])('rejects presets dependency on %s', (_name, source, expected) => {
    const root = makeRepoFixture();
    writeFixtureFile(root, 'packages/presets/src/leak.ts', source);
    expectBoundaryFailure(
      root,
      'forbidden presets import',
      expected,
      'packages/presets/src/leak.ts',
    );
  });

  it('rejects browser runtime globals in presets source', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/presets/src/browser-leak.ts',
      'export const saved = window.localStorage;\n',
    );

    const result = runBoundaryCheck(root);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.output).toContain('packages/presets/src/browser-leak.ts');
      expect(result.output).toContain('forbidden presets runtime global');
      expect(result.output).toContain('window');
    }
  });

  it.each([
    ['presets package', "import '@lpc-toolkit/presets';", '@lpc-toolkit/presets'],
    ['presets source', "import '../../presets/src/index';", '../../presets/src/index'],
    ['web package', "import '@lpc-toolkit/web';", '@lpc-toolkit/web'],
    ['web source', "import '../../web/src/lib/download';", '../../web/src/lib/download'],
    ['CLI package', "import '@lpc-toolkit/cli';", '@lpc-toolkit/cli'],
    ['CLI source', "import '../../cli/src/index';", '../../cli/src/index'],
    ['React', "import React from 'react';", 'react'],
    ['concrete canvas', "import { createCanvas } from '@napi-rs/canvas';", '@napi-rs/canvas'],
  ])('rejects core imports from %s', (_name, source, expected) => {
    const root = makeRepoFixture();
    writeFixtureFile(root, 'packages/core/src/leak.ts', source);
    expectBoundaryFailure(root, 'forbidden core import', expected);
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
