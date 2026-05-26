import type { CreditsManifest } from './types.js';

/**
 * Pick the filename column value for entry index `i` of `manifest`. Mirrors
 * upstream `getAllCredits`/`creditsToTxt` (`upstream/sources/utils/credits.ts`)
 * which writes the resolved PNG path (its `lastUsedPath`). When the manifest
 * was synthesized without `resolvedPaths` (e.g. AttributionPopover's case),
 * we fall back to `entry.file + '/' + anim + '.png'` so output is still
 * sensible, just not necessarily byte-identical to upstream.
 */
function filenameFor(
  manifest: CreditsManifest,
  i: number,
  anim: string,
): string {
  const resolved = manifest.resolvedPaths[i];
  if (resolved) return resolved;
  return `${manifest.entries[i]!.file}/${anim}.png`;
}

/**
 * Serialize a CreditsManifest to the same TXT layout upstream produces
 * (`upstream/sources/utils/credits.ts:creditsToTxt`). Byte-identical when
 * `manifest.resolvedPaths` is populated (typical: produced by `getCredits`).
 * `anim` is only used by the filename fallback path.
 */
export function creditsToTxt(
  manifest: CreditsManifest,
  anim: string,
): string {
  let out = '';
  manifest.entries.forEach((credit, i) => {
    const fileName = filenameFor(manifest, i, anim);
    out += `${fileName}\n`;
    if (credit.notes) {
      out += `\t- Note: ${credit.notes}\n`;
    }
    out += `\t- Licenses:\n\t\t- ${credit.licenses.join('\n\t\t- ')}\n`;
    out += `\t- Authors:\n\t\t- ${credit.authors.join('\n\t\t- ')}\n`;
    out += `\t- Links:\n\t\t- ${credit.urls.join('\n\t\t- ')}\n\n`;
  });
  return out;
}
