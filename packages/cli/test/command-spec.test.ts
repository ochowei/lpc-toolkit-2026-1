import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import {
  helpForCommand,
  validateCommandOptions,
} from '../src/command-spec.js';

describe('helpForCommand', () => {
  it.each([
    ['show', ''],
    ['search', ' --type <type> [options]'],
    ['set', ' --type <type> --item <item-id-or-type/name> [options]'],
    ['remove', ' --type <type> [options]'],
    ['validate', ''],
    ['preview', ' [options]'],
    ['render', ' --out <directory> [options]'],
  ])('documents the alternative locator for character %s', (command, suffix) => {
    expect(helpForCommand(['character', command])).toContain(
      `lpc-toolkit character ${command} (<name> | --selection <file>)${suffix}`,
    );
  });

  it('renders command-specific character set help', () => {
    const help = helpForCommand(['character', 'set']);

    expect(help).toContain(
      'lpc-toolkit character set (<name> | --selection <file>)',
    );
    expect(help).toContain('--item <item-id-or-type/name>');
    expect(help).toContain('--item hair_braid --recolor lpcr.brown');
    expect(help).not.toContain('--item hair/braid --recolor brown');
  });

  it('renders command-group help for catalog', () => {
    const help = helpForCommand(['catalog']);

    expect(help).toContain('lpc-toolkit catalog items');
    expect(help).not.toContain('lpc-toolkit character set');
  });

  it('describes catalog item animation capability inspection', () => {
    expect(helpForCommand(['catalog', 'item'])).toContain(
      'Show one catalog item with credits and animation capabilities.',
    );
  });

  it('documents character creation and preview defaults', () => {
    const createHelp = helpForCommand(['character', 'create']);
    expect(createHelp).toContain('Default: male');
    expect(createHelp).toContain(
      '--selection <file>  Write the new selection to this explicit path.',
    );

    const previewHelp = helpForCommand(['character', 'preview']);
    expect(previewHelp).toContain('Default: walk');
    expect(previewHelp).toContain('Default: down');
    expect(previewHelp).toContain('Default: 0');
  });

  it('distinguishes selection input help from the create destination', () => {
    expect(helpForCommand(['character', 'show'])).toContain(
      '--selection <file>  Read a Toolkit or upstream selection JSON file.',
    );
    expect(helpForCommand(['character', 'create'])).toContain(
      '--selection <file>  Write the new selection to this explicit path.',
    );
  });

  it('describes the offline animation viewer for every full render command', () => {
    for (const command of [
      ['render'],
      ['preset', 'render'],
      ['character', 'render'],
    ]) {
      expect(helpForCommand(command)).toContain(
        'Render an attributed spritesheet with an offline animation viewer.',
      );
    }
  });

  it('documents discovery pagination options', () => {
    for (const command of [['catalog', 'items'], ['character', 'search']]) {
      const help = helpForCommand(command);
      expect(help).toContain('--limit <count>');
      expect(help).toContain('Default: 20');
      expect(help).toContain('--offset <count>');
      expect(help).toContain('--all');
    }
  });

  it('documents animation audit options without discovery pagination', () => {
    const help = helpForCommand(['catalog', 'audit-animations']);

    expect(help).toContain('lpc-toolkit catalog audit-animations --animation <name>');
    expect(help).toContain('--animation <name>');
    expect(help).toContain('--type <typeName>');
    expect(help).toContain('--body-type <type>');
    expect(help).not.toContain('--limit');
    expect(help).not.toContain('--all');
  });

  it('shows the bounded two-stage discovery workflow in help examples', () => {
    const rootHelp = helpForCommand([]);
    expect(rootHelp).toContain(
      'lpc-toolkit character search hero --type hair --query braid --limit 20 --json',
    );
    expect(rootHelp).toContain('lpc-toolkit catalog item hair_braid --json');

    expect(helpForCommand(['catalog', 'items'])).toContain(
      'lpc-toolkit catalog items --type hair --limit 20 --json',
    );
    expect(helpForCommand(['catalog', 'item'])).toContain(
      'lpc-toolkit catalog item hair_braid --json',
    );
    expect(helpForCommand(['character', 'search'])).toContain(
      'lpc-toolkit character search hero --type hair --query braid --limit 20 --json',
    );
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

  it('preserves case-sensitive suggestion distance for unknown options', () => {
    const issue = validateCommandOptions(parseArgs(['catalog', 'items', '--HELP']));

    expect(issue).toMatchObject({ code: 'unknown_option', path: '--HELP' });
    expect(issue?.details?.suggestions).toEqual([]);
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

  it('allows repeated animation audit targets', () => {
    expect(
      validateCommandOptions(
        parseArgs([
          'catalog',
          'audit-animations',
          '--animation',
          'walk',
          '--animation',
          'run',
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
