import {
  serializeUpstreamHash,
  type Catalog,
  type PaletteMetadata,
  type Selections,
  type UpstreamProjectionLoss,
} from '@lpc-toolkit/core';

/** Public upstream generator URL used for attribution and parity links. */
export const UPSTREAM_URL =
  'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';

export interface UpstreamUrlResult {
  readonly hash: string;
  readonly href: string;
  readonly losses: readonly UpstreamProjectionLoss[];
}

/** Build a usable upstream link without forwarding toolkit-only v2 fields. */
export function buildUpstreamUrl(
  selections: Selections,
  catalog: Catalog,
  palettes: PaletteMetadata,
): UpstreamUrlResult {
  const projected = serializeUpstreamHash(selections, catalog, palettes);
  return {
    hash: projected.hash,
    href: `${UPSTREAM_URL}#${projected.hash}`,
    losses: projected.losses,
  };
}
