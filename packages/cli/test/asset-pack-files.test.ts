import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AssetPackSource } from '@lpc-toolkit/core';
import { ASSET_PACK_SCHEMA } from '@lpc-toolkit/core';
import { loadAssetPackFiles } from '../src/asset-pack-files.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function packFixture(overrides?: Partial<AssetPackSource>): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    credits: PACK_CREDITS,
    assets: [{
      kind: 'new-item',
      localId: 'wind-braid',
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk', 'climb'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [
          { animation: 'walk', source: 'sprites/wind-braid/foreground/walk.png' },
          { animation: 'climb', source: 'sprites/wind-braid/foreground/climb.png' },
        ],
      }],
    }],
    ...overrides,
  };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writePack(
  root: string,
  manifest: unknown,
  sources: Readonly<Record<string, string | Buffer>>,
): string {
  mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, 'asset-pack.json');
  writeJson(manifestPath, manifest);
  for (const [relativePath, contents] of Object.entries(sources)) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return manifestPath;
}

function requireFailure(root: string) {
  const result = loadAssetPackFiles(root);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected asset-pack load to fail.');
  return result.diagnostics;
}

function requireSuccess(root: string) {
  const result = loadAssetPackFiles(root);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected asset-pack load to succeed.');
  return result;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('loadAssetPackFiles', () => {
  it('reports manifest JSON parse failures without mutating the manifest file', () => {
    const root = createDirectory('lpc-asset-pack-files-json-');
    mkdirSync(root, { recursive: true });
    const manifestPath = path.join(root, 'asset-pack.json');
    writeFileSync(manifestPath, '{"schema":');
    const beforeBytes = readFileSync(manifestPath);
    const beforeMtimeMs = lstatSync(manifestPath).mtimeMs;

    expect(requireFailure(root)).toEqual([
      expect.objectContaining({
        code: 'asset_pack_manifest_json_invalid',
        path: manifestPath,
      }),
    ]);
    expect(readFileSync(manifestPath)).toEqual(beforeBytes);
    expect(lstatSync(manifestPath).mtimeMs).toBe(beforeMtimeMs);
  });

  it('surfaces core schema diagnostics for invalid manifests', () => {
    const root = createDirectory('lpc-asset-pack-files-schema-');
    writePack(root, {
      ...packFixture(),
      schema: 'lpc-toolkit.asset-pack.v2',
    }, {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });

    expect(requireFailure(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'asset_pack_schema_invalid',
          details: expect.objectContaining({
            path: '$.schema',
          }),
        }),
      ]),
    );
  });

  it('rejects missing, escaping, non-regular, and duplicate-canonical source paths', () => {
    const root = createDirectory('lpc-asset-pack-files-safety-');
    const outside = createDirectory('lpc-asset-pack-files-outside-');
    const duplicateTarget = path.join(root, 'sprites/shared/source.png');
    writePack(root, packFixture({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male'],
        animations: ['walk', 'climb'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [
            { animation: 'walk', source: 'sprites/wind-braid/foreground/missing.png' },
            { animation: 'climb', source: 'sprites/wind-braid/foreground/not-a-file.png' },
          ],
        }],
      }, {
        kind: 'new-item',
        localId: 'storm-braid',
        displayName: 'Storm Braid',
        typeName: 'hair',
        bodyTypes: ['female'],
        animations: ['walk', 'climb'],
        layers: [{
          id: 'foreground',
          zPos: 121,
          sprites: [
            { animation: 'walk', source: 'sprites/shared/source.png' },
            { animation: 'climb', source: 'sprites/wind-braid/foreground/duplicate-link.png' },
          ],
        }, {
          id: 'background',
          zPos: 122,
          sprites: [
            { animation: 'walk', source: 'sprites/wind-braid/foreground/escape.png' },
            { animation: 'climb', source: 'sprites/wind-braid/foreground/escape.png' },
          ],
        }],
      }],
    }), {
      'sprites/shared/source.png': 'duplicate',
    });
    mkdirSync(path.join(root, 'sprites/wind-braid/foreground/not-a-file.png'), {
      recursive: true,
    });
    writeFileSync(path.join(outside, 'escape.png'), 'escape');
    symlinkSync(
      path.join(outside, 'escape.png'),
      path.join(root, 'sprites/wind-braid/foreground/escape.png'),
    );
    mkdirSync(path.dirname(path.join(root, 'sprites/wind-braid/foreground/duplicate-link.png')), {
      recursive: true,
    });
    symlinkSync(
      duplicateTarget,
      path.join(root, 'sprites/wind-braid/foreground/duplicate-link.png'),
    );

    expect(requireFailure(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'asset_source_missing',
          sourcePath: 'sprites/wind-braid/foreground/missing.png',
        }),
        expect.objectContaining({
          code: 'asset_source_not_regular',
          sourcePath: 'sprites/wind-braid/foreground/not-a-file.png',
        }),
        expect.objectContaining({
          code: 'asset_source_symlink',
          sourcePath: 'sprites/wind-braid/foreground/escape.png',
        }),
        expect.objectContaining({
          code: 'asset_source_symlink',
          sourcePath: 'sprites/wind-braid/foreground/duplicate-link.png',
        }),
      ]),
    );
  });

  it('rejects in-pack symlink source entries even when they resolve to regular files inside the pack', () => {
    const root = createDirectory('lpc-asset-pack-files-symlink-');
    writePack(root, packFixture({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['female'],
        animations: ['walk'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [
            { animation: 'walk', source: 'sprites/wind-braid/foreground/link.png' },
          ],
        }],
      }],
    }), {
      'sprites/wind-braid/foreground/target.png': 'walk',
    });
    symlinkSync(
      path.join(root, 'sprites/wind-braid/foreground/target.png'),
      path.join(root, 'sprites/wind-braid/foreground/link.png'),
    );

    expect(requireFailure(root)).toEqual([
      expect.objectContaining({
        code: 'asset_source_symlink',
        sourcePath: 'sprites/wind-braid/foreground/link.png',
      }),
    ]);
  });

  it('rejects source paths that pass through symlinked parent directories inside the pack', () => {
    const root = createDirectory('lpc-asset-pack-files-parent-symlink-');
    writePack(root, packFixture({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['female'],
        animations: ['walk'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [
            { animation: 'walk', source: 'sprites/wind-braid/foreground/walk.png' },
          ],
        }],
      }],
    }), {
      'sprites-real/wind-braid/foreground/walk.png': 'walk',
    });
    rmSync(path.join(root, 'sprites'), { recursive: true, force: true });
    symlinkSync(
      path.join(root, 'sprites-real'),
      path.join(root, 'sprites'),
      'dir',
    );

    expect(requireFailure(root)).toEqual([
      expect.objectContaining({
        code: 'asset_source_symlink',
        sourcePath: 'sprites/wind-braid/foreground/walk.png',
      }),
    ]);
  });

  it('keeps the content digest stable across manifest property order changes and acknowledgement-only edits', () => {
    const firstRoot = createDirectory('lpc-asset-pack-files-digest-a-');
    const secondRoot = createDirectory('lpc-asset-pack-files-digest-b-');
    const thirdRoot = createDirectory('lpc-asset-pack-files-digest-c-');
    const basePack = packFixture();
    const sources = {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    } as const;
    writePack(firstRoot, {
      schema: basePack.schema,
      id: basePack.id,
      version: basePack.version,
      displayName: basePack.displayName,
      credits: basePack.credits,
      assets: basePack.assets,
    }, sources);
    writePack(secondRoot, {
      assets: basePack.assets,
      credits: basePack.credits,
      displayName: basePack.displayName,
      version: basePack.version,
      id: basePack.id,
      schema: basePack.schema,
    }, sources);
    writePack(thirdRoot, {
      ...basePack,
      acknowledgements: [{
        code: 'asset_path_inferred',
        subject: {
          itemId: 'braid',
          animation: 'climb',
          layer: 'layer_1',
          bodyTypes: ['female'],
        },
        contentDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        reason: 'Reviewed after validation.',
      }],
    }, sources);

    const first = requireSuccess(firstRoot);
    const second = requireSuccess(secondRoot);
    const third = requireSuccess(thirdRoot);

    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first.contentDigest).toBe(third.contentDigest);
  });

  it('changes the content digest after a substantive manifest edit or source PNG edit', () => {
    const baseRoot = createDirectory('lpc-asset-pack-files-change-a-');
    const manifestChangedRoot = createDirectory('lpc-asset-pack-files-change-b-');
    const sourceChangedRoot = createDirectory('lpc-asset-pack-files-change-c-');
    const sourcePack = packFixture();
    writePack(baseRoot, sourcePack, {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });
    writePack(manifestChangedRoot, {
      ...sourcePack,
      displayName: 'ACME Wind Braid Deluxe',
    }, {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });
    writePack(sourceChangedRoot, sourcePack, {
      'sprites/wind-braid/foreground/walk.png': 'walk-v2',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });

    const base = requireSuccess(baseRoot);
    const manifestChanged = requireSuccess(manifestChangedRoot);
    const sourceChanged = requireSuccess(sourceChangedRoot);

    expect(manifestChanged.contentDigest).not.toBe(base.contentDigest);
    expect(sourceChanged.contentDigest).not.toBe(base.contentDigest);
  });

  it('does not change manifest bytes or mtime during validate-style loads', () => {
    const root = createDirectory('lpc-asset-pack-files-readonly-');
    const manifestPath = writePack(root, packFixture(), {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });
    const beforeBytes = readFileSync(manifestPath);
    const beforeStat = lstatSync(manifestPath);
    const pinnedMtime = new Date(beforeStat.mtimeMs - 1000);
    utimesSync(manifestPath, pinnedMtime, pinnedMtime);
    const expectedMtimeMs = lstatSync(manifestPath).mtimeMs;

    const result = requireSuccess(root);

    expect(result.manifestBytes).toEqual(beforeBytes);
    expect(readFileSync(manifestPath)).toEqual(beforeBytes);
    expect(lstatSync(manifestPath).mtimeMs).toBe(expectedMtimeMs);
  });

  it('retains captured source bytes after the on-disk source changes', () => {
    const root = createDirectory('lpc-asset-pack-files-snapshot-');
    writePack(root, packFixture(), {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });

    const loaded = requireSuccess(root);
    writeFileSync(path.join(root, 'sprites/wind-braid/foreground/walk.png'), 'changed');

    expect(loaded.sourceBytes.get('sprites/wind-braid/foreground/walk.png')?.toString())
      .toBe('walk');
  });
});
