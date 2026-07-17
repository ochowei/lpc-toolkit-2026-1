# Character JSON Interchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `lpc-toolkit.selection.v1` the one character JSON document shared by Toolkit Web and CLI while importing upstream version 1 and version 2 documents through a pure core adapter.

**Architecture:** Move the unchanged canonical selection schema, parser, and serializer into `@lpc-toolkit/core`. Add a discriminator-based core importer that resolves upstream item IDs through the active catalog and palettes, then let CLI and Web own only their filesystem/browser I/O around that pure API. All writes normalize to canonical JSON; read-only CLI operations and failed imports never modify their source.

**Tech Stack:** TypeScript strict mode, Vitest, React 18, Vite, Playwright, Node 22, pnpm 9, existing core catalog/palette/hash APIs.

## Global Constraints

- Do not add dependencies. If a dependency becomes necessary, stop and ask; include its license in the request.
- Do not initialize, read, modify, or install packages inside the tracked `upstream/` gitlink.
- Keep `packages/core` environment-agnostic: no React, DOM, browser location, filesystem, Node runtime, Vite, concrete canvas, or ZIP imports.
- Keep the exact canonical discriminator `lpc-toolkit.selection.v1`; existing canonical JSON remains byte-shape compatible after pretty-print normalization.
- Keep the CLI response envelope `{ ok, command, data, warnings, errors }` owned by `packages/cli` and unchanged.
- Do not add `any`; use `unknown`, type guards, and strict exported interfaces.
- Upstream `layers` and `credits` are untrusted input and never enter the canonical document. Rendering recomputes credits from the active asset source.
- Imports are replace-all and atomic. Do not implement merge semantics or partial imports.
- Read-only CLI commands never rewrite upstream input. Successful `character set` and `character remove` normalize upstream input through the existing atomic writer and report a warning.
- Use pnpm for repository work and prefix every terminal command with `rtk`.
- After each task: check its completed boxes, add a short implementation note, commit the product changes, record the full `rtk git rev-parse HEAD` output and exact PASS/FAIL verification commands in this plan, then commit the plan record as `docs(plan): record character JSON task N`.

## Scope Check

The work spans core, CLI, and Web, but these are sequential consumers of one
selection-document contract rather than independent products. One plan keeps
the shared interfaces explicit and lets each task end in a testable consumer
milestone.

## File Responsibility Map

### New files

| File | Responsibility |
| --- | --- |
| `packages/core/src/selection-document.ts` | Canonical schema, types, strict parser, serializer. |
| `packages/core/src/upstream-selection-import.ts` | Format detection, upstream v1/v2 conversion, catalog/palette-backed import validation, typed errors. |
| `packages/core/test/selection-document.test.ts` | Canonical compatibility and round-trip contract. |
| `packages/core/test/upstream-selection-import.test.ts` | Format detection, v1/v2 conversion, sub-recolor binding, and failure contracts. |
| `packages/cli/src/selection-document-file.ts` | Node file reading plus runtime catalog/palette context around the core importer. |
| `packages/cli/test/selection-document-file.test.ts` | CLI boundary parsing, source discrimination, and no-write behavior. |
| `packages/web/src/lib/character-document.ts` | Browser text-file import and canonical Blob download workflow. |
| `packages/web/test/character-document.test.ts` | Browser workflow seams without DOM mutation. |
| `packages/web/src/components/layer-stack/popovers/share-import-popover.tsx` | Share/import presentation and user intent dispatch. |
| `packages/web/test/share-import-popover.test.ts` | Presentation-boundary and control contract. |
| `packages/web/e2e/character-json-interchange.spec.ts` | Browser save/change/import restoration flow. |

### Removed files

| File | Reason |
| --- | --- |
| `packages/cli/src/selection.ts` | Replaced by the public core canonical API. |
| `packages/cli/test/selection.test.ts` | Contract coverage moves to core. |
| `packages/web/src/components/layer-stack/popovers/token-popover.tsx` | Replaced by the broader Share / Import popover. |

### Modified files

| Area | Files |
| --- | --- |
| Core public API and recolor binding | `packages/core/src/index.ts`, `packages/core/src/recolor-resolve.ts`, focused existing recolor tests if needed. |
| CLI readers and dispatch | `packages/cli/src/character-store.ts`, `character-commands.ts`, `compose-selection.ts`, `preview.ts`, `render.ts`, `selection-commands.ts`, `token-commands.ts`, `preset-commands.ts`, `character-editor.ts`, `main.ts`. |
| CLI contracts/tests | `packages/cli/src/command-spec.ts`, `packages/cli/src/response.ts` only if human warning formatting needs a focused assertion, `packages/cli/test/command-spec.test.ts`, `main-assets.test.ts`, `token-commands.test.ts`, `character-store.test.ts`, `character-commands.test.ts`, `preview.test.ts`, `render.test.ts`, `main-human.test.ts`, `main-json.test.ts`. |
| Web wiring and copy | `packages/web/src/components/layer-stack/harness.tsx`, `popovers/more-menu-popover.tsx`, `packages/web/src/i18n.ts`, `packages/web/test/i18n.test.ts`. |
| Owned docs | `README.md`, `packages/cli/README.md`, `docs/ARCHITECTURE.md`, `packages/web/test/readme-architecture-docs.test.ts`. |

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: update
landing: N/A — landing tutorial does not document selection-file interchange
architecture: update
engineering: N/A — commands and CI/verification mapping remain unchanged
releasing: N/A — package installation, versioning, and publication do not change
plugin: N/A — plugin command workflow continues to use canonical selection files
```

---

### Task 1: Move the canonical selection document contract into core

**Files:**
- Create: `packages/core/src/selection-document.ts`
- Create: `packages/core/test/selection-document.test.ts`
- Modify: `packages/core/src/index.ts`
- Reference only: `packages/cli/src/selection.ts`

**Interfaces:**
- Consumes: core `BodyType`, `Selection`, `Selections`, and `TypeName`.
- Produces: `SELECTION_SCHEMA`, `SelectionJsonItem`, `SelectionJson`, `ParsedSelectionJson`, `parseSelectionJson(value)`, and `selectionJsonFromCore(selections, name?)` exported from `@lpc-toolkit/core`.

- [x] **Step 1: Write the failing core compatibility tests**

Create `packages/core/test/selection-document.test.ts` with the existing CLI
contract plus a normalized round trip:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseSelectionJson,
  selectionJsonFromCore,
} from '../src/selection-document.js';

describe('selection document', () => {
  const document = {
    schema: 'lpc-toolkit.selection.v1',
    name: 'hero',
    bodyType: 'male',
    items: {
      body: { name: 'Body Color', recolor: 'light' },
      hair: { name: 'Braids', variant: 'long' },
    },
  } as const;

  it('parses the unchanged v1 schema into core selections', () => {
    expect(parseSelectionJson(document)).toEqual({
      metadata: { schema: 'lpc-toolkit.selection.v1', name: 'hero' },
      selections: {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
          hair: { typeName: 'hair', name: 'Braids', variant: 'long' },
        },
      },
    });
  });

  it('serializes a parsed document back to the canonical shape', () => {
    const parsed = parseSelectionJson(document);
    expect(selectionJsonFromCore(parsed.selections, parsed.metadata.name)).toEqual(document);
  });

  it.each([
    [{ bodyType: 'male', items: {} }, 'Unsupported selection schema'],
    [{ schema: 'lpc-toolkit.selection.v1', items: {} }, 'bodyType must be a string'],
    [{ schema: 'lpc-toolkit.selection.v1', bodyType: 'male', items: [] }, 'items must be an object'],
    [{ schema: 'lpc-toolkit.selection.v1', bodyType: 'male', items: { hair: { name: 1 } } }, 'must include a string name'],
  ])('rejects malformed canonical input %#', (value, message) => {
    expect(() => parseSelectionJson(value)).toThrow(message);
  });
});
```

- [x] **Step 2: Run the focused test and verify the missing module failure**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- selection-document.test.ts
```

Expected: FAIL because `../src/selection-document.js` does not exist.

- [x] **Step 3: Implement the canonical core module without changing behavior**

Create `packages/core/src/selection-document.ts` by moving the current CLI
implementation with these exact public declarations:

```ts
import type { BodyType, Selection, Selections, TypeName } from './types.js';

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
    if (raw.variant !== undefined && typeof raw.variant !== 'string') {
      throw new Error(`Selection item ${typeName} variant must be a string.`);
    }
    if (raw.recolor !== undefined && typeof raw.recolor !== 'string') {
      throw new Error(`Selection item ${typeName} recolor must be a string.`);
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
    selections: { bodyType: value.bodyType, items },
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

Export the values and types from `packages/core/src/index.ts`. Keep the CLI
copy temporarily so Task 1 is independently green; Task 4 removes it after all
consumers migrate.

- [x] **Step 4: Run core tests, typecheck, and boundaries**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- selection-document.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm check:boundaries
```

Expected: all PASS.

- [x] **Step 5: Commit and record Task 1**

Commit product changes:

```sh
rtk git add packages/core/src/selection-document.ts packages/core/src/index.ts packages/core/test/selection-document.test.ts
rtk git commit -m "feat(core): own canonical selection documents"
rtk git rev-parse HEAD
```

Record the full hash and PASS commands under Task 1 in this plan, then commit
the record as `docs(plan): record character JSON task 1`.

**Implementation note:** Added the environment-agnostic canonical selection
document parser/serializer to core, preserved the exact v1 schema behavior,
and exported the new public contract. Independent task review found the task
spec compliant and approved with no issues.

**Commit:** `50b06e65ed2a900517d220e99b64b4315db61cec`

**Verification:**
- `rtk pnpm --filter @lpc-toolkit/core test -- selection-document.test.ts` PASS (6 tests)
- `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
- `rtk pnpm check:boundaries` PASS

---

### Task 2: Add the pure upstream importer and catalog-backed validation

**Files:**
- Create: `packages/core/src/upstream-selection-import.ts`
- Create: `packages/core/test/upstream-selection-import.test.ts`
- Modify: `packages/core/src/recolor-resolve.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/recolor-resolve.test.ts`

**Interfaces:**
- Consumes: Task 1 canonical APIs, `Catalog`, `PaletteMetadata`, `parseHash`, and palette-expanded recolor metadata.
- Produces:

```ts
export type SelectionDocumentSource = 'canonical' | 'upstream-v1' | 'upstream-v2';
export interface SelectionDocumentImportContext {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
}
export interface ImportedSelectionDocument {
  readonly source: SelectionDocumentSource;
  readonly selection: SelectionJson;
  readonly parsed: ParsedSelectionJson;
}
export class SelectionDocumentError extends Error {
  readonly code: SelectionDocumentErrorCode;
  readonly path?: string;
}
export function importSelectionDocument(
  value: unknown,
  context: SelectionDocumentImportContext,
): ImportedSelectionDocument;
```

- [x] **Step 1: Write failing upstream import tests**

Create fixtures entirely in the test; do not read `upstream/`. The core cases
must include:

```ts
it('imports upstream v2 and ignores editor-only metadata', () => {
  const result = importSelectionDocument({
    version: 2,
    bodyType: 'male',
    selections: {
      body: { itemId: 'body', name: 'Untrusted label', recolor: 'ulpc.light' },
    },
    selectedAnimation: 'walk',
    layers: [{ itemId: 'stale' }],
    credits: { stale: ['credit'] },
  }, context);

  expect(result.source).toBe('upstream-v2');
  expect(result.selection).toEqual({
    schema: 'lpc-toolkit.selection.v1',
    bodyType: 'male',
    items: { body: { name: 'Body Color', recolor: 'ulpc.light' } },
  });
  expect(JSON.stringify(result.selection)).not.toMatch(/layers|credits|selectedAnimation/);
});

it('imports an upstream recolor sub-selection by its outer type key', () => {
  const result = importSelectionDocument({
    version: 2,
    bodyType: 'male',
    selections: {
      coat: { itemId: 'coat', recolor: 'ulpc.blue' },
      trim: { itemId: 'coat', subId: 1, recolor: 'ulpc.gold' },
    },
  }, context);

  expect(result.selection.items).toEqual({
    coat: { name: 'Coat', recolor: 'ulpc.blue' },
    trim: { name: 'Coat', recolor: 'ulpc.gold' },
  });
});

it('imports upstream v1 through its absolute URL hash', () => {
  const result = importSelectionDocument({
    version: 1,
    url: 'https://example.test/generator/#sex=male&body=Body_Color',
  }, context);
  expect(result.source).toBe('upstream-v1');
  expect(result.selection.items.body?.name).toBe('Body Color');
});

it.each([
  [{ schema: 'lpc-toolkit.selection.v1', version: 2 }, 'ambiguous_selection_format'],
  [{ value: 1 }, 'unsupported_selection_format'],
  [{ version: 3 }, 'unsupported_upstream_version'],
  [{ version: 2, bodyType: 'male', selections: { hair: { itemId: 'missing' } } }, 'unknown_upstream_item'],
])('rejects invalid interchange input %#', (value, code) => {
  expect(() => importSelectionDocument(value, context)).toThrowError(
    expect.objectContaining({ code }),
  );
});
```

Build `context` with `createCatalog` and inline `PaletteMetadata`. Include a
`coat` definition whose `recolors.color_2.type_name` is `trim`, plus cloth and
metal palette ramps, so the test proves the sub-binding rather than merely
asserting a primary item.

- [x] **Step 2: Run focused tests and verify missing exports**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- upstream-selection-import.test.ts
```

Expected: FAIL because `importSelectionDocument` and the type-specific recolor
helpers do not exist.

- [x] **Step 3: Add type-specific recolor helpers**

Extend `packages/core/src/recolor-resolve.ts` without changing the existing
`getRecolorVariants` result:

```ts
export function itemSupportsSelectionType(
  item: ItemDefinition,
  typeName: TypeName,
): boolean {
  if (item.type_name === typeName) return true;
  return collectRecolorEntries(item.recolors).some(
    (entry) => entry.type_name === typeName,
  );
}

export function getRecolorVariantsForType(
  item: ItemDefinition,
  palettes: PaletteMetadata,
  typeName: TypeName,
): readonly string[] {
  const entry = collectRecolorEntries(item.recolors).find(
    (candidate) => (candidate.type_name ?? item.type_name) === typeName,
  );
  if (!entry) return [];
  const normalized = normalizeRecolor(entry, palettes.materials);
  return normalized?.variants ?? [];
}
```

Add focused assertions to `recolor-resolve.test.ts` proving primary and `trim`
lookups, and export these helpers from `packages/core/src/index.ts`.

- [x] **Step 4: Implement discriminator detection and conversion**

Create `packages/core/src/upstream-selection-import.ts`. Use record guards and
the following exact public error/source contract:

```ts
export type SelectionDocumentErrorCode =
  | 'invalid_selection_json'
  | 'unsupported_selection_format'
  | 'ambiguous_selection_format'
  | 'unsupported_selection_schema'
  | 'unsupported_upstream_version'
  | 'invalid_upstream_selection'
  | 'unknown_upstream_item'
  | 'invalid_selection_variant'
  | 'invalid_selection_recolor';

export class SelectionDocumentError extends Error {
  constructor(
    readonly code: SelectionDocumentErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'SelectionDocumentError';
  }
}
```

Implement these private operations in the same file:

1. `isRecord(value)` rejects arrays/null.
2. `normalizedOptionalString(value, path)` accepts undefined/null/empty as
   omitted and throws `invalid_upstream_selection` for non-strings.
3. `resolveByName(typeName, name, catalog)` scans `catalog.byItemId` and uses
   `itemSupportsSelectionType`.
4. `validateSelection(typeName, selection, bodyType, context, source)` verifies
   item identity, primary variants, the recolor list returned by
   `getRecolorVariantsForType`, and body compatibility for primary selections.
   Recolor sub-bindings do not require their own sprite path because the
   primary selection owns the rendered layers.
5. `importV2(record, context)` requires `bodyType`, `selections`, and each
   `itemId`; it resolves the trusted item name and preserves the outer key as
   `typeName`.
6. `importV1(record, context)` requires an `http` or `https` absolute URL with
   a non-empty hash, calls `parseHash`, and rejects the first hash warning as
   `invalid_upstream_selection` rather than returning a partial document.
7. `importCanonical(record, context)` checks `SELECTION_SCHEMA`, calls
   `parseSelectionJson`, normalizes through `selectionJsonFromCore`, and runs
   the same catalog-backed validation.

The top-level dispatch must have this unambiguous shape:

```ts
export function importSelectionDocument(
  value: unknown,
  context: SelectionDocumentImportContext,
): ImportedSelectionDocument {
  if (!isRecord(value)) {
    throw new SelectionDocumentError(
      'unsupported_selection_format',
      'Selection document must be a JSON object.',
    );
  }
  const hasSchema = Object.prototype.hasOwnProperty.call(value, 'schema');
  const hasVersion = Object.prototype.hasOwnProperty.call(value, 'version');
  if (hasSchema && hasVersion) {
    throw new SelectionDocumentError(
      'ambiguous_selection_format',
      'Selection document cannot contain both schema and version.',
    );
  }
  if (hasSchema) return importCanonical(value, context);
  if (value.version === 1) return importV1(value, context);
  if (value.version === 2) return importV2(value, context);
  if (hasVersion) {
    throw new SelectionDocumentError(
      'unsupported_upstream_version',
      `Unsupported upstream selection version: ${String(value.version)}`,
      'version',
    );
  }
  throw new SelectionDocumentError(
    'unsupported_selection_format',
    'Selection document must contain schema or version.',
  );
}
```

Export all public types/functions from `packages/core/src/index.ts`.

- [x] **Step 5: Run core test, type, and boundary gates**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- upstream-selection-import.test.ts recolor-resolve.test.ts selection-document.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm check:boundaries
```

Expected: all PASS.

- [x] **Step 6: Commit and record Task 2**

```sh
rtk git add packages/core/src/upstream-selection-import.ts packages/core/src/recolor-resolve.ts packages/core/src/index.ts packages/core/test/upstream-selection-import.test.ts packages/core/test/recolor-resolve.test.ts
rtk git commit -m "feat(core): import upstream selection documents"
rtk git rev-parse HEAD
```

Record the full hash and PASS commands under Task 2, then commit the plan
record as `docs(plan): record character JSON task 2`.

**Implementation note:** Added pure canonical/upstream-v1/upstream-v2 document
detection and import, catalog/palette-backed validation, and type-specific
recolor helpers. Review findings around malformed v1 hash components and
invalid absolute HTTP(S) authorities were fixed with focused regressions; the
independent re-review approved the task with no remaining issues.

**Commits:**
- `d6e56e1db0b93e74f6c3d8e6f769693cbd93216f`
- `58c5bba470bdfe92912ab09b7eb13d8697ba2a4a`

**Verification:**
- `rtk pnpm --filter @lpc-toolkit/core test -- upstream-selection-import.test.ts hash.test.ts recolor-resolve.test.ts selection-document.test.ts` PASS (80 tests)
- `rtk pnpm --filter @lpc-toolkit/core test` PASS (198 tests)
- `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
- `rtk pnpm check:boundaries` PASS

---

### Task 3: Introduce the CLI selection-file boundary and migrate read-only commands

**Files:**
- Create: `packages/cli/src/selection-document-file.ts`
- Create: `packages/cli/test/selection-document-file.test.ts`
- Modify: `packages/cli/src/selection-commands.ts`
- Modify: `packages/cli/src/token-commands.ts`
- Modify: `packages/cli/src/render.ts`
- Modify: `packages/cli/src/main.ts`
- Modify tests: `packages/cli/test/token-commands.test.ts`, `main-assets.test.ts`, `render.test.ts`, `main-json.test.ts`

**Interfaces:**
- Consumes: Task 2 `importSelectionDocument`, `SelectionDocumentImportContext`, `SelectionDocumentError`, and CLI `RuntimeAssets` loaders.
- Produces:

```ts
export interface LoadedSelectionDocument extends ImportedSelectionDocument {
  readonly path: string;
}
export interface LoadedSelectionDocumentContext {
  readonly importContext: SelectionDocumentImportContext;
  readonly warnings: readonly CliIssue[];
}
export function loadSelectionDocumentContext(
  runtime: RuntimeAssets,
): LoadedSelectionDocumentContext;
export function readSelectionDocumentFile(
  cwd: string,
  selectionPath: string,
  context: SelectionDocumentImportContext,
): LoadedSelectionDocument;
```

- [x] **Step 1: Write the failing CLI boundary tests**

Create `packages/cli/test/selection-document-file.test.ts` using a temporary
file and a small `createCatalog` context:

```ts
it('reads upstream v2 as a canonical in-memory document without rewriting', () => {
  const source = `${JSON.stringify({
    version: 2,
    bodyType: 'male',
    selections: { body: { itemId: 'body' } },
  }, null, 2)}\n`;
  writeFileSync(selectionPath, source);

  const loaded = readSelectionDocumentFile(cwd, 'upstream.json', context);

  expect(loaded.source).toBe('upstream-v2');
  expect(loaded.selection).toEqual({
    schema: 'lpc-toolkit.selection.v1',
    bodyType: 'male',
    items: { body: { name: 'Body Color' } },
  });
  expect(readFileSync(selectionPath, 'utf8')).toBe(source);
});

it('preserves core error codes and paths', () => {
  writeFileSync(selectionPath, JSON.stringify({ version: 3 }));
  expect(() => readSelectionDocumentFile(cwd, 'upstream.json', context)).toThrowError(
    expect.objectContaining({ code: 'unsupported_upstream_version', path: 'version' }),
  );
});
```

- [x] **Step 2: Run the focused CLI test and verify the missing module failure**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- selection-document-file.test.ts
```

Expected: FAIL because `selection-document-file.ts` does not exist.

- [x] **Step 3: Implement the centralized Node I/O boundary**

Create `packages/cli/src/selection-document-file.ts` with filesystem handling
only around the pure core API:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SelectionDocumentError,
  importSelectionDocument,
  type ImportedSelectionDocument,
  type SelectionDocumentImportContext,
} from '@lpc-toolkit/core';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import type { CliIssue } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';

export interface LoadedSelectionDocument extends ImportedSelectionDocument {
  readonly path: string;
}

export interface LoadedSelectionDocumentContext {
  readonly importContext: SelectionDocumentImportContext;
  readonly warnings: readonly CliIssue[];
}

export function loadSelectionDocumentContext(
  runtime: RuntimeAssets,
): LoadedSelectionDocumentContext {
  const catalog = loadCatalogFromRoots(
    runtime.context.sheetDefinitionsRoot,
    runtime.context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(runtime.context.paletteDefinitionsRoot);
  return {
    importContext: { catalog: catalog.catalog, palettes: palettes.palettes },
    warnings: [...catalog.warnings, ...palettes.warnings],
  };
}

export function readSelectionDocumentFile(
  cwd: string,
  selectionPath: string,
  context: SelectionDocumentImportContext,
): LoadedSelectionDocument {
  const resolvedPath = path.resolve(cwd, selectionPath);
  const text = readFileSync(resolvedPath, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new SelectionDocumentError(
      'invalid_selection_json',
      error instanceof Error ? error.message : String(error),
      selectionPath,
    );
  }
  return { path: resolvedPath, ...importSelectionDocument(value, context) };
}
```

Do not write from this module.

- [x] **Step 4: Migrate selection validate, top-level render, and token encode**

- `selection validate`: load one document context, read through the new helper,
  then retain existing filesystem-backed `validateSelections` checks.
- Top-level `render`: remove `readSelectionJsonFile` from `render.ts`; load the
  context in `main.ts`, read the normalized in-memory document, and pass
  `loaded.selection` to `renderSelection`.
- `token encode`: accept `runtime?: RuntimeAssets`, require it only for encode,
  and read through the new helper. Keep token decode's bundled metadata path
  unchanged.
- `commandNeedsAssets`: classify `token encode` as asset-dependent and `token
  decode` as asset-independent.
- When caught errors are `SelectionDocumentError`, keep `error.code`,
  `error.message`, and `error.path` in the CLI issue rather than collapsing
  them to `render_failed` or `invalid_selection_json`.

The token dispatch becomes:

```ts
if (parsed.command[0] === 'token') {
  return writeResponse(
    runTokenCommand(parsed, io.cwd, runtime),
    parsed,
    io,
    'Token command completed.\n',
  );
}
```

Add/update assertions proving upstream `selection validate`, `render`, and
`token encode` accept the fixture and leave it byte-for-byte unchanged.

- [x] **Step 5: Run focused CLI gates**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- selection-document-file.test.ts token-commands.test.ts main-assets.test.ts render.test.ts main-json.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: all PASS; `main-assets.test.ts` places only token encode in the
asset-dependent table.

- [x] **Step 6: Commit and record Task 3**

```sh
rtk git add packages/cli/src/selection-document-file.ts packages/cli/src/selection-commands.ts packages/cli/src/token-commands.ts packages/cli/src/render.ts packages/cli/src/main.ts packages/cli/test/selection-document-file.test.ts packages/cli/test/token-commands.test.ts packages/cli/test/main-assets.test.ts packages/cli/test/render.test.ts packages/cli/test/main-json.test.ts
rtk git commit -m "feat(cli): read interchangeable selection documents"
rtk git rev-parse HEAD
```

Record the full hash and PASS commands under Task 3, then commit the plan
record as `docs(plan): record character JSON task 3`.

**Implementation note:** Added the centralized read-only CLI file boundary and
migrated selection validation, top-level rendering, and token encoding to the
core importer while preserving typed errors, source bytes, attribution, and
the CLI response envelope. Independent review approved the task. One minor
render import-error warning propagation inconsistency is recorded in the SDD
ledger for final whole-branch triage.

**Commit:** `ed7d0397bc9007fde86517970855e179678c8656`

**Verification:**
- `rtk pnpm --filter @lpc-toolkit/cli test -- selection-document-file.test.ts token-commands.test.ts main-assets.test.ts render.test.ts main-json.test.ts` PASS (80 tests)
- `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts main-human.test.ts` PASS (19 tests)
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS
- `rtk pnpm --filter @lpc-toolkit/cli test` PASS (363 tests, 1 existing skip; controller rerun with localhost permission)

---

### Task 4: Normalize character mutations and remove the CLI schema duplicate

**Files:**
- Modify: `packages/cli/src/character-store.ts`
- Modify: `packages/cli/src/character-commands.ts`
- Modify: `packages/cli/src/preview.ts`
- Modify imports: `packages/cli/src/compose-selection.ts`, `preset-commands.ts`, `character-editor.ts`, `token-commands.ts`, `render.ts`
- Remove: `packages/cli/src/selection.ts`
- Remove: `packages/cli/test/selection.test.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/README.md`
- Modify tests: `packages/cli/test/character-store.test.ts`, `character-commands.test.ts`, `preview.test.ts`, `command-spec.test.ts`, `main-human.test.ts`, `main-json.test.ts`

**Interfaces:**
- Consumes: Task 3 context/file reader and Task 1 canonical exports.
- Produces: character read results with `source`, canonical in-memory preview/render input, and warning code `selection_format_normalized` after successful upstream mutation.

- [ ] **Step 1: Write failing character read/mutation tests**

Add an upstream fixture to `character-commands.test.ts` and cover both read-only
and mutation behavior:

```ts
it('shows upstream input as canonical without rewriting the source', async () => {
  const original = writeUpstreamCharacter(fixture, 'saved/upstream.json');
  const response = (await run(fixture, [
    'character', 'show', '--selection', 'saved/upstream.json', '--json',
  ])).response;

  expect(response).toMatchObject({
    ok: true,
    data: {
      selection: {
        schema: 'lpc-toolkit.selection.v1',
        bodyType: 'male',
        items: { body: { name: 'Body Color' } },
      },
    },
  });
  expect(readFileSync(path.join(fixture.cwd, 'saved/upstream.json'), 'utf8')).toBe(original);
});

it.each([
  ['set', ['--type', 'hair', '--item', 'braids']],
  ['remove', ['--type', 'body']],
] as const)('normalizes upstream input after successful character %s', async (command, args) => {
  writeUpstreamCharacter(fixture, 'saved/upstream.json');
  const response = (await run(fixture, [
    'character', command, '--selection', 'saved/upstream.json', ...args, '--json',
  ])).response;

  expect(response.ok).toBe(true);
  expect(response.warnings).toContainEqual(expect.objectContaining({
    code: 'selection_format_normalized',
    path: path.join(fixture.cwd, 'saved/upstream.json'),
  }));
  expect(JSON.parse(readFileSync(
    path.join(fixture.cwd, 'saved/upstream.json'),
    'utf8',
  ))).toMatchObject({ schema: 'lpc-toolkit.selection.v1' });
});
```

Retain and extend the existing invalid-candidate test so an upstream source is
also byte-for-byte unchanged when validation fails.

- [ ] **Step 2: Run focused character tests and verify failure**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-store.test.ts character-commands.test.ts preview.test.ts
```

Expected: FAIL because `readCharacter` is canonical-only and preview rereads
the upstream file.

- [ ] **Step 3: Make character reads context-aware and keep list independent**

Extend `StoredCharacter` with `source: SelectionDocumentSource`. Change
`readCharacter` to accept an optional `SelectionDocumentImportContext`:

```ts
export function readCharacter(
  cwd: string,
  input: CharacterLocator,
  importContext?: SelectionDocumentImportContext,
): StoredCharacter {
  const targetPath = resolveCharacterPath(cwd, input);
  if (importContext) {
    const loaded = readSelectionDocumentFile(cwd, targetPath, importContext);
    return {
      path: loaded.path,
      selection: loaded.selection,
      parsed: loaded.parsed,
      source: loaded.source,
    };
  }

  const value = JSON.parse(readFileSync(targetPath, 'utf8')) as unknown;
  const parsed = parseSelectionJson(value);
  return {
    path: targetPath,
    selection: selectionJsonFromCore(parsed.selections, parsed.metadata.name),
    parsed,
    source: 'canonical',
  };
}
```

Preserve the existing typed filesystem error mapping around both branches.
`listCharacters` continues to call the canonical-only branch, keeping
`character list` asset-independent.

Expose `importContext` from `loadCharacterContext`, load the context before
every existing-character read, and pass it into `readCharacter`.

- [ ] **Step 4: Stop preview from rereading the source path**

Change `CharacterPreviewOptions` to include both the canonical in-memory
document and the original path used only for output identity:

```ts
export interface CharacterPreviewOptions {
  readonly runtime: RuntimeAssets;
  readonly cwd: string;
  readonly selectionPath: string;
  readonly selectionJson: SelectionJson;
  readonly outDir?: string;
  readonly characterName?: string;
  readonly animation?: AnimationName;
  readonly direction?: string;
  readonly frameIndex?: number;
}
```

Remove `readSelection` from `preview.ts`; use `options.selectionJson` throughout.
`character preview` passes `stored.selection`. Update preview unit tests to
assert this exact input.

- [ ] **Step 5: Add atomic normalization warnings and stable import errors**

Add this CLI warning helper next to the character command orchestration:

```ts
function normalizationWarnings(stored: StoredCharacter): readonly CliIssue[] {
  if (stored.source === 'canonical') return [];
  return [{
    code: 'selection_format_normalized',
    message: `Updated ${stored.source} input was written as ${SELECTION_SCHEMA}.`,
    path: stored.path,
  }];
}
```

Append it only after `writeCharacter` succeeds in `character set` and
`character remove`. Recognize `SelectionDocumentError` in `issueFromError` and
preserve its code/path. Read-only commands never call `writeCharacter`.

Update CLI validation for recolor sub-bindings: use
`itemSupportsSelectionType` and `getRecolorVariantsForType`; do not require a
standalone sprite path for a sub-binding because its primary item owns the
layer.

- [ ] **Step 6: Remove the CLI schema duplicate and update help/CLI README**

Import canonical types/functions directly from `@lpc-toolkit/core` in every
remaining CLI consumer, then remove `packages/cli/src/selection.ts` and its
test.

Change only the input option help copy; keep create's destination copy exact:

```ts
const SELECTION_OPTION: CommandOptionSpec = {
  name: 'selection',
  kind: 'value',
  valueLabel: 'file',
  description: 'Read a Toolkit or upstream selection JSON file.',
};
```

Add CLI README text stating:

- `lpc-toolkit.selection.v1` is the canonical saved format;
- upstream v1/v2 inputs are accepted wherever `--selection` reads an existing
  file;
- read-only commands do not rewrite input;
- `character set/remove` rewrite successful upstream mutations as canonical
  and emit `selection_format_normalized`;
- `character create --selection` remains an output destination.

Add help assertions for both input and create descriptions.

- [ ] **Step 7: Run CLI package gates**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-store.test.ts character-commands.test.ts preview.test.ts command-spec.test.ts main-human.test.ts main-json.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli build
```

Expected: all PASS; no source or test imports `./selection.js`.

- [ ] **Step 8: Commit and record Task 4**

Stage the exact modified CLI source/tests plus `packages/cli/README.md`, commit
as:

```sh
rtk git commit -m "feat(cli): normalize imported character documents"
rtk git rev-parse HEAD
```

Record the full hash and PASS commands under Task 4, then commit the plan
record as `docs(plan): record character JSON task 4`.

---

### Task 5: Add the Web character-document workflow

**Files:**
- Create: `packages/web/src/lib/character-document.ts`
- Create: `packages/web/test/character-document.test.ts`

**Interfaces:**
- Consumes: Task 2 core importer, Task 1 canonical serializer, Web `downloadBlob`.
- Produces:

```ts
export interface TextJsonFile { readonly text: () => Promise<string>; }
export interface SaveCharacterDocumentOptions {
  readonly download?: (blob: Blob, filename: string) => void;
}
export function saveCharacterDocument(
  selections: Selections,
  options?: SaveCharacterDocumentOptions,
): void;
export async function importCharacterDocument(
  file: TextJsonFile,
  context: SelectionDocumentImportContext,
): Promise<ImportedSelectionDocument>;
```

- [ ] **Step 1: Write failing browser-workflow tests**

Create `packages/web/test/character-document.test.ts`:

```ts
it('downloads the canonical document with the shared CLI shape', async () => {
  const download = vi.fn<(blob: Blob, filename: string) => void>();
  saveCharacterDocument({
    bodyType: 'male',
    items: { body: { typeName: 'body', name: 'Body Color', recolor: 'ulpc.light' } },
  }, { download });

  expect(download).toHaveBeenCalledWith(expect.any(Blob), 'character.selection.json');
  const blob = download.mock.calls[0]![0];
  expect(blob.type).toBe('application/json');
  expect(JSON.parse(await blob.text())).toEqual({
    schema: 'lpc-toolkit.selection.v1',
    bodyType: 'male',
    items: { body: { name: 'Body Color', recolor: 'ulpc.light' } },
  });
});

it('imports an upstream file through the shared core adapter', async () => {
  const file = {
    text: async () => JSON.stringify({
      version: 2,
      bodyType: 'male',
      selections: { body: { itemId: 'body' } },
    }),
  };
  const imported = await importCharacterDocument(file, context);
  expect(imported.source).toBe('upstream-v2');
  expect(imported.parsed.selections.items.body?.name).toBe('Body Color');
});

it('rejects malformed JSON without producing a candidate', async () => {
  await expect(importCharacterDocument({ text: async () => '{' }, context))
    .rejects.toBeInstanceOf(SyntaxError);
});
```

- [ ] **Step 2: Run focused Web test and verify missing module failure**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- character-document.test.ts
```

Expected: FAIL because `character-document.ts` does not exist.

- [ ] **Step 3: Implement file import and canonical Blob save**

Create `packages/web/src/lib/character-document.ts`:

```ts
import {
  importSelectionDocument,
  selectionJsonFromCore,
  type ImportedSelectionDocument,
  type SelectionDocumentImportContext,
  type Selections,
} from '@lpc-toolkit/core';
import { downloadBlob } from './download';

export interface TextJsonFile {
  readonly text: () => Promise<string>;
}

export interface SaveCharacterDocumentOptions {
  readonly download?: (blob: Blob, filename: string) => void;
}

export function saveCharacterDocument(
  selections: Selections,
  options: SaveCharacterDocumentOptions = {},
): void {
  const text = `${JSON.stringify(selectionJsonFromCore(selections), null, 2)}\n`;
  const blob = new Blob([text], { type: 'application/json' });
  (options.download ?? downloadBlob)(blob, 'character.selection.json');
}

export async function importCharacterDocument(
  file: TextJsonFile,
  context: SelectionDocumentImportContext,
): Promise<ImportedSelectionDocument> {
  const value = JSON.parse(await file.text()) as unknown;
  return importSelectionDocument(value, context);
}
```

This module does not dispatch React actions and does not accept imported
credits or layers.

- [ ] **Step 4: Run Web focused tests and typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- character-document.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit and record Task 5**

```sh
rtk git add packages/web/src/lib/character-document.ts packages/web/test/character-document.test.ts
rtk git commit -m "feat(web): add character document workflow"
rtk git rev-parse HEAD
```

Record the full hash and PASS commands under Task 5, then commit the plan
record as `docs(plan): record character JSON task 5`.

---

### Task 6: Replace Token UI with Share / Import and prove browser interchange

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/share-import-popover.tsx`
- Remove: `packages/web/src/components/layer-stack/popovers/token-popover.tsx`
- Create: `packages/web/test/share-import-popover.test.ts`
- Create: `packages/web/e2e/character-json-interchange.spec.ts`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`
- Modify: `packages/web/src/i18n.ts`
- Modify: `packages/web/test/i18n.test.ts`

**Interfaces:**
- Consumes: Task 5 save/import functions, `toSelections`, catalog, palettes, existing token/hash APIs, and the existing `apply_selections` action.
- Produces: one Share / Import popover with canonical save, canonical/upstream import, Copy Link, Copy Token, and Paste Token.

- [ ] **Step 1: Write failing presentation and i18n tests**

Create a source-boundary test matching the existing popover convention:

```ts
it('keeps ShareImportPopover presentation-only and exposes five actions', () => {
  const source = readFileSync(
    new URL(
      '../src/components/layer-stack/popovers/share-import-popover.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  expect(source).not.toMatch(/from ['"].*adapter/);
  expect(source).not.toMatch(/JSON\.parse|new Blob/);
  expect(source).toContain('saveCharacterDocument');
  expect(source).toContain('importCharacterDocument');
  expect(source.match(/onClick=/g)).toHaveLength(5);
});
```

Extend `i18n.test.ts` to require these keys in both locales:

```ts
const shareKeys = [
  'share.title',
  'share.characterJson',
  'share.saveJson',
  'share.importJson',
  'share.imported',
  'share.importFailed',
  'share.sharing',
] satisfies readonly TranslationKey[];
```

- [ ] **Step 2: Run focused tests and verify missing UI/copy**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- share-import-popover.test.ts i18n.test.ts
```

Expected: FAIL because the component and translation keys do not exist.

- [ ] **Step 3: Implement the Share / Import popover**

Start from the current Token popover behavior and add:

- a hidden `<input type="file" accept="application/json,.json">`;
- **Save character JSON**, calling `saveCharacterDocument(toSelections(state))`;
- **Import character JSON**, opening the input;
- file change handling that awaits `importCharacterDocument(file, { catalog,
  palettes })`, dispatches exactly one `apply_selections` action only after
  success, clears the input value, closes the popover, and reports localized
  status;
- existing Copy Token, Copy Link, and Paste Token behavior under a Sharing
  section.

The successful handler must have this order:

```ts
const imported = await importCharacterDocument(file, { catalog, palettes });
dispatch({ type: 'apply_selections', selections: imported.parsed.selections });
event.currentTarget.value = '';
setOpen(false);
onStatus(`${t('share.imported')} ✓`);
```

The catch path clears the input and reports
`${t('share.importFailed')}: ${message}` without dispatching.

Use these user-facing labels:

| Key | English | Traditional Chinese |
| --- | --- | --- |
| `share.title` | Share / Import | 分享／匯入 |
| `share.characterJson` | Character JSON | 角色 JSON |
| `share.saveJson` | Save character JSON | 儲存角色 JSON |
| `share.importJson` | Import character JSON | 匯入角色 JSON |
| `share.imported` | Character JSON imported. | 已匯入角色 JSON。 |
| `share.importFailed` | Character JSON import failed | 角色 JSON 匯入失敗 |
| `share.sharing` | Sharing | 分享 |

Retain existing token-specific copy keys for token actions.

- [ ] **Step 4: Wire the popover through the More menu and harness**

- Rename `MoreMenuTarget` from `'token' | 'attribution'` to
  `'share' | 'attribution'`.
- Rename the harness popover state member from `token` to `share`.
- Pass both `props.catalog` and `props.palettes` into `ShareImportPopover`.
- Keep the shared More-button anchor and right-edge positioning.
- Replace the More menu label/icon with `↗ {t('share.title')}`.
- Remove the old Token popover file after imports are updated.

- [ ] **Step 5: Add the browser round-trip E2E test**

Create `packages/web/e2e/character-json-interchange.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { clickPresetMenuAction } from './helpers/preset-menu';

test('saved canonical JSON restores the complete Web selection', async ({ page }) => {
  await page.goto('/compose?assetSource=zip');
  await expect(page.getByTestId('composition-loading-overlay')).toBeHidden({
    timeout: 30_000,
  });
  const originalHash = await page.evaluate(() => window.location.hash);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Share \/ Import/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save character JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('character.selection.json');
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Playwright did not expose the saved JSON path.');

  await page.keyboard.press('Escape');
  await clickPresetMenuAction(page, 'Farmer', 'Apply');
  await expect.poll(() => page.evaluate(() => window.location.hash))
    .not.toBe(originalHash);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Share \/ Import/ }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles(savedPath);

  await expect(page.getByText('Character JSON imported. ✓', { exact: true }))
    .toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash))
    .toBe(originalHash);
});
```

- [ ] **Step 6: Run Web unit, type, and focused E2E gates**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- share-import-popover.test.ts character-document.test.ts i18n.test.ts selection.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web test:e2e -- character-json-interchange.spec.ts
```

Expected: all PASS and the downloaded JSON filename is exact.

- [ ] **Step 7: Commit and record Task 6**

Stage the new/removed popover, Web library wiring, translations, tests, and E2E
spec, then commit:

```sh
rtk git commit -m "feat(web): share and import character JSON"
rtk git rev-parse HEAD
```

Record the full hash and PASS commands under Task 6, then commit the plan
record as `docs(plan): record character JSON task 6`.

---

### Task 7: Synchronize owned docs and run the complete verification matrix

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Reassess only: `packages/web/src/components/landing-page.tsx`, `docs/ENGINEERING.md`, `docs/RELEASING.md`, `plugins/lpc-toolkit/skills/**`
- Update records: `docs/superpowers/plans/2026-07-17-character-json-interchange.md`

**Interfaces:**
- Consumes: completed Core, CLI, and Web behavior.
- Produces: discoverable user documentation, stable package-boundary documentation, final verification evidence, and the reassessed CLI documentation matrix.

- [ ] **Step 1: Write failing documentation-contract assertions**

Extend `packages/web/test/readme-architecture-docs.test.ts` with exact ownership
and interchange phrases:

```ts
it('documents the shared character JSON interchange contract', () => {
  expect(rootReadme).toContain('lpc-toolkit.selection.v1');
  expect(rootReadme).toContain('upstream version 1 and version 2 JSON');
  expect(architecture).toContain('canonical character document');
  expect(architecture).toContain('upstream compatibility adapter');
  expect(architecture).toContain('active asset source');
});
```

- [ ] **Step 2: Run the docs contract and verify it fails**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL until README and architecture text are updated.

- [ ] **Step 3: Update root README and architecture ownership**

Add a concise root README section that states:

- Web Save character JSON and CLI outputs share
  `lpc-toolkit.selection.v1`;
- Web and any CLI option that reads an existing `--selection` accept upstream
  version 1 and version 2 JSON;
- read-only CLI use does not rewrite input;
- successful CLI mutations normalize to canonical;
- rendered artifacts still obtain credits from the active asset source.

Update `docs/ARCHITECTURE.md` so:

- core owns canonical selection documents and pure upstream conversion;
- Web owns browser file picker/download and dispatch;
- CLI owns filesystem reading, atomic normalization writes, and response
  warnings;
- imported credits/layers are ignored and attribution is recomputed.

Do not add the workflow to the landing page: it is not part of the landing
tutorial. Do not edit Engineering, Releasing, or plugin contracts because
commands, CI mapping, publication, and plugin workflow do not change.

- [ ] **Step 4: Run focused cross-package checks**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm check:boundaries
```

Expected: all PASS.

- [ ] **Step 5: Run browser and repository-wide gates**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test:e2e
rtk pnpm verify
rtk pnpm build
rtk git diff --check
```

Expected: all PASS. Do not run isolated upstream parity; this feature uses
fixtures and normal workflows must not require the upstream checkout.

- [ ] **Step 6: Reassess and record the CLI documentation matrix**

Record this final matrix under Task 7, changing a decision only if the actual
implementation changed that surface:

```text
help: update
cli-readme: update
root-readme: update
landing: N/A — landing tutorial does not document selection-file interchange
architecture: update
engineering: N/A — commands and CI/verification mapping remain unchanged
releasing: N/A — package installation, versioning, and publication do not change
plugin: N/A — plugin command workflow continues to use canonical selection files
```

- [ ] **Step 7: Commit docs and final plan evidence**

```sh
rtk git add README.md docs/ARCHITECTURE.md packages/web/test/readme-architecture-docs.test.ts docs/superpowers/plans/2026-07-17-character-json-interchange.md
rtk git commit -m "docs: explain character JSON interchange"
rtk git rev-parse HEAD
```

Record the full hash and every PASS command in this plan. If recording the hash
changes the plan after the product/docs commit, commit that final record as
`docs(plan): record character JSON verification`.

## Final Handoff Evidence

The implementation handoff must report:

- the canonical/interchange interfaces and source discriminators;
- every implementation commit and plan-record commit;
- the exact verification commands and PASS results;
- the final CLI documentation matrix;
- confirmation that `upstream/` was not initialized or modified;
- confirmation that read-only upstream inputs remained unchanged and mutation
  normalization was atomic;
- confirmation that attribution still comes from the active asset source.
