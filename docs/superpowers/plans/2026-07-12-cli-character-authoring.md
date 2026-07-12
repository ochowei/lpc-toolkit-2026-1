# CLI Character Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete, non-interactive CLI workflow for creating, editing, previewing, validating, and rendering a named LPC character without hand-writing selection JSON.

**Architecture:** Add focused CLI-only modules for command metadata, character persistence, pure selection editing, command orchestration, and attributed previews. Add one pure core default-selection helper shared by Web, presets, and CLI so item-pick defaults cannot drift. Reuse the existing selection schema, runtime assets, response envelope, and render pipeline; keep Node/filesystem/canvas behavior out of core.

**Tech Stack:** TypeScript strict mode, Node.js 22+, pnpm workspaces, Vitest, `@lpc-toolkit/core`, `@lpc-toolkit/presets`, existing `@napi-rs/canvas` (MIT) and `jszip` (MIT).

## Global Constraints

- Never modify `upstream/`.
- Keep `packages/core/` environment-agnostic; no Node, filesystem, DOM, React, Vite, or concrete canvas imports.
- Preserve mandatory `ComposedSheet.credits`-derived TXT/CSV attribution and effective-license metadata for every preview and render.
- Use TypeScript strict mode; do not add `any`.
- Use pnpm and prefix every terminal command with `rtk`.
- Add no dependency.
- Preserve valid existing CLI invocations and the `lpc-toolkit.selection.v1` schema.
- Reject unknown options before asset preparation.
- After each task, update its checkboxes and execution record in this plan, recording the implementation commit and verification result in a separate documentation commit.

---

## Planned File Structure

- Create `packages/cli/src/command-spec.ts`: hierarchical help text and option-shape validation for all public commands.
- Create `packages/core/src/selection-defaults.ts`: environment-agnostic recolor-first, variant-fallback item defaults.
- Create `packages/core/test/selection-defaults.test.ts`: shared-default behavior.
- Modify `packages/core/src/index.ts`, `packages/web/src/slice/color-options.ts`, and `packages/presets/src/index.ts`: expose and consume one shared default rule.
- Create `packages/cli/src/character-store.ts`: safe character-name/path resolution and transactional selection JSON persistence.
- Create `packages/cli/src/character-editor.ts`: pure create/search/set/remove transitions and suggestions.
- Create `packages/cli/src/character-commands.ts`: character command orchestration and response construction.
- Create `packages/cli/src/compose-selection.ts`: reusable CLI composition setup shared by full render and preview.
- Create `packages/cli/src/preview.ts`: attributed single-frame preview extraction and publication.
- Create matching focused tests under `packages/cli/test/`.
- Modify `packages/cli/src/main.ts`: early help/option validation, asset classification, and character dispatch only.
- Modify `packages/cli/src/render.ts`: consume the shared CLI composition helper without changing artifacts.
- Modify `packages/cli/src/response.ts`: optional structured issue details plus character human formatting.
- Modify `packages/cli/README.md` and `packages/cli/scripts/smoke-packed-cli.mjs`: document and verify the installed workflow.

### Task 1: Hierarchical Help and Strict Option Validation

**Files:**
- Create: `packages/cli/src/command-spec.ts`
- Create: `packages/cli/test/command-spec.test.ts`
- Modify: `packages/cli/src/args.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Test: `packages/cli/test/main-assets.test.ts`
- Test: `packages/cli/test/response.test.ts`

**Interfaces:**
- Produces: `helpForCommand(command: readonly string[]): string`.
- Produces: `validateCommandOptions(parsed: ParsedArgs): CliIssue | undefined`.
- Private helpers: `findCommandSpec`, `suggestOption`, and `renderCommandSpec`; each is defined and tested in `command-spec.ts` and is not exported.
- Extends: `CliIssue.details?: { suggestions?: readonly string[]; available?: readonly string[] }`.
- Consumes later: every character command uses the same option validator and issue details.

- [x] **Step 1: Write failing command-spec and dispatch tests**

Add tests that prove nested help is specific and unknown/malformed options fail before asset preparation:

```ts
it('renders command-specific character set help', () => {
  const help = helpForCommand(['character', 'set']);
  expect(help).toContain('lpc-toolkit character set <name>');
  expect(help).toContain('--item <item-id-or-type/name>');
});

it('rejects an unknown option', () => {
  const issue = validateCommandOptions(
    parseArgs(['catalog', 'items', '--tpye', 'hair']),
  );
  expect(issue).toMatchObject({ code: 'unknown_option', path: '--tpye' });
  expect(issue?.details?.suggestions).toContain('--type');
});

it('rejects invalid options without preparing assets', async () => {
  const prepare = vi.fn(async () => runtime);
  const capture = captureIo(runtime.context.repoRoot);
  expect(await runCli(['catalog', 'items', '--tpye', 'hair'], capture.io, {
    prepareRuntimeAssets: prepare,
  })).toBe(1);
  expect(prepare).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts response.test.ts
```

Expected: FAIL because `command-spec.ts` and `CliIssue.details` do not exist and nested help still returns the global summary.

- [x] **Step 3: Implement the command metadata and validator**

Use an explicit table, not ad-hoc checks spread through `main.ts`:

```ts
type OptionKind = 'boolean' | 'value' | 'repeatable';

interface CommandOptionSpec {
  readonly name: string;
  readonly kind: OptionKind;
  readonly valueLabel?: string;
  readonly description: string;
}

interface CommandSpec {
  readonly command: readonly string[];
  readonly usage: string;
  readonly description: string;
  readonly options: readonly CommandOptionSpec[];
  readonly examples: readonly string[];
}

export function validateCommandOptions(parsed: ParsedArgs): CliIssue | undefined {
  const spec = findCommandSpec(parsed.command);
  if (!spec) return undefined;
  for (const [name, value] of parsed.flags) {
    const option = spec.options.find((candidate) => candidate.name === name);
    if (!option) {
      return {
        code: 'unknown_option',
        message: `Unknown option: --${name}`,
        path: `--${name}`,
        details: { suggestions: suggestOption(name, spec.options) },
      };
    }
    if (option.kind !== 'boolean' && value === true) {
      return { code: 'invalid_option', message: `--${name} requires a value.`, path: `--${name}` };
    }
    if (option.kind !== 'repeatable' && Array.isArray(value)) {
      return { code: 'invalid_option', message: `--${name} may be supplied only once.`, path: `--${name}` };
    }
  }
  return undefined;
}
```

Include specs for all existing commands and every designed `character` command. Every spec allows `help`; commands that support structured output allow `json`. Add `help` to `BOOLEAN_FLAGS` in `args.ts`.

In `runCli`, resolve nested help and validate options before `commandNeedsAssets`:

```ts
const parsed = parseArgs(argv);
if (parsed.flags.has('help')) {
  io.stdout(helpForCommand(parsed.command));
  return 0;
}
const optionIssue = validateCommandOptions(parsed);
if (optionIssue) {
  return writeResponse(commandError(parsed.command.join(' '), optionIssue), parsed, io, '');
}
```

Extend `CliIssue` exactly as approved:

```ts
readonly details?: {
  readonly suggestions?: readonly string[];
  readonly available?: readonly string[];
};
```

- [x] **Step 4: Run focused tests and typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts response.test.ts args.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: all selected tests PASS and typecheck exits 0.

- [x] **Step 5: Commit the implementation**

```sh
rtk git add packages/cli/src/args.ts packages/cli/src/command-spec.ts packages/cli/src/main.ts packages/cli/src/response.ts packages/cli/test/args.test.ts packages/cli/test/command-spec.test.ts packages/cli/test/main-assets.test.ts packages/cli/test/response.test.ts
rtk git commit -m "feat(cli): add hierarchical command help"
```

- [x] **Step 6: Record task completion**

After the implementation commit, mark Task 1 steps complete and replace this current-state record with actual evidence, then stage only this plan and commit it with `rtk git commit -m "docs(plan): record CLI help task"`.

- Implementation: Added explicit hierarchical command metadata for every existing and designed character command, command-specific help, strict option-shape validation with typo suggestions, boolean `--help` parsing, early validation before asset preparation, and structured issue details.
- Commit: `24173d8b0` (`feat(cli): add hierarchical command help`)
- Verification: TDD RED captured with the required focused command (missing `command-spec.ts`, unknown option accepted, and global nested help); GREEN with 53/53 focused tests passing; CLI typecheck PASS; full CLI suite PASS (205 passed, 1 skipped).

### Task 2: Character Store and Safe Persistence

**Files:**
- Create: `packages/cli/src/character-store.ts`
- Create: `packages/cli/test/character-store.test.ts`

**Interfaces:**
- Produces: `resolveCharacterPath(cwd: string, input: CharacterLocator): string`.
- Produces: `readCharacter(cwd: string, input: CharacterLocator): StoredCharacter`.
- Produces: `writeCharacter(targetPath: string, selection: SelectionJson, mode: 'create' | 'replace'): void`.
- Produces: `listCharacters(cwd: string): readonly CharacterListEntry[]`.
- Produces: `CharacterStoreError extends Error` with readonly `code` and optional `path`; `toCharacterWriteError` is its private unknown-error mapper.
- Consumes: existing `parseSelectionJson` and `SelectionJson`.

- [x] **Step 1: Write failing persistence tests**

Cover safe names, explicit paths, listing, create conflicts, replacement, and unchanged bytes after validation failure:

```ts
it.each(['../hero', '/hero', '.', '..', 'hero/alt'])('rejects unsafe name %s', (name) => {
  expect(() => resolveCharacterPath(cwd, { name })).toThrowError(
    expect.objectContaining({ code: 'character_name_invalid' }),
  );
});

it('creates and replaces a character through a sibling temporary file', () => {
  const target = resolveCharacterPath(cwd, { name: 'hero' });
  writeCharacter(target, selection('hero'), 'create');
  expect(readCharacter(cwd, { name: 'hero' }).selection.name).toBe('hero');
  writeCharacter(target, selection('hero', 'female'), 'replace');
  expect(readCharacter(cwd, { name: 'hero' }).selection.bodyType).toBe('female');
  expect(readdirSync(path.dirname(target))).not.toEqual(
    expect.arrayContaining([expect.stringMatching(/\.tmp$/u)]),
  );
});
```

- [x] **Step 2: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-store.test.ts
```

Expected: FAIL because the store module does not exist.

- [x] **Step 3: Implement the store**

Use a strict portable name rule and keep explicit paths relative to `cwd`:

```ts
const CHARACTER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export type CharacterLocator =
  | { readonly name: string; readonly selectionPath?: never }
  | { readonly name?: never; readonly selectionPath: string };

export function resolveCharacterPath(cwd: string, input: CharacterLocator): string {
  if (input.selectionPath !== undefined) return path.resolve(cwd, input.selectionPath);
  if (!CHARACTER_NAME.test(input.name) || input.name === '.' || input.name === '..') {
    throw new CharacterStoreError('character_name_invalid', `Invalid character name: ${input.name}`);
  }
  return path.join(cwd, 'characters', `${input.name}.selection.json`);
}
```

Publish formatted JSON through a sibling temporary path and clean it in `finally`:

```ts
export function writeCharacter(
  targetPath: string,
  selection: SelectionJson,
  mode: 'create' | 'replace',
): void {
  parseSelectionJson(selection);
  if (mode === 'create' && existsSync(targetPath)) {
    throw new CharacterStoreError('character_already_exists', 'Character already exists.', targetPath);
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(selection, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporaryPath, targetPath);
  } catch (error) {
    throw toCharacterWriteError(error, targetPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
```

`listCharacters` reads only `characters/*.selection.json`, parses each file, and returns stable name-sorted entries. Invalid files are returned with an issue instead of aborting the entire list.

- [x] **Step 4: Run store tests and typecheck**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-store.test.ts selection.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS; no `.tmp` files remain.

- [x] **Step 5: Commit and record**

```sh
rtk git add packages/cli/src/character-store.ts packages/cli/test/character-store.test.ts
rtk git commit -m "feat(cli): add character selection store"
```

Then update Task 2 checkboxes and the record below, stage only this plan, and commit it with `rtk git commit -m "docs(plan): record character store task"`.

- Implementation: Added portable name resolution, validated reads, sibling-temporary atomic writes, resilient stable character listing, and atomic no-replace create publication.
- Commit: a6cefa669b7c7ce04e108a62972a4e19c63ef171
- Review fix: 4c14a5da767c658b6bf50d2b0f4b444f3d0c081b
- Verification: Initial RED confirmed missing module; review RED reproduced concurrent create overwrite; 15 character-store tests PASS; CLI typecheck PASS; no temporary files remain.

### Task 3: Pure Character Editing and Search

**Files:**
- Create: `packages/cli/src/character-editor.ts`
- Create: `packages/cli/test/character-editor.test.ts`
- Create: `packages/core/src/selection-defaults.ts`
- Create: `packages/core/test/selection-defaults.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/web/src/slice/color-options.ts`
- Modify: `packages/web/test/color-options.test.ts`
- Modify: `packages/presets/src/index.ts`
- Modify: `packages/presets/test/presets.test.ts`

**Interfaces:**
- Produces: `createEmptyCharacter(name: string, bodyType: BodyType): SelectionJson`.
- Produces: `searchCharacterItems(selections: Selections, input: CharacterSearchInput, context: CharacterCatalogContext): CharacterSearchResult`.
- Produces: `setCharacterItem(selections: Selections, input: CharacterSetInput, context: CharacterCatalogContext): CharacterEditResult`.
- Produces: `removeCharacterItem(selections: Selections, typeName: TypeName): CharacterEditResult`.
- `CharacterCatalogContext` contains `catalog`, `palettes`, and `pathExists` only, keeping operations deterministic and filesystem-free.
- Consumes: public core `BODY_TYPES` to reject unsupported body types before writing.
- Produces: `CharacterEditError extends Error` with readonly `code`, optional `path`, and optional `details`; private `unknownItemError` and `editErrorFromValidation` return this type.
- Produces: core `getDefaultColorSelection(item, palettes): { readonly variant?: string; readonly recolor?: string }`.
- Web `pickDefaults` delegates to the core helper; presets and CLI consume it directly.

- [x] **Step 1: Write failing editor tests**

```ts
it('searches name and item id, filters body type, and sorts by item id', () => {
  const result = searchCharacterItems(maleSelections, { typeName: 'hair', query: 'braid' }, context);
  expect(result.items.map((item) => item.itemId)).toEqual(['braid', 'braids']);
  expect(result.items[0]).toMatchObject({ licenses: ['GPL'], replacesCurrent: false });
});

it('sets one type without changing another type', () => {
  const result = setCharacterItem(maleSelections, {
    typeName: 'hair', itemRef: 'braids', variant: 'brown',
  }, context);
  expect(result.selections.items.body).toEqual(maleSelections.items.body);
  expect(result.selections.items.hair).toEqual({
    typeName: 'hair', name: 'Braids', variant: 'brown',
  });
});

// Historical initial requirement, superseded by the approved Web-alignment
// amendment below. The amendment replaces this behavior with shared defaults.
it('returns available variants instead of guessing', () => {
  expect(() => setCharacterItem(maleSelections, {
    typeName: 'hair', itemRef: 'variant-only',
  }, context)).toThrowError(expect.objectContaining({
    code: 'missing_variant',
    details: { available: ['black', 'brown'] },
  }));
});

it('rejects a body type outside the public core list', () => {
  expect(() => createEmptyCharacter('hero', 'centaur')).toThrowError(
    expect.objectContaining({
      code: 'body_type_invalid',
      details: { available: [...BODY_TYPES] },
    }),
  );
});
```

- [x] **Step 2: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts
```

Expected: FAIL because the editor module does not exist.

- [x] **Step 3: Implement deterministic editor operations**

Resolve item ID first, then exact `type/name`, and reject a type mismatch:

```ts
function resolveItem(catalog: Catalog, typeName: TypeName, itemRef: string): ItemDefinition {
  const byId = catalog.byItemId.get(itemRef);
  const exact = byId ?? catalog.byTypeName.get(typeName)?.find(
    (item) => `${typeName}/${item.name}` === itemRef,
  );
  if (!exact) throw unknownItemError(itemRef, catalog, typeName);
  if (exact.type_name !== typeName) {
    throw new CharacterEditError('item_type_mismatch', `${itemRef} belongs to ${exact.type_name}.`);
  }
  return exact;
}
```

Build a fresh candidate without mutating the input, call existing `validateSelections`, and convert option-related failures into structured errors:

```ts
const candidate: Selections = {
  bodyType: selections.bodyType,
  items: {
    ...selections.items,
    [input.typeName]: {
      typeName: input.typeName,
      name: item.name,
      ...(input.variant ? { variant: input.variant } : {}),
      ...(input.recolor ? { recolor: input.recolor } : {}),
    },
  },
};
const validation = validateSelections(candidate, context);
if (!validation.ok) throw editErrorFromValidation(validation, item, context.palettes, input);
return { selections: candidate, replaced: selections.items[input.typeName] !== undefined };
```

For search, expose item ID, display name fallback, variants, `getRecolorVariants`, animations, unique license family keys, and `replacesCurrent`. Only shared catalog/body compatibility is enforced; do not invent cross-slot fashion rules.

- [x] **Step 4: Run editor tests and related validation tests**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts validation.test.ts catalog-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

- [x] **Step 5: Commit and record**

```sh
rtk git add packages/cli/src/character-editor.ts packages/cli/test/character-editor.test.ts
rtk git commit -m "feat(cli): add pure character editing"
```

Then update Task 3 checkboxes and record, stage only this plan, and commit it with `rtk git commit -m "docs(plan): record character editor task"`.

- Implementation: Added filesystem-free character creation, catalog search,
  immutable set/remove transitions, structured editor errors, and option
  availability reporting. TDD recorded the initial missing-module RED and an
  additional RED preventing validation failures from another selected type
  being attributed to the edited item.
- Commit: `83a408f4bc6ce09c41995987f13c13e94fc99993`
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts validation.test.ts catalog-commands.test.ts`
  PASS (15 tests); package-local `rtk pnpm typecheck` PASS; `rtk pnpm
  check:boundaries` PASS; `rtk git diff --check` PASS.

#### Required Review Amendment: Align Defaults with Web

The initial Task 3 implementation and record above remain historical evidence,
but Task 3 is not approved. The approved spec revision supersedes its
`missing_variant`/`missing_recolor` path-recovery behavior.

- [x] **Step 6: Write failing shared-default and strict-path tests**

Add core tests for the exact shared priority:

```ts
it('uses the first recolor swatch before declared variants', () => {
  expect(getDefaultColorSelection(recolorAndVariantItem, palettes)).toEqual({
    recolor: 'black',
  });
});

it('falls back to the first variant when recolors are unavailable', () => {
  expect(getDefaultColorSelection(variantItem, palettes)).toEqual({
    variant: 'brown',
  });
});

it('returns no fields for an item with no color choices', () => {
  expect(getDefaultColorSelection(plainItem, palettes)).toEqual({});
});
```

Add Web and preset parity assertions:

```ts
expect(pickDefaults(recolorItem, palettes)).toEqual({ recolor: 'black' });
expect(pickDefaults(variantItem, palettes)).toEqual({ variant: 'brown' });
expect(computePresetSelection(preset, {}, 'male', catalog, palettes).selections)
  .toEqual(existingExpectedSelections);
```

Replace the superseded CLI option-recovery expectations with:

```ts
it('applies shared defaults only when neither option is explicit', () => {
  expect(setCharacterItem(base, { typeName: 'hair', itemRef: 'recolor-hair' }, context)
    .selections.items.hair).toMatchObject({ recolor: 'black' });
  expect(setCharacterItem(base, {
    typeName: 'hair', itemRef: 'recolor-hair', recolor: 'orange',
  }, context).selections.items.hair).toMatchObject({ recolor: 'orange' });
});

it('preserves missing_sprite_path after applying defaults', () => {
  expect(() => setCharacterItem(base, {
    typeName: 'hair', itemRef: 'missing-variant-item',
  }, missingPathContext)).toThrowError(expect.objectContaining({
    code: 'missing_sprite_path',
  }));
});
```

- [x] **Step 7: Run the amendment tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- selection-defaults.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- color-options.test.ts
rtk pnpm --filter @lpc-toolkit/presets test -- presets.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts
```

Expected: core fails because `getDefaultColorSelection` does not exist; CLI
fails because omitted options do not use the shared default and current error
translation can mislabel missing paths.

- [x] **Step 8: Implement one shared helper and strict CLI mapping**

Create the core helper and export it from `packages/core/src/index.ts`:

```ts
export function getDefaultColorSelection(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { readonly variant?: string; readonly recolor?: string } {
  if (!item) return {};
  const firstRecolor = getRecolorSwatches(item, palettes)[0];
  if (firstRecolor) return { recolor: firstRecolor.recolor };
  const firstVariant = item.variants?.[0];
  return firstVariant ? { variant: firstVariant } : {};
}
```

Keep the Web API stable while delegating:

```ts
export function pickDefaults(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { variant?: string; recolor?: string } {
  return getDefaultColorSelection(item, palettes);
}
```

Use `getDefaultColorSelection` in presets in place of its private duplicated
default picker. In CLI editor construction, explicit input wins and defaults
apply only when both fields are absent:

```ts
const colorFields = input.variant || input.recolor
  ? {
      ...(input.variant ? { variant: input.variant } : {}),
      ...(input.recolor ? { recolor: input.recolor } : {}),
    }
  : getDefaultColorSelection(item, context.palettes);

const editedSelection: Selection = {
  typeName: input.typeName,
  name: item.name,
  ...colorFields,
};
```

Delete missing-option inference from `editErrorFromValidation`. Return the
existing edited-slot validation issue unchanged so a missing image remains
`missing_sprite_path`; explicit invalid fields remain `unknown_variant` or
`unknown_recolor` through `validateSelections`.

- [x] **Step 9: Run cross-package GREEN verification**

```sh
rtk pnpm --filter @lpc-toolkit/core test -- selection-defaults.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- color-options.test.ts
rtk pnpm --filter @lpc-toolkit/presets test -- presets.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- character-editor.test.ts validation.test.ts catalog-commands.test.ts
rtk pnpm --dir packages/core run typecheck
rtk pnpm --dir packages/web run typecheck
rtk pnpm --dir packages/presets run typecheck
rtk pnpm --dir packages/cli run typecheck
rtk pnpm check:boundaries
```

Expected: all focused tests and four package typechecks PASS; boundary check
exits 0.

- [x] **Step 10: Commit the amendment**

```sh
rtk git add packages/core/src/selection-defaults.ts packages/core/src/index.ts packages/core/test/selection-defaults.test.ts packages/web/src/slice/color-options.ts packages/web/test/color-options.test.ts packages/presets/src/index.ts packages/presets/test/presets.test.ts packages/cli/src/character-editor.ts packages/cli/test/character-editor.test.ts
rtk git commit -m "fix(cli): align character defaults with web"
```

- [x] **Step 11: Record amendment completion**

Append the amendment commit and exact cross-package verification evidence to
the Task 3 execution record, stage only this plan, and commit with:

```sh
rtk git add docs/superpowers/plans/2026-07-12-cli-character-authoring.md
rtk git commit -m "docs(plan): record shared character defaults"
```

- Amendment implementation: Added public core `getDefaultColorSelection` with
  recolor-first priority, delegated Web and presets defaults to it, applied it
  in CLI only when neither color field is explicit, and removed all
  `missing_sprite_path` option inference. Added exact `type/name` CLI coverage.
- Amendment RED: Core failed 3 tests because the helper was absent; CLI failed
  2 tests because defaults were omitted and missing paths were mislabeled.
  Web (8 tests) and presets (3 tests) passed their parity assertions against
  the pre-existing duplicate behavior.
- Amendment commit: `3e1e36a24bff7e741886d0c90d6fba5797e8bacf`
- Amendment verification: Core selection-defaults PASS (3 tests), Web
  color-options PASS (8 tests), presets PASS (3 tests), CLI editor/validation/
  catalog PASS (17 tests); core, Web, presets, and CLI typechecks PASS;
  boundary check and `git diff --check` PASS. Web tests required approved
  sandbox escalation for the `tsx` IPC socket; asset preparation was a cache
  hit.

### Task 4: Character CRUD, Search, Show, and Validate Commands

**Files:**
- Create: `packages/cli/src/character-commands.ts`
- Create: `packages/cli/test/character-commands.test.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/response.ts`
- Test: `packages/cli/test/main-human.test.ts`
- Test: `packages/cli/test/main-assets.test.ts`

**Interfaces:**
- Produces: `runCharacterCommand(parsed: ParsedArgs, io: CliIo, runtime?: RuntimeAssets): Promise<CliResponse<unknown>>`.
- Produces: `characterCommandNeedsAssets(parsed: ParsedArgs): boolean`.
- Produces: `CharacterCommandDependencies` with injectable `renderSelection` and `renderCharacterPreview` functions, defaulting to the production implementations.
- Consumes: store/editor/preset/validation interfaces from Tasks 2 and 3.
- Leaves `preview` and `render` dispatch injected as functions so Tasks 5 and 6 can add them without growing `main.ts`.

- [x] **Step 1: Write failing command lifecycle tests**

```ts
it('creates, sets, shows, validates, removes, and lists a named character', async () => {
  expect((await run(['character', 'create', 'hero'])).response.ok).toBe(true);
  expect((await run(['character', 'set', 'hero', '--type', 'body', '--item', 'body'])).response.ok).toBe(true);
  expect((await run(['character', 'show', 'hero'])).response.data).toMatchObject({
    selection: { name: 'hero', items: { body: { name: 'Body Color' } } },
    valid: true,
  });
  expect((await run(['character', 'remove', 'hero', '--type', 'body'])).response.ok).toBe(true);
  expect((await run(['character', 'list'])).response.data).toMatchObject({ count: 1 });
});

it('does not write an invalid set candidate', async () => {
  await run(['character', 'create', 'hero', '--preset', 'farmer']);
  const before = readFileSync(heroPath, 'utf8');
  const result = await run(['character', 'set', 'hero', '--type', 'hair', '--item', 'missing']);
  expect(result.response.ok).toBe(false);
  expect(readFileSync(heroPath, 'utf8')).toBe(before);
});
```

- [x] **Step 2: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-commands.test.ts main-assets.test.ts main-human.test.ts
```

Expected: FAIL because character dispatch and formatting do not exist.

- [x] **Step 3: Implement command orchestration**

Resolve exactly one locator:

```ts
function characterLocator(parsed: ParsedArgs): CharacterLocator {
  const name = parsed.positionals[0];
  const selectionPath = flagString(parsed.flags, 'selection');
  if (name && selectionPath) throw usageError('character_locator_conflict', 'Use a name or --selection, not both.');
  if (selectionPath) return { selectionPath };
  if (name) return { name };
  throw usageError('missing_argument', 'Character name or --selection is required.');
}
```

For mutations, compute and validate the complete candidate before `writeCharacter(..., 'replace')`. `create --preset` calls existing `materializePreset` with loaded catalog/palettes and the requested body type. `show` includes path, selection, and validation. `search` returns a stable total and item list. Map `CharacterStoreError` and `CharacterEditError` directly to `CliIssue`.

`character create` always requires the positional metadata name. Its optional
`--selection <path>` changes only the output path; without that flag it writes
`characters/<name>.selection.json`. Existing-character commands instead treat
the positional name and `--selection` as mutually exclusive locators.

Keep `main.ts` dispatch small:

```ts
if (parsed.command[0] === 'character') {
  const response = await runCharacterCommand(parsed, io, runtime);
  return writeResponse(response, parsed, io, 'Character command completed.\n');
}
```

Update `commandNeedsAssets`: `character list` and empty `character create` do not prepare assets; preset create, search, set, show validation, validate, preview, and render do.

- [x] **Step 4: Run command tests, typecheck, and boundary check**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-commands.test.ts main-assets.test.ts main-human.test.ts preset-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm check:boundaries
```

Expected: PASS.

- [x] **Step 5: Commit and record**

```sh
rtk git add packages/cli/src/character-commands.ts packages/cli/src/main.ts packages/cli/src/response.ts packages/cli/test/character-commands.test.ts packages/cli/test/main-assets.test.ts packages/cli/test/main-human.test.ts
rtk git commit -m "feat(cli): add character authoring commands"
```

Then update Task 4 checkboxes and record, stage only this plan, and commit it with `rtk git commit -m "docs(plan): record character command task"`.

- Implementation: Added character create/list/show/search/set/remove/validate
  orchestration, exact locator semantics, atomic validated mutations, typed issue
  mapping, asset-need classification, compact main dispatch, and initial list/show
  human formatting. Self-review added portable metadata-name and preset body-type
  regression coverage.
- RED: Focused run failed because `character-commands.ts`, character dispatch,
  asset classification, and human formatting did not exist (3 test files failed;
  8 assertions failed and the command suite could not load). The two self-review
  regressions also failed before their fixes.
- Commit: `bfffd1a6f0ebf0a66c74f3a7e7405064c12f1c87`
- Verification: Focused Task 4/preset suite PASS (69 tests); full CLI suite PASS
  (247 passed, 1 skipped; approved localhost permission required for Web server
  tests); CLI typecheck PASS; boundary check PASS; `git diff --check` PASS.
- Review fix: Classified `character remove` as asset-dependent, required its
  runtime context, validated the complete post-remove candidate before atomic
  replacement, and rejected surplus positional locators through the shared
  locator resolver. Added a production `runCli` regression proving structured
  validation errors and byte-for-byte preservation, plus named/explicit-path
  surplus-locator coverage.
- Review-fix RED: `character-commands.test.ts` and `main-assets.test.ts` failed
  three assertions: removal was asset-independent, surplus positionals reached
  character lookup, and production removal returned success while rewriting an
  invalid candidate.
- Review-fix commit: `8f87225a515f3853c72bf7fc0b62554e01e57dd2`
- Review-fix verification: Focused Task 4/preset suite PASS (72 tests); full CLI
  suite PASS (250 passed, 1 skipped); package-directory CLI typecheck PASS;
  boundary check and `git diff --check` PASS.

### Task 5: Shared Composition Setup and Attributed Preview

**Files:**
- Create: `packages/cli/src/compose-selection.ts`
- Create: `packages/cli/src/preview.ts`
- Create: `packages/cli/test/preview.test.ts`
- Modify: `packages/cli/src/render.ts`
- Modify: `packages/cli/src/character-commands.ts`
- Test: `packages/cli/test/render.test.ts`

**Interfaces:**
- Produces: `composeSelectionForOutput(options: ComposeSelectionOptions): Promise<ComposedSelectionOutput>` containing `sheet`, `adapter`, `warnings`, parsed selection, catalog, and palettes.
- Produces: `renderCharacterPreview(options: CharacterPreviewOptions): Promise<CharacterPreviewResult>`.
- Produces: `PreviewError` with `code`, `path?`, and `details?`; `previewIssue(code, path, details?)` constructs it for command mapping.
- Preview input uses zero-based `frameIndex`; core `FrameSlice.frameNumber` remains one-based internally.

- [x] **Step 1: Write failing preview and render-regression tests**

```ts
it('writes one down-facing walk frame and exact attribution', async () => {
  const result = await renderCharacterPreview({
    runtime, cwd, selectionPath, outDir,
    animation: 'walk', direction: 'down', frameIndex: 0,
  });
  expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
    'preview', 'credits_txt', 'credits_csv', 'metadata',
  ]);
  expect(readFileSync(path.join(outDir, 'hero.credits.txt'), 'utf8')).toContain('Fixture Artist');
  expect(JSON.parse(readFileSync(path.join(outDir, 'hero.metadata.json'), 'utf8'))).toMatchObject({
    animation: 'walk', direction: 'down', frameIndex: 0, effectiveLicense: 'GPL 3.0',
  });
});

it.each([
  ['idle', 'preview_animation_unavailable'],
  ['walk:sideways', 'preview_direction_unavailable'],
  ['walk:down:99', 'preview_frame_out_of_range'],
])('returns actionable preview error for %s', async (request, code) => {
  await expect(runPreviewRequest(request)).rejects.toMatchObject({ code });
});

it('does not publish a preview for an empty character', async () => {
  await expect(renderCharacterPreview(emptyCharacterOptions)).rejects.toMatchObject({
    code: 'preview_incomplete_character',
  });
  expect(existsSync(emptyCharacterOptions.outDir)).toBe(false);
});
```

Keep the existing `render.test.ts` artifact and metadata assertions unchanged to prove the extraction refactor is behavior-preserving.

- [x] **Step 2: Run preview and render tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- preview.test.ts render.test.ts
```

Expected: preview tests FAIL because modules do not exist; existing render tests PASS before refactoring.

- [x] **Step 3: Extract shared composition setup**

Move only catalog/palette loading, validation, palette resolution, adapter construction, and `composeSelections` into `compose-selection.ts`:

```ts
export interface ComposedSelectionOutput {
  readonly sheet: ComposedSheet;
  readonly adapter: CanvasAdapter;
  readonly warnings: readonly CliIssue[];
  readonly parsed: ParsedSelectionJson;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
}

export async function composeSelectionForOutput(
  options: ComposeSelectionOptions,
): Promise<ComposedSelectionOutput> {
  const catalog = loadCatalogFromRoots(
    options.runtime.context.sheetDefinitionsRoot,
    options.runtime.context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(options.runtime.context.paletteDefinitionsRoot);
  const parsed = parseSelectionJson(options.selectionJson);
  const validation = validateSelections(parsed.selections, {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    pathExists: (spritePath) => options.runtime.store.has(spritePath),
  });
  if (!validation.ok && !options.allowPartial) throw new SelectionOutputError(validation.errors);
  const recolorWarnings: CliIssue[] = [];
  const resolvePalette = makeResolvePalette(
    catalog.catalog,
    palettes.palettes,
    parsed.selections,
    { onWarn: (message) => recolorWarnings.push({ code: 'recolor_warning', message }) },
  );
  const adapter = createNodeCanvasAdapter({ assetStore: options.runtime.store });
  const sheet = await composeSelections(parsed.selections, {
    catalog: catalog.catalog,
    adapter,
    spritesheetsBaseUrl: options.runtime.store.baseUrl,
    resolvePalette,
    onImageLoadError: (error) => {
      if (error instanceof AssetStoreError) throw error;
    },
  });
  const warnings = [
    ...catalog.warnings,
    ...palettes.warnings,
    ...validation.warnings,
    ...(options.allowPartial ? validation.errors : []),
    ...recolorWarnings,
    ...(sheet.missingPaths ?? []).map((missingPath) => ({
      code: 'missing_sprite_path',
      message: 'Composed sheet skipped a missing sprite path.',
      path: missingPath,
    })),
  ];
  return {
    sheet,
    adapter,
    parsed,
    warnings,
    catalog: catalog.catalog,
    palettes: palettes.palettes,
  };
}
```

Define `SelectionOutputError` in this module with
`readonly issues: readonly CliIssue[]`; its message joins issue messages and
its stable command-mapping code is `selection_output_invalid`.

Modify `renderSelection` to consume this result while preserving its current artifact staging, metadata, ZIP, and attribution code.

- [x] **Step 4: Implement preview extraction and transactional publication**

Validate against the composed sheet and core direction IDs:

```ts
const animation = extractAnimation(sheet, options.animation, { adapter });
if (!DIRECTIONS.slice(0, animation.directions).includes(options.direction)) {
  throw previewIssue('preview_direction_unavailable', options.direction, {
    available: DIRECTIONS.slice(0, animation.directions),
  });
}
if (options.frameIndex < 0 || options.frameIndex >= animation.frameCount) {
  throw previewIssue('preview_frame_out_of_range', String(options.frameIndex), {
    available: Array.from({ length: animation.frameCount }, (_, index) => String(index)),
  });
}
const frames = extractAnimationFrames(sheet, options.animation, { adapter, skipEmpty: false });
const frame = frames.get(options.direction)?.[options.frameIndex];
if (!frame) throw previewIssue('preview_frame_out_of_range', String(options.frameIndex));
```

Write `<safe-name>.preview.png`, `<safe-name>.credits.txt`,
`<safe-name>.credits.csv`, and `<safe-name>.metadata.json` into a staging
directory, then publish only after all files exist. Use defaults `walk`,
`down`, and `0`. Metadata records the zero-based CLI index, source path,
dimensions, effective license, CLI version, and precise credit paths.

Resolve output paths exactly: `--out` wins; a named character defaults to
`characters/previews/<name>/`; an explicit selection defaults to
`<selection-directory>/previews/<safe-selection-name>/`, using selection
metadata and then the selection file stem as fallback. If the composed sheet
has no credited or resolved layers, throw `preview_incomplete_character`
before creating the staging directory.

- [x] **Step 5: Run preview/render tests and verification**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- preview.test.ts render.test.ts character-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm check:boundaries
```

Expected: PASS; preview has exactly one pixel artifact and both credit sidecars; existing render assertions remain green.

- [x] **Step 6: Commit and record**

```sh
rtk git add packages/cli/src/compose-selection.ts packages/cli/src/preview.ts packages/cli/src/render.ts packages/cli/src/character-commands.ts packages/cli/test/preview.test.ts packages/cli/test/render.test.ts packages/cli/test/character-commands.test.ts
rtk git commit -m "feat(cli): add attributed character previews"
```

Then update Task 5 checkboxes and record, stage only this plan, and commit it with `rtk git commit -m "docs(plan): record character preview task"`.

- Implementation: Extracted the shared strict/partial composition setup without
  changing render artifact publication or metadata semantics. Added strict
  single-frame character preview output with exact TXT/CSV attribution,
  metadata, output defaults, typed actionable errors, and rollback-safe staging
  on the destination filesystem. Review follow-up added metadata-name fallback
  and strict decimal frame parsing.
- Commit: `5c601efcea070d51e31ade51d58b2a4564230174`
- Verification: Preview/render/character focused suite PASS (30 tests); full CLI
  suite PASS (265 passed, 1 platform-specific skip); CLI typecheck PASS; core
  suite PASS (167 tests); architecture boundary check and `git diff --check`
  PASS. The first sandboxed full CLI run failed only because localhost binding
  was denied; the permission-enabled rerun passed all 30 test files.
- Review fix: Normalized preview metadata names before accepting them, rejected
  empty and dot-segment results, and safely fell back to the normalized
  selection file stem so explicit-selection artifacts cannot escape their
  required preview directory. Added containment regressions for `..` and
  punctuation-only metadata.
- Review-fix RED: `preview.test.ts` failed 2 assertions: `..` normalized the
  output to the selection directory, while punctuation-only metadata did not
  use the required safe file-stem fallback.
- Review-fix commit: `cdb6e8c8baa432b4dd5dad8b4d1ca5956a05ce53`
- Review-fix verification: Focused preview/render/character suite PASS (32
  tests); CLI package typecheck PASS; architecture boundary check and
  `git diff --check` PASS.

### Task 6: Character Render Delegation and Complete Human Output

**Files:**
- Modify: `packages/cli/src/character-commands.ts`
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/test/character-commands.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`
- Modify: `packages/cli/test/main-render-errors.test.ts`

**Interfaces:**
- `character render` maps a stored character to the existing `renderSelection` options.
- `character preview` and every read/mutation command receive explicit human formatting; JSON continues to use `CliResponse` unchanged.

- [x] **Step 1: Write failing render-delegation and human-output tests**

```ts
it('delegates all character render options', async () => {
  await runCharacterCommand(
    parseArgs(['character', 'render', 'hero', '--out', 'dist/hero',
      '--animation', 'walk', '--frames', 'all', '--bundle', 'zip']),
    io,
    runtime,
    { renderSelection: renderSpy, renderCharacterPreview: previewSpy },
  );
  expect(renderSpy).toHaveBeenCalledWith(expect.objectContaining({
    selectionName: 'hero', animations: ['walk'], frames: 'all', bundleZip: true,
  }));
});

it('prints actionable search and set output', async () => {
  expect(await runHuman(['character', 'search', 'hero', '--type', 'hair', '--query', 'braid']))
    .toContain('hair/Braids [braids]');
  expect(await runHuman(['character', 'set', 'hero', '--type', 'hair', '--item', 'braids']))
    .toContain('Updated hero: hair = Braids');
});
```

- [x] **Step 2: Run focused tests and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-commands.test.ts main-human.test.ts main-render-errors.test.ts
```

Expected: FAIL until render delegation and formatters are complete.

- [x] **Step 3: Implement exact render option mapping and formatters**

```ts
const result = await dependencies.renderSelection({
  runtime: runtime!,
  cwd: io.cwd,
  outDir: path.resolve(io.cwd, requiredFlag(parsed, 'out')),
  selectionName: stored.selection.name ?? stored.safeName,
  selectionJson: stored.selection,
  animations: flagStrings(parsed.flags, 'animation'),
  frames: flagString(parsed.flags, 'frames') === 'all'
    ? 'all'
    : flagStrings(parsed.flags, 'frames'),
  bundleZip: flagString(parsed.flags, 'bundle') === 'zip',
  allowPartial: flagBoolean(parsed.flags, 'allow-partial'),
});
return commandOk('character render', result, result.warnings);
```

Add focused formatters for list/show/search/create/set/remove/validate/preview/render. Human suggestions print `Did you mean:` and `Available:` from `CliIssue.details`; do not parse those values out of messages.

- [x] **Step 4: Run focused tests, full CLI tests, and typecheck**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-commands.test.ts main-human.test.ts main-render-errors.test.ts response.test.ts
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: all CLI tests PASS.

- [x] **Step 5: Commit and record**

```sh
rtk git add packages/cli/src/character-commands.ts packages/cli/src/response.ts packages/cli/test/character-commands.test.ts packages/cli/test/main-human.test.ts packages/cli/test/main-render-errors.test.ts packages/cli/test/response.test.ts
rtk git commit -m "feat(cli): complete character render workflow"
```

Then update Task 6 checkboxes and record, stage only this plan, and commit it with `rtk git commit -m "docs(plan): record character render task"`.

- Implementation: Delegated stored named and explicit-path characters to the
  existing render workflow with exact animation, frame, ZIP, and partial-mode
  option mapping. Added explicit human output for every character command,
  structured suggestions and available values, stable explicit-selection file
  stem fallback, and typed asset-store error preservation without changing the
  JSON response envelope.
- Commit: `032267353712514b77f21eca76e48a78b4ec9419`
- Verification: RED confirmed 7 expected focused failures before implementation
  and 1 expected explicit-selection stem failure during self-review. Focused
  character/response suite PASS (35 tests); full CLI suite PASS (275 passed, 1
  platform-specific skip); CLI typecheck, architecture boundary check, and
  `git diff --check` PASS. The first sandboxed full CLI run failed only because
  localhost binding was denied; the permission-enabled rerun passed all 30 test
  files.
- Review fix: Derived unnamed explicit-selection display identity from the
  response path using the same parsed file-stem convention as render, so set,
  validate, and remove retain command-specific human output without changing
  response data or JSON. Cached the preview output flag once to satisfy the
  package's `exactOptionalPropertyTypes` typecheck.
- Review-fix RED: `main-human.test.ts` failed 3 independent assertions because
  successful unnamed explicit-selection set, validate, and remove commands all
  emitted only `Character command completed.`. Package-directory typecheck also
  exposed the existing repeated preview `--out` lookup as `string | undefined`.
- Review-fix commit: `c7007b8fa89a69a48d8fe42af4c2e03630261522`
- Review-fix verification: Focused character/human/response/render-error suite
  PASS (38 tests); full CLI suite PASS (278 passed, 1 platform-specific skip);
  package-directory CLI typecheck and `git diff --check` PASS.

### Task 7: Installed Workflow Documentation and Release Verification

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/test/package-metadata.test.ts`
- Modify: `docs/superpowers/plans/2026-07-12-cli-character-authoring.md`

**Interfaces:**
- No new runtime interfaces.
- Verifies the public installed command contract outside the monorepo.

- [x] **Step 1: Add a failing package-script assertion**

```ts
it('smokes the installed character authoring workflow', () => {
  const smoke = readFileSync('scripts/smoke-packed-cli.mjs', 'utf8');
  expect(smoke).toContain("'character', 'create', 'packed-hero'");
  expect(smoke).toContain("'character', 'preview', 'packed-hero'");
  expect(smoke).toContain("'character', 'render', 'packed-hero'");
  expect(smoke).toContain('packed-hero.credits.txt');
  expect(smoke).toContain('packed-hero.credits.csv');
});
```

- [x] **Step 2: Run the focused test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
```

Expected: FAIL because the packed workflow is absent.

- [x] **Step 3: Document and add the installed workflow smoke**

Add a README quick start that requires no JSON editing:

```sh
lpc-toolkit character create hero --preset farmer
lpc-toolkit character search hero --type hair --query braid
lpc-toolkit character set hero --type hair --item braid --recolor brown
lpc-toolkit character preview hero
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

In `smoke-packed-cli.mjs`, invoke the installed binary with the prepared cache, create from `farmer`, search, set a fixture-confirmed valid item, preview, and render. Assert PNG, metadata, TXT, and CSV files for preview and render. Keep cleanup inside the existing `finally` guard and do not download a second asset release.

- [x] **Step 4: Run full verification**

```sh
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: all commands exit 0; CLI tests report zero failures; packed smoke prints `Packed CLI install smoke test passed.`

- [x] **Step 5: Commit implementation and final execution record**

```sh
rtk git add packages/cli/README.md packages/cli/scripts/smoke-packed-cli.mjs packages/cli/test/package-metadata.test.ts
rtk git commit -m "docs(cli): document character authoring workflow"
```

Then mark Task 7 complete, record the implementation commit and exact verification results below, stage only this plan, and commit the plan record with `rtk git commit -m "docs(plan): record final character workflow verification"`.

- Implementation: Added a no-JSON installed-package quick start and extended
  the packed tarball smoke to create a farmer character, search the production
  catalog, set the exact `hair_braid` item with its valid `lpcr.brown` recolor,
  preview it, and render it. The preview and render paths each assert their PNG,
  metadata, TXT credit, and CSV credit artifacts. All installed commands reuse
  the cache prepared by the existing web smoke and remain inside its cleanup
  guard. The executable quick start uses the catalog-confirmed item/recolor
  values rather than the draft's invalid shorthand `braid`/`brown` pair.
- Commit: `337d67d8578907d6d2b091c532ab79d1d2785c4e`
- Verification: RED confirmed the new package-metadata assertion failed 1 of 18
  tests because the installed workflow was absent; focused GREEN passed 18 of
  18. Final CLI suite PASS (279 passed, 1 platform-specific skip); CLI package
  typecheck PASS; core suite PASS (167 tests); architecture boundary check and
  `git diff --check` PASS. Packed installed-package smoke PASS and printed
  `Packed CLI install smoke test passed.` The first packed run correctly exposed
  `brown` as invalid for hair's default ULPC palette; the catalog-qualified
  `lpcr.brown` rerun passed. The first sandboxed CLI suite failed only because
  localhost binding was denied; the permission-enabled rerun passed all 30 test
  files. The RTK typecheck shorthand reported no TypeScript errors but returned
  nonzero, so `rtk pnpm --filter @lpc-toolkit/cli run typecheck` was used for the
  successful package-script verification.

## Final Review Checklist

- [ ] Every requirement in `docs/superpowers/specs/2026-07-12-cli-character-authoring-design.md` maps to a task above.
- [ ] Existing command forms and JSON envelope remain compatible.
- [ ] Unknown options fail before asset preparation.
- [ ] No mutation writes before candidate validation succeeds.
- [ ] Preview and full render use exact composed credit manifests.
- [ ] `packages/core/` remains environment-agnostic.
- [ ] No dependency or `any` was added.
- [ ] Full CLI/core/boundary/package verification evidence is recorded.
