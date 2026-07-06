# Agent-First CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first `packages/cli/` package: an agent-first Node CLI that can explore LPC assets, validate selection JSON, materialize presets, encode/decode web tokens, and render spritesheets/animation artifacts with mandatory attribution.

**Architecture:** `packages/cli/` is a Node adapter around `@lpc-toolkit/core`; it owns filesystem, canvas, PNG writing, ZIP bundling, command parsing, and machine-readable response formatting. `packages/core/` remains environment-agnostic, and shared preset data is extracted into a pure package so web and CLI can both use it without React or browser imports.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, `@lpc-toolkit/core`, `@napi-rs/canvas` (MIT), `jszip` (MIT), Node `fs/path/url`.

---

## File Structure

- Create `packages/cli/package.json`: package metadata, `bin`, scripts, dependencies.
- Create `packages/cli/tsconfig.json`: Node package TypeScript config.
- Create `packages/cli/vitest.config.ts`: CLI tests config.
- Create `packages/cli/src/index.ts`: executable entrypoint; calls `main`.
- Create `packages/cli/src/main.ts`: command dispatcher and process I/O boundary.
- Create `packages/cli/src/args.ts`: small dependency-free argument parser.
- Create `packages/cli/src/response.ts`: JSON envelope, human output helpers, error formatting.
- Create `packages/cli/src/context.ts`: repo/default asset-root discovery and runtime context.
- Create `packages/cli/src/loaders.ts`: Node JSON directory loading for catalog/palettes.
- Create `packages/cli/src/selection.ts`: selection JSON parse/serialize and conversion to core `Selections`.
- Create `packages/cli/src/validation.ts`: shared selection validation.
- Create `packages/cli/src/catalog-commands.ts`: `catalog types/items/item`.
- Create `packages/cli/src/token-commands.ts`: `token encode/decode`.
- Create `packages/cli/src/preset-commands.ts`: `preset list/materialize/render` command logic.
- Create `packages/cli/src/render.ts`: composition and artifact export workflow.
- Create `packages/cli/src/node-canvas-adapter.ts`: `@napi-rs/canvas` adapter and PNG writer.
- Create `packages/cli/src/zip.ts`: optional ZIP bundling.
- Create `packages/cli/test/*.test.ts`: focused unit and integration coverage.
- Create `packages/presets/package.json`: pure shared preset package.
- Create `packages/presets/tsconfig.json`: preset package TypeScript config.
- Create `packages/presets/src/index.ts`: shared preset types/data and pure apply helper.
- Modify `packages/web/package.json`: depend on `@lpc-toolkit/presets`.
- Modify `packages/web/src/presets.ts`: re-export shared presets for web compatibility.
- Modify `packages/web/src/presets-apply.ts`: re-export shared `computePresetSelection`.
- Leave root `package.json` scripts unchanged; existing `pnpm -r` workspace scripts cover `packages/*`.
- Review `scripts/check-boundaries.mjs` in Task 9; modify it only if the boundary command reports the new CLI package as a false positive.

## Task 1: Scaffold CLI Package

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/main.ts`
- Test: `packages/cli/test/smoke.test.ts`

- [x] **Step 1: Write the failing smoke test**

Create `packages/cli/test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/main.js';

describe('runCli', () => {
  it('prints help for no command', async () => {
    const writes: string[] = [];
    const errors: string[] = [];

    const code = await runCli([], {
      stdout: (text) => writes.push(text),
      stderr: (text) => errors.push(text),
      cwd: '/tmp',
    });

    expect(code).toBe(0);
    expect(writes.join('')).toContain('lpc catalog types');
    expect(errors).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts
```

Expected: FAIL because `@lpc-toolkit/cli` and `packages/cli/src/main.ts` do not exist.

- [x] **Step 3: Add package files**

Create `packages/cli/package.json`:

```json
{
  "name": "@lpc-toolkit/cli",
  "version": "0.0.0",
  "private": true,
  "license": "GPL-3.0-or-later",
  "type": "module",
  "bin": {
    "lpc": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@lpc-toolkit/core": "workspace:*",
    "@napi-rs/canvas": "^1.0.0",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/node": "^25.8.0",
    "tsx": "^4.19.2"
  }
}
```

Create `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "types": ["node"],
    "lib": ["ES2022"]
  },
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

Create `packages/cli/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [x] **Step 4: Add minimal executable and dispatcher**

Create `packages/cli/src/main.ts`:

```ts
export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
}

const HELP = `lpc-toolkit CLI

Commands:
  lpc catalog types
  lpc catalog items --type <typeName>
  lpc catalog item <item-id-or-type/name>
  lpc selection validate --selection <file>
  lpc render --selection <file> --out <dir>
  lpc token decode --token <hash-or-token> --out <file>
  lpc token encode --selection <file>
  lpc preset list
  lpc preset materialize <preset-id> --out <file>
  lpc preset render <preset-id> --out <dir>
`;

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.stdout(HELP);
    return 0;
  }
  io.stderr(`Unknown command: ${argv.join(' ')}\n`);
  return 1;
}
```

Create `packages/cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { runCli } from './main.js';

const code = await runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
});

process.exitCode = code;
```

- [x] **Step 5: Run smoke test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts
```

Expected: PASS.

- [x] **Step 6: Run CLI typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
rtk git add packages/cli
rtk git commit -m "feat(cli): scaffold package"
```

Implementation note: Scaffolded `@lpc-toolkit/cli` with the smoke-tested
`runCli` help path, executable entrypoint, Vitest config, Node TypeScript
config, approved CLI runtime dependencies, and the required workspace lockfile
update. Code-quality review found that the initial single tsconfig caused
production builds to emit tests/config into `dist`, so a follow-up build config
split keeps `typecheck` covering tests while `build` emits runtime files only.

Commit: a4a0c357123ad0f49a99ae979ef8831819c03dd3,
2f9e6e1e7260bd74f9f195ca34e56af556825b49

Verification: `rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/cli typecheck` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/cli build` PASS; spec compliance
review PASS; code quality review PASS.

## Task 2: Add Argument Parser And Response Envelope

**Files:**
- Create: `packages/cli/src/args.ts`
- Create: `packages/cli/src/response.ts`
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/args.test.ts`
- Test: `packages/cli/test/response.test.ts`

- [x] **Step 1: Write parser tests**

Create `packages/cli/test/args.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('parses command path, flags, and positionals', () => {
    expect(
      parseArgs([
        'catalog',
        'items',
        '--type',
        'hair',
        '--json',
        '--allow-partial',
        'extra',
      ]),
    ).toEqual({
      command: ['catalog', 'items'],
      flags: new Map([
        ['type', 'hair'],
        ['json', true],
        ['allow-partial', true],
      ]),
      positionals: ['extra'],
    });
  });

  it('keeps repeated flags as arrays', () => {
    expect(parseArgs(['render', '--animation', 'walk', '--animation', 'idle']).flags)
      .toEqual(new Map([['animation', ['walk', 'idle']]]));
  });
});
```

- [x] **Step 2: Write response tests**

Create `packages/cli/test/response.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  commandError,
  commandOk,
  formatJsonResponse,
  type CliIssue,
} from '../src/response.js';

describe('response envelope', () => {
  it('formats success as stable JSON', () => {
    const warning: CliIssue = {
      code: 'catalog_warning',
      message: 'One catalog file was skipped.',
    };

    expect(JSON.parse(formatJsonResponse(commandOk('catalog types', { count: 3 }, [warning]))))
      .toEqual({
        ok: true,
        command: 'catalog types',
        data: { count: 3 },
        warnings: [warning],
        errors: [],
      });
  });

  it('formats errors without data', () => {
    const response = commandError('render', {
      code: 'missing_sprite_path',
      message: 'Missing spritesheets/body/bodies/male/walk.png',
    });

    expect(JSON.parse(formatJsonResponse(response))).toEqual({
      ok: false,
      command: 'render',
      data: null,
      warnings: [],
      errors: [
        {
          code: 'missing_sprite_path',
          message: 'Missing spritesheets/body/bodies/male/walk.png',
        },
      ],
    });
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts response.test.ts
```

Expected: FAIL because `args.ts` and `response.ts` do not exist.

- [x] **Step 4: Implement `args.ts`**

Create `packages/cli/src/args.ts`:

```ts
export type FlagValue = true | string | readonly string[];

export interface ParsedArgs {
  readonly command: readonly string[];
  readonly flags: ReadonlyMap<string, FlagValue>;
  readonly positionals: readonly string[];
}

function addFlag(
  flags: Map<string, FlagValue>,
  key: string,
  value: true | string,
): void {
  const previous = flags.get(key);
  if (previous === undefined) {
    flags.set(key, value);
    return;
  }
  if (Array.isArray(previous)) {
    flags.set(key, [...previous, String(value)]);
    return;
  }
  flags.set(key, [String(previous), String(value)]);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const command: string[] = [];
  const positionals: string[] = [];
  const flags = new Map<string, FlagValue>();
  let seenFlag = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      seenFlag = true;
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        addFlag(flags, key, next);
        i++;
      } else {
        addFlag(flags, key, true);
      }
      continue;
    }

    if (!seenFlag && command.length < 2) {
      command.push(token);
    } else {
      positionals.push(token);
    }
  }

  return { command, flags, positionals };
}

export function flagString(
  flags: ReadonlyMap<string, FlagValue>,
  key: string,
): string | undefined {
  const value = flags.get(key);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function flagStrings(
  flags: ReadonlyMap<string, FlagValue>,
  key: string,
): readonly string[] {
  const value = flags.get(key);
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  return [];
}

export function flagBoolean(
  flags: ReadonlyMap<string, FlagValue>,
  key: string,
): boolean {
  return flags.get(key) === true;
}
```

- [x] **Step 5: Implement `response.ts`**

Create `packages/cli/src/response.ts`:

```ts
export interface CliIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface CliResponse<T> {
  readonly ok: boolean;
  readonly command: string;
  readonly data: T | null;
  readonly warnings: readonly CliIssue[];
  readonly errors: readonly CliIssue[];
}

export function commandOk<T>(
  command: string,
  data: T,
  warnings: readonly CliIssue[] = [],
): CliResponse<T> {
  return { ok: true, command, data, warnings, errors: [] };
}

export function commandError(
  command: string,
  error: CliIssue,
  warnings: readonly CliIssue[] = [],
): CliResponse<null> {
  return { ok: false, command, data: null, warnings, errors: [error] };
}

export function formatJsonResponse(response: CliResponse<unknown>): string {
  return `${JSON.stringify(response, null, 2)}\n`;
}

export function humanIssue(issue: CliIssue): string {
  return issue.path
    ? `${issue.code}: ${issue.message} (${issue.path})`
    : `${issue.code}: ${issue.message}`;
}
```

- [x] **Step 6: Wire parser into `main.ts`**

Modify `packages/cli/src/main.ts` so unknown command errors honor `--json`:

```ts
import { flagBoolean, parseArgs } from './args.js';
import { commandError, formatJsonResponse } from './response.js';

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
}

const HELP = `lpc-toolkit CLI

Commands:
  lpc catalog types
  lpc catalog items --type <typeName>
  lpc catalog item <item-id-or-type/name>
  lpc selection validate --selection <file>
  lpc render --selection <file> --out <dir>
  lpc token decode --token <hash-or-token> --out <file>
  lpc token encode --selection <file>
  lpc preset list
  lpc preset materialize <preset-id> --out <file>
  lpc preset render <preset-id> --out <dir>
`;

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.stdout(HELP);
    return 0;
  }

  const parsed = parseArgs(argv);
  const commandName = parsed.command.join(' ');
  const error = commandError(commandName || 'unknown', {
    code: 'unknown_command',
    message: `Unknown command: ${argv.join(' ')}`,
  });

  if (flagBoolean(parsed.flags, 'json')) {
    io.stdout(formatJsonResponse(error));
  } else {
    io.stderr(`${error.errors[0]!.message}\n`);
  }
  return 1;
}
```

- [x] **Step 7: Run parser and response tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts response.test.ts smoke.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): add argument and response primitives"
```

Implementation note: Added the dependency-free argument parser, response
envelope helpers, and unknown-command JSON output path while preserving help
behavior. Parser tests cover command path, boolean flags, valued flags,
positionals, and repeated flags; response tests cover success and error JSON
envelopes.

Commit: 03cbfd4e9

Verification: `rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- args.test.ts response.test.ts smoke.test.ts`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/cli typecheck` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/cli build` PASS; spec compliance
review PASS; code quality review PASS.

## Task 3: Extract Shared Presets Package

**Files:**
- Create: `packages/presets/package.json`
- Create: `packages/presets/tsconfig.json`
- Create: `packages/presets/src/index.ts`
- Modify: `packages/web/package.json`
- Modify: `packages/web/src/presets.ts`
- Modify: `packages/web/src/presets-apply.ts`
- Test: `packages/web/test/presets.test.ts`
- Test: `packages/web/test/presets-apply.test.ts`

- [x] **Step 1: Run current web preset tests for baseline**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- presets.test.ts presets-apply.test.ts
```

Expected: PASS before extraction. If this fails, stop and investigate because this task must preserve web behavior.

- [x] **Step 2: Create shared package**

Create `packages/presets/package.json`:

```json
{
  "name": "@lpc-toolkit/presets",
  "version": "0.0.0",
  "private": true,
  "license": "GPL-3.0-or-later",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@lpc-toolkit/core": "workspace:*"
  }
}
```

Create `packages/presets/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "lib": ["ES2022"],
    "paths": {
      "@lpc-toolkit/core": ["../core/src/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [x] **Step 3: Move preset data and pure apply logic**

Create `packages/presets/src/index.ts` by moving the types, `CLOTHING_TYPES`, `PRESETS`, and `computePresetSelection` from web. Keep labels as plain strings so the package has no dependency on web i18n:

```ts
import type {
  BodyType,
  Catalog,
  ItemDefinition,
  PaletteMetadata,
  Selection,
  TypeName,
} from '@lpc-toolkit/core';
import { getRecolorVariants } from '@lpc-toolkit/core';

export interface PresetItem {
  readonly typeName: TypeName;
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
}

export interface Preset {
  readonly id: string;
  readonly labelKey: string;
  readonly emoji: string;
  readonly bodyType?: BodyType;
  readonly items: readonly PresetItem[];
}

export const CLOTHING_TYPES: ReadonlySet<TypeName> = new Set<TypeName>([
  'torso',
  'legs',
  'feet',
  'clothes',
  'overalls',
  'apron',
  'armour',
  'chainmail',
  'shoes',
  'cape',
  'hat',
  'weapon',
  'weapon_magic_crystal',
  'shield',
  'quiver',
  'arms',
  'gloves',
]);

export const PRESETS: readonly Preset[] = [
  {
    id: 'farmer',
    labelKey: 'preset.farmer',
    emoji: '🌾',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'clothes', name: 'Shortsleeve', recolor: 'brown' },
      { typeName: 'overalls', name: 'Overalls', variant: 'brown' },
      { typeName: 'shoes', name: 'Basic Boots', variant: 'brown' },
      { typeName: 'hair', name: 'Messy3', recolor: 'orange' },
    ],
  },
  {
    id: 'villager',
    labelKey: 'preset.villager',
    emoji: '🏘️',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'clothes', name: 'Longsleeve Polo', recolor: 'white' },
      { typeName: 'legs', name: 'Pants', recolor: 'black' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'gray' },
      { typeName: 'hair', name: 'Side Parted w/Bangs 2', recolor: 'sandy' },
    ],
  },
  {
    id: 'mage',
    labelKey: 'preset.mage',
    emoji: '🔮',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'clothes', name: 'Longsleeve laced', variant: 'black' },
      { typeName: 'legs', name: 'Pants', recolor: 'black' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'black' },
      { typeName: 'cape', name: 'Solid', variant: 'purple' },
      { typeName: 'hat', name: 'Wizard Hat Base', variant: 'purple' },
      { typeName: 'weapon', name: 'Gnarled staff', variant: 'dark' },
      { typeName: 'weapon_magic_crystal', name: 'Crystal', variant: 'purple' },
    ],
  },
  {
    id: 'knight',
    labelKey: 'preset.knight',
    emoji: '⚔️',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'armour', name: 'Plate', recolor: 'steel' },
      { typeName: 'legs', name: 'Armour', recolor: 'steel' },
      { typeName: 'shoes', name: 'Armour', variant: 'steel' },
      { typeName: 'hat', name: 'Armet', recolor: 'steel' },
      { typeName: 'weapon', name: 'Longsword', variant: 'longsword' },
      { typeName: 'shield', name: 'Kite', variant: 'kite blue gray' },
      { typeName: 'arms', name: 'Armour', recolor: 'steel' },
      { typeName: 'gloves', name: 'Gloves', recolor: 'all.lpcr.smoke' },
    ],
  },
  {
    id: 'ranger',
    labelKey: 'preset.ranger',
    emoji: '🏹',
    items: [
      { typeName: 'armour', name: 'Leather' },
      { typeName: 'legs', name: 'Pants' },
      { typeName: 'shoes', name: 'Basic Boots', variant: 'brown' },
      { typeName: 'hat', name: 'Hood' },
      { typeName: 'weapon', name: 'Normal', variant: 'dark' },
      { typeName: 'quiver', name: 'Quiver', variant: 'quiver' },
    ],
  },
  {
    id: 'noble',
    labelKey: 'preset.noble',
    emoji: '👑',
    items: [
      { typeName: 'clothes', name: 'Collared/Formal Longsleeve', variant: 'white' },
      { typeName: 'legs', name: 'Formal Pants' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'black' },
      { typeName: 'hat', name: 'Formal Tophat', variant: 'black' },
    ],
  },
];

export interface PresetApplyResult {
  readonly bodyType: BodyType;
  readonly selections: Record<TypeName, Selection>;
  readonly skipped: readonly PresetItem[];
}

function itemSupportsBodyType(item: ItemDefinition, bodyType: BodyType): boolean {
  for (let n = 1; n < 10; n++) {
    const layer = item[`layer_${n}`];
    if (!layer) break;
    if (typeof layer[bodyType] === 'string') return true;
  }
  return false;
}

function pickDefaults(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): Pick<Selection, 'variant' | 'recolor'> {
  const firstVariant = item.variants?.[0];
  if (firstVariant) return { variant: firstVariant };
  const firstRecolor = getRecolorVariants(item, palettes)[0];
  if (firstRecolor) return { recolor: firstRecolor };
  return {};
}

export function computePresetSelection(
  preset: Preset,
  current: Readonly<Record<TypeName, Selection>>,
  bodyType: BodyType,
  catalog: Catalog,
  palettes: PaletteMetadata,
): PresetApplyResult {
  const targetBodyType = preset.bodyType ?? bodyType;
  const selections: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(current)) {
    if (!CLOTHING_TYPES.has(typeName)) selections[typeName] = selection;
  }

  const skipped: PresetItem[] = [];
  for (const item of preset.items) {
    const def = (catalog.byTypeName.get(item.typeName) ?? []).find(
      (candidate) => candidate.name === item.name,
    );
    if (!def || !itemSupportsBodyType(def, targetBodyType)) {
      skipped.push(item);
      continue;
    }
    selections[item.typeName] = {
      typeName: item.typeName,
      name: item.name,
      ...(item.variant ? { variant: item.variant } : {}),
      ...(item.recolor ? { recolor: item.recolor } : {}),
      ...(!item.variant && !item.recolor ? pickDefaults(def, palettes) : {}),
    };
  }

  return { bodyType: targetBodyType, selections, skipped };
}
```

- [x] **Step 4: Update web to consume shared package**

Add to `packages/web/package.json` dependencies:

```json
"@lpc-toolkit/presets": "workspace:*"
```

Replace `packages/web/src/presets.ts` with:

```ts
import { CLOTHING_TYPES, PRESETS as SHARED_PRESETS, type Preset as SharedPreset, type PresetItem } from '@lpc-toolkit/presets';
import type { TranslationKey } from './i18n';

export { CLOTHING_TYPES, type PresetItem };

export interface Preset extends Omit<SharedPreset, 'labelKey'> {
  readonly labelKey: TranslationKey;
}

export const PRESETS: readonly Preset[] = SHARED_PRESETS as readonly Preset[];
```

Replace `packages/web/src/presets-apply.ts` with:

```ts
export {
  computePresetSelection,
  type PresetApplyResult,
} from '@lpc-toolkit/presets';
```

- [x] **Step 5: Run focused web and preset typechecks**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/presets typecheck
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm --filter @lpc-toolkit/web test -- presets.test.ts presets-apply.test.ts
```

Expected: PASS. The web `presets.ts` wrapper keeps `labelKey` typed as `TranslationKey`, so existing preset menu calls to `t(preset.labelKey)` remain type-safe without `any`.

- [x] **Step 6: Commit**

```bash
rtk git add packages/presets packages/web/package.json packages/web/src/presets.ts packages/web/src/presets-apply.ts
rtk git commit -m "feat(presets): share preset data with cli"
```

Implementation note: Extracted preset data and pure preset application into
`@lpc-toolkit/presets`, rewired web preset modules as compatibility wrappers,
and added workspace/package resolution so web typecheck, tests, dev, and build
can consume shared presets from source in a clean checkout. Follow-up review
fixes added core-source typechecking for presets, a runtime-only presets build
config, and web TS/Vite aliases plus prebuild wiring.

Commit: 084772296042208ef9b73fd62aed7860af6daa0c,
d013adc6bf61f85515217e10c5b2aa8fb6981e17,
c45d8dada4ca056ba49db31a2439476060b52a7a,
0f9bfa1fed1ffc0b61694f56a382e7f772d481e4

Verification: baseline web preset tests PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/presets typecheck`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/presets build` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/web typecheck` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/web test -- presets.test.ts presets-apply.test.ts package-scripts.test.ts`
PASS after sandbox IPC escalation; `rtk env CI=true pnpm check:boundaries`
PASS; spec compliance review PASS; code quality review PASS.

## Task 4: Runtime Context And Asset Loaders

**Files:**
- Create: `packages/cli/src/context.ts`
- Create: `packages/cli/src/loaders.ts`
- Test: `packages/cli/test/context.test.ts`
- Test: `packages/cli/test/loaders.test.ts`

- [x] **Step 1: Write context tests**

Create `packages/cli/test/context.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRuntimeContext } from '../src/context.js';

describe('createRuntimeContext', () => {
  it('uses repo assets by default', () => {
    const cwd = path.resolve('../../');
    const context = createRuntimeContext({ cwd });

    expect(context.repoRoot).toBe(cwd);
    expect(context.assetsRoot).toBe(path.join(cwd, 'assets'));
    expect(context.customAssetsRoot).toBe(path.join(cwd, 'assets_custom'));
    expect(context.spritesheetsBaseUrl).toBe(path.join(cwd, 'assets'));
  });

  it('accepts asset root override', () => {
    const context = createRuntimeContext({
      cwd: '/repo',
      assetsRoot: '/game/lpc-assets',
    });

    expect(context.assetsRoot).toBe('/game/lpc-assets');
    expect(context.spritesheetsBaseUrl).toBe('/game/lpc-assets');
  });
});
```

- [x] **Step 2: Write loader tests**

Create `packages/cli/test/loaders.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadJsonRecords } from '../src/loaders.js';

describe('loadJsonRecords', () => {
  it('loads nested json records with normalized keys', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-loader-'));
    const dir = path.join(root, 'sheet_definitions', 'hair', 'short');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'hair_plain.json'),
      JSON.stringify({ name: 'Plain', type_name: 'hair' }),
    );

    const result = loadJsonRecords(path.join(root, 'sheet_definitions'));

    expect(result.warnings).toEqual([]);
    expect(result.records).toEqual({
      'hair/short/hair_plain.json': { name: 'Plain', type_name: 'hair' },
    });
  });

  it('reports invalid json as warnings', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-loader-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'broken.json'), '{');

    const result = loadJsonRecords(root);

    expect(result.records).toEqual({});
    expect(result.warnings[0]?.code).toBe('invalid_json');
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- context.test.ts loaders.test.ts
```

Expected: FAIL because modules do not exist.

- [x] **Step 4: Implement `context.ts`**

Create `packages/cli/src/context.ts`:

```ts
import path from 'node:path';

export interface RuntimeContextOptions {
  readonly cwd: string;
  readonly assetsRoot?: string;
  readonly customAssetsRoot?: string;
  readonly spritesheetsBaseUrl?: string;
}

export interface RuntimeContext {
  readonly repoRoot: string;
  readonly assetsRoot: string;
  readonly customAssetsRoot: string;
  readonly sheetDefinitionsRoot: string;
  readonly customSheetDefinitionsRoot: string;
  readonly paletteDefinitionsRoot: string;
  readonly spritesheetsBaseUrl: string;
}

export function createRuntimeContext(options: RuntimeContextOptions): RuntimeContext {
  const repoRoot = path.resolve(options.cwd);
  const assetsRoot = path.resolve(options.assetsRoot ?? path.join(repoRoot, 'assets'));
  const customAssetsRoot = path.resolve(
    options.customAssetsRoot ?? path.join(repoRoot, 'assets_custom'),
  );
  const spritesheetsBaseUrl = path.resolve(options.spritesheetsBaseUrl ?? assetsRoot);

  return {
    repoRoot,
    assetsRoot,
    customAssetsRoot,
    sheetDefinitionsRoot: path.join(assetsRoot, 'sheet_definitions'),
    customSheetDefinitionsRoot: path.join(customAssetsRoot, 'sheet_definitions'),
    paletteDefinitionsRoot: path.join(assetsRoot, 'palette_definitions'),
    spritesheetsBaseUrl,
  };
}
```

- [x] **Step 5: Implement `loaders.ts`**

Create `packages/cli/src/loaders.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  createCatalog,
  createPaletteCatalog,
  type Catalog,
  type FilePath,
  type ItemDefinition,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import type { CliIssue } from './response.js';

export interface JsonRecordsResult {
  readonly records: Record<string, unknown>;
  readonly warnings: readonly CliIssue[];
}

function walkJsonFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walkJsonFiles(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

function toPosixRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export function loadJsonRecords(root: string): JsonRecordsResult {
  const records: Record<string, unknown> = {};
  const warnings: CliIssue[] = [];
  for (const file of walkJsonFiles(root)) {
    const key = toPosixRelative(root, file);
    try {
      records[key] = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    } catch (error) {
      warnings.push({
        code: 'invalid_json',
        message: error instanceof Error ? error.message : 'Invalid JSON',
        path: key,
      });
    }
  }
  return { records, warnings };
}

export function loadCatalogFromRoots(
  sheetDefinitionsRoot: string,
  customSheetDefinitionsRoot: string,
): { readonly catalog: Catalog; readonly warnings: readonly CliIssue[] } {
  const base = loadJsonRecords(sheetDefinitionsRoot);
  const custom = loadJsonRecords(customSheetDefinitionsRoot);
  const records = {
    ...(base.records as Record<FilePath, ItemDefinition>),
    ...(custom.records as Record<FilePath, ItemDefinition>),
  };
  const result = createCatalog(records);
  return {
    catalog: result.catalog,
    warnings: [
      ...base.warnings,
      ...custom.warnings,
      ...result.warnings.map((warning) => ({
        code: 'catalog_warning',
        message: warning.message,
        path: warning.path,
      })),
    ],
  };
}

export function loadPalettesFromRoot(
  paletteDefinitionsRoot: string,
): { readonly palettes: PaletteMetadata; readonly warnings: readonly CliIssue[] } {
  const loaded = loadJsonRecords(paletteDefinitionsRoot);
  const result = createPaletteCatalog(loaded.records);
  return {
    palettes: result.palettes,
    warnings: [
      ...loaded.warnings,
      ...result.warnings.map((warning) => ({
        code: 'palette_warning',
        message: warning.message,
        path: warning.path,
      })),
    ],
  };
}
```

- [x] **Step 6: Run loader tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- context.test.ts loaders.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
rtk git add packages/cli/src/context.ts packages/cli/src/loaders.ts packages/cli/test/context.test.ts packages/cli/test/loaders.test.ts
rtk git commit -m "feat(cli): load runtime assets"
```

Implementation note: Added CLI runtime context resolution and Node JSON asset
loaders for catalog and palette data. Review fixes preserve URL-like
spritesheet bases and isolate malformed catalog/palette records into structured
warnings so bad asset files do not crash future CLI commands.

Commit: 1fd1f4dc2, b43554ec7, 23fd81c04

Verification: `rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- context.test.ts loaders.test.ts args.test.ts response.test.ts smoke.test.ts`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/cli typecheck` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/cli build` PASS;
`rtk env CI=true pnpm check:boundaries` PASS; spec compliance review PASS;
code quality review PASS.

## Task 5: Selection JSON And Validation

**Files:**
- Create: `packages/cli/src/selection.ts`
- Create: `packages/cli/src/validation.ts`
- Create: `packages/cli/src/selection-commands.ts`
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/selection.test.ts`
- Test: `packages/cli/test/validation.test.ts`

- [x] **Step 1: Write selection tests**

Create `packages/cli/test/selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSelectionJson, selectionJsonFromCore } from '../src/selection.js';

describe('selection json', () => {
  it('parses v1 selection json into core selections', () => {
    const parsed = parseSelectionJson({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: {
        body: { name: 'Body Color', recolor: 'light' },
      },
    });

    expect(parsed).toEqual({
      metadata: { schema: 'lpc-toolkit.selection.v1', name: 'hero' },
      selections: {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
        },
      },
    });
  });

  it('serializes core selections with metadata', () => {
    expect(
      selectionJsonFromCore(
        {
          bodyType: 'male',
          items: { body: { typeName: 'body', name: 'Body Color' } },
        },
        'hero',
      ),
    ).toEqual({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    });
  });
});
```

- [x] **Step 2: Write validation tests**

Create `packages/cli/test/validation.test.ts`:

```ts
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { validateSelections } from '../src/validation.js';

const body: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  recolors: [{ material: 'body', palettes: ['ulpc'] }],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
};

describe('validateSelections', () => {
  it('reports unknown items', () => {
    const catalog = createCatalog({ 'body/body.json': body }).catalog;
    const result = validateSelections(
      {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Missing' } },
      },
      { catalog, palettes: { materials: {}, versions: {} }, pathExists: () => true },
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('unknown_item');
  });

  it('reports missing sprite paths', () => {
    const catalog = createCatalog({ 'body/body.json': body }).catalog;
    const result = validateSelections(
      {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Body Color' } },
      },
      { catalog, palettes: { materials: {}, versions: {} }, pathExists: () => false },
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('missing_sprite_path');
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- selection.test.ts validation.test.ts
```

Expected: FAIL because selection and validation modules do not exist.

- [x] **Step 4: Implement `selection.ts`**

Create `packages/cli/src/selection.ts`:

```ts
import type { BodyType, Selection, Selections, TypeName } from '@lpc-toolkit/core';

export const SELECTION_SCHEMA = 'lpc-toolkit.selection.v1';

export interface SelectionJsonItem {
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
}

export interface SelectionJson {
  readonly schema: typeof SELECTION_SCHEMA;
  readonly name?: string;
  readonly bodyType: BodyType;
  readonly items: Readonly<Record<TypeName, SelectionJsonItem>>;
}

export interface ParsedSelectionJson {
  readonly metadata: {
    readonly schema: typeof SELECTION_SCHEMA;
    readonly name?: string;
  };
  readonly selections: Selections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSelectionJson(value: unknown): ParsedSelectionJson {
  if (!isRecord(value)) throw new Error('Selection JSON must be an object.');
  if (value.schema !== SELECTION_SCHEMA) {
    throw new Error(`Unsupported selection schema: ${String(value.schema)}`);
  }
  if (typeof value.bodyType !== 'string') {
    throw new Error('Selection JSON bodyType must be a string.');
  }
  if (!isRecord(value.items)) {
    throw new Error('Selection JSON items must be an object.');
  }

  const items: Record<TypeName, Selection> = {};
  for (const [typeName, raw] of Object.entries(value.items)) {
    if (!isRecord(raw) || typeof raw.name !== 'string') {
      throw new Error(`Selection item ${typeName} must include a string name.`);
    }
    items[typeName] = {
      typeName,
      name: raw.name,
      ...(typeof raw.variant === 'string' ? { variant: raw.variant } : {}),
      ...(typeof raw.recolor === 'string' ? { recolor: raw.recolor } : {}),
    };
  }

  return {
    metadata: {
      schema: SELECTION_SCHEMA,
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
    },
    selections: {
      bodyType: value.bodyType,
      items,
    },
  };
}

export function selectionJsonFromCore(
  selections: Selections,
  name?: string,
): SelectionJson {
  const items: Record<TypeName, SelectionJsonItem> = {};
  for (const [typeName, selection] of Object.entries(selections.items)) {
    items[typeName] = {
      name: selection.name,
      ...(selection.variant ? { variant: selection.variant } : {}),
      ...(selection.recolor ? { recolor: selection.recolor } : {}),
    };
  }
  return {
    schema: SELECTION_SCHEMA,
    ...(name ? { name } : {}),
    bodyType: selections.bodyType,
    items,
  };
}
```

- [x] **Step 5: Implement `validation.ts`**

Create `packages/cli/src/validation.ts`:

```ts
import {
  getRecolorVariants,
  getSpritePathsForSelections,
  type Catalog,
  type PaletteMetadata,
  type Selections,
} from '@lpc-toolkit/core';
import type { CliIssue } from './response.js';

export interface ValidateSelectionsOptions {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly pathExists: (spritePath: string) => boolean;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly warnings: readonly CliIssue[];
  readonly errors: readonly CliIssue[];
}

export function validateSelections(
  selections: Selections,
  options: ValidateSelectionsOptions,
): ValidationResult {
  const errors: CliIssue[] = [];
  const warnings: CliIssue[] = [];

  for (const [typeName, selection] of Object.entries(selections.items)) {
    const items = options.catalog.byTypeName.get(typeName);
    if (!items) {
      errors.push({
        code: 'unknown_type_name',
        message: `Unknown type name: ${typeName}`,
      });
      continue;
    }
    const item = items.find((candidate) => candidate.name === selection.name);
    if (!item) {
      errors.push({
        code: 'unknown_item',
        message: `Unknown item for ${typeName}: ${selection.name}`,
      });
      continue;
    }
    if (selection.variant && !(item.variants ?? []).includes(selection.variant)) {
      errors.push({
        code: 'unknown_variant',
        message: `Unknown variant for ${typeName}/${selection.name}: ${selection.variant}`,
      });
    }
    if (
      selection.recolor &&
      !getRecolorVariants(item, options.palettes).includes(selection.recolor)
    ) {
      errors.push({
        code: 'unknown_recolor',
        message: `Unknown recolor for ${typeName}/${selection.name}: ${selection.recolor}`,
      });
    }
  }

  const layers = getSpritePathsForSelections(selections, options.catalog, {
    pathExists: options.pathExists,
  });
  if (Object.keys(selections.items).length > 0 && layers.length === 0) {
    errors.push({
      code: 'body_type_incompatible',
      message: `No selected layers resolve for body type ${selections.bodyType}.`,
    });
  }
  for (const layer of getSpritePathsForSelections(selections, options.catalog)) {
    if (!options.pathExists(layer.path)) {
      errors.push({
        code: 'missing_sprite_path',
        message: `Missing sprite path: ${layer.path}`,
        path: layer.path,
      });
    }
  }

  return { ok: errors.length === 0, warnings, errors };
}
```

- [x] **Step 6: Implement selection command**

Create `packages/cli/src/selection-commands.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from './args.js';
import { flagString } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { parseSelectionJson } from './selection.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import { validateSelections } from './validation.js';

export function runSelectionCommand(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  if (parsed.command[1] !== 'validate') {
    return commandError(parsed.command.join(' '), {
      code: 'unknown_command',
      message: `Unknown selection command: ${parsed.command.join(' ')}`,
    });
  }
  const selectionPath = flagString(parsed.flags, 'selection');
  if (!selectionPath) {
    return commandError('selection validate', {
      code: 'missing_argument',
      message: '--selection is required.',
    });
  }

  const context = createRuntimeContext({ cwd });
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  const parsedSelection = parseSelectionJson(
    JSON.parse(readFileSync(path.resolve(cwd, selectionPath), 'utf8')) as unknown,
  );
  const validation = validateSelections(parsedSelection.selections, {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    pathExists: (spritePath) => existsSync(path.join(context.spritesheetsBaseUrl, spritePath)),
  });

  const warnings = [...catalog.warnings, ...palettes.warnings, ...validation.warnings];
  if (!validation.ok) {
    return {
      ok: false,
      command: 'selection validate',
      data: null,
      warnings,
      errors: validation.errors,
    };
  }
  return commandOk('selection validate', { valid: true }, warnings);
}
```

Modify `packages/cli/src/main.ts` to dispatch `selection`:

```ts
import { flagBoolean, parseArgs } from './args.js';
import { formatJsonResponse, humanIssue } from './response.js';
import { runSelectionCommand } from './selection-commands.js';
```

Inside `runCli`, after `const parsed = parseArgs(argv);`:

```ts
  if (parsed.command[0] === 'selection') {
    const response = runSelectionCommand(parsed, io.cwd);
    if (flagBoolean(parsed.flags, 'json')) {
      io.stdout(formatJsonResponse(response));
    } else if (response.ok) {
      io.stdout('Selection is valid.\n');
    } else {
      io.stderr(`${response.errors.map(humanIssue).join('\n')}\n`);
    }
    return response.ok ? 0 : 1;
  }
```

- [x] **Step 7: Run selection tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- selection.test.ts validation.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): validate selection json"
```

Implementation note: Added selection JSON parse/serialize helpers, shared
selection validation, and `selection validate` command dispatch with JSON and
human output. Review fixes ensure unreadable or malformed selection files return
stable envelope errors and non-string optional `variant`/`recolor` fields fail
parsing instead of being silently dropped.

Commit: 6df35eec919eb91039a1ffd721e7f3ade891954e,
61c2ca2428d40feabbe4643e58a397f1f585afc5

Verification: `rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- selection.test.ts validation.test.ts context.test.ts loaders.test.ts args.test.ts response.test.ts smoke.test.ts`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/cli typecheck` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/cli build` PASS;
`rtk env CI=true pnpm check:boundaries` PASS; spec compliance review PASS;
code quality review PASS.

## Task 6: Catalog And Token Commands

**Files:**
- Create: `packages/cli/src/catalog-commands.ts`
- Create: `packages/cli/src/token-commands.ts`
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/catalog-commands.test.ts`
- Test: `packages/cli/test/token-commands.test.ts`

- [x] **Step 1: Write catalog command tests**

Create `packages/cli/test/catalog-commands.test.ts`:

```ts
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { listCatalogTypes, listCatalogItems } from '../src/catalog-commands.js';

const body: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
};
const hair: ItemDefinition = {
  name: 'Braids',
  type_name: 'hair',
  animations: ['walk'],
  credits: [],
  variants: ['brown'],
  layer_1: { zPos: 50, male: 'hair/braids/' },
};

describe('catalog commands', () => {
  const catalog = createCatalog({
    'body/body.json': body,
    'hair/braids.json': hair,
  }).catalog;

  it('lists types', () => {
    expect(listCatalogTypes(catalog).typeNames).toEqual(['body', 'hair']);
  });

  it('filters items by search and body type', () => {
    expect(
      listCatalogItems(catalog, {
        typeName: 'hair',
        search: 'braid',
        bodyType: 'male',
        animation: 'walk',
      }).items,
    ).toEqual([
      {
        itemId: 'braids',
        typeName: 'hair',
        name: 'Braids',
        variants: ['brown'],
        recolors: [],
        animations: ['walk'],
      },
    ]);
  });
});
```

- [x] **Step 2: Write token tests**

Create `packages/cli/test/token-commands.test.ts`:

```ts
import { createCatalog } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { decodeTokenToSelectionJson, encodeSelectionJsonToToken } from '../src/token-commands.js';

describe('token commands', () => {
  const catalog = createCatalog({
    'body/body.json': {
      name: 'Body Color',
      type_name: 'body',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: 'body/bodies/male/' },
    },
  }).catalog;

  it('encodes and decodes selection json through core token helpers', () => {
    const token = encodeSelectionJsonToToken({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    });

    expect(decodeTokenToSelectionJson(token, catalog).bodyType).toBe('male');
  });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts token-commands.test.ts
```

Expected: FAIL because modules do not exist.

- [x] **Step 4: Implement catalog helpers and command runner**

Create `packages/cli/src/catalog-commands.ts`:

```ts
import {
  getRecolorVariants,
  type AnimationName,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliResponse } from './response.js';

export interface CatalogTypesData {
  readonly typeNames: readonly TypeName[];
  readonly count: number;
}

export interface CatalogItemSummary {
  readonly itemId: string;
  readonly typeName: TypeName;
  readonly name: string;
  readonly variants: readonly string[];
  readonly recolors: readonly string[];
  readonly animations: readonly AnimationName[];
}

export function listCatalogTypes(catalog: Catalog): CatalogTypesData {
  return { typeNames: catalog.typeNames, count: catalog.typeNames.length };
}

function itemSupportsBodyType(item: ItemDefinition, bodyType: BodyType): boolean {
  for (let n = 1; n < 10; n++) {
    const layer = item[`layer_${n}`];
    if (!layer) break;
    if (typeof layer[bodyType] === 'string') return true;
  }
  return false;
}

export function listCatalogItems(
  catalog: Catalog,
  options: {
    readonly typeName?: TypeName;
    readonly search?: string;
    readonly bodyType?: BodyType;
    readonly animation?: AnimationName;
    readonly palettes?: PaletteMetadata;
  },
): { readonly items: readonly CatalogItemSummary[] } {
  const haystack = options.typeName
    ? catalog.byTypeName.get(options.typeName) ?? []
    : [...catalog.byItemId.values()];
  const search = options.search?.toLowerCase();
  const items: CatalogItemSummary[] = [];
  for (const item of haystack) {
    if (search && !item.name.toLowerCase().includes(search)) continue;
    if (options.bodyType && !itemSupportsBodyType(item, options.bodyType)) continue;
    if (options.animation && !(item.animations ?? []).includes(options.animation)) continue;
    const itemId = [...catalog.byItemId.entries()].find(([, candidate]) => candidate === item)?.[0];
    if (!itemId) continue;
    items.push({
      itemId,
      typeName: item.type_name,
      name: item.name,
      variants: item.variants ?? [],
      recolors: options.palettes ? getRecolorVariants(item, options.palettes) : [],
      animations: item.animations ?? [],
    });
  }
  return { items };
}

export function runCatalogCommand(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  const context = createRuntimeContext({ cwd });
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  const warnings = [...catalog.warnings, ...palettes.warnings];

  if (parsed.command[1] === 'types') {
    return commandOk('catalog types', listCatalogTypes(catalog.catalog), warnings);
  }
  if (parsed.command[1] === 'items') {
    return commandOk(
      'catalog items',
      listCatalogItems(catalog.catalog, {
        typeName: flagString(parsed.flags, 'type'),
        search: flagString(parsed.flags, 'search'),
        bodyType: flagString(parsed.flags, 'body-type'),
        animation: flagString(parsed.flags, 'animation'),
        palettes: palettes.palettes,
      }),
      warnings,
    );
  }
  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown catalog command: ${parsed.command.join(' ')}`,
  }, warnings);
}
```

- [x] **Step 5: Implement token helpers and command runner**

Create `packages/cli/src/token-commands.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  type Catalog,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { parseSelectionJson, selectionJsonFromCore, type SelectionJson } from './selection.js';
import { commandError, commandOk, type CliResponse } from './response.js';

export function encodeSelectionJsonToToken(selectionJson: SelectionJson): string {
  return encodeSelectionToken(parseSelectionJson(selectionJson).selections);
}

export function decodeTokenToSelectionJson(
  tokenOrHash: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): SelectionJson {
  const decoded = tokenOrHash.startsWith('v1.')
    ? decodeSelectionToken(tokenOrHash, catalog, palettes).selections
    : parseHash(tokenOrHash, catalog, palettes).selections;
  return selectionJsonFromCore(decoded);
}

export function runTokenCommand(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  if (parsed.command[1] === 'encode') {
    const selectionPath = flagString(parsed.flags, 'selection');
    if (!selectionPath) {
      return commandError('token encode', {
        code: 'missing_argument',
        message: '--selection is required.',
      });
    }
    const selectionJson = parseSelectionJson(
      JSON.parse(readFileSync(path.resolve(cwd, selectionPath), 'utf8')) as unknown,
    );
    return commandOk('token encode', {
      token: encodeSelectionToken(selectionJson.selections),
    });
  }

  if (parsed.command[1] === 'decode') {
    const token = flagString(parsed.flags, 'token');
    if (!token) {
      return commandError('token decode', {
        code: 'missing_argument',
        message: '--token is required.',
      });
    }
    const context = createRuntimeContext({ cwd });
    const catalog = loadCatalogFromRoots(
      context.sheetDefinitionsRoot,
      context.customSheetDefinitionsRoot,
    );
    const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
    const selection = decodeTokenToSelectionJson(token, catalog.catalog, palettes.palettes);
    const out = flagString(parsed.flags, 'out');
    if (out) {
      writeFileSync(path.resolve(cwd, out), `${JSON.stringify(selection, null, 2)}\n`);
    }
    return commandOk('token decode', { selection, out: out ?? null }, [
      ...catalog.warnings,
      ...palettes.warnings,
    ]);
  }

  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown token command: ${parsed.command.join(' ')}`,
  });
}
```

- [x] **Step 6: Wire command dispatch**

Modify `packages/cli/src/main.ts` to import and dispatch:

```ts
import { runCatalogCommand } from './catalog-commands.js';
import { runTokenCommand } from './token-commands.js';
```

Add a local response writer helper:

```ts
function writeResponse(
  response: { ok: boolean; readonly errors: readonly { code: string; message: string; path?: string }[] },
  parsed: ReturnType<typeof parseArgs>,
  io: CliIo,
  humanSuccess: string,
): number {
  if (flagBoolean(parsed.flags, 'json')) {
    io.stdout(formatJsonResponse(response));
  } else if (response.ok) {
    io.stdout(humanSuccess);
  } else {
    io.stderr(`${response.errors.map(humanIssue).join('\n')}\n`);
  }
  return response.ok ? 0 : 1;
}
```

Use it for `catalog`, `selection`, and `token`.

- [x] **Step 7: Run focused tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts token-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): add catalog and token commands"
```

Implementation note: Added catalog type/item listing and detail commands,
token encode/decode helpers, and `catalog`/`token` CLI dispatch. Review fixes
completed `catalog item`, added `--license` filtering, hardened catalog
summaries against malformed local records, preserved token/hash decode warnings
in the CLI envelope, and trimmed copied tokens before version detection.

Commit: ef12c2820b0a75b16139a94a7815e478eb7bc80b7,
f66e92b4505518bd2c8b43945b339e5af226ec88,
537b43b28879950df860f8ac7a706857387a270c

Verification: `rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts token-commands.test.ts`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/cli typecheck` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/cli test` PASS;
`rtk env CI=true pnpm typecheck` PASS; spec compliance review PASS; code
quality review PASS.

## Task 7: Preset Commands

**Files:**
- Create: `packages/cli/src/preset-commands.ts`
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/preset-commands.test.ts`

- [x] **Step 1: Write preset tests**

Create `packages/cli/test/preset-commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { listPresets, materializePreset } from '../src/preset-commands.js';

describe('preset commands', () => {
  it('lists built-in presets', () => {
    expect(listPresets().presets.map((preset) => preset.id)).toContain('farmer');
  });

  it('materializes a preset to selection json', () => {
    const selection = materializePreset('farmer');

    expect(selection.schema).toBe('lpc-toolkit.selection.v1');
    expect(selection.name).toBe('farmer');
    expect(selection.items.body?.name).toBe('Body Color');
  });
});
```

Implementation note: Added focused preset command tests for listing,
materializing, missing ids, unknown ids, and `--out` pretty JSON output.
Commit: 808180f32.
Verification: RED verified by
`rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- preset-commands.test.ts`
failing because `preset-commands.ts` did not exist.

- [x] **Step 2: Run preset tests to verify they fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- preset-commands.test.ts
```

Expected: FAIL because `preset-commands.ts` does not exist.

Implementation note: Confirmed expected RED failure before production code.
Commit: 808180f32.
Verification: RED PASS; the failure was the missing preset command module.

- [x] **Step 3: Implement preset command module**

Create `packages/cli/src/preset-commands.ts`:

```ts
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PRESETS } from '@lpc-toolkit/presets';
import { flagString, type ParsedArgs } from './args.js';
import { selectionJsonFromCore, type SelectionJson } from './selection.js';
import { commandError, commandOk, type CliResponse } from './response.js';

export function listPresets(): {
  readonly presets: readonly { readonly id: string; readonly labelKey: string; readonly emoji: string }[];
} {
  return {
    presets: PRESETS.map((preset) => ({
      id: preset.id,
      labelKey: preset.labelKey,
      emoji: preset.emoji,
    })),
  };
}

export function materializePreset(id: string): SelectionJson {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return selectionJsonFromCore(
    {
      bodyType: preset.bodyType ?? 'male',
      items: Object.fromEntries(
        preset.items.map((item) => [
          item.typeName,
          {
            typeName: item.typeName,
            name: item.name,
            ...(item.variant ? { variant: item.variant } : {}),
            ...(item.recolor ? { recolor: item.recolor } : {}),
          },
        ]),
      ),
    },
    preset.id,
  );
}

export function runPresetCommand(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  if (parsed.command[1] === 'list') {
    return commandOk('preset list', listPresets());
  }

  if (parsed.command[1] === 'materialize') {
    const id = parsed.positionals[0];
    if (!id) {
      return commandError('preset materialize', {
        code: 'missing_argument',
        message: 'Preset id is required.',
      });
    }
    try {
      const selection = materializePreset(id);
      const out = flagString(parsed.flags, 'out');
      if (out) {
        writeFileSync(path.resolve(cwd, out), `${JSON.stringify(selection, null, 2)}\n`);
      }
      return commandOk('preset materialize', { selection, out: out ?? null });
    } catch (error) {
      return commandError('preset materialize', {
        code: 'unknown_preset',
        message: error instanceof Error ? error.message : 'Unknown preset',
      });
    }
  }

  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown preset command: ${parsed.command.join(' ')}`,
  });
}
```

Implementation note: Implemented built-in preset listing, preset
materialization to selection JSON, CLI response envelopes for missing/unknown
presets, and pretty JSON file writing with a trailing newline.
Commit: 808180f32.
Verification:
`rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- preset-commands.test.ts`
PASS.

- [x] **Step 4: Wire preset dispatch**

Modify `packages/cli/src/main.ts`:

```ts
import { runPresetCommand } from './preset-commands.js';
```

Dispatch:

```ts
  if (parsed.command[0] === 'preset') {
    const response = runPresetCommand(parsed, io.cwd);
    return writeResponse(response, parsed, io, 'Preset command completed.\n');
  }
```

Implementation note: Routed `preset` commands through `runPresetCommand` using
the existing `writeResponse` pattern.
Commit: 808180f32.
Verification:
`rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- preset-commands.test.ts`
PASS.

- [x] **Step 5: Run tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- preset-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

Implementation note: Focused preset tests and CLI typecheck passed after adding
the internal `@lpc-toolkit/presets` workspace dependency.
Commit: 808180f32.
Verification:
`rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- preset-commands.test.ts`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/cli typecheck` PASS.

- [x] **Step 6: Commit**

```bash
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): add preset materialization"
```

Implementation note: Committed Task 7 preset list/materialize implementation;
review fixes route CLI tests/typecheck through source aliases for
`@lpc-toolkit/presets`, build core/presets before CLI build, use shared preset
resolution when runtime catalog/palettes are available, and report `--out`
write failures as `preset_write_failed`. `preset render` remains for Task 8.

Commit: 808180f32e1679981faccc487853fb40c2907fda,
9925cfe8cc0ca88b21b7aacf45cd4cbe2c5b56f4.

Verification: RED test run PASS (expected failure observed); focused preset
test PASS; CLI typecheck PASS; CLI build PASS; spec compliance review PASS;
code quality review PASS; `rtk env CI=true pnpm check:boundaries` PASS.

## Task 8: Node Canvas Adapter And Render Export

**Files:**
- Create: `packages/cli/src/node-canvas-adapter.ts`
- Create: `packages/cli/src/zip.ts`
- Create: `packages/cli/src/render.ts`
- Modify: `packages/cli/src/preset-commands.ts`
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/render.test.ts`

- [x] **Step 1: Write render integration test**

Create `packages/cli/test/render.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSelection } from '../src/render.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('renderSelection', () => {
  it('writes sheet, metadata, and credits for a body-only selection', async () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    const result = await renderSelection({
      cwd: repoRoot,
      outDir,
      selectionName: 'body-only',
      selectionJson: {
        schema: 'lpc-toolkit.selection.v1',
        name: 'body-only',
        bodyType: 'male',
        items: {
          body: { name: 'Body Color', recolor: 'light' },
        },
      },
      animations: ['walk'],
      frames: [],
      bundleZip: false,
      allowPartial: false,
    });

    expect(result.artifacts.map((artifact) => artifact.type)).toContain('sheet');
    expect(existsSync(path.join(outDir, 'body-only.sheet.png'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.metadata.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.credits.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.credits.csv'))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(outDir, 'body-only.metadata.json'), 'utf8')).selection.name)
      .toBe('body-only');
  }, 30000);
});
```

- [x] **Step 2: Run render test to verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- render.test.ts
```

Expected: FAIL because render modules do not exist.

- [x] **Step 3: Implement Node canvas adapter**

Create `packages/cli/src/node-canvas-adapter.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { createCanvas, loadImage as napiLoadImage } from '@napi-rs/canvas';
import type { CanvasAdapter, CanvasLike, ImageLike } from '@lpc-toolkit/core';

export function createNodeCanvasAdapter(): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      return createCanvas(width, height);
    },
    loadImage(path: string): Promise<ImageLike> {
      return napiLoadImage(path);
    },
  };
}

interface PngCanvasLike extends CanvasLike {
  readonly encode: (format: 'png') => Promise<Buffer>;
}

function hasEncode(canvas: CanvasLike): canvas is PngCanvasLike {
  return typeof (canvas as { encode?: unknown }).encode === 'function';
}

export async function writeCanvasPng(canvas: CanvasLike, filePath: string): Promise<void> {
  if (!hasEncode(canvas)) {
    throw new Error('Canvas implementation does not support PNG encoding.');
  }
  writeFileSync(filePath, await canvas.encode('png'));
}
```

- [x] **Step 4: Implement ZIP helper**

Create `packages/cli/src/zip.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export async function writeZipBundle(
  zipPath: string,
  files: readonly string[],
  rootDir: string,
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    const rel = path.relative(rootDir, file).split(path.sep).join('/');
    zip.file(rel, readFileSync(file));
  }
  writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
}
```

- [x] **Step 5: Implement render workflow**

Create `packages/cli/src/render.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  computeEffectiveLicense,
  composeSelections,
  creditsToCsv,
  creditsToTxt,
  extractAnimation,
  extractAnimationFrames,
  makeResolvePalette,
  type AnimationName,
} from '@lpc-toolkit/core';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { createNodeCanvasAdapter, writeCanvasPng } from './node-canvas-adapter.js';
import { parseSelectionJson, type SelectionJson } from './selection.js';
import { validateSelections } from './validation.js';
import { writeZipBundle } from './zip.js';

export interface RenderArtifact {
  readonly type: string;
  readonly path: string;
  readonly width?: number;
  readonly height?: number;
  readonly animation?: string;
  readonly direction?: string;
  readonly frameNumber?: number;
}

export interface RenderSelectionOptions {
  readonly cwd: string;
  readonly outDir: string;
  readonly selectionName: string;
  readonly selectionJson: SelectionJson;
  readonly animations: readonly AnimationName[];
  readonly frames: readonly AnimationName[] | 'all';
  readonly bundleZip: boolean;
  readonly allowPartial: boolean;
}

export interface RenderSelectionResult {
  readonly artifacts: readonly RenderArtifact[];
  readonly warnings: readonly unknown[];
  readonly metadataPath: string;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sprite';
}

export async function renderSelection(
  options: RenderSelectionOptions,
): Promise<RenderSelectionResult> {
  const context = createRuntimeContext({ cwd: options.cwd });
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  const parsed = parseSelectionJson(options.selectionJson);
  const validation = validateSelections(parsed.selections, {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    pathExists: (spritePath) => existsSync(path.join(context.spritesheetsBaseUrl, spritePath)),
  });
  if (!validation.ok && !options.allowPartial) {
    throw new Error(validation.errors.map((error) => error.message).join('\n'));
  }

  const recolorWarnings: string[] = [];
  const resolvePalette = makeResolvePalette(
    catalog.catalog,
    palettes.palettes,
    parsed.selections,
    { onWarn: (message) => recolorWarnings.push(message) },
  );

  mkdirSync(options.outDir, { recursive: true });
  const adapter = createNodeCanvasAdapter();
  const sheet = await composeSelections(parsed.selections, {
    catalog: catalog.catalog,
    adapter,
    spritesheetsBaseUrl: context.spritesheetsBaseUrl,
    resolvePalette,
  });

  const baseName = safeName(options.selectionName);
  const artifacts: RenderArtifact[] = [];
  const writtenFiles: string[] = [];

  const sheetPath = path.join(options.outDir, `${baseName}.sheet.png`);
  await writeCanvasPng(sheet.canvas, sheetPath);
  writtenFiles.push(sheetPath);
  artifacts.push({ type: 'sheet', path: sheetPath, width: sheet.width, height: sheet.height });

  const creditsTxtPath = path.join(options.outDir, `${baseName}.credits.txt`);
  const creditsCsvPath = path.join(options.outDir, `${baseName}.credits.csv`);
  writeFileSync(creditsTxtPath, creditsToTxt(sheet.credits, options.animations[0] ?? 'walk'));
  writeFileSync(creditsCsvPath, creditsToCsv(sheet.credits, options.animations[0] ?? 'walk'));
  writtenFiles.push(creditsTxtPath, creditsCsvPath);
  artifacts.push({ type: 'credits_txt', path: creditsTxtPath });
  artifacts.push({ type: 'credits_csv', path: creditsCsvPath });

  const animationDir = path.join(options.outDir, 'animations');
  for (const animationName of options.animations) {
    mkdirSync(animationDir, { recursive: true });
    const animation = extractAnimation(sheet, animationName, { adapter });
    const animationPath = path.join(animationDir, `${animationName}.png`);
    await writeCanvasPng(animation.canvas, animationPath);
    writtenFiles.push(animationPath);
    artifacts.push({
      type: 'animation',
      path: animationPath,
      width: animation.width,
      height: animation.height,
      animation: animationName,
    });
  }

  const frameAnimations = options.frames === 'all' ? options.animations : options.frames;
  for (const animationName of frameAnimations) {
    const frames = extractAnimationFrames(sheet, animationName, { adapter });
    for (const [direction, slices] of frames.entries()) {
      for (const frame of slices) {
        const frameDir = path.join(options.outDir, 'frames', animationName);
        mkdirSync(frameDir, { recursive: true });
        const framePath = path.join(frameDir, `${direction}-${String(frame.frameNumber).padStart(3, '0')}.png`);
        await writeCanvasPng(frame.canvas, framePath);
        writtenFiles.push(framePath);
        artifacts.push({
          type: 'frame',
          path: framePath,
          width: frame.canvas.width,
          height: frame.canvas.height,
          animation: animationName,
          direction,
          frameNumber: frame.frameNumber,
        });
      }
    }
  }

  const metadataPath = path.join(options.outDir, `${baseName}.metadata.json`);
  const metadata = {
    schema: 'lpc-toolkit.render-metadata.v1',
    selection: options.selectionJson,
    artifacts,
    effectiveLicense: computeEffectiveLicense(sheet.credits),
    credits: {
      txt: creditsTxtPath,
      csv: creditsCsvPath,
      licenses: sheet.credits.licenses,
      entries: sheet.credits.entries.length,
    },
    warnings: [
      ...catalog.warnings,
      ...palettes.warnings,
      ...validation.warnings,
      ...recolorWarnings.map((message) => ({ code: 'recolor_warning', message })),
    ],
    skippedLayers: options.allowPartial ? validation.errors : [],
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  writtenFiles.push(metadataPath);
  artifacts.push({ type: 'metadata', path: metadataPath });

  if (options.bundleZip) {
    const zipPath = path.join(options.outDir, `${baseName}.bundle.zip`);
    await writeZipBundle(zipPath, writtenFiles, options.outDir);
    artifacts.push({ type: 'zip', path: zipPath });
  }

  return {
    artifacts,
    warnings: metadata.warnings,
    metadataPath,
  };
}

export function readSelectionJsonFile(cwd: string, selectionPath: string): SelectionJson {
  const raw = JSON.parse(readFileSync(path.resolve(cwd, selectionPath), 'utf8')) as unknown;
  parseSelectionJson(raw);
  return raw as SelectionJson;
}
```

- [x] **Step 6: Wire render command and preset render**

In `packages/cli/src/main.ts`, add render dispatch:

```ts
import { flagString, flagStrings } from './args.js';
import { materializePreset } from './preset-commands.js';
import { readSelectionJsonFile, renderSelection } from './render.js';
```

Dispatch `render`:

```ts
  if (parsed.command[0] === 'render') {
    const selectionPath = flagString(parsed.flags, 'selection');
    const outDir = flagString(parsed.flags, 'out');
    if (!selectionPath || !outDir) {
      const response = commandError('render', {
        code: 'missing_argument',
        message: '--selection and --out are required.',
      });
      return writeResponse(response, parsed, io, '');
    }
    try {
      const selectionJson = readSelectionJsonFile(io.cwd, selectionPath);
      const result = await renderSelection({
        cwd: io.cwd,
        outDir: path.resolve(io.cwd, outDir),
        selectionName: selectionJson.name ?? 'sprite',
        selectionJson,
        animations: flagStrings(parsed.flags, 'animation'),
        frames: flagString(parsed.flags, 'frames') === 'all'
          ? 'all'
          : flagStrings(parsed.flags, 'frames'),
        bundleZip: flagString(parsed.flags, 'bundle') === 'zip',
        allowPartial: flagBoolean(parsed.flags, 'allow-partial'),
      });
      return writeResponse(commandOk('render', result), parsed, io, 'Render complete.\n');
    } catch (error) {
      const response = commandError('render', {
        code: 'render_failed',
        message: error instanceof Error ? error.message : 'Render failed.',
      });
      return writeResponse(response, parsed, io, '');
    }
  }
```

Add `import path from 'node:path';` to `main.ts`.

Dispatch `preset render` before the generic `preset` dispatch:

```ts
  if (parsed.command[0] === 'preset' && parsed.command[1] === 'render') {
    const presetId = parsed.positionals[0];
    const outDir = flagString(parsed.flags, 'out');
    if (!presetId || !outDir) {
      const response = commandError('preset render', {
        code: 'missing_argument',
        message: 'Preset id and --out are required.',
      });
      return writeResponse(response, parsed, io, '');
    }
    try {
      const selectionJson = materializePreset(presetId);
      const result = await renderSelection({
        cwd: io.cwd,
        outDir: path.resolve(io.cwd, outDir),
        selectionName: selectionJson.name ?? presetId,
        selectionJson,
        animations: flagStrings(parsed.flags, 'animation'),
        frames: flagString(parsed.flags, 'frames') === 'all'
          ? 'all'
          : flagStrings(parsed.flags, 'frames'),
        bundleZip: flagString(parsed.flags, 'bundle') === 'zip',
        allowPartial: flagBoolean(parsed.flags, 'allow-partial'),
      });
      return writeResponse(commandOk('preset render', result), parsed, io, 'Render complete.\n');
    } catch (error) {
      const response = commandError('preset render', {
        code: 'render_failed',
        message: error instanceof Error ? error.message : 'Preset render failed.',
      });
      return writeResponse(response, parsed, io, '');
    }
  }
```

- [x] **Step 7: Run render integration test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- render.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS. If `@napi-rs/canvas` cannot encode with `encode('png')`, inspect its installed API and change only `writeCanvasPng` to the correct PNG buffer method.

- [x] **Step 8: Commit**

```bash
rtk git add packages/cli/src packages/cli/test
rtk git commit -m "feat(cli): render sprite artifacts"
```

Implementation note: Added CLI Node canvas and ZIP adapters, `renderSelection`,
`render --selection`, and `preset render`. Successful renders publish sheet PNG,
metadata JSON, credits TXT/CSV, requested animation strips, requested frames,
and optional ZIP bundles. Review fixes prevent strict render failures from
leaving partial artifacts by staging/publishing transactionally, and surface
`allowPartial` validation errors in returned warnings, metadata warnings, and
`skippedLayers`.

Commit: 6de48f056225598aedf3575212fe970242d98309,
0599a5601da6fb55fcfafc2bc8a150d05dd55650,
668b0e1b13ead4c97f08315ad26198fafc115a9d

Verification: RED test run PASS (expected missing render module failure
observed); `rtk env CI=true pnpm --filter @lpc-toolkit/cli test -- render.test.ts`
PASS; `rtk env CI=true pnpm --filter @lpc-toolkit/cli typecheck` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/cli build` PASS;
`rtk env CI=true pnpm --filter @lpc-toolkit/cli test` PASS;
`rtk env CI=true pnpm check:boundaries` PASS; spec compliance review PASS;
code quality review PASS.

## Task 9: Boundary, Integration, And CLI Polish

**Files:**
- Modify: `scripts/check-boundaries.mjs` if needed
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/render.ts`
- Test: `packages/cli/test/main-json.test.ts`

- [ ] **Step 1: Write JSON command behavior tests**

Create `packages/cli/test/main-json.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/main.js';

describe('main json behavior', () => {
  it('writes machine-readable unknown command errors to stdout', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli(['nope', '--json'], {
      cwd: process.cwd(),
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'nope',
      errors: [{ code: 'unknown_command' }],
    });
  });
});
```

- [ ] **Step 2: Run all CLI tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/presets typecheck
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Run boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS. If the boundary script flags CLI Node imports, update `scripts/check-boundaries.mjs` to include `packages/cli/src/**` as a Node-permitted package while keeping all existing `packages/core/src/**` restrictions.

- [ ] **Step 5: Run core tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/core test
```

Expected: PASS.

- [ ] **Step 6: Commit final polish**

```bash
rtk git add packages/cli packages/presets packages/web scripts/check-boundaries.mjs package.json pnpm-lock.yaml
rtk git commit -m "test(cli): verify agent-first cli"
```

Implementation note: record final verification summary here.

Commit: record resulting hash here.

Verification: record PASS/FAIL here.

## Task 10: End-To-End Manual Smoke

**Files:**
- Modify: `docs/superpowers/plans/2026-07-06-agent-first-cli.md`

- [ ] **Step 1: Build packages**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/core build
rtk pnpm --filter @lpc-toolkit/presets build
rtk pnpm --filter @lpc-toolkit/cli build
```

Expected: PASS.

- [ ] **Step 2: Materialize a preset**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec lpc preset materialize farmer --out /tmp/lpc-farmer.json --json
```

Expected: JSON response with `ok: true`, and `/tmp/lpc-farmer.json` exists.

- [ ] **Step 3: Validate materialized preset**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec lpc selection validate --selection /tmp/lpc-farmer.json --json
```

Expected: JSON response with `ok: true`.

- [ ] **Step 4: Render materialized preset**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec lpc render --selection /tmp/lpc-farmer.json --out /tmp/lpc-farmer --animation walk --frames walk --bundle zip --json
```

Expected: JSON response with `ok: true`; `/tmp/lpc-farmer` contains sheet PNG, metadata JSON, credits TXT, credits CSV, `animations/walk.png`, frame PNGs, and bundle ZIP.

- [ ] **Step 5: Record final verification in this plan**

Append under this task:

```markdown
Implementation note: Manual CLI smoke completed.
Commit: <hash>
Verification: build PASS, preset materialize PASS, selection validate PASS, render PASS
```

- [ ] **Step 6: Commit plan updates**

```bash
rtk git add docs/superpowers/plans/2026-07-06-agent-first-cli.md
rtk git commit -m "docs: record cli implementation verification"
```

Implementation note: record the completed plan bookkeeping here.

Commit: record resulting hash here.

Verification: record PASS/FAIL here.

## Self-Review

- Spec coverage: package shape, JSON/human output, catalog exploration, selection JSON, token helpers, presets, validation, rendering, attribution, ZIP, metadata, tests, and boundary checks each map to tasks above.
- Placeholder scan: the plan intentionally uses checkbox bookkeeping fields for the executing worker to fill with observed commit hashes and verification results. It does not leave implementation behavior undefined.
- Type consistency: the plan consistently uses `SelectionJson`, `CliResponse`, `CliIssue`, `RuntimeContext`, `renderSelection`, and core `Selections`.
- Scope check: the plan does not include game-engine importers, batch manifests, or natural-language generation. It implements the approved first version only.
