import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
  ASSET_WEB_CLI_HANDOFF_CAPABILITIES,
  ASSET_WEB_CLI_HANDOFF_SCHEMA,
  assetWebCliHandoffDigestInput,
  assetWebCliHandoffAttributionIsRequired,
  assetWebCliCapabilitiesCompatible,
  assetWebCliCapabilitiesMissing,
  assetWebCliHandoffPrivacyIsSafe,
  assetWebCliHandoffStateDigestInput,
  assetWebCliHandoffStateIsStale,
  assetWebCliHandoffStateProjection,
  parseAssetWebCliHandoff,
  parseAssetAuthoringWebHandoffReceipt,
} from '../src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const HANDOFF_ID = '550e8400-e29b-41d4-a716-446655440000';
const EXPECTED_STATE_DIGEST =
  'sha256:0abddf71d139dc0a5c5497238db4571c512bf2e86733b7d696e7733fe6d6ec6e';

const VALID_HANDOFF = {
  schema: ASSET_WEB_CLI_HANDOFF_SCHEMA,
  direction: 'web-to-cli',
  handoffId: HANDOFF_ID,
  purpose: 'cli-authoring-review',
  createdAt: '2026-08-06T12:00:00.000Z',
  web: {
    workbenchRevision: 4,
    stateDigest: EXPECTED_STATE_DIGEST,
    baselineReleaseTag: 'lpc-toolkit-2026.08.06',
  },
  pack: {
    id: 'example.pack',
    version: '1.0.0',
    archiveKind: 'draft',
    manifestDigest: DIGEST_A,
    contentDigest: DIGEST_B,
    releaseFingerprint: DIGEST_C,
  },
  payload: {
    fileName: 'example.pack-1.0.0.draft.lpc-assets.zip',
    byteLength: 12345,
    archiveDigest: DIGEST_A,
  },
  sources: [
    { path: 'spritesheets/z.png', digest: DIGEST_C },
    { path: 'spritesheets/a.png', digest: DIGEST_B },
  ],
  attribution: {
    creditDigest: DIGEST_C,
    acknowledgementDigest: DIGEST_D,
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

const VALID_RECEIPT = {
  schema: ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
  handoffId: HANDOFF_ID,
  handoffDigest: DIGEST_A,
  archiveDigest: DIGEST_B,
  sessionId: '550e8400-e29b-41d4-a716-446655440001',
  manifestDigest: DIGEST_C,
  contentDigest: DIGEST_D,
  sourceDigests: [
    { path: 'spritesheets/z.png', digest: DIGEST_A },
    { path: 'spritesheets/a.png', digest: DIGEST_B },
  ],
  creditDigest: DIGEST_C,
  status: 'imported',
  recordedAt: '2026-08-06T12:30:00.000Z',
} as const;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

describe('Web-to-CLI handoff contract', () => {
  it('parses a valid handoff and canonically sorts logical source paths', () => {
    const result = parseAssetWebCliHandoff(VALID_HANDOFF);

    expect(result).toEqual({
      ok: true,
      handoff: {
        ...VALID_HANDOFF,
        sources: [
          { path: 'spritesheets/a.png', digest: DIGEST_B },
          { path: 'spritesheets/z.png', digest: DIGEST_C },
        ],
      },
    });
  });

  it('rejects unknown, private, unsafe, duplicate, and attribution-weakening fields', () => {
    const unknownField = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      sessionId: 'web-must-not-create-cli-sessions',
    });
    const privateField = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      privacy: {
        ...VALID_HANDOFF.privacy,
        browserState: true,
      },
    });
    const privateBaseline = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      web: {
        ...VALID_HANDOFF.web,
        baselineReleaseTag: '/Users/private/release',
      },
    });
    const unsafePath = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      sources: [{ path: '../outside.png', digest: DIGEST_A }],
    });
    const absolutePath = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      sources: [{ path: '/outside.png', digest: DIGEST_A }],
    });
    const duplicatePath = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      sources: [
        { path: 'spritesheets/a.png', digest: DIGEST_A },
        { path: 'spritesheets/a.png', digest: DIGEST_B },
      ],
    });
    const optionalAttribution = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      attribution: {
        ...VALID_HANDOFF.attribution,
        required: false,
      },
    });
    const missingCredit = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      attribution: {
        ...VALID_HANDOFF.attribution,
        creditDigest: undefined,
      },
    });

    expect(unknownField.ok).toBe(false);
    if (unknownField.ok) throw new Error('Expected unknown field to fail.');
    expect(unknownField.diagnostics).toContainEqual({
      code: 'asset_web_cli_handoff_schema_invalid',
      path: '$.sessionId',
      message: 'Unknown field at $.sessionId.',
    });

    expect(privateField.ok).toBe(false);
    if (privateField.ok) throw new Error('Expected private field to fail.');
    expect(privateField.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_web_cli_handoff_private_data',
    );

    expect(privateBaseline.ok).toBe(false);
    if (privateBaseline.ok) throw new Error('Expected private baseline metadata to fail.');
    expect(privateBaseline.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_web_cli_handoff_private_data',
    );

    expect(unsafePath.ok).toBe(false);
    if (unsafePath.ok) throw new Error('Expected unsafe path to fail.');
    expect(unsafePath.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_web_cli_handoff_path_invalid',
    );

    expect(absolutePath.ok).toBe(false);
    if (absolutePath.ok) throw new Error('Expected absolute path to fail.');
    expect(absolutePath.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_web_cli_handoff_path_invalid',
    );

    expect(duplicatePath.ok).toBe(false);
    if (duplicatePath.ok) throw new Error('Expected duplicate path to fail.');
    expect(duplicatePath.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      '$.sources must not contain duplicate paths.',
    );

    expect(optionalAttribution.ok).toBe(false);
    if (optionalAttribution.ok) throw new Error('Expected optional attribution to fail.');
    expect(optionalAttribution.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_web_cli_handoff_attribution_required',
    );

    expect(missingCredit.ok).toBe(false);
    if (missingCredit.ok) throw new Error('Expected missing credit digest to fail.');
    expect(missingCredit.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.attribution.creditDigest',
    );
  });

  it('uses a stable state projection that excludes transfer-event identity', () => {
    const parsed = parseAssetWebCliHandoff(VALID_HANDOFF);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected the fixture to parse.');

    const expectedStateProjection = {
      schema: ASSET_WEB_CLI_HANDOFF_SCHEMA,
      baselineReleaseTag: 'lpc-toolkit-2026.08.06',
      workbenchRevision: 4,
      pack: {
        id: 'example.pack',
        version: '1.0.0',
        archiveKind: 'draft',
        manifestDigest: DIGEST_A,
        contentDigest: DIGEST_B,
        releaseFingerprint: DIGEST_C,
      },
      payload: {
        archiveDigest: DIGEST_A,
        byteLength: 12345,
      },
      sources: [
        { path: 'spritesheets/a.png', digest: DIGEST_B },
        { path: 'spritesheets/z.png', digest: DIGEST_C },
      ],
      attribution: {
        creditDigest: DIGEST_C,
        acknowledgementDigest: DIGEST_D,
      },
    } as const;

    expect(assetWebCliHandoffStateProjection(parsed.handoff)).toEqual(expectedStateProjection);
    expect(assetWebCliHandoffStateDigestInput(parsed.handoff)).toBe(
      JSON.stringify(expectedStateProjection),
    );
    expect(sha256(assetWebCliHandoffStateDigestInput(parsed.handoff))).toBe(EXPECTED_STATE_DIGEST);

    const propertyReordered = parseAssetWebCliHandoff({
      privacy: VALID_HANDOFF.privacy,
      consent: VALID_HANDOFF.consent,
      attribution: VALID_HANDOFF.attribution,
      sources: [...VALID_HANDOFF.sources].reverse(),
      payload: VALID_HANDOFF.payload,
      pack: VALID_HANDOFF.pack,
      web: VALID_HANDOFF.web,
      createdAt: VALID_HANDOFF.createdAt,
      purpose: VALID_HANDOFF.purpose,
      handoffId: VALID_HANDOFF.handoffId,
      direction: VALID_HANDOFF.direction,
      schema: VALID_HANDOFF.schema,
    });
    expect(propertyReordered.ok).toBe(true);
    if (!propertyReordered.ok) throw new Error('Expected the reordered fixture to parse.');
    expect(assetWebCliHandoffStateDigestInput(propertyReordered.handoff)).toBe(
      assetWebCliHandoffStateDigestInput(parsed.handoff),
    );
    expect(assetWebCliHandoffDigestInput(propertyReordered.handoff)).toBe(
      assetWebCliHandoffDigestInput(parsed.handoff),
    );

    const changedTransferEvent = parseAssetWebCliHandoff({
      ...VALID_HANDOFF,
      handoffId: '550e8400-e29b-41d4-a716-446655440001',
      createdAt: '2026-08-06T13:00:00.000Z',
    });
    expect(changedTransferEvent.ok).toBe(true);
    if (!changedTransferEvent.ok) throw new Error('Expected the changed event to parse.');
    expect(assetWebCliHandoffStateDigestInput(changedTransferEvent.handoff)).toBe(
      assetWebCliHandoffStateDigestInput(parsed.handoff),
    );
    expect(assetWebCliHandoffDigestInput(changedTransferEvent.handoff)).not.toBe(
      assetWebCliHandoffDigestInput(parsed.handoff),
    );
  });

  it('exposes bounded privacy, attribution, and stale-state predicates', () => {
    const parsed = parseAssetWebCliHandoff(VALID_HANDOFF);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected the fixture to parse.');

    expect(assetWebCliHandoffPrivacyIsSafe(parsed.handoff)).toBe(true);
    expect(assetWebCliHandoffAttributionIsRequired(parsed.handoff)).toBe(true);
    expect(assetWebCliHandoffStateIsStale(parsed.handoff, EXPECTED_STATE_DIGEST)).toBe(false);
    expect(assetWebCliHandoffStateIsStale(parsed.handoff, DIGEST_A)).toBe(true);
    expect(assetWebCliCapabilitiesCompatible(ASSET_WEB_CLI_HANDOFF_CAPABILITIES)).toBe(true);
    expect(assetWebCliCapabilitiesCompatible([ASSET_WEB_CLI_HANDOFF_CAPABILITIES[0]])).toBe(false);
    expect(assetWebCliCapabilitiesMissing([ASSET_WEB_CLI_HANDOFF_CAPABILITIES[0]])).toEqual([
      'asset-authoring-web-cli-recovery.v1',
    ]);
  });

  it('parses a session-owned receipt without changing the existing session contract', () => {
    const result = parseAssetAuthoringWebHandoffReceipt(VALID_RECEIPT);

    expect(result).toEqual({
      ok: true,
      receipt: {
        ...VALID_RECEIPT,
        sourceDigests: [
          { path: 'spritesheets/a.png', digest: DIGEST_B },
          { path: 'spritesheets/z.png', digest: DIGEST_A },
        ],
      },
    });
  });

  it('rejects an unsupported receipt status and unknown receipt fields', () => {
    const unsupportedStatus = parseAssetAuthoringWebHandoffReceipt({
      ...VALID_RECEIPT,
      status: 'discarded',
    });
    const unknownField = parseAssetAuthoringWebHandoffReceipt({
      ...VALID_RECEIPT,
      workspaceRoot: '/private/workspace',
    });

    expect(unsupportedStatus.ok).toBe(false);
    if (unsupportedStatus.ok) throw new Error('Expected unsupported receipt status to fail.');
    expect(unsupportedStatus.diagnostics).toContainEqual({
      code: 'asset_web_cli_handoff_schema_invalid',
      path: '$.status',
      message: '$.status must be imported.',
    });

    expect(unknownField.ok).toBe(false);
    if (unknownField.ok) throw new Error('Expected unknown receipt field to fail.');
    expect(unknownField.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_web_cli_handoff_schema_invalid',
    );
  });
});
