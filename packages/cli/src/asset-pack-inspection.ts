import type { AssetPackAcknowledgement } from '@lpc-toolkit/core';
import type { AssetWorkspace } from './asset-workspace.js';
import {
  readAssetPackArchive,
  type AssetPackArchiveDiagnostic,
  type AssetPackArchiveSnapshot,
} from './asset-pack-archive-format.js';
import {
  draftAssetPackDiagnostic,
  type AssetPackLifecycleDiagnostic,
} from './asset-pack-compatibility.js';
import { validateAssetPackPayload } from './asset-pack-validation.js';
import type { RuntimeAssets } from './runtime-assets.js';

export interface AssetPackInspectionReport {
  readonly schema: 'lpc-toolkit.asset-pack-inspection.v1';
  readonly archivePath: string;
  readonly archiveDigest?: string;
  readonly packId?: string;
  readonly version?: string;
  readonly status?: 'draft';
  readonly contentDigest?: string;
  readonly valid: boolean;
  readonly entryCount: number;
  readonly totalUncompressedBytes: number;
  readonly diagnostics: readonly AssetPackLifecycleDiagnostic[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
}

export interface AssetPackInspectionResult {
  readonly report: AssetPackInspectionReport;
  readonly snapshot?: AssetPackArchiveSnapshot;
}

const INSPECTION_SCHEMA = 'lpc-toolkit.asset-pack-inspection.v1' as const;

function lifecycleArchiveDiagnostic(
  diagnostic: AssetPackArchiveDiagnostic,
): AssetPackLifecycleDiagnostic {
  return {
    code: diagnostic.code,
    severity: 'error',
    message: diagnostic.message,
    ...(diagnostic.path ? { path: diagnostic.path } : {}),
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}

export async function inspectAssetPackArchive(options: {
  readonly archivePath: string;
  readonly archiveBytes?: Buffer;
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
}): Promise<AssetPackInspectionResult> {
  const archive = await readAssetPackArchive({
    archivePath: options.archivePath,
    ...(options.archiveBytes !== undefined ? { archiveBytes: options.archiveBytes } : {}),
  });
  if (!archive.ok) {
    return {
      report: {
        schema: INSPECTION_SCHEMA,
        archivePath: options.archivePath,
        valid: false,
        entryCount: 0,
        totalUncompressedBytes: 0,
        diagnostics: archive.diagnostics.map(lifecycleArchiveDiagnostic),
        acknowledgementRecords: [],
      },
    };
  }

  const validation = await validateAssetPackPayload({
    payload: archive.snapshot.payload,
    runtime: options.runtime,
    ...(options.workspace ? { workspace: options.workspace } : {}),
    origin: options.archivePath,
  });
  const draftDiagnostic = archive.snapshot.payload.pack.status === 'draft'
    ? [draftAssetPackDiagnostic(archive.snapshot.payload.pack.id)]
    : [];
  const diagnostics = [...draftDiagnostic, ...validation.diagnostics];
  const valid = validation.valid && draftDiagnostic.length === 0;
  const report: AssetPackInspectionReport = {
    schema: INSPECTION_SCHEMA,
    archivePath: options.archivePath,
    archiveDigest: archive.snapshot.archiveDigest,
    packId: archive.snapshot.payload.pack.id,
    version: archive.snapshot.payload.pack.version,
    ...(archive.snapshot.payload.pack.status === 'draft'
      ? { status: 'draft' as const }
      : {}),
    contentDigest: archive.snapshot.payload.contentDigest,
    valid,
    entryCount: archive.snapshot.entryCount,
    totalUncompressedBytes: archive.snapshot.totalUncompressedBytes,
    diagnostics,
    acknowledgementRecords: validation.acknowledgementRecords,
  };

  return valid
    ? { report, snapshot: archive.snapshot }
    : { report };
}
