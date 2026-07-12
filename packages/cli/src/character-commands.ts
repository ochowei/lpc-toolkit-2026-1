import path from 'node:path';
import {
  flagBoolean,
  flagString,
  flagStrings,
  type ParsedArgs,
} from './args.js';
import { AssetStoreError } from './asset-store.js';
import {
  CharacterEditError,
  createEmptyCharacter,
  removeCharacterItem,
  searchCharacterItems,
  setCharacterItem,
  type CharacterCatalogContext,
} from './character-editor.js';
import {
  CharacterStoreError,
  listCharacters,
  readCharacter,
  resolveCharacterPath,
  writeCharacter,
  type CharacterLocator,
} from './character-store.js';
import { SelectionOutputError } from './compose-selection.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import type { CliIo } from './main.js';
import { materializePreset } from './preset-commands.js';
import {
  PreviewError,
  previewIssue,
  renderCharacterPreview,
  type CharacterPreviewResult,
} from './preview.js';
import { renderSelection } from './render.js';
import {
  commandError,
  commandOk,
  type CliIssue,
  type CliResponse,
} from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';
import {
  parseSelectionJson,
  selectionJsonFromCore,
  type SelectionJson,
} from './selection.js';
import { validateSelections, type ValidationResult } from './validation.js';

export interface CharacterCommandDependencies {
  readonly renderSelection: typeof renderSelection;
  readonly renderCharacterPreview: typeof renderCharacterPreview;
}

const DEFAULT_DEPENDENCIES: CharacterCommandDependencies = {
  renderSelection,
  renderCharacterPreview,
};

class CharacterUsageError extends Error {
  constructor(readonly issue: CliIssue) {
    super(issue.message);
    this.name = 'CharacterUsageError';
  }
}

interface LoadedCharacterContext {
  readonly editor: CharacterCatalogContext;
  readonly warnings: readonly CliIssue[];
}

function usageError(code: string, message: string, pathName?: string): CharacterUsageError {
  return new CharacterUsageError({
    code,
    message,
    ...(pathName === undefined ? {} : { path: pathName }),
  });
}

function requiredFlag(parsed: ParsedArgs, name: string): string {
  const value = flagString(parsed.flags, name);
  if (!value) throw usageError('missing_argument', `--${name} is required.`, `--${name}`);
  return value;
}

function previewFrameIndex(value: string | undefined): number {
  if (value === undefined) return 0;
  if (!/^-?(?:0|[1-9]\d*)$/u.test(value)) {
    throw previewIssue('preview_frame_out_of_range', value);
  }
  return Number(value);
}

function characterLocator(parsed: ParsedArgs): CharacterLocator {
  if (parsed.positionals.length > 1) {
    throw usageError(
      'unexpected_argument',
      'Character commands accept exactly one positional locator.',
    );
  }
  const name = parsed.positionals[0];
  const selectionPath = flagString(parsed.flags, 'selection');
  if (name && selectionPath) {
    throw usageError(
      'character_locator_conflict',
      'Use a name or --selection, not both.',
    );
  }
  if (selectionPath) return { selectionPath };
  if (name) return { name };
  throw usageError('missing_argument', 'Character name or --selection is required.');
}

function requireRuntime(runtime: RuntimeAssets | undefined): RuntimeAssets {
  if (!runtime) {
    throw usageError(
      'assets_unavailable',
      'Runtime assets are required for this character command.',
    );
  }
  return runtime;
}

function loadCharacterContext(runtime: RuntimeAssets): LoadedCharacterContext {
  const context = runtime.context;
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  return {
    editor: {
      catalog: catalog.catalog,
      palettes: palettes.palettes,
      pathExists: (spritePath) => runtime.store.has(spritePath),
    },
    warnings: [...catalog.warnings, ...palettes.warnings],
  };
}

function validateCandidate(
  selection: SelectionJson,
  context: LoadedCharacterContext,
): ValidationResult {
  return validateSelections(parseSelectionJson(selection).selections, context.editor);
}

function validationFailure(
  command: string,
  validation: ValidationResult,
  warnings: readonly CliIssue[],
): CliResponse<null> {
  return {
    ok: false,
    command,
    data: null,
    warnings: [...warnings, ...validation.warnings],
    errors: validation.errors,
  };
}

function issueFromError(error: unknown): CliIssue {
  if (error instanceof CharacterUsageError) return error.issue;
  if (error instanceof CharacterStoreError || error instanceof CharacterEditError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.path === undefined ? {} : { path: error.path }),
      ...(
        error instanceof CharacterEditError && error.details !== undefined
          ? { details: error.details }
          : {}
      ),
    };
  }
  if (error instanceof PreviewError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.path === undefined ? {} : { path: error.path }),
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof SelectionOutputError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.issues[0]?.path === undefined ? {} : { path: error.issues[0].path }),
      ...(error.issues[0]?.details === undefined ? {} : { details: error.issues[0].details }),
    };
  }
  if (error instanceof AssetStoreError) {
    return { code: error.code, message: error.message, path: error.path };
  }
  return {
    code: 'character_command_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

function commandName(parsed: ParsedArgs): string {
  return parsed.command.join(' ') || 'character';
}

export function characterCommandNeedsAssets(parsed: ParsedArgs): boolean {
  if (parsed.flags.has('help')) return false;
  const subcommand = parsed.command[1];
  if (subcommand === 'list') return false;
  if (subcommand === 'create') return flagString(parsed.flags, 'preset') !== undefined;
  return subcommand === 'search' || subcommand === 'set' || subcommand === 'remove' ||
    subcommand === 'show' ||
    subcommand === 'validate' || subcommand === 'preview' || subcommand === 'render';
}

export async function runCharacterCommand(
  parsed: ParsedArgs,
  io: CliIo,
  runtime?: RuntimeAssets,
  dependencies: CharacterCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<CliResponse<unknown>> {
  const subcommand = parsed.command[1];
  try {
    if (subcommand === 'create') {
      const name = parsed.positionals[0];
      if (!name) throw usageError('missing_argument', 'Character name is required.');
      if (parsed.positionals.length > 1) {
        throw usageError('unexpected_argument', 'character create accepts one name.');
      }
      const namedPath = resolveCharacterPath(io.cwd, { name });
      const selectionPath = flagString(parsed.flags, 'selection');
      const targetPath = selectionPath === undefined
        ? namedPath
        : resolveCharacterPath(io.cwd, { selectionPath });
      const presetId = flagString(parsed.flags, 'preset');
      const bodyType = flagString(parsed.flags, 'body-type') ?? 'male';
      const emptySelection = createEmptyCharacter(name, bodyType);
      let selection: SelectionJson;
      let warnings: readonly CliIssue[] = [];
      if (presetId) {
        const loaded = loadCharacterContext(requireRuntime(runtime));
        warnings = loaded.warnings;
        try {
          const preset = materializePreset(presetId, {
            catalog: loaded.editor.catalog,
            palettes: loaded.editor.palettes,
            bodyType: emptySelection.bodyType,
          });
          selection = { ...preset, name };
        } catch (error) {
          return commandError('character create', {
            code: 'unknown_preset',
            message: error instanceof Error ? error.message : String(error),
          }, warnings);
        }
        const validation = validateCandidate(selection, loaded);
        if (!validation.ok) return validationFailure('character create', validation, warnings);
        warnings = [...warnings, ...validation.warnings];
      } else {
        selection = emptySelection;
      }
      writeCharacter(targetPath, selection, 'create');
      return commandOk('character create', { path: targetPath, selection }, warnings);
    }

    if (subcommand === 'list') {
      if (parsed.positionals.length > 0) {
        throw usageError('unexpected_argument', 'character list does not accept a locator.');
      }
      const characters = listCharacters(io.cwd);
      return commandOk('character list', { characters, count: characters.length });
    }

    if (subcommand === 'show') {
      const stored = readCharacter(io.cwd, characterLocator(parsed));
      const loaded = loadCharacterContext(requireRuntime(runtime));
      const validation = validateSelections(stored.parsed.selections, loaded.editor);
      return commandOk('character show', {
        path: stored.path,
        selection: stored.selection,
        valid: validation.ok,
        validation: { warnings: validation.warnings, errors: validation.errors },
      }, [...loaded.warnings, ...validation.warnings]);
    }

    if (subcommand === 'search') {
      const stored = readCharacter(io.cwd, characterLocator(parsed));
      const loaded = loadCharacterContext(requireRuntime(runtime));
      const typeName = requiredFlag(parsed, 'type');
      const query = flagString(parsed.flags, 'query');
      const result = searchCharacterItems(
        stored.parsed.selections,
        { typeName, ...(query === undefined ? {} : { query }) },
        loaded.editor,
      );
      return commandOk('character search', result, loaded.warnings);
    }

    if (subcommand === 'set') {
      const locator = characterLocator(parsed);
      const stored = readCharacter(io.cwd, locator);
      const loaded = loadCharacterContext(requireRuntime(runtime));
      const typeName = requiredFlag(parsed, 'type');
      const itemRef = requiredFlag(parsed, 'item');
      const variant = flagString(parsed.flags, 'variant');
      const recolor = flagString(parsed.flags, 'recolor');
      const edited = setCharacterItem(stored.parsed.selections, {
        typeName,
        itemRef,
        ...(variant === undefined ? {} : { variant }),
        ...(recolor === undefined ? {} : { recolor }),
      }, loaded.editor);
      const candidate = selectionJsonFromCore(edited.selections, stored.selection.name);
      const validation = validateCandidate(candidate, loaded);
      if (!validation.ok) return validationFailure('character set', validation, loaded.warnings);
      writeCharacter(stored.path, candidate, 'replace');
      return commandOk('character set', {
        path: stored.path,
        selection: candidate,
        typeName,
        item: candidate.items[typeName],
        replaced: edited.replaced,
      }, [...loaded.warnings, ...validation.warnings]);
    }

    if (subcommand === 'remove') {
      const stored = readCharacter(io.cwd, characterLocator(parsed));
      const typeName = requiredFlag(parsed, 'type');
      const edited = removeCharacterItem(stored.parsed.selections, typeName);
      const candidate = selectionJsonFromCore(edited.selections, stored.selection.name);
      const loaded = loadCharacterContext(requireRuntime(runtime));
      const validation = validateCandidate(candidate, loaded);
      if (!validation.ok) return validationFailure('character remove', validation, loaded.warnings);
      writeCharacter(stored.path, candidate, 'replace');
      return commandOk('character remove', {
        path: stored.path,
        selection: candidate,
        typeName,
      }, [...loaded.warnings, ...validation.warnings]);
    }

    if (subcommand === 'validate') {
      const stored = readCharacter(io.cwd, characterLocator(parsed));
      const loaded = loadCharacterContext(requireRuntime(runtime));
      const validation = validateSelections(stored.parsed.selections, loaded.editor);
      if (!validation.ok) return validationFailure('character validate', validation, loaded.warnings);
      return commandOk('character validate', {
        path: stored.path,
        selection: stored.selection,
        valid: true,
      }, [...loaded.warnings, ...validation.warnings]);
    }

    if (subcommand === 'preview') {
      const locator = characterLocator(parsed);
      const stored = readCharacter(io.cwd, locator);
      const frameValue = flagString(parsed.flags, 'frame');
      const result: CharacterPreviewResult = await dependencies.renderCharacterPreview({
        runtime: requireRuntime(runtime),
        cwd: io.cwd,
        selectionPath: stored.path,
        ...(locator.name === undefined ? {} : { characterName: locator.name }),
        ...(flagString(parsed.flags, 'out') === undefined
          ? {}
          : { outDir: flagString(parsed.flags, 'out') }),
        animation: flagString(parsed.flags, 'animation') ?? 'walk',
        direction: flagString(parsed.flags, 'direction') ?? 'down',
        frameIndex: previewFrameIndex(frameValue),
      });
      return commandOk('character preview', result, result.warnings);
    }

    if (subcommand === 'render') {
      const locator = characterLocator(parsed);
      const stored = readCharacter(io.cwd, locator);
      const result = await dependencies.renderSelection({
        runtime: requireRuntime(runtime),
        cwd: io.cwd,
        outDir: path.resolve(io.cwd, requiredFlag(parsed, 'out')),
        selectionName: stored.selection.name ?? locator.name ?? path.parse(stored.path).name,
        selectionJson: stored.selection,
        animations: flagStrings(parsed.flags, 'animation'),
        frames: flagString(parsed.flags, 'frames') === 'all'
          ? 'all'
          : flagStrings(parsed.flags, 'frames'),
        bundleZip: flagString(parsed.flags, 'bundle') === 'zip',
        allowPartial: flagBoolean(parsed.flags, 'allow-partial'),
      });
      return commandOk('character render', result, result.warnings);
    }

    return commandError(commandName(parsed), {
      code: 'unknown_command',
      message: `Unknown character command: ${commandName(parsed)}`,
    });
  } catch (error) {
    return commandError(commandName(parsed), issueFromError(error));
  }
}
