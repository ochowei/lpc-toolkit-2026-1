import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
  assetPackCompileDigest,
  readAssetPackRegistry,
} from '../src/asset-pack-registry.js';
import {
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  initializeAssetWorkspace,
} from '../src/asset-workspace.js';

const temporaryDirectories: string[] = [];

function workspaceFixture(): ReturnType<typeof initializeAssetWorkspace> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-'));
  temporaryDirectories.push(root);
  return initializeAssetWorkspace(root);
}

const digest = `sha256:${'a'.repeat(64)}`;

function workspaceId(workspace: ReturnType<typeof initializeAssetWorkspace>): string {
  return (JSON.parse(readFileSync(
    path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'),
    'utf8',
  )) as { workspaceId: string }).workspaceId;
}

function linkedEntry(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  packId = 'acme.braid',
): Record<string, unknown> {
  const sourceDirectory = path.join(workspace.packsRoot, packId);
  mkdirSync(sourceDirectory, { recursive: true });
  return {
    kind: 'linked',
    packId,
    version: '1.0.0',
    displayName: packId,
    sourceDirectory,
    contentDigest: digest,
    acknowledgements: [],
    sourceDigests: {},
    generatedPaths: [],
    logicalDestinations: [`spritesheets/packages/${packId}/walk.png`],
    replacements: [],
    baselineDefinitionDigests: {},
    baselineCreditDigests: {},
    generatedCredits: [],
  };
}

function v2Document(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  entries: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const generatedDigests = entries.length === 0 ? {} : { 'CREDITS.csv': digest };
  return {
    schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
    workspaceId: workspaceId(workspace),
    entries,
    generatedDigests,
    compileDigest: assetPackCompileDigest({ entries, generatedDigests }),
  };
}

function writeRegistry(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  document: Record<string, unknown>,
): void {
  writeFileSync(workspace.registryPath, `${JSON.stringify(document, null, 2)}\n`);
}

function expectInvalid(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  document: Record<string, unknown>,
  code = 'asset_digest_mismatch',
): void {
  writeRegistry(workspace, document);
  expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({
    ok: false,
    diagnostics: [{ code }],
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('readAssetPackRegistry', () => {
  it('reads a strict v1 registry without mutating it and marks migration as needed', () => {
    const workspace = workspaceFixture();
    const v1 = {
      schema: ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
      workspaceId: workspaceId(workspace),
      entries: [],
      generatedDigests: {},
    };
    writeFileSync(workspace.registryPath, `${JSON.stringify(v1, null, 2)}\n`);
    const before = readFileSync(workspace.registryPath);

    const result = readAssetPackRegistry({
      workspace,
      markerWorkspaceId: workspaceId(workspace),
    });

    expect(result).toEqual({
      ok: true,
      needsMigration: true,
      document: v1,
    });
    expect(readFileSync(workspace.registryPath)).toEqual(before);
  });

  it('exports the v2 registry schema from the workspace module', () => {
    expect(ASSET_WORKSPACE_REGISTRY_SCHEMA).toBe('lpc-toolkit.asset-workspace-registry.v2');
  });

  it('rejects unknown v2 document and entry fields', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    expectInvalid(workspace, { ...v2Document(workspace, [entry]), unexpected: true });
    expectInvalid(workspace, v2Document(workspace, [{ ...entry, unexpected: true }]));
  });

  it('rejects marker mismatch, duplicate IDs, and unsorted entries', () => {
    const workspace = workspaceFixture();
    const first = linkedEntry(workspace, 'bravo.braid');
    const second = linkedEntry(workspace, 'acme.braid');
    expectInvalid(workspace, { ...v2Document(workspace, [second]), workspaceId: 'another-workspace' }, 'asset_output_root_unowned');
    expectInvalid(workspace, v2Document(workspace, [first, second]));
    expectInvalid(workspace, v2Document(workspace, [second, { ...second }]));
  });

  it('rejects malformed digests, digest coverage drift, and compile digest drift', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    expectInvalid(workspace, v2Document(workspace, [{ ...entry, contentDigest: 'sha256:nope' }]));
    expectInvalid(workspace, {
      ...v2Document(workspace, [entry]),
      generatedDigests: { 'CREDITS.csv': digest, 'extra.txt': digest },
    });
    expectInvalid(workspace, { ...v2Document(workspace, [entry]), compileDigest: digest });
  });

  it('rejects linked source escapes and symlink traversal', () => {
    const workspace = workspaceFixture();
    const outside = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-outside-'));
    temporaryDirectories.push(outside);
    const entry = linkedEntry(workspace);
    expectInvalid(workspace, v2Document(workspace, [{ ...entry, sourceDirectory: outside }]));
    const linkedRoot = path.join(workspace.packsRoot, 'linked');
    symlinkSync(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    expectInvalid(workspace, v2Document(workspace, [{ ...entry, sourceDirectory: path.join(linkedRoot, 'pack') }]));
  });

  it('rejects installed source escape, receipt mismatch, and entry field cross-contamination', () => {
    const workspace = workspaceFixture();
    const outside = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-outside-'));
    temporaryDirectories.push(outside);
    const base = linkedEntry(workspace);
    const installedDirectory = path.join(workspace.stateRoot, 'installed', 'acme.braid', '1.0.0', 'digest');
    mkdirSync(installedDirectory, { recursive: true });
    const { sourceDirectory: _sourceDirectory, ...installedBase } = base;
    const installed = {
      ...installedBase,
      kind: 'installed',
      installedDirectory,
      archiveDigest: digest,
    };
    expectInvalid(workspace, v2Document(workspace, [{ ...installed, installedDirectory: outside }]));
    writeFileSync(path.join(installedDirectory, 'install-receipt.json'), `${JSON.stringify({
      schema: 'lpc-toolkit.asset-pack-install-receipt.v1',
      workspaceId: workspaceId(workspace),
      packId: 'wrong.pack',
      version: '1.0.0',
      archiveDigest: digest,
      contentDigest: digest,
      installedAt: '2026-07-22T00:00:00.000Z',
      payloadDigests: {},
    })}\n`);
    expectInvalid(workspace, v2Document(workspace, [installed]));
    expectInvalid(workspace, v2Document(workspace, [{ ...base, installedDirectory, archiveDigest: digest }]));
  });

  it('rejects logical destination conflicts and unsorted generated credits', () => {
    const workspace = workspaceFixture();
    const first = linkedEntry(workspace, 'acme.braid');
    const second = linkedEntry(workspace, 'bravo.braid');
    expectInvalid(workspace, v2Document(workspace, [first, {
      ...second,
      logicalDestinations: first.logicalDestinations,
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...first,
      generatedCredits: [
        { file: 'z', notes: '', authors: [], licenses: [], urls: [] },
        { file: 'a', notes: '', authors: [], licenses: [], urls: [] },
      ],
    }]));
  });
});
