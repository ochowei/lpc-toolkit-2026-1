import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import {
  helpForCommand,
  validateCommandOptions,
} from '../src/command-spec.js';

describe('helpForCommand', () => {
  it('renders command-specific character set help', () => {
    const help = helpForCommand(['character', 'set']);

    expect(help).toContain('lpc-toolkit character set <name>');
    expect(help).toContain('--item <item-id-or-type/name>');
    expect(help).toContain('--item hair_braid --recolor lpcr.brown');
    expect(help).not.toContain('--item hair/braid --recolor brown');
  });

  it('renders command-group help for catalog', () => {
    const help = helpForCommand(['catalog']);

    expect(help).toContain('lpc-toolkit catalog items');
    expect(help).not.toContain('lpc-toolkit character set');
  });

  it('documents character creation and preview defaults', () => {
    expect(helpForCommand(['character', 'create'])).toContain('Default: male');

    const previewHelp = helpForCommand(['character', 'preview']);
    expect(previewHelp).toContain('Default: walk');
    expect(previewHelp).toContain('Default: down');
    expect(previewHelp).toContain('Default: 0');
  });
});

describe('validateCommandOptions', () => {
  it('rejects an unknown option with a suggestion', () => {
    const issue = validateCommandOptions(
      parseArgs(['catalog', 'items', '--tpye', 'hair']),
    );

    expect(issue).toMatchObject({ code: 'unknown_option', path: '--tpye' });
    expect(issue?.details?.suggestions).toContain('--type');
  });

  it('rejects a value option without a value', () => {
    expect(
      validateCommandOptions(parseArgs(['catalog', 'items', '--type'])),
    ).toMatchObject({ code: 'invalid_option', path: '--type' });
  });

  it('rejects a non-repeatable option supplied more than once', () => {
    expect(
      validateCommandOptions(
        parseArgs(['catalog', 'items', '--type', 'hair', '--type', 'body']),
      ),
    ).toMatchObject({
      code: 'invalid_option',
      message: '--type may be supplied only once.',
    });
  });

  it('allows repeatable render options', () => {
    expect(
      validateCommandOptions(
        parseArgs([
          'render',
          '--animation',
          'walk',
          '--animation',
          'idle',
          '--frames',
          'walk',
          '--frames',
          'all',
        ]),
      ),
    ).toBeUndefined();
  });

  it.each([
    ['render', '--selection', 'hero.json', '--out', 'out', '--bundle', 'tar'],
    ['character', 'render', 'hero', '--out', 'out', '--bundle', 'tar'],
  ])('rejects unsupported closed-domain option values for %s', (...argv) => {
    expect(validateCommandOptions(parseArgs(argv))).toMatchObject({
      code: 'invalid_option',
      path: '--bundle',
      details: { available: ['zip'] },
    });
  });
});
