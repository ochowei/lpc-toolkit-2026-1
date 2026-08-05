import {
  parseAssetWebCliHandoff,
  type AssetWebCliHandoff,
  type AssetWebCliHandoffArchiveKind,
  type AssetWebCliHandoffSource,
} from '@lpc-toolkit/core';
import {
  canonicalizeJsonValue,
  type AssetPackFormatRuntime,
  type AssetPackSha256,
  type AssetPackVerifiedSnapshot,
} from '@lpc-toolkit/asset-pack-format';

export interface AssetPackWebCliHandoffMetadata {
  readonly packId: string;
  readonly version: string;
  readonly archiveKind: AssetWebCliHandoffArchiveKind;
  readonly manifestDigest: AssetPackSha256;
  readonly contentDigest: AssetPackSha256;
  readonly releaseFingerprint: AssetPackSha256;
  readonly archiveDigest: AssetPackSha256;
  readonly archiveByteLength: number;
  readonly archiveFileName: string;
  readonly sourceDigests: readonly AssetWebCliHandoffSource[];
  readonly creditDigest: AssetPackSha256;
  readonly acknowledgementDigest: AssetPackSha256;
}

export interface AssetPackWebCliHandoffSnapshotInput {
  readonly revision: number;
  readonly baselineReleaseTag: string;
  readonly handoffId: string;
  readonly createdAt: string;
  readonly stateDigest: AssetPackSha256;
  readonly metadata: AssetPackWebCliHandoffMetadata;
}

export async function createAssetPackWebCliHandoffMetadata(options: {
  readonly snapshot: AssetPackVerifiedSnapshot;
  readonly archiveKind: AssetWebCliHandoffArchiveKind;
  readonly archiveFileName: string;
  readonly releaseFingerprint: AssetPackSha256;
  readonly runtime: AssetPackFormatRuntime;
}): Promise<AssetPackWebCliHandoffMetadata> {
  const { snapshot, runtime } = options;
  const creditOverrides = Object.fromEntries(
    [...snapshot.payload.pack.creditOverrides.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, credit]) => [path, credit]),
  );
  const creditDigest = await digestJson(runtime, {
    credits: snapshot.payload.pack.credits,
    creditOverrides,
  });
  const acknowledgementDigest = await digestJson(
    runtime,
    snapshot.payload.pack.acknowledgements,
  );
  return {
    packId: snapshot.payload.pack.id,
    version: snapshot.payload.pack.version,
    archiveKind: options.archiveKind,
    manifestDigest: await runtime.sha256(snapshot.manifestBytes),
    contentDigest: snapshot.payload.contentDigest,
    releaseFingerprint: options.releaseFingerprint,
    archiveDigest: snapshot.archiveDigest,
    archiveByteLength: snapshot.archiveBytes.byteLength,
    archiveFileName: options.archiveFileName,
    sourceDigests: [...snapshot.payload.sourceDigests]
      .map(([path, digest]) => ({ path, digest }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    creditDigest,
    acknowledgementDigest,
  };
}

export function createAssetPackWebCliHandoffSnapshot(
  input: AssetPackWebCliHandoffSnapshotInput,
): AssetWebCliHandoff {
  const { metadata } = input;
  const candidate = {
    schema: 'lpc-toolkit.web-cli-handoff.v1',
    direction: 'web-to-cli',
    handoffId: input.handoffId,
    purpose: 'cli-authoring-review',
    createdAt: input.createdAt,
    web: {
      workbenchRevision: input.revision,
      stateDigest: input.stateDigest,
      baselineReleaseTag: input.baselineReleaseTag,
    },
    pack: {
      id: metadata.packId,
      version: metadata.version,
      archiveKind: metadata.archiveKind,
      manifestDigest: metadata.manifestDigest,
      contentDigest: metadata.contentDigest,
      releaseFingerprint: metadata.releaseFingerprint,
    },
    payload: {
      fileName: metadata.archiveFileName,
      byteLength: metadata.archiveByteLength,
      archiveDigest: metadata.archiveDigest,
    },
    sources: metadata.sourceDigests,
    attribution: {
      creditDigest: metadata.creditDigest,
      acknowledgementDigest: metadata.acknowledgementDigest,
      required: true,
    },
    consent: {
      handoffConfirmed: true,
    },
    privacy: {
      absolutePaths: false,
      credentials: false,
      providerPayloads: false,
      browserState: false,
    },
  } as const;
  const parsed = parseAssetWebCliHandoff(candidate);
  if (!parsed.ok) {
    throw new Error(`Cannot build Web-to-CLI handoff: ${parsed.diagnostics.map((diagnostic) => diagnostic.message).join(' ')}`);
  }
  return parsed.handoff;
}

export function serializeAssetPackWebCliHandoff(
  handoff: AssetWebCliHandoff,
): string {
  return `${JSON.stringify(handoff)}\n`;
}

export function assetPackWebCliHandoffFilename(input: {
  readonly packId: string;
  readonly version: string;
  readonly kind: AssetWebCliHandoffArchiveKind;
}): string {
  return `${input.packId}-${input.version}${input.kind === 'draft' ? '.draft' : ''}.web-cli-handoff.json`;
}

async function digestJson(
  runtime: AssetPackFormatRuntime,
  value: unknown,
): Promise<AssetPackSha256> {
  return runtime.sha256(runtime.encodeUtf8(JSON.stringify(canonicalizeJsonValue(value))));
}
