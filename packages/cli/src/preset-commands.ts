import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PRESETS } from '@lpc-toolkit/presets';
import { flagString, type ParsedArgs } from './args.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import { selectionJsonFromCore, type SelectionJson } from './selection.js';

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
        message: errorMessage(error),
      });
    }
  }

  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown preset command: ${parsed.command.join(' ')}`,
  });
}
