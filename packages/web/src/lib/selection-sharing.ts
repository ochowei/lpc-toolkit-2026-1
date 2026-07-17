import { serializeHash, type Selections } from '@lpc-toolkit/core';

export interface ClipboardWriter {
  readonly writeText: (text: string) => Promise<void>;
}

export interface ShareLocation {
  readonly origin: string;
  readonly pathname: string;
}

/** Copy a selection token through the browser clipboard port. */
export async function copySelectionToken(
  token: string,
  clipboard: ClipboardWriter = navigator.clipboard,
): Promise<void> {
  await clipboard.writeText(token);
}

/** Copy the canonical hash share URL through browser location/clipboard ports. */
export async function copySelectionLink(
  selections: Selections,
  clipboard: ClipboardWriter = navigator.clipboard,
  location: ShareLocation = window.location,
): Promise<void> {
  const hash = serializeHash(selections);
  await clipboard.writeText(`${location.origin}${location.pathname}#${hash}`);
}
