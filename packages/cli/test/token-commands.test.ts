import { createCatalog } from '@lpc-toolkit/core';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
});
