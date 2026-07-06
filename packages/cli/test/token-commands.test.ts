import { createCatalog } from '@lpc-toolkit/core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
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

  it('encodes and decodes selection json through core token helpers', () => {
    const token = encodeSelectionJsonToToken({
      schema: 'lpc-toolkit.selection.v1',
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

    const response = runTokenCommand(
      parseArgs(['token', 'encode', '--selection', 'selection.json']),
      cwd,
    );

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe('invalid_selection_json');
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
});
