import { describe, expect, it } from 'vitest';
import { createCatalog, assetPackCreditProjection, assetPackDefinitionProjection, type ItemDefinition } from '@lpc-toolkit/core';
import { loadBrowserAssetPackBaseline } from '../src/lib/asset-pack-baseline';

const item = (name: string): ItemDefinition => ({ name, type_name: 'hair', animations: ['walk'], credits: [{ file: `${name}.png`, notes: '', authors: ['Alice'], licenses: ['CC-BY 4.0'], urls: [] }], layer_1: { zPos: 1, male: `${name}.png` } });

describe('browser official asset baseline', () => {
  it('keeps projection digests stable across insertion order and exposes release/build metadata', async () => {
    const first = createCatalog({ 'hair/z.json': item('z'), 'hair/a.json': item('a') }).catalog;
    const second = createCatalog({ 'hair/a.json': item('a'), 'hair/z.json': item('z') }).catalog;
    const baseline = await loadBrowserAssetPackBaseline({ catalog: first, palettes: { materials: {}, versions: {} } });
    const reversed = await loadBrowserAssetPackBaseline({ catalog: second, palettes: { materials: {}, versions: {} } });
    expect(baseline.definitionDigest).toBe(reversed.definitionDigest);
    expect(baseline.creditDigest).toBe(reversed.creditDigest);
    expect(baseline.releaseTag).toBe('assets-v2026.06.05-initial');
    expect(baseline.cliVersion).toBe('0.2.0');
    expect(assetPackDefinitionProjection(item('a'))).toBeDefined();
    expect(assetPackCreditProjection(item('a'))).toBeDefined();
  });
});
