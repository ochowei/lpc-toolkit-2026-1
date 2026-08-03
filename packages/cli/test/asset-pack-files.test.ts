import { createHash } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
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
import {
  AssetPackAtomicReplacementError,
  atomicallyReplaceAssetPackSource,
  loadAssetPackFiles,
  type AssetPackAtomicFileOps,
  type AssetPackDirectoryFileOps,
} from '../src/asset-pack-files.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

function sha256(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

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

async function requireFailure(root: string) {
  const result = await loadAssetPackFiles(root);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected asset-pack load to fail.');
  return result.diagnostics;
}

async function requireSuccess(root: string) {
  const result = await loadAssetPackFiles(root);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected asset-pack load to succeed.');
  return result;
}

function replacingCaptureFileOps(options: {
  readonly targetPath: string;
  readonly replacementBytes: Buffer;
}): {
  readonly fileOps: AssetPackDirectoryFileOps;
  readonly replaced: () => boolean;
} {
  const replacementPath = `${options.targetPath}.replacement`;
  writeFileSync(replacementPath, options.replacementBytes);
  return captureFileOpsWithMutation({
    targetPath: options.targetPath,
    mutate: () => renameSync(replacementPath, options.targetPath),
  });
}

function captureFileOpsWithMutation(options: {
  readonly targetPath: string;
  readonly mutate: () => void;
}): {
  readonly fileOps: AssetPackDirectoryFileOps;
  readonly replaced: () => boolean;
} {
  const targetIdentity = lstatSync(options.targetPath);
  let replaced = false;
  const mutatingReadFileSync = ((target: Parameters<typeof readFileSync>[0]) => {
    const bytes = readFileSync(target);
    if (typeof target === 'number' && !replaced) {
      const opened = fstatSync(target);
      if (opened.dev === targetIdentity.dev && opened.ino === targetIdentity.ino) {
        replaced = true;
        options.mutate();
      }
    }
    return bytes;
  }) as typeof readFileSync;
  return {
    fileOps: {
      openSync,
      closeSync,
      fstatSync,
      readFileSync: mutatingReadFileSync,
      lstatSync,
      realpathSync: realpathSync.native,
    },
    replaced: () => replaced,
  };
}

function switchingPackGenerationFileOps(options: {
  readonly triggerPath: string;
  readonly replacements: ReadonlyMap<string, Buffer>;
}): {
  readonly fileOps: AssetPackDirectoryFileOps;
  readonly switched: () => boolean;
} {
  const triggerPath = path.resolve(options.triggerPath);
  let switched = false;
  const switchingLstatSync = ((target: Parameters<typeof lstatSync>[0]) => {
    if (!switched && path.resolve(String(target)) === triggerPath) {
      switched = true;
      for (const [targetPath, bytes] of options.replacements) {
        writeFileSync(targetPath, bytes);
      }
    }
    return lstatSync(target);
  }) as typeof lstatSync;
  return {
    fileOps: {
      openSync,
      closeSync,
      fstatSync,
      readFileSync,
      lstatSync: switchingLstatSync,
      realpathSync: realpathSync.native,
    },
    switched: () => switched,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('loadAssetPackFiles', () => {
  it('rejects a symlinked supplied pack root before reading its manifest', async () => {
    const parent = createDirectory('lpc-asset-pack-files-root-link-');
    const outside = createDirectory('lpc-asset-pack-files-root-target-');
    writeFileSync(path.join(outside, 'asset-pack.json'), '{"schema":');
    const linkedRoot = path.join(parent, 'linked-pack');
    symlinkSync(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');

    expect(await requireFailure(linkedRoot)).toEqual([expect.objectContaining({
      code: 'asset_source_symlink',
      path: linkedRoot,
    })]);
  });

  it('reports manifest JSON parse failures without mutating the manifest file', async () => {
    const root = createDirectory('lpc-asset-pack-files-json-');
    mkdirSync(root, { recursive: true });
    const manifestPath = path.join(root, 'asset-pack.json');
    writeFileSync(manifestPath, '{"schema":');
    const beforeBytes = readFileSync(manifestPath);
    const beforeMtimeMs = lstatSync(manifestPath).mtimeMs;

    expect(await requireFailure(root)).toEqual([
      expect.objectContaining({
        code: 'asset_pack_manifest_json_invalid',
        path: manifestPath,
      }),
    ]);
    expect(readFileSync(manifestPath)).toEqual(beforeBytes);
    expect(lstatSync(manifestPath).mtimeMs).toBe(beforeMtimeMs);
  });

  it('rejects manifest symlinks before parsing external bytes', async () => {
    const root = createDirectory('lpc-asset-pack-files-manifest-symlink-');
    const outside = createDirectory('lpc-asset-pack-files-manifest-outside-');
    const manifestPath = path.join(root, 'asset-pack.json');
    const outsideManifestPath = path.join(outside, 'external.json');
    writeFileSync(outsideManifestPath, '{"schema":');
    symlinkSync(outsideManifestPath, manifestPath);

    expect(await requireFailure(root)).toEqual([{
      code: 'asset_source_symlink',
      message: 'Invalid asset-pack source: asset-pack.json',
      path: manifestPath,
      sourcePath: 'asset-pack.json',
    }]);
  });

  it('surfaces core schema diagnostics for invalid manifests', async () => {
    const root = createDirectory('lpc-asset-pack-files-schema-');
    writePack(root, {
      ...packFixture(),
      schema: 'lpc-toolkit.asset-pack.v2',
    }, {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });

    expect(await requireFailure(root)).toEqual(
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

  it('rejects missing, escaping, non-regular, and duplicate-canonical source paths', async () => {
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

    expect(await requireFailure(root)).toEqual(
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

  it('rejects in-pack symlink source entries even when they resolve to regular files inside the pack', async () => {
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

    expect(await requireFailure(root)).toEqual([
      expect.objectContaining({
        code: 'asset_source_symlink',
        sourcePath: 'sprites/wind-braid/foreground/link.png',
      }),
    ]);
  });

  it('rejects source paths that pass through symlinked parent directories inside the pack', async () => {
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

    expect(await requireFailure(root)).toEqual([
      expect.objectContaining({
        code: 'asset_source_symlink',
        sourcePath: 'sprites/wind-braid/foreground/walk.png',
      }),
    ]);
  });

  it.each(['manifest', 'source'] as const)(
    'rejects deterministic %s replacement during descriptor capture',
    async (targetKind) => {
      const root = createDirectory(`lpc-asset-pack-files-${targetKind}-replacement-`);
      writePack(root, packFixture(), {
        'sprites/wind-braid/foreground/walk.png': 'walk',
        'sprites/wind-braid/foreground/climb.png': 'climb',
      });
      const targetPath = targetKind === 'manifest'
        ? path.join(root, 'asset-pack.json')
        : path.join(root, 'sprites/wind-braid/foreground/walk.png');
      const capture = replacingCaptureFileOps({
        targetPath,
        replacementBytes: readFileSync(targetPath),
      });

      const result = await loadAssetPackFiles(root, capture.fileOps);

      expect(capture.replaced()).toBe(true);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected replacement during capture to fail.');
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: 'asset_digest_mismatch',
        path: targetPath,
      }));
    },
  );

  it.each(['root', 'source-parent'] as const)(
    'rejects deterministic %s directory replacement during capture',
    async (targetKind) => {
      const parent = createDirectory(`lpc-asset-pack-files-${targetKind}-directory-race-`);
      const root = path.join(parent, 'pack');
      const replacementRoot = path.join(parent, 'replacement-pack');
      const sources = {
        'sprites/wind-braid/foreground/walk.png': 'walk',
        'sprites/wind-braid/foreground/climb.png': 'climb',
      } as const;
      writePack(root, packFixture(), sources);
      writePack(replacementRoot, packFixture(), sources);
      const sourceParent = path.join(root, 'sprites/wind-braid/foreground');
      const replacementSourceParent = path.join(
        replacementRoot,
        'sprites/wind-braid/foreground',
      );
      const targetPath = targetKind === 'root'
        ? path.join(root, 'asset-pack.json')
        : path.join(sourceParent, 'walk.png');
      const capture = captureFileOpsWithMutation({
        targetPath,
        mutate: () => {
          if (targetKind === 'root') {
            renameSync(root, path.join(parent, 'original-pack'));
            renameSync(replacementRoot, root);
          } else {
            renameSync(sourceParent, path.join(root, 'sprites/wind-braid/original-foreground'));
            renameSync(replacementSourceParent, sourceParent);
          }
        },
      });

      const result = await loadAssetPackFiles(root, capture.fileOps);

      expect(capture.replaced()).toBe(true);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected directory replacement during capture to fail.');
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: 'asset_digest_mismatch',
        path: targetPath,
      }));
    },
  );

  it('rejects a whole-pack generation switch between manifest and source capture', async () => {
    const root = createDirectory('lpc-asset-pack-files-generation-switch-');
    const manifestPath = writePack(root, packFixture(), {
      'sprites/wind-braid/foreground/walk.png': 'walk-old',
      'sprites/wind-braid/foreground/climb.png': 'climb-old',
    });
    const walkPath = path.join(root, 'sprites/wind-braid/foreground/walk.png');
    const climbPath = path.join(root, 'sprites/wind-braid/foreground/climb.png');
    const nextManifest = Buffer.from(`${JSON.stringify(packFixture({ version: '10.0.0' }), null, 2)}\n`);
    const capture = switchingPackGenerationFileOps({
      triggerPath: path.join(root, 'sprites'),
      replacements: new Map([
        [manifestPath, nextManifest],
        [walkPath, Buffer.from('walk-new-generation')],
        [climbPath, Buffer.from('climb-new-generation')],
      ]),
    });

    const result = await loadAssetPackFiles(root, capture.fileOps);

    expect(capture.switched()).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a mixed whole-pack generation to fail.');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_digest_mismatch',
      path: manifestPath,
    }));
  });

  it('keeps the content digest stable across manifest property order changes and acknowledgement-only edits', async () => {
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

    const first = await requireSuccess(firstRoot);
    const second = await requireSuccess(secondRoot);
    const third = await requireSuccess(thirdRoot);

    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first.contentDigest).toBe(third.contentDigest);
  });

  it('changes the content digest after a substantive manifest edit or source PNG edit', async () => {
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

    const base = await requireSuccess(baseRoot);
    const manifestChanged = await requireSuccess(manifestChangedRoot);
    const sourceChanged = await requireSuccess(sourceChangedRoot);

    expect(manifestChanged.contentDigest).not.toBe(base.contentDigest);
    expect(sourceChanged.contentDigest).not.toBe(base.contentDigest);
  });

  it('does not change manifest bytes or mtime during validate-style loads', async () => {
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

    const result = await requireSuccess(root);

    expect(result.manifestBytes).toEqual(beforeBytes);
    expect(readFileSync(manifestPath)).toEqual(beforeBytes);
    expect(lstatSync(manifestPath).mtimeMs).toBe(expectedMtimeMs);
  });

  it('retains captured source bytes after the on-disk source changes', async () => {
    const root = createDirectory('lpc-asset-pack-files-snapshot-');
    writePack(root, packFixture(), {
      'sprites/wind-braid/foreground/walk.png': 'walk',
      'sprites/wind-braid/foreground/climb.png': 'climb',
    });

    const loaded = await requireSuccess(root);
    writeFileSync(path.join(root, 'sprites/wind-braid/foreground/walk.png'), 'changed');

    expect(loaded.sourceBytes.get('sprites/wind-braid/foreground/walk.png')?.toString())
      .toBe('walk');
  });

  it('refuses an existing-target inspection race before atomic rename', () => {
    const root = createDirectory('lpc-asset-pack-files-atomic-race-');
    const targetPath = path.join(root, 'sprites/target.png');
    mkdirSync(path.dirname(targetPath), { recursive: true });
    const original = Buffer.from('original-target');
    const raced = Buffer.from('raced-target');
    const replacement = Buffer.from('replacement-target');
    writeFileSync(targetPath, original);
    let mutated = false;
    let renamed = false;
    const mutatingWriteFileSync = ((filePath: Parameters<typeof writeFileSync>[0], data: Parameters<typeof writeFileSync>[1], options: Parameters<typeof writeFileSync>[2]) => {
      writeFileSync(filePath, data, options);
      if (!mutated) {
        mutated = true;
        writeFileSync(targetPath, raced);
      }
    }) as typeof writeFileSync;
    const fileOps: AssetPackAtomicFileOps = {
      openSync,
      closeSync,
      fstatSync,
      readFileSync,
      lstatSync,
      realpathSync: realpathSync.native,
      mkdirSync,
      writeFileSync: mutatingWriteFileSync,
      renameSync: ((from, to) => {
        renamed = true;
        renameSync(from, to);
      }) as typeof renameSync,
      rmSync,
    };

    expect(() => atomicallyReplaceAssetPackSource({
      root,
      sourcePath: 'sprites/target.png',
      bytes: replacement,
      maximumBytes: 1024,
      expectedTargetDigest: sha256(original),
      fileOps,
    })).toThrow(AssetPackAtomicReplacementError);
    expect(mutated).toBe(true);
    expect(renamed).toBe(false);
    expect(readFileSync(targetPath)).toEqual(raced);
  });
});
