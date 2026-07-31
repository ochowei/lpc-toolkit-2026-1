import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/args.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { runCharacterCommand } from '../src/character-commands.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli, type CliIo } from '../src/main.js';
import { previewIssue } from '../src/preview.js';
import type { CliResponse } from '../src/response.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

function createFixture(): {
  readonly cwd: string;
  readonly io: CliIo;
  readonly runtime: RuntimeAssets;
} {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-character-commands-'));
  const assetsRoot = path.join(cwd, 'assets');
  const definitionsRoot = path.join(assetsRoot, 'sheet_definitions');
  mkdirSync(path.join(definitionsRoot, 'body'), { recursive: true });
  mkdirSync(path.join(definitionsRoot, 'hair'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  writeFileSync(path.join(definitionsRoot, 'body', 'body.json'), JSON.stringify({
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk'],
    credits: [],
    recolors: { material: 'skin', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'body/bodies/male/' },
  }));
  mkdirSync(path.join(assetsRoot, 'palette_definitions', 'skin'), { recursive: true });
  writeFileSync(
    path.join(assetsRoot, 'palette_definitions', 'skin', 'meta_skin.json'),
    JSON.stringify({ type: 'material', default: 'ulpc', base: 'light' }),
  );
  writeFileSync(
    path.join(assetsRoot, 'palette_definitions', 'skin', 'skin_ulpc.json'),
    JSON.stringify({ light: ['#f0c8a0'] }),
  );
  writeFileSync(path.join(definitionsRoot, 'hair', 'braids.json'), JSON.stringify({
    name: 'Braids',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    variants: ['brown'],
    layer_1: { zPos: 50, male: 'hair/braids/' },
  }));
  writeFileSync(path.join(definitionsRoot, 'hair', 'bob.json'), JSON.stringify({
    name: 'Bob',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/bob',
      notes: '',
      authors: ['Artist'],
      licenses: ['GPL 3.0'],
      urls: [],
    }],
    layer_1: { zPos: 50, male: 'hair/bob/' },
  }));
  writeFileSync(path.join(definitionsRoot, 'hair', 'two-tone.json'), JSON.stringify({
    name: 'Two Tone',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    recolors: {
      color_1: { material: 'hair', palettes: ['ulpc'] },
      color_2: { material: 'eyes', palettes: ['ulpc'], type_name: 'eyes' },
      color_3: {
        material: 'skin',
        palettes: ['ulpc'],
        type_name: 'skin-shadow',
        linked_to: { selection: 'body', channel: 'primary' },
      },
    },
    layer_1: { zPos: 50, male: 'hair/two-tone/male/' },
  }));
  mkdirSync(path.join(assetsRoot, 'spritesheets', 'hair', 'two-tone', 'male'), {
    recursive: true,
  });
  writeFileSync(
    path.join(assetsRoot, 'spritesheets', 'hair', 'two-tone', 'male', 'walk.png'),
    '',
  );
  for (const [material, base, colors] of [
    ['hair', 'black', { black: ['#111111'], red: ['#cc0000'] }],
    ['eyes', 'blue', { blue: ['#0000cc'], green: ['#00aa00'] }],
  ] as const) {
    mkdirSync(path.join(assetsRoot, 'palette_definitions', material), { recursive: true });
    writeFileSync(
      path.join(assetsRoot, 'palette_definitions', material, `meta_${material}.json`),
      JSON.stringify({ type: 'material', default: 'ulpc', base }),
    );
    writeFileSync(
      path.join(assetsRoot, 'palette_definitions', material, `${material}_ulpc.json`),
      JSON.stringify(colors),
    );
  }
  const directoryStore = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: directoryStore.baseUrl }),
    store: { ...directoryStore, has: () => true },
    source: 'working-directory',
  };
  return {
    cwd,
    io: { cwd, stdout: () => undefined, stderr: () => undefined },
    runtime,
  };
}

async function run(
  fixture: ReturnType<typeof createFixture>,
  argv: readonly string[],
): Promise<{ readonly response: CliResponse<unknown> }> {
  return {
    response: await runCharacterCommand(parseArgs(argv), fixture.io, fixture.runtime),
  };
}

function writeUpstreamCharacter(
  fixture: ReturnType<typeof createFixture>,
  selectionPath: string,
  selections: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
    body: { itemId: 'body' },
  },
): string {
  const targetPath = path.join(fixture.cwd, selectionPath);
  const original = `${JSON.stringify({
    version: 2,
    bodyType: 'male',
    selections,
  }, null, 2)}\n`;
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, original);
  return original;
}

describe('character commands', () => {
  it('shows upstream input as canonical without rewriting the source', async () => {
    const fixture = createFixture();
    const original = writeUpstreamCharacter(fixture, 'saved/upstream.json');
    const response = (await run(fixture, [
      'character', 'show', '--selection', 'saved/upstream.json', '--json',
    ])).response;

    expect(response).toMatchObject({
      ok: true,
      data: {
        selection: {
          schema: 'lpc-toolkit.selection.v2',
          bodyType: 'male',
          items: { body: { name: 'Body Color' } },
        },
      },
    });
    expect(readFileSync(path.join(fixture.cwd, 'saved/upstream.json'), 'utf8')).toBe(original);
  });

  it.each([
    ['set', ['--type', 'hair', '--item', 'braids']],
    ['remove', ['--type', 'body']],
  ] as const)('normalizes upstream input after successful character %s', async (command, args) => {
    const fixture = createFixture();
    writeUpstreamCharacter(fixture, 'saved/upstream.json');
    const response = (await run(fixture, [
      'character', command, '--selection', 'saved/upstream.json', ...args, '--json',
    ])).response;

    expect(response.ok).toBe(true);
    expect(response.warnings).toContainEqual(expect.objectContaining({
      code: 'selection_format_normalized',
      path: path.join(fixture.cwd, 'saved/upstream.json'),
    }));
    expect(JSON.parse(readFileSync(
      path.join(fixture.cwd, 'saved/upstream.json'),
      'utf8',
    ))).toMatchObject({ schema: 'lpc-toolkit.selection.v2' });
  });

  it('warns when a successful mutation upgrades Toolkit v1 input to v2', async () => {
    const fixture = createFixture();
    const selectionPath = path.join(fixture.cwd, 'saved/legacy.json');
    mkdirSync(path.dirname(selectionPath), { recursive: true });
    writeFileSync(selectionPath, JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    }));

    const response = (await run(fixture, [
      'character', 'set', '--selection', 'saved/legacy.json',
      '--type', 'hair', '--item', 'braids', '--json',
    ])).response;

    expect(response).toMatchObject({
      ok: true,
      warnings: [expect.objectContaining({
        code: 'selection_format_normalized',
        path: selectionPath,
      })],
    });
    expect(JSON.parse(readFileSync(selectionPath, 'utf8'))).toMatchObject({
      schema: 'lpc-toolkit.selection.v2',
    });
  });

  it('sets and clears an asset-owned color channel through the JSON command', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set', 'hero', '--type', 'hair', '--item', 'two-tone',
    ])).response.ok).toBe(true);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli([
      'character', 'set-color', 'hero', '--type', 'hair', '--channel', 'eyes',
      '--color', 'green', '--json',
    ], {
      cwd: fixture.cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });
    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    const setResponse = JSON.parse(stdout.join('')) as CliResponse<unknown>;
    expect(setResponse).toMatchObject({
      ok: true,
      command: 'character set-color',
      data: {
        typeName: 'hair',
        channel: 'eyes',
        color: 'green',
        default: false,
        selection: {
          schema: 'lpc-toolkit.selection.v2',
          items: { hair: { name: 'Two Tone', channelRecolors: { eyes: 'green' } } },
        },
      },
      errors: [],
    });

    const clearResponse = (await run(fixture, [
      'character', 'set-color', 'hero', '--type', 'hair', '--channel', 'eyes',
      '--default', '--json',
    ])).response;
    expect(clearResponse).toMatchObject({
      ok: true,
      command: 'character set-color',
      data: {
        channel: 'eyes',
        color: null,
        default: true,
        selection: { items: { hair: { name: 'Two Tone' } } },
      },
    });
    expect(JSON.parse(readFileSync(
      path.join(fixture.cwd, 'characters/hero.selection.json'),
      'utf8',
    )).items.hair).not.toHaveProperty('channelRecolors');
  });

  it('sets and clears the primary channel without disturbing secondary colors', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set', 'hero', '--type', 'hair', '--item', 'two-tone',
    ])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set-color', 'hero', '--type', 'hair', '--channel', 'eyes',
      '--color', 'green',
    ])).response.ok).toBe(true);

    const setPrimary = (await run(fixture, [
      'character', 'set-color', 'hero', '--type', 'hair', '--channel', 'primary',
      '--color', 'red',
    ])).response;
    expect(setPrimary).toMatchObject({
      ok: true,
      data: {
        selection: {
          items: { hair: { recolor: 'red', channelRecolors: { eyes: 'green' } } },
        },
      },
    });

    const clearPrimary = (await run(fixture, [
      'character', 'set-color', 'hero', '--type', 'hair', '--channel', 'primary',
      '--default',
    ])).response;
    expect(clearPrimary).toMatchObject({
      ok: true,
      data: {
        selection: { items: { hair: { channelRecolors: { eyes: 'green' } } } },
      },
    });
    expect(clearPrimary.data).not.toMatchObject({
      selection: { items: { hair: { recolor: expect.anything() } } },
    });
  });

  it.each([
    [
      ['--channel', 'missing', '--color', 'green'],
      { code: 'unknown_color_channel', path: 'hair/missing' },
    ],
    [
      ['--channel', 'eyes', '--color', 'orange'],
      { code: 'invalid_channel_color', path: 'hair/eyes' },
    ],
    [
      ['--channel', 'skin-shadow', '--color', 'light'],
      { code: 'linked_color_channel', path: 'hair/skin-shadow' },
    ],
    [
      ['--channel', 'skin-shadow', '--default'],
      { code: 'linked_color_channel', path: 'hair/skin-shadow' },
    ],
  ] as const)('rejects invalid channel edits atomically: %j', async (args, issue) => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set', 'hero', '--type', 'hair', '--item', 'two-tone',
    ])).response.ok).toBe(true);
    const target = path.join(fixture.cwd, 'characters/hero.selection.json');
    const before = readFileSync(target, 'utf8');

    const response = (await run(fixture, [
      'character', 'set-color', 'hero', '--type', 'hair', ...args, '--json',
    ])).response;

    expect(response).toMatchObject({ ok: false, command: 'character set-color', errors: [issue] });
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('requires exactly one color action and leaves the character unchanged', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set', 'hero', '--type', 'hair', '--item', 'two-tone',
    ])).response.ok).toBe(true);
    const target = path.join(fixture.cwd, 'characters/hero.selection.json');
    const before = readFileSync(target, 'utf8');

    for (const action of [[], ['--color', 'green', '--default']] as const) {
      const response = (await run(fixture, [
        'character', 'set-color', 'hero', '--type', 'hair', '--channel', 'eyes',
        ...action,
      ])).response;
      expect(response.errors[0]).toMatchObject({ code: 'color_action_required' });
      expect(readFileSync(target, 'utf8')).toBe(before);
    }
  });

  it('upgrades v1 after set-color and emits a normalization warning', async () => {
    const fixture = createFixture();
    const selectionPath = path.join(fixture.cwd, 'saved/legacy-color.json');
    mkdirSync(path.dirname(selectionPath), { recursive: true });
    writeFileSync(selectionPath, JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items: { hair: { name: 'Two Tone' } },
    }));

    const response = (await run(fixture, [
      'character', 'set-color', '--selection', selectionPath,
      '--type', 'hair', '--channel', 'eyes', '--color', 'green', '--json',
    ])).response;

    expect(response).toMatchObject({
      ok: true,
      warnings: [expect.objectContaining({
        code: 'selection_format_normalized',
        path: selectionPath,
      })],
    });
    expect(JSON.parse(readFileSync(selectionPath, 'utf8'))).toMatchObject({
      schema: 'lpc-toolkit.selection.v2',
      items: { hair: { channelRecolors: { eyes: 'green' } } },
    });
  });

  it('prints a focused human confirmation for set-color', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set', 'hero', '--type', 'hair', '--item', 'two-tone',
    ])).response.ok).toBe(true);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'character', 'set-color', 'hero', '--type', 'hair', '--channel', 'eyes',
      '--color', 'green',
    ], {
      cwd: fixture.cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect({ code, stderr, stdout }).toEqual({
      code: 0,
      stderr: [],
      stdout: ['Updated hero: hair.eyes = green\n'],
    });
  });

  it('keeps upstream bytes unchanged when import validation fails', async () => {
    const fixture = createFixture();
    const original = writeUpstreamCharacter(fixture, 'saved/upstream.json', {
      body: { itemId: 'body' },
      hair: { itemId: 'missing' },
    });

    const response = (await run(fixture, [
      'character', 'remove', '--selection', 'saved/upstream.json', '--type', 'body', '--json',
    ])).response;

    expect(response).toMatchObject({
      ok: false,
      errors: [{ code: 'unknown_upstream_item', path: 'selections.hair.itemId' }],
    });
    expect(readFileSync(path.join(fixture.cwd, 'saved/upstream.json'), 'utf8')).toBe(original);
  });

  it('overrides a preset body type only when --body-type is explicit', async () => {
    const implicitFixture = createFixture();
    const explicitFixture = createFixture();
    const materializePreset = vi.fn().mockReturnValue({
      schema: 'lpc-toolkit.selection.v1',
      name: 'future-preset',
      bodyType: 'female',
      items: {},
    });
    const dependencies = {
      renderSelection: vi.fn(),
      renderCharacterPreview: vi.fn(),
      materializePreset,
    };

    const implicit = await runCharacterCommand(
      parseArgs(['character', 'create', 'implicit', '--preset', 'future-preset']),
      implicitFixture.io,
      implicitFixture.runtime,
      dependencies,
    );
    const explicit = await runCharacterCommand(
      parseArgs([
        'character', 'create', 'explicit', '--preset', 'future-preset',
        '--body-type', 'female',
      ]),
      explicitFixture.io,
      explicitFixture.runtime,
      dependencies,
    );

    expect(implicit).toMatchObject({ ok: true, data: { selection: { bodyType: 'female' } } });
    expect(explicit).toMatchObject({ ok: true, data: { selection: { bodyType: 'female' } } });
    expect(materializePreset).toHaveBeenNthCalledWith(1, 'future-preset', expect.not.objectContaining({
      overridePresetBodyType: true,
    }));
    expect(materializePreset).toHaveBeenNthCalledWith(2, 'future-preset', expect.objectContaining({
      bodyType: 'female',
      overridePresetBodyType: true,
    }));
  });

  it('delegates all character render options', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const renderSelection = vi.fn().mockResolvedValue({
      artifacts: [{ type: 'sheet', path: path.join(fixture.cwd, 'dist/hero/hero.sheet.png') }],
      warnings: [],
      metadataPath: path.join(fixture.cwd, 'dist/hero/hero.metadata.json'),
    });

    const response = await runCharacterCommand(
      parseArgs([
        'character', 'render', 'hero', '--out', 'dist/hero',
        '--animation', 'walk', '--animation', 'slash', '--frames', 'all',
        '--bundle', 'zip', '--allow-partial',
      ]),
      fixture.io,
      fixture.runtime,
      { renderSelection, renderCharacterPreview: vi.fn() },
    );

    expect(renderSelection).toHaveBeenCalledWith({
      runtime: fixture.runtime,
      cwd: fixture.cwd,
      outDir: path.join(fixture.cwd, 'dist/hero'),
      selectionName: 'hero',
      selectionJson: expect.objectContaining({ name: 'hero' }),
      animations: ['walk', 'slash'],
      frames: 'all',
      bundleZip: true,
      allowPartial: true,
      requireProductive: true,
    });
    expect(response).toMatchObject({ ok: true, command: 'character render' });
  });

  it('maps named frame selections when delegating character render', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const renderSelection = vi.fn().mockResolvedValue({
      artifacts: [],
      warnings: [],
      metadataPath: path.join(fixture.cwd, 'out/hero.metadata.json'),
    });

    await runCharacterCommand(
      parseArgs([
        'character', 'render', 'hero', '--out', 'out',
        '--frames', 'walk', '--frames', 'slash',
      ]),
      fixture.io,
      fixture.runtime,
      { renderSelection, renderCharacterPreview: vi.fn() },
    );

    expect(renderSelection).toHaveBeenCalledWith(expect.objectContaining({
      frames: ['walk', 'slash'],
      bundleZip: false,
      allowPartial: false,
    }));
  });

  it('uses the explicit selection file stem when render metadata has no name', async () => {
    const fixture = createFixture();
    const selectionPath = path.join(fixture.cwd, 'saved', 'custom.selection.json');
    mkdirSync(path.dirname(selectionPath), { recursive: true });
    writeFileSync(selectionPath, JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items: {},
    }));
    const renderSelection = vi.fn().mockResolvedValue({
      artifacts: [],
      warnings: [],
      metadataPath: path.join(fixture.cwd, 'out/custom.selection.metadata.json'),
    });

    await runCharacterCommand(
      parseArgs([
        'character', 'render', '--selection', selectionPath, '--out', 'out',
      ]),
      fixture.io,
      fixture.runtime,
      { renderSelection, renderCharacterPreview: vi.fn() },
    );

    expect(renderSelection).toHaveBeenCalledWith(expect.objectContaining({
      selectionName: 'custom.selection',
    }));
  });

  it('delegates character preview defaults and returns its attributed artifacts', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const renderCharacterPreview = vi.fn().mockResolvedValue({
      artifacts: [{ type: 'preview', path: '/tmp/hero.preview.png' }],
      warnings: [],
      metadataPath: '/tmp/hero.metadata.json',
      outDir: '/tmp',
    });

    const response = await runCharacterCommand(
      parseArgs(['character', 'preview', 'hero']),
      fixture.io,
      fixture.runtime,
      { renderSelection: vi.fn(), renderCharacterPreview },
    );

    expect(renderCharacterPreview).toHaveBeenCalledWith(expect.objectContaining({
      runtime: fixture.runtime,
      cwd: fixture.cwd,
      selectionJson: expect.objectContaining({
        schema: 'lpc-toolkit.selection.v2',
        name: 'hero',
      }),
      characterName: 'hero',
      animation: 'walk',
      direction: 'down',
      frameIndex: 0,
    }));
    expect(response).toMatchObject({ ok: true, command: 'character preview' });
  });

  it('maps actionable preview errors into the command response', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const previewError = previewIssue('preview_animation_unavailable', 'idle', {
      available: ['walk'],
    });

    const response = await runCharacterCommand(
      parseArgs(['character', 'preview', 'hero', '--animation', 'idle']),
      fixture.io,
      fixture.runtime,
      {
        renderSelection: vi.fn(),
        renderCharacterPreview: vi.fn().mockRejectedValue(previewError),
      },
    );

    expect(response.errors[0]).toEqual({
      code: 'preview_animation_unavailable',
      message: 'The requested preview animation is unavailable.',
      path: 'idle',
      details: { available: ['walk'] },
    });
  });

  it('preserves strict preview import validation errors', async () => {
    const fixture = createFixture();
    const selectionPath = path.join(fixture.cwd, 'saved', 'invalid.selection.json');
    mkdirSync(path.dirname(selectionPath), { recursive: true });
    writeFileSync(selectionPath, `${JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      name: 'invalid',
      bodyType: 'male',
      items: { hair: { name: 'Missing Hair' } },
    })}\n`);

    const response = await runCharacterCommand(
      parseArgs(['character', 'preview', '--selection', selectionPath]),
      fixture.io,
      fixture.runtime,
    );

    expect(response.errors[0]).toMatchObject({
      code: 'unknown_upstream_item',
      path: 'items.hair',
    });
  });

  it.each(['abc', '0x1', '1e0'])('rejects non-decimal preview frame %s without delegating', async (frame) => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const renderCharacterPreview = vi.fn();

    const response = await runCharacterCommand(
      parseArgs(['character', 'preview', 'hero', '--frame', frame]),
      fixture.io,
      fixture.runtime,
      { renderSelection: vi.fn(), renderCharacterPreview },
    );

    expect(response.errors[0]).toMatchObject({
      code: 'preview_frame_out_of_range',
      path: frame,
    });
    expect(renderCharacterPreview).not.toHaveBeenCalled();
  });

  it('creates, sets, searches, shows, validates, removes, and lists a named character', async () => {
    const fixture = createFixture();

    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set', 'hero', '--type', 'body', '--item', 'body',
    ])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'search', 'hero', '--type', 'hair', '--query', 'braid',
    ])).response.data).toMatchObject({ count: 1, items: [{ itemId: 'braids' }] });
    expect((await run(fixture, ['character', 'show', 'hero'])).response.data).toMatchObject({
      selection: { name: 'hero', items: { body: { name: 'Body Color' } } },
      valid: true,
    });
    expect((await run(fixture, ['character', 'validate', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'remove', 'hero', '--type', 'body',
    ])).response.ok).toBe(true);
    expect((await run(fixture, ['character', 'list'])).response.data).toMatchObject({ count: 1 });
  });

  it('returns a paged character search through the JSON CLI response', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli(
      ['character', 'search', 'hero', '--type', 'hair', '--limit', '1', '--json'],
      {
        cwd: fixture.cwd,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    );

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      command: 'character search',
      data: {
        count: 3,
        items: [{
          compatibleBodyType: 'male',
          supportedBodyTypes: ['male'],
          replacesCurrent: false,
        }],
        page: {
          limit: 1,
          offset: 0,
          returned: 1,
          total: 3,
          hasMore: true,
          nextOffset: 1,
        },
      },
    });
  });

  it('returns bounded recovery guidance for an unknown character search type', async () => {
    const fixture = createFixture();
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const definitionsRoot = path.join(fixture.cwd, 'assets', 'sheet_definitions');
    for (let index = 0; index < 12; index++) {
      const typeName = `type-${String(index).padStart(2, '0')}`;
      const typeRoot = path.join(definitionsRoot, typeName);
      mkdirSync(typeRoot, { recursive: true });
      writeFileSync(path.join(typeRoot, `item-${index}.json`), JSON.stringify({
        name: `Item ${index}`,
        type_name: typeName,
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 50, male: `${typeName}/item/` },
      }));
    }

    const response = (await run(fixture, [
      'character', 'search', 'hero', '--type', 'haor',
    ])).response;

    expect(response.errors[0]).toMatchObject({
      code: 'unknown_type_name',
      path: 'haor',
    });
    expect(response.errors[0]?.details?.suggestions?.[0]).toBe('hair');
    expect(response.errors[0]?.details?.suggestions).toHaveLength(5);
    expect(response.errors[0]?.details?.available).toHaveLength(10);
  });

  it('does not write an invalid set candidate', async () => {
    const fixture = createFixture();
    const heroPath = path.join(fixture.cwd, 'characters', 'hero.selection.json');
    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    const before = readFileSync(heroPath, 'utf8');

    const result = await run(fixture, [
      'character', 'set', 'hero', '--type', 'hair', '--item', 'missing',
    ]);

    expect(result.response.ok).toBe(false);
    expect(result.response.errors[0]).toMatchObject({ code: 'unknown_item' });
    expect(readFileSync(heroPath, 'utf8')).toBe(before);
  });

  it('uses create --selection only as the destination and keeps the requested name', async () => {
    const fixture = createFixture();
    const result = await run(fixture, [
      'character', 'create', 'custom-hero', '--selection', 'saved/hero.json',
    ]);

    expect(result.response.data).toMatchObject({
      path: path.join(fixture.cwd, 'saved', 'hero.json'),
      selection: { name: 'custom-hero' },
    });
    expect(JSON.parse(readFileSync(path.join(fixture.cwd, 'saved', 'hero.json'), 'utf8')))
      .toMatchObject({ name: 'custom-hero' });
  });

  it('rejects conflicting and missing existing-character locators', async () => {
    const fixture = createFixture();

    expect((await run(fixture, [
      'character', 'show', 'hero', '--selection', 'hero.json',
    ])).response.errors[0]).toMatchObject({ code: 'character_locator_conflict' });
    expect((await run(fixture, ['character', 'show'])).response.errors[0])
      .toMatchObject({ code: 'missing_argument' });
  });

  it('rejects surplus positionals for named and explicit-path locators', async () => {
    const fixture = createFixture();

    expect((await run(fixture, [
      'character', 'show', 'hero', 'extra',
    ])).response.errors[0]).toMatchObject({ code: 'unexpected_argument' });
    expect((await run(fixture, [
      'character', 'show', 'extra', 'another', '--selection', 'saved/hero.json',
    ])).response.errors[0]).toMatchObject({ code: 'unexpected_argument' });
  });

  it.each(['canonical', 'upstream-v2'] as const)(
    'keeps %s bytes unchanged when production remove yields an invalid candidate',
    async (source) => {
      const fixture = createFixture();
      const heroPath = path.join(fixture.cwd, 'saved', 'hero.json');
      mkdirSync(path.dirname(heroPath), { recursive: true });
      const original = `${JSON.stringify(source === 'canonical' ? {
        schema: 'lpc-toolkit.selection.v1',
        bodyType: 'male',
        items: { body: { name: 'Body Color' }, hair: { name: 'Braids' } },
      } : {
        version: 2,
        bodyType: 'male',
        selections: { body: { itemId: 'body' }, hair: { itemId: 'braids' } },
      }, null, 2)}\n`;
      writeFileSync(heroPath, original);
      const stdout: string[] = [];
      const stderr: string[] = [];

      const code = await runCli(
        [
          'character', 'remove', '--selection', heroPath,
          '--type', 'body', '--json',
        ],
        {
          cwd: fixture.cwd,
          stdout: (text) => stdout.push(text),
          stderr: (text) => stderr.push(text),
        },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.join(''))).toMatchObject({
        ok: false,
        command: 'character remove',
        errors: [{ code: 'missing_sprite_path', path: 'hair/Braids' }],
      });
      expect(stderr).toEqual([]);
      expect(readFileSync(heroPath, 'utf8')).toBe(original);
    },
  );

  it('maps typed store errors directly to CLI issues', async () => {
    const fixture = createFixture();
    const response = (await run(fixture, ['character', 'show', 'missing'])).response;

    expect(response.errors[0]).toMatchObject({
      code: 'character_not_found',
      path: path.join(fixture.cwd, 'characters', 'missing.selection.json'),
    });
  });

  it('validates the metadata name even when create has an explicit destination', async () => {
    const fixture = createFixture();
    const response = (await run(fixture, [
      'character', 'create', '../unsafe', '--selection', 'saved/hero.json',
    ])).response;

    expect(response.errors[0]).toMatchObject({ code: 'character_name_invalid' });
  });

  it('rejects an unsupported body type before preset materialization', async () => {
    const fixture = createFixture();
    const response = (await run(fixture, [
      'character', 'create', 'hero', '--preset', 'farmer', '--body-type', 'centaur',
    ])).response;

    expect(response.errors[0]).toMatchObject({ code: 'body_type_invalid' });
  });

  it('rejects a partially incompatible preset for an explicit body type without writing', async () => {
    const fixture = createFixture();
    const targetPath = path.join(fixture.cwd, 'characters', 'hero.selection.json');
    const bodyDefinitionPath = path.join(
      fixture.cwd,
      'assets/sheet_definitions/body/body.json',
    );
    const bodyDefinition = JSON.parse(readFileSync(bodyDefinitionPath, 'utf8')) as {
      readonly layer_1: Readonly<Record<string, unknown>>;
    };
    writeFileSync(bodyDefinitionPath, JSON.stringify({
      ...bodyDefinition,
      layer_1: {
        ...bodyDefinition.layer_1,
        female: 'body/bodies/female/',
      },
    }));

    const response = (await run(fixture, [
      'character', 'create', 'hero', '--preset', 'farmer', '--body-type', 'female',
    ])).response;

    expect(response.errors[0]).toMatchObject({
      code: 'preset_body_type_incompatible',
      path: 'female',
    });
    expect(existsSync(targetPath)).toBe(false);
  });

  it('rejects a fully incompatible preset for an explicit body type without writing', async () => {
    const fixture = createFixture();
    const targetPath = path.join(fixture.cwd, 'characters', 'hero.selection.json');
    rmSync(path.join(fixture.cwd, 'assets/sheet_definitions/body/body.json'));

    const response = (await run(fixture, [
      'character', 'create', 'hero', '--preset', 'farmer', '--body-type', 'female',
    ])).response;

    expect(response.errors[0]).toMatchObject({
      code: 'preset_body_type_incompatible',
      path: 'female',
    });
    expect(existsSync(targetPath)).toBe(false);
  });
});
