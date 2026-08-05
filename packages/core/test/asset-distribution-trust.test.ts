import { describe, expect, it } from 'vitest';
import type { AssetDistributionRelease } from '../src/index.js';
import {
  ASSET_DISTRIBUTION_TRUST_POLICY_SCHEMA,
  assetDistributionSignedProjectionDigestInput,
  assetDistributionTrustPolicyDigestInput,
  evaluateAssetDistributionTrust,
  parseAssetDistributionTrustPolicy,
  signAssetDistributionRelease,
  verifyAssetDistributionSignature,
} from '../src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const DIGEST_E = `sha256:${'e'.repeat(64)}`;
const DIGEST_F = `sha256:${'f'.repeat(64)}`;

const RELEASE: AssetDistributionRelease = {
  schema: 'lpc-toolkit.asset-distribution-release.v1',
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
    requiredCapabilities: [],
  },
  authorization: {
    namespacePolicyId: 'example-policy-v1',
    releaseEvidenceDigest: DIGEST_B,
  },
  signature: {
    keyId: DIGEST_D,
    algorithm: 'ed25519',
    payloadDigest: DIGEST_E,
    value: 'ZmFrZS1zaWduYXR1cmU',
  },
};

const POLICY = {
  schema: ASSET_DISTRIBUTION_TRUST_POLICY_SCHEMA,
  policyId: 'example-policy-v1',
  allowedAlgorithms: ['ed25519'],
  keys: [{
    keyId: DIGEST_D,
    fingerprint: DIGEST_E,
    namespace: 'example',
    status: 'active',
    validFrom: '2026-01-01T00:00:00.000Z',
  }],
} as const;

describe('asset distribution trust policy', () => {
  it('parses an active namespace key and accepts a verified signature', () => {
    const parsed = parseAssetDistributionTrustPolicy(POLICY);
    expect(parsed).toEqual({ ok: true, policy: POLICY });
    if (!parsed.ok) throw new Error('Expected trust policy fixture to parse.');

    expect(evaluateAssetDistributionTrust({
      release: RELEASE,
      policy: parsed.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toEqual({
      status: 'trusted',
      policyId: 'example-policy-v1',
      namespace: 'example',
      keyId: DIGEST_D,
    });
  });

  it('returns stable refusal states for signature, namespace, key, and validity failures', () => {
    const parsed = parseAssetDistributionTrustPolicy(POLICY);
    if (!parsed.ok) throw new Error('Expected trust policy fixture to parse.');

    expect(evaluateAssetDistributionTrust({
      release: RELEASE,
      policy: parsed.policy,
      signatureValid: false,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'signature-invalid',
      code: 'asset_distribution_signature_invalid',
    });

    expect(evaluateAssetDistributionTrust({
      release: {
        ...RELEASE,
        release: { ...RELEASE.release, namespace: 'other' },
      },
      policy: parsed.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'namespace-unauthorized',
      code: 'asset_distribution_namespace_unauthorized',
    });

    expect(evaluateAssetDistributionTrust({
      release: {
        ...RELEASE,
        signature: { ...RELEASE.signature, keyId: DIGEST_F },
      },
      policy: parsed.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'key-untrusted',
      code: 'asset_distribution_key_untrusted',
    });

    expect(evaluateAssetDistributionTrust({
      release: RELEASE,
      policy: {
        ...parsed.policy,
        keys: [{ ...parsed.policy.keys[0], status: 'revoked' }],
      },
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'key-revoked',
      code: 'asset_distribution_key_revoked',
    });

    expect(evaluateAssetDistributionTrust({
      release: RELEASE,
      policy: {
        ...parsed.policy,
        keys: [{ ...parsed.policy.keys[0], status: 'compromised' }],
      },
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'key-revoked',
      code: 'asset_distribution_key_revoked',
    });

    expect(evaluateAssetDistributionTrust({
      release: RELEASE,
      policy: parsed.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2025-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'key-expired',
      code: 'asset_distribution_key_expired',
    });

    expect(evaluateAssetDistributionTrust({
      release: {
        ...RELEASE,
        authorization: { ...RELEASE.authorization, namespacePolicyId: 'other-policy-v1' },
      },
      policy: parsed.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'policy-mismatch',
      code: 'asset_distribution_policy_mismatch',
    });

    expect(evaluateAssetDistributionTrust({
      release: RELEASE,
      policy: {
        ...parsed.policy,
        keys: [{
          ...parsed.policy.keys[0],
          status: 'revoked',
          grandfatheredArchiveDigests: [RELEASE.release.archiveDigest],
        }],
      },
      signatureValid: true,
      publicKeyFingerprint: DIGEST_E,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({ status: 'trusted' });
  });

  it('allows additive key rotation and enforces valid-until', () => {
    const rotated = parseAssetDistributionTrustPolicy({
      ...POLICY,
      keys: [
        POLICY.keys[0],
        {
          keyId: DIGEST_F,
          fingerprint: DIGEST_A,
          namespace: 'example',
          status: 'active',
          validFrom: '2026-06-01T00:00:00.000Z',
          validUntil: '2026-12-01T00:00:00.000Z',
        },
      ],
    });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) throw new Error('Expected rotated trust policy fixture to parse.');

    expect(evaluateAssetDistributionTrust({
      release: {
        ...RELEASE,
        signature: { ...RELEASE.signature, keyId: DIGEST_F },
      },
      policy: rotated.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_A,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({ status: 'trusted' });

    expect(evaluateAssetDistributionTrust({
      release: {
        ...RELEASE,
        signature: { ...RELEASE.signature, keyId: DIGEST_F },
      },
      policy: rotated.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_A,
      observedAt: '2027-01-01T00:00:00.000Z',
    })).toMatchObject({
      status: 'key-expired',
      code: 'asset_distribution_key_expired',
    });
  });

  it('injects canonical bytes into signer and verifier adapters', () => {
    const canonicalPayload = assetDistributionSignedProjectionDigestInput(RELEASE);
    const signed = signAssetDistributionRelease(RELEASE, {
      algorithm: 'ed25519',
      sign: (input) => {
        expect(input.canonicalPayload).toBe(canonicalPayload);
        expect(input.keyId).toBe(DIGEST_D);
        expect(input.payloadDigest).toBe(DIGEST_E);
        return RELEASE.signature.value;
      },
    });
    expect(signed).toEqual({
      ok: true,
      canonicalPayload,
      signatureValue: RELEASE.signature.value,
    });

    const verified = verifyAssetDistributionSignature({
      release: RELEASE,
      publicKeyFingerprint: DIGEST_E,
      verifier: {
        algorithm: 'ed25519',
        verify: (input) => {
          expect(input.canonicalPayload).toBe(canonicalPayload);
          expect(input.keyId).toBe(DIGEST_D);
          expect(input.payloadDigest).toBe(DIGEST_E);
          expect(input.signatureValue).toBe(RELEASE.signature.value);
          expect(input.publicKeyFingerprint).toBe(DIGEST_E);
          return true;
        },
      },
    });
    expect(verified).toEqual({ canonicalPayload, signatureValid: true });
  });

  it('refuses a supplied public-key fingerprint that differs from policy', () => {
    const parsed = parseAssetDistributionTrustPolicy(POLICY);
    if (!parsed.ok) throw new Error('Expected trust policy fixture to parse.');

    expect(evaluateAssetDistributionTrust({
      release: RELEASE,
      policy: parsed.policy,
      signatureValid: true,
      publicKeyFingerprint: DIGEST_F,
      observedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      status: 'key-untrusted',
      code: 'asset_distribution_key_untrusted',
    });
  });

  it('rejects unknown fields and keeps the policy digest input deterministic', () => {
    const unknown = parseAssetDistributionTrustPolicy({
      ...POLICY,
      remoteKeys: [],
    });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) throw new Error('Expected unknown policy field to fail.');
    expect(unknown.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.remoteKeys',
    );

    const parsed = parseAssetDistributionTrustPolicy(POLICY);
    if (!parsed.ok) throw new Error('Expected trust policy fixture to parse.');
    expect(assetDistributionTrustPolicyDigestInput(parsed.policy)).toBe(
      '{"allowedAlgorithms":["ed25519"],"keys":[{"fingerprint":"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","keyId":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","namespace":"example","status":"active","validFrom":"2026-01-01T00:00:00.000Z"}],"policyId":"example-policy-v1","schema":"lpc-toolkit.asset-distribution-trust-policy.v1"}',
    );

    const changed = parseAssetDistributionTrustPolicy({
      ...POLICY,
      policyId: 'example-policy-v2',
    });
    if (!changed.ok) throw new Error('Expected changed trust policy fixture to parse.');
    expect(assetDistributionTrustPolicyDigestInput(changed.policy)).not.toBe(
      assetDistributionTrustPolicyDigestInput(parsed.policy),
    );

    const unsupported = parseAssetDistributionTrustPolicy({
      ...POLICY,
      allowedAlgorithms: ['rsa-sha256'],
    });
    expect(unsupported.ok).toBe(false);
    if (unsupported.ok) throw new Error('Expected unsupported algorithm to fail.');
    expect(unsupported.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_distribution_unsupported',
    );

    expect(JSON.stringify(parsed.policy)).not.toMatch(/private|secret/iu);
  });
});
