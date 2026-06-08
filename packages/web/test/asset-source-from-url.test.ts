/** Verifies URL parsing for the web asset-source selector. */
import { describe, expect, it } from 'vitest';
import {
  assetSourceFromUrl,
  defaultAssetSourceFromUrl,
} from '../src/lib/asset-source-from-url';

describe('assetSourceFromUrl', () => {
  it('returns zip when assetSource is "zip"', () => {
    expect(assetSourceFromUrl('?assetSource=zip')).toBe('zip');
    expect(assetSourceFromUrl('assetSource=zip')).toBe('zip');
  });

  it('returns undefined when assetSource is absent', () => {
    expect(assetSourceFromUrl('')).toBeUndefined();
    expect(assetSourceFromUrl('?foo=bar')).toBeUndefined();
  });

  it('returns undefined for legacy or invalid assetSource values', () => {
    expect(assetSourceFromUrl('?assetSource=auto')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=local')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=upstream')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=invalid')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=ZIP')).toBeUndefined();
  });
});

describe('defaultAssetSourceFromUrl', () => {
  it('always resolves to zip for absent, valid, invalid, and legacy values', () => {
    expect(defaultAssetSourceFromUrl('', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('', false)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=zip', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=zip', false)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=local', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=upstream', false)).toBe(
      'zip',
    );
    expect(defaultAssetSourceFromUrl('?assetSource=auto', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=nope', false)).toBe('zip');
  });
});
