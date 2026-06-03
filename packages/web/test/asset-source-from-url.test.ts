/** Verifies URL parsing for the web asset-source selector. */
import { describe, expect, it } from 'vitest';
import {
  assetSourceFromUrl,
  defaultAssetSourceFromUrl,
} from '../src/lib/asset-source-from-url';

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

  it('returns the parsed value when assetSource is "zip"', () => {
    expect(assetSourceFromUrl('?assetSource=zip')).toBe('zip');
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

describe('defaultAssetSourceFromUrl', () => {
  it('uses an explicit assetSource query value in dev mode', () => {
    expect(defaultAssetSourceFromUrl('?assetSource=auto', true)).toBe('auto');
    expect(defaultAssetSourceFromUrl('?assetSource=upstream', true)).toBe(
      'upstream',
    );
    expect(defaultAssetSourceFromUrl('?assetSource=zip', true)).toBe('zip');
  });

  it('defaults to local in dev mode when assetSource is absent or invalid', () => {
    expect(defaultAssetSourceFromUrl('', true)).toBe('local');
    expect(defaultAssetSourceFromUrl('?assetSource=nope', true)).toBe('local');
  });

  it('defaults to auto outside dev mode when assetSource is absent or invalid', () => {
    expect(defaultAssetSourceFromUrl('', false)).toBe('auto');
    expect(defaultAssetSourceFromUrl('?assetSource=nope', false)).toBe('auto');
  });
});
