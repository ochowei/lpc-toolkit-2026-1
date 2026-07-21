import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  ASSET_WORKSPACE_SCHEMA,
  findAssetWorkspace,
  initializeAssetWorkspace,
} from '../src/asset-workspace.js';

const temporaryDirectories: string[] = [];

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createWorkspaceTarget(): string {
  return path.join(createDirectory('lpc-asset-workspace-parent-'), 'workspace');
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
}

function writeWorkspaceConfig(
  target: string,
  config: Record<string, string | number | boolean>,
): void {
  mkdirSync(target, { recursive: true });
  writeFileSync(
    path.join(target, 'lpc-asset-workspace.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('initializeAssetWorkspace', () => {
  it('creates the default standalone workspace layout and normalized config', () => {
    const target = createWorkspaceTarget();

    expect(initializeAssetWorkspace(target)).toMatchObject({
      root: target,
      configPath: path.join(target, 'lpc-asset-workspace.json'),
      packsRoot: path.join(target, 'artist-packs'),
      outputRoot: path.join(target, 'assets_custom'),
      stateRoot: path.join(target, '.lpc-toolkit', 'asset-packs'),
      registryPath: path.join(
        target,
        '.lpc-toolkit',
        'asset-packs',
        'registry.json',
      ),
    });
    expect(readJson(path.join(target, 'lpc-asset-workspace.json'))).toEqual({
      schema: ASSET_WORKSPACE_SCHEMA,
      packsDirectory: 'artist-packs',
      outputDirectory: 'assets_custom',
      stateDirectory: '.lpc-toolkit/asset-packs',
    });
    expect(
      readJson(path.join(target, 'assets_custom', '.lpc-toolkit-managed.json')),
    ).toEqual({
      schema: ASSET_OUTPUT_MARKER_SCHEMA,
      workspaceId: expect.any(String),
    });
    expect(readdirSync(path.join(target, '.lpc-toolkit', 'asset-packs')).sort()).toEqual([
      'installed',
      'staging',
      'validation',
    ]);
  });

  it('re-opens an unchanged workspace without replacing its ownership marker', () => {
    const target = createWorkspaceTarget();
    initializeAssetWorkspace(target);
    const markerPath = path.join(target, 'assets_custom', '.lpc-toolkit-managed.json');
    const before = readJson(markerPath);

    const reopened = initializeAssetWorkspace(target);

    expect(reopened.root).toBe(target);
    expect(readJson(markerPath)).toEqual(before);
  });

  it('refuses an existing marker with an unknown schema', () => {
    const target = createWorkspaceTarget();
    mkdirSync(path.join(target, 'assets_custom'), { recursive: true });
    writeFileSync(
      path.join(target, 'assets_custom', '.lpc-toolkit-managed.json'),
      `${JSON.stringify({ schema: 'unknown.schema.v1' }, null, 2)}\n`,
    );

    expect(() => initializeAssetWorkspace(target)).toThrow(
      'Unknown asset output marker schema',
    );
  });

  it('refuses a non-empty unowned assets_custom directory', () => {
    const target = createWorkspaceTarget();
    const outputRoot = path.join(target, 'assets_custom');
    mkdirSync(outputRoot, { recursive: true });
    writeFileSync(path.join(outputRoot, 'custom.json'), '{}\n');

    expect(() => initializeAssetWorkspace(target)).toThrow(
      'Refusing to adopt non-empty unowned asset output',
    );
  });

  it('adopts an existing empty assets_custom directory by creating the ownership marker', () => {
    const target = createWorkspaceTarget();
    const outputRoot = path.join(target, 'assets_custom');
    mkdirSync(outputRoot, { recursive: true });

    initializeAssetWorkspace(target);

    expect(readJson(path.join(outputRoot, '.lpc-toolkit-managed.json'))).toEqual({
      schema: ASSET_OUTPUT_MARKER_SCHEMA,
      workspaceId: expect.any(String),
    });
  });

  it('refuses symlinked workspace paths so initialization cannot write outside the target', () => {
    const target = createWorkspaceTarget();
    const outside = createDirectory('lpc-asset-workspace-outside-');
    mkdirSync(target, { recursive: true });
    symlinkSync(
      outside,
      path.join(target, 'assets_custom'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(() => initializeAssetWorkspace(target)).toThrow(
      'Refusing to initialize through a symlinked workspace path',
    );
    expect(existsSync(path.join(target, 'lpc-asset-workspace.json'))).toBe(false);
    expect(readdirSync(outside)).toEqual([]);
  });

  it('refuses a workspace target whose existing parent path is a symlink', () => {
    const home = createDirectory('lpc-asset-workspace-home-');
    const outside = createDirectory('lpc-asset-workspace-outside-');
    const linkedParent = path.join(home, 'linked-parent');
    symlinkSync(
      outside,
      linkedParent,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const target = path.join(linkedParent, 'workspace');

    expect(() => initializeAssetWorkspace(target)).toThrow(
      'Refusing to initialize through a symlinked workspace path',
    );
    expect(existsSync(path.join(outside, 'workspace'))).toBe(false);
  });

  it('rejects reopened configs whose state directory traverses a symlinked parent', () => {
    const target = createWorkspaceTarget();
    const outside = createDirectory('lpc-asset-workspace-outside-');
    const linked = path.join(target, 'linked-state');
    mkdirSync(target, { recursive: true });
    symlinkSync(
      outside,
      linked,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    writeWorkspaceConfig(target, {
      schema: ASSET_WORKSPACE_SCHEMA,
      packsDirectory: 'artist-packs',
      outputDirectory: 'assets_custom',
      stateDirectory: 'linked-state/internal',
    });
    mkdirSync(path.join(target, 'assets_custom'), { recursive: true });
    writeFileSync(
      path.join(target, 'assets_custom', '.lpc-toolkit-managed.json'),
      `${JSON.stringify(
        {
          schema: ASSET_OUTPUT_MARKER_SCHEMA,
          workspaceId: 'workspace-1',
        },
        null,
        2,
      )}\n`,
    );

    expect(() => initializeAssetWorkspace(target)).toThrow(
      'Refusing to initialize through a symlinked workspace path',
    );
  });

  it('rejects workspace configs with unknown keys', () => {
    const target = createWorkspaceTarget();
    writeWorkspaceConfig(target, {
      schema: ASSET_WORKSPACE_SCHEMA,
      packsDirectory: 'artist-packs',
      outputDirectory: 'assets_custom',
      stateDirectory: '.lpc-toolkit/asset-packs',
      extraField: 'nope',
    });

    expect(() => initializeAssetWorkspace(target)).toThrow(
      'Asset workspace config contains unknown keys',
    );
  });

  it('rejects output markers with unknown keys', () => {
    const target = createWorkspaceTarget();
    mkdirSync(path.join(target, 'assets_custom'), { recursive: true });
    writeFileSync(
      path.join(target, 'assets_custom', '.lpc-toolkit-managed.json'),
      `${JSON.stringify(
        {
          schema: ASSET_OUTPUT_MARKER_SCHEMA,
          workspaceId: 'workspace-1',
          extraField: true,
        },
        null,
        2,
      )}\n`,
    );

    expect(() => initializeAssetWorkspace(target)).toThrow(
      'Asset output marker contains unknown keys',
    );
  });
});

describe('findAssetWorkspace', () => {
  it('finds the workspace by walking upward from a nested directory', () => {
    const target = createWorkspaceTarget();
    initializeAssetWorkspace(target);
    const nested = path.join(target, 'artist-packs', 'acme.hair');
    mkdirSync(nested, { recursive: true });

    expect(findAssetWorkspace(nested)).toMatchObject({
      root: target,
      packsRoot: path.join(target, 'artist-packs'),
      outputRoot: path.join(target, 'assets_custom'),
      stateRoot: path.join(target, '.lpc-toolkit', 'asset-packs'),
    });
  });

  it('resolves an explicit workspace path relative to the provided cwd', () => {
    const home = createDirectory('lpc-asset-workspace-home-');
    const workspace = path.join(home, 'workspace');
    const runner = path.join(home, 'runner', 'deep');
    initializeAssetWorkspace(workspace);
    mkdirSync(runner, { recursive: true });

    expect(findAssetWorkspace(runner, '../../workspace')).toMatchObject({
      root: workspace,
      packsRoot: path.join(workspace, 'artist-packs'),
    });
  });

  it('does not fall back to parent discovery when an explicit workspace path is invalid', () => {
    const target = createWorkspaceTarget();
    initializeAssetWorkspace(target);
    const nested = path.join(target, 'artist-packs', 'acme.hair');
    mkdirSync(nested, { recursive: true });

    expect(() => findAssetWorkspace(nested, '.')).toThrow(
      'Asset workspace config not found at explicit path',
    );
  });

  it('rejects configs whose relative directories escape the workspace root', () => {
    const target = createWorkspaceTarget();
    writeWorkspaceConfig(target, {
      schema: ASSET_WORKSPACE_SCHEMA,
      packsDirectory: '../artist-packs',
      outputDirectory: 'assets_custom',
      stateDirectory: '.lpc-toolkit/asset-packs',
    });

    expect(() => findAssetWorkspace(target)).toThrow(
      'Asset workspace path escapes the workspace root',
    );
  });

  it('rejects discovered configs whose output directory traverses a symlinked parent', () => {
    const target = createWorkspaceTarget();
    const outside = createDirectory('lpc-asset-workspace-outside-');
    const nested = path.join(target, 'artist-packs', 'acme.hair');
    mkdirSync(target, { recursive: true });
    symlinkSync(
      outside,
      path.join(target, 'linked-output'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    writeWorkspaceConfig(target, {
      schema: ASSET_WORKSPACE_SCHEMA,
      packsDirectory: 'artist-packs',
      outputDirectory: 'linked-output/custom',
      stateDirectory: '.lpc-toolkit/asset-packs',
    });
    mkdirSync(nested, { recursive: true });

    expect(() => findAssetWorkspace(nested)).toThrow(
      'Refusing to initialize through a symlinked workspace path',
    );
  });
});
