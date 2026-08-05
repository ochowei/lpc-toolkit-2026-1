import { describe, expect, it } from 'vitest';
import {
  ASSET_PROVIDER_DESCRIPTOR_SCHEMA,
  ASSET_PROVIDER_DISCOVERY_SCHEMA,
  ASSET_PROVIDER_LIMITS,
  ASSET_PROVIDER_OPERATION,
  ASSET_PROVIDER_CONTRACT_VERSION,
  assetProviderDescriptorDigestInput,
  assetProviderDescriptorProjection,
  assetProviderCliRangeMatches,
  assetProviderDiscoveryEntry,
  assetProviderDiscoveryProjection,
  agentIntegrationManifestCompatibility,
  ASSET_PROVIDER_INVOCATION_SCHEMA,
  ASSET_PROVIDER_REFUSAL_CODES,
  ASSET_PROVIDER_REFUSAL_SCHEMA,
  ASSET_PROVIDER_RESULT_SCHEMA,
  AGENT_INTEGRATION_MANIFEST_SCHEMA,
  assetProviderInvocationDigestInput,
  assetProviderInvocationProjection,
  assetProviderRefusalBindingDiagnostics,
  assetProviderRefusalDigestInput,
  assetProviderRefusalProjection,
  assetProviderResultBindingDiagnostics,
  assetProviderResultDigestInput,
  assetProviderResultProjection,
  parseAgentIntegrationManifest,
  parseAssetProviderDescriptor,
  parseAssetProviderDescriptorJson,
  parseAssetProviderDiscovery,
  parseAssetProviderInvocation,
  parseAssetProviderRefusal,
  parseAssetProviderResult,
  parseAssetProviderSemver,
} from '../src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;

const VALID_INVOCATION = {
  schema: ASSET_PROVIDER_INVOCATION_SCHEMA,
  sessionId: '00000000-0000-4000-8000-000000000000',
  contractDigest: DIGEST_A,
  operation: 'sprite-candidate.v1',
  provider: {
    id: 'provider.example',
    adapter: {
      id: 'agent-adapter.example',
      version: '1.0.0',
    },
  },
  targetIds: ['sprites/hair/acme/walk.png'],
  inputDigests: [DIGEST_C],
  consent: {
    confirmed: true,
    scopeDigest: DIGEST_B,
    network: {
      enabled: false,
      hosts: [],
    },
    referenceDigests: [DIGEST_C],
  },
  limits: {
    maxCandidateBytes: 67108864,
    timeoutSeconds: 600,
    maxReferences: 8,
  },
  candidate: {
    stagingId: 'provider.example/00000000-0000-4000-8000-000000000000',
    targetIds: ['sprites/hair/acme/walk.png'],
  },
} as const;

const VALID_RESULT = {
  schema: ASSET_PROVIDER_RESULT_SCHEMA,
  invocationDigest: DIGEST_A,
  sessionId: VALID_INVOCATION.sessionId,
  contractDigest: VALID_INVOCATION.contractDigest,
  operation: VALID_INVOCATION.operation,
  provider: VALID_INVOCATION.provider,
  targetId: VALID_INVOCATION.targetIds[0],
  consentScopeDigest: VALID_INVOCATION.consent.scopeDigest,
  inputDigests: VALID_INVOCATION.inputDigests,
  referenceDigests: VALID_INVOCATION.consent.referenceDigests,
  candidate: {
    id: VALID_INVOCATION.candidate.stagingId,
    digest: DIGEST_B,
    byteLength: 1024,
  },
} as const;

const VALID_REFUSAL = {
  schema: ASSET_PROVIDER_REFUSAL_SCHEMA,
  invocationDigest: DIGEST_A,
  sessionId: VALID_INVOCATION.sessionId,
  contractDigest: VALID_INVOCATION.contractDigest,
  operation: VALID_INVOCATION.operation,
  provider: VALID_INVOCATION.provider,
  targetIds: VALID_INVOCATION.targetIds,
  consentScopeDigest: VALID_INVOCATION.consent.scopeDigest,
  referenceDigests: VALID_INVOCATION.consent.referenceDigests,
  code: 'asset_provider_timeout',
  nextAction: 'retry-within-scope',
} as const;

const VALID_MANIFEST = {
  schema: AGENT_INTEGRATION_MANIFEST_SCHEMA,
  id: 'agent.example.lpc-authoring',
  version: '1.0.0',
  cliRange: '>=0.3.0 <0.4.0',
  requiredCapabilities: [
    'asset-authoring-session.v1',
    'sprite-drawing-contract.v1',
    'asset-authoring-candidate-import.v1',
  ],
  optionalCapabilities: [
    'asset-authoring-provider-discovery.v1',
    'asset-authoring-provider-invocation.v1',
  ],
  supportedGoals: ['new-item', 'extend-item'],
  providerAdapters: [],
} as const;

const VALID_DESCRIPTOR = {
  schema: ASSET_PROVIDER_DESCRIPTOR_SCHEMA,
  id: 'provider.example',
  adapter: {
    id: 'agent-adapter.example',
    version: '1.0.0',
    cliRange: '>=0.3.0 <0.4.0',
  },
  capabilities: ['sprite-candidate.v1'],
  contractVersions: ['lpc-toolkit.sprite-drawing-contract.v1'],
  limits: {
    maxCandidateBytes: 67108864,
    timeoutSeconds: 600,
    maxReferences: 8,
  },
  network: {
    required: false,
    declaredHosts: [],
  },
  credentials: {
    required: true,
    handledOutsideCli: true,
  },
} as const;

describe('provider-neutral Core contracts', () => {
  it('parses and normalizes a provider descriptor through the public export seam', () => {
    const result = parseAssetProviderDescriptor({
      ...VALID_DESCRIPTOR,
      capabilities: ['sprite-candidate.v1', 'asset-authoring-provider-invocation.v1'],
      contractVersions: [
        'lpc-toolkit.sprite-drawing-contract.v1',
        'lpc-toolkit.asset-authoring-session.v1',
      ],
    });

    expect(result).toEqual({
      ok: true,
      descriptor: {
        ...VALID_DESCRIPTOR,
        capabilities: [
          'asset-authoring-provider-invocation.v1',
          'sprite-candidate.v1',
        ],
        contractVersions: [
          'lpc-toolkit.asset-authoring-session.v1',
          'lpc-toolkit.sprite-drawing-contract.v1',
        ],
      },
    });
  });

  it('rejects unknown fields and private descriptor values', () => {
    const unknownField = parseAssetProviderDescriptor({
      ...VALID_DESCRIPTOR,
      unexpected: 'raw-provider-payload',
    });
    const privateHost = parseAssetProviderDescriptor({
      ...VALID_DESCRIPTOR,
      network: {
        required: true,
        declaredHosts: ['https://provider.example/api'],
      },
    });
    const cliCredential = parseAssetProviderDescriptor({
      ...VALID_DESCRIPTOR,
      credentials: {
        required: true,
        handledOutsideCli: false,
      },
    });

    expect(unknownField.ok).toBe(false);
    if (unknownField.ok) throw new Error('Expected unknown field to fail.');
    expect(unknownField.diagnostics).toContainEqual({
      code: 'asset_provider_schema_invalid',
      path: '$.unexpected',
      message: 'Unknown field at $.unexpected.',
    });

    expect(privateHost.ok).toBe(false);
    if (privateHost.ok) throw new Error('Expected private host to fail.');
    expect(privateHost.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'asset_provider_private_data',
    );

    expect(cliCredential.ok).toBe(false);
    if (cliCredential.ok) throw new Error('Expected CLI credential handling to fail.');
    expect(cliCredential.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_provider_private_data',
      path: '$.credentials.handledOutsideCli',
    }));
  });

  it('enforces fixed resource limits, duplicate sets, and the bounded SemVer grammar', () => {
    const overLimit = parseAssetProviderDescriptor({
      ...VALID_DESCRIPTOR,
      capabilities: Array.from(
        { length: ASSET_PROVIDER_LIMITS.capabilities + 1 },
        (_, index) => `capability-${index}`,
      ),
    });
    const duplicate = parseAssetProviderDescriptor({
      ...VALID_DESCRIPTOR,
      capabilities: ['sprite-candidate.v1', 'sprite-candidate.v1'],
    });
    const invalidRange = parseAssetProviderDescriptor({
      ...VALID_DESCRIPTOR,
      adapter: {
        ...VALID_DESCRIPTOR.adapter,
        cliRange: '^0.3.0',
      },
    });

    expect(overLimit.ok).toBe(false);
    if (overLimit.ok) throw new Error('Expected capability limit to fail.');
    expect(overLimit.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_provider_limit_exceeded',
      path: '$.capabilities',
    }));

    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) throw new Error('Expected duplicate capability to fail.');
    expect(duplicate.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_provider_schema_invalid',
      path: '$.capabilities',
    }));

    expect(invalidRange.ok).toBe(false);
    if (invalidRange.ok) throw new Error('Expected invalid range to fail.');
    expect(invalidRange.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_provider_semver_invalid',
      path: '$.adapter.cliRange',
    }));

    const invalidJson = parseAssetProviderDescriptorJson('{');
    expect(invalidJson.ok).toBe(false);
    const oversizedJson = parseAssetProviderDescriptorJson(
      JSON.stringify({ ...VALID_DESCRIPTOR, id: 'x'.repeat(ASSET_PROVIDER_LIMITS.descriptorBytes) }),
    );
    expect(oversizedJson.ok).toBe(false);
    if (oversizedJson.ok) throw new Error('Expected descriptor byte limit to fail.');
    expect(oversizedJson.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_provider_limit_exceeded',
      path: '$',
    }));
  });

  it('compares only the fixed SemVer comparator grammar and emits stable projection input', () => {
    expect(parseAssetProviderSemver('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
    expect(parseAssetProviderSemver('01.2.3')).toBeUndefined();
    expect(assetProviderCliRangeMatches('>=0.3.0 <0.4.0', '0.3.7')).toBe(true);
    expect(assetProviderCliRangeMatches('>=0.3.0 <0.4.0', '0.4.0')).toBe(false);
    expect(assetProviderCliRangeMatches('^0.3.0', '0.3.7')).toBe(false);

    const reordered = {
      ...VALID_DESCRIPTOR,
      capabilities: ['sprite-candidate.v1', 'asset-authoring-provider-invocation.v1'],
      contractVersions: [
        'lpc-toolkit.sprite-drawing-contract.v1',
        'lpc-toolkit.asset-authoring-session.v1',
      ],
    };
    const parsed = parseAssetProviderDescriptor(reordered);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected descriptor to parse.');
    expect(Object.keys(assetProviderDescriptorProjection(parsed.descriptor))).toEqual([
      'schema',
      'id',
      'adapter',
      'capabilities',
      'contractVersions',
      'limits',
      'network',
      'credentials',
    ]);
    expect(assetProviderDescriptorDigestInput(parsed.descriptor)).toBe(
      JSON.stringify(assetProviderDescriptorProjection(parsed.descriptor)),
    );
  });

  it('projects deterministic discovery statuses without selecting a provider', () => {
    const supported = assetProviderDiscoveryEntry({
      availability: 'available',
      descriptor: VALID_DESCRIPTOR,
      descriptorDigest: DIGEST_A,
      sessionId: '00000000-0000-4000-8000-000000000000',
      contractDigest: DIGEST_B,
      cliVersion: '0.3.0',
    });
    const consentRequired = assetProviderDiscoveryEntry({
      availability: 'available',
      descriptor: {
        ...VALID_DESCRIPTOR,
        network: {
          required: true,
          declaredHosts: ['provider.example'],
        },
      },
      descriptorDigest: DIGEST_B,
      sessionId: '00000000-0000-4000-8000-000000000000',
      contractDigest: DIGEST_B,
      cliVersion: '0.3.0',
    });
    const unsupported = assetProviderDiscoveryEntry({
      availability: 'available',
      descriptor: {
        ...VALID_DESCRIPTOR,
        id: 'provider.other',
        capabilities: ['other-operation.v1'],
      },
      descriptorDigest: DIGEST_A,
      sessionId: '00000000-0000-4000-8000-000000000000',
      contractDigest: DIGEST_B,
      cliVersion: '0.3.0',
    });
    const unavailable = assetProviderDiscoveryEntry({
      availability: 'unavailable',
      descriptor: VALID_DESCRIPTOR,
      descriptorDigest: DIGEST_B,
      sessionId: '00000000-0000-4000-8000-000000000000',
      contractDigest: DIGEST_B,
      cliVersion: '0.3.0',
    });

    expect(supported.status).toBe('supported');
    expect(supported.missingCapabilities).toEqual([]);
    expect(supported.refusal).toBeNull();
    expect(consentRequired.status).toBe('consent-required');
    expect(consentRequired.refusal?.code).toBe('asset_provider_consent_required');
    expect(unsupported.status).toBe('unsupported');
    expect(unsupported.missingCapabilities).toEqual([ASSET_PROVIDER_OPERATION]);
    expect(unsupported.refusal?.code).toBe('asset_provider_capability_unsupported');
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable.refusal?.code).toBe('asset_provider_unavailable');

    const discovery = {
      schema: ASSET_PROVIDER_DISCOVERY_SCHEMA,
      sessionId: '00000000-0000-4000-8000-000000000000',
      contractDigest: DIGEST_B,
      cliVersion: '0.3.0',
      entries: [unsupported, supported],
    };
    expect(assetProviderDiscoveryProjection(discovery).entries.map((entry) => entry.id)).toEqual([
      'provider.example',
      'provider.other',
    ]);
    expect(assetProviderDiscoveryProjection(discovery).entries.map((entry) => entry.status)).toEqual([
      'supported',
      'unsupported',
    ]);
    expect(ASSET_PROVIDER_CONTRACT_VERSION).toBe('lpc-toolkit.sprite-drawing-contract.v1');

    const parsed = parseAssetProviderDiscovery(discovery);
    expect(parsed).toMatchObject({
      ok: true,
      discovery: {
        schema: ASSET_PROVIDER_DISCOVERY_SCHEMA,
        entries: assetProviderDiscoveryProjection(discovery).entries,
      },
    });
    const overLimit = parseAssetProviderDiscovery({
      ...discovery,
      entries: Array.from({ length: 33 }, (_, index) => ({
        ...supported,
        id: `provider-${index}`,
      })),
    });
    expect(overLimit.ok).toBe(false);
    if (overLimit.ok) throw new Error('Expected discovery descriptor limit to fail.');
    expect(overLimit.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_provider_limit_exceeded',
      path: '$.entries',
    }));
  });

  it('parses the bounded invocation, result, and refusal envelopes', () => {
    const invocation = parseAssetProviderInvocation({
      ...VALID_INVOCATION,
      targetIds: [...VALID_INVOCATION.targetIds].reverse(),
      candidate: {
        ...VALID_INVOCATION.candidate,
        targetIds: [...VALID_INVOCATION.candidate.targetIds].reverse(),
      },
    });
    const result = parseAssetProviderResult(VALID_RESULT);
    const refusal = parseAssetProviderRefusal(VALID_REFUSAL);

    expect(invocation).toMatchObject({
      ok: true,
      invocation: VALID_INVOCATION,
    });
    expect(result).toEqual({ ok: true, result: VALID_RESULT });
    expect(refusal).toEqual({ ok: true, refusal: VALID_REFUSAL });
    expect(ASSET_PROVIDER_REFUSAL_CODES).toEqual([
      'asset_provider_unavailable',
      'asset_provider_capability_unsupported',
      'asset_provider_contract_mismatch',
      'asset_provider_consent_required',
      'asset_provider_scope_violation',
      'asset_provider_network_denied',
      'asset_provider_secret_input',
      'asset_provider_result_invalid',
      'asset_provider_result_stale',
      'asset_provider_cancelled',
      'asset_provider_timeout',
      'agent_integration_capability_unsupported',
    ]);

    if (!invocation.ok || !result.ok || !refusal.ok) {
      throw new Error('Expected all provider envelopes to parse.');
    }
    expect(assetProviderResultBindingDiagnostics(invocation.invocation, result.result)).toEqual([]);
    expect(assetProviderRefusalBindingDiagnostics(invocation.invocation, refusal.refusal)).toEqual([]);
    expect(assetProviderInvocationDigestInput(invocation.invocation)).toBe(
      JSON.stringify(assetProviderInvocationProjection(invocation.invocation)),
    );
    expect(assetProviderResultDigestInput(result.result)).toBe(
      JSON.stringify(assetProviderResultProjection(result.result)),
    );
    expect(assetProviderRefusalDigestInput(refusal.refusal)).toBe(
      JSON.stringify(assetProviderRefusalProjection(refusal.refusal)),
    );
  });

  it('rejects binding drift and unknown private result fields', () => {
    const invocation = parseAssetProviderInvocation(VALID_INVOCATION);
    const staleResult = parseAssetProviderResult({
      ...VALID_RESULT,
      contractDigest: DIGEST_B,
      privatePayload: 'raw-provider-response',
    });
    const staleRefusal = parseAssetProviderRefusal({
      ...VALID_REFUSAL,
      consentScopeDigest: DIGEST_C,
    });

    expect(invocation.ok).toBe(true);
    expect(staleResult.ok).toBe(false);
    if (staleResult.ok) throw new Error('Expected private result field to fail.');
    expect(staleResult.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.privatePayload',
    );
    expect(staleRefusal.ok).toBe(true);
    if (!invocation.ok || !staleRefusal.ok) throw new Error('Expected binding fixtures to parse.');
    expect(assetProviderRefusalBindingDiagnostics(invocation.invocation, staleRefusal.refusal)).toContainEqual(
      expect.objectContaining({
        code: 'asset_provider_binding_mismatch',
        path: '$.consentScopeDigest',
      }),
    );
  });

  it('parses the strict Agent integration manifest and rejects required/optional overlap', () => {
    const parsed = parseAgentIntegrationManifest({
      ...VALID_MANIFEST,
      requiredCapabilities: [...VALID_MANIFEST.requiredCapabilities].reverse(),
    });
    const overlap = parseAgentIntegrationManifest({
      ...VALID_MANIFEST,
      optionalCapabilities: ['asset-authoring-session.v1'],
    });

    expect(parsed).toMatchObject({
      ok: true,
      manifest: {
        ...VALID_MANIFEST,
        requiredCapabilities: [
          'asset-authoring-candidate-import.v1',
          'asset-authoring-session.v1',
          'sprite-drawing-contract.v1',
        ],
        supportedGoals: ['extend-item', 'new-item'],
      },
    });
    expect(overlap.ok).toBe(false);
    if (overlap.ok) throw new Error('Expected required/optional overlap to fail.');
    expect(overlap.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_provider_schema_invalid',
      path: '$.optionalCapabilities',
    }));

    if (!parsed.ok) throw new Error('Expected manifest to parse.');
    const optionalFallback = agentIntegrationManifestCompatibility(parsed.manifest, {
      cliVersion: '0.3.0',
      capabilities: [
        'asset-authoring-candidate-import.v1',
        'asset-authoring-session.v1',
        'sprite-drawing-contract.v1',
      ],
    });
    expect(optionalFallback).toEqual({
      cliRangeCompatible: true,
      missingRequiredCapabilities: [],
      missingOptionalCapabilities: [
        'asset-authoring-provider-discovery.v1',
        'asset-authoring-provider-invocation.v1',
      ],
      optionalFallback: true,
      refusal: null,
    });
    const missingRequired = agentIntegrationManifestCompatibility(parsed.manifest, {
      cliVersion: '0.3.0',
      capabilities: [],
    });
    expect(missingRequired.refusal?.code).toBe('agent_integration_capability_unsupported');
    expect(missingRequired.missingRequiredCapabilities).toEqual([
      'asset-authoring-candidate-import.v1',
      'asset-authoring-session.v1',
      'sprite-drawing-contract.v1',
    ]);
  });
});
