import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSelection } from '../src/render.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

function listFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath).map((file) => path.join(entry.name, file));
    return entry.name;
  });
}

const bodyOnlySelection = {
  schema: 'lpc-toolkit.selection.v1',
  name: 'body-only',
  bodyType: 'male',
  items: {
    body: { name: 'Body Color', recolor: 'light' },
  },
} as const;

describe('renderSelection', () => {
  it('writes sheet, metadata, and credits for a body-only selection', async () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    const result = await renderSelection({
      cwd: repoRoot,
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
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));

    await expect(
      renderSelection({
        cwd: repoRoot,
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
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));

    await expect(
      renderSelection({
        cwd: repoRoot,
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
});
