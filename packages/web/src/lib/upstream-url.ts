/** Public upstream generator URL used for attribution and parity links. */
export const UPSTREAM_URL =
  'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';

/** Build an upstream generator link that preserves the current selection hash. */
export function buildUpstreamUrl(hash: string): string {
  return hash === '' ? UPSTREAM_URL : `${UPSTREAM_URL}#${hash}`;
}
