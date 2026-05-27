export const UPSTREAM_URL =
  'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';

export function buildUpstreamUrl(hash: string): string {
  return hash === '' ? UPSTREAM_URL : `${UPSTREAM_URL}#${hash}`;
}
