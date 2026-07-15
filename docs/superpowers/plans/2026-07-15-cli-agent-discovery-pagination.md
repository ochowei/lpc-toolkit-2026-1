# CLI Agent Discovery Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, deterministic two-stage catalog discovery for shell agents while keeping character selection, rendering, attribution, and release workflows unchanged.

**Architecture:** Add one pure CLI discovery module that projects normalized item summaries, validates and applies `limit`/`offset` pagination, sorts deterministically, and ranks bounded suggestions. Existing catalog and character command layers continue to own orchestration and character compatibility, while response formatting, plugin references, and documentation consume the shared result contract.

**Tech Stack:** TypeScript 5 in strict mode, Node.js 22, `@lpc-toolkit/core`, Vitest, Node built-in tests for the Codex plugin, pnpm 9, Markdown and JSON contracts.

## Global Constraints

- Use package version `0.1.4-beta-1` as an untagged, unpublished development marker.
- Do not create or push `v0.1.4-beta-1`, publish npm, or modify `.github/workflows/**`.
- Add no dependency. Stop and ask before proposing one, and state its license.
- Prefix every terminal command with `rtk`; use pnpm for repository development.
- Keep `packages/core/` environment-agnostic. Pagination and agent response contracts remain in `packages/cli/`.
- Preserve existing selection, mutation, preview, render, token, preset, metadata, TXT/CSV credits, effective-license, and attribution behavior.
- Preserve the JSON envelope `{ ok, command, data, warnings, errors }` and existing character-search fields.
- Default discovery page size is exactly `20`; `--limit` accepts integers `1` through `100`; `--offset` accepts non-negative integers.
- `--all` is mutually exclusive with explicitly supplied `--limit` or `--offset`. For `--all`, `page.limit` is `null`, `page.offset` is `0`, `hasMore` is `false`, and `nextOffset` is `null`.
- Sort with locale-independent code-unit comparison by case-folded `typeName`, display `name`, then `itemId`.
- After every completed task, check its plan items, add an implementation note, record the related full commit hash, and record every exact verification command with PASS or FAIL.

---

## File Structure

- Create `packages/cli/src/catalog-discovery.ts`: pure summary projection, pagination validation, deterministic search/sort/page behavior, edit-distance suggestions, and item detail projection.
- Create `packages/cli/test/catalog-discovery.test.ts`: focused unit contract for the new module.
- Modify `packages/cli/src/args.ts`: recognize `--all` as a boolean flag.
- Modify `packages/cli/src/command-spec.ts`: document discovery flags and reuse shared edit distance.
- Modify `packages/cli/src/main.ts`: reject invalid pagination before asset preparation.
- Modify `packages/cli/src/catalog-commands.ts`: use bounded summaries, validate catalog filters, and expose full credits from `catalog item`.
- Modify `packages/cli/src/character-editor.ts`: return paginated compatible summaries while preserving character-specific fields.
- Modify `packages/cli/src/character-commands.ts`: pass parsed pagination to character search.
- Modify `packages/cli/src/response.ts`: format current-page counts, details, suggestions, and next-offset guidance.
- Modify CLI tests under `packages/cli/test/`: lock parser, help, preflight, catalog, character, JSON, and human contracts.
- Modify `plugins/lpc-toolkit/skills/character-authoring/`: use bounded search, item detail, and minimum CLI `0.1.4-beta-1`.
- Modify `plugins/lpc-toolkit/test/check-cli.test.mjs` and `packages/cli/test/plugin-contract.test.ts`: lock plugin compatibility and command inventory.
- Modify `packages/cli/package.json`: set development version `0.1.4-beta-1`.
- Modify `README.md` and `packages/cli/README.md`: document pagination, detail lookup, and local beta development without claiming npm availability.
- Modify `packages/cli/test/package-metadata.test.ts` and `packages/web/test/readme-architecture-docs.test.ts`: lock the documentation and development-version contract.
- Modify this plan after each task to record implementation, verification, and commit evidence.

### Task 1: Build The Pure Discovery Contract

**Files:**
- Create: `packages/cli/src/catalog-discovery.ts`
- Create: `packages/cli/test/catalog-discovery.test.ts`
- Modify: `packages/cli/src/command-spec.ts`

**Interfaces:**
- Consumes: core `ItemDefinition`, `PaletteMetadata`, `BODY_TYPES`, `LICENSE_GROUP_OF`, `LICENSE_GROUP_ORDER`, and existing CLI `FlagValue`/`CliIssue`.
- Produces: `DiscoveryPagination`, `DiscoveryPage`, `DiscoveryItemSummary`, `DiscoveryItemDetail`, `DiscoveryCandidate<T>`, `DiscoveryResult<T>`, `discoveryPaginationIssue(flags)`, `readDiscoveryPagination(flags)`, `toDiscoveryCandidate(item, palettes)`, `toDiscoveryDetail(item, palettes)`, `discoverItems(candidates, options)`, and `editDistance(left, right)`.

- [x] **Step 1: Write failing discovery tests**

Create `packages/cli/test/catalog-discovery.test.ts` with these executable cases:

```ts
import { createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import {
  discoverItems,
  discoveryPaginationIssue,
  readDiscoveryPagination,
  toDiscoveryCandidate,
  toDiscoveryDetail,
} from '../src/catalog-discovery.js';

const palettes = createPaletteCatalog({}).palettes;
const braid: ItemDefinition = {
  name: 'Braid',
  display_name: 'Single Braid',
  type_name: 'hair',
  animations: ['walk'],
  variants: ['plain'],
  credits: [{
    file: 'hair/braid',
    notes: 'Fixture credit.',
    authors: ['Artist'],
    licenses: ['GPL 3.0'],
    urls: ['https://example.test/braid'],
  }],
  layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
};

describe('catalog discovery', () => {
  it('projects bounded summary and complete detail fields', () => {
    const candidate = toDiscoveryCandidate({ ...braid, itemId: 'hair_braid' }, palettes)!;
    expect(candidate.summary).toEqual({
      itemId: 'hair_braid',
      typeName: 'hair',
      name: 'Single Braid',
      supportedBodyTypes: ['male', 'female'],
      variants: ['plain'],
      recolors: [],
      animations: ['walk'],
      licenses: ['GPL'],
      creditCount: 1,
    });
    expect(toDiscoveryDetail({ ...braid, itemId: 'hair_braid' }, palettes)).toEqual({
      ...candidate.summary,
      credits: braid.credits,
    });
  });

  it('matches all identity fields, sorts deterministically, and paginates', () => {
    const candidates = [
      { summary: { ...toDiscoveryCandidate({ ...braid, itemId: 'z-id' }, palettes)!.summary, name: 'beta' }, internalName: 'Needle' },
      { summary: { ...toDiscoveryCandidate({ ...braid, itemId: 'a-id' }, palettes)!.summary, name: 'Alpha' }, internalName: 'Thread' },
    ];
    const page = discoverItems(candidates, {
      pagination: { all: false, limit: 1, offset: 0 },
    });
    expect(page.items.map((item) => item.itemId)).toEqual(['a-id']);
    expect(page.page).toEqual({
      limit: 1,
      offset: 0,
      returned: 1,
      total: 2,
      hasMore: true,
      nextOffset: 1,
    });
    expect(discoverItems(candidates, {
      query: 'needle',
      pagination: { all: false, limit: 20, offset: 0 },
    }).items[0]?.itemId).toBe('z-id');
  });

  it('returns all results explicitly and bounded edit-distance suggestions', () => {
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      summary: {
        ...toDiscoveryCandidate({ ...braid, itemId: `braid-${index}` }, palettes)!.summary,
        itemId: `braid-${index}`,
        name: `Braid ${index}`,
      },
      internalName: `Braid ${index}`,
    }));
    const result = discoverItems(candidates, {
      query: 'braidd',
      pagination: { all: true, limit: 20, offset: 0 },
    });
    expect(result.items).toEqual([]);
    expect(result.suggestions).toHaveLength(5);
    expect(result.page).toEqual({
      limit: null,
      offset: 0,
      returned: 0,
      total: 0,
      hasMore: false,
      nextOffset: null,
    });
  });

  it('validates pagination flags and reads defaults', () => {
    expect(readDiscoveryPagination(parseArgs(['catalog', 'items']).flags)).toEqual({
      all: false,
      limit: 20,
      offset: 0,
    });
    expect(discoveryPaginationIssue(parseArgs([
      'catalog', 'items', '--all', '--limit', '10',
    ]).flags)).toMatchObject({ code: 'invalid_option', path: '--all' });
    expect(discoveryPaginationIssue(parseArgs([
      'catalog', 'items', '--limit', '101',
    ]).flags)).toMatchObject({ code: 'invalid_option', path: '--limit' });
    expect(discoveryPaginationIssue(parseArgs([
      'catalog', 'items', '--offset', '-1',
    ]).flags)).toMatchObject({ code: 'invalid_option', path: '--offset' });
  });
});
```

- [x] **Step 2: Run the tests to verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts
```

Expected: FAIL with module resolution for `../src/catalog-discovery.js` because the module does not exist.

- [x] **Step 3: Implement the discovery module**

Create `packages/cli/src/catalog-discovery.ts` with these exact public shapes and behaviors:

```ts
import {
  BODY_TYPES,
  LICENSE_GROUP_OF,
  LICENSE_GROUP_ORDER,
  getRecolorVariants,
  type AnimationName,
  type BodyType,
  type CreditEntry,
  type ItemDefinition,
  type ItemId,
  type LicenseGroup,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { flagBoolean, flagString, type FlagValue } from './args.js';
import type { CliIssue } from './response.js';

export const DEFAULT_DISCOVERY_LIMIT = 20;
export const MAX_DISCOVERY_LIMIT = 100;

export interface DiscoveryPagination {
  readonly all: boolean;
  readonly limit: number;
  readonly offset: number;
}

export interface DiscoveryPage {
  readonly limit: number | null;
  readonly offset: number;
  readonly returned: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextOffset: number | null;
}

export interface DiscoveryItemSummary {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
  readonly supportedBodyTypes: readonly BodyType[];
  readonly variants: readonly string[];
  readonly recolors: readonly string[];
  readonly animations: readonly AnimationName[];
  readonly licenses: readonly LicenseGroup[];
  readonly creditCount: number;
}

export interface DiscoveryItemDetail extends DiscoveryItemSummary {
  readonly credits: readonly CreditEntry[];
}

export interface DiscoveryCandidate<T extends DiscoveryItemSummary> {
  readonly summary: T;
  readonly internalName: string;
}

export interface DiscoverySuggestion {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
}

export interface DiscoveryResult<T extends DiscoveryItemSummary> {
  readonly items: readonly T[];
  readonly page: DiscoveryPage;
  readonly suggestions?: readonly DiscoverySuggestion[];
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function editDistance(leftInput: string, rightInput: string): number {
  const left = normalized(leftInput);
  const right = normalized(rightInput);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function supportedBodyTypes(item: ItemDefinition): readonly BodyType[] {
  return BODY_TYPES.filter((bodyType) => {
    for (let layerNumber = 1; layerNumber < 10; layerNumber++) {
      const layer = item[`layer_${layerNumber}`];
      if (!layer) break;
      if (typeof layer[bodyType] === 'string') return true;
    }
    return false;
  });
}

function licenseGroups(item: ItemDefinition): readonly LicenseGroup[] {
  const present = new Set<LicenseGroup>();
  for (const credit of item.credits) {
    for (const license of credit.licenses) present.add(LICENSE_GROUP_OF[license]);
  }
  return LICENSE_GROUP_ORDER.filter((group) => present.has(group));
}

export function toDiscoveryCandidate(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): DiscoveryCandidate<DiscoveryItemSummary> | undefined {
  if (!item.itemId) return undefined;
  return {
    internalName: item.name,
    summary: {
      itemId: item.itemId,
      typeName: item.type_name,
      name: item.display_name ?? item.name,
      supportedBodyTypes: supportedBodyTypes(item),
      variants: item.variants ?? [],
      recolors: getRecolorVariants(item, palettes),
      animations: item.animations,
      licenses: licenseGroups(item),
      creditCount: item.credits.length,
    },
  };
}

export function toDiscoveryDetail(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): DiscoveryItemDetail | undefined {
  const candidate = toDiscoveryCandidate(item, palettes);
  return candidate ? { ...candidate.summary, credits: item.credits } : undefined;
}

function integerIssue(
  flags: ReadonlyMap<string, FlagValue>,
  name: 'limit' | 'offset',
): CliIssue | undefined {
  if (!flags.has(name)) return undefined;
  const value = flagString(flags, name);
  const valid = name === 'limit'
    ? value !== undefined && /^[1-9]\d*$/u.test(value) && Number(value) <= MAX_DISCOVERY_LIMIT
    : value !== undefined && /^(?:0|[1-9]\d*)$/u.test(value);
  return valid ? undefined : {
    code: 'invalid_option',
    message: name === 'limit'
      ? `--limit must be an integer from 1 to ${MAX_DISCOVERY_LIMIT}.`
      : '--offset must be a non-negative integer.',
    path: `--${name}`,
  };
}

export function discoveryPaginationIssue(
  flags: ReadonlyMap<string, FlagValue>,
): CliIssue | undefined {
  if (flagBoolean(flags, 'all') && (flags.has('limit') || flags.has('offset'))) {
    return {
      code: 'invalid_option',
      message: '--all cannot be combined with --limit or --offset.',
      path: '--all',
    };
  }
  return integerIssue(flags, 'limit') ?? integerIssue(flags, 'offset');
}

export function readDiscoveryPagination(
  flags: ReadonlyMap<string, FlagValue>,
): DiscoveryPagination {
  return {
    all: flagBoolean(flags, 'all'),
    limit: Number(flagString(flags, 'limit') ?? DEFAULT_DISCOVERY_LIMIT),
    offset: Number(flagString(flags, 'offset') ?? 0),
  };
}

function candidateSort<T extends DiscoveryItemSummary>(
  left: DiscoveryCandidate<T>,
  right: DiscoveryCandidate<T>,
): number {
  return compareText(normalized(left.summary.typeName), normalized(right.summary.typeName))
    || compareText(normalized(left.summary.name), normalized(right.summary.name))
    || compareText(normalized(left.summary.itemId), normalized(right.summary.itemId));
}

function suggestionDistance<T extends DiscoveryItemSummary>(
  query: string,
  candidate: DiscoveryCandidate<T>,
): number {
  return Math.min(
    editDistance(query, candidate.summary.itemId),
    editDistance(query, candidate.internalName),
    editDistance(query, candidate.summary.name),
  );
}

export function discoverItems<T extends DiscoveryItemSummary>(
  candidates: readonly DiscoveryCandidate<T>[],
  options: { readonly query?: string; readonly pagination: DiscoveryPagination },
): DiscoveryResult<T> {
  const query = normalized(options.query ?? '');
  const sorted = [...candidates].sort(candidateSort);
  const matches = query
    ? sorted.filter((candidate) => [
        candidate.summary.itemId,
        candidate.internalName,
        candidate.summary.name,
      ].some((value) => normalized(value).includes(query)))
    : sorted;
  const offset = options.pagination.all ? 0 : options.pagination.offset;
  const selected = options.pagination.all
    ? matches
    : matches.slice(offset, offset + options.pagination.limit);
  const hasMore = !options.pagination.all && offset + selected.length < matches.length;
  const suggestions = query && matches.length === 0
    ? sorted
        .map((candidate) => ({ candidate, distance: suggestionDistance(query, candidate) }))
        .sort((left, right) => left.distance - right.distance || candidateSort(left.candidate, right.candidate))
        .slice(0, 5)
        .map(({ candidate }) => ({
          itemId: candidate.summary.itemId,
          typeName: candidate.summary.typeName,
          name: candidate.summary.name,
        }))
    : [];
  return {
    items: selected.map((candidate) => candidate.summary),
    page: {
      limit: options.pagination.all ? null : options.pagination.limit,
      offset,
      returned: selected.length,
      total: matches.length,
      hasMore,
      nextOffset: hasMore ? offset + selected.length : null,
    },
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}
```

Move the existing private `editDistance` implementation out of `command-spec.ts`, import it from `./catalog-discovery.js`, and leave `suggestOption` semantics unchanged.

- [x] **Step 4: Run focused tests and typecheck to verify GREEN**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts command-spec.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS for both test files and CLI strict typecheck.

- [x] **Step 5: Commit Task 1 and record evidence**

```sh
rtk git add packages/cli/src/catalog-discovery.ts packages/cli/src/command-spec.ts packages/cli/test/catalog-discovery.test.ts
rtk git commit -m "feat(cli): add pure catalog discovery contract"
rtk git rev-parse HEAD
```

Copy the full hash into this task as `Commit:`, add a one-sentence implementation note, record the exact RED/GREEN commands and results, check every Task 1 box, then commit the plan record:

```sh
rtk git add docs/superpowers/plans/2026-07-15-cli-agent-discovery-pagination.md
rtk git commit -m "docs(plan): record CLI discovery Task 1"
```

- Implementation: Added the pure discovery projection, search, deterministic sort,
  pagination, bounded suggestion, and validation contract, and reused its raw edit
  distance in command option suggestions while normalizing only discovery inputs.
- Commit: 03e21f0662e371775cb3ef251586ee0c9f8a1200
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts`
  FAIL (expected RED: `../src/catalog-discovery.js` did not exist).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts command-spec.test.ts`
  PASS (2 files, 20 tests).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Review fix: Restored the pre-existing case-sensitive command option suggestion
  threshold and kept case-folding/trim behavior at the discovery caller boundary.
- Fix commit: da330e9e30a6b3511666fe17dd6718200613bd80
- Review RED: `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts`
  FAIL as expected (1 failed, 16 passed: `--HELP` incorrectly suggested `--help`).
- Review GREEN: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts command-spec.test.ts`
  PASS (2 files, 21 tests).
- Review verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

### Task 2: Add Discovery Options And Preflight Validation

**Files:**
- Modify: `packages/cli/src/args.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/test/args.test.ts`
- Modify: `packages/cli/test/command-spec.test.ts`
- Modify: `packages/cli/test/main-assets.test.ts`

**Interfaces:**
- Consumes: Task 1 `discoveryPaginationIssue(flags)`.
- Produces: parsed boolean `--all`; documented `--limit`, `--offset`, and `--all` on both search commands; pre-asset structured pagination rejection.

- [x] **Step 1: Write failing parser, help, and preflight tests**

Add these assertions:

```ts
// packages/cli/test/args.test.ts
expect(parseArgs(['catalog', 'items', '--all']).flags)
  .toEqual(new Map([['all', true]]));

// packages/cli/test/command-spec.test.ts
for (const command of [['catalog', 'items'], ['character', 'search']]) {
  const help = helpForCommand(command);
  expect(help).toContain('--limit <count>');
  expect(help).toContain('Default: 20');
  expect(help).toContain('--offset <count>');
  expect(help).toContain('--all');
}

// packages/cli/test/main-assets.test.ts
it.each([
  ['catalog', 'items', '--limit', '0'],
  ['catalog', 'items', '--limit', '101'],
  ['catalog', 'items', '--offset', '-1'],
  ['catalog', 'items', '--all', '--limit', '10'],
  ['character', 'search', 'hero', '--type', 'hair', '--all', '--offset', '1'],
])('rejects invalid discovery pagination before assets: %j', async (...argv) => {
  const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
  const capture = captureIo(runtime.context.repoRoot);
  expect(await runCli([...argv, '--json'], capture.io, {
    prepareRuntimeAssets: prepare,
  })).toBe(1);
  expect(prepare).not.toHaveBeenCalled();
  expect(JSON.parse(capture.stdout.join('')).errors[0]).toMatchObject({
    code: 'invalid_option',
  });
});
```

- [x] **Step 2: Run focused tests to verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-assets.test.ts
```

Expected: FAIL because `--all` is parsed as a value option, discovery flags are unknown, and preflight does not validate their ranges or conflicts.

- [x] **Step 3: Implement parser, command spec, and preflight**

In `args.ts`, add `all` to `BOOLEAN_FLAGS`:

```ts
const BOOLEAN_FLAGS = new Set(['all', 'allow-partial', 'help', 'json', 'no-open']);
```

In `command-spec.ts`, define and reuse:

```ts
const DISCOVERY_OPTIONS: readonly CommandOptionSpec[] = [
  { name: 'limit', kind: 'value', valueLabel: 'count', description: 'Return 1-100 items. Default: 20.' },
  { name: 'offset', kind: 'value', valueLabel: 'count', description: 'Skip matching items. Default: 0.' },
  { name: 'all', kind: 'boolean', description: 'Return all matching items.' },
];
```

Append `...DISCOVERY_OPTIONS` to the option arrays for `catalog items` and `character search`.

In `main.ts`, import `discoveryPaginationIssue` and add this block near the start of `preflightAssetCommand`:

```ts
if (
  (command === 'catalog' && subcommand === 'items')
  || (command === 'character' && subcommand === 'search')
) {
  const issue = discoveryPaginationIssue(parsed.flags);
  if (issue) return commandError(parsed.command.join(' '), issue);
}
```

- [x] **Step 4: Run focused tests and typecheck to verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-assets.test.ts catalog-discovery.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS; every invalid pagination invocation avoids `prepareRuntimeAssets`.

- [x] **Step 5: Commit Task 2 and record evidence**

```sh
rtk git add packages/cli/src/args.ts packages/cli/src/command-spec.ts packages/cli/src/main.ts packages/cli/test/args.test.ts packages/cli/test/command-spec.test.ts packages/cli/test/main-assets.test.ts
rtk git commit -m "feat(cli): validate bounded discovery options"
rtk git rev-parse HEAD
```

Record the full hash, implementation note, and exact RED/GREEN results in this task, check the boxes, and commit the plan record as `docs(plan): record CLI discovery Task 2`.

- Implementation: Added boolean `--all` parsing, shared bounded discovery help
  options for both search commands, and structured pagination preflight validation
  before runtime asset preparation.
- Commit: 9c9550c80e0f897fa25d6c63d4c5b388d6b201b6
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-assets.test.ts`
  FAIL (expected RED: 2 files failed, 1 passed; 6 tests failed and 73 passed
  because discovery help was absent and invalid pagination returned
  `unknown_option` instead of `invalid_option`).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts command-spec.test.ts main-assets.test.ts catalog-discovery.test.ts`
  PASS (4 files, 83 tests).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

### Task 3: Integrate Bounded Catalog Search And Item Credits

**Files:**
- Modify: `packages/cli/src/catalog-commands.ts`
- Modify: `packages/cli/test/catalog-commands.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`

**Interfaces:**
- Consumes: Task 1 discovery projection/detail/search/page APIs and Task 2 parsed flags.
- Produces: bounded `catalog items` JSON; full `catalog item.data.item.credits`; stable catalog filter errors with bounded suggestions/available values.

- [x] **Step 1: Write failing catalog contract tests**

Extend fixtures so at least 22 catalog items exist, then assert:

```ts
it('defaults broad discovery to twenty items', () => {
  const largeCatalog = createCatalog(Object.fromEntries(
    Array.from({ length: 22 }, (_, index) => [
      `hair/item-${index}.json`,
      { ...hair, name: `Hair ${index}` },
    ]),
  )).catalog;
  const result = listCatalogItems(largeCatalog, {
    pagination: { all: false, limit: 20, offset: 0 },
    palettes,
  });
  expect(result.items).toHaveLength(20);
  expect(result.page).toMatchObject({ total: 22, nextOffset: 20 });
});

it('returns a bounded first page and a non-overlapping second page', () => {
  const first = listCatalogItems(catalog, {
    pagination: { all: false, limit: 1, offset: 0 },
    palettes,
  });
  const second = listCatalogItems(catalog, {
    pagination: { all: false, limit: 1, offset: 1 },
    palettes,
  });
  expect(first.items).toHaveLength(1);
  expect(first.page.nextOffset).toBe(1);
  expect(second.items[0]?.itemId).not.toBe(first.items[0]?.itemId);
  expect(second.page.total).toBe(first.page.total);
});

it('returns summary licenses and complete item credits', () => {
  const summary = listCatalogItems(catalog, {
    typeName: 'hair',
    pagination: { all: false, limit: 20, offset: 0 },
    palettes,
  }).items[0];
  expect(summary).toMatchObject({
    supportedBodyTypes: ['male'],
    licenses: ['GPL'],
    creditCount: 1,
  });
  expect(getCatalogItem(catalog, 'braids', palettes)?.credits).toEqual(hair.credits);
});

it.each([
  ['type', 'haair', 'unknown_type_name'],
  ['body-type', 'centaur', 'body_type_invalid'],
  ['animation', 'wolk', 'unknown_animation'],
  ['license', 'GQP', 'unknown_license'],
])('returns bounded filter guidance for unknown --%s', (flag, value, code) => {
  const response = runCatalogCommand(
    parseArgs(['catalog', 'items', `--${flag}`, value, '--json']),
    runtime,
  );
  expect(response.errors[0]).toMatchObject({ code });
  expect(response.errors[0]?.details?.suggestions?.length ?? 0).toBeLessThanOrEqual(5);
  expect(response.errors[0]?.details?.available?.length ?? 0).toBeLessThanOrEqual(10);
});
```

Add one `main-json.test.ts` integration assertion that `catalog items --limit 1 --json` preserves the standard envelope and returns `data.page.limit === 1`.

- [x] **Step 2: Run focused tests to verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts main-json.test.ts
```

Expected: FAIL because catalog results are unpaged summaries without license/body/credit/page fields and unknown filter domains return empty success.

- [x] **Step 3: Replace catalog projection and filtering**

In `catalog-commands.ts`:

- Replace `CatalogItemSummary` with imported `DiscoveryItemSummary` and `DiscoveryItemDetail`.
- Extend `CatalogItemsOptions` with required `pagination: DiscoveryPagination`.
- Preserve raw-license prefix matching before projection.
- Build non-text-filtered `DiscoveryCandidate` values through `toDiscoveryCandidate`.
- Return `discoverItems(candidates, { query: options.search, pagination: options.pagination })`.
- Resolve detail through `toDiscoveryDetail` so exact normalized `CreditEntry[]` values are returned.

Use these exact list and detail shapes:

```ts
export interface CatalogItemsOptions {
  readonly typeName?: TypeName;
  readonly search?: string;
  readonly bodyType?: BodyType;
  readonly animation?: AnimationName;
  readonly license?: string;
  readonly palettes: PaletteMetadata;
  readonly pagination: DiscoveryPagination;
}

export function listCatalogItems(
  catalog: Catalog,
  options: CatalogItemsOptions,
): DiscoveryResult<DiscoveryItemSummary> {
  const definitions = options.typeName
    ? catalog.byTypeName.get(options.typeName) ?? []
    : [...catalog.byItemId.values()];
  const candidates = definitions.flatMap((item) => {
    const candidate = toDiscoveryCandidate(item, options.palettes);
    if (!candidate) return [];
    if (options.bodyType && !candidate.summary.supportedBodyTypes.includes(options.bodyType)) return [];
    if (options.animation && !candidate.summary.animations.includes(options.animation)) return [];
    if (options.license && !itemMatchesLicense(item, options.license)) return [];
    return [candidate];
  });
  return discoverItems(candidates, {
    ...(options.search === undefined ? {} : { query: options.search }),
    pagination: options.pagination,
  });
}

export function getCatalogItem(
  catalog: Catalog,
  itemIdOrTypeName: string,
  palettes: PaletteMetadata,
): DiscoveryItemDetail | undefined {
  const byItemId = catalog.byItemId.get(itemIdOrTypeName);
  if (byItemId) return toDiscoveryDetail(byItemId, palettes);
  const slash = itemIdOrTypeName.indexOf('/');
  if (slash < 0) return undefined;
  const typeName = itemIdOrTypeName.slice(0, slash);
  const nameOrItemId = itemIdOrTypeName.slice(slash + 1);
  const item = catalog.byTypeName.get(typeName)?.find(
    (candidate) => candidate.itemId === nameOrItemId || candidate.name === nameOrItemId,
  );
  return item ? toDiscoveryDetail(item, palettes) : undefined;
}
```

Add a focused filter validator with stable codes:

```ts
function domainIssue(
  code: string,
  domainName: string,
  value: string,
  candidates: readonly string[],
): CliIssue {
  const available = [...new Set(candidates)]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .slice(0, 10);
  const suggestions = [...new Set(candidates)]
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .sort((left, right) => left.distance - right.distance
      || (left.candidate < right.candidate ? -1 : left.candidate > right.candidate ? 1 : 0))
    .slice(0, 5)
    .map(({ candidate }) => candidate);
  return {
    code,
    message: `Unknown ${domainName}: ${value}`,
    path: value,
    details: { suggestions, available },
  };
}

function filterIssue(
  catalog: Catalog,
  options: Omit<CatalogItemsOptions, 'pagination' | 'palettes'>,
): CliIssue | undefined {
  const available = <T extends string>(values: readonly T[]) => [...new Set(values)].sort().slice(0, 10);
  if (options.typeName && !catalog.byTypeName.has(options.typeName)) {
    return domainIssue('unknown_type_name', 'type name', options.typeName, catalog.typeNames);
  }
  if (options.bodyType && !BODY_TYPES.includes(options.bodyType as (typeof BODY_TYPES)[number])) {
    return domainIssue('body_type_invalid', 'body type', options.bodyType, BODY_TYPES);
  }
  const items = [...catalog.byItemId.values()];
  const animations = available(items.flatMap((item) => item.animations));
  if (options.animation && !animations.includes(options.animation)) {
    return domainIssue('unknown_animation', 'animation', options.animation, animations);
  }
  const licenses = available(items.flatMap((item) => item.credits.flatMap((credit) => credit.licenses)));
  if (options.license && !items.some((item) => itemMatchesLicense(item, options.license!))) {
    return domainIssue('unknown_license', 'license', options.license, licenses);
  }
  return undefined;
}
```

In `runCatalogCommand`, call `readDiscoveryPagination(parsed.flags)`, return `commandError('catalog items', issue, warnings)` for a filter issue, and pass palettes to both list and detail projection.

- [x] **Step 4: Run focused tests and typecheck to verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts catalog-commands.test.ts main-json.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS with bounded pages, exact credits, and structured filter recovery.

- [x] **Step 5: Commit Task 3 and record evidence**

```sh
rtk git add packages/cli/src/catalog-commands.ts packages/cli/test/catalog-commands.test.ts packages/cli/test/main-json.test.ts
rtk git commit -m "feat(cli): paginate catalog discovery"
rtk git rev-parse HEAD
```

Record the full hash, implementation note, and exact RED/GREEN results in this task, check the boxes, and commit the plan record as `docs(plan): record CLI discovery Task 3`.

- Implementation: Replaced the CLI-local catalog summary path with the shared
  discovery candidate, summary, detail, search, and pagination APIs; retained
  defensive raw animation/license filtering so GPL-family prefix matching and
  malformed-loadable records preserve their prior behavior; returned complete
  normalized item credits; and added bounded stable recovery details for invalid
  type, body-type, animation, and license filters.
- Commit: e7fde3204172c36412e1bbe2f81a3055b8b05156
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts main-json.test.ts`
  FAIL (expected RED for catalog behavior: 2 files failed, 9 tests failed and 5
  passed; all 8 catalog contract failures showed missing bounded pages, discovery
  summary/detail fields, and filter errors. The first main integration fixture
  also exposed an unrelated test-harness asset preparation error, corrected
  before implementation).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- main-json.test.ts`
  FAIL (expected corrected RED: 1 test failed and 1 passed because the successful
  standard envelope returned `data.items` without `data.page.limit`).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts catalog-commands.test.ts main-json.test.ts`
  PASS (3 files, 18 tests).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Review fix: Validated animation and license filters against their complete
  domains before bounding error guidance; normalized absent/malformed animation
  arrays to `[]` only in discovery summaries; and excluded missing/malformed
  credit records from catalog discovery with `catalog_warning` guidance. The
  shared loader catalog remains unchanged so core animation fallbacks and
  character/render selection semantics are preserved.
- Review fix commit: c0867fd44471ec92333d0d6e83d5e4a75b9779e2
- Review verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts`
  FAIL (expected RED: 1 file, 3 tests failed and 11 passed; broad malformed
  discovery threw, a valid eleventh animation returned `unknown_animation`, and
  animation/license recovery omitted closest values outside the first ten).
- Review verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts catalog-commands.test.ts main-json.test.ts loaders.test.ts`
  PASS (4 files, 25 tests).
- Review verification: `rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts character-commands.test.ts main-render-errors.test.ts preview.test.ts render.test.ts`
  PASS (5 files, 61 tests), confirming render/selection behavior is unchanged.
- Review verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS (32 files,
  334 passed and 1 skipped; loopback-enabled sandbox escalation used for Web
  server tests).
- Review verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Re-review fix: Kept active raw credit licenses structurally valid even when
  they are outside the closed core license map; preserved exact raw credits in
  item detail; projected known exact families as before, classified explicit
  raw `GPL` prefixes as GPL, and omitted unmapped families such as `OGA-SA`
  rather than inventing a summary group.
- Re-review fix commit: 33bcca0b9346eb15c5b0c0e3c31bbf372d55c4fe
- Re-review verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts -t "active GPL|unmapped active"`
  FAIL (expected RED: 1 file, 2 tests failed and 14 skipped; active Large Curls
  discovery returned no items and active Scarf detail returned `unknown_item`).
- Re-review verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts catalog-commands.test.ts main-json.test.ts loaders.test.ts`
  PASS (4 files, 27 tests).
- Re-review verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS (32
  files, 336 passed and 1 skipped; loopback-enabled sandbox escalation used for
  Web server tests).
- Re-review verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

### Task 4: Paginate Character Search And Human Output

**Files:**
- Modify: `packages/cli/src/character-editor.ts`
- Modify: `packages/cli/src/character-commands.ts`
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/test/character-editor.test.ts`
- Modify: `packages/cli/test/character-commands.test.ts`
- Modify: `packages/cli/test/response.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

**Interfaces:**
- Consumes: Task 1 `DiscoveryPagination`, summary projection, and `discoverItems`.
- Produces: `CharacterSearchInput.pagination`; paged `CharacterSearchResult` with preserved `count`, `licenses`, and `replacesCurrent`; `compatibleBodyType`; human next-offset and suggestion formatting.

- [x] **Step 1: Write failing character and human-output tests**

Add assertions equivalent to:

```ts
const first = searchCharacterItems(
  maleSelections,
  { typeName: 'hair', query: 'braid', pagination: { all: false, limit: 1, offset: 0 } },
  context,
);
expect(first.items).toHaveLength(1);
expect(first.items[0]).toMatchObject({
  licenses: ['GPL'],
  replacesCurrent: false,
  compatibleBodyType: 'male',
  supportedBodyTypes: ['male'],
});
expect(first.count).toBe(2);
expect(first.page).toMatchObject({ total: 2, nextOffset: 1 });

const all = searchCharacterItems(
  maleSelections,
  { typeName: 'hair', pagination: { all: true, limit: 20, offset: 0 } },
  context,
);
expect(all.items).toHaveLength(all.count);
expect(all.page.limit).toBeNull();
```

Add a `character-commands.test.ts` JSON assertion for `character search hero --type hair --limit 1 --json`, and add an unknown type assertion expecting `unknown_type_name` with bounded suggestions.

In `main-human.test.ts`, add enough hair fixtures to produce another page and assert:

```ts
expect(await runHuman([
  'catalog', 'items', '--type', 'hair', '--limit', '1',
], cwd)).toContain('More results available; rerun with --offset 1.');
```

In `response.test.ts`, create a paged command response and assert the header reports current-page versus total counts and no next-offset line appears when `hasMore` is false.

- [x] **Step 2: Run focused tests to verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts character-commands.test.ts response.test.ts main-human.test.ts
```

Expected: FAIL because character search has no pagination input/page/compatible-body field and human formatting ignores page metadata.

- [x] **Step 3: Implement character pagination**

In `character-editor.ts`, replace duplicate summary projection with Task 1 helpers and define:

```ts
export interface CharacterSearchInput {
  readonly typeName: TypeName;
  readonly query?: string;
  readonly pagination: DiscoveryPagination;
}

export interface CharacterSearchItem extends DiscoveryItemSummary {
  readonly replacesCurrent: boolean;
  readonly compatibleBodyType: BodyType;
}

export interface CharacterSearchResult extends DiscoveryResult<CharacterSearchItem> {
  readonly count: number;
}
```

Import `DiscoveryItemSummary`, `DiscoveryPagination`, `DiscoveryResult`,
`discoverItems`, `editDistance`, and `toDiscoveryCandidate` from
`catalog-discovery.ts` rather than retaining duplicate projection or distance
logic.

Before searching, reject an absent catalog type with this exact structure:

```ts
const typeItems = context.catalog.byTypeName.get(input.typeName);
if (!typeItems) {
  const ranked = context.catalog.typeNames
    .map((typeName) => ({ typeName, distance: editDistance(input.typeName, typeName) }))
    .sort((left, right) => left.distance - right.distance
      || (left.typeName < right.typeName ? -1 : left.typeName > right.typeName ? 1 : 0));
  throw new CharacterEditError(
    'unknown_type_name',
    `Unknown type name: ${input.typeName}`,
    {
      path: input.typeName,
      details: {
        suggestions: ranked.slice(0, 5).map(({ typeName }) => typeName),
        available: [...context.catalog.typeNames]
          .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
          .slice(0, 10),
      },
    },
  );
}
```

Map the resolved definitions and return the result with:

```ts
const candidates: DiscoveryCandidate<CharacterSearchItem>[] = typeItems.flatMap((item) => {
  const candidate = toDiscoveryCandidate(item, context.palettes);
  if (!candidate || !candidate.summary.supportedBodyTypes.includes(selections.bodyType)) {
    return [];
  }
  return [{
    internalName: candidate.internalName,
    summary: {
      ...candidate.summary,
      replacesCurrent: selections.items[input.typeName] !== undefined,
      compatibleBodyType: selections.bodyType,
    },
  }];
});
const result = discoverItems(candidates, {
  ...(input.query === undefined ? {} : { query: input.query }),
  pagination: input.pagination,
});
return { ...result, count: result.page.total };
```

In `character-commands.ts`, pass:

```ts
pagination: readDiscoveryPagination(parsed.flags),
```

to `searchCharacterItems`.

- [x] **Step 4: Implement page-aware human formatting**

In `response.ts`, add:

```ts
function formatDiscoverySuffix(data: JsonRecord): string {
  const page = data['page'];
  if (!isRecord(page)) return '';
  const hasMore = page['hasMore'];
  const nextOffset = page['nextOffset'];
  if (hasMore !== true || typeof nextOffset !== 'number') return '';
  return `More results available; rerun with --offset ${nextOffset}.\n`;
}

function formatDiscoveryCount(
  label: string,
  data: JsonRecord,
  fallbackReturned: number,
): string {
  const page = data['page'];
  if (!isRecord(page)) return `${label} (${fallbackReturned})`;
  const returned = numberValue(page, 'returned');
  const total = numberValue(page, 'total');
  return typeof returned === 'number' && typeof total === 'number'
    ? `${label} (${returned} of ${total})`
    : `${label} (${fallbackReturned})`;
}

function formatDiscoverySuggestions(data: JsonRecord): string {
  const suggestions = recordArrayValue(data, 'suggestions');
  if (!suggestions || suggestions.length === 0) return '';
  const lines = suggestions.flatMap((suggestion) => {
    const itemId = stringValue(suggestion, 'itemId');
    const typeName = stringValue(suggestion, 'typeName');
    const name = stringValue(suggestion, 'name');
    return itemId && typeName && name ? [`- ${typeName}/${name} [${itemId}]`] : [];
  });
  return lines.length > 0 ? `Suggestions:\n${lines.join('\n')}\n` : '';
}
```

Update catalog and character search headers through `formatDiscoveryCount`, then append `formatDiscoverySuggestions(data)` and `formatDiscoverySuffix(data)`. Extend `formatCatalogItemDetails` with:

```ts
`${indent}supported body types: ${formatCsv(stringArrayValue(item, 'supportedBodyTypes'))}`,
`${indent}licenses: ${formatCsv(stringArrayValue(item, 'licenses'))}`,
`${indent}credit count: ${numberValue(item, 'creditCount') ?? 0}`,
```

This keeps an empty search successful while exposing bounded suggestions.

- [x] **Step 5: Run focused tests and typecheck to verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts character-commands.test.ts response.test.ts main-human.test.ts catalog-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS with preserved character fields, bounded pages, and actionable human output.

- [x] **Step 6: Commit Task 4 and record evidence**

```sh
rtk git add packages/cli/src/character-editor.ts packages/cli/src/character-commands.ts packages/cli/src/response.ts packages/cli/test/character-editor.test.ts packages/cli/test/character-commands.test.ts packages/cli/test/response.test.ts packages/cli/test/main-human.test.ts
rtk git commit -m "feat(cli): paginate character discovery"
rtk git rev-parse HEAD
```

Record the full hash, implementation note, and exact RED/GREEN results in this task, check the boxes, and commit the plan record as `docs(plan): record CLI discovery Task 4`.

- Implementation: Routed character search through the shared discovery
  projection and paginator; preserved total `count`, grouped licenses, and
  `replacesCurrent`; added `compatibleBodyType`, shared summary fields, and
  bounded unknown-type recovery; and made catalog/character human output report
  returned-of-total counts, next offsets, successful empty-search suggestions,
  supported body types, license groups, and credit counts.
- Commit: 1a02dff9dc2d4f0d192b0bd0685ebd540f2522ff
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts character-commands.test.ts response.test.ts main-human.test.ts`
  FAIL (expected RED: 4 files failed, 7 tests failed and 47 passed; failures
  showed missing character pagination/body summary and unknown-type errors plus
  human formatting that ignored page counts, suggestions, and next offsets).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts character-commands.test.ts response.test.ts main-human.test.ts catalog-commands.test.ts`
  PASS (5 files, 70 tests).
- Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

### Task 5: Align Plugin, Documentation, And Development Version

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `packages/cli/test/package-metadata.test.ts`
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/scripts/check-cli.mjs`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/references/cli-contract.json`
- Modify: `plugins/lpc-toolkit/test/check-cli.test.mjs`
- Modify: `packages/cli/test/plugin-contract.test.ts`

**Interfaces:**
- Consumes: completed CLI flags and JSON fields from Tasks 1 through 4.
- Produces: package version `0.1.4-beta-1`; plugin range `>=0.1.4-beta-1 <0.2.0`; bounded search/detail workflow; documentation that describes local beta installation without claiming npm publication.

- [x] **Step 1: Write failing version, plugin, and documentation assertions**

Update tests first:

```ts
// packages/cli/test/package-metadata.test.ts
expect(readCliPackageJson().version).toBe('0.1.4-beta-1');
for (const forbidden of [
  'npm install -g @lpc-toolkit/cli@0.1.4-beta-1',
  "npm install -g '@lpc-toolkit/cli@>=0.1.4-beta-1 <0.2.0'",
]) expect(readCliReadme()).not.toContain(forbidden);
expect(readCliReadme()).toContain('lpc-toolkit-cli-0.1.4-beta-1.tgz');
expect(readCliReadme()).toContain('--limit 20');
expect(readCliReadme()).toContain('--offset 20');
expect(readCliReadme()).toContain('--all');

// packages/cli/test/plugin-contract.test.ts
expect(contract.commands.map(({ id }) => id)).toContain('catalog-item');
expect(contract.commands.find(({ id }) => id === 'character-search')?.argv)
  .toContain('20');
```

In `plugins/lpc-toolkit/test/check-cli.test.mjs`, change the exact minimum to `0.1.4-beta-1`, accept that version and `0.1.4`, and reject `0.1.3` plus unrelated prereleases. In `packages/web/test/readme-architecture-docs.test.ts`, replace the public beta npm-range assertion with local tarball guidance and an explicit `not published to npm` phrase in both READMEs.

- [x] **Step 2: Run contract tests to verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts plugin-contract.test.ts
rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL on the old package version, old plugin range, absent catalog-detail command, unbounded workflow, and old npm installation copy.

- [x] **Step 3: Update the plugin contract and compatibility check**

Set:

```js
export const SUPPORTED_CLI = Object.freeze({
  min: '0.1.4-beta-1',
  maxExclusive: '0.2.0',
});
```

Update `compatibility.md` to the exact range `>=0.1.4-beta-1 <0.2.0` and state that this development CLI is installed from a locally packed tarball, not npm.

Update `cli-contract.json` so character search contains `--limit`, `"20"`, and `--json`, and add:

```json
{
  "id": "catalog-item",
  "argv": ["catalog", "item", "hair_braid", "--json"],
  "machineReadable": true
}
```

Update `cli-workflow.md` to search with `--limit 20`, inspect `page`, fetch more with the returned `nextOffset` only when needed, then run `catalog item <itemId> --json` and inspect exact credits before `character set`. Keep the existing one-edit/validate/preview/render and attribution rules unchanged.

- [x] **Step 4: Update development version and user documentation**

Set `packages/cli/package.json` version to `0.1.4-beta-1` only; do not edit release workflows or create tags.

In both READMEs:

- document the default 20-item page, `--limit`, `--offset`, `--all`, page metadata, summary license families, and full `catalog item` credits;
- tell agents to restart from offset zero after changing the catalog source,
  custom overlay, query filters, or character selection;
- replace the unavailable npm beta range with local development instructions using:

```sh
rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
npm install -g /tmp/lpc-toolkit-cli-0.1.4-beta-1.tgz
```

- state verbatim that `0.1.4-beta-1` is a development version and is not published to npm;
- preserve the ordinary public `npm install -g @lpc-toolkit/cli` instructions for the latest published stable CLI;
- preserve metadata plus TXT/CSV credit requirements.

- [x] **Step 5: Run focused contract checks to verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts plugin-contract.test.ts command-spec.test.ts
rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm verify:plugin
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk git diff --check
```

Expected: PASS. Confirm `rtk git diff --name-only` contains no `.github/workflows/` path.

- [x] **Step 6: Run the complete repository and package gates**

```sh
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm check:boundaries
rtk pnpm verify
rtk pnpm build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: PASS for CLI tests, architecture boundaries, the common verification gate, production build, and packed install smoke. Do not initialize `upstream/`, create a tag, or publish npm.

- [x] **Step 7: Review the whole branch against the spec**

Run:

```sh
rtk git diff --check
rtk git status --short
rtk git diff --stat 40be133f86f2342a09c5949824bdff36acff7279
```

Inspect every changed file for these observable requirements: default 20 items, explicit all mode, deterministic pagination, no page overlap for unchanged inputs, summary licenses and credit counts, detail credits, preserved character fields, structured filter errors, unchanged render/attribution semantics, version `0.1.4-beta-1`, and no workflow/tag/publication change. Fix only findings traceable to this design, rerun the narrow failing test before its wider gate, and record review-fix commits separately.

- [x] **Step 8: Commit Task 5 and record final evidence**

```sh
rtk git add packages/cli/package.json packages/cli/README.md README.md packages/cli/test/package-metadata.test.ts packages/web/test/readme-architecture-docs.test.ts plugins/lpc-toolkit packages/cli/test/plugin-contract.test.ts
rtk git commit -m "chore(cli): prepare 0.1.4 beta development"
rtk git rev-parse HEAD
```

Record the full hash, implementation note, every exact PASS/FAIL result, packed smoke outcome, and any review-fix hashes in this task. Check every plan item, then commit the completed plan record:

```sh
rtk git add docs/superpowers/plans/2026-07-15-cli-agent-discovery-pagination.md
rtk git commit -m "docs(plan): complete CLI agent discovery plan"
```

The completed worktree must be clean. The final handoff must report that `0.1.4-beta-1` remains untagged and unpublished.

**Implementation note:** Aligned the development package marker and plugin
compatibility range at `0.1.4-beta-1`, added the bounded search/detail command
contract, and documented deterministic discovery plus local tarball installation
without claiming npm publication. The public stable install path, one-edit /
validate / preview / render workflow, metadata, TXT/CSV credits, and render /
selection / attribution semantics remain unchanged. Whole-branch review found no
additional spec-traceable fixes.

**Implementation commit:** `dfd7865bd66a224c839bcdf462cc4a788ab89383`

**Verification:**

- `rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts plugin-contract.test.ts` FAIL (expected RED: old version, install copy, and command inventory).
- `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` FAIL (expected RED: old minimum and prerelease admission range).
- `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` FAIL (expected RED after sandbox escalation: missing local tarball documentation; the first sandbox attempt also hit the environment's `tsx` IPC `EPERM`).
- `rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts plugin-contract.test.ts command-spec.test.ts` PASS (48 tests).
- `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` PASS (10 tests).
- `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` PASS outside the sandbox (19 tests; required `tsx` IPC access).
- `rtk pnpm verify:plugin` PASS (16 tests and plugin structure validation).
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- `rtk git diff --check` PASS.
- `rtk git diff --name-only` PASS: no `.github/workflows/` path.
- `rtk pnpm --filter @lpc-toolkit/cli test` PASS outside the sandbox (342 passed, 1 skipped; the sandbox attempt failed only because localhost bind returned `EPERM`).
- `rtk pnpm check:boundaries` PASS.
- `rtk pnpm verify` PASS outside the sandbox (the sandbox attempt failed only because `tsx` IPC returned `EPERM`).
- `rtk pnpm build` PASS outside the sandbox (the sandbox attempt failed only because `tsx` IPC returned `EPERM`).
- `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS outside the sandbox; packed and installed `lpc-toolkit-cli-0.1.4-beta-1.tgz` and completed the installed CLI smoke. The sandbox attempt stalled during local install and was interrupted before rerun.
- `rtk git diff --check` PASS for whole-branch review.
- `rtk git status --short` PASS: only the expected 11 Task 5 paths were modified before the implementation commit.
- `rtk git diff --stat 40be133f86f2342a09c5949824bdff36acff7279` PASS: reviewed all 30 changed files against the discovery and preservation requirements.
- `rtk git diff --name-only 40be133f86f2342a09c5949824bdff36acff7279 -- .github/workflows` PASS: empty output.
- `rtk git tag --points-at HEAD` PASS: empty output; no development, beta, RC, or stable tag was created.
- npm publication was not invoked; `0.1.4-beta-1` remains unpublished.

**Review fix:** The compatibility reference now includes the executable local
pack/install commands, the verbatim unpublished-development statement, and the
ordinary public stable install boundary. Contract coverage requires all three
pieces of guidance.

**Review-fix commit:** `e7453adc3a8624baaf5d0598617bf3e3ef3a1864`

**Review-fix verification:**

- `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` FAIL (expected RED: missing local pack command; 10 passed, 1 failed).
- `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` PASS (11 tests).
- `rtk pnpm verify:plugin` PASS (17 tests and plugin structure validation).
- `rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts plugin-contract.test.ts` PASS (30 tests).
- `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` PASS outside the sandbox (19 tests; required `tsx` IPC access).
- `rtk git diff --check` PASS.
- `rtk git diff --name-only HEAD -- .github/workflows` PASS: empty output before the fix commit.
- No tag or npm publication command was invoked.

**Final review fix:** Discovery preflight now rejects offsets that are not safe
non-negative integers before asset preparation, preventing `Infinity` or unsafe
rounded values from reaching `data.page`. Pure coverage also locks the accepted
`--limit 100` boundary and an empty terminal page at `offset === total` with a
stable numeric offset and total.

**Final review fix commit:** `6f41a4f7f1070559464acaf8d77694baff2727af`

**Final review fix verification:**

- `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts main-assets.test.ts` FAIL (expected RED: unsafe offset was accepted by pure validation and CLI preflight; 2 failed, 62 passed).
- `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-discovery.test.ts main-assets.test.ts main-json.test.ts` PASS (3 files, 66 tests).
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- `rtk git diff --check` PASS.

## Post-plan documentation and help synchronization

- [x] Align generated CLI help, stable architecture ownership, and the web
  landing guide with the bounded two-stage agent discovery workflow.
  - Implementation: Added bounded JSON search examples and exact-credit detail
    lookup to generated CLI help; documented CLI ownership of deterministic
    pagination and attribution detail; added the local `0.1.4-beta-1` install,
    search/detail/set sequence, and continuation guidance to the landing page.
    The root README already contained the complete contract and was intentionally
    left unchanged.
  - Commit: `e2abf7bde7bd446735497c6c7c88a5642c784c12`
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts`
    PASS (19 tests); `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx readme-architecture-docs.test.ts`
    PASS outside the sandbox (21 tests); `rtk pnpm verify` PASS (CLI 347 passed,
    1 skipped; web 682 passed, 1 skipped); `rtk pnpm build` PASS.
  - Help smoke: Built `--help`, `catalog items --help`, `catalog item --help`,
    and `character search --help` all exited 0 and showed the bounded JSON and
    exact-credit examples.
  - Browser QA: The local landing page showed the six workflow steps in order,
    had no horizontal overflow at 1265 px, and produced no console warnings or
    errors.
  - TDD evidence: CLI help coverage and the landing/architecture contracts first
    failed for the missing guidance, then passed after the implementation. The
    first sandboxed web test attempt hit the environment's `tsx` IPC `EPERM` and
    was rerun outside the sandbox.
