import type { AssetSource } from '../adapter/asset-source';

const VALID_VALUES: readonly AssetSource[] = ['auto', 'local', 'upstream', 'zip'];

/**
 * Parse a URL search-string and return the validated `assetSource` value
 * if present, or undefined if absent / invalid. Intended for e2e tests
 * (and any future opt-in deep-link); not exposed in the UI.
 */
export function assetSourceFromUrl(search: string): AssetSource | undefined {
  const value = new URLSearchParams(search).get('assetSource');
  if (value === null) return undefined;
  return (VALID_VALUES as readonly string[]).includes(value)
    ? (value as AssetSource)
    : undefined;
}

/** Choose the runtime asset source, preferring the validated URL override. */
export function defaultAssetSourceFromUrl(
  search: string,
  isDev: boolean,
): AssetSource {
  return assetSourceFromUrl(search) ?? (isDev ? 'local' : 'zip');
}
