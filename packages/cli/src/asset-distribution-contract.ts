import type { AssetDistributionAuditEvidence, AssetDistributionAuditState } from './asset-distribution-audit.js';

export const ASSET_DISTRIBUTION_VERIFICATION_SCHEMA =
  'lpc-toolkit.asset-distribution-verification.v1' as const;

export const ASSET_DISTRIBUTION_CAPABILITIES = [
  'asset-pack-remote-distribution.v1',
  'asset-pack-signature-verification.v1',
  'asset-pack-global-install.v1',
  'asset-pack-npm-publication.v1',
] as const;

export const ASSET_DISTRIBUTION_SCHEMA_VERSIONS = [
  'lpc-toolkit.asset-distribution-release.v1',
  ASSET_DISTRIBUTION_VERIFICATION_SCHEMA,
  'lpc-toolkit.asset-distribution-trust-policy.v1',
] as const;

export type AssetDistributionPublicOperation =
  | 'inspect'
  | 'verify'
  | 'fetch'
  | 'install'
  | 'rollback'
  | 'post-publication';

export type AssetDistributionPublicState = AssetDistributionAuditState | 'needs-user-action';

export interface AssetDistributionPublicIdentity {
  readonly namespace: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly recordDigest: string;
}

export interface AssetDistributionPublicNextAction {
  readonly id: string;
  readonly summary: string;
  readonly command: string;
  readonly requiresConfirmation: boolean;
}

export interface AssetDistributionPublicTrust {
  readonly status:
    | 'trusted'
    | 'signature-invalid'
    | 'algorithm-unsupported'
    | 'key-untrusted'
    | 'key-revoked'
    | 'key-expired'
    | 'namespace-unauthorized'
    | 'policy-mismatch'
    | 'not-evaluated';
  readonly policyId?: string;
  readonly keyId?: string;
  readonly signatureVerified?: boolean;
}

export interface AssetDistributionPublicPackage {
  readonly name: string;
  readonly version: string;
  readonly transport: 'fake-npm' | 'fake-marketplace';
  readonly publicationId?: string;
}

export interface AssetDistributionPublicResponseData {
  readonly schema: typeof ASSET_DISTRIBUTION_VERIFICATION_SCHEMA;
  readonly operation: AssetDistributionPublicOperation;
  readonly state: AssetDistributionPublicState;
  readonly decision: AssetDistributionAuditState;
  readonly scope:
    | 'record-archive-capture'
    | 'record-archive-trust'
    | 'local-fixture-fetch'
    | 'temporary-consumer-prefix'
    | 'rollback-selection'
    | 'fake-package-receipt';
  readonly mutation: 'none' | 'temporary-consumer-prefix-only';
  readonly publication: 'not-performed' | 'fake-receipt-verified';
  readonly result?:
    | 'captured'
    | 'trusted'
    | 'confirmation-required'
    | 'installed'
    | 'rollback-selected'
    | 'fake-receipt-verified';
  readonly identity?: AssetDistributionPublicIdentity;
  readonly archive?: {
    readonly digest: string;
    readonly byteLength: number;
  };
  readonly trust?: AssetDistributionPublicTrust;
  readonly package?: AssetDistributionPublicPackage;
  readonly audit?: AssetDistributionAuditEvidence;
  readonly nextActions: readonly AssetDistributionPublicNextAction[];
}
