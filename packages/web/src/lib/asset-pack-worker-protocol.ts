import type {
  AssetPackAcknowledgement,
  AssetPackCompilePlan,
  Catalog,
  ItemId,
  PaletteMetadata,
} from '@lpc-toolkit/core';
import type { AssetPackSha256 } from '@lpc-toolkit/asset-pack-format';

export interface AssetPackWorkerBaseline {
  readonly releaseTag: string;
  readonly cliVersion: string;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly definitionDigests: ReadonlyMap<ItemId, AssetPackSha256>;
  readonly creditDigests: ReadonlyMap<ItemId, AssetPackSha256>;
}

export type AssetPackWorkerRequest =
  | {
      readonly type: 'open';
      readonly requestId: number;
      readonly revision: 0;
      readonly file: File;
      readonly baseline: AssetPackWorkerBaseline;
    }
  | {
      readonly type: 'replace-manifest';
      readonly requestId: number;
      readonly revision: number;
      readonly manifestText: string;
      readonly origin:
        | 'overview-form'
        | 'credits-form'
        | 'advanced-json'
        | 'raw-repair'
        | 'acknowledgement';
    }
  | {
      readonly type: 'replace-source';
      readonly requestId: number;
      readonly revision: number;
      readonly path: string;
      readonly file: File;
    }
  | {
      readonly type: 'remove-source';
      readonly requestId: number;
      readonly revision: number;
      readonly path: string;
    }
  | {
      readonly type: 'assemble';
      readonly requestId: number;
      readonly revision: number;
      readonly kind: 'draft' | 'formal';
    };

export interface AssetPackSourceSummary {
  readonly path: string;
  readonly referenced: boolean;
  readonly consumerCount: number;
  readonly byteLength?: number;
  readonly digest?: AssetPackSha256;
  readonly width?: number;
  readonly height?: number;
  readonly state: 'ready' | 'missing' | 'unreferenced' | 'invalid';
}

export interface AssetPackWorkbenchDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly scope: 'archive' | 'manifest' | 'source' | 'warning' | 'credit' | 'release';
  readonly path?: string;
  readonly subject?: Readonly<Record<string, string | readonly string[]>>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackPreviewSource {
  readonly destinationPath: string;
  readonly sourcePath: string;
  readonly bytes: Uint8Array;
}

export interface AssetPackPreviewPayload {
  readonly revision: number;
  readonly packId: string;
  readonly compilePlan: AssetPackCompilePlan;
  readonly sources: readonly AssetPackPreviewSource[];
}

export interface AssetPackFormalCandidate {
  readonly revision: number;
  readonly archiveDigest: AssetPackSha256;
  readonly version: string;
  readonly byteIdenticalToUploadedFormal: boolean;
}

export interface AssetPackWorkbenchRevision {
  readonly revision: number;
  readonly manifestText: string;
  readonly sourceSummaries: readonly AssetPackSourceSummary[];
  readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
  readonly contentDigest?: AssetPackSha256;
  readonly releaseFingerprint?: AssetPackSha256;
  readonly preview?: AssetPackPreviewPayload;
  readonly formalCandidate?: AssetPackFormalCandidate;
  readonly draftSerializable: boolean;
}

export type AssetPackWorkerProgressStage =
  | 'reading-archive'
  | 'inspecting-archive'
  | 'verifying-checksums'
  | 'inspecting-sources'
  | 'compiling-preview'
  | 'assembling-archive';

export type AssetPackWorkerResponse =
  | {
      readonly type: 'progress';
      readonly requestId: number;
      readonly revision: number;
      readonly stage: AssetPackWorkerProgressStage;
    }
  | {
      readonly type: 'session';
      readonly requestId: number;
      readonly revision: number;
      readonly outcome: 'editing';
      readonly workbench: AssetPackWorkbenchRevision;
    }
  | {
      readonly type: 'session';
      readonly requestId: number;
      readonly revision: 0;
      readonly outcome: 'unsafe';
      readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[];
    }
  | {
      readonly type: 'assembled';
      readonly requestId: number;
      readonly revision: number;
      readonly kind: 'draft' | 'formal';
      readonly archiveBytes: ArrayBuffer;
      readonly archiveDigest: AssetPackSha256;
    }
  | {
      readonly type: 'failed';
      readonly requestId: number;
      readonly revision: number;
      readonly diagnostic: AssetPackWorkbenchDiagnostic;
    };

export function isAssetPackWorkerRequest(value: unknown): value is AssetPackWorkerRequest {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  return isNumber(value.requestId) && isNumber(value.revision)
    && ['open', 'replace-manifest', 'replace-source', 'remove-source', 'assemble'].includes(value.type);
}

export function isAssetPackWorkerResponse(value: unknown): value is AssetPackWorkerResponse {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  return isNumber(value.requestId) && isNumber(value.revision)
    && ['progress', 'session', 'assembled', 'failed'].includes(value.type);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
