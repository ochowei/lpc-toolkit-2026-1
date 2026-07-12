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

  it('parses help as a boolean flag before a positional', () => {
    expect(parseArgs(['character', 'set', '--help', 'hero'])).toEqual({
      command: ['character', 'set'],
      flags: new Map<string, FlagValue>([['help', true]]),
      positionals: ['hero'],
    });
  });
});
