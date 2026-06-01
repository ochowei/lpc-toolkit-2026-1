import type { CreditsManifest } from './types.js';

/**
 * Resolves the filename column value for entry index `i` of the manifest.
 * Mirrors upstream `getAllCredits`/`creditsToTxt` (`upstream/sources/utils/credits.ts`)
 * which writes the resolved PNG path (its `lastUsedPath`).
 * 
 * When the manifest was synthesized without `resolvedPaths` (e.g. AttributionPopover's case),
 * we fall back to `entry.file + '/' + anim + '.png'` so the serialized output is still
 * sensible and structured, just not necessarily byte-identical to upstream.
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
 * Serializes a CreditsManifest to the exact human-readable text (TXT) format layout upstream produces
 * (`upstream/sources/utils/credits.ts:creditsToTxt`).
 * Byte-identical when `manifest.resolvedPaths` is populated (typical: produced by `getCredits`).
 * 
 * TXT Serialization Layout:
 * - Line 1: The resolved filename (or fallback)
 * - Optional Line 2: `\t- Note: [note text]`
 * - Next Lines: `\t- Licenses:\n\t\t- [license 1]\n\t\t- [license 2]` (indented with tabs)
 * - Next Lines: `\t- Authors:\n\t\t- [author 1]\n\t\t- [author 2]`
 * - Next Lines: `\t- Links:\n\t\t- [url 1]\n\t\t- [url 2]\n\n`
 *
 * @param manifest The CreditsManifest containing the resolved attributions.
 * @param anim The active logical animation name (only used for filename fallback path).
 * @returns Serialized human-readable text string.
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

/**
 * Serializes a CreditsManifest to the exact CSV layout upstream produces
 * (`upstream/sources/utils/credits.ts:creditsToCsv`).
 * Byte-identical when `manifest.resolvedPaths` is populated.
 *
 * CSV Serialization Layout:
 * - Header: `filename,notes,authors,licenses,urls`
 * - Rows: `"filename","notes","authors","licenses","urls"`
 * 
 * Note on escaping: Upstream does NOT escape embedded double-quotes — this matches
 * that behavior exactly so byte-for-byte equality holds. Since author/license/URL strings
 * in the LPC upstream database do not contain double-quotes, this is safe and does not cause issues.
 *
 * @param manifest The CreditsManifest containing the resolved attributions.
 * @param anim The active logical animation name (only used for filename fallback path).
 * @returns Serialized CSV table string.
 */
export function creditsToCsv(
  manifest: CreditsManifest,
  anim: string,
): string {
  let out = 'filename,notes,authors,licenses,urls\n';
  manifest.entries.forEach((credit, i) => {
    const fileName = filenameFor(manifest, i, anim);
    const authors = credit.authors.join(', ');
    const licenses = credit.licenses.join(', ');
    const urls = credit.urls.join(', ');
    const notes = credit.notes || '';
    out += `"${fileName}","${notes}","${authors}","${licenses}","${urls}"\n`;
  });
  return out;
}
