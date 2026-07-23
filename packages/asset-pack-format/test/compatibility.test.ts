import { describe, expect, it } from 'vitest';
import { normalizeAssetPack, parseAssetPackSource, ASSET_PACK_SCHEMA } from '@lpc-toolkit/core';
import {
  SUPPORTED_ASSET_PACK_CAPABILITIES,
  checkAssetPackCompatibility,
} from '../src/compatibility.js';

function makePack(compatibility?: { minimumCliVersion?: string; requiredCapabilities?: readonly string[] }) {
  const parsed = parseAssetPackSource({
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.test-pack',
    version: '1.0.0',
    displayName: 'Test Pack',
    credits: { authors: ['Alice'], licenses: ['CC-BY-SA 4.0'], urls: ['https://example.com'], notes: '' },
    compatibility,
    assets: [],
  });
  if (!parsed.ok) throw new Error('Invalid pack');
  return normalizeAssetPack(parsed.source);
}

describe('checkAssetPackCompatibility', () => {
  it('returns empty array when compatibility field is absent', () => {
    const pack = makePack();
    expect(checkAssetPackCompatibility(pack, '1.0.0')).toEqual([]);
  });

  it('handles minimum CLI version matching, higher, and lower', () => {
    const pack = makePack({ minimumCliVersion: '2.0.0' });

    expect(checkAssetPackCompatibility(pack, '2.0.0')).toEqual([]);
    expect(checkAssetPackCompatibility(pack, '2.1.0')).toEqual([]);

    const lower = checkAssetPackCompatibility(pack, '1.9.9');
    expect(lower).toEqual([
      {
        code: 'asset_cli_version_incompatible',
        severity: 'error',
        message: 'Asset pack requires CLI version 2.0.0 or newer; running 1.9.9.',
        packId: 'acme.test-pack',
        details: { minimumCliVersion: '2.0.0', cliVersion: '1.9.9' },
      },
    ]);
  });

  it('accepts supported capabilities and rejects unsupported ones', () => {
    const pack = makePack({
      requiredCapabilities: [
        ...SUPPORTED_ASSET_PACK_CAPABILITIES,
        'unsupported.feature.v1',
      ],
    });

    const result = checkAssetPackCompatibility(pack, '1.0.0');
    expect(result).toEqual([
      {
        code: 'asset_capability_unsupported',
        severity: 'error',
        message: 'Asset pack requires unsupported capability: unsupported.feature.v1.',
        packId: 'acme.test-pack',
        details: { capability: 'unsupported.feature.v1' },
      },
    ]);
  });
});
