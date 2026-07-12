import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  parseSelectionJson,
  type ParsedSelectionJson,
  type SelectionJson,
} from './selection.js';

const CHARACTER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SELECTION_FILE_SUFFIX = '.selection.json';

export type CharacterLocator =
  | { readonly name: string; readonly selectionPath?: never }
  | { readonly name?: never; readonly selectionPath: string };

export type CharacterStoreErrorCode =
  | 'character_name_invalid'
  | 'character_already_exists'
  | 'character_not_found'
  | 'character_invalid'
  | 'character_read_failed'
  | 'character_write_failed';

export class CharacterStoreError extends Error {
  constructor(
    readonly code: CharacterStoreErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'CharacterStoreError';
  }
}

export interface StoredCharacter {
  readonly path: string;
  readonly selection: SelectionJson;
  readonly parsed: ParsedSelectionJson;
}

export type CharacterListEntry =
  | {
      readonly name: string;
      readonly path: string;
      readonly selection: SelectionJson;
      readonly issue?: never;
    }
  | {
      readonly name: string;
      readonly path: string;
      readonly selection?: never;
      readonly issue: string;
    };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function toCharacterWriteError(error: unknown, targetPath: string): CharacterStoreError {
  if (error instanceof CharacterStoreError) return error;
  return new CharacterStoreError(
    'character_write_failed',
    `Failed to write character ${targetPath}: ${errorMessage(error)}`,
    targetPath,
  );
}

export function resolveCharacterPath(cwd: string, input: CharacterLocator): string {
  if (input.selectionPath !== undefined) return path.resolve(cwd, input.selectionPath);
  if (!CHARACTER_NAME.test(input.name) || input.name === '.' || input.name === '..') {
    throw new CharacterStoreError(
      'character_name_invalid',
      `Invalid character name: ${input.name}`,
    );
  }
  return path.join(cwd, 'characters', `${input.name}${SELECTION_FILE_SUFFIX}`);
}

export function readCharacter(cwd: string, input: CharacterLocator): StoredCharacter {
  const targetPath = resolveCharacterPath(cwd, input);
  let contents: string;
  try {
    contents = readFileSync(targetPath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new CharacterStoreError(
        'character_not_found',
        `Character does not exist: ${targetPath}`,
        targetPath,
      );
    }
    throw new CharacterStoreError(
      'character_read_failed',
      `Failed to read character ${targetPath}: ${errorMessage(error)}`,
      targetPath,
    );
  }

  try {
    const selection = JSON.parse(contents) as unknown;
    const parsed = parseSelectionJson(selection);
    return { path: targetPath, selection: selection as SelectionJson, parsed };
  } catch (error) {
    throw new CharacterStoreError(
      'character_invalid',
      `Invalid character file ${targetPath}: ${errorMessage(error)}`,
      targetPath,
    );
  }
}

export function writeCharacter(
  targetPath: string,
  selection: SelectionJson,
  mode: 'create' | 'replace',
): void {
  parseSelectionJson(selection);
  if (mode === 'create' && existsSync(targetPath)) {
    throw new CharacterStoreError(
      'character_already_exists',
      'Character already exists.',
      targetPath,
    );
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(selection, null, 2)}\n`, {
      flag: 'wx',
    });
    renameSync(temporaryPath, targetPath);
  } catch (error) {
    throw toCharacterWriteError(error, targetPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function characterNameFromFile(fileName: string): string {
  return fileName.slice(0, -SELECTION_FILE_SUFFIX.length);
}

export function listCharacters(cwd: string): readonly CharacterListEntry[] {
  const charactersPath = path.join(cwd, 'characters');
  let fileNames: string[];
  try {
    fileNames = readdirSync(charactersPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(SELECTION_FILE_SUFFIX))
      .map((entry) => entry.name);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return [];
    throw new CharacterStoreError(
      'character_read_failed',
      `Failed to list characters ${charactersPath}: ${errorMessage(error)}`,
      charactersPath,
    );
  }

  fileNames.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return fileNames.map((fileName): CharacterListEntry => {
    const name = characterNameFromFile(fileName);
    const targetPath = path.join(charactersPath, fileName);
    try {
      const stored = readCharacter(cwd, { selectionPath: targetPath });
      return { name, path: targetPath, selection: stored.selection };
    } catch (error) {
      return { name, path: targetPath, issue: errorMessage(error) };
    }
  });
}
