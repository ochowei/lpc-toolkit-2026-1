import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type {
  AssetPackAcknowledgement,
  CreditEntry,
  NormalizedAssetPackReplacement,
} from '@lpc-toolkit/core';
import type { AssetWorkspace } from './asset-workspace.js';

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
const BASE_ENTRY_KEYS = ['kind', 'packId', 'version', 'displayName', 'contentDigest', 'acknowledgements', 'sourceDigests', 'generatedPaths', 'logicalDestinations', 'replacements', 'baselineDefinitionDigests', 'baselineCreditDigests', 'generatedCredits'] as const;
const ACKNOWLEDGEMENT_KEYS = ['code', 'subject', 'contentDigest', 'reason'] as const;
const REPLACEMENT_KEYS = ['packId', 'versions', 'assets'] as const;
const CREDIT_KEYS = ['file', 'notes', 'authors', 'licenses', 'urls'] as const;
const RECEIPT_SCHEMA = 'lpc-toolkit.asset-pack-install-receipt.v1';
const RECEIPT_KEYS = ['schema', 'workspaceId', 'packId', 'version', 'archiveDigest', 'contentDigest', 'installedAt', 'payloadDigests'] as const;

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

function sortedDigestRecord(value: unknown, label: string): Readonly<Record<string, string>> {
  const record = requireRecord(value, label);
  const entries = Object.entries(record);
  if (entries.some(([key, digest]) => key.length === 0 || !DIGEST.test(String(digest)))) {
    throw new Error(`${label} must map non-empty paths to sha256 digests.`);
  }
  const sorted = [...entries].sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(entries.map(([key]) => key)) !== JSON.stringify(sorted.map(([key]) => key))) {
    throw new Error(`${label} keys must be sorted.`);
  }
  return Object.fromEntries(sorted) as Readonly<Record<string, string>>;
}

function containedPath(root: string, candidate: string, label: string): string {
  const resolvedRoot = path.resolve(root);
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

function readAcknowledgements(value: unknown, label: string): readonly AssetPackAcknowledgement[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => {
    const record = requireRecord(entry, `${label}[${index}]`);
    exactKeys(record, ACKNOWLEDGEMENT_KEYS, `${label}[${index}]`);
    const subject = requireRecord(record.subject, `${label}[${index}].subject`);
    for (const subjectValue of Object.values(subject)) {
      if (typeof subjectValue !== 'string' && (!Array.isArray(subjectValue) || subjectValue.some((item) => typeof item !== 'string'))) {
        throw new Error(`${label}[${index}].subject must contain strings or string arrays.`);
      }
    }
    return {
      code: stringAt(record, 'code', `${label}[${index}]`) as AssetPackAcknowledgement['code'],
      subject: Object.fromEntries(Object.entries(subject).sort(([left], [right]) => left.localeCompare(right))) as AssetPackAcknowledgement['subject'],
      contentDigest: digestAt(record, 'contentDigest', `${label}[${index}]`),
      reason: stringAt(record, 'reason', `${label}[${index}]`),
    };
  });
}

function readReplacements(value: unknown, label: string): readonly NormalizedAssetPackReplacement[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry, index) => {
    const record = requireRecord(entry, `${label}[${index}]`);
    exactKeys(record, REPLACEMENT_KEYS, `${label}[${index}]`);
    return {
      packId: stringAt(record, 'packId', `${label}[${index}]`),
      versions: stringAt(record, 'versions', `${label}[${index}]`),
      assets: sortedUniqueStrings(record.assets, `${label}[${index}].assets`),
    };
  });
}

function readCredits(value: unknown, label: string): readonly CreditEntry[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const credits = value.map((entry, index) => {
    const record = requireRecord(entry, `${label}[${index}]`);
    exactKeys(record, CREDIT_KEYS, `${label}[${index}]`);
    return {
      file: stringAt(record, 'file', `${label}[${index}]`),
      notes: typeof record.notes === 'string' ? record.notes : (() => { throw new Error(`${label}[${index}].notes must be a string.`); })(),
      authors: sortedUniqueStrings(record.authors, `${label}[${index}].authors`),
      licenses: sortedUniqueStrings(record.licenses, `${label}[${index}].licenses`) as CreditEntry['licenses'],
      urls: sortedUniqueStrings(record.urls, `${label}[${index}].urls`),
    };
  });
  const files = credits.map((credit) => credit.file);
  if (JSON.stringify(files) !== JSON.stringify([...files].sort((left, right) => left.localeCompare(right))) || new Set(files).size !== files.length) {
    throw new Error(`${label} must be sorted by unique credit file.`);
  }
  return credits;
}

function readV1Entry(value: unknown): LinkedAssetPackRegistryEntryV1 {
  const record = requireRecord(value, 'Linked asset-pack registry entry');
  exactKeys(record, V1_ENTRY_KEYS, 'Linked asset-pack registry entry');
  if (stringAt(record, 'kind', 'Linked asset-pack registry entry') !== 'linked') throw new Error('Unknown linked asset-pack registry entry kind.');
  return {
    kind: 'linked', packId: stringAt(record, 'packId', 'Linked asset-pack registry entry'),
    version: stringAt(record, 'version', 'Linked asset-pack registry entry'), displayName: stringAt(record, 'displayName', 'Linked asset-pack registry entry'),
    sourceDirectory: path.resolve(stringAt(record, 'sourceDirectory', 'Linked asset-pack registry entry')),
    contentDigest: stringAt(record, 'contentDigest', 'Linked asset-pack registry entry'),
    sourceDigests: sortedDigestRecord(record.sourceDigests, 'Linked asset-pack registry entry.sourceDigests'),
    generatedPaths: sortedUniqueStrings(record.generatedPaths, 'Linked asset-pack registry entry.generatedPaths'),
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
  const base: AssetPackRegistryEntryBase = {
    packId: stringAt(record, 'packId', 'Asset-pack registry entry'), version: stringAt(record, 'version', 'Asset-pack registry entry'),
    displayName: stringAt(record, 'displayName', 'Asset-pack registry entry'), contentDigest: digestAt(record, 'contentDigest', 'Asset-pack registry entry'),
    acknowledgements: readAcknowledgements(record.acknowledgements, 'Asset-pack registry entry.acknowledgements'),
    sourceDigests: sortedDigestRecord(record.sourceDigests, 'Asset-pack registry entry.sourceDigests'),
    generatedPaths: sortedUniqueStrings(record.generatedPaths, 'Asset-pack registry entry.generatedPaths'),
    logicalDestinations: sortedUniqueStrings(record.logicalDestinations, 'Asset-pack registry entry.logicalDestinations'),
    replacements: readReplacements(record.replacements, 'Asset-pack registry entry.replacements'),
    baselineDefinitionDigests: sortedDigestRecord(record.baselineDefinitionDigests, 'Asset-pack registry entry.baselineDefinitionDigests'),
    baselineCreditDigests: sortedDigestRecord(record.baselineCreditDigests, 'Asset-pack registry entry.baselineCreditDigests'),
    generatedCredits: readCredits(record.generatedCredits, 'Asset-pack registry entry.generatedCredits'),
  };
  if (kind === 'linked') {
    return { ...base, kind, sourceDirectory: containedPath(workspace.packsRoot, stringAt(record, 'sourceDirectory', 'Asset-pack registry entry'), 'Linked asset-pack sourceDirectory') };
  }
  const installedDirectory = containedPath(path.join(workspace.stateRoot, 'installed'), stringAt(record, 'installedDirectory', 'Asset-pack registry entry'), 'Installed asset-pack installedDirectory');
  verifyInstallReceipt(installedDirectory, workspaceId, base, digestAt(record, 'archiveDigest', 'Asset-pack registry entry'));
  return { ...base, kind, installedDirectory, archiveDigest: digestAt(record, 'archiveDigest', 'Asset-pack registry entry') };
}

function verifyInstallReceipt(directory: string, workspaceId: string, entry: AssetPackRegistryEntryBase, archiveDigest: string): void {
  const receiptPath = path.join(directory, 'install-receipt.json');
  if (!existsSync(receiptPath)) throw new Error(`Installed asset-pack receipt is missing: ${receiptPath}.`);
  const receipt = requireRecord(JSON.parse(readFileSync(receiptPath, 'utf8')) as unknown, 'Installed asset-pack receipt');
  exactKeys(receipt, RECEIPT_KEYS, 'Installed asset-pack receipt');
  if (stringAt(receipt, 'schema', 'Installed asset-pack receipt') !== RECEIPT_SCHEMA || stringAt(receipt, 'workspaceId', 'Installed asset-pack receipt') !== workspaceId || stringAt(receipt, 'packId', 'Installed asset-pack receipt') !== entry.packId || stringAt(receipt, 'version', 'Installed asset-pack receipt') !== entry.version || digestAt(receipt, 'archiveDigest', 'Installed asset-pack receipt') !== archiveDigest || digestAt(receipt, 'contentDigest', 'Installed asset-pack receipt') !== entry.contentDigest) {
    throw new Error(`Installed asset-pack receipt does not match registry entry: ${receiptPath}.`);
  }
  stringAt(receipt, 'installedAt', 'Installed asset-pack receipt');
  sortedDigestRecord(receipt.payloadDigests, 'Installed asset-pack receipt.payloadDigests');
}

function emptyDocument(workspaceId: string): AssetPackRegistryDocument {
  return { schema: ASSET_WORKSPACE_REGISTRY_SCHEMA, workspaceId, entries: [], generatedDigests: {}, compileDigest: sha256({ definitions: [], sprites: [], credits: [], ownership: [] }) };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

export function readAssetPackRegistry(options: { readonly workspace: AssetWorkspace; readonly markerWorkspaceId: string }): AssetPackRegistryReadResult {
  try {
    if (!existsSync(options.workspace.registryPath)) {
      const files = snapshotManagedOutputFiles(options.workspace.outputRoot);
      files.delete('.lpc-toolkit-managed.json');
      if (files.size > 0) throw new Error('Managed asset output contains files but the asset-pack registry is missing.');
      return { ok: true, document: emptyDocument(options.markerWorkspaceId), needsMigration: false };
    }
    const record = requireRecord(JSON.parse(readFileSync(options.workspace.registryPath, 'utf8')) as unknown, 'Asset workspace registry');
    const schema = stringAt(record, 'schema', 'Asset workspace registry');
    if (schema === ASSET_WORKSPACE_REGISTRY_V1_SCHEMA) {
      exactKeys(record, V1_DOCUMENT_KEYS, 'Asset workspace registry');
      const workspaceId = stringAt(record, 'workspaceId', 'Asset workspace registry');
      if (workspaceId !== options.markerWorkspaceId) throw new Error('Managed asset output marker does not match the linked-pack registry.');
      if (!Array.isArray(record.entries)) throw new Error('Asset workspace registry.entries must be an array.');
      const entries = record.entries.map(readV1Entry);
      const ids = entries.map((entry) => entry.packId);
      if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify([...ids].sort((left, right) => left.localeCompare(right)))) throw new Error('Asset workspace registry entries must have sorted unique pack IDs.');
      return { ok: true, needsMigration: true, document: { schema: ASSET_WORKSPACE_REGISTRY_V1_SCHEMA, workspaceId, entries, generatedDigests: sortedDigestRecord(record.generatedDigests, 'Asset workspace registry.generatedDigests') } };
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
    const generatedDigests = sortedDigestRecord(record.generatedDigests, 'Asset workspace registry.generatedDigests');
    const owned = new Set(entries.flatMap((entry) => entry.generatedPaths));
    if (entries.length > 0) owned.add('CREDITS.csv');
    if (JSON.stringify(Object.keys(generatedDigests)) !== JSON.stringify([...owned].sort((left, right) => left.localeCompare(right)))) throw new Error('Asset workspace registry generatedDigests must exactly cover generated output paths.');
    const compileDigest = digestAt(record, 'compileDigest', 'Asset workspace registry');
    if (compileDigest !== assetPackCompileDigest({ entries, generatedDigests })) {
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

export function assetPackCompileDigest(value: unknown): string {
  return sha256(value);
}

export function snapshotManagedOutputFiles(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else files.set(path.relative(root, target).split(path.sep).join('/'), readFileSync(target));
    }
  };
  if (existsSync(root)) visit(root);
  return files;
}

export function auditPublishedManagedOutput(options: { readonly workspace: AssetWorkspace; readonly markerBytes: Buffer; readonly generatedDigests: Readonly<Record<string, string>> }): AssetPackLifecycleDiagnostic | undefined {
  const files = snapshotManagedOutputFiles(options.workspace.outputRoot);
  const expected = new Set(['.lpc-toolkit-managed.json', ...Object.keys(options.generatedDigests)]);
  const stray = [...files.keys()].sort().find((file) => !expected.has(file));
  if (stray) return { code: 'asset_output_root_unowned', severity: 'error', message: `Managed asset output contains an unowned file: ${stray}`, path: path.join(options.workspace.outputRoot, stray) };
  const missing = [...expected].sort().find((file) => !files.has(file));
  if (missing) return { code: 'asset_digest_mismatch', severity: 'error', message: `Managed asset output is missing a registry-owned file: ${missing}`, path: path.join(options.workspace.outputRoot, missing) };
  for (const [file, digest] of Object.entries(options.generatedDigests)) {
    const bytes = files.get(file);
    const actual = bytes ? `sha256:${createHash('sha256').update(bytes).digest('hex')}` : undefined;
    if (actual !== digest) return { code: 'asset_digest_mismatch', severity: 'error', message: `Managed asset output differs from the registry-owned generated file: ${file}`, path: path.join(options.workspace.outputRoot, file) };
  }
  if (!files.get('.lpc-toolkit-managed.json')?.equals(options.markerBytes)) return { code: 'asset_digest_mismatch', severity: 'error', message: 'Managed asset output marker differs from the expected marker.', path: path.join(options.workspace.outputRoot, '.lpc-toolkit-managed.json') };
  return undefined;
}
