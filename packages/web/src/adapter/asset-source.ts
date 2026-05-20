export type AssetSource = 'auto' | 'local' | 'upstream';

export const UPSTREAM_SPRITESHEET_BASE_URL =
  'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';

export function resolveLocalSpriteUrl(path: string, baseHref: string): string {
  return new URL(path, baseHref).href;
}

export function resolveUpstreamSpriteUrl(path: string): string {
  return new URL(path, UPSTREAM_SPRITESHEET_BASE_URL).href;
}

export function resolveSpriteUrlCandidates(
  path: string,
  baseHref: string,
  source: AssetSource,
): readonly string[] {
  if (source === 'local') return [resolveLocalSpriteUrl(path, baseHref)];
  if (source === 'upstream') return [resolveUpstreamSpriteUrl(path)];
  return [resolveLocalSpriteUrl(path, baseHref), resolveUpstreamSpriteUrl(path)];
}
