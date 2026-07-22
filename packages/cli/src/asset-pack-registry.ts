import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ASSET_PACK_SCHEMA,
  BODY_TYPES,
  normalizeAssetPack,
  parseAssetPackSource,
} from '@lpc-toolkit/core';
import type {
  AssetPackAcknowledgement,
  AssetPackCompilePlan,
  CompiledAssetSpriteConsumer,
  CreditEntry,
  ItemDefinition,
  NormalizedAssetPackReplacement,
} from '@lpc-toolkit/core';
import { readAssetPackManagedFile } from './asset-pack-managed-file.js';
import {
  assetPackInstalledDirectory,
  type AssetWorkspace,
} from './asset-workspace.js';

export const ASSET_WORKSPACE_REGISTRY_V1_SCHEMA =
  'lpc-toolkit.asset-workspace-registry.v1' as const;
export const ASSET_WORKSPACE_REGISTRY_SCHEMA =
  'lpc-toolkit.asset-workspace-registry.v2' as const;

export interface AssetPackRegistryEntryBase {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly contentDigest: string;
  readonly acknowledgements: readonly AssetPackAcknowledgement[];
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly generatedPaths: readonly string[];
  readonly logicalDestinations: readonly string[];
  readonly generatedSprites: readonly Omit<AssetPackCompileProjectionSprite, 'packId'>[];
  readonly replacements: readonly NormalizedAssetPackReplacement[];
  readonly baselineDefinitionDigests: Readonly<Record<string, string>>;
  readonly baselineCreditDigests: Readonly<Record<string, string>>;
  readonly generatedCredits: readonly CreditEntry[];
}

export interface LinkedAssetPackRegistryEntry extends AssetPackRegistryEntryBase {
  readonly kind: 'linked';
  readonly sourceDirectory: string;
}

export interface InstalledAssetPackRegistryEntry extends AssetPackRegistryEntryBase {
  readonly kind: 'installed';
  readonly installedDirectory: string;
  readonly archiveDigest: string;
}

export type AssetPackRegistryEntry =
  | LinkedAssetPackRegistryEntry
  | InstalledAssetPackRegistryEntry;

export interface AssetPackRegistryDocument {
  readonly schema: typeof ASSET_WORKSPACE_REGISTRY_SCHEMA;
  readonly workspaceId: string;
  readonly entries: readonly AssetPackRegistryEntry[];
  readonly generatedDigests: Readonly<Record<string, string>>;
  readonly compileDigest: string;
}

export interface AssetPackCompileProjectionDefinition {
  readonly logicalPath: string;
  readonly definition: ItemDefinition;
}

export interface AssetPackCompileProjectionSprite {
  readonly packId: string;
  readonly assetId: string;
  readonly sourcePath: string;
  readonly sourceDigest: string;
  readonly destinationPath: string;
  readonly destinationDigest: string;
  readonly animation: string;
  readonly consumers: readonly CompiledAssetSpriteConsumer[];
}

export interface AssetPackCompileProjectionOwnership {
  readonly packId: string;
  readonly logicalPaths: readonly string[];
}

export interface AssetPackCompileProjection {
  readonly definitions: readonly AssetPackCompileProjectionDefinition[];
  readonly sprites: readonly AssetPackCompileProjectionSprite[];
  readonly credits: readonly CreditEntry[];
  readonly ownership: readonly AssetPackCompileProjectionOwnership[];
}

export interface LinkedAssetPackRegistryEntryV1 {
  readonly kind: 'linked';
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly sourceDirectory: string;
  readonly contentDigest: string;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly generatedPaths: readonly string[];
  readonly baselineDefinitionDigests: Readonly<Record<string, string>>;
  readonly baselineCreditDigests: Readonly<Record<string, string>>;
}

export interface AssetPackRegistryV1Read {
  readonly schema: typeof ASSET_WORKSPACE_REGISTRY_V1_SCHEMA;
  readonly workspaceId: string;
  readonly entries: readonly LinkedAssetPackRegistryEntryV1[];
  readonly generatedDigests: Readonly<Record<string, string>>;
}

export interface AssetPackLifecycleDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly path?: string;
  readonly packId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type AssetPackRegistryReadResult =
  | { readonly ok: true; readonly document: AssetPackRegistryDocument | AssetPackRegistryV1Read; readonly needsMigration: boolean }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const V1_DOCUMENT_KEYS = ['schema', 'workspaceId', 'entries', 'generatedDigests'] as const;
const V1_ENTRY_KEYS = ['kind', 'packId', 'version', 'displayName', 'sourceDirectory', 'contentDigest', 'sourceDigests', 'generatedPaths', 'baselineDefinitionDigests', 'baselineCreditDigests'] as const;
const V2_DOCUMENT_KEYS = ['schema', 'workspaceId', 'entries', 'generatedDigests', 'compileDigest'] as const;
const BASE_ENTRY_KEYS = ['kind', 'packId', 'version', 'displayName', 'contentDigest', 'acknowledgements', 'sourceDigests', 'generatedPaths', 'logicalDestinations', 'generatedSprites', 'replacements', 'baselineDefinitionDigests', 'baselineCreditDigests', 'generatedCredits'] as const;
const CREDIT_KEYS = ['file', 'notes', 'authors', 'licenses', 'urls'] as const;
const GENERATED_SPRITE_KEYS = ['assetId', 'sourcePath', 'sourceDigest', 'destinationPath', 'destinationDigest', 'animation', 'consumers'] as const;
const GENERATED_SPRITE_CONSUMER_KEYS = ['itemId', 'typeName', 'layer', 'bodyTypes', 'variant'] as const;
const RECEIPT_SCHEMA = 'lpc-toolkit.asset-pack-install-receipt.v1';
const RECEIPT_KEYS = ['schema', 'workspaceId', 'packId', 'version', 'archiveDigest', 'contentDigest', 'installedAt', 'payloadDigests'] as const;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;

type ManagedPathKind = 'generic' | 'source' | 'output' | 'destination' | 'credit' | 'outputDigest';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in record));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`${label} must contain exactly these keys: ${keys.join(', ')}.`);
  }
}

function stringAt(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label}.${key} must be a non-empty string.`);
  return value;
}

function digestAt(record: Record<string, unknown>, key: string, label: string): string {
  const digest = stringAt(record, key, label);
  if (!DIGEST.test(digest)) throw new Error(`${label}.${key} must be a sha256 digest.`);
  return digest;
}

function sortedUniqueStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  const entries = [...value] as string[];
  const sorted = [...entries].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(entries) !== JSON.stringify(sorted) || new Set(entries).size !== entries.length) {
    throw new Error(`${label} must be sorted and unique.`);
  }
  return entries;
}

function requireCanonicalManagedRelativePath(
  value: string,
  label: string,
  kind: ManagedPathKind,
): string {
  if (
    value.length === 0
    || value !== value.normalize('NFC')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} must be a canonical managed-relative path.`);
  }
  const segments = value.split('/');
  if (
    path.posix.normalize(value) !== value
    || segments.some((segment) => (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || /[<>:"|?*]/u.test(segment)
      || /[. ]$/u.test(segment)
      || WINDOWS_RESERVED_NAME.test(segment)
    ))
  ) {
    throw new Error(`${label} must be a canonical managed-relative path.`);
  }
  const allowed = kind === 'generic'
    || (kind === 'source' && value.startsWith('sprites/'))
    || (kind === 'output' && (
      value.startsWith('sheet_definitions/') || value.startsWith('spritesheets/')
    ))
    || (kind === 'destination' && value.startsWith('spritesheets/'))
    || kind === 'credit'
    || (kind === 'outputDigest' && (
      value === 'CREDITS.csv'
      || value.startsWith('sheet_definitions/')
      || value.startsWith('spritesheets/')
    ));
  if (!allowed) throw new Error(`${label} must use an allowed managed output path.`);
  return value;
}

function assertNoManagedPathCollisions(paths: readonly string[], label: string): void {
  const seen = new Map<string, string>();
  for (const candidate of paths) {
    const collisionKey = candidate.normalize('NFC').toLowerCase();
    const existing = seen.get(collisionKey);
    if (existing !== undefined && existing !== candidate) {
      throw new Error(`${label} must not contain case- or Unicode-colliding paths.`);
    }
    seen.set(collisionKey, candidate);
  }
}

function sortedUniqueManagedPaths(
  value: unknown,
  label: string,
  kind: ManagedPathKind,
): readonly string[] {
  const paths = sortedUniqueStrings(value, label)
    .map((entry) => requireCanonicalManagedRelativePath(entry, label, kind));
  assertNoManagedPathCollisions(paths, label);
  return paths;
}

function sortedUniqueBy<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  label: string,
): readonly T[] {
  const keys = entries.map(key);
  const sorted = [...keys].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(keys) !== JSON.stringify(sorted) || new Set(keys).size !== keys.length) {
    throw new Error(`${label} must be sorted and unique.`);
  }
  return entries;
}

function sortedDigestRecord(
  value: unknown,
  label: string,
  pathKind: ManagedPathKind = 'generic',
): Readonly<Record<string, string>> {
  const record = requireRecord(value, label);
  const entries = Object.entries(record);
  for (const [key, digest] of entries) {
    if (typeof digest !== 'string' || !DIGEST.test(digest)) {
      throw new Error(`${label} must map non-empty paths to sha256 digests.`);
    }
    requireCanonicalManagedRelativePath(key, label, pathKind);
  }
  assertNoManagedPathCollisions(entries.map(([key]) => key), label);
  const sorted = [...entries].sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(entries.map(([key]) => key)) !== JSON.stringify(sorted.map(([key]) => key))) {
    throw new Error(`${label} keys must be sorted.`);
  }
  return Object.fromEntries(sorted) as Readonly<Record<string, string>>;
}

function containedPath(root: string, candidate: string, label: string): string {
  const resolvedRoot = path.resolve(root);
  const rootStats = lstatSync(resolvedRoot);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(`${label} has an invalid containment root: ${resolvedRoot}.`);
  }
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must be contained by ${resolvedRoot}.`);
  }
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symbolic link: ${current}.`);
    }
  }
  return resolved;
}

function readRegularManagedFile(root: string, logicalPath: string, label: string): Buffer {
  const safePath = requireCanonicalManagedRelativePath(logicalPath, label, 'generic');
  const rootStats = lstatSync(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(`${label} has an invalid managed root: ${root}.`);
  }
  let current = root;
  const segments = safePath.split('/');
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stats = lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symbolic link: ${current}.`);
    }
    if (index < segments.length - 1) {
      if (!stats.isDirectory()) throw new Error(`${label} has a non-directory path component: ${current}.`);
      continue;
    }
    if (!stats.isFile()) throw new Error(`${label} must be a regular file: ${current}.`);
  }
  return readAssetPackManagedFile({ filePath: current, label }).bytes;
}

export function resolveLinkedAssetPackDirectory(
  workspace: AssetWorkspace,
  sourceDirectory: string,
): string {
  return containedPath(
    workspace.packsRoot,
    sourceDirectory,
    'Linked asset-pack sourceDirectory',
  );
}

function normalizedEntryFieldsFromCore(options: {
  readonly packId: string;
  readonly version: string;
  readonly acknowledgements: unknown;
  readonly replacements: unknown;
}): {
  readonly acknowledgements: readonly AssetPackAcknowledgement[];
  readonly replacements: readonly NormalizedAssetPackReplacement[];
} {
  const parsed = parseAssetPackSource({
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: options.version,
    displayName: 'Asset workspace registry semantic validation',
    credits: {
      authors: ['lpc-toolkit'],
      licenses: ['CC0'],
      urls: ['https://example.com/lpc-toolkit'],
      notes: '',
    },
    acknowledgements: options.acknowledgements,
    replaces: options.replacements,
    assets: [],
  });
  if (!parsed.ok) {
    throw new Error(`Asset-pack registry acknowledgement or replacement is invalid: ${parsed.diagnostics[0]?.message ?? 'Core rejected the value.'}`);
  }
  const normalized = normalizeAssetPack(parsed.source);
  if (
    JSON.stringify(canonical(options.acknowledgements))
      !== JSON.stringify(canonical(normalized.acknowledgements))
    || JSON.stringify(canonical(options.replacements))
      !== JSON.stringify(canonical(normalized.replacements))
  ) {
    throw new Error('Asset-pack registry acknowledgements and replacements must use Core canonical normalization.');
  }
  const acknowledgements = sortedUniqueBy(
    normalized.acknowledgements,
    (acknowledgement) => [
      acknowledgement.code,
      acknowledgement.contentDigest,
      acknowledgement.reason,
      JSON.stringify(canonical(acknowledgement.subject)),
    ].join('\u0000'),
    'Asset-pack registry entry.acknowledgements',
  );
  const replacements = sortedUniqueBy(
    normalized.replacements.map((replacement) => ({
      ...replacement,
      assets: sortedUniqueStrings(replacement.assets, 'Asset-pack registry entry.replacements.assets'),
    })),
    (replacement) => [
      replacement.packId,
      replacement.versions,
      replacement.assets.join('\u0000'),
    ].join('\u0000'),
    'Asset-pack registry entry.replacements',
  );
  return { acknowledgements, replacements };
}

function readGeneratedSpriteConsumers(
  value: unknown,
  label: string,
): readonly CompiledAssetSpriteConsumer[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const consumers = value.map((entry, index) => {
    const record = requireRecord(entry, `${label}[${index}]`);
    const keys = record.variant === undefined
      ? GENERATED_SPRITE_CONSUMER_KEYS.filter((key) => key !== 'variant')
      : GENERATED_SPRITE_CONSUMER_KEYS;
    exactKeys(record, keys, `${label}[${index}]`);
    return {
      itemId: stringAt(record, 'itemId', `${label}[${index}]`),
      typeName: stringAt(record, 'typeName', `${label}[${index}]`),
      layer: stringAt(record, 'layer', `${label}[${index}]`) as `layer_${number}`,
      bodyTypes: sortedBodyTypes(record.bodyTypes, `${label}[${index}].bodyTypes`),
      ...(record.variant === undefined
        ? {}
        : { variant: stringAt(record, 'variant', `${label}[${index}]`) }),
    };
  });
  return sortedUniqueBy(
    consumers,
    (consumer) => JSON.stringify(canonical(consumer)),
    label,
  );
}

function sortedBodyTypes(
  value: unknown,
  label: string,
): CompiledAssetSpriteConsumer['bodyTypes'] {
  if (!Array.isArray(value) || value.some((bodyType) => typeof bodyType !== 'string' || bodyType.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  const bodyTypes = [...value] as string[];
  if (new Set(bodyTypes).size !== bodyTypes.length) {
    throw new Error(`${label} must be unique.`);
  }
  const normalized = BODY_TYPES.filter((bodyType) => bodyTypes.includes(bodyType));
  if (!pathsEqual(bodyTypes, normalized)) {
    throw new Error(`${label} must use canonical body type order.`);
  }
  return normalized;
}

function readGeneratedSprites(
  value: unknown,
  label: string,
): readonly Omit<AssetPackCompileProjectionSprite, 'packId'>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const sprites = value.map((entry, index) => {
    const record = requireRecord(entry, `${label}[${index}]`);
    exactKeys(record, GENERATED_SPRITE_KEYS, `${label}[${index}]`);
    return {
      assetId: stringAt(record, 'assetId', `${label}[${index}]`),
      sourcePath: requireCanonicalManagedRelativePath(
        stringAt(record, 'sourcePath', `${label}[${index}]`),
        `${label}[${index}].sourcePath`,
        'source',
      ),
      sourceDigest: digestAt(record, 'sourceDigest', `${label}[${index}]`),
      destinationPath: requireCanonicalManagedRelativePath(
        stringAt(record, 'destinationPath', `${label}[${index}]`),
        `${label}[${index}].destinationPath`,
        'destination',
      ),
      destinationDigest: digestAt(record, 'destinationDigest', `${label}[${index}]`),
      animation: stringAt(record, 'animation', `${label}[${index}]`),
      consumers: readGeneratedSpriteConsumers(record.consumers, `${label}[${index}].consumers`),
    };
  });
  return sortedUniqueBy(
    sprites,
    (sprite) => [sprite.destinationPath, sprite.sourcePath].join('\u0000'),
    label,
  );
}

function readCredits(value: unknown, label: string): readonly CreditEntry[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const credits = value.map((entry, index) => {
    const record = requireRecord(entry, `${label}[${index}]`);
    exactKeys(record, CREDIT_KEYS, `${label}[${index}]`);
    return {
      file: requireCanonicalManagedRelativePath(
        stringAt(record, 'file', `${label}[${index}]`),
        `${label}[${index}].file`,
        'credit',
      ),
      notes: typeof record.notes === 'string' ? record.notes : (() => { throw new Error(`${label}[${index}].notes must be a string.`); })(),
      authors: readCreditStrings(record.authors, `${label}[${index}].authors`),
      licenses: readCreditStrings(record.licenses, `${label}[${index}].licenses`) as CreditEntry['licenses'],
      urls: readCreditStrings(record.urls, `${label}[${index}].urls`),
    };
  });
  const files = credits.map((credit) => credit.file);
  if (JSON.stringify(files) !== JSON.stringify([...files].sort((left, right) => left.localeCompare(right))) || new Set(files).size !== files.length) {
    throw new Error(`${label} must be sorted by unique credit file.`);
  }
  assertNoManagedPathCollisions(files, label);
  return credits;
}

function readCreditStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return [...value] as readonly string[];
}

function readV1Entry(value: unknown): LinkedAssetPackRegistryEntryV1 {
  const record = requireRecord(value, 'Linked asset-pack registry entry');
  exactKeys(record, V1_ENTRY_KEYS, 'Linked asset-pack registry entry');
  if (stringAt(record, 'kind', 'Linked asset-pack registry entry') !== 'linked') throw new Error('Unknown linked asset-pack registry entry kind.');
  return {
    kind: 'linked', packId: stringAt(record, 'packId', 'Linked asset-pack registry entry'),
    version: stringAt(record, 'version', 'Linked asset-pack registry entry'), displayName: stringAt(record, 'displayName', 'Linked asset-pack registry entry'),
    sourceDirectory: stringAt(record, 'sourceDirectory', 'Linked asset-pack registry entry'),
    contentDigest: stringAt(record, 'contentDigest', 'Linked asset-pack registry entry'),
    sourceDigests: sortedDigestRecord(record.sourceDigests, 'Linked asset-pack registry entry.sourceDigests', 'source'),
    generatedPaths: sortedUniqueManagedPaths(record.generatedPaths, 'Linked asset-pack registry entry.generatedPaths', 'output'),
    baselineDefinitionDigests: sortedDigestRecord(record.baselineDefinitionDigests, 'Linked asset-pack registry entry.baselineDefinitionDigests'),
    baselineCreditDigests: sortedDigestRecord(record.baselineCreditDigests, 'Linked asset-pack registry entry.baselineCreditDigests'),
  };
}

function readV2Entry(value: unknown, workspace: AssetWorkspace, workspaceId: string): AssetPackRegistryEntry {
  const record = requireRecord(value, 'Asset-pack registry entry');
  const kind = stringAt(record, 'kind', 'Asset-pack registry entry');
  const entryKeys = [...BASE_ENTRY_KEYS, ...(kind === 'linked' ? ['sourceDirectory'] : kind === 'installed' ? ['installedDirectory', 'archiveDigest'] : [])];
  exactKeys(record, entryKeys, 'Asset-pack registry entry');
  if (kind !== 'linked' && kind !== 'installed') throw new Error(`Unknown asset-pack registry entry kind: ${kind}.`);
  const packId = stringAt(record, 'packId', 'Asset-pack registry entry');
  const version = stringAt(record, 'version', 'Asset-pack registry entry');
  const normalizedFields = normalizedEntryFieldsFromCore({
    packId,
    version,
    acknowledgements: record.acknowledgements,
    replacements: record.replacements,
  });
  const base: AssetPackRegistryEntryBase = {
    packId, version,
    displayName: stringAt(record, 'displayName', 'Asset-pack registry entry'), contentDigest: digestAt(record, 'contentDigest', 'Asset-pack registry entry'),
    acknowledgements: normalizedFields.acknowledgements,
    sourceDigests: sortedDigestRecord(record.sourceDigests, 'Asset-pack registry entry.sourceDigests', 'source'),
    generatedPaths: sortedUniqueManagedPaths(record.generatedPaths, 'Asset-pack registry entry.generatedPaths', 'output'),
    logicalDestinations: sortedUniqueManagedPaths(record.logicalDestinations, 'Asset-pack registry entry.logicalDestinations', 'destination'),
    generatedSprites: readGeneratedSprites(record.generatedSprites, 'Asset-pack registry entry.generatedSprites'),
    replacements: normalizedFields.replacements,
    baselineDefinitionDigests: sortedDigestRecord(record.baselineDefinitionDigests, 'Asset-pack registry entry.baselineDefinitionDigests'),
    baselineCreditDigests: sortedDigestRecord(record.baselineCreditDigests, 'Asset-pack registry entry.baselineCreditDigests'),
    generatedCredits: readCredits(record.generatedCredits, 'Asset-pack registry entry.generatedCredits'),
  };
  if (kind === 'linked') {
    return {
      ...base,
      kind,
      sourceDirectory: resolveLinkedAssetPackDirectory(
        workspace,
        stringAt(record, 'sourceDirectory', 'Asset-pack registry entry'),
      ),
    };
  }
  const archiveDigest = digestAt(record, 'archiveDigest', 'Asset-pack registry entry');
  const installedDirectoryValue = stringAt(
    record,
    'installedDirectory',
    'Asset-pack registry entry',
  );
  const expectedInstalledDirectory = assetPackInstalledDirectory({
    workspace,
    packId,
    version,
    archiveDigest,
  });
  if (installedDirectoryValue !== expectedInstalledDirectory) {
    throw new Error(
      `Installed asset-pack registry entry must use its exact content-addressed directory: ${expectedInstalledDirectory}.`,
    );
  }
  const installedDirectory = verifyInstalledAssetPackDirectory({
    workspace,
    workspaceId,
    installedDirectory: installedDirectoryValue,
    entry: base,
    archiveDigest,
  });
  return { ...base, kind, installedDirectory, archiveDigest };
}

export function verifyInstalledAssetPackDirectory(options: {
  readonly workspace: AssetWorkspace;
  readonly workspaceId: string;
  readonly installedDirectory: string;
  readonly entry: Pick<
    AssetPackRegistryEntryBase,
    'packId' | 'version' | 'contentDigest' | 'sourceDigests'
  >;
  readonly archiveDigest: string;
}): string {
  const directory = containedPath(
    path.join(options.workspace.stateRoot, 'installed'),
    options.installedDirectory,
    'Installed asset-pack installedDirectory',
  );
  verifyInstallReceipt(
    directory,
    options.workspaceId,
    options.entry,
    options.archiveDigest,
  );
  return directory;
}

function verifyInstallReceipt(
  directory: string,
  workspaceId: string,
  entry: Pick<
    AssetPackRegistryEntryBase,
    'packId' | 'version' | 'contentDigest' | 'sourceDigests'
  >,
  archiveDigest: string,
): void {
  const receiptPath = path.join(directory, 'install-receipt.json');
  if (!existsSync(receiptPath)) throw new Error(`Installed asset-pack receipt is missing: ${receiptPath}.`);
  const receipt = requireRecord(
    JSON.parse(readRegularManagedFile(directory, 'install-receipt.json', 'Installed asset-pack receipt').toString('utf8')) as unknown,
    'Installed asset-pack receipt',
  );
  exactKeys(receipt, RECEIPT_KEYS, 'Installed asset-pack receipt');
  if (stringAt(receipt, 'schema', 'Installed asset-pack receipt') !== RECEIPT_SCHEMA || stringAt(receipt, 'workspaceId', 'Installed asset-pack receipt') !== workspaceId || stringAt(receipt, 'packId', 'Installed asset-pack receipt') !== entry.packId || stringAt(receipt, 'version', 'Installed asset-pack receipt') !== entry.version || digestAt(receipt, 'archiveDigest', 'Installed asset-pack receipt') !== archiveDigest || digestAt(receipt, 'contentDigest', 'Installed asset-pack receipt') !== entry.contentDigest) {
    throw new Error(`Installed asset-pack receipt does not match registry entry: ${receiptPath}.`);
  }
  stringAt(receipt, 'installedAt', 'Installed asset-pack receipt');
  const payloadDigests = sortedDigestRecord(
    receipt.payloadDigests,
    'Installed asset-pack receipt.payloadDigests',
    'generic',
  );
  const expectedPayloadPaths = ['asset-pack.json', ...Object.keys(entry.sourceDigests)]
    .sort((left, right) => left.localeCompare(right));
  if (!pathsEqual(Object.keys(payloadDigests), expectedPayloadPaths)) {
    throw new Error(`Installed asset-pack receipt payload coverage does not match registry source payload: ${receiptPath}.`);
  }
  for (const [sourcePath, digest] of Object.entries(entry.sourceDigests)) {
    if (payloadDigests[sourcePath] !== digest) {
      throw new Error(`Installed asset-pack receipt payload digest does not match registry source payload: ${sourcePath}.`);
    }
  }
  for (const [payloadPath, digest] of Object.entries(payloadDigests)) {
    const bytes = readRegularManagedFile(directory, payloadPath, 'Installed asset-pack payload');
    const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (actual !== digest) {
      throw new Error(`Installed asset-pack payload digest does not match its receipt: ${payloadPath}.`);
    }
  }
}

function emptyCompileProjection(): AssetPackCompileProjection {
  return { definitions: [], sprites: [], credits: [], ownership: [] };
}

function canonicalCompileProjection(
  projection: AssetPackCompileProjection,
): AssetPackCompileProjection {
  return {
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
      .map((ownership) => ({
        ...ownership,
        logicalPaths: [...ownership.logicalPaths].sort((left, right) => left.localeCompare(right)),
      })),
  };
}

function emptyDocument(workspaceId: string): AssetPackRegistryDocument {
  return {
    schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
    workspaceId,
    entries: [],
    generatedDigests: {},
    compileDigest: assetPackCompileDigest(emptyCompileProjection()),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function pathsEqual(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateGeneratedEntryRelationships(
  entries: readonly AssetPackRegistryEntry[],
  generatedDigests: Readonly<Record<string, string>>,
  definitions: readonly AssetPackCompileProjectionDefinition[],
): void {
  for (const entry of entries) {
    const spriteDestinations = entry.generatedSprites.map((sprite) => sprite.destinationPath);
    if (!pathsEqual(entry.logicalDestinations, spriteDestinations)) {
      throw new Error(`Asset-pack registry logical destinations must exactly match generated sprites for ${entry.packId}.`);
    }
    const ownedPaths = new Set(entry.generatedPaths);
    for (const sprite of entry.generatedSprites) {
      if (!ownedPaths.has(sprite.destinationPath)) {
        throw new Error(`Asset-pack registry generated sprite destination is not owned by ${entry.packId}: ${sprite.destinationPath}.`);
      }
      if (entry.sourceDigests[sprite.sourcePath] !== sprite.sourceDigest) {
        throw new Error(`Asset-pack registry generated sprite source digest does not match ${entry.packId}: ${sprite.sourcePath}.`);
      }
      if (generatedDigests[sprite.destinationPath] !== sprite.destinationDigest) {
        throw new Error(`Asset-pack registry generated sprite destination digest does not match ${entry.packId}: ${sprite.destinationPath}.`);
      }
    }
    for (const generatedPath of entry.generatedPaths) {
      if (!ownedPaths.has(generatedPath)) continue;
      if (!spriteDestinations.includes(generatedPath) && !generatedPath.startsWith('sheet_definitions/')) {
        throw new Error(`Asset-pack registry generated path is neither a definition nor a logical destination for ${entry.packId}: ${generatedPath}.`);
      }
    }
    const expectedCredits = compilerCreditsForOwnedDefinitions(entry, definitions);
    for (const destination of entry.logicalDestinations) {
      const file = destination.slice('spritesheets/'.length);
      if (!expectedCredits.some((credit) => credit.file === file)) {
        throw new Error(`Asset-pack registry logical destination is missing compiler-derived credit data for ${entry.packId}: ${destination}.`);
      }
    }
    if (
      JSON.stringify(canonical(entry.generatedCredits))
        !== JSON.stringify(canonical(expectedCredits))
    ) {
      throw new Error(`Asset-pack registry generated credits must exactly match compiler-derived rows for ${entry.packId}.`);
    }
  }
}

function readCompileDefinitions(
  workspace: AssetWorkspace,
  entries: readonly AssetPackRegistryEntry[],
): readonly AssetPackCompileProjectionDefinition[] {
  const logicalPaths = [...new Set(entries.flatMap((entry) => entry.generatedPaths)
    .filter((generatedPath) => generatedPath.startsWith('sheet_definitions/')))]
    .sort((left, right) => left.localeCompare(right));
  return logicalPaths.map((logicalPath) => {
    const definition = requireRecord(
      JSON.parse(readRegularManagedFile(
        workspace.outputRoot,
        logicalPath,
        `Generated definition ${logicalPath}`,
      ).toString('utf8')) as unknown,
      `Generated definition ${logicalPath}`,
    ) as unknown as ItemDefinition;
    return { logicalPath, definition };
  });
}

function compilerCreditsForOwnedDefinitions(
  entry: AssetPackRegistryEntry,
  definitions: readonly AssetPackCompileProjectionDefinition[],
): readonly CreditEntry[] {
  const credits = new Map<string, CreditEntry>();
  for (const definition of definitions) {
    if (!entry.generatedPaths.includes(definition.logicalPath)) continue;
    for (const credit of readCredits(
      definition.definition.credits,
      `Generated definition ${definition.logicalPath}.credits`,
    )) {
      const existing = credits.get(credit.file);
      if (
        existing !== undefined
        && JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(credit))
      ) {
        throw new Error(`Generated definitions disagree on compiler-derived credit data: ${credit.file}.`);
      }
      credits.set(credit.file, credit);
    }
  }
  return [...credits.values()].sort((left, right) => left.file.localeCompare(right.file));
}

function uniqueGeneratedCredits(
  entries: readonly AssetPackRegistryEntry[],
): readonly CreditEntry[] {
  const credits = new Map<string, CreditEntry>();
  for (const credit of entries.flatMap((entry) => entry.generatedCredits)) {
    const existing = credits.get(credit.file);
    if (existing !== undefined && JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(credit))) {
      throw new Error(`Asset-pack registry generated credits disagree for ${credit.file}.`);
    }
    credits.set(credit.file, credit);
  }
  assertNoManagedPathCollisions([...credits.keys()], 'Asset-pack registry generated credits');
  return [...credits.values()].sort((left, right) => left.file.localeCompare(right.file));
}

export function assetPackCompileProjectionFromRegistry(options: {
  readonly workspace: AssetWorkspace;
  readonly entries: readonly AssetPackRegistryEntry[];
  readonly definitions?: readonly AssetPackCompileProjectionDefinition[];
}): AssetPackCompileProjection {
  return {
    definitions: options.definitions ?? readCompileDefinitions(options.workspace, options.entries),
    sprites: options.entries.flatMap((entry) => entry.generatedSprites.map((sprite) => ({
      ...sprite,
      packId: entry.packId,
    }))),
    credits: uniqueGeneratedCredits(options.entries),
    ownership: options.entries.map((entry) => ({
      packId: entry.packId,
      logicalPaths: entry.generatedPaths,
    })),
  };
}

export function assetPackCompileProjectionFromPlan(options: {
  readonly compilePlan: AssetPackCompilePlan;
  readonly sourceDigestsByPackId: ReadonlyMap<string, ReadonlyMap<string, string>>;
}): AssetPackCompileProjection {
  return {
    definitions: options.compilePlan.definitions.map((definition) => ({
      logicalPath: definition.logicalPath,
      definition: definition.definition,
    })),
    sprites: options.compilePlan.sprites.map((sprite) => {
      const sourceDigest = options.sourceDigestsByPackId.get(sprite.packId)?.get(sprite.sourcePath);
      if (sourceDigest === undefined) {
        throw new Error(`No captured source digest for compiled sprite ${sprite.packId}:${sprite.sourcePath}.`);
      }
      return {
        packId: sprite.packId,
        assetId: sprite.assetId,
        sourcePath: sprite.sourcePath,
        sourceDigest,
        destinationPath: sprite.destinationPath,
        destinationDigest: sourceDigest,
        animation: sprite.animation,
        consumers: sprite.consumers,
      };
    }),
    credits: options.compilePlan.credits,
    ownership: options.compilePlan.ownership.map((ownership) => ({
      packId: ownership.packId,
      logicalPaths: ownership.logicalPaths,
    })),
  };
}

export function readAssetPackRegistry(options: { readonly workspace: AssetWorkspace; readonly markerWorkspaceId: string }): AssetPackRegistryReadResult {
  try {
    let registryBytes: Buffer;
    try {
      registryBytes = readAssetPackManagedFile({
        filePath: options.workspace.registryPath,
        label: 'Asset workspace registry',
      }).bytes;
    } catch (error) {
      if (
        error instanceof Error
        && 'code' in error
        && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        const files = snapshotManagedOutputFiles(options.workspace.outputRoot);
        files.delete('.lpc-toolkit-managed.json');
        if (files.size > 0) throw new Error('Managed asset output contains files but the asset-pack registry is missing.');
        return { ok: true, document: emptyDocument(options.markerWorkspaceId), needsMigration: false };
      }
      throw error;
    }
    const record = requireRecord(JSON.parse(registryBytes.toString('utf8')) as unknown, 'Asset workspace registry');
    const schema = stringAt(record, 'schema', 'Asset workspace registry');
    if (schema === ASSET_WORKSPACE_REGISTRY_V1_SCHEMA) {
      exactKeys(record, V1_DOCUMENT_KEYS, 'Asset workspace registry');
      const workspaceId = stringAt(record, 'workspaceId', 'Asset workspace registry');
      if (workspaceId !== options.markerWorkspaceId) throw new Error('Managed asset output marker does not match the linked-pack registry.');
      if (!Array.isArray(record.entries)) throw new Error('Asset workspace registry.entries must be an array.');
      const entries = record.entries.map(readV1Entry);
      const ids = entries.map((entry) => entry.packId);
      if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify([...ids].sort((left, right) => left.localeCompare(right)))) throw new Error('Asset workspace registry entries must have sorted unique pack IDs.');
      const generatedDigests = sortedDigestRecord(
        record.generatedDigests,
        'Asset workspace registry.generatedDigests',
        'outputDigest',
      );
      const owned = new Set(entries.flatMap((entry) => entry.generatedPaths));
      if (entries.length > 0) owned.add('CREDITS.csv');
      if (!pathsEqual(Object.keys(generatedDigests), [...owned].sort((left, right) => left.localeCompare(right)))) {
        throw new Error('Asset workspace registry generatedDigests must exactly cover generated output paths.');
      }
      return {
        ok: true,
        needsMigration: true,
        document: {
          schema: ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
          workspaceId,
          entries,
          generatedDigests,
        },
      };
    }
    if (schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA) throw new Error(`Unknown asset workspace registry schema: ${schema}.`);
    exactKeys(record, V2_DOCUMENT_KEYS, 'Asset workspace registry');
    const workspaceId = stringAt(record, 'workspaceId', 'Asset workspace registry');
    if (workspaceId !== options.markerWorkspaceId) throw new Error('Managed asset output marker does not match the linked-pack registry.');
    if (!Array.isArray(record.entries)) throw new Error('Asset workspace registry.entries must be an array.');
    const entries = record.entries.map((entry) => readV2Entry(entry, options.workspace, workspaceId));
    const ids = entries.map((entry) => entry.packId);
    if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify([...ids].sort((left, right) => left.localeCompare(right)))) throw new Error('Asset workspace registry entries must have sorted unique pack IDs.');
    const destinations = entries.flatMap((entry) => entry.logicalDestinations);
    if (new Set(destinations).size !== destinations.length) throw new Error('Asset workspace registry logical destinations must not conflict.');
    const generatedDigests = sortedDigestRecord(
      record.generatedDigests,
      'Asset workspace registry.generatedDigests',
      'outputDigest',
    );
    const owned = new Set(entries.flatMap((entry) => entry.generatedPaths));
    if (entries.length > 0) owned.add('CREDITS.csv');
    if (JSON.stringify(Object.keys(generatedDigests)) !== JSON.stringify([...owned].sort((left, right) => left.localeCompare(right)))) throw new Error('Asset workspace registry generatedDigests must exactly cover generated output paths.');
    const definitions = readCompileDefinitions(options.workspace, entries);
    validateGeneratedEntryRelationships(entries, generatedDigests, definitions);
    const compileDigest = digestAt(record, 'compileDigest', 'Asset workspace registry');
    if (compileDigest !== assetPackCompileDigest(assetPackCompileProjectionFromRegistry({
      workspace: options.workspace,
      entries,
      definitions,
    }))) {
      throw new Error('Asset workspace registry compileDigest does not match the compiled registry state.');
    }
    const document: AssetPackRegistryDocument = { schema: ASSET_WORKSPACE_REGISTRY_SCHEMA, workspaceId, entries, generatedDigests, compileDigest };
    return { ok: true, document, needsMigration: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      diagnostics: [{
        code: message.includes('marker does not match') || message.includes('output contains files')
          ? 'asset_output_root_unowned'
          : 'asset_digest_mismatch',
        severity: 'error',
        message,
        path: options.workspace.registryPath,
      }],
    };
  }
}

export function assetPackRegistryBytes(document: AssetPackRegistryDocument): Buffer {
  return Buffer.from(`${JSON.stringify(canonical(document), null, 2)}\n`);
}

export function assetPackCompileDigest(projection: AssetPackCompileProjection): string {
  return sha256(canonicalCompileProjection(projection));
}

export function snapshotManagedOutputFiles(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  if (!existsSync(root)) return files;
  const rootStats = lstatSync(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(`Managed asset output root is not a directory: ${root}.`);
  }
  const visit = (current: string, relative: string): void => {
    const currentStats = lstatSync(current);
    if (currentStats.isSymbolicLink() || !currentStats.isDirectory()) {
      throw new Error(`Managed asset output contains a non-regular path: ${relative || '.'}.`);
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const logicalPath = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      const stats = lstatSync(target);
      if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
        throw new Error(`Managed asset output contains a non-regular path: ${logicalPath}.`);
      }
      if (stats.isDirectory()) {
        visit(target, logicalPath);
      } else {
        files.set(logicalPath, readFileSync(target));
      }
    }
  };
  visit(root, '');
  return files;
}

export function auditPublishedManagedOutput(options: { readonly workspace: AssetWorkspace; readonly markerBytes: Buffer; readonly generatedDigests: Readonly<Record<string, string>> }): AssetPackLifecycleDiagnostic | undefined {
  let files: Map<string, Buffer>;
  try {
    files = snapshotManagedOutputFiles(options.workspace.outputRoot);
  } catch (error) {
    return {
      code: 'asset_output_root_unowned',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      path: options.workspace.outputRoot,
    };
  }
  const expected = new Set(['.lpc-toolkit-managed.json', ...Object.keys(options.generatedDigests)]);
  const stray = [...files.keys()].sort().find((file) => !expected.has(file));
  if (stray) return { code: 'asset_output_root_unowned', severity: 'error', message: `Managed asset output contains an unowned file: ${stray}`, path: path.join(options.workspace.outputRoot, stray) };
  for (const file of [...expected].sort()) {
    try {
      readRegularManagedFile(options.workspace.outputRoot, file, 'Managed asset output');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return { code: 'asset_digest_mismatch', severity: 'error', message: `Managed asset output is missing a registry-owned file: ${file}`, path: path.join(options.workspace.outputRoot, file) };
      }
      return {
        code: 'asset_output_root_unowned',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        path: path.join(options.workspace.outputRoot, file),
      };
    }
  }
  for (const [file, digest] of Object.entries(options.generatedDigests)) {
    const bytes = files.get(file);
    const actual = bytes ? `sha256:${createHash('sha256').update(bytes).digest('hex')}` : undefined;
    if (actual !== digest) return { code: 'asset_digest_mismatch', severity: 'error', message: `Managed asset output differs from the registry-owned generated file: ${file}`, path: path.join(options.workspace.outputRoot, file) };
  }
  if (!files.get('.lpc-toolkit-managed.json')?.equals(options.markerBytes)) return { code: 'asset_digest_mismatch', severity: 'error', message: 'Managed asset output marker differs from the expected marker.', path: path.join(options.workspace.outputRoot, '.lpc-toolkit-managed.json') };
  return undefined;
}
