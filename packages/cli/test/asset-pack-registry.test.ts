import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { BODY_TYPES, type ItemDefinition } from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
  assetPackCompileDigest,
  auditPublishedManagedOutput,
  type AssetPackCompileProjection,
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function independentCompileDigest(projection: AssetPackCompileProjection): string {
  const normalized = {
    definitions: [...projection.definitions]
      .sort((left, right) => left.logicalPath.localeCompare(right.logicalPath)),
    sprites: [...projection.sprites]
      .sort((left, right) => left.destinationPath.localeCompare(right.destinationPath)
        || left.sourcePath.localeCompare(right.sourcePath))
      .map((sprite) => ({
        ...sprite,
        consumers: [...sprite.consumers]
          .sort((left, right) => JSON.stringify(canonical(left)).localeCompare(JSON.stringify(canonical(right))))
          .map((consumer) => ({
            ...consumer,
            bodyTypes: BODY_TYPES.filter((bodyType) => consumer.bodyTypes.includes(bodyType)),
          })),
      })),
    credits: [...projection.credits]
      .sort((left, right) => left.file.localeCompare(right.file)),
    ownership: [...projection.ownership]
      .sort((left, right) => left.packId.localeCompare(right.packId))
      .map((ownership) => ({ ...ownership, logicalPaths: [...ownership.logicalPaths].sort() })),
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(normalized))).digest('hex')}`;
}

function compileDefinition(name: string): ItemDefinition {
  return {
    name,
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    variants: ['orange'],
    recolors: { material: 'hair', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'hair/example/' },
  };
}

function compileProjectionFixture(): AssetPackCompileProjection {
  return {
    definitions: [
      { logicalPath: 'sheet_definitions/hair/bravo.json', definition: compileDefinition('Bravo') },
      { logicalPath: 'sheet_definitions/hair/acme.json', definition: compileDefinition('Acme') },
    ],
    sprites: [
      {
        packId: 'bravo.braid',
        assetId: 'bravo.braid--braid',
        sourcePath: 'sprites/bravo.png',
        sourceDigest: `sha256:${'b'.repeat(64)}`,
        destinationPath: 'spritesheets/packages/bravo.braid/braid/walk.png',
        destinationDigest: `sha256:${'c'.repeat(64)}`,
        animation: 'walk',
        consumers: [{
          itemId: 'bravo.braid--braid',
          typeName: 'hair',
          layer: 'layer_1',
          bodyTypes: ['female', 'male'],
          variant: 'orange',
        }],
      },
      {
        packId: 'acme.braid',
        assetId: 'acme.braid--braid',
        sourcePath: 'sprites/acme.png',
        sourceDigest: `sha256:${'d'.repeat(64)}`,
        destinationPath: 'spritesheets/packages/acme.braid/braid/walk.png',
        destinationDigest: `sha256:${'e'.repeat(64)}`,
        animation: 'walk',
        consumers: [{
          itemId: 'acme.braid--braid',
          typeName: 'hair',
          layer: 'layer_1',
          bodyTypes: ['male'],
        }],
      },
    ],
    credits: [
      { file: 'packages/bravo.braid/braid/walk.png', notes: 'Bravo', authors: ['Bravo'], licenses: ['CC-BY-SA 4.0'], urls: ['https://example.com/bravo'] },
      { file: 'packages/acme.braid/braid/walk.png', notes: 'Acme', authors: ['Acme'], licenses: ['CC-BY-SA 4.0'], urls: ['https://example.com/acme'] },
    ],
    ownership: [
      { packId: 'bravo.braid', logicalPaths: ['spritesheets/packages/bravo.braid/braid/walk.png', 'sheet_definitions/hair/bravo.json'] },
      { packId: 'acme.braid', logicalPaths: ['spritesheets/packages/acme.braid/braid/walk.png', 'sheet_definitions/hair/acme.json'] },
    ],
  };
}

function workspaceId(workspace: ReturnType<typeof initializeAssetWorkspace>): string {
  return (JSON.parse(readFileSync(
    path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'),
    'utf8',
  )) as { workspaceId: string }).workspaceId;
}

interface RegistryFixtureEntry {
  readonly kind: 'linked' | 'installed';
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly contentDigest: string;
  readonly acknowledgements: readonly unknown[];
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly generatedPaths: readonly string[];
  readonly logicalDestinations: readonly string[];
  readonly generatedSprites: readonly Omit<AssetPackCompileProjection['sprites'][number], 'packId'>[];
  readonly replacements: readonly unknown[];
  readonly baselineDefinitionDigests: Readonly<Record<string, string>>;
  readonly baselineCreditDigests: Readonly<Record<string, string>>;
  readonly generatedCredits: AssetPackCompileProjection['credits'];
  readonly sourceDirectory?: string;
  readonly installedDirectory?: string;
  readonly archiveDigest?: string;
}

function linkedEntry(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  packId = 'acme.braid',
): RegistryFixtureEntry {
  const sourceDirectory = path.join(workspace.packsRoot, packId);
  const destinationPath = `spritesheets/packages/${packId}/walk.png`;
  const sourcePath = `sprites/${packId}/walk.png`;
  const definitionPath = `sheet_definitions/hair/${packId}--walk.json`;
  const generatedCredit = {
    file: `packages/${packId}/walk.png`,
    notes: '',
    authors: [],
    licenses: [],
    urls: [],
  };
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(path.dirname(path.join(workspace.outputRoot, definitionPath)), { recursive: true });
  writeFileSync(
    path.join(workspace.outputRoot, definitionPath),
    `${JSON.stringify({ ...compileDefinition(packId), credits: [generatedCredit] }, null, 2)}\n`,
  );
  return {
    kind: 'linked',
    packId,
    version: '1.0.0',
    displayName: packId,
    sourceDirectory,
    contentDigest: digest,
    acknowledgements: [],
    sourceDigests: { [sourcePath]: digest },
    generatedPaths: [definitionPath, destinationPath],
    logicalDestinations: [destinationPath],
    generatedSprites: [{
      assetId: `${packId}--walk`,
      sourcePath,
      sourceDigest: digest,
      destinationPath,
      destinationDigest: digest,
      animation: 'walk',
      consumers: [{
        itemId: `${packId}--walk`,
        typeName: 'hair',
        layer: 'layer_1',
        bodyTypes: ['male'],
      }],
    }],
    replacements: [],
    baselineDefinitionDigests: {},
    baselineCreditDigests: {},
    generatedCredits: [generatedCredit],
  };
}

function registryCompileProjection(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  entries: readonly RegistryFixtureEntry[],
): AssetPackCompileProjection {
  const creditsByFile = new Map<string, AssetPackCompileProjection['credits'][number]>();
  entries.forEach((entry) => {
    entry.generatedCredits.forEach((credit) => {
      if (!creditsByFile.has(credit.file)) creditsByFile.set(credit.file, credit);
    });
  });
  return {
    definitions: entries.flatMap((entry) => entry.generatedPaths
      .filter((generatedPath) => generatedPath.startsWith('sheet_definitions/'))
      .map((logicalPath) => ({
        logicalPath,
        definition: JSON.parse(readFileSync(path.join(workspace.outputRoot, logicalPath), 'utf8')) as ItemDefinition,
      }))),
    sprites: entries.flatMap((entry) => entry.generatedSprites.map((sprite) => ({
      ...sprite,
      packId: entry.packId,
    }))),
    credits: [...creditsByFile.values()],
    ownership: entries.map((entry) => ({
      packId: entry.packId,
      logicalPaths: entry.generatedPaths,
    })),
  };
}

function v2Document(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  entries: readonly unknown[],
): Record<string, unknown> {
  const fixtureEntries = entries as readonly RegistryFixtureEntry[];
  const generatedDigests = fixtureEntries.length === 0
    ? {}
    : Object.fromEntries([
      ['CREDITS.csv', digest],
      ...fixtureEntries.flatMap((entry) => entry.generatedPaths.map((generatedPath) => [generatedPath, digest] as const)),
    ].sort(([left], [right]) => left.localeCompare(right)));
  return {
    schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
    workspaceId: workspaceId(workspace),
    entries,
    generatedDigests,
    compileDigest: assetPackCompileDigest(registryCompileProjection(workspace, fixtureEntries)),
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

function expectInvalidMessage(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  document: Record<string, unknown>,
  message: string,
): void {
  writeRegistry(workspace, document);
  expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({
    ok: false,
    diagnostics: [{ message: expect.stringContaining(message) }],
  });
}

function sha256(value: Buffer | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function installedEntryFixture(workspace: ReturnType<typeof initializeAssetWorkspace>): {
  readonly entry: RegistryFixtureEntry;
  readonly sourcePath: string;
  readonly sourceBytes: Buffer;
  readonly manifestPath: 'asset-pack.json';
  readonly manifestBytes: Buffer;
  readonly receiptPath: string;
} {
  const linked = linkedEntry(workspace);
  const sourcePath = Object.keys(linked.sourceDigests)[0]!;
  const sourceBytes = Buffer.from('installed sprite payload');
  const sourceDigest = sha256(sourceBytes);
  const installedDirectory = path.join(
    workspace.stateRoot,
    'installed',
    linked.packId,
    linked.version,
    digest.slice('sha256:'.length),
  );
  const sourceFile = path.join(installedDirectory, sourcePath);
  mkdirSync(path.dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, sourceBytes);
  const manifestPath = 'asset-pack.json' as const;
  const manifestBytes = Buffer.from('{"installed":true}\n');
  writeFileSync(path.join(installedDirectory, manifestPath), manifestBytes);
  const { sourceDirectory: _sourceDirectory, ...base } = linked;
  const entry: RegistryFixtureEntry = {
    ...base,
    kind: 'installed',
    sourceDigests: { [sourcePath]: sourceDigest },
    generatedSprites: [{ ...linked.generatedSprites[0]!, sourceDigest }],
    installedDirectory,
    archiveDigest: digest,
  };
  const receiptPath = path.join(installedDirectory, 'install-receipt.json');
  writeFileSync(receiptPath, `${JSON.stringify({
    schema: 'lpc-toolkit.asset-pack-install-receipt.v1',
    workspaceId: workspaceId(workspace),
    packId: entry.packId,
    version: entry.version,
    archiveDigest: entry.archiveDigest,
    contentDigest: entry.contentDigest,
    installedAt: '2026-07-22T00:00:00.000Z',
    payloadDigests: {
      [manifestPath]: sha256(manifestBytes),
      ...entry.sourceDigests,
    },
  }, null, 2)}\n`);
  return { entry, sourcePath, sourceBytes, manifestPath, manifestBytes, receiptPath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('readAssetPackRegistry', () => {
  it('rejects a valid registry reached through an external symbolic link', () => {
    const workspace = workspaceFixture();
    const outside = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-link-outside-'));
    temporaryDirectories.push(outside);
    const outsideRegistry = path.join(outside, 'registry.json');
    writeRegistry(workspace, v2Document(workspace, []));
    renameSync(workspace.registryPath, outsideRegistry);
    symlinkSync(outsideRegistry, workspace.registryPath, 'file');

    expect(readAssetPackRegistry({
      workspace,
      markerWorkspaceId: workspaceId(workspace),
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'asset_digest_mismatch',
        message: expect.stringMatching(/regular file|symbolic link/iu),
        path: workspace.registryPath,
      }],
    });
  });

  it('hashes one typed canonical compile projection with field sensitivity and order independence', () => {
    const projection = compileProjectionFixture();
    const expected = independentCompileDigest(projection);

    expect(assetPackCompileDigest(projection)).toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      definitions: [...projection.definitions].reverse(),
      sprites: [...projection.sprites].reverse(),
      credits: [...projection.credits].reverse(),
      ownership: [...projection.ownership].reverse(),
    })).toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      definitions: [{ ...projection.definitions[0]!, definition: compileDefinition('Changed') }, projection.definitions[1]!],
    })).not.toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      sprites: [{ ...projection.sprites[0]!, sourcePath: 'sprites/changed.png' }, projection.sprites[1]!],
    })).not.toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      sprites: [{ ...projection.sprites[0]!, destinationPath: 'spritesheets/changed.png' }, projection.sprites[1]!],
    })).not.toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      sprites: [{ ...projection.sprites[0]!, sourceDigest: `sha256:${'f'.repeat(64)}` }, projection.sprites[1]!],
    })).not.toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      sprites: [{ ...projection.sprites[0]!, destinationDigest: `sha256:${'0'.repeat(64)}` }, projection.sprites[1]!],
    })).not.toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      credits: [{ ...projection.credits[0]!, notes: 'Changed' }, projection.credits[1]!],
    })).not.toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      ownership: [{ ...projection.ownership[0]!, logicalPaths: ['sheet_definitions/hair/changed.json'] }, projection.ownership[1]!],
    })).not.toBe(expected);
    expect(assetPackCompileDigest({
      ...projection,
      sprites: [{
        ...projection.sprites[0]!,
        consumers: [{ ...projection.sprites[0]!.consumers[0]!, variant: 'blue' }],
      }, projection.sprites[1]!],
    })).not.toBe(expected);
  });

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

  it('preserves a populated v1 registry exactly and rejects generated digest coverage drift', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    const v1 = {
      schema: ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
      workspaceId: workspaceId(workspace),
      entries: [{
        kind: 'linked',
        packId: entry.packId,
        version: entry.version,
        displayName: entry.displayName,
        sourceDirectory: entry.sourceDirectory,
        contentDigest: entry.contentDigest,
        sourceDigests: entry.sourceDigests,
        generatedPaths: entry.generatedPaths,
        baselineDefinitionDigests: entry.baselineDefinitionDigests,
        baselineCreditDigests: entry.baselineCreditDigests,
      }],
      generatedDigests: Object.fromEntries([
        ['CREDITS.csv', digest],
        ...entry.generatedPaths.map((generatedPath) => [generatedPath, digest] as const),
      ].sort(([left], [right]) => left.localeCompare(right))),
    };
    writeRegistry(workspace, v1);
    const before = readFileSync(workspace.registryPath);

    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toEqual({
      ok: true,
      needsMigration: true,
      document: v1,
    });
    expect(readFileSync(workspace.registryPath)).toEqual(before);
    expectInvalid(workspace, {
      ...v1,
      generatedDigests: { [entry.generatedPaths[0]!]: digest },
    });
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

  it('accepts the normalized compile digest for an empty formal pack', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    const emptyEntry = {
      ...entry,
      generatedPaths: [],
      logicalDestinations: [],
      generatedSprites: [],
      generatedCredits: [],
    };
    const legacyDocument = v2Document(workspace, [emptyEntry]);
    const normalizedDocument = {
      ...legacyDocument,
      compileDigest: assetPackCompileDigest({
        definitions: [],
        sprites: [],
        credits: [],
        ownership: [],
      }),
    };

    writeRegistry(workspace, normalizedDocument);
    expect(readAssetPackRegistry({
      workspace,
      markerWorkspaceId: workspaceId(workspace),
    })).toMatchObject({
      ok: true,
      needsMigration: false,
    });
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

  it('rejects symlinked linked and installed containment roots before reading external paths', () => {
    const linkedWorkspace = workspaceFixture();
    const linkedOutside = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-linked-root-outside-'));
    temporaryDirectories.push(linkedOutside);
    const linked = linkedEntry(linkedWorkspace);
    rmSync(linkedWorkspace.packsRoot, { recursive: true, force: true });
    symlinkSync(linkedOutside, linkedWorkspace.packsRoot, process.platform === 'win32' ? 'junction' : 'dir');
    expectInvalidMessage(
      linkedWorkspace,
      v2Document(linkedWorkspace, [linked]),
      'invalid containment root',
    );

    const installedWorkspace = workspaceFixture();
    const installedFixture = installedEntryFixture(installedWorkspace);
    const installedOutside = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-installed-root-outside-'));
    temporaryDirectories.push(installedOutside);
    const installedRoot = path.join(installedWorkspace.stateRoot, 'installed');
    rmSync(installedRoot, { recursive: true, force: true });
    symlinkSync(installedOutside, installedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    expectInvalidMessage(
      installedWorkspace,
      v2Document(installedWorkspace, [installedFixture.entry]),
      'invalid containment root',
    );
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

  it('rejects a receipt-valid installed source outside its exact content-addressed path', () => {
    const workspace = workspaceFixture();
    const fixture = installedEntryFixture(workspace);
    const canonicalDirectory = fixture.entry.installedDirectory!;
    const aliasedDirectory = `${path.dirname(canonicalDirectory)}${path.sep}.${path.sep}${path.basename(canonicalDirectory)}`;
    expectInvalidMessage(
      workspace,
      v2Document(workspace, [{
        ...fixture.entry,
        installedDirectory: aliasedDirectory,
      }]),
      'content-addressed',
    );
    const mislocatedDirectory = path.join(
      workspace.stateRoot,
      'installed',
      fixture.entry.packId,
      fixture.entry.version,
      'mislocated',
    );
    renameSync(canonicalDirectory, mislocatedDirectory);

    expectInvalidMessage(
      workspace,
      v2Document(workspace, [{
        ...fixture.entry,
        installedDirectory: mislocatedDirectory,
      }]),
      'content-addressed',
    );
  });

  it('binds each entry generated destinations, sprite digests, and credits to its owned paths', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    writeRegistry(workspace, v2Document(workspace, [entry]));
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({
      ok: true,
      needsMigration: false,
    });

    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      generatedPaths: [],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      generatedCredits: [],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      generatedCredits: [{
        file: 'packages/acme.braid/unowned.png',
        notes: '',
        authors: [],
        licenses: [],
        urls: [],
      }],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      generatedSprites: [{
        ...entry.generatedSprites[0]!,
        sourceDigest: `sha256:${'b'.repeat(64)}`,
      }],
    }]));
  });

  it('requires exact compiler-derived generated credit rows after a digest recomputation', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);

    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      generatedCredits: [{
        ...entry.generatedCredits[0]!,
        file: 'packages',
      }],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      generatedCredits: [{
        ...entry.generatedCredits[0]!,
        authors: ['Tampered author'],
      }],
    }]));
  });

  it('rejects acknowledgement and replacement values Core would not normalize', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    const acknowledgement = {
      code: 'asset_path_inferred',
      subject: { destination: 'spritesheets/packages/acme.braid/walk.png' },
      contentDigest: digest,
      reason: 'Reviewed manually.',
    };
    const replacement = {
      packId: 'acme.base',
      versions: '>=1.0.0',
      assets: ['hair.braid'],
    };

    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      acknowledgements: [{ ...acknowledgement, code: 'not-a-core-code' }],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      acknowledgements: [{ ...acknowledgement, reason: '   ' }],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      acknowledgements: [{ ...acknowledgement, subject: { destination: [1] } }],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      replacements: [{ ...replacement, packId: 'Acme base' }],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      replacements: [{ ...replacement, versions: 'roughly 1.0.0' }],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      replacements: [{ ...replacement, assets: ['hair/braid'] }],
    }]));
  });

  it('rejects non-canonical persisted paths before output reads or digest comparisons', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    const sourcePath = entry.generatedSprites[0]!.sourcePath;
    const nonCanonicalSources = [
      '/tmp/asset.png',
      'sprites\\asset.png',
      'sprites/./asset.png',
      'sprites/../asset.png',
      'sprites/cafe\u0301.png',
    ];

    for (const replacement of nonCanonicalSources) {
      expectInvalid(workspace, v2Document(workspace, [{
        ...entry,
        sourceDigests: { [replacement]: digest },
        generatedSprites: [{ ...entry.generatedSprites[0]!, sourcePath: replacement }],
      }]));
    }

    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      sourceDigests: {
        'sprites/A.png': digest,
        'sprites/a.png': digest,
      },
      generatedSprites: [{ ...entry.generatedSprites[0]!, sourcePath: 'sprites/A.png' }],
    }]));

    const outside = path.join(workspace.root, 'outside-definition.json');
    writeFileSync(outside, '{ this is not valid json');
    const document = v2Document(workspace, [entry]);
    const escapedDefinition = 'sheet_definitions/../../outside-definition.json';
    document.entries = [{
      ...entry,
      generatedPaths: [escapedDefinition, ...entry.generatedPaths]
        .sort((left, right) => left.localeCompare(right)),
    }];
    document.generatedDigests = Object.fromEntries([
      ['CREDITS.csv', digest],
      [escapedDefinition, digest],
      ...entry.generatedPaths.map((generatedPath) => [generatedPath, digest] as const),
    ].sort(([left], [right]) => left.localeCompare(right)));
    expectInvalidMessage(workspace, document, 'canonical managed-relative path');
    expect(sourcePath).toBe('sprites/acme.braid/walk.png');
  });

  it('verifies installed receipt payload coverage, bytes, and regular paths', () => {
    const workspace = workspaceFixture();
    const fixture = installedEntryFixture(workspace);
    const document = v2Document(workspace, [fixture.entry]);

    writeRegistry(workspace, document);
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: true });

    const writeReceipt = (payloadDigests: Readonly<Record<string, string>>): void => {
      writeFileSync(fixture.receiptPath, `${JSON.stringify({
        schema: 'lpc-toolkit.asset-pack-install-receipt.v1',
        workspaceId: workspaceId(workspace),
        packId: fixture.entry.packId,
        version: fixture.entry.version,
        archiveDigest: fixture.entry.archiveDigest,
        contentDigest: fixture.entry.contentDigest,
        installedAt: '2026-07-22T00:00:00.000Z',
        payloadDigests,
      }, null, 2)}\n`);
    };

    const expectedPayloadDigests = {
      [fixture.manifestPath]: sha256(fixture.manifestBytes),
      ...fixture.entry.sourceDigests,
    };

    writeReceipt({});
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    writeReceipt({
      ...expectedPayloadDigests,
      'sprites/extra.png': digest,
    });
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    writeReceipt({ [fixture.sourcePath]: digest });
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    writeReceipt({
      [fixture.manifestPath]: digest,
      ...fixture.entry.sourceDigests,
    });
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    writeReceipt(expectedPayloadDigests);
    writeFileSync(path.join(fixture.entry.installedDirectory!, fixture.manifestPath), 'tampered manifest');
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    writeFileSync(path.join(fixture.entry.installedDirectory!, fixture.manifestPath), fixture.manifestBytes);
    writeFileSync(path.join(fixture.entry.installedDirectory!, fixture.sourcePath), 'tampered');
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    writeFileSync(path.join(fixture.entry.installedDirectory!, fixture.sourcePath), fixture.sourceBytes);

    const outside = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-receipt-outside-'));
    temporaryDirectories.push(outside);
    unlinkSync(fixture.receiptPath);
    symlinkSync(path.join(outside, 'receipt.json'), fixture.receiptPath, 'file');
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    unlinkSync(fixture.receiptPath);
    writeReceipt(expectedPayloadDigests);
    const sourceFile = path.join(fixture.entry.installedDirectory!, fixture.sourcePath);
    unlinkSync(sourceFile);
    symlinkSync(path.join(outside, 'payload.png'), sourceFile, 'file');
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
    unlinkSync(sourceFile);
    writeFileSync(sourceFile, fixture.sourceBytes);
    const manifestFile = path.join(fixture.entry.installedDirectory!, fixture.manifestPath);
    unlinkSync(manifestFile);
    symlinkSync(path.join(outside, 'manifest.json'), manifestFile, 'file');
    expect(readAssetPackRegistry({ workspace, markerWorkspaceId: workspaceId(workspace) })).toMatchObject({ ok: false });
  });

  it('reports non-regular managed output entries without following symlinks or special files', () => {
    const workspace = workspaceFixture();
    const markerBytes = readFileSync(path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'));
    const ownedPath = path.join(workspace.outputRoot, 'owned.txt');
    const digestForOwnedPath = sha256('owned bytes');
    const audit = () => auditPublishedManagedOutput({
      workspace,
      markerBytes,
      generatedDigests: { 'owned.txt': digestForOwnedPath },
    });

    writeFileSync(ownedPath, 'owned bytes');
    expect(audit()).toBeUndefined();

    const outside = mkdtempSync(path.join(os.tmpdir(), 'lpc-asset-pack-registry-output-outside-'));
    temporaryDirectories.push(outside);
    writeFileSync(path.join(outside, 'owned.txt'), 'owned bytes');
    unlinkSync(ownedPath);
    symlinkSync(path.join(outside, 'owned.txt'), ownedPath, 'file');
    expect(audit()).toMatchObject({
      code: 'asset_output_root_unowned',
      message: expect.stringContaining('non-regular'),
    });

    unlinkSync(ownedPath);
    symlinkSync(outside, path.join(workspace.outputRoot, 'linked-directory'), 'dir');
    expect(audit()).toMatchObject({
      code: 'asset_output_root_unowned',
      message: expect.stringContaining('non-regular'),
    });
    unlinkSync(path.join(workspace.outputRoot, 'linked-directory'));

    if (process.platform !== 'win32') {
      const fifo = path.join(workspace.outputRoot, 'managed.fifo');
      execFileSync('mkfifo', [fifo]);
      expect(audit()).toMatchObject({
        code: 'asset_output_root_unowned',
        message: expect.stringContaining('non-regular'),
      });
    }
  });

  it('rejects cross-pack reassigned generated destination ownership', () => {
    const workspace = workspaceFixture();
    const first = linkedEntry(workspace, 'acme.braid');
    const second = linkedEntry(workspace, 'bravo.braid');

    expectInvalid(workspace, v2Document(workspace, [{
      ...first,
      generatedPaths: [],
    }, second]));
  });

  it('rejects unsorted or duplicate acknowledgements and replacements', () => {
    const workspace = workspaceFixture();
    const entry = linkedEntry(workspace);
    const acknowledgement = {
      code: 'asset_path_inferred',
      subject: { destination: 'spritesheets/packages/acme.braid/walk.png' },
      contentDigest: digest,
      reason: 'Reviewed manually.',
    };
    const laterAcknowledgement = {
      ...acknowledgement,
      code: 'asset_baseline_changed',
    };
    const replacement = {
      packId: 'acme.base',
      versions: '>=1.0.0',
      assets: ['hair/braid'],
    };
    const laterReplacement = {
      ...replacement,
      packId: 'bravo.base',
    };

    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      acknowledgements: [acknowledgement, laterAcknowledgement],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      acknowledgements: [acknowledgement, acknowledgement],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      replacements: [laterReplacement, replacement],
    }]));
    expectInvalid(workspace, v2Document(workspace, [{
      ...entry,
      replacements: [replacement, replacement],
    }]));
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
