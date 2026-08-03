import { CLI_VERSION } from './package-info.js';

export const AUTHORING_SCHEMA_VERSIONS = [
  'lpc-toolkit.asset-authoring-plan.v1',
  'lpc-toolkit.asset-authoring-session.v1',
  'lpc-toolkit.asset-authoring-response.v1',
  'lpc-toolkit.sprite-drawing-contract.v1',
] as const;

export const AUTHORING_CAPABILITIES = [
  'asset-authoring-session.v1',
  'sprite-drawing-contract.v1',
  'asset-authoring-candidate-import.v1',
  'asset-authoring-recovery.v1',
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
