import { describe, expect, it } from 'vitest';
import { assetSourceFromUrl } from '../src/lib/asset-source-from-url';

describe('assetSourceFromUrl', () => {
  it('returns the parsed value when assetSource is "local"', () => {
    expect(assetSourceFromUrl('?assetSource=local')).toBe('local');
  });

  it('returns the parsed value when assetSource is "upstream"', () => {
    expect(assetSourceFromUrl('?assetSource=upstream')).toBe('upstream');
  });

  it('returns the parsed value when assetSource is "auto"', () => {
    expect(assetSourceFromUrl('?assetSource=auto')).toBe('auto');
  });

  it('returns undefined when assetSource is absent', () => {
    expect(assetSourceFromUrl('')).toBeUndefined();
    expect(assetSourceFromUrl('?foo=bar')).toBeUndefined();
  });

  it('returns undefined when assetSource is not a valid value', () => {
    expect(assetSourceFromUrl('?assetSource=invalid')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=LOCAL')).toBeUndefined();
  });

  it('accepts a leading ? or no leading ?', () => {
    expect(assetSourceFromUrl('?assetSource=local')).toBe('local');
    expect(assetSourceFromUrl('assetSource=local')).toBe('local');
  });
});
