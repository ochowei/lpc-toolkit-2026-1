import { describe, expect, it } from 'vitest';
import {
  ASSET_DISTRIBUTION_RELEASE_SCHEMA,
  assetDistributionSignedProjectionDigestInput,
  parseAssetDistributionRelease,
} from '../src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const DIGEST_E = `sha256:${'e'.repeat(64)}`;
const DIGEST_F = `sha256:${'f'.repeat(64)}`;

const VALID_RELEASE = {
  schema: ASSET_DISTRIBUTION_RELEASE_SCHEMA,
  release: {
    namespace: 'example',
    packId: 'example.hair',
    version: '1.2.3',
    archiveKind: 'formal',
    archiveDigest: DIGEST_A,
    byteLength: 12345,
    manifestDigest: DIGEST_B,
    contentDigest: DIGEST_C,
    sourceDigests: [
      { path: 'sprites/a.png', digest: DIGEST_D },
      { path: 'sprites/z.png', digest: DIGEST_E },
    ],
    creditsDigest: DIGEST_F,
    licenseEvidenceDigest: DIGEST_A,
    provenanceDigest: DIGEST_B,
    requiredCapabilities: [],
  },
  authorization: {
    namespacePolicyId: 'example-policy-v1',
    releaseEvidenceDigest: DIGEST_C,
  },
  signature: {
    keyId: DIGEST_D,
    algorithm: 'ed25519',
    payloadDigest: DIGEST_E,
    value: 'ZmFrZS1zaWduYXR1cmU',
  },
} as const;

describe('asset distribution release schema', () => {
  it('parses one formal release with exact archive and trust bindings', () => {
    expect(parseAssetDistributionRelease(VALID_RELEASE)).toEqual({
      ok: true,
      release: VALID_RELEASE,
    });
  });

  it('canonicalizes the signed projection without signature or transport fields', () => {
    expect(assetDistributionSignedProjectionDigestInput(VALID_RELEASE)).toBe(
      '{"authorization":{"namespacePolicyId":"example-policy-v1","releaseEvidenceDigest":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"release":{"archiveDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","archiveKind":"formal","byteLength":12345,"contentDigest":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","creditsDigest":"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","licenseEvidenceDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","manifestDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","namespace":"example","packId":"example.hair","provenanceDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","requiredCapabilities":[],"sourceDigests":[{"digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","path":"sprites/a.png"},{"digest":"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","path":"sprites/z.png"}],"version":"1.2.3"}}',
    );
  });

  it('rejects unknown fields and unsupported schemas before trust evaluation', () => {
    const unknown = parseAssetDistributionRelease({
      ...VALID_RELEASE,
      remoteUrl: 'https://registry.example/releases/example',
    });
    const unsupported = parseAssetDistributionRelease({
      ...VALID_RELEASE,
      schema: 'lpc-toolkit.asset-distribution-release.v2',
    });

    expect(unknown.ok).toBe(false);
    if (unknown.ok) throw new Error('Expected unknown field to fail.');
    expect(unknown.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.remoteUrl',
    );

    expect(unsupported.ok).toBe(false);
    if (unsupported.ok) throw new Error('Expected unsupported schema to fail.');
    expect(unsupported.diagnostics).toContainEqual({
      code: 'asset_distribution_unsupported',
      path: '$.schema',
      message: 'Unsupported asset distribution release schema.',
    });
  });

  it('rejects unsorted or private source paths and malformed signatures', () => {
    const invalid = parseAssetDistributionRelease({
      ...VALID_RELEASE,
      release: {
        ...VALID_RELEASE.release,
        sourceDigests: [
          { path: 'sprites/z.png', digest: DIGEST_E },
          { path: '../private.png', digest: DIGEST_D },
        ],
      },
      signature: {
        ...VALID_RELEASE.signature,
        value: 'not base64!!!',
      },
    });

    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error('Expected malformed release to fail.');
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        '$.release.sourceDigests[1].path',
        '$.release.sourceDigests',
        '$.signature.value',
      ]),
    );
  });
});
