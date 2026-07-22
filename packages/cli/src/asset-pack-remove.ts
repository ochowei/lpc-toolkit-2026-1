import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  assertManagedAssetOutput,
  type AssetWorkspace,
} from './asset-workspace.js';
import {
  readAssetPackRegistry,
  type AssetPackLifecycleDiagnostic,
  type AssetPackRegistryEntry,
  type LinkedAssetPackRegistryEntryV1,
} from './asset-pack-registry.js';
import { prepareAssetPackDesiredState } from './asset-pack-state.js';
import {
  recoverAssetPackTransaction,
  withAssetPackTransactionClaim,
  type AssetPackClaimedPublisher,
  type AssetPackRecoveryAction,
  type AssetTransactionFileOps,
} from './asset-pack-transaction.js';
import type { RuntimeAssets } from './runtime-assets.js';

const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';

type ListedRegistryEntry = AssetPackRegistryEntry | LinkedAssetPackRegistryEntryV1;

export interface AssetPackListEntry {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly kind: 'linked' | 'installed';
  readonly sourcePath: string;
  readonly contentDigest: string;
  readonly archiveDigest?: string;
}

export type AssetPackListResult =
  | {
      readonly ok: true;
      readonly recovery: AssetPackRecoveryAction;
      readonly entries: readonly AssetPackListEntry[];
    }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

export interface AssetPackRemoveSuccess {
  readonly ok: true;
  readonly packId: string;
  readonly removedKind: 'linked' | 'installed';
  readonly remainingPackIds: readonly string[];
  readonly generatedFileCount: number;
}

export type AssetPackRemoveResult =
  | AssetPackRemoveSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(
  diagnostics: readonly AssetPackLifecycleDiagnostic[],
): Exclude<AssetPackRemoveResult, AssetPackRemoveSuccess> {
  return { ok: false, diagnostics };
}

function markerWorkspaceId(workspace: AssetWorkspace):
  | { readonly ok: true; readonly workspaceId: string }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] } {
  const markerPath = path.join(workspace.outputRoot, OUTPUT_MARKER_FILE);
  try {
    assertManagedAssetOutput(workspace);
    const parsed = JSON.parse(readFileSync(markerPath, 'utf8')) as unknown;
    if (!isRecord(parsed)) throw new Error('Asset output marker must be a JSON object.');
    if (
      parsed.schema !== ASSET_OUTPUT_MARKER_SCHEMA
      || typeof parsed.workspaceId !== 'string'
      || parsed.workspaceId.length === 0
    ) {
      throw new Error('Asset output marker is invalid.');
    }
    return { ok: true, workspaceId: parsed.workspaceId };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_output_root_unowned',
        severity: 'error',
        message: errorMessage(error),
        path: markerPath,
      }],
    };
  }
}

function readCurrentRegistry(workspace: AssetWorkspace):
  | { readonly ok: true; readonly entries: readonly ListedRegistryEntry[] }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] } {
  const marker = markerWorkspaceId(workspace);
  if (!marker.ok) return marker;
  const registry = readAssetPackRegistry({
    workspace,
    markerWorkspaceId: marker.workspaceId,
  });
  if (!registry.ok) return registry;
  return {
    ok: true,
    entries: registry.document.entries,
  };
}

function listEntry(entry: ListedRegistryEntry): AssetPackListEntry {
  if (entry.kind === 'installed') {
    return {
      packId: entry.packId,
      version: entry.version,
      displayName: entry.displayName,
      kind: entry.kind,
      sourcePath: entry.installedDirectory,
      contentDigest: entry.contentDigest,
      archiveDigest: entry.archiveDigest,
    };
  }
  return {
    packId: entry.packId,
    version: entry.version,
    displayName: entry.displayName,
    kind: entry.kind,
    sourcePath: entry.sourceDirectory,
    contentDigest: entry.contentDigest,
  };
}

export async function listAssetPacks(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}): Promise<AssetPackListResult> {
  const recovered = recoverAssetPackTransaction({
    workspace: options.workspace,
    ...(options.fileOps ? { fileOps: options.fileOps } : {}),
  });
  if (!recovered.ok) return recovered;

  const registry = readCurrentRegistry(options.workspace);
  if (!registry.ok) return registry;
  return {
    ok: true,
    recovery: recovered.action,
    entries: registry.entries.map((entry) => listEntry(entry)),
  };
}

async function removeUnderClaim(options: {
  readonly packId: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly publisher: AssetPackClaimedPublisher;
}): Promise<AssetPackRemoveResult> {
  const registry = readCurrentRegistry(options.workspace);
  if (!registry.ok) return registry;
  const removed = registry.entries.find((entry) => entry.packId === options.packId);
  if (!removed) {
    return failure([{
      code: 'asset_pack_not_installed',
      severity: 'error',
      message: `Asset-pack is not active: ${options.packId}.`,
      path: options.workspace.registryPath,
      packId: options.packId,
    }]);
  }

  const desired = await prepareAssetPackDesiredState({
    workspace: options.workspace,
    runtime: options.runtime,
    mutation: { kind: 'remove', packId: options.packId },
  });
  if (!desired.ok) return failure(desired.diagnostics);

  const published = await options.publisher.publish({
    operation: 'remove',
    desiredState: desired,
    cleanupInstalledSources: removed.kind === 'installed'
      ? [removed.installedDirectory]
      : [],
  });
  if (!published.ok) return failure(published.diagnostics);

  return {
    ok: true,
    packId: removed.packId,
    removedKind: removed.kind,
    remainingPackIds: desired.registry.entries.map((entry) => entry.packId),
    generatedFileCount: Object.keys(desired.registry.generatedDigests).length,
  };
}

export async function removeAssetPack(options: {
  readonly packId: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetTransactionFileOps;
}): Promise<AssetPackRemoveResult> {
  const claimed = await withAssetPackTransactionClaim({
    workspace: options.workspace,
    ...(options.fileOps ? { fileOps: options.fileOps } : {}),
    action: (publisher) => removeUnderClaim({
      packId: options.packId,
      workspace: options.workspace,
      runtime: options.runtime,
      publisher,
    }),
  });
  return claimed.ok ? claimed.value : failure(claimed.diagnostics);
}
