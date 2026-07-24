import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  computePresetSelection,
  PRESETS,
  type Preset,
} from '@lpc-toolkit/presets';
import {
  selectionJsonFromCore,
  type BodyType,
  type Catalog,
  type PaletteMetadata,
  type SelectionJson,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import {
  loadRuntimeCatalog,
  loadRuntimePalettes,
  type RuntimeAssets,
} from './runtime-assets.js';

export interface PresetSummary {
  readonly id: string;
  readonly labelKey: string;
  readonly emoji: string;
}

export function listPresets(): {
  readonly presets: readonly PresetSummary[];
} {
  return {
    presets: PRESETS.map((preset) => ({
      id: preset.id,
      labelKey: preset.labelKey,
      emoji: preset.emoji,
    })),
  };
}

export interface MaterializePresetOptions {
  readonly catalog?: Catalog;
  readonly palettes?: PaletteMetadata;
  readonly bodyType?: BodyType;
  readonly overridePresetBodyType?: boolean;
  readonly rejectSkipped?: boolean;
}

export class PresetBodyTypeError extends Error {
  readonly code = 'preset_body_type_incompatible';

  constructor(
    readonly bodyType: BodyType,
    readonly skipped: readonly { readonly typeName: string; readonly name: string }[],
  ) {
    super(
      `Preset is incompatible with body type ${bodyType}: ${skipped
        .map((item) => `${item.typeName}/${item.name}`)
        .join(', ')}`,
    );
    this.name = 'PresetBodyTypeError';
  }
}

function findPreset(id: string): Preset {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}

function materializePresetRaw(preset: Preset): SelectionJson {
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

export function materializePreset(
  id: string,
  options: MaterializePresetOptions = {},
): SelectionJson {
  const preset = findPreset(id);
  if (options.catalog && options.palettes) {
    const appliedPreset = options.overridePresetBodyType && options.bodyType
      ? { ...preset, bodyType: options.bodyType }
      : preset;
    const selection = computePresetSelection(
      appliedPreset,
      {},
      options.bodyType ?? 'male',
      options.catalog,
      options.palettes,
    );
    if (options.rejectSkipped && selection.skipped.length > 0) {
      throw new PresetBodyTypeError(selection.bodyType, selection.skipped);
    }
    if (selection.skipped.length === preset.items.length) {
      return materializePresetRaw(preset);
    }
    return selectionJsonFromCore(
      { bodyType: selection.bodyType, items: selection.selections },
      preset.id,
    );
  }

  return materializePresetRaw(preset);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runPresetCommand(
  parsed: ParsedArgs,
  cwd: string,
  runtime?: RuntimeAssets,
): CliResponse<unknown> {
  if (parsed.command[1] === 'list') {
    return commandOk('preset list', listPresets());
  }

  if (parsed.command[1] === 'materialize') {
    const id = parsed.positionals[0];
    const out = flagString(parsed.flags, 'out');
    if (!id) {
      return commandError('preset materialize', {
        code: 'missing_argument',
        message: 'Preset id is required.',
      });
    }

    if (!runtime) {
      return commandError('preset materialize', {
        code: 'assets_unavailable',
        message: 'Runtime assets are required to materialize a preset.',
      });
    }
    const catalog = loadRuntimeCatalog(runtime);
    const palettes = loadRuntimePalettes(runtime);
    const warnings = [...catalog.warnings, ...palettes.warnings];
    let selection: SelectionJson;
    try {
      selection = materializePreset(id, {
        catalog: catalog.catalog,
        palettes: palettes.palettes,
      });
    } catch (error) {
      return commandError(
        'preset materialize',
        {
          code: 'unknown_preset',
          message: errorMessage(error),
        },
        warnings,
      );
    }

    if (out) {
      try {
        writeFileSync(path.resolve(cwd, out), `${JSON.stringify(selection, null, 2)}\n`);
      } catch (error) {
        return commandError(
          'preset materialize',
          {
            code: 'preset_write_failed',
            message: errorMessage(error),
            path: out,
          },
          warnings,
        );
      }
    }

    return commandOk('preset materialize', { selection, out: out ?? null }, warnings);
  }

  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown preset command: ${parsed.command.join(' ')}`,
  });
}
