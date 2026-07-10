import type {
  CanvasLike,
  ComposedSheet,
  CreditsManifest,
} from '@lpc-toolkit/core';
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  assertExportableCredits,
  exportSpritesheetBundle,
} from '../src/lib/spritesheet-export';

function makeCredits(author: string): CreditsManifest {
  return {
    entries: [
      {
        file: 'body/test',
        notes: '',
        authors: [author],
        licenses: ['GPL 3.0'],
        urls: [],
      },
    ],
    resolvedPaths: ['body/test/walk.png'],
    licenses: ['GPL 3.0'],
  };
}

function makeSheet(color: string, credits: CreditsManifest): ComposedSheet {
  const canvas = createCanvas(1, 1);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);

  return {
    canvas: canvas as unknown as CanvasLike,
    width: 1,
    height: 1,
    selections: { bodyType: 'male', items: {} },
    credits,
    layers: [],
    animations: ['walk'],
  };
}

describe('exportSpritesheetBundle', () => {
  it('bundles only the passed sheet pixels and credits', async () => {
    const redSheet = makeSheet('#ff0000', makeCredits('Red Artist'));
    const blueSheet = makeSheet('#0000ff', makeCredits('Blue Artist'));

    const redZip = await JSZip.loadAsync(
      await (await exportSpritesheetBundle(redSheet, 'walk')).arrayBuffer(),
    );
    const blueZip = await JSZip.loadAsync(
      await (await exportSpritesheetBundle(blueSheet, 'walk')).arrayBuffer(),
    );

    expect(Object.keys(redZip.files).sort()).toEqual([
      'character-spritesheet.png',
      'credits/credits.csv',
      'credits/credits.txt',
    ]);
    const redPng = await redZip
      .file('character-spritesheet.png')!
      .async('uint8array');
    const bluePng = await blueZip
      .file('character-spritesheet.png')!
      .async('uint8array');
    expect(redPng).not.toHaveLength(0);
    expect(redPng).not.toEqual(bluePng);

    const redCredits = await redZip.file('credits/credits.txt')!.async('text');
    const blueCredits = await blueZip
      .file('credits/credits.txt')!
      .async('text');
    expect(redCredits).toContain('Artist');
    expect(redCredits).toContain('Red Artist');
    expect(redCredits).not.toContain('Blue Artist');
    expect(blueCredits).toContain('Blue Artist');
    expect(blueCredits).not.toContain('Red Artist');
  });

  it('rejects an empty credits manifest', async () => {
    const emptySheet = makeSheet('#ff0000', {
      entries: [],
      resolvedPaths: [],
      licenses: [],
    });

    await expect(exportSpritesheetBundle(emptySheet, 'walk')).rejects.toThrow(
      'Cannot export pixels without resolved credits.',
    );
  });
});

describe('assertExportableCredits', () => {
  it('accepts a non-empty credits manifest', () => {
    expect(() => assertExportableCredits(makeCredits('Artist'))).not.toThrow();
  });
});
