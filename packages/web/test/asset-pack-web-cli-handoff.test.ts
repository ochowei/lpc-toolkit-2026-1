import { describe, expect, it } from 'vitest';
import {
  createAssetPackWebCliHandoffSnapshot,
  type AssetPackWebCliHandoffMetadata,
} from '../src/lib/asset-pack-web-cli-handoff';

const digest = (character: string) => `sha256:${character.repeat(64)}` as `sha256:${string}`;

const metadata: AssetPackWebCliHandoffMetadata = {
  packId: 'example.pack',
  version: '1.0.0',
  archiveKind: 'draft',
  manifestDigest: digest('a'),
  contentDigest: digest('b'),
  releaseFingerprint: digest('c'),
  archiveDigest: digest('d'),
  archiveByteLength: 12345,
  archiveFileName: 'example.pack-1.0.0.draft.lpc-assets.zip',
  sourceDigests: [
    { path: 'sprites/z.png', digest: digest('9') },
    { path: 'sprites/a.png', digest: digest('a') },
  ],
  creditDigest: digest('e'),
  acknowledgementDigest: digest('f'),
};

describe('Web-to-CLI handoff snapshot builder', () => {
  it('builds the strict sidecar shape with sorted logical source bindings', () => {
    expect(createAssetPackWebCliHandoffSnapshot({
      revision: 7,
      baselineReleaseTag: 'assets-v2026.08.06',
      handoffId: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: '2026-08-06T14:00:00.000Z',
      stateDigest: digest('0'),
      metadata,
    })).toEqual({
      schema: 'lpc-toolkit.web-cli-handoff.v1',
      direction: 'web-to-cli',
      handoffId: '550e8400-e29b-41d4-a716-446655440000',
      purpose: 'cli-authoring-review',
      createdAt: '2026-08-06T14:00:00.000Z',
      web: {
        workbenchRevision: 7,
        stateDigest: digest('0'),
        baselineReleaseTag: 'assets-v2026.08.06',
      },
      pack: {
        id: 'example.pack',
        version: '1.0.0',
        archiveKind: 'draft',
        manifestDigest: digest('a'),
        contentDigest: digest('b'),
        releaseFingerprint: digest('c'),
      },
      payload: {
        fileName: 'example.pack-1.0.0.draft.lpc-assets.zip',
        byteLength: 12345,
        archiveDigest: digest('d'),
      },
      sources: [
        { path: 'sprites/a.png', digest: digest('a') },
        { path: 'sprites/z.png', digest: digest('9') },
      ],
      attribution: {
        creditDigest: digest('e'),
        acknowledgementDigest: digest('f'),
        required: true,
      },
      consent: { handoffConfirmed: true },
      privacy: {
        absolutePaths: false,
        credentials: false,
        providerPayloads: false,
        browserState: false,
      },
    });
  });
});
