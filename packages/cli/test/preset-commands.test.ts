import { createCatalog, type ItemDefinition, type PaletteMetadata } from '@lpc-toolkit/core';
import { PRESETS } from '@lpc-toolkit/presets';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import {
  listPresets,
  materializePreset,
  runPresetCommand,
} from '../src/preset-commands.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

function createRuntime(cwd: string): RuntimeAssets {
  const assetsRoot = path.join(cwd, 'assets');
  mkdirSync(assetsRoot, { recursive: true });
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
}

describe('preset commands', () => {
  it('lists built-in presets', () => {
    expect(listPresets().presets.map((preset) => preset.id)).toContain('farmer');
  });

  it('materializes a preset to selection json', () => {
    const selection = materializePreset('farmer');

    expect(selection.schema).toBe('lpc-toolkit.selection.v2');
    expect(selection.name).toBe('farmer');
    expect(selection.items.body?.name).toBe('Body Color');
  });

  it('keeps every existing built-in preset free of secondary channel output', () => {
    for (const preset of PRESETS) {
      const selection = materializePreset(preset.id);
      for (const item of Object.values(selection.items)) {
        expect(item.channelRecolors).toBeUndefined();
      }
    }
  });

  it('fills omitted preset color fields from catalog and palette defaults', () => {
    const leather: ItemDefinition = {
      name: 'Leather',
      type_name: 'armour',
      animations: ['walk'],
      credits: [],
      recolors: { material: 'cloth', palettes: ['ulpc'] },
      layer_1: { zPos: 40, male: 'armour/leather/' },
    };
    const catalog = createCatalog({ 'armour/leather.json': leather }).catalog;
    const palettes: PaletteMetadata = {
      materials: {
        cloth: {
          default: 'ulpc',
          base: 'brown',
          palettes: {
            ulpc: {
              brown: ['#5c4033'],
              green: ['#2f6f3e'],
            },
          },
        },
      },
      versions: { ulpc: {} },
    };

    const selection = materializePreset('ranger', { catalog, palettes });

    expect(selection.items.armour).toEqual({
      name: 'Leather',
      recolor: 'brown',
    });
  });

  it('requires a preset id for materialize', () => {
    const response = runPresetCommand(parseArgs(['preset', 'materialize']), '/tmp');

    expect(response.ok).toBe(false);
    expect(response.command).toBe('preset materialize');
    expect(response.errors[0]?.code).toBe('missing_argument');
  });

  it('reports unknown preset ids through the response envelope', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-preset-'));
    const response = runPresetCommand(
      parseArgs(['preset', 'materialize', 'missing']),
      cwd,
      createRuntime(cwd),
    );

    expect(response.ok).toBe(false);
    expect(response.command).toBe('preset materialize');
    expect(response.errors[0]?.code).toBe('unknown_preset');
  });

  it('writes materialized selections as pretty json with a trailing newline', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-preset-'));
    const response = runPresetCommand(
      parseArgs(['preset', 'materialize', 'farmer', '--out', 'farmer.json']),
      cwd,
      createRuntime(cwd),
    );

    expect(response.ok).toBe(true);
    const written = readFileSync(path.join(cwd, 'farmer.json'), 'utf8');
    expect(written).toBe(`${JSON.stringify(materializePreset('farmer'), null, 2)}\n`);
  });

  it('reports write failures separately from unknown presets', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-preset-'));
    mkdirSync(path.join(cwd, 'blocked'));

    const response = runPresetCommand(
      parseArgs(['preset', 'materialize', 'farmer', '--out', 'blocked']),
      cwd,
      createRuntime(cwd),
    );

    expect(response.ok).toBe(false);
    expect(response.command).toBe('preset materialize');
    expect(response.errors[0]).toMatchObject({
      code: 'preset_write_failed',
      path: 'blocked',
    });
  });
});
