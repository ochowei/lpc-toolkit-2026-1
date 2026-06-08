import type { AssetSource } from '../adapter/asset-source';

/**
 * Parse a URL search-string and return the validated `assetSource` value
 * if present, or undefined if absent / invalid. Only ZIP is supported.
 */
export function assetSourceFromUrl(search: string): AssetSource | undefined {
  const value = new URLSearchParams(search).get('assetSource');
  return value === 'zip' ? 'zip' : undefined;
}

/** Choose the runtime asset source. ZIP is the only supported source. */
export function defaultAssetSourceFromUrl(
  search: string,
  _isDev: boolean,
): AssetSource {
  return assetSourceFromUrl(search) ?? 'zip';
}
