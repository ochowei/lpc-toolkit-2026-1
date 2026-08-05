import { createHash } from 'node:crypto';
import {
  assetWebCliHandoffStateDigestInput,
  type AssetAuthoringPlan,
  type AssetWebCliHandoff,
} from '@lpc-toolkit/core';
import {
  canonicalizeJsonValue,
  createAssetPackArchive,
  type AssetPackVerifiedSnapshot,
} from '@lpc-toolkit/asset-pack-format';
import { nodeAssetPackFormatRuntime } from '../../src/asset-pack-node-runtime.js';

const FIXTURE_HANDOFF_ID = '550e8400-e29b-41d4-a716-446655440000';
const FIXTURE_CREATED_AT = '2026-08-06T12:00:00.000Z';
const FIXTURE_BASELINE_RELEASE_TAG = 'd3-local-fixture';
const FIXTURE_RELEASE_FINGERPRINT = `sha256:${'f'.repeat(64)}`;

export const D3_ATTACH_PACK_PLAN = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'attach-pack',
  pack: {
    id: 'acme.hair',
    version: '1.2.4',
    displayName: 'ACME Hair',
  },
  asset: { kind: 'attach-pack' },
  scope: {
    packId: 'acme.hair',
    bodyTypes: [],
    animations: [],
    paths: ['asset-pack.json'],
  },
} as const satisfies AssetAuthoringPlan;

export interface D3InterruptedStagingFixture {
  readonly handoffId: string;
  readonly archiveDigest: string;
  readonly planDigest: string;
  readonly stagingDirectoryName: string;
}

export interface D3WebCliFixtures {
  readonly archiveBytes: Uint8Array;
  readonly archiveFileName: string;
  readonly handoff: AssetWebCliHandoff;
  readonly handoffJson: string;
  readonly attachPlan: AssetAuthoringPlan;
  readonly attachPlanJson: string;
  readonly staleArchiveBytes: Uint8Array;
  readonly tamperedArchiveBytes: Uint8Array;
  readonly attributionHandoff: AssetWebCliHandoff;
  readonly interruptedStaging: D3InterruptedStagingFixture;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

function handoffForSnapshot(
  snapshot: AssetPackVerifiedSnapshot,
  archiveFileName: string,
): AssetWebCliHandoff {
  const creditDigest = sha256(
    new TextEncoder().encode(canonicalJson({
      credits: snapshot.payload.pack.credits,
      creditOverrides: {},
    })),
  );
  const acknowledgementDigest = sha256(
    new TextEncoder().encode(canonicalJson(snapshot.payload.pack.acknowledgements)),
  );
  const sourceDigests = [...snapshot.payload.sourceDigests]
    .map(([path, digest]) => ({ path, digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const stateBase = {
    schema: 'lpc-toolkit.web-cli-handoff.v1' as const,
    direction: 'web-to-cli' as const,
    handoffId: FIXTURE_HANDOFF_ID,
    purpose: 'cli-authoring-review' as const,
    createdAt: FIXTURE_CREATED_AT,
    web: {
      workbenchRevision: 4,
      stateDigest: `sha256:${'0'.repeat(64)}`,
      baselineReleaseTag: FIXTURE_BASELINE_RELEASE_TAG,
    },
    pack: {
      id: snapshot.payload.pack.id,
      version: snapshot.payload.pack.version,
      archiveKind: 'formal' as const,
      manifestDigest: sha256(snapshot.manifestBytes),
      contentDigest: snapshot.payload.contentDigest,
      releaseFingerprint: FIXTURE_RELEASE_FINGERPRINT,
    },
    payload: {
      fileName: archiveFileName,
      byteLength: snapshot.archiveBytes.byteLength,
      archiveDigest: snapshot.archiveDigest,
    },
    sources: sourceDigests,
    attribution: {
      creditDigest,
      acknowledgementDigest,
      required: true as const,
    },
    consent: { handoffConfirmed: true as const },
    privacy: {
      absolutePaths: false as const,
      credentials: false as const,
      providerPayloads: false as const,
      browserState: false as const,
    },
  } satisfies AssetWebCliHandoff;
  const stateDigest = sha256(
    new TextEncoder().encode(assetWebCliHandoffStateDigestInput(stateBase)),
  );
  return { ...stateBase, web: { ...stateBase.web, stateDigest } };
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export async function createD3WebCliFixtures(): Promise<D3WebCliFixtures> {
  const runtime = nodeAssetPackFormatRuntime;
  const manifestDocument = {
    schema: 'lpc-toolkit.asset-pack.v1',
    id: 'acme.hair',
    version: '1.2.4',
    displayName: 'ACME Hair',
    credits: {
      authors: ['Alice'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/acme/hair'],
      notes: 'Local D3 fixture attribution.',
    },
    assets: [],
  } as const;
  const archive = await createAssetPackArchive({
    kind: 'formal',
    manifestDocument,
    sourceBytes: new Map(),
    runtime,
  });
  if (archive.inspection.kind !== 'verified') {
    throw new Error('Expected the D3 formal archive fixture to be verified.');
  }
  const snapshot = archive.inspection.snapshot;
  const archiveFileName = 'acme.hair-1.2.4.lpc-assets.zip';
  const handoff = handoffForSnapshot(snapshot, archiveFileName);
  const staleArchive = await createAssetPackArchive({
    kind: 'formal',
    manifestDocument: { ...manifestDocument, displayName: 'ACME Hair stale fixture' },
    sourceBytes: new Map(),
    runtime,
  });
  const attributionHandoff: AssetWebCliHandoff = {
    ...handoff,
    attribution: {
      ...handoff.attribution,
      creditDigest: `sha256:${'a'.repeat(64)}`,
    },
  };
  const tamperedArchiveBytes = new Uint8Array(archive.archiveBytes);
  tamperedArchiveBytes[0] = (tamperedArchiveBytes[0] ?? 0) ^ 0xff;
  const attachPlanJson = serialize(D3_ATTACH_PACK_PLAN);
  return {
    archiveBytes: new Uint8Array(archive.archiveBytes),
    archiveFileName,
    handoff,
    handoffJson: serialize(handoff),
    attachPlan: D3_ATTACH_PACK_PLAN,
    attachPlanJson,
    staleArchiveBytes: new Uint8Array(staleArchive.archiveBytes),
    tamperedArchiveBytes,
    attributionHandoff,
    interruptedStaging: {
      handoffId: handoff.handoffId,
      archiveDigest: handoff.payload.archiveDigest,
      planDigest: sha256(new TextEncoder().encode(canonicalJson(D3_ATTACH_PACK_PLAN))),
      stagingDirectoryName: '.d3-handoff-pending',
    },
  };
}
