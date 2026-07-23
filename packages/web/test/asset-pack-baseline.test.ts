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
    expect(baseline.cliVersion).toBe(__LPC_CLI_VERSION__);
    expect(Object.fromEntries(baseline.definitionDigests)).toEqual({
      a: 'sha256:e24cfea87a7f813d9f38b2dda156d255045789294caab5a21d2f230d1cbd6e45',
      z: 'sha256:f6016aa650eea7d8ca5480841aebbca2dd05937eabc0cfd8917ff1b777f3f74a',
    });
    expect(Object.fromEntries(baseline.creditDigests)).toEqual({
      a: 'sha256:656722bd355315123235cb9f11b09c1e2a3dc13881a040b3f6641632b65cad72',
      z: 'sha256:ae32ae7a9c2abde56748f8d2ce1f6f38dffa86a6a566f045a38322d27cb8d300',
    });
    expect(assetPackDefinitionProjection(item('a'))).toBeDefined();
    expect(assetPackCreditProjection(item('a'))).toBeDefined();
  });
});
