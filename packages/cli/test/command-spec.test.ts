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

  it('renders the complete Phase 2 asset command tree', () => {
    const rootHelp = helpForCommand(['asset']);
    expect(rootHelp).toContain(
      'Author, package, install, inspect, and diagnose attributed artist asset packs.',
    );
    expect(rootHelp).toContain('lpc-toolkit asset workspace <command>');
    expect(rootHelp).toContain('lpc-toolkit asset init');
    expect(rootHelp).toContain('lpc-toolkit asset validate');
    expect(rootHelp).toContain('lpc-toolkit asset preview');
    expect(rootHelp).toContain('lpc-toolkit asset sync');
    expect(rootHelp).toContain('lpc-toolkit asset pack');
    expect(rootHelp).toContain('lpc-toolkit asset inspect');
    expect(rootHelp).toContain('lpc-toolkit asset install');
    expect(rootHelp).toContain('lpc-toolkit asset list');
    expect(rootHelp).toContain('lpc-toolkit asset remove');
    expect(rootHelp).toContain('lpc-toolkit asset doctor');
    expect(rootHelp).toContain(
      'lpc-toolkit asset install ./dist/acme.hair-1.0.0.lpc-assets.zip',
    );
    expect(rootHelp).toContain('lpc-toolkit asset doctor --json');
    expect(rootHelp).not.toContain(
      'Create, validate, preview, and synchronize local artist asset packs.',
    );

    const workspaceHelp = helpForCommand(['asset', 'workspace']);
    expect(workspaceHelp).toContain(
      'lpc-toolkit asset workspace init <directory>',
    );
  });

  it('documents every Phase 1 asset leaf', () => {
    expect(helpForCommand(['asset', 'workspace', 'init'])).toContain(
      'lpc-toolkit asset workspace init <directory>',
    );

    const initHelp = helpForCommand(['asset', 'init']);
    for (const option of [
      '--workspace <directory>',
      '--out <directory>',
      '--pack-id <id>',
      '--version <semver>',
      '--display-name <label>',
      '--author <name>',
      '--license <license>',
      '--url <url>',
      '--notes <text>',
      '--new',
      '--asset-id <id>',
      '--type <type>',
      '--body-type <type>',
      '--animation <name>',
      '--advanced',
      '--from-audit <report>',
      '--item <item-id>',
      '--json',
      '--help',
    ]) {
      expect(initHelp).toContain(option);
    }
    expect(initHelp).toContain('Default: 0.1.0');
    expect(initHelp).toContain('lpc-toolkit asset init --new');
    expect(initHelp).toContain('lpc-toolkit asset init --from-audit');

    const validateHelp = helpForCommand(['asset', 'validate']);
    expect(validateHelp).toContain('lpc-toolkit asset validate <pack-directory>');
    expect(validateHelp).toContain('--workspace <directory>');
    expect(validateHelp).toContain('--json');

    const previewHelp = helpForCommand(['asset', 'preview']);
    for (const option of [
      '--workspace <directory>',
      '--asset <local-id>',
      '--animation <name>',
      '--body-type <type>',
      '--character <selection.json>',
      '--json',
      '--help',
    ]) {
      expect(previewHelp).toContain(option);
    }

    const syncHelp = helpForCommand(['asset', 'sync']);
    expect(syncHelp).toContain('lpc-toolkit asset sync <pack-directory>');
    expect(syncHelp).toContain('--workspace <directory>');
    expect(syncHelp).toContain('--json');
  });

  it.each([
    [
      'pack',
      'lpc-toolkit asset pack <pack-directory> [--workspace <directory>] [--json]',
    ],
    [
      'inspect',
      'lpc-toolkit asset inspect <pack.lpc-assets.zip> [--json]',
    ],
    [
      'install',
      'lpc-toolkit asset install <pack.lpc-assets.zip> [--workspace <directory>] [--json]',
    ],
    [
      'list',
      'lpc-toolkit asset list [--workspace <directory>] [--json]',
    ],
    [
      'remove',
      'lpc-toolkit asset remove <pack-id> [--workspace <directory>] [--json]',
    ],
    [
      'doctor',
      'lpc-toolkit asset doctor [--workspace <directory>] [--json]',
    ],
  ])('documents the exact asset %s usage and an example', (command, usage) => {
    const help = helpForCommand(['asset', command]);

    expect(help).toContain(`Usage:\n  ${usage}`);
    expect(help).toContain(`Examples:\n  lpc-toolkit asset ${command}`);
    expect(help).toContain('--json');
    if (command === 'inspect') {
      expect(help).not.toContain('--workspace');
    } else {
      expect(help).toContain('--workspace <directory>');
    }
  });

  it('does not advertise unapproved lifecycle bypass or tuning options', () => {
    for (const command of ['pack', 'inspect', 'install', 'list', 'remove', 'doctor']) {
      const help = helpForCommand(['asset', command]);
      for (const option of [
        '--force',
        '--ignore-warnings',
        '--allow-downgrade',
        '--repair',
        '--archive-limit',
        '--concurrency',
      ]) {
        expect(help).not.toContain(option);
      }
    }
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

  it('allows repeatable asset scaffold selectors and credits', () => {
    expect(validateCommandOptions(parseArgs([
      'asset', 'init', '--from-audit', 'audit.json',
      '--item', 'hair_braid', '--item', 'hair_bob',
      '--type', 'hair', '--type', 'hat',
      '--animation', 'walk', '--animation', 'climb',
      '--body-type', 'male', '--body-type', 'female',
      '--author', 'Alice', '--author', 'Bob',
      '--license', 'CC-BY-SA 4.0', '--license', 'GPL 3.0',
      '--url', 'https://example.test/one', '--url', 'https://example.test/two',
    ]))).toBeUndefined();
  });

  it('rejects a repeated non-repeatable asset scaffold option', () => {
    expect(validateCommandOptions(parseArgs([
      'asset', 'init', '--pack-id', 'acme.one', '--pack-id', 'acme.two',
    ]))).toMatchObject({
      code: 'invalid_option',
      path: '--pack-id',
    });
  });

  it.each([
    ['pack', '--force'],
    ['inspect', '--archive-limit'],
    ['install', '--allow-downgrade'],
    ['list', '--concurrency'],
    ['remove', '--ignore-warnings'],
    ['doctor', '--repair'],
  ])('rejects the prohibited asset %s option %s', (command, option) => {
    const positional = command === 'pack'
      ? ['pack-directory']
      : command === 'inspect' || command === 'install'
        ? ['pack.lpc-assets.zip']
        : command === 'remove'
          ? ['acme.pack']
          : [];

    expect(validateCommandOptions(parseArgs([
      'asset', command, ...positional, option,
    ]))).toMatchObject({
      code: 'unknown_option',
      path: option,
    });
  });
});
