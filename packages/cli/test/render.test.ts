import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { renderSelection } from '../src/render.js';

const sheetDefinition = {
  name: 'Body Color',
  type_name: 'body',
  priority: 10,
  layer_1: {
    zPos: 10,
    male: 'body/bodies/male/',
  },
  animations: ['walk'],
  credits: [
    {
      file: 'body/bodies/male',
      authors: ['Fixture Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/lpc-fixture'],
    },
  ],
} as const;

function listFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath).map((file) => path.join(entry.name, file));
    return entry.name;
  });
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixtureRepo(): Promise<string> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-fixture-'));
  writeJson(path.join(cwd, 'assets/sheet_definitions/body/body.json'), sheetDefinition);
  mkdirSync(path.join(cwd, 'assets/palette_definitions'), { recursive: true });

  const spritePath = path.join(cwd, 'assets/spritesheets/body/bodies/male/walk.png');
  mkdirSync(path.dirname(spritePath), { recursive: true });
  const canvas = createCanvas(832, 3456);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff00ff';
  context.fillRect(0, 8 * 64, 64, 64);
  writeFileSync(spritePath, await canvas.encode('png'));

  return cwd;
}

const bodyOnlySelection = {
  schema: 'lpc-toolkit.selection.v1',
  name: 'body-only',
  bodyType: 'male',
  items: {
    body: { name: 'Body Color' },
  },
} as const;

describe('renderSelection', () => {
  it('writes sheet, metadata, and credits for a body-only selection', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    const result = await renderSelection({
      cwd,
      outDir,
      selectionName: 'body-only',
      selectionJson: bodyOnlySelection,
      animations: ['walk'],
      frames: [],
      bundleZip: false,
      allowPartial: false,
    });

    expect(result.artifacts.map((artifact) => artifact.type)).toContain('sheet');
    expect(existsSync(path.join(outDir, 'body-only.sheet.png'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.metadata.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.credits.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.credits.csv'))).toBe(true);
    expect(
      JSON.parse(readFileSync(path.join(outDir, 'body-only.metadata.json'), 'utf8')).selection
        .name,
    ).toBe('body-only');
  }, 30000);

  it('does not leave artifacts when a requested animation is invalid', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));

    await expect(
      renderSelection({
        cwd,
        outDir,
        selectionName: 'body-only',
        selectionJson: bodyOnlySelection,
        animations: ['not-real'],
        frames: [],
        bundleZip: false,
        allowPartial: false,
      }),
    ).rejects.toThrow(/not-real/);

    expect(listFiles(outDir)).toEqual([]);
  }, 30000);

  it('does not leave artifacts when a requested frame animation is invalid', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));

    await expect(
      renderSelection({
        cwd,
        outDir,
        selectionName: 'body-only',
        selectionJson: bodyOnlySelection,
        animations: [],
        frames: ['not-real'],
        bundleZip: false,
        allowPartial: false,
      }),
    ).rejects.toThrow(/not-real/);

    expect(listFiles(outDir)).toEqual([]);
  }, 30000);

  it('does not leave partial artifacts when an output path collides with a file', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    writeFileSync(path.join(outDir, 'animations'), 'not a directory');

    await expect(
      renderSelection({
        cwd,
        outDir,
        selectionName: 'body-only',
        selectionJson: bodyOnlySelection,
        animations: ['walk'],
        frames: [],
        bundleZip: false,
        allowPartial: false,
      }),
    ).rejects.toThrow(/animations/);

    expect(listFiles(outDir)).toEqual(['animations']);
    expect(readFileSync(path.join(outDir, 'animations'), 'utf8')).toBe('not a directory');
  }, 30000);

  it('reports skipped validation errors as warnings when partial render is allowed', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    const result = await renderSelection({
      cwd,
      outDir,
      selectionName: 'body-only',
      selectionJson: {
        ...bodyOnlySelection,
        items: {
          ...bodyOnlySelection.items,
          missing_type: { name: 'Missing Item' },
        },
      },
      animations: [],
      frames: [],
      bundleZip: false,
      allowPartial: true,
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_type_name',
          path: 'missing_type',
        }),
      ]),
    );
    const metadata = JSON.parse(
      readFileSync(path.join(outDir, 'body-only.metadata.json'), 'utf8'),
    ) as {
      readonly warnings: readonly { readonly code: string; readonly path?: string }[];
      readonly skippedLayers: readonly { readonly code: string; readonly path?: string }[];
    };
    expect(metadata.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_type_name',
          path: 'missing_type',
        }),
      ]),
    );
    expect(metadata.skippedLayers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_type_name',
          path: 'missing_type',
        }),
      ]),
    );
  }, 30000);
});
