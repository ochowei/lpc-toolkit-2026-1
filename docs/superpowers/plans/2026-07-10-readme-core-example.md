# README Core Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken README core composition example with a palette-aware body-and-Afro example and protect it with an executable composition contract test.

**Architecture:** Keep production core unchanged. Add one core test that checks the README's critical API wiring and independently executes the same selection through public core exports using controlled catalog, palette, pixel, and credit fixtures; then update only the README example block to satisfy that contract.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, existing `@napi-rs/canvas` test adapter (MIT), Markdown.

## Global Constraints

- Use pnpm for repository commands and prefix every terminal command with `rtk`.
- Do not add dependencies. The existing test-only `@napi-rs/canvas` dependency is MIT-licensed and GPL-compatible.
- Do not modify or install packages inside `upstream/`; this plan must not read runtime pixels or metadata from it.
- Keep `packages/core/src/**` environment-agnostic and unchanged.
- Preserve mandatory attribution by asserting that the composed result contains the body and Afro credit entries and their resolved sprite paths.
- Use exact case-sensitive catalog identity `Body Color`.
- Use `recolor: 'brown'` for the body and `recolor: 'black'` for Afro hair; do not use file `variant` for either recolor-backed item.
- Build palette metadata with `createPaletteCatalog` and pass `makeResolvePalette(catalog, palettes, selections)` to `composeSelections`.
- Keep the README example focused on the standard 832×3456 sheet; custom-animation API documentation belongs to the later documentation-alignment plan.
- After the implementation commit, update this plan's completed checkboxes and add an implementation record containing the exact commit hash and verification results in a separate `docs(plan)` commit.

---

## File Structure

### New test

- `packages/core/test/readme-example.test.ts`: owns the README example contract, controlled canonical-style fixtures, actual public-API composition, recolor pixel assertion, animation extraction assertion, and attribution assertions.

### Existing documentation

- `README.md:106`: replace only the `@lpc-toolkit/core` example code block. The public API list and broader README cleanup remain out of scope for this plan.

No production source file is created or modified.

---

### Task 1: Make the README Core Example Executable and Correct

**Files:**
- Create: `packages/core/test/readme-example.test.ts`
- Modify: `README.md:106`
- Update after implementation: `docs/superpowers/plans/2026-07-10-readme-core-example.md`

**Interfaces:**
- Consumes: public exports `createCatalog`, `createPaletteCatalog`, `composeSelections`, `extractAnimation`, and `makeResolvePalette` from `packages/core/src/index.ts`.
- Consumes: test-only `createNodeCanvasAdapter()` and `solidImage()` from `packages/core/test/helpers/node-canvas-adapter.ts`.
- Produces: a README example using caller-provided `records`, `paletteRecords`, and `adapter`, with precise recolor and attribution behavior.
- Produces: a regression test that fails if the example loses palette loading, uses the wrong catalog identity, returns to file variants, points readers at the upstream checkout, fails to render visible recolored pixels, or loses credits.

- [ ] **Step 1: Add the failing README and composition contract test**

Create `packages/core/test/readme-example.test.ts` with this complete content:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  composeSelections,
  createCatalog,
  createPaletteCatalog,
  extractAnimation,
  makeResolvePalette,
  type CanvasAdapter,
  type FilePath,
  type ItemDefinition,
  type Selections,
} from '../src/index.js';
import {
  createNodeCanvasAdapter,
  solidImage,
} from './helpers/node-canvas-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const readmePath = path.resolve(here, '../../../README.md');
const walkOffsetY = 8 * 64;

const records: Readonly<Record<FilePath, ItemDefinition>> = {
  'body/body.json': {
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk'],
    credits: [
      {
        file: 'body/bodies/male',
        notes: '',
        authors: ['Body Artist'],
        licenses: ['CC0'],
        urls: [],
      },
    ],
    recolors: { material: 'body', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'body/bodies/male/' },
  },
  'hair/afro/hair_afro.json': {
    name: 'Afro',
    type_name: 'hair',
    animations: ['walk'],
    credits: [
      {
        file: 'hair/afro',
        notes: '',
        authors: ['Hair Artist'],
        licenses: ['CC0'],
        urls: [],
      },
    ],
    recolors: { material: 'hair', palettes: ['ulpc'] },
    layer_1: { zPos: 120, male: 'hair/afro/adult/' },
  },
};

const paletteRecords: Readonly<Record<FilePath, unknown>> = {
  'palette_definitions/meta_ulpc.json': {
    type: 'version',
    label: 'ULPC',
  },
  'palette_definitions/body/meta_body.json': {
    type: 'material',
    default: 'ulpc',
    base: 'light',
  },
  'palette_definitions/body/body_ulpc.json': {
    light: ['#ff0000'],
    brown: ['#804000'],
  },
  'palette_definitions/hair/meta_hair.json': {
    type: 'material',
    default: 'ulpc',
    base: 'orange',
  },
  'palette_definitions/hair/hair_ulpc.json': {
    orange: ['#00ff00'],
    black: ['#111111'],
  },
};

const selections: Selections = {
  bodyType: 'male',
  items: {
    body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
    hair: { typeName: 'hair', name: 'Afro', recolor: 'black' },
  },
};

function readReadmeExample(): string {
  const readme = readFileSync(readmePath, 'utf8');
  const match = readme.match(/### Example\n\n```ts\n([\s\S]*?)\n```/);
  if (!match?.[1]) {
    throw new Error('README core TypeScript example block was not found.');
  }
  return match[1];
}

function createFixtureAdapter(): {
  readonly adapter: CanvasAdapter;
  readonly loadCalls: string[];
} {
  const base = createNodeCanvasAdapter();
  const loadCalls: string[] = [];

  return {
    loadCalls,
    adapter: {
      createCanvas: base.createCanvas,
      async loadImage(spritePath: string) {
        loadCalls.push(spritePath);
        if (spritePath.endsWith('/body/bodies/male/walk.png')) {
          return solidImage(8, 8, '#ff0000');
        }
        if (spritePath.endsWith('/hair/afro/adult/walk.png')) {
          return solidImage(8, 8, '#00ff00');
        }
        throw new Error(`Unexpected README fixture path: ${spritePath}`);
      },
    },
  };
}

describe('README core example', () => {
  it('documents the palette-aware recolor wiring', () => {
    const example = readReadmeExample();

    expect(example).toContain('createPaletteCatalog');
    expect(example).toContain('makeResolvePalette');
    expect(example).toContain('createPaletteCatalog(paletteRecords)');
    expect(example).toContain(
      "body: { typeName: 'body', name: 'Body Color', recolor: 'brown' }",
    );
    expect(example).toContain(
      "hair: { typeName: 'hair', name: 'Afro', recolor: 'black' }",
    );
    expect(example).toContain(
      'resolvePalette: makeResolvePalette(catalog, palettes, selections)',
    );
    expect(example).not.toContain("variant: 'light'");
    expect(example).not.toContain("variant: 'black'");
    expect(example).not.toContain('upstream checkout');
  });

  it('renders visible recolored pixels and precise credits through public APIs', async () => {
    const { catalog, warnings: catalogWarnings } = createCatalog(records);
    const { palettes, warnings: paletteWarnings } =
      createPaletteCatalog(paletteRecords);
    const { adapter, loadCalls } = createFixtureAdapter();

    expect(catalogWarnings).toEqual([]);
    expect(paletteWarnings).toEqual([]);

    const sheet = await composeSelections(selections, {
      catalog,
      adapter,
      spritesheetsBaseUrl: '/assets',
      resolvePalette: makeResolvePalette(catalog, palettes, selections),
    });
    const walk = extractAnimation(sheet, 'walk', { adapter });

    expect(loadCalls).toEqual([
      '/assets/spritesheets/body/bodies/male/walk.png',
      '/assets/spritesheets/hair/afro/adult/walk.png',
    ]);
    expect(sheet.layers.map((layer) => layer.path)).toEqual([
      'spritesheets/body/bodies/male/walk.png',
      'spritesheets/hair/afro/adult/walk.png',
    ]);
    expect(sheet.credits.entries.map((entry) => entry.file)).toEqual([
      'body/bodies/male',
      'hair/afro',
    ]);
    expect(sheet.credits.resolvedPaths).toEqual([
      'body/bodies/male/walk.png',
      'hair/afro/adult/walk.png',
    ]);

    const sheetPixel = sheet.canvas
      .getContext('2d')
      .getImageData(0, walkOffsetY, 1, 1).data;
    const walkPixel = walk.canvas
      .getContext('2d')
      .getImageData(0, 0, 1, 1).data;

    expect(Array.from(sheetPixel)).toEqual([17, 17, 17, 255]);
    expect(Array.from(walkPixel)).toEqual([17, 17, 17, 255]);
  });
});
```

- [ ] **Step 2: Run the new test and verify the documentation assertion fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
```

Expected: FAIL in `documents the palette-aware recolor wiring` because the
current README does not contain `createPaletteCatalog`; the executable
composition test should pass, proving the fixture and intended API flow are
valid before changing the documentation.

- [ ] **Step 3: Replace the broken README example with the palette-aware version**

In `README.md`, replace only the TypeScript code block under `### Example` with:

```ts
import {
  createCatalog,
  createPaletteCatalog,
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type CanvasAdapter,
  type FilePath,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';

// The caller loads sheet_definitions and palette_definitions JSON records and
// supplies an environment-specific canvas adapter.
declare const records: Readonly<Record<FilePath, ItemDefinition>>;
declare const paletteRecords: Readonly<Record<FilePath, unknown>>;
declare const adapter: CanvasAdapter;

// 1. Build the item and palette catalogs from records keyed by file path.
const { catalog, warnings: catalogWarnings } = createCatalog(records);
const { palettes, warnings: paletteWarnings } =
  createPaletteCatalog(paletteRecords);
console.warn(...catalogWarnings, ...paletteWarnings);

// 2. Recolor-backed assets use `recolor`, not a filename `variant`.
const selections: Selections = {
  bodyType: 'male',
  items: {
    body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
    hair: { typeName: 'hair', name: 'Afro', recolor: 'black' },
  },
};

// 3. Compose the standard 832×3456 master sheet. The base URL/path is the
//    directory that contains `spritesheets/`, such as the prepared `assets/`.
const sheet = await composeSelections(selections, {
  catalog,
  adapter,
  spritesheetsBaseUrl: '/path/to/repo/assets',
  resolvePalette: makeResolvePalette(catalog, palettes, selections),
});

// 4. Crop one animation out of the master sheet.
const walk = extractAnimation(sheet, 'walk', { adapter });

// Attribution is always available alongside both outputs.
console.log(sheet.credits.licenses, walk.credits.licenses);
```

Do not update the adjacent Public API list in this task; finding 6 is owned by
the later documentation-alignment plan.

- [ ] **Step 4: Run the focused contract test and verify both cases pass**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
```

Expected: PASS with 2 tests. The actual count may be reported within the core
Vitest summary, but there must be no skipped or failed test in this file.

- [ ] **Step 5: Run the complete core test suite**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/core test
```

Expected: PASS for all core tests, including `readme-example.test.ts`.

- [ ] **Step 6: Run workspace type and architecture verification**

Run:

```bash
rtk pnpm typecheck
rtk pnpm check:boundaries
```

Expected: both commands exit 0. `check:boundaries` must report
`Architecture boundary check passed.`

- [ ] **Step 7: Review the surgical diff**

Run:

```bash
rtk git diff --check
rtk git status --short
rtk git diff -- README.md packages/core/test/readme-example.test.ts
```

Expected: no whitespace errors; only `README.md`, the new contract test, and
the already-tracked plan file may be involved. The temporary
`docs/README-ARCHITECTURE-AUDIT.tmp.md` remains untracked and must not be staged.

- [ ] **Step 8: Commit the tested implementation**

Run:

```bash
rtk git add README.md packages/core/test/readme-example.test.ts
rtk git commit -m "docs: fix core composition example"
rtk git rev-parse HEAD
```

Expected: the commit contains exactly the README example and its executable
contract test. Save the exact 40-character hash printed by the final command.

- [ ] **Step 9: Record completion in this plan and commit the record**

Use `apply_patch` to mark Steps 1 through 9 complete. Directly below this step,
add an implementation record containing:

- the exact implementation commit hash from Step 8 and its subject;
- focused contract test: PASS, 2 tests;
- full core test suite: PASS, including the reported test count;
- workspace typecheck: PASS;
- boundary check: PASS;
- confirmation that the temporary audit file was not staged.

Then run:

```bash
rtk git add docs/superpowers/plans/2026-07-10-readme-core-example.md
rtk git commit -m "docs(plan): record README example completion"
```

Expected: a documentation-only commit recording the verified completion of
Plan 1.
