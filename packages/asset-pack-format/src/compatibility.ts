import {
  compareAssetPackVersions,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';

export const SUPPORTED_ASSET_PACK_CAPABILITIES = [
  'lpc-toolkit.asset-pack.v1',
  'lpc-toolkit.asset-pack.lifecycle.v1',
] as const;

export interface AssetPackLifecycleDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly path?: string;
  readonly packId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function checkAssetPackCompatibility(
  pack: NormalizedAssetPack,
  cliVersion: string,
): readonly AssetPackLifecycleDiagnostic[] {
  const compatibility = pack.compatibility;
  if (!compatibility) return [];

  const diagnostics: AssetPackLifecycleDiagnostic[] = [];
  const minimumCliVersion = compatibility.minimumCliVersion;
  if (
    minimumCliVersion !== undefined
    && compareAssetPackVersions(cliVersion, minimumCliVersion) < 0
  ) {
    diagnostics.push({
      code: 'asset_cli_version_incompatible',
      severity: 'error',
      message: `Asset pack requires CLI version ${minimumCliVersion} or newer; running ${cliVersion}.`,
      packId: pack.id,
      details: { minimumCliVersion, cliVersion },
    });
  }

  const supported = new Set<string>(SUPPORTED_ASSET_PACK_CAPABILITIES);
  compatibility.requiredCapabilities.forEach((capability) => {
    if (supported.has(capability)) return;
    diagnostics.push({
      code: 'asset_capability_unsupported',
      severity: 'error',
      message: `Asset pack requires unsupported capability: ${capability}.`,
      packId: pack.id,
      details: { capability },
    });
  });

  return diagnostics;
}
