import {
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  assetPackRegistryBytes,
  readAssetPackRegistry,
  type AssetPackLifecycleDiagnostic,
} from './asset-pack-registry.js';
import {
  listAssetPacks,
  type AssetPackListEntry,
} from './asset-pack-remove.js';
import { prepareAssetPackDesiredState } from './asset-pack-state.js';
import {
  recoverAssetPackTransaction,
  type AssetPackRecoveryAction,
  type AssetTransactionFileOps,
} from './asset-pack-transaction.js';
import type { AssetWorkspace } from './asset-workspace.js';
import type { RuntimeAssets } from './runtime-assets.js';

export const ASSET_PACK_DOCTOR_SCHEMA =
  'lpc-toolkit.asset-pack-doctor.v1' as const;

export interface AssetPackDoctorCheck {
  readonly code: string;
  readonly status: 'pass' | 'warning' | 'error';
  readonly message: string;
  readonly path?: string;
  readonly packId?: string;
}

export interface AssetPackDoctorReport {
  readonly schema: typeof ASSET_PACK_DOCTOR_SCHEMA;
  readonly healthy: boolean;
  readonly recovery: AssetPackRecoveryAction;
  readonly checks: readonly AssetPackDoctorCheck[];
  readonly packs: readonly AssetPackListEntry[];
}

const STATUS_ORDER: Readonly<Record<AssetPackDoctorCheck['status'], number>> = {
  error: 0,
  warning: 1,
  pass: 2,
};

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortChecks(
  checks: readonly AssetPackDoctorCheck[],
): readonly AssetPackDoctorCheck[] {
  return [...checks].sort((left, right) =>
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
      || compareCodeUnits(left.code, right.code)
      || compareCodeUnits(left.packId ?? '', right.packId ?? '')
      || compareCodeUnits(left.path ?? '', right.path ?? ''));
}

function diagnosticCheck(
  diagnostic: AssetPackLifecycleDiagnostic,
): AssetPackDoctorCheck {
  return {
    code: diagnostic.code,
    status: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.path ? { path: diagnostic.path } : {}),
    ...(diagnostic.packId ? { packId: diagnostic.packId } : {}),
  };
}

function recoveryCheck(action: AssetPackRecoveryAction): AssetPackDoctorCheck {
  const message = action === 'none'
    ? 'No pending asset-pack transaction required recovery.'
    : action === 'rolled-back'
      ? 'Rolled back the pending asset-pack transaction before auditing.'
      : 'Completed the pending asset-pack transaction before auditing.';
  return {
    code: 'asset_transaction_recovery',
    status: 'pass',
    message,
  };
}

function report(options: {
  readonly recovery: AssetPackRecoveryAction;
  readonly checks: readonly AssetPackDoctorCheck[];
  readonly packs: readonly AssetPackListEntry[];
}): AssetPackDoctorReport {
  const checks = sortChecks(options.checks);
  return {
    schema: ASSET_PACK_DOCTOR_SCHEMA,
    healthy: !checks.some((check) => check.status === 'error'),
    recovery: options.recovery,
    checks,
    packs: options.packs,
  };
}

export async function doctorAssetPacks(options: {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetTransactionFileOps;
}): Promise<AssetPackDoctorReport> {
  const recovery = recoverAssetPackTransaction({
    workspace: options.workspace,
    ...(options.fileOps ? { fileOps: options.fileOps } : {}),
  });
  if (!recovery.ok) {
    return report({
      recovery: 'none',
      checks: recovery.diagnostics.map(diagnosticCheck),
      packs: [],
    });
  }

  const checks: AssetPackDoctorCheck[] = [];
  const listed = listAssetPacks({
    workspace: options.workspace,
    ...(options.fileOps ? { fileOps: options.fileOps } : {}),
  });
  if (!listed.ok) {
    return report({
      recovery: recovery.action,
      checks: [
        recoveryCheck(recovery.action),
        ...listed.diagnostics.map(diagnosticCheck),
      ],
      packs: [],
    });
  }

  const recoveryAction = recovery.action === 'none'
    ? listed.recovery
    : recovery.action;
  checks.push(recoveryCheck(recoveryAction));
  const desired = await prepareAssetPackDesiredState({
    workspace: options.workspace,
    runtime: options.runtime,
    mutation: { kind: 'none' },
  });
  if (!desired.ok) {
    return report({
      recovery: recoveryAction,
      checks: [...checks, ...desired.diagnostics.map(diagnosticCheck)],
      packs: listed.entries,
    });
  }

  checks.push(...desired.warnings.map(diagnosticCheck));
  const registry = readAssetPackRegistry({
    workspace: options.workspace,
    markerWorkspaceId: desired.registry.workspaceId,
  });
  if (!registry.ok) {
    checks.push(...registry.diagnostics.map(diagnosticCheck));
  } else if (registry.document.schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA) {
    checks.push({
      code: 'asset_registry_migration_required',
      status: 'warning',
      message: 'Asset-pack registry v1 is valid but will be migrated by the next publication.',
      path: options.workspace.registryPath,
    });
  } else if (
    !assetPackRegistryBytes(registry.document).equals(
      assetPackRegistryBytes(desired.registry),
    )
  ) {
    checks.push({
      code: 'asset_desired_state_mismatch',
      status: 'error',
      message: 'Published asset-pack registry differs from freshly compiled desired state.',
      path: options.workspace.registryPath,
    });
  } else {
    checks.push({
      code: 'asset_lifecycle_integrity',
      status: 'pass',
      message: 'Registry, sources, generated output, ownership, and attribution are valid.',
    });
  }

  return report({
    recovery: recoveryAction,
    checks,
    packs: listed.entries,
  });
}
