import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listCharacters,
  readCharacter,
  resolveCharacterPath,
  writeCharacter,
} from '../src/character-store.js';
import { SELECTION_SCHEMA, type SelectionJson } from '../src/selection.js';

const publicationRace = vi.hoisted(() => ({
  afterTemporaryWrite: undefined as (() => void) | undefined,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync(
      file: Parameters<typeof actual.writeFileSync>[0],
      data: Parameters<typeof actual.writeFileSync>[1],
      options?: Parameters<typeof actual.writeFileSync>[2],
    ) {
      actual.writeFileSync(file, data, options);
      const afterTemporaryWrite = publicationRace.afterTemporaryWrite;
      if (afterTemporaryWrite !== undefined && String(file).endsWith('.tmp')) {
        publicationRace.afterTemporaryWrite = undefined;
        afterTemporaryWrite();
      }
    },
  };
});

const temporaryDirectories: string[] = [];

function createCwd(): string {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-character-store-'));
  temporaryDirectories.push(cwd);
  return cwd;
}

function selection(name: string, bodyType: 'male' | 'female' = 'male'): SelectionJson {
  return {
    schema: SELECTION_SCHEMA,
    name,
    bodyType,
    items: {
      body: { name: 'Body Color', recolor: 'light' },
    },
  };
}

afterEach(() => {
  publicationRace.afterTemporaryWrite = undefined;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('character path resolution', () => {
  it('resolves a portable character name inside the character directory', () => {
    const cwd = createCwd();

    expect(resolveCharacterPath(cwd, { name: 'hero.v2-alt_1' })).toBe(
      path.join(cwd, 'characters', 'hero.v2-alt_1.selection.json'),
    );
  });

  it.each(['../hero', '/hero', '.', '..', 'hero/alt'])('rejects unsafe name %s', (name) => {
    const cwd = createCwd();

    expect(() => resolveCharacterPath(cwd, { name })).toThrowError(
      expect.objectContaining({ code: 'character_name_invalid' }),
    );
  });

  it('resolves an explicit relative selection path from cwd', () => {
    const cwd = createCwd();

    expect(resolveCharacterPath(cwd, { selectionPath: 'saved/hero.json' })).toBe(
      path.join(cwd, 'saved', 'hero.json'),
    );
  });
});

describe('character persistence', () => {
  it('creates and replaces a character through a sibling temporary file', () => {
    const cwd = createCwd();
    const target = resolveCharacterPath(cwd, { name: 'hero' });

    writeCharacter(target, selection('hero'), 'create');
    expect(readCharacter(cwd, { name: 'hero' }).selection.name).toBe('hero');
    writeCharacter(target, selection('hero', 'female'), 'replace');
    expect(readCharacter(cwd, { name: 'hero' }).selection.bodyType).toBe('female');
    expect(readdirSync(path.dirname(target))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.tmp$/u)]),
    );
  });

  it('rejects create mode when the character already exists', () => {
    const cwd = createCwd();
    const target = resolveCharacterPath(cwd, { name: 'hero' });
    writeCharacter(target, selection('hero'), 'create');

    expect(() => writeCharacter(target, selection('replacement'), 'create')).toThrowError(
      expect.objectContaining({
        code: 'character_already_exists',
        path: target,
      }),
    );
    expect(readCharacter(cwd, { name: 'hero' }).selection.name).toBe('hero');
  });

  it('does not overwrite a character created during create publication', () => {
    const cwd = createCwd();
    const target = resolveCharacterPath(cwd, { name: 'hero' });
    const competingBytes = `${JSON.stringify(selection('competitor'), null, 2)}\n`;
    publicationRace.afterTemporaryWrite = () => writeFileSync(target, competingBytes);

    expect(() => writeCharacter(target, selection('ours'), 'create')).toThrowError(
      expect.objectContaining({
        code: 'character_already_exists',
        path: target,
      }),
    );
    expect(readFileSync(target, 'utf8')).toBe(competingBytes);
    expect(readdirSync(path.dirname(target))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.tmp$/u)]),
    );
  });

  it('leaves existing bytes unchanged when replacement validation fails', () => {
    const cwd = createCwd();
    const target = resolveCharacterPath(cwd, { name: 'hero' });
    writeCharacter(target, selection('hero'), 'create');
    const before = readFileSync(target);
    const invalid = { ...selection('broken'), schema: 'unsupported' } as unknown as SelectionJson;

    expect(() => writeCharacter(target, invalid, 'replace')).toThrow(
      'Unsupported selection schema: unsupported',
    );
    expect(readFileSync(target)).toEqual(before);
    expect(readdirSync(path.dirname(target))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.tmp$/u)]),
    );
  });

  it('reads and validates an explicitly located character', () => {
    const cwd = createCwd();
    const target = resolveCharacterPath(cwd, { selectionPath: 'saved/custom.json' });
    writeCharacter(target, selection('custom'), 'create');

    expect(readCharacter(cwd, { selectionPath: 'saved/custom.json' })).toMatchObject({
      path: target,
      selection: { name: 'custom' },
      parsed: { metadata: { name: 'custom' } },
    });
  });
});

describe('character listing', () => {
  it('lists only character selection files in stable name order', () => {
    const cwd = createCwd();
    writeCharacter(resolveCharacterPath(cwd, { name: 'zeta' }), selection('zeta'), 'create');
    writeCharacter(resolveCharacterPath(cwd, { name: 'Alpha' }), selection('Alpha'), 'create');
    writeFileSync(path.join(cwd, 'characters', 'notes.txt'), 'ignore me');
    const outside = path.join(cwd, 'other.selection.json');
    writeFileSync(outside, `${JSON.stringify(selection('outside'))}\n`);

    expect(listCharacters(cwd)).toMatchObject([
      { name: 'Alpha', selection: { name: 'Alpha' } },
      { name: 'zeta', selection: { name: 'zeta' } },
    ]);
  });

  it('returns invalid files with an issue without aborting the list', () => {
    const cwd = createCwd();
    const validPath = resolveCharacterPath(cwd, { name: 'valid' });
    writeCharacter(validPath, selection('valid'), 'create');
    const invalidPath = path.join(cwd, 'characters', 'broken.selection.json');
    writeFileSync(invalidPath, '{not json');

    expect(listCharacters(cwd)).toEqual([
      {
        name: 'broken',
        path: invalidPath,
        issue: expect.any(String),
      },
      {
        name: 'valid',
        path: validPath,
        selection: selection('valid'),
      },
    ]);
  });

  it('returns an empty list when the characters directory does not exist', () => {
    expect(listCharacters(createCwd())).toEqual([]);
  });
});
