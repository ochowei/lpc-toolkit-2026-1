import { createCatalog } from '@lpc-toolkit/core';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';
import {
  decodeTokenToSelectionJson,
  encodeSelectionJsonToToken,
  runTokenCommand,
} from '../src/token-commands.js';

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

  function createRuntime(cwd: string): RuntimeAssets {
    const assetsRoot = path.join(cwd, 'assets');
    const definitionsRoot = path.join(assetsRoot, 'sheet_definitions', 'body');
    mkdirSync(definitionsRoot, { recursive: true });
    mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
    mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
    writeFileSync(
      path.join(definitionsRoot, 'body.json'),
      JSON.stringify({
        name: 'Body Color',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 10, male: 'body/bodies/male/' },
      }),
    );
    const store = createDirectoryAssetStore(assetsRoot);
    return {
      context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
      store,
      source: 'working-directory',
    };
  }

  it('encodes and decodes selection json through core token helpers', () => {
    const token = encodeSelectionJsonToToken({
      schema: 'lpc-toolkit.selection.v2',
      name: 'hero',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    });

    expect(decodeTokenToSelectionJson(token, catalog).bodyType).toBe('male');
    expect(decodeTokenToSelectionJson(` ${token}\n`, catalog).items.body?.name).toBe(
      'Body Color',
    );
  });

  it('reports malformed selection files as command errors', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-token-'));
    writeFileSync(path.join(cwd, 'selection.json'), '{');
    const runtime = createRuntime(cwd);

    const response = runTokenCommand(
      parseArgs(['token', 'encode', '--selection', 'selection.json']),
      cwd,
      runtime,
    );

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe('invalid_selection_json');
  });

  it('encodes upstream v2 without rewriting the source file', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-token-'));
    const runtime = createRuntime(cwd);
    const selectionPath = path.join(cwd, 'upstream.json');
    const source = `${JSON.stringify({
      version: 2,
      bodyType: 'male',
      selections: { body: { itemId: 'body' } },
    }, null, 2)}\n`;
    writeFileSync(selectionPath, source);

    const response = runTokenCommand(
      parseArgs(['token', 'encode', '--selection', 'upstream.json']),
      cwd,
      runtime,
    );

    expect(response).toMatchObject({
      ok: true,
      command: 'token encode',
      data: {
        token: encodeSelectionJsonToToken({
          schema: 'lpc-toolkit.selection.v2',
          bodyType: 'male',
          items: { body: { name: 'Body Color' } },
        }),
      },
    });
    expect(readFileSync(selectionPath, 'utf8')).toBe(source);
  });

  it('preserves selection import error codes and paths while encoding', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-token-'));
    const runtime = createRuntime(cwd);
    writeFileSync(path.join(cwd, 'upstream.json'), JSON.stringify({ version: 3 }));

    const response = runTokenCommand(
      parseArgs(['token', 'encode', '--selection', 'upstream.json']),
      cwd,
      runtime,
    );

    expect(response.errors[0]).toEqual(expect.objectContaining({
      code: 'unsupported_upstream_version',
      path: 'version',
    }));
  });

  it('preserves decode warnings in command responses', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-token-'));
    const definitionsRoot = path.join(cwd, 'assets', 'sheet_definitions', 'body');
    mkdirSync(definitionsRoot, { recursive: true });
    writeFileSync(
      path.join(definitionsRoot, 'body.json'),
      JSON.stringify({
        name: 'Body Color',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 10, male: 'body/bodies/male/' },
      }),
    );

    const response = runTokenCommand(
      parseArgs(['token', 'decode', '--token', 'sex=male&hat=Missing']),
      cwd,
    );

    expect(response.ok).toBe(true);
    expect(response.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'token_warning_unknown_type_name',
          path: 'hat',
        }),
      ]),
    );
  });

  it('preserves catalog warnings when token decoding fails', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-token-'));
    const definitionsRoot = path.join(cwd, 'assets', 'sheet_definitions');
    mkdirSync(definitionsRoot, { recursive: true });
    writeFileSync(
      path.join(definitionsRoot, 'broken.json'),
      JSON.stringify({ name: 'Broken' }),
    );

    const response = runTokenCommand(
      parseArgs(['token', 'decode', '--token', 'v1.A']),
      cwd,
    );

    expect(response.ok).toBe(false);
    expect(response.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'catalog_warning', path: 'broken.json' }),
      ]),
    );
  });
});
