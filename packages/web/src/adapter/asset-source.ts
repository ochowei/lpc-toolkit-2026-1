/** Where the browser should try to load LPC spritesheet PNGs from. */
export type AssetSource = 'auto' | 'local' | 'upstream' | 'zip';

/** Public upstream root used as the fallback when local copied assets are absent. */
export const UPSTREAM_SPRITESHEET_BASE_URL =
  'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';

/** Resolve a spritesheet path against the current app base URL. */
export function resolveLocalSpriteUrl(path: string, baseHref: string): string {
  return new URL(path, baseHref).href;
}

/** Resolve a spritesheet path against the public upstream LPC generator. */
export function resolveUpstreamSpriteUrl(path: string): string {
  return new URL(path, UPSTREAM_SPRITESHEET_BASE_URL).href;
}

/**
 * Ordered URL candidates for a spritesheet request. `auto` tries the bundled
 * asset first, then falls back to upstream so local dev and static deploys can
 * use the same composition path.
 */
export function resolveSpriteUrlCandidates(
  path: string,
  baseHref: string,
  source: AssetSource,
): readonly string[] {
  if (source === 'local') return [resolveLocalSpriteUrl(path, baseHref)];
  if (source === 'upstream') return [resolveUpstreamSpriteUrl(path)];
  return [resolveLocalSpriteUrl(path, baseHref), resolveUpstreamSpriteUrl(path)];
}
