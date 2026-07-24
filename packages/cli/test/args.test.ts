import { describe, expect, it } from 'vitest';
import { parseArgs, type FlagValue } from '../src/args.js';

describe('parseArgs', () => {
  it('parses command path, flags, and positionals', () => {
    expect(
      parseArgs([
        'catalog',
        'items',
        '--type',
        'hair',
        '--json',
        '--allow-partial',
        'extra',
      ]),
    ).toEqual({
      command: ['catalog', 'items'],
      flags: new Map<string, FlagValue>([
        ['type', 'hair'],
        ['json', true],
        ['allow-partial', true],
      ]),
      positionals: ['extra'],
    });
  });

  it('keeps repeated flags as arrays', () => {
    expect(parseArgs(['render', '--animation', 'walk', '--animation', 'idle']).flags)
      .toEqual(new Map([['animation', ['walk', 'idle']]]));
  });

  it('parses no-open as a boolean flag', () => {
    expect(parseArgs(['web', '--no-open', '--port', '0']).flags).toEqual(
      new Map<string, FlagValue>([
        ['no-open', true],
        ['port', '0'],
      ]),
    );
  });

  it('parses all as a boolean flag', () => {
    expect(parseArgs(['catalog', 'items', '--all']).flags).toEqual(
      new Map([['all', true]]),
    );
  });

  it('parses help as a boolean flag before a positional', () => {
    expect(parseArgs(['character', 'set', '--help', 'hero'])).toEqual({
      command: ['character', 'set'],
      flags: new Map<string, FlagValue>([['help', true]]),
      positionals: ['hero'],
    });
  });

  it('parses only asset workspace init as a three-token command', () => {
    expect(parseArgs(['asset', 'workspace', 'init', './artist-workspace'])).toEqual({
      command: ['asset', 'workspace', 'init'],
      flags: new Map(),
      positionals: ['./artist-workspace'],
    });

    expect(parseArgs(['asset', 'validate', './artist-packs/acme.hair'])).toEqual({
      command: ['asset', 'validate'],
      flags: new Map(),
      positionals: ['./artist-packs/acme.hair'],
    });
  });

  it('keeps existing two-token commands and their positionals unchanged', () => {
    expect(parseArgs(['character', 'set', 'hero', '--type', 'hair'])).toEqual({
      command: ['character', 'set'],
      flags: new Map([['type', 'hair']]),
      positionals: ['hero'],
    });
  });

  it('parses new and advanced as boolean asset scaffold flags', () => {
    expect(parseArgs([
      'asset', 'init', '--new', '--advanced', '--pack-id', 'acme.hair',
    ]).flags).toEqual(new Map<string, FlagValue>([
      ['new', true],
      ['advanced', true],
      ['pack-id', 'acme.hair'],
    ]));
  });
});
