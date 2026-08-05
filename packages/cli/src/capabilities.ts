import {
  AGENT_INTEGRATION_MANIFEST_SCHEMA,
  ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
  ASSET_PROVIDER_CAPABILITIES,
  ASSET_PROVIDER_DESCRIPTOR_SCHEMA,
  ASSET_PROVIDER_DISCOVERY_SCHEMA,
  ASSET_PROVIDER_INVOCATION_SCHEMA,
  ASSET_PROVIDER_REFUSAL_SCHEMA,
  ASSET_PROVIDER_RESULT_SCHEMA,
  ASSET_WEB_CLI_HANDOFF_CAPABILITIES,
  ASSET_WEB_CLI_HANDOFF_SCHEMA,
} from '@lpc-toolkit/core';
import { CLI_VERSION } from './package-info.js';
import {
  ASSET_DISTRIBUTION_CAPABILITIES,
  ASSET_DISTRIBUTION_SCHEMA_VERSIONS,
} from './asset-distribution-contract.js';

const PROVIDER_SCHEMA_VERSIONS = [
  ASSET_PROVIDER_DESCRIPTOR_SCHEMA,
  ASSET_PROVIDER_DISCOVERY_SCHEMA,
  ASSET_PROVIDER_INVOCATION_SCHEMA,
  ASSET_PROVIDER_RESULT_SCHEMA,
  ASSET_PROVIDER_REFUSAL_SCHEMA,
  AGENT_INTEGRATION_MANIFEST_SCHEMA,
] as const;

export const AUTHORING_SCHEMA_VERSIONS = [
  'lpc-toolkit.asset-authoring-plan.v1',
  'lpc-toolkit.asset-authoring-session.v1',
  'lpc-toolkit.asset-authoring-response.v1',
  'lpc-toolkit.sprite-drawing-contract.v1',
  'lpc-toolkit.asset-release-declaration.v1',
  'lpc-toolkit.asset-authoring-release-receipt.v1',
  'lpc-toolkit.asset-authoring-draft-receipt.v1',
  'lpc-toolkit.asset-authoring-formal-archive-receipt.v1',
  'lpc-toolkit.asset-authoring-archive-inspection-receipt.v1',
  'lpc-toolkit.asset-authoring-install-receipt.v1',
  'lpc-toolkit.asset-release-provenance.v1',
  'lpc-toolkit.asset-release-provenance-verification.v1',
  ASSET_WEB_CLI_HANDOFF_SCHEMA,
  ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
  ...PROVIDER_SCHEMA_VERSIONS,
  ...ASSET_DISTRIBUTION_SCHEMA_VERSIONS,
] as const;

export const AUTHORING_CAPABILITIES = [
  'asset-authoring-session.v1',
  'sprite-drawing-contract.v1',
  'asset-authoring-candidate-import.v1',
  'asset-authoring-recovery.v1',
  'asset-authoring-release.v1',
  'asset-authoring-draft-recovery.v1',
  'asset-authoring-consumer-install.v1',
  'asset-authoring-release-provenance.v1',
  ...ASSET_WEB_CLI_HANDOFF_CAPABILITIES,
  ...ASSET_PROVIDER_CAPABILITIES,
  ...ASSET_DISTRIBUTION_CAPABILITIES,
] as const;

export interface CapabilityAdvertisement {
  readonly cliVersion: string;
  readonly capabilities: readonly string[];
  readonly schemaVersions: readonly string[];
}

export function createCapabilityAdvertisement(
  cliVersion: string = CLI_VERSION,
): CapabilityAdvertisement {
  return {
    cliVersion,
    capabilities: [...AUTHORING_CAPABILITIES],
    schemaVersions: [...AUTHORING_SCHEMA_VERSIONS],
  };
}
