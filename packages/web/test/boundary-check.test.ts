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

  it('allows import-like text in regular expression literals', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/legal-regex.ts',
      "export const importExample = /import('react')/;\n",
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows import-like text in a regular expression returned from a function', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/legal-return-regex.ts',
      `export function returned(value: string) {
  return /import('react')/.test(value);
}
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows import-like regular expressions in control-flow statement bodies', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/legal-control-regex.ts',
      `if (enabled) /import('@lpc-toolkit\\/web')/.test(value);
else /import('react')/.test(value);
do /import('react')/.test(value); while (false);
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('does not let division hide a later forbidden import', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/division-import-leak.ts',
      "const ratio = 10 / divisor; import('react');\n",
    );

    expectBoundaryFailure(
      root,
      'forbidden core import',
      'react',
      'packages/core/src/division-import-leak.ts',
    );
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

  it('does not treat template literals with substitutions as static import specifiers', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/presets/src/computed-import.ts',
      "const packageName = 'web';\nexport const load = import(`@lpc-toolkit/${packageName}`);\n",
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('does not treat quoted computed-template expressions as outer static specifiers', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/presets/src/quoted-computed-imports.ts',
      `export const direct = import(\`prefix-\${'@lpc-toolkit/web'}\`);
export const commented = import(\`prefix-\${/* example */ '@lpc-toolkit/cli'}\`);
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('detects a forbidden nested import inside a computed-template expression', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/presets/src/nested-template-leak.ts',
      "export const load = import(`prefix-${import('@lpc-toolkit/web')}`);\n",
    );

    const result = runBoundaryCheck(root);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.output).toContain('packages/presets/src/nested-template-leak.ts');
      expect(result.output).toContain('forbidden presets import');
      expect(result.output).toContain('@lpc-toolkit/web');
    }
  });

  it.each([
    [
      'core',
      'packages/core/src/template-leak.ts',
      "export const load = import(`@lpc-toolkit/web`);",
      'forbidden core import',
      '@lpc-toolkit/web',
    ],
    [
      'presets',
      'packages/presets/src/template-leak.ts',
      'export const load = import(`node:fs`);',
      'forbidden presets import',
      'node:fs',
    ],
    [
      'web',
      'packages/web/src/template-leak.ts',
      'export const load = import(`@lpc-toolkit/core/internal`);',
      'web must import core through @lpc-toolkit/core',
      '@lpc-toolkit/core/internal',
    ],
  ])('rejects no-substitution template dynamic imports in %s', (
    _name,
    filePath,
    source,
    message,
    expected,
  ) => {
    const root = makeRepoFixture();
    writeFixtureFile(root, filePath, source);

    const result = runBoundaryCheck(root);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.output).toContain(filePath);
      expect(result.output).toContain(message);
      expect(result.output).toContain(expected);
    }
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
    ['concrete canvas subpath', "import '@napi-rs/canvas/load-image';", '@napi-rs/canvas/load-image'],
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

  it('rejects browser runtime globals in presets template expressions', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/presets/src/browser-template-leak.ts',
      'export const title = `${document.title}`;\n',
    );

    expectBoundaryFailure(
      root,
      'forbidden presets runtime global',
      'document',
      'packages/presets/src/browser-template-leak.ts',
    );
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
    ['concrete canvas subpath', "import '@napi-rs/canvas/load-image';", '@napi-rs/canvas/load-image'],
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

  it('allows noncomputed destructuring property keys named after runtime globals', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/core/src/legal-destructuring-key.ts',
      'const metadata = { document: 1 };\nexport const { document: localDocument } = metadata;\n',
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it.each([
    ['template expression', 'export const title = `${document.title}`;'],
    ['code after a URL string', "const url = 'https://example.test'; document.title = url;"],
  ])('rejects browser runtime globals in core %s', (_name, source) => {
    const root = makeRepoFixture();
    writeFixtureFile(root, 'packages/core/src/runtime-leak.ts', source);

    expectBoundaryFailure(
      root,
      'forbidden core runtime global',
      'document',
      'packages/core/src/runtime-leak.ts',
    );
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

  it('allows components to import hooks, UI components, and public core types', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/components/legal.tsx',
      `import type {
  CanvasAdapter as Adapter,
} from '@lpc-toolkit/core';
import { useCatalog } from '../hooks/use-catalog';
import { Button } from './ui/button';
export type ComponentAdapter = Adapter;
export { Button, useCatalog };
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('ignores component ownership words in comments, strings, and template text', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/components/legal-words.tsx',
      `// import { composeSelections } from '@lpc-toolkit/core';
export const note = "composeSelections from '../lib/zip-export'";
export const example = \`import { composeSelections } from '@lpc-toolkit/core'\`;
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows an unrelated semicolonless declaration after a dynamic core import', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/components/legal-dynamic-import.tsx',
      `import('@lpc-toolkit/core').then(() => {
  const composeSelections = 1;
  return composeSelections;
});
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows shadowed callback parameters to use unrelated composition properties', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/components/legal-shadowed-callback.tsx',
      `import('@lpc-toolkit/core').then((core) => {
  function nested(core) {
    return core.composeSelections;
  }
  return 1;
});
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows composition property access in a dynamic import rejection callback', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/components/legal-rejection-callback.tsx',
      "import('@lpc-toolkit/core').then(() => 1, (core) => core.composeSelections);\n",
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('allows type-only imports and re-exports of core composition declarations', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/components/legal-type-composition.tsx',
      `import type { composeSelections as ComposeA } from '@lpc-toolkit/core';
import { type composeSelections as ComposeB } from '@lpc-toolkit/core';
export type { composeSelections as ComposeC } from '@lpc-toolkit/core';
export { type composeSelections as ComposeD } from '@lpc-toolkit/core';
export type Types = ComposeA | ComposeB;
`,
    );

    expect(runBoundaryCheck(root)).toEqual({
      ok: true,
      stdout: 'Architecture boundary check passed.\n',
    });
  });

  it('rejects parenthesized awaited dynamic core composition access in components', () => {
    const root = makeRepoFixture();
    writeFixtureFile(
      root,
      'packages/web/src/components/awaited-core-composition-leak.tsx',
      "const compose = (await import('@lpc-toolkit/core')).composeSelections;\n",
    );

    expectBoundaryFailure(
      root,
      'forbidden web component import',
      'composeSelections',
      'packages/web/src/components/awaited-core-composition-leak.tsx',
    );
  });

  it.each([
    [
      'core composition',
      "import { composeSelections as compose } from '@lpc-toolkit/core';\nexport { compose };",
      'composeSelections',
    ],
    [
      'multiline core composition',
      "import {\n  type CanvasAdapter,\n  composeSelections as compose,\n} from '@lpc-toolkit/core';\nexport { compose };",
      'composeSelections',
    ],
    [
      're-exported core composition',
      "export { composeSelections } from '@lpc-toolkit/core';",
      'composeSelections',
    ],
    [
      'dynamic core composition access',
      "export const compose = import('@lpc-toolkit/core').then((core) => core.composeSelections);",
      'composeSelections',
    ],
    [
      'dynamic core composition destructuring',
      "export const compose = import('@lpc-toolkit/core').then(({ composeSelections }) => composeSelections);",
      'composeSelections',
    ],
    [
      'browser adapter',
      "import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';",
      'browser-canvas-adapter',
    ],
    [
      'character export workflow',
      "import { exportCharacterArtifact } from '../lib/character-export';",
      'character-export',
    ],
    [
      'spritesheet export workflow',
      "import { exportSpritesheetBundle } from '../lib/spritesheet-export';",
      'spritesheet-export',
    ],
    [
      'ZIP export workflow',
      "import { exportByFrameZip } from '../lib/zip-export';",
      'zip-export',
    ],
    [
      'dynamic browser adapter workflow',
      "export const loadAdapter = () => import('../adapter/browser-canvas-adapter');",
      'browser-canvas-adapter',
    ],
    [
      'exported character workflow',
      "export { exportCharacterArtifact } from '../lib/character-export';",
      'character-export',
    ],
    [
      'namespace spritesheet workflow',
      "import * as spritesheet from '../lib/spritesheet-export';\nexport { spritesheet };",
      'spritesheet-export',
    ],
    [
      'default ZIP workflow',
      "import zipExport from '../lib/zip-export';\nexport { zipExport };",
      'zip-export',
    ],
  ])('rejects component-owned %s', (_name, source, expected) => {
    const root = makeRepoFixture();
    writeFixtureFile(root, 'packages/web/src/components/leak.tsx', source);
    expectBoundaryFailure(
      root,
      'forbidden web component import',
      expected,
      'packages/web/src/components/leak.tsx',
    );
  });
});
