export {
  SUPPORTED_ASSET_PACK_CAPABILITIES,
  checkAssetPackCompatibility,
  type AssetPackLifecycleDiagnostic,
} from '@lpc-toolkit/asset-pack-format';

export function draftAssetPackDiagnostic(packId: string) {
  return {
    code: 'asset_pack_draft',
    severity: 'error' as const,
    message: 'Draft asset-pack archives are not installable.',
    packId,
    details: { status: 'draft' },
  };
}
